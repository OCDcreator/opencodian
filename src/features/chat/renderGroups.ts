import type { ChatMessage, ContentBlock } from '../../core/types';

export interface MessageRenderGroup {
  mergedAssistant: boolean;
  messages: ChatMessage[];
}

function isMergeableAssistantMessage(message: ChatMessage): boolean {
  return message.role === 'assistant' && message.displayStyle !== 'notice';
}

function extractTextContent(message: ChatMessage): string {
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    return message.contentBlocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join('\n\n');
  }

  return message.content?.trim() ?? '';
}

function flattenContentBlocks(messages: ChatMessage[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const message of messages) {
    if (message.contentBlocks && message.contentBlocks.length > 0) {
      blocks.push(...message.contentBlocks);
      continue;
    }

    if (message.content) {
      blocks.push({ type: 'text', text: message.content });
    }
  }

  return blocks;
}

export function buildMessageRenderGroups(messages: ChatMessage[]): MessageRenderGroup[] {
  const groups: MessageRenderGroup[] = [];

  for (const message of messages) {
    const currentGroup = groups[groups.length - 1];

    if (isMergeableAssistantMessage(message) && currentGroup?.mergedAssistant) {
      currentGroup.messages.push(message);
      continue;
    }

    groups.push({
      mergedAssistant: isMergeableAssistantMessage(message),
      messages: [message],
    });
  }

  return groups;
}

export function mergeAssistantMessagesForRender(messages: ChatMessage[]): ChatMessage {
  if (messages.length === 0) {
    throw new Error('mergeAssistantMessagesForRender requires at least one message');
  }

  const lastMessage = messages[messages.length - 1];
  const modelId = [...messages]
    .reverse()
    .find((message) => typeof message.modelId === 'string' && message.modelId.length > 0)
    ?.modelId;
  const content = messages
    .map(extractTextContent)
    .filter((text) => text.length > 0)
    .join('\n\n');
  const contentBlocks = flattenContentBlocks(messages);

  return {
    ...lastMessage,
    id: messages.map((message) => message.id).join('__'),
    content,
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    modelId,
    parts: undefined,
    sourceMessageId: undefined,
  };
}
