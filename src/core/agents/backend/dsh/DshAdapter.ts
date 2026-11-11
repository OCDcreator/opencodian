/* eslint-disable max-lines -- DSH session lifecycle, ACP mapping, and fail-closed recovery stay in one adapter boundary. */
import { createHash } from 'node:crypto';

import { appendObsidianContextBlocks } from '../../../../shared/obsidianContext';
import { backendSessionCatalogFailure, BackendSessionCatalogReadError } from '../../../../shared/sessionCatalogReadback';
import { prependMemoryInjection } from '../../../memory';
import { prependObsidianToolingInjection } from '../../../obsidianTooling';
import type { ContextUsageSnapshot, StreamChunk } from '../../../types/chat';
import type { DshBackendSettings } from '../../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../../AgentCapability';
import type { AgentAuxQueryCapability, AuxQuerySession, AuxQuerySessionConfig } from '../AgentAuxQueryCapability';
import type { AgentInlineCompletionCapability, InlineCompletionSession, InlineCompletionSessionConfig } from '../AgentInlineCompletionCapability';
import { INLINE_COMPLETION_TURN_TIMEOUT_MS } from '../AgentInlineCompletionCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentForkCapability,
  AgentModelCapability,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentSessionCapability,
  AgentTodoCapability,
  AgentToolCapability,
  AgentTurnSteeringCapability,
  CapabilityChangeHandler,
  Disposable,
  StatusChangeHandler,
} from '../AgentService';
import { WarmInlineCompletionSession } from '../auxiliary/WarmInlineCompletionSession';
import { type AgentGoalCommand, type AgentGoalControlResult, type AgentGoalEvent, type AgentGoalReadback,
  BackendGoalRuntime, confirmGoalCommand, validateGoalCommand } from '../BackendGoalRuntime';
import { backendSessionMessagesToChat } from '../BackendSessionMessages';
import { dshNativeConfigurationRevision, validateDshNativeConfiguration } from '../configuration/DshNativeConfiguration';
import {
  DshAcpClient,
  type DshAcpClientOptions,
  type DshAcpPermissionRequest,
  type DshAcpPermissionResponse,
  type DshAcpUpdate,
  type DshJsonObject,
  resolveDshLaunch,
  validateDshMcpServers,
} from './DshAcpClient';
import { DshAuxQuerySession } from './DshAuxQuerySession';
import { DshNativeClient } from './DshNativeClient';
import {
  dshNativeControlCapabilities,
  DshNativeControlError,
  type DshNativeControlLease,
  DshNativeControls,
  type DshNativeControlUpdate,
  readDshNativeControlCapabilities,
} from './DshNativeControls';
import { dshContentBlockText, dshImageBlock, prepareDshPromptBlocks } from './DshProtocolCodec';
import { DshQuestionBridge } from './DshQuestionBridge';

const CAPABILITIES: BackendCapabilities = Object.freeze(new Set([
  AgentCapability.Chat,
  AgentCapability.Sessions,
  AgentCapability.Permissions,
  AgentCapability.Thinking,
  AgentCapability.Models,
  AgentCapability.Context,
]));

interface TurnState {
  selection: { provider: string; model: string } | null;
  readonly sessionId: string; readonly generation: number;
  readonly chunks: StreamChunk[]; readonly waiters: Array<() => void>;
  readonly nativeSettled: Promise<void>; readonly settleNative: () => void;
  done: boolean; cancelled: boolean; promptStarted: boolean; requiresRecovery: boolean; error: Error | null;
}

interface PendingPermission {
  readonly id: string; readonly sessionId: string; readonly permission: string;
  readonly options: DshAcpPermissionRequest['options'];
  readonly resolve: (response: DshAcpPermissionResponse) => void;
}

type DshClientPort = Pick<DshAcpClient,
  'isStarted' | 'handshake' | 'start' | 'stop' | 'newSession' | 'listSessions' | 'resumeSession' | 'closeSession' | 'prompt' | 'cancel' | 'setConfigOption'>
  & Partial<Pick<DshNativeClient, 'nativeRequest'>>;

export interface DshModelSelectorProvider {
  id: string;
  name: string;
  models: Array<{ id: string; name: string; variants: string[] }>;
}

export interface DshAdapterOptions {
  readonly workingDirectory: string;
  readonly getSettings: () => DshBackendSettings;
  readonly getExtraEnv?: () => Readonly<Record<string, string>>;
  readonly createClient?: (options: DshAcpClientOptions) => DshClientPort;
  readonly cancelTimeoutMs?: number;
}

/** First-class DeepSeek Harness backend over the documented ACP stdio profile. */
export class DshAdapter implements AgentService, AgentChatCapability, AgentSessionCapability, AgentPermissionCapability, AgentModelCapability, AgentAuxQueryCapability, AgentInlineCompletionCapability, AgentQuestionCapability, AgentForkCapability, AgentTurnSteeringCapability, AgentToolCapability, AgentTodoCapability {
  readonly kind = 'dsh' as const;
  readonly displayName = 'DeepSeek Harness';
  readonly description = 'DeepSeek Harness native runtime';
  private readonly goals = new BackendGoalRuntime('dsh', {
    source: 'native', driver: 'dsh.native-goal', actions: ['set', 'edit', 'pause', 'resume', 'clear'],
    pauseMode: 'goal', editMode: 'edit', budgets: [],
  });
  private readonly auxiliaryText = new Map<string, (text: string) => void>();
  private toolCatalog: unknown[] = [];
  private readonly questions = new DshQuestionBridge((sessionId, chunk) => {
    const state = this.turns.get(sessionId);
    if (!state || state.done || state.cancelled) return false;
    state.chunks.push(chunk); this.wake(state); return true;
  });
  private capabilitiesValue: BackendCapabilities = CAPABILITIES;
  get capabilities(): BackendCapabilities { return this.capabilitiesValue; }
  private readonly capabilityHandlers = new Set<CapabilityChangeHandler>();
  private readonly configurations = new Map<string, DshJsonObject[]>();
  private readonly reasoningDefaults = new Map<string, Map<string, string>>();
  private readonly contextUsage = new Map<string, ContextUsageSnapshot>();
  private reservedSession: { id: string; cwd: string; mcpKey: string } | null = null;
  private catalogPromise: Promise<string> | null = null;

  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusHandlers = new Set<StatusChangeHandler>(); private readonly sessions = new Set<string>();
  private readonly turns = new Map<string, TurnState>(); private readonly permissions = new Map<string, PendingPermission>();
  private readonly turnGenerations = new Map<string, number>(); private readonly resumePromises = new Map<string, Promise<void>>();
  private readonly cancellationPromises = new Map<string, Promise<void>>(); private client: DshClientPort | null = null;
  private startingClient: DshClientPort | null = null; private starting: Promise<void> | null = null;
  private connectionKey: string | null = null;
  private lifecycleGeneration = 0;
  private nextPermissionId = 1;
  private disposed = false;
  private reconnecting = false;
  private nativeCapabilitySnapshot: { client: DshClientPort; generation: number; capabilities: DshNativeControlLease['capabilities'] } | null = null;
  private readonly nativeControls = new DshNativeControls({ acquire: sessionId => this.acquireNativeControl(sessionId) });

  constructor(private readonly options: DshAdapterOptions) { this.refreshCapabilities(null); }

