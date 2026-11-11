/** Foldable native information and read-only child transcripts inside the session workbench. */
import { type App, Menu, setIcon } from 'obsidian';

import type { AgentSessionChild, AgentSessionInformation } from '../../../core/agents/backend/AgentService';
import type { AgentGoalCapabilities, AgentGoalCommand, AgentGoalReadback } from '../../../core/agents/backend/BackendGoalRuntime';
import type { SessionTodo } from '../../../core/types';
import type { ChatMessage } from '../../../core/types/chat';
import { t } from '../../../i18n';
import { SessionWorkbenchChildView } from './SessionWorkbenchChildView';
export type WorkbenchPage = 'overview' | 'tasks' | 'files' | 'tools';
/** One native operation on a task row. The coordinator re-validates the row's captured owner before running it. */
export interface WorkbenchTaskAction {
  id: string;
  label: string;
  icon: string;
  disabled?: boolean;
  reason?: string;
  /** Sends (and clears) the row input as the operation value. */
  usesInput?: boolean;
  /** Opens a menu; the chosen id becomes the operation value. */
  choices?: readonly { id: string; label: string }[];
}
export interface WorkbenchTask {
  id: string;
  title: string;
  status: string;
  output?: string;
  messageId?: string;
  canStop?: boolean;
  nativeSessionId?: string;
  nativeBackend?: string;
  nativeJobId?: string;
  nativeTerminalId?: string;
  nativeChildId?: string;
  input?: { label: string; secret?: boolean };
  actions?: readonly WorkbenchTaskAction[];
}
export interface WorkbenchResource { label: string; detail?: string; path?: string; command?: string; navigable?: boolean }
/**
 * One captured `data-draft` value: an input's text/selection/focus, a row's open state, or a presented output text.
 * `authority` is the authoritative `task.output` that output was shown over, so a later render can tell a real change from a tick.
 */
export type WorkbenchDraft = { value?: string; open?: boolean; text?: string; authority?: string; focused?: boolean; selection?: readonly [number | null, number | null] };
/**
 * A native row operation's result that settled while its row was not on screen; kept under the lock key until that row renders again.
 * `basis` is the authoritative `task.output` the output is valid against (null = none): the authority current when an
 * action settled, or when a lazy read started. A result that is behind the authority rendered later is never shown over it.
 */
export type WorkbenchSettlement = { output: string; basis: string | null; draft?: string };
/** Surface-owned row state, keyed by lock key (workbench identity + task id) so it outlives every rebuilt or hidden row. */
export type WorkbenchRowState = { pendings: Map<string, number>; settlements: Map<string, WorkbenchSettlement> };
/** A result may be shown unless a DIFFERENT authoritative output is current: an absent authority contradicts nothing. */
const meetsAuthority = (basis: string | null, current: string | null): boolean => current === null || basis === current;
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
  /** Authoritative changed-files summary projected by the coordinator; absent = neutral entry point, never inferred from git. */
  filesSummary?: string;
  agents?: readonly AgentSessionChild[];
  statistics?: { rounds: number; messages: number; tools: number; model?: string; context?: { tokens: number; window: number } };
  child?: { agent: AgentSessionChild; messages: readonly ChatMessage[]; loading: boolean; error?: string;
    /** Proven child-continuation delivery for the live parent: false = unsupported/unavailable, 'unknown' = probe failed. */
    canContinue?: boolean | 'unknown';
    /** Composer state survives workbench rebuilds: draft, chosen delivery, focus and caret are coordinator-owned. */
    draft?: string; delivery?: 'queue' | 'steer'; composerFocused?: boolean; composerCaret?: number;
    /** Persistent accepted-receipt evidence; only a newer receipt replaces it, never a history read outcome. */
    sendNote?: string };
  /** Native session plan mode: independent of permissions and of the todo plan. A queued change stays pending. */
  nativePlan?: { active: boolean; pending?: boolean; settable: boolean; busy: boolean; notes: readonly string[] };
  /** Native terminal creation for this session; `reason` explains why it is unavailable. */
  nativeTerminals?: { backends: readonly string[]; spawn: boolean; reason?: string };
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
  runTaskAction?(task: WorkbenchTask, action: string, value?: string): Promise<string>;
  setPlanMode?(active: boolean): Promise<void>;
  spawnTerminal?(options: { type: string; name?: string; cwd?: string }): Promise<string>;
  openBackendSettings?(): void;
  mountTools(parent: HTMLElement): void;
  /** Optional seam: the host (through the tools surface) mounts the inline command catalog into a stable host element. */
  mountResources?(parent: HTMLElement): void;
  openTool?(tool: string): void;
  usePlanAsGoal?(text: string): void;
  onPageChange?(page: WorkbenchPage): void;
  openChild?(agent: AgentSessionChild): Promise<void>;
  returnToParent?(): void;
  /** Continuation routing into the backend's own child session; rejects with a readable message. */
  continueChild?(text: string, delivery: 'queue' | 'steer'): Promise<string>;
  /** Silent composer-state persistence; must not trigger a workbench rebuild. */
  onChildComposerInput?(value: string, caret?: number): void;
  onChildComposerDelivery?(delivery: 'queue' | 'steer'): void;
  onChildComposerFocus?(focused: boolean): void;
}

