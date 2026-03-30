/**
 * StorageService unit tests
 */

import { StorageService } from '../../../../src/core/storage/StorageService';

// Mock Obsidian
const mockAdapter = {
  basePath: '/test/vault',
  exists: jest.fn().mockResolvedValue(false),
  mkdir: jest.fn().mockResolvedValue(undefined),
  write: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue('{}'),
  remove: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
};

const mockApp = {
  vault: {
    adapter: mockAdapter,
  },
};

const mockPlugin = {
  app: mockApp,
};

describe('StorageService', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService(mockPlugin as unknown as { app: { vault: { adapter: typeof mockAdapter } } });
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create storage directories', async () => {
      await storage.initialize();

      expect(mockAdapter.mkdir).toHaveBeenCalledWith('.opencodian');
      expect(mockAdapter.mkdir).toHaveBeenCalledWith('.opencodian/sessions');
    });

    it('should handle existing directories', async () => {
      mockAdapter.exists.mockResolvedValue(true);

      await storage.initialize();

      expect(mockAdapter.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('saveConversation', () => {
    it('should save conversation metadata', async () => {
      const conversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-456',
        messages: [],
      };

      await storage.saveConversation(conversation);

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/sessions/conv-123.json',
        expect.stringContaining('Test Conversation')
      );
    });

    it('should include message count in saved data', async () => {
      const conversation = {
        id: 'conv-123',
        title: 'Test',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-456',
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
      };

      await storage.saveConversation(conversation as unknown as { id: string; title: string; createdAt: number; updatedAt: number; openCodeSessionId: string; messages: unknown[] });

      const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      expect(savedData.messageCount).toBe(2);
    });

    it('persists user context attachments inside full messages', async () => {
      const conversation = {
        id: 'conv-ctx',
        title: 'Context conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-ctx',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Summarize this',
            timestamp: 1234567890,
            contextAttachments: [
              {
                kind: 'selection',
                path: 'notes/today.md',
                label: 'today.md:3-4',
                mime: 'text/markdown',
                lineRange: { startLine: 3, endLine: 4 },
                textSnapshot: 'Selected text',
              },
            ],
          },
        ],
      };

      await storage.saveConversation(conversation as unknown as {
        id: string;
        title: string;
        createdAt: number;
        updatedAt: number;
        openCodeSessionId: string;
        messages: unknown[];
      });

      const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      expect(savedData.messages[0].contextAttachments).toEqual([
        {
          kind: 'selection',
          path: 'notes/today.md',
          label: 'today.md:3-4',
          mime: 'text/markdown',
          lineRange: { startLine: 3, endLine: 4 },
          textSnapshot: 'Selected text',
        },
      ]);
    });
  });

  describe('loadConversation', () => {
    it('should load conversation metadata', async () => {
      const mockData = JSON.stringify({
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        messageCount: 5,
      });
      mockAdapter.read.mockResolvedValue(mockData);

      const result = await storage.loadConversation('conv-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('conv-123');
      expect(result?.title).toBe('Test Conversation');
    });

    it('should return null for non-existent conversation', async () => {
      mockAdapter.read.mockRejectedValue(new Error('File not found'));

      const result = await storage.loadConversation('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('loadFullConversation', () => {
    it('should preserve persisted assistant notice messages', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567999,
        openCodeSessionId: 'session-456',
        messages: [
          {
            id: 'assistant-notice-1',
            role: 'assistant',
            content: 'No local models configured yet.',
            timestamp: 1234567999,
            displayStyle: 'notice',
            noticeTitle: 'No local models available',
            noticeTone: 'warning',
            noticeActions: [{ type: 'open_model_settings' }],
          },
        ],
      }));

      const result = await storage.loadFullConversation('conv-123');

      expect(result).not.toBeNull();
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0]).toMatchObject({
        displayStyle: 'notice',
        noticeTitle: 'No local models available',
        noticeTone: 'warning',
        noticeActions: [{ type: 'open_model_settings' }],
      });
    });

    it('restores persisted context attachments after reload', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        id: 'conv-ctx',
        title: 'Context Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567999,
        openCodeSessionId: 'session-ctx',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Summarize this',
            timestamp: 1234567890,
            contextAttachments: [
              {
                kind: 'file',
                path: 'notes/today.md',
                label: 'today.md',
                mime: 'text/markdown',
              },
            ],
          },
        ],
      }));

      const result = await storage.loadFullConversation('conv-ctx');

      expect(result?.messages[0].contextAttachments).toEqual([
        {
          kind: 'file',
          path: 'notes/today.md',
          label: 'today.md',
          mime: 'text/markdown',
        },
      ]);
    });
  });

  describe('listConversations', () => {
    it('should return sorted conversations', async () => {
      mockAdapter.list.mockResolvedValue({
        files: ['.opencodian/sessions/conv-1.json', '.opencodian/sessions/conv-2.json'],
        folders: [],
      });

      mockAdapter.read
        .mockResolvedValueOnce(JSON.stringify({
          id: 'conv-1',
          title: 'First',
          createdAt: 1000,
          updatedAt: 3000,
          messageCount: 1,
        }))
        .mockResolvedValueOnce(JSON.stringify({
          id: 'conv-2',
          title: 'Second',
          createdAt: 2000,
          updatedAt: 4000,
          messageCount: 2,
        }));

      const result = await storage.listConversations();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conv-2'); // Sorted by updatedAt desc
      expect(result[1].id).toBe('conv-1');
    });

    it('should handle empty directory', async () => {
      mockAdapter.list.mockResolvedValue({ files: [], folders: [] });

      const result = await storage.listConversations();

      expect(result).toEqual([]);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation file', async () => {
      await storage.deleteConversation('conv-123');

      expect(mockAdapter.remove).toHaveBeenCalledWith('.opencodian/sessions/conv-123.json');
    });

    it('should not throw for non-existent file', async () => {
      mockAdapter.remove.mockRejectedValue(new Error('File not found'));

      await expect(storage.deleteConversation('non-existent')).resolves.not.toThrow();
    });
  });

  describe('saveSettings', () => {
    it('should save settings to file', async () => {
      const settings = { userName: 'Test User', server: { port: 4096 } };

      await storage.saveSettings(settings as unknown as { userName: string; server: { port: number } });

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.json',
        expect.stringContaining('Test User')
      );
    });
  });

  describe('loadSettings', () => {
    it('should load settings from file', async () => {
      const mockSettings = { userName: 'Test User' };
      mockAdapter.read.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await storage.loadSettings();

      expect(result).toEqual(mockSettings);
    });

    it('should return null for missing settings file', async () => {
      mockAdapter.read.mockRejectedValue(new Error('File not found'));

      const result = await storage.loadSettings();

      expect(result).toBeNull();
    });
  });

  describe('managed server state', () => {
    it('should persist managed server state to runtime file', async () => {
      await storage.saveManagedServerState({
        pid: 12345,
        host: '127.0.0.1',
        port: 5090,
      });

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/runtime.json',
        expect.stringContaining('"pid": 12345'),
      );
    });

    it('should load managed server state from runtime file', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        managedServer: {
          pid: 54321,
          host: '127.0.0.1',
          port: 4096,
        },
      }));

      const result = await storage.loadManagedServerState();

      expect(result).toEqual({
        pid: 54321,
        host: '127.0.0.1',
        port: 4096,
      });
    });
  });
});
