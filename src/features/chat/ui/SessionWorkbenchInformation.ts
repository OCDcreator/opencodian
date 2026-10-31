/** Foldable native information and read-only child transcripts inside the session workbench. */
import { type App, Component, MarkdownRenderer } from 'obsidian';

import type { AgentSessionChild, AgentSessionInformation } from '../../../core/agents/backend/AgentService';
import type { AgentGoalCapabilities, AgentGoalCommand, AgentGoalReadback } from '../../../core/agents/backend/BackendGoalRuntime';
import type { SessionTodo } from '../../../core/types';
import type { ChatMessage } from '../../../core/types/chat';
import { t } from '../../../i18n';
export type WorkbenchPage = 'overview' | 'tasks' | 'files' | 'tools';
export interface WorkbenchTask {
  id: string;
  title: string;
  status: string;
  output?: string;
  messageId?: string;
  canStop?: boolean;
  nativeSessionId?: string;
}
export interface WorkbenchResource { label: string; detail?: string; path?: string; command?: string; navigable?: boolean }
export interface SessionWorkbenchState {
  identity: string;
  title: string;
  backend: string;
  sessionId: string | null;
  goal: AgentGoalReadback;
  capabilities: AgentGoalCapabilities | null;
  armed: boolean;
  busy: boolean;
  error?: string;
  todos: readonly SessionTodo[];
  tasks: readonly WorkbenchTask[];
  resources: readonly WorkbenchResource[];
  information?: AgentSessionInformation | null;
  informationStatus?: 'loading' | 'ready' | 'failed';
  contextSources?: readonly WorkbenchResource[];
  agents?: readonly AgentSessionChild[];
  statistics?: { rounds: number; messages: number; tools: number; model?: string; context?: { tokens: number; window: number } };
  child?: { agent: AgentSessionChild; messages: readonly ChatMessage[]; loading: boolean; error?: string };
}
export interface SessionWorkbenchActions {
  app?: App;
  armGoal(): void;
  controlGoal(command: AgentGoalCommand): Promise<void>;
  refresh(): void;
  openMessage(id: string): void;
  openResource(resource: WorkbenchResource): void;
  stopTask(task: WorkbenchTask): Promise<void>;
  readTaskOutput?(task: WorkbenchTask): Promise<string>;
  mountTools(parent: HTMLElement): void;
  openTool?(tool: string): void;
  usePlanAsGoal?(text: string): void;
  onPageChange?(page: WorkbenchPage): void;
  openChild?(agent: AgentSessionChild): Promise<void>;
  returnToParent?(): void;
}

type Disclosure = (parent: HTMLElement, key: string, title: string, options: { icon: string; count: string }) => HTMLElement;
type Button = (parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>) => HTMLButtonElement;

export class SessionWorkbenchInformation {
  private childComponent: Component | null = null;
  constructor(private readonly actions: SessionWorkbenchActions, private readonly disclosure: Disclosure, private readonly button: Button) {}

  renderInformation(parent: HTMLElement, state: SessionWorkbenchState): void {
    if (state.informationStatus === 'failed') parent.createDiv({ cls: 'opencodian-workbench-error', text: t('workbench.info.failed'), attr: { role: 'status' } });
    this.renderQuota(parent, state);
    this.renderStatistics(parent, state);
    this.renderSources(parent, state);
    this.renderMcp(parent, state);
  }

