/**
 * Unit tests for CodexAdapter fork / archive / unarchive session lifecycle.
 */

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

const mockForkThread = jest.fn();
const mockArchiveThread = jest.fn();
const mockUnarchiveThread = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    forkThread: mockForkThread,
    archiveThread: mockArchiveThread,
    unarchiveThread: mockUnarchiveThread,
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