  getNativeControlCapabilities() {
    const snapshot = this.nativeCapabilitySnapshot;
    if (this.client?.isStarted && this.connectionKey !== null && snapshot?.client === this.client && snapshot.generation === this.lifecycleGeneration)
      return snapshot.capabilities;
    return dshNativeControlCapabilities(this.client?.handshake ?? null,
      !!this.client?.nativeRequest && this.client.isStarted && this.connectionKey !== null);
  }
  refreshNativeControlCapabilities(): Promise<DshNativeControlLease['capabilities']> { return this.nativeControls.refreshCapabilities(); }
  subscribeToNativeControlUpdates(handler: (update: DshNativeControlUpdate) => void): Disposable { return this.nativeControls.subscribe(handler); }
  subscribeToSessionTodoUpdates(handler: (update: unknown) => void): Disposable { return this.nativeControls.subscribeTodos(handler); }
  getNativeConfiguration: DshNativeControls['getNativeConfiguration'] = (...args) => this.nativeControls.getNativeConfiguration(...args);
  getNativeCredentialDescriptors: DshNativeControls['getNativeCredentialDescriptors'] = (...args) => this.nativeControls.getNativeCredentialDescriptors(...args);
  setNativeCredential: DshNativeControls['setNativeCredential'] = (...args) => this.nativeControls.setNativeCredential(...args);
  unsetNativeCredential: DshNativeControls['unsetNativeCredential'] = (...args) => this.nativeControls.unsetNativeCredential(...args);
  listNativeExtensions: DshNativeControls['listNativeExtensions'] = (...args) => this.nativeControls.listNativeExtensions(...args);
  inspectNativeExtension: DshNativeControls['inspectNativeExtension'] = (...args) => this.nativeControls.inspectNativeExtension(...args);
  getNativeExtensionVersions: DshNativeControls['getNativeExtensionVersions'] = (...args) => this.nativeControls.getNativeExtensionVersions(...args);
  mutateNativeExtension: DshNativeControls['mutateNativeExtension'] = (...args) => this.nativeControls.mutateNativeExtension(...args);
  mutateNativeExtensionSettings: DshNativeControls['mutateNativeExtensionSettings'] = (...args) => this.nativeControls.mutateNativeExtensionSettings(...args);
  getSessionPermissionPreset: DshNativeControls['getSessionPermissionPreset'] = (...args) => this.nativeControls.getSessionPermissionPreset(...args);
  setSessionPermissionPreset: DshNativeControls['setSessionPermissionPreset'] = (...args) => this.nativeControls.setSessionPermissionPreset(...args);
  getSessionPlanState: DshNativeControls['getSessionPlanState'] = (...args) => this.nativeControls.getSessionPlanState(...args);
  setSessionPlanState: DshNativeControls['setSessionPlanState'] = (...args) => this.nativeControls.setSessionPlanState(...args);
  getSessionTodos: DshNativeControls['getSessionTodos'] = (...args) => this.nativeControls.getSessionTodos(...args);
  listSessionJobs: DshNativeControls['listSessionJobs'] = (...args) => this.nativeControls.listSessionJobs(...args);
  getSessionJob: DshNativeControls['getSessionJob'] = (...args) => this.nativeControls.getSessionJob(...args);
  readSessionJob: DshNativeControls['readSessionJob'] = (...args) => this.nativeControls.readSessionJob(...args);
  readSessionJobAt: DshNativeControls['readSessionJobAt'] = (...args) => this.nativeControls.readSessionJobAt(...args);
  waitForSessionJob: DshNativeControls['waitForSessionJob'] = (...args) => this.nativeControls.waitForSessionJob(...args);
  killSessionJob: DshNativeControls['killSessionJob'] = (...args) => this.nativeControls.killSessionJob(...args);
  getSessionTerminalAvailability: DshNativeControls['getSessionTerminalAvailability'] = (...args) => this.nativeControls.getSessionTerminalAvailability(...args);
  listSessionTerminals: DshNativeControls['listSessionTerminals'] = (...args) => this.nativeControls.listSessionTerminals(...args);
  spawnSessionTerminal: DshNativeControls['spawnSessionTerminal'] = (...args) => this.nativeControls.spawnSessionTerminal(...args);
  readSessionTerminal: DshNativeControls['readSessionTerminal'] = (...args) => this.nativeControls.readSessionTerminal(...args);
  sendSessionTerminal: DshNativeControls['sendSessionTerminal'] = (...args) => this.nativeControls.sendSessionTerminal(...args);
  signalSessionTerminal: DshNativeControls['signalSessionTerminal'] = (...args) => this.nativeControls.signalSessionTerminal(...args);
  killSessionTerminal: DshNativeControls['killSessionTerminal'] = (...args) => this.nativeControls.killSessionTerminal(...args);
  listSessionSubagents: DshNativeControls['listSessionSubagents'] = (...args) => this.nativeControls.listSessionSubagents(...args);
  getSessionSubagent: DshNativeControls['getSessionSubagent'] = (...args) => this.nativeControls.getSessionSubagent(...args);
  cancelSessionSubagent: DshNativeControls['cancelSessionSubagent'] = (...args) => this.nativeControls.cancelSessionSubagent(...args);
  canContinueChildSession: DshNativeControls['canContinueSessionSubagent'] = (...args) => this.nativeControls.canContinueSessionSubagent(...args);
  continueChildSession(parentSessionId: string, childSessionId: string, content: string,
    options?: { delivery?: 'queue' | 'steer' }): Promise<{ messageId: string }> {
    return this.nativeControls.continueSessionSubagent(parentSessionId, childSessionId, content, options?.delivery ?? 'queue');
  }

  async getSessionMcpStatus(sessionId?: string) {
    try {
      const id = sessionId ?? this.reservedSession?.id ?? [...this.sessions][0] ?? await this.ensureConfigurationSession();
      return await this.nativeControls.getSessionMcpStatus(id);
    } catch (error) {
      if (error instanceof DshNativeControlError) throw error;
      throw new DshNativeControlError('failed', 'Harness MCP runtime state is unavailable');
    }
  }

  private async acquireNativeControl(sessionId?: string, reconnectProbe = false): Promise<DshNativeControlLease> {
    if (this.reconnecting && !reconnectProbe) throw new DshNativeControlError('busy', 'Harness configuration is reconnecting');
    const client = this.client?.isStarted && this.statusValue === 'connected' ? this.client : await this.ready();
    const generation = this.lifecycleGeneration;
    const capabilities = dshNativeControlCapabilities(client.handshake, !!client.nativeRequest);
    if (!capabilities.native || !client.nativeRequest) throw new DshNativeControlError('unavailable', 'This control requires the Harness native transport');
    const assertCurrent = () => {
      if (this.disposed || this.client !== client || generation !== this.lifecycleGeneration || !client.isStarted
        || sessionId !== undefined && !this.sessions.has(sessionId))
        throw new DshNativeControlError('superseded', 'Harness control was superseded by a new connection');
    };
    if (sessionId !== undefined) {
      if (!sessionId.trim()) throw new DshNativeControlError('unavailable', 'Harness control requires an owned session');
      await this.ensureSessionActive(client, sessionId);
    }
    assertCurrent();
    const request = client.nativeRequest.bind(client);
    const refreshCapabilities = async () => {
      try {
        const refreshed = await readDshNativeControlCapabilities({ request, assertCurrent, capabilities });
        assertCurrent();
        this.nativeCapabilitySnapshot = { client, generation, capabilities: refreshed };
        return refreshed;
      } catch (error) {
        assertCurrent();
        this.nativeCapabilitySnapshot = { client, generation, capabilities: {
          ...capabilities, controls: dshNativeControlCapabilities(null, false).controls,
        } };
        throw error;
      }
    };
    const refreshed = await refreshCapabilities();
    assertCurrent();
    return { request, assertCurrent, capabilities: refreshed, capabilitiesCurrent: capabilities.controls.readback, refreshCapabilities };
  }

  private connectionDescriptor() {
    const settings = this.options.getSettings();
    const workingDirectory = settings.workingDirectory || this.options.workingDirectory;
    const nativeConfig = validateDshNativeConfiguration(settings.nativeConfig);
    const revision = dshNativeConfigurationRevision(nativeConfig);
    const launch = resolveDshLaunch(settings, this.options.getExtraEnv?.() ?? {});
    const digest = createHash('sha256').update(JSON.stringify([settings.transport ?? 'native', workingDirectory,
      launch.command, launch.args, Object.entries(launch.env).sort(([left], [right]) => left.localeCompare(right)), revision])).digest('hex');
    return { workingDirectory, launch, nativeConfig, transport: settings.transport, connectionKey: `${revision}:${digest}` };
  }

  /** Explicitly replace idle cached runtimes; persisted sessions are resumed lazily. */
  async reconnectNativeConfiguration() {
    if (this.reconnecting) throw new DshNativeControlError('busy', 'Harness configuration is already reconnecting');
    // Fail closed before any idle assert, quiescence probe, stop or start:
    // reconnect returns the Native configuration readback, which ACP can never
    // satisfy. This holds even when settings just switched to Native — the
    // running ACP client's handshake is the only transport proof, and stopping
    // it here would restart the host runtime without Native control evidence.
    // ACP startup overrides already apply on the next process launch instead.
    const configuredTransport = this.options.getSettings().transport ?? 'native';
    const current = this.client;
    const currentProvesNative = !!current?.isStarted
      && dshNativeControlCapabilities(current.handshake, !!current.nativeRequest).native;
    if (configuredTransport !== 'native' || (!!current?.isStarted && !currentProvesNative))
      throw new DshNativeControlError('unavailable', 'Harness configuration reconnect requires the native transport');
    this.assertReconnectIdle();
    this.reconnecting = true;
    try {
      const descriptor = this.connectionDescriptor();
      const previous = this.client;
      const generation = this.lifecycleGeneration;
      if (previous?.isStarted) {
        const probe = new DshNativeControls({ acquire: sessionId => this.acquireNativeControl(sessionId, true) });
        for (const sessionId of this.sessions) await probe.assertSessionCanReconnect(sessionId);
        if (this.client !== previous || generation !== this.lifecycleGeneration)
          throw new DshNativeControlError('superseded', 'Harness connection changed during reconnect checks');
        this.assertReconnectIdle();
      }
      const nextGeneration = ++this.lifecycleGeneration;
      this.client = null; this.connectionKey = null;
      this.clearSessionRuntime();
      if (previous) await previous.stop();
      await this.startClient(nextGeneration, descriptor.connectionKey, descriptor.workingDirectory, descriptor);
    } catch (error) {
      if (!this.client) this.setStatus('error');
      if (error instanceof DshNativeControlError) throw error;
      throw new DshNativeControlError('failed', 'Harness configuration reconnect failed; retry after checking the runtime');
    } finally { this.reconnecting = false; }
    return this.getNativeConfiguration();
  }

  private assertReconnectIdle(): void {
    if (this.disposed) throw new DshNativeControlError('unavailable', 'DeepSeek Harness backend is disposed');
    if (this.starting || this.startingClient || this.turns.size || this.cancellationPromises.size || this.resumePromises.size
      || this.catalogPromise || this.nativeControls.inFlight || this.auxiliaryText.size)
      throw new DshNativeControlError('busy', 'Wait for Harness turns and active operations before reconnecting configuration');
  }