/** `collapsed` seeds a closed default for low-frequency groups; an explicit user choice always wins. */
type Disclosure = (parent: HTMLElement, key: string, title: string, options: { icon: string; count: string; collapsed?: boolean }) => HTMLElement;
type Button = (parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>) => HTMLButtonElement;

export class SessionWorkbenchInformation {
  private readonly childView: SessionWorkbenchChildView;
  /** Bound by the surface: the stable lock key (identity + task id) for the row being rendered. */
  lockKey: ((task: WorkbenchTask) => string) | null = null;
  /** Bound by the surface: the CURRENT connected input of a task row (settlement may land after a rerender). */
  inputLookup: ((task: WorkbenchTask) => HTMLInputElement | null) | null = null;
  /** Bound by the surface: the CURRENT connected row of a task, or null while its rows are hidden or belong to another session. */
  rowLookup: ((task: WorkbenchTask) => HTMLElement | null) | null = null;
  /** Bound by the surface: the authoritative `task.output` in the current state (null = none), a read-only projection for output arbitration. */
  authorityLookup: ((task: WorkbenchTask) => string | null) | null = null;
  /** The most recently rendered spawn form: a settlement after a rebuild reports into it, never into a detached one. */
  private spawnLive: { identity: string; form: HTMLElement; result: HTMLElement; button: HTMLButtonElement } | null = null;
  /** Terminal starts in flight and their last receipt, keyed by workbench identity (UI receipts, not native state). */
  private readonly spawnPending = new Set<string>();
  private readonly spawnReceipts = new Map<string, string>();
  /** The authoritative `task.output` each output element was rendered from; a read or action result shown over it is a snapshot. */
  private readonly authority = new WeakMap<HTMLElement, string>();
  /** Output elements this render filled from the settlement journal: newer than any stashed presentation. */
  private readonly settledOutputs = new WeakSet<HTMLElement>();
  constructor(private readonly actions: SessionWorkbenchActions, private readonly disclosure: Disclosure, private readonly button: Button) {
    this.childView = new SessionWorkbenchChildView(actions);
  }

  /** Session references and the composer catalog precede the low-frequency read-only groups. */
  renderInformation(parent: HTMLElement, state: SessionWorkbenchState, catalogMount?: HTMLElement): void {
    if (state.informationStatus === 'failed') parent.createDiv({ cls: 'opencodian-workbench-error', text: t('workbench.info.failed'), attr: { role: 'status' } });
    this.renderSources(parent, state);
    // Stable tools-owned DOM is reattached here, never emptied or rebuilt with the overview.
    if (catalogMount) parent.appendChild(catalogMount);
    this.renderQuota(parent, state);
    this.renderStatistics(parent, state);
    this.renderMcp(parent, state);
  }

