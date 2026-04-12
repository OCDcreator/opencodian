import { t } from '../../../i18n';
import type { ChatMessage } from '../../../core/types';
import { resolveAssistantCopyContent } from './AssistantCopyContent';
import type { AssistantShellTimestampOptions } from './AssistantShellRenderer';

export type AssistantFooterPayload = Omit<AssistantShellTimestampOptions, 'messageEl'>;

export interface PersistedAssistantFooterPayloadOptions {
  message: ChatMessage;
}

export interface AssistantNoticeFooterPayloadOptions {
  message: Pick<ChatMessage, 'timestamp' | 'modelId'>;
}

export interface AssistantPseudoStreamFooterPayloadOptions {
  message: Pick<ChatMessage, 'content' | 'timestamp' | 'modelId'>;
}

export interface AssistantErrorFooterPayloadOptions {
  timestamp: number;
  content: string;
  modelId?: string;
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

export function buildNoticeAssistantFooterPayload({
  message,
}: AssistantNoticeFooterPayloadOptions): AssistantFooterPayload {
  return {
    timestamp: message.timestamp,
    modelId: message.modelId,
  };
}

export function buildPseudoStreamAssistantFooterPayload({
  message,
}: AssistantPseudoStreamFooterPayloadOptions): AssistantFooterPayload {
  return {
    timestamp: message.timestamp,
    content: message.content,
    modelId: message.modelId,
  };
}

export function buildErrorAssistantFooterPayload({
  timestamp,
  content,
  modelId,
}: AssistantErrorFooterPayloadOptions): AssistantFooterPayload {
  return {
    timestamp,
    content,
    modelId,
  };
}