  get status(): AgentConnectionStatus { return this.statusValue; } hasCapability(cap: AgentCapability): boolean { return this.capabilities.has(cap); }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler);
    return { dispose: () => this.statusHandlers.delete(handler) }; }

  onCapabilitiesChange(handler: CapabilityChangeHandler): Disposable {
    this.capabilityHandlers.add(handler);
    return { dispose: () => this.capabilityHandlers.delete(handler) };
  }

  private refreshCapabilities(handshake: DshJsonObject | null): void {
    const caps = asRecord(handshake?.agentCapabilities);
    const prompt = asRecord(caps?.promptCapabilities);
    const nativeControls = dshNativeControlCapabilities(handshake, !!this.client?.nativeRequest);
    const supportsTodos = handshake === null ? this.options.getSettings().transport !== 'acp'
      : nativeControls.controls.todos.list && nativeControls.controls.todos.updates;
    this.capabilitiesValue = Object.freeze(new Set([
      ...(supportsTodos ? [AgentCapability.Todos] : []),
      ...CAPABILITIES, ...(prompt?.image === true ? [AgentCapability.Images] : []),
      // Logical native features remain startable before connection; each aux
      // construction still requires the native runtime proof before a query.
      ...(handshake?.nativeProtocol === 'opencodian.dsh-native/1' || handshake === null && this.options.getSettings().transport !== 'acp'
        ? [AgentCapability.AuxQuery, AgentCapability.InlineCompletion, AgentCapability.Questions,
          AgentCapability.Fork, AgentCapability.TurnSteering, AgentCapability.Tools, AgentCapability.Compaction, AgentCapability.Goal] : []),
    ]));
    for (const handler of this.capabilityHandlers) handler(this.capabilitiesValue);
  }

  private clearSessionRuntime(): void {
    this.nativeCapabilitySnapshot = null;
    this.nativeControls.invalidate();
    this.goals.invalidate('Harness runtime closed');
    this.sessions.clear();
    this.resumePromises.clear();
    this.configurations.clear();
    this.reasoningDefaults.clear();
    // Last-known context usage survives recovery: the native runtime only
    // reports usage on the next assistant message, so zeroing it here would
    // blank the chat's usage display until a fresh turn completes.
    this.reservedSession = null;
    this.catalogPromise = null;
    this.refreshCapabilities(null);
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('DeepSeek Harness backend is disposed');
    if (this.reconnecting) throw new DshNativeControlError('busy', 'Harness configuration is reconnecting');
    if (this.starting) return this.starting;
    const descriptor = this.connectionDescriptor();
    const { workingDirectory, connectionKey } = descriptor;
    if (this.client?.isStarted && this.connectionKey === connectionKey) return;
    if (this.client && this.connectionKey !== connectionKey && (this.sessions.size > 0 || this.turns.size > 0)) {
      throw new Error('DeepSeek Harness settings changed; stop the backend before reconnecting active sessions');
    }
    const generation = ++this.lifecycleGeneration;
    const starting = this.startClient(generation, connectionKey, workingDirectory, descriptor);
    this.starting = starting;
    try { await starting; } finally { if (this.starting === starting) this.starting = null; }
  }

  private async startClient(
    generation: number,
    connectionKey: string,
    workingDirectory: string,
    descriptor: ReturnType<DshAdapter['connectionDescriptor']>,
  ): Promise<void> {
    if (this.client) {
      const previous = this.client;
      this.client = null;
      this.connectionKey = null;
      await previous.stop();
    }
    if (generation !== this.lifecycleGeneration || this.disposed)
      throw new DshNativeControlError('superseded', 'Harness start was superseded by a new lifecycle');
    this.setStatus('connecting');
    const factory = this.options.createClient ?? ((clientOptions: DshAcpClientOptions) => descriptor.transport === 'acp'
      ? new DshAcpClient(clientOptions) : new DshNativeClient(clientOptions));
    const client: DshClientPort = factory({
      cwd: workingDirectory,
      launch: descriptor.launch,
      nativeConfig: descriptor.nativeConfig,
      vaultPath: this.options.workingDirectory,
      onUpdate: (update) => { if (this.client === client && generation === this.lifecycleGeneration) this.handleUpdate(update); },
      onControlUpdate: (event) => {
        if (this.client === client && generation === this.lifecycleGeneration && this.getNativeControlCapabilities().native)
          this.nativeControls.acceptControlUpdate(event, this.getNativeControlCapabilities());
      },
      onPermissionRequest: (request) => this.client === client && generation === this.lifecycleGeneration
        ? this.handlePermissionRequest(request)
        : Promise.resolve({ outcome: { outcome: 'cancelled' } }),
      onQuestionRequest: (request) => this.client === client && generation === this.lifecycleGeneration ? this.questions.request(request) : Promise.resolve({ cancelled: true }),
      onProtocolError: (error) => {
        if (generation === this.lifecycleGeneration && (this.client === client || this.startingClient === client)) this.setStatusError(error);
      },
    });
    this.startingClient = client;
    try {
      await client.start();
      if (generation !== this.lifecycleGeneration || this.startingClient !== client) {
        await client.stop();
        throw new Error('DeepSeek Harness start was cancelled');
      }
      this.client = client;
      this.connectionKey = connectionKey;
      this.refreshCapabilities(client.handshake);
      this.setStatus('connected');
    } catch (error) {
      await client.stop();
      if (generation === this.lifecycleGeneration) this.setStatus('error');
      throw error;
    } finally {
      if (this.startingClient === client) this.startingClient = null;
    }
  }

  async stop(): Promise<void> {
    ++this.lifecycleGeneration;
    const cancellations = [...this.turns.keys()].map((sessionId) => this.cancelStream(sessionId));
    this.cancelAllPermissions();
    const clients = new Set([this.client, this.startingClient].filter((client): client is DshClientPort => client !== null));
    this.client = null;
    this.startingClient = null;
    this.connectionKey = null;
    this.clearSessionRuntime();
    const [clientStops] = await Promise.all([
      Promise.allSettled([...clients].map((client) => client.stop())),
      Promise.allSettled(cancellations),
    ]);
    const stopFailure = clientStops.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (stopFailure) {
      this.setStatus('error');
      throw stopFailure.reason instanceof Error ? stopFailure.reason : new Error(String(stopFailure.reason));
    }
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.disposed = true;
    this.nativeControls.dispose();
    void this.stop().catch(() => undefined);
    this.capabilityHandlers.clear();
    this.statusHandlers.clear(); }

  async createSession(_title?: string, options?: Record<string, unknown>): Promise<string> {
    const settings = this.options.getSettings();
    const defaultPlanMode = settings.transport === 'acp' ? undefined : settings.defaultPlanMode;
    const client = await this.ready();
    const generation = this.lifecycleGeneration;
    const workingDirectory = this.resolveWorkingDirectory(options);
    const resumeSessionId = typeof options?.resumeSessionId === 'string' ? options.resumeSessionId.trim() : '';
    if (resumeSessionId) {
      const response = await client.resumeSession(resumeSessionId, workingDirectory, this.getMcpServers());
      this.assertCurrentClient(client, generation);
      this.sessions.add(resumeSessionId);
      this.rememberConfiguration(resumeSessionId, response, true);
      return resumeSessionId;
    }
    await this.catalogPromise;
    const reserved = this.reservedSession;
    if (reserved && reserved.cwd === workingDirectory && reserved.mcpKey === JSON.stringify(this.getMcpServers())) {
      this.assertCurrentClient(client, generation);
      this.reservedSession = null;
      return this.publishNewSession(client, reserved.id, { generation, defaultPlanMode });
    }
    const id = await this.materializeNewSession(client, workingDirectory, this.getMcpServers());
    return this.publishNewSession(client, id, { generation, defaultPlanMode });
  }

  /** A catalog draft becomes a chat only here; library policy is captured at publication, never on resume. */
  private async publishNewSession(client: DshClientPort, sessionId: string, policy: { generation: number; defaultPlanMode?: boolean }): Promise<string> {
    this.assertCurrentClient(client, policy.generation);
    if (policy.defaultPlanMode === undefined) return sessionId;
    if (this.turns.has(sessionId) || this.cancellationPromises.has(sessionId))
      throw new DshNativeControlError('busy', 'Harness new-session Plan default requires an idle draft');
    try {
      const changed = await this.nativeControls.setSessionPlanState(sessionId, policy.defaultPlanMode);
      this.assertCurrentClient(client, policy.generation);
      if (changed.active !== policy.defaultPlanMode || changed.pending !== undefined || changed.disposition === 'queued' || changed.disposition === 'cancelled')
        throw new DshNativeControlError('invalid-response', 'Harness did not confirm the new-session Plan default');
      const observed = await this.nativeControls.getSessionPlanState(sessionId);
      this.assertCurrentClient(client, policy.generation);
      if (observed.active !== policy.defaultPlanMode || observed.pending !== undefined)
        throw new DshNativeControlError('invalid-response', 'Harness did not confirm the new-session Plan default');
      return sessionId;
    } catch {
      if (this.client === client && this.lifecycleGeneration === policy.generation && this.sessions.has(sessionId) && !this.turns.has(sessionId)) {
        this.sessions.delete(sessionId); this.configurations.delete(sessionId); this.reasoningDefaults.delete(sessionId);
        try { await client.closeSession(sessionId); } catch { /* Do not stop other published sessions after a failed draft default. */ }
      }
      throw new DshNativeControlError('failed', 'Harness could not confirm the Plan default for the new session');
    }
  }

  async listSessions(): Promise<unknown[]> {
    const client = await this.ready();
    const rows = new Map<string, DshJsonObject>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    const fail = (errorReason: string, status: 'failed' | 'unavailable' = 'failed'): never => {
      throw new BackendSessionCatalogReadError({
        status: rows.size ? 'partial' : status,
        data: [...rows.values()],
        nextCursor: cursor ?? null,
        errorReason,
      });
    };
    for (let pageCount = 0; pageCount < 100; pageCount += 1) {
      const page = await client.listSessions(this.resolveWorkingDirectory(), cursor).catch((error: unknown) => {
        const failure = backendSessionCatalogFailure(error);
        return fail(failure.errorReason, failure.status);
      });
      const sessions = page.sessions;
      if (!Array.isArray(sessions)) return fail('Invalid session catalog response');
      for (const value of sessions) {
        const record = asRecord(value);
        const sessionId = typeof record?.sessionId === 'string' ? record.sessionId.trim() : '';
        if (!record || !sessionId) return fail('Invalid session catalog identity');
        if (!rows.has(sessionId)) {
          // The native catalog emits ISO strings; routing/detail consumers
          // (extractTimestamp, normalized rows) only accept epoch millis.
          rows.set(sessionId, {
            ...record,
            id: sessionId,
            createdAt: toEpochMillis(record.createdAt) ?? record.createdAt,
            updatedAt: toEpochMillis(record.updatedAt) ?? record.updatedAt,
          });
        }
      }
      const nextCursor = page.nextCursor;
      if (nextCursor === undefined) return [...rows.values()];
      if (typeof nextCursor !== 'string' || !nextCursor.trim()) return fail('Invalid session catalog cursor');
      if (seenCursors.has(nextCursor)) return fail('Session catalog cursor repeated');
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    return fail('Session catalog page limit exceeded');
  }

  async deleteSession(_sessionId: string): Promise<void> {
    throw new Error('DSH ACP does not support deleting persisted sessions');
  }

  /**
   * Manual compaction over the native compaction seam (the same one /compact
   * rides). Returns true when the compaction ran — including the "no
   * compactable history yet" no-op; manual-compaction failures (busy, changed
   * history, summary, commit, persistence) throw with the harness message.
   */
  async compactSession(sessionId: string): Promise<boolean> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH compaction requires the native transport');
    await this.ensureSessionActive(client, sessionId);
    if (this.turns.has(sessionId)) throw new Error('DSH compaction requires an idle session');
    try {
      await client.nativeRequest('session/compact', { sessionId }, 180_000);
    } catch (error) {
      // A timed-out request leaves the summary possibly still running in the
      // harness; notify cancellation (which aborts the compact admission) so
      // the session does not stay busy until the late attempt finishes. Any
      // other failure is a business error and keeps the connection alive.
      if (error instanceof Error && /timed out/.test(error.message)) client.cancel(sessionId);
      throw error;
    }
    return true;
  }

  async getSession(sessionId: string): Promise<DshJsonObject | null> {
    // Title/timestamp metadata comes from the harness title snapshots behind the
    // same catalog the session browser reads; there is no single-session read.
    const rows = await this.listSessions();
    const match = rows.map((row) => asRecord(row)).find((row) => row && String(row.id) === sessionId);
    return match ? { ...match } : null;
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH ACP does not expose session title mutation');
    await this.ensureSessionActive(client, sessionId);
    await client.nativeRequest('session/title', { sessionId, title });
  }

  async getSessionMessages(sessionId: string, options?: Record<string, unknown>): Promise<unknown[]> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH ACP does not expose session history');
    const parentSessionId = options?.parentSessionId;
    const result = typeof parentSessionId === 'string'
      ? await client.nativeRequest('session/child-history', { sessionId: parentSessionId, childId: sessionId })
      : await client.nativeRequest('session/history', { sessionId });
    if (!Array.isArray(result.messages)) throw new Error('Harness returned an invalid transcript');
    return result.messages.flatMap<unknown>((value) => {
      const message = asRecord(value);
      if (!message || !Array.isArray(message.content)) throw new Error('Harness returned an invalid transcript message');
      if (message.role === 'user' && message.sourceKind && message.sourceKind !== 'user') return [];
      if (message.role === 'tool') {
        const blocks = message.content.map((block) => asRecord(block)).filter(Boolean) as DshJsonObject[];
        // A single store-backed image keeps the bare data URI form so the
        // existing tool renderer shows a real image; mixed or unavailable
        // content falls back to per-block text projection.
        const singleImage = blocks.length === 1 && blocks[0].type === 'image' ? dshImageDataUri(blocks[0]) : null;
        return [{ ...message, content: [{type:'tool_result',toolCallId:message.toolCallId,isError:message.isError,
          content: singleImage ?? blocks.map((block) => dshImageProjectionText(block)).filter(Boolean).join('\n')}] }];
      }
      const recordedModelId = encodeDshRecordedModelId(message);
      return [{ ...message, ...(recordedModelId ? { recordedModelId } : {}), content: message.content.map((block) => {
        const content = asRecord(block);
        if (content?.type === 'tool-call') {
          let input: DshJsonObject = {};
          try { input = asRecord(typeof content.arguments === 'string' ? JSON.parse(content.arguments) : content.arguments) ?? {}; } catch { input = { rawInput: String(content.arguments ?? '') }; }
          return { type: 'tool_use', id: String(content.id ?? content.callId ?? ''), name: String(content.name ?? 'tool'), input };
        }
        if (content?.type === 'image') {
          // Store-backed user images pass through so the shared projection
          // fills ChatMessage.images and the existing gallery renders them;
          // admission (canonical base64, size, declared-magic agreement) is
          // re-checked here so oversized or fake payloads degrade to text.
          // Assistant images keep the streamed markdown text form (the live
          // path uses the same shape); references the store cannot verify
          // degrade to an honest placeholder without fabricating image data.
          if (message.role === 'user' && dshVerifiedImage(content)) return content;
          return { type: 'text', text: dshImageProjectionText(content) };
        }
        return content;
      }) }];
    });
  }

  /** The bridge proves a mounted resolver and both Vault identities without resuming the source. */
  async prepareNativeSessionReference(sourceSessionId: string, targetSessionId?: string): Promise<string | null> {
    if (!targetSessionId || sourceSessionId === targetSessionId) return null;
    const client = await this.ready();
    if (!client.nativeRequest) return null;
    try {
      const result = await client.nativeRequest('session/reference', {
        sourceSessionId, targetSessionId, cwd: this.resolveWorkingDirectory(),
      });
      const expected = `dsh-session:${Buffer.from(JSON.stringify(sourceSessionId), 'utf8').toString('base64url')}`;
      return result.available === true && result.reference === expected ? expected : null;
    } catch {
      // Older native bridges and ACP cannot prove the resolver; callers use an owned history snapshot.
      return null;
    }
  }

  async startAuxQuerySession(config: AuxQuerySessionConfig): Promise<AuxQuerySession> {
    return this.createAuxiliarySession(config, false);
  }

  private async createAuxiliarySession(config: AuxQuerySessionConfig, preferLowLatency: boolean): Promise<AuxQuerySession> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH auxiliary queries require the native transport');
    return DshAuxQuerySession.create(config, (method, params, timeout) => client.nativeRequest!(method, params, timeout),
      (id, handler) => { this.auxiliaryText.set(id, handler); return () => this.auxiliaryText.delete(id); }, preferLowLatency);
  }

  async startInlineCompletionSession(config: InlineCompletionSessionConfig): Promise<InlineCompletionSession> {
    const recreate = () => this.createAuxiliarySession({ ...config, turnTimeoutMs: INLINE_COMPLETION_TURN_TIMEOUT_MS }, true);
    return WarmInlineCompletionSession.create({ backend: this.kind, session: await recreate(), recreate });
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH session forks require the native transport');
    const generation = this.lifecycleGeneration;
    const result = await client.nativeRequest('session/fork', { sessionId, cwd: this.resolveWorkingDirectory(),
      mcpServers: this.getMcpServers(), ...(messageID ? { messageId: messageID } : {}) });
    this.assertCurrentClient(client, generation);
    if (typeof result.sessionId !== 'string' || !result.sessionId) throw new Error('Native Harness fork returned no session identity');
    this.sessions.add(result.sessionId); this.rememberConfiguration(result.sessionId, result, true);
    return { id: result.sessionId, title: '' };
  }

  async steerTurn(sessionId: string, text: string): Promise<boolean> {
    const client = await this.ready();
    if (!client.nativeRequest || !this.turns.has(sessionId) || !text.trim()) return false;
    return (await client.nativeRequest('session/steer', { sessionId, text })).accepted === true;
  }

  async getPendingQuestions(): Promise<unknown[]> { return this.questions.list(); }
  async replyToQuestion(id: string, answers: string[][]): Promise<void> { this.questions.reply(id, answers); }
  async rejectQuestion(id: string): Promise<void> { this.questions.reject(id); }

  async listTools(_providerID: string, _modelID: string): Promise<unknown[]> {
    const client = await this.ready();
    if (!client.nativeRequest) return [];
    const sessionId = await this.ensureConfigurationSession(this.reservedSession?.id ?? [...this.sessions][0]);
    const response = await client.nativeRequest('session/tools', { sessionId });
    if (!Array.isArray(response.tools)) throw new Error('Harness returned an invalid tool catalog');
    this.toolCatalog = response.tools;
    return [...this.toolCatalog];
  }
  getToolCatalogSnapshot(): unknown { return [...this.toolCatalog]; }

  async readSessionInformation(sessionId: string): Promise<import('../AgentService').AgentSessionInformation> {
    const client = await this.ready();
    const generation = this.lifecycleGeneration;
    const snapshot = client.nativeRequest ? await client.nativeRequest('session/information', { sessionId }) : null;
    this.assertCurrentClient(client, generation);
    const servers = snapshot?.servers;
    const context = this.contextUsage.get(sessionId);
    return { sessionId, observedAt: Date.now(), quota: null,
      ...(context ? { context: { tokens: context.totalTokens, window: context.contextWindow } } : {}),
      agents: Array.isArray(snapshot?.agents) ? snapshot.agents.flatMap((value) => {
        const agent = asRecord(value);
        if (typeof agent?.id !== 'string') return [];
        const statuses: Record<string, import('../AgentService').AgentSessionChild['status']> = {
          running: 'running', pending: 'pending', completed: 'completed', failed: 'failed', unknown: 'unknown',
        };
        const mode: import('../AgentService').AgentSessionChild['mode'] = agent.mode === 'one-shot' || agent.mode === 'continuable' || agent.mode === 'external'
          ? agent.mode : 'unknown';
        return [{ id: agent.id, title: String(agent.title ?? agent.id), readable: agent.readable === true, mode,
          status: statuses[String(agent.status)] ?? 'unknown' }];
      }) : null,
      mcp: Array.isArray(servers) ? { scope: 'session', servers: servers.flatMap((value) => {
        const server = asRecord(value);
        if (typeof server?.name !== 'string') return [];
        const status = server.connected === true ? 'connected' : server.connected === false ? 'disconnected'
          : typeof server.state === 'string' ? server.state : typeof server.status === 'string' ? server.status : 'unknown';
        return [{ name: server.name, status,
          ...(typeof server.toolCount === 'number' && Number.isFinite(server.toolCount) && server.toolCount >= 0 ? { toolCount: server.toolCount } : {}) }];
      }) } : null,
    };
  }

  async readChildSessionMessages(parentSessionId: string, childId: string) {
    return backendSessionMessagesToChat('dsh', await this.getSessionMessages(childId, { parentSessionId }));
  }
  getCapabilitySnapshot(): unknown { return { backend: this.kind, capabilities: [...this.capabilities] }; }
  async refreshToolIds(): Promise<string[]> {
    return (await this.listTools('', '')).map((tool) => String((tool as Record<string, unknown>).name ?? '')).filter(Boolean);
  }

  async getRuntimeCommands(forSessionId?: string): Promise<Array<{ name: string; description?: string; source?: string }>> {
    const client = await this.ready();
    if (!client.nativeRequest) return [];
    const sessionId = await this.ensureConfigurationSession(forSessionId ?? this.reservedSession?.id ?? [...this.sessions][0]);
    const result = await client.nativeRequest('session/commands', { sessionId });
    if (!Array.isArray(result.commands)) throw new Error('Harness returned an invalid command catalog');
    return result.commands.flatMap((value) => {
      const command = asRecord(value);
      return typeof command?.name === 'string' ? [{ name: command.name, description: String(command.description ?? ''),
        ...(command.source === 'skill' ? { source: 'skill' } : {}) }] : [];
    });
  }

  async applyMcpConfiguration(): Promise<number> {
    if (this.turns.size || this.cancellationPromises.size || this.nativeControls.inFlight)
      throw new DshNativeControlError('busy', 'Wait for all Harness turns and control operations before applying MCP configuration');
    this.assertNotReconnecting();
    const lease = await this.acquireNativeControl();
    this.assertNotReconnecting();
    lease.assertCurrent();
    if (this.turns.size || this.cancellationPromises.size)
      throw new DshNativeControlError('busy', 'Wait for all Harness turns before applying MCP configuration');
    if (!this.getNativeControlCapabilities().controls.mcp.apply)
      throw new DshNativeControlError('unavailable', 'This Harness connection does not support applying MCP configuration');
    return this.nativeControls.applyMcpConfiguration([...this.sessions], this.getMcpServers());
  }

  private assertNotReconnecting(): void {
    if (this.reconnecting) throw new DshNativeControlError('busy', 'Harness configuration is reconnecting');
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const client = await this.ready();
    const lifecycle = this.lifecycleGeneration;
    if (request.images?.length && !this.hasCapability(AgentCapability.Images))
      throw new Error('DeepSeek Harness did not advertise image prompts for this connection');
    await this.cancellationPromises.get(request.sessionId);
    this.assertNotReconnecting();
    this.assertCurrentClient(client, lifecycle);
    if (this.turns.has(request.sessionId)) throw new Error('DSH ACP allows only one prompt per session');
    const generation = (this.turnGenerations.get(request.sessionId) ?? 0) + 1;
    this.turnGenerations.set(request.sessionId, generation);
    let settleNative!: () => void;
    const nativeSettled = new Promise<void>((resolve) => { settleNative = resolve; });
    const state: TurnState = {
      selection: null,
      sessionId: request.sessionId,
      generation,
      chunks: [],
      waiters: [],
      nativeSettled,
      settleNative,
      done: false,
      cancelled: false,
      promptStarted: false,
      requiresRecovery: false,
      error: null,
    };
    this.turns.set(request.sessionId, state);
    this.nativeControls.busy(request.sessionId, true);
    try {
      const prompt = await prepareDshPromptBlocks(request, {
        prefix: prependObsidianToolingInjection(prependMemoryInjection('', request.options), request.options),
        suffix: appendObsidianContextBlocks('', request.options), supportsImages: this.hasCapability(AgentCapability.Images),
        attachmentRoot: this.options.workingDirectory,
      });
      if (state.cancelled) { state.settleNative(); yield { type: 'message_stop' }; return; }
      await this.ensureSessionActive(client, request.sessionId);
      if (state.cancelled) {
        state.settleNative();
        yield { type: 'message_stop' };
        return;
      }
      await this.applySendConfiguration(client, request.sessionId, request.options ?? {});
      if (state.cancelled) { state.settleNative(); yield { type: 'message_stop' }; return; }
      if (state.done) throw state.error ?? new Error('DSH turn ended before prompt admission');
      state.selection = this.getDefaultModelSelection(request.sessionId);
      yield { type: 'message_start' };
      state.promptStarted = true;
      void this.submitPrompt(client, request, prompt)
        .then(() => { state.done = true; })
        .catch((error: unknown) => {
          state.error = error instanceof Error ? error : new Error(String(error));
          state.requiresRecovery = isTransportUncertainPromptError(state.error);
          state.done = true;
        })
        .finally(() => {
          state.settleNative();
          this.wake(state);
        });

      while (!state.done || state.chunks.length > 0) {
        const next = state.chunks.shift();
        if (next) {
          yield next;
          continue;
        }
        if (state.done) break;
        await new Promise<void>((resolve) => state.waiters.push(resolve));
      }
      if (state.error && !state.cancelled) yield { type: 'error', content: state.error.message };
      yield { type: 'message_stop' };
    } catch (error) {
      state.settleNative();
      const failure = error instanceof Error ? error : new Error(String(error));
      state.requiresRecovery = isTransportUncertainPromptError(failure);
      if (!state.cancelled) yield { type: 'error', content: failure.message };
      yield { type: 'message_stop' };
    } finally {
      await this.finishTurn(state, client);
    }
  }

  private async finishTurn(state: TurnState, client: DshClientPort): Promise<void> {
    try {
      // A detached old generator must never cancel or replace a newer connection/turn.
      if (state.requiresRecovery) {
        if (this.client === client) {
          client.cancel(state.sessionId);
          await this.recoverFromStuckCancellation();
        }
        state.cancelled = true;
      } else if (state.promptStarted && !state.done && !state.cancelled
        && this.turns.get(state.sessionId) === state && this.client === client) {
        await this.cancelStream(state.sessionId);
      }
    } finally {
      if (!state.promptStarted) state.settleNative();
      if (this.turns.get(state.sessionId) === state) {
        this.turns.delete(state.sessionId);
        this.nativeControls.busy(state.sessionId, false);
      }
    }
  }

  private submitPrompt(client: DshClientPort, request: AgentChatSendRequest, prompt: DshJsonObject[]): Promise<DshJsonObject> {
    if (typeof request.options?.goalObjective === 'string') validateGoalCommand({ action: 'set', objective: request.options.goalObjective }, this.goals.capabilities);
    return client.nativeRequest && (request.content.trimStart().startsWith('/') || typeof request.options?.goalObjective === 'string')
      ? client.nativeRequest('session/prompt', { sessionId: request.sessionId, prompt, rawText: request.content,
        ...(typeof request.options?.goalObjective === 'string' ? { goalObjective: request.options.goalObjective } : {}) }, 24 * 60 * 60_000)
      : client.prompt(request.sessionId, prompt);
  }

  getGoalCapabilities() { return this.goals.capabilities; }

  async getChatMessages(sessionId: string) { return backendSessionMessagesToChat('dsh', await this.getSessionMessages(sessionId)); }

  subscribeToGoalEvents(handler: (event: AgentGoalEvent) => void): Disposable { return this.goals.subscribe(handler); }

  async readSessionGoal(sessionId: string): Promise<AgentGoalReadback> {
    const version = this.goals.version(sessionId);
    try {
      const client = await this.ready();
      if (!client.nativeRequest) return this.goals.fail(sessionId, 'Goal control requires the Harness native transport', true);
      await this.ensureSessionActive(client, sessionId);
      const result = await client.nativeRequest('session/goal', { sessionId, action: 'get' });
      if (!Object.prototype.hasOwnProperty.call(result, 'goal')) throw new Error('Harness returned no Goal readback');
      return this.goals.observeRead(sessionId, result.goal, version);
    } catch (error) { return this.goals.fail(sessionId, error); }
  }

  async controlSessionGoal(sessionId: string, command: AgentGoalCommand): Promise<AgentGoalControlResult> {
    return this.goals.control(sessionId, async () => {
      try {
        validateGoalCommand(command, this.goals.capabilities);
        const client = await this.ready();
        if (!client.nativeRequest) return { status: 'unavailable', readback: this.goals.fail(sessionId, 'Native Goal service unavailable', true) };
        await this.ensureSessionActive(client, sessionId);
        const result = await client.nativeRequest('session/goal', { sessionId, ...command });
        const readback = this.goals.observe(sessionId, result.goal);
        if (command.action === 'pause' || command.action === 'clear') await this.cancelStream(sessionId);
        return confirmGoalCommand(command, readback);
      } catch (error) { return { status: 'failed', readback: this.goals.fail(sessionId, error) }; }
    });
  }

  async cancelStream(sessionId: string): Promise<void> {
    const existing = this.cancellationPromises.get(sessionId);
    if (existing) return existing;
    const cancellation = this.cancelSessionTurn(sessionId);
    this.cancellationPromises.set(sessionId, cancellation);
    try { await cancellation; } finally {
      if (this.cancellationPromises.get(sessionId) === cancellation) this.cancellationPromises.delete(sessionId);
    }
  }

  private async cancelSessionTurn(sessionId: string): Promise<void> {
    this.questions.cancel(sessionId);
    const state = this.turns.get(sessionId);
    this.turnGenerations.set(sessionId, (this.turnGenerations.get(sessionId) ?? 0) + 1);
    if (state) {
      state.cancelled = true;
      state.done = true;
      state.chunks.length = 0;
      this.wake(state);
    }
    for (const [id, permission] of this.permissions) {
      if (permission.sessionId === sessionId) {
        permission.resolve({ outcome: { outcome: 'cancelled' } });
        this.permissions.delete(id);
      }
    }
    this.client?.cancel(sessionId);
    if (state) {
      const settled = await settlesWithin(state.nativeSettled, this.options.cancelTimeoutMs ?? 5000);
      if (!settled) await this.recoverFromStuckCancellation();
      if (this.turns.get(sessionId) === state) {
        this.turns.delete(sessionId);
        this.nativeControls.busy(sessionId, false);
      }
    }
  }

  private async recoverFromStuckCancellation(): Promise<void> {
    const client = this.client;
    if (!client) return;
    ++this.lifecycleGeneration;
    this.client = null;
    this.connectionKey = null;
    this.clearSessionRuntime();
    this.cancelAllPermissions();
    this.setStatus('error');
    await client.stop();
  }

  async getPendingPermissions(): Promise<unknown[]> {
    return [...this.permissions.values()].map((permission) => ({
      id: permission.id,
      sessionID: permission.sessionId,
      permission: permission.permission,
      patterns: [],
    }));
  }

  async respondToPermission(requestID: string, reply: unknown): Promise<void> {
    if (reply !== 'once' && reply !== 'always' && reply !== 'reject') {
      throw new Error('Invalid DSH permission reply');
    }
    const pending = this.permissions.get(requestID);
    if (!pending) throw new Error('DSH permission request is no longer active');
    // The native Harness offers allow-once/reject-once only. 'always' prefers a
    // persistent allow option when the runtime grows one and otherwise degrades
    // to allow-once — 'always'/'session' persistence within the plugin session
    // is tracked client-side by the permission card renderer, mirroring the
    // zcode reply mapping. Resolving to 'cancelled' here would silently reject
    // the tool. The lookup is ordered by preference, not by option array order.
    const selectByKinds = (kinds: string[]) => pending.options.find((option) => kinds.includes(option.kind ?? ''));
    const selected = reply === 'once' ? selectByKinds(['allow_once'])
      : reply === 'always' ? selectByKinds(['allow_always']) ?? selectByKinds(['allow_once'])
        : selectByKinds(['reject_once', 'reject_always']);
    pending.resolve(selected
      ? { outcome: { outcome: 'selected', optionId: selected.optionId } }
      : { outcome: { outcome: 'cancelled' } });
    this.permissions.delete(requestID);
  }

  private async ready(): Promise<DshClientPort> {
    await this.start();
    if (!this.client) throw new Error('DSH ACP client unavailable');
    return this.client;
  }

  private assertCurrentClient(client: DshClientPort, generation: number): void {
    if (this.client !== client || this.lifecycleGeneration !== generation)
      throw new Error('DeepSeek Harness session activation was superseded');
  }

  private async ensureSessionActive(client: DshClientPort, sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) return;
    const existing = this.resumePromises.get(sessionId);
    if (existing) return existing;
    const generation = this.lifecycleGeneration;
    const resume = client.resumeSession(sessionId, this.resolveWorkingDirectory(), this.getMcpServers())
      .then((response) => {
        if (this.client !== client || this.lifecycleGeneration !== generation) {
          throw new Error('DeepSeek Harness session resume was superseded');
        }
        this.sessions.add(sessionId);
        this.rememberConfiguration(sessionId, response, true);
      })
      .finally(() => { if (this.resumePromises.get(sessionId) === resume) this.resumePromises.delete(sessionId); });
    this.resumePromises.set(sessionId, resume);
    return resume;
  }

  private resolveWorkingDirectory(options?: Record<string, unknown>): string {
    return typeof options?.cwd === 'string' && options.cwd.trim()
      ? options.cwd.trim()
      : this.options.getSettings().workingDirectory || this.options.workingDirectory;
  }

  private setStatus(status: AgentConnectionStatus): void {
    this.statusValue = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private setStatusError(error: Error): void {
    ++this.lifecycleGeneration;
    this.clearSessionRuntime();
    this.connectionKey = null;
    this.cancelAllPermissions();
    this.setStatus('error');
    for (const state of this.turns.values()) {
      state.error = error;
      state.done = true;
      this.wake(state);
    }
  }

  private handleUpdate(update: DshAcpUpdate): void {
    if (this.sessions.has(update.sessionId) && this.nativeControls.acceptSessionUpdate(update, this.getNativeControlCapabilities())) return;
    if (update.update.sessionUpdate === 'goal_update') { this.goals.observe(update.sessionId, update.update.goal); return; }
    const auxiliary = this.auxiliaryText.get(update.sessionId);
    if (auxiliary) {
      const block = asRecord(update.update.content);
      auxiliary(block?.type === 'image' ? dshImageProjectionText(block) : dshContentBlockText(block));
      return;
    }
    if (update.update.sessionUpdate === 'native_question_closed' && typeof update.update.requestId === 'string') {
      this.questions.reject(`dsh-question-${update.sessionId}-${update.update.requestId}`); return;
    }
    if (update.update.sessionUpdate === 'config_option_update' && this.sessions.has(update.sessionId)) {
      try { this.rememberConfiguration(update.sessionId, update.update); }
      catch { this.setStatusError(new Error('DSH sent invalid session configuration')); }
      return;
    }
    const state = this.turns.get(update.sessionId);
    if (update.update.sessionUpdate === 'agent_message_chunk' || update.update.sessionUpdate === 'tool_call')
      this.goals.activity(update.sessionId, 'running');
    if (!state || state.cancelled || state.generation !== this.turnGenerations.get(update.sessionId)) return;
    if (update.update.sessionUpdate === 'usage_update') {
      const snapshot = this.acceptContextUsage(update.sessionId, update.update);
      if (snapshot) { state.chunks.push({ type: 'context_usage', snapshot }); this.wake(state); }
      return;
    }
    const chunk = translateDshUpdate(update.update);
    if (chunk) {
      state.chunks.push(chunk);
      this.wake(state);
    }
  }

  private handlePermissionRequest(request: DshAcpPermissionRequest): Promise<DshAcpPermissionResponse> {
    const state = this.turns.get(request.sessionId);
    if (!state || state.cancelled || state.done) return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const id = `dsh-permission-${this.nextPermissionId++}`;
    const permission = String(request.toolCall.title ?? request.toolCall.name ?? 'tool');
    return new Promise<DshAcpPermissionResponse>((resolve) => {
      this.permissions.set(id, { id, sessionId: request.sessionId, permission, options: request.options, resolve });
      state.chunks.push({
        type: 'permission_request',
        id,
        sessionID: request.sessionId,
        permission,
        patterns: [],
        metadata: { options: request.options },
        always: request.options.filter((option) => option.kind === 'allow_always').map((option) => option.optionId),
      });
      this.wake(state);
    });
  }

  private wake(state: TurnState): void { for (const waiter of state.waiters.splice(0)) waiter(); }

  private cancelAllPermissions(): void {
    this.questions.cancel();
    for (const pending of this.permissions.values()) pending.resolve({ outcome: { outcome: 'cancelled' } });
    this.permissions.clear(); }

  private getMcpServers() {
    return validateDshMcpServers(this.options.getSettings().mcpServers ?? []);
  }

  private rememberConfiguration(sessionId: string, response: DshJsonObject, baseline = false): void {
    const options = response.configOptions ?? [];
    if (!Array.isArray(options) || options.some((value) => {
      const option = asRecord(value);
      return !option || typeof option.id !== 'string' || typeof option.currentValue !== 'string'
        || option.type !== 'select' || !Array.isArray(option.options);
    })) throw new Error('DSH returned invalid session configuration');
    this.configurations.set(sessionId, options as DshJsonObject[]);
    // Native image admission follows the selected model on every prompt. The
    // connection capability only controls whether an attachment UI is available.
    if (baseline) {
      const records = options as DshJsonObject[];
      const model = records.find((entry) => entry.id === 'model')?.currentValue;
      const effort = records.find((entry) => entry.id === 'reasoning_effort')?.currentValue;
      if (typeof model === 'string' && typeof effort === 'string') {
        const defaults = this.reasoningDefaults.get(sessionId) ?? new Map<string, string>();
        defaults.set(model, effort);
        this.reasoningDefaults.set(sessionId, defaults);
      }
    }
  }

  /** ACP agentOptions carries provider/model only; set a saved effort once before publishing a fresh session. */
  private async materializeNewSession(client: DshClientPort, cwd: string, mcpServers: ReturnType<DshAdapter['getMcpServers']>): Promise<string> {
    const generation = this.lifecycleGeneration;
    const settings = this.options.getSettings();
    const defaultEffort = settings.transport === 'acp'
      ? validateDshNativeConfiguration(settings.nativeConfig).overrides['agent-default-model']?.reasoningEffort : undefined;
    this.assertCurrentClient(client, generation);
    this.assertNotReconnecting();
    const response = await client.newSession(cwd, mcpServers);
    this.assertCurrentClient(client, generation);
    const sessionId = typeof response.sessionId === 'string' ? response.sessionId.trim() : '';
    if (!sessionId) throw new Error('DSH session response did not include a session id');
    this.sessions.add(sessionId);
    try {
      this.rememberConfiguration(sessionId, response);
      if (defaultEffort !== undefined) {
        const option = this.configurations.get(sessionId)?.find(entry => entry.id === 'reasoning_effort');
        if (!dshSelectChoices(option).some(choice => choice.value === defaultEffort))
          throw new Error('DSH ACP default reasoning effort is not in the session catalog');
        await this.applyConfigOption(client, sessionId, 'reasoning_effort', defaultEffort);
      }
      this.assertCurrentClient(client, generation);
      if (!this.sessions.has(sessionId)) throw new Error('DSH new session activation was superseded');
      this.rememberConfiguration(sessionId, { configOptions: this.configurations.get(sessionId) ?? [] }, true);
      return sessionId;
    } catch (error) {
      if (this.client === client && this.lifecycleGeneration === generation && this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId); this.configurations.delete(sessionId); this.reasoningDefaults.delete(sessionId);
        try { await client.closeSession(sessionId); } catch { /* Only the unpublished idle session is released; never stop other work. */ }
      }
      if (defaultEffort !== undefined)
        throw new Error('DSH ACP did not confirm the saved default reasoning effort; check the session catalog before retrying');
      throw error;
    }
  }

  /** The catalog needs a native session. Reserve one draft and hand that same session to the next chat. */
  private async ensureConfigurationSession(sessionId?: string): Promise<string> {
    const client = await this.ready();
    if (sessionId) { await this.ensureSessionActive(client, sessionId); return sessionId; }
    if (this.catalogPromise) return this.catalogPromise;
    const generation = this.lifecycleGeneration;
    const cwd = this.resolveWorkingDirectory();
    const mcpServers = this.getMcpServers();
    const mcpKey = JSON.stringify(mcpServers);
    const existing = this.reservedSession;
    if (existing?.cwd === cwd && existing.mcpKey === mcpKey) return existing.id;
    const promise = (async () => {
      if (existing) {
        await client.closeSession(existing.id);
        this.assertCurrentClient(client, generation);
        this.sessions.delete(existing.id);
        this.configurations.delete(existing.id);
        this.reservedSession = null;
      }
      const id = await this.materializeNewSession(client, cwd, mcpServers);
      this.assertCurrentClient(client, generation);
      this.reservedSession = { id, cwd, mcpKey };
      return id;
    })();
    this.catalogPromise = promise;
    try { return await promise; } finally { if (this.catalogPromise === promise) this.catalogPromise = null; }
  }

  async readSessionConfiguration(sessionId?: string): Promise<{
    sessionId: string; configOptions: DshJsonObject[]; images: boolean;
    controls: Array<{ id: string; name: string; value: string; choices: Array<{ value: string; name: string }> }>;
  }> {
    const id = await this.ensureConfigurationSession(sessionId);
    const configOptions = JSON.parse(JSON.stringify(this.configurations.get(id) ?? [])) as DshJsonObject[];
    return {
      sessionId: id, configOptions, images: this.hasCapability(AgentCapability.Images),
      controls: configOptions.map((option) => ({
        id: String(option.id), name: String(option.name ?? option.id), value: String(option.currentValue),
        choices: dshSelectChoices(option).map((choice) => ({ value: choice.value, name: `${choice.groupName}: ${choice.name}` })),
      })),
    };
  }

  async getModelSelectorProviders(sessionId?: string): Promise<DshModelSelectorProvider[]> {
    const { configOptions } = await this.readSessionConfiguration(sessionId);
    const model = configOptions.find((option) => option.id === 'model');
    const reasoning = configOptions.find((option) => option.id === 'reasoning_effort');
    const variants = dshSelectChoices(reasoning).map((choice) => choice.value);
    const providers = new Map<string, DshModelSelectorProvider>();
    for (const choice of dshSelectChoices(model)) {
      const provider = providers.get(choice.group) ?? { id: choice.group, name: choice.groupName, models: [] };
      provider.models.push({ id: choice.value, name: choice.name, variants: choice.value === model?.currentValue ? [...variants] : [] });
      providers.set(choice.group, provider);
    }
    return [...providers.values()];
  }

  getDefaultModelSelection(sessionId?: string): { provider: string; model: string } | null {
    const id = sessionId ?? this.reservedSession?.id;
    const option = id ? this.configurations.get(id)?.find((entry) => entry.id === 'model') : undefined;
    const choice = dshSelectChoices(option).find((entry) => entry.value === option?.currentValue);
    return choice ? { provider: choice.group, model: choice.value } : null;
  }

  getDefaultReasoningEffort(sessionId?: string): string | undefined {
    const id = sessionId ?? this.reservedSession?.id;
    const model = this.getDefaultModelSelection(id)?.model;
    return id && model ? this.reasoningDefaults.get(id)?.get(model) : undefined;
  }

  async getAvailableModels(options?: Record<string, unknown>): Promise<DshModelSelectorProvider[]> {
    return this.getModelSelectorProviders(typeof options?.sessionId === 'string' ? options.sessionId : undefined);
  }

  async getProviderDirectory(options?: Record<string, unknown>): Promise<DshModelSelectorProvider[]> {
    return this.getAvailableModels(options);
  }

  async getResolvedModelConfig(options?: Record<string, unknown>): Promise<unknown> {
    return this.readSessionConfiguration(typeof options?.sessionId === 'string' ? options.sessionId : undefined);
  }

  async setSessionConfigOption(sessionId: string | undefined, configId: string, value: string): Promise<void> {
    const id = await this.ensureConfigurationSession(sessionId);
    if (this.turns.has(id)) throw new Error('DSH configuration changes require an idle session');
    await this.applyConfigOption(await this.ready(), id, configId, value);
  }

  private async applyConfigOption(client: DshClientPort, sessionId: string, configId: string, value: string): Promise<void> {
    const option = this.configurations.get(sessionId)?.find((entry) => entry.id === configId);
    if (!option || !dshSelectChoices(option).some((choice) => choice.value === value))
      throw new Error('DSH configuration value is not in the native session catalog');
    if (option.currentValue === value) return;
    const generation = this.lifecycleGeneration;
    const response = await client.setConfigOption(sessionId, configId, value);
    this.assertCurrentClient(client, generation);
    this.rememberConfiguration(sessionId, response, configId === 'model');
    if (this.configurations.get(sessionId)?.find((entry) => entry.id === configId)?.currentValue !== value)
      throw new Error('DSH did not confirm the requested session configuration');
  }

  private async applySendConfiguration(client: DshClientPort, sessionId: string, options: Record<string, unknown>): Promise<void> {
    const model = options.model;
    if (model !== undefined && model !== '') {
      if (typeof model !== 'string') throw new Error('Invalid DSH model selection');
      const option = this.configurations.get(sessionId)?.find((entry) => entry.id === 'model');
      const choice = dshSelectChoices(option).find((entry) => entry.value === model);
      if (!choice || (options.provider && choice.group !== options.provider)) throw new Error('DSH model is not in the native session catalog');
      await this.applyConfigOption(client, sessionId, 'model', model);
    }
    const effort = options.variant === undefined || options.variant === '' ? this.getDefaultReasoningEffort(sessionId) : options.variant;
    if (effort !== undefined && effort !== '') {
      if (typeof effort !== 'string') throw new Error('Invalid DSH reasoning effort');
      await this.applyConfigOption(client, sessionId, 'reasoning_effort', effort);
    }
  }

  private acceptContextUsage(sessionId: string, update: DshJsonObject): ContextUsageSnapshot | null {
    if (typeof update.used !== 'number' || !Number.isSafeInteger(update.used) || update.used < 0
      || typeof update.size !== 'number' || !Number.isSafeInteger(update.size) || update.size <= 0) return null;
    const previous = this.contextUsage.get(sessionId);
    const model = this.turns.get(sessionId)?.selection ?? null;
    const now = Date.now();
    // The native meter only reports a breakdown once a real turn anchored the
    // measurement on the model's reported usage; until then totals stay opaque.
    const breakdownAvailable = typeof update.inputTokens === 'number' && typeof update.outputTokens === 'number';
    const inputTokens = breakdownAvailable ? update.inputTokens as number : 0;
    const outputTokens = breakdownAvailable ? update.outputTokens as number : 0;
    const cacheReadTokens = typeof update.cacheReadTokens === 'number' ? update.cacheReadTokens as number : 0;
    const cacheWriteTokens = typeof update.cacheWriteTokens === 'number' ? update.cacheWriteTokens as number : null;
    const snapshot: ContextUsageSnapshot = {
      sessionId, sessionTitle: '', createdAt: previous?.createdAt ?? now, updatedAt: now,
      // The harness config group (e.g. deepseek-official) is a display label,
      // not a pricing-catalog provider; pricing resolves from the real model
      // id decoded out of the opaque selection.
      providerId: null, providerName: model?.provider ?? null,
      modelId: decodeDshOpaqueModel(model?.model) ?? model?.model ?? null,
      modelName: null,
      contextWindow: update.size, totalTokens: update.used,
      inputTokens, outputTokens, reasoningTokens: 0, cacheReadTokens, cacheWriteTokens,
      totalCost: null, tokenBreakdownAvailable: breakdownAvailable,
    };
    this.contextUsage.set(sessionId, snapshot);
    return snapshot;
  }

  async getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null> {
    const snapshot = this.contextUsage.get(sessionId);
    return snapshot ? { ...snapshot } : null;
  }
}

