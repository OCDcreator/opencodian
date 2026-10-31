/** Native transcript projection shared by Claude, Codex, ZCode and Harness continuations. */
import type { AgentBackendKind, ChatMessage, ImageAttachment, ToolCallInfo } from '../../types/chat';

/** Goal commands may produce no native user item. Keep the user's explicit intent across reconciliation. */
export function preserveGoalIntentMessages(previous: readonly ChatMessage[], native: ChatMessage[]): ChatMessage[] {
  const merged = [...native];
  const sameMessage = (left: ChatMessage, right: ChatMessage) => left.id === right.id
    || Boolean(left.sourceMessageId && left.sourceMessageId === right.sourceMessageId);
  for (const [index, intent] of previous.entries()) {
    const marker = intent.parts?.find((part) => record(part).type === 'opencodian_goal_intent');
    if (intent.role !== 'user' || !marker) continue;
    const existing = merged.find((message) => sameMessage(message, intent)
      || (message.role === 'user' && message.content === intent.content));
    if (existing) {
      if (!existing.parts?.some((part) => record(part).type === 'opencodian_goal_intent'))
        existing.parts = [...(existing.parts ?? []), marker];
      continue;
    }
    const next = previous.slice(index + 1).find((message) => merged.some((candidate) => sameMessage(candidate, message)));
    const preceding = previous.slice(0, index).reverse().find((message) => merged.some((candidate) => sameMessage(candidate, message)));
    const insertion = next ? merged.findIndex((message) => sameMessage(message, next))
      : preceding ? merged.findIndex((message) => sameMessage(message, preceding)) + 1
        : merged.findIndex((message) => message.timestamp >= intent.timestamp);
    merged.splice(insertion < 0 ? merged.length : insertion, 0, intent);
  }
  return merged;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hiddenFromTranscript(value: Record<string, unknown>): boolean {
  const semantics=record(value.semantics), metadata=record(value.metadata);
  return semantics.uiVisibility==='hidden' || semantics.transcriptVisibility==='hidden'
    || ['hidden','model-only'].includes(String(value.visibility ?? metadata.visibility ?? ''));
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((part) => typeof part === 'string' ? part : text(record(part).text)).filter(Boolean).join('\n');
  return '';
}

interface MessageParts { texts: string[]; thinking: string[]; calls: ToolCallInfo[]; images: ImageAttachment[] }

function toolCall(part: Record<string, unknown>): ToolCallInfo | null {
  const state = record(part.state);
  const id = part.id ?? part.callId ?? part.callID ?? part.toolCallId;
  if (typeof id !== 'string' || !id) return null;
  const status = String(state.status ?? part.status ?? 'completed');
  return { id, name: String(part.name ?? part.tool ?? part.toolName ?? 'tool'),
    input: record(part.input ?? part.arguments ?? state.input),
    status: ['error', 'failed'].includes(status) ? 'error' : ['running', 'pending', 'inProgress'].includes(status) ? 'running' : 'completed',
    ...(typeof (state.output ?? part.output) === 'string' ? { result: String(state.output ?? part.output) } : {}),
  };
}

function consumePart(value: unknown, parts: MessageParts, tools: Map<string, ToolCallInfo>): void {
  const part = record(value);
  if (hiddenFromTranscript(part)) return;
  const type = String(part.type ?? '');
  if (consumeCodexItem(part, parts, tools)) return;
  if (['tool_use', 'tool-call', 'tool_call', 'tool'].includes(type)) {
    const tool = toolCall(part);
    if (tool) { tools.set(tool.id, tool); parts.calls.push(tool); }
    else if (typeof part.text === 'string') parts.texts.push(part.text);
    return;
  }
  if (['tool_result', 'tool-result'].includes(type)) {
    const id = part.tool_use_id ?? part.toolCallId;
    const target = typeof id === 'string' ? tools.get(id) : undefined;
    if (target) {
      target.result = text(part.content) || JSON.stringify(part.content ?? '');
      target.status = part.is_error === true || part.isError === true ? 'error' : 'completed';
    }
    return;
  }
  if (type === 'image') { consumeImage(part, parts.images); return; }
  const content = text(part.thinking ?? part.text);
  if (content) (['thinking', 'reasoning'].includes(type) ? parts.thinking : parts.texts).push(content);
}

function consumeCodexItem(part: Record<string, unknown>, parts: MessageParts, tools: Map<string, ToolCallInfo>): boolean {
  if (part.type === 'agentMessage') { parts.texts.push(text(part.text)); return true; }
  if (part.type === 'reasoning') { parts.thinking.push(text(part.summary) || text(part.content)); return true; }
  const types = ['commandExecution', 'mcpToolCall', 'dynamicToolCall', 'fileChange', 'webSearch'];
  if (!types.includes(String(part.type)) || typeof part.id !== 'string') return false;
  const output = part.aggregatedOutput ?? part.result ?? part.changes;
  const tool = toolCall({ ...part, type:'tool_call', name: part.type === 'commandExecution' ? 'shell'
    : part.type === 'mcpToolCall' ? `${part.server}/${part.tool}` : part.type === 'dynamicToolCall' ? part.tool : part.type,
    input: part.arguments ?? (part.type === 'commandExecution' ? { command: part.command, cwd: part.cwd } : { changes: part.changes, query: part.query }),
    output: typeof output === 'string' ? output : output !== undefined ? JSON.stringify(output) : undefined });
  if (tool) { parts.calls.push(tool); tools.set(tool.id, tool); }
  return true;
}

function consumeImage(part: Record<string, unknown>, images: ImageAttachment[]): void {
  const source = record(part.source);
  const mediaType = source.media_type ?? part.mimeType ?? part.mediaType;
  const data = source.data ?? part.data;
  if (typeof data === 'string' && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(String(mediaType)))
    images.push({ data, mediaType: mediaType as ImageAttachment['mediaType'] });
}

function nativeMessage(backend: AgentBackendKind, value: unknown, tools: Map<string, ToolCallInfo>): ChatMessage | null {
  const raw = record(value); const nested = record(raw.message); const info = record(raw.info);
  if (raw.isMeta === true || raw.sourceKind === 'system' || [raw,nested,info].some(hiddenFromTranscript)) return null;
  const role = String(nested.role ?? info.role ?? raw.role ?? raw.type);
  if (!['user', 'assistant', 'activity', 'tool'].includes(role)) return null;
  const id = raw.uuid ?? raw.sourceMessageId ?? raw.id ?? info.id ?? info.messageId ?? nested.id;
  if (typeof id !== 'string' || !id) return null;
  return projectMessage({ backend, raw, info, nested, role, id }, tools);
}

interface MessageIdentity { backend: AgentBackendKind; raw: Record<string, unknown>; info: Record<string, unknown>; nested: Record<string, unknown>; role: string; id: string }

function projectMessage(identity: MessageIdentity, tools: Map<string, ToolCallInfo>): ChatMessage | null {
  const { backend, raw, info, nested, role, id } = identity;
  const content = nested.content ?? raw.content ?? raw.parts;
  const values = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
  const parts: MessageParts = { texts: [], thinking: [], calls: [], images: [] };
  for (const part of values) consumePart(part, parts, tools);
  if (!parts.texts.length && !parts.thinking.length && !parts.calls.length && !parts.images.length) return null;
  const time = record(info.time);
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : Number(time.created ?? 0);
  return { id: `native-${backend}-${id}`, sourceMessageId: id,
    ...(typeof raw.sourceTurnId === 'string' ? { sourceTurnId: raw.sourceTurnId } : {}),
    role: role === 'user' ? 'user' : 'assistant', content: parts.texts.join('\n'), timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    contentBlocks: parts.thinking.length ? [
      ...parts.thinking.map((thinking) => ({ type: 'thinking' as const, thinking })),
      ...parts.texts.map((value) => ({ type: 'text' as const, text: value })),
    ] : undefined,
    toolCalls: parts.calls.length ? parts.calls : undefined, images: parts.images.length ? parts.images : undefined,
    parts: values,
  };
}

/** Native IDs stay stable across automatic rounds and subsequent reconciliation. */
export function backendSessionMessagesToChat(backend: AgentBackendKind, values: readonly unknown[]): ChatMessage[] {
  const tools = new Map<string, ToolCallInfo>();
  return values.map((value) => nativeMessage(backend, value, tools)).filter((message): message is ChatMessage => message !== null);
}
