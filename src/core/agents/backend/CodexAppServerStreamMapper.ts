/* eslint-disable max-lines -- This mapper is one pure protocol boundary: every app-server notification and ThreadItem kind stays co-located so the wire-to-chunk contract is auditable in one file. */
/**
 * Codex app-server notification -> OpenCodian stream chunk mapping.
 *
 * This is intentionally a pure protocol boundary: it translates a single
 * app-server notification and returns a context snapshot separately so the
 * owning adapter can persist it under the correct backend session.
 */

import type { ContextUsageSnapshot, StreamChunk } from '../../types/chat';
import type { AppServerThreadNotification } from './CodexAppServerClient';

export interface AppServerStreamState {
  streamedAgentMessageItemIds: Set<string>;
  streamedReasoningItemIds: Set<string>;
  startedTodoItemIds: Set<string>;
  outputSchema: unknown;
}

interface AppServerStreamMapInput {
  event: AppServerThreadNotification;
  modelId: string | null;
  sessionId: string;
  streamState: AppServerStreamState;
  threadId: string;
}

export interface AppServerStreamMapResult {
  chunks: StreamChunk[];
  contextUsageSnapshot?: ContextUsageSnapshot;
}

export function mapAppServerNotification({
  event,
  modelId,
  sessionId,
  streamState,
  threadId,
}: AppServerStreamMapInput): AppServerStreamMapResult {
  const params = asRecord(event.params);
  switch (event.method) {
    case 'thread/tokenUsage/updated':
      return mapTokenUsageNotification(params, threadId, modelId);
    case 'item/agentMessage/delta':
      return mapAgentMessageDelta(params, streamState);
    case 'item/reasoning/textDelta':
      return mapReasoningDelta(params, streamState);
    case 'item/mcpToolCall/progress':
      return mapToolProgress(params, sessionId);
    case 'item/fileChange/patchUpdated':
      return { chunks: mapFileChangePaths(params.changes) };
    case 'item/started':
    case 'item/completed':
      return { chunks: mapItemNotification(params, event.method === 'item/completed', streamState) };
    case 'thread/name/updated':
      return mapThreadNameUpdated(params, threadId, sessionId);
    case 'thread/goal/updated':
      return mapThreadGoalUpdated(params, threadId, sessionId);
    case 'thread/goal/cleared':
      return mapThreadGoalCleared(params, threadId, sessionId);
    case 'thread/deleted':
      return mapThreadDeleted(params, threadId, sessionId);
    case 'deprecationNotice':
      return mapDeprecationNotice(params, sessionId);
    case 'error':
      return mapErrorNotification(params);
    case 'warning':
      return mapWarningNotification(params, sessionId);
    default:
      return { chunks: [] };
  }
}

export function readAppServerTurnError(value: unknown): string | null {
  const error = asRecord(value);
  if (typeof error.message === 'string') {
    return error.message;
  }
  return typeof value === 'string' && value.trim() ? value : null;
}

function mapTokenUsageNotification(
  params: Record<string, unknown>,
  threadId: string,
  modelId: string | null,
): AppServerStreamMapResult {
  const tokenUsage = asRecord(params.tokenUsage);
  const total = asRecord(tokenUsage.total);
  if (Object.keys(total).length === 0) {
    return { chunks: [] };
  }
  const snapshot: ContextUsageSnapshot = {
    sessionId: threadId,
    sessionTitle: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // app-server token notifications expose a model ID, not the selected
    // `model_provider`. Do not mislabel custom Codex providers as OpenAI:
    // ModelPricingService can safely infer an unambiguous models.dev identity.
    providerId: null,
    providerName: null,
    modelId,
    modelName: modelId,
    contextWindow: nonNegativeNumber(tokenUsage.modelContextWindow),
    totalTokens: nonNegativeNumber(total.totalTokens),
    inputTokens: nonNegativeNumber(total.inputTokens),
    outputTokens: nonNegativeNumber(total.outputTokens),
    reasoningTokens: nonNegativeNumber(total.reasoningOutputTokens),
    cacheReadTokens: nonNegativeNumber(total.cachedInputTokens),
    // Codex SDK >= 0.152 reports prompt-cache write volume per turn; older
    // app-servers omit the field — keep null there instead of a fake 0.
    cacheWriteTokens: typeof total.cache_write_input_tokens === 'number' && total.cache_write_input_tokens >= 0
      ? total.cache_write_input_tokens
      : null,
    totalCost: null,
  };
  return {
    chunks: [{ type: 'context_usage', snapshot }],
    contextUsageSnapshot: snapshot,
  };
}

