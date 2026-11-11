/** Session-owned native information, transcript provenance and child conversation inspection. */
import type { AgentChildSessionContinuationCapability, AgentService, AgentSessionChild, AgentSessionInformation, Disposable } from '../../../../core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../core/agents/backend/AgentServiceRegistry';
import type { DshJobView, DshNativeControls, DshNativeControlUpdate } from '../../../../core/agents/backend/dsh/DshNativeControls';
import { type Conversation, getConversationBackendSessionId, type SessionTodo, type TabContextState } from '../../../../core/types';
import type { AgentBackendKind, ChatMessage, ToolCallInfo } from '../../../../core/types/chat';
import { t } from '../../../../i18n';
import { sanitizeDiagnosticReport } from '../../../../shared/diagnosticSecretSanitizer';
import type { SessionWorkbenchState, WorkbenchResource, WorkbenchTask } from '../../ui/SessionWorkbench';
import { ContextUsageDisplayService } from '../context/ContextUsageDisplayService';
import { DshNativeWorkbenchControls, isDshNativeWorkbenchService } from '../selection/DshNativeSessionControls';

export interface WorkbenchSession {
  tabId: string;
  conversation: Conversation | null;
  backend: AgentBackendKind;
  streaming: boolean;
  todos: readonly SessionTodo[];
  backgroundTasks: readonly WorkbenchTask[];
  resources: readonly WorkbenchResource[];
  contextUsage?: TabContextState | null;
}
export interface NativeJobTimelineSnapshot {
  jobs: readonly DshJobView[] | null;
  /** Captured adapter generation and conversation/tab owner. */
  isCurrent(): boolean;
}

interface SessionInformationHost {
  getActiveSession(): WorkbenchSession;
  getSessions(): WorkbenchSession[];
  getRegistry(): AgentServiceRegistry | null | undefined;
  onChange(): void;
  openChildView(): void;
  notify?(message: string): void;
  onNativeJobs?(session: WorkbenchSession, snapshot: NativeJobTimelineSnapshot): Promise<void>;
}

interface NativeTaskService extends AgentService, Partial<Pick<DshNativeControls, 'listSessionJobs' | 'readSessionJob' | 'killSessionJob'>> {
  subscribeToNativeControlUpdates?(handler: (update: DshNativeControlUpdate) => void): Disposable;
  getBackgroundTasks?(sessionId: string): Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>>;
  cancelBackgroundTask?(sessionId: string, taskId: string): Promise<boolean>;
  getChatMessages?(sessionId: string): Promise<import('../../../../core/types').ChatMessage[]>;
}

type ChildEntry = NonNullable<SessionWorkbenchState['child']> & { ownerSessionId: string; canContinueOwner?: AgentService };

function nativeAgentId(backend: AgentBackendKind, tool: ToolCallInfo): string | undefined {
  if (tool.kind !== 'task' && !/^(task|agent|subagent)$/i.test(tool.name)) return undefined;
  const fields: Partial<Record<AgentBackendKind, string>> = {
    codex: 'agentThreadId', opencode2: 'sessionID', 'claude-code': 'agentId', zcode: 'childSessionId',
  };
  const field = fields[backend];
  const id = field ? tool.toolMetadata?.[field] : undefined;
  return typeof id === 'string' && id ? id : undefined;
}

function nativeAgentStatus(tool: ToolCallInfo): AgentSessionChild['status'] {
  const statuses: Record<NonNullable<ToolCallInfo['status']>, AgentSessionChild['status']> = {
    pending: 'pending', running: 'running', completed: 'completed', error: 'failed', blocked: 'failed', interrupted: 'failed',
  };
  return tool.status ? statuses[tool.status] : 'unknown';
}

/**
 * Send-outcome mapping for the child continuation seam. A failure carrying a
 * backend `failureCode` is a domain REJECTION at admission (the child took
 * nothing); the six official codes map to their own copy. A failure without
 * one — timeout, transport loss, stale generation, opaque bridge error — has
 * an UNKNOWN delivery outcome: it must surface the retry copy, never claim
 * the message was or was not sent, and never trigger an automatic resend.
 */
