import type { AgentService, AgentSessionChild, AgentSessionInformation } from '../../../../src/core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { type Conversation, createEmptyTabContextState } from '../../../../src/core/types';
import type { AgentBackendKind, ChatMessage } from '../../../../src/core/types/chat';
import { SessionInformationCoordinator, type WorkbenchSession } from '../../../../src/features/chat/services/conversation/SessionInformationCoordinator';

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