function mapAgentMessageDelta(
  params: Record<string, unknown>,
  streamState: AppServerStreamState,
): AppServerStreamMapResult {
  if (typeof params.delta !== 'string') {
    return { chunks: [] };
  }
  if (typeof params.itemId === 'string') {
    streamState.streamedAgentMessageItemIds.add(params.itemId);
  }
  return { chunks: [{ type: 'text', content: params.delta }] };
}

function mapReasoningDelta(
  params: Record<string, unknown>,
  streamState: AppServerStreamState,
): AppServerStreamMapResult {
  if (typeof params.delta !== 'string') {
    return { chunks: [] };
  }
  const itemId = typeof params.itemId === 'string' ? params.itemId : undefined;
  if (itemId) {
    streamState.streamedReasoningItemIds.add(itemId);
  }
  return { chunks: [{ type: 'thinking', content: params.delta, partId: itemId }] };
}

function mapToolProgress(params: Record<string, unknown>, sessionId: string): AppServerStreamMapResult {
  if (typeof params.message !== 'string') {
    return { chunks: [] };
  }
  return {
    chunks: [{
      type: 'backend_event',
      source: 'codex',
      event: 'tool_progress',
      id: typeof params.itemId === 'string' ? params.itemId : undefined,
      content: params.message,
      sessionId,
    }],
  };
}

function mapErrorNotification(params: Record<string, unknown>): AppServerStreamMapResult {
  const error = readAppServerTurnError(params.error ?? params);
  return { chunks: error ? [{ type: 'error', content: error }] : [] };
}

function mapWarningNotification(params: Record<string, unknown>, sessionId: string): AppServerStreamMapResult {
  if (typeof params.message !== 'string') {
    return { chunks: [] };
  }
  return {
    chunks: [{
      type: 'backend_event',
      source: 'codex',
      event: 'tool_progress',
      status: 'warning',
      content: params.message,
      sessionId,
    }],
  };
}

// The thread-scoped notifications below are emitted by the app-server for the
// subscribed thread only, but the params still carry a threadId: guard it so a
// replayed or misrouted notification can never rename/close another session.
// These chunks render nothing in chat today; they exist as the machine-readable
// seam for the adapter owner (conversation title refresh, goal state, deletion).

function mapThreadNameUpdated(
  params: Record<string, unknown>,
  threadId: string,
  sessionId: string,
): AppServerStreamMapResult {
  if (params.threadId !== threadId) {
    return { chunks: [] };
  }
  return {
    chunks: [{
      type: 'backend_event',
      source: 'codex',
      event: 'thread_renamed',
      content: typeof params.threadName === 'string' ? params.threadName : '',
      metadata: { threadName: typeof params.threadName === 'string' ? params.threadName : null },
      sessionId,
    }],
  };
}

function mapThreadGoalUpdated(
  params: Record<string, unknown>,
  threadId: string,
  sessionId: string,
): AppServerStreamMapResult {
  if (params.threadId !== threadId) {
    return { chunks: [] };
  }
  const goal = asRecord(params.goal);
  return {
    chunks: [{
      type: 'backend_event',
      source: 'codex',
      event: 'goal_updated',
      metadata: { goal: Object.keys(goal).length > 0 ? goal : null },
      sessionId,
    }],
  };
}

function mapThreadGoalCleared(
  params: Record<string, unknown>,
  threadId: string,
  sessionId: string,
): AppServerStreamMapResult {
  if (params.threadId !== threadId) {
    return { chunks: [] };
  }
  return {
    chunks: [{
      type: 'backend_event',
      source: 'codex',
      event: 'goal_cleared',
      sessionId,
    }],
  };
}

