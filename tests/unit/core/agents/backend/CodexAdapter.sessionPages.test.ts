/**
 * Real unit tests for the CodexAdapter paginated session-history seam
 * (BackendPaginatedSessionHistoryCapability): `getSessionTurnsPage` via
 * `thread/turns/list` (itemsView summary) and `getSessionTurnItemsPage` via
 * `thread/items/list`, both normalized to preview-message pages. Null-return
 * contract: app-server unavailable, unresolvable thread, or failed request —
 * never throws.
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const mockListThreadTurns = jest.fn();
const mockListThreadItems = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      listThreadTurns: mockListThreadTurns,
      listThreadItems: mockListThreadItems,
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

const TURN = {
  id: 'turn-1',
  items: [
    { id: 'msg-1', type: 'agentMessage', text: 'Hello from codex' },
  ],
};

const TURNS_PAGE = {
  data: [TURN],
  nextCursor: 'cursor-2',
  backwardsCursor: null,
};

const ITEMS_PAGE = {
  data: [
    { item: { id: 'msg-1', type: 'agentMessage', text: 'Hello from codex' }, turnId: 'turn-1' },
  ],
  nextCursor: null,
  backwardsCursor: 'cursor-0',
};

describe('CodexAdapter paginated session history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppServerClientStart.mockResolvedValue(undefined);
  });

  function createStartedAdapter(): CodexAdapter {
    return new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
  }

  it('getSessionTurnsPage lists turns with summary view and normalizes the page', async () => {
    mockListThreadTurns.mockResolvedValue(TURNS_PAGE);
    const adapter = createStartedAdapter();
    await adapter.start();

    const page = await adapter.getSessionTurnsPage('thread-1', { cursor: 'cursor-1', limit: 25, sortDirection: 'asc' });

    expect(mockListThreadTurns).toHaveBeenCalledWith('thread-1', {
      cursor: 'cursor-1',
      limit: 25,
      sortDirection: 'asc',
      itemsView: 'summary',
    });
    expect(page).toEqual({
      messages: [{ role: 'assistant', parts: [{ type: 'text', text: 'Hello from codex' }] }],
      nextCursor: 'cursor-2',
      backwardsCursor: null,
    });
    await adapter.stop();
  });

  it('getSessionTurnsPage defaults the cursor to null and omits unset options', async () => {
    mockListThreadTurns.mockResolvedValue(TURNS_PAGE);
    const adapter = createStartedAdapter();
    await adapter.start();

    await adapter.getSessionTurnsPage('thread-1');

    expect(mockListThreadTurns).toHaveBeenCalledWith('thread-1', {
      cursor: null,
      itemsView: 'summary',
    });
    await adapter.stop();
  });

  it('getSessionTurnItemsPage lists per-turn items and normalizes the page', async () => {
    mockListThreadItems.mockResolvedValue(ITEMS_PAGE);
    const adapter = createStartedAdapter();
    await adapter.start();

    const page = await adapter.getSessionTurnItemsPage('thread-1', { turnId: 'turn-1', cursor: null, limit: 50 });

    expect(mockListThreadItems).toHaveBeenCalledWith('thread-1', {
      turnId: 'turn-1',
      cursor: null,
      limit: 50,
    });
    expect(page?.messages).toHaveLength(1);
    expect(page?.backwardsCursor).toBe('cursor-0');
    await adapter.stop();
  });

  it('returns null when the page request fails or yields no page', async () => {
    mockListThreadTurns.mockResolvedValue(null);
    mockListThreadItems.mockRejectedValue(new Error('route unavailable'));
    const adapter = createStartedAdapter();
    await adapter.start();

    await expect(adapter.getSessionTurnsPage('thread-1')).resolves.toBeNull();
    await expect(adapter.getSessionTurnItemsPage('thread-1', { turnId: 'turn-1' })).resolves.toBeNull();
    await adapter.stop();
  });

  it('returns null without calling the server when unavailable or unresolvable', async () => {
    const sdkOnly = new CodexAdapter({
      createAppServerClient: () => null,
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await sdkOnly.start();
    await expect(sdkOnly.getSessionTurnsPage('thread-1')).resolves.toBeNull();
    await expect(sdkOnly.getSessionTurnItemsPage('thread-1')).resolves.toBeNull();
    await sdkOnly.stop();

    const adapter = createStartedAdapter();
    await adapter.start();
    // Provisional id without an alias cannot resolve to a thread.
    await expect(adapter.getSessionTurnsPage('codex-local-unknown')).resolves.toBeNull();
    expect(mockListThreadTurns).not.toHaveBeenCalled();
    await adapter.stop();
  });
});
