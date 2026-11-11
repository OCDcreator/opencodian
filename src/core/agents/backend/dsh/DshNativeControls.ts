/* eslint-disable max-lines -- Public Native DTOs stay beside their request/response validators and generation fences; lifecycle and transport remain in DshAdapter. */
import { randomUUID } from 'crypto';

import { sanitizeDiagnosticReport } from '../../../../shared/diagnosticSecretSanitizer';
import type { DshMcpServer } from '../../../types/settings';
import type { Disposable } from '../AgentService';
import type { DshAcpUpdate, DshJsonObject, DshJsonValue } from './DshAcpClient';

/** Missing presence on an older bridge is unknown, never evidence of an absent service. */
export interface DshNativeServicePresence { present: boolean | null }

/** Wire DTOs stay in core.backend. Native capability flags are runtime evidence. */
export interface DshNativeControlCapabilities {
  native: boolean;
  configuration: {
    describe: boolean;
    credentials: Record<'describe' | 'set' | 'unset', boolean>;
    extensionSettings: Record<'mutate', boolean>;
    extensions: Record<'list' | 'inspect' | 'versions' | 'enablePlugin' | 'enableBundle' | 'install' | 'update' | 'remove' | 'cancel' | 'exempt' | 'managedProfile', boolean>;
  };
  controls: {
    readback: boolean;
    revision: number | null;
    permissionPresets: Record<'get' | 'set', boolean>;
    plan: Record<'get' | 'set', boolean>;
    todos: Record<'list' | 'updates', boolean>;
    jobs: DshNativeServicePresence & Record<'list' | 'get' | 'read' | 'readAt' | 'wait' | 'kill' | 'updates', boolean>;
    terminal: DshNativeServicePresence & Record<'availability' | 'list' | 'spawn' | 'read' | 'send' | 'signal' | 'kill' | 'activity', boolean>;
    subagents: DshNativeServicePresence & Record<'list' | 'get' | 'cancel', boolean>;
    goal: DshNativeServicePresence;
    mcp: Record<'apply' | 'status' | 'connectionStatus', boolean>;
  };
}

export interface DshNativeConfigurationObservation {
  ns: string; status: 'verified' | 'unavailable'; valueSource: 'effective'; value?: DshJsonValue; reason?: string; secrets?: DshJsonValue;
}
export interface DshNativeConfigurationReadback {
  forms: DshJsonObject[];
  observations?: DshNativeConfigurationObservation[];
  profile: { managed: boolean; writable: boolean; hasDocument: boolean };
  /** Only the running process can report this. It is not field-level confirmation. */
  appliedRevision: string | null;
}
export interface DshNativeCredentialDescriptor { ref: string; configured: boolean; source?: string; writable: boolean }
export interface DshNativeCredentialReadback { credentials: DshNativeCredentialDescriptor[] }
export type DshNativeExtensionInput = { spec: string; registry?: string | null } | { name: string; registry?: string | null };
export type DshNativeExtensionMutation = { operationId?: string } & (
  | { action: 'enable-plugin'; id: string; enabled: boolean }
  | { action: 'enable-bundle'; name: string; enabled: boolean }
  | { action: 'install'; spec: string; registry?: string | null; enabled?: boolean; saveExact?: boolean; approvedBuilds?: string[] }
  | { action: 'update'; name: string; version: string; registry?: string | null }
  | { action: 'remove'; name: string }
  | { action: 'cancel'; operationId: string }
  | { action: 'exempt'; packageVersion: string; runtimeVersion: string; enabled: boolean; acceptRisk: true }
);
export type DshNativeExtensionReadback = DshJsonObject;
export type DshNativeExtensionSettingsOperation = { op: 'set'; path: string[]; value: DshJsonValue } | { op: 'unset'; path: string[] };
export interface DshNativeExtensionSettingsMutation { ns: string; expectedRevision: number; ops: DshNativeExtensionSettingsOperation[] }
export interface DshNativeExtensionSettingsEvidence { status: 'verified' | 'unavailable'; reason?: string }
export interface DshNativeExtensionSettingsReadback {
  form: DshJsonObject | null;
  persistence: DshNativeExtensionSettingsEvidence & { source: 'managed-profile' };
  application: DshNativeExtensionSettingsEvidence;
  readback: DshNativeExtensionSettingsEvidence;
}

