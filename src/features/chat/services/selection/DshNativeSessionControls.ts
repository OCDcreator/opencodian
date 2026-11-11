/** Non-rendering DSH native session state. Existing shared controls render it; nothing here creates DOM. */
import { Notice } from 'obsidian';

import type { AgentConnectionStatus, Disposable } from '../../../../core/agents/backend/AgentService';
import type {
  DshNativeControlCapabilities, DshNativeControls, DshNativeControlUpdate, DshNativeSessionControlUpdate,
  DshPermissionPresetState, DshPlanState, DshSubagentView, DshTerminalReadback, DshTerminalSignal, DshTerminalSnapshot,
} from '../../../../core/agents/backend/dsh/DshNativeControls';
import type { ChatMessage } from '../../../../core/types';
import { t } from '../../../../i18n';
import { sanitizeDiagnosticReport } from '../../../../shared/diagnosticSecretSanitizer';
import type { SessionWorkbenchState, WorkbenchTask, WorkbenchTaskAction } from '../../ui/SessionWorkbench';
import type { PermissionModeConfig } from './PermissionModeSelectorCoordinator';

export type DshChatControlService = Pick<DshNativeControls, 'getSessionPermissionPreset' | 'setSessionPermissionPreset'> & {
  getNativeControlCapabilities(): DshNativeControlCapabilities;
  refreshNativeControlCapabilities?(): Promise<DshNativeControlCapabilities>;
  subscribeToNativeControlUpdates(handler: (update: DshNativeControlUpdate) => void): Disposable;
  onStatusChange?(handler: (status: AgentConnectionStatus) => void): Disposable;
};

export interface DshNativeSessionControlsHost {
  getSessionId(): string | null;
  getService(): DshChatControlService | null;
  isAcp(): boolean;
  isStreaming(): boolean;
  /** Repaints the existing generic permission selector after native readback changes. */
  onChange(): void;
}

const CHECKING = 'dsh-checking';
const UNAVAILABLE = 'dsh-unavailable';
/** Opaque native values become class-safe selector ids (the selector also renders them as `mode-*` classes). */
const encodeValue = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, (char) => `_${char.charCodeAt(0).toString(16)}`);

/**
 * Session permission preset behind the generic composer permission selector. Owns readback, owner fences and
 * set→read confirmation. Plan is not a permission option, `custom` is display-only and no default is written.
 */
export class DshNativeSessionControls {
  readonly config: PermissionModeConfig = { backendLabel: 'dsh', options: [], displayMap: {}, modeCssClasses: [] };
  /** Mode classes of the current and previous owner generation, so the trigger can drop the last applied one. */
  private previousModes: string[] = [];
  private modes = new Set<string>();
  private service: DshChatControlService | null = null;
  private sessionId: string | null = null;
  private subscription: Disposable | null = null;
  private connectionSubscription: Disposable | null = null;
  private presets: DshPermissionPresetState | null = null;
  private failed = false;
  private busy = false;
  private operation = false;
  private loading = false;
  private generation = 0;
  private readSequence = 0;
  private presetSequence = 0;

  constructor(private readonly host: DshNativeSessionControlsHost) {}

  getPermissionMode(): string {
    if (this.host.isAcp() || !this.service) return UNAVAILABLE;
    if (!this.sessionId) return CHECKING;
    if (this.presets) return this.optionId(this.presets.current);
    return this.loading ? CHECKING : UNAVAILABLE;
  }

  /** Trigger title: scope of the change or the honest reason it cannot be read. */
  hint(): string {
    if (this.host.isAcp()) return t('chat.dsh.controls.acpUnavailable');
    if (!this.sessionId) return t('chat.dsh.controls.startSession');
    if (this.failed) return t('chat.dsh.controls.failed');
    if (this.loading || this.operation) return t('chat.dsh.controls.checking');
    if (this.busy || this.host.isStreaming()) return t('chat.dsh.controls.busy');
    if (!this.presets) return t('chat.dsh.controls.unavailable');
    const fallback = this.presets.catalog.options.find((option) => option.value === this.presets!.defaultPreset)?.name;
    return t('chat.dsh.controls.sessionPreset', { preset: fallback ?? this.presets.defaultPreset });
  }

