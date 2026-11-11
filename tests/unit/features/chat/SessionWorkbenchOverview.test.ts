import { type App, Scope } from 'obsidian';

import { SessionWorkbench, type SessionWorkbenchActions, type SessionWorkbenchState } from '../../../../src/features/chat/ui/SessionWorkbench';
import { t } from '../../../../src/i18n';

function state(overrides: Partial<SessionWorkbenchState> = {}): SessionWorkbenchState {
  return { identity: 'codex:c1', title: 'Current session', backend: 'Codex', sessionId: 'thread1',
    goal: { status: 'ready', goal: null, observedAt: 1 },
    capabilities: { source: 'native', driver: 'codex', actions: ['set', 'edit', 'pause', 'resume', 'clear'], pauseMode: 'goal', editMode: 'replace', budgets: ['tokens'] },
    armed: false, busy: false, todos: [], tasks: [], resources: [], ...overrides };
}
const other = (overrides: Partial<SessionWorkbenchState> = {}) => state({ identity: 'codex:c2', sessionId: 'thread2', ...overrides });
const job = (status = 'running') => ({ id: 'job:1', title: 'Index notes', status });
const nativePlan = { active: false, settable: true, busy: false, notes: [] };

let boundary: HTMLElement; let surface: SessionWorkbench;
const openTool = jest.fn();
const mount = (actions: Partial<SessionWorkbenchActions> = {}) => {
  boundary = document.body.createDiv();
  boundary.getBoundingClientRect = () => ({ width: 400 }) as DOMRect;
  surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(async () => {}), refresh: jest.fn(),
    openMessage: jest.fn(), openResource: jest.fn(), stopTask: jest.fn(async () => {}), mountTools: jest.fn(), openTool, ...actions });
};
const unmount = () => { surface.destroy(); boundary.remove(); jest.clearAllMocks(); };
const overview = () => boundary.querySelector<HTMLElement>('.opencodian-workbench-overview')!;
const body = () => boundary.querySelector<HTMLElement>('.opencodian-workbench-body')!;
const section = (key: string) => overview().querySelector<HTMLDetailsElement>(`[data-section="${key}"]`)!;
const title = () => boundary.querySelector('.opencodian-workbench-session')?.textContent;
const back = () => boundary.querySelector<HTMLButtonElement>(`.opencodian-workbench-header button[aria-label="${t('workbench.goal.backToInformation')}"]`)!;
const entry = (label: string) => [...overview().querySelectorAll<HTMLButtonElement>('button.opencodian-workbench-shortcut')]
  .find((button) => button.getAttribute('aria-label') === label)!;
const filesRow = () => overview().querySelector<HTMLButtonElement>('.opencodian-workbench-files-nav')!;
const tick = () => Promise.resolve();
/** Chromium reports rects for the content of a closed <details>; in tests only [hidden] subtrees report none. */
const mockRects = () => jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
  return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList;
});

