import { getToolIdentity } from '../../../shared';
import type { StreamChunk } from '../../types';

type JsonRecord = Record<string, unknown>;
type StreamToolKind = Extract<StreamChunk, { type: 'tool_use' }>['kind'];

export interface ClaudeCodeStreamNormalizerOptions {
  sessionId?: string;
}

interface ClaudeCodeStreamNormalizerState {
  sessionId?: string;
  textLengths: Map<string, number>;
  thinkingLengths: Map<string, number>;
  emittedToolUses: Set<string>;
  emittedToolResults: Set<string>;
}

interface AppendToolUseChunkContext {
  record: JsonRecord;
  block: JsonRecord;
  index: number;
  chunks: StreamChunk[];
  sessionId: string | undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  const trimmed = readString(value)?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readUsage(record: JsonRecord): JsonRecord | null {
  return readRecord(record.usage)
    ?? readRecord(record.total_usage)
    ?? readRecord(readRecord(record.message)?.usage);
}

function readInputTokenCount(usage: JsonRecord): number {
  return readNumber(usage.input_tokens)
    ?? readNumber(usage.inputTokens)
    ?? readNumber(usage.input)
    ?? 0;
}

function readOutputTokenCount(usage: JsonRecord): number {
  const output = readNumber(usage.output_tokens)
    ?? readNumber(usage.outputTokens)
    ?? readNumber(usage.output)
    ?? 0;
  const thinking = readNumber(usage.reasoning_tokens)
    ?? readNumber(usage.reasoningTokens)
    ?? 0;
  return output + thinking;
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        const record = readRecord(item);
        if (!record) {
          return '';
        }
        return readString(record.text)
          ?? readString(record.content)
          ?? JSON.stringify(record);
      })
      .filter(Boolean)
      .join('\n');
  }
  if (value === undefined || value === null) {
    return '';
  }
  if (isRecord(value)) {
    return readString(value.text)
      ?? readString(value.content)
      ?? JSON.stringify(value);
  }
  return String(value);
}

function normalizeToolInput(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function resolveMessageRecord(record: JsonRecord): JsonRecord {
  return readRecord(record.message) ?? record;
}

function resolveContentBlocks(record: JsonRecord): unknown[] {
  const message = resolveMessageRecord(record);
  return readArray(message.content);
}

function resolveSessionId(record: JsonRecord): string | undefined {
  return readNonEmptyString(record.session_id)
    ?? readNonEmptyString(record.sessionId)
    ?? readNonEmptyString(readRecord(record.message)?.session_id)
    ?? readNonEmptyString(readRecord(record.message)?.sessionId);
}

function resolveMessageId(record: JsonRecord): string {
  const message = resolveMessageRecord(record);
  return readNonEmptyString(message.id)
    ?? readNonEmptyString(record.message_id)
    ?? readNonEmptyString(record.messageId)
    ?? readNonEmptyString(record.id)
    ?? 'claude-message';
}

function resolveBlockKey(
  record: JsonRecord,
  block: JsonRecord,
  index: number,
  channel: 'text' | 'thinking',
): string {
  const messageId = resolveMessageId(record);
  const blockId = readNonEmptyString(block.id) ?? String(index);
  return `${messageId}:${channel}:${blockId}`;
}

function resolveDeltaText(record: JsonRecord): string | undefined {
  const delta = readRecord(record.delta);
  return readString(delta?.text)
    ?? readString(delta?.thinking)
    ?? readString(delta?.partial_json)
    ?? readString(record.text)
    ?? readString(record.thinking);
}

function normalizeErrorContent(record: JsonRecord): string {
  const error = record.error;
  if (typeof error === 'string') {
    const content = stringifyContent(resolveContentBlocks(record)).trim();
    return content ? `${error}: ${content}` : error;
  }
  const errorRecord = readRecord(error);
  return readString(errorRecord?.message)
    ?? readString(record.message)
    ?? readString(record.result)
    ?? 'Claude Code stream returned an error.';
}

function resolveToolKind(name: string): StreamToolKind {
  return getToolIdentity(name, { source: 'generic' }).kind;
}

function resolveToolMetadata(
  record: JsonRecord,
  block: JsonRecord,
  sessionId: string | undefined,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    source: 'claude-code',
  };

  const toolUseId = readNonEmptyString(block.id);
  if (toolUseId) {
    metadata.toolUseId = toolUseId;
  }

  const resolvedSessionId = resolveSessionId(record) ?? sessionId;
  if (resolvedSessionId) {
    metadata.sessionId = resolvedSessionId;
  }

  const parentToolUseId = readNonEmptyString(record.parent_tool_use_id)
    ?? readNonEmptyString(record.parentToolUseId);
  if (parentToolUseId) {
    metadata.parentToolUseId = parentToolUseId;
  }

  return metadata;
}