  update(): void {
    const service = this.host.getService();
    const sessionId = this.host.getSessionId();
    if (service !== this.service || sessionId !== this.sessionId) {
      this.reset();
      this.service = service; this.sessionId = sessionId;
      this.subscription = service?.subscribeToNativeControlUpdates((update) => this.accept(service, update)) ?? null;
      this.connectionSubscription = service?.onStatusChange?.((status) => {
        if (status === 'connected' && this.service === service && this.host.getService() === service) void this.refresh();
      }) ?? null;
      void this.refresh();
    }
    this.sync();
  }

  async refresh(): Promise<void> {
    const service = this.service; const sessionId = this.sessionId;
    if (!service || !sessionId || this.host.isAcp() || this.loading) { this.sync(); return; }
    const generation = this.generation; const request = ++this.readSequence; const revision = this.presetSequence;
    const current = () => this.isCurrent(service, sessionId, generation) && request === this.readSequence;
    this.loading = true; this.sync();
    try {
      // Capability discovery completes before any session read; a late answer cannot read an old session.
      await service.refreshNativeControlCapabilities?.();
      if (!current()) return;
      const capabilities = service.getNativeControlCapabilities();
      const presets = capabilities.native && capabilities.controls.permissionPresets.get
        ? await service.getSessionPermissionPreset(sessionId) : null;
      if (!current() || revision !== this.presetSequence) return;
      this.presets = presets; this.failed = false;
    } catch {
      if (current()) { this.presets = null; this.failed = true; }
    } finally {
      if (current()) { this.loading = false; this.sync(); }
    }
  }

  /** Generic selector switch: refused while busy; success only after an independent session read confirms it. */
  async switchPermissionMode(id: string): Promise<boolean> {
    const service = this.service; const sessionId = this.sessionId; const generation = this.generation;
    // Ids carry the owner generation: a choice from a dropdown built for another session or connection never matches.
    const option = this.presets?.catalog.options.find((candidate) => candidate.value !== 'custom' && this.optionId(candidate.value) === id);
    if (!service || !sessionId || !option || this.operation || this.loading || this.host.isAcp()) return false;
    if (option.value === this.presets?.current) return true;
    if (this.busy || this.host.isStreaming()) { new Notice(t('chat.dsh.controls.busy')); return false; }
    const capabilities = service.getNativeControlCapabilities().controls.permissionPresets;
    if (!capabilities.set) { new Notice(t('chat.dsh.controls.unavailable')); return false; }
    const revision = this.presetSequence;
    this.operation = true; this.failed = false; this.sync();
    try {
      const echoed = await service.setSessionPermissionPreset(sessionId, option.value);
      // The confirmation read belongs to the same owner; a replaced session is never read again.
      if (!this.isCurrent(service, sessionId, generation)) return false;
      const confirmed = capabilities.get ? await service.getSessionPermissionPreset(sessionId) : echoed;
      if (!this.isCurrent(service, sessionId, generation)) return false;
      if (revision === this.presetSequence) { ++this.presetSequence; this.presets = confirmed; }
      this.failed = this.presets?.current !== option.value;
    } catch {
      if (!this.isCurrent(service, sessionId, generation)) return false;
      this.failed = true;
    } finally {
      if (this.isCurrent(service, sessionId, generation)) { this.operation = false; this.sync(); }
    }
    if (this.failed) new Notice(t('chat.dsh.controls.failed'));
    return !this.failed;
  }

  destroy(): void {
    this.reset();
    this.service = null; this.sessionId = null;
  }

  private accept(service: DshChatControlService, update: DshNativeControlUpdate): void {
    if (this.service !== service || this.host.getService() !== service) return;
    if (this.sessionId !== this.host.getSessionId()) { this.update(); return; }
    if (update.kind === 'invalidated') {
      ++this.generation; ++this.readSequence;
      this.previousModes = [...this.modes]; this.modes = new Set();
      this.presets = null; this.loading = false; this.operation = false; this.sync();
    } else if (update.kind === 'configuration') void this.refresh();
    else if (update.kind === 'busy' && update.sessionId === this.sessionId) {
      this.busy = update.busy;
      if (!update.busy) void this.refresh();
      this.sync();
    } else if (update.kind === 'session' && update.sessionId === this.sessionId && update.update.sessionUpdate === 'permission_presets_update') {
      ++this.presetSequence; this.presets = update.update; this.failed = false; this.sync();
    }
  }

