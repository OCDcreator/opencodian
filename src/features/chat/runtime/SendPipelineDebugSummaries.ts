import type { ChatMessage, StreamChunk as CoreStreamChunk } from '../../../core/types';
import type { StreamChunk as StreamingChunk } from '../../../utils/streaming';
import type { SendPipelineDebugContentBlock } from './SendPipelineTypes';

function getLogPreview(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function stringifyLogPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable]';
  }
}

export function summarizeContentBlocksForDebug(
  blocks: SendPipelineDebugContentBlock[] | undefined,
): {
  count: number;
  types: string[];
  textLength: number;
  toolCount: number;
  thinkingCount: number;
} {
  if (!blocks || blocks.length === 0) {
    return {
      count: 0,
      types: [],
      textLength: 0,
      toolCount: 0,
      thinkingCount: 0,
    };
  }

  let textLength = 0;
  let toolCount = 0;
  let thinkingCount = 0;

  for (const block of blocks) {
    const type = block.type ?? 'unknown';
    if (type === 'text') {
      const text = typeof block.text === 'string'
        ? block.text
        : typeof block.content === 'string'
          ? block.content
          : '';
      textLength += text.length;
    } else if (type === 'tool_use' || type === 'tool_call' || block.toolCall) {
      toolCount += 1;
    } else if (type === 'thinking') {
      thinkingCount += 1;
    }
  }

  return {
    count: blocks.length,
    types: blocks.map((block) => block.type ?? 'unknown'),
    textLength,
    toolCount,
    thinkingCount,
  };
}

export function summarizeChatMessageForDebug(
  message: ChatMessage | null | undefined,
): Record<string, unknown> | null {
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    sourceMessageId: message.sourceMessageId ?? null,
    role: message.role,
    timestamp: message.timestamp,
    modelId: message.modelId ?? null,
    streamState: message.streamState ?? null,
    displayStyle: message.displayStyle ?? 'default',
    contentLength: message.content.length,
    contentPreview: getLogPreview(message.content, 120),
    contentBlocks: summarizeContentBlocksForDebug(message.contentBlocks),
    toolCallsCount: message.toolCalls?.length ?? 0,
    structuredPresent: message.structured !== undefined,
    partsCount: message.parts?.length ?? 0,
    questionResolution: message.questionResolution
      ? {
          requestId: message.questionResolution.request.id,
          status: message.questionResolution.status,
        }
      : null,
    omoKind: message.omo?.kind ?? null,
  };
}

// eslint-disable-next-line complexity -- The debug summarizer is deliberately exhaustive over the core stream union.
export function summarizeCoreStreamChunkForDebug(
  chunk: CoreStreamChunk,
): Record<string, unknown> {
  switch (chunk.type) {
    case 'text':
      return {
        type: chunk.type,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
      };
    case 'thinking':
      return {
        type: chunk.type,
        partId: chunk.partId ?? null,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
        durationSeconds: chunk.durationSeconds ?? null,
      };
    case 'tool_use':
      return {
        type: chunk.type,
        id: chunk.id,
        name: chunk.name,
        inputKeys: Object.keys(chunk.input ?? {}),
      };
    case 'tool_result':
      return {
        type: chunk.type,
        toolUseId: chunk.toolUseId,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
        isError: chunk.isError ?? false,
      };
    case 'usage':
      return {
        type: chunk.type,
        inputTokens: chunk.inputTokens,
        outputTokens: chunk.outputTokens,
        sessionId: chunk.sessionId ?? null,
      };
    case 'backend_event':
      return {
        type: chunk.type,
        source: chunk.source,
        event: chunk.event,
        status: chunk.status ?? null,
        id: chunk.id ?? null,
        name: chunk.name ?? null,
        contentLength: chunk.content?.length ?? 0,
        metadataKeys: Object.keys(chunk.metadata ?? {}),
      };
    case 'message_metadata':
      return {
        type: chunk.type,
        messageId: chunk.messageId,
        timestamp: chunk.timestamp,
        modelId: chunk.modelId ?? null,
      };
    case 'file_edited':
      return {
        type: chunk.type,
        file: chunk.file,
      };
    case 'permission_request':
      return {
        type: chunk.type,
        id: chunk.id,
        permission: chunk.permission,
        patternCount: chunk.patterns.length,
      };
    case 'question_request':
      return {
        type: chunk.type,
        requestId: chunk.request.id,
        questionCount: chunk.request.questions.length,
      };
    case 'error':
      return {
        type: chunk.type,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
      };
    case 'user_message_identity':
      return {
        type: chunk.type,
        uuid: chunk.uuid,
        sessionId: chunk.sessionId ?? null,
      };
    default:
      return { type: chunk.type };
  }
}

export function summarizeRenderedStreamChunkForDebug(
  chunk: StreamingChunk,
): Record<string, unknown> {
  switch (chunk.type) {
    case 'text':
      return {
        type: chunk.type,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
      };
    case 'thinking':
      return {
        type: chunk.type,
        partId: chunk.partId ?? null,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
        durationSeconds: chunk.durationSeconds ?? null,
      };
    case 'tool_use':
      return {
        type: chunk.type,
        id: chunk.id,
        name: chunk.name,
        inputKeys: Object.keys(chunk.input ?? {}),
      };
    case 'tool_result':
      return {
        type: chunk.type,
        id: chunk.id,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
        isError: chunk.isError ?? false,
      };
    case 'error':
      return {
        type: chunk.type,
        length: chunk.content.length,
        preview: getLogPreview(chunk.content, 120),
      };
    case 'done':
      return { type: chunk.type };
    default:
      return { type: 'unknown' };
  }
}

export { getLogPreview, stringifyLogPayload };
