/** One session workbench surface. Native state and operations are supplied by its coordinator. */
import { addIcon, Scope, setIcon } from 'obsidian';

import type { AgentGoalCommand, AgentGoalSnapshot } from '../../../core/agents/backend/BackendGoalRuntime';
import type { SessionTodo } from '../../../core/types';
import { t } from '../../../i18n';
import { type SessionWorkbenchActions, SessionWorkbenchInformation, type SessionWorkbenchState, type WorkbenchPage } from './SessionWorkbenchInformation';

export type { SessionWorkbenchActions, SessionWorkbenchState, WorkbenchPage, WorkbenchResource,WorkbenchTask } from './SessionWorkbenchInformation';

let nextWorkbenchId = 0;
export const GOAL_ICON = 'opencodian-goal-target';
export const GOAL_ACTIVE_ICON = 'opencodian-goal-target-fill';

// OpenChamber target sprites, commit d4a5a0ef13252fd60800c1a10c0eb08cc4aa15ff.
// MIT copyright and license: assets/workbench/OPENCHAMBER-LICENSE.txt.
addIcon(GOAL_ICON, `<g transform="scale(4.1666666667)"><path d="M12 1.99999C12.5523 1.99999 13 2.4477 13 2.99999C12.9999 3.55224 12.5522 3.99999 12 3.99999C7.58172 3.99999 4 7.58171 4 12C4.00004 16.4182 7.58174 20 12 20C16.4182 20 19.9999 16.4182 20 12C20 11.4477 20.4477 11 21 11C21.5523 11 22 11.4477 22 12C21.9999 17.5228 17.5228 22 12 22C6.47717 22 2.00004 17.5228 2 12C2 6.47714 6.47715 1.99999 12 1.99999ZM12 5.99999C12.5523 5.99999 13 6.4477 13 6.99999C12.9999 7.55224 12.5522 7.99999 12 7.99999C9.79085 7.99999 7.99999 9.79085 7.99999 12C8.00004 14.2091 9.79088 16 12 16C14.2091 16 15.9999 14.2091 16 12C16 11.4477 16.4477 11 17 11C17.5523 11 18 11.4477 18 12C17.9999 15.3137 15.3137 18 12 18C8.68631 18 6.00004 15.3137 6 12C6 8.68628 8.68629 5.99999 12 5.99999ZM17.6562 2.10057C18.0468 1.71005 18.6807 1.71005 19.0713 2.10057C19.4614 2.49105 19.4615 3.12419 19.0713 3.51463L18.3633 4.22069L18.3642 4.22167C17.9737 4.61219 17.9737 5.2452 18.3642 5.63573C18.7548 6.02612 19.3878 6.02621 19.7783 5.63573L20.4853 4.9287C20.8759 4.53839 21.5089 4.53826 21.8994 4.9287C22.2899 5.31915 22.2897 5.95222 21.8994 6.34276L19.7783 8.46483C19.5909 8.65223 19.3363 8.75671 19.0713 8.75682H16.6572L12.707 12.707C12.3165 13.0974 11.6834 13.0974 11.293 12.707C10.9025 12.3165 10.9026 11.6835 11.293 11.293L15.2422 7.34374V4.9287C15.2422 4.66356 15.3477 4.40916 15.5351 4.22167L17.6562 2.10057Z" fill="currentColor"/></g>`);
addIcon(GOAL_ACTIVE_ICON, `<g transform="scale(4.1666666667)"><path d="M12 2C12.5523 2 13 2.44772 13 3C13 3.55228 12.5523 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 11.4477 20.4477 11 21 11C21.5523 11 22 11.4477 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 6C12.5523 6 13 6.44772 13 7C13 7.55228 12.5523 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12C16 11.4477 16.4477 11 17 11C17.5523 11 18 11.4477 18 12C18 15.3137 15.3137 18 12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6ZM18.5713 2.10059C18.8474 2.1006 19.0712 2.32449 19.0713 2.60059V4.42969C19.0716 4.70553 19.2954 4.92866 19.5713 4.92871H21.3994C21.6754 4.92871 21.8992 5.15275 21.8994 5.42871V6.34375L20.0107 8.23242C19.6358 8.60719 19.1268 8.81824 18.5967 8.81836H16.5967L12.707 12.707C12.3165 13.0974 11.6835 13.0975 11.293 12.707C10.9027 12.3165 10.9026 11.6834 11.293 11.293L15.1826 7.4043V5.4043C15.1826 4.87411 15.3928 4.36526 15.7676 3.99023L17.6572 2.10059H18.5713Z" fill="currentColor"/></g>`);