  private isCurrent(service: DshChatControlService, sessionId: string, generation: number): boolean {
    return this.generation === generation && this.service === service && this.host.getService() === service
      && this.sessionId === sessionId && this.host.getSessionId() === sessionId;
  }

  private optionId(value: string): string { return `preset-${this.generation}-${encodeValue(value)}`; }

  private reset(): void {
    ++this.generation; ++this.readSequence;
    this.previousModes = [...this.modes]; this.modes = new Set();
    this.subscription?.dispose(); this.subscription = null;
    this.connectionSubscription?.dispose(); this.connectionSubscription = null;
    this.presets = null; this.failed = false; this.busy = false; this.operation = false; this.loading = false;
  }

  /** Publishes the live catalog into the selector config the generic selector reads when it repaints. */
  private sync(): void {
    const catalog = this.presets?.catalog.options ?? [];
    const displayMap: Record<string, string> = {
      [CHECKING]: t('chat.dsh.controls.permissions'), [UNAVAILABLE]: t('chat.dsh.controls.unavailable'),
    };
    if (this.presets) displayMap[this.optionId(this.presets.current)] = this.presets.current;
    for (const option of catalog) { displayMap[this.optionId(option.value)] = option.name; this.modes.add(this.optionId(option.value)); }
    if (this.presets) this.modes.add(this.optionId(this.presets.current));
    this.config.options = catalog.filter((option) => option.value !== 'custom')
      .map((option) => ({ id: this.optionId(option.value), label: option.name, description: option.description ?? '', icon: 'shield' }));
    this.config.displayMap = displayMap;
    this.config.modeCssClasses = [CHECKING, UNAVAILABLE, ...this.previousModes, ...this.modes].map((mode) => `mode-${mode}`);
    this.host.onChange();
  }
}

export type DshNativeWorkbenchService = Pick<DshNativeControls,
  'getSessionPlanState' | 'setSessionPlanState' | 'getSessionJob' | 'readSessionJobAt' | 'waitForSessionJob'
  | 'getSessionTerminalAvailability' | 'listSessionTerminals' | 'spawnSessionTerminal' | 'readSessionTerminal'
  | 'sendSessionTerminal' | 'signalSessionTerminal' | 'killSessionTerminal'
  | 'listSessionSubagents' | 'getSessionSubagent' | 'cancelSessionSubagent'> & {
    getNativeControlCapabilities(): DshNativeControlCapabilities;
    refreshNativeControlCapabilities?(): Promise<DshNativeControlCapabilities>;
    readChildSessionMessages?(parentSessionId: string, childSessionId: string): Promise<ChatMessage[]>;
  };

export function isDshNativeWorkbenchService(service: unknown): service is DshNativeWorkbenchService {
  const candidate = service as Partial<DshNativeWorkbenchService> | null | undefined;
  return typeof candidate?.getNativeControlCapabilities === 'function' && typeof candidate.getSessionPlanState === 'function'
    && typeof candidate.listSessionTerminals === 'function' && typeof candidate.listSessionSubagents === 'function';
}

/** The owner a native read or row operation is captured under. */
export interface DshNativeOwner {
  key: string;
  sessionId: string;
  service: DshNativeWorkbenchService;
  /** Captured adapter generation and conversation/tab owner. */
  lease: () => boolean;
}

interface WorkbenchEntry {
  key: string;
  backend: string;
  sessionId: string;
  service: DshNativeWorkbenchService;
  /** Captured adapter generation and conversation/tab owner. */
  lease: () => boolean;
  native: boolean;
  reading: boolean;
  plan: DshPlanState | null;
  planRevision: number;
  planBusy: boolean;
  planFailed: boolean;
  availability: { available: boolean; backends: string[] } | null;
  terminals: DshTerminalSnapshot[];
  children: DshSubagentView[];
  rows: WorkbenchTask[] | null;
  jobOffsets: Map<string, number>;
  terminalOffsets: Map<string, number>;
}

const SIGNALS: readonly DshTerminalSignal[] = ['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGTSTP', 'SIGHUP'];
const FINISHED = ['completed', 'failed', 'cancelled', 'killed'];
const TERMINAL_LINES = 200;

function action(id: string, label: string, icon: string, enabled: boolean): WorkbenchTaskAction {
  return { id, label, icon, ...(enabled ? {} : { disabled: true, reason: t('workbench.tool.unavailable') }) };
}

