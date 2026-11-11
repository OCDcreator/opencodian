import { Terminal } from '@xterm/xterm';
import type { WorkspaceLeaf } from 'obsidian';

import type { WorkbenchGitSnapshot, WorkbenchHostRuntime, WorkbenchTerminalState } from '../../../../src/core/runtime/WorkbenchHostRuntime';
import type { SessionWorkbenchState, WorkbenchResource } from '../../../../src/features/chat/ui/SessionWorkbench';
import { SessionWorkbenchDesktopView, SessionWorkbenchTools, type SessionWorkbenchToolsHost } from '../../../../src/features/chat/ui/SessionWorkbenchTools';
import { t } from '../../../../src/i18n';

// Every runtime effect in this file is a mock: no PTY is spawned and no git command runs.
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn(() => ({ loadAddon: jest.fn(), open: jest.fn(), write: jest.fn(), onData: jest.fn(), dispose: jest.fn(), focus: jest.fn(), cols: 80, rows: 24 })) }));
jest.mock('@xterm/addon-fit', () => ({ FitAddon: jest.fn(() => ({ fit: jest.fn() })) }));

type TerminalListener = (event: { type: 'state'; state: WorkbenchTerminalState } | { type: 'data'; data: string }) => void;
interface RuntimeMocks {
  listTerminals?: () => Array<{ identity: string; state: WorkbenchTerminalState }>;
  getTerminal?: (identity: string) => WorkbenchTerminalState | null;
  subscribeTerminal?: (identity: string, listener: TerminalListener) => () => void;
  readGit?: jest.Mock;
  commit?: jest.Mock;
}
interface HostMocks extends SessionWorkbenchToolsHost {
  runtimeMocks: { startTerminal: jest.Mock; stopTerminal: jest.Mock; getTerminal: (identity: string) => WorkbenchTerminalState | null };
}

const state = (identity: string, overrides: Partial<SessionWorkbenchState> = {}): SessionWorkbenchState => ({ identity, title: identity,
  backend: 'codex', sessionId: identity, goal: { status: 'ready', goal: null }, capabilities: null, armed: false, busy: false, todos: [], tasks: [], resources: [], ...overrides });

const host = (runtime: RuntimeMocks = {}, extra: Partial<SessionWorkbenchToolsHost> = {}): HostMocks => {
  const runtimeMocks = { listTerminals: runtime.listTerminals ?? (() => []), getTerminal: runtime.getTerminal ?? (() => null),
    subscribeTerminal: runtime.subscribeTerminal ?? (() => () => undefined), startTerminal: jest.fn(), stopTerminal: jest.fn(), writeTerminal: jest.fn(),
    resizeTerminal: jest.fn(), readGit: runtime.readGit ?? jest.fn(), gitDiff: jest.fn(), stageFile: jest.fn(), commit: runtime.commit ?? jest.fn(), createWorktree: jest.fn() };
  return { runtime: runtimeMocks as unknown as WorkbenchHostRuntime, runtimeMocks, workingDirectory: () => '/vault', openResource: jest.fn(),
    openBrowser: jest.fn(async () => undefined), attachUrl: jest.fn(), attachImage: jest.fn(), openSettings: jest.fn(), openMemory: jest.fn(),
    setDraft: jest.fn(), defaultWorktreeDirectory: () => '/worktrees', ...extra };
};

const flush = async (rounds = 8): Promise<void> => { for (let i = 0; i < rounds; i++) await Promise.resolve(); };
const panelOf = (root: ParentNode, tool: string) => root.querySelector<HTMLElement>(`.opencodian-workbench-tool-${tool}`)!;
const errorOf = (panel: HTMLElement) => panel.querySelector<HTMLElement>('.opencodian-workbench-error')!;
const buttonOf = (panel: ParentNode, label: string) => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label)!;
const typeInto = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => { field.value = value; field.dispatchEvent(new Event('input')); };
const catalogLabels = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-catalog-list button')].map((row) => row.textContent);
const snapshot = (files: Array<{ path: string; index: string; workingTree: string }>): WorkbenchGitSnapshot =>
  ({ root: '/vault', branch: 'main', files, worktrees: 'worktree /vault\nHEAD abc\nbranch refs/heads/main' });
