import type { ChatMessage, Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import {
  type BackgroundTaskCompletionEvent,
  type BackgroundTaskCompletionInfo,
  type BackgroundTaskCompletionNoticeSegment,
  type BackgroundTaskNoticeStateRuntime,
  BackgroundTaskNoticeStateService,
  type QueuedBackgroundTaskCompletionNotice,
} from './BackgroundTaskNoticeStateService';

interface BackgroundTaskCompletionNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
  conversation?: Conversation | null;
  tabId?: TabId | null;
  timestamp?: number;
  noticeMeta?: ChatMessage['noticeMeta'];
}

export type {
  BackgroundTaskCompletionEvent,
  BackgroundTaskCompletionInfo,
  BackgroundTaskCompletionNoticeSegment,
  QueuedBackgroundTaskCompletionNotice,
};

export type BackgroundTaskCompletionNoticeRuntime = BackgroundTaskNoticeStateRuntime;

export interface BackgroundTaskCompletionNoticeServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskCompletionNoticeRuntime | null;
  appendPersistentAssistantNoticeMessage(
    options: BackgroundTaskCompletionNoticeMessageOptions,
  ): Promise<void>;
}

export class BackgroundTaskCompletionNoticeService {
  private readonly noticeService: BackgroundTaskNoticeStateService;

  constructor(host: BackgroundTaskCompletionNoticeServiceHost) {
    this.noticeService = new BackgroundTaskNoticeStateService({
      getTabRuntimeState: host.getTabRuntimeState,
      appendPersistentAssistantNoticeMessage: host.appendPersistentAssistantNoticeMessage,
      getActiveTabId: () => null,
      getSessionIdForTab: () => null,
      getCurrentConversation: () => null,
      hasMatchingPersistentAssistantNoticeMessage: () => false,
    });
  }

  queueNotices(
    segments: readonly BackgroundTaskCompletionNoticeSegment[],
    tabId: TabId | null,
    conversation: Conversation | null,
  ): void {
    this.noticeService.queueNotices(segments, tabId, conversation);
  }

  async flushQueuedNotices(
    tabId: TabId | null,
    conversation: Conversation | null,
  ): Promise<void> {
    await this.noticeService.flushQueuedNotices(tabId, conversation);
  }
}
