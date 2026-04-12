import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationTabOpenCoordinator } from '../../../../src/features/chat/services/ConversationTabOpenCoordinator';

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
    scheduleSettingsUiStateSave: jest.fn(),
    saveSettingsUiStateImmediately: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never);
}

function getConversationTabOpenCoordinator(
  view: OpenCodianView,
): ConversationTabOpenCoordinator {
  return (view as unknown as {
    conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  }).conversationTabOpenCoordinator;
}

describe('OpenCodianView new conversation delegation', () => {
  it('delegates new-tab creation to ConversationTabOpenCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      createNewConversation: () => Promise<void>;
    };
    const coordinator = getConversationTabOpenCoordinator(view);
    const spy = jest.spyOn(coordinator, 'createConversationInNewTab').mockResolvedValue(undefined);

    await view.createNewConversation();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delegates current-tab creation to ConversationTabOpenCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      createNewConversationInCurrentTab: () => Promise<void>;
    };
    const coordinator = getConversationTabOpenCoordinator(view);
    const spy = jest.spyOn(coordinator, 'createConversationInCurrentTab').mockResolvedValue(undefined);

    await view.createNewConversationInCurrentTab();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
