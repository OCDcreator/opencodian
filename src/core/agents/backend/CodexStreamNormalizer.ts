/**
 * CodexStreamNormalizer — translates Codex SDK ThreadEvent objects
 * into the plugin's universal StreamChunk format.
 *
 * The Codex SDK emits well-typed discriminated-union events
 * (thread.started, turn.started, item.started, etc.) which this
 * normalizer maps to the plugin's StreamChunk type used by the chat
 * surface.
 *
 * This module uses only type imports from @openai/codex-sdk;
 * no runtime dependency is introduced.
 *
 * See docs/requirements/multi-agent-foundation/05-codex-adapter.md §4.
 */

import type {
  AgentMessageItem,
  CommandExecutionItem,
  ErrorItem,
  FileChangeItem,
  McpToolCallItem,
  ReasoningItem,
  ThreadEvent,
  ThreadItem,
  TodoListItem,
  Usage,
  WebSearchItem,
} from '@openai/codex-sdk';

import type { StreamChunk } from '../../types/chat';

// ---------------------------------------------------------------------------
// Options & state
// ---------------------------------------------------------------------------

export interface CodexStreamNormalizerOptions {
  sessionId?: string;
  /** When set, agent_message JSON text is promoted to a structured_output backend_event. */
  outputSchema?: unknown;
}

interface CodexStreamNormalizerState {
  sessionId: string | undefined;
  /** Track emitted text length per agent_message item for delta computation. */
  textLengths: Map<string, number>;
  /** Track emitted thinking length per reasoning item for delta computation. */
  thinkingLengths: Map<string, number>;
  /** Whether per-turn message_metadata has been emitted for the current turn. */
  turnMetadataEmitted: boolean;
  /** Track which todo_list items have emitted tool_use so completed-only turns still work. */
  todoListToolUseEmitted: Set<string>;
  /** When set, agent_message JSON text is promoted to a structured_output backend_event. */
  outputSchema: unknown | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the portion of `value` after the previously seen length.
 * Used to compute text deltas across item.started / item.updated events.
 */
function takeSuffix(lengths: Map<string, number>, key: string, value: string): string {
  const previousLength = lengths.get(key) ?? 0;
  lengths.set(key, value.length);
  return value.slice(previousLength);
}

/**
 * Safely parse a value as JSON. Returns undefined on failure.
 */
function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// CodexStreamNormalizer
// ---------------------------------------------------------------------------

/**
 * Translates Codex SDK ThreadEvent objects into StreamChunk arrays.
 *
 * Each ThreadEvent produces zero or more StreamChunks depending on the
 * event type and the contained ThreadItem.  The normalizer tracks text
 * and thinking lengths to emit only new deltas on updated events.
 */
export class CodexStreamNormalizer {
  private readonly state: CodexStreamNormalizerState;

  constructor(options: CodexStreamNormalizerOptions = {}) {
    this.state = {
      sessionId: options.sessionId,
      textLengths: new Map(),
      thinkingLengths: new Map(),
      turnMetadataEmitted: false,
      todoListToolUseEmitted: new Set(),
      outputSchema: options.outputSchema,
    };
  }

  /** Reset all internal tracking state for a new stream. */
  reset(): void {
    this.state.sessionId = undefined;
    this.state.textLengths.clear();
    this.state.thinkingLengths.clear();
    this.state.turnMetadataEmitted = false;
    this.state.todoListToolUseEmitted.clear();
    this.state.outputSchema = undefined;
  }

  /**
   * Translate a single Codex ThreadEvent into zero or more StreamChunks.
   */
  transformEvent(event: ThreadEvent): StreamChunk[] {
    switch (event.type) {
      case 'thread.started':
        return this.onThreadStarted(event.thread_id);
      case 'turn.started':
        return this.onTurnStarted();
      case 'turn.completed':
        return this.onTurnCompleted(event.usage);
      case 'turn.failed':
        return [{ type: 'error', content: event.error.message }];
      case 'item.started':
        return this.onItemLifecycle(event.item, 'started');
      case 'item.updated':
        return this.onItemLifecycle(event.item, 'updated');
      case 'item.completed':
        return this.onItemLifecycle(event.item, 'completed');
      case 'error':
        return [{ type: 'error', content: event.message }];
    }
  }

  // -------------------------------------------------------------------------
  // Thread / turn lifecycle
  // -------------------------------------------------------------------------

