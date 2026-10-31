/** Session-scoped Goal control, composer intent and continuous transcript reconciliation. */
import { type App, setIcon } from 'obsidian';

import type { AgentGoalCapability, AgentService, Disposable } from '../../../../core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../core/agents/backend/AgentServiceRegistry';
import type { AgentGoalCommand, AgentGoalEvent, AgentGoalReadback } from '../../../../core/agents/backend/BackendGoalRuntime';
import { getConversationBackendSessionId } from '../../../../core/types';
import type { AgentBackendKind } from '../../../../core/types/chat';
import { t } from '../../../../i18n';
import { GOAL_ACTIVE_ICON, GOAL_ICON, SessionWorkbench, type SessionWorkbenchState, type WorkbenchResource, type WorkbenchTask } from '../../ui/SessionWorkbench';
import type { MessageSendPreparationOutcome } from '../send/MessageSendPreparationService';
import { SessionInformationCoordinator, type WorkbenchSession } from './SessionInformationCoordinator';
export type { WorkbenchSession } from './SessionInformationCoordinator';

export interface SessionWorkbenchHost {
  app?: App;
  getActiveSession(): WorkbenchSession;
  getSessions(): WorkbenchSession[];
  getRegistry(): AgentServiceRegistry | null | undefined;
  getGoalSlot(): HTMLElement | null;
  getSummaryMount(): HTMLElement | null;
  getComposerShell(): HTMLElement | null;
  attachFiles(parent: HTMLElement): void;
  mountTools(parent: HTMLElement): void;
  openTool?(tool: string): void;
  setDraft?(text: string): void;
  updateTools(state: SessionWorkbenchState): void;
  syncTranscript(session: WorkbenchSession): Promise<void>;
  focusComposer(): void;
  openMessage(id: string): void;
  openResource(resource: WorkbenchResource): void;
  notify(message: string): void;
}

interface PendingGoalSend {
  backend: AgentBackendKind;
  conversationId: string | null;
  objective: string;
  acknowledge?: (outcome: MessageSendPreparationOutcome) => void;
  submittedAt: number;
}

interface NativeTaskService extends AgentService {
  getBackgroundTasks?(sessionId: string): Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>>;
  cancelBackgroundTask?(sessionId: string, taskId: string): Promise<boolean>;
  getChatMessages?(sessionId: string): Promise<import('../../../../core/types').ChatMessage[]>;
}

function goalService(service: AgentService | null | undefined): AgentGoalCapability | null {
  const candidate = service as Partial<AgentGoalCapability> | null | undefined;
  return typeof candidate?.readSessionGoal === 'function' && typeof candidate.controlSessionGoal === 'function'
    && typeof candidate.getGoalCapabilities === 'function' && typeof candidate.subscribeToGoalEvents === 'function'
    ? candidate as AgentGoalCapability : null;
}

/** The coordinator projects backend state; it never runs a Goal continuation loop. */
export class SessionWorkbenchCoordinator {
  private surface: SessionWorkbench | null = null;
  private boundary: HTMLElement | null = null;
  private goalButton: HTMLButtonElement | null = null;
  private summary: HTMLElement | null = null;
  private subscriptions = new Map<AgentBackendKind, { service: AgentGoalCapability; dispose: Disposable }>();
  private readonly readbacks = new Map<string, AgentGoalReadback>();
  private readonly reads = new Map<string, Promise<void>>();
  private readonly lastReads = new Map<string, number>();
  private readonly aliases = new Map<string, string>();
  private readonly armed = new Map<string, { backend: AgentBackendKind; conversationId: string | null }>();
  private readonly pendingSends = new Map<string, PendingGoalSend>();
  private readonly operations = new Set<string>();
  private readonly errors = new Map<string, string>();
  private readonly syncing = new Set<string>();
  private readonly lastSyncs = new Map<string, number>();
  private readonly nativeTasks = new Map<string, WorkbenchTask[]>();
  private readonly taskReads = new Map<string, number>();
  private readonly informationCoordinator: SessionInformationCoordinator;
  private readonly availability = new Map<AgentBackendKind, { available: boolean; reason?: string }>();
  private readonly syncAgain = new Set<string>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private lastIdentity = '';
  private summaryFingerprint = '';
  private readonly dismissedSummaries = new Map<string, string>();

