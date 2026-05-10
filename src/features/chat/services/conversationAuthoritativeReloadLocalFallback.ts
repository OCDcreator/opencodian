import type { OpenCodeSessionMessageWithParts } from '../../../core/opencode';
import type { ChatMessage } from '../../../core/types';

function isInterruptedNoticeMessage(message: ChatMessage): boolean {
  return message.role === 'assistant'
    && message.displayStyle === 'notice'
    && message.noticeTone === 'warning'
    && !message.sourceMessageId
    && message.id.startsWith('assistant-interrupted-');
}

function findLatestInterruptedNotice(messages: ChatMessage[]): ChatMessage | null {
  return [...messages].reverse().find((message) => isInterruptedNoticeMessage(message)) ?? null;
}

function findLatestUserBeforeTimestamp(messages: ChatMessage[], timestamp: number): ChatMessage | null {
  return [...messages].reverse().find((message) => message.role === 'user' && message.timestamp <= timestamp) ?? null;
}

function getCanonicalMessageParentId(
  message: OpenCodeSessionMessageWithParts['info'],
): string | null {
  const parentID = (message as OpenCodeSessionMessageWithParts['info'] & { parentID?: unknown }).parentID;
  return typeof parentID === 'string' && parentID.trim() ? parentID : null;
}

export function shouldBypassCanonicalSyncForInterruptedNotice(
  existingMessages: ChatMessage[],
  canonicalMessages: OpenCodeSessionMessageWithParts[],
): boolean {
  const latestInterruptedNotice = findLatestInterruptedNotice(existingMessages);
  if (!latestInterruptedNotice) {
    return false;
  }

  const latestUser = findLatestUserBeforeTimestamp(existingMessages, latestInterruptedNotice.timestamp);
  if (!latestUser) {
    return false;
  }

  const latestUserSourceId = latestUser.sourceMessageId ?? latestUser.id;
  return !canonicalMessages.some(({ info }) =>
    info.role === 'assistant' && getCanonicalMessageParentId(info) === latestUserSourceId
  );
}

export function shouldPreserveInterruptedNoticeOnSync(
  existingMessages: ChatMessage[],
  _syncedMessages: ChatMessage[],
  message: ChatMessage,
): boolean {
  if (!isInterruptedNoticeMessage(message)) {
    return false;
  }

  const latestInterruptedNotice = findLatestInterruptedNotice(existingMessages);
  if (!latestInterruptedNotice) {
    return false;
  }

  return message.id === latestInterruptedNotice.id;
}
