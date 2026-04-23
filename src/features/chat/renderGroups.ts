import type { ChatMessage, CompactionDividerMeta, ContentBlock } from '../../core/types';

export interface MessageRenderGroup {
  mergedAssistant: boolean;
  messages: ChatMessage[];
}

function isMergeableAssistantMessage(message: ChatMessage): boolean {
  return message.role === 'assistant'
    && message.displayStyle !== 'notice'
    && message.summary !== true;
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
  let lastRenderedText: string | null = null;

  for (const message of messages) {
    if (message.contentBlocks && message.contentBlocks.length > 0) {
      for (const block of message.contentBlocks) {
        if (block.type !== 'text') {
          blocks.push(block);
          lastRenderedText = null;
          continue;
        }

        const normalizedText = block.text?.trim() ?? '';
        if (!normalizedText || normalizedText === lastRenderedText) {
          continue;
        }

        blocks.push(block);
        lastRenderedText = normalizedText;
      }
      continue;
    }

    const normalizedText = message.content?.trim() ?? '';
    if (normalizedText && normalizedText !== lastRenderedText) {
      blocks.push({ type: 'text', text: message.content });
      lastRenderedText = normalizedText;
    }
  }

  return blocks;
}

export interface LiveCompactionDividerInjectionOptions {
  messages: ChatMessage[];
  compactingAt: number | null;
  tabId: string;
}

export function injectLiveCompactionDivider(
  options: LiveCompactionDividerInjectionOptions,
): ChatMessage[] {
  const { messages, compactingAt, tabId } = options;
  if (typeof compactingAt !== 'number') {
    return messages;
  }

  const hasPersistedDividerForPhase = messages.some(
    (message) => message.compactionDivider && !message.compactionDivider.live && message.timestamp >= compactingAt,
  );
  if (hasPersistedDividerForPhase) {
    return messages;
  }

  const liveDivider: ChatMessage = {
    id: `__live-compaction-${tabId}`,
    role: 'user',
    content: '',
    timestamp: compactingAt,
    compactionDivider: {
      auto: true,
      overflow: false,
      tailStartId: '',
      live: true,
    } satisfies CompactionDividerMeta,
  };

  const firstSummaryAfterCompacting = messages.findIndex(
    (message) => message.summary && message.timestamp >= compactingAt,
  );
  if (firstSummaryAfterCompacting >= 0) {
    const result = [...messages];
    result.splice(firstSummaryAfterCompacting, 0, liveDivider);
    return result;
  }

  return [...messages, liveDivider];
}

export function tagCompactionSummaries(messages: ChatMessage[]): ChatMessage[] {
  let afterCompactionDivider = false;
  return messages.map((message) => {
    if (message.compactionDivider) {
      afterCompactionDivider = true;
      return message;
    }

    if (afterCompactionDivider && message.summary && !message.summaryKind) {
      return { ...message, summaryKind: 'compaction' as const };
    }

    if (message.role === 'user' && !message.compactionDivider) {
      afterCompactionDivider = false;
    }

    return message;
  });
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
    .filter((text, index, texts) => index === 0 || text !== texts[index - 1])
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