  private renderQuota(parent: HTMLElement, state: SessionWorkbenchState): void {
    const unavailable = () => t(state.informationStatus === 'loading' ? 'workbench.info.loading' : 'workbench.info.unavailable');
    const quota = state.information?.quota;
    const quotaBody = this.disclosure(parent, 'quota', t('workbench.info.quota'), { icon: 'gauge', collapsed: true,
      count: quota?.windows.map((window) => `${Math.round(window.usedPercent)}%`).join(' / ') ?? '' });
    if (!quota?.windows.length) quotaBody.createDiv({ cls: 'opencodian-workbench-muted', text: unavailable() });
    if (quota?.plan) quotaBody.createDiv({ cls: 'opencodian-workbench-muted', text: quota.plan });
    for (const window of quota?.windows ?? []) {
      const item = quotaBody.createDiv({ cls: 'opencodian-workbench-quota-item' });
      const row = item.createDiv({ cls: 'opencodian-workbench-metric' });
      const labels: Record<string, string> = { five_hour: t('workbench.info.window.five_hour'), seven_day: t('workbench.info.window.seven_day'),
        seven_day_oauth_apps: t('workbench.info.window.seven_day_oauth_apps') };
      row.createSpan({ text: labels[window.label] ?? window.label });
      row.createSpan({ text: `${Math.round(window.usedPercent)}% ${t('workbench.info.used')}` });
      const progress = item.createEl('progress', { cls: 'opencodian-workbench-meter' });
      progress.max = 100; progress.value = Math.max(0, Math.min(100, window.usedPercent));
      progress.setAttribute('aria-label', `${window.label} ${t('workbench.info.used')}`);
      if (window.resetsAt !== undefined) item.createDiv({ cls: 'opencodian-workbench-muted',
        text: `${t('workbench.info.resets')} ${new Date(window.resetsAt).toLocaleString()}` });
    }
  }

