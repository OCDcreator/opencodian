import type { ChatMessage, ContextUsageSnapshot, ImageAttachment, ImageMediaType, StreamChunk, ToolCallInfo } from '../../../types/chat';
import type { AgentChatSendRequest } from '../AgentService';
import { type PiRecord, piRecord } from './PiRpcClient';

function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((block) => {
    const item = piRecord(block);
    return item.type === 'text' && typeof item.text === 'string' ? item.text : '';
  }).filter(Boolean).join('\n');
}

/** Keep structured context and skill expansion in the Pi request, without SDK-specific request types. */
export function buildPiPrompt(request: AgentChatSendRequest): PiRecord {
  const parts = request.options?.requestParts;
  const expanded = textContent(parts);
  const files = Array.isArray(parts) ? parts.map(piRecord).filter((part) => part.type === 'file').map((part) => {
    const source = piRecord(part.source);
    const selection = piRecord(source.text);
    const url = typeof part.url === 'string' ? part.url : '';
    let content = typeof selection.value === 'string' ? selection.value : '';
    if (!content && url.startsWith('data:text/')) {
      const comma = url.indexOf(',');
      if (comma >= 0) content = url.slice(0, comma).endsWith(';base64')
        ? Buffer.from(url.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(url.slice(comma + 1));
    }
    return `[Attached file: ${String(source.path ?? part.filename ?? 'file')}]\n${content || (url.startsWith('file:') ? url : '')}`;
  }) : [];
  return {
    type: 'prompt', message: [expanded || request.content, ...files].join('\n\n'),
    ...(request.images?.length ? { images: request.images.map((image) => ({ type: 'image', data: image.data, mimeType: image.mediaType })) } : {}),
  };
}

function finiteTokens(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function imageContent(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(piRecord).filter((block) => block.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(String(block.mimeType)) && /^[A-Za-z0-9+/=\s]+$/.test(String(block.data)))
    .map((block) => `\n![Pi tool image](data:${String(block.mimeType)};base64,${String(block.data).replace(/\s/g, '')})\n`).join('');
}

function toolResultText(result: PiRecord): string {
  return [textContent(result.content), result.details === undefined ? '' : JSON.stringify(result.details, null, 2)].filter(Boolean).join('\n\n');
}

function nativeImages(content: unknown): ImageAttachment[] {
  if (!Array.isArray(content)) return [];
  return content.map(piRecord).filter(block => block.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(String(block.mimeType)) && typeof block.data === 'string')
    .map(block => ({ data: String(block.data), mediaType: block.mimeType as ImageMediaType }));
}

/** Restore native entry identities, reasoning and tool results into the existing chat schema. */
export function toPiChatMessages(entries: unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const tools = new Map<string, { tool: ToolCallInfo; message: ChatMessage }>();
  for (const entry of entries.map(piRecord)) {
    if (entry.role === 'toolResult') {
      const owner = tools.get(String(entry.toolCallId));
      if (owner) {
        owner.tool.result = toolResultText(entry); owner.tool.toolMetadata = piRecord(entry.details);
        owner.tool.status = entry.isError ? 'error' : 'completed';
        const images = imageContent(entry.content); owner.message.content += images;
        if (images) owner.message.contentBlocks?.push({ type: 'text', text: images });
      }
      continue;
    }
    if (entry.display === false) continue;
    if (!['user', 'assistant', 'custom'].includes(String(entry.role))) continue;
    const message: ChatMessage = { id: String(entry.id), sourceMessageId: String(entry.id), role: entry.role === 'user' ? 'user' : 'assistant',
      content: textContent(entry.content), timestamp: Number(entry.timestamp) || Date.now(), images: nativeImages(entry.content) };
    if (entry.role === 'custom') { message.displayStyle = 'notice'; message.noticeTitle = String(entry.customType ?? 'Pi'); }
    if (Array.isArray(entry.content)) {
      message.contentBlocks = [];
      for (const block of entry.content.map(piRecord)) {
        if (block.type === 'text') message.contentBlocks.push({ type: 'text', text: String(block.text ?? '') });
        if (block.type === 'thinking') message.contentBlocks.push({ type: 'thinking', thinking: String(block.thinking ?? '') });
        if (block.type === 'toolCall') {
          const tool: ToolCallInfo = { id: String(block.id), name: String(block.name), input: piRecord(block.arguments), status: 'completed' };
          (message.toolCalls ??= []).push(tool); tools.set(tool.id, { tool, message });
          message.contentBlocks.push({ type: 'tool_use', toolId: tool.id, toolName: tool.name, toolInput: tool.input });
        }
      }
    }
    messages.push(message);
  }
  return messages;
}

/** Only this mapper knows pi event envelopes. Unknown additive events remain harmless. */
export class PiStreamMapper {
  private messageSequence = 0;
  private streamedText = false;
  private readonly toolPaths = new Map<string, string>();
  hasText = false;
  sawAssistant = false;

  constructor(private readonly sessionId: string) {}

  map(event: PiRecord): StreamChunk[] {
    switch (event.type) {
      case 'message_start':
        if (piRecord(event.message).role !== 'assistant') return [];
        this.sawAssistant = true;
        this.streamedText = false;
        return [{ type: 'message_start' }];
      case 'message_update': return this.mapDelta(event);
      case 'message_end': return this.mapMessageEnd(piRecord(event.message));
      case 'tool_execution_start':
      case 'tool_execution_update':
      case 'tool_execution_end': return this.mapToolEvent(event);
      case 'transport_error': return [{ type: 'error', content: String(event.error ?? 'Pi disconnected.') }];
      case 'auto_retry_start':
      case 'auto_retry_end':
      case 'compaction_start':
      case 'compaction_end':
      case 'queue_update':
      case 'extension_error':
      case 'extension_ui_request': return [{ type: 'backend_event', source: 'pi', event: 'informational', name: String(event.type), content: String(event.errorMessage ?? event.error ?? event.message ?? ''), metadata: event }];
      default: return [];
    }
  }

  private mapDelta(event: PiRecord): StreamChunk[] {
        const delta = piRecord(event.assistantMessageEvent);
        if (typeof delta.delta !== 'string') return [];
        if (delta.type === 'text_delta') {
          this.hasText = true;
          this.streamedText = true;
          return [{ type: 'text', content: delta.delta }];
        }
        if (delta.type === 'thinking_delta') return [{ type: 'thinking', content: delta.delta }];
        return [];
  }

  private mapToolEvent(event: PiRecord): StreamChunk[] {
    switch (event.type) {
      case 'tool_execution_start': {
        const input = piRecord(event.args);
        if (['write', 'edit'].includes(String(event.toolName)) && typeof input.path === 'string') this.toolPaths.set(String(event.toolCallId), input.path);
        return [{ type: 'tool_use', id: String(event.toolCallId), name: String(event.toolName), input }];
      }
      case 'tool_execution_update': return [{ type: 'backend_event', source: 'pi', event: 'tool_progress', id: String(event.toolCallId), content: textContent(piRecord(event.partialResult).content), metadata: piRecord(event.partialResult) }];
      case 'tool_execution_end': {
        const file = this.toolPaths.get(String(event.toolCallId));
        this.toolPaths.delete(String(event.toolCallId));
        return [
          { type: 'tool_result', toolUseId: String(event.toolCallId), content: toolResultText(piRecord(event.result)), isError: event.isError === true },
          ...(imageContent(piRecord(event.result).content) ? [{ type: 'text' as const, content: imageContent(piRecord(event.result).content) }] : []),
          ...(file && event.isError !== true ? [{ type: 'file_edited' as const, file }] : []),
          { type: 'backend_event', source: 'pi', event: 'informational', name: 'tool-result-details', id: String(event.toolCallId), metadata: piRecord(event.result) },
        ];
      }
      default: return [];
    }
  }

  private mapMessageEnd(message: PiRecord): StreamChunk[] {
    if (message.role === 'custom' && message.display !== false) return [{ type: 'text', content: `\n${textContent(message.content)}\n` }];
    if (message.role !== 'assistant') return [];
    const chunks: StreamChunk[] = [];
    const content = textContent(message.content);
    this.sawAssistant = true;
    if (content && !this.streamedText) { this.hasText = true; chunks.push({ type: 'text', content }); }
    const usage = piRecord(message.usage);
    if (Object.keys(usage).length) {
      const inputTokens = finiteTokens(usage.input);
      const outputTokens = finiteTokens(usage.output);
      chunks.push({ type: 'usage', sessionId: this.sessionId, inputTokens, outputTokens,
        billingUsage: { requestId: `${this.sessionId}:${Date.now()}:${++this.messageSequence}`, providerId: String(message.provider ?? ''),
          modelId: String(message.model ?? ''), inputTokens, outputTokens, reasoningTokens: 0,
          cacheReadTokens: finiteTokens(usage.cacheRead), cacheWriteTokens: finiteTokens(usage.cacheWrite) } });
    }
    return chunks;
  }
}

/** Pi's context occupancy and billed session totals are distinct authoritative metrics. */
export function buildPiUsageSnapshot(sessionId: string, stats: PiRecord, state: PiRecord): ContextUsageSnapshot {
  const model = piRecord(state.model);
  const context = piRecord(stats.contextUsage);
  const tokens = piRecord(stats.tokens);
  return {
    sessionId, sessionTitle: String(state.sessionName ?? ''), createdAt: 0, updatedAt: Date.now(),
    providerId: typeof model.provider === 'string' ? model.provider : null,
    providerName: typeof model.provider === 'string' ? model.provider : null,
    modelId: typeof model.id === 'string' ? model.id : null, modelName: typeof model.name === 'string' ? model.name : null,
    contextWindow: finiteTokens(context.contextWindow ?? model.contextWindow), totalTokens: finiteTokens(context.tokens),
    inputTokens: finiteTokens(context.tokens), outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: null,
    totalCost: typeof stats.cost === 'number' && Number.isFinite(stats.cost) ? stats.cost : null,
    billingUsage: { requestIds: [`${sessionId}:native-session-total`], providerId: String(model.provider ?? ''), modelId: String(model.id ?? ''),
      inputTokens: finiteTokens(tokens.input), outputTokens: finiteTokens(tokens.output), reasoningTokens: 0,
      cacheReadTokens: finiteTokens(tokens.cacheRead), cacheWriteTokens: finiteTokens(tokens.cacheWrite) },
  };
}