  constructor(private readonly host: SessionWorkbenchHost) {
    this.informationCoordinator = new SessionInformationCoordinator({
      getActiveSession: () => host.getActiveSession(), getSessions: () => host.getSessions(),
      getRegistry: () => host.getRegistry(), onChange: () => this.refresh(),
      openChildView: () => this.surface?.setPage('overview'),
    });
  }

  mount(boundary: HTMLElement): void {
    if (this.boundary === boundary && this.surface?.isMounted(boundary)) {
      this.host.attachFiles(this.surface.getFilesMount()); this.mountComposer(); this.refresh(); return;
    }
    this.surface?.destroy();
    this.boundary = boundary;
    this.surface = new SessionWorkbench(boundary, {
      app: this.host.app,
      armGoal: () => this.toggleGoalArm(true), controlGoal: (command) => this.controlGoal(command),
      refresh: () => {
        const session = this.host.getActiveSession();
        void this.refreshGoal(session, true); void this.refreshTasks(session, true);
        this.informationCoordinator.refresh(session, true);
      },
      openMessage: (id) => this.host.openMessage(id), openResource: (resource) => this.host.openResource(resource),
      stopTask: (task) => this.stopTask(task),
      readTaskOutput: (task) => this.readTaskOutput(task),
      mountTools: (parent) => this.host.mountTools(parent),
      openTool: (tool) => this.host.openTool?.(tool),
      usePlanAsGoal: (text) => { this.host.setDraft?.(text); if (!this.isArmed()) this.toggleGoalArm(true); },
      openChild: (agent) => this.informationCoordinator.openChild(agent),
      returnToParent: () => this.informationCoordinator.returnToParent(),
    });
    this.host.attachFiles(this.surface.getFilesMount());
    this.mountComposer();
    if (!this.interval) this.interval = setInterval(() => this.tick(), 1000);
    this.refresh();
  }

  isArmed(): boolean {
    const current = this.host.getActiveSession();
    const owner = this.armed.get(current.tabId);
    return Boolean(owner && owner.backend === current.backend
      && owner.conversationId === (current.conversation?.id ?? null));
  }

  /** Returns explicit creation intent, bound to the originating tab. */
  prepareGoalSend(objective: string, acknowledge?: (outcome: MessageSendPreparationOutcome) => void): string | undefined {
    if (!this.isArmed()) return undefined;
    const session = this.host.getActiveSession();
    const capabilities = goalService(this.host.getRegistry()?.get(session.backend))?.getGoalCapabilities();
    if (!capabilities || !objective.trim() || capabilities.objectiveLimit && objective.length > capabilities.objectiveLimit) {
      acknowledge?.('rejected');
      this.host.notify(capabilities?.objectiveLimit ? `${t('workbench.goal.condition')} ≤ ${capabilities.objectiveLimit}` : t('workbench.goal.unsupported'));
      throw new Error('Goal input could not be prepared');
    }
    this.pendingSends.set(session.tabId, { backend: session.backend, conversationId: session.conversation?.id ?? null, objective, acknowledge, submittedAt: Date.now() });
    this.refresh();
    return objective;
  }

  onSendPreparation(tabId: string, outcome: MessageSendPreparationOutcome): void {
    const pending = this.pendingSends.get(tabId);
    if (!pending) return;
    if (outcome === 'rejected') { pending.acknowledge?.('rejected'); this.pendingSends.delete(tabId); }
    else {
      const session = this.host.getSessions().find((candidate) => candidate.tabId === tabId);
      if (session) { pending.conversationId = session.conversation?.id ?? null; void this.refreshGoal(session, true); }
    }
  }

  async finishGoalSend(tabId: string): Promise<void> {
    const session = this.host.getSessions().find((candidate) => candidate.tabId === tabId);
    if (session) await this.refreshGoal(session, true);
    const pending = this.pendingSends.get(tabId);
    if (pending) {
      pending.acknowledge?.('rejected'); this.pendingSends.delete(tabId);
      this.errors.set(tabId, t('workbench.goal.pending'));
      this.refresh();
    }
  }

