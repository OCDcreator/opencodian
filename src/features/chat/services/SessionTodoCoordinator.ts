import { Notice } from 'obsidian';

import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  ChatMessage,
  ContentBlock,
  Conversation,
  SessionTodo,
  ToolCallInfo,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger, getToolIdentity } from '../../../shared';
import type { TabId } from '../tabs';
import {
  SessionTodoDockCoordinator,
  type SessionTodoDockCoordinatorRuntimeState,
} from './SessionTodoDockCoordinator';
import {
  type SessionTodoStateRuntime,
  SessionTodoStateService,
} from './SessionTodoStateService';

const logger = createLogger('SessionTodoCoordinator');

// ── Claude Task* tool result parsing ───────────────────────────────────
// Claude Code uses TaskCreate/TaskUpdate (not TodoWrite). TaskCreate
// result strings like "Task #1 created successfully: subject" are parsed
// to extract the sequential task number. This parsing is inherently
// fragile — if the format changes the regex will silently fail and we
// fall back to a synthetic ID derived from the tool call ID (prefixed
// with "tc_" to avoid collisions with real numeric IDs).
const TASK_CREATE_RESULT_PATTERN = /Task\s+#(\d+)/i;

type ClaudeTaskStatus = SessionTodo['status'];

const VALID_CLAUDE_TASK_STATUSES = new Set<string>([
  'pending',
  'in_progress',
  'completed',
]);

/**
 * Per-session state for Claude Code Task* tool tracking.
 * Each backend session gets its own isolated registry + counter,
 * preventing cross-tab / cross-session task leakage.
 */
interface ClaudeTaskSessionState {
  /** Task entries keyed by task ID (numeric string or synthetic "tc_*"). */
  readonly tasks: Map<string, SessionTodo>;
}

export interface SessionTodoCoordinatorRuntimeState
  extends SessionTodoStateRuntime,
    SessionTodoDockCoordinatorRuntimeState {
  todoRequestId: number;
  statusRequestId: number;
}

interface SessionTodoNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
}

export interface SessionTodoCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): SessionTodoCoordinatorRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentAssistantNoticeMessage(options: SessionTodoNoticeMessageOptions): Promise<void>;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export class SessionTodoCoordinator {
  private readonly stateService: SessionTodoStateService;
  private readonly dockCoordinator: SessionTodoDockCoordinator;

  /**
   * Per-session Claude Code Task* state. Keyed by backend sessionId so
   * that different tabs/sessions maintain independent task registries.
   * Entries are removed when their session is reset.
   */
  private readonly claudeTaskSessionStates = new Map<string, ClaudeTaskSessionState>();

  constructor(private readonly host: SessionTodoCoordinatorHost) {
    this.stateService = new SessionTodoStateService({
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getActiveTabId: () => host.getActiveTabId(),
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
      getConversationForTab: (tabId) => host.getConversationForTab(tabId),
      renderSessionTodoDock: (tabId) => {
        this.render(tabId);
      },
      hasMatchingPersistentAssistantNoticeMessage: (
        title,
        content,
        tone,
        conversation,
      ) => host.hasMatchingPersistentAssistantNoticeMessage(title, content, tone, conversation),
      appendPersistentAssistantNoticeMessage: (options) =>
        host.appendPersistentAssistantNoticeMessage(options),
    });

    this.dockCoordinator = new SessionTodoDockCoordinator({
      getActiveTabId: () => host.getActiveTabId(),
      getCurrentConversationSessionId: () => host.getCurrentConversationSessionId(),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getTabSessionTodos: (tabId, sessionId) =>
        this.stateService.getTabSessionTodos(tabId, sessionId),
    });
  }

  attach(parentEl: HTMLElement): void {
    this.dockCoordinator.attach(parentEl);
  }

  render(tabId: TabId | null = this.host.getActiveTabId()): void {
    this.dockCoordinator.render(tabId);
  }

  updateForTab(tabId: TabId): void {
    this.dockCoordinator.updateForTab(tabId);
  }

  destroy(): void {
    this.dockCoordinator.destroy();
  }