function outputText(text: string, truncated: boolean): string {
  return [text || t('chat.dsh.workbench.noOutput'), truncated ? t('chat.dsh.workbench.truncated') : ''].filter(Boolean).join('\n');
}

function terminalText(read: DshTerminalReadback): string {
  return `${outputText(read.text, read.truncated)}\n${t('chat.dsh.workbench.lines', {
    begin: String(read.lineBegin), end: String(read.lineEnd), total: String(read.totalLines) })}`;
}

function safeText(text: string): string {
  const bounded = sanitizeDiagnosticReport(text, { urlPolicy: 'strict' });
  return bounded.length > 65_536 ? `${bounded.slice(0, 65_536)}\n${t('chat.dsh.workbench.truncated')}` : bounded;
}

/**
 * DSH native session state for the shared workbench: Plan, terminals, children and job operations projected as
 * generic rows. Every operation runs under the owner (adapter, session, lease) captured when its row was projected.
 */
export class DshNativeWorkbenchControls {
  private readonly entries = new Map<string, WorkbenchEntry>();
  private readonly owners = new WeakMap<WorkbenchTask, WorkbenchEntry>();
  /** Admitted row+operation keys; the render layer also disables its buttons per row. */
  private readonly operations = new Set<string>();
  private disposed = false;

  constructor(private readonly host: { onChange(): void; notify(message: string): void }) {}

  async refresh(owner: DshNativeOwner): Promise<void> {
    const entry = this.entry(owner);
    const { service, sessionId } = entry;
    if (entry.reading) return;
    entry.reading = true;
    const planRevision = entry.planRevision;
    try {
      await service.refreshNativeControlCapabilities?.();
      if (!this.current(entry)) return;
      const capabilities = service.getNativeControlCapabilities();
      entry.native = capabilities.native;
      const controls = capabilities.controls;
      if (!entry.native) return;
      const [plan, availability, terminals, children] = await Promise.allSettled([
        controls.plan.get ? service.getSessionPlanState(sessionId) : Promise.resolve(null),
        controls.terminal.availability ? service.getSessionTerminalAvailability(sessionId) : Promise.resolve(null),
        controls.terminal.list ? service.listSessionTerminals(sessionId) : Promise.resolve([]),
        controls.subagents.list ? service.listSessionSubagents(sessionId) : Promise.resolve([]),
      ]);
      if (!this.current(entry)) return;
      if (plan.status === 'fulfilled' && planRevision === entry.planRevision) entry.plan = plan.value;
      if (availability.status === 'fulfilled') entry.availability = availability.value;
      // A failed list keeps the last evidence; it never implies that a terminal or child ended.
      if (terminals.status === 'fulfilled') entry.terminals = terminals.value;
      if (children.status === 'fulfilled') entry.children = children.value;
      entry.rows = null;
    } catch { /* Capability discovery failed: keep the last evidence until the next read. */ } finally {
      entry.reading = false;
      if (this.current(entry)) this.host.onChange();
    }
  }

  /** A pushed Plan event supersedes older reads and mutation acknowledgements. */
  accept(key: string, update: DshNativeSessionControlUpdate): void {
    const entry = this.entries.get(key);
    if (!entry || !this.current(entry) || update.sessionUpdate !== 'plan_update') return;
    ++entry.planRevision; entry.planFailed = false;
    entry.plan = { active: update.active, ...(update.pending === undefined ? {} : { pending: update.pending }),
      ...(update.disposition ? { disposition: update.disposition } : {}) };
    this.host.onChange();
  }

  invalidate(backend: string): void {
    for (const key of [...this.entries.keys()]) if (key.startsWith(`${backend}:`)) this.entries.delete(key);
  }

  project(key: string): Pick<SessionWorkbenchState, 'nativePlan' | 'nativeTerminals'> {
    const entry = this.entries.get(key);
    if (!entry?.native || !this.current(entry)) return {};
    const controls = entry.service.getNativeControlCapabilities().controls;
    const plan = entry.plan;
    const notes = [t('chat.dsh.controls.planScope'),
      ...(plan?.pending === undefined ? [] : [t(plan.pending ? 'chat.dsh.controls.planQueuedOn' : 'chat.dsh.controls.planQueuedOff')]),
      ...(plan?.disposition === 'cancelled' ? [t('chat.dsh.controls.planCancelled')] : []),
      ...(entry.planFailed ? [t('chat.dsh.controls.failed')] : []),
      ...(controls.plan.set ? [] : [t('workbench.tool.unavailable')])];
    const spawn = controls.terminal.spawn && entry.availability?.available === true && entry.availability.backends.length > 0;
    return {
      ...(plan ? { nativePlan: { active: plan.active, ...(plan.pending === undefined ? {} : { pending: plan.pending }),
        settable: controls.plan.set, busy: entry.planBusy, notes } } : {}),
      nativeTerminals: { backends: entry.availability?.backends ?? [], spawn,
        ...(spawn ? {} : { reason: t('chat.dsh.workbench.noTerminalBackend') }) },
    };
  }