function isToolResultBlock(block: JsonRecord): boolean {
  const type = readString(block.type);
  return type === 'tool_result' || type === 'tool_result_delta';
}

function isToolUseBlock(block: JsonRecord): boolean {
  const type = readString(block.type);
  return type === 'tool_use' || type === 'server_tool_use';
}

function isTextBlock(block: JsonRecord): boolean {
  return readString(block.type) === 'text' && typeof block.text === 'string';
}

function isThinkingBlock(block: JsonRecord): boolean {
  const type = readString(block.type);
  return (type === 'thinking' || type === 'redacted_thinking') && typeof block.thinking === 'string';
}

function resolveToolUseId(block: JsonRecord, index: number): string {
  return readNonEmptyString(block.id)
    ?? readNonEmptyString(block.tool_use_id)
    ?? readNonEmptyString(block.toolUseId)
    ?? `claude-tool-${index}`;
}

function resolveToolName(block: JsonRecord): string {
  return readNonEmptyString(block.name)
    ?? readNonEmptyString(block.tool_name)
    ?? readNonEmptyString(block.toolName)
    ?? 'tool';
}

function appendUsageChunk(record: JsonRecord, chunks: StreamChunk[], sessionId?: string): void {
  const usage = readUsage(record);
  if (!usage) {
    return;
  }

  chunks.push({
    type: 'usage',
    inputTokens: readInputTokenCount(usage),
    outputTokens: readOutputTokenCount(usage),
    ...(sessionId ? { sessionId } : {}),
  });
}

export class ClaudeCodeStreamNormalizer {
  private readonly state: ClaudeCodeStreamNormalizerState;

  constructor(options: ClaudeCodeStreamNormalizerOptions = {}) {
    this.state = {
      sessionId: options.sessionId,
      textLengths: new Map(),
      thinkingLengths: new Map(),
      emittedToolUses: new Set(),
      emittedToolResults: new Set(),
    };
  }

  reset(): void {
    this.state.sessionId = undefined;
    this.state.textLengths.clear();
    this.state.thinkingLengths.clear();
    this.state.emittedToolUses.clear();
    this.state.emittedToolResults.clear();
  }

  transformSDKMessage(message: unknown): StreamChunk[] {
    const record = readRecord(message);
    if (!record) {
      return [];
    }

    const sessionId = resolveSessionId(record) ?? this.state.sessionId;
    if (sessionId) {
      this.state.sessionId = sessionId;
    }

    const chunks: StreamChunk[] = [];
    this.appendLifecycleChunks(record, chunks, sessionId);
    this.appendDeltaChunk(record, chunks);
    if (this.appendMessageErrorChunk(record, chunks)) {
      appendUsageChunk(record, chunks, sessionId);
      return chunks;
    }
    this.appendAssistantContentChunks(record, chunks, sessionId);
    this.appendResultChunks(record, chunks);
    appendUsageChunk(record, chunks, sessionId);
    return chunks;
  }

  private appendLifecycleChunks(
    record: JsonRecord,
    chunks: StreamChunk[],
    sessionId: string | undefined,
  ): void {
    const type = readString(record.type);
    const subtype = readString(record.subtype);
    if (type !== 'system' || (subtype !== 'session_init' && subtype !== 'init')) {
      return;
    }

    const modelId = readNonEmptyString(record.model)
      ?? readNonEmptyString(readRecord(record.message)?.model);
    chunks.push({
      type: 'message_metadata',
      messageId: sessionId ?? 'claude-session',
      timestamp: Date.now(),
      ...(modelId ? { modelId } : {}),
    });
  }