function mapThreadDeleted(
  params: Record<string, unknown>,
  threadId: string,
  sessionId: string,
): AppServerStreamMapResult {
  if (params.threadId !== threadId) {
    return { chunks: [] };
  }
  return {
    chunks: [
      {
        type: 'backend_event',
        source: 'codex',
        event: 'thread_deleted',
        sessionId,
      },
      { type: 'error', content: 'Codex thread was deleted on the server.' },
    ],
  };
}

function mapDeprecationNotice(params: Record<string, unknown>, sessionId: string): AppServerStreamMapResult {
  if (typeof params.summary !== 'string' || !params.summary.trim()) {
    return { chunks: [] };
  }
  const details = typeof params.details === 'string' ? params.details : null;
  return {
    chunks: [{
      type: 'backend_event',
      source: 'codex',
      event: 'deprecation_notice',
      content: params.summary,
      metadata: { details },
      sessionId,
    }],
  };
}

function mapItemNotification(
  params: Record<string, unknown>,
  completed: boolean,
  streamState: AppServerStreamState,
): StreamChunk[] {
  const item = asRecord(params.item);
  if (typeof item.id !== 'string' || typeof item.type !== 'string') {
    return [];
  }
  return (itemMappers[item.type] ?? noItemChunks)(item, completed, streamState);
}

type ItemMapper = (
  item: Record<string, unknown>,
  completed: boolean,
  streamState: AppServerStreamState,
) => StreamChunk[];

const itemMappers: Readonly<Record<string, ItemMapper>> = {
  agentMessage: mapAgentMessageItem,
  commandExecution: mapCommandExecutionItem,
  error: mapErrorItem,
  fileChange: mapFileChangeItem,
  // ThreadItem (app-server item notifications) spells it imageGeneration;
  // ResponseItem (raw responses-api replay) spells it image_generation_call.
  imageGeneration: mapImageGenerationItem,
  image_generation_call: mapImageGenerationItem,
  mcpToolCall: mapMcpToolCallItem,
  reasoning: mapReasoningItem,
  subAgentActivity: mapSubAgentActivityItem,
  todoList: mapTodoListItem,
  webSearch: mapWebSearchItem,
};

function mapCommandExecutionItem(item: Record<string, unknown>, completed: boolean): StreamChunk[] {
  const id = String(item.id);
  if (!completed) {
    return [{
      type: 'tool_use',
      id,
      name: 'Bash',
      kind: 'builtin',
      input: { command: String(item.command ?? ''), cwd: String(item.cwd ?? '') },
    }];
  }
  return [{
    type: 'tool_result',
    toolUseId: id,
    content: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
    isError: item.status === 'failed' || item.status === 'declined',
  }];
}

function mapMcpToolCallItem(item: Record<string, unknown>, completed: boolean): StreamChunk[] {
  const id = String(item.id);
  if (!completed) {
    return [{
      type: 'tool_use',
      id,
      name: `${String(item.server ?? 'mcp')}/${String(item.tool ?? 'tool')}`,
      kind: 'mcp',
      input: asRecord(item.arguments),
    }];
  }
  const error = asRecord(item.error);
  const message = typeof error.message === 'string' ? error.message : null;
  return [{
    type: 'tool_result',
    toolUseId: id,
    content: message ?? stringifyValue(item.result),
    isError: Boolean(message) || item.status === 'failed',
  }];
}

function mapFileChangeItem(item: Record<string, unknown>, completed: boolean): StreamChunk[] {
  const id = String(item.id);
  const changes = Array.isArray(item.changes) ? item.changes : [];
  if (!completed) {
    return [{ type: 'tool_use', id, name: 'Apply patch', kind: 'builtin', input: { changes } }];
  }
  return mapFileChangePaths(changes);
}

