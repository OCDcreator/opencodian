import type { AgentService, AgentSessionChild, AgentSessionInformation } from '../../../../src/core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { type Conversation, createEmptyTabContextState } from '../../../../src/core/types';
import type { AgentBackendKind, ChatMessage } from '../../../../src/core/types/chat';
import { SessionInformationCoordinator, type WorkbenchSession } from '../../../../src/features/chat/services/conversation/SessionInformationCoordinator';
import { t } from '../../../../src/i18n';

const information = (sessionId = 's1'): AgentSessionInformation => ({ sessionId, observedAt: 1, quota: null, mcp: null, agents: null });
const session = (backend: AgentBackendKind = 'codex', id = 'c1', nativeId = 's1'): WorkbenchSession => ({
  tabId: 't1', backend, streaming: false, todos: [], backgroundTasks: [], resources: [],
  conversation: { id, backend, backendSessionId: nativeId, title: id, createdAt: 1, updatedAt: 1, messages: [] } as Conversation,
});
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const child: AgentSessionChild = { id: 'native-child', title: 'Review', status: 'running', readable: true };

describe('backend-owned session information', () => {
  let current: WorkbenchSession;
  let coordinator: SessionInformationCoordinator;
  let service: AgentService;
  const read = jest.fn<Promise<AgentSessionInformation>, [string]>();
  const readChild = jest.fn<Promise<ChatMessage[]>, [string, string]>();
  beforeEach(() => {
    current = session();
    read.mockResolvedValue(information()); readChild.mockResolvedValue([]);
    service = { readSessionInformation: read, readChildSessionMessages: readChild } as unknown as AgentService;
    coordinator = new SessionInformationCoordinator({ getActiveSession: () => current, getSessions: () => [current],
      getRegistry: () => ({ get: (backend: AgentBackendKind) => backend === current.backend ? service : undefined }) as unknown as AgentServiceRegistry,
      onChange: jest.fn(), openChildView: jest.fn(),
    });
  });
  afterEach(() => { coordinator.destroy(); jest.clearAllMocks(); });

  it.each<AgentBackendKind>(['opencode2', 'claude-code', 'codex', 'zcode', 'dsh', 'pi'])('reads only the owning %s service and exact session', async (backend) => {
    current = session(backend); coordinator.refresh(current); coordinator.refresh(current, true); await flush();
    expect(read).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledWith('s1');
    expect(coordinator.project(current).information).toEqual(information());
    expect(coordinator.project(current).information?.quota).toBeNull();
  });

  it('rejects a late read when a tab is reused and rejects a mismatched native session ID', async () => {
    let resolve!: (value: AgentSessionInformation) => void;
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    coordinator.refresh(current); current = session('codex', 'replacement', 's2');
    resolve({ ...information(), quota: { windows: [{ label: 'old-account', usedPercent: 95 }] } }); await flush();
    expect(coordinator.project(current).information).toBeUndefined();
    read.mockResolvedValueOnce(information('wrong-id')); coordinator.refresh(current, true); await flush();
    expect(coordinator.project(current).information).toBeUndefined();
  });

  it('discards responses from a replaced backend service', async () => {
    let resolve!: (value: AgentSessionInformation) => void;
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    coordinator.refresh(current); service = {} as AgentService;
    resolve(information()); await flush(); expect(coordinator.project(current).information).toBeUndefined();
  });

  it('counts conversation records, excludes draft sources, and uses current context separately from cumulative usage', async () => {
    current.resources = [{ label: 'Unsent draft', path: 'draft.md' }];
    current.conversation!.messages = [
      { id: 'user', role: 'user', timestamp: 1, content: 'Review', contextAttachments: [{ kind: 'file', label: 'Sent note', path: 'note.md', mime: 'text/markdown' }] },
      { id: 'assistant', role: 'assistant', timestamp: 2, content: 'Working', toolCalls: [
        { id: 'shell', name: 'background_task', input: {}, status: 'running' },
        { id: 'spawn-item', name: 'task', kind: 'task', input: { description: 'Native review' }, status: 'running', toolMetadata: { agentThreadId: child.id } },
      ] },
      { id: 'notice', role: 'assistant', timestamp: 3, content: 'Task finished', displayStyle: 'notice' },
    ];
    current.contextUsage = { ...createEmptyTabContextState(), sessionId: 's1', model: 'm', contextWindow: 8000,
      openCodeCurrentContext: { providerId: 'p', providerName: 'P', modelId: 'm', modelName: 'M', contextWindow: 8000,
        totalTokens: 1200, inputTokens: 1000, outputTokens: 200, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: null } };
    read.mockResolvedValueOnce({ ...information(), context: { tokens: 1200, window: 8000 }, usage: { inputTokens: 90000, outputTokens: 10000 } });
    coordinator.refresh(current); await flush(); const projected = coordinator.project(current);
    expect(projected.statistics).toMatchObject({ rounds: 1, messages: 2, tools: 2, context: { tokens: 1200, window: 8000 } });
    expect(projected.contextSources?.map((source) => source.label)).toEqual(['Sent note']);
    expect(projected.agents).toEqual([expect.objectContaining({ id: child.id, title: 'Native review', status: 'running' })]);
    expect(projected.information?.usage?.inputTokens).toBe(90000);
  });

  it('opens the native child with its parent ID and discards its late response after returning', async () => {
    read.mockResolvedValueOnce({ ...information(), agents: [child] }); coordinator.refresh(current); await flush();
    const conversation = current.conversation;
    let resolve!: (value: ChatMessage[]) => void;
    readChild.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const opening = coordinator.openChild(child);
    expect(readChild).toHaveBeenCalledWith('s1', child.id);
    expect(coordinator.project(current).child?.loading).toBe(true);
    coordinator.returnToParent(); resolve([{ id: 'late', role: 'assistant', timestamp: 1, content: 'Late child text' }]); await opening;
    expect(coordinator.project(current).child).toBeUndefined(); expect(current.conversation).toBe(conversation);
    expect(current.conversation?.messages).toEqual([]);
  });

  it('keeps unknown empty catalogs distinct from confirmed empty catalogs and retains failed-read evidence', async () => {
    read.mockResolvedValueOnce({ ...information(), mcp: { scope: 'session', servers: [] } }); coordinator.refresh(current); await flush();
    expect(coordinator.project(current).information?.mcp?.servers).toEqual([]);
    read.mockRejectedValueOnce(new Error('Disconnected')); coordinator.refresh(current, true); await flush();
    expect(coordinator.project(current).informationStatus).toBe('failed');
    expect(coordinator.project(current).information?.mcp?.servers).toEqual([]);
  });

  it('does not present model capacity without a measurement as zero context usage or accept another session’s snapshot', () => {
    current = session('pi');
    current.contextUsage = { ...createEmptyTabContextState(), sessionId: 's1', model: 'm', contextWindow: 8000 };
    expect(coordinator.project(current).statistics?.context).toBeUndefined();
    current.contextUsage.preciseTokens = { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: null };
    expect(coordinator.project(current).statistics?.context).toEqual({ tokens: 0, window: 8000 });
    current.contextUsage.sessionId = 'other';
    expect(coordinator.project(current).statistics?.context).toBeUndefined();
  });

  it('does not display cached account data after the owning backend instance changes', async () => {
    read.mockResolvedValueOnce({ ...information(), quota: { plan: 'old-account', windows: [] } });
    coordinator.refresh(current); await flush(); expect(coordinator.project(current).information?.quota?.plan).toBe('old-account');
    service = {} as AgentService;
    expect(coordinator.project(current).information).toBeUndefined();
  });
});