export class SessionWorkbench {
  private readonly root: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly identity: HTMLElement;
  private readonly tabs = new Map<WorkbenchPage, HTMLButtonElement>();
  private readonly pages = new Map<WorkbenchPage, HTMLElement>();
  private readonly observer: ResizeObserver | null;
  private readonly keyboardScope: Scope | null;
  private scopePushed = false;
  private state: SessionWorkbenchState | null = null;
  private page: WorkbenchPage = 'overview';
  private open = false;
  private docked = false;
  private expanded = false;
  private editing = false;
  private goalFocused = false;
  private editor: HTMLTextAreaElement | null = null;
  private budget: HTMLInputElement | null = null;
  private fingerprint = '';
  private readonly disclosureState = new Map<string, boolean>();
  private readonly revealedGoals = new Set<string>();
  private readonly informationView: SessionWorkbenchInformation;
  private readonly transcriptScroll = new Map<string, number>();
  private readonly preferences = new Map<string, { page: WorkbenchPage; docked: boolean; expanded: boolean }>();
  private focusOrigin: HTMLElement | null = null;
  private readonly restoreFocus = () => {
    const target = this.focusOrigin?.isConnected ? this.focusOrigin
      : this.boundary.querySelector<HTMLElement>('.opencodian-composer-goal-button') ?? this.trigger;
    target.focus();
  };
  private readonly onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && this.open && this.expanded) {
      const elements = [...this.panel.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, summary, [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      const first=elements[0]; const last=elements.at(-1);
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
      return;
    }
    if (event.key !== 'Escape' || !this.open) return;
    event.preventDefault(); event.stopPropagation();
    if (this.editing) { this.editing = false; this.renderOverview(); }
    else this.setOpen(false);
  };

  constructor(private readonly boundary: HTMLElement, private readonly actions: SessionWorkbenchActions) {
    this.informationView = new SessionWorkbenchInformation(actions, (...args) => this.disclosure(...args), (...args) => this.button(...args));
    this.keyboardScope = actions.app ? new Scope(actions.app.scope) : null;
    this.keyboardScope?.register([], 'Escape', (event) => { this.onKeydown(event); return false; });
    const id = `opencodian-workbench-${++nextWorkbenchId}`;
    this.root = boundary.createDiv({ cls: 'opencodian-workbench-host is-overview' });
    this.trigger = this.button(this.root, t('workbench.title'), 'panels-top-left', () => {
      this.goalFocused = false; this.renderOverview(); this.setOpen(!this.open);
    });
    this.trigger.addClass('opencodian-workbench-trigger');
    this.trigger.lastElementChild?.remove();
    this.trigger.setAttribute('aria-controls', id);
    this.trigger.setAttribute('aria-expanded', 'false');
    this.panel = this.root.createDiv({ cls: 'opencodian-workbench-panel', attr: { id, role: 'region', 'aria-label': t('workbench.title') } });
    this.panel.hidden = true;
    const header = this.panel.createDiv({ cls: 'opencodian-workbench-header' });
    const heading = header.createDiv({ cls: 'opencodian-workbench-heading' });
    this.title = heading.createDiv({ cls: 'opencodian-workbench-session' });
    this.title.setText(t('workbench.title'));
    const controls = header.createDiv({ cls: 'opencodian-workbench-actions' });
    this.iconButton(controls, t('workbench.refresh'), 'refresh-cw', () => actions.refresh());
    this.iconButton(controls, t('workbench.dock'), 'panel-right', () => { this.docked = !this.docked; this.syncLayout(); });
    this.iconButton(controls, t('workbench.expand'), 'maximize-2', () => { this.expanded = !this.expanded; this.syncLayout(); });
    this.iconButton(controls, t('workbench.close'), 'minimize-2', () => this.setOpen(false));
    this.identity = this.panel.createDiv({ cls: 'opencodian-workbench-identity' });
    const rail = this.panel.createDiv({ cls: 'opencodian-workbench-tabs', attr: { role: 'tablist', 'aria-label': t('workbench.title') } });
    const body = this.panel.createDiv({ cls: 'opencodian-workbench-body' });
    const names = { overview: t('workbench.overview'), tasks: t('workbench.tasks'), files: t('workbench.files'), tools: t('workbench.tools') };
    for (const name of Object.keys(names) as WorkbenchPage[]) {
      const tab = rail.createEl('button', { text: names[name], attr: { type: 'button', role: 'tab', id: `${id}-${name}-tab`,
        'aria-controls': `${id}-${name}`, 'aria-selected': String(name === this.page), tabindex: name === this.page ? '0' : '-1' } });
      this.tabs.set(name, tab);
      tab.addEventListener('click', () => this.setPage(name));
      tab.addEventListener('keydown', (event) => {
        const list = [...this.tabs.keys()]; const index = list.indexOf(name);
        const next = event.key === 'ArrowRight' ? (index + 1) % list.length : event.key === 'ArrowLeft' ? (index + list.length - 1) % list.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : null;
        if (next !== null) { event.preventDefault(); this.setPage(list[next]); this.tabs.get(list[next])?.focus(); }
      });
      const page = body.createDiv({ cls: `opencodian-workbench-page opencodian-workbench-${name}`, attr: {
        id: `${id}-${name}`, role: 'tabpanel', 'aria-labelledby': `${id}-${name}-tab`,
      } });
      page.hidden = name !== this.page; this.pages.set(name, page);
    }
    actions.mountTools(this.pages.get('tools')!);
    this.panel.addEventListener('keydown', this.onKeydown);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.syncLayout());
    this.observer?.observe(boundary);
    const input=boundary.querySelector('.opencodian-input-area'); if(input) this.observer?.observe(input);
    this.syncLayout();
  }

  getFilesMount(): HTMLElement { return this.pages.get('files')!; }
  getToolsMount(): HTMLElement { return this.pages.get('tools')!; }
  isMounted(boundary: HTMLElement): boolean { return this.root.parentElement === boundary; }
  isVisible(): boolean { return this.open; }

  setState(state: SessionWorkbenchState): void {
    const body = this.pages.get('overview')!.parentElement!;
    if (this.state && this.page === 'overview') this.transcriptScroll.set(
      `${this.state.identity}:${this.state.child?.agent.id ?? 'main'}`, body.scrollTop);
    if (this.state?.identity !== state.identity) {
      if (this.state) this.preferences.set(this.state.identity, { page: this.page, docked: this.docked, expanded: this.expanded });
      const preference = this.preferences.get(state.identity);
      this.docked = preference?.docked ?? false; this.expanded = preference?.expanded ?? false;
      this.setPage(preference?.page ?? 'overview'); this.syncLayout();
      this.editing = false; this.goalFocused = false; this.editor = null; this.budget = null; this.fingerprint = '';
    }
    this.state = state;
    this.title.setText(t(this.goalFocused ? 'workbench.goal.title' : 'workbench.title'));
    this.title.title = state.title;
    this.identity.setText([state.backend, state.sessionId].filter(Boolean).join(' · '));
    const goal = state.goal.goal;
    const active = state.todos.find((todo) => todo.status === 'in_progress');
    const summary = goal ? this.goalLabel(goal) : state.armed ? t('workbench.goal.armed')
      : active?.content ?? (state.tasks.length ? `${t('workbench.tasks')} · ${state.tasks.length}` : t('workbench.title'));
    this.trigger.setAttribute('aria-label', `${t('workbench.title')}: ${summary}`);
    this.trigger.setAttribute('title', `${summary} · ${state.tasks.length} ${t('workbench.tasks')}`);
    this.trigger.querySelector('.opencodian-workbench-trigger-state')?.remove();
    this.trigger.createSpan({ cls: 'opencodian-workbench-trigger-state', text: summary });
    const fingerprint = JSON.stringify(state, (key, value: unknown) => ['observedAt', 'updatedAt', 'timestamp'].includes(key) ? undefined : value);
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      if (!this.editing) this.renderOverview();
      this.renderTasks();
      if (this.page === 'overview') body.scrollTop = this.transcriptScroll.get(`${state.identity}:${state.child?.agent.id ?? 'main'}`) ?? 0;
    }
  }

  openGoal(): void {
    if (this.state?.child) this.actions.returnToParent?.();
    if (this.state) this.revealedGoals.add(this.state.identity);
    this.setPage('overview'); this.goalFocused = true; this.renderOverview(); this.setOpen(true);
    const section = this.pages.get('overview')!.querySelector<HTMLDetailsElement>('[data-section="goal"]');
    if (section) {
      section.open = true;
      const body = this.pages.get('overview')!.parentElement!;
      body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top;
      section.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
    }
  }

  setPage(page: WorkbenchPage): void {
    if (this.goalFocused) { this.goalFocused = false; this.editing = false; this.renderOverview(); }
    this.page = page;
    this.root.toggleClass('is-overview', page === 'overview');
    for (const [key, tab] of this.tabs) { tab.setAttribute('aria-selected', String(key === page)); tab.tabIndex = key === page ? 0 : -1; }
    for (const [key, element] of this.pages) element.hidden = key !== page;
    this.actions.onPageChange?.(page);
  }

  private setOpen(open: boolean): void {
    if (this.keyboardScope && open !== this.scopePushed) {
      if (open) this.actions.app!.keymap.pushScope(this.keyboardScope);
      else this.actions.app!.keymap.popScope(this.keyboardScope);
      this.scopePushed = open;
    }
    if (open && !this.open) this.focusOrigin = document.activeElement instanceof HTMLElement
      && this.boundary.contains(document.activeElement) ? document.activeElement : this.trigger;
    this.open = open;
    this.root.toggleClass('is-open', open);
    this.panel.hidden = !open;
    this.trigger.setAttribute('aria-expanded', String(open));
    this.syncLayout();
    if (open) {
      const target = [...this.panel.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')]
        .find((element) => element.getClientRects().length > 0);
      (target ?? this.tabs.get(this.page))?.focus();
    } else this.restoreFocus();
  }

  private syncLayout(): void {
    const bounds=this.boundary.getBoundingClientRect(); const width=bounds.width;
    const input=this.boundary.querySelector('.opencodian-input-area')?.getBoundingClientRect();
    const bottom=input?.height ? Math.max(12,bounds.bottom-input.top+8) : 160;
    this.root.style.setProperty('--workbench-bottom',`${bottom}px`);
    this.root.toggleClass('is-narrow', width < 640);
    this.root.toggleClass('is-expanded', this.expanded);
    this.panel.setAttribute('role',this.expanded?'dialog':'region');
    if(this.expanded) this.panel.setAttribute('aria-modal','true'); else this.panel.removeAttribute('aria-modal');
    const docked = this.open && this.docked && !this.expanded && width >= 960;
    this.root.toggleClass('is-docked', docked);
    this.boundary.toggleClass('has-workbench-docked', docked);
  }

  private renderOverview(): void {
    const parent = this.pages.get('overview')!;
    const scrollTop = parent.scrollTop;
    parent.empty();
    const state = this.state;
    if (!state) return;
    this.title.setText(t(this.goalFocused ? 'workbench.goal.title' : 'workbench.title'));
    this.informationView.destroy();
    if (state.child) { this.informationView.renderChild(parent, state.child); parent.scrollTop = scrollTop; return; }
    if (this.goalFocused) this.button(parent, t('workbench.goal.backToInformation'), 'arrow-left', () => {
      this.goalFocused = false; this.editing = false; this.renderOverview();
    });
    else this.informationView.renderInformation(parent, state);
    const readback = state.goal;
    const showGoal = Boolean(readback.goal || state.armed || this.revealedGoals.has(state.identity));
    if (showGoal && readback.status !== 'ready') {
      const region = parent.createDiv({ cls: 'opencodian-workbench-evidence', attr: { role: 'status' } });
      region.createEl('strong', { text: t(`workbench.evidence.${readback.status}`) });
      if (readback.reason) region.createDiv({ text: readback.reason });
      this.button(region, t('workbench.refresh'), 'refresh-cw', () => this.actions.refresh());
    }
    if (state.error) parent.createDiv({ cls: 'opencodian-workbench-error', text: state.error, attr: { role: 'alert' } });
    if (showGoal) this.renderGoal(parent, state);
    if (this.goalFocused) { parent.scrollTop = 0; return; }
    if (state.todos.length) this.renderPlan(parent, state.todos, true);
    this.informationView.renderAgents(parent, state.agents ?? []);
    if (state.tasks.length) {
      const tasks = this.disclosure(parent, 'activity', t('workbench.background'), { icon: 'bot', count: String(state.tasks.length) });
      for (const task of state.tasks.slice(-3)) {
        const row = this.button(tasks, task.title, 'circle-dot', () => this.setPage('tasks'));
        row.addClass('opencodian-workbench-list-row');
        row.createSpan({ cls: 'opencodian-workbench-row-meta', text: task.status });
      }
    }
    const files = this.disclosure(parent, 'files', t('workbench.files'), { icon: 'files', count: '' });
    this.button(files, t('workbench.info.openFiles'), 'file-diff', () => this.setPage('files'));
    const shortcuts = parent.createDiv({ cls: 'opencodian-workbench-shortcuts' });
    for (const [tool, icon, label] of [['terminal', 'terminal', t('workbench.terminal')], ['git', 'git-branch', t('workbench.git')],
      ['browser', 'globe', t('workbench.browser')], ['context', 'layers', t('workbench.resources')]]) {
      const button = this.button(shortcuts, label, icon, () => { this.setPage('tools'); this.actions.openTool?.(tool); });
      button.addClass('opencodian-workbench-shortcut');
    }
    parent.scrollTop = scrollTop;
  }

  private renderGoal(parent: HTMLElement, state: SessionWorkbenchState): void {
    const goal = state.goal.goal;
    const section = this.disclosure(parent, 'goal', t('workbench.goal.title'), { icon: GOAL_ICON, count: goal ? this.goalLabel(goal) : '' });
    if (!goal) {
      const button = this.button(section, state.armed ? t('workbench.goal.cancelArm') : t('workbench.goal.create'), 'plus', () => this.actions.armGoal());
      button.addClass('opencodian-workbench-list-row');
      button.disabled = !state.capabilities || state.goal.status === 'unavailable' || state.busy;
      section.createEl('p', { cls: 'opencodian-workbench-muted opencodian-workbench-empty-hint', text: state.armed ? t('workbench.goal.armedHelp') : t('workbench.goal.empty') });
      if (state.capabilities?.source === 'extension') section.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.goal.extensionHelp') });
    } else if (this.editing) this.renderEditor(section, goal);
    else {
      section.createDiv({ cls: 'opencodian-workbench-objective', text: goal.objective });
      this.renderGoalControls(section, state, goal);
      if (goal.reason) section.createEl('p', { cls: 'opencodian-workbench-reason', text: goal.reason });
      this.renderGoalCounters(section, goal);
      section.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.goal.supplementHelp') });
      if (state.capabilities?.pauseMode === 'execution') section.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.goal.claudeResume') });
      section.createDiv({ cls: 'opencodian-workbench-source', text: `${t(goal.source === 'native' ? 'workbench.goal.native' : 'workbench.goal.extension')} · ${goal.driver} · ${goal.rawStatus}` });
    }
  }

  private renderGoalCounters(section: HTMLElement, goal: AgentGoalSnapshot): void {
      const counters = section.createEl('dl', { cls: 'opencodian-workbench-counters' });
      const metric = (label: string, value: string) => { counters.createEl('dt', { text: label }); counters.createEl('dd', { text: value }); };
      if (goal.rounds !== undefined) metric(t('workbench.goal.rounds'), `${goal.rounds}${goal.maxRounds !== undefined ? ` / ${goal.maxRounds}` : ''}`);
      if (goal.automaticResponses !== undefined) metric(t('workbench.goal.responses'), String(goal.automaticResponses));
      if (goal.tokensUsed !== undefined) metric(t('workbench.goal.tokens'), `${goal.tokensUsed.toLocaleString()}${goal.tokenBudget != null ? ` / ${goal.tokenBudget.toLocaleString()}` : ''}`);
      if (goal.elapsedSeconds !== undefined) metric(t('workbench.goal.time'), `${Math.floor(goal.elapsedSeconds / 60)}:${String(Math.floor(goal.elapsedSeconds % 60)).padStart(2, '0')}`);
      if (goal.armed !== undefined) metric(t('workbench.goal.continuation'), goal.armed ? t('workbench.goal.armedNative') : t('workbench.goal.disarmed'));
  }

  private renderGoalControls(section: HTMLElement, state: SessionWorkbenchState, goal: AgentGoalSnapshot): void {
      const controls = section.createDiv({ cls: 'opencodian-workbench-actions' });
      const caps = state.capabilities;
      if (!caps || state.goal.status === 'unavailable') return;
      this.renderGoalExecutionControls(controls, state, goal);
      if (caps.actions.includes('edit')) this.button(controls, t(caps.editMode === 'replace' ? 'workbench.goal.replace' : 'workbench.goal.edit'), 'pencil', () => {
        this.editing = true; this.renderOverview(); this.editor?.focus();
      }).disabled = state.busy || state.goal.status !== 'ready';
      if (caps.actions.includes('clear')) this.actionButton(controls, t(goal.status === 'complete' ? 'workbench.goal.removeCompleted' : 'workbench.goal.clear'), 'circle-x', { action: 'clear' });
      if (goal.status === 'complete' && caps.actions.includes('set')) this.button(controls, t('workbench.goal.arm'), GOAL_ICON, () => this.actions.armGoal()).disabled = state.busy || state.goal.status !== 'ready';
  }

  private renderGoalExecutionControls(controls: HTMLElement, state: SessionWorkbenchState, goal: AgentGoalSnapshot): void {
    const caps = state.capabilities;
    if (!caps) return;
    if (caps.actions.includes('pause') && goal.status === 'active' && goal.execution !== 'stopped' && goal.armed !== false)
      this.actionButton(controls, t(caps.pauseMode === 'execution' ? 'workbench.goal.stop' : 'workbench.goal.pause'), 'pause', { action: 'pause' });
    if (caps.actions.includes('resume') && !['complete', 'unknown'].includes(goal.status)
      && (['paused', 'blocked', 'limited', 'waiting'].includes(goal.status) || goal.execution === 'stopped' || goal.armed === false))
      this.actionButton(controls, t(caps.pauseMode === 'execution' ? 'workbench.goal.continue' : 'workbench.goal.resume'), 'play', { action: 'resume' });
  }

  private renderEditor(parent: HTMLElement, goal: AgentGoalSnapshot): void {
    const identity = this.state?.identity;
    const label = parent.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.goal.condition') });
    this.editor = label.createEl('textarea', { attr: { rows: '5' } });
    this.editor.value = goal.objective;
    const editor = this.editor;
    this.budget = null;
    const capabilities = this.state?.capabilities;
    if (capabilities?.objectiveLimit) this.editor.maxLength = capabilities.objectiveLimit;
    if (capabilities?.budgets.includes('tokens')) {
      const budgetLabel = parent.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.goal.tokenBudget') });
      this.budget = budgetLabel.createEl('input', { type: 'number', attr: { min: '1', step: '1', placeholder: t('workbench.goal.noBudget') } });
      this.budget.value = goal.tokenBudget == null ? '' : String(goal.tokenBudget);
    }
    if (capabilities?.editMode === 'replace') parent.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.goal.replaceHelp') });
    const failure = parent.createDiv({ cls: 'opencodian-workbench-error', attr: { role: 'alert' } });
    failure.hidden = true;
    const actions = parent.createDiv({ cls: 'opencodian-workbench-actions' });
    const save = this.button(actions, t(capabilities?.editMode === 'replace' ? 'workbench.goal.replace' : 'workbench.save'), 'check', async () => {
      const before = this.state;
      if (!before || before.identity !== identity || this.editor !== editor || before.busy || before.goal.status !== 'ready') return;
      const objective = editor.value;
      if (!objective.trim()) { editor.focus(); return; }
      if (this.budget && !this.budget.reportValidity()) return;
      save.disabled = true;
      try {
        await this.actions.controlGoal({ action: 'edit', objective,
          ...(this.budget ? { tokenBudget: this.budget.value ? Number(this.budget.value) : null } : {}),
          ...(goal.revision !== undefined ? { expectedRevision: goal.revision } : {}),
        });
        const current = this.state;
        if (!current || current.identity !== identity || this.editor !== editor) return;
        if (current.error) { failure.setText(current.error); failure.hidden = false; }
        else { this.editing = false; this.renderOverview(); }
      } catch (error) {
        if (failure.isConnected) {
          failure.setText(error instanceof Error ? error.message : String(error)); failure.hidden = false;
        }
      } finally { save.disabled = Boolean(this.state?.busy) || this.state?.goal.status !== 'ready'; }
    });
    save.disabled = this.state?.busy === true || this.state?.goal.status !== 'ready';
    this.button(actions, t('workbench.cancel'), 'x', () => { this.editing = false; this.renderOverview(); });
  }

  private renderPlan(parent: HTMLElement, todos: readonly SessionTodo[], compact = false): void {
    const section = this.disclosure(parent, 'plan', t('workbench.plan'), { icon: 'list-checks', count: `${todos.filter((todo) => todo.status === 'completed').length} / ${todos.length}` });
    if (!todos.length) { section.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.plan.empty') }); return; }
    for (const todo of compact ? todos.slice(0, 5) : todos) {
      const row = section.createDiv({ cls: 'opencodian-workbench-todo' });
      row.dataset.status = todo.status;
      const icon = row.createSpan(); setIcon(icon, todo.status === 'completed' ? 'circle-check' : todo.status === 'in_progress' ? 'circle-dot' : 'circle');
      row.createSpan({ text: todo.content });
      row.setAttribute('aria-label', `${todo.content} · ${todo.status}`);
    }
    if (compact) this.button(section, t('workbench.plan.open'), 'list-checks', () => this.setPage('tasks'));
    else if (this.actions.usePlanAsGoal) this.button(section, t('workbench.plan.asGoal'), GOAL_ICON, () => this.actions.usePlanAsGoal?.(todos.map((todo) => `- ${todo.content}`).join('\n')));
  }

  private disclosure(parent: HTMLElement, key: string, title: string, options: { icon: string; count: string }): HTMLElement {
    const identity = `${this.state?.identity}:${key}`;
    const section = parent.createEl('details', { cls: 'opencodian-workbench-section', attr: { 'data-section': key } });
    section.open = this.disclosureState.get(identity) ?? true;
    section.addEventListener('toggle', () => { if (section.isConnected) this.disclosureState.set(identity, section.open); });
    const heading = section.createEl('summary', { cls: 'opencodian-workbench-section-heading' });
    const glyph = heading.createSpan({ cls: 'opencodian-workbench-section-icon' }); setIcon(glyph, options.icon);
    heading.createSpan({ text: title });
    heading.createSpan({ cls: 'opencodian-workbench-row-meta', text: options.count, attr: { title: options.count } });
    const arrow = heading.createSpan({ cls: 'opencodian-workbench-chevron' }); setIcon(arrow, 'chevron-right');
    return section.createDiv({ cls: 'opencodian-workbench-section-body' });
  }

  private renderTasks(): void {
    const parent = this.pages.get('tasks')!;
    const scrollTop = parent.scrollTop; parent.empty();
    if (!this.state) return;
    if (this.state.todos.length) this.renderPlan(parent, this.state.todos);
    this.informationView.renderAgents(parent, this.state.agents ?? []);
    const section = this.disclosure(parent, 'tasks', t('workbench.background'), { icon: 'bot', count: String(this.state.tasks.length) });
    if (!this.state.tasks.length) section.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.tasks.empty') });
    for (const task of this.state.tasks) {
      const row = section.createEl('details', { cls: 'opencodian-workbench-task' });
      const summary = row.createEl('summary');
      summary.createSpan({ text: task.title });
      summary.createSpan({ cls: 'opencodian-workbench-muted', text: task.status });
      if (task.output) row.createEl('pre', { text: task.output });
      else if (this.actions.readTaskOutput) row.addEventListener('toggle', () => {
        if (!row.open || row.querySelector('pre')) return;
        const output = row.createEl('pre', { text: t('workbench.tasks.loading') });
        void this.actions.readTaskOutput!(task).then((text) => output.setText(text)).catch((error) => output.setText(String(error)));
      });
      const actions = row.createDiv({ cls: 'opencodian-workbench-actions' });
      if (task.messageId) this.button(actions, t('workbench.tasks.locate'), 'message-square', () => this.actions.openMessage(task.messageId!));
      if (task.canStop) this.button(actions, t('workbench.goal.stop'), 'square', () => this.actions.stopTask(task));
    }
    parent.scrollTop = scrollTop;
  }

  private actionButton(parent: HTMLElement, label: string, icon: string, command: AgentGoalCommand): void {
    const button = this.button(parent, label, icon, () => this.actions.controlGoal(command));
    button.disabled = this.state?.busy === true || this.state?.goal.status !== 'ready';
  }

  private iconButton(parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = this.button(parent, label, icon, action);
    button.lastElementChild?.remove();
    return button;
  }

  private button(parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'opencodian-workbench-button', attr: { type: 'button', 'aria-label': label, title: label } });
    const glyph = button.createSpan(); setIcon(glyph, icon);
    button.createSpan({ text: label });
    button.addEventListener('click', () => { void Promise.resolve().then(action).catch(() => undefined); });
    return button;
  }

  private goalLabel(goal: AgentGoalSnapshot): string {
    if (goal.execution === 'stopping') return t('workbench.goal.stopping');
    if (goal.execution === 'stopped' && goal.status === 'active') return t('workbench.goal.executionStopped');
    if (goal.execution === 'evaluating' && goal.status === 'active') return t('workbench.goal.evaluating');
    if (goal.armed === false && goal.status === 'active') return t('workbench.goal.disarmed');
    return t(`workbench.goal.status.${goal.status}`);
  }

  destroy(): void {
    this.informationView.destroy();
    if (this.keyboardScope && this.scopePushed) this.actions.app!.keymap.popScope(this.keyboardScope);
    this.scopePushed = false;
    this.observer?.disconnect();
    this.panel.removeEventListener('keydown', this.onKeydown);
    this.boundary.removeClass('has-workbench-docked');
    this.root.remove();
  }
}