describe('session workbench overview hierarchy', () => {
  afterEach(unmount);

  it('leads with session objects, then references and the catalog, readbacks, and workspace tools', async () => {
    mount();
    surface.setState(state({ contextSources: [{ label: 'Attached note', path: 'note.md' }], statistics: { rounds: 1, messages: 2, tools: 0 },
      nativePlan, todos: [{ content: 'Step', status: 'pending' }], tasks: [job()] }));
    boundary.querySelector<HTMLButtonElement>('.opencodian-workbench-trigger')!.click(); await tick();
    const panel = boundary.querySelector('.opencodian-workbench-panel')!;
    const header = panel.querySelector('.opencodian-workbench-header')!;
    expect(header.parentElement).toBe(panel);
    expect(overview().contains(header)).toBe(false);
    expect(header.textContent).toContain(t('workbench.information'));
    // Plan → files → activity → references → catalog → low-frequency information → workspace tools.
    const group = overview().querySelector<HTMLElement>('.opencodian-workbench-shortcuts')!;
    const order = [overview().querySelector('.opencodian-workbench-control-row'), filesRow(), section('plan'), section('activity'),
      section('sources'), overview().querySelector('.opencodian-workbench-inline-resources'), section('quota'), section('statistics'), section('mcp'), group]
      .map((element) => [...overview().children].indexOf(element as Element));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    // The generic tasks and context/resources shortcuts are gone; three real tools sit under one quiet heading.
    const heading = group.querySelector<HTMLElement>('.opencodian-workbench-group-label')!;
    expect(heading.textContent).toBe(t('workbench.tools'));
    expect(heading.matches('button, summary, a, [tabindex]')).toBe(false);
    const entries = [...group.querySelectorAll<HTMLButtonElement>(':scope > button')];
    expect(entries.map((button) => button.textContent)).toEqual([t('workbench.terminal'), t('workbench.git'), t('workbench.browser')]);
    // The files entry is one nav row, not a disclosure wrapping a single child.
    expect(section('files')).toBeNull();
    expect(filesRow().tagName).toBe('BUTTON');
    expect(filesRow().getAttribute('aria-label')).toBe(t('workbench.files'));
    for (const row of [...entries, filesRow()]) {
      expect(row.classList.contains('opencodian-workbench-shortcut')).toBe(true);
      expect(row.querySelector('svg[data-icon="chevron-right"]')).not.toBeNull();
    }
    // Foldable groups use the down chevron; the static right chevron only marks navigation.
    const folds = [...overview().querySelectorAll('summary.opencodian-workbench-section-heading')];
    expect(folds.length).toBeGreaterThan(4);
    for (const fold of folds) {
      expect(fold.querySelector('svg[data-icon="chevron-down"]')).not.toBeNull();
      expect(fold.querySelector('svg[data-icon="chevron-right"]')).toBeNull();
    }
    // Scope help is a tooltip on the region, never a resident paragraph pushing content down.
    expect(overview().title).toBe(t('workbench.scopeHelp'));
    expect(overview().textContent).not.toContain(t('workbench.scopeHelp'));
    expect(t('workbench.info.sources')).not.toBe(t('workbench.resources'));
    filesRow().focus(); filesRow().click(); await tick();
    expect(panel.querySelector('.opencodian-workbench-files')?.hasAttribute('hidden')).toBe(false);
    expect(title()).toBe(t('workbench.files'));
    expect(document.activeElement).toBe(back());
  });

  it('shows the authoritative files summary and stays neutral when none is projected', () => {
    mount();
    const meta = () => filesRow().querySelector('.opencodian-workbench-row-meta')?.textContent;
    surface.setState(state());
    expect(meta()).toBe(t('workbench.info.openFiles'));
    surface.setState(state({ filesSummary: '3 files · +12 −4' }));
    expect(meta()).toBe('3 files · +12 −4');
    // A summary that goes away returns to the neutral entry; nothing is inferred or kept stale.
    surface.setState(state());
    expect(meta()).toBe(t('workbench.info.openFiles'));
  });

  it('lists backend sources and draft attachments once inside the single session-reference group', async () => {
    const openResource = jest.fn();
    mount({ openResource });
    const attachment = { label: 'Draft attachment', path: 'draft.md', detail: 'attached' };
    surface.setState(state({ contextSources: [{ label: 'Sent note', path: 'note.md' }, { label: 'Memory', navigable: false, detail: 'backend' }],
      resources: [attachment] }));
    expect(overview().querySelectorAll('[data-section="sources"]')).toHaveLength(1);
    expect(section('sources').querySelector('summary .opencodian-workbench-row-meta')?.textContent).toBe('3');
    expect([...section('sources').querySelectorAll('.opencodian-workbench-detail-caption > span:first-child')]
      .map((caption) => caption.textContent)).toEqual([t('workbench.info.sent'), t('workbench.info.loaded')]);
    for (const label of ['Sent note', 'Memory', 'Draft attachment']) expect(section('sources').textContent).toContain(label);
    // The attachment is not repeated by any second list elsewhere in the overview.
    expect(overview().textContent!.split('Draft attachment')).toHaveLength(2);
    [...section('sources').querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === 'Draft attachment')!.click();
    await tick();
    expect(openResource).toHaveBeenCalledWith(attachment);
    // No reference of either kind is an honest empty state, not invented rows.
    surface.setState(state());
    expect(section('sources').querySelector('summary .opencodian-workbench-row-meta')?.textContent).toBe('');
    expect(section('sources').textContent).toContain(t('workbench.info.noSources'));
  });

  it('names the todo list a todo plan, distinct from plan mode, and lists it once in full', () => {
    mount();
    const todos = Array.from({ length: 7 }, (_, index) => ({ id: `todo-${index}`, content: `Step ${index + 1}`,
      status: index === 0 ? 'completed' as const : 'pending' as const }));
    surface.setState(state({ todos, nativePlan }));
    expect(t('workbench.todoPlan')).not.toBe(t('workbench.planMode'));
    expect(section('plan').querySelector('summary')?.textContent).toContain(t('workbench.todoPlan'));
    expect(section('plan').querySelector('summary')?.textContent).toContain('1 / 7');
    // The full list is inline: no capped preview and no jump to a second page that repeats it.
    expect(section('plan').querySelectorAll('.opencodian-workbench-todo')).toHaveLength(7);
    expect(section('plan').querySelector('button')).toBeNull();
    expect(boundary.querySelectorAll('.opencodian-workbench-todo')).toHaveLength(7);
  });

  it('groups native session terminals by task metadata, never by id or label, with the spawn form inside that group', () => {
    mount({ spawnTerminal: jest.fn(async () => 'Terminal opened') });
    const terminal = { id: 'job:looks-like-a-job', title: 'build watcher', status: 'running', nativeTerminalId: 'pty-1' };
    const background = { id: 'terminal:looks-like-a-terminal', title: 'terminal-ish job', status: 'running' };
    surface.setState(state({ tasks: [terminal, background], nativeTerminals: { backends: ['xterm'], spawn: true } }));
    const count = (key: string) => section(key).querySelector('summary .opencodian-workbench-row-meta')?.textContent;
    expect(section('terminals').querySelector('summary')?.textContent).toContain(t('workbench.sessionTerminals'));
    expect(section('terminals').textContent).toContain('build watcher');
    expect(section('terminals').textContent).not.toContain('terminal-ish job');
    expect(section('activity').textContent).toContain('terminal-ish job');
    expect(section('activity').textContent).not.toContain('build watcher');
    expect(count('terminals')).toBe('1'); expect(count('activity')).toBe('1');
    expect(section('terminals').querySelector('details[data-draft="spawn"]')).not.toBeNull();
    expect(section('activity').querySelector('details[data-draft="spawn"]')).toBeNull();
    // Every row is rendered exactly once across the whole surface.
    expect(boundary.querySelectorAll('details.opencodian-workbench-task[data-task]')).toHaveLength(2);
    // Without a native terminal service and without terminal rows there is no terminals group at all.
    surface.setState(state({ tasks: [background] }));
    expect(section('terminals')).toBeNull();
    expect(section('activity').textContent).toContain('terminal-ish job');
  });
});