function dshSelectChoices(option: DshJsonObject | undefined): Array<{ value: string; name: string; group: string; groupName: string }> {
  const choices: Array<{ value: string; name: string; group: string; groupName: string }> = [];
  for (const value of Array.isArray(option?.options) ? option.options : []) {
    const entry = asRecord(value);
    if (!entry) continue;
    const group = typeof entry.group === 'string' ? entry.group : 'dsh';
    const groupName = typeof entry.name === 'string' ? entry.name : group;
    for (const item of Array.isArray(entry.options) ? entry.options : [entry]) {
      const choice = asRecord(item);
      if (typeof choice?.value === 'string' && typeof choice.name === 'string')
        choices.push({ value: choice.value, name: choice.name, group, groupName });
    }
  }
  return choices;
}

function isTransportUncertainPromptError(error: Error): boolean {
  // A provider's known RPC failure may mention "protocol" or "transport" without losing the ACP connection.
  return /^DSH ACP (?:session\/(?:prompt|set_config_option) timed out|process (?:exited|stopped)|client stopped)/i.test(error.message);
}

function translateDshUpdate(update: DshJsonObject): StreamChunk | null {
  const type = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
  if (type === 'agent_message_chunk' || type === 'agent_thought_chunk') {
    const content = asRecord(update.content);
    // Live assistant images go through the same admission gate as history:
    // verified payloads keep the streamed markdown form, everything else
    // degrades to a placeholder without producing a data URI.
    const text = content?.type === 'image' ? dshImageProjectionText(content) : dshContentBlockText(content);
    if (!text) return null;
    return type === 'agent_thought_chunk'
      ? { type: 'thinking', content: text, ...(typeof update.messageId === 'string' ? { partId: update.messageId } : {}) }
      : { type: 'text', content: text };
  }
  if (type === 'tool_call') {
    return {
      type: 'tool_use',
      id: String(update.toolCallId ?? ''),
      name: String(update.title ?? update.name ?? 'tool'),
      input: asRecord(update.rawInput) ?? (typeof update.rawInput === 'string' ? { rawInput: update.rawInput } : {}),
    };
  }
  if (type === 'tool_call_update') {
    if (update.status !== 'completed' && update.status !== 'failed') return null;
    return {
      type: 'tool_result',
      toolUseId: String(update.toolCallId ?? ''),
      content: Array.isArray(update.content)
        ? update.content.map((value) => {
          const item = asRecord(value);
          const block = asRecord(item?.content) ?? item;
          if (block?.type === 'image') {
            // Single verified images stay bare so the tool renderer's
            // data-image branch can display them; every other image shape
            // (unavailable, fake, mismatched, oversized) falls through the
            // unified placeholder gate instead of the codec's data-URI text.
            const dataUri = dshImageDataUri(block);
            if (dataUri) return dataUri;
            return dshImageProjectionText(block);
          }
          return dshContentBlockText(block);
        }).filter(Boolean).join('\n') || contentText(update.content)
        : contentText(update.content),
      isError: update.status === 'failed',
    };
  }
  return null;
}