  refresh(): void {
    if (this.disposed) return;
    this.syncSubscriptions();
    const session = this.host.getActiveSession();
    const identity = `${session.backend}:${session.conversation?.id ?? session.tabId}`;
    if (identity !== this.lastIdentity) {
      this.lastIdentity = identity; this.summaryFingerprint = '';
      const owner = this.armed.get(session.tabId);
      if (owner && owner.conversationId !== (session.conversation?.id ?? null) && !this.pendingSends.has(session.tabId))
        this.armed.delete(session.tabId);
      void this.refreshGoal(session);
      void this.refreshTasks(session);
      this.informationCoordinator.refresh(session);
    }
    this.mountComposer();
    const state = this.buildState(session);
    this.surface?.setState(state);
    this.host.updateTools(state);
    this.renderComposer(state);
  }

  private buildState(session: WorkbenchSession): SessionWorkbenchState {
    const service = goalService(this.host.getRegistry()?.get(session.backend));
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) ?? null : null;
    const key = this.key(session.backend, sessionId);
    const goal: AgentGoalReadback = !service ? { status: 'unavailable', goal: null, reason: t('workbench.goal.unsupported') }
      : !sessionId && service.getGoalCapabilities().source === 'extension'
        ? this.availability.get(session.backend)?.available ? { status: 'ready', goal: null, observedAt: Date.now() }
          : { status: 'unavailable', goal: null, reason: this.availability.get(session.backend)?.reason ?? t('workbench.goal.extensionHelp') }
      : !sessionId ? { status: 'ready', goal: null, observedAt: Date.now() }
      : this.readbacks.get(key) ?? { status: 'unknown', goal: null };
    const tasks = this.sessionTasks(session);
    return { identity: `${session.backend}:${session.conversation?.id ?? session.tabId}`, title: session.conversation?.title ?? t('workbench.untitled'),
      backend: this.host.getRegistry()?.get(session.backend)?.displayName ?? session.backend, sessionId, goal,
      capabilities: service?.getGoalCapabilities() ?? null, armed: this.isArmed(),
      busy: this.operations.has(key) || this.pendingSends.has(session.tabId), error: this.errors.get(session.tabId),
      todos: session.todos, tasks, resources: session.resources,
      ...this.informationCoordinator.project(session),
    };
  }

  private sessionTasks(session: WorkbenchSession): WorkbenchTask[] {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const tasks = [...(this.nativeTasks.get(this.key(session.backend, sessionId)) ?? [])];
    for (const task of session.backgroundTasks) if (!tasks.some((existing) => existing.id === task.id)) tasks.push(task);
    for (const message of session.conversation?.messages ?? []) for (const tool of message.toolCalls ?? []) {
      if (!['task', 'background', 'spawn', 'workflow'].some((word) => tool.name.toLowerCase().includes(word))) continue;
      if (tasks.some((task) => task.id === tool.id)) continue;
      tasks.push({ id: tool.id, title: String(tool.input.description ?? tool.input.command ?? tool.name),
        status: tool.status ?? 'unknown', output: typeof tool.result === 'string' ? tool.result : undefined, messageId: message.id });
    }
    return tasks;
  }

  private toggleGoalArm(createAfterCompletion = false): void {
    const current = this.host.getActiveSession();
    const state = this.buildState(current);
    if (!this.isArmed() && state.goal.goal && (!createAfterCompletion || state.goal.goal.status !== 'complete')) { this.surface?.openGoal(); return; }
    if (!state.capabilities || state.goal.status === 'unavailable') { this.surface?.openGoal(); return; }
    if (state.busy || current.streaming) return;
    if (this.isArmed()) this.armed.delete(current.tabId);
    else this.armed.set(current.tabId, { backend: current.backend, conversationId: current.conversation?.id ?? null });
    this.errors.delete(current.tabId); this.refresh(); this.host.focusComposer();
  }

  private mountComposer(): void {
    const slot = this.host.getGoalSlot();
    if (slot && this.goalButton?.parentElement !== slot) {
      this.goalButton?.remove();
      this.goalButton = slot.createEl('button', { cls: 'opencodian-composer-goal-button', attr: { type: 'button', 'aria-label': t('workbench.goal.arm') } });
      const icon = this.goalButton.createSpan(); setIcon(icon, GOAL_ICON);
      this.goalButton.addEventListener('click', () => this.toggleGoalArm());
      this.goalButton.addEventListener('mousedown', (event) => {
        if (!this.buildState(this.host.getActiveSession()).goal.goal) event.preventDefault();
      });
      this.goalButton.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch' && !this.buildState(this.host.getActiveSession()).goal.goal) event.preventDefault();
      }, { capture: true });
      this.goalButton.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.isArmed()) { event.preventDefault(); this.toggleGoalArm(); }
      });
    }
    const mount = this.host.getSummaryMount();
    if (mount && this.summary?.parentElement !== mount) {
      this.summary?.remove();
      this.summary = document.createElement('div'); this.summary.className = 'opencodian-composer-goal-summary';
      this.summary.setAttribute('aria-live', 'polite');
      mount.insertBefore(this.summary, this.host.getComposerShell());
      this.summaryFingerprint = '';
    }
  }

  private renderGoalButton(state: SessionWorkbenchState): void {
    const goal = state.goal.goal;
    const engaged = state.armed || Boolean(goal && goal.status !== 'complete');
    this.goalButton?.setAttribute('aria-pressed', String(engaged));
    const label = goal ? t('workbench.goal.title') : state.armed ? t('workbench.goal.cancelArm') : t('workbench.goal.arm');
    this.goalButton?.setAttribute('aria-label', label); this.goalButton?.setAttribute('title', label);
    this.goalButton?.toggleClass('has-goal', Boolean(goal));
    if (this.goalButton) {
      this.goalButton.dataset.goalStatus = goal?.status ?? (state.armed ? 'active' : 'none');
      // OpenChamber sessionGoalPresentation at d4a5a0ef: active info, paused
      // muted, blocked/limited warning, complete success. Hover is not a state.
      const tones = { active: 'info', paused: 'muted', blocked: 'warning', limited: 'warning',
        complete: 'success', waiting: 'warning', unknown: 'muted' } as const;
      const executionStopped = goal?.status === 'active' && (goal.execution === 'stopped' || goal.armed === false);
      this.goalButton.dataset.goalTone = goal ? executionStopped ? 'muted' : tones[goal.status] : state.armed ? 'info' : 'muted';
      const icon = this.goalButton.firstElementChild as HTMLElement | null;
      const name = state.armed || goal ? GOAL_ACTIVE_ICON : GOAL_ICON;
      if (icon && icon.dataset.goalIcon !== name) { setIcon(icon, name); icon.dataset.goalIcon = name; }
    }
    this.updateSendLabel(state.armed);
  }

  private getSummaryDismissal(state: SessionWorkbenchState): string | undefined {
    const storageKey = `opencodian.completedGoalSummary:${state.identity}`;
    let dismissed = this.dismissedSummaries.get(storageKey);
    if (!dismissed) {
      try {
        const saved: unknown = this.host.app?.loadLocalStorage?.(storageKey);
        if (typeof saved === 'string') dismissed = saved;
      } catch { /* A local preference must not interrupt native Goal controls. */ }
    }
    if (state.goal.status === 'ready' && state.goal.goal?.status !== 'complete' && dismissed) {
      this.dismissedSummaries.delete(storageKey); dismissed = undefined;
      try { this.host.app?.saveLocalStorage?.(storageKey, null); } catch { /* Keep the active Goal visible. */ }
    }
    return dismissed;
  }

  private goalSummarySignature(state: SessionWorkbenchState): string {
    const goal = state.goal.goal;
    return goal ? JSON.stringify([state.sessionId, goal.id, goal.objective, goal.id ? null : goal.revision]) : '';
  }

  private renderComposer(state: SessionWorkbenchState): void {
    this.renderGoalButton(state);
    const goal = state.goal.goal;
    const dismissed = this.getSummaryDismissal(state);
    const signature = this.goalSummarySignature(state);
    const hidden = !state.armed && !state.busy && (!goal || goal.status === 'complete' && dismissed === signature);
    const text = state.busy ? t('workbench.goal.pending') : state.armed ? t('workbench.goal.armedHelp') : goal?.objective ?? '';
    const fingerprint = JSON.stringify([state.identity, text, goal?.status, goal?.execution, goal?.armed, state.goal.status, state.error, hidden, state.capabilities]);
    if (!this.summary || fingerprint === this.summaryFingerprint) return;
    this.summaryFingerprint = fingerprint; this.summary.empty();
    this.summary.hidden = hidden;
    if (this.summary.hidden) return;
    const button = this.summary.createEl('button', { cls: 'opencodian-composer-goal-description', attr: { type: 'button', title: text } });
    const icon = button.createSpan(); setIcon(icon, GOAL_ICON); button.createSpan({ text });
    button.addEventListener('click', () => this.surface?.openGoal());
    this.renderSummaryActions(state);
  }

  private renderSummaryActions(state: SessionWorkbenchState): void {
    if (!this.summary) return;
    const goal = state.goal.goal;
    if (goal) {
      this.summary.createSpan({ cls: 'opencodian-composer-goal-state', text: goal.execution === 'stopped' ? t('workbench.goal.executionStopped') : t(`workbench.goal.status.${goal.status}`) });
      const paused = goal.status !== 'active' || goal.execution === 'stopped' || goal.armed === false;
      const action = paused ? 'resume' : 'pause';
      if (goal.status !== 'complete' && goal.status !== 'unknown' && state.capabilities?.actions.includes(action)) {
        const control = this.summary.createEl('button', { cls: 'opencodian-workbench-button', text: t(state.capabilities.pauseMode === 'execution'
          ? paused ? 'workbench.goal.continue' : 'workbench.goal.stop' : paused ? 'workbench.goal.resume' : 'workbench.goal.pause'), attr: { type: 'button' } });
        control.disabled = state.busy || state.goal.status !== 'ready';
        control.addEventListener('click', () => { void this.controlGoal({ action }); });
      }
      if (goal.status === 'complete' && state.goal.status === 'ready' && !state.armed) {
        const close = this.summary.createEl('button', { cls: 'opencodian-workbench-button opencodian-goal-dismiss', attr: {
          type: 'button', 'aria-label': t('workbench.goal.dismissCompleted'), title: t('workbench.goal.dismissCompletedHelp'),
        } });
        setIcon(close, 'x'); close.disabled = state.busy;
        close.addEventListener('click', () => this.dismissCompletedSummary(state));
      }
    }
  }

  private dismissCompletedSummary(state: SessionWorkbenchState): void {
    const current = this.buildState(this.host.getActiveSession());
    if (current.identity !== state.identity || current.busy || current.goal.status !== 'ready' || current.goal.goal?.status !== 'complete') return;
    const signature = this.goalSummarySignature(state);
    if (this.goalSummarySignature(current) !== signature) return;
    const storageKey = `opencodian.completedGoalSummary:${state.identity}`;
    this.dismissedSummaries.set(storageKey, signature);
    try { this.host.app?.saveLocalStorage?.(storageKey, signature); } catch { /* Retain in-memory dismissal. */ }
    this.refresh(); this.goalButton?.focus();
  }

  private updateSendLabel(armed: boolean): void {
    const send = this.host.getComposerShell()?.querySelector<HTMLButtonElement>('.opencodian-send-btn');
    if (send) send.setAttribute('aria-label', t(armed ? 'workbench.goal.send' : 'chat.input.sendMessage'));
  }

  private syncSubscriptions(): void {
    const registry = this.host.getRegistry();
    for (const backend of ['opencode2', 'claude-code', 'codex', 'zcode', 'dsh', 'pi'] as const) {
      const service = goalService(registry?.get(backend));
      if (this.subscriptions.get(backend)?.service === service) continue;
      this.subscriptions.get(backend)?.dispose.dispose(); this.subscriptions.delete(backend);
      if (service) this.subscriptions.set(backend, { service, dispose: service.subscribeToGoalEvents((event) => this.onGoalEvent(backend, event)) });
      const probe = (service as AgentGoalCapability & { probeGoalAvailability?(): Promise<{ available: boolean; reason?: string }> } | null)?.probeGoalAvailability;
      if (service && probe) void probe.call(service).then((result: { available: boolean; reason?: string }) => {
        if (!this.disposed && this.subscriptions.get(backend)?.service === service) { this.availability.set(backend, result); this.refresh(); }
      }).catch(() => undefined);
    }
  }

  private onGoalEvent(backend: AgentBackendKind, event: AgentGoalEvent): void {
    for (const session of this.host.getSessions()) {
      if (session.backend !== backend || !session.conversation) continue;
      const sessionId = getConversationBackendSessionId(session.conversation);
      if (!sessionId) continue;
      const key = this.key(backend, sessionId);
      if (sessionId === event.sessionId || this.aliases.get(key) === event.sessionId) {
        if (event.type === 'state') this.acceptReadback(session, event.readback);
        else {
          const previous = this.readbacks.get(key);
          if (previous?.goal) this.readbacks.set(key, { ...previous, goal: { ...previous.goal, execution: event.execution } });
        }
        if (!session.streaming) this.scheduleTranscriptSync(session);
      } else if (this.pendingSends.has(session.tabId)) {
        // An adapter may acquire its native ID during the first send. Read
        // through its alias-aware API instead of guessing another tab's ID.
        void this.refreshGoal(session, true);
      }
    }
    this.refresh();
  }

  private acceptReadback(session: WorkbenchSession, readback: AgentGoalReadback): void {
    const current = this.host.getSessions().find((candidate) => candidate.tabId === session.tabId);
    if (!current || current.backend !== session.backend || current.conversation?.id !== session.conversation?.id) return;
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    if (!sessionId) return;
    const key = this.key(session.backend, sessionId);
    this.readbacks.set(key, readback);
    if (readback.goal) this.aliases.set(key, readback.goal.sessionId);
    const pending = this.pendingSends.get(session.tabId);
    if (pending && pending.backend === session.backend && (!pending.conversationId || pending.conversationId === session.conversation?.id)
      && readback.status === 'ready' && readback.goal?.objective === pending.objective) {
      this.pendingSends.delete(session.tabId); this.armed.delete(session.tabId); this.errors.delete(session.tabId);
      pending.acknowledge?.('accepted');
    }
  }

  private async refreshGoal(session: WorkbenchSession, force = false): Promise<void> {
    if (this.disposed || !session.conversation) return;
    const sessionId = getConversationBackendSessionId(session.conversation);
    const service = goalService(this.host.getRegistry()?.get(session.backend));
    if (!sessionId || !service) return;
    const key = this.key(session.backend, sessionId);
    const pending = this.reads.get(key);
    if (pending) return pending;
    if (!force && Date.now() - (this.lastReads.get(key) ?? 0) < 5000) return;
    this.lastReads.set(key, Date.now());
    const reading = (async () => {
      const readback = await service.readSessionGoal(sessionId);
      if (this.disposed || getConversationBackendSessionId(session.conversation!) !== sessionId) return;
      this.acceptReadback(session, readback);
    })().catch((error) => {
      this.readbacks.set(key, { status: 'failed', goal: this.readbacks.get(key)?.goal ?? null, reason: error instanceof Error ? error.message : String(error) });
    }).finally(() => { this.reads.delete(key); this.refresh(); });
    this.reads.set(key, reading); return reading;
  }

  async controlGoal(command: AgentGoalCommand): Promise<void> {
    await this.controlGoalForSession(this.host.getActiveSession(), command);
  }

  private async controlGoalForSession(session: WorkbenchSession, command: AgentGoalCommand): Promise<void> {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = goalService(this.host.getRegistry()?.get(session.backend));
    if (!sessionId || !service) return;
    const key = this.key(session.backend, sessionId);
    if (this.operations.has(key)) return;
    this.operations.add(key); this.errors.delete(session.tabId); this.refresh();
    try {
      const result = await service.controlSessionGoal(sessionId, command);
      this.acceptReadback(session, result.readback);
      if (!['confirmed', 'accepted'].includes(result.status)) this.errors.set(session.tabId,
        result.reason ?? (result.readback.status !== 'ready' ? result.readback.reason : undefined) ?? t('workbench.evidence.failed'));
      if (!session.streaming) this.scheduleTranscriptSync(session);
    } catch (error) { this.errors.set(session.tabId, error instanceof Error ? error.message : String(error)); }
    finally { this.operations.delete(key); this.refresh(); }
  }

  async stopActiveGoal(): Promise<void> {
    const session = this.host.getActiveSession();
    await this.refreshGoal(session, true);
    const state = this.buildState(session);
    if (state.goal.goal && state.goal.goal.status !== 'complete' && state.capabilities?.actions.includes('pause')) await this.controlGoalForSession(session, { action: 'pause' });
  }

  private async refreshTasks(session: WorkbenchSession, force = false): Promise<void> {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend) as NativeTaskService | undefined;
    if (!sessionId || !service?.getBackgroundTasks) return;
    const key = this.key(session.backend, sessionId);
    if (!force && Date.now() - (this.taskReads.get(key) ?? 0) < 5000) return;
    this.taskReads.set(key, Date.now());
    try {
      const tasks = await service.getBackgroundTasks(sessionId);
      if (this.disposed) return;
      this.nativeTasks.set(key, tasks.map((task) => ({ id: task.taskId, title: task.description, status: task.status,
        canStop: task.cancellable && typeof service.cancelBackgroundTask === 'function', nativeSessionId: sessionId })));
      this.refresh();
    } catch { /* Keep the last observed tasks on transient transport failure. */ }
  }

  private async stopTask(task: WorkbenchTask): Promise<void> {
    const session = this.host.getActiveSession();
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend) as NativeTaskService | undefined;
    if (!task.canStop || !sessionId || sessionId !== task.nativeSessionId || !service?.cancelBackgroundTask)
      throw new Error(t('workbench.tool.unavailable'));
    if (!await service.cancelBackgroundTask(sessionId, task.id)) this.host.notify(t('workbench.tasks.stopUnconfirmed'));
    await this.refreshTasks(session, true);
  }

  private async readTaskOutput(task: WorkbenchTask): Promise<string> {
    if (task.output) return task.output;
    const session = this.host.getActiveSession();
    const service = this.host.getRegistry()?.get(session.backend) as NativeTaskService | undefined;
    const agents = this.informationCoordinator.project(session).agents;
    if (!task.nativeSessionId || !service?.readChildSessionMessages || !agents?.some((agent) => agent.id === task.id)) return t('workbench.tasks.noOutput');
    const messages = await service.readChildSessionMessages(task.nativeSessionId, task.id);
    return messages.map((message) => [message.content, ...(message.toolCalls ?? []).map((tool) => tool.result ?? '')].filter(Boolean).join('\n')).filter(Boolean).join('\n\n') || t('workbench.tasks.noOutput');
  }

  private scheduleTranscriptSync(session: WorkbenchSession): void {
    const key = session.conversation?.id;
    if (!key || this.disposed) return;
    if (this.syncing.has(key)) { this.syncAgain.add(key); return; }
    if (Date.now() - (this.lastSyncs.get(key) ?? 0) < 3000) return;
    this.lastSyncs.set(key, Date.now());
    this.syncing.add(key);
    void this.host.syncTranscript(session).catch(() => undefined).finally(() => {
      this.syncing.delete(key);
      if (this.syncAgain.delete(key) && !this.disposed) this.scheduleTranscriptSync(session);
      this.refresh();
    });
  }

  private tick(): void {
    const active = this.host.getActiveSession();
    if (this.surface?.isVisible()) this.informationCoordinator.refresh(active);
    for (const session of this.host.getSessions()) {
      const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
      const state = sessionId ? this.readbacks.get(this.key(session.backend, sessionId)) : undefined;
      if (session.tabId === this.host.getActiveSession().tabId || session.backgroundTasks.length) void this.refreshTasks(session);
      if (state?.goal || this.pendingSends.has(session.tabId)) {
        void this.refreshGoal(session);
        if (!session.streaming && state?.goal?.status === 'active') this.scheduleTranscriptSync(session);
      }
      const pending = this.pendingSends.get(session.tabId);
      if (pending && Date.now() - pending.submittedAt > 30000) {
        pending.acknowledge?.('rejected'); this.pendingSends.delete(session.tabId);
        this.errors.set(session.tabId, t('workbench.goal.pending'));
      }
    }
    this.refresh();
  }

  private key(backend: AgentBackendKind, sessionId: string | null | undefined): string { return `${backend}:${sessionId ?? ''}`; }

  destroy(): void {
    this.disposed = true; this.informationCoordinator.destroy();
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const { dispose } of this.subscriptions.values()) dispose.dispose();
    this.subscriptions.clear();
    for (const pending of this.pendingSends.values()) pending.acknowledge?.('rejected');
    this.pendingSends.clear();
    this.surface?.destroy(); this.surface = null;
    this.goalButton?.remove(); this.goalButton = null;
    this.summary?.remove(); this.summary = null;
  }
}