const running = (pid: number, output = ''): WorkbenchTerminalState => ({ status: 'running', cwd: '/vault', pid, output });
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('workbench tool surfaces', () => {
  let root: HTMLElement, tools: SessionWorkbenchTools, mocks: HostMocks;
  const mountWith = (runtime: RuntimeMocks = {}, extra: Partial<SessionWorkbenchToolsHost> = {}) => {
    mocks = host(runtime, extra); tools = new SessionWorkbenchTools(mocks); tools.mount(root);
  };

  beforeEach(() => { root = document.body.createDiv(); });
  afterEach(() => { tools.destroy(); root.remove(); jest.clearAllMocks(); });

  it('shows the chosen tool directly without a second tool selector', () => {
    mountWith(); tools.update(state('first')); tools.openTool('browser');
    expect(root.querySelector('select')).toBeNull();
    expect(root.querySelector('.opencodian-workbench-tool-picker')).toBeNull();
    expect(panelOf(root, 'browser').hasAttribute('hidden')).toBe(false);
    expect(panelOf(root, 'terminal').hasAttribute('hidden')).toBe(true);
    tools.openTool('context');
    expect(panelOf(root, 'context').hasAttribute('hidden')).toBe(false);
    expect(panelOf(root, 'browser').hasAttribute('hidden')).toBe(true);
  });

  it('names the main-area view after its selected tool', async () => {
    mountWith();
    const view = new SessionWorkbenchDesktopView({} as WorkspaceLeaf);
    try {
      view.bind(host(), () => state('first'), 'browser');
      expect(view.getDisplayText()).toBe(t('workbench.browser'));
      expect(view.contentEl.querySelector('h3')?.textContent).toBe(t('workbench.browser'));
      expect(view.contentEl.querySelector('select')).toBeNull();
      expect(view.contentEl.textContent).not.toContain(t('workbench.title'));
    } finally { await view.onClose(); }
  });

  it('clears another session’s preview and restores only its own URL on return', () => {
    mountWith(); tools.update(state('first')); tools.openTool('browser');
    const address = () => panelOf(root, 'browser').querySelector<HTMLInputElement>('input')!;
    const old = root.querySelector('webview')!;
    Object.assign(old, { getURL: () => 'https://first.example/' });
    old.dispatchEvent(new Event('did-navigate'));
    tools.update(state('second'));
    expect(root.querySelector('webview')).not.toBe(old);
    expect(address().value).toBe('');
    old.dispatchEvent(new Event('did-navigate'));
    expect(address().value).toBe('');
    tools.update(state('first'));
    expect(address().value).toBe('https://first.example/');
  });

  it('keeps screenshots disabled until the page is DOM-ready and reports an invalid address in the browser tool only', async () => {
    mountWith(); tools.update(state('first')); tools.openTool('browser');
    const browser = panelOf(root, 'browser');
    const preview = browser.querySelector<HTMLElement>('.opencodian-workbench-browser-preview')!;
    expect(preview.dataset.state).toBe('empty');
    expect(browser.querySelector('.opencodian-workbench-browser-empty svg[data-icon="globe"]')).not.toBeNull();
    expect(browser.querySelector('.opencodian-workbench-tool-hint')!.textContent).toBe(t('workbench.browser.captureWait'));
    expect(buttonOf(browser, t('workbench.browser.capture')).disabled).toBe(true);
    expect(buttonOf(browser, t('workbench.browser.attachPage')).disabled).toBe(true);
    buttonOf(browser, t('workbench.open')).click();
    await flush();
    expect(errorOf(browser).textContent).toBe(t('workbench.browser.invalidUrl'));
    expect(errorOf(panelOf(root, 'terminal')).hidden).toBe(true);
    const webview = browser.querySelector('webview')!;
    Object.assign(webview, { capturePage: jest.fn() });
    typeInto(browser.querySelector<HTMLInputElement>('input')!, 'https://first.example/');
    expect(buttonOf(browser, t('workbench.browser.attachPage')).disabled).toBe(false);
    expect(buttonOf(browser, t('workbench.browser.capture')).disabled).toBe(true);
    webview.dispatchEvent(new Event('dom-ready'));
    expect(preview.dataset.state).toBe('ready');
    expect(buttonOf(browser, t('workbench.browser.capture')).disabled).toBe(false);
  });

  it('rejects a late screenshot silently instead of writing it or an error into the next session', async () => {
    const capture = deferred<{ toPNG(): Uint8Array }>();
    mountWith(); tools.update(state('first')); tools.openTool('browser');
    const old = root.querySelector('webview')!;
    Object.assign(old, { capturePage: () => capture.promise });
    panelOf(root, 'browser').querySelector<HTMLInputElement>('input')!.value = 'https://first.example/';
    old.dispatchEvent(new Event('dom-ready'));
    buttonOf(root, t('workbench.browser.capture')).click();
    await flush();
    tools.update(state('second'));
    capture.resolve({ toPNG: () => new Uint8Array([1, 2, 3]) });
    await flush();
    expect(mocks.attachImage).not.toHaveBeenCalled();
    expect(panelOf(root, 'browser').textContent).not.toContain(t('workbench.desktop.returnToSource'));
    expect(errorOf(panelOf(root, 'browser')).hidden).toBe(true);
  });

  it('composes the repository surface: one read on open, a localized state, and failures confined to the git tool', async () => {
    const readGit = jest.fn().mockRejectedValueOnce(new Error('fatal: not a git repository (or any of the parent directories): .git'))
      .mockResolvedValue(snapshot([{ path: 'b.ts', index: 'M', workingTree: ' ' }]));
    const commit = jest.fn().mockResolvedValue('ok');
    mountWith({ readGit, commit });
    tools.update(state('first')); tools.openTool('git');
    await flush();
    const git = panelOf(root, 'git');
    const block = git.querySelector<HTMLElement>('.opencodian-workbench-tool-state')!;
    expect(readGit).toHaveBeenCalledTimes(1);
    expect(block.dataset.state).toBe('not-repo');
    expect(block.textContent).toContain(t('workbench.git.notRepository'));
    expect(block.textContent).not.toContain('fatal:');
    const toolbar = git.querySelector<HTMLElement>('.opencodian-workbench-repository-toolbar')!;
    expect(toolbar.hidden).toBe(true);
    buttonOf(block, t('workbench.retry')).click();
    await flush();
    expect(git.querySelector('.opencodian-workbench-tool-status')!.textContent).toContain('main');
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.querySelector('.opencodian-workbench-repository-path')!.parentElement).toBe(toolbar);
    buttonOf(git, t('workbench.git.commit')).click();
    await flush();
    expect(commit).not.toHaveBeenCalled();
    expect(errorOf(git).textContent).toBe(t('workbench.git.messageRequired'));
    expect(errorOf(panelOf(root, 'terminal')).hidden).toBe(true);
    tools.update(state('second'));
    expect(errorOf(git).hidden).toBe(true);
  });

  it('keeps the legacy context tool page working with attachments and its catalog outside inline mode', async () => {
    const loadResources = jest.fn().mockResolvedValue([{ label: '/cmd', detail: 'core · help', command: '/cmd' }]);
    mountWith({}, { loadResources });
    tools.update(state('first', { resources: [{ label: 'note.md', detail: 'file', path: 'note.md' }] }));
    expect(loadResources).not.toHaveBeenCalled();
    tools.openTool('context');
    const context = panelOf(root, 'context');
    expect(context.hasAttribute('hidden')).toBe(false);
    expect(context.classList.contains('is-inline')).toBe(false);
    expect(context.querySelector('.opencodian-workbench-attachments')!.textContent).toContain('note.md');
    await flush();
    expect(context.querySelector<HTMLDetailsElement>('details.opencodian-workbench-catalog')!.open).toBe(true);
    expect(catalogLabels(context)).toEqual(['/cmd']);
    expect(loadResources).toHaveBeenCalledTimes(1);
  });
});