  private renderQuota(parent: HTMLElement, state: SessionWorkbenchState): void {
    const unavailable = () => t(state.informationStatus === 'loading' ? 'workbench.info.loading' : 'workbench.info.unavailable');
    const quota = state.information?.quota;
    const quotaBody = this.disclosure(parent, 'quota', t('workbench.info.quota'), { icon: 'gauge',
      count: quota?.windows.map((window) => `${Math.round(window.usedPercent)}%`).join(' / ') ?? '' });
    if (!quota?.windows.length) quotaBody.createDiv({ cls: 'opencodian-workbench-muted', text: unavailable() });
    if (quota?.plan) quotaBody.createDiv({ cls: 'opencodian-workbench-muted', text: quota.plan });
    for (const window of quota?.windows ?? []) {
      const row = quotaBody.createDiv({ cls: 'opencodian-workbench-metric' });
      const labels: Record<string, string> = { five_hour: t('workbench.info.window.five_hour'), seven_day: t('workbench.info.window.seven_day'),
        seven_day_oauth_apps: t('workbench.info.window.seven_day_oauth_apps') };
      row.createSpan({ text: labels[window.label] ?? window.label });
      row.createSpan({ text: `${Math.round(window.usedPercent)}% ${t('workbench.info.used')}` });
      const progress = quotaBody.createEl('progress', { cls: 'opencodian-workbench-meter' });
      progress.max = 100; progress.value = Math.max(0, Math.min(100, window.usedPercent));
      progress.setAttribute('aria-label', `${window.label} ${t('workbench.info.used')}`);
      if (window.resetsAt !== undefined) quotaBody.createDiv({ cls: 'opencodian-workbench-muted',
        text: `${t('workbench.info.resets')} ${new Date(window.resetsAt).toLocaleString()}` });
    }
  }

  private renderStatistics(parent: HTMLElement, state: SessionWorkbenchState): void {
    const statistics = state.statistics;
    if (statistics) {
      const body = this.disclosure(parent, 'statistics', t('workbench.info.statistics'), { icon: 'chart-no-axes-column',
        count: `${statistics.rounds} ${t('workbench.info.rounds')}` });
      const list = body.createEl('dl', { cls: 'opencodian-workbench-counters' });
      const metric = (key: 'messages' | 'toolCalls' | 'model' | 'context' | 'sessionTokens' | 'sessionCost', value: string) => { list.createEl('dt', { text: t(`workbench.info.${key}`) }); list.createEl('dd', { text: value }); };
      metric('messages', String(statistics.messages)); metric('toolCalls', String(statistics.tools));
      if (statistics.model) metric('model', statistics.model);
      if (statistics.context) metric('context', `${statistics.context.tokens.toLocaleString()} / ${statistics.context.window.toLocaleString()}`);
      else metric('context', t('workbench.info.unavailable'));
      if (state.information?.usage) {
        const usage = state.information.usage;
        metric('sessionTokens', (usage.totalTokens ?? usage.inputTokens + usage.outputTokens).toLocaleString());
        if (usage.cost !== undefined) metric('sessionCost', new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(usage.cost));
      }
    }
  }

  private renderSources(parent: HTMLElement, state: SessionWorkbenchState): void {
    const sources = state.contextSources ?? [];
    const sourceBody = this.disclosure(parent, 'sources', t('workbench.info.sources'), { icon: 'layers', count: sources.length ? String(sources.length) : '' });
    if (!sources.length) sourceBody.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.noSources') });
    for (const source of sources) {
      if (source.navigable === false || !source.path && !source.command) {
        const row = sourceBody.createDiv({ cls: 'opencodian-workbench-metric' });
        row.title = source.path ?? source.label;
        row.createSpan({ text: source.label }); row.createSpan({ cls: 'opencodian-workbench-muted', text: source.detail }); continue;
      }
      const row = this.button(sourceBody, source.label, 'file-text', () => this.actions.openResource(source));
      row.addClass('opencodian-workbench-list-row');
      if (source.detail) row.createSpan({ cls: 'opencodian-workbench-row-meta', text: source.detail });
      row.title = source.path ?? source.label;
    }
  }

