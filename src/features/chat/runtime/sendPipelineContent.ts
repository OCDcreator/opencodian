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
 *
 * Codex emits the whole JSON object directly (whole-object pattern),
 * so when there is no `response` string field we fall back to
 * `JSON.stringify(structuredOutput)`.
 */
export function extractStructuredOutputDuplicateText(structuredOutput: unknown): string | null {
  if (!structuredOutput || typeof structuredOutput !== 'object') {
    return null;
  }
  const so = structuredOutput as Record<string, unknown>;
  const response = so['response'];
  if (typeof response === 'string') {
    try {
      const parsed = JSON.parse(response);
      return JSON.stringify(parsed);
    } catch {
      return response;
    }
  }

  // Codex / whole-object pattern: the entire object is the structured output
  if (!('response' in so)) {
    return JSON.stringify(structuredOutput);
  }

  return null;
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
 * Remove any text block that duplicates the structured-output payload.
 * The model may emit raw JSON as visible text at any point before the
 * StructuredOutput tool call, sometimes interleaving thinking blocks or
 * follow-up prose, so we scan all text blocks rather than only the last.
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

  return blocks.filter((block) => {
    if (block.type !== 'text') {
      return true;
    }
    return !isDuplicateStructuredOutputText(block.content, structuredOutput);
  });
}

/**
 * Hydration-time variant: works on persisted {@link ContentBlock} arrays
 * instead of live streaming blocks.  Used when a conversation is reloaded
 * and assistant messages are reconstructed from storage.
 */
export function filterDuplicateStructuredOutputContentBlocks(
  blocks: ContentBlock[] | undefined,
  structuredOutput: unknown,
): ContentBlock[] | undefined {
  if (!blocks || blocks.length === 0) {
    return blocks;
  }

  const candidate = extractStructuredOutputDuplicateText(structuredOutput);
  if (!candidate) {
    return blocks;
  }

  return blocks.filter((block) => {
    if (block.type !== 'text' || !block.text) {
      return true;
    }
    return !isDuplicateStructuredOutputText(block.text, structuredOutput);
  });
}
