import { t } from '../../../i18n';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import { buildInterruptedAssistantNotice } from './AssistantNoticeRenderer';
import { isDuplicateStructuredOutputText } from './sendPipelineContent';
import type {
  LocalStreamOutcome,
  StreamShellFinalizerHost,
} from './SendPipelineTypes';

export async function finalizeStreamingShell(options: {
  host: StreamShellFinalizerHost;
  preparedSend: PreparedMessageSend;
  outcome: LocalStreamOutcome;
}): Promise<string> {
  const { host, outcome } = options;
  const messageEl = outcome.finalizedStreamingMessageEl;
  if (!messageEl) {
    return 'removed';
  }

  if (outcome.hasStreamContentBlocks) {
    host.addTimestampWithCopyButton({
      messageEl,
      timestamp: outcome.finalizedTimestamp,
      content: outcome.streamedTextContent.trim() || undefined,
      modelId: outcome.finalizedModelId,
      statusLabel: outcome.shouldPersistInterruptedState ? t('chat.stream.interruptedBadge') : undefined,
    });
    host.renderStructuredOutputIfPresent(messageEl, outcome.structuredOutput);
    suppressDuplicateStructuredOutputTextInDom(messageEl, outcome.structuredOutput);
    return 'timestamp-added';
  }

  if (outcome.streamErrorNoticeMessage) {
    await host.renderAssistantPlaceholderAsNotice(
      messageEl,
      outcome.streamErrorNoticeMessage,
      'render-stream-error-notice',
    );
    return 'error-notice-rendered';
  }

  if (outcome.shouldPersistInterruptedState) {
    outcome.interruptedNoticeMessage = buildInterruptedAssistantNotice(
      outcome.finalizedTimestamp,
      outcome.finalizedModelId,
    );
    await host.renderAssistantPlaceholderAsNotice(
      messageEl,
      outcome.interruptedNoticeMessage,
      'render-interrupted-notice',
    );
    return 'interrupted-notice-rendered';
  }

  messageEl.remove();
  return 'removed';
}

/**
 * When structured output is present, the model sometimes emits the raw JSON
 * as visible text immediately before the StructuredOutput tool call.  This
 * removes the last `.streaming-text-block` element from the DOM if its text
 * content matches the structured-output payload, so the user sees the
 * structured-output badge instead of duplicate raw JSON.
 */
function suppressDuplicateStructuredOutputTextInDom(
  messageEl: HTMLElement,
  structuredOutput: unknown,
): void {
  if (structuredOutput === undefined) {
    return;
  }

  const contentEl = messageEl.querySelector('.opencodian-message-content') as HTMLElement | null;
  if (!contentEl) {
    return;
  }

  const textBlocks = contentEl.querySelectorAll('.streaming-text-block');
  if (textBlocks.length === 0) {
    return;
  }

  const lastTextBlock = textBlocks[textBlocks.length - 1];
  const textContent = lastTextBlock.textContent?.trim() ?? '';

  if (isDuplicateStructuredOutputText(textContent, structuredOutput)) {
    lastTextBlock.remove();
  }
}