const childSendFailureKeys: Record<string, 'workbench.info.childSend.parentUnavailable' | 'workbench.info.childSend.notResumable'
  | 'workbench.info.childSend.unauthorized' | 'workbench.info.childSend.deliveryUnavailable'> = {
  'subagent/parent-unavailable': 'workbench.info.childSend.parentUnavailable',
  'subagent/not-resumable': 'workbench.info.childSend.notResumable',
  'subagent/unauthorized': 'workbench.info.childSend.unauthorized',
  'subagent/delivery-unavailable': 'workbench.info.childSend.deliveryUnavailable',
};

function childSendFailureMessage(error: unknown): string {
  const code = typeof (error as { failureCode?: unknown } | null)?.failureCode === 'string'
    ? (error as { failureCode: string }).failureCode : undefined;
  return t(childSendFailureKeys[code ?? ''] ?? 'workbench.info.childSend.generic');
}

export class SessionInformationCoordinator {
  private readonly information = new Map<string, AgentSessionInformation>();
  private readonly informationOwners = new Map<string, AgentService>();
  private readonly informationReads = new Map<string, Promise<void>>();
  private readonly informationTimes = new Map<string, number>();
  private readonly informationStatus = new Map<string, 'loading' | 'ready' | 'failed'>();
  private readonly children = new Map<string, ChildEntry>();
  private readonly childReads = new Set<string>();
  private readonly childTimes = new Map<string, number>();
  /** One in-flight child continuation per session identity; delivery is admission, not completion. */
  private readonly childSends = new Set<string>();
  private readonly nativeTasks = new Map<string, WorkbenchTask[]>();
  private readonly taskReads = new Map<string, number>();
  private readonly taskVersions = new Map<string, number>();
  private readonly jobEpochs = new Map<AgentBackendKind, number>();
  private readonly jobSubscriptions = new Map<AgentBackendKind, { service: NativeTaskService; dispose: Disposable }>();
  private readonly controlReads = new Map<string, number>();
  /** DSH native Plan/terminal/child/job operations; this coordinator only integrates its reads and projection. */
  private readonly dsh = new DshNativeWorkbenchControls({ onChange: () => this.host.onChange(), notify: (message) => this.host.notify?.(message) });
  private disposed = false;
  constructor(private readonly host: SessionInformationHost) {}

  refresh(session: WorkbenchSession, force = false): void {
    void this.refreshInformation(session, force); void this.refreshChild(session, force); void this.refreshNativeControls(session, force);
  }

  returnToParent(): void {
    this.children.delete(this.sessionIdentity(this.host.getActiveSession())); this.host.onChange();
  }

  project(session: WorkbenchSession): Pick<SessionWorkbenchState, 'information' | 'informationStatus' | 'contextSources' | 'agents' | 'statistics' | 'child' | 'nativePlan' | 'nativeTerminals'> {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const key = this.key(session.backend, sessionId);
    const information = this.informationOwners.get(key) === this.host.getRegistry()?.get(session.backend) ? this.information.get(key) : undefined;
    const context = information?.context ?? this.currentContext(session, sessionId);
    const messages = (session.conversation?.messages ?? []).filter((message) => message.displayStyle !== 'notice');
    const sources = new Map<string, WorkbenchResource>();
    for (const message of messages) {
      for (const attachment of message.contextAttachments ?? []) sources.set(`file:${attachment.path}`, {
        label: attachment.label, path: attachment.path, detail: t('workbench.info.sent'),
      });
      for (const reference of message.promptReferences ?? []) sources.set(reference.id, {
        label: reference.label, ...('path' in reference ? { path: reference.path } : {}), detail: t('workbench.info.sent'),
      });
      for (const snapshot of message.sessionReferences ?? []) sources.set(snapshot.reference.id, {
        label: snapshot.reference.label, detail: `${t('workbench.info.sent')} · ${snapshot.strategy}`,
      });
    }
    for (const source of information?.sources ?? []) sources.set(`native:${source.path ?? source.label}`, {
      ...source, detail: t('workbench.info.loaded'), navigable: false,
    });
    const agents = this.sessionAgents(session, information?.agents ?? []);
    const child = this.projectChild(session, sessionId, agents);
    return {
      information, informationStatus: this.informationStatus.get(key), contextSources: [...sources.values()], agents,
      statistics: this.statistics(session, messages, context),
      ...(child ? { child } : {}),
      ...this.dsh.project(key),
    };
  }

  /**
   * Child slots are per tab even when two tabs share one conversation: the
   * identity carries the tab so a draft, probe or receipt can never cross tabs.
   */
  private sessionIdentity(session: WorkbenchSession): string {
    return `${session.backend}:${session.conversation?.id ?? session.tabId}@${session.tabId}`;
  }

