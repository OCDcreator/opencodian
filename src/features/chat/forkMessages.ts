import type { ChatMessage } from '../../core/types';

export function cloneMessagesBeforeForkTarget(
  messages: ChatMessage[],
  targetMessage: Pick<ChatMessage, 'id' | 'sourceMessageId'>,
): ChatMessage[] {
  const targetIndex = messages.findIndex((message) =>
    message.id === targetMessage.id
    || (
      Boolean(targetMessage.sourceMessageId)
      && message.sourceMessageId === targetMessage.sourceMessageId
    ),
  );

  const slicedMessages = targetIndex >= 0
    ? messages.slice(0, targetIndex)
    : messages;

  return JSON.parse(JSON.stringify(slicedMessages)) as ChatMessage[];
}
