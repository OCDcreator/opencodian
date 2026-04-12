import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationTabLifecycleRecoveryCoordinator } from '../../../../src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator';

function createView(overrides: Record<string, unknown> = {}): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      enableAutoScroll: true,
      maxTabs: 4,
      tabState: {
        tabs: [],
        activeTabIndex: 0,
      },
    },
    openCodeService: {},
    storage: {},
    createConversation: jest.fn(),
    deleteConversation: jest.fn(),
    getConversations: jest.fn().mockReturnValue([]),
    scheduleSettingsUiStateSave: jest.fn(),
    saveSettingsUiStateImmediately: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never);
}

function getConversationTabLifecycleRecoveryCoordinator(
  view: OpenCodianView,
): ConversationTabLifecycleRecoveryCoordinator {
  return (view as unknown as {
    conversationTabLifecycleRecoveryCoordinator: ConversationTabLifecycleRecoveryCoordinator;
  }).conversationTabLifecycleRecoveryCoordinator;
}

describe('OpenCodianView tab lifecycle recovery delegation', () => {
  it('delegates tab close recovery to ConversationTabLifecycleRecoveryCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      handleTabClose: (tabId: string) => Promise<void>;
    };
    const coordinator = getConversationTabLifecycleRecoveryCoordinator(view);
    const spy = jest.spyOn(coordinator, 'closeTabAndRecover').mockResolvedValue(undefined);

    await view.handleTabClose('tab-1');

    expect(spy).toHaveBeenCalledWith('tab-1');
  });

  it('delegates conversation delete cleanup to ConversationTabLifecycleRecoveryCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      deleteConversationsAndCleanupTabs: (conversationIds: string[]) => Promise<void>;
    };
    const coordinator = getConversationTabLifecycleRecoveryCoordinator(view);
    const spy = jest
      .spyOn(coordinator, 'deleteConversationsAndRecover')
      .mockResolvedValue(undefined);

    await view.deleteConversationsAndCleanupTabs(['conv-1', 'conv-2']);

    expect(spy).toHaveBeenCalledWith(['conv-1', 'conv-2']);
  });

  it('delegates delete-all tab reset and fallback bootstrap to ConversationTabLifecycleRecoveryCoordinator', async () => {
    const view = createView({
      getConversations: jest.fn().mockReturnValue([
        { id: 'conv-1', title: 'One' },
        { id: 'conv-2', title: 'Two' },
      ]),
    }) as OpenCodianView & {
      deleteAllConversations: () => Promise<void>;
      showDeleteAllConfirmDialog: (count: number) => Promise<boolean>;
    };
    const coordinator = getConversationTabLifecycleRecoveryCoordinator(view);
    const spy = jest
      .spyOn(coordinator, 'deleteAllConversationsAndReset')
      .mockResolvedValue(undefined);
    view.showDeleteAllConfirmDialog = jest.fn().mockResolvedValue(true);

    await view.deleteAllConversations();

    expect(view.showDeleteAllConfirmDialog).toHaveBeenCalledWith(2);
    expect(spy).toHaveBeenCalledWith(['conv-1', 'conv-2']);
  });
});
