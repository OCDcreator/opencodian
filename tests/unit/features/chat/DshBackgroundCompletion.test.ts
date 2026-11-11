import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import type { DshJobView, DshNativeControlUpdate } from '../../../../src/core/agents/backend/dsh/DshNativeControls';
import type { ChatMessage, Conversation } from '../../../../src/core/types';
import { BackgroundTaskIndicatorCoordinator } from '../../../../src/features/chat/runtime/background/BackgroundTaskIndicatorCoordinator';
import { BackgroundTaskInlinePanelRenderer } from '../../../../src/features/chat/runtime/background/BackgroundTaskInlinePanelRenderer';
import { BackgroundTaskCompletionNoticeService } from '../../../../src/features/chat/services/background/BackgroundTaskCompletionNoticeService';
import { type BackgroundTaskTimelineRuntime,BackgroundTaskTimelineService } from '../../../../src/features/chat/services/background/BackgroundTaskTimelineService';
import { SessionInformationCoordinator, type WorkbenchSession } from '../../../../src/features/chat/services/conversation/SessionInformationCoordinator';
import { PersistentAssistantNoticeService } from '../../../../src/features/chat/services/send/PersistentAssistantNoticeService';
import { t } from '../../../../src/i18n';

async function settle() { for (let index = 0; index < 35; ++index) await Promise.resolve(); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function job(owner: string, id = 'shared-job', status: DshJobView['status'] = 'running', startedAt = 110): DshJobView {
  return { id, owner, kind: 'shell', label: `Work ${id}`, status, startedAt, ...(status === 'completed' ? { finishedAt: 150 } : {}), output: { earliest: 0, total: 0 } };
}
function fixture(saved?: Conversation[]) {
  const conversations = saved ?? ['one', 'two'].map(id => ({ id, backend: 'dsh', backendSessionId: `session-${id}`, title: id,
    createdAt: 100, updatedAt: 100, messages: [{ id: `user-${id}`, role: 'user', content: 'Run a bounded job', timestamp: 100 }] } as Conversation));
  const roots = conversations.map(() => document.body.createDiv());
  const runtimes = conversations.map((conversation, index) => {
    const body = roots[index].createDiv();
    return { isStreaming: false, isHydratingConversation: false, backgroundTaskStartedAt: null, backgroundTaskActiveAnchorKey: null,
      backgroundTaskModeTag: null, backgroundTaskLaunches: new Map(), backgroundTaskCompletedTasks: new Map(), backgroundTaskWaitingForFollowUp: false,
      backgroundTaskStaleNoticeFingerprint: null, backgroundTaskSuppressedFingerprint: null, backgroundTaskIndicatorEl: null,
      backgroundTaskInlineEls: new Map<string, HTMLElement>(), turnBodyByAnchorKey: new Map([[`user-${conversation.id}`, body]]) } satisfies BackgroundTaskTimelineRuntime & object;
  });
  let active = 0;
  const sessions: WorkbenchSession[] = conversations.map((conversation, index) => ({ tabId: `tab-${index}`, backend: 'dsh', conversation,
    streaming: false, todos: [], backgroundTasks: [], resources: [] }));
  const runtime = (tabId: string | null) => runtimes[Number(tabId?.split('-')[1])] ?? null;
  const timeline = new BackgroundTaskTimelineService({ getActiveTabId: () => `tab-${active}`, getTabRuntimeState: runtime,
    getMessageAnchorKey: message => message.id, clearInlinePanel: jest.fn(), armAuthoritativeSyncGate: jest.fn(),
    clearAuthoritativeSyncGate: jest.fn(), syncTabStreamLikeState: jest.fn(), isSuppressedBackgroundTaskSegment: () => false });
  const legacyRead = jest.fn(async () => []);
  const renderer = new BackgroundTaskInlinePanelRenderer(timeline, { getActiveTabId: () => `tab-${active}`,
    getConversationForTab: id => sessions[Number(id.split('-')[1])]?.conversation ?? null, getTabRuntimeState: runtime,
    renderMarkdownInto: async (element, text) => { element.textContent = text; }, getMessagesContainer: id => roots[Number(id?.split('-')[1])] ?? null,
    readZCodeTasks: legacyRead, cancelZCodeTask: jest.fn(async () => false) });
  const persisted = new Map<string, Conversation>();
  const save = jest.fn(async (conversation: Conversation) => { persisted.set(conversation.id, JSON.parse(JSON.stringify(conversation))); });
  const notice = new PersistentAssistantNoticeService({ getCurrentConversation: () => sessions[active].conversation,
    getActiveTabId: () => `tab-${active}`, getConversationSyncRuntime: () => ({ getConversationSyncFingerprint: () => 'fingerprint', setTabConversationSyncFingerprint: jest.fn() }),
    renderAssistantMessage: jest.fn(async () => {}), saveConversation: save, handleVisibleNoticeMessageAppended: jest.fn(), setTabNeedsAttention: jest.fn() });
  const completion = new BackgroundTaskCompletionNoticeService({ getTabRuntimeState: runtime, appendPersistentAssistantNoticeMessage: options => notice.appendMessage(options) });
  const reconcile = jest.fn(); const streamLike = jest.fn();
  const indicator = new BackgroundTaskIndicatorCoordinator({ timelineService: timeline, inlinePanelRenderer: renderer,
    completionNoticeService: completion, liveSignalCoordinator: { reconcileStateFromLiveSignals: reconcile }, tabRuntimeStateBridge: { syncStreamLikeState: streamLike },
    host: { getActiveTabId: () => `tab-${active}`, getCurrentConversation: () => sessions[active].conversation, hasTabRuntime: id => Boolean(runtime(id)) } });
  const listeners = new Set<(event: DshNativeControlUpdate) => void>();
  const lists = new Map<string, DshJobView[]>();
  const adapter = { listSessionJobs: jest.fn(async (id: string) => lists.get(id) ?? []),
    subscribeToNativeControlUpdates: (listener: (event: DshNativeControlUpdate) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; } };
  let service = adapter;
  const information = new SessionInformationCoordinator({ getActiveSession: () => sessions[active], getSessions: () => sessions,
    getRegistry: () => ({ get: (backend: string) => backend === 'dsh' ? service : undefined }) as unknown as AgentServiceRegistry,
    onChange: jest.fn(), openChildView: jest.fn(), onNativeJobs: (session, snapshot) => indicator.acceptNativeJobs(session.conversation!, session.tabId, snapshot) });
  information.syncNativeJobSubscriptions();
  const accept = async (index: number, jobs: DshJobView[]) => { lists.set(`session-${conversations[index].id}`, jobs); await information.refreshTasks(sessions[index], true); };
  const notices = (index: number) => conversations[index].messages.filter(message => message.noticeMeta?.kind === 'background-task-completion');
  return { conversations, sessions, runtimes, roots, timeline, renderer, indicator, information, adapter, lists, save, persisted, notices, accept,
    legacyRead, reconcile, streamLike, emit: (event: DshNativeControlUpdate) => { for (const listener of listeners) listener(event); },
    switchTab: (index: number) => { active = index; }, replaceAdapter: () => { service = { ...adapter }; information.syncNativeJobSubscriptions(); },
    close: () => { information.destroy(); renderer.disposeNativeTaskWatch(); roots.forEach(root => root.remove()); } };
}

describe('DSH native jobs through the existing inline and persisted completion owners', () => {
  const fixtures: ReturnType<typeof fixture>[] = [];
  const create = (saved?: Conversation[]) => { const value = fixture(saved); fixtures.push(value); return value; };
  afterEach(() => fixtures.splice(0).forEach(value => value.close()));

  it('renders under the real originating turn and persists completion after foreground ends without a status event', async () => {
    const f = create(); f.runtimes[0].isStreaming = true;
    await f.accept(0, [job('session-one')]);
    expect(f.roots[0].querySelector('.opencodian-background-task-inline')?.textContent).toContain('Work shared-job');
    expect(f.timeline.collectInlineSegments(f.conversations[0], 'tab-0')[0].anchorKey).toBe('user-one');
    expect(f.notices(0)).toHaveLength(0);
    await f.accept(0, [job('session-one', 'shared-job', 'completed')]);
    expect(f.notices(0)).toHaveLength(0); expect(f.roots[0].querySelector('.opencodian-background-task-inline')).toBeNull();
    f.runtimes[0].isStreaming = false;
    await f.indicator.queueAndFlushCompletionNotices('tab-0', f.conversations[0]);
    expect(f.notices(0)).toHaveLength(1);
    expect(f.notices(0)[0].noticeMeta).toMatchObject({ sourceReminderIds: ['dsh-job:session-one:shared-job'], anchorKey: 'user-one' });
    expect(f.persisted.get('one')!.messages.at(-1)!.noticeTitle).toBe(t('chat.dsh.jobs.finishedTitle'));
    expect(f.legacyRead).not.toHaveBeenCalled(); expect(f.reconcile).not.toHaveBeenCalled(); expect(f.streamLike).not.toHaveBeenCalled();
    expect(f.runtimes[0].backgroundTaskStartedAt).toBeNull();
  });

  it('handles jobs finishing after foreground already ended and dedupes repeated authoritative events', async () => {
    const f = create(); await f.accept(0, [job('session-one')]);
    f.lists.set('session-one', [job('session-one', 'shared-job', 'completed')]);
    f.emit({ kind: 'session', sessionId: 'session-one', update: { sessionUpdate: 'jobs_update', jobs: f.lists.get('session-one') } }); await settle();
    expect(f.notices(0)).toHaveLength(1);
    await f.accept(0, [job('session-one', 'shared-job', 'completed')]);
    expect(f.notices(0)).toHaveLength(1); expect(f.save).toHaveBeenCalledTimes(1);
  });

  it('does not re-notify persisted terminal jobs after full owner recreation and conversation restore', async () => {
    const f = create(); await f.accept(0, [job('session-one', 'shared-job', 'completed')]);
    const restored = JSON.parse(JSON.stringify(f.conversations)) as Conversation[];
    const reload = create(restored);
    await reload.accept(0, [job('session-one', 'shared-job', 'completed')]);
    expect(reload.notices(0)).toHaveLength(1); expect(reload.save).not.toHaveBeenCalled();
  });

  it('keeps equal job IDs isolated by native session and completes a non-active tab', async () => {
    const f = create(); f.switchTab(0);
    await f.accept(0, [job('session-one')]); await f.accept(1, [job('session-two', 'shared-job', 'completed')]);
    expect(f.notices(0)).toHaveLength(0); expect(f.notices(1)).toHaveLength(1);
    expect(f.notices(1)[0].noticeMeta?.sourceReminderIds).toEqual(['dsh-job:session-two:shared-job']);
    expect(f.roots[0].textContent).toContain('Work shared-job'); expect(f.roots[1].querySelector('.opencodian-background-task-inline')).toBeNull();
  });

  it('rejects foreign owners, keeps same-label jobs distinct and anchors each native start to its own turn', async () => {
    const f = create(); const second: ChatMessage = { id: 'later-user', role: 'user', content: 'Next task', timestamp: 200 };
    f.conversations[0].messages.push(second); f.runtimes[0].turnBodyByAnchorKey.set(second.id, f.roots[0].createDiv());
    const earlier = job('session-one', 'old', 'completed', 110); const later = { ...job('session-one', 'new', 'running', 210), label: earlier.label };
    await f.accept(0, [earlier, later, job('foreign', 'outsider')]);
    const segments = f.timeline.collectNativeJobSegments(f.conversations[0], 'tab-0');
    expect(segments.map(segment => [segment.anchorKey, segment.pending.length])).toEqual([['user-one', 0], ['later-user', 1]]);
    expect(f.roots[0].textContent).not.toContain('outsider'); expect(f.notices(0)).toHaveLength(1);
  });

  it('ignores late client-generation lists and queued terminal results until a new authoritative read', async () => {
    const f = create(); const late = deferred<DshJobView[]>();
    f.adapter.listSessionJobs.mockReturnValueOnce(late.promise);
    const reading = f.information.refreshTasks(f.sessions[0], true);
    f.emit({ kind: 'invalidated' }); late.resolve([job('session-one', 'old-client', 'completed')]); await reading;
    expect(f.notices(0)).toHaveLength(0); expect(f.timeline.collectNativeJobSegments(f.conversations[0], 'tab-0')).toEqual([]);
    f.runtimes[0].isStreaming = true; await f.accept(0, [job('session-one', 'queued', 'completed')]);
    f.emit({ kind: 'invalidated' }); f.runtimes[0].isStreaming = false;
    await f.indicator.queueAndFlushCompletionNotices('tab-0', f.conversations[0]); expect(f.notices(0)).toHaveLength(0);
    await f.accept(0, [job('session-one', 'queued', 'completed')]); expect(f.notices(0)).toHaveLength(1);
  });

  it('requires an authoritative list and hydrated user anchor before creating inline or terminal evidence', async () => {
    const f = create(); f.runtimes[0].isHydratingConversation = true;
    const messages = f.conversations[0].messages; f.conversations[0].messages = [];
    await f.accept(0, [job('session-one', 'restore', 'completed')]); expect(f.notices(0)).toHaveLength(0);
    f.conversations[0].messages = messages;
    f.adapter.listSessionJobs.mockRejectedValueOnce(new Error('not yet authoritative'));
    f.emit({ kind: 'invalidated' }); await f.information.refreshTasks(f.sessions[0], true);
    expect(f.notices(0)).toHaveLength(0); expect(f.runtimes[0].backgroundTaskSuppressedFingerprint).toBeNull();
    await f.accept(0, [job('session-one', 'restore', 'running')]);
    expect(f.roots[0].textContent).toContain('Work restore'); expect(f.notices(0)).toHaveLength(0);
    f.adapter.listSessionJobs.mockRejectedValueOnce(new Error('transient disconnect')); await f.information.refreshTasks(f.sessions[0], true);
    expect(f.roots[0].textContent).not.toContain(t('chat.dsh.jobs.status.killed')); expect(f.notices(0)).toHaveLength(0);
  });

  it('never derives DSH stale or completion state from a task-shaped tool or OMO reminder', async () => {
    const f = create();
    f.conversations[0].messages.push({ id: 'tool-message', role: 'assistant', content: '', timestamp: 120,
      contentBlocks: [{ type: 'tool_use', toolId: 'fake-task', toolName: 'task', toolInput: { description: 'Not a native job', run_in_background: true }, toolStatus: 'completed', toolMetadata: { sessionId: 'fake-child' } }] });
    f.timeline.syncStateFromConversation(f.conversations[0], 'tab-0');
    await f.indicator.queueAndFlushCompletionNotices('tab-0', f.conversations[0]);
    expect(f.timeline.collectInlineSegments(f.conversations[0], 'tab-0')).toEqual([]);
    expect(f.runtimes[0].backgroundTaskLaunches.size).toBe(0); expect(f.notices(0)).toHaveLength(0);
  });

  it('discards a same-session result if its originating tab is reused for another conversation', async () => {
    const f = create(); const late = deferred<DshJobView[]>(); f.adapter.listSessionJobs.mockReturnValueOnce(late.promise);
    const reading = f.information.refreshTasks(f.sessions[0], true);
    f.sessions[0] = { ...f.sessions[0], conversation: { ...f.conversations[0], id: 'replacement' } };
    late.resolve([job('session-one', 'late-tab', 'completed')]); await reading;
    expect(f.notices(0)).toHaveLength(0); expect(f.save).not.toHaveBeenCalled();
  });

  it('does not label failed or killed jobs as successful completion', async () => {
    const f = create(); f.runtimes[0].isStreaming = true;
    await f.accept(0, [job('session-one', 'bad', 'failed'), job('session-one', 'stopped', 'killed')]);
    f.runtimes[0].isStreaming = false; await f.indicator.queueAndFlushCompletionNotices('tab-0', f.conversations[0]);
    expect(f.notices(0)[0].content).toContain(t('chat.dsh.jobs.status.failed'));
    expect(f.notices(0)[0].content).toContain(t('chat.dsh.jobs.status.killed'));
  });

  it('serializes concurrent terminal persistence and retains a newer job queued while the first save awaits', async () => {
    const f = create(); const waiting = deferred<void>(); f.save.mockImplementationOnce(async conversation => { await waiting.promise; f.persisted.set(conversation.id, JSON.parse(JSON.stringify(conversation))); });
    const first = f.accept(0, [job('session-one', 'first', 'completed')]); await settle();
    const second = f.accept(0, [job('session-one', 'first', 'completed'), job('session-one', 'second', 'completed')]); await settle();
    waiting.resolve(); await Promise.all([first, second]);
    const ids = f.notices(0).flatMap(message => message.noticeMeta?.sourceReminderIds ?? []);
    expect(ids.sort()).toEqual(['dsh-job:session-one:first', 'dsh-job:session-one:second']);
    expect(f.notices(0)).toHaveLength(2);
  });

  it('retries failed persistence without deleting the completion and ignores replaced adapter lists', async () => {
    const f = create(); f.save.mockRejectedValueOnce(new Error('storage temporarily unavailable'));
    await f.accept(0, [job('session-one', 'retry', 'completed')]); expect(f.notices(0)).toHaveLength(0);
    await f.accept(0, [job('session-one', 'retry', 'completed')]); expect(f.notices(0)).toHaveLength(1);
    const late = deferred<DshJobView[]>(); f.adapter.listSessionJobs.mockReturnValueOnce(late.promise);
    const reading = f.information.refreshTasks(f.sessions[0], true); f.replaceAdapter();
    late.resolve([job('session-one', 'replaced', 'completed')]); await reading;
    expect(f.notices(0)).toHaveLength(1);
  });
});