  private renderStatistics(parent: HTMLElement, state: SessionWorkbenchState): void {
    const statistics = state.statistics;
    if (statistics) {
      const body = this.disclosure(parent, 'statistics', t('workbench.info.statistics'), { icon: 'chart-no-axes-column', collapsed: true,
        count: `${statistics.rounds} ${t('workbench.info.rounds')}` });
      const list = body.createEl('dl', { cls: 'opencodian-workbench-counters' });
      const metric = (key: 'messages' | 'toolCalls' | 'model' | 'context' | 'sessionTokens' | 'sessionCost', value: string) => {
        const row = list.createDiv({ cls: `opencodian-workbench-data-row${key === 'model' ? ' is-wide' : ''}` });
        row.createEl('dt', { text: t(`workbench.info.${key}`) }); row.createEl('dd', { text: value });
      };
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

  /** One disclosure with sent attachments before backend-loaded sources; neither list is repeated elsewhere. */
  private renderSources(parent: HTMLElement, state: SessionWorkbenchState): void {
    const sources = state.contextSources ?? [];
    const attachments = state.resources;
    const total = sources.length + attachments.length;
    const sourceBody = this.disclosure(parent, 'sources', t('workbench.info.sources'), { icon: 'layers', collapsed: true, count: total ? String(total) : '' });
    if (!total) sourceBody.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.noSources') });
    const renderGroup = (label: 'workbench.info.sent' | 'workbench.info.loaded', items: readonly WorkbenchResource[]): void => {
      if (!items.length) return;
      const group = sourceBody.createDiv({ cls: 'opencodian-workbench-source-group' });
      const caption = group.createDiv({ cls: 'opencodian-workbench-detail-caption' });
      caption.createSpan({ text: t(label) });
      caption.createSpan({ cls: 'opencodian-workbench-row-meta', text: String(items.length) });
      for (const source of items) {
        if (source.navigable === false || !source.path && !source.command) {
          const row = group.createDiv({ cls: 'opencodian-workbench-metric' });
          row.title = source.path ?? source.label;
          row.createSpan({ text: source.label }); row.createSpan({ cls: 'opencodian-workbench-muted', text: source.detail }); continue;
        }
        const row = this.button(group, source.label, 'file-text', () => this.actions.openResource(source));
        row.addClass('opencodian-workbench-list-row');
        if (source.detail) row.createSpan({ cls: 'opencodian-workbench-row-detail', text: source.detail });
        setIcon(row.createSpan({ cls: 'opencodian-workbench-row-meta', attr: { 'aria-hidden': 'true' } }), 'arrow-up-right');
        row.title = source.path ?? source.label;
      }
    };
    renderGroup('workbench.info.sent', attachments);
    renderGroup('workbench.info.loaded', sources);
  }

  private renderMcp(parent: HTMLElement, state: SessionWorkbenchState): void {
    const unavailable = () => t(state.informationStatus === 'loading' ? 'workbench.info.loading' : 'workbench.info.unavailable');
    const mcp = state.information?.mcp;
    const mcpBody = this.disclosure(parent, 'mcp', t('workbench.info.mcp'), { icon: 'plug', collapsed: true, count: mcp ? String(mcp.servers.length) : '' });
    if (!mcp) mcpBody.createDiv({ cls: 'opencodian-workbench-muted', text: unavailable() });
    if (mcp && !mcp.servers.length) {
      const empty = mcpBody.createDiv({ cls: 'opencodian-workbench-empty' });
      setIcon(empty.createSpan({ cls: 'opencodian-workbench-empty-icon', attr: { 'aria-hidden': 'true' } }), 'plug');
      const copy = empty.createDiv();
      copy.createEl('strong', { text: t('workbench.info.noMcp') });
      copy.createEl('p', { text: t(mcp.scope === 'session' ? 'workbench.info.sessionScope' : 'workbench.info.workspaceScope') });
    }
    if (mcp?.servers.length) mcpBody.createDiv({ cls: 'opencodian-workbench-detail-note',
      text: t(mcp.scope === 'session' ? 'workbench.info.sessionScope' : 'workbench.info.workspaceScope') });
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

  /**
   * Native plan mode is ONE flat control row, like Goal: the button is the single
   * accessible state carrier (fixed label, state only in aria-pressed). A queued
   * change stays a note in the indented text column and never becomes the active
   * state, so there is no disclosure header duplicating the value.
   */
  renderPlanMode(parent: HTMLElement, state: SessionWorkbenchState): void {
    const plan = state.nativePlan;
    if (!plan) return;
    const value = t(plan.active ? 'workbench.planMode.on' : 'workbench.planMode.off');
    const toggle = this.button(parent, t('workbench.planMode'), 'clipboard-list', () => this.actions.setPlanMode?.(!(plan.pending ?? plan.active)));
    toggle.addClass('opencodian-workbench-control-row'); toggle.title = t('chat.dsh.controls.planScope');
    toggle.setAttribute('aria-pressed', String(plan.active));
    toggle.disabled = !plan.settable || plan.busy || !this.actions.setPlanMode;
    toggle.createSpan({ cls: 'opencodian-workbench-control-state', text: value, attr: { 'aria-hidden': 'true' } });
    const feedback = plan.notes.filter(note => note !== t('chat.dsh.controls.planScope'));
    if (feedback.length) {
      const notes = parent.createDiv({ cls: 'opencodian-workbench-control-note' });
      for (const note of feedback) notes.createEl('p', { text: note });
    }
  }

  /**
   * Inline session activity: background jobs and native session terminals. The
   * grouping reads the task's `nativeTerminalId` metadata only — never its id
   * or label — and the terminal spawn form stays inside the terminals group.
   */
  renderActivity(parent: HTMLElement, state: SessionWorkbenchState, rows: WorkbenchRowState): void {
    const jobs = state.tasks.filter((task) => !task.nativeTerminalId);
    const terminals = state.tasks.filter((task) => Boolean(task.nativeTerminalId));
    const hasTerminals = terminals.length > 0 || Boolean(state.nativeTerminals);
    if (jobs.length) {
      const section = this.disclosure(parent, 'activity', t('workbench.background'), { icon: 'bot', count: String(jobs.length) });
      for (const task of jobs) this.renderTaskRow(section, task, rows);
    } else if (!hasTerminals) {
      // An empty group stays honest but closed by default; it also anchors the legacy tasks redirect.
      this.disclosure(parent, 'activity', t('workbench.background'), { icon: 'bot', count: '', collapsed: true })
        .createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.tasks.empty') });
    }
    if (!hasTerminals) return;
    const section = this.disclosure(parent, 'terminals', t('workbench.sessionTerminals'), { icon: 'terminal', count: terminals.length ? String(terminals.length) : '' });
    for (const task of terminals) this.renderTaskRow(section, task, rows);
    this.renderTerminalSpawn(section, state);
  }

  /**
   * Full inline task row: title/status, output and actions — the anatomy of the
   * retired tasks page rows. Every row keeps its open state and presented output
   * across rebuilds (`data-draft`), because the overview is rebuilt on each tick.
   */
  private renderTaskRow(section: HTMLElement, task: WorkbenchTask, rows: WorkbenchRowState): void {
    const row = section.createEl('details', { cls: 'opencodian-workbench-task', attr: { 'data-task': task.id, 'data-draft': `row:${task.id}` } });
    const summary = row.createEl('summary');
    summary.createSpan({ cls: 'opencodian-workbench-task-title', text: task.title });
    summary.createSpan({ cls: 'opencodian-workbench-row-meta', text: task.status });
    setIcon(summary.createSpan({ cls: 'opencodian-workbench-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    // A result that settled while this row was not on screen is shown now, once.
    // It is projected before drafts are restored, so a stale stash never hides it.
    const key = this.lockKey ? this.lockKey(task) : null;
    const settled = key === null ? undefined : rows.settlements.get(key);
    if (key !== null) rows.settlements.delete(key);
    if (task.output) { const output = this.taskOutput(row, task); output.setText(task.output); this.authority.set(output, task.output); }
    // A journaled result must never cover an authoritative output that moved on while the row was away.
    if (settled && meetsAuthority(settled.basis, task.output || null)) { const output = this.taskOutput(row, task); output.setText(settled.output); this.settledOutputs.add(output); }
    else if (!task.output && this.actions.readTaskOutput) row.addEventListener('toggle', () => {
      if (!row.open || row.querySelector('pre')) return;
      const output = this.taskOutput(row, task); output.setText(t('workbench.tasks.loading'));
      // The read belongs to the task identity and to the authority it starts under (none on such a row):
      // it lands on the live row or in the journal, never on a detached node, and never over a newer authority.
      const basis = this.authority.get(output) ?? null;
      const done = (text: string): void => { this.settleResult(task, key, rows.settlements, { output: text, basis }); };
      void this.actions.readTaskOutput!(task).then(done, (error: unknown) => done(String(error)));
    });
    const actions = row.createDiv({ cls: 'opencodian-workbench-actions' });
    if (task.messageId) this.button(actions, t('workbench.tasks.locate'), 'message-square', () => this.actions.openMessage(task.messageId!));
    if (task.canStop) this.button(actions, t('workbench.goal.stop'), 'square', () => this.actions.stopTask(task));
    this.renderTaskActions({ row, actions, task, ...rows, ...(settled?.draft === undefined ? {} : { draft: settled.draft }) });
  }

  private taskOutput(row: HTMLElement, task: WorkbenchTask): HTMLElement {
    return row.querySelector<HTMLElement>('pre') ?? row.createEl('pre', { attr: { 'data-draft': `output:${task.id}` } });
  }

  /** The authoritative output a result meets: what the live row shows, else the owner session's current state, else the row's last render. */
  private authorityAt(task: WorkbenchTask, live: HTMLElement | null, owned: boolean): string | null {
    if (live) { const shown = live.querySelector<HTMLElement>('pre'); return (shown && this.authority.get(shown)) ?? null; }
    return owned && this.authorityLookup ? this.authorityLookup(task) : task.output || null;
  }

  /**
   * A task result belongs to the task identity, never to a DOM node, and is only
   * as good as the authoritative output it is valid against. It is shown on the
   * row that is LIVE for the same owner; when no such row is on screen (goal
   * detail, child transcript, another conversation) it is journaled under the
   * lock key with the authority it met, and that row's next render shows it only
   * if the authority has not moved on. A lazy read carries the authority it
   * STARTED under and is dropped as soon as that one changed.
   */
  private settleResult(task: WorkbenchTask, key: string | null, settlements: Map<string, WorkbenchSettlement>,
    result: { output: string; basis?: string | null; draft?: string }): HTMLElement | null {
    const owned = key !== null && this.lockKey?.(task) === key;
    const live = owned ? this.rowLookup?.(task) ?? null : null;
    const current = this.authorityAt(task, live, owned);
    if (result.basis !== undefined && !meetsAuthority(result.basis, current)) return live;
    if (live) this.taskOutput(live, task).setText(result.output);
    else if (key !== null) {
      const draft = result.draft ?? settlements.get(key)?.draft;
      settlements.set(key, { output: result.output, basis: current, ...(draft === undefined ? {} : { draft }) });
    }
    return live;
  }

  /**
   * Native operations reuse the task row's buttons and output. Pending state and
   * settlements belong to the task identity (surface-owned maps keyed by identity
   * + task id), never to a DOM node: a rerender rebuilds the row locked, and a
   * settlement goes through `settleResult`, so it unlocks and fills the row that
   * is live for the same owner or waits in the journal for that row's next render.
   */
  renderTaskActions(context: { row: HTMLElement; actions: HTMLElement; task: WorkbenchTask; draft?: string } & WorkbenchRowState): void {
    const { row, actions, task, pendings, settlements } = context;
    const run = this.actions.runTaskAction;
    if (!run || !task.actions?.length) return;
    let input: HTMLInputElement | null = null;
    if (task.input) {
      const label = row.createEl('label', { cls: 'opencodian-workbench-field', text: task.input.label });
      input = label.createEl('input', { type: task.input.secret ? 'password' : 'text', attr: {
        autocomplete: 'off', spellcheck: 'false', 'aria-label': task.input.label, 'data-draft': `input:${task.id}` } });
      row.insertBefore(label, actions);
      // A failed send that settled while this row was hidden returns its draft with the row.
      if (context.draft !== undefined) input.value = context.draft;
    }
    // One pending operation per row across rerenders. The FULL lock key (workbench
    // identity + task id) is captured once here and is the only key this closure
    // ever counts against: settlement ALWAYS releases it, so returning to the same
    // session never finds a stuck lock. DOM effects (output, unlocking a rebuilt
    // row, restoring a draft) happen only while that captured key is still the
    // current owner, so a stale operation from conversation A never touches B.
    const rowButtons: HTMLButtonElement[] = [];
    const capturedKey = this.lockKey ? this.lockKey(task) : null;
    const isCurrent = () => capturedKey !== null && this.lockKey?.(task) === capturedKey;
    const isPending = () => capturedKey !== null && (pendings.get(capturedKey) ?? 0) > 0;
    const lock = (delta: number): void => {
      if (capturedKey === null) return;
      pendings.set(capturedKey, Math.max(0, (pendings.get(capturedKey) ?? 0) + delta));
      const pending = isPending();
      for (const button of rowButtons) if (!button.dataset.capabilityDisabled) button.disabled = pending;
      if (input) input.disabled = pending;
    };
    /** Settles onto the owner's LIVE row (output, unlock, failed draft); a hidden row gets it from the journal later. */
    const report = (text: string, draft?: string): void => {
      const live = this.settleResult(task, capturedKey, settlements, { output: text, ...(draft === undefined ? {} : { draft }) });
      if (!live) return;
      const liveInput = live.querySelector<HTMLInputElement>(`input[data-draft="input:${task.id}"]`);
      // The rebuilt row was rendered locked; this closure's own row is unlocked by `lock`.
      if (live !== row && !isPending()) {
        for (const button of live.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-actions button')) {
          if (!button.dataset.capabilityDisabled) button.disabled = false;
        }
        if (liveInput) liveInput.disabled = false;
      }
      // The failed send's draft returns to the visible input, never over newer typing.
      if (draft !== undefined && liveInput && !liveInput.value) liveInput.value = draft;
    };
    const execute = (id: string, value?: string, draft?: string): Promise<void> => {
      // Admission lives here too, so a menu opened earlier cannot bypass the
      // pending lock or run after its owner was replaced.
      if (!isCurrent() || isPending()) return Promise.resolve();
      lock(1);
      return run(task, id, value).then((text) => { lock(-1); report(text); },
        (error: unknown) => { lock(-1); report(error instanceof Error ? error.message : String(error), draft); });
    };
    for (const action of task.actions) {
      const button = this.button(actions, action.label, action.icon, () => {
        // Pending (or a replaced owner) blocks every operation; a capability-disabled
        // sibling never blocks its enabled neighbors.
        if (!isCurrent() || isPending()) return;
        if (action.choices) {
          const menu = new Menu();
          for (const choice of action.choices) menu.addItem((item) => item.setTitle(choice.label).onClick(() => { void execute(action.id, choice.id); }));
          const bounds = button.getBoundingClientRect();
          menu.showAtPosition({ x: bounds.left, y: bounds.bottom });
          return;
        }
        if (!action.usesInput) return execute(action.id);
        // Admission was checked before the draft is cleared, so a second click
        // while a send is pending cannot consume a newer typed input. A click on a
        // rebuilt row reads the CURRENT visible input, not the closure's snapshot.
        const live = this.inputLookup?.(task) ?? input;
        const value = live?.value ?? '';
        if (live) live.value = '';
        return execute(action.id, value, value);
      });
      // An input-driven action on a row without an input can never run: it stays
      // disabled like a capability-disabled one, across locks and settlements.
      const unusable = Boolean(action.disabled) || Boolean(action.usesInput && !this.inputLookup?.(task) && !input);
      button.disabled = isPending() || unusable;
      if (unusable) button.dataset.capabilityDisabled = 'true';
      if (action.reason) button.title = action.reason;
      rowButtons.push(button);
    }
    if (input) input.disabled = isPending();
  }

  /**
   * Collapsed native terminal spawn inside the session-terminals group, with the
   * same field anatomy as the git worktree form. Optional fields sit in a real
   * advanced group whose open state and values ride the draft mechanism. Starts
   * are single-flight per session; a settlement is reported on the LIVE form of
   * its own identity (or kept as a receipt when that form was rebuilt meanwhile),
   * and the real service capabilities are unchanged.
   */
  renderTerminalSpawn(parent: HTMLElement, state: SessionWorkbenchState): void {
    const terminals = state.nativeTerminals;
    const spawn = this.actions.spawnTerminal;
    if (!terminals || !spawn) return;
    const form = parent.createEl('details', { cls: 'opencodian-workbench-task opencodian-workbench-terminal-spawn', attr: { 'data-draft': 'spawn' } });
    const summary = form.createEl('summary');
    setIcon(summary.createSpan({ cls: 'opencodian-workbench-section-icon', attr: { 'aria-hidden': 'true' } }), 'plus');
    summary.createSpan({ cls: 'opencodian-workbench-task-title', text: t('workbench.nativeTerminal.open') });
    setIcon(summary.createSpan({ cls: 'opencodian-workbench-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    if (!terminals.spawn) {
      if (terminals.reason) form.createEl('p', { cls: 'opencodian-workbench-muted', text: terminals.reason });
      if (this.actions.openBackendSettings) this.button(form, t('workbench.nativeTerminal.settings'), 'settings', () => this.actions.openBackendSettings?.());
      return;
    }
    const identity = state.identity;
    const field = (host: HTMLElement, label: string, key: string) => host.createEl('label', { cls: 'opencodian-workbench-field', text: label })
      .createEl('input', { type: 'text', attr: { 'data-draft': `spawn:${key}` } });
    const type = form.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.nativeTerminal.backend') })
      .createEl('select', { attr: { 'data-draft': 'spawn:type' } });
    for (const backend of terminals.backends) type.createEl('option', { value: backend, text: backend });
    const advanced = form.createEl('details', { cls: 'opencodian-workbench-field-advanced', attr: { 'data-draft': 'spawn:advanced' } });
    advanced.createEl('summary', { text: t('workbench.nativeTerminal.advanced') });
    const name = field(advanced, t('workbench.nativeTerminal.name'), 'name');
    const cwd = field(advanced, t('workbench.nativeTerminal.directory'), 'cwd');
    const result = form.createEl('p', { cls: 'opencodian-workbench-muted', attr: { role: 'status' } });
    const button = this.button(form, t('workbench.nativeTerminal.open'), 'plus', () => {
      if (this.spawnPending.has(identity)) return;
      this.spawnPending.add(identity);
      this.spawnReceipts.delete(identity);
      this.syncSpawn(identity);
      const settle = (text: string) => {
        this.spawnPending.delete(identity);
        this.spawnReceipts.set(identity, text);
        this.syncSpawn(identity);
      };
      return spawn({ type: type.value, ...(name.value.trim() ? { name: name.value.trim() } : {}), ...(cwd.value.trim() ? { cwd: cwd.value.trim() } : {}) })
        .then(settle, (error: unknown) => settle(error instanceof Error ? error.message : String(error)));
    });
    this.spawnLive = { identity, form, result, button };
    this.syncSpawn(identity);
  }

  /** Reflects one session's spawn state on its LIVE form only: a detached or foreign-identity form is never touched. */
  private syncSpawn(identity: string): void {
    const live = this.spawnLive;
    if (!live || live.identity !== identity) return;
    const pending = this.spawnPending.has(identity);
    live.button.disabled = pending;
    if (pending) live.form.setAttribute('aria-busy', 'true'); else live.form.removeAttribute('aria-busy');
    live.result.setText(this.spawnReceipts.get(identity) ?? '');
  }

  /** Captures every `data-draft` value under `parent` so an identity-preserving rebuild can restore it. */
  captureDrafts(parent: HTMLElement): Map<string, WorkbenchDraft> {
    const drafts = new Map<string, WorkbenchDraft>();
    for (const element of parent.querySelectorAll<HTMLElement>('[data-draft]')) {
      const focused = document.activeElement === element;
      if (element instanceof HTMLDetailsElement) drafts.set(element.dataset.draft!, { open: element.open });
      else if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) drafts.set(element.dataset.draft!, { value: element.value, focused,
        ...(element instanceof HTMLInputElement ? { selection: [element.selectionStart, element.selectionEnd] as const } : {}) });
      else {
        const authority = this.authority.get(element);
        drafts.set(element.dataset.draft!, { text: element.textContent ?? '', ...(authority === undefined ? {} : { authority }) });
      }
    }
    return drafts;
  }

  restoreDrafts(parent: HTMLElement, drafts: Map<string, WorkbenchDraft>): void {
    const current = new Map([...parent.querySelectorAll<HTMLElement>('[data-draft]')].map((element) => [element.dataset.draft!, element]));
    for (const [key, draft] of drafts) {
      if (draft.text !== undefined) {
        // A presented output (a read or an action result) is a snapshot, not the authority. It returns
        // only when nothing newer exists: no output yet, or the SAME authoritative output re-rendered by
        // a tick that changed something else. A changed `task.output` or a journaled settlement wins, and
        // a bare copy of the authoritative text is never carried over once the backend stops reporting it.
        const row = current.get(`row:${key.slice('output:'.length)}`);
        const shown = row?.querySelector<HTMLElement>('pre');
        if (!row || draft.text === draft.authority) continue;
        if (!shown) row.createEl('pre', { text: draft.text, attr: { 'data-draft': key } });
        else if (!this.settledOutputs.has(shown) && this.authority.get(shown) === draft.authority) shown.setText(draft.text);
        continue;
      }
      const element = current.get(key);
      if (element instanceof HTMLDetailsElement) element.open = draft.open === true;
      else if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
        // A value the row already carries (a failed send projected back) is newer than an empty stash.
        if (draft.value || !element.value) element.value = draft.value ?? '';
        if (!draft.focused) continue;
        element.focus({ preventScroll: true });
        if (element instanceof HTMLInputElement && draft.selection) element.setSelectionRange(draft.selection[0], draft.selection[1]);
      }
    }
  }

  renderChild(parent: HTMLElement, child: NonNullable<SessionWorkbenchState['child']>): void {
    this.childView.render(parent, child);
  }

  destroy(): void { this.childView.destroy(); }
}
