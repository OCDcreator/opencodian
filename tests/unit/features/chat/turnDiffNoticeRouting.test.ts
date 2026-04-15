import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { t } from '../../../../src/i18n';

describe('OpenCodianView turn diff notice routing', () => {
  function createView(pluginOverrides: Record<string, unknown> = {}): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {},
      storage: {},
      saveConversation: jest.fn().mockResolvedValue(undefined),
      ...pluginOverrides,
    } as never);
  }

  it('stores a completed background diff notice on the original conversation after switching tabs', async () => {
    const getSessionDiff = jest.fn().mockResolvedValue([
      {
        file: 'notes.md',
        additions: 3,
        deletions: 1,
        status: 'modified',
      },
    ]);
    const saveConversation = jest.fn().mockResolvedValue(undefined);
    const view = createView({
      openCodeService: { getSessionDiff },
      saveConversation,
    }) as unknown as {
      currentConversation: { id: string; messages: unknown[] } | null;
      tabManager: { setTabNeedsAttention: jest.Mock };
      appendTurnDiffNoticeIfNeeded: (
        conversation: {
          id: string;
          openCodeSessionId: string;
          messages: Array<Record<string, unknown>>;
          updatedAt: number;
        },
        editedFiles: string[],
        tabId: string,
      ) => Promise<void>;
      getActiveTabId: () => string;
      getTabRuntimeState: (tabId?: string | null) => { lastConversationSyncFingerprint: string | null } | null;
      assistantShellViewHostAdapter: {
        renderPersistedAssistantMessage: (options: unknown) => Promise<HTMLElement>;
      };
      scrollToBottom: () => void;
    };

    const sendingConversation = {
      id: 'conversation-old',
      openCodeSessionId: 'session-old',
      updatedAt: 0,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'please update the file',
          timestamp: 1,
          sourceMessageId: 'msg-user-1',
        },
      ],
    };
    const currentConversation = {
      id: 'conversation-new',
      openCodeSessionId: 'session-new',
      updatedAt: 0,
      messages: [],
    };
    const oldTabRuntime = { lastConversationSyncFingerprint: null as string | null };

    view.currentConversation = currentConversation;
    view.tabManager = { setTabNeedsAttention: jest.fn() };
    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-new');
    jest.spyOn(view, 'getTabRuntimeState').mockImplementation((tabId?: string | null) => (
      tabId === 'tab-old' ? oldTabRuntime : null
    ));
    const renderSpy = jest.spyOn(
      view.assistantShellViewHostAdapter,
      'renderPersistedAssistantMessage',
    ).mockResolvedValue(document.createElement('div'));
    const scrollSpy = jest.spyOn(view, 'scrollToBottom').mockImplementation(() => {});

    await view.appendTurnDiffNoticeIfNeeded(sendingConversation, ['notes.md'], 'tab-old');

    expect(getSessionDiff).toHaveBeenCalledWith('session-old', 'msg-user-1');
    expect(sendingConversation.messages).toHaveLength(2);
    expect(sendingConversation.messages[1]).toEqual(expect.objectContaining({
      role: 'assistant',
      displayStyle: 'notice',
      noticeTitle: t('chat.diffNotice.title'),
      noticeTone: 'info',
    }));
    expect(currentConversation.messages).toHaveLength(0);
    expect(saveConversation).toHaveBeenCalledWith(sendingConversation);
    expect(view.tabManager.setTabNeedsAttention).toHaveBeenCalledWith('tab-old', true);
    expect(oldTabRuntime.lastConversationSyncFingerprint).toBeTruthy();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