describe('workbench terminal', () => {
  let root: HTMLElement, tools: SessionWorkbenchTools, mocks: HostMocks;
  const mountWith = (runtime: RuntimeMocks = {}) => { mocks = host(runtime); tools = new SessionWorkbenchTools(mocks); tools.mount(root); };
  const created = Terminal as unknown as jest.Mock;

  beforeEach(() => { root = document.body.createDiv(); created.mockClear(); });
  afterEach(() => { tools.destroy(); root.remove(); jest.clearAllMocks(); });

  it('shows this session’s process in the header and keeps other sessions’ terminals folded and sourced', () => {
    mountWith({ listTerminals: () => [{ identity: 'codex:other', state: { ...running(7), cwd: '/elsewhere', error: 'private failure' } }] });
    tools.update(state('first'));
    const terminal = panelOf(root, 'terminal');
    const status = terminal.querySelector<HTMLElement>('.opencodian-workbench-tool-status')!;
    expect(status.dataset.state).toBe('idle');
    expect(status.textContent).toContain('/vault');
    expect(buttonOf(terminal, t('workbench.terminal.start')).hidden).toBe(false);
    expect(buttonOf(terminal, t('workbench.terminal.start')).closest('.opencodian-workbench-terminal-empty')).not.toBeNull();
    expect(terminal.querySelector('.opencodian-workbench-tool-state-title')!.textContent).toBe(t('workbench.terminal.start'));
    const folded = terminal.querySelector<HTMLDetailsElement>('details.opencodian-workbench-processes')!;
    expect(folded.open).toBe(false);
    expect(folded.textContent).toContain('codex:other');
    expect(folded.textContent).toContain('/elsewhere');
    expect(folded.textContent).not.toContain('private failure');
    expect(terminal.querySelector('[data-workbench-native-keys="true"]')).toBe(terminal.querySelector('.opencodian-workbench-terminal'));
    mocks.runtimeMocks.getTerminal = () => running(42);
    tools.update(state('first'));
    expect(status.dataset.state).toBe('running');
    expect(status.textContent).toContain('PID 42');
    expect(buttonOf(terminal, t('workbench.terminal.start')).hidden).toBe(true);
    expect(mocks.runtimeMocks.startTerminal).not.toHaveBeenCalled();
    expect(mocks.runtimeMocks.stopTerminal).not.toHaveBeenCalled();
  });

  it('reattaches an existing PTY view on session entry and after a remount without spawning anything', () => {
    mountWith({ getTerminal: () => running(5, 'ready') });
    tools.update(state('first'));
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.results[0].value.write).toHaveBeenCalledWith('ready');
    tools.mount(root);
    expect(created).toHaveBeenCalledTimes(2);
    expect(created.mock.results[0].value.dispose).toHaveBeenCalled();
    expect(mocks.runtimeMocks.startTerminal).not.toHaveBeenCalled();
    expect(mocks.runtimeMocks.stopTerminal).not.toHaveBeenCalled();
  });

  it('pins a terminal failure to the terminal tool and its session visit', () => {
    const listeners: TerminalListener[] = [];
    mountWith({ getTerminal: () => running(5), subscribeTerminal: (_identity, listener) => { listeners.push(listener); return () => undefined; } });
    tools.update(state('first'));
    expect(listeners).toHaveLength(1);
    listeners[0]({ type: 'state', state: { status: 'failed', cwd: '/vault', error: 'helper crashed', output: '' } });
    const terminalError = errorOf(panelOf(root, 'terminal'));
    expect(terminalError.hidden).toBe(false);
    expect(terminalError.textContent).toBe(`${t('workbench.terminal.failed')} helper crashed`);
    expect(errorOf(panelOf(root, 'git')).hidden).toBe(true);
    tools.update(state('second'));
    expect(errorOf(panelOf(root, 'terminal')).hidden).toBe(true);
    // A failure of the previous session's PTY that settles now must not surface in the new session,
    // nor after returning to the first one: its view was released, so its events own nothing any more.
    listeners[0]({ type: 'state', state: { status: 'failed', cwd: '/vault', error: 'late crash', output: '' } });
    tools.update(state('first'));
    listeners[0]({ type: 'state', state: { status: 'failed', cwd: '/vault', error: 'late crash', output: '' } });
    expect(root.textContent).not.toContain('late crash');
  });
});