function mapWebSearchItem(item: Record<string, unknown>, completed: boolean): StreamChunk[] {
  if (completed) {
    return [];
  }
  return [{
    type: 'tool_use',
    id: String(item.id),
    name: 'Web search',
    kind: 'builtin',
    input: { query: item.query ?? '' },
  }];
}

function mapAgentMessageItem(
  item: Record<string, unknown>,
  completed: boolean,
  streamState: AppServerStreamState,
): StreamChunk[] {
  if (!completed || typeof item.text !== 'string') {
    return [];
  }
  const chunks = mapStructuredOutput(item.text, streamState.outputSchema);
  if (!streamState.streamedAgentMessageItemIds.has(String(item.id))) {
    chunks.push({ type: 'text', content: item.text });
  }
  return chunks;
}

function mapReasoningItem(
  item: Record<string, unknown>,
  completed: boolean,
  streamState: AppServerStreamState,
): StreamChunk[] {
  const id = String(item.id);
  if (!completed || !Array.isArray(item.content) || streamState.streamedReasoningItemIds.has(id)) {
    return [];
  }
  return [{
    type: 'thinking',
    content: item.content.filter((part): part is string => typeof part === 'string').join(''),
    partId: id,
  }];
}

function mapTodoListItem(
  item: Record<string, unknown>,
  completed: boolean,
  streamState: AppServerStreamState,
): StreamChunk[] {
  if (!Array.isArray(item.items)) {
    return [];
  }
  const id = String(item.id);
  const todos = item.items.flatMap((todo) => {
    const value = asRecord(todo);
    if (typeof value.text !== 'string') {
      return [];
    }
    return [{ content: value.text, status: value.completed === true ? 'completed' as const : 'pending' as const }];
  });
  if (!completed) {
    streamState.startedTodoItemIds.add(id);
    return [{ type: 'tool_use', id, name: 'todowrite', kind: 'builtin', input: { todos } }];
  }
  const chunks: StreamChunk[] = [];
  if (!streamState.startedTodoItemIds.has(id)) {
    chunks.push({ type: 'tool_use', id, name: 'todowrite', kind: 'builtin', input: { todos } });
  }
  const completedCount = todos.filter((todo) => todo.status === 'completed').length;
  chunks.push({
    type: 'tool_result',
    toolUseId: id,
    content: `Todo list: ${todos.length} items (${completedCount} completed)`,
  });
  return chunks;
}

function mapErrorItem(item: Record<string, unknown>): StreamChunk[] {
  return typeof item.message === 'string' ? [{ type: 'error', content: item.message }] : [];
}

const IMAGE_GENERATION_TOOL_NAME = 'image_generation';
const IMAGE_RESULT_TEXT_LIMIT = 4096;

function mapImageGenerationItem(item: Record<string, unknown>, completed: boolean): StreamChunk[] {
  if (typeof item.id !== 'string' || !item.id) {
    return [];
  }
  const id = item.id;
  const status = typeof item.status === 'string' ? item.status : '';
  // ThreadItem uses revisedPrompt; ResponseItem uses revised_prompt.
  const revisedPrompt = typeof item.revisedPrompt === 'string'
    ? item.revisedPrompt
    : typeof item.revised_prompt === 'string'
      ? item.revised_prompt
      : '';
  const input: Record<string, unknown> = { ...(status ? { status } : {}) };
  if (revisedPrompt) {
    input.revisedPrompt = revisedPrompt;
  }

  if (!completed) {
    return [{
      type: 'tool_use',
      id,
      name: IMAGE_GENERATION_TOOL_NAME,
      kind: 'image',
      input,
    }];
  }

  const chunks: StreamChunk[] = [{
    type: 'tool_use',
    id,
    name: IMAGE_GENERATION_TOOL_NAME,
    kind: 'image',
    input,
  }];

  const failure = asRecord(item.failure);
  if (Object.keys(failure).length > 0) {
    const failureText = describeImageGenerationFailure(failure);
    // The tool_result flips the card to its error state; the error chunk makes
    // the user-actionable notice (usage limit + reset time) prominent. Like any
    // mid-turn error chunk it suppresses the post-turn server sync.
    chunks.push({ type: 'tool_result', toolUseId: id, content: failureText, isError: true });
    chunks.push({ type: 'error', content: failureText });
    return chunks;
  }

  const savedPath = typeof item.savedPath === 'string' ? item.savedPath : '';
  chunks.push({
    type: 'tool_result',
    toolUseId: id,
    content: resolveImageGenerationResult(item.result, savedPath),
  });
  return chunks;
}