  private onThreadStarted(threadId: string): StreamChunk[] {
    this.state.sessionId = threadId;
    // Do NOT emit message_metadata here — it would reuse threadId as messageId
    // for every turn. Per-turn metadata is emitted in onTurnStarted().
    return [];
  }

  private onTurnStarted(): StreamChunk[] {
    this.state.turnMetadataEmitted = false;
    return [{ type: 'message_start' }];
  }

  private onTurnCompleted(usage: Usage): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    // If no agent_message item was encountered, emit fallback metadata
    // using threadId + timestamp so persistence always has an identity.
    if (!this.state.turnMetadataEmitted) {
      const fallbackId = this.state.sessionId
        ? `${this.state.sessionId}::fallback-${Date.now()}`
        : `fallback-${Date.now()}`;
      chunks.push({
        type: 'message_metadata',
        messageId: fallbackId,
        timestamp: Date.now(),
        ...(this.state.sessionId ? { sessionId: this.state.sessionId } : {}),
      });
    }
    const outputTokens = usage.output_tokens + (usage.reasoning_output_tokens ?? 0);
    chunks.push({
      type: 'usage',
      inputTokens: usage.input_tokens,
      outputTokens,
      ...(this.state.sessionId ? { sessionId: this.state.sessionId } : {}),
    });
    chunks.push({ type: 'message_stop' });
    return chunks;
  }

  // -------------------------------------------------------------------------
  // Item lifecycle dispatch
  // -------------------------------------------------------------------------

  private onItemLifecycle(
    item: ThreadItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    switch (item.type) {
      case 'agent_message':
        return this.onAgentMessage(item, phase);
      case 'reasoning':
        return this.onReasoning(item, phase);
      case 'command_execution':
        return this.onCommandExecution(item, phase);
      case 'file_change':
        return this.onFileChange(item, phase);
      case 'mcp_tool_call':
        return this.onMcpToolCall(item, phase);
      case 'web_search':
        return this.onWebSearch(item, phase);
      case 'todo_list':
        return this.onTodoList(item, phase);
      case 'error':
        return this.onErrorItem(item);
    }
  }

  // -- agent_message --------------------------------------------------------

  private onAgentMessage(
    item: AgentMessageItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    // Emit message_metadata with a generated UUID on first agent_message encounter.
    // The SDK's item.id is NOT unique across turns (resets to item_0 per turn),
    // so we generate a fresh UUID per turn for the persisted assistant identity.
    // This is stateless, requires no persistence, and survives restart/resume.
    if (!this.state.turnMetadataEmitted) {
      this.state.turnMetadataEmitted = true;
      chunks.push({
        type: 'message_metadata',
        messageId: `${this.state.sessionId ?? 'msg'}::${crypto.randomUUID()}`,
        timestamp: Date.now(),
        ...(this.state.sessionId ? { sessionId: this.state.sessionId } : {}),
      });
    }
    const content = takeSuffix(this.state.textLengths, item.id, item.text);

    // When structured output was requested, promote the final JSON text to a
    // backend_event so the chat surface renders the structured-output badge.
    if (phase === 'completed' && this.state.outputSchema) {
      const structuredOutput = tryParseJson(item.text);
      if (structuredOutput !== undefined) {
        chunks.push({
          type: 'backend_event',
          source: 'codex',
          event: 'structured_output',
          status: 'received',
          content: JSON.stringify(structuredOutput),
          metadata: {
            structuredOutput,
          },
        });
      }
    }

    if (phase === 'completed' && !content) {
      return chunks; // started/updated already emitted the full text
    }
    if (content) {
      chunks.push({ type: 'text', content });
    }
    return chunks;
  }

  // -- reasoning ------------------------------------------------------------

  private onReasoning(
    item: ReasoningItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    const content = takeSuffix(this.state.thinkingLengths, item.id, item.text);
    if (phase === 'completed' && !content) {
      return []; // started/updated already emitted the full thinking
    }
    return content ? [{ type: 'thinking', content, partId: item.id }] : [];
  }

  // -- command_execution ----------------------------------------------------

  private onCommandExecution(
    item: CommandExecutionItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    if (phase === 'started') {
      return [{
        type: 'tool_use',
        id: item.id,
        name: 'command_execution',
        kind: 'builtin',
        input: { command: item.command },
      }];
    }
    if (phase === 'completed') {
      return [{
        type: 'tool_result',
        toolUseId: item.id,
        content: item.aggregated_output,
        isError: item.status === 'failed',
      }];
    }
    // updated — progress
    return [{
      type: 'backend_event',
      source: 'codex',
      event: 'tool_progress',
      id: item.id,
      name: 'command_execution',
      status: item.status,
      ...(item.aggregated_output ? { content: item.aggregated_output } : {}),
    }];
  }