describe('inline command catalog', () => {
  let root: HTMLElement, mount: HTMLElement, tools: SessionWorkbenchTools, mocks: HostMocks;
  const mountInline = (loadResources: jest.Mock) => {
    mocks = host({}, { loadResources }); tools = new SessionWorkbenchTools(mocks); tools.mount(root);
    tools.mountResources(mount);
    tools.update(state('first', { resources: [{ label: 'note.md', detail: 'file', path: 'note.md' }] }));
  };
  const inline = () => panelOf(mount, 'context');
  const search = () => inline().querySelector<HTMLInputElement>('.opencodian-workbench-catalog-search input')!;

  beforeEach(() => { root = document.body.createDiv(); mount = document.body.createDiv(); });
  afterEach(() => { tools.destroy(); mount.remove(); root.remove(); jest.clearAllMocks(); });

  it('mounts the resources panel into the stable parent once, survives a remount, and shows no draft attachments', async () => {
    mountInline(jest.fn());
    expect(inline().classList.contains('is-inline')).toBe(true);
    expect(root.querySelector('.opencodian-workbench-tool-context')).toBeNull();
    expect(inline().querySelector('.opencodian-workbench-attachments')!.hasAttribute('hidden')).toBe(true);
    expect(inline().textContent).not.toContain('note.md');
    tools.mountResources(mount);
    tools.mount(root);
    expect(mount.querySelectorAll('.opencodian-workbench-tool-context')).toHaveLength(1);
    expect(inline().hasAttribute('hidden')).toBe(false);
    expect(inline().querySelector('.opencodian-workbench-group-label')!.textContent).toBe(t('workbench.resources.related'));
    buttonOf(inline(), t('workbench.resources.memory')).click();
    await flush();
    expect(mocks.openMemory).toHaveBeenCalledTimes(1);
  });

  it('opens and lazy-loads on an explicit context request, lists only actionable entries and inserts the untouched command', async () => {
    const command = { label: '/cmd', detail: 'core · help', command: '/cmd arg' };
    const loadResources = jest.fn().mockResolvedValue([command, { label: 'MCP · x', detail: 'codex' }]);
    mountInline(loadResources);
    expect(loadResources).not.toHaveBeenCalled();
    tools.openTool('context');
    await flush();
    expect(catalogLabels(inline())).toEqual(['/cmd']);
    expect(loadResources).toHaveBeenCalledTimes(1);
    expect(inline().querySelector('.opencodian-workbench-catalog-search-icon svg[data-icon="search"]')).not.toBeNull();
    expect(search().getAttribute('aria-label')).toBe(t('workbench.resources.search'));
    expect(inline().querySelector('.opencodian-workbench-catalog > summary svg[data-icon="chevron-down"]')).not.toBeNull();
    // An inline context request never replaces the tool page behind it.
    expect(panelOf(root, 'terminal').hasAttribute('hidden')).toBe(false);
    buttonOf(inline().querySelector<HTMLElement>('.opencodian-workbench-catalog-list')!, '/cmd').click();
    await flush();
    expect(mocks.openResource).toHaveBeenCalledWith(command);
  });

  it('keeps search, loaded entries, open state and focus through overview updates that only change draft resources', async () => {
    mountInline(jest.fn().mockResolvedValue([{ label: '/alpha', command: '/alpha', detail: 'first' }, { label: '/beta', command: '/beta' }]));
    tools.openTool('context');
    await flush();
    typeInto(search(), 'alp');
    const field = search(); const entry = inline().querySelector('.opencodian-workbench-catalog-list button');
    field.focus();
    tools.update(state('first', { resources: [{ label: 'other.md', path: 'other.md' }] }));
    tools.update(state('first', { resources: [] }));
    expect(search()).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('alp');
    expect(inline().querySelector('.opencodian-workbench-catalog-list button')).toBe(entry);
    expect(catalogLabels(inline())).toEqual(['/alpha']);
    expect(inline().querySelector<HTMLDetailsElement>('details.opencodian-workbench-catalog')!.open).toBe(true);
    expect(mocks.loadResources).toHaveBeenCalledTimes(1);
  });

  it('drops catalog data that settles after a session switch and never caches it', async () => {
    const pending = deferred<WorkbenchResource[]>();
    const loadResources = jest.fn(() => pending.promise);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    tools.update(state('second'));
    pending.resolve([{ label: '/stale', command: '/stale' }]);
    await flush();
    expect(inline().textContent).not.toContain('/stale');
    expect(errorOf(inline()).hidden).toBe(true);
    tools.update(state('first'));
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2);
  });

  it('scopes the search text to its session', async () => {
    mountInline(jest.fn().mockResolvedValue([{ label: '/alpha', command: '/alpha' }, { label: '/beta', command: '/beta' }]));
    tools.openTool('context');
    await flush();
    typeInto(search(), 'bet');
    expect(catalogLabels(inline())).toEqual(['/beta']);
    tools.update(state('second'));
    expect(search().value).toBe('');
    tools.update(state('first'));
    expect(search().value).toBe('bet');
    expect(catalogLabels(inline())).toEqual(['/beta']);
  });

  it('reports a failed catalog load in the resources panel only, with a bounded detail', async () => {
    mountInline(jest.fn().mockRejectedValue(new Error('backend offline')));
    tools.openTool('context');
    await flush();
    expect(errorOf(inline()).textContent).toBe(`${t('workbench.resources.catalogFailed')} backend offline`);
    expect(errorOf(panelOf(root, 'terminal')).hidden).toBe(true);
    expect(errorOf(panelOf(root, 'git')).hidden).toBe(true);
  });
});

