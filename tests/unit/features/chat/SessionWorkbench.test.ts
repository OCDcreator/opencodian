import { type App, Scope } from 'obsidian';

import type { AgentGoalCapabilities, AgentGoalSnapshot } from '../../../../src/core/agents/backend/BackendGoalRuntime';
import { SessionWorkbench, type SessionWorkbenchState } from '../../../../src/features/chat/ui/SessionWorkbench';
import { t } from '../../../../src/i18n';

function state(overrides: Partial<SessionWorkbenchState> = {}): SessionWorkbenchState {
  return { identity: 'codex:c1', title: 'Current session', backend: 'Codex', sessionId: 'thread1',
    goal: { status: 'ready', goal: null, observedAt: Date.now() },
    capabilities: { source: 'native', driver: 'codex', actions: ['set', 'edit', 'pause', 'resume', 'clear'], pauseMode: 'goal', editMode: 'replace', budgets: ['tokens'] },
    armed: false, busy: false, todos: [], tasks: [], resources: [], ...overrides };
}

describe('session workbench surface', () => {
  let boundary: HTMLElement;
  let surface: SessionWorkbench;
  const controlGoal = jest.fn(async () => {});
  const openTool = jest.fn();
  const mountTools = jest.fn();
  beforeEach(() => {
    boundary = document.createElement('div'); document.body.appendChild(boundary);
    boundary.getBoundingClientRect = () => ({ width: 400 }) as DOMRect;
    surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal, refresh: jest.fn(),
      openMessage: jest.fn(), openResource: jest.fn(), stopTask: jest.fn(), mountTools, openTool });
  });
  afterEach(() => { surface.destroy(); boundary.remove(); jest.clearAllMocks(); });

  it('returns focus to the Goal entry that opened the panel', () => {
    surface.setState(state());
    const goal = boundary.createEl('button'); goal.focus();
    surface.openGoal();
    boundary.querySelector('.opencodian-workbench-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(goal);
  });

  it('owns an Obsidian Escape scope only while open and releases it on destroy', () => {
    surface.destroy();
    const register=jest.spyOn(Scope.prototype,'register');
    const keymap={pushScope:jest.fn(),popScope:jest.fn()};
    const app={scope:new Scope(),keymap} as unknown as App;
    surface=new SessionWorkbench(boundary,{app,armGoal:jest.fn(),controlGoal,refresh:jest.fn(),openMessage:jest.fn(),
      openResource:jest.fn(),stopTask:jest.fn(),mountTools:jest.fn()});
    surface.setState(state());surface.openGoal();surface.openGoal();
    expect(keymap.pushScope).toHaveBeenCalledTimes(1);
    const handler=register.mock.calls.find(call=>call[1]==='Escape')![2];
    handler(new KeyboardEvent('keydown',{key:'Escape'}),{} as never);
    expect(boundary.querySelector('.opencodian-workbench-panel')?.hasAttribute('hidden')).toBe(true);
    expect(keymap.popScope).toHaveBeenCalledTimes(1);
    surface.openGoal();surface.destroy();
    expect(keymap.popScope).toHaveBeenCalledTimes(2);
    register.mockRestore();
  });

  it('opens a specific card directly without a workbench tab rail', async () => {
    surface.setState(state());
    const entry = boundary.querySelector<HTMLButtonElement>('.opencodian-workbench-trigger')!;
    entry.click();
    await Promise.resolve();
    expect(boundary.querySelector('.opencodian-workbench-host')?.classList.contains('is-narrow')).toBe(true);
    const repository = [...boundary.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-shortcut')]
      .find((button) => button.textContent === t('workbench.git'))!;
    repository.click();
    await Promise.resolve();
    expect(boundary.querySelector('.opencodian-workbench-tools')?.hasAttribute('hidden')).toBe(false);
    expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t('workbench.git'));
    expect(boundary.querySelector('[role=tablist]')).toBeNull();
    expect(boundary.querySelector('[role=tab]')).toBeNull();
    expect(boundary.querySelector('select')).toBeNull();
    expect(boundary.textContent).not.toContain(t('workbench.title'));
    boundary.querySelector('.opencodian-workbench-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(boundary.querySelector('.opencodian-workbench-panel')?.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(entry);
  });

  it('keeps cached objectives readable on a failed authoritative read and disables control', () => {
    surface.setState(state({ goal: { status: 'failed', reason: 'Offline', goal: { backend: 'codex', sessionId: 'thread1', source: 'native', driver: 'codex',
      objective: 'Verify every acceptance condition', status: 'active', rawStatus: 'active', execution: 'running' } } }));
    expect(boundary.textContent).toContain('Offline');
    expect(boundary.textContent).toContain('Verify every acceptance condition');
    const pause = [...boundary.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.title === t('workbench.goal.pause'));
    expect(pause?.disabled).toBe(true);
  });

  it('restores each session card and selected tool without remounting the tools', () => {
    surface.setState(state()); surface.openTool('git');
    surface.setState(state({ identity: 'codex:c2', sessionId: 'thread2' }));
    expect(boundary.querySelector('.opencodian-workbench-overview')?.hasAttribute('hidden')).toBe(false);
    surface.openTool('browser');
    expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t('workbench.browser'));
    surface.setState(state());
    expect(boundary.querySelector('.opencodian-workbench-tools')?.hasAttribute('hidden')).toBe(false);
    expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t('workbench.git'));
    expect(openTool).toHaveBeenLastCalledWith('git');
    expect(mountTools).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['terminal', 'workbench.terminal'], ['git', 'workbench.git'],
    ['browser', 'workbench.browser'], ['context', 'workbench.resources'],
  ] as const)('opens the %s shortcut as its own card', async (tool, label) => {
    surface.setState(state());
    boundary.querySelector<HTMLButtonElement>('.opencodian-workbench-trigger')!.click();
    await Promise.resolve();
    [...boundary.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-shortcut')]
      .find((button) => button.textContent === t(label))!.click();
    await Promise.resolve();
    expect(openTool).toHaveBeenLastCalledWith(tool);
    expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t(label));
    expect(boundary.querySelector('.opencodian-workbench-tools')?.hasAttribute('hidden')).toBe(false);
    surface.setState(state({ statistics: { rounds: 1, messages: 2, tools: 0 } }));
    expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t(label));
    const back = boundary.querySelector<HTMLButtonElement>(`.opencodian-workbench-header button[aria-label="${t('workbench.goal.backToInformation')}"]`)!;
    back.focus();
    back.click();
    await Promise.resolve();
    expect(boundary.querySelector('.opencodian-workbench-overview')?.hasAttribute('hidden')).toBe(false);
    expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t('workbench.information'));
    expect(boundary.querySelector('.opencodian-workbench-overview')?.contains(document.activeElement)).toBe(true);
  });

  it('shows information without requiring a Goal and keeps every disclosure independent', () => {
    const information = { sessionId: 'thread1', observedAt: 1, quota: { windows: [{ label: 'primary', usedPercent: 33 }] },
      mcp: { scope: 'session' as const, servers: [{ name: 'notes', status: 'connected' }] }, agents: [] };
    const data = state({ information, statistics: { rounds: 2, messages: 4, tools: 3 }, contextSources: [{ label: 'Sent note', path: 'note.md' }] });
    surface.setState(data);
    const section = (title: string) => [...boundary.querySelectorAll<HTMLDetailsElement>('.opencodian-workbench-overview > details')]
      .find((element) => element.querySelector('summary')?.textContent?.includes(title))!;
    expect(section(t('workbench.goal.title'))).toBeUndefined();
    const quota = section(t('workbench.info.quota'));
    quota.open = false; quota.dispatchEvent(new Event('toggle'));
    surface.setState({ ...data, statistics: { rounds: 3, messages: 6, tools: 4 } });
    expect(section(t('workbench.info.quota')).open).toBe(false);
    expect(section(t('workbench.info.quota')).querySelector('summary')?.textContent).toContain('33%');
    expect(section(t('workbench.info.mcp')).open).toBe(true);
    surface.setState(state({ identity: 'codex:c2', sessionId: 'thread2' }));
    surface.setState(data);
    expect(section(t('workbench.info.quota')).open).toBe(false);
  });

  it('keeps unreported quotas distinct from zero and restores parent panel scroll after inspecting a child', () => {
    const data = state({ statistics: { rounds: 1, messages: 2, tools: 0 } });
    surface.setState(data);
    expect(boundary.textContent).toContain(t('workbench.info.unavailable'));
    expect(boundary.querySelector('progress')).toBeNull();
    const body = boundary.querySelector<HTMLElement>('.opencodian-workbench-body')!;
    body.scrollTop = 137;
    const agent = { id: 'native-child', title: 'Inspect files', status: 'running' as const, readable: true };
    surface.setState({ ...data, child: { agent, loading: false, messages: [{ id: 'm', role: 'assistant', timestamp: 1, content: 'Reading the actual child transcript' }] } });
    expect(boundary.textContent).toContain('Reading the actual child transcript');
    expect(boundary.textContent).toContain(t('workbench.info.returnToParent'));
    body.scrollTop = 89;
    surface.setState(data);
    expect(body.scrollTop).toBe(137);
    expect(boundary.textContent).not.toContain('Reading the actual child transcript');
  });

  it('reveals and focuses the Goal section from its dedicated composer entry', () => {
    surface.setState(state()); surface.openGoal();
    const original = boundary.querySelector<HTMLDetailsElement>('[data-section="goal"]')!;
    original.open = false; original.dispatchEvent(new Event('toggle'));
    surface.openGoal();
    const revealed = boundary.querySelector<HTMLDetailsElement>('[data-section="goal"]')!;
    expect(revealed.open).toBe(true);
    expect(document.activeElement).toBe(revealed.querySelector('summary'));
  });

  it.each([
    { backend:'opencode2', source:'native', pauseMode:'goal', editMode:'replace', tokens:false },
    { backend:'claude-code', source:'native', pauseMode:'execution', editMode:'replace', tokens:false },
    { backend:'codex', source:'native', pauseMode:'goal', editMode:'replace', tokens:true },
    { backend:'zcode', source:'native', pauseMode:'goal', editMode:'replace', tokens:false },
    { backend:'dsh', source:'native', pauseMode:'goal', editMode:'edit', tokens:false },
    { backend:'pi', source:'extension', pauseMode:'goal', editMode:'edit', tokens:true },
  ] as const)('exposes $backend Goal control semantics and submits native actions', async ({backend, source, pauseMode, editMode, tokens}) => {
    const capabilities: AgentGoalCapabilities = { source, driver: backend, pauseMode, editMode,
      actions: ['set','edit','pause','resume','clear'], budgets: tokens ? ['tokens'] : [] };
    const goal: AgentGoalSnapshot = { backend, source, driver: backend, sessionId:'native', objective:'Original condition',
      status:'active', rawStatus:'active', execution:'running', revision:7 };
    const setGoal = (next: AgentGoalSnapshot) => surface.setState(state({ capabilities, goal:{status:'ready',goal:next,observedAt:1} }));
    const button = (key: Parameters<typeof t>[0]) => boundary.querySelector<HTMLButtonElement>(`button[aria-label="${t(key)}"]`)!;
    const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
    setGoal(goal); surface.openGoal();
    expect(boundary.querySelector('.opencodian-workbench-overview [data-section="quota"]')).toBeNull();
    button(pauseMode === 'execution' ? 'workbench.goal.stop' : 'workbench.goal.pause').click(); await flush();
    expect(controlGoal).toHaveBeenLastCalledWith({action:'pause'});
    setGoal({...goal,status:pauseMode==='execution'?'active':'paused',execution:'stopped'});
    button(pauseMode === 'execution' ? 'workbench.goal.continue' : 'workbench.goal.resume').click(); await flush();
    expect(controlGoal).toHaveBeenLastCalledWith({action:'resume'});
    button(editMode==='replace'?'workbench.goal.replace':'workbench.goal.edit').click(); await flush();
    const editor = boundary.querySelector('textarea')!; editor.value='Changed completion condition';
    expect(Boolean(boundary.querySelector('input'))).toBe(tokens);
    button(editMode==='replace'?'workbench.goal.replace':'workbench.save').click(); await flush();
    expect(controlGoal).toHaveBeenLastCalledWith({action:'edit',objective:'Changed completion condition',expectedRevision:7,
      ...(tokens?{tokenBudget:null}:{})});
    button('workbench.goal.clear').click(); await flush();
    expect(controlGoal).toHaveBeenLastCalledWith({action:'clear'});
  });

  it('offers only declared capabilities and no resume action for a completed disarmed Goal', () => {
    const goal: AgentGoalSnapshot = {backend:'dsh',source:'native',driver:'dsh',sessionId:'native',objective:'Completed',
      status:'complete',rawStatus:'complete',execution:'idle',armed:false};
    surface.setState(state({goal:{status:'ready',goal,observedAt:1},capabilities:{source:'native',driver:'dsh',
      actions:['clear'],pauseMode:'goal',editMode:'edit',budgets:[]}}));
    surface.openGoal();
    const buttons=[...boundary.querySelectorAll<HTMLButtonElement>('[data-section="goal"] button')];
    expect(buttons.map(button=>button.getAttribute('aria-label'))).toEqual([t('workbench.goal.removeCompleted')]);
    surface.setState(state({goal:{status:'unavailable',goal,reason:'Native transport unavailable'}}));
    expect(boundary.querySelectorAll('[data-section="goal"] button')).toHaveLength(0);
  });

  it('retains the editor and displays native write failures without discarding the draft', async () => {
    const goal: AgentGoalSnapshot={backend:'codex',source:'native',driver:'codex',sessionId:'native',objective:'Original',
      status:'active',rawStatus:'active',execution:'idle'};
    surface.setState(state({goal:{status:'ready',goal,observedAt:1}})); surface.openGoal();
    boundary.querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.goal.replace')}"]`)!.click();
    for(let i=0;i<5;i++) await Promise.resolve();
    const editor=boundary.querySelector('textarea')!;editor.value='Keep this unsaved change';
    controlGoal.mockRejectedValueOnce(new Error('Native write rejected'));
    boundary.querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.goal.replace')}"]`)!.click();
    for(let i=0;i<8;i++) await Promise.resolve();
    expect(boundary.querySelector('textarea')?.value).toBe('Keep this unsaved change');
    expect(boundary.querySelector('[role=alert]')?.textContent).toBe('Native write rejected');
  });
});

