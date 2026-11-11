import { SessionWorkbench, type SessionWorkbenchState, type WorkbenchTask } from '../../../../src/features/chat/ui/SessionWorkbench';
import { t } from '../../../../src/i18n';

type RecordedMenuItem = { title: string; click?: () => void };
const menuItems: RecordedMenuItem[] = [];
const menuShow = jest.fn();
jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  Menu: class {
    addItem(build: (item: unknown) => void) {
      const entry: RecordedMenuItem = { title: '', click: undefined };
      const item = { setTitle(value: string) { entry.title = value; return item; }, onClick(action: () => void) { entry.click = action; return item; } };
      build(item); menuItems.push(entry); return this;
    }
    showAtPosition(position: { x: number; y: number }) { menuShow(position); }
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function state(overrides: Partial<SessionWorkbenchState> = {}): SessionWorkbenchState {
  return { identity: 'codex:c1', title: 'Current session', backend: 'Codex', sessionId: 'thread1',
    goal: { status: 'ready', goal: null, observedAt: Date.now() },
    capabilities: { source: 'native', driver: 'codex', actions: ['set', 'edit', 'pause', 'resume', 'clear'], pauseMode: 'goal', editMode: 'replace', budgets: ['tokens'] },
    armed: false, busy: false, todos: [], tasks: [], resources: [], ...overrides };
}

let boundary: HTMLElement; let surface: SessionWorkbench;
const setPlanMode = jest.fn(async () => {});
const runTaskAction = jest.fn<(task: WorkbenchTask, id: string, value?: string) => Promise<string>>(async () => 'action done');
const spawnTerminal = jest.fn(async () => 'Terminal opened'); const openBackendSettings = jest.fn();
const flush = async () => { for (let i = 0; i < 8; ++i) await Promise.resolve(); };
const sendTask = (overrides: Partial<WorkbenchTask> = {}): WorkbenchTask => ({ id: 'terminal:t1', title: 'ops · zsh', status: 'running',
  canStop: true, input: { label: 'Terminal input', secret: true }, actions: [
    { id: 'sendLine', label: 'Send line', icon: 'corner-down-left', usesInput: true },
    { id: 'send', label: 'Send text', icon: 'send', usesInput: true },
    { id: 'signal', label: 'Send signal', icon: 'zap', choices: [{ id: 'SIGINT', label: 'Interrupt (SIGINT)' }, { id: 'SIGKILL', label: 'Kill (SIGKILL)' }] },
  ], ...overrides });
const start = () => {
  boundary = document.createElement('div'); document.body.appendChild(boundary);
  boundary.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect;
  surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(), openMessage: jest.fn(),
    openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn(), setPlanMode, runTaskAction, spawnTerminal, openBackendSettings });
};
const stop = () => { surface.destroy(); boundary.remove(); menuItems.length = 0; jest.clearAllMocks(); };
const row = (index = 0) => boundary.querySelectorAll<HTMLDetailsElement>('details[data-draft="row:terminal:t1"]')[index]!;
const rowInput = (index = 0) => row(index).querySelector<HTMLInputElement>('input[data-draft="input:terminal:t1"]')!;
const rowButton = (label: string, index = 0) => row(index).querySelector<HTMLButtonElement>(`.opencodian-workbench-actions button[aria-label="${label}"]`)!; const rowOutput = (index = 0) => row(index).querySelector<HTMLElement>('pre[data-draft="output:terminal:t1"]');

