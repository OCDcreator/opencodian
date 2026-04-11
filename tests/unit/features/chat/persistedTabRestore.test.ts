import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationViewStateService } from '../../../../src/features/chat/services/ConversationViewStateService';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';

function createConversation(id: string, title: string) {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [],
  };
}

function createView(overrides: Record<string, unknown> = {}): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      enableAutoScroll: true,
      tabState: {
        tabs: [],
        activeTabIndex: 0,
      },
    },
    openCodeService: {},
    storage: {},
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversations: jest.fn().mockReturnValue([]),
    getConversationById: jest.fn().mockResolvedValue(null),
    createConversation: jest.fn(),
    scheduleSettingsUiStateSave: jest.fn(),
    saveSettingsUiStateImmediately: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never);
}

function getConversationViewStateService(view: OpenCodianView): ConversationViewStateService {
  return (view as unknown as {
    conversationViewStateService: ConversationViewStateService;
  }).conversationViewStateService;
}

describe('OpenCodianView persisted tab restore', () => {
  it('loads conversations before attempting to restore tabs during first open', async () => {
    const plugin = {
      loadConversations: jest.fn().mockResolvedValue(undefined),
    };
    const view = createView(plugin) as OpenCodianView & {
      tabManager: TabManager | null;
      initializeFirstTab: () => Promise<void>;
      restorePersistedTabs: () => string | null;
      activateTab: (tabId: string) => Promise<void>;
    };

    view.tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });

    const service = getConversationViewStateService(view);
    const restoreSpy = jest.spyOn(service, 'restorePersistedTabs').mockReturnValue('restored-tab');
    const activateSpy = jest.spyOn(service, 'activateTab').mockResolvedValue(undefined);

    await view.initializeFirstTab();

    expect(plugin.loadConversations).toHaveBeenCalledTimes(1);
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(activateSpy).toHaveBeenCalledWith('restored-tab');
    expect(plugin.loadConversations.mock.invocationCallOrder[0]).toBeLessThan(
      restoreSpy.mock.invocationCallOrder[0]!,
    );
  });

  it('reuses the first existing conversation when no persisted tabs are available', async () => {
    const conversation = createConversation('conv-existing', 'Existing chat');
    const view = createView({
      getConversations: jest.fn().mockReturnValue([conversation]),
    }) as OpenCodianView & {
      tabManager: TabManager | null;
      initializeFirstTab: () => Promise<void>;
      activateTab: (tabId: string) => Promise<void>;
    };

    view.tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });

    const service = getConversationViewStateService(view);
    const activateSpy = jest.spyOn(service, 'activateTab').mockResolvedValue(undefined);

    await view.initializeFirstTab();

    const tabs = view.tabManager.getAllTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(conversation.id);
    expect(activateSpy).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('creates a new conversation when the first open has no persisted tabs or existing conversations', async () => {
    const createdConversation = createConversation('conv-created', 'Created chat');
    const plugin = {
      getConversations: jest.fn().mockReturnValue([]),
      createConversation: jest.fn().mockResolvedValue(createdConversation),
    };
    const view = createView(plugin) as OpenCodianView & {
      tabManager: TabManager | null;
      initializeFirstTab: () => Promise<void>;
      activateTab: (tabId: string) => Promise<void>;
    };

    view.tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });

    const service = getConversationViewStateService(view);
    const activateSpy = jest.spyOn(service, 'activateTab').mockResolvedValue(undefined);

    await view.initializeFirstTab();

    const tabs = view.tabManager.getAllTabs();
    expect(plugin.createConversation).toHaveBeenCalledTimes(1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(createdConversation.id);
    expect(activateSpy).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('restores per-tab model overrides without leaking them across tab activation', () => {
    const conversations = [
      createConversation('conv-1', 'Chat 1'),
      createConversation('conv-2', 'Chat 2'),
    ];
    const view = createView({
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
        enableAutoScroll: true,
        tabState: {
          tabs: [
            {
              conversationId: 'conv-1',
              title: 'Chat 1',
              modelOverride: { provider: 'openai', model: 'gpt-4.1' },
            },
            {
              conversationId: 'conv-2',
              title: 'Chat 2',
              modelOverride: { provider: 'anthropic', model: 'claude-sonnet-4' },
            },
          ],
          activeTabIndex: 1,
        },
      },
      getConversations: jest.fn().mockReturnValue(conversations),
    }) as OpenCodianView & {
      tabManager: TabManager | null;
      restorePersistedTabs: () => string | null;
    };

    view.tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });

    const restoredTabId = view.restorePersistedTabs();
    const tabs = view.tabManager.getAllTabs();

    expect(restoredTabId).toBe(view.tabManager.getActiveTab()?.id ?? null);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.modelOverride).toEqual({ provider: 'openai', model: 'gpt-4.1' });
    expect(tabs[1]?.modelOverride).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4' });

    view.tabManager.switchToTab(tabs[0]!.id);
    expect(view.tabManager.getActiveTabModelOverride()).toEqual({
      provider: 'openai',
      model: 'gpt-4.1',
    });

    view.tabManager.switchToTab(tabs[1]!.id);
    expect(view.tabManager.getActiveTabModelOverride()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
    });
  });
});