  private appendDeltaChunk(record: JsonRecord, chunks: StreamChunk[]): void {
    const type = readString(record.type);
    if (type !== 'content_block_delta') {
      return;
    }

    const deltaType = readString(readRecord(record.delta)?.type);
    const content = resolveDeltaText(record);
    if (!content) {
      return;
    }

    if (deltaType === 'thinking_delta' || typeof readRecord(record.delta)?.thinking === 'string') {
      chunks.push({
        type: 'thinking',
        content,
        partId: readNonEmptyString(record.content_block_id)
          ?? readNonEmptyString(record.contentBlockId)
          ?? readNonEmptyString(record.index),
      });
      return;
    }

    chunks.push({ type: 'text', content });
  }

  private appendAssistantContentChunks(
    record: JsonRecord,
    chunks: StreamChunk[],
    sessionId: string | undefined,
  ): void {
    const blocks = resolveContentBlocks(record);
    blocks.forEach((rawBlock, index) => {
      const block = readRecord(rawBlock);
      if (!block) {
        return;
      }

      if (isTextBlock(block)) {
        const key = resolveBlockKey(record, block, index, 'text');
        const text = readString(block.text) ?? '';
        const content = this.takeSuffix(this.state.textLengths, key, text);
        if (content) {
          chunks.push({ type: 'text', content });
        }
        return;
      }

      if (isThinkingBlock(block)) {
        const key = resolveBlockKey(record, block, index, 'thinking');
        const thinking = readString(block.thinking) ?? '';
        const content = this.takeSuffix(this.state.thinkingLengths, key, thinking);
        if (content) {
          chunks.push({
            type: 'thinking',
            content,
            partId: readNonEmptyString(block.id) ?? String(index),
          });
        }
        return;
      }

      if (isToolUseBlock(block)) {
        this.appendToolUseChunk({
          record,
          block,
          index,
          chunks,
          sessionId,
        });
        return;
      }

      if (isToolResultBlock(block)) {
        this.appendToolResultChunk(block, index, chunks);
      }
    });
  }

  private appendMessageErrorChunk(record: JsonRecord, chunks: StreamChunk[]): boolean {
    if (!record.error || readString(record.type) === 'result') {
      return false;
    }

    chunks.push({
      type: 'error',
      content: normalizeErrorContent(record),
    });
    return true;
  }

  private appendToolUseChunk(context: AppendToolUseChunkContext): void {
    const {
      record,
      block,
      index,
      chunks,
      sessionId,
    } = context;
    const id = resolveToolUseId(block, index);
    if (this.state.emittedToolUses.has(id)) {
      return;
    }
    this.state.emittedToolUses.add(id);

    const name = resolveToolName(block);
    chunks.push({
      type: 'tool_use',
      id,
      name,
      kind: resolveToolKind(name),
      input: normalizeToolInput(block.input),
      toolMetadata: resolveToolMetadata(record, block, sessionId),
    });
  }

  private appendToolResultChunk(block: JsonRecord, index: number, chunks: StreamChunk[]): void {
    const toolUseId = resolveToolUseId(block, index);
    if (this.state.emittedToolResults.has(toolUseId)) {
      return;
    }
    this.state.emittedToolResults.add(toolUseId);

    chunks.push({
      type: 'tool_result',
      toolUseId,
      content: stringifyContent(block.content),
      isError: readBoolean(block.is_error) ?? readBoolean(block.isError) ?? false,
    });
  }

  private appendResultChunks(
    record: JsonRecord,
    chunks: StreamChunk[],
  ): void {
    if (readString(record.type) !== 'result') {
      return;
    }

    const subtype = readString(record.subtype);
    const isError = subtype === 'error' || readBoolean(record.is_error) === true || readBoolean(record.isError) === true;
    if (isError) {
      chunks.push({
        type: 'error',
        content: normalizeErrorContent(record),
      });
    }
  }

  private takeSuffix(lengths: Map<string, number>, key: string, value: string): string {
    const previousLength = lengths.get(key) ?? 0;
    if (value.length < previousLength) {
      lengths.set(key, value.length);
      return value;
    }

    lengths.set(key, value.length);
    return value.slice(previousLength);
  }
}

export function createClaudeCodeStreamNormalizer(
  options: ClaudeCodeStreamNormalizerOptions = {},
): ClaudeCodeStreamNormalizer {
  return new ClaudeCodeStreamNormalizer(options);
}
