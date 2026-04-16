import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n';

export interface AssistantNoticeRenderHost {
  finalizeNoticeFooter(
    messageEl: HTMLElement,
    message: Pick<ChatMessage, 'timestamp' | 'modelId'>,
  ): void;
  renderNoticeCard(container: HTMLElement, message: ChatMessage): Promise<void>;
  setStreamingAssistantMessageVisibility(
    messageEl: HTMLElement,
    visible: boolean,
    reason: string,
  ): void;
}

export function buildInterruptedAssistantNotice(timestamp: number, modelId?: string): ChatMessage {
  return {
    id: `assistant-interrupted-${timestamp}`,
    role: 'assistant',
    content: t('chat.stream.interruptedNoticeBody'),
    timestamp,
    modelId,
    displayStyle: 'notice',
    noticeTitle: t('chat.stream.interruptedNoticeTitle'),
    noticeTone: 'warning',
  };
}

export function buildStreamErrorNotice(
  timestamp: number,
  content: string,
  modelId?: string,
  sourceMessageId?: string,
): ChatMessage {
  return {
    id: sourceMessageId ? `assistant-error-notice-${sourceMessageId}` : `assistant-error-notice-${timestamp}`,
    role: 'assistant',
    content,
    timestamp,
    modelId,
    sourceMessageId,
    displayStyle: 'notice',
    noticeTitle: t('chat.notice.streamErrorTitle'),
    noticeTone: 'error',
  };
}

export async function renderPersistedAssistantNotice(options: {
  host: AssistantNoticeRenderHost;
  messageEl: HTMLElement;
  contentEl: HTMLElement;
  noticeMessage: ChatMessage;
}): Promise<void> {
  const {
    host,
    messageEl,
    contentEl,
    noticeMessage,
  } = options;

  await renderAssistantNoticeCardAndFooter({
    host,
    messageEl,
    contentEl,
    noticeMessage,
  });
}

export async function renderAssistantPlaceholderAsNotice(options: {
  host: AssistantNoticeRenderHost;
  messageEl: HTMLElement;
  noticeMessage: ChatMessage;
  reason?: string;
}): Promise<void> {
  const {
    host,
    messageEl,
    noticeMessage,
    reason = 'render-notice',
  } = options;

  messageEl.dataset.messageId = noticeMessage.id;
  if (noticeMessage.sourceMessageId) {
    messageEl.dataset.sourceMessageId = noticeMessage.sourceMessageId;
  } else {
    delete messageEl.dataset.sourceMessageId;
  }
  messageEl.addClass('opencodian-message--assistant');
  messageEl.addClass('opencodian-message--notice');
  messageEl.removeClass('opencodian-message--background-task');
  messageEl.empty();
  host.setStreamingAssistantMessageVisibility(messageEl, true, reason);

  const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
  await renderAssistantNoticeCardAndFooter({
    host,
    messageEl,
    contentEl,
    noticeMessage,
  });
}

async function renderAssistantNoticeCardAndFooter(options: {
  host: AssistantNoticeRenderHost;
  messageEl: HTMLElement;
  contentEl: HTMLElement;
  noticeMessage: ChatMessage;
}): Promise<void> {
  const {
    host,
    messageEl,
    contentEl,
    noticeMessage,
  } = options;

  messageEl.addClass('opencodian-message--notice');
  await host.renderNoticeCard(contentEl, noticeMessage);
  host.finalizeNoticeFooter(messageEl, noticeMessage);
}
