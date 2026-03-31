import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { t } from '../../../../src/i18n';

describe('OpenCodianView background task stale notice dedupe', () => {
  const pending = [
    {
      launchId: 'launch-12345678',
      taskId: 'task-1',
      description: 'Search docs',
    },
  ];

  function createView(): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {},
      storage: {},
    } as never);
  }

  it('suppresses repeated append attempts for the same stale task set in one runtime', async () => {
    const view = createView() as unknown as {
      currentConversation: { openCodeSessionId: string; messages: unknown[] } | null;
      appendBackgroundTaskStoppedNotice: (tabId: string, value: typeof pending) => Promise<void>;
      buildBackgroundTaskStoppedNoticeContent: (value: typeof pending) => string;
      getActiveTabId: () => string;
      getTabRuntimeState: () => { backgroundTaskStaleNoticeFingerprint: string | null };
      getSessionIdForTab: () => string;
      appendPersistentAssistantNoticeMessage: (title: string, content: string, tone: string) => Promise<void>;
    };
    const runtime = { backgroundTaskStaleNoticeFingerprint: null as string | null };
    view.currentConversation = { openCodeSessionId: 'session-1', messages: [] };

    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-1');
    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(runtime);
    jest.spyOn(view, 'getSessionIdForTab').mockReturnValue('session-1');
    const appendSpy = jest.spyOn(view, 'appendPersistentAssistantNoticeMessage').mockResolvedValue(undefined);

    await view.appendBackgroundTaskStoppedNotice('tab-1', pending);
    await view.appendBackgroundTaskStoppedNotice('tab-1', pending);

    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBe(
      view.buildBackgroundTaskStoppedNoticeContent(pending),
    );
  });

  it('reuses an already persisted stale notice after reload instead of appending again', async () => {
    const view = createView() as unknown as {
      currentConversation: { openCodeSessionId: string; messages: Array<Record<string, unknown>> } | null;
      appendBackgroundTaskStoppedNotice: (tabId: string, value: typeof pending) => Promise<void>;
      buildBackgroundTaskStoppedNoticeContent: (value: typeof pending) => string;
      getActiveTabId: () => string;
      getTabRuntimeState: () => { backgroundTaskStaleNoticeFingerprint: string | null };
      getSessionIdForTab: () => string;
      appendPersistentAssistantNoticeMessage: (title: string, content: string, tone: string) => Promise<void>;
    };
    const runtime = { backgroundTaskStaleNoticeFingerprint: null as string | null };
    const content = view.buildBackgroundTaskStoppedNoticeContent(pending);
    view.currentConversation = {
      openCodeSessionId: 'session-1',
      messages: [
        {
          id: 'assistant-notice-1',
          role: 'assistant',
          content,
          timestamp: Date.now(),
          displayStyle: 'notice',
          noticeTitle: t('chat.backgroundTask.staleTitle'),
          noticeTone: 'warning',
        },
      ],
    };

    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-1');
    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(runtime);
    jest.spyOn(view, 'getSessionIdForTab').mockReturnValue('session-1');
    const appendSpy = jest.spyOn(view, 'appendPersistentAssistantNoticeMessage').mockResolvedValue(undefined);

    await view.appendBackgroundTaskStoppedNotice('tab-1', pending);

    expect(appendSpy).not.toHaveBeenCalled();
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBe(content);
  });
});