  private renderMcp(parent: HTMLElement, state: SessionWorkbenchState): void {
    const unavailable = () => t(state.informationStatus === 'loading' ? 'workbench.info.loading' : 'workbench.info.unavailable');
    const mcp = state.information?.mcp;
    const mcpBody = this.disclosure(parent, 'mcp', t('workbench.info.mcp'), { icon: 'plug', count: mcp ? String(mcp.servers.length) : '' });
    mcpBody.createDiv({ cls: 'opencodian-workbench-muted', text: mcp
      ? t(mcp.scope === 'session' ? 'workbench.info.sessionScope' : 'workbench.info.workspaceScope') : unavailable() });
    if (mcp && !mcp.servers.length) mcpBody.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.noMcp') });
    for (const server of mcp?.servers ?? []) {
      const row = mcpBody.createDiv({ cls: 'opencodian-workbench-metric' });
      row.createSpan({ text: server.name });
      row.createSpan({ cls: 'opencodian-workbench-muted', text: [server.status === 'catalog' ? t('workbench.info.catalogStatus') : server.status,
        ...(server.toolCount !== undefined ? [`${server.toolCount} ${t('workbench.info.tools')}`] : [])].join(' · ') });
    }
  }

  renderAgents(parent: HTMLElement, agents: readonly AgentSessionChild[]): void {
    if (!agents.length) return;
    const summary = ['running', 'pending', 'completed', 'failed', 'unknown'] as const;
    const section = this.disclosure(parent, 'agents', t('workbench.info.agents'), { icon: 'bot', count: summary.flatMap((status) => {
      const count = agents.filter((agent) => agent.status === status).length;
      return count ? [`${count} ${t(`workbench.info.agent.${status}`)}`] : [];
    }).join(' · ') });
    for (const status of summary) for (const agent of agents.filter((item) => item.status === status)) {
      const button = this.button(section, agent.title, status === 'completed' ? 'circle-check' : status === 'running' ? 'circle-dot' : 'circle',
        () => this.actions.openChild?.(agent));
      button.addClass('opencodian-workbench-list-row'); button.dataset.agentId = agent.id;
      button.disabled = !agent.readable || !this.actions.openChild;
      button.createSpan({ cls: 'opencodian-workbench-row-meta', text: t(`workbench.info.agent.${status}`) });
      if (agent.detail) button.title = agent.detail;
    }
  }

  renderChild(parent: HTMLElement, child: NonNullable<SessionWorkbenchState['child']>): void {
    this.button(parent, t('workbench.info.returnToParent'), 'arrow-left', () => this.actions.returnToParent?.());
    parent.createEl('h3', { cls: 'opencodian-workbench-child-title', text: child.agent.title });
    parent.createDiv({ cls: 'opencodian-workbench-muted', text: `${child.agent.id} · ${t(`workbench.info.agent.${child.agent.status}`)}` });
    if (child.error) parent.createDiv({ cls: 'opencodian-workbench-error', text: child.error, attr: { role: 'alert' } });
    if (child.loading && !child.messages.length) parent.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.loading') });
    if (!child.loading && !child.error && !child.messages.length) parent.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.emptyChild') });
    const component = this.childComponent = new Component(); component.load();
    for (const message of child.messages) {
      const row = parent.createDiv({ cls: 'opencodian-workbench-child-message' });
      row.createDiv({ cls: 'opencodian-workbench-muted', text: t(message.role === 'user' ? 'workbench.info.user' : 'workbench.info.assistant') });
      const body = row.createDiv({ cls: 'opencodian-workbench-child-content' });
      if (this.actions.app) void MarkdownRenderer.render(this.actions.app, message.content, body, '', component).catch(() => body.setText(message.content));
      else body.setText(message.content);
      for (const tool of message.toolCalls ?? []) {
        const details = row.createEl('details', { cls: 'opencodian-workbench-child-tool' });
        details.createEl('summary', { text: `${tool.name} · ${tool.status ?? 'unknown'}` });
        details.createEl('pre', { text: JSON.stringify(tool.input, null, 2) });
        if (tool.result) details.createEl('pre', { text: tool.result });
      }
    }
  }

  destroy(): void { this.childComponent?.unload(); this.childComponent = null; }
}
