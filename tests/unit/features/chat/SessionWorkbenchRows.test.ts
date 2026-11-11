import { SessionWorkbench, type SessionWorkbenchState, type WorkbenchTask } from '../../../../src/features/chat/ui/SessionWorkbench';
import { t } from '../../../../src/i18n';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function state(overrides: Partial<SessionWorkbenchState> = {}): SessionWorkbenchState {
  return { identity: 'codex:c1', title: 'Current session', backend: 'Codex', sessionId: 'thread1',
    goal: { status: 'ready', goal: null, observedAt: 1 },
    capabilities: { source: 'native', driver: 'codex', actions: ['set', 'edit', 'pause', 'resume', 'clear'], pauseMode: 'goal', editMode: 'replace', budgets: ['tokens'] },
    armed: false, busy: false, todos: [], tasks: [], resources: [], ...overrides };
}
const other = (overrides: Partial<SessionWorkbenchState> = {}) => state({ identity: 'codex:c2', sessionId: 'thread2', ...overrides });
const child = { agent: { id: 'native-child', title: 'Inspect files', status: 'running' as const, readable: true }, loading: false, messages: [] };
const terminals = { backends: ['xterm', 'screen'], spawn: true };
const statistics = (rounds: number) => ({ rounds, messages: rounds * 2, tools: 0 });

let boundary: HTMLElement; let surface: SessionWorkbench;
const runTaskAction = jest.fn<(task: WorkbenchTask, id: string, value?: string) => Promise<string>>(async () => 'action done');
const spawnTerminal = jest.fn<(options: { type: string; name?: string; cwd?: string }) => Promise<string>>(async () => 'Terminal opened');
const openBackendSettings = jest.fn();
const flush = async () => { for (let i = 0; i < 8; ++i) await Promise.resolve(); };
const sendTask = (overrides: Partial<WorkbenchTask> = {}): WorkbenchTask => ({ id: 'terminal:t1', title: 'ops · zsh', status: 'running',
  canStop: true, input: { label: 'Terminal input', secret: true }, actions: [
    { id: 'sendLine', label: 'Send line', icon: 'corner-down-left', usesInput: true },
    { id: 'send', label: 'Send text', icon: 'send', usesInput: true },
  ], ...overrides });
const row = (id = 'terminal:t1') => boundary.querySelector<HTMLDetailsElement>(`details[data-draft="row:${id}"]`);
const rowInput = () => row()!.querySelector<HTMLInputElement>('input[data-draft="input:terminal:t1"]')!;
const rowButton = (label: string, id = 'terminal:t1') => row(id)!.querySelector<HTMLButtonElement>(`.opencodian-workbench-actions button[aria-label="${label}"]`)!;
const rowOutput = (id = 'terminal:t1') => row(id)!.querySelector<HTMLElement>('pre')?.textContent;
const form = () => boundary.querySelector<HTMLDetailsElement>('.opencodian-workbench-overview [data-section="terminals"] details[data-draft="spawn"]')!;
const advanced = () => form().querySelector<HTMLDetailsElement>('details[data-draft="spawn:advanced"]')!;
const start = () => form().querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.nativeTerminal.open')}"]`)!;
const receipt = () => form().querySelector('[role="status"]')?.textContent;
const field = (key: string) => form().querySelector<HTMLInputElement>(`input[data-draft="spawn:${key}"]`)!;

beforeEach(() => {
  boundary = document.createElement('div'); document.body.appendChild(boundary);
  boundary.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect;
  surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(), openMessage: jest.fn(),
    openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn(), runTaskAction, spawnTerminal, openBackendSettings });
});
afterEach(() => { surface.destroy(); boundary.remove(); jest.clearAllMocks(); });

