import { t } from '../../../i18n';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import { buildInterruptedAssistantNotice } from './AssistantNoticeRenderer';
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