describe('session workbench navigation and focus memory', () => {
  // Focus targets are reachable controls: give the test DOM the rect model of a real browser.
  let rects: ReturnType<typeof mockRects>;
  beforeEach(() => { rects = mockRects(); });
  afterEach(() => { rects.mockRestore(); unmount(); });

  it('redirects the legacy tasks page into the inline overview activity and focuses it', () => {
    mount();
    surface.setState(state({ tasks: [job()] }));
    surface.openGoal(); surface.setPage('files');
    surface.setPage('tasks');
    // No generic category page exists anymore: the rows live in the overview.
    expect(boundary.querySelector('.opencodian-workbench-tasks')).toBeNull();
    expect(overview().hasAttribute('hidden')).toBe(false);
    expect(title()).toBe(t('workbench.information'));
    expect(section('activity').open).toBe(true);
    expect(section('activity').textContent).toContain('Index notes');
    expect(document.activeElement).toBe(section('activity').querySelector('summary'));
    // An empty session still redirects onto an honest, existing activity group.
    surface.setState(state()); surface.setPage('files'); surface.setPage('tasks');
    expect(section('activity').open).toBe(true);
    expect(section('activity').textContent).toContain(t('workbench.tasks.empty'));
    expect(document.activeElement).toBe(section('activity').querySelector('summary'));
  });

  it('returns to the overview origin: scroll and the control that opened the other card', async () => {
    mount();
    // A plan row and the goal precede the files entry, so a generic "first control" reset would land elsewhere.
    surface.setState(state({ nativePlan })); surface.openGoal(); surface.setPage('overview');
    expect(overview().querySelector('button')).not.toBe(filesRow());
    body().scrollTop = 212;
    filesRow().focus(); filesRow().click(); await tick();
    expect(document.activeElement).toBe(back());
    // The other card scrolls on its own; the overview is rebuilt while hidden.
    body().scrollTop = 40;
    const before = filesRow();
    surface.setState(state({ nativePlan, statistics: { rounds: 1, messages: 2, tools: 0 } }));
    expect(filesRow()).not.toBe(before);
    expect(body().scrollTop).toBe(40);
    back().click(); await tick();
    expect(overview().hasAttribute('hidden')).toBe(false);
    expect(body().scrollTop).toBe(212);
    expect(document.activeElement).toBe(filesRow());
  });

  it('keeps the back-navigation origin per session instead of the last session that navigated', async () => {
    mount();
    surface.setState(state()); surface.openGoal(); surface.setPage('overview');
    entry(t('workbench.git')).focus(); entry(t('workbench.git')).click(); await tick();
    expect(title()).toBe(t('workbench.git'));
    surface.setState(other()); surface.openGoal(); surface.setPage('overview');
    entry(t('workbench.browser')).focus(); entry(t('workbench.browser')).click(); await tick();
    expect(title()).toBe(t('workbench.browser'));
    // Back in the first session its own card and origin are restored, not the other session's.
    surface.setState(state());
    expect(title()).toBe(t('workbench.git'));
    back().focus(); back().click(); await tick();
    expect(document.activeElement).toBe(entry(t('workbench.git')));
    surface.setState(other());
    expect(title()).toBe(t('workbench.browser'));
    back().focus(); back().click(); await tick();
    expect(document.activeElement).toBe(entry(t('workbench.browser')));
  });

  it('lets a native-keys host own Escape and keeps closing the panel for every other target', () => {
    const register = jest.spyOn(Scope.prototype, 'register');
    mount({ app: { scope: new Scope(), keymap: { pushScope: jest.fn(), popScope: jest.fn() } } as unknown as App });
    surface.setState(state()); surface.openGoal();
    const panel = boundary.querySelector<HTMLElement>('.opencodian-workbench-panel')!;
    const scopeEscape = register.mock.calls.find((call) => call[1] === 'Escape')![2];
    const terminal = panel.createDiv({ attr: { 'data-workbench-native-keys': 'true' } }).createEl('textarea');
    const escape = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    // Bubbling panel listener: the terminal keeps its Escape and the panel stays open.
    const bubbled = escape(); terminal.dispatchEvent(bubbled);
    expect(bubbled.defaultPrevented).toBe(false);
    expect(panel.hasAttribute('hidden')).toBe(false);
    // Obsidian scope: an unhandled key must not return false, or the keymap would swallow it.
    const scoped = escape(); Object.defineProperty(scoped, 'target', { value: terminal });
    expect(scopeEscape(scoped, {} as never)).not.toBe(false);
    expect(scoped.defaultPrevented).toBe(false);
    expect(panel.hasAttribute('hidden')).toBe(false);
    // Any other target still closes through the same scope.
    expect(scopeEscape(escape(), {} as never)).toBe(false);
    expect(panel.hasAttribute('hidden')).toBe(true);
    register.mockRestore();
  });

  it('routes the command catalog to the overview and never restores a blank tools card for it', () => {
    mount();
    surface.setState(state()); surface.openTool('git');
    const catalog = boundary.querySelector<HTMLElement>('.opencodian-workbench-inline-resources')!;
    surface.openTool('context');
    expect(openTool).toHaveBeenLastCalledWith('context');
    expect(overview().hasAttribute('hidden')).toBe(false);
    expect(boundary.querySelector('.opencodian-workbench-tools')?.hasAttribute('hidden')).toBe(true);
    expect(title()).toBe(t('workbench.information'));
    expect(overview().contains(catalog)).toBe(true);
    // The session preference stays on the overview: switching away and back restores no tools card for the catalog.
    surface.setState(other()); surface.setState(state());
    expect(overview().hasAttribute('hidden')).toBe(false);
    expect(title()).toBe(t('workbench.information'));
    expect(openTool).toHaveBeenLastCalledWith('context');
    // The selected real tool is untouched: the catalog is not a tools-page card.
    surface.openTool('browser'); surface.openTool('context'); surface.setPage('tools');
    expect(title()).toBe(t('workbench.browser'));
  });

  it('mounts the tools-owned inline resources once after the tools and keeps that DOM across overview rebuilds', () => {
    const order: string[] = [];
    let catalog!: HTMLInputElement;
    const mountResources = jest.fn((parent: HTMLElement) => { order.push('resources'); catalog = parent.createEl('input'); });
    mount({ mountTools: jest.fn(() => { order.push('tools'); }), mountResources });
    expect(order).toEqual(['tools', 'resources']);
    surface.setState(state({ tasks: [job()] }));
    const host = catalog.parentElement!;
    expect(host.classList.contains('opencodian-workbench-inline-resources')).toBe(true);
    expect(host.parentElement).toBe(overview());
    expect(host.previousElementSibling?.getAttribute('data-section')).toBe('sources');
    catalog.value = 'typed query';
    surface.setState(state({ tasks: [job('exited 0')] }));
    surface.setState(other());
    expect(catalog.parentElement).toBe(host);
    expect(host.parentElement).toBe(overview());
    expect(catalog.value).toBe('typed query');
    // A child transcript only detaches the host; returning to the parent reattaches the same DOM.
    const agent = { id: 'native-child', title: 'Inspect files', status: 'running' as const, readable: true };
    surface.setState(other({ child: { agent, loading: false, messages: [] } }));
    expect(host.isConnected).toBe(false);
    expect(catalog.parentElement).toBe(host);
    surface.setState(other());
    expect(host.parentElement).toBe(overview());
    expect(catalog.value).toBe('typed query');
    expect(mountResources).toHaveBeenCalledTimes(1);
    expect(overview().querySelectorAll('.opencodian-workbench-inline-resources')).toHaveLength(1);
  });

  it('focuses the new session overview after a switch instead of a node that its rebuild removes', async () => {
    mount();
    surface.setState(state({ nativePlan })); surface.openGoal(); surface.setPage('overview');
    entry(t('workbench.git')).focus(); entry(t('workbench.git')).click(); await tick();
    expect(document.activeElement).toBe(back());
    // Session B has no card preference: its overview is shown and focus lands on the first reachable control inside it
    // (the Plan toggle is disabled in this fixture, so that is the files entry).
    surface.setState(other({ nativePlan }));
    expect(overview().hasAttribute('hidden')).toBe(false);
    expect(document.activeElement!.isConnected).toBe(true);
    expect(overview().querySelector<HTMLButtonElement>('button.opencodian-workbench-control-row')!.disabled).toBe(true);
    expect(document.activeElement).toBe(filesRow());
    // Back to the first session: its tools card is restored with the stable header focused, and its origin still works.
    surface.setState(state({ nativePlan }));
    expect(title()).toBe(t('workbench.git'));
    expect(document.activeElement).toBe(back());
    back().click(); await tick();
    expect(document.activeElement).toBe(entry(t('workbench.git')));
  });

  it('restores the catalog editor across fingerprint-driven overview rebuilds without fighting the user for focus', () => {
    let search!: HTMLInputElement;
    mount({ mountResources: (parent) => { search = parent.createEl('input', { attr: { 'aria-label': 'Search commands and skills' } }); } });
    surface.setState(state({ tasks: [job()], statistics: { rounds: 1, messages: 2, tools: 0 } }));
    search.focus(); search.value = 'git co'; search.setSelectionRange(3, 5);
    // The coordinator projects new task and statistics state: the overview is emptied and rebuilt around the same node.
    surface.setState(state({ tasks: [job('exited 0')], statistics: { rounds: 2, messages: 4, tools: 1 } }));
    expect(overview().contains(search)).toBe(true);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('git co');
    expect([search.selectionStart, search.selectionEnd]).toEqual([3, 5]);
    // Focus the user moved elsewhere is respected: the rebuild does not pull it back into the catalog.
    filesRow().focus();
    surface.setState(state({ tasks: [job()], statistics: { rounds: 3, messages: 6, tools: 1 } }));
    expect(document.activeElement).not.toBe(search);
    // Opening the Goal detail hides the catalog and leaves focus on the Goal, not the detached editor.
    search.focus();
    surface.openGoal();
    expect(overview().contains(search)).toBe(false);
    expect(document.activeElement).toBe(section('goal').querySelector('summary'));
    surface.setPage('overview');
    expect(overview().contains(search)).toBe(true);
    expect(document.activeElement).not.toBe(search);
    expect(search.value).toBe('git co');
  });
});