describe('session card focus across content refresh', () => {
  it.each([['tasks', 'workbench.tasks'], ['files', 'workbench.files']] as const)(
    'keeps focus on the stable header when %s content is replaced', (page, label) => {
      const boundary = document.body.createDiv();
      const surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(),
        openMessage: jest.fn(), openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn() });
      try {
        surface.setState(state()); surface.openGoal(); surface.setPage(page);
        const back = boundary.querySelector<HTMLButtonElement>(`.opencodian-workbench-header button[aria-label="${t('workbench.goal.backToInformation')}"]`)!;
        expect(document.activeElement).toBe(back);
        boundary.querySelector(`.opencodian-workbench-${page}`)!.replaceChildren(document.createElement('button'));
        surface.setState(state({ statistics: { rounds: 1, messages: 2, tools: 0 } }));
        expect(document.activeElement).toBe(back);
        expect(boundary.querySelector('.opencodian-workbench-session')?.textContent).toBe(t(label));
      } finally { surface.destroy(); boundary.remove(); }
    });
});

describe('session information entry structure', () => {
  it('keeps controls above information and gives task/tool entries consistent navigation', async () => {
    const boundary = document.body.createDiv();
    const surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(),
      openMessage: jest.fn(), openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn() });
    try {
      surface.setState(state({ contextSources: [{ label: 'Attached note', path: 'note.md' }] }));
      boundary.querySelector<HTMLButtonElement>('.opencodian-workbench-trigger')!.click();
      await Promise.resolve();
      const panel = boundary.querySelector('.opencodian-workbench-panel')!;
      const header = panel.querySelector('.opencodian-workbench-header')!;
      const overview = panel.querySelector('.opencodian-workbench-overview')!;
      expect(header.parentElement).toBe(panel);
      expect(overview.contains(header)).toBe(false);
      expect(header.textContent).toContain(t('workbench.information'));
      expect(overview.querySelector('summary')?.contains(header)).toBe(false);
      const entries = [...overview.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-shortcuts > button')];
      expect(entries.map((button) => button.textContent)).toEqual([
        t('workbench.tasks'), t('workbench.terminal'), t('workbench.git'), t('workbench.browser'), t('workbench.resources'),
      ]);
      for (const entry of entries) {
        expect(entry.classList.contains('opencodian-workbench-shortcut')).toBe(true);
        expect(entry.querySelector('svg[data-icon="chevron-right"]')).not.toBeNull();
      }
      expect(overview.textContent).toContain(t('workbench.info.sources'));
      expect(t('workbench.info.sources')).not.toBe(t('workbench.resources'));
      entries[0].focus(); entries[0].click(); await Promise.resolve();
      expect(panel.querySelector('.opencodian-workbench-tasks')?.hasAttribute('hidden')).toBe(false);
      expect(panel.querySelector('.opencodian-workbench-session')?.textContent).toBe(t('workbench.tasks'));
      expect(document.activeElement).toBe(header.querySelector(`button[aria-label="${t('workbench.goal.backToInformation')}"]`));
    } finally { surface.destroy(); boundary.remove(); }
  });
});