describe('command catalog invalidation', () => {
  let root: HTMLElement, mount: HTMLElement, tools: SessionWorkbenchTools;
  const mountInline = (loadResources: jest.Mock) => {
    tools = new SessionWorkbenchTools(host({}, { loadResources })); tools.mount(root);
    tools.mountResources(mount); tools.update(state('first'));
  };
  const inline = () => panelOf(mount, 'context');
  const search = () => inline().querySelector<HTMLInputElement>('.opencodian-workbench-catalog-search input')!;
  const details = () => inline().querySelector<HTMLDetailsElement>('details.opencodian-workbench-catalog')!;

  beforeEach(() => { root = document.body.createDiv(); mount = document.body.createDiv(); });
  afterEach(() => { tools.destroy(); mount.remove(); root.remove(); jest.clearAllMocks(); });

  it('re-reads the open catalog of the same session once and keeps query, open state and focus', async () => {
    const loadResources = jest.fn().mockResolvedValueOnce([{ label: '/cmd-old', command: '/cmd-old' }]).mockResolvedValue([{ label: '/cmd-new', command: '/cmd-new' }]);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    typeInto(search(), 'cmd');
    const field = search(); field.focus();
    tools.invalidateCatalog();
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2);
    expect(catalogLabels(inline())).toEqual(['/cmd-new']);
    expect(search()).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('cmd');
    expect(details().open).toBe(true);
  });

  it('answers any number of invalidations during a read with exactly one merged re-read', async () => {
    const first = deferred<WorkbenchResource[]>();
    const loadResources = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue([{ label: '/fresh', command: '/fresh' }]);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    tools.invalidateCatalog(); tools.invalidateCatalog(); tools.invalidateCatalog();
    expect(loadResources).toHaveBeenCalledTimes(1); // In-flight reads are merged, never parallelised.
    first.resolve([{ label: '/stale', command: '/stale' }]);
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2);
    await flush();
    expect(catalogLabels(inline())).toEqual(['/fresh']);
    expect(inline().textContent).not.toContain('/stale');
  });

  it('reads a catalog invalidated while closed on its next expand', async () => {
    const loadResources = jest.fn().mockResolvedValueOnce([{ label: '/old', command: '/old' }]).mockResolvedValue([{ label: '/new', command: '/new' }]);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    typeInto(search(), 'n');
    details().open = false; details().dispatchEvent(new Event('toggle'));
    tools.invalidateCatalog();
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(1); // Closed catalogs wait for their next expand.
    tools.openTool('context');
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2);
    expect(details().open).toBe(true);
    expect(catalogLabels(inline())).toEqual(['/new']);
    expect(search().value).toBe('n');
  });

  it('answers an explicit refresh pressed during an in-flight read with exactly one follow-up read', async () => {
    const first = deferred<WorkbenchResource[]>();
    const loadResources = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue([{ label: '/fresh', command: '/fresh' }]);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    buttonOf(inline(), t('workbench.resources.catalog')).click();
    await flush();
    buttonOf(inline(), t('workbench.resources.catalog')).click();
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(1); // Presses during the read are coalesced, never parallelised.
    first.resolve([{ label: '/in-flight', command: '/in-flight' }]);
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2);
    await flush();
    expect(catalogLabels(inline())).toEqual(['/fresh']);
    expect(loadResources).toHaveBeenCalledTimes(2);
  });

  it('a catalog read in flight when the surface is destroyed neither lands nor restarts, and a remount reads again', async () => {
    const first = deferred<WorkbenchResource[]>();
    const loadResources = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue([{ label: '/fresh', command: '/fresh' }]);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    tools.destroy();
    first.resolve([{ label: '/late', command: '/late' }]);
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(1); // No read is restarted for a destroyed surface.
    tools.invalidateCatalog();
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(1);
    tools.mount(root); tools.mountResources(mount);
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2); // The remount hydrates the still-open catalog and reads for itself.
    expect(catalogLabels(inline())).toEqual(['/fresh']);
    expect(inline().textContent).not.toContain('/late');
  });

  it('re-reads a forced refresh that settled after A→B→A instead of silently skipping it', async () => {
    const forced = deferred<WorkbenchResource[]>();
    const loadResources = jest.fn().mockResolvedValueOnce([{ label: '/old', command: '/old' }])
      .mockImplementationOnce(() => forced.promise).mockResolvedValue([{ label: '/fresh', command: '/fresh' }]);
    mountInline(loadResources);
    tools.openTool('context');
    await flush();
    expect(catalogLabels(inline())).toEqual(['/old']);
    buttonOf(inline(), t('workbench.resources.catalog')).click();
    await flush();
    tools.update(state('second'));
    tools.update(state('first'));
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(2); // The return must not pretend the pending refresh already happened.
    forced.resolve([{ label: '/mid', command: '/mid' }]);
    await flush();
    expect(loadResources).toHaveBeenCalledTimes(3);
    await flush();
    expect(catalogLabels(inline())).toEqual(['/fresh']);
    expect(inline().textContent).not.toContain('/mid');
    expect(details().open).toBe(true);
  });
});
