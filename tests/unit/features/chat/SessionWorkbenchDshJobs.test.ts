import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { type DshJobView, dshNativeControlCapabilities, type DshNativeControlUpdate, type DshPlanState } from '../../../../src/core/agents/backend/dsh/DshNativeControls';
import type { Conversation } from '../../../../src/core/types';
import { SessionWorkbenchCoordinator, type SessionWorkbenchHost, type WorkbenchSession } from '../../../../src/features/chat/services/conversation/SessionWorkbenchCoordinator';
import type { SessionWorkbenchState, WorkbenchTask } from '../../../../src/features/chat/ui/SessionWorkbench';

type T = { stopTask(task: WorkbenchTask): Promise<void>; readTaskOutput(task: WorkbenchTask): Promise<string>;
  runTaskAction(task: WorkbenchTask, action: string, value?: string): Promise<string>; setPlanMode(active: boolean): Promise<void> };
async function settle() { for (let i = 0; i < 20; ++i) await Promise.resolve(); }
function fixture() {
  const sessions: WorkbenchSession[] = ['a', 'b'].map((id) => ({ tabId: id, backend: 'dsh', streaming: false, todos: [], backgroundTasks: [], resources: [],
    conversation: { id, title: id, backend: 'dsh', backendSessionId: `session-${id}`, createdAt: 1, updatedAt: 1, messages: [] } as Conversation }));
  let active = 0; let state!: SessionWorkbenchState;
  let listener!: (event: DshNativeControlUpdate) => void;
  const job: DshJobView = { id: 'native-job', owner: 'session-a', label: 'Real background work', kind: 'shell', status: 'running', startedAt: 1, output: { total: 0, earliest: 0 } };
  const nativeCapabilities = () => dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1', controlCapabilities: {
    permissionPresets: { get: true, set: true }, plan: { get: true, set: true },
    jobs: { list: true, get: true, read: true, readAt: true, wait: true, kill: true, updates: true },
    terminal: { availability: true, list: true, spawn: true, read: true, send: true, signal: true, kill: true },
    subagents: { list: true, get: true, cancel: true },
  } }, true);
  const service = { displayName: 'DSH', getNativeControlCapabilities: jest.fn(nativeCapabilities), refreshNativeControlCapabilities: jest.fn(async () => nativeCapabilities()),
    listSessionJobs: jest.fn(async (id: string) => id === 'session-a' ? [job] : []),
    readSessionJob: jest.fn(async () => ({ chunks: [{ at: 0, text: 'safe output' }], lossy: false, job })),
    killSessionJob: jest.fn(async () => ({ disposition: 'requested', job })),
    getSessionPlanState: jest.fn(async () => ({ active: false }) as DshPlanState),
    setSessionPlanState: jest.fn(async (_id: string, activeState: boolean) => ({ active: activeState }) as DshPlanState),
    getSessionJob: jest.fn(async () => job),
    waitForSessionJob: jest.fn(async () => job),
    getSessionTerminalAvailability: jest.fn(async () => ({ available: true, backends: ['xterm'] })),
    listSessionTerminals: jest.fn(async () => []),
    listSessionSubagents: jest.fn(async () => []),
    subscribeToNativeControlUpdates: jest.fn((handler: typeof listener) => { listener = handler; return { dispose: jest.fn() }; }) };
  let adapter = service;
  const onNativeJobs = jest.fn(async () => {});
  const host: SessionWorkbenchHost = { onNativeJobs, getActiveSession: () => sessions[active], getSessions: () => sessions,
    getRegistry: () => ({ get: (kind: string) => kind === 'dsh' ? adapter : undefined }) as unknown as AgentServiceRegistry,
    getGoalSlot: () => null, getSummaryMount: () => null, getComposerShell: () => null, attachFiles: jest.fn(), mountTools: jest.fn(),
    updateTools: (value) => { state = value; }, syncTranscript: jest.fn(async () => {}), focusComposer: jest.fn(),
    openMessage: jest.fn(), openResource: jest.fn(), notify: jest.fn() };
  const coordinator = new SessionWorkbenchCoordinator(host); coordinator.refresh();
  const root = document.body.createDiv();
  coordinator.mount(root);
  const surface = (coordinator as unknown as { surface: { actions: T } }).surface.actions as T;
  return { coordinator, coordinatorActions: surface, service, job, actions: surface, onNativeJobs, root, sessions, state: () => state, emit: (event: DshNativeControlUpdate) => listener(event),
    switchTab: (index: number) => { active = index; coordinator.refresh(); },
    replaceAdapter: () => { adapter = { ...service }; coordinator.refresh(); } };
}