  getTabSessionTodos(
    tabId: TabId | null,
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionTodo[] {
    return this.stateService.getTabSessionTodos(tabId, sessionId);
  }

  getTabSessionStatus(
    tabId: TabId | null,
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionActivityStatus | null {
    return this.stateService.getTabSessionStatus(tabId, sessionId);
  }

  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean {
    return this.stateService.hasIncompleteTodos(todos);
  }

  hasIncompleteTabSessionTodos(tabId: TabId | null = this.host.getActiveTabId()): boolean {
    return this.stateService.hasIncompleteTabSessionTodos(tabId);
  }

  reconcileStaleSessionTodoState(tabId: TabId | null = this.host.getActiveTabId()): void {
    this.stateService.reconcileStaleSessionTodoState(tabId);
  }

  async refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionTodo[]> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.render(tabId);
      return [];
    }

    // Backend gate: getSessionTodos() is an OpenCode-only server API.
    // Claude Code sessions derive todo snapshots purely from stream tool calls
    // (applyStreamingTodoSnapshotFromTool); this refresh path is intentionally
    // skipped for non-OpenCode backends.
    const conversation = this.host.getConversationForTab(tabId);
    const backend = conversation?.backend ?? 'opencode';
    if (backend !== 'opencode') {
      this.render(tabId);
      return [];
    }

    const requestId = runtime.todoRequestId + 1;
    runtime.todoRequestId = requestId;

    try {
      const todos = await this.host.getSessionTodos(sessionId);
      const latestRuntime = this.host.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.todoRequestId !== requestId) {
        return this.getTabSessionTodos(tabId);
      }

      this.writeSessionTodos(tabId, sessionId, todos);
      this.host.reconcileBackgroundTaskLiveSignals(tabId);
      return todos;
    } catch (error) {
      logger.debug('Failed to refresh session todos', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.getTabSessionTodos(tabId);
    }
  }

