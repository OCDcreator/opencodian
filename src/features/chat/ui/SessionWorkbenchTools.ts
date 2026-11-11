/** Host workbench tools: workspace terminal, isolated browser and the command catalog; repository state lives in SessionWorkbenchRepository. */
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { type App, ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';

import { WorkbenchHostRuntime } from '../../../core/runtime/WorkbenchHostRuntime';
import { t, type TranslationKey } from '../../../i18n';
import type { SessionWorkbenchState, WorkbenchResource } from './SessionWorkbench';
import { failureDetail, SessionWorkbenchRepository, store } from './SessionWorkbenchRepository';

interface BrowserView extends HTMLElement {
  src: string;
  capturePage?(): Promise<{ toPNG(): Uint8Array }>;
  getURL?(): string;
}

type ToolKey = 'terminal' | 'browser' | 'git' | 'context';
type BrowserState = 'empty' | 'loading' | 'ready' | 'failed';
const TOOLS: readonly ToolKey[] = ['terminal', 'browser', 'git', 'context'];
/** Terminal states with a live PTY process; every other state offers Start again. */
const LIVE_TERMINAL: readonly string[] = ['starting', 'running'];
const terminalStateKey = (status: string): TranslationKey => `workbench.terminal.state.${status}` as TranslationKey;

interface CatalogDraft { query: string; open: boolean; loading: boolean; failed: boolean; forcePending: boolean; epoch: number; items: WorkbenchResource[] | null }

/** Stable DOM handles of the mounted panels; dropped together on detach. */
interface ToolDom {
  terminalStatus: HTMLElement; terminalLabel: HTMLElement; terminalDetail: HTMLElement; terminalState: HTMLElement; terminalStateText: HTMLElement; terminalStateDescription: HTMLElement;
  terminalMount: HTMLElement; terminalStart: HTMLButtonElement; terminalStop: HTMLButtonElement; processes: HTMLElement;
  browserPreview: HTMLElement; browserState: HTMLElement; browserStateText: HTMLElement; browserStateDescription: HTMLElement; browserHint: HTMLElement;
  attachPage: HTMLButtonElement; capture: HTMLButtonElement; externalPage: HTMLButtonElement;
  catalog: HTMLDetailsElement; catalogCount: HTMLElement; catalogSearch: HTMLInputElement; catalogStatus: HTMLElement; catalogList: HTMLElement; attachments: HTMLElement;
}

export interface SessionWorkbenchToolsHost {
  runtime: WorkbenchHostRuntime;
  workingDirectory(): string;
  openResource(resource: WorkbenchResource): void;
  openBrowser(url: string): Promise<void>;
  attachUrl(url: string): void;
  attachImage(image: { data: string; mediaType: 'image/png'; filename: string }): void;
  openSettings(): void;
  openMemory(): void;
  setDraft(text: string): void;
  defaultWorktreeDirectory(): string;
  openDesktop?(tool: string): Promise<void>;
  loadResources?(): Promise<WorkbenchResource[]>;
  /** Optional friendly name for another session's terminal row; the identity key is the fallback. */
  sessionLabel?(identity: string): string | null;
}

export const SESSION_WORKBENCH_VIEW = 'opencodian-workbench';

/** A larger, session-bound view of the same runtime. Closing it only detaches UI. */
export class SessionWorkbenchDesktopView extends ItemView {
  private tools: SessionWorkbenchTools | null = null;
  private toolLabel: string | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  getViewType(): string { return SESSION_WORKBENCH_VIEW; }
  getDisplayText(): string { return this.toolLabel ?? t('workbench.title'); }
  getIcon(): string { return 'panels-top-left'; }
  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  async onOpen(): Promise<void> { this.contentEl.setText(t('workbench.desktop.empty')); }
  bind(host: SessionWorkbenchToolsHost, state: () => SessionWorkbenchState, tool: string): void {
    this.release(); this.contentEl.empty(); this.contentEl.addClass('opencodian-workbench-desktop');
    const heading = this.contentEl.createDiv({ cls:'opencodian-workbench-desktop-heading' });
    const labels = { terminal: t('workbench.terminal'), git: t('workbench.git'), browser: t('workbench.browser'), context: t('workbench.resources') };
    this.toolLabel = labels[tool as keyof typeof labels] ?? t('workbench.title');
    const snapshot = state(); heading.createEl('h3', {text:this.toolLabel});
    heading.createDiv({cls:'opencodian-workbench-muted',text:[snapshot.title,snapshot.backend,snapshot.sessionId,host.workingDirectory()].filter(Boolean).join(' · ')});
    this.tools = new SessionWorkbenchTools(host); this.tools.mount(this.contentEl); this.tools.update(snapshot); this.tools.openTool(tool);
    this.tick = setInterval(()=>this.tools?.update(state()),1000);
  }
  async onClose(): Promise<void> { this.release(); }
  private release(): void { if(this.tick) clearInterval(this.tick); this.tick=null; this.tools?.destroy(); this.tools=null; }
  static async open(app: App, host: SessionWorkbenchToolsHost, state: () => SessionWorkbenchState, tool: string): Promise<void> {
    const leaf = app.workspace.getLeaf('tab');
    await leaf.setViewState({type:SESSION_WORKBENCH_VIEW,active:true});
    if (!(leaf.view instanceof SessionWorkbenchDesktopView)) throw new Error('Workbench view is unavailable');
    leaf.view.bind(host,state,tool); await app.workspace.revealLeaf(leaf);
  }
}

/**
 * Three independent work surfaces (terminal / git / browser) plus the command catalog. The repository surface is
 * composed from SessionWorkbenchRepository; this class owns the shared tool anatomy, the terminal PTY views, the
 * browser preview and the catalog. PTYs belong to the host runtime: views are attached and detached here, and a
 * process is started or stopped only on an explicit click.
 */
export class SessionWorkbenchTools {
  private root: HTMLElement | null = null;
  private readonly panels = new Map<ToolKey, HTMLElement>();
  private readonly errors = new Map<ToolKey, HTMLElement>();
  private readonly repository: SessionWorkbenchRepository;
  private dom: Partial<ToolDom> = {};
  private state: SessionWorkbenchState | null = null;
  private activeTool: ToolKey = 'terminal';
  private observer: ResizeObserver | null = null;
  private terminal: Terminal | null = null; private fit: FitAddon | null = null;
  private unsubscribeTerminal: (() => void) | null = null;
  private terminalIdentity = ''; private terminalFingerprint = ''; private processFingerprint = ''; private processesOpen = false;
  private browser: BrowserView | null = null; private address: HTMLInputElement | null = null; private browserReady = false;
  private readonly browserUrls = new Map<string, string>();
  private readonly catalogDrafts = new Map<string, CatalogDraft>();
  private sessionGeneration = 0; private catalogEpoch = 0; private attachmentsFingerprint = ''; private resourcesInline = false;
  private resourceParent: HTMLElement | null = null;

  constructor(private readonly host: SessionWorkbenchToolsHost) {
    // Presentation stays here; repository state (snapshot, drafts, pending reads, generations) stays there.
    this.repository = new SessionWorkbenchRepository(host, {
      button: (parent, label, icon, action) => this.button(parent, label, icon, action),
      enable: (button, enabled) => this.enable(button, enabled),
      showError: (message) => this.showError('git', message),
      clearError: () => this.clearError('git'),
    });
  }

  /** Compatibility entry: desktop and external callers may still ask for the resources tool. */
  openTool(tool: string): void {
    if (!TOOLS.includes(tool as ToolKey)) return;
    // Inline resources are not a tool page: reveal the catalog in place and keep the current tool.
    if (tool !== 'context' || !this.resourcesInline) { this.activeTool = tool as ToolKey; this.showTool(); }
    if (tool === 'context') this.revealCatalog();
  }

  /** Moves the resources panel into the primary surface's stable mount. Idempotent and remount-safe. */
  mountResources(parent: HTMLElement): void { this.resourceParent = parent; this.placeResources(); }

  /**
   * The host's command catalog changed (settings saved, backend reconnected). Every session's cached entries
   * become stale at once: the catalog that is open now is re-read exactly once, however many invalidations
   * arrive while a read is in flight, and a closed one is read on its next expand. Search text, open state
   * and focus are left alone.
   */
  invalidateCatalog(): void {
    this.catalogEpoch++;
    if (this.currentCatalogDraft()?.open) this.ensureCatalog();
  }

  async openDesktop(app: App): Promise<void> {
    const snapshot = this.state; if (!snapshot) return;
    const cwd = this.host.workingDirectory();
    const requireSource = () => { if (this.state?.identity !== snapshot.identity) throw new Error(t('workbench.desktop.returnToSource')); };
    const host: SessionWorkbenchToolsHost = {...this.host, openDesktop:undefined, workingDirectory:()=>cwd,
      attachUrl:(url)=>{requireSource();this.host.attachUrl(url);},
      attachImage:(image)=>{requireSource();this.host.attachImage(image);},
      setDraft:(text)=>{requireSource();this.host.setDraft(text);},
    };
    await SessionWorkbenchDesktopView.open(app,host,()=>this.state?.identity===snapshot.identity?this.state:snapshot,this.activeTool);
  }

  mount(parent: HTMLElement): void {
    this.detach();
    this.root = parent.createDiv({ cls: 'opencodian-workbench-tools-shell' });
    for (const key of TOOLS) this.panels.set(key, this.root.createDiv({ cls: `opencodian-workbench-tool opencodian-workbench-tool-${key}`, attr: { 'data-tool': key } }));
    this.mountTerminal(); this.mountGit(); this.mountContext();
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.fitTerminal());
    this.observer?.observe(parent); this.placeResources();
    if (this.state) this.restoreSession(this.state.identity);
    this.showTool();
  }

  update(state: SessionWorkbenchState): void {
    const changed = this.state?.identity !== state.identity;
    this.state = state;
    if (changed) this.resetSessionView(state.identity);
    // Draft resources only feed the tool-page list. Inline, nothing here reacts to them, so the
    // catalog's search, loaded entries, open state and focus survive every overview update.
    this.syncAttachments(); this.syncTerminalStatus(); this.renderProcesses(); this.fitTerminal();
    // A PTY of this session that has no view yet (it finished starting while another session was shown) is attached, never spawned.
    if (!changed && !this.terminal && this.host.runtime.getTerminal(state.identity)) void this.connectTerminal(false);
    if (changed) this.showTool();
  }

  /** One session visit. A→B→A yields a new lease, so nothing that started before a switch can land after it. */
  private lease(): string { return `${this.sessionGeneration}:${this.state?.identity ?? ''}`; }

  /** Session switch: old views and error regions are dropped first, then the new session is projected. */
  private resetSessionView(identity: string): void {
    this.releaseTerminalView();
    for (const key of TOOLS) this.clearError(key);
    this.sessionGeneration++;
    this.browser?.remove(); this.browser = null; this.address = null; this.browserReady = false;
    this.panels.get('browser')?.empty();
    this.repository.update(identity);
    this.restoreSession(identity);
  }

  /** Projects one session into the stable DOM: the catalog's search, open state and an existing PTY view. Never spawns. */
  private restoreSession(identity: string): void {
    this.hydrateCatalog(identity);
    this.syncTerminalStatus(); this.renderProcesses();
    if (this.host.runtime.getTerminal(identity)) void this.connectTerminal(false);
  }

  private showTool(): void {
    // The inline resources panel never takes part in tool switching: the overview owns its visibility.
    for (const [key, panel] of this.panels) panel.hidden = key === 'context' ? !this.resourcesInline && this.activeTool !== 'context' : key !== this.activeTool;
    if (this.activeTool === 'browser' && !this.browser) this.mountBrowser();
    if (this.activeTool === 'terminal') this.fitTerminal();
    if (this.activeTool === 'git') this.repository.show();
  }

  private placeResources(): void {
    const panel = this.panels.get('context'); const target = this.resourceParent ?? this.root;
    if (!panel || !target) return;
    const inline = Boolean(this.resourceParent);
    if (inline !== this.resourcesInline) this.attachmentsFingerprint = '';
    this.resourcesInline = inline; panel.toggleClass('is-inline', inline);
    if (panel.parentElement !== target) target.appendChild(panel);
    panel.hidden = !inline && this.activeTool !== 'context';
    if (this.dom.attachments) this.dom.attachments.hidden = inline;
    this.syncAttachments();
  }

  // ---------- workspace terminal ----------

  private mountTerminal(): void {
    const panel = this.panels.get('terminal')!; const { status, label, detail, secondary } = this.toolbar(panel);
    this.dom.terminalStatus = status; this.dom.terminalLabel = label; this.dom.terminalDetail = detail;
    // The empty state owns the primary start action; the running state keeps Stop in the quiet tool toolbar.
    const state = this.dom.terminalState = panel.createDiv({ cls: 'opencodian-workbench-tool-state opencodian-workbench-terminal-empty', attr: { role: 'status' } });
    setIcon(state.createSpan({ cls: 'opencodian-workbench-empty-icon', attr: { 'aria-hidden': 'true' } }), 'terminal'); this.dom.terminalStateText = state.createEl('strong', { cls: 'opencodian-workbench-tool-state-title' }); this.dom.terminalStateDescription = state.createEl('p', { cls: 'opencodian-workbench-muted' });
    const primary = state.createDiv({ cls: 'opencodian-workbench-tool-primary-actions' }); this.dom.terminalStart = this.button(primary, t('workbench.terminal.start'), 'play', () => this.connectTerminal(true));
    this.dom.terminalStart.addClass('opencodian-workbench-primary-action');
    this.dom.terminalStop = this.button(secondary, t('workbench.stop'), 'square', () => { if (this.state) this.host.runtime.stopTerminal(this.state.identity); });
    this.desktopButton(secondary); this.errorRegion(panel, 'terminal');
    // data-workbench-native-keys: the enclosing workbench leaves Escape to the PTY inside this subtree.
    this.dom.terminalMount = panel.createDiv({ cls: 'opencodian-workbench-terminal', attr: { 'aria-label': t('workbench.terminal'), 'data-workbench-native-keys': 'true' } });
    this.dom.processes = panel.createDiv();
  }

  /** Header status of THIS session's process: state, directory and PID. Also swaps viewport and state block. */
  private syncTerminalStatus(): void {
    const { terminalStatus, terminalState, terminalMount, terminalStart, terminalStop } = this.dom;
    if (!terminalStatus) return;
    const process = this.state ? this.host.runtime.getTerminal(this.state.identity) : null;
    const status = process?.status ?? 'idle';
    const detail = process ? `${process.cwd}${process.pid ? ` · PID ${process.pid}` : ''}` : this.host.workingDirectory();
    const fingerprint = JSON.stringify([status, detail, Boolean(this.terminal)]);
    if (fingerprint === this.terminalFingerprint) return;
    this.terminalFingerprint = fingerprint;
    const label = t(terminalStateKey(status)); const live = LIVE_TERMINAL.includes(status);
    terminalStatus.dataset.state = status; terminalStatus.setAttribute('aria-label', `${t('workbench.terminal')}: ${label}`);
    this.dom.terminalLabel?.setText(label); this.dom.terminalDetail?.setText(detail);
    // Exactly one of Start and Stop is offered, and exactly one of viewport and state block is shown.
    if (terminalStart && terminalStop) { terminalStart.hidden = live; terminalStop.hidden = !live; }
    if (terminalMount) terminalMount.hidden = !this.terminal;
    if (terminalState) { terminalState.dataset.state = status; terminalState.hidden = Boolean(this.terminal); }
    this.dom.terminalStateText?.setText(status === 'idle' ? t('workbench.terminal.start') : label);
    this.dom.terminalStateDescription?.setText(status === 'idle' ? t('workbench.terminal.empty') : detail);
  }

  /** Folded list of the workbench's OTHER sessions' terminals. Only source, directory, state and PID are shown. */
  private renderProcesses(): void {
    const mount = this.dom.processes; const own = this.state?.identity;
    if (!mount) return;
    const processes = this.host.runtime.listTerminals().filter(({ identity }) => identity !== own);
    const fingerprint = JSON.stringify(processes.map(({ identity, state }) => [identity, state.status, state.pid, state.cwd]));
    if (fingerprint === this.processFingerprint) return;
    this.processFingerprint = fingerprint; mount.empty();
    if (!processes.length) return;
    const section = mount.createEl('details', { cls: 'opencodian-workbench-processes' }); section.open = this.processesOpen;
    section.addEventListener('toggle', () => { if (section.isConnected) this.processesOpen = section.open; });
    const summary = section.createEl('summary'); summary.createSpan({ text: t('workbench.processes.others') }); summary.createSpan({ cls: 'opencodian-workbench-row-meta', text: String(processes.length) });
    for (const { identity, state } of processes) {
      const row = section.createDiv({ cls: 'opencodian-workbench-process' });
      row.createSpan({ cls: 'opencodian-workbench-tool-status-label', text: this.host.sessionLabel?.(identity) ?? identity });
      row.createEl('code', { cls: 'opencodian-workbench-tool-status-detail', text: `${state.cwd} · ${t(terminalStateKey(state.status))}${state.pid ? ` · PID ${state.pid}` : ''}` });
      if (LIVE_TERMINAL.includes(state.status)) this.button(row, t('workbench.stop'), 'square', () => this.host.runtime.stopTerminal(identity));
    }
  }

  private async connectTerminal(create: boolean): Promise<void> {
    const identity = this.state?.identity; const lease = this.lease();
    if (!identity) return;
    try {
      const process = create ? await this.host.runtime.startTerminal(identity, this.host.workingDirectory()) : this.host.runtime.getTerminal(identity);
      // Owner gate: a PTY that finished starting after a session switch stays alive but is not attached by this request.
      if (!process || lease !== this.lease() || !this.dom.terminalMount || !this.root) return;
      this.attachTerminalView(identity, process.output);
      if (process.error) this.terminalFailed(process.error, lease);
    } catch (error) { this.terminalFailed(error, lease); }
  }

  /** Terminal failures are pinned to the terminal tool and to the session visit that owned the PTY view. */
  private terminalFailed(error: unknown, lease: string): void { this.showError('terminal', `${t('workbench.terminal.failed')} ${failureDetail(error)}`.trim(), lease); this.syncTerminalStatus(); }

  private attachTerminalView(identity: string, output: string): void {
    this.releaseTerminalView(); this.terminalIdentity = identity;
    const lease = this.lease(); const style = getComputedStyle(this.root!);
    const background = style.getPropertyValue('--background-primary').trim() || style.backgroundColor;
    const foreground = style.getPropertyValue('--text-normal').trim() || style.color;
    const accent = style.getPropertyValue('--interactive-accent').trim() || foreground;
    const view = this.terminal = new Terminal({ convertEol: false, cursorBlink: false, scrollback: 3000, fontSize: 12,
      fontFamily: style.getPropertyValue('--font-monospace').trim() || 'monospace',
      theme: { background, foreground, cursor: accent, selectionBackground: style.getPropertyValue('--text-selection').trim() || accent } });
    this.fit = new FitAddon(); view.loadAddon(this.fit);
    this.syncTerminalStatus(); // Reveals the viewport before xterm measures it.
    view.open(this.dom.terminalMount!); view.write(output);
    view.onData((data) => this.host.runtime.writeTerminal(identity, data));
    this.unsubscribeTerminal = this.host.runtime.subscribeTerminal(identity, (event) => {
      // Owner gate: only the view that subscribed may write; a released or replaced view ignores late events.
      if (this.terminal !== view) return;
      if (event.type === 'data') view.write(event.data);
      else if (event.state.error) this.terminalFailed(event.state.error, lease);
      else this.syncTerminalStatus();
    });
    this.fitTerminal();
    // Reattaching after a session switch must not pull focus away from wherever the user is working.
    if (this.activeTool === 'terminal' && !this.panels.get('terminal')?.hidden) view.focus();
  }

  private fitTerminal(): void {
    const mount = this.dom.terminalMount;
    if (!this.terminal || !this.fit || !mount?.offsetWidth || !mount.offsetHeight) return;
    try { this.fit.fit(); this.host.runtime.resizeTerminal(this.terminalIdentity, this.terminal.cols, this.terminal.rows); }
    catch { /* A detached pane will fit when its ResizeObserver fires again. */ }
  }

  /** Drops the xterm view only. The PTY keeps running in the host runtime. */
  private releaseTerminalView(): void {
    this.unsubscribeTerminal?.(); this.unsubscribeTerminal = null;
    this.terminal?.dispose(); this.terminal = null; this.fit = null; this.terminalIdentity = '';
    this.dom.terminalMount?.empty();
    this.syncTerminalStatus();
  }

  // ---------- browser and preview ----------

  private mountBrowser(): void {
    const panel = this.panels.get('browser')!; const identity = this.state?.identity; const lease = this.lease();
    panel.empty();
    const form = panel.createEl('form', { cls: 'opencodian-workbench-browser-address' });
    form.addEventListener('submit', (event) => event.preventDefault());
    const address = this.address = form.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.url') }).createEl('input', { type: 'url', attr: { placeholder: 'http://localhost:3000' } });
    address.value = identity ? this.browserUrls.get(identity) ?? '' : '';
    address.addEventListener('input', () => this.syncBrowserActions());
    address.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); this.navigateBrowser(); } });
    this.button(form, t('workbench.open'), 'globe', () => this.navigateBrowser()).addClass('opencodian-workbench-primary-action');
    this.errorRegion(panel, 'browser');
    const preview = this.dom.browserPreview = panel.createDiv({ cls: 'opencodian-workbench-browser-preview', attr: { role: 'region', 'aria-label': t('workbench.browser') } });
    const state = this.dom.browserState = preview.createDiv({ cls: 'opencodian-workbench-tool-state opencodian-workbench-browser-empty', attr: { role: 'status' } });
    setIcon(state.createSpan({ cls: 'opencodian-workbench-empty-icon', attr: { 'aria-hidden': 'true' } }), 'globe'); this.dom.browserStateText = state.createEl('strong', { cls: 'opencodian-workbench-tool-state-title' }); this.dom.browserStateDescription = state.createEl('p', { cls: 'opencodian-workbench-muted' });
    this.dom.browserHint = panel.createEl('p', { cls: 'opencodian-workbench-tool-hint opencodian-workbench-browser-hint', text: t('workbench.browser.captureWait') });
    const bar = panel.createDiv({ cls: 'opencodian-workbench-browser-actions' });
    this.dom.attachPage = this.button(bar, t('workbench.browser.attachPage'), 'paperclip', () => this.host.attachUrl(this.browserUrl()));
    this.dom.capture = this.button(bar, t('workbench.browser.capture'), 'camera', () => this.capturePage());
    this.dom.externalPage = this.button(bar, t('workbench.browser.external'), 'external-link', () => this.host.openBrowser(this.browserUrl())); this.dom.externalPage.addClass('opencodian-workbench-browser-icon-action');
    this.desktopButton(form.createDiv({ cls: 'opencodian-workbench-browser-window-action' }));
    const browser = this.browser = document.createElement('webview') as BrowserView;
    browser.className = 'opencodian-workbench-browser';
    browser.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes');
    // Owner gate shared by every webview event: a replaced preview or another session never writes here.
    const owns = () => this.browser === browser && lease === this.lease();
    const settle = (next: BrowserState, ready: boolean) => { if (owns()) { this.browserReady = ready; this.setBrowserState(next); } };
    browser.addEventListener('dom-ready', () => settle('ready', true));
    browser.addEventListener('did-start-loading', () => settle('loading', false));
    browser.addEventListener('did-fail-load', (event) => {
      const { isMainFrame, errorCode } = event as Event & { isMainFrame?: boolean; errorCode?: number };
      // Subframe failures and aborted navigations (-3) are not a failed page.
      if (!owns() || isMainFrame === false || errorCode === -3) return;
      settle('failed', false); this.showError('browser', t('workbench.browser.openFallback'), lease);
    });
    browser.addEventListener('did-navigate', () => {
      const url = browser.getURL?.();
      if (!owns() || !identity || !url || !/^https?:/.test(url)) return;
      address.value = url; store(this.browserUrls, identity, url); this.syncBrowserActions();
    });
    preview.appendChild(browser);
    this.browserReady = false;
    if (address.value) browser.setAttribute('src', address.value);
    this.setBrowserState(address.value ? 'loading' : 'empty');
  }

  private browserUrl(): string {
    let url: URL | null = null;
    try { url = new URL(this.address?.value.trim() ?? ''); } catch { /* Reported below as one localized message. */ }
    if (!url || !['http:', 'https:'].includes(url.protocol)) throw new Error(t('workbench.browser.invalidUrl'));
    return url.href;
  }

  private setBrowserState(state: BrowserState): void {
    const { browserPreview, browserState } = this.dom;
    if (browserPreview) browserPreview.dataset.state = state;
    if (browserState) { browserState.dataset.state = state; browserState.hidden = state === 'ready'; }
    this.dom.browserStateText?.setText(state === 'ready' ? '' : t(state === 'empty' ? 'workbench.browser.empty' : state === 'loading' ? 'workbench.browser.loading' : 'workbench.browser.openFallback')); this.dom.browserStateDescription?.setText(state === 'empty' ? t('workbench.browser.emptyDescription') : state === 'loading' ? this.address?.value ?? '' : '');
    this.syncBrowserActions();
  }

  /** Attach and external-open need a valid address; a screenshot additionally needs a DOM-ready page that can capture. */
  private syncBrowserActions(): void {
    let valid = true;
    try { this.browserUrl(); } catch { valid = false; }
    this.enable(this.dom.attachPage, valid); this.enable(this.dom.externalPage, valid);
    const capturable = valid && this.browserReady && typeof this.browser?.capturePage === 'function';
    this.enable(this.dom.capture, capturable);
    if (this.dom.capture) this.dom.capture.title = t(capturable ? 'workbench.browser.capture' : this.browserReady ? 'workbench.tool.unavailable' : 'workbench.browser.captureWait');
  }

  private navigateBrowser(): void {
    const identity = this.state?.identity;
    try {
      const url = this.browserUrl();
      this.clearError('browser'); this.browserReady = false;
      this.browser?.setAttribute('src', url);
      if (identity) store(this.browserUrls, identity, url);
      this.setBrowserState('loading');
    } catch (error) { this.showError('browser', error); }
  }

  private async capturePage(): Promise<void> {
    const lease = this.lease(); const browser = this.browser;
    this.browserUrl();
    if (!browser?.capturePage) throw new Error(t('workbench.tool.unavailable'));
    const image = await browser.capturePage().catch((error: unknown) => { throw new Error(`${t('workbench.browser.captureFailed')} ${failureDetail(error)}`.trim()); });
    // Ownership gate: only a capture of the still-mounted page of the still-current session may attach.
    if (lease !== this.lease() || this.browser !== browser) throw new Error(t('workbench.desktop.returnToSource'));
    this.host.attachImage({ data: Buffer.from(image.toPNG()).toString('base64'), mediaType: 'image/png', filename: 'browser-capture.png' });
  }

  // ---------- command catalog and related settings ----------

  private mountContext(): void {
    const panel = this.panels.get('context')!;
    this.errorRegion(panel, 'context');
    this.dom.attachments = panel.createDiv({ cls: 'opencodian-workbench-attachments', attr: { role: 'group', 'aria-label': t('workbench.resources.attached') } });
    // "User tasks" is only the group's accessible name: the one visible level is the collapsible commands row.
    const tasks = panel.createDiv({ cls: 'opencodian-workbench-resource-group', attr: { role: 'group', 'aria-label': t('workbench.resources.userTasks') } });
    const catalog = this.dom.catalog = tasks.createEl('details', { cls: 'opencodian-workbench-catalog' });
    const summary = catalog.createEl('summary');
    setIcon(summary.createSpan({ cls: 'opencodian-workbench-section-icon' }), 'square-slash');
    summary.createSpan({ text: t('workbench.resources.commands') }); this.dom.catalogCount = summary.createSpan({ cls: 'opencodian-workbench-row-meta' });
    setIcon(summary.createSpan({ cls: 'opencodian-workbench-chevron' }), 'chevron-down');
    catalog.addEventListener('toggle', () => { const draft = this.currentCatalogDraft(); if (draft) draft.open = catalog.open; if (catalog.open) this.ensureCatalog(); });
    const searchLabel = catalog.createEl('label', { cls: 'opencodian-workbench-field opencodian-workbench-catalog-search', attr: { 'aria-label': t('workbench.resources.search') } });
    setIcon(searchLabel.createSpan({ cls: 'opencodian-workbench-catalog-search-icon', attr: { 'aria-hidden': 'true' } }), 'search');
    const search = this.dom.catalogSearch = searchLabel.createEl('input', { type: 'search', attr: { placeholder: t('workbench.resources.search'), 'aria-label': t('workbench.resources.search') } });
    search.addEventListener('input', () => { const draft = this.currentCatalogDraft(); if (draft) draft.query = search.value; this.renderCatalog(); });
    this.dom.catalogStatus = catalog.createEl('p', { cls: 'opencodian-workbench-muted', attr: { role: 'status' } });
    this.dom.catalogList = catalog.createDiv({ cls: 'opencodian-workbench-catalog-list' });
    this.button(catalog.createDiv({ cls: 'opencodian-workbench-tool-secondary-actions' }), t('workbench.resources.catalog'), 'refresh-cw', () => this.ensureCatalog(true));
    // Settings links sit outside the catalog: they leave the workbench, hence the external-link affordance.
    const related = panel.createDiv({ cls: 'opencodian-workbench-resource-group', attr: { role: 'group', 'aria-label': t('workbench.resources.related') } });
    related.createDiv({ cls: 'opencodian-workbench-group-label', text: t('workbench.resources.related') });
    for (const [label, icon, open] of [[t('workbench.resources.memory'), 'notebook-tabs', () => this.host.openMemory()], [t('workbench.resources.diagnostics'), 'settings-2', () => this.host.openSettings()]] as const) {
      const button = this.button(related, label, icon, open);
      button.addClass('opencodian-workbench-list-row');
      setIcon(button.createSpan({ cls: 'opencodian-workbench-row-meta', attr: { 'aria-hidden': 'true' } }), 'external-link');
    }
  }

  private catalogDraft(identity: string): CatalogDraft {
    return store(this.catalogDrafts, identity, this.catalogDrafts.get(identity) ?? { query: '', open: false, loading: false, failed: false, forcePending: false, epoch: -1, items: null });
  }
  private currentCatalogDraft(): CatalogDraft | null { return this.state ? this.catalogDrafts.get(this.state.identity) ?? null : null; }

  /** Writes a session's search text and open state into the stable catalog DOM after a switch or remount. */
  private hydrateCatalog(identity: string): void {
    const draft = this.catalogDraft(identity); const { catalog, catalogSearch } = this.dom;
    if (catalogSearch && catalogSearch.value !== draft.query) catalogSearch.value = draft.query;
    if (catalog) catalog.open = draft.open;
    this.renderCatalog();
    if (draft.open) this.ensureCatalog();
  }

  /** Lazy catalog read through the host's own backend cache; `force` is the explicit reload. */
  private ensureCatalog(force = false): void {
    const identity = this.state?.identity; const draft = this.currentCatalogDraft();
    // A destroyed surface neither starts a catalog read nor restarts one from a late result; a remount
    // re-reads through hydrate. Entries read at the current epoch are fresh, and a failed read is not
    // retried on its own - the reload button forces it.
    if (!identity || !draft || !this.root) return;
    if (draft.loading) { if (force) draft.forcePending = true; return; }
    if (draft.epoch === this.catalogEpoch && !force) return;
    const lease = this.lease(); const epoch = this.catalogEpoch;
    if (!this.host.loadResources) { draft.items = []; draft.epoch = epoch; this.renderCatalog(); return; }
    draft.loading = true; draft.failed = false;
    this.clearError('context'); this.renderCatalog();
    // Owner gate: data that settles after a session switch or after an invalidation is dropped, never rendered
    // and never cached. If that session is on screen with its catalog open, the current visit reads once for itself.
    const settle = (items: WorkbenchResource[] | null, error?: unknown) => {
      draft.loading = false;
      const forced = draft.forcePending; draft.forcePending = false;
      if (lease !== this.lease() || epoch !== this.catalogEpoch) {
        // Marking the draft stale keeps a dropped read from being silently skipped: the follow-up read below,
        // or the next time this session shows its catalog, reads fresh instead of trusting old entries.
        draft.epoch = -1;
        if (this.root && this.state?.identity === identity && draft.open) this.ensureCatalog();
        return;
      }
      draft.epoch = epoch; draft.items = items ?? draft.items; draft.failed = !items;
      if (!items) this.showError('context', `${t('workbench.resources.catalogFailed')} ${failureDetail(error)}`.trim(), lease);
      this.renderCatalog();
      // An explicit refresh pressed while this read was in flight is answered by exactly one more read.
      if (forced && this.root) this.ensureCatalog(true);
    };
    void this.host.loadResources().then((items) => settle(items), (error) => settle(null, error));
  }

  private revealCatalog(): void {
    const { catalog, catalogSearch } = this.dom; const draft = this.currentCatalogDraft();
    if (!catalog) return;
    catalog.open = true; if (draft) draft.open = true;
    this.ensureCatalog(); catalogSearch?.focus();
  }

  /** Only actionable entries are listed: a read-only diagnostic row must not pose as a command. */
  private renderCatalog(): void {
    const { catalogList, catalogStatus } = this.dom; const draft = this.currentCatalogDraft();
    if (!catalogList || !catalogStatus) return;
    const items = (draft?.items ?? []).filter((resource) => resource.command || resource.path);
    const query = draft?.query.trim().toLowerCase() ?? '';
    const matches = query ? items.filter((resource) => [resource.label, resource.detail, resource.command].join('\n').toLowerCase().includes(query)) : items;
    const status = this.catalogStatusText(draft, items.length, matches.length);
    catalogStatus.setText(status); catalogStatus.hidden = !status;
    this.dom.catalogCount?.setText(draft?.items ? String(matches.length) : '');
    // A rebuilt list hands focus back to the same entry, so a refresh does not drop keyboard users to the page.
    const focused = document.activeElement instanceof HTMLElement && catalogList.contains(document.activeElement) ? document.activeElement.textContent : null;
    catalogList.empty();
    for (const resource of matches) this.resourceRow(catalogList, resource);
    if (focused !== null) [...catalogList.querySelectorAll('button')].find((button) => button.textContent === focused)?.focus();
  }

  private catalogStatusText(draft: CatalogDraft | null, total: number, matched: number): string {
    if (!draft) return '';
    if (draft.loading) return t('workbench.resources.loading');
    if (draft.failed) return t('workbench.resources.catalogFailed');
    if (!draft.items) return '';
    if (!total) return t('workbench.resources.catalogEmpty');
    return matched ? '' : t('workbench.resources.noMatches');
  }

  private resourceRow(parent: HTMLElement, resource: WorkbenchResource): void {
    const row = parent.createDiv({ cls: 'opencodian-workbench-resource' });
    // The original resource object goes back to the host, so the command text is inserted untouched.
    const button = this.button(row, resource.label, resource.path ? 'file-text' : 'square-slash', () => this.host.openResource(resource));
    button.addClass('opencodian-workbench-list-row');
    if (resource.command) button.title = t('workbench.resources.insert', { label: resource.label });
    if (resource.detail) row.createDiv({ cls: 'opencodian-workbench-muted', text: resource.detail });
  }

  /** Draft attachments are listed only while the panel is a tool page; inline, the overview owns the session reference. */
  private syncAttachments(): void {
    const list = this.dom.attachments;
    if (!list || this.resourcesInline) return;
    const fingerprint = JSON.stringify([this.state?.identity, this.state?.resources]);
    if (fingerprint === this.attachmentsFingerprint) return;
    this.attachmentsFingerprint = fingerprint; list.empty();
    list.createDiv({ cls: 'opencodian-workbench-group-label', text: t('workbench.resources.attached') });
    if (!this.state?.resources.length) list.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.resources.empty') });
    for (const resource of this.state?.resources ?? []) this.resourceRow(list, resource);
  }

  // ---------- shared plumbing ----------

  /** Shared tool header: a status cluster on the left, quiet secondary actions on the right. */
  private toolbar(panel: HTMLElement): { status: HTMLElement; label: HTMLElement; detail: HTMLElement; secondary: HTMLElement } {
    const toolbar = panel.createDiv({ cls: 'opencodian-workbench-tool-toolbar' });
    const status = toolbar.createDiv({ cls: 'opencodian-workbench-tool-status', attr: { role: 'status' } });
    return { status, label: status.createSpan({ cls: 'opencodian-workbench-tool-status-label' }), detail: status.createEl('code', { cls: 'opencodian-workbench-tool-status-detail' }),
      secondary: toolbar.createDiv({ cls: 'opencodian-workbench-tool-secondary-actions' }) };
  }

  /** The git tool: shell-owned header and error region, repository-owned body, drafts and generations. */
  private mountGit(): void {
    const panel = this.panels.get('git')!; const { label, detail, secondary } = this.toolbar(panel);
    this.errorRegion(panel, 'git'); this.desktopButton(secondary);
    this.repository.mount(panel, { label, detail, actions: secondary });
  }

  private desktopButton(parent: HTMLElement): void {
    if (this.host.openDesktop) this.button(parent, t('workbench.desktop.open'), 'external-link', () => this.host.openDesktop!(this.activeTool));
  }

  private errorRegion(panel: HTMLElement, tool: ToolKey): void {
    const region = panel.createDiv({ cls: 'opencodian-workbench-error', attr: { role: 'alert' } });
    region.hidden = true; this.errors.set(tool, region);
  }

  /** Per-tool, per-visit errors: a failure that settles for another session, or an earlier visit of this one, never lands here. */
  private showError(tool: ToolKey, error: unknown, lease = this.lease()): void {
    const region = this.errors.get(tool);
    if (!region || lease !== this.lease()) return;
    region.setText(failureDetail(error)); region.hidden = false;
  }
  private clearError(tool: ToolKey): void { const region = this.errors.get(tool); if (region) { region.hidden = true; region.empty(); } }

  /** Stateful enablement that survives the busy cycle of the shared button helper. */
  private enable(button: HTMLButtonElement | undefined, enabled: boolean): void {
    if (!button) return;
    button.dataset.enabled = String(enabled);
    if (button.dataset.busy !== 'true') button.disabled = !enabled;
  }

  private button(parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'opencodian-workbench-button', attr: { type: 'button', 'aria-label': label, title: label } });
    const glyph = button.createSpan(); setIcon(glyph, icon); button.createSpan({ text: label });
    // The owning tool comes from the panel the button lives in; the session visit is captured at click time,
    // so a failure that settles later is reported to that tool and that visit only.
    const tool = (parent.closest('.opencodian-workbench-tool')?.getAttribute('data-tool') ?? 'context') as ToolKey;
    button.addEventListener('click', () => {
      if (button.dataset.busy === 'true') return;
      const lease = this.lease();
      button.dataset.busy = 'true'; button.disabled = true;
      void Promise.resolve().then(action).catch((error) => this.showError(tool, error, lease))
        .finally(() => { delete button.dataset.busy; button.disabled = button.dataset.enabled === 'false'; });
    });
    return button;
  }

  /** Removes the UI only. PTYs, cached repository state, drafts and the resources mount survive a remount. */
  detach(): void {
    this.observer?.disconnect(); this.observer = null;
    // The surface is gone: nothing in flight may land here, and nothing may start reads for this dead mount.
    this.sessionGeneration++;
    this.repository.detach();
    this.releaseTerminalView();
    this.browser?.remove(); this.browser = null; this.address = null; this.browserReady = false;
    // The inline resources panel lives outside the tools root, so it is removed explicitly.
    this.panels.get('context')?.remove();
    this.root?.remove(); this.root = null;
    this.panels.clear(); this.errors.clear(); this.dom = {};
    this.attachmentsFingerprint = ''; this.processFingerprint = ''; this.terminalFingerprint = '';
  }
  destroy(): void { this.detach(); this.resourceParent = null; this.resourcesInline = false; }
}