it('aligns docked cards with the visible composer above its status footer', () => {
  const boundary = document.body.createDiv();
  boundary.getBoundingClientRect = () => ({ width: 1000, bottom: 900 }) as DOMRect;
  const input = boundary.createDiv({ cls: 'opencodian-input-area' });
  input.getBoundingClientRect = () => ({ height: 200, top: 680, bottom: 880 }) as DOMRect;
  const composer = input.createDiv({ cls: 'opencodian-composer-shell' });
  composer.getBoundingClientRect = () => ({ height: 140, bottom: 840 }) as DOMRect;
  const surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(),
    openMessage: jest.fn(), openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn() });
  try {
    surface.setState(state()); surface.openGoal();
    const host = boundary.querySelector<HTMLElement>('.opencodian-workbench-host')!;
    expect(host.style.getPropertyValue('--workbench-dock-bottom')).toBe('60px');
    expect(host.style.getPropertyValue('--workbench-bottom')).toBe('228px');
    composer.getBoundingClientRect = () => ({ height: 140, bottom: 810 }) as DOMRect;
    surface.openGoal();
    expect(host.style.getPropertyValue('--workbench-dock-bottom')).toBe('90px');
    composer.remove(); surface.openGoal();
    expect(host.style.getPropertyValue('--workbench-dock-bottom')).toBe('20px');
  } finally { surface.destroy(); boundary.remove(); }
});

  it('offers docking only when the pane can reserve room, and restores it after resizing', async () => {
    const boundary = document.body.createDiv();
    boundary.getBoundingClientRect = () => ({ width: 400 }) as DOMRect;
    const surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(),
      openMessage: jest.fn(), openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn() });
    try {
    surface.setState(state()); surface.openGoal();
    const dock = [...boundary.querySelectorAll<HTMLButtonElement>('button')].find(button => button.title === t('workbench.dock'))!;
    expect(dock.hidden).toBe(true);
    boundary.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect;
    surface.openGoal();
    expect(dock.hidden).toBe(false);
    expect(dock.getAttribute('aria-pressed')).toBe('false');
    dock.click(); await Promise.resolve();
    expect(dock.getAttribute('aria-pressed')).toBe('true');
    expect(boundary.classList.contains('has-workbench-docked')).toBe(true);
    boundary.getBoundingClientRect = () => ({ width: 400 }) as DOMRect;
    surface.openGoal();
    expect(dock.hidden).toBe(true);
    expect(boundary.classList.contains('has-workbench-docked')).toBe(false);
    boundary.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect;
    surface.openGoal();
    expect(dock.hidden).toBe(false);
    expect(boundary.classList.contains('has-workbench-docked')).toBe(true);
    dock.click(); await Promise.resolve();
    expect(dock.getAttribute('aria-pressed')).toBe('false');
    expect(boundary.classList.contains('has-workbench-docked')).toBe(false);
    } finally { surface.destroy(); boundary.remove(); }
  });
