/** Session-owned native information, transcript provenance and child conversation inspection. */
import type { AgentService, AgentSessionChild, AgentSessionInformation } from '../../../../core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../core/agents/backend/AgentServiceRegistry';
import { type Conversation, getConversationBackendSessionId, type SessionTodo, type TabContextState } from '../../../../core/types';
import type { AgentBackendKind, ChatMessage, ToolCallInfo } from '../../../../core/types/chat';
import { t } from '../../../../i18n';
import type { SessionWorkbenchState, WorkbenchResource, WorkbenchTask } from '../../ui/SessionWorkbench';
import { ContextUsageDisplayService } from '../context/ContextUsageDisplayService';

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
interface SessionInformationHost {
  getActiveSession(): WorkbenchSession;
  getSessions(): WorkbenchSession[];
  getRegistry(): AgentServiceRegistry | null | undefined;
  onChange(): void;
  openChildView(): void;
}

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

export class SessionInformationCoordinator {
  private readonly information = new Map<string, AgentSessionInformation>();
  private readonly informationOwners = new Map<string, AgentService>();
  private readonly informationReads = new Map<string, Promise<void>>();
  private readonly informationTimes = new Map<string, number>();
  private readonly informationStatus = new Map<string, 'loading' | 'ready' | 'failed'>();
  private readonly children = new Map<string, NonNullable<SessionWorkbenchState['child']> & { ownerSessionId: string }>();
  private readonly childReads = new Set<string>();
  private readonly childTimes = new Map<string, number>();
  private disposed = false;
  constructor(private readonly host: SessionInformationHost) {}

  refresh(session: WorkbenchSession, force = false): void {
    void this.refreshInformation(session, force); void this.refreshChild(session, force);
  }

  returnToParent(): void {
    this.children.delete(this.sessionIdentity(this.host.getActiveSession())); this.host.onChange();
  }

  project(session: WorkbenchSession): Pick<SessionWorkbenchState, 'information' | 'informationStatus' | 'contextSources' | 'agents' | 'statistics' | 'child'> {
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
    };
  }

  private sessionIdentity(session: WorkbenchSession): string {
    return `${session.backend}:${session.conversation?.id ?? session.tabId}`;
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
    this.children.set(this.sessionIdentity(session), { agent, messages: [], loading: true, ownerSessionId });
    this.host.openChildView(); this.host.onChange(); await this.refreshChild(session, true);
  }

  private async refreshChild(session: WorkbenchSession, force = false): Promise<void> {
    const identity = this.sessionIdentity(session), child = this.children.get(identity);
    const sessionId = session.conversation ? getConversationBackendSessionId(session.conversation) : null;
    const service = this.host.getRegistry()?.get(session.backend);
    if (this.disposed || !child || !sessionId || child.ownerSessionId !== sessionId || !service?.readChildSessionMessages) return;
    const key = `${this.key(session.backend, sessionId)}:${child.agent.id}`;
    if (this.childReads.has(key) || !force && Date.now() - (this.childTimes.get(key) ?? 0) < 3000) return;
    this.childReads.add(key); this.childTimes.set(key, Date.now());
    try {
      const messages = await service.readChildSessionMessages(sessionId, child.agent.id);
      if (!this.disposed && this.children.get(identity) === child && this.host.getRegistry()?.get(session.backend) === service) {
        child.messages = messages; child.loading = false; child.error = undefined;
      }
    } catch {
      if (!this.disposed && this.children.get(identity) === child) { child.loading = false; child.error = t('workbench.info.failed'); }
    } finally { this.childReads.delete(key); this.host.onChange(); }
  }

  private key(backend: AgentBackendKind, sessionId: string | null | undefined): string { return `${backend}:${sessionId ?? ''}`; }
  destroy(): void { this.disposed = true; this.children.clear(); this.information.clear(); this.informationOwners.clear(); }
}