  /** Terminal and child rows; the same row objects are returned until the next native read changes them. */
  tasks(key: string): WorkbenchTask[] {
    const entry = this.entries.get(key);
    if (!entry?.native || !this.current(entry)) return [];
    if (!entry.rows) {
      const controls = entry.service.getNativeControlCapabilities().controls;
      const base = { nativeBackend: entry.backend, nativeSessionId: entry.sessionId };
      entry.rows = [
        ...entry.terminals.map((terminal): WorkbenchTask => {
          const running = terminal.status.kind === 'running';
          const status = terminal.status.kind === 'running' ? 'running'
            : ['exited', terminal.status.exitCode ?? terminal.status.signal].filter((part) => part !== null).join(' ');
          return { ...base, id: `terminal:${terminal.sessionId}`, nativeTerminalId: terminal.sessionId,
            title: `${terminal.name ?? terminal.sessionId} · ${terminal.type}`, status, canStop: running && controls.terminal.kill,
            ...(running && controls.terminal.send ? { input: { label: t('chat.dsh.workbench.terminalInput'), secret: true } } : {}),
            actions: [action('earlier', t('chat.dsh.workbench.earlierOutput'), 'history', controls.terminal.read), ...(running ? [
              { ...action('sendLine', t('chat.dsh.workbench.sendLine'), 'corner-down-left', controls.terminal.send), usesInput: true },
              { ...action('send', t('chat.dsh.workbench.sendInput'), 'send', controls.terminal.send), usesInput: true },
              { ...action('signal', t('chat.dsh.workbench.signalMenu'), 'zap', controls.terminal.signal),
                choices: SIGNALS.map((signal) => ({ id: signal, label: t('chat.dsh.workbench.signal', { signal }) })) },
            ] : [])] };
        }),
        ...entry.children.map((child): WorkbenchTask => ({ ...base, id: `child:${child.id}`, nativeChildId: child.id,
          title: child.label ?? child.id, status: child.status ?? t('chat.dsh.workbench.unknown'),
          canStop: controls.subagents.cancel && !FINISHED.includes(child.status ?? ''),
          actions: [action('details', t('chat.dsh.workbench.details'), 'info', controls.subagents.get)] })),
      ];
      for (const row of entry.rows) this.owners.set(row, entry);
    }
    return entry.rows;
  }

  /** Adds native job operations to a projected job row under the same captured owner. */
  jobTask(owner: DshNativeOwner, task: WorkbenchTask): WorkbenchTask {
    const entry = this.entry(owner);
    const jobs = entry.service.getNativeControlCapabilities().controls.jobs;
    const row: WorkbenchTask = { ...task, actions: [action('details', t('chat.dsh.workbench.details'), 'info', jobs.get),
      action('wait', t('chat.dsh.workbench.wait'), 'clock', jobs.wait), action('readAt', t('chat.dsh.workbench.readAt'), 'text-cursor-input', jobs.readAt)] };
    this.owners.set(row, entry);
    return row;
  }

  async runTaskAction(task: WorkbenchTask, id: string, value?: string): Promise<string> {
    const entry = this.ownerOf(task);
    // Send-class operations share one lock per terminal: an unresolved sendLine
    // blocks send (and vice versa), so two native sends can never interleave.
    const sendClass = task.nativeTerminalId && ['send', 'sendLine'].includes(id) ? `send:${task.nativeTerminalId}` : null;
    const key = sendClass ?? `${task.id}:${id}`;
    if (this.operations.has(key)) throw new Error(t('workbench.tool.unavailable'));
    this.operations.add(key);
    let text: string | null = null;
    try {
      if (task.nativeJobId) text = await this.jobAction(entry, task.nativeJobId, id);
      else if (task.nativeTerminalId) text = await this.terminalAction(entry, task.nativeTerminalId, id, value);
      else if (task.nativeChildId && id === 'details' && entry.service.getNativeControlCapabilities().controls.subagents.get) {
        const child = await entry.service.getSessionSubagent(entry.sessionId, task.nativeChildId);
        text = [child.label ?? child.id, child.mode, child.status ?? t('chat.dsh.workbench.unknown')].join('\n');
      }
    } finally { this.operations.delete(key); }
    if (text === null || !this.current(entry)) throw new Error(t('workbench.tool.unavailable'));
    return safeText(text);
  }

