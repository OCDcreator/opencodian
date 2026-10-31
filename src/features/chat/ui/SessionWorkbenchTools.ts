/** Host workbench tools: real terminal, isolated browser, explicit repository operations and context. */
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { type App, ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';

import { type WorkbenchGitFile, type WorkbenchGitSnapshot, WorkbenchHostRuntime } from '../../../core/runtime/WorkbenchHostRuntime';
import { t } from '../../../i18n';
import type { SessionWorkbenchState, WorkbenchResource } from './SessionWorkbench';

interface BrowserView extends HTMLElement {
  src: string;
  capturePage?(): Promise<{ toPNG(): Uint8Array }>;
  getURL?(): string;
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
}

export const SESSION_WORKBENCH_VIEW = 'opencodian-workbench';

/** A larger, session-bound view of the same runtime. Closing it only detaches UI. */
export class SessionWorkbenchDesktopView extends ItemView {
  private tools: SessionWorkbenchTools | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  getViewType(): string { return SESSION_WORKBENCH_VIEW; }
  getDisplayText(): string { return t('workbench.title'); }
  getIcon(): string { return 'panels-top-left'; }
  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  async onOpen(): Promise<void> { this.contentEl.setText(t('workbench.desktop.empty')); }
  bind(host: SessionWorkbenchToolsHost, state: () => SessionWorkbenchState, tool: string): void {
    this.release(); this.contentEl.empty(); this.contentEl.addClass('opencodian-workbench-desktop');
    const heading = this.contentEl.createDiv({ cls:'opencodian-workbench-desktop-heading' });
    const snapshot = state(); heading.createEl('h3', {text:snapshot.title});
    heading.createDiv({cls:'opencodian-workbench-muted',text:[snapshot.backend,snapshot.sessionId,host.workingDirectory()].filter(Boolean).join(' · ')});
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

export class SessionWorkbenchTools {
  private root: HTMLElement | null = null;
  private readonly panels = new Map<string, HTMLElement>();
  private state: SessionWorkbenchState | null = null;
  private terminal: Terminal | null = null;
  private fit: FitAddon | null = null;
  private unsubscribeTerminal: (() => void) | null = null;
  private terminalMount: HTMLElement | null = null;
  private terminalStatus: HTMLElement | null = null;
  private processes: HTMLElement | null = null;
  private processFingerprint = '';
  private terminalIdentity = '';
  private observer: ResizeObserver | null = null;
  private browser: BrowserView | null = null;
  private address: HTMLInputElement | null = null;
  private readonly browserUrls = new Map<string, string>();
  private gitSnapshot: WorkbenchGitSnapshot | null = null;
  private gitRevision = 0;
  private error: HTMLElement | null = null;
  private activeTool = 'terminal';
  private resourceFingerprint = '';

  constructor(private readonly host: SessionWorkbenchToolsHost) {}

  openTool(tool: string): void {
    if (!this.panels.has(tool)) return;
    this.activeTool = tool;
    const select = this.root?.querySelector('select'); if (select) select.value = tool;
    this.showTool();
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
    const label = this.root.createEl('label', { cls: 'opencodian-workbench-tool-picker', text: t('workbench.tools') });
    const select = label.createEl('select', { attr: { 'aria-label': t('workbench.tools') } });
    for (const [value, name] of [['terminal', t('workbench.terminal')], ['browser', t('workbench.browser')], ['git', t('workbench.git')], ['context', t('workbench.resources')]])
      select.createEl('option', { value, text: name });
    select.value = this.activeTool;
    if (this.host.openDesktop) this.button(label,t('workbench.desktop.open'),'external-link',()=>this.host.openDesktop!(this.activeTool));
    select.addEventListener('change', () => { this.activeTool = select.value; this.showTool(); });
    this.error = this.root.createDiv({ cls: 'opencodian-workbench-error', attr: { role: 'alert' } }); this.error.hidden = true;
    for (const key of ['terminal', 'browser', 'git', 'context']) this.panels.set(key, this.root.createDiv({ cls: `opencodian-workbench-tool-${key}` }));
    this.mountTerminal(); this.renderGit(); this.renderResources();
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.fitTerminal());
    this.observer?.observe(parent); this.showTool();
  }

  update(state: SessionWorkbenchState): void {
    const changed = this.state?.identity !== state.identity;
    this.state = state;
    if (changed) {
      this.releaseTerminalView(); this.gitSnapshot = null; this.gitRevision++;
      this.browser?.remove(); this.browser = null; this.address = null;
      this.panels.get('browser')?.empty();
      if (this.activeTool === 'browser') this.mountBrowser();
      this.renderGit();
      if (this.host.runtime.getTerminal(state.identity)) void this.connectTerminal(false);
    }
    const fingerprint = JSON.stringify([state.identity, state.resources]);
    if (fingerprint !== this.resourceFingerprint) { this.resourceFingerprint = fingerprint; this.renderResources(); }
    this.fitTerminal();
    this.renderProcesses();
  }

  private showTool(): void {
    for (const [key, panel] of this.panels) panel.hidden = key !== this.activeTool;
    if (this.activeTool === 'browser' && !this.browser) this.mountBrowser();
    if (this.activeTool === 'terminal') this.fitTerminal();
    if (this.activeTool === 'git' && !this.gitSnapshot) void this.refreshGit();
  }

  private mountTerminal(): void {
    const parent = this.panels.get('terminal')!;
    const controls = parent.createDiv({ cls: 'opencodian-workbench-actions' });
    this.button(controls, t('workbench.terminal.start'), 'terminal', () => this.connectTerminal(true));
    this.button(controls, t('workbench.stop'), 'square', () => { if (this.state) this.host.runtime.stopTerminal(this.state.identity); });
    this.terminalStatus = parent.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.terminal.empty'), attr: { role: 'status' } });
    this.terminalMount = parent.createDiv({ cls: 'opencodian-workbench-terminal', attr: { 'aria-label': t('workbench.terminal') } });
    this.processes = parent.createDiv(); this.processFingerprint=''; this.renderProcesses();
  }

  private renderProcesses(): void {
    if(!this.processes) return;
    const processes=this.host.runtime.listTerminals();
    const fingerprint=JSON.stringify(processes.map(({identity,state})=>[identity,state.pid,state.status]));
    if(fingerprint===this.processFingerprint) return; this.processFingerprint=fingerprint; this.processes.empty();
    if(!processes.length) return;
    const section=this.processes.createEl('details');section.createEl('summary',{text:t('workbench.processes')});
    for(const {identity,state} of processes) {
      const row=section.createDiv({cls:'opencodian-workbench-resource'});
      row.createDiv({cls:'opencodian-workbench-muted',text:`${identity} · ${state.status}${state.pid?` · PID ${state.pid}`:''}`});
      if(['starting','running'].includes(state.status)) this.button(row,t('workbench.stop'),'square',()=>this.host.runtime.stopTerminal(identity));
    }
  }

  private async connectTerminal(create: boolean): Promise<void> {
    const state = this.state;
    if (!state) return;
    const identity = state.identity;
    try {
      const terminalState = create ? await this.host.runtime.startTerminal(identity, this.host.workingDirectory()) : this.host.runtime.getTerminal(identity);
      if (!terminalState || this.state?.identity !== identity || !this.terminalMount) return;
      this.releaseTerminalView();
      this.terminalIdentity = identity;
      const style = getComputedStyle(this.root!);
      const background = style.getPropertyValue('--background-primary').trim() || style.backgroundColor;
      const foreground = style.getPropertyValue('--text-normal').trim() || style.color;
      const accent = style.getPropertyValue('--interactive-accent').trim() || foreground;
      this.terminal = new Terminal({ convertEol: false, cursorBlink: false, scrollback: 3000, fontSize: 12,
        fontFamily: style.getPropertyValue('--font-monospace').trim() || 'monospace',
        theme: { background, foreground, cursor: accent, selectionBackground: style.getPropertyValue('--text-selection').trim() || accent } });
      this.fit = new FitAddon(); this.terminal.loadAddon(this.fit);
      this.terminal.open(this.terminalMount); this.terminal.write(terminalState.output);
      this.terminal.onData((data) => this.host.runtime.writeTerminal(identity, data));
      this.terminalStatus?.setText(`${terminalState.cwd} · ${terminalState.status}${terminalState.pid ? ` · PID ${terminalState.pid}` : ''}`);
      this.unsubscribeTerminal = this.host.runtime.subscribeTerminal(identity, (event) => {
        if (this.terminalIdentity !== identity) return;
        if (event.type === 'data') this.terminal?.write(event.data);
        else {
          this.terminalStatus?.setText(`${event.state.cwd} · ${event.state.status}${event.state.pid ? ` · PID ${event.state.pid}` : ''}`);
          if (event.state.error) this.showError(event.state.error);
        }
      });
      this.fitTerminal(); this.terminal.focus();
    } catch (error) { this.showError(error); }
  }

  private fitTerminal(): void {
    if (!this.terminal || !this.fit || !this.terminalMount?.offsetWidth || !this.terminalMount.offsetHeight) return;
    try { this.fit.fit(); this.host.runtime.resizeTerminal(this.terminalIdentity, this.terminal.cols, this.terminal.rows); }
    catch { /* A detached pane will fit when its ResizeObserver fires again. */ }
  }

  private mountBrowser(): void {
    const parent = this.panels.get('browser')!;
    const identity = this.state?.identity;
    const field = parent.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.url') });
    this.address = field.createEl('input', { type: 'url', attr: { placeholder: 'http://localhost:3000' } });
    this.address.value = identity ? this.browserUrls.get(identity) ?? '' : '';
    const actions = parent.createDiv({ cls: 'opencodian-workbench-actions' });
    this.button(actions, t('workbench.open'), 'globe', () => this.navigateBrowser());
    this.button(actions, t('workbench.attach'), 'paperclip', () => { this.host.attachUrl(this.browserUrl()); });
    this.button(actions, t('workbench.browser.external'), 'external-link', () => this.host.openBrowser(this.browserUrl()));
    const capture = this.button(actions, t('workbench.browser.capture'), 'camera', async () => {
      try {
        this.browserUrl();
        if (!browser.capturePage) throw new Error(t('workbench.tool.unavailable'));
        const image = await browser.capturePage();
        if (this.state?.identity !== identity || this.browser !== browser) throw new Error(t('workbench.desktop.returnToSource'));
        this.host.attachImage({ data: Buffer.from(image.toPNG()).toString('base64'), mediaType: 'image/png', filename: 'browser-capture.png' });
      } catch (error) { this.showError(error); }
    });
    capture.disabled = true;
    const browser = this.browser = document.createElement('webview') as BrowserView;
    this.browser.className = 'opencodian-workbench-browser';
    this.browser.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes');
    this.browser.addEventListener('dom-ready', () => { capture.disabled = typeof this.browser?.capturePage !== 'function'; });
    this.browser.addEventListener('did-fail-load', () => this.showError(t('workbench.browser.openFallback')));
    this.browser.addEventListener('did-navigate', () => {
      if (this.browser !== browser || this.state?.identity !== identity) return;
      const url = browser.getURL?.();
      if (url && /^https?:/.test(url) && this.state && this.address) { this.address.value = url; this.browserUrls.set(this.state.identity, url); }
    });
    parent.appendChild(this.browser);
    if (this.address.value) browser.setAttribute('src', this.address.value);
    this.address.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); this.navigateBrowser(); } });
  }

  private browserUrl(): string {
    const value = this.address?.value.trim() ?? '';
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('workbench.browser.invalidUrl'));
    return url.href;
  }

  private navigateBrowser(): void {
    try {
      const url = this.browserUrl();
      this.browser?.setAttribute('src', url);
      if (this.state) this.browserUrls.set(this.state.identity, url);
      this.clearError();
    } catch (error) { this.showError(error); }
  }

  private async refreshGit(): Promise<void> {
    const revision = ++this.gitRevision;
    try {
      const snapshot = await this.host.runtime.readGit(this.host.workingDirectory());
      if (revision !== this.gitRevision) return;
      this.gitSnapshot = snapshot; this.renderGit(); this.clearError();
    } catch (error) { if (revision === this.gitRevision) this.showError(error); }
  }

  private renderGit(): void {
    const parent = this.panels.get('git'); if (!parent) return;
    parent.empty();
    this.button(parent, t('workbench.git.refresh'), 'refresh-cw', () => this.refreshGit());
    const snapshot = this.gitSnapshot; if (!snapshot) return;
    parent.createDiv({ cls: 'opencodian-workbench-source', text: snapshot.root });
    parent.createEl('h4', { text: `${t('workbench.git.branch')} · ${snapshot.branch}` });
    parent.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.git.sessionHelp') });
    if (!snapshot.files.length) parent.createEl('p', { text: t('workbench.git.clean') });
    for (const file of snapshot.files) this.renderGitFile(parent, snapshot, file);
    const commitLabel = parent.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.git.message') });
    const message = commitLabel.createEl('input', { type: 'text' });
    const commit = this.button(parent, t('workbench.git.commit'), 'git-commit-horizontal', async () => {
      await this.host.runtime.commit(snapshot.root, message.value); await this.refreshGit();
    });
    commit.disabled = !snapshot.files.some((file) => file.index !== ' ' && file.index !== '?');
    const worktrees = parent.createEl('details', { cls: 'opencodian-workbench-section' });
    worktrees.createEl('summary', { text: t('workbench.git.worktrees') });
    worktrees.createEl('pre', { text: snapshot.worktrees });
    const branchLabel = worktrees.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.git.branch') });
    const branch = branchLabel.createEl('input', { type: 'text', attr: { placeholder: 'codex/feature' } });
    const pathLabel = worktrees.createEl('label', { cls: 'opencodian-workbench-field', text: t('workbench.git.worktreePath') });
    const directory = pathLabel.createEl('input', { type: 'text' }); directory.value = this.host.defaultWorktreeDirectory();
    this.button(worktrees, t('workbench.git.createWorktree'), 'git-branch', async () => {
      await this.host.runtime.createWorktree(snapshot.root, directory.value, branch.value); await this.refreshGit();
    });
    this.button(parent, t('workbench.git.review'), 'git-pull-request', () => this.host.setDraft(t('workbench.git.reviewPrompt')));
  }

  private renderGitFile(parent: HTMLElement, snapshot: WorkbenchGitSnapshot, file: WorkbenchGitFile): void {
    const row = parent.createEl('details', { cls: 'opencodian-workbench-task' });
    const summary = row.createEl('summary'); summary.createEl('code', { text: `${file.index}${file.workingTree}` }); summary.createSpan({ text: file.path });
    const controls = row.createDiv({ cls: 'opencodian-workbench-actions' });
    const staged = file.index !== ' ' && file.index !== '?';
    this.button(controls, t(staged ? 'workbench.git.unstage' : 'workbench.git.stage'), staged ? 'minus' : 'plus', async () => {
      await this.host.runtime.stageFile(snapshot.root, file.path, !staged); await this.refreshGit();
    });
    const diff = row.createEl('pre');
    this.button(controls, t('workbench.git.diff'), 'file-diff', async () => { diff.setText(await this.host.runtime.gitDiff(snapshot.root, file)); });
  }

  private renderResources(): void {
    const parent = this.panels.get('context'); if (!parent) return;
    parent.empty();
    parent.createEl('h4', { text: t('workbench.resources') });
    if (!this.state?.resources.length) parent.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.resources.empty') });
    for (const resource of this.state?.resources ?? []) {
      const row = parent.createDiv({ cls: 'opencodian-workbench-resource' });
      this.button(row, resource.label, 'file-text', () => this.host.openResource(resource));
      if (resource.detail) row.createDiv({ cls: 'opencodian-workbench-muted', text: resource.detail });
    }
    this.button(parent, t('workbench.resources.memory'), 'notebook-tabs', () => this.host.openMemory());
    this.button(parent, t('workbench.resources.diagnostics'), 'settings-2', () => this.host.openSettings());
    if (this.host.loadResources) {
      const catalog = parent.createDiv();
      this.button(catalog,t('workbench.resources.catalog'),'refresh-cw',async()=>{
        const resources = await this.host.loadResources!();
        catalog.querySelectorAll('.opencodian-workbench-resource').forEach(node=>node.remove());
        for (const resource of resources) {
          const row=catalog.createDiv({cls:'opencodian-workbench-resource'});
          this.button(row,resource.label,resource.path?'file-text':'box',()=>this.host.openResource(resource));
          if(resource.detail) row.createDiv({cls:'opencodian-workbench-muted',text:resource.detail});
        }
      });
    }
  }

  private button(parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'opencodian-workbench-button', attr: { type: 'button' } });
    const glyph = button.createSpan(); setIcon(glyph, icon); button.createSpan({ text: label });
    button.addEventListener('click', () => {
      button.disabled = true;
      void Promise.resolve().then(action).catch((error) => this.showError(error)).finally(() => { button.disabled = false; });
    });
    return button;
  }

  private showError(error: unknown): void { if (this.error) { this.error.hidden = false; this.error.setText(error instanceof Error ? error.message : String(error)); } }
  private clearError(): void { if (this.error) { this.error.hidden = true; this.error.empty(); } }
  private releaseTerminalView(): void {
    this.unsubscribeTerminal?.(); this.unsubscribeTerminal = null;
    this.terminal?.dispose(); this.terminal = null; this.fit = null; this.terminalIdentity = '';
    this.terminalMount?.empty();
  }
  detach(): void {
    this.observer?.disconnect(); this.observer = null; this.releaseTerminalView();
    this.browser?.remove(); this.browser = null; this.root?.remove(); this.root = null; this.panels.clear();
    this.resourceFingerprint = '';
  }
  destroy(): void { this.detach(); }
}
