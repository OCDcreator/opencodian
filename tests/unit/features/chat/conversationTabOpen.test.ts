import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationLoadRecoveryCoordinator } from '../../../../src/features/chat/services/ConversationLoadRecoveryCoordinator';

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

function getConversationLoadRecoveryCoordinator(
  view: OpenCodianView,
): ConversationLoadRecoveryCoordinator {
  return (view as unknown as {
    conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
  }).conversationLoadRecoveryCoordinator;
}

describe('OpenCodianView new conversation delegation', () => {
  it('delegates new-tab creation to ConversationTabOpenCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      createNewConversation: () => Promise<void>;
    };
    const coordinator = getConversationLoadRecoveryCoordinator(view);
    const spy = jest.spyOn(coordinator, 'createConversationInNewTab').mockResolvedValue(undefined);

    await view.createNewConversation();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delegates current-tab creation to ConversationTabOpenCoordinator', async () => {
    const view = createView() as OpenCodianView & {
      createNewConversationInCurrentTab: () => Promise<void>;
    };
    const coordinator = getConversationLoadRecoveryCoordinator(view);
    const spy = jest.spyOn(coordinator, 'createConversationInCurrentTab').mockResolvedValue(undefined);

    await view.createNewConversationInCurrentTab();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCodianView Claude Code permission host wiring', () => {
  it('injects active chat renderers into the plugin permission host context', async () => {
    const plugin = {
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
        questionDisplayMode: 'single',
        questionCardPosition: 'inline',
      },
      openCodeService: {},
      storage: {},
      createConversation: jest.fn(),
      scheduleSettingsUiStateSave: jest.fn(),
      saveSettingsUiStateImmediately: jest.fn().mockResolvedValue(undefined),
      claudeCodePermissionHostContext: { getActiveTabId: () => null },
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never) as OpenCodianView & {
      getActiveTabId: () => string | null;
      permissionInlineCardRenderer: unknown;
      questionRuntimeServices: { inlineCardRenderer: unknown };
    };
    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-claude');

    expect(plugin.claudeCodePermissionHostContext.getActiveTabId()).toBe('tab-claude');
    expect(plugin.claudeCodePermissionHostContext.permissionCardRenderer)
      .toBe(view.permissionInlineCardRenderer);
    const collectAction = jest.spyOn(view.questionRuntimeServices.inlineCardRenderer, 'collectAction')
      .mockResolvedValue({ type: 'reply', answers: [['ok']] });

    await expect(plugin.claudeCodePermissionHostContext.questionCardRenderer?.collectResponse({
      id: 'q-1',
      sessionId: 'claude-session',
      questions: [],
    }, 'tab-claude')).resolves.toEqual([['ok']]);
    expect(collectAction).toHaveBeenCalledWith(
      {
        id: 'q-1',
        sessionId: 'claude-session',
        questions: [],
      },
      'single',
      'tab-claude',
    );
  });
});
