import { t } from '../../../i18n';
import type { ChatMessage } from '../../../core/types';
import { resolveAssistantCopyContent } from './AssistantCopyContent';
import type { AssistantShellTimestampOptions } from './AssistantShellRenderer';

export type AssistantFooterPayload = Omit<AssistantShellTimestampOptions, 'messageEl'>;

export interface PersistedAssistantFooterPayloadOptions {
  message: ChatMessage;
}

export function resolvePersistedAssistantFooterStatusLabel(message: ChatMessage): string | undefined {
  if (message.streamState === 'interrupted') {
    return t('chat.stream.interruptedBadge');
  }

  return undefined;
}

export function buildPersistedAssistantFooterPayload({
  message,
}: PersistedAssistantFooterPayloadOptions): AssistantFooterPayload {
  return {
    timestamp: message.timestamp,
    content: resolveAssistantCopyContent(message),
    modelId: message.modelId,
    statusLabel: resolvePersistedAssistantFooterStatusLabel(message),
  };
}