  private statistics(session: WorkbenchSession, messages: readonly ChatMessage[], context: NonNullable<SessionWorkbenchState['statistics']>['context']) {
    return { rounds: messages.filter((message) => message.role === 'user').length, messages: messages.length,
      tools: messages.reduce((count, message) => count + (message.toolCalls?.length ?? 0), 0),
      model: session.contextUsage?.modelName ?? session.contextUsage?.model ?? [...messages].reverse().find((message) => message.modelId)?.modelId,
      ...(context ? { context } : {}),
    };
  }

  private currentContext(session: WorkbenchSession, sessionId: string | null | undefined): NonNullable<SessionWorkbenchState['statistics']>['context'] {
    // OpenCode 2 Tab preciseTokens currently carries session totals. Only its
    // explicit last-assistant readback can supply this panel's occupancy.
    if (!['dsh', 'pi'].includes(session.backend)) return undefined;
    const usage = session.contextUsage;
    if (!usage || !sessionId || usage.sessionId !== sessionId) return undefined;
    const hasSnapshot = usage.openCodeCurrentContext !== undefined ? usage.openCodeCurrentContext !== null : usage.preciseTokens !== null;
    if (!hasSnapshot) return undefined;
    const context = ContextUsageDisplayService.summarize(usage);
    return context.isUnavailable ? undefined : { tokens: context.totalTokens, window: context.contextWindow };
  }

  private projectChild(session: WorkbenchSession, sessionId: string | null | undefined, agents: readonly AgentSessionChild[]): SessionWorkbenchState['child'] {
    const child = this.children.get(this.sessionIdentity(session));
    if (!child || child.ownerSessionId !== sessionId) return undefined;
    // A swapped backend instance invalidates the recorded probe immediately:
    // the gate re-validates against the CURRENT owner before any write.
    if (child.canContinueOwner !== undefined && child.canContinueOwner !== this.host.getRegistry()?.get(session.backend)) {
      child.canContinue = undefined; child.canContinueOwner = undefined;
    }
    return { ...child, agent: agents.find((agent) => agent.id === child.agent.id) ?? child.agent };
  }

  private sessionAgents(session: WorkbenchSession, native: readonly AgentSessionChild[]): AgentSessionChild[] {
    const agents = new Map(native.map((agent) => [agent.id, agent]));
    const service = this.host.getRegistry()?.get(session.backend);
    for (const message of session.conversation?.messages ?? []) for (const tool of message.toolCalls ?? []) {
      const id = nativeAgentId(session.backend, tool);
      if (!id) continue;
      const previous = agents.get(id);
      const status = nativeAgentStatus(tool);
      agents.set(id, { id, title: typeof tool.input.description === 'string' ? tool.input.description : previous?.title ?? tool.name,
        status: previous && previous.status !== 'unknown' ? previous.status : status,
        readable: Boolean(service?.readChildSessionMessages), ...(typeof tool.result === 'string' ? { detail: tool.result } : {}),
      });
    }
    return [...agents.values()];
  }