describe('session workbench inline rows across hidden views', () => {
  it('keeps row drafts while the goal detail or a child transcript temporarily replaces the rows', () => {
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    row()!.open = true; rowInput().value = 'keep me'; rowInput().focus();
    // The goal detail view renders no rows at all; their drafts must outlive it.
    surface.openGoal();
    expect(row()).toBeNull();
    surface.setPage('overview');
    expect(rowInput().value).toBe('keep me'); expect(row()!.open).toBe(true);
    // Rows that were hidden do not pull focus back when they return.
    expect(document.activeElement).not.toBe(rowInput());
    surface.setState(state({ tasks: [task], child }));
    expect(row()).toBeNull();
    surface.setState(state({ tasks: [{ ...task, status: 'exited 0' }] }));
    expect(rowInput().value).toBe('keep me'); expect(row()!.open).toBe(true);
    // A different conversation never inherits them.
    surface.setState(other({ tasks: [task] }));
    expect(rowInput().value).toBe(''); expect(row()!.open).toBe(false);
  });

  it('keeps a settlement that lands while its row is hidden and shows it when the row returns', async () => {
    const failing = deferred<string>();
    runTaskAction.mockImplementationOnce(() => failing.promise);
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    rowInput().value = 'draft while hidden'; rowButton('Send line').click(); await flush();
    expect(rowInput().value).toBe('');
    // The goal detail removes the rows while the send is still unresolved.
    surface.openGoal();
    expect(row()).toBeNull();
    failing.reject(new Error('hidden send failed')); await flush();
    surface.setPage('overview');
    expect(rowOutput()).toBe('hidden send failed');
    expect(rowInput().value).toBe('draft while hidden');
    expect(rowButton('Send line').disabled).toBe(false); expect(rowInput().disabled).toBe(false);
    // It is projected once: a later rebuild keeps the output but never re-injects the consumed draft.
    rowInput().value = '';
    surface.setState(state({ tasks: [{ ...task, status: 'restarted' }] }));
    expect(rowInput().value).toBe('');
    expect(rowOutput()).toBe('hidden send failed');
    // A success that lands under a child transcript is shown the same way.
    const passing = deferred<string>();
    runTaskAction.mockImplementationOnce(() => passing.promise);
    rowInput().value = 'second send'; rowButton('Send line').click(); await flush();
    surface.setState(state({ tasks: [task], child }));
    expect(row()).toBeNull();
    passing.resolve('hidden send done'); await flush();
    surface.setState(state({ tasks: [{ ...task, status: 'exited 0' }] }));
    expect(rowOutput()).toBe('hidden send done');
    expect(rowInput().value).toBe('');
    expect(rowButton('Send line').disabled).toBe(false);
  });

  it('keeps another session out of the journal and lets newer typing win over a failed draft', async () => {
    const failing = deferred<string>();
    runTaskAction.mockImplementationOnce(() => failing.promise);
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    rowInput().value = 'old draft'; rowButton('Send line').click(); await flush();
    // The other conversation shows the same task id but must never receive this settlement.
    surface.setState(other({ tasks: [task] }));
    failing.reject(new Error('send failed')); await flush();
    expect(rowOutput()).toBeUndefined();
    expect(rowInput().value).toBe('');
    // Back in the owning session the result and its failed draft are waiting on the row.
    surface.setState(state({ tasks: [task] }));
    expect(rowOutput()).toBe('send failed');
    expect(rowInput().value).toBe('old draft');
    // Typing done while a send was pending is newer than the failed draft and is kept.
    const again = deferred<string>();
    runTaskAction.mockImplementationOnce(() => again.promise);
    rowButton('Send line').click(); await flush();
    rowInput().value = 'newer typing';
    surface.openGoal();
    again.reject(new Error('send failed again')); await flush();
    surface.setPage('overview');
    expect(rowOutput()).toBe('send failed again');
    expect(rowInput().value).toBe('newer typing');
  });

  it('unlocks a rebuilt row that has no input and never enables an action that cannot run', async () => {
    const gate = deferred<string>();
    runTaskAction.mockImplementationOnce(() => gate.promise);
    const id = 'terminal:t9';
    const task = sendTask({ id, title: 'no input ops', input: undefined, actions: [
      { id: 'restart', label: 'Restart', icon: 'rotate-cw' }, { id: 'sendLine', label: 'Send line', icon: 'corner-down-left', usesInput: true }] });
    surface.setState(state({ tasks: [task] }));
    expect(rowButton('Send line', id).disabled).toBe(true);
    rowButton('Restart', id).click(); await flush();
    expect(rowButton('Restart', id).disabled).toBe(true);
    // Rebuilt while pending: the new row is locked and has no input that a lookup could find.
    const before = row(id);
    surface.setState(state({ tasks: [{ ...task, status: 'restarting' }] }));
    expect(row(id)).not.toBe(before);
    expect(rowButton('Restart', id).disabled).toBe(true);
    gate.resolve('restarted'); await flush();
    expect(rowButton('Restart', id).disabled).toBe(false);
    expect(rowOutput(id)).toBe('restarted');
    // The input-driven action without an input stays disabled through settlements on either row.
    expect(rowButton('Send line', id).disabled).toBe(true);
    rowButton('Restart', id).click(); await flush();
    expect(rowOutput(id)).toBe('action done');
    expect(rowButton('Restart', id).disabled).toBe(false);
    expect(rowButton('Send line', id).disabled).toBe(true);
  });
});

