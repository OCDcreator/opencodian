import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationLoadRecoveryCoordinator } from '../../../../src/features/chat/services/ConversationLoadRecoveryCoordinator';
import { ConversationTabRuntimeCoordinator } from '../../../../src/features/chat/services/ConversationTabRuntimeCoordinator';

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

function getConversationLoadRecoveryCoordinator(
  view: OpenCodianView,
): ConversationLoadRecoveryCoordinator {
  return (view as unknown as {
    conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
  }).conversationLoadRecoveryCoordinator;
}

function getConversationTabRuntimeCoordinator(
  view: OpenCodianView,
): ConversationTabRuntimeCoordinator<unknown> {
  return (view as unknown as {
    conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator<unknown>;
  }).conversationTabRuntimeCoordinator;
}

describe('OpenCodianView tab lifecycle recovery delegation', () => {
  it('delegates tab close recovery to ConversationTabLifecycleRecoveryCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      handleTabClose: (tabId: string) => Promise<void>;
    };
    const coordinator = getConversationTabRuntimeCoordinator(view);
    const spy = jest.spyOn(coordinator, 'handleTabClose').mockResolvedValue(undefined);

    await view.handleTabClose('tab-1');

    expect(spy).toHaveBeenCalledWith('tab-1');
  });

  it('delegates conversation delete cleanup to ConversationTabLifecycleRecoveryCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      deleteConversationsAndCleanupTabs: (conversationIds: string[]) => Promise<void>;
    };
    const coordinator = getConversationLoadRecoveryCoordinator(view);
    const spy = jest
      .spyOn(coordinator, 'deleteConversationsAndRecover')
      .mockResolvedValue(undefined);

    await view.deleteConversationsAndCleanupTabs(['conv-1', 'conv-2']);

    expect(spy).toHaveBeenCalledWith(['conv-1', 'conv-2']);
  });
});