  private async refreshInformation(session: WorkbenchSession, force = false): Promise<void> {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend);
    if (this.disposed || !sessionId || !service?.readSessionInformation) return;
    const key = this.key(session.backend, sessionId);
    if (this.informationOwners.get(key) !== service) {
      this.information.delete(key); this.informationTimes.delete(key); this.informationStatus.delete(key);
      this.informationOwners.set(key, service);
    }
    const pending = this.informationReads.get(key); if (pending) return pending;
    if (!force && Date.now() - (this.informationTimes.get(key) ?? 0) < 10000) return;
    this.informationTimes.set(key, Date.now());
    if (!this.information.has(key)) this.informationStatus.set(key, 'loading');
    const current = () => !this.disposed && this.host.getRegistry()?.get(session.backend) === service
      && this.host.getSessions().some((candidate) => candidate.tabId === session.tabId && candidate.backend === session.backend
        && candidate.conversation?.id === session.conversation?.id && candidate.conversation
        && getConversationBackendSessionId(candidate.conversation) === sessionId);
    const reading = service.readSessionInformation(sessionId).then((information) => {
      if (!current() || information.sessionId !== sessionId) return;
      this.information.set(key, information); this.informationStatus.set(key, 'ready');
    }).catch(() => { if (current()) this.informationStatus.set(key, 'failed'); })
      .finally(() => { this.informationReads.delete(key); this.host.onChange(); });
    this.informationReads.set(key, reading); return reading;
  }

  async openChild(agent: AgentSessionChild): Promise<void> {
    const session = this.host.getActiveSession();
    const ownerSessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    if (!ownerSessionId || !agent.readable || !this.project(session).agents?.some((candidate) => candidate.id === agent.id)) return;
    this.children.set(this.sessionIdentity(session), { agent, messages: [], loading: true, ownerSessionId,
      draft: '', delivery: 'queue', composerFocused: false });
    this.host.openChildView(); this.host.onChange(); await this.refreshChild(session, true);
  }

  /**
   * Silent composer-state persistence for the open child: every keystroke and
   * focus change lands here WITHOUT an onChange, so periodic tasklist refreshes
   * rebuild the workbench without losing the in-progress draft or focus.
   */
  setChildComposerState(part: { draft?: string; delivery?: 'queue' | 'steer'; composerFocused?: boolean; caret?: number }): void {
    const child = this.children.get(this.sessionIdentity(this.host.getActiveSession()));
    if (!child) return;
    if (part.draft !== undefined) child.draft = part.draft;
    if (part.delivery !== undefined) child.delivery = part.delivery;
    if (part.composerFocused !== undefined) child.composerFocused = part.composerFocused;
    if (part.caret !== undefined) child.composerCaret = part.caret;
  }

  private async refreshChild(session: WorkbenchSession, force = false): Promise<void> {
    const identity = this.sessionIdentity(session), child = this.children.get(identity);
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend);
    if (this.disposed || !child || !sessionId || child.ownerSessionId !== sessionId || !service?.readChildSessionMessages) return;
    const key = `${identity}:${this.key(session.backend, sessionId)}:${child.agent.id}`;
    if (this.childReads.has(key) || !force && Date.now() - (this.childTimes.get(key) ?? 0) < 3000) return;
    this.childReads.add(key); this.childTimes.set(key, Date.now());
    try {
      const messages = await service.readChildSessionMessages(sessionId, child.agent.id);
      const canContinue = await this.probeChildContinuation(service, sessionId, child);
      if (!this.disposed && this.children.get(identity) === child && this.host.getRegistry()?.get(session.backend) === service) {
        child.messages = messages; child.loading = false; child.error = undefined;
        child.canContinue = canContinue;
        child.canContinueOwner = typeof canContinue === 'boolean' ? service : undefined;
      }
    } catch {
      if (!this.disposed && this.children.get(identity) === child && this.host.getRegistry()?.get(session.backend) === service) {
        child.loading = false; child.error = t('workbench.info.failed');
      }
    } finally { this.childReads.delete(key); this.host.onChange(); }
  }

  /**
   * Probe the live owner's delivery seam while reading a child transcript.
   * `undefined` = the child is not continuable; `false` = no proven delivery
   * seam; `'unknown'` = the probe itself failed (never treated as writable).
   * The result is bound to the exact owner that produced it.
   */
  private async probeChildContinuation(service: AgentService, sessionId: string, child: ChildEntry):
    Promise<NonNullable<SessionWorkbenchState['child']>['canContinue']> {
    const continuation = service as AgentChildSessionContinuationCapability;
    if (child.agent.mode !== 'continuable') return undefined;
    if (typeof continuation.canContinueChildSession !== 'function') return false;
    // Return evidence without mutating the slot. The caller commits it only
    // after verifying the service and child that owned the read.
    return continuation.canContinueChildSession(sessionId).catch(() => 'unknown' as const);
  }

  /**
   * Deliver one queued/steered follow-up to the open continuable child.
   * Routes only through the backend child seam: an unavailable or refusing
   * backend rejects with a readable message and never falls back to sending
   * through the parent conversation.
   */
  async continueChild(text: string, delivery: 'queue' | 'steer'): Promise<string> {
    const session = this.host.getActiveSession();
    const identity = this.sessionIdentity(session);
    const child = this.children.get(identity);
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend) as AgentChildSessionContinuationCapability | undefined;
    if (!child || !sessionId || child.ownerSessionId !== sessionId || child.agent.mode !== 'continuable'
      || !service?.continueChildSession) throw new Error(t('workbench.tool.unavailable'));
    const isCurrent = () => {
      const active = this.host.getActiveSession();
      return !this.disposed && this.children.get(identity) === child
        && this.sessionIdentity(active) === identity
        && active.conversation !== null && getConversationBackendSessionId(active.conversation) === sessionId
        && this.host.getRegistry()?.get(session.backend) === service;
    };
    await this.revalidateChildContinuation(identity, sessionId, child, service);
    // Even a cached probe crosses a microtask boundary. Recheck the complete
    // lease immediately before writing, not only before awaiting the probe.
    if (!isCurrent()) throw new Error(t('workbench.tool.unavailable'));
    if (this.childSends.has(identity)) throw new Error(t('workbench.info.childSendBusy'));
    this.childSends.add(identity);
    try {
      const { messageId } = await service.continueChildSession(sessionId, child.agent.id, text, { delivery });
      if (!isCurrent()) throw new Error(t('workbench.tool.unavailable'));
      // Receipt evidence is coordinator state: it must survive history reads,
      // rebuilds and failures — only a newer receipt replaces it.
      child.sendNote = t('workbench.info.childSendAccepted', { messageId });
      // Clear only what was actually accepted: a draft edited mid-flight stays.
      if ((child.draft ?? '').trim() === text) { child.draft = ''; child.composerFocused = false; }
      // Rebuild immediately so the stale textarea cannot resend the accepted
      // text; the transcript refresh runs independently afterwards.
      this.host.onChange();
      void this.refreshChild(session, true);
      return child.sendNote;
    } catch (error) {
      // A refused send keeps the draft; only an accepted delivery clears it.
      throw new Error(childSendFailureMessage(error));
    } finally { this.childSends.delete(identity); }
  }

  /**
   * Re-validate the continuation gate against the CURRENT owner before any
   * write. A probe binds to the exact owner that produced it; a swapped
   * service — or any non-true state — re-probes live, and `'unknown'` never
   * becomes writable on the strength of stale evidence.
   */
  private async revalidateChildContinuation(identity: string, sessionId: string, child: ChildEntry,
    service: AgentChildSessionContinuationCapability): Promise<void> {
    if (child.canContinue === true && child.canContinueOwner === service) return;
    const probed = typeof service.canContinueChildSession === 'function'
      ? await service.canContinueChildSession(sessionId).catch(() => 'unknown' as const)
      : false;
    const active = this.host.getActiveSession();
    if (this.disposed || this.children.get(identity) !== child || child.ownerSessionId !== sessionId
      || this.sessionIdentity(active) !== identity || !active.conversation
      || getConversationBackendSessionId(active.conversation) !== sessionId
      || this.host.getRegistry()?.get(active.backend) !== service) {
      throw new Error(t('workbench.tool.unavailable'));
    }
    child.canContinue = probed === true ? true : probed === false ? false : 'unknown';
    child.canContinueOwner = probed === 'unknown' ? undefined : service;
    if (probed !== true) {
      throw new Error(t(probed === false ? 'workbench.info.childParentUnavailable' : 'workbench.info.childCapabilityUnknown'));
    }
  }

  syncNativeJobSubscriptions(): void {
    const backends = new Set(this.host.getSessions().map((session) => session.backend));
    for (const [backend, entry] of this.jobSubscriptions) {
      if (!backends.has(backend) || this.host.getRegistry()?.get(backend) !== entry.service) {
        entry.dispose.dispose(); this.jobSubscriptions.delete(backend); this.invalidateNativeTasks(backend);
      }
    }
    for (const backend of backends) {
      if (this.jobSubscriptions.has(backend)) continue;
      const service = this.host.getRegistry()?.get(backend) as NativeTaskService | undefined;
      if (!service?.listSessionJobs || !service.subscribeToNativeControlUpdates) continue;
      const dispose = service.subscribeToNativeControlUpdates((update) => {
        if (this.disposed || this.host.getRegistry()?.get(backend) !== service) return;
        if (update.kind === 'invalidated') {
          this.invalidateNativeTasks(backend); this.host.onChange(); return;
        }
        if (update.kind === 'session' && update.update.sessionUpdate === 'plan_update') {
          this.dsh.accept(this.key(backend, update.sessionId), update.update); return;
        }
        if (update.kind !== 'session' || update.update.sessionUpdate !== 'jobs_update') return;
        for (const session of this.host.getSessions()) if (session.backend === backend && session.conversation
          && getConversationBackendSessionId(session.conversation) === update.sessionId) void this.refreshTasks(session, true);
      });
      this.jobSubscriptions.set(backend, { service, dispose });
    }
  }

  private invalidateNativeTasks(backend: AgentBackendKind): void {
    this.jobEpochs.set(backend, (this.jobEpochs.get(backend) ?? 0) + 1);
    this.dsh.invalidate(backend);
    for (const session of this.host.getSessions()) if (session.backend === backend)
      void this.host.onNativeJobs?.(session, { jobs: null, isCurrent: () => false }).catch(() => {});
    for (const key of this.taskVersions.keys()) if (key.startsWith(`${backend}:`)) {
      this.taskVersions.set(key, this.taskVersions.get(key)! + 1); this.nativeTasks.delete(key); this.taskReads.delete(key);
    }
  }

  async refreshTasks(session: WorkbenchSession, force = false): Promise<void> {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend) as NativeTaskService | undefined;
    if (!sessionId || !service || !service.getBackgroundTasks && !service.listSessionJobs) return;
    const key = this.key(session.backend, sessionId);
    if (!force && Date.now() - (this.taskReads.get(key) ?? 0) < 5000) return;
    this.taskReads.set(key, Date.now());
    const version = (this.taskVersions.get(key) ?? 0) + 1; this.taskVersions.set(key, version);
    const lease = this.nativeJobLease(session, service, sessionId);
    try {
      const jobs = service.listSessionJobs ? (await service.listSessionJobs(sessionId)).filter(job => job.owner === sessionId) : null;
      const tasks: WorkbenchTask[] = jobs
        ? jobs.map((job) => {
          const task: WorkbenchTask = { id: `job:${job.id}`, nativeJobId: job.id, nativeBackend: session.backend, nativeSessionId: sessionId,
            title: job.label, status: job.status, canStop: ['running', 'stopping'].includes(job.status) && typeof service.killSessionJob === 'function' };
          return isDshNativeWorkbenchService(service) ? this.dsh.jobTask({ key, sessionId, service, lease }, task) : task;
        })
        : (await service.getBackgroundTasks!(sessionId)).map((task) => ({ id: task.taskId, title: task.description, status: task.status,
          canStop: task.cancellable && typeof service.cancelBackgroundTask === 'function', nativeSessionId: sessionId }));
      if (!lease() || this.taskVersions.get(key) !== version) return;
      this.nativeTasks.set(key, tasks);
      if (jobs) await this.host.onNativeJobs?.(session, { jobs, isCurrent: lease });
      if (lease()) this.host.onChange();
    } catch { /* No authoritative list: retain last evidence, never infer completion or stopped. */ }
  }

  private nativeJobLease(session: WorkbenchSession, service: NativeTaskService, sessionId: string): () => boolean {
    const epoch = this.jobEpochs.get(session.backend) ?? 0;
    const conversationId = session.conversation?.id;
    return () => !this.disposed && (this.jobEpochs.get(session.backend) ?? 0) === epoch
      && this.host.getRegistry()?.get(session.backend) === service
      && this.host.getSessions().some(current => current.tabId === session.tabId && current.backend === session.backend
        && current.conversation?.id === conversationId && getConversationBackendSessionId(current.conversation!) === sessionId);
  }

  async stopTask(task: WorkbenchTask): Promise<void> {
    const session = this.host.getActiveSession();
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend) as NativeTaskService | undefined;
    if (!task.canStop || !sessionId || sessionId !== task.nativeSessionId || !service
      || task.nativeBackend && task.nativeBackend !== session.backend) throw new Error(t('workbench.tool.unavailable'));
    if (task.nativeTerminalId || task.nativeChildId) {
      await this.dsh.stop(task); await this.refreshNativeControls(session, true); return;
    }
    if (task.nativeJobId && service.killSessionJob) {
      if (!this.getNativeTasks(session.backend, sessionId).some((current) => current.nativeJobId === task.nativeJobId && current.canStop))
        throw new Error(t('workbench.tool.unavailable'));
      await service.killSessionJob(sessionId, task.nativeJobId);
    } else {
      if (!service.cancelBackgroundTask) throw new Error(t('workbench.tool.unavailable'));
      if (!await service.cancelBackgroundTask(sessionId, task.id)) this.host.notify?.(t('workbench.tasks.stopUnconfirmed'));
    }
    await this.refreshTasks(session, true);
  }

  async readTaskOutput(task: WorkbenchTask): Promise<string> {
    if (task.output) return task.output;
    if (task.nativeTerminalId || task.nativeChildId) return this.dsh.readOutput(task);
    const session = this.host.getActiveSession();
    const service = this.host.getRegistry()?.get(session.backend) as NativeTaskService | undefined;
    if (task.nativeJobId && task.nativeBackend === session.backend && service?.readSessionJob && session.conversation
      && getConversationBackendSessionId(session.conversation) === task.nativeSessionId) {
      const result = await service.readSessionJob(task.nativeSessionId!, task.nativeJobId);
      if (this.disposed || this.host.getRegistry()?.get(session.backend) !== service
        || this.host.getActiveSession().conversation?.id !== session.conversation.id) return '';
      const output = sanitizeDiagnosticReport([result.chunks.map((chunk) => chunk.text).join(''), result.result].filter(Boolean).join('\n'), { urlPolicy: 'strict' });
      return `${output.slice(0, 65_536) || t('chat.dsh.workbench.noOutput')}${result.lossy || output.length > 65_536 ? `\n${t('chat.dsh.workbench.truncated')}` : ''}`;
    }
    const agents = this.project(session).agents;
    if (!task.nativeSessionId || !service?.readChildSessionMessages || !agents?.some((agent) => agent.id === task.id)) return t('workbench.tasks.noOutput');
    const messages = await service.readChildSessionMessages(task.nativeSessionId, task.id);
    return messages.map((message) => [message.content, ...(message.toolCalls ?? []).map((tool) => tool.result ?? '')].filter(Boolean).join('\n')).filter(Boolean).join('\n\n') || t('workbench.tasks.noOutput');
  }

  getNativeTasks(backend: AgentBackendKind, sessionId: string | null | undefined): WorkbenchTask[] {
    return [...(this.nativeTasks.get(this.key(backend, sessionId)) ?? []), ...this.dsh.tasks(this.key(backend, sessionId))];
  }

  /** Native row operation, only for the active session that owns the row. */
  async runTaskAction(task: WorkbenchTask, action: string, value?: string): Promise<string> {
    const session = this.host.getActiveSession();
    if (!session.conversation || getConversationBackendSessionId(session.conversation) !== task.nativeSessionId
      || task.nativeBackend !== session.backend) throw new Error(t('workbench.tool.unavailable'));
    const text = await this.dsh.runTaskAction(task, action, value);
    void this.refreshTasks(session, true); void this.refreshNativeControls(session, true);
    return text;
  }

  async setPlanMode(active: boolean): Promise<void> {
    const session = this.host.getActiveSession();
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    if (sessionId) await this.dsh.setPlanMode(this.key(session.backend, sessionId), active);
  }

  async spawnTerminal(options: { type: string; name?: string; cwd?: string }): Promise<string> {
    const session = this.host.getActiveSession();
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    if (!sessionId) throw new Error(t('workbench.tool.unavailable'));
    const text = await this.dsh.spawnTerminal(this.key(session.backend, sessionId), options);
    void this.refreshNativeControls(session, true);
    return text;
  }

  /** Plan, terminals and children are read while the workbench is visible; Jobs keep their own always-on refresh. */
  private refreshNativeControls(session: WorkbenchSession, force = false): Promise<void> {
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend);
    if (this.disposed || !sessionId || !isDshNativeWorkbenchService(service)) return Promise.resolve();
    const key = this.key(session.backend, sessionId);
    if (!force && Date.now() - (this.controlReads.get(key) ?? 0) < 5000) return Promise.resolve();
    this.controlReads.set(key, Date.now());
    return this.dsh.refresh({ key, sessionId, service, lease: this.nativeJobLease(session, service as NativeTaskService, sessionId) });
  }

  private key(backend: AgentBackendKind, sessionId: string | null | undefined): string { return `${backend}:${sessionId ?? ''}`; }
  destroy(): void {
    this.disposed = true; this.children.clear(); this.information.clear(); this.informationOwners.clear();
    for (const { dispose } of this.jobSubscriptions.values()) dispose.dispose();
    this.jobSubscriptions.clear(); this.nativeTasks.clear(); this.dsh.destroy();
  }
}