export interface DshPermissionPresetOption { value: string; name: string; description?: string }
export interface DshPermissionPresetState {
  catalog: { options: DshPermissionPresetOption[]; defaultOptions: DshPermissionPresetOption[]; defaultPreset: string };
  current: string;
  defaultPreset: string;
}
export interface DshPlanState { active: boolean; pending?: boolean; disposition?: 'committed' | 'queued' | 'cancelled' | 'noop' }
export interface DshSessionTodo { id: string; content: string; status: string; priority?: string }
export interface DshSessionTodoUpdate { sessionID: string; todos: DshSessionTodo[] }
export interface DshJobView {
  id: string; kind: string; label: string; owner: string;
  status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed';
  startedAt: number; finishedAt?: number; progress?: string; detail?: string;
  output: { total: number; earliest: number; spillPaths?: string[] };
  outputLimitBytes?: number;
}
export interface DshJobChunk { at: number; text: string; channel?: 'stdout' | 'stderr' | 'log'; gapBefore?: true }
export interface DshJobRead { chunks: DshJobChunk[]; lossy: boolean; result?: string; job: DshJobView }
export interface DshJobOutputRead { chunks: DshJobChunk[]; next: number; lossy: boolean }
export interface DshJobReadOptions { maxBytes?: number }
export interface DshJobReadAtOptions extends DshJobReadOptions { from: number }
export interface DshJobWaitOptions { timeoutMs?: number }
export interface DshJobKillOptions { reason?: string }
export interface DshJobKillReadback { disposition: 'requested' | 'already-finished'; job: DshJobView }
export type DshTerminalStatus = { kind: 'running' } | { kind: 'exited'; exitCode: number | null; signal: string | null };
export interface DshTerminalSpawnOptions { type: string; name?: string; cwd?: string }
export interface DshTerminalReadOptions { offset?: number; count?: number }
export interface DshTerminalSendOptions { text: string; submit: boolean }
export type DshTerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL' | 'SIGTSTP' | 'SIGHUP';
export interface DshTerminalSnapshot { sessionId: string; name?: string; type: string; pid?: number; status: DshTerminalStatus }
export interface DshTerminalSpawnReadback extends DshTerminalSnapshot { motd: string }
export interface DshTerminalReadback { text: string; totalLines: number; lineBegin: number; lineEnd: number; truncated: boolean }
export interface DshTerminalSendReadback {
  viewport: string; waitReason: 'stdin_read' | 'inferred_idle' | 'timeout' | 'session_exit';
  sessionStatus: DshTerminalStatus; truncated: boolean;
}
export interface DshSubagentView {
  id: string; createdAt: number; mode: 'one-shot' | 'continuable' | 'external' | 'unknown'; label?: string;
  /** Optional bridge readback; catalog presence alone does not imply completion. */
  status?: string; activity?: 'active' | 'inactive' | 'unknown'; readable?: boolean;
}
export interface DshMcpServerStatus { name: string; status?: string; state?: string; connected?: boolean | null; mounted?: boolean; tools?: string[]; toolCount?: number; reason?: string }
export interface DshSessionMcpStatus { sessionId?: string; servers: DshMcpServerStatus[] }
export type DshNativeSessionControlUpdate =
  | { sessionUpdate: 'todo_update'; todos: DshSessionTodo[] }
  | ({ sessionUpdate: 'plan_update' } & DshPlanState)
  | ({ sessionUpdate: 'permission_presets_update' } & DshPermissionPresetState)
  | { sessionUpdate: 'jobs_update'; jobs?: DshJobView[]; event?: DshJsonObject };
export interface DshNativeExtensionUpdate {
  operationId: string; action: string; event: 'started' | 'install-state' | 'update-state' | 'output' | 'settled';
  /** Bounded, redacted metadata, never an exception object or credential value. */
  detail: DshJsonObject;
}
export type DshNativeControlUpdate =
  | { kind: 'session'; sessionId: string; update: DshNativeSessionControlUpdate }
  | { kind: 'configuration'; readback: DshNativeConfigurationReadback }
  | { kind: 'extension'; update: DshNativeExtensionUpdate }
  | { kind: 'busy'; sessionId: string; busy: boolean }
  | { kind: 'invalidated' };

/** Captured by the adapter only after the current native connection owns the session. */
export interface DshNativeControlLease {
  request(method: string, params: DshJsonObject, timeoutMs?: number): Promise<DshJsonObject>;
  assertCurrent(): void;
  capabilities: DshNativeControlCapabilities;
  /** True only after this lease read control/capabilities from its captured client. */
  capabilitiesCurrent: boolean;
  refreshCapabilities(): Promise<DshNativeControlCapabilities>;
}
export interface DshNativeControlsHost { acquire(sessionId?: string): Promise<DshNativeControlLease> }

export function dshNativeControlCapabilities(handshake: DshJsonObject | null, hasRequest: boolean): DshNativeControlCapabilities {
  const native = hasRequest && handshake?.nativeProtocol === 'opencodian.dsh-native/1';
  const configuration = native ? record(handshake?.configurationCapabilities) : null;
  const controls = native ? record(handshake?.controlCapabilities) : null;
  const flags = <T extends string>(value: unknown, names: readonly T[]): Record<T, boolean> =>
    Object.fromEntries(names.map(name => [name, record(value)?.[name] === true])) as Record<T, boolean>;
  const presence = (value: unknown): DshNativeServicePresence => {
    const present = record(value)?.present;
    return { present: typeof present === 'boolean' ? present : null };
  };
  return {
    native,
    configuration: {
      describe: configuration?.describe === true,
      credentials: flags(configuration?.credentials, ['describe', 'set', 'unset']),
      extensionSettings: flags(configuration?.extensionSettings, ['mutate']),
      extensions: flags(configuration?.extensions, ['list', 'inspect', 'versions', 'enablePlugin', 'enableBundle', 'install', 'update', 'remove', 'cancel', 'exempt', 'managedProfile']),
    },
    controls: {
      readback: controls?.readback === true,
      revision: typeof controls?.revision === 'number' && Number.isSafeInteger(controls.revision) && controls.revision >= 0 ? controls.revision : null,
      permissionPresets: flags(controls?.permissionPresets, ['get', 'set']), plan: flags(controls?.plan, ['get', 'set']),
      todos: flags(controls?.todos, ['list', 'updates']),
      jobs: { ...flags(controls?.jobs, ['list', 'get', 'read', 'readAt', 'wait', 'kill', 'updates']), ...presence(controls?.jobs) },
      terminal: { ...flags(controls?.terminal, ['availability', 'list', 'spawn', 'read', 'send', 'signal', 'kill', 'activity']), ...presence(controls?.terminal) },
      subagents: { ...flags(controls?.subagents, ['list', 'get', 'cancel']), ...presence(controls?.subagents) },
      goal: presence(controls?.goal), mcp: flags(controls?.mcp, ['apply', 'status', 'connectionStatus']),
    },
  };
}

export class DshNativeControlError extends Error {
  constructor(readonly code: 'unavailable' | 'superseded' | 'invalid-response' | 'failed' | 'busy' | 'conflict', message: string) {
    super(message); this.name = 'DshNativeControlError';
  }
}

