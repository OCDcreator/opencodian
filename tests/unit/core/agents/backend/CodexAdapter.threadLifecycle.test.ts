/**
 * Unit tests for CodexAdapter fork / archive / unarchive session lifecycle.
 */

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../../src/core/agents/backend/codex/CodexAdapter';

const mockForkThread = jest.fn();
const mockArchiveThread = jest.fn();
const mockUnarchiveThread = jest.fn();
const mockReadThread = jest.fn();

jest.mock('../../../../../src/core/agents/backend/codex/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    forkThread: mockForkThread,
    archiveThread: mockArchiveThread,
    unarchiveThread: mockUnarchiveThread,
    readThread: mockReadThread,
    supportsBeforeTurnFork: jest.fn().mockReturnValue(true),
  })),
}));

function createMockCodex() {
  return {
    startThread: jest.fn().mockReturnValue({ id: 'mock-thread', runStreamed: jest.fn(), run: jest.fn() }),
    resumeThread: jest.fn().mockReturnValue({ id: 'mock-thread', runStreamed: jest.fn(), run: jest.fn() }),
  };
}

async function createStartedAdapter(options?: { skipAppServer?: boolean }): Promise<CodexAdapter> {
  const mockCodex = createMockCodex();
  const adapter = new CodexAdapter({
    codexPathOverride: options?.skipAppServer ? undefined : '/path/to/codex',
    createAppServerClient: options?.skipAppServer ? () => null : undefined,
    createCodex: async () => mockCodex as unknown as import('@openai/codex-sdk').Codex,
  });
  await adapter.start();
  return adapter;
}

describe('CodexAdapter session lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('forkSession', () => {
    it('forks before the owning turn of the exact user item even with duplicate text', async () => {
      mockReadThread.mockResolvedValue({ id: 'parent', status: { type: 'idle' }, turns: [
        { id: 'turn-1', status: 'completed', items: [{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'same' }] }] },
        { id: 'turn-2', status: 'completed', items: [{ type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'same' }] }] },
      ] });
      mockForkThread.mockResolvedValue({ thread: { id: 'child', preview: '' } });
      const adapter = await createStartedAdapter();
      await adapter.forkSession('parent', 'u2');
      expect(mockReadThread).toHaveBeenCalledWith('parent', true);
      expect(mockForkThread).toHaveBeenCalledWith('parent', { beforeTurnId: 'turn-2' });
    });

    it.each(['unknown', 'foreign'])('rejects %s identity without any native fork mutation', async target => {
      mockReadThread.mockResolvedValue({ id: 'parent', turns: [{ id: 'turn-1', status: 'completed', items: [{ type: 'userMessage', id: 'u1' }] }] });
      const adapter = await createStartedAdapter();
      await expect(adapter.forkSession('parent', target)).rejects.toThrow(/identity/);
      expect(mockForkThread).not.toHaveBeenCalled();
    });

    it.each(['ambiguous', 'active', 'wrong-thread'])('fails closed for %s native mapping', async condition => {
      const turn = { id: 't1', status: condition === 'active' ? 'inProgress' : 'completed', items: [{ type: 'userMessage', id: 'u1' }] };
      mockReadThread.mockResolvedValue({ id: condition === 'wrong-thread' ? 'other' : 'parent', turns: condition === 'ambiguous' ? [turn, { ...turn, id: 't2' }] : [turn] });
      const adapter = await createStartedAdapter();
      await expect(adapter.forkSession('parent', 'u1')).rejects.toThrow();
      expect(mockForkThread).not.toHaveBeenCalled();
    });
    it('returns id and title from forked thread', async () => {
      mockForkThread.mockResolvedValue({
        thread: {
          id: 'forked-1',
          name: 'Forked Session',
          preview: 'Preview text',
        },
      });

      const adapter = await createStartedAdapter();

      const result = await adapter.forkSession('source-1');

      expect(result).toEqual({ id: 'forked-1', title: 'Forked Session' });
      expect(mockForkThread).toHaveBeenCalledWith('source-1');
    });

    it('falls back to preview slice when name is absent', async () => {
      mockForkThread.mockResolvedValue({
        thread: {
          id: 'forked-2',
          preview: 'a'.repeat(100),
        },
      });

      const adapter = await createStartedAdapter();

      const result = await adapter.forkSession('source-2');

      expect(result.title).toBe('a'.repeat(80));
    });

    it('throws when app-server client is unavailable', async () => {
      const adapter = await createStartedAdapter({ skipAppServer: true });
      await expect(adapter.forkSession('source-1')).rejects.toThrow('Codex app-server client is not available');
    });

    it('throws when fork returns null', async () => {
      mockForkThread.mockResolvedValue(null);

      const adapter = await createStartedAdapter();

      await expect(adapter.forkSession('source-1')).rejects.toThrow('Failed to fork Codex session source-1');
    });
  });

  describe('archiveSession', () => {
    it('returns true when app-server archive succeeds', async () => {
      mockArchiveThread.mockResolvedValue(true);

      const adapter = await createStartedAdapter();

      const result = await adapter.archiveSession('thread-1');

      expect(result).toBe(true);
      expect(mockArchiveThread).toHaveBeenCalledWith('thread-1');
    });

    it('returns false when app-server client is unavailable', async () => {
      const adapter = await createStartedAdapter({ skipAppServer: true });
      const result = await adapter.archiveSession('thread-1');
      expect(result).toBe(false);
    });
  });

  describe('unarchiveSession', () => {
    it('returns true when app-server unarchive succeeds', async () => {
      mockUnarchiveThread.mockResolvedValue(true);

      const adapter = await createStartedAdapter();

      const result = await adapter.unarchiveSession('thread-1');

      expect(result).toBe(true);
      expect(mockUnarchiveThread).toHaveBeenCalledWith('thread-1');
    });

    it('returns false when app-server client is unavailable', async () => {
      const adapter = await createStartedAdapter({ skipAppServer: true });
      const result = await adapter.unarchiveSession('thread-1');
      expect(result).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('declares Fork capability', () => {
      const adapter = new CodexAdapter();
      expect(adapter.capabilities.has(AgentCapability.Fork)).toBe(true);
    });
  });
});