  // -- file_change ----------------------------------------------------------

  private onFileChange(
    item: FileChangeItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    if (phase === 'started') {
      const chunks: StreamChunk[] = item.changes.map(change => ({
        type: 'file_edited' as const,
        file: change.path,
      }));
      chunks.push({
        type: 'tool_use',
        id: item.id,
        name: 'file_change',
        kind: 'builtin',
        input: {
          changes: item.changes.map(c => ({ path: c.path, kind: c.kind })),
        },
      });
      return chunks;
    }
    if (phase === 'completed') {
      return [{
        type: 'tool_result',
        toolUseId: item.id,
        content: `Patch ${item.status}`,
        isError: item.status === 'failed',
      }];
    }
    return [];
  }

  // -- mcp_tool_call --------------------------------------------------------

  private onMcpToolCall(
    item: McpToolCallItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    if (phase === 'started') {
      return [{
        type: 'tool_use',
        id: item.id,
        name: item.tool,
        kind: 'mcp',
        input: (item.arguments as Record<string, unknown>) ?? {},
        toolMetadata: { server: item.server },
      }];
    }
    if (phase === 'completed') {
      const content = item.result
        ? JSON.stringify(item.result.content)
        : item.error?.message ?? '';
      return [{
        type: 'tool_result',
        toolUseId: item.id,
        content,
        isError: item.status === 'failed',
      }];
    }
    // updated — progress
    return [{
      type: 'backend_event',
      source: 'codex',
      event: 'tool_progress',
      id: item.id,
      name: item.tool,
      status: item.status,
    }];
  }

  // -- web_search -----------------------------------------------------------
  // Checkpoint-5C: promoted from diagnostic-only backend_event to visible
  // tool_use / tool_result so ordinary chat can render web_search blocks.

  private onWebSearch(
    item: WebSearchItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    if (phase === 'started') {
      return [{
        type: 'tool_use',
        id: item.id,
        name: 'web_search',
        kind: 'builtin',
        input: { query: item.query },
      }];
    }
    if (phase === 'completed') {
      return [{
        type: 'tool_result',
        toolUseId: item.id,
        content: 'Web search completed',
        isError: false,
      }];
    }
    return [{
      type: 'backend_event',
      source: 'codex',
      event: 'tool_progress',
      id: item.id,
      name: 'web_search',
      status: phase,
      content: item.query,
    }];
  }

  // -- todo_list ------------------------------------------------------------
  // Mapped as tool_use / tool_result so the existing SessionTodoCoordinator
  // path (OpenCode todowrite) can ingest Codex todo snapshots without
  // backend-specific UI.  tool_use is emitted on started, or on completed
  // if started was never seen (handles Codex CLI’s completed-only emission).

  private onTodoList(
    item: TodoListItem,
    phase: 'started' | 'updated' | 'completed',
  ): StreamChunk[] {
    const todos = item.items.map((todo) => ({
      content: todo.text,
      status: todo.completed ? 'completed' : ('pending' as const),
    }));

    const chunks: StreamChunk[] = [];

    if (phase === 'started' || phase === 'completed') {
      this.state.todoListToolUseEmitted.add(item.id);
      chunks.push({
        type: 'tool_use',
        id: item.id,
        name: 'todowrite',
        kind: 'builtin',
        input: { todos },
      });
    }

    if (phase === 'completed') {
      const completedCount = todos.filter((t) => t.status === 'completed').length;
      chunks.push({
        type: 'tool_result',
        toolUseId: item.id,
        content: `Todo list: ${todos.length} items (${completedCount} completed)`,
        isError: false,
      });
    }

    if (phase === 'updated') {
      chunks.push({
        type: 'backend_event',
        source: 'codex',
        event: 'tool_progress',
        id: item.id,
        name: 'todo_list',
        status: phase,
        metadata: { items: item.items },
      });
    }

    return chunks;
  }

  // -- error item -----------------------------------------------------------

  private onErrorItem(item: ErrorItem): StreamChunk[] {
    return [{ type: 'error', content: item.message }];
  }
}

/**
 * Factory function for creating a CodexStreamNormalizer.
 */
export function createCodexStreamNormalizer(
  options: CodexStreamNormalizerOptions = {},
): CodexStreamNormalizer {
  return new CodexStreamNormalizer(options);
}
