import type { PiBackendSettings } from '../../../types/settings';
import { PI_CONFIG_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS, type PiServiceEvent, type PiUiHandler } from './PiProtocol';
import { type PiLaunchOptions, type PiRecord, piRecord, PiRpcClient, type PiRpcPort } from './PiRpcClient';

interface RuntimeConnection { client: PiRpcPort; abort: AbortController; dialogs: Map<string, AbortController>; ready: Promise<void> }
export interface PiSessionRuntimeOptions {
  workingDirectory: string;
  sessionDirectory: string;
  servicePath: string;
  getSettings?: () => PiBackendSettings;
  createClient?: (options: PiLaunchOptions) => PiRpcPort;
  onUiRequest?: PiUiHandler;
}

/** One live SDK service per session; transport, UI cancellation and restart ownership. */
export class PiSessionRuntime {
  private readonly connections = new Map<string, RuntimeConnection>();
  private readonly listeners = new Set<(sessionId: string, event: PiServiceEvent) => void>();
  private disposed = false;

  constructor(private readonly options: PiSessionRuntimeOptions) {}
  get size(): number { return this.connections.size; }

  onEvent(listener: (sessionId: string, event: PiServiceEvent) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }

  async get(sessionId: string, sessionPath?: string): Promise<PiRpcPort> {
    if (this.disposed) throw new Error('Pi runtime is disposed.');
    let connection = this.connections.get(sessionId);
    if (!connection) {
      const settings = this.options.getSettings?.();
      const launch: PiLaunchOptions = {
        workingDirectory: this.options.workingDirectory, sessionDirectory: this.options.sessionDirectory,
        sessionPath, servicePath: this.options.servicePath, executablePath: settings?.executablePath ?? '',
        configurationOnly: sessionId === 'configuration',
      };
      const client = this.options.createClient?.(launch) ?? new PiRpcClient(launch);
      const abort = new AbortController();
      const created: RuntimeConnection = { client, abort, dialogs: new Map(), ready: Promise.resolve() };
      this.connections.set(sessionId, created);
      client.subscribe((event) => this.receive(sessionId, created, event));
      created.ready = client.request({ type: 'get_state' }, 0).then((state) => {
        const expected = sessionId === 'configuration' ? PI_CONFIG_COMMANDS : [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS];
        if (state.serviceProtocol !== 1 || !Array.isArray(state.commands) || expected.some((name) => !(state.commands as unknown[]).includes(name))) {
          throw new Error('Pi service protocol mismatch. Update the complete plugin service assets.');
        }
      }).catch((error) => { this.close(sessionId); throw error; });
      connection = created;
    }
    await connection.ready;
    if (connection.abort.signal.aborted) throw new Error('Pi service was stopped.');
    return connection.client;
  }

  close(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (!connection) return;
    this.connections.delete(sessionId);
    connection.abort.abort();
    for (const dialog of connection.dialogs.values()) dialog.abort();
    connection.dialogs.clear();
    connection.client.close();
  }

  closeAll(): void { for (const id of [...this.connections.keys()]) this.close(id); }
  dispose(): void { this.disposed = true; this.closeAll(); this.listeners.clear(); }

  private receive(sessionId: string, connection: RuntimeConnection, event: PiRecord): void {
    const message: PiServiceEvent = { ...event, type: String(event.type) };
    for (const listener of this.listeners) { try { listener(sessionId, message); } catch { /* Observer isolation. */ } }
    if (message.type === 'transport_error') { this.close(sessionId); return; }
    if (message.type === 'extension_ui_cancel') { connection.dialogs.get(String(message.id))?.abort(); return; }
    if (message.type !== 'extension_ui_request') return;
    const needsResponse = ['select', 'confirm', 'input', 'editor'].includes(String(message.method));
    const handle = this.options.onUiRequest;
    if (!handle) {
      if (needsResponse) connection.client.respond?.({ id: message.id, cancelled: true });
      return;
    }
    const dialog = new AbortController();
    const id = String(message.id);
    if (needsResponse) connection.dialogs.set(id, dialog);
    void handle({ ...message, sessionId }, needsResponse ? dialog.signal : connection.abort.signal).then((response) => {
      if (needsResponse) connection.client.respond?.({ ...piRecord(response), id: message.id, ...(response ? {} : { cancelled: true }) });
    }).catch(() => { if (needsResponse) connection.client.respond?.({ id: message.id, cancelled: true }); })
      .finally(() => { connection.dialogs.delete(id); });
  }
}