function asRecord(value: unknown): DshJsonObject | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as DshJsonObject : null; }

/** Catalog timestamps arrive as ISO strings; numeric inputs pass through. */
function toEpochMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/** Native model selections are opaque JSON arrays ["provider","model-id"]. */
function decodeDshOpaqueModel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && typeof parsed[1] === 'string' && parsed[1] ? parsed[1] : null;
  } catch {
    return null;
  }
}

/**
 * Historical assistant messages record the model route that produced them
 * (bridge-relayed `sourceProvider`/`sourceModel`, present only when the native
 * message source kind is 'model'). Encode them with the same tuple contract the
 * session catalog uses — the opaque selection is `JSON.stringify([provider.id,
 * item.id])` and a live turn records `${provider}/${opaqueSelection}` via
 * formatModelId — so hydrated labels resolve display names and merge
 * comparisons exactly like live-turn metadata. Core cannot import the
 * feature-layer formatter; this is the same contract, not a divergent format.
 * Messages without recorded provenance get no field at all, which lets the
 * native merge keep a locally known modelId instead of erasing it.
 */
function encodeDshRecordedModelId(message: DshJsonObject): string | null {
  if (message.role !== 'assistant' || message.sourceKind !== 'model') return null;
  const provider = message.sourceProvider;
  const model = message.sourceModel;
  if (typeof provider !== 'string' || !provider.trim() || typeof model !== 'string' || !model.trim()) return null;
  return `${provider}/${JSON.stringify([provider, model])}`;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((entry) => {
    const content = asRecord(entry);
    const nested = asRecord(content?.content);
    if (content?.type === 'image' || nested?.type === 'image') return '[DeepSeek Harness tool returned image content that this adapter cannot render]';
    return typeof nested?.text === 'string' ? nested.text : typeof content?.text === 'string' ? content.text : '';
  }).filter(Boolean).join('\n');
}

