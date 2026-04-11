import type { ContentBlock } from '../../../core/types';
import type {
  ContentBlock as StreamingContentBlock,
  StreamChunk as StreamingChunk,
} from '../../../utils/streaming';

export function mapStreamingContentBlocksToMessageContentBlocks(
  blocks: StreamingContentBlock[],
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.content };
    }

    if (block.type === 'thinking') {
      return {
        type: 'thinking',
        thinking: block.content,
        durationSeconds: block.durationSeconds,
      };
    }

    return {
      type: 'tool_use',
      toolId: block.toolCall.id,
      toolName: block.toolCall.name,
      toolKind: block.toolCall.kind,
      toolInput: block.toolCall.input,
      toolStatus: block.toolCall.status,
      toolResult: block.toolCall.result,
    };
  });
}

export function getStreamedTextContent(blocks: StreamingContentBlock[] | undefined): string {
  return blocks
    ?.filter((block): block is Extract<StreamingContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.content)
    .join('') ?? '';
}

export function hasVisibleStreamingContent(chunk: StreamingChunk): boolean {
  return Boolean(
    (chunk.type === 'text' && chunk.content.trim())
      || (chunk.type === 'thinking' && chunk.content.trim())
      || chunk.type === 'tool_use',
  );
}
