/**
 * Real unit tests for CodexAdapter.startReview().
 *
 * Proves the adapter-layer wiring: how a review request reaches the app-server
 * client (resume → review/start) and how the result is returned to the caller.
 * The app-server client is mocked; these tests do NOT require a live app-server.
 */

const mockResumeThread = jest.fn();
const mockStartReview = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const mockListThreads = jest.fn().mockResolvedValue([]);
const mockReadThread = jest.fn().mockResolvedValue(null);

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    resumeThread: mockResumeThread,
    startReview: mockStartReview,
    listThreads: mockListThreads,
    readThread: mockReadThread,
    registerServerRequestHandler: jest.fn(),
    unregisterServerRequestHandler: jest.fn(),
  })),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { AppServerReviewResult, AppServerReviewTarget } from '../../../../../src/core/agents/backend/CodexAppServerClient';

function createMockCodex(): unknown {
  const mockThread = {
    id: 'mock-thread-1',
    runStreamed: jest.fn(),
    run: jest.fn(),
  };
  return {
    startThread: jest.fn().mockReturnValue(mockThread),
    resumeThread: jest.fn().mockReturnValue(mockThread),
  };
}

const uncommittedTarget: AppServerReviewTarget = { type: 'uncommittedChanges' };
const baseBranchTarget: AppServerReviewTarget = { type: 'baseBranch', branch: 'main' };
const commitTarget: AppServerReviewTarget = { type: 'commit', sha: 'abc123' };
const customTarget: AppServerReviewTarget = { type: 'custom', instructions: 'Review for bugs' };

const mockReviewResult: AppServerReviewResult = {
  turn: { id: 'turn-1', status: 'inProgress', items: [], error: null },
  reviewThreadId: 'thread-123',
};

describe('CodexAdapter.startReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppServerClientStart.mockResolvedValue(undefined);
    mockResumeThread.mockResolvedValue({ id: 'thread-123' });
    mockStartReview.mockResolvedValue(mockReviewResult);
  });

  it('resumes the thread then calls startReview on the app-server client', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    await adapter.startReview('thread-123', uncommittedTarget);

    expect(mockResumeThread).toHaveBeenCalledWith('thread-123');
    expect(mockStartReview).toHaveBeenCalledWith('thread-123', uncommittedTarget);
  });

  it('returns the review result from the app-server client', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    const result = await adapter.startReview('thread-123', customTarget);

    expect(result).toEqual(mockReviewResult);
  });

  it('passes through baseBranch target with branch param', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    await adapter.startReview('thread-123', baseBranchTarget);

    expect(mockStartReview).toHaveBeenCalledWith('thread-123', { type: 'baseBranch', branch: 'main' });
  });

  it('passes through commit target with sha param', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    await adapter.startReview('thread-123', commitTarget);

    expect(mockStartReview).toHaveBeenCalledWith('thread-123', { type: 'commit', sha: 'abc123' });
  });

  it('returns null when no app-server client is available', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    const result = await adapter.startReview('thread-123', uncommittedTarget);

    expect(result).toBeNull();
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it('still calls startReview even if resumeThread returns null (best-effort resume)', async () => {
    mockResumeThread.mockResolvedValue(null);

    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    const result = await adapter.startReview('thread-123', uncommittedTarget);

    expect(mockResumeThread).toHaveBeenCalled();
    expect(mockStartReview).toHaveBeenCalled();
    expect(result).toEqual(mockReviewResult);
  });

  it('returns null when startReview on the client returns null', async () => {
    mockStartReview.mockResolvedValue(null);

    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    const result = await adapter.startReview('thread-123', uncommittedTarget);

    expect(result).toBeNull();
  });
});
