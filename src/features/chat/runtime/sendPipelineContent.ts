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
      toolMetadata: block.toolCall.toolMetadata,
      toolStatus: block.toolCall.status,
      toolResult: block.toolCall.result,
      toolResultVisibility: block.toolCall.resultVisibility,
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

/**
 * Extract the raw inner text from a structured-output payload that is likely
 * to appear as duplicate visible text before the StructuredOutput tool call.
 *
 * For the fixed `/json` schema the payload shape is:
 *   { response: string }
 * where `response` is itself a JSON-stringified value.
 * We parse that string and re-stringify it so formatting differences
 * (e.g. spaces) are normalised for comparison.
 */
export function extractStructuredOutputDuplicateText(structuredOutput: unknown): string | null {
  if (!structuredOutput || typeof structuredOutput !== 'object') {
    return null;
  }
  const so = structuredOutput as Record<string, unknown>;
  const response = so['response'];
  if (typeof response !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(response);
    return JSON.stringify(parsed);
  } catch {
    return response;
  }
}

/**
 * Check whether a raw text chunk contains content that duplicates the
 * structured-output payload.
 */
export function isDuplicateStructuredOutputText(
  rawText: string,
  structuredOutput: unknown,
): boolean {
  const candidate = extractStructuredOutputDuplicateText(structuredOutput);
  if (!candidate) {
    return false;
  }

  const trimmed = rawText.trim();
  if (trimmed === candidate.trim()) {
    return true;
  }

  // JSON-aware comparison normalises formatting differences.
  try {
    const rawParsed = JSON.parse(trimmed);
    const candidateParsed = JSON.parse(candidate.trim());
    return JSON.stringify(rawParsed) === JSON.stringify(candidateParsed);
  } catch {
    return false;
  }
}

/**
 * Remove the last text block if it is an exact duplicate of the structured
 * output inner content.  Only the last text block is considered because the
 * model typically emits the raw JSON immediately before the StructuredOutput
 * tool call.
 */
export function filterDuplicateStructuredOutputTextBlocks(
  blocks: StreamingContentBlock[] | undefined,
  structuredOutput: unknown,
): StreamingContentBlock[] | undefined {
  if (!blocks || blocks.length === 0) {
    return blocks;
  }

  const candidate = extractStructuredOutputDuplicateText(structuredOutput);
  if (!candidate) {
    return blocks;
  }

  const lastTextBlockIndex = blocks.findLastIndex(
    (block): block is Extract<StreamingContentBlock, { type: 'text' }> => block.type === 'text',
  );
  if (lastTextBlockIndex === -1) {
    return blocks;
  }

  const lastTextBlock = blocks[lastTextBlockIndex];
  if (
    lastTextBlock.type === 'text'
    && isDuplicateStructuredOutputText(lastTextBlock.content, structuredOutput)
  ) {
    return blocks.filter((_, index) => index !== lastTextBlockIndex);
  }

  return blocks;
}
