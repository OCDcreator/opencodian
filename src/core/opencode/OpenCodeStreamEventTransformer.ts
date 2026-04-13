import {
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
  resolveToolResultText,
  type ToolIdentityKind,
} from '../../shared';
import type {
  QuestionRequest as ChatQuestionRequest,
  StreamChunk,
} from '../types';
import { OpenCodeStreamingRuntimeContext } from './OpenCodeStreamingRuntimeCoordinator';

export interface OpenCodeStreamEventTransformerHost {
  observeRuntimeToolNames(toolNames: Iterable<string>): boolean;
  getOpenCodeToolKind(toolName: string | undefined | null): ToolIdentityKind;
  normalizeQuestionRequest(raw: unknown): ChatQuestionRequest | null;
  logStreamingDebug(label: string, payload: unknown): void;
}

export interface OpenCodeSSEEvent {
  event: string;
  data: string;
}

interface OpenCodeToolStateData {
  status: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface OpenCodeStreamPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  duration?: number;
  time?: {
    start?: number;
    end?: number;
  };
  callID?: string;
  tool?: string;
  state?: OpenCodeToolStateData;
  [key: string]: unknown;
}

export interface OpenCodeStreamEvent {
  type: string;
  properties?: {
    sessionID?: string;
    messageID?: string;
    id?: string;
    permission?: string;
    patterns?: string[];
    metadata?: Record<string, unknown>;
    part?: OpenCodeStreamPart;
    parts?: OpenCodeStreamPart[];
    delta?: string;
    field?: string;
    partID?: string;
    toolID?: string;
    result?: string;
    error?: unknown;
    usage?: {
      input?: number;
      output?: number;
    };
    file?: string;
    text?: string;
    questions?: Array<{
      question?: string;
      header?: string;
      options?: Array<{ label?: string; description?: string }>;
      multiple?: boolean;
      custom?: boolean;
    }>;
  };
}

export interface OpenCodeStreamingTextDeltaDebugState {
  sequence: number;
  source: 'event' | 'finalize';
  partId: string | null;
  partType: string;
  length: number;
  totalLength: number;
  preview: string;
}

export interface OpenCodeStreamEventState {
  lastContent: string;
  lastErrorMessage: string | null;
  processedToolIds: Set<string>;
  toolInputSnapshots: Map<string, string>;
  debugChunkSequence: number;
  lastTextDelta: OpenCodeStreamingTextDeltaDebugState | null;
}

export type OpenCodeStreamPartTypeState = OpenCodeStreamingRuntimeContext | {
  partTypeMap?: Map<string, string>;
};

function resolveReasoningDurationSeconds(
  part: Pick<OpenCodeStreamPart, 'duration' | 'time'>,
): number | undefined {
  const start = part.time?.start;
  const end = part.time?.end;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return Math.max(0, end - start) / 1000;
  }

  if (typeof part.duration === 'number' && part.duration > 0) {
    return part.duration;
  }

  return undefined;
}

