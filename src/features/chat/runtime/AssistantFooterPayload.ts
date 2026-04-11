import type { ChatMessage } from '../../../core/types';
import { resolveAssistantCopyContent } from './AssistantCopyContent';
import type { AssistantShellTimestampOptions } from './AssistantShellRenderer';

export type AssistantFooterPayload = Omit<AssistantShellTimestampOptions, 'messageEl'>;

export interface PersistedAssistantFooterPayloadOptions {
  message: ChatMessage;
  statusLabel?: string;
}

export function buildPersistedAssistantFooterPayload({
  message,
  statusLabel,
}: PersistedAssistantFooterPayloadOptions): AssistantFooterPayload {
  return {
    timestamp: message.timestamp,
    content: resolveAssistantCopyContent(message),
    modelId: message.modelId,
    statusLabel,
  };
}
