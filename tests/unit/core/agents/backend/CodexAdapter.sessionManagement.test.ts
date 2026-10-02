/**
 * Real unit tests for CodexAdapter session management on the app-server path:
 * `updateSessionTitle` → `thread/name/set`, `deleteSession` → `thread/delete`
 * (keeping the interrupt-active-turn behavior), and thread goal
 * pause/resume via `thread/goal/set { status }`.
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const mockSetThreadName = jest.fn();
const mockDeleteThread = jest.fn();
const mockDeleteThreadResult = jest.fn();
const mockInterruptTurn = jest.fn();
const mockSetThreadGoal = jest.fn();
const mockClearThreadEffectiveSettings = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      setThreadName: mockSetThreadName,
      deleteThread: mockDeleteThread,
      deleteThreadResult: mockDeleteThreadResult,
      interruptTurn: mockInterruptTurn,
      setThreadGoal: mockSetThreadGoal,
      clearThreadEffectiveSettings: mockClearThreadEffectiveSettings,
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

function createStartedAdapter(): CodexAdapter {
  return new CodexAdapter({
    codexPathOverride: '/path/to/codex',
    createCodex: jest.fn().mockResolvedValue(createMockCodex()),
  });
}

describe('CodexAdapter app-server session management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppServerClientStart.mockResolvedValue(undefined);
    mockSetThreadName.mockResolvedValue(true);
    mockDeleteThread.mockResolvedValue(true);
    mockDeleteThreadResult.mockImplementation(async (threadId: string) => ({ operation: 'delete', threadId, status: 'verified', readback: { status: 'verified' } }));
    mockInterruptTurn.mockResolvedValue(true);
  });

  describe('updateSessionTitle', () => {
    it('renames the thread via thread/name/set', async () => {
      const adapter = createStartedAdapter();
      await adapter.start();

      await adapter.updateSessionTitle('thread-9', 'My new title');

      expect(mockSetThreadName).toHaveBeenCalledWith('thread-9', 'My new title');
      await adapter.stop();
    });

    it('resolves a provisional session through the thread alias', async () => {
      const adapter = createStartedAdapter();
      await adapter.start();
      const sessionId = await adapter.createSession();
      // Simulate the alias a completed turn would establish.
      await adapter.updateSessionTitle(sessionId, 'x');
      // No alias yet → no server call.
      expect(mockSetThreadName).not.toHaveBeenCalled();
      await adapter.stop();
    });

    it('rejects with unavailable when the app-server client is unavailable', async () => {
      const adapter = new CodexAdapter({
        createAppServerClient: () => null,
        createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      });
      await adapter.start();

      await expect(adapter.updateSessionTitle('thread-9', 'title')).rejects.toMatchObject({ result: { status: 'unavailable', operation: 'rename' } });
      expect(mockSetThreadName).not.toHaveBeenCalled();
      await adapter.stop();
    });
  });

  describe('deleteSession', () => {
    it('interrupts the active turn and deletes the backend thread', async () => {
      const adapter = createStartedAdapter();
      await adapter.start();
      // Establish an active turn for the thread so the interrupt path fires.
      const sessions = (adapter as unknown as { activeAppServerTurns: Map<string, { threadId: string; turnId: string | null }> }).activeAppServerTurns;
      sessions.set('thread-7', { threadId: 'thread-7', turnId: 'turn-2' });

      await adapter.deleteSession('thread-7');

      expect(mockInterruptTurn).toHaveBeenCalledWith('thread-7', 'turn-2');
      expect(mockDeleteThreadResult).toHaveBeenCalledWith('thread-7');
      expect(mockClearThreadEffectiveSettings).toHaveBeenCalledWith('thread-7');
      await expect(adapter.getSession('thread-7')).resolves.toBeNull();
      await adapter.stop();
    });

    it('retains an ACK-only legacy client as admitted rather than resolving the void completion', async () => {
      mockDeleteThreadResult.mockResolvedValue(undefined);
      const adapter = createStartedAdapter();
      await adapter.start();
      await expect(adapter.deleteSession('thread-legacy')).rejects.toMatchObject({ result: { status: 'admitted', threadId: 'thread-legacy' } });
      expect(mockDeleteThread).toHaveBeenCalledWith('thread-legacy');
      expect(mockClearThreadEffectiveSettings).not.toHaveBeenCalled();
      await adapter.stop();
    });

    it('performs local cleanup without a server when no thread exists', async () => {
      const adapter = createStartedAdapter();
      await adapter.start();
      const sessionId = await adapter.createSession();

      await adapter.deleteSession(sessionId);

      expect(mockDeleteThread).not.toHaveBeenCalled();
      await expect(adapter.getSession(sessionId)).resolves.toBeNull();
      await adapter.stop();
    });
  });

  describe('thread goal pause/resume', () => {
    it('pauses a goal with status paused only', async () => {
      const adapter = createStartedAdapter();
      await adapter.start();
      mockSetThreadGoal.mockResolvedValue({ threadId: 'thread-3', status: 'paused' });

      const goal = await adapter.pauseThreadGoal('thread-3');

      expect(mockSetThreadGoal).toHaveBeenCalledWith('thread-3', undefined, { status: 'paused' });
      expect(goal?.status).toBe('paused');
      await adapter.stop();
    });

    it('resumes a goal with status active only', async () => {
      const adapter = createStartedAdapter();
      await adapter.start();
      mockSetThreadGoal.mockResolvedValue({ threadId: 'thread-3', status: 'active' });

      const goal = await adapter.resumeThreadGoal('thread-3');

      expect(mockSetThreadGoal).toHaveBeenCalledWith('thread-3', undefined, { status: 'active' });
      expect(goal?.status).toBe('active');
      await adapter.stop();
    });

    it('returns null without calling the server when unavailable', async () => {
      const adapter = new CodexAdapter({
        createAppServerClient: () => null,
        createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      });
      await adapter.start();

      await expect(adapter.pauseThreadGoal('thread-3')).resolves.toBeNull();
      await expect(adapter.resumeThreadGoal('thread-3')).resolves.toBeNull();
      expect(mockSetThreadGoal).not.toHaveBeenCalled();
      await adapter.stop();
    });
  });
});
