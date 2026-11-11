/** One session workbench surface. Native state and operations are supplied by its coordinator. */
import { addIcon, Scope, setIcon } from 'obsidian';

import type { AgentGoalCommand, AgentGoalSnapshot } from '../../../core/agents/backend/BackendGoalRuntime';
import type { SessionTodo } from '../../../core/types';
import { t } from '../../../i18n';
import { type SessionWorkbenchActions, SessionWorkbenchInformation, type SessionWorkbenchState, type WorkbenchDraft, type WorkbenchPage, type WorkbenchSettlement } from './SessionWorkbenchInformation';

export type { SessionWorkbenchActions, SessionWorkbenchState, WorkbenchPage, WorkbenchResource,WorkbenchTask, WorkbenchTaskAction } from './SessionWorkbenchInformation';

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
  private readonly back: HTMLButtonElement;
  private readonly pages = new Map<WorkbenchPage, HTMLElement>();
  private readonly observer: ResizeObserver | null;
  private readonly keyboardScope: Scope | null;
  private scopePushed = false;
  private state: SessionWorkbenchState | null = null;
  private page: WorkbenchPage = 'overview';
  private tool = 'terminal';
  private open = false;
  private docked = false;
  private expanded = false;
  private editing = false;
  private goalFocused = false;
  private editor: HTMLTextAreaElement | null = null;
  private budget: HTMLInputElement | null = null;
  private fingerprint = '';
  /** Identity whose task rows the overview currently shows; gates draft capture and live-input lookup. */
  private overviewIdentity = '';
  /** Whether the overview DOM currently holds the inline rows (false while a child transcript or the goal detail replaces them). */
  private overviewRows = false;
  /** Last drafts of the inline rows per session identity: kept while those rows are not rendered, so A→B→A restores them. */
  private readonly overviewDrafts = new Map<string, Map<string, WorkbenchDraft>>();
  /** Stable host for the tools-owned inline command catalog: detached and reappended across overview rebuilds, never emptied. */
  private readonly resourceMount: HTMLElement;
  /** The catalog editor detached by the last rebuild: refocused only when focus was actually dropped. */
  private mountFocus: { element: HTMLElement; range: readonly [number, number] | null } | null = null;
  /** Pending native row operations keyed by workbench identity + task id; owned by the long-lived surface. */
  private readonly taskPendings = new Map<string, number>();
  /** Native row results that settled while their row was hidden, projected by that row's next render. */
  private readonly taskSettlements = new Map<string, WorkbenchSettlement>();
  private readonly disclosureState = new Map<string, boolean>();
  private readonly revealedGoals = new Set<string>();
  private readonly informationView: SessionWorkbenchInformation;
  private readonly transcriptScroll = new Map<string, number>();
  /** The overview control that opened another card, per scroll key, so back navigation returns to the right origin. */
  private readonly overviewOrigins = new Map<string, string>();
  private readonly preferences = new Map<string, { page: WorkbenchPage; tool: string; docked: boolean; expanded: boolean }>();
  private focusOrigin: HTMLElement | null = null;
  private readonly restoreFocus = () => {
    const target = this.focusOrigin?.isConnected ? this.focusOrigin
      : this.boundary.querySelector<HTMLElement>('.opencodian-composer-goal-button') ?? this.trigger;
    target.focus();
  };
  /**
   * Handles panel Escape and the expanded focus trap. Returns whether the surface
   * handled the key: a native-keys host (the tools xterm mount) owns its own
   * Escape (vi mode, running commands), so the workbench neither closes nor
   * prevents default there.
   */
  private readonly onKeydown = (event: KeyboardEvent): boolean => {
    if (event.key === 'Tab' && this.open && this.expanded) {
      const elements = this.reachable('button:not(:disabled), input, textarea, select, summary, [tabindex="0"]');
      const first=elements[0]; const last=elements.at(-1);
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
      return true;
    }
    if (event.key !== 'Escape' || !this.open) return false;
    if (event.target instanceof Element && event.target.closest('[data-workbench-native-keys], .xterm')) return false;
    event.preventDefault(); event.stopPropagation();
    if (this.editing) { this.editing = false; this.renderOverview(); }
    else this.setOpen(false);
    return true;
  };

  constructor(private readonly boundary: HTMLElement, private readonly actions: SessionWorkbenchActions) {
    this.informationView = new SessionWorkbenchInformation(actions, (...args) => this.disclosure(...args), (...args) => this.button(...args));
    // Pending native operations are keyed by the workbench identity so a rerender
    // of the same session rebuilds rows locked and settlements unlock the live row.
    this.informationView.lockKey = (task) => `${this.state?.identity ?? ''}:${task.id}`;
    this.informationView.rowLookup = (task) => {
      // Only rows of the CURRENT workbench identity are live targets: a stale
      // operation from another conversation must never find one here.
      if (!this.state || this.state.identity !== this.overviewIdentity) return null;
      // Attribute match avoids CSS.escape (unavailable in the test DOM): task ids are our own
      // `terminal:`/`child:`/`job:` prefixed strings, so an exact quoted value cannot cross-match.
      return this.pages.get('overview')?.querySelector<HTMLElement>(`details[data-task="${task.id}"]`) ?? null;
    };
    this.informationView.inputLookup = (task) =>
      this.informationView.rowLookup?.(task)?.querySelector<HTMLInputElement>(`input[data-draft="input:${task.id}"]`) ?? null;
    this.informationView.authorityLookup = (task) => this.state?.tasks.find((item) => item.id === task.id)?.output || null;
    this.keyboardScope = actions.app ? new Scope(actions.app.scope) : null;
    // A scope handler swallows the key by returning false. Only a HANDLED Escape
    // does that; an Escape owned by a native-keys host (xterm) passes through.
    this.keyboardScope?.register([], 'Escape', (event) => !this.onKeydown(event));
    const id = `opencodian-workbench-${++nextWorkbenchId}`;
    this.root = boundary.createDiv({ cls: 'opencodian-workbench-host is-overview' });
    this.trigger = this.button(this.root, t('workbench.information'), 'info', () => {
      // Re-project BEFORE rendering: this.state is a stale snapshot after
      // silent coordinator updates, and reopening on it would resurface an
      // old draft over the newest one.
      this.actions.refresh(); this.setPage('overview'); this.renderOverview(); this.setOpen(!this.open);
    });
    this.trigger.addClass('opencodian-workbench-trigger');
    this.trigger.lastElementChild?.remove();
    this.trigger.setAttribute('aria-controls', id);
    this.trigger.setAttribute('aria-expanded', 'false');
    this.panel = this.root.createDiv({ cls: 'opencodian-workbench-panel', attr: { id, role: 'region', 'aria-label': t('workbench.information') } });
    this.panel.hidden = true;
    const header = this.panel.createDiv({ cls: 'opencodian-workbench-header' });
    this.back = this.iconButton(header, t('workbench.goal.backToInformation'), 'arrow-left', () => this.setPage('overview'));
    this.back.hidden = true;
    const heading = header.createDiv({ cls: 'opencodian-workbench-heading' });
    this.title = heading.createDiv({ cls: 'opencodian-workbench-session' });
    this.title.setText(t('workbench.information'));
    const controls = header.createDiv({ cls: 'opencodian-workbench-actions' });
    this.iconButton(controls, t('workbench.refresh'), 'refresh-cw', () => actions.refresh());
    this.iconButton(controls, t('workbench.dock'), 'panel-right', () => { this.docked = !this.docked; this.syncLayout(); });
    this.iconButton(controls, t('workbench.expand'), 'maximize-2', () => { this.expanded = !this.expanded; this.syncLayout(); });
    this.iconButton(controls, t('workbench.close'), 'minimize-2', () => this.setOpen(false));
    this.identity = this.panel.createDiv({ cls: 'opencodian-workbench-identity' });
    const body = this.panel.createDiv({ cls: 'opencodian-workbench-body' });
    // The legacy generic 'tasks' category page is retired: its rows live inline in
    // the overview activity, and setPage('tasks') redirects there.
    const names = { overview: t('workbench.information'), files: t('workbench.files'), tools: t('workbench.tools') };
    for (const name of Object.keys(names) as (keyof typeof names)[]) {
      const page = body.createDiv({ cls: `opencodian-workbench-page opencodian-workbench-${name}`, attr: {
        id: `${id}-${name}`, role: 'region', 'aria-label': names[name], tabindex: '-1',
      } });
      page.hidden = name !== this.page; this.pages.set(name, page);
    }
    this.pages.get('overview')!.title = t('workbench.scopeHelp');
    actions.mountTools(this.pages.get('tools')!);
    // The tools instance exists at this point: mount the tools-owned inline
    // command catalog ONCE into a stable host that survives overview rebuilds.
    this.resourceMount = document.createElement('div'); this.resourceMount.addClass('opencodian-workbench-inline-resources');
    actions.mountResources?.(this.resourceMount);
    this.panel.addEventListener('keydown', this.onKeydown);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.syncLayout());
    this.observer?.observe(boundary);
    const input=boundary.querySelector('.opencodian-input-area'); if(input) this.observer?.observe(input);
    const shell=boundary.querySelector('.opencodian-messages-shell'); if(shell) this.observer?.observe(shell);
    this.syncLayout();
  }

  getFilesMount(): HTMLElement { return this.pages.get('files')!; }
  getToolsMount(): HTMLElement { return this.pages.get('tools')!; }
  isMounted(boundary: HTMLElement): boolean { return this.root.parentElement === boundary; }
  isVisible(): boolean { return this.open; }

  setState(state: SessionWorkbenchState): void {
    const body = this.pages.get('overview')!.parentElement!;
    if (this.state && this.page === 'overview') this.transcriptScroll.set(this.scrollKey(), body.scrollTop);
    // A session switch shows the new card first but defers focus: the overview
    // still holds the previous session until it is rebuilt below.
    const refocus = this.state?.identity !== state.identity && this.switchSession(state.identity);
    this.state = state;
    this.syncHeading();
    this.title.title = state.title;
    this.identity.setText([state.backend, state.sessionId].filter(Boolean).join(' · '));
    const goal = state.goal.goal;
    const active = state.todos.find((todo) => todo.status === 'in_progress');
    const summary = goal ? this.goalLabel(goal) : state.armed ? t('workbench.goal.armed')
      : active?.content ?? (state.tasks.length ? `${t('workbench.tasks')} · ${state.tasks.length}` : t('workbench.information'));
    this.trigger.setAttribute('aria-label', `${t('workbench.information')}: ${summary}`);
    this.trigger.setAttribute('title', `${summary} · ${state.tasks.length} ${t('workbench.tasks')}`);
    this.trigger.querySelector('.opencodian-workbench-trigger-state')?.remove();
    this.trigger.createSpan({ cls: 'opencodian-workbench-trigger-state', text: summary });
    const fingerprint = JSON.stringify(state, (key, value: unknown) => ['observedAt', 'updatedAt', 'timestamp'].includes(key) ? undefined : value);
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      if (!this.editing) this.renderOverview();
      if (this.page === 'overview') body.scrollTop = this.transcriptScroll.get(this.scrollKey()) ?? 0;
    }
    if (refocus) this.refocusCard();
  }

  /** Saves the outgoing session's card preference and applies the incoming one; returns whether focus must follow. */
  private switchSession(identity: string): boolean {
    const refocus = this.panelHoldsFocus();
    if (this.state) this.preferences.set(this.state.identity, { page: this.page, tool: this.tool, docked: this.docked, expanded: this.expanded });
    const preference = this.preferences.get(identity);
    this.docked = preference?.docked ?? false; this.expanded = preference?.expanded ?? false; this.tool = preference?.tool ?? 'terminal';
    this.showPage(preference?.page ?? 'overview', false); this.syncLayout();
    if (this.page === 'tools') this.actions.openTool?.(this.tool);
    this.editing = false; this.goalFocused = false; this.editor = null; this.budget = null; this.fingerprint = '';
    return refocus;
  }

  openGoal(): void {
    if (this.state?.child) this.actions.returnToParent?.();
    if (this.state) this.revealedGoals.add(this.state.identity);
    this.setPage('overview'); this.goalFocused = true; this.renderOverview(); this.setOpen(true);
    this.revealSection('goal');
  }

  setPage(page: WorkbenchPage): void { this.showPage(page, true); }

  /**
   * `settle` is false while a session switch is in flight: the overview still
   * shows the previous session, so `setState` applies scroll and focus once the
   * new session's overview exists instead of landing on a node about to be removed.
   */
  private showPage(page: WorkbenchPage, settle: boolean): void {
    // The legacy generic 'tasks' category page is retired: redirect into the
    // inline overview activity and focus the relevant disclosure as useful.
    if (page === 'tasks') { this.showPage('overview', settle); this.revealSection('activity', 'terminals'); return; }
    const moveFocus = settle && this.panelHoldsFocus();
    if (this.goalFocused) { this.goalFocused = false; this.editing = false; this.renderOverview(); }
    // Every card shares one scrolling body. Leaving the overview remembers its
    // scroll and the control that opened the other card, per session; returning
    // restores that exact origin instead of a generic top-of-overview reset.
    const returning = settle && this.page !== 'overview' && page === 'overview';
    if (this.page === 'overview' && page !== 'overview') this.rememberOverview(document.activeElement);
    this.page = page;
    this.root.toggleClass('is-overview', page === 'overview');
    for (const [key, element] of this.pages) element.hidden = key !== page;
    this.syncHeading();
    if (returning) this.pages.get('overview')!.parentElement!.scrollTop = this.transcriptScroll.get(this.scrollKey()) ?? 0;
    if (moveFocus) (page === 'overview' ? this.overviewFocusTarget() : this.back).focus({ preventScroll: returning });
    this.actions.onPageChange?.(page);
  }

  /** Whether focus sits in the visible card or on its back button, i.e. navigation should carry it along. */
  private panelHoldsFocus(): boolean {
    const focused = document.activeElement;
    return this.open && focused instanceof HTMLElement && (focused === this.back || Boolean(this.pages.get(this.page)?.contains(focused)));
  }

  /** After a session switch: focus the new card, unless its rebuild already focused something inside it. */
  private refocusCard(): void {
    const held = document.activeElement;
    if (held instanceof HTMLElement && this.pages.get(this.page)?.contains(held)) return;
    (this.page === 'overview' ? this.overviewFocusTarget() : this.back).focus({ preventScroll: true });
  }

  /** One body scrolls every card; the key also separates a child transcript from its parent overview. */
  private scrollKey(): string {
    return this.state ? `${this.state.identity}:${this.state.child?.agent.id ?? 'main'}` : '';
  }

  /** Leaving the overview: remember its scroll and the label of the control that opened the other card. */
  private rememberOverview(focused: Element | null): void {
    const key = this.scrollKey();
    const overview = this.pages.get('overview')!;
    this.transcriptScroll.set(key, overview.parentElement!.scrollTop);
    const origin = focused instanceof HTMLElement && overview.contains(focused) ? focused.getAttribute('aria-label') : null;
    if (origin === null) this.overviewOrigins.delete(key); else this.overviewOrigins.set(key, origin);
  }

  /** Back navigation lands on a reachable control with the origin's name (even when rebuilt), else on the first reachable one. */
  private overviewFocusTarget(): HTMLElement {
    const content = this.pages.get('overview')!;
    const controls = this.reachable('button:not(:disabled), summary, input, textarea, [tabindex="0"]').filter((element) => content.contains(element));
    return controls.find((element) => element.getAttribute('aria-label') === this.overviewOrigins.get(this.scrollKey())) ?? controls[0] ?? content;
  }

  /** Opens the first existing overview group among `keys`, scrolls it into view and focuses its heading. */
  private revealSection(...keys: string[]): void {
    const overview = this.pages.get('overview')!;
    const section = keys.map((key) => overview.querySelector<HTMLDetailsElement>(`[data-section="${key}"]`)).find(Boolean);
    if (!section) return;
    section.open = true;
    const body = overview.parentElement!;
    body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top;
    section.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  }

  openTool(tool: string): void {
    if (!['terminal', 'git', 'browser', 'context'].includes(tool)) return;
    if (tool === 'context') {
      // The command catalog is inline: show the overview's stable resource mount
      // and let the tools surface open and lazy-load it there. The tools page
      // only holds the three real tools, so it must never be shown blank. The
      // panel opens first so the catalog's own search focus is the last one set.
      if (this.state?.child) this.actions.returnToParent?.();
      this.setPage('overview'); this.setOpen(true); this.actions.openTool?.(tool);
      const body = this.pages.get('overview')!.parentElement!;
      body.scrollTop += this.resourceMount.getBoundingClientRect().top - body.getBoundingClientRect().top;
      return;
    }
    this.tool = tool; this.setPage('tools'); this.actions.openTool?.(tool); this.setOpen(true);
  }

  private syncHeading(): void {
    const tools = { terminal: 'workbench.terminal', git: 'workbench.git', browser: 'workbench.browser' } as const;
    const label = this.goalFocused ? t('workbench.goal.title') : this.page === 'overview' ? t('workbench.information')
      : this.page === 'files' ? t('workbench.files') : t(tools[this.tool as keyof typeof tools] ?? 'workbench.tools');
    this.title.setText(label);
    this.panel.setAttribute('aria-label', label);
    this.pages.get(this.page)?.setAttribute('aria-label', label);
    this.back.hidden = this.page === 'overview';
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
    if (open) this.reachable('button, summary, [tabindex="0"]')[0]?.focus(); else this.restoreFocus();
  }

  /**
   * Controls that can really take focus: rendered, and not inside a closed
   * group. Chromium still reports rects for the content of a closed `<details>`,
   * so that content is excluded explicitly; only its own summary stays reachable.
   */
  private reachable(selector: string): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>(selector)].filter((element) => {
      if (!element.getClientRects().length) return false;
      for (let closed = element.closest('details:not([open])'); closed; closed = closed.parentElement?.closest('details:not([open])') ?? null)
        if (element.parentElement !== closed || element.tagName !== 'SUMMARY') return false;
      return true;
    });
  }

  private syncLayout(): void {
    const bounds=this.boundary.getBoundingClientRect(); const width=bounds.width;
    const input=this.boundary.querySelector('.opencodian-input-area')?.getBoundingClientRect();
    const composer=this.boundary.querySelector('.opencodian-composer-shell')?.getBoundingClientRect();
    // Trigger and panel hang below the actual chat chrome bottom (the messages
    // shell top: wrapped header, optional below-header tab bar) with the incumbent 15px gap.
    const chrome=this.boundary.querySelector('.opencodian-messages-shell')?.getBoundingClientRect();
    if(chrome?.height) this.root.style.setProperty('--workbench-top',`${Math.max(12,chrome.top-bounds.top+15)}px`);
    const bottom=input?.height ? Math.max(12,bounds.bottom-input.top+8) : 160;
    this.root.style.setProperty('--workbench-bottom',`${bottom}px`);
    const dockBottom=Math.max(12,bounds.bottom-(composer?.bottom ?? input?.bottom ?? bounds.bottom));
    this.root.style.setProperty('--workbench-dock-bottom',`${dockBottom}px`);
    this.root.toggleClass('is-narrow', width < 640);
    this.root.toggleClass('is-expanded', this.expanded);
    this.panel.setAttribute('role',this.expanded?'dialog':'region');
    if(this.expanded) this.panel.setAttribute('aria-modal','true'); else this.panel.removeAttribute('aria-modal');
    const canDock = width >= 960 && !this.expanded;
    const docked = this.open && this.docked && canDock;
    const dockButton = [...this.panel.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-actions > button')]
      .find((button) => button.getAttribute('aria-label') === t('workbench.dock'));
    if (dockButton) {
      dockButton.hidden = !canDock;
      dockButton.setAttribute('aria-pressed', String(docked));
    }
    this.root.toggleClass('is-docked', docked);
    this.boundary.toggleClass('has-workbench-docked', docked);
  }

  private renderOverview(): void {
    const parent = this.pages.get('overview')!;
    const scrollTop = parent.scrollTop;
    this.stashDrafts(parent);
    parent.empty();
    const state = this.state;
    if (!state) return;
    this.overviewIdentity = state.identity;
    this.syncHeading();
    this.informationView.destroy();
    if (state.child) { this.informationView.renderChild(parent, state.child); parent.scrollTop = scrollTop; return; }
    if (this.goalFocused) this.button(parent, t('workbench.goal.backToInformation'), 'arrow-left', () => {
      this.goalFocused = false; this.editing = false; this.renderOverview();
    });
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
    // First level belongs to the session's own objects: plan mode, file changes, then its activity.
    this.informationView.renderPlanMode(parent, state);
    // One files nav row with the authoritative summary; an absent summary stays neutral, never inferred.
    this.navRow(parent, { label: t('workbench.files'), icon: 'file-diff', meta: state.filesSummary ?? t('workbench.info.openFiles') }, () => this.setPage('files'))
      .addClass('opencodian-workbench-files-nav');
    if (state.todos.length) this.renderPlan(parent, state.todos);
    this.informationView.renderAgents(parent, state.agents ?? []);
    this.informationView.renderActivity(parent, state, { pendings: this.taskPendings, settlements: this.taskSettlements });
    // Session references and the composer catalog belong together; low-frequency readbacks and workspace tools follow.
    this.informationView.renderInformation(parent, state, this.resourceMount);
    const tools = parent.createDiv({ cls: 'opencodian-workbench-shortcuts', attr: { role: 'group', 'aria-label': t('workbench.tools') } });
    tools.createDiv({ cls: 'opencodian-workbench-group-label', text: t('workbench.tools') });
    const entries = [['terminal', 'terminal', t('workbench.terminal')], ['git', 'git-branch', t('workbench.git')], ['browser', 'globe', t('workbench.browser')]];
    for (const [tool, icon, label] of entries) this.navRow(tools, { label, icon }, () => this.openTool(tool));
    const drafts = this.overviewDrafts.get(state.identity); if (drafts) this.informationView.restoreDrafts(parent, drafts);
    this.overviewRows = true;
    this.restoreMountFocus();
    parent.scrollTop = scrollTop;
  }

  /**
   * Saves the drafts of the rows on screen under THEIR session before a rebuild.
   * A view without rows (child transcript, goal detail) keeps the last drafts
   * instead of an empty capture, and another session never overwrites them.
   * The tools catalog editor rides the stable mount, so it is remembered here
   * too — and forgotten whenever the mount is not part of this render.
   */
  private stashDrafts(parent: HTMLElement): void {
    if (this.overviewRows) this.overviewDrafts.set(this.overviewIdentity, this.informationView.captureDrafts(parent));
    this.overviewRows = false;
    // Rows that are not rendered next must not pull focus back when they return.
    if (this.overviewIdentity !== this.state?.identity || this.state?.child || this.goalFocused)
      for (const draft of this.overviewDrafts.get(this.overviewIdentity)?.values() ?? []) draft.focused = false;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && this.resourceMount.contains(active) ? active : null;
    const editor = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement ? focused : null;
    const range = editor && editor.selectionStart !== null ? [editor.selectionStart, editor.selectionEnd ?? editor.selectionStart] as const : null;
    this.mountFocus = focused ? { element: focused, range } : null;
  }

  /** Refocuses the catalog editor detached by the rebuild — only when focus was actually dropped, never over a user choice. */
  private restoreMountFocus(): void {
    const captured = this.mountFocus; this.mountFocus = null;
    const active = document.activeElement;
    if (!captured || !captured.element.isConnected) return;
    if (active !== null && active !== document.body && !this.resourceMount.contains(active)) return;
    captured.element.focus({ preventScroll: true });
    const editor = captured.element instanceof HTMLInputElement || captured.element instanceof HTMLTextAreaElement ? captured.element : null;
    if (captured.range) editor?.setSelectionRange(captured.range[0], captured.range[1]);
  }

  /** A row that navigates into a separate card: static right chevron, optional trailing summary. */
  private navRow(parent: HTMLElement, entry: { label: string; icon: string; meta?: string }, action: () => void): HTMLButtonElement {
    const row = this.button(parent, entry.label, entry.icon, action);
    row.addClass('opencodian-workbench-shortcut');
    if (entry.meta !== undefined) row.createSpan({ cls: 'opencodian-workbench-row-meta', text: entry.meta });
    setIcon(row.createSpan({ cls: 'opencodian-workbench-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
    return row;
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

  /** The todo plan (distinct from native Plan mode) is shown once, in full, inside the overview. */
  private renderPlan(parent: HTMLElement, todos: readonly SessionTodo[]): void {
    const section = this.disclosure(parent, 'plan', t('workbench.todoPlan'), { icon: 'list-checks', count: `${todos.filter((todo) => todo.status === 'completed').length} / ${todos.length}` });
    if (!todos.length) { section.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.plan.empty') }); return; }
    for (const todo of todos) {
      const row = section.createDiv({ cls: 'opencodian-workbench-todo' });
      row.dataset.status = todo.status;
      const icon = row.createSpan(); setIcon(icon, todo.status === 'completed' ? 'circle-check' : todo.status === 'in_progress' ? 'circle-dot' : 'circle');
      row.createSpan({ text: todo.content });
      row.setAttribute('aria-label', `${todo.content} · ${todo.status}`);
    }
    if (this.actions.usePlanAsGoal) this.button(section, t('workbench.plan.asGoal'), GOAL_ICON, () => this.actions.usePlanAsGoal?.(todos.map((todo) => `- ${todo.content}`).join('\n')));
  }

  private disclosure(parent: HTMLElement, key: string, title: string, options: { icon: string; count: string; collapsed?: boolean }): HTMLElement {
    const identity = `${this.state?.identity}:${key}`;
    const section = parent.createEl('details', { cls: 'opencodian-workbench-section', attr: { 'data-section': key } });
    // An explicit user choice always wins. `collapsed` only seeds the default for
    // low-frequency information and empty groups, so the first screen keeps the
    // plan, files entry and activity visible without resetting on refresh.
    section.open = this.disclosureState.get(identity) ?? !options.collapsed;
    section.addEventListener('toggle', () => { if (section.isConnected) this.disclosureState.set(identity, section.open); });
    const heading = section.createEl('summary', { cls: 'opencodian-workbench-section-heading' });
    const glyph = heading.createSpan({ cls: 'opencodian-workbench-section-icon' }); setIcon(glyph, options.icon);
    heading.createSpan({ text: title });
    heading.createSpan({ cls: 'opencodian-workbench-row-meta', text: options.count, attr: { title: options.count } });
    // Foldable groups use a down chevron (CSS rotates it when open); the static
    // right chevron is reserved for rows that navigate into a separate view.
    const arrow = heading.createSpan({ cls: 'opencodian-workbench-chevron' }); setIcon(arrow, 'chevron-down');
    return section.createDiv({ cls: 'opencodian-workbench-section-body' });
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