const SUBAGENT_PROMPT_FAILURE_CODES = ['subagent/parent-unavailable', 'subagent/not-resumable', 'subagent/unauthorized',
  'subagent/delivery-unavailable', 'subagent/attachment-invalid', 'subagent/invalid-time-zone'] as const;
export type DshSubagentPromptFailureCode = typeof SUBAGENT_PROMPT_FAILURE_CODES[number];

/** Domain failure metadata never contains the rejected prompt or native error details. */
export class DshSubagentContinuationError extends DshNativeControlError {
  constructor(readonly failureCode: DshSubagentPromptFailureCode) {
    super('failed', `Harness child session could not accept the message (${failureCode})`);
    this.name = 'DshSubagentContinuationError';
  }
}

/** Read current service composition; handshake presence alone cannot prove reconnect safety. */
export async function readDshNativeControlCapabilities(lease: Pick<DshNativeControlLease, 'request' | 'assertCurrent' | 'capabilities'>): Promise<DshNativeControlCapabilities> {
  lease.assertCurrent();
  if (!lease.capabilities.controls.readback) return lease.capabilities;
  try {
    const response = await lease.request('control/capabilities', {});
    lease.assertCurrent();
    const controls = record(response.controlCapabilities);
    check(controls?.readback === true && typeof controls.revision === 'number' && Number.isSafeInteger(controls.revision) && controls.revision >= 0);
    for (const family of ['jobs', 'terminal', 'subagents', 'goal']) {
      const current = record(controls[family]);
      check(current && typeof current.present === 'boolean' && Object.values(current).every(value => typeof value === 'boolean'));
    }
    return { ...lease.capabilities, controls: dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1', controlCapabilities: controls }, true).controls };
  } catch (error) {
    lease.assertCurrent();
    if (error instanceof DshNativeControlError) throw error;
    throw new DshNativeControlError('unavailable', 'Harness current control capabilities could not be confirmed');
  }
}

type CapabilityGate = (capabilities: DshNativeControlCapabilities) => boolean;
type ResponseParser<T> = (response: DshJsonObject) => T;

/** One high-risk protocol boundary: generations, ownership, validation and observer isolation. */
export class DshNativeControls {
  private readonly observers = new Set<(update: DshNativeControlUpdate) => void>();
  private readonly todoObservers = new Set<(update: DshSessionTodoUpdate) => void>();
  private pending = 0;
  constructor(private readonly host: DshNativeControlsHost) {}
  get inFlight(): number { return this.pending; }
  async refreshCapabilities(): Promise<DshNativeControlCapabilities> {
    ++this.pending;
    try {
      const lease = await this.host.acquire();
      lease.assertCurrent();
      return lease.capabilities;
    } catch (error) {
      if (error instanceof DshNativeControlError) throw error;
      throw new DshNativeControlError('unavailable', 'Harness current control capabilities could not be confirmed');
    } finally { --this.pending; }
  }
  subscribe(handler: (update: DshNativeControlUpdate) => void): Disposable {
    this.observers.add(handler); return { dispose: () => { this.observers.delete(handler); } };
  }
  subscribeTodos(handler: (update: DshSessionTodoUpdate) => void): Disposable {
    this.todoObservers.add(handler); return { dispose: () => { this.todoObservers.delete(handler); } };
  }
  invalidate(): void { this.publish({ kind: 'invalidated' }); }
  dispose(): void { this.observers.clear(); this.todoObservers.clear(); }
  busy(sessionId: string, busy: boolean): void { this.publish({ kind: 'busy', sessionId, busy }); }
  private publish(update: DshNativeControlUpdate): void {
    for (const observer of this.observers) { try { observer(update); } catch { /* An observer cannot break the transport. */ } }
  }
  private async request<T>(operation: {
    method: string; params?: DshJsonObject; sessionId?: string; timeoutMs?: number; refreshAfter?: boolean;
    available: CapabilityGate; parse: ResponseParser<T>;
  }): Promise<T> {
    ++this.pending;
    let lease: DshNativeControlLease | undefined;
    try {
      lease = await this.host.acquire(operation.sessionId);
      lease.assertCurrent();
      if (!lease.capabilities.native || !operation.available(lease.capabilities))
        throw new DshNativeControlError('unavailable', 'This Harness connection does not expose the requested control');
      const response = await lease.request(operation.method, {
        ...operation.params, ...(operation.sessionId === undefined ? {} : { sessionId: operation.sessionId }),
      }, operation.timeoutMs);
      lease.assertCurrent();
      const parsed = operation.parse(response);
      if (operation.refreshAfter) {
        try { await lease.refreshCapabilities(); } catch { this.publish({ kind: 'invalidated' }); }
        lease.assertCurrent();
      }
      return parsed;
    } catch (error) {
      lease?.assertCurrent();
      if (operation.refreshAfter && lease) {
        try { await lease.refreshCapabilities(); } catch { this.publish({ kind: 'invalidated' }); }
        lease.assertCurrent();
      }
      if (error instanceof DshNativeControlError) throw error;
      if (error instanceof Error && error.message.includes('[SETTINGS_CONFLICT]'))
        throw new DshNativeControlError('conflict', 'Harness extension settings changed; refresh before applying this edit');
      throw new DshNativeControlError('failed', 'Harness control failed; refresh its runtime state before retrying');
    } finally { --this.pending; }
  }
  getNativeConfiguration(namespaces?: string[]): Promise<DshNativeConfigurationReadback> {
    return this.request({ method: 'config/describe', params: namespaces ? { namespaces } : {},
      available: c => c.configuration.describe, parse: response => {
        const readback = parseConfiguration(response);
        this.publish({ kind: 'configuration', readback });
        return readback;
      } });
  }
  getNativeCredentialDescriptors(refs?: string[]): Promise<DshNativeCredentialReadback> {
    return this.credentials('describe', refs ? { refs } : {});
  }
  setNativeCredential(ref: string, value: string): Promise<DshNativeCredentialReadback> { return this.credentials('set', { ref, value }); }
  unsetNativeCredential(ref: string): Promise<DshNativeCredentialReadback> { return this.credentials('unset', { ref }); }
  private credentials(action: 'describe' | 'set' | 'unset', params: DshJsonObject): Promise<DshNativeCredentialReadback> {
    return this.request({ method: 'config/credentials', params: { ...params, action },
      available: c => c.configuration.credentials[action], parse: parseCredentials });
  }
  listNativeExtensions(): Promise<DshNativeExtensionReadback> { return this.extensions('list', {}); }
  inspectNativeExtension(input: DshNativeExtensionInput): Promise<DshNativeExtensionReadback> { return this.extensions('inspect', input); }
  getNativeExtensionVersions(input: DshNativeExtensionInput): Promise<DshNativeExtensionReadback> { return this.extensions('versions', input); }
  mutateNativeExtension(input: DshNativeExtensionMutation): Promise<DshNativeExtensionReadback> { return this.extensions(input.action, input); }
  mutateNativeExtensionSettings(input: DshNativeExtensionSettingsMutation): Promise<DshNativeExtensionSettingsReadback> {
    check(typeof input.ns === 'string' && input.ns.trim().length > 0 && Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0);
    check(Array.isArray(input.ops) && input.ops.length > 0 && input.ops.length <= 256);
    for (const op of input.ops) {
      check((op.op === 'set' || op.op === 'unset') && Array.isArray(op.path) && op.path.length > 0);
      check(op.path.every(part => typeof part === 'string' && part.length > 0
        && !/^(?:__proto__|prototype|constructor|api[_-]?key|token|password|secret|authorization|credentials|cookie)$/i.test(part)));
    }
    return this.request({ method: 'config/extension-settings', params: { action: 'mutate', ns: input.ns, ops: input.ops, expectedRevision: input.expectedRevision },
      available: c => c.configuration.extensionSettings.mutate, parse: response => {
        check((response.form === null || record(response.form)) && record(response.persistence)?.source === 'managed-profile');
        check(['persistence', 'application', 'readback'].every(key => ['verified', 'unavailable'].includes(String(record(response[key])?.status))));
        return safeObject(response) as unknown as DshNativeExtensionSettingsReadback;
      } });
  }
  private extensions(action: string, input: DshJsonObject): Promise<DshNativeExtensionReadback> {
    const flag = action === 'enable-plugin' ? 'enablePlugin' : action === 'enable-bundle' ? 'enableBundle' : action;
    return this.request({ method: 'config/extensions', params: { ...input, action }, timeoutMs: 180_000,
      refreshAfter: !['list', 'inspect', 'versions'].includes(action), available: c => c.configuration.extensions[flag as keyof typeof c.configuration.extensions] === true,
      parse: response => safeObject(response) });
  }
  getSessionPermissionPreset(sessionId: string): Promise<DshPermissionPresetState> { return this.permissionPreset(sessionId, 'get'); }
  setSessionPermissionPreset(sessionId: string, preset: string): Promise<DshPermissionPresetState> { return this.permissionPreset(sessionId, 'set', preset); }
  private permissionPreset(sessionId: string, action: 'get' | 'set', preset?: string): Promise<DshPermissionPresetState> {
    return this.request({ method: 'session/permission-presets', sessionId, params: { action, ...(preset === undefined ? {} : { preset }) },
      available: c => c.controls.permissionPresets[action], parse: parsePermissionPreset });
  }
  getSessionPlanState(sessionId: string): Promise<DshPlanState> { return this.plan(sessionId, 'get'); }
  setSessionPlanState(sessionId: string, active: boolean): Promise<DshPlanState> { return this.plan(sessionId, 'set', active); }
  private plan(sessionId: string, action: 'get' | 'set', active?: boolean): Promise<DshPlanState> {
    return this.request({ method: 'session/plan', sessionId, params: { action, ...(active === undefined ? {} : { active }) },
      available: c => c.controls.plan[action], parse: parsePlan });
  }
  getSessionTodos(sessionId: string): Promise<DshSessionTodo[]> {
    return this.request({ method: 'session/todos', sessionId, available: c => c.controls.todos.list, parse: parseTodos });
  }
  listSessionJobs(sessionId: string): Promise<DshJobView[]> {
    return this.jobRequest(sessionId, 'list', {}, r => array(r.jobs).map(job => parseJob(job, sessionId)));
  }
  getSessionJob(sessionId: string, jobId: string): Promise<DshJobView> {
    return this.jobRequest(sessionId, 'get', { jobId }, r => parseJob(r.job, sessionId, jobId));
  }
  readSessionJob(sessionId: string, jobId: string, options: DshJobReadOptions = {}): Promise<DshJobRead> {
    return this.jobRequest(sessionId, 'read', { jobId, ...options }, r => {
      check(typeof r.lossy === 'boolean' && (r.result === undefined || typeof r.result === 'string'));
      return { ...safeObject(r), chunks: parseChunks(r.chunks), lossy: r.lossy as boolean, job: parseJob(r.job, sessionId, jobId) } as DshJobRead;
    });
  }
  readSessionJobAt(sessionId: string, jobId: string, options: DshJobReadAtOptions): Promise<DshJobOutputRead> {
    check(Number.isSafeInteger(options.from) && options.from >= 0);
    return this.jobRequest(sessionId, 'readAt', { jobId, ...options }, r => {
      check(typeof r.lossy === 'boolean' && nonnegative(r.next));
      return { chunks: parseChunks(r.chunks), lossy: r.lossy as boolean, next: r.next as number };
    });
  }
  waitForSessionJob(sessionId: string, jobId: string, options: DshJobWaitOptions = {}): Promise<DshJobView> {
    const timeoutMs = options.timeoutMs ?? 1000;
    check(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30_000);
    return this.jobRequest(sessionId, 'wait', { jobId, timeoutMs }, r => parseJob(r.job, sessionId, jobId));
  }
  killSessionJob(sessionId: string, jobId: string, options: DshJobKillOptions = {}): Promise<DshJobKillReadback> {
    return this.jobRequest(sessionId, 'kill', { jobId, ...options }, r => {
      check(r.disposition === 'requested' || r.disposition === 'already-finished');
      return { disposition: r.disposition as DshJobKillReadback['disposition'], job: parseJob(r.job, sessionId, jobId) };
    });
  }
  private jobRequest<T>(sessionId: string, action: Exclude<keyof DshNativeControlCapabilities['controls']['jobs'], 'present'>, params: DshJsonObject, parse: ResponseParser<T>): Promise<T> {
    check(params.maxBytes === undefined || Number.isSafeInteger(params.maxBytes) && Number(params.maxBytes) >= 1 && Number(params.maxBytes) <= 32_768);
    return this.request({ method: 'session/jobs', sessionId, params: { ...params, action },
      ...(action === 'wait' && typeof params.timeoutMs === 'number' ? { timeoutMs: params.timeoutMs + 15_000 } : {}),
      available: c => c.controls.jobs[action], parse });
  }
  getSessionTerminalAvailability(sessionId: string): Promise<{ available: boolean; backends: string[] }> {
    return this.terminal(sessionId, 'availability', {}, r => {
      check(typeof r.available === 'boolean' && array(r.backends).every(v => typeof v === 'string'));
      return { available: r.available as boolean, backends: r.backends as string[] };
    });
  }
  listSessionTerminals(sessionId: string): Promise<DshTerminalSnapshot[]> {
    return this.terminal(sessionId, 'list', {}, r => array(r.terminals).map(parseTerminal));
  }
  spawnSessionTerminal(sessionId: string, options: DshTerminalSpawnOptions): Promise<DshTerminalSpawnReadback> {
    return this.terminal(sessionId, 'spawn', { ...options }, r => {
      const snapshot = parseTerminal(r); check(typeof r.motd === 'string');
      return { ...snapshot, motd: safeText(r.motd as string) };
    });
  }
  readSessionTerminal(sessionId: string, terminalId: string, options: DshTerminalReadOptions = {}): Promise<DshTerminalReadback> {
    return this.terminal(sessionId, 'read', { terminalId, ...options }, r => {
      check(typeof r.text === 'string' && typeof r.truncated === 'boolean' && ['totalLines', 'lineBegin', 'lineEnd'].every(k => nonnegative(r[k])));
      return safeObject(r) as unknown as DshTerminalReadback;
    });
  }
  sendSessionTerminal(sessionId: string, terminalId: string, input: DshTerminalSendOptions): Promise<DshTerminalSendReadback> {
    return this.terminal(sessionId, 'send', { terminalId, ...input }, r => {
      check(typeof r.viewport === 'string' && typeof r.truncated === 'boolean' && ['stdin_read', 'inferred_idle', 'timeout', 'session_exit'].includes(String(r.waitReason)));
      parseTerminalStatus(r.sessionStatus);
      return safeObject(r) as unknown as DshTerminalSendReadback;
    });
  }
  signalSessionTerminal(sessionId: string, terminalId: string, signal: DshTerminalSignal): Promise<{ delivered: true; targetPgid: number }> {
    return this.terminal(sessionId, 'signal', { terminalId, signal }, r => {
      check(r.delivered === true && nonnegative(r.targetPgid)); return { delivered: true, targetPgid: r.targetPgid as number };
    });
  }
  killSessionTerminal(sessionId: string, terminalId: string, reason?: string): Promise<{ closed: boolean }> {
    return this.terminal(sessionId, 'kill', { terminalId, ...(reason === undefined ? {} : { reason }) }, r => {
      check(typeof r.closed === 'boolean'); return { closed: r.closed as boolean };
    });
  }
  private terminal<T>(sessionId: string, action: Exclude<keyof DshNativeControlCapabilities['controls']['terminal'], 'present' | 'activity'>, params: DshJsonObject, parse: ResponseParser<T>): Promise<T> {
    return this.request({ method: 'session/terminal', sessionId, params: { ...params, action }, timeoutMs: 180_000,
      available: c => c.controls.terminal[action], parse });
  }
  listSessionSubagents(sessionId: string): Promise<DshSubagentView[]> {
    return this.subagent(sessionId, 'list', {}, r => array(r.children).map(value => parseChild(value)));
  }
  getSessionSubagent(sessionId: string, childSessionId: string): Promise<DshSubagentView> {
    return this.subagent(sessionId, 'get', { childSessionId }, r => parseChild(r.child, childSessionId));
  }
  cancelSessionSubagent(sessionId: string, childSessionId: string): Promise<{ accepted: true; child: DshSubagentView }> {
    return this.subagent(sessionId, 'cancel', { childSessionId }, r => {
      check(r.accepted === true); return { accepted: true, child: parseChild(r.child, childSessionId) };
    });
  }
  /** Probe this optional operation without changing the shared capability parser. */
  canContinueSessionSubagent(sessionId: string): Promise<boolean> {
    return this.request({ method: 'control/capabilities', sessionId,
      available: c => c.controls.readback && c.controls.subagents.list,
      parse: response => {
        const controls = record(response.controlCapabilities);
        check(controls);
        return record(controls.subagents)?.prompt === true;
      } });
  }
  continueSessionSubagent(sessionId: string, childSessionId: string, content: string,
    delivery: 'queue' | 'steer' = 'queue'): Promise<{ messageId: string }> {
    if (typeof content !== 'string' || !content.trim() || content.length > 64 * 1024)
      throw new DshNativeControlError('failed', 'A child-session message must contain between 1 and 65536 characters');
    if (delivery !== 'queue' && delivery !== 'steer')
      throw new DshNativeControlError('failed', 'Unsupported child-session delivery');
    return this.subagent(sessionId, 'prompt', { childSessionId, requestId: randomUUID(), delivery,
      content: [{ type: 'text', text: content }] }, response => {
      const failure = record(response.failure);
      if (typeof failure?.code === 'string' && SUBAGENT_PROMPT_FAILURE_CODES.includes(failure.code as DshSubagentPromptFailureCode))
        throw new DshSubagentContinuationError(failure.code as DshSubagentPromptFailureCode);
      check(response.failure === undefined && typeof response.messageId === 'string' && response.messageId.length > 0);
      return { messageId: response.messageId };
    });
  }
  private subagent<T>(sessionId: string, action: 'list' | 'get' | 'cancel' | 'prompt', params: DshJsonObject, parse: ResponseParser<T>): Promise<T> {
    return this.request({ method: 'session/subagents', sessionId, params: { ...params, action },
      available: c => action === 'prompt' ? c.controls.subagents.list : c.controls.subagents[action], parse });
  }
  getSessionMcpStatus(sessionId: string): Promise<DshSessionMcpStatus> {
    return this.request({ method: 'session/mcp', sessionId, params: { action: 'status' }, available: c => c.controls.mcp.status, parse: r => {
      const servers = array(r.servers).map(value => {
        const server = record(value); check(server && typeof server.name === 'string');
        if (server.connected !== undefined) check(server.connected === null || typeof server.connected === 'boolean');
        check(['status', 'state', 'reason'].every(key => server[key] === undefined || typeof server[key] === 'string'));
        check(server.tools === undefined || array(server.tools).every(tool => typeof tool === 'string'));
        check(server.toolCount === undefined || nonnegative(server.toolCount));
        check(server.mounted === undefined || typeof server.mounted === 'boolean');
        return safeObject(server) as unknown as DshMcpServerStatus;
      });
      return { ...(typeof r.sessionId === 'string' ? { sessionId: r.sessionId } : {}), servers };
    } });
  }
  async applyMcpConfiguration(sessionIds: string[], servers: DshMcpServer[]): Promise<number> {
    ++this.pending;
    try {
      const lease = await this.host.acquire();
      for (const sessionId of sessionIds) {
        lease.assertCurrent();
        await this.request({ method: 'session/mcp', sessionId, params: { action: 'apply', replace: servers }, timeoutMs: 60_000,
          available: c => c.controls.mcp.apply, parse: response => {
            const mounted = array(response.servers).map(record);
            check(mounted.length === servers.length && servers.every(server => mounted.some(row => row?.name === server.name && row.mounted === true)));
          } });
      }
      lease.assertCurrent();
      return sessionIds.length;
    } finally { --this.pending; }
  }
  async assertSessionCanReconnect(sessionId: string): Promise<void> {
    const lease = await this.host.acquire(sessionId);
    lease.assertCurrent();
    const scoped = new DshNativeControls({ acquire: async () => {
      lease.assertCurrent();
      const capabilities = await lease.refreshCapabilities();
      lease.assertCurrent();
      return { ...lease, capabilities };
    } });
    return scoped.assertReconnectLease(sessionId, lease);
  }
  private async assertReconnectLease(sessionId: string, lease: DshNativeControlLease): Promise<void> {
    const { controls } = lease.capabilities;
    const current = lease.capabilitiesCurrent;
    await this.assertGoalCanReconnect(sessionId, controls.goal, current);
    const jobs = this.serviceAbsent(controls.jobs, current) ? [] : await this.listSessionJobs(sessionId);
    const children = this.serviceAbsent(controls.subagents, current) ? [] : await this.listSessionSubagents(sessionId);
    await this.assertTerminalsCanReconnect(sessionId, controls.terminal, current);
    if (jobs.some(job => job.status === 'running' || job.status === 'stopping'))
      throw new DshNativeControlError('busy', 'Harness has running Jobs; stop them explicitly before reconnecting');
    for (const child of children) {
      const current = await this.getSessionSubagent(sessionId, child.id);
      if (current.activity !== 'inactive')
        throw new DshNativeControlError('busy', 'Harness child activity is running or unconfirmed; reconnect after it settles');
    }
    lease.assertCurrent();
    // A Goal may arm while the optional-service checks await their readbacks.
    await this.assertGoalCanReconnect(sessionId, controls.goal, current);
    const after = await lease.refreshCapabilities();
    lease.assertCurrent();
    if (JSON.stringify(after.controls) !== JSON.stringify(controls))
      throw new DshNativeControlError('busy', 'Harness services changed during reconnect checks; refresh before retrying');
  }
  private serviceAbsent(capabilities: DshNativeServicePresence, current: boolean): boolean {
    if (!current || capabilities.present !== false) return false;
    if (Object.entries(capabilities).some(([key, value]) => key !== 'availability' && value === true))
      throw new DshNativeControlError('unavailable', 'Harness service presence contradicts its advertised controls');
    return true;
  }
  private async assertGoalCanReconnect(sessionId: string, presence: DshNativeServicePresence, current: boolean): Promise<void> {
    if (this.serviceAbsent(presence, current)) return;
    return this.request({ method: 'session/goal', sessionId, params: { action: 'get' }, available: c => c.native, parse: response => {
      if (!Object.prototype.hasOwnProperty.call(response, 'goal'))
        throw new DshNativeControlError('unavailable', 'Harness Goal activity could not be confirmed');
      if (response.goal === null) return;
      const goal = record(response.goal);
      check(goal && ['active', 'paused', 'blocked', 'complete'].includes(String(goal.phase)));
      check(goal.activation === 'armed' || goal.activation === 'disarmed');
      check(goal.armed === undefined || goal.armed === (goal.activation === 'armed'));
      check(goal.status === undefined || goal.status === goal.phase);
      if (goal.activation === 'armed')
        throw new DshNativeControlError('busy', 'Harness has an armed Goal; pause it explicitly before reconnecting');
    } });
  }
  private async assertTerminalsCanReconnect(sessionId: string, capabilities: DshNativeControlCapabilities['controls']['terminal'], current: boolean): Promise<void> {
    if (this.serviceAbsent(capabilities, current)) return;
    if (capabilities.list) {
      await this.request({ method: 'session/terminal', sessionId, params: { action: 'list' }, available: c => c.controls.terminal.list, parse: response => {
        const terminals = array(response.terminals).map(parseTerminal);
        check(!capabilities.activity || typeof response.active === 'boolean');
        if (response.active === true || terminals.some(terminal => terminal.status.kind === 'running'))
          throw new DshNativeControlError('busy', 'Harness has running terminals; close them explicitly before reconnecting');
      } });
      return;
    }
    if ((!current || capabilities.present === null) && capabilities.availability) {
      const availability = await this.getSessionTerminalAvailability(sessionId);
      if (availability.available === false && availability.backends.length === 0) return;
    }
    throw new DshNativeControlError('unavailable', 'Harness terminal activity could not be confirmed');
  }
  acceptSessionUpdate(event: DshAcpUpdate, capabilities: DshNativeControlCapabilities): boolean {
    const type = event.update.sessionUpdate;
    if (!['todo_update', 'plan_update', 'permission_presets_update', 'jobs_update'].includes(String(type))) return false;
    try {
      let update: DshNativeSessionControlUpdate;
      if (type === 'todo_update') {
        if (!capabilities.controls.todos.updates) return true;
        const todos = parseTodos(event.update); update = { sessionUpdate: type, todos };
        for (const observer of this.todoObservers) { try { observer({ sessionID: event.sessionId, todos }); } catch { /* Observer isolation. */ } }
      } else if (type === 'plan_update') {
        if (!capabilities.controls.plan.get) return true;
        update = { sessionUpdate: type, ...parsePlan(record(event.update.plan) ?? event.update) };
      } else if (type === 'permission_presets_update') {
        if (!capabilities.controls.permissionPresets.get) return true;
        update = { sessionUpdate: type, ...parsePermissionPreset(record(event.update.permissions) ?? event.update) };
      } else {
        if (!capabilities.controls.jobs.updates) return true;
        const jobs = event.update.jobs === undefined ? undefined : array(event.update.jobs).map(job => parseJob(job, event.sessionId));
        const detail = record(event.update.event);
        check(jobs !== undefined || detail !== null);
        update = { sessionUpdate: 'jobs_update', ...(jobs ? { jobs } : {}), ...(detail ? { event: parseJobEvent(detail, event.sessionId) } : {}) };
      }
      this.publish({ kind: 'session', sessionId: event.sessionId, update });
    } catch { /* Malformed notifications are not runtime evidence. */ }
    return true;
  }
  acceptControlUpdate(event: DshJsonObject, capabilities: DshNativeControlCapabilities): void {
    if (typeof event.operationId !== 'string' || typeof event.action !== 'string'
      || !['started', 'install-state', 'update-state', 'output', 'settled'].includes(String(event.event))) return;
    const flag = event.action === 'enable-plugin' ? 'enablePlugin' : event.action === 'enable-bundle' ? 'enableBundle' : event.action;
    if (!capabilities.native || capabilities.configuration.extensions[flag as keyof typeof capabilities.configuration.extensions] !== true) return;
    try {
      const detail = safeObject(event);
      if (JSON.stringify(detail).length > 65_536) return;
      this.publish({ kind: 'extension', update: { operationId: event.operationId, action: event.action,
        event: event.event as DshNativeExtensionUpdate['event'], detail } });
    } catch { /* Invalid metadata is ignored. */ }
  }
}

function record(value: unknown): DshJsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DshJsonObject : null;
}
function check(condition: unknown): asserts condition {
  if (!condition) throw new DshNativeControlError('invalid-response', 'Harness returned invalid control state');
}
function array(value: unknown): DshJsonValue[] { check(Array.isArray(value)); return value as DshJsonValue[]; }
function nonnegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function safeText(value: string): string { return sanitizeDiagnosticReport(value, { urlPolicy: 'strict' }); }
function safeObject(value: unknown): DshJsonObject {
  check(record(value));
  const clean = (input: unknown, depth: number, parent = ''): DshJsonValue => {
    check(depth < 32);
    if (typeof input === 'string') return safeText(input);
    if (input === null || typeof input === 'boolean' || typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map(item => clean(item, depth + 1, parent));
    const object = record(input); check(object);
    return Object.fromEntries(Object.entries(object).filter(([, child]) => child !== undefined).map(([key, child]) => [key,
      /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|proxy-authorization|cookie|set-cookie)$/i.test(key) && !/credentialRefs$/i.test(parent)
        ? '[REDACTED]' : clean(child, depth + 1, key)]));
  };
  return clean(value, 0) as DshJsonObject;
}
function parseConfiguration(response: DshJsonObject): DshNativeConfigurationReadback {
  const forms = array(response.forms).map(safeObject); const profile = record(response.profile);
  check(profile && ['managed', 'writable', 'hasDocument'].every(key => typeof profile[key] === 'boolean'));
  check(response.appliedRevision === undefined || response.appliedRevision === null || typeof response.appliedRevision === 'string');
  const observations = response.observations === undefined ? undefined : array(response.observations).map(value => {
    const observed = record(value);
    check(observed && typeof observed.ns === 'string' && observed.ns.length > 0 && observed.valueSource === 'effective');
    check(observed.status === 'verified' || observed.status === 'unavailable');
    check(observed.status !== 'verified' || observed.value !== undefined);
    check(observed.reason === undefined || typeof observed.reason === 'string');
    return safeObject(observed) as unknown as DshNativeConfigurationObservation;
  });
  return { forms, ...(observations === undefined ? {} : { observations }),
    profile: { managed: profile.managed as boolean, writable: profile.writable as boolean, hasDocument: profile.hasDocument as boolean },
    appliedRevision: typeof response.appliedRevision === 'string' ? response.appliedRevision : null };
}
function parseCredentials(response: DshJsonObject): DshNativeCredentialReadback {
  return { credentials: array(response.credentials).map(value => {
    const descriptor = record(value);
    check(descriptor && typeof descriptor.ref === 'string' && typeof descriptor.configured === 'boolean' && typeof descriptor.writable === 'boolean');
    return { ref: descriptor.ref, configured: descriptor.configured, writable: descriptor.writable,
      ...(typeof descriptor.source === 'string' ? { source: safeText(descriptor.source) } : {}) };
  }) };
}
function parsePermissionPreset(response: DshJsonObject): DshPermissionPresetState {
  const catalog = record(response.catalog);
  check(catalog && typeof catalog.defaultPreset === 'string' && typeof response.current === 'string' && typeof response.defaultPreset === 'string');
  const options = (input: unknown) => array(input).map(value => {
    const option = record(value); check(option && typeof option.value === 'string' && typeof option.name === 'string');
    return { value: option.value, name: safeText(option.name), ...(typeof option.description === 'string' ? { description: safeText(option.description) } : {}) };
  });
  return { catalog: { options: options(catalog.options), defaultOptions: options(catalog.defaultOptions), defaultPreset: catalog.defaultPreset },
    current: response.current, defaultPreset: response.defaultPreset };
}
function parsePlan(response: DshJsonObject): DshPlanState {
  check(typeof response.active === 'boolean' && (response.pending === undefined || typeof response.pending === 'boolean'));
  check(response.disposition === undefined || ['committed', 'queued', 'cancelled', 'noop'].includes(String(response.disposition)));
  return { active: response.active, ...(response.pending === undefined ? {} : { pending: response.pending as boolean }),
    ...(response.disposition === undefined ? {} : { disposition: response.disposition as DshPlanState['disposition'] }) };
}
function parseTodos(response: DshJsonObject): DshSessionTodo[] {
  return array(response.todos).map(value => {
    const todo = record(value); check(todo && typeof todo.id === 'string' && typeof todo.content === 'string' && typeof todo.status === 'string');
    return { id: todo.id, content: safeText(todo.content), status: todo.status, ...(typeof todo.priority === 'string' ? { priority: todo.priority } : {}) };
  });
}
function parseJob(value: unknown, owner: string, id?: string): DshJobView {
  const job = record(value); const output = record(job?.output);
  check(job && typeof job.id === 'string' && (id === undefined || job.id === id) && job.owner === owner);
  check(typeof job.kind === 'string' && typeof job.label === 'string' && nonnegative(job.startedAt));
  check(['running', 'stopping', 'completed', 'killed', 'failed'].includes(String(job.status)) && output && nonnegative(output.total) && nonnegative(output.earliest));
  check(['progress', 'detail'].every(key => job[key] === undefined || typeof job[key] === 'string'));
  check(['finishedAt', 'outputLimitBytes'].every(key => job[key] === undefined || nonnegative(job[key])));
  check(output.spillPaths === undefined || array(output.spillPaths).every(value => typeof value === 'string'));
  return safeObject(job) as unknown as DshJobView;
}
function parseJobEvent(event: DshJsonObject, sessionId: string): DshJsonObject {
  if (event.type === 'output') check(event.owner === sessionId && typeof event.id === 'string' && nonnegative(event.total));
  else {
    check(['registered', 'progress', 'stopping', 'removed', 'settled'].includes(String(event.type)));
    parseJob(event.job, sessionId);
  }
  return safeObject(event);
}
function parseChunks(value: unknown): DshJobChunk[] {
  return array(value).map(item => {
    const chunk = record(item); check(chunk && nonnegative(chunk.at) && typeof chunk.text === 'string');
    check(chunk.channel === undefined || ['stdout', 'stderr', 'log'].includes(String(chunk.channel)));
    check(chunk.gapBefore === undefined || chunk.gapBefore === true);
    return safeObject(chunk) as unknown as DshJobChunk;
  });
}
function parseTerminalStatus(value: unknown): DshTerminalStatus {
  const status = record(value); check(status);
  check(status.kind === 'running' || status.kind === 'exited' && (status.exitCode === null || typeof status.exitCode === 'number') && (status.signal === null || typeof status.signal === 'string'));
  return safeObject(status) as unknown as DshTerminalStatus;
}
function parseTerminal(value: unknown): DshTerminalSnapshot {
  const terminal = record(value); check(terminal && typeof terminal.sessionId === 'string' && typeof terminal.type === 'string');
  check((terminal.name === undefined || typeof terminal.name === 'string') && (terminal.pid === undefined || nonnegative(terminal.pid)));
  return { ...safeObject(terminal), sessionId: terminal.sessionId, type: terminal.type, status: parseTerminalStatus(terminal.status) } as DshTerminalSnapshot;
}
function parseChild(value: unknown, id?: string): DshSubagentView {
  const child = record(value); check(child && typeof child.id === 'string' && (id === undefined || child.id === id) && nonnegative(child.createdAt));
  check(['one-shot', 'continuable', 'external', 'unknown'].includes(String(child.mode)));
  check(['label', 'status'].every(key => child[key] === undefined || typeof child[key] === 'string'));
  check(child.activity === undefined || ['active', 'inactive', 'unknown'].includes(String(child.activity)));
  check(child.readable === undefined || typeof child.readable === 'boolean');
  return safeObject(child) as unknown as DshSubagentView;
}
