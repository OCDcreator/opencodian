import type { DshAcpClientOptions, DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import type { StreamChunk } from '../../../../../src/core/types/chat';
import type { DshBackendSettings, DshMcpServer } from '../../../../../src/core/types/settings';

export const MODEL_OPTIONS: DshJsonObject[] = [
  { id: 'model', name: 'Model', type: 'select', currentValue: 'opaque/model-a', options: [
    { group: 'provider-a', name: 'Provider A', options: [{ value: 'opaque/model-a', name: 'Alpha' }, { value: 'opaque/model-b', name: 'Beta' }] },
  ] },
  { id: 'reasoning_effort', name: 'Reasoning', type: 'select', currentValue: 'medium', options: [
    { value: 'low', name: 'Low' }, { value: 'medium', name: 'Medium' }, { value: 'high', name: 'High' },
  ] },
];

interface Deferred {
  promise: Promise<DshJsonObject>;
  resolve: (value: DshJsonObject) => void;
  reject: (error: Error) => void;
}

export function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<DshJsonObject>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

export class FakeDshClient {
  handshake: DshJsonObject | null = { agentCapabilities: { mcpCapabilities: { http: true }, promptCapabilities: { image: false } } };
  confirmConfig = true;
  readonly configurations = new Map<string, DshJsonObject[]>();
  isStarted = false;
  readonly calls: Array<{ method: string; params?: unknown }> = [];
  readonly prompts = new Map<string, Deferred[]>();
  autoSettleCancel = true;
  settlePromptsOnStop = true;
  resumeGate: Deferred | null = null;
  newSessionGate: Deferred | null = null;
  stopError: Error | null = null;
  list: (cursor?: string) => Promise<DshJsonObject> = async () => ({ sessions: [] });
  private nextSession = 1;

  constructor(readonly options: DshAcpClientOptions) {}

  async start(): Promise<void> { this.isStarted = true; this.calls.push({ method: 'start' }); }
  async stop(): Promise<void> {
    this.isStarted = false;
    this.calls.push({ method: 'stop' });
    if (this.settlePromptsOnStop) {
      for (const queue of this.prompts.values()) for (const prompt of queue) prompt.reject(new Error('stopped'));
    }
    if (this.stopError) throw this.stopError;
  }
  async newSession(cwd: string, mcpServers: readonly DshMcpServer[] = []): Promise<DshJsonObject> {
    const sessionId = `created-${this.nextSession++}`;
    this.calls.push({ method: 'session/new', params: { cwd, ...(mcpServers.length ? { mcpServers } : {}) } });
    return this.newSessionGate?.promise ?? { sessionId, ...this.configuration(sessionId) };
  }
  async listSessions(cwd?: string, cursor?: string): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/list', params: { cwd, cursor } });
    return this.list(cursor);
  }
  async resumeSession(sessionId: string, cwd: string, mcpServers: readonly DshMcpServer[] = []): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/resume', params: { sessionId, cwd, ...(mcpServers.length ? { mcpServers } : {}) } });
    return this.resumeGate?.promise ?? this.configuration(sessionId);
  }
  private configuration(sessionId: string): DshJsonObject {
    if (!this.configurations.has(sessionId)) this.configurations.set(sessionId, JSON.parse(JSON.stringify(MODEL_OPTIONS)) as DshJsonObject[]);
    return { configOptions: JSON.parse(JSON.stringify(this.configurations.get(sessionId))) as DshJsonObject[] };
  }
  async setConfigOption(sessionId: string, configId: string, value: string): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/set_config_option', params: { sessionId, configId, value } });
    this.configuration(sessionId);
    const options = this.configurations.get(sessionId)!;
    if (this.confirmConfig) {
      options.find((option) => option.id === configId)!.currentValue = value;
      if (configId === 'model') options.find((option) => option.id === 'reasoning_effort')!.currentValue = 'medium';
    }
    return this.configuration(sessionId);
  }
  async closeSession(sessionId: string): Promise<void> { this.calls.push({ method: 'session/close', params: { sessionId } }); }
  prompt(sessionId: string, content: string | DshJsonObject[]): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/prompt', params: { sessionId,
      text: typeof content === 'string' ? content : content[0]?.text, prompt: content } });
    const turn = deferred();
    const queue = this.prompts.get(sessionId) ?? [];
    queue.push(turn);
    this.prompts.set(sessionId, queue);
    return turn.promise;
  }
  cancel(sessionId: string): void {
    this.calls.push({ method: 'session/cancel', params: { sessionId } });
    if (this.autoSettleCancel) this.resolvePrompt(sessionId);
  }
  resolvePrompt(sessionId: string, result: DshJsonObject = { stopReason: 'end_turn' }): void {
    this.prompts.get(sessionId)?.shift()?.resolve(result);
  }
  rejectPrompt(sessionId: string, error: Error): void { this.prompts.get(sessionId)?.shift()?.reject(error); }
  emitUpdate(sessionId: string, update: DshJsonObject): void {
    this.options.onUpdate?.({ sessionId, update });
  }
  disconnect(): void {
    this.isStarted = false;
    this.options.onProtocolError?.(new Error('fixture disconnected'));
  }
}

export function settings(): DshBackendSettings {
  return { executablePath: '/opt/dsh', workingDirectory: '/vault', args: [], env: {}, profile: 'acp', transport: 'acp' };
}

export function adapterFixture(adapterOptions: { cancelTimeoutMs?: number } = {}) {
  const current = settings();
  const clients: FakeDshClient[] = [];
  const adapter = new DshAdapter({
    workingDirectory: '/vault',
    getSettings: () => current,
    createClient: (options) => {
      const client = new FakeDshClient(options);
      clients.push(client);
      return client;
    },
    ...adapterOptions,
  });
  return { adapter, clients, current };
}

export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function collect(stream: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