describe('DSH jobs in the existing task workbench', () => {
  const active: SessionWorkbenchCoordinator[] = [];
  const create = () => { const f = fixture(); active.push(f.coordinator); return f; };
  afterEach(() => { active.splice(0).forEach((coordinator) => coordinator.destroy()); document.body.innerHTML = ''; });

  it('projects initial jobs and live completion separately from todos', async () => {
    const f = create(); await settle();
    expect(f.state().tasks).toEqual([expect.objectContaining({ id: 'job:native-job', nativeJobId: 'native-job', status: 'running', canStop: true })]);
    expect(f.state().todos).toEqual([]);
    f.job.status = 'completed';
    f.emit({ kind: 'session', sessionId: 'session-a', update: { sessionUpdate: 'jobs_update', jobs: [f.job] } }); await settle();
    expect(f.state().tasks[0]).toMatchObject({ status: 'completed', canStop: false });
    f.emit({ kind: 'invalidated' }); expect(f.state().tasks).toEqual([]);
  });

  it('rejects cancellation from a different tab and routes output and stop to the exact owner', async () => {
    const f = create(); await settle(); const task = f.state().tasks[0];
    f.switchTab(1); await settle();
    await expect(f.actions.stopTask(task)).rejects.toThrow(); expect(f.service.killSessionJob).not.toHaveBeenCalled();
    f.switchTab(0); await settle();
    expect(await f.actions.readTaskOutput(task)).toBe('safe output');
    await f.actions.stopTask(task);
    expect(f.service.killSessionJob).toHaveBeenCalledWith('session-a', 'native-job');
    expect(f.service.readSessionJob).toHaveBeenCalledWith('session-a', 'native-job');
  });

  it('keeps authoritative list polling alive for a non-active DSH session after foreground ends', async () => {
    jest.useFakeTimers();
    const f = create(); const root = document.body.createDiv();
    try {
      f.coordinator.mount(root); await settle(); f.switchTab(1); await settle();
      f.service.listSessionJobs.mockClear(); f.onNativeJobs.mockClear(); f.job.status = 'completed';
      jest.advanceTimersByTime(6000); await settle();
      expect(f.service.listSessionJobs).toHaveBeenCalledWith('session-a');
      expect(f.onNativeJobs).toHaveBeenCalledWith(f.sessions[0], expect.objectContaining({ jobs: [expect.objectContaining({ status: 'completed' })], isCurrent: expect.any(Function) }));
    } finally { f.coordinator.destroy(); root.remove(); jest.useRealTimers(); }
  });

  it('discards late output after changing the active tab or replacing the adapter', async () => {
    const f = create(); await settle(); const task = f.state().tasks[0];
    let release!: (value: { chunks: { at: number; text: string }[]; lossy: boolean; job: DshJobView }) => void;
    f.service.readSessionJob.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const reading = f.actions.readTaskOutput(task); f.switchTab(1);
    release({ chunks: [{ at: 0, text: 'late' }], lossy: false, job: f.job });
    expect(await reading).toBe(''); f.replaceAdapter();
  });

  it('projects the native Plan row and keeps a queued change pending through set→read', async () => {
    const f = create(); await settle();
    expect(f.state().nativePlan).toMatchObject({ active: false, settable: true });
    f.service.getSessionPlanState.mockImplementationOnce(async () => ({ active: false, pending: true }));
    let release!: (value: DshPlanState) => void;
    f.service.setSessionPlanState.mockImplementationOnce((_id: string, _activeState: boolean) => new Promise<DshPlanState>((done) => { release = done; }));
    const setting = f.coordinatorActions.setPlanMode(true);
    expect(f.state().nativePlan).toMatchObject({ active: false, busy: true });
    // While the write is unresolved the plan row stays busy; a queued state is never faked as active.
    release({ active: true, pending: true });
    // The independent confirmation read still reports the queued pending state.
    await setting; await settle();
    expect(f.state().nativePlan).toMatchObject({ active: false, pending: true, busy: false });
    expect(f.service.setSessionPlanState).toHaveBeenCalledWith('session-a', true);
    expect(f.service.getSessionPlanState).toHaveBeenCalledWith('session-a');
  });

  it('refuses a task action whose row was captured by another tab, and routes valid ones to the owner', async () => {
    const f = create(); await settle(); const task = f.state().tasks[0];
    f.switchTab(1); await settle();
    await expect(f.coordinatorActions.runTaskAction(task, 'wait')).rejects.toThrow();
    expect(f.service.killSessionJob).not.toHaveBeenCalled();
    f.switchTab(0); await settle();
    await expect(f.coordinatorActions.runTaskAction(task, 'details')).resolves.not.toThrow();
  });

  it('projects terminal and child rows through the coordinator with owner-fenced stop routing', async () => {
    const f = create();
    f.service.listSessionTerminals.mockResolvedValue([{ sessionId: 'pty-1', type: 'xterm', status: { kind: 'running' } }]);
    f.service.listSessionSubagents.mockResolvedValue([{ id: 'child-1', createdAt: 1, mode: 'one-shot', status: 'running' }]);
    (f.service as Record<string, unknown>).killSessionTerminal = jest.fn(async () => ({ closed: true }));
    (f.service as Record<string, unknown>).cancelSessionSubagent = jest.fn(async () => ({ accepted: true, child: { id: 'child-1' } }));
    f.emit({ kind: 'session', sessionId: 'session-a', update: { sessionUpdate: 'jobs_update', jobs: [] } }); await settle();
    const terminalRow = f.state().tasks.find((task) => task.nativeTerminalId);
    const childRow = f.state().tasks.find((task) => task.nativeChildId);
    expect(terminalRow).toMatchObject({ id: 'terminal:pty-1', canStop: true });
    expect(terminalRow?.actions?.map((action) => action.id)).toEqual(['earlier', 'sendLine', 'send', 'signal']);
    expect(childRow).toMatchObject({ id: 'child:child-1', canStop: true });
    f.switchTab(1); await settle();
    await expect(f.coordinatorActions.stopTask(terminalRow!)).rejects.toThrow();
    expect(f.service.killSessionTerminal).not.toHaveBeenCalled();
    f.switchTab(0); await settle();
    await f.coordinatorActions.stopTask(terminalRow!);
    expect(f.service.killSessionTerminal).toHaveBeenCalledWith('session-a', 'pty-1');
    await f.coordinatorActions.stopTask(childRow!);
    expect(f.service.cancelSessionSubagent).toHaveBeenCalledWith('session-a', 'child-1');
  });
});