function getDebugTextPreview(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function extractStructuredErrorName(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as { name?: unknown };
  return typeof errorRecord.name === 'string' && errorRecord.name.trim()
    ? errorRecord.name.trim()
    : null;
}

function extractStructuredErrorMessage(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as {
    message?: unknown;
    data?: {
      message?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
    };
    name?: unknown;
  };

  const baseMessage = typeof errorRecord.data?.message === 'string' && errorRecord.data.message.trim()
    ? errorRecord.data.message.trim()
    : typeof errorRecord.message === 'string' && errorRecord.message.trim()
      ? errorRecord.message.trim()
      : typeof errorRecord.name === 'string' && errorRecord.name.trim()
        ? errorRecord.name.trim()
        : null;

  if (!baseMessage) {
    return null;
  }

  const statusCode = typeof errorRecord.data?.statusCode === 'number'
    ? errorRecord.data.statusCode
    : null;

  if (statusCode === null || baseMessage.toLowerCase().includes(`http ${statusCode}`)) {
    return baseMessage;
  }

  return `${baseMessage} (HTTP ${statusCode})`;
}

export class OpenCodeStreamEventTransformer {
  constructor(private readonly host: OpenCodeStreamEventTransformerHost) {}

  handleStreamingEvent(
    eventData: OpenCodeStreamEvent,
    sessionId: string,
    state: OpenCodeStreamEventState,
    streamContext: OpenCodeStreamPartTypeState,
  ): { chunks: StreamChunk[]; stop: boolean } {
    if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
      return { chunks: [], stop: false };
    }

    const partSessionId = eventData.properties?.part?.sessionID;
    if (partSessionId && partSessionId !== sessionId) {
      return { chunks: [], stop: false };
    }

    const chunks: StreamChunk[] = [];

    if (eventData.properties?.usage) {
      chunks.push({
        type: 'usage',
        inputTokens: eventData.properties.usage.input ?? 0,
        outputTokens: eventData.properties.usage.output ?? 0,
        sessionId,
      });
    }

    if (eventData.type === 'message.part.updated') {
      const part = eventData.properties?.part;
      if (part?.id && part?.type) {
        this.setStreamPartType(streamContext, part.id, part.type);

        if (part.type === 'tool') {
          const toolPart = part;
          const toolId = toolPart.callID || toolPart.id;
          const toolName = toolPart.tool || 'unknown';
          if (isInternalStructuredOutputTool(toolName)) {
            return { chunks, stop: false };
          }

          this.host.observeRuntimeToolNames([toolName]);

          if (toolId) {
            const toolKind = this.host.getOpenCodeToolKind(toolName);
            const toolInput = toolPart.state?.input || {};
            const nextSnapshot = this.getToolInputSnapshot(toolInput);
            const previousSnapshot = state.toolInputSnapshots.get(toolId);
            const shouldEmitToolUse =
              !state.processedToolIds.has(toolId)
              || nextSnapshot !== previousSnapshot;

            if (shouldEmitToolUse) {
              state.processedToolIds.add(toolId);
              state.toolInputSnapshots.set(toolId, nextSnapshot);
              chunks.push({
                type: 'tool_use',
                id: toolId,
                name: toolName,
                kind: toolKind,
                input: toolInput,
              });
            }

            const toolStatus = resolveToolExecutionStatus({
              toolName,
              state: toolPart.state,
            });
            const toolResult = resolveToolResultText(toolPart.state);
            if ((toolStatus === 'completed' || toolStatus === 'error') && toolResult !== undefined) {
              const resultKey = `${toolId}_result`;
              if (!state.processedToolIds.has(resultKey)) {
                state.processedToolIds.add(resultKey);
                chunks.push({
                  type: 'tool_result',
                  toolUseId: toolId,
                  content: toolResult,
                  isError: toolStatus === 'error',
                });
              }
            }
          }
        }

        if (part.type === 'reasoning' || part.type === 'thinking') {
          const durationSeconds = resolveReasoningDurationSeconds(part);
          if (durationSeconds !== undefined) {
            chunks.push({
              type: 'thinking',
              content: '',
              partId: part.id,
              durationSeconds,
            });
          }
        }
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'message.part.delta') {
      const delta = eventData.properties?.delta;
      const field = eventData.properties?.field;
      const partID = eventData.properties?.partID;

      if (!delta || !field) {
        return { chunks, stop: false };
      }

      if (partID && !this.hasStreamPartType(streamContext, partID)) {
        const partType = eventData.properties?.part?.type;
        this.setStreamPartType(streamContext, partID, partType || 'text');
      }

      const partType = partID ? (this.getStreamPartType(streamContext, partID) || 'text') : 'text';

      if (field === 'text') {
        if (partType === 'reasoning' || partType === 'thinking') {
          chunks.push({ type: 'thinking', content: delta, partId: partID });
        } else {
          chunks.push({ type: 'text', content: delta });
          state.lastContent += delta;
          state.debugChunkSequence += 1;
          state.lastTextDelta = {
            sequence: state.debugChunkSequence,
            source: 'event',
            partId: partID ?? null,
            partType,
            length: delta.length,
            totalLength: state.lastContent.length,
            preview: getDebugTextPreview(delta, 120),
          };
          this.host.logStreamingDebug('service-text-delta', {
            sessionId,
            chunkSequence: state.debugChunkSequence,
            partId: partID ?? null,
            partType,
            deltaLength: delta.length,
            totalLength: state.lastContent.length,
            deltaPreview: getDebugTextPreview(delta, 120),
          });
        }
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'permission.asked') {
      const permission = eventData.properties;
      if (permission?.id) {
        chunks.push({
          type: 'permission_request',
          id: permission.id,
          permission: permission.permission || 'unknown',
          patterns: permission.patterns || [],
          metadata: permission.metadata || {},
        });
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'file.edited') {
      const file = eventData.properties?.file;
      if (typeof file === 'string' && file.trim()) {
        chunks.push({ type: 'file_edited', file: file.trim() });
      }

      return { chunks, stop: false };
    }

    if (eventData.type === 'session.error') {
      const errorName = extractStructuredErrorName(eventData.properties?.error);
      const errorMessage = extractStructuredErrorMessage(eventData.properties?.error) ?? 'Unknown error';
      state.lastErrorMessage = errorMessage;
      this.host.logStreamingDebug('service-session-error', {
        sessionId,
        errorName,
        errorMessage,
      });
      if (errorName === 'MessageAbortedError') {
        return { chunks, stop: true };
      }

      chunks.push({
        type: 'error',
        content: errorMessage,
      });
      return { chunks, stop: true };
    }

    if (eventData.type === 'session.idle') {
      this.host.logStreamingDebug('service-session-idle', {
        sessionId,
        accumulatedTextLength: state.lastContent.length,
        lastTextDelta: state.lastTextDelta,
      });
      return { chunks, stop: true };
    }

    if (eventData.type === 'question.asked') {
      const request = this.host.normalizeQuestionRequest(eventData.properties);
      if (request) {
        chunks.push({
          type: 'question_request',
          request,
        });
      }

      return { chunks, stop: false };
    }

    return { chunks, stop: false };
  }

  parseSSEEvents(buffer: string): { events: OpenCodeSSEEvent[]; remaining: string } {
    const events: OpenCodeSSEEvent[] = [];
    const lines = buffer.split('\n');
    let currentEvent: Partial<OpenCodeSSEEvent> = {};
    let remaining = '';

    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline === -1 || lastDoubleNewline !== buffer.length - 2) {
      remaining = lines.pop() || '';
    }

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data = line.slice(5).trim();
      } else if (line === '') {
        if (currentEvent.data !== undefined) {
          if (!currentEvent.event) {
            try {
              const parsed = JSON.parse(currentEvent.data) as { type?: string };
              currentEvent.event = parsed.type || 'unknown';
            } catch {
              currentEvent.event = 'unknown';
            }
          }
          events.push(currentEvent as OpenCodeSSEEvent);
        }
        currentEvent = {};
      }
    }

    return { events, remaining };
  }

  transformEventToChunks(event: unknown): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    if (typeof event !== 'object' || event === null) {
      return chunks;
    }

    const evt = event as { type?: string; properties?: Record<string, unknown> };
    const props = evt.properties;

    if (!props) {
      return chunks;
    }

    if (props.parts && Array.isArray(props.parts)) {
      for (const part of props.parts) {
        const partChunks = this.transformPartToChunks(part as OpenCodeStreamPart);
        chunks.push(...partChunks);
      }
    }

    if (props.part) {
      const partChunks = this.transformPartToChunks(props.part as OpenCodeStreamPart);
      chunks.push(...partChunks);
    }

    if (props.text && typeof props.text === 'string') {
      chunks.push({ type: 'text', content: props.text });
    }

    if (props.usage && typeof props.usage === 'object') {
      const usage = props.usage as { input?: number; output?: number };
      chunks.push({
        type: 'usage',
        inputTokens: usage.input ?? 0,
        outputTokens: usage.output ?? 0,
      });
    }

    return chunks;
  }

  transformPartToChunks(part: OpenCodeStreamPart): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    switch (part.type) {
      case 'text': {
        if (part.text) {
          chunks.push({ type: 'text', content: part.text });
        }
        break;
      }
      case 'reasoning': {
        if (part.text) {
          chunks.push({
            type: 'thinking',
            content: part.text,
            partId: part.id,
            durationSeconds: resolveReasoningDurationSeconds(part),
          });
        }
        break;
      }
      case 'tool': {
        if (isInternalStructuredOutputTool(part.tool)) {
          break;
        }

        if (part.state) {
          const toolStatus = resolveToolExecutionStatus({
            toolName: part.tool,
            state: part.state,
          });
          const toolName = part.tool ?? '';
          if (toolStatus === 'pending' || toolStatus === 'running') {
            chunks.push({
              type: 'tool_use',
              id: part.callID ?? '',
              name: toolName,
              kind: this.host.getOpenCodeToolKind(toolName),
              input: part.state.input ?? {},
            });
          } else if (toolStatus === 'completed' || toolStatus === 'error') {
            const result = resolveToolResultText(part.state)
              ?? (toolStatus === 'error' ? 'Error: Tool execution failed' : '');
            chunks.push({
              type: 'tool_result',
              toolUseId: part.callID ?? '',
              content: result,
              isError: toolStatus === 'error',
            });
          }
        }
        break;
      }
    }

    return chunks;
  }

  private getToolInputSnapshot(input: Record<string, unknown> | undefined): string {
    if (!input || Object.keys(input).length === 0) {
      return '';
    }

    try {
      return JSON.stringify(input);
    } catch {
      return '[unserializable-tool-input]';
    }
  }

  private setStreamPartType(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
    partType: string,
  ): void {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      streamContext.setPartType(partId, partType);
      return;
    }

    if (!partId || !partType) {
      return;
    }

    streamContext.partTypeMap?.set(partId, partType);
  }

  private hasStreamPartType(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
  ): boolean {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.hasPartType(partId);
    }

    return streamContext.partTypeMap?.has(partId) ?? false;
  }

  private getStreamPartType(
    streamContext: OpenCodeStreamPartTypeState,
    partId: string,
  ): string | undefined {
    if (streamContext instanceof OpenCodeStreamingRuntimeContext) {
      return streamContext.getPartType(partId);
    }

    return streamContext.partTypeMap?.get(partId);
  }
}