describe('session workbench reachable focus', () => {
  let rects: ReturnType<typeof mockRects>;
  beforeEach(() => { rects = mockRects(); });
  afterEach(() => { rects.mockRestore(); unmount(); });

  it('keeps the expanded focus trap on reachable controls and off the content of closed groups', async () => {
    let catalog!: HTMLDetailsElement;
    mount({ mountResources: (parent) => {
      catalog = parent.createEl('details'); catalog.createEl('summary', { text: 'Commands and skills' }); catalog.createEl('button', { text: 'Load' });
    } });
    surface.setState(state()); surface.openGoal(); surface.setPage('overview');
    const panel = boundary.querySelector<HTMLElement>('.opencodian-workbench-panel')!;
    [...panel.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-actions > button')]
      .find((button) => button.getAttribute('aria-label') === t('workbench.expand'))!.click();
    await tick();
    const first = [...panel.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-header button')].find((button) => !button.hidden)!;
    const tab = (shiftKey: boolean) => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
    // The workspace's final navigation row owns wrap-around after the catalog moves beside references.
    first.focus(); tab(true);
    expect(document.activeElement).toBe(entry(t('workbench.browser')));
    entry(t('workbench.browser')).focus(); tab(false);
    expect(document.activeElement).toBe(first);
    // Isolate the catalog as the final group: its closed content cannot own the wrap target, but its open content can.
    for (const key of ['quota', 'statistics', 'mcp']) { const group = section(key); if (group) group.hidden = true; }
    overview().querySelector<HTMLElement>('.opencodian-workbench-shortcuts')!.hidden = true;
    first.focus(); tab(true);
    expect(document.activeElement).toBe(catalog.querySelector('summary'));
    catalog.open = true;
    first.focus(); tab(true);
    expect(document.activeElement).toBe(catalog.querySelector('button'));
  });

  it('focuses a reachable control when the new session has a folded Goal and no saved origin', async () => {
    mount();
    // Session B keeps a Goal group, folded by the user, whose controls precede the files entry.
    surface.setState(other()); surface.openGoal(); surface.setPage('overview');
    section('goal').open = false; section('goal').dispatchEvent(new Event('toggle'));
    // Session A leaves its overview for a tools card.
    surface.setState(state()); surface.openGoal(); surface.setPage('overview');
    entry(t('workbench.git')).focus(); entry(t('workbench.git')).click(); await tick();
    expect(document.activeElement).toBe(back());
    // Without a saved origin the fallback picks the first REACHABLE control: the folded group's heading, not a control inside it.
    surface.setState(other());
    const goal = section('goal');
    expect(goal.open).toBe(false);
    expect(goal.querySelector('button')).not.toBeNull();
    expect(document.activeElement).toBe(goal.querySelector('summary'));
    // A reachable control is never skipped in favour of anything hidden.
    expect(overview().contains(document.activeElement)).toBe(true);
  });

  it('does not return focus to an origin control that now sits inside a closed group', async () => {
    mount();
    surface.setState(state()); surface.openGoal(); surface.setPage('overview');
    const create = () => section('goal').querySelector<HTMLButtonElement>('button')!;
    // The user leaves the overview from a control inside the Goal group (a composer shortcut opens a tool).
    create().focus(); surface.openTool('git');
    expect(document.activeElement).toBe(back());
    // The group is folded by the time the user comes back.
    section('goal').open = false; section('goal').dispatchEvent(new Event('toggle'));
    surface.setState(state({ statistics: { rounds: 1, messages: 2, tools: 0 } }));
    back().click(); await tick();
    expect(section('goal').open).toBe(false);
    expect(document.activeElement).not.toBe(create());
    expect(document.activeElement).toBe(section('goal').querySelector('summary'));
  });
});