describe('native workbench plan mode and task actions', () => {
  beforeEach(start); afterEach(stop);

  it('renders native plan mode as one flat aria-pressed control row with queued notes and settable gating', async () => {
    surface.setState(state({ nativePlan: { active: true, settable: true, busy: false, notes: ['Plan applies to this session only'] } }));
    const overview = () => boundary.querySelector<HTMLElement>('.opencodian-workbench-overview')!;
    const row = () => overview().querySelector<HTMLElement>('.opencodian-workbench-control-row')!;
    const toggle = () => row() as HTMLButtonElement;
    const chip = () => row().querySelector<HTMLElement>('.opencodian-workbench-control-state')!;
    const notes = () => overview().querySelector<HTMLElement>('.opencodian-workbench-control-note');
    // One flat row: no disclosure header repeating the value, and exactly one control.
    expect(overview().querySelector('[data-section="planMode"]')).toBeNull();
    expect(row().closest('details')).toBeNull();
    expect(row().tagName).toBe('BUTTON');
    expect(row().querySelectorAll('button')).toHaveLength(0);
    // The button is the single accessible state carrier: a fixed name, with the state only in aria-pressed.
    expect(toggle().getAttribute('aria-label')).toBe(t('workbench.planMode'));
    expect(overview().querySelectorAll('[aria-pressed]')).toHaveLength(1);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(chip().textContent).toBe(t('workbench.planMode.on'));
    expect(chip().getAttribute('aria-hidden')).toBe('true');
    expect(notes()?.textContent).toContain('Plan applies to this session only');
    toggle().click(); await flush();
    expect(setPlanMode).toHaveBeenLastCalledWith(false);
    // A queued change is only a note: it never reads as the active state.
    surface.setState(state({ nativePlan: { active: false, pending: true, settable: true, busy: false, notes: ['Queued plan change'] } }));
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(chip().textContent).toBe(t('workbench.planMode.off'));
    expect(notes()?.textContent).toContain('Queued plan change');
    toggle().click(); await flush(); expect(setPlanMode).toHaveBeenLastCalledWith(false);
    surface.setState(state({ nativePlan: { active: false, settable: true, busy: false, notes: [t('chat.dsh.controls.planScope')] } }));
    expect(notes()).toBeNull(); expect(toggle().title).toBe(t('chat.dsh.controls.planScope'));
    toggle().click(); await flush(); expect(setPlanMode).toHaveBeenLastCalledWith(true);
    surface.setState(state({ nativePlan: { active: true, settable: false, busy: false, notes: [] } }));
    expect(toggle().disabled).toBe(true);
    surface.setState(state({ nativePlan: { active: true, settable: true, busy: true, notes: [] } }));
    const sent = setPlanMode.mock.calls.length; toggle().click(); await flush();
    expect(setPlanMode.mock.calls).toHaveLength(sent);
    surface.setState(state());
    expect(overview().querySelector('.opencodian-workbench-control-row')).toBeNull();
  });

  it('runs task actions inside the inline overview row with menu choices and the masked row input', async () => {
    runTaskAction.mockImplementation(async () => 'action done');
    const task = sendTask();
    const orphanTask = sendTask({ id: 'terminal:t2', title: 'ops · sh', input: undefined,
      actions: [{ id: 'sendLine', label: 'Send line', icon: 'corner-down-left', usesInput: true }] });
    surface.setState(state({ tasks: [task, orphanTask] }));
    // Rows live in the overview; the legacy tasks navigation still lands on them.
    expect(boundary.querySelector('.opencodian-workbench-overview')!.contains(row())).toBe(true);
    surface.setPage('tasks');
    expect(boundary.querySelector('.opencodian-workbench-overview')!.contains(row())).toBe(true);
    expect(rowInput().type).toBe('password'); expect(rowInput().getAttribute('aria-label')).toBe('Terminal input');
    expect(rowButton(t('workbench.goal.stop'))).not.toBeNull();
    const orphan = boundary.querySelector<HTMLButtonElement>('details[data-draft="row:terminal:t2"] button[aria-label="Send line"]')!;
    expect(orphan.disabled).toBe(true); orphan.click(); await flush(); expect(runTaskAction).not.toHaveBeenCalled();
    rowInput().value = 'tail -n 4 devlog.md'; rowButton('Send line').click(); await flush();
    expect(rowInput().value).toBe(''); expect(runTaskAction).toHaveBeenLastCalledWith(task, 'sendLine', 'tail -n 4 devlog.md');
    expect(rowOutput()?.textContent).toBe('action done');
    runTaskAction.mockRejectedValueOnce(new Error('send failed'));
    rowInput().value = 'echo again'; rowButton('Send line').click(); await flush();
    expect(rowOutput()?.textContent).toBe('send failed');
    rowButton('Send signal').click(); await flush();
    expect(menuShow).toHaveBeenCalledTimes(1);
    expect(menuItems.map((item) => item.title)).toEqual(['Interrupt (SIGINT)', 'Kill (SIGKILL)']);
    expect(runTaskAction).toHaveBeenLastCalledWith(task, 'sendLine', 'echo again');
    menuItems[1].click!(); await flush(); expect(runTaskAction).toHaveBeenLastCalledWith(task, 'signal', 'SIGKILL');
    // The action output belongs to the task identity: an overview rebuild keeps it on the rebuilt row.
    expect(rowOutput()?.textContent).toBe('action done');
    const before = row();
    surface.setState(state({ tasks: [{ ...task, status: 'exited 0' }, orphanTask] }));
    expect(row()).not.toBe(before);
    expect(rowOutput()?.textContent).toBe('action done');
  });

  it('admits enabled sends in a mixed row while its permanent disabled action never dispatches', async () => {
    const gate = deferred<string>();
    runTaskAction.mockImplementation(async () => { await gate.promise; return 'action done'; });
    surface.setState(state({ tasks: [sendTask({ actions: [
      { id: 'readEarlier', label: 'Earlier output', icon: 'history', disabled: true, reason: 'Output stays readable while running' },
      ...sendTask().actions ] })] }));
    expect(rowButton('Earlier output').disabled).toBe(true);
    expect(rowButton('Earlier output').title).toBe('Output stays readable while running');
    rowButton('Earlier output').click(); await flush(); expect(runTaskAction).not.toHaveBeenCalled();
    rowInput().value = 'tail -n 2 devlog.md'; rowButton('Send line').click(); await flush();
    expect(runTaskAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'terminal:t1' }), 'sendLine', 'tail -n 2 devlog.md');
    expect(rowInput().value).toBe('');
    expect(rowButton('Send line').disabled).toBe(true); expect(rowButton('Send text').disabled).toBe(true); expect(rowButton('Send signal').disabled).toBe(true);
    expect(rowButton('Earlier output').disabled).toBe(true);
    gate.resolve('done'); await flush();
    expect(rowButton('Send line').disabled).toBe(false); expect(rowButton('Send signal').disabled).toBe(false);
    expect(rowButton('Earlier output').disabled).toBe(true);
  });

  it('keeps data-draft input values, selection and focus across a same-identity overview re-render', () => {
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    row(0).open = true; const before = rowInput();
    before.focus(); before.value = 'tail -f devlog.md'; before.setSelectionRange(4, 4);
    surface.setState(state({ tasks: [{ ...task, status: 'exited 0' }] }));
    const after = rowInput();
    expect(after === before).toBe(false); expect(after.value).toBe('tail -f devlog.md');
    expect(document.activeElement).toBe(after); expect(after.selectionStart).toBe(4);
    expect(row(0).open).toBe(true);
    // The typed draft also survives a rebuild that happens while another card is shown.
    after.value = 'tail -n 20 devlog.md';
    surface.setPage('files');
    surface.setState(state({ tasks: [{ ...task, status: 'running' }] }));
    surface.setPage('overview');
    expect(rowInput().value).toBe('tail -n 20 devlog.md');
    expect(row(0).open).toBe(true);
  });

  it('keeps the row pending lock across a same-identity re-render so the other send cannot double-dispatch', async () => {
    const gate = deferred<string>();
    const dispatches: string[] = []; const pendingOps = new Set<string>();
    runTaskAction.mockImplementation(async (task: WorkbenchTask, id: string, value?: string) => {
      const key = `${task.id}:${id}`;
      if (pendingOps.has(key)) throw new Error(t('workbench.tool.unavailable'));
      pendingOps.add(key); dispatches.push(`${id}:${value ?? ''}`);
      try { return await gate.promise; } finally { pendingOps.delete(key); }
    });
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    const locked = () => { expect(rowButton('Send line').disabled).toBe(true); expect(rowButton('Send text').disabled).toBe(true);
      expect(rowButton('Send signal').disabled).toBe(true); expect(rowInput().disabled).toBe(true); };
    rowInput().value = 'first draft'; rowButton('Send line').click(); await flush();
    expect(dispatches).toEqual(['sendLine:first draft']); expect(rowInput().value).toBe(''); locked();
    // The coordinator refreshes with the same identity while the first send is still unresolved.
    surface.setState(state({ tasks: [{ ...task, status: 'restarted' }] }));
    expect(rowInput().value).toBe(''); locked();
    rowInput().value = 'second typed draft'; rowButton('Send text').click(); await flush();
    expect(dispatches).toEqual(['sendLine:first draft']); expect(rowInput().value).toBe('second typed draft');
    gate.resolve('first sent'); await flush();
    // Settlement releases the lock for the session's next refresh; the rebuilt row is usable again.
    surface.setState(state({ tasks: [{ ...task, status: 'running' }] }));
    expect(rowButton('Send text').disabled).toBe(false); expect(rowButton('Send line').disabled).toBe(false);
    expect(rowInput().disabled).toBe(false); expect(rowInput().value).toBe('second typed draft');
  });

  it('restores a rejected send into the visible input and never overwrites a newer typed draft', async () => {
    const pendingOps = new Set<string>(); let gate = deferred<string>();
    runTaskAction.mockImplementation(async (task: WorkbenchTask, id: string) => {
      const key = `${task.id}:${id}`;
      if (pendingOps.has(key)) throw new Error(t('workbench.tool.unavailable'));
      pendingOps.add(key);
      try { return await gate.promise; } finally { pendingOps.delete(key); }
    });
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    rowInput().value = 'first draft'; rowButton('Send line').click(); await flush(); expect(rowInput().value).toBe('');
    surface.setState(state({ tasks: [{ ...task, status: 'restarted' }] }));
    gate.reject(new Error('send failed')); await flush();
    // The rebuilt visible input carries the typed draft again after the failed round-trip.
    expect(rowInput().value).toBe('first draft');
    surface.setState(state({ tasks: [{ ...task, status: 'running' }] }));
    rowInput().value = 'newer typed draft'; gate = deferred<string>();
    rowButton('Send line').click(); await flush(); expect(rowInput().value).toBe('');
    surface.setState(state({ tasks: [{ ...task, status: 'restarted' }] })); rowInput().value = 'newer typed draft';
    gate.reject(new Error('send failed again')); await flush();
    expect(rowInput().value).toBe('newer typed draft');
  });

  it('settles a pending send across distinct identity switches without leaking into or unlocking the other session row', async () => {
    const gateA = deferred<string>(); const gateB = deferred<string>();
    runTaskAction.mockImplementation(async (task: WorkbenchTask) => task.title === 'second shell' ? gateB.promise : gateA.promise);
    const first = sendTask(); const second = sendTask({ title: 'second shell' });
    surface.setState(state({ identity: 'dsh:A', tasks: [first] }));
    rowInput().value = 'draft from A'; rowButton('Send line').click(); await flush();
    expect(runTaskAction).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'ops · zsh' }), 'sendLine', 'draft from A');
    expect(rowButton('Send line').disabled).toBe(true);
    surface.setState(state({ identity: 'dsh:B', tasks: [second] }));
    expect(rowInput().value).toBe(''); expect(rowInput().disabled).toBe(false);
    rowInput().value = 'draft from B'; rowButton('Send line').click(); await flush();
    expect(runTaskAction).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'second shell' }), 'sendLine', 'draft from B');
    expect(rowButton('Send line').disabled).toBe(true);
    gateA.reject(new Error('A failed')); await flush();
    // A's settlement runs on its own identity key: it must not unlock or restore into B's pending row.
    expect(rowButton('Send line').disabled).toBe(true);
    expect(rowInput().value).toBe('');
    surface.setState(state({ identity: 'dsh:A', tasks: [{ ...first, status: 'restarted' }] }));
    expect(rowButton('Send line').disabled).toBe(false);
    expect(rowInput().disabled).toBe(false);
    gateB.resolve('B done'); await flush();
    expect(rowButton('Send line').disabled).toBe(false);
  });
});