  /** Expanding a row reads the newest terminal lines, or the child's own history (the workbench never owns its runtime). */
  async readOutput(task: WorkbenchTask): Promise<string> {
    const entry = this.ownerOf(task);
    const { service, sessionId } = entry;
    if (task.nativeTerminalId) {
      if (!service.getNativeControlCapabilities().controls.terminal.read) return t('workbench.tasks.noOutput');
      const read = await service.readSessionTerminal(sessionId, task.nativeTerminalId, { offset: 0, count: TERMINAL_LINES });
      if (!this.current(entry)) return '';
      entry.terminalOffsets.set(task.nativeTerminalId, 0);
      return safeText(terminalText(read));
    }
    const child = entry.children.find((candidate) => candidate.id === task.nativeChildId);
    if (!child || child.readable === false || !service.readChildSessionMessages) return t('workbench.tasks.noOutput');
    const messages = await service.readChildSessionMessages(sessionId, child.id);
    if (!this.current(entry)) return '';
    return safeText(messages.map((message) => [message.content, ...(message.toolCalls ?? []).map((tool) => tool.result ?? '')]
      .filter(Boolean).join('\n')).filter(Boolean).join('\n\n') || t('chat.dsh.workbench.noOutput'));
  }

  /** Stop closes a running terminal or requests child cancellation; an accepted cancel is not a final status. */
  async stop(task: WorkbenchTask): Promise<void> {
    const entry = this.ownerOf(task);
    const { service, sessionId } = entry;
    const controls = service.getNativeControlCapabilities().controls;
    const terminal = entry.terminals.find((candidate) => candidate.sessionId === task.nativeTerminalId);
    if (terminal) {
      if (!controls.terminal.kill || terminal.status.kind !== 'running') throw new Error(t('workbench.tool.unavailable'));
      const result = await service.killSessionTerminal(sessionId, terminal.sessionId);
      if (this.current(entry)) this.host.notify(t(result.closed ? 'chat.dsh.workbench.terminalClosed' : 'chat.dsh.workbench.notConfirmed'));
      return;
    }
    const child = entry.children.find((candidate) => candidate.id === task.nativeChildId);
    if (!child || !controls.subagents.cancel || FINISHED.includes(child.status ?? '')) throw new Error(t('workbench.tool.unavailable'));
    const result = await service.cancelSessionSubagent(sessionId, child.id);
    if (this.current(entry)) this.host.notify(t('chat.dsh.workbench.cancelAccepted', { status: result.child.status ?? t('chat.dsh.workbench.unknown') }));
  }

