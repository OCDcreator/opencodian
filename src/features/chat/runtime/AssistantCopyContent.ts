import type { ChatMessage, ContentBlock } from '../../../core/types';

export interface AssistantCopyContentSource {
  content: ChatMessage['content'];
  contentBlocks?: ContentBlock[];
}

export function extractAssistantStructuredTextCopyContent(
  contentBlocks?: ContentBlock[],
): string | undefined {
  const textContent = (contentBlocks ?? [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text?.trim())
    .filter(Boolean)
    .join('\n\n');

  return textContent || undefined;
}

export function resolveAssistantCopyContent({
  content,
  contentBlocks,
}: AssistantCopyContentSource): string | undefined {
  if (contentBlocks && contentBlocks.length > 0) {
    return extractAssistantStructuredTextCopyContent(contentBlocks);
  }

  return content || undefined;
}
