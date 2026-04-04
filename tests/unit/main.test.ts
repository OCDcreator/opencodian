import type { StorageService } from '../../src/core/storage';
import type { Conversation } from '../../src/core/types';
import OpenCodianPlugin from '../../src/main';

jest.mock('@opencode-ai/sdk/v2/client', () => ({
  createOpencodeClient: jest.fn(() => ({ client: 'mock-sdk-client' })),
}), { virtual: true });

describe('OpenCodianPlugin.getConversationById', () => {
  it('returns the in-memory conversation when preferCache is enabled', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const conversation: Conversation = {
      id: 'conv-1',
      title: '缓存标题',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-1',
      messages: [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }],
    };

    plugin.conversations = [conversation];
    plugin.storage = {
      loadFullConversation: jest.fn(),
    } as Pick<StorageService, 'loadFullConversation'>;

    const result = await plugin.getConversationById('conv-1', { preferCache: true });

    expect(result).toBe(conversation);
    expect(plugin.storage.loadFullConversation).not.toHaveBeenCalled();
  });

  it('hydrates the cached conversation from storage by default', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const cachedConversation: Conversation = {
      id: 'conv-1',
      title: '旧标题',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-1',
      messages: [],
    };
    const storedConversation: Conversation = {
      ...cachedConversation,
      title: '存储标题',
      messages: [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }],
    };

    plugin.conversations = [cachedConversation];
    plugin.storage = {
      loadFullConversation: jest.fn().mockResolvedValue(storedConversation),
    } as Pick<StorageService, 'loadFullConversation'>;

    const result = await plugin.getConversationById('conv-1');

    expect(result).toEqual(storedConversation);
    expect(plugin.storage.loadFullConversation).toHaveBeenCalledWith('conv-1');
    expect(plugin.conversations[0]).toEqual(storedConversation);
  });

  it('loads conversation metadata only once across concurrent calls', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'listConversations'>;
    };
    const listConversations = jest.fn().mockResolvedValue([
      {
        id: 'conv-1',
        title: '标题',
        createdAt: 1,
        updatedAt: 2,
        lastResponseAt: 3,
        titleGenerationStatus: 'success',
        openCodeSessionId: 'session-1',
      },
    ]);

    plugin.storage = {
      listConversations,
    } as Pick<StorageService, 'listConversations'>;

    await Promise.all([
      plugin.loadConversations(),
      plugin.loadConversations(),
    ]);

    expect(listConversations).toHaveBeenCalledTimes(1);
    expect(plugin.getConversations()).toEqual([
      expect.objectContaining({
        id: 'conv-1',
        title: '标题',
        openCodeSessionId: 'session-1',
      }),
    ]);
  });
});

describe('OpenCodianPlugin.toggleLiquidDiamondDemoForCurrentView', () => {
  it('activates the view and forwards the toggle to the current OpenCodian view', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      activateView: jest.Mock<Promise<void>, []>;
      getOpenCodianView: () => { toggleLiquidDiamondDemo: jest.Mock } | null;
    };
    const view = {
      toggleLiquidDiamondDemo: jest.fn(),
    };

    plugin.activateView = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(plugin as unknown as { getOpenCodianView: () => typeof view | null }, 'getOpenCodianView')
      .mockReturnValue(view);

    await plugin.toggleLiquidDiamondDemoForCurrentView();

    expect(plugin.activateView).toHaveBeenCalledTimes(1);
    expect(view.toggleLiquidDiamondDemo).toHaveBeenCalledTimes(1);
  });
});