  /** Plan set→read confirmation. A queued change stays pending; it is never shown as the active state. */
  async setPlanMode(key: string, requested: boolean): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || !this.current(entry) || entry.planBusy) return;
    const { service, sessionId } = entry;
    const controls = service.getNativeControlCapabilities().controls.plan;
    if (!controls.set) throw new Error(t('workbench.tool.unavailable'));
    const revision = entry.planRevision;
    entry.planBusy = true; entry.planFailed = false; this.host.onChange();
    try {
      const echoed = await service.setSessionPlanState(sessionId, requested);
      if (!this.current(entry)) return;
      const confirmed = controls.get ? await service.getSessionPlanState(sessionId) : echoed;
      if (!this.current(entry)) return;
      if (revision === entry.planRevision) { ++entry.planRevision; entry.plan = confirmed; }
      const plan = entry.plan;
      entry.planFailed = !plan || plan.active !== requested && plan.pending !== requested && echoed.disposition !== 'cancelled';
    } catch {
      if (this.current(entry)) entry.planFailed = true;
    } finally {
      if (this.current(entry)) { entry.planBusy = false; this.host.onChange(); }
    }
  }

  async spawnTerminal(key: string, options: { type: string; name?: string; cwd?: string }): Promise<string> {
    const entry = this.entries.get(key);
    if (!entry || !this.current(entry) || !entry.service.getNativeControlCapabilities().controls.terminal.spawn
      || !entry.availability?.backends.includes(options.type)) throw new Error(t('workbench.tool.unavailable'));
    const result = await entry.service.spawnSessionTerminal(entry.sessionId, options);
    if (!this.current(entry)) throw new Error(t('workbench.tool.unavailable'));
    return safeText(`${result.name ?? result.sessionId} · ${result.status.kind}`);
  }

  destroy(): void { this.disposed = true; this.entries.clear(); }

  private entry({ key, sessionId, service, lease }: DshNativeOwner): WorkbenchEntry {
    const existing = this.entries.get(key);
    if (existing && existing.service === service && existing.sessionId === sessionId && existing.lease()) return existing;
    const created: WorkbenchEntry = { key, backend: key.slice(0, key.indexOf(':')), sessionId, service, lease, native: false,
      reading: false, plan: null, planRevision: 0, planBusy: false, planFailed: false, availability: null, terminals: [],
      children: [], rows: null, jobOffsets: new Map(), terminalOffsets: new Map() };
    this.entries.set(key, created);
    return created;
  }

  private current(entry: WorkbenchEntry): boolean { return !this.disposed && this.entries.get(entry.key) === entry && entry.lease(); }

  private ownerOf(task: WorkbenchTask): WorkbenchEntry {
    const entry = this.owners.get(task);
    if (!entry || !this.current(entry) || task.nativeSessionId !== entry.sessionId) throw new Error(t('workbench.tool.unavailable'));
    return entry;
  }

  private async jobAction(entry: WorkbenchEntry, jobId: string, id: string): Promise<string | null> {
    const { service, sessionId } = entry;
    const jobs = service.getNativeControlCapabilities().controls.jobs;
    if (id === 'details' && jobs.get) {
      const job = await service.getSessionJob(sessionId, jobId);
      return [job.label, job.kind, job.status, job.progress, job.detail].filter(Boolean).join('\n');
    }
    if (id === 'wait' && jobs.wait) {
      const job = await service.waitForSessionJob(sessionId, jobId, { timeoutMs: 1000 });
      return `${job.label} · ${job.status}`;
    }
    if (id !== 'readAt' || !jobs.readAt) return null;
    // Byte-offset paging: each read continues from the previous `next` offset of this job.
    const read = await service.readSessionJobAt(sessionId, jobId, { from: entry.jobOffsets.get(jobId) ?? 0 });
    if (this.current(entry)) entry.jobOffsets.set(jobId, read.next);
    return `${outputText(read.chunks.map((chunk) => chunk.text).join(''), read.lossy)}\n${t('chat.dsh.workbench.nextOffset', { offset: String(read.next) })}`;
  }

  private async terminalAction(entry: WorkbenchEntry, terminalId: string, id: string, value?: string): Promise<string | null> {
    const { service, sessionId } = entry;
    const controls = service.getNativeControlCapabilities().controls.terminal;
    if (id === 'earlier' && controls.read) {
      const offset = (entry.terminalOffsets.get(terminalId) ?? 0) + TERMINAL_LINES;
      const read = await service.readSessionTerminal(sessionId, terminalId, { offset, count: TERMINAL_LINES });
      if (this.current(entry)) entry.terminalOffsets.set(terminalId, offset);
      return terminalText(read);
    }
    const running = entry.terminals.some((terminal) => terminal.sessionId === terminalId && terminal.status.kind === 'running');
    if ((id === 'sendLine' || id === 'send') && controls.send && running) {
      if (id === 'send' && !value) return t('chat.dsh.workbench.noOutput');
      const read = await service.sendSessionTerminal(sessionId, terminalId, { text: value ?? '', submit: id === 'sendLine' });
      return `${outputText(read.viewport, read.truncated)}\n${read.waitReason} · ${read.sessionStatus.kind}`;
    }
    const signal = SIGNALS.find((candidate) => candidate === value);
    if (id !== 'signal' || !controls.signal || !running || !signal) return null;
    await service.signalSessionTerminal(sessionId, terminalId, signal);
    return t('chat.dsh.workbench.signalSent', { signal });
  }
}