function resolveImageGenerationResult(result: unknown, savedPath: string): string {
  if (typeof result !== 'string' || !result.trim()) {
    return savedPath;
  }
  const trimmed = result.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  if (looksLikeBase64Image(trimmed)) {
    return `data:${detectImageMediaType(trimmed)};base64,${trimmed.replace(/\s+/g, '')}`;
  }
  if (looksLikeFilePath(trimmed)) {
    return trimmed;
  }
  return trimmed.length > IMAGE_RESULT_TEXT_LIMIT
    ? `${trimmed.slice(0, IMAGE_RESULT_TEXT_LIMIT)}…`
    : trimmed;
}

function looksLikeBase64Image(value: string): boolean {
  return value.length >= 256 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function detectImageMediaType(base64: string): string {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

function looksLikeFilePath(value: string): boolean {
  return value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || /^[A-Za-z]:[\\/]/.test(value);
}

function describeImageGenerationFailure(failure: Record<string, unknown>): string {
  if (failure.type === 'usageLimitExceeded') {
    const limitId = typeof failure.limitId === 'string' && failure.limitId ? ` (${failure.limitId})` : '';
    const resetsAt = typeof failure.resetsAt === 'number' && failure.resetsAt > 0
      ? ` Resets at ${new Date(failure.resetsAt).toLocaleString()}.`
      : '';
    return `Image generation failed: usage limit exceeded${limitId}.${resetsAt}`;
  }
  return `Image generation failed: ${stringifyValue(failure)}`;
}

function mapSubAgentActivityItem(item: Record<string, unknown>): StreamChunk[] {
  const kind = typeof item.kind === 'string' ? item.kind : '';
  if (kind !== 'started' && kind !== 'interacted' && kind !== 'interrupted' && kind !== 'completed') {
    return [];
  }
  const agentPath = typeof item.agentPath === 'string' ? item.agentPath : '';
  const agentThreadId = typeof item.agentThreadId === 'string' && item.agentThreadId
    ? item.agentThreadId
    : String(item.id ?? '');
  if (!agentThreadId) {
    return [];
  }
  // One card per subagent: key the tool call by agentThreadId so each activity
  // kind merges into the running card instead of spawning a new one.
  const chunks: StreamChunk[] = [{
    type: 'tool_use',
    id: agentThreadId,
    name: 'task',
    kind: 'task',
    input: { subagent_type: agentPath, description: kind },
    toolMetadata: { agentThreadId, agentPath },
  }];
  if (kind === 'completed' || kind === 'interrupted') {
    chunks.push({
      type: 'tool_result',
      toolUseId: agentThreadId,
      content: `Subagent ${agentPath || agentThreadId} ${kind}`,
      isError: kind === 'interrupted',
    });
  }
  return chunks;
}

function mapFileChangePaths(changes: unknown): StreamChunk[] {
  if (!Array.isArray(changes)) {
    return [];
  }
  return changes.flatMap((change) => {
    const path = asRecord(change).path;
    return typeof path === 'string' ? [{ type: 'file_edited' as const, file: path }] : [];
  });
}

function mapStructuredOutput(text: string, outputSchema: unknown): StreamChunk[] {
  if (outputSchema === undefined) {
    return [];
  }
  try {
    const structuredOutput = JSON.parse(text) as unknown;
    return [{
      type: 'backend_event',
      source: 'codex',
      event: 'structured_output',
      status: 'received',
      content: JSON.stringify(structuredOutput),
      metadata: { structuredOutput },
    }];
  } catch {
    return [];
  }
}

function noItemChunks(): StreamChunk[] {
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && value >= 0 ? value : 0;
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