/**
 * Admission for adapter-surfaced images that are NOT Harness-store-owned
 * (ACP/live relays, replayed history payloads): canonical base64 + size via
 * the codec's `dshImageBlock`, then a bounded magic-byte read proving the
 * decoded payload agrees with the declared media type. Anything that fails
 * admission degrades to the honest text placeholder instead of producing a
 * data URI from unverified bytes.
 */
function dshVerifiedImage(content: DshJsonObject): { mimeType: string; data: string } | null {
  const mimeType = content.mimeType;
  const data = content.data;
  if (typeof mimeType !== 'string' || typeof data !== 'string' || data.length === 0) return null;
  try {
    dshImageBlock(mimeType, data);
    const header = Buffer.from(data.slice(0, 24), 'base64').toString('latin1');
    const magic = mimeType === 'image/png' ? header.startsWith('\x89PNG')
      : mimeType === 'image/jpeg' ? header.startsWith('\xFF\xD8\xFF')
      : mimeType === 'image/gif' ? header.startsWith('GIF87a') || header.startsWith('GIF89a')
      : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
    return magic ? { mimeType, data } : null;
  } catch { return null; }
}

/**
 * Bare data URI for store-backed image blocks. The shared tool renderer
 * renders a tool result that starts with `data:image/` as a real image, so
 * tool-result images must keep this exact unwrapped form (markdown wrapping
 * would degrade to truncated text lines).
 */
function dshImageDataUri(content: DshJsonObject): string | null {
  const verified = dshVerifiedImage(content);
  return verified ? `data:${verified.mimeType};base64,${verified.data}` : null;
}

/**
 * Unified text fallback for image blocks that are not surfaced as owned
 * images. Unavailable references (missing, expired, corrupt, unreadable in
 * the Harness attachment store) keep their explicit placeholder; blocks that
 * pass `dshVerifiedImage` admission keep the streamed markdown form from
 * `dshContentBlockText`; anything failing admission degrades to the invalid
 * placeholder — never back to a codec path that could produce a data URI from
 * unverified bytes. Non-image blocks delegate unchanged.
 */
function dshImageProjectionText(content: DshJsonObject | null): string {
  if (content?.unavailable === true) {
    const reason = typeof content.reason === 'string' && content.reason ? ` (${content.reason})` : '';
    return `[DeepSeek Harness image is no longer available${reason}]`;
  }
  if (content?.type === 'image' && !dshVerifiedImage(content)) {
    return '[DeepSeek Harness returned an invalid or unsupported image]';
  }
  return dshContentBlockText(content);
}

async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([promise.then(() => true),
    new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), timeoutMs); })]);
  if (timeout) clearTimeout(timeout);
  return result;
}