describe('continuable child session routing', () => {
  let current: WorkbenchSession;
  let coordinator: SessionInformationCoordinator;
  let service: AgentService;
  const read = jest.fn<Promise<AgentSessionInformation>, [string]>();
  const readChild = jest.fn<Promise<ChatMessage[]>, [string, string]>();
  const probe = jest.fn<Promise<boolean>, [string]>();
  const send = jest.fn<Promise<{ messageId: string }>, [string, string, string, { delivery?: 'queue' | 'steer' }?]>();
  const continuable: AgentSessionChild = { id: 'native-child', title: 'Review', status: 'inactive', readable: true, mode: 'continuable' };
  const openContinuableChild = async (mode: AgentSessionChild['mode'] = 'continuable') => {
    read.mockResolvedValue({ ...information(), agents: [{ ...continuable, mode }] });
    coordinator.refresh(current); await flush();
    await coordinator.openChild({ ...continuable, mode });
  };
  beforeEach(() => {
    current = session('dsh');
    read.mockResolvedValue(information()); readChild.mockResolvedValue([]);
    probe.mockResolvedValue(true); send.mockResolvedValue({ messageId: 'inbox-1' });
    service = { readSessionInformation: read, readChildSessionMessages: readChild,
      canContinueChildSession: probe, continueChildSession: send } as unknown as AgentService;
    coordinator = new SessionInformationCoordinator({ getActiveSession: () => current, getSessions: () => [current],
      getRegistry: () => ({ get: (backend: AgentBackendKind) => backend === current.backend ? service : undefined }) as unknown as AgentServiceRegistry,
      onChange: jest.fn(), openChildView: jest.fn(),
    });
  });
  afterEach(() => { coordinator.destroy(); jest.clearAllMocks(); });

  it('probes continuation delivery while refreshing a continuable child and reports the honest tri-state', async () => {
    await openContinuableChild();
    expect(coordinator.project(current).child?.canContinue).toBe(true);
    probe.mockResolvedValue(false);
    await coordinator.openChild(continuable); await flush();
    expect(coordinator.project(current).child?.canContinue).toBe(false);
    probe.mockRejectedValue(new Error('capability read failed'));
    await coordinator.openChild(continuable); await flush();
    expect(coordinator.project(current).child?.canContinue).toBe('unknown');
  });

  it('reads the same child independently in two tabs while the first read stays pending', async () => {
    read.mockResolvedValue({ ...information(), agents: [continuable] });
    coordinator.refresh(current); await flush();
    readChild.mockImplementationOnce(() => new Promise<ChatMessage[]>(() => {}));
    readChild.mockResolvedValueOnce([{ id: 'tab-b-history', role: 'assistant', content: 'second tab evidence', timestamp: 1 }]);
    void coordinator.openChild(continuable);
    await flush();
    const firstTab = current;
    expect(coordinator.project(firstTab).child?.loading).toBe(true);
    current = { ...current, tabId: 'tab-b-independent' };
    const secondOpen = coordinator.openChild(continuable);
    await flush();
    expect(readChild).toHaveBeenCalledTimes(2);
    await secondOpen;
    expect(coordinator.project(current).child).toMatchObject({ loading: false, canContinue: true,
      messages: [expect.objectContaining({ id: 'tab-b-history' })] });
    expect(coordinator.project(firstTab).child?.loading).toBe(true);
  });

  it('keeps one-shot and unknown modes read-only without probing delivery', async () => {
    await openContinuableChild('one-shot');
    expect(coordinator.project(current).child?.canContinue).toBeUndefined();
    await coordinator.openChild({ ...continuable, mode: 'unknown' }); await flush();
    expect(coordinator.project(current).child?.canContinue).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it('routes a follow-up through the child seam with its delivery and refreshes the transcript', async () => {
    await openContinuableChild();
    const note = await coordinator.continueChild('please continue', 'steer');
    expect(send).toHaveBeenCalledWith('s1', continuable.id, 'please continue', { delivery: 'steer' });
    expect(note).toBe(t('workbench.info.childSendAccepted', { messageId: 'inbox-1' }));
    expect(readChild.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('maps backend failure codes to readable messages and never falls back to the parent conversation', async () => {
    await openContinuableChild();
    send.mockRejectedValueOnce(Object.assign(new Error('bridge failure'), { failureCode: 'subagent/parent-unavailable', code: 'failed' }));
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.info.childSend.parentUnavailable'));
    send.mockRejectedValueOnce(Object.assign(new Error('bridge failure'), { failureCode: 'subagent/delivery-unavailable' }));
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.info.childSend.deliveryUnavailable'));
    send.mockRejectedValueOnce(new Error('opaque bridge failure'));
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.info.childSend.generic'));
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every(([parent]) => parent === 's1')).toBe(true);
  });

  it('treats transport-level failures as an unknown delivery outcome: draft kept, no resend', async () => {
    await openContinuableChild();
    coordinator.setChildComposerState({ draft: 'go' });
    const timeout = Object.assign(new Error('DSH native request timed out'), { code: 'failed' });
    send.mockRejectedValueOnce(timeout);
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.info.childSend.generic'));
    expect(coordinator.project(current).child?.draft).toBe('go');
    // No automatic resend: the next call is an explicit user action only.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never downgrades an accepted receipt because the follow-up transcript read fails', async () => {
    await openContinuableChild();
    coordinator.setChildComposerState({ draft: 'go' });
    readChild.mockRejectedValueOnce(new Error('history read failed'));
    await expect(coordinator.continueChild('go', 'queue'))
      .resolves.toBe(t('workbench.info.childSendAccepted', { messageId: 'inbox-1' }));
    expect(coordinator.project(current).child?.draft).toBe('');
    expect(coordinator.project(current).child?.error).toBe(t('workbench.info.failed'));
    // The read failure belongs to the transcript, not the send outcome.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps a reopened child draft untouched when a stale same-slot send settles late', async () => {
    await openContinuableChild();
    let resolve!: (value: { messageId: string }) => void;
    send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = coordinator.continueChild('old message', 'queue').then(() => undefined, error => error as Error);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    coordinator.returnToParent();
    await openContinuableChild();
    coordinator.setChildComposerState({ draft: 'fresh text' });
    resolve({ messageId: 'stale-inbox' });
    expect((await pending)?.message).toBe(t('workbench.info.childSend.generic'));
    expect(coordinator.project(current).child?.draft).toBe('fresh text');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refuses to send without a continuable child, its capability, or the owning session', async () => {
    await openContinuableChild('one-shot');
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.tool.unavailable'));
    await openContinuableChild();
    service = { readSessionInformation: read, readChildSessionMessages: readChild } as unknown as AgentService;
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.tool.unavailable'));
    service = { readSessionInformation: read, readChildSessionMessages: readChild,
      canContinueChildSession: probe, continueChildSession: send } as unknown as AgentService;
    current = session('dsh', 'c2', 's2');
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.tool.unavailable'));
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps one in-flight child send per session identity', async () => {
    await openContinuableChild();
    let resolve!: (value: { messageId: string }) => void;
    send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const first = coordinator.continueChild('go', 'queue');
    await expect(coordinator.continueChild('again', 'queue')).rejects.toThrow(t('workbench.info.childSendBusy'));
    resolve({ messageId: 'inbox-2' });
    await expect(first).resolves.toBe(t('workbench.info.childSendAccepted', { messageId: 'inbox-2' }));
    await expect(coordinator.continueChild('after', 'queue')).resolves.toBe(t('workbench.info.childSendAccepted', { messageId: 'inbox-1' }));
  });

  it('keeps composer draft, delivery and focus across refreshes of the same identity', async () => {
    await openContinuableChild();
    coordinator.setChildComposerState({ draft: 'please review module X', delivery: 'steer', composerFocused: true });
    coordinator.refresh(current, true); await flush();
    expect(coordinator.project(current).child).toMatchObject({ draft: 'please review module X', delivery: 'steer', composerFocused: true });
    coordinator.setChildComposerState({ composerFocused: false });
    expect(coordinator.project(current).child?.composerFocused).toBe(false);
    expect(coordinator.project(current).child?.draft).toBe('please review module X');
  });

  it('keeps the draft when the backend refuses the delivery and only clears an accepted unedited draft', async () => {
    await openContinuableChild();
    coordinator.setChildComposerState({ draft: 'go' });
    send.mockRejectedValueOnce(Object.assign(new Error('bridge failure'), { failureCode: 'subagent/delivery-unavailable' }));
    await expect(coordinator.continueChild('go', 'queue')).rejects.toThrow(t('workbench.info.childSend.deliveryUnavailable'));
    expect(coordinator.project(current).child?.draft).toBe('go');
    await expect(coordinator.continueChild('go', 'queue')).resolves.toBe(t('workbench.info.childSendAccepted', { messageId: 'inbox-1' }));
    expect(coordinator.project(current).child?.draft).toBe('');
    coordinator.setChildComposerState({ draft: 'go' });
    coordinator.setChildComposerState({ draft: 'go, then report' });
    await expect(coordinator.continueChild('go', 'queue')).resolves.toBe(t('workbench.info.childSendAccepted', { messageId: 'inbox-1' }));
    expect(coordinator.project(current).child?.draft).toBe('go, then report');
  });

  it('discards a late send receipt after the owning session changes and never shows it in another tab', async () => {
    await openContinuableChild();
    coordinator.setChildComposerState({ draft: 'in-flight text' });
    let resolve!: (value: { messageId: string }) => void;
    send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = coordinator.continueChild('in-flight text', 'queue').then(() => undefined, error => error as Error);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    current = session('dsh', 'c2', 's2');
    expect(coordinator.project(current).child).toBeUndefined();
    resolve({ messageId: 'late-inbox' });
    expect((await pending)?.message).toBe(t('workbench.info.childSend.generic'));
    expect(coordinator.project(current).child).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