describe('session workbench row state retention', () => {
  const remount = (readTaskOutput: (task: WorkbenchTask) => Promise<string>) => {
    surface.destroy();
    surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(), openMessage: jest.fn(),
      openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn(), runTaskAction, spawnTerminal, readTaskOutput });
  };

  it('restores ordinary row drafts, presented output and the spawn form when returning to a session', async () => {
    const task = sendTask();
    surface.setState(state({ tasks: [task], nativeTerminals: terminals }));
    row()!.open = true;
    rowInput().value = 'first'; rowButton('Send line').click(); await flush();
    rowInput().value = 'typed in A';
    form().open = true; advanced().open = true; field('name').value = 'A terminal';
    // The other session starts clean and keeps its own drafts.
    surface.setState(other({ tasks: [task], nativeTerminals: terminals }));
    expect(rowInput().value).toBe(''); expect(row()!.open).toBe(false); expect(rowOutput()).toBeUndefined();
    expect(form().open).toBe(false); expect(field('name').value).toBe('');
    rowInput().value = 'typed in B';
    surface.setState(state({ tasks: [task], nativeTerminals: terminals }));
    expect(rowInput().value).toBe('typed in A'); expect(row()!.open).toBe(true); expect(rowOutput()).toBe('action done');
    expect(form().open).toBe(true); expect(advanced().open).toBe(true); expect(field('name').value).toBe('A terminal');
    // Rows that return with their session do not pull focus back.
    expect(document.activeElement).not.toBe(rowInput());
    surface.setState(other({ tasks: [task], nativeTerminals: terminals }));
    expect(rowInput().value).toBe('typed in B'); expect(rowOutput()).toBeUndefined();
  });

  it('keeps an opened plain row and the output the user read across a statistics rebuild', async () => {
    const readTaskOutput = jest.fn<(task: WorkbenchTask) => Promise<string>>(async () => 'job history');
    remount(readTaskOutput);
    const plain = { id: 'job:1', title: 'Index notes', status: 'running' };
    const live = () => boundary.querySelector<HTMLDetailsElement>('details[data-task="job:1"]')!;
    const output = () => live().querySelector('pre')?.textContent;
    surface.setState(state({ tasks: [plain], statistics: statistics(1) }));
    live().open = true; live().dispatchEvent(new Event('toggle')); await flush();
    expect(output()).toBe('job history');
    // A tick that only changes statistics rebuilds the overview: the row stays open with what the user read.
    const before = live();
    surface.setState(state({ tasks: [plain], statistics: statistics(2) }));
    expect(live()).not.toBe(before);
    expect(live().open).toBe(true); expect(output()).toBe('job history');
    expect(readTaskOutput).toHaveBeenCalledTimes(1);
    // The snapshot stays with its own session.
    surface.setState(other({ tasks: [plain] }));
    expect(live().open).toBe(false); expect(output()).toBeUndefined();
    surface.setState(state({ tasks: [plain], statistics: statistics(2) }));
    expect(live().open).toBe(true); expect(output()).toBe('job history');
    // An authoritative output the backend now provides replaces the older snapshot.
    surface.setState(state({ tasks: [{ ...plain, output: 'authoritative v1' }], statistics: statistics(2) }));
    expect(output()).toBe('authoritative v1');
  });

  it('keeps an action result shown over the same authoritative output until that output really changes', async () => {
    const task = sendTask({ output: 'authoritative v1' });
    surface.setState(state({ tasks: [task], statistics: statistics(1) }));
    expect(rowOutput()).toBe('authoritative v1');
    // The untouched authoritative text is simply re-rendered by a tick.
    surface.setState(state({ tasks: [task], statistics: statistics(2) }));
    expect(rowOutput()).toBe('authoritative v1');
    rowInput().value = 'echo hi'; rowButton('Send line').click(); await flush();
    expect(rowOutput()).toBe('action done');
    // Only statistics changed: the same old authoritative text must not overwrite the result on every tick.
    surface.setState(state({ tasks: [task], statistics: statistics(3) }));
    expect(rowOutput()).toBe('action done');
    surface.setState(state({ tasks: [task], statistics: statistics(4) }));
    expect(rowOutput()).toBe('action done');
    // The authoritative output really changed: it wins over the older result.
    surface.setState(state({ tasks: [{ ...task, output: 'authoritative v2' }], statistics: statistics(4) }));
    expect(rowOutput()).toBe('authoritative v2');
    // A settlement that landed while the row was hidden is newer than the stashed result and is shown instead of it.
    rowButton('Send line').click(); await flush();
    expect(rowOutput()).toBe('action done');
    const hidden = deferred<string>();
    runTaskAction.mockImplementationOnce(() => hidden.promise);
    rowButton('Send text').click(); await flush();
    surface.openGoal();
    hidden.resolve('hidden result'); await flush();
    surface.setPage('overview');
    expect(rowOutput()).toBe('hidden result');
  });

  it('drops a deferred read once an authoritative output replaced what it was reading', async () => {
    const reading = deferred<string>();
    const readTaskOutput = jest.fn<(task: WorkbenchTask) => Promise<string>>(() => reading.promise);
    remount(readTaskOutput);
    const task = sendTask();
    const current = { ...task, output: 'authoritative v2' };
    surface.setState(state({ tasks: [task], statistics: statistics(1) }));
    row()!.open = true; row()!.dispatchEvent(new Event('toggle'));
    expect(rowOutput()).toBe(t('workbench.tasks.loading'));
    // The backend provides an authoritative output while the older read is still pending.
    surface.setState(state({ tasks: [current], statistics: statistics(1) }));
    expect(rowOutput()).toBe('authoritative v2');
    reading.resolve('stale v1'); await flush();
    expect(rowOutput()).toBe('authoritative v2');
    // A later tick with the same authoritative output must not resurrect the stale read either.
    surface.setState(state({ tasks: [current], statistics: statistics(2) }));
    expect(rowOutput()).toBe('authoritative v2');
    // Hidden path: the read lands in the journal first, and the authority appears before the row returns.
    const hidden = deferred<string>();
    readTaskOutput.mockImplementation(() => hidden.promise);
    const second = sendTask({ id: 'terminal:t2', title: 'second shell' });
    surface.setState(state({ tasks: [second], statistics: statistics(2) }));
    row('terminal:t2')!.open = true; row('terminal:t2')!.dispatchEvent(new Event('toggle'));
    surface.openGoal();
    hidden.resolve('stale hidden v1'); await flush();
    surface.setState(state({ tasks: [{ ...second, output: 'authoritative v2' }], statistics: statistics(2) }));
    surface.setPage('overview');
    expect(rowOutput('terminal:t2')).toBe('authoritative v2');
    surface.setState(state({ tasks: [{ ...second, output: 'authoritative v2' }], statistics: statistics(3) }));
    expect(rowOutput('terminal:t2')).toBe('authoritative v2');
    expect(readTaskOutput).toHaveBeenCalledTimes(2);
  });

  it('never shows a journaled action result over an authoritative output that moved on while the row was hidden', async () => {
    const old = deferred<string>();
    runTaskAction.mockImplementationOnce(() => old.promise);
    const task = sendTask({ output: 'authoritative v1' });
    const next = { ...task, output: 'authoritative v2' };
    surface.setState(state({ tasks: [task] }));
    rowInput().value = 'old command'; rowButton('Send line').click(); await flush();
    // The action settles under v1 while the goal detail hides the row; only then does the authority advance.
    surface.openGoal();
    old.reject(new Error('old failure')); await flush();
    surface.setState(state({ tasks: [next] }));
    surface.setPage('overview');
    expect(rowOutput()).toBe('authoritative v2');
    // The failed text is the user's own draft and still returns; only the outdated result is dropped.
    expect(rowInput().value).toBe('old command');
    surface.setState(state({ tasks: [next], statistics: statistics(1) }));
    expect(rowOutput()).toBe('authoritative v2');
    // A result that settles AFTER the authority advanced is not behind it: it is shown when the row returns and kept.
    const latest = { ...task, output: 'authoritative v3' };
    const late = deferred<string>();
    runTaskAction.mockImplementationOnce(() => late.promise);
    rowInput().value = 'new command'; rowButton('Send line').click(); await flush();
    surface.openGoal();
    surface.setState(state({ tasks: [latest], statistics: statistics(1) }));
    late.resolve('late receipt'); await flush();
    surface.setPage('overview');
    expect(rowOutput()).toBe('late receipt');
    surface.setState(state({ tasks: [latest], statistics: statistics(2) }));
    expect(rowOutput()).toBe('late receipt');
  });

  it('still shows a journaled result when no authoritative output contradicts it anymore', async () => {
    const pending = deferred<string>();
    runTaskAction.mockImplementationOnce(() => pending.promise);
    surface.setState(state({ tasks: [sendTask({ output: 'authoritative v1' })] }));
    rowButton('Send text').click(); await flush();
    surface.openGoal();
    pending.resolve('receipt under v1'); await flush();
    // The backend stops reporting an output: nothing newer contradicts the receipt the user has not seen yet.
    surface.setState(state({ tasks: [sendTask()] }));
    surface.setPage('overview');
    expect(rowOutput()).toBe('receipt under v1');
    // The authoritative text itself is not a user snapshot: once the backend stops reporting it, it is not carried over.
    const reported = sendTask({ id: 'terminal:t2', title: 'second shell', output: 'authoritative only' });
    surface.setState(state({ tasks: [reported] }));
    expect(rowOutput('terminal:t2')).toBe('authoritative only');
    surface.setState(state({ tasks: [sendTask({ id: 'terminal:t2', title: 'second shell' })] }));
    expect(rowOutput('terminal:t2')).toBeUndefined();
  });
});