  async refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionActivityStatus | null> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.writeSessionStatus(tabId, sessionId ?? null, null);
      return null;
    }

    // Backend gate: getSessionStatuses() is an OpenCode-only server API.
    // Claude Code sessions do not have a server-side session status endpoint.
    const conversation = this.host.getConversationForTab(tabId);
    const backend = conversation?.backend ?? 'opencode';
    if (backend !== 'opencode') {
      this.writeSessionStatus(tabId, sessionId, null);
      return null;
    }

    const requestId = runtime.statusRequestId + 1;
    runtime.statusRequestId = requestId;

    try {
      const statuses = await this.host.getSessionStatuses();
      const latestRuntime = this.host.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.statusRequestId !== requestId) {
        return this.getTabSessionStatus(tabId, sessionId);
      }

      const status = statuses[sessionId] ?? { type: 'idle' as const };
      this.writeSessionStatus(tabId, sessionId, status);
      this.host.reconcileBackgroundTaskLiveSignals(tabId);
      return status;
    } catch (error) {
      logger.debug('Failed to refresh session status', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.getTabSessionStatus(tabId, sessionId);
    }
  }

  applySessionTodoUpdate(
    tabId: TabId | null,
    sessionId: string,
    todos: SessionTodo[],
  ): void {
    this.writeSessionTodos(tabId, sessionId, todos);
  }

  applySessionStatusUpdate(
    tabId: TabId | null,
    sessionId: string,
    status: SessionActivityStatus,
  ): void {
    this.writeSessionStatus(tabId, sessionId, status);
  }

  applyStreamingTodoSnapshotFromTool(
    toolCall: ToolCallInfo,
    tabId: TabId | null,
  ): void {
    // ── OpenCode TodoWrite path (snapshot model) ─────────────────────
    if (toolCall.name === 'todowrite') {
      const todos = this.stateService.extractSessionTodosFromToolInput(toolCall.input ?? {});
      if (todos.length === 0) {
        return;
      }

      const sessionId = this.host.getSessionIdForTab(tabId);
      if (!sessionId) {
        return;
      }

      this.writeSessionTodos(tabId, sessionId, todos);
      return;
    }

    // ── Claude Code Task* path (incremental CRUD model) ──────────────
    const normalizedName = getToolIdentity(toolCall.name).normalizedName;
    if (normalizedName === 'task_create') {
      this.applyClaudeTaskCreate(toolCall, tabId);
    } else if (normalizedName === 'task_update') {
      this.applyClaudeTaskUpdate(toolCall, tabId);
    }
  }

  private applyClaudeTaskCreate(toolCall: ToolCallInfo, tabId: TabId | null): void {
    // Only process when the tool has completed and result is available.
    // At tool start, result is undefined and we can't extract the task number.
    if (toolCall.status !== 'completed' && toolCall.status !== 'error') {
      return;
    }

    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId) {
      return;
    }

    const input = toolCall.input ?? {};
    const subject = typeof input.subject === 'string' && input.subject.trim()
      ? input.subject.trim()
      : '';

    if (!subject) {
      return;
    }

    const sessionState = this.getOrCreateClaudeTaskSessionState(sessionId);

    // Extract task number from result string.
    // Result format: "Task #N created successfully: subject"
    // Fragility: this regex depends on Claude's result string format.
    // Fallback: synthetic ID derived from tool call ID (always unique).
    const taskId = this.extractClaudeTaskId(toolCall.result, toolCall.id, sessionState.tasks);

    const todo: SessionTodo = {
      id: taskId,
      content: subject,
      status: 'pending' as ClaudeTaskStatus,
    };

    sessionState.tasks.set(taskId, todo);
    this.flushClaudeTaskRegistry(tabId, sessionId, sessionState);
  }

  private applyClaudeTaskUpdate(toolCall: ToolCallInfo, tabId: TabId | null): void {
    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId) {
      return;
    }

    const input = toolCall.input ?? {};
    const taskId = String(input.taskId ?? '').trim();
    if (!taskId) {
      return;
    }

    const rawStatus = typeof input.status === 'string' ? input.status.trim().toLowerCase() : '';
    const status: ClaudeTaskStatus | undefined = VALID_CLAUDE_TASK_STATUSES.has(rawStatus)
      ? rawStatus as ClaudeTaskStatus
      : undefined;

    const sessionState = this.getOrCreateClaudeTaskSessionState(sessionId);
    const existing = sessionState.tasks.get(taskId);
    if (existing) {
      sessionState.tasks.set(taskId, {
        ...existing,
        ...(status ? { status } : {}),
        ...(typeof input.subject === 'string' && input.subject.trim() ? { content: input.subject.trim() } : {}),
      });
    } else if (status) {
      // TaskUpdate arrived before TaskCreate result (edge case): seed entry.
      sessionState.tasks.set(taskId, {
        id: taskId,
        content: typeof input.subject === 'string' && input.subject.trim()
          ? input.subject.trim()
          : `Task #${taskId}`,
        status,
      });
    }

    this.flushClaudeTaskRegistry(tabId, sessionId, sessionState);
  }

  /**
   * Parse the task number from a TaskCreate result string.
   * Returns a string like "1", "2", etc. for real results.
   *
   * Falls back to a synthetic ID derived from the tool call ID when the
   * result format is unrecognized. The synthetic ID is prefixed with "tc_"
   * so it can never collide with real numeric task IDs. It is also checked
   * against the existing registry to guarantee uniqueness.
   */
  private extractClaudeTaskId(
    result: string | undefined,
    toolCallId: string,
    existingTasks: Map<string, SessionTodo>,
  ): string {
    if (typeof result === 'string') {
      const match = result.match(TASK_CREATE_RESULT_PATTERN);
      if (match?.[1]) {
        return match[1];
      }
    }

    // Derive from tool call ID — guaranteed unique per tool invocation.
    // Prefix with "tc_" to avoid colliding with real numeric IDs.
    const suffix = toolCallId.length > 8 ? toolCallId.slice(-8) : toolCallId;
    const candidate = `tc_${suffix}`;

    // Guard: ensure no collision with existing entries (defensive).
    if (!existingTasks.has(candidate)) {
      return candidate;
    }

    // Extremely unlikely collision on tool-call-derived ID. Append index.
    let idx = 2;
    while (existingTasks.has(`${candidate}_${idx}`)) {
      idx++;
    }
    return `${candidate}_${idx}`;
  }

  /**
   * Get or create the per-session Claude task state for the given sessionId.
   */
  private getOrCreateClaudeTaskSessionState(sessionId: string): ClaudeTaskSessionState {
    let state = this.claudeTaskSessionStates.get(sessionId);
    if (!state) {
      state = { tasks: new Map() };
      this.claudeTaskSessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Write the accumulated Claude task registry to the session todo state
   * and render the dock.
   */
  private flushClaudeTaskRegistry(
    tabId: TabId | null,
    sessionId: string,
    sessionState: ClaudeTaskSessionState,
  ): void {
    const todos = [...sessionState.tasks.values()];
    this.writeSessionTodos(tabId, sessionId, todos);
  }

  /**
   * Rebuild Claude Code Task* state from persisted message history.
   *
   * Called during conversation hydration (reload) so that historical
   * TaskCreate/TaskUpdate tool calls stored in contentBlocks are replayed
   * into the in-memory claudeTaskSessionStates. Without this, the task
   * registry is empty after reload and subsequent TaskUpdate-only turns
   * cannot find their target entries.
   *
   * Idempotent: skips rehydration when the session already has entries
   * (e.g. live streaming already populated the registry).
   */
  rehydrateClaudeTasksFromMessages(tabId: TabId | null, messages: ChatMessage[]): void {
    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId) {
      return;
    }

    // Skip if already populated (live streaming or prior rehydration).
    const existingState = this.claudeTaskSessionStates.get(sessionId);
    if (existingState && existingState.tasks.size > 0) {
      return;
    }

    for (const message of messages) {
      // Prefer contentBlocks (structured persisted format).
      if (message.contentBlocks && message.contentBlocks.length > 0) {
        for (const block of message.contentBlocks) {
          if (block.type !== 'tool_use') {
            continue;
          }

          const normalizedName = getToolIdentity(block.toolName ?? '').normalizedName;
          if (normalizedName !== 'task_create' && normalizedName !== 'task_update') {
            continue;
          }

          const toolCall = this.contentBlockToToolCallInfo(block);
          this.applyStreamingTodoSnapshotFromTool(toolCall, tabId);
        }
      } else if (message.toolCalls && message.toolCalls.length > 0) {
        // Fallback: scan toolCalls array when contentBlocks are absent.
        // message.toolCalls uses chat.ts ToolCallInfo (optional status);
        // normalize to tools.ts ToolCallInfo (required status).
        for (const tc of message.toolCalls) {
          const normalizedName = getToolIdentity(tc.name).normalizedName;
          if (normalizedName !== 'task_create' && normalizedName !== 'task_update') {
            continue;
          }

          this.applyStreamingTodoSnapshotFromTool(
            { ...tc, status: tc.status ?? 'completed' },
            tabId,
          );
        }
      }
    }

    logger.debug(
      `[claude-task-rehydrate] rehydrated session=${sessionId}, ` +
      `entries=${this.claudeTaskSessionStates.get(sessionId)?.tasks.size ?? 0}, ` +
      `messages scanned=${messages.length}`,
    );
  }

  /**
   * Convert a persisted ContentBlock (tool_use) into a ToolCallInfo
   * suitable for the existing streaming apply methods.
   */
  private contentBlockToToolCallInfo(block: ContentBlock): ToolCallInfo {
    const toolCall: ToolCallInfo = {
      id: block.toolId ?? `rehydrate-${Math.random().toString(36).slice(2, 10)}`,
      name: block.toolName ?? '',
      toolSourceKey: block.toolSourceKey,
      kind: block.toolKind,
      input: block.toolInput ?? {},
      toolMetadata: block.toolMetadata,
      status: block.toolStatus ?? 'completed',
      result: block.toolResult,
      resultVisibility: block.toolResultVisibility,
    };
    return toolCall;
  }

  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void {
    if (sessionId) {
      this.claudeTaskSessionStates.delete(sessionId);
    }
    this.writeSessionTodos(tabId, sessionId, []);
    this.writeSessionStatus(tabId, sessionId, null);
    const conversation = this.host.getConversationForTab(tabId);
    if (
      sessionId
      && conversation
      && (conversation.backend ?? 'opencode') === 'claude-code'
      && (conversation.messages?.length ?? 0) > 0
    ) {
      this.rehydrateClaudeTasksFromMessages(tabId, conversation.messages);
    }
  }

  clearTabSessionState(tabId: TabId | null): void {
    this.resetTabSessionState(tabId, null);
  }

  private writeSessionTodos(
    tabId: TabId | null,
    sessionId: string | null,
    todos: SessionTodo[],
  ): void {
    this.stateService.setTabSessionTodos(tabId, todos, sessionId);
  }

  private writeSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
    status: SessionActivityStatus | null,
  ): void {
    this.stateService.setTabSessionStatus(tabId, status, sessionId);
  }
}