describe('session workbench native terminal start', () => {
  it('renders the collapsed spawn form inside the session terminals group with a real advanced group', async () => {
    surface.setState(state({ nativeTerminals: terminals }));
    expect(boundary.querySelector('[data-section="terminals"] summary')?.textContent).toContain(t('workbench.sessionTerminals'));
    expect(form().open).toBe(false);
    expect(form().querySelector('summary')?.textContent).toBe(t('workbench.nativeTerminal.open'));
    expect([...form().querySelector<HTMLSelectElement>('select[data-draft="spawn:type"]')!.options].map((option) => option.value)).toEqual(['xterm', 'screen']);
    // Optional fields live in a real collapsed group; the required backend choice does not.
    expect(advanced().tagName).toBe('DETAILS');
    expect(advanced().open).toBe(false);
    expect(advanced().classList.contains('opencodian-workbench-field-advanced')).toBe(true);
    expect(advanced().querySelector('summary')?.textContent).toBe(t('workbench.nativeTerminal.advanced'));
    expect([...advanced().querySelectorAll<HTMLInputElement>('input')].map((input) => input.dataset.draft)).toEqual(['spawn:name', 'spawn:cwd']);
    expect(advanced().querySelector('select')).toBeNull();
    start().click(); await flush();
    expect(spawnTerminal).toHaveBeenLastCalledWith({ type: 'xterm' });
    expect(receipt()).toBe('Terminal opened');
    form().querySelector<HTMLSelectElement>('select')!.value = 'screen';
    field('name').value = '  monitor  '; field('cwd').value = ' /tmp/work ';
    start().click(); await flush();
    expect(spawnTerminal).toHaveBeenLastCalledWith({ type: 'screen', name: 'monitor', cwd: '/tmp/work' });
    field('name').value = '   '; start().click(); await flush();
    expect(spawnTerminal).toHaveBeenLastCalledWith({ type: 'screen', cwd: '/tmp/work' });
    spawnTerminal.mockRejectedValueOnce(new Error('no terminal backend')); start().click(); await flush();
    expect(receipt()).toBe('no terminal backend');
    // Both open states and the typed fields survive an overview rebuild of the same session.
    form().open = true; advanced().open = true; field('name').value = 'kept name';
    const before = form();
    surface.setState(state({ nativeTerminals: terminals, statistics: statistics(1) }));
    expect(form()).not.toBe(before);
    expect(form().open).toBe(true); expect(advanced().open).toBe(true);
    expect(field('name').value).toBe('kept name'); expect(field('cwd').value).toBe(' /tmp/work ');
    expect(form().querySelector<HTMLSelectElement>('select')!.value).toBe('screen');
    expect(receipt()).toBe('no terminal backend');
  });

  it('explains an unavailable terminal spawn and forwards the settings entry', async () => {
    surface.setState(state());
    expect(boundary.querySelector('details[data-draft="spawn"]')).toBeNull();
    expect(boundary.querySelector('[data-section="terminals"]')).toBeNull();
    surface.setState(state({ nativeTerminals: { backends: [], spawn: false, reason: 'No terminal backend is available' } }));
    expect(form().querySelector('select')).toBeNull(); expect(form().querySelector('input')).toBeNull();
    expect(form().textContent).toContain('No terminal backend is available');
    form().querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.nativeTerminal.settings')}"]`)!.click(); await flush();
    expect(openBackendSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps a terminal start single-flight and reports its receipt on the live form of its own session', async () => {
    const gate = deferred<string>();
    spawnTerminal.mockImplementationOnce(() => gate.promise);
    surface.setState(state({ nativeTerminals: terminals }));
    start().click(); await flush();
    expect(spawnTerminal).toHaveBeenCalledTimes(1);
    expect(start().disabled).toBe(true); expect(form().getAttribute('aria-busy')).toBe('true');
    // A rebuild during the start keeps the new form locked, so no second start can be dispatched.
    const before = form();
    surface.setState(state({ nativeTerminals: terminals, statistics: statistics(1) }));
    expect(form()).not.toBe(before);
    expect(start().disabled).toBe(true);
    start().click(); start().dispatchEvent(new MouseEvent('click')); await flush();
    expect(spawnTerminal).toHaveBeenCalledTimes(1);
    // Another session is never locked by it and never shows its receipt.
    surface.setState(other({ nativeTerminals: terminals }));
    expect(start().disabled).toBe(false); expect(receipt()).toBe('');
    gate.resolve('Terminal opened'); await flush();
    expect(receipt()).toBe(''); expect(start().disabled).toBe(false);
    // The receipt belongs to the session that started the terminal and is visible on its live form.
    surface.setState(state({ nativeTerminals: terminals }));
    expect(receipt()).toBe('Terminal opened');
    expect(start().disabled).toBe(false); expect(form().hasAttribute('aria-busy')).toBe(false);
    // A settlement after a same-session rebuild lands on the rebuilt form, not on the detached one.
    const failing = deferred<string>();
    spawnTerminal.mockImplementationOnce(() => failing.promise);
    start().click(); await flush();
    expect(receipt()).toBe('');
    const detached = form();
    surface.setState(state({ nativeTerminals: terminals, statistics: statistics(2) }));
    failing.reject(new Error('no terminal backend')); await flush();
    expect(form()).not.toBe(detached);
    expect(receipt()).toBe('no terminal backend');
    expect(start().disabled).toBe(false);
  });

  it('lands a deferred output read on the live row after the goal detail hid the rows', async () => {
    const reading = deferred<string>();
    const readTaskOutput = jest.fn<(task: WorkbenchTask) => Promise<string>>(() => reading.promise);
    surface.destroy();
    surface = new SessionWorkbench(boundary, { armGoal: jest.fn(), controlGoal: jest.fn(), refresh: jest.fn(), openMessage: jest.fn(),
      openResource: jest.fn(), stopTask: jest.fn(), mountTools: jest.fn(), runTaskAction, readTaskOutput });
    const task = sendTask();
    surface.setState(state({ tasks: [task] }));
    row()!.open = true; row()!.dispatchEvent(new Event('toggle'));
    expect(rowOutput()).toBe(t('workbench.tasks.loading'));
    expect(readTaskOutput).toHaveBeenCalledTimes(1);
    // The goal detail hides the rows while the read is pending; the stash only knows the loading text.
    surface.openGoal();
    expect(row()).toBeNull();
    reading.resolve('full terminal history'); await flush();
    surface.setPage('overview');
    expect(row()!.open).toBe(true);
    expect(rowOutput()).toBe('full terminal history');
    expect(readTaskOutput).toHaveBeenCalledTimes(1);
    // A same-session rebuild while another read is pending keeps the restored loading row and still receives the result.
    const later = deferred<string>();
    readTaskOutput.mockImplementation(() => later.promise);
    const second = sendTask({ id: 'terminal:t2', title: 'second shell' });
    surface.setState(state({ tasks: [second] }));
    row('terminal:t2')!.open = true; row('terminal:t2')!.dispatchEvent(new Event('toggle'));
    surface.setState(state({ tasks: [{ ...second, status: 'restarted' }] }));
    expect(rowOutput('terminal:t2')).toBe(t('workbench.tasks.loading'));
    later.resolve('second history'); await flush();
    expect(rowOutput('terminal:t2')).toBe('second history');
    expect(readTaskOutput).toHaveBeenCalledTimes(2);
  });
});
