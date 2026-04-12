import type { SessionActivityStatus } from '../../../core/opencode';
import type { ChatMessage, Conversation, SessionTodo } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

const logger = createLogger('SessionTodoStateService');
const STALE_SESSION_TODO_TIMEOUT_MS = 120_000;

interface SessionTodoNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
}

export interface SessionTodoStateRuntime {
  isStreaming: boolean;
  sessionTodoSessionId: string | null;
  sessionTodos: SessionTodo[];
  sessionTodoFingerprint: string | null;
  sessionTodoLastChangedAt: number | null;
  sessionTodoSuppressedFingerprint: string | null;
  sessionTodoStaleNoticeFingerprint: string | null;
  sessionStatusSessionId: string | null;
  sessionStatus: SessionActivityStatus | null;
  sessionStatusLastChangedAt: number | null;
  backgroundTaskStartedAt: number | null;
}

export interface SessionTodoStateServiceHost {
  getTabRuntimeState(tabId: TabId | null): SessionTodoStateRuntime | null;
  getActiveTabId(): TabId | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  hasMatchingPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentAssistantNoticeMessage(options: SessionTodoNoticeMessageOptions): Promise<void>;
}

export class SessionTodoStateService {
  constructor(private readonly host: SessionTodoStateServiceHost) {}

  getTabSessionTodos(
    tabId: TabId | null = this.host.getActiveTabId(),
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionTodo[] {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return [];
    }

    if (sessionId && runtime.sessionTodoSessionId && runtime.sessionTodoSessionId !== sessionId) {
      return [];
    }

    return [...runtime.sessionTodos];
  }

  setTabSessionTodos(
    tabId: TabId | null,
    todos: SessionTodo[],
    sessionId: string | null = this.host.getSessionIdForTab(tabId),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.sessionTodoSessionId = sessionId;
    const normalizedTodos = this.normalizeSessionTodosForView(todos);
    const fingerprint = this.getSessionTodoFingerprint(normalizedTodos);
    if (runtime.sessionTodoFingerprint !== fingerprint) {
      runtime.sessionTodoFingerprint = fingerprint;
      runtime.sessionTodoLastChangedAt = Date.now();

      if (
        runtime.sessionTodoSuppressedFingerprint
        && runtime.sessionTodoSuppressedFingerprint !== fingerprint
      ) {
        logger.debug(`Clearing stale session todo suppression after snapshot changed: ${this.stringifyLogPayload({
          tabId,
          sessionId,
          fingerprint,
        })}`);
        runtime.sessionTodoSuppressedFingerprint = null;
        runtime.sessionTodoStaleNoticeFingerprint = null;
      }
    }

    if (!this.hasIncompleteTodos(normalizedTodos)) {
      runtime.sessionTodoSuppressedFingerprint = null;
      runtime.sessionTodoStaleNoticeFingerprint = null;
    } else {
      this.restorePersistedStaleSessionTodoSuppressionIfNeeded(
        tabId,
        sessionId,
        normalizedTodos,
        fingerprint,
      );
    }

    runtime.sessionTodos = this.shouldHideSuppressedTodoSnapshot(tabId, sessionId, fingerprint)
      ? []
      : normalizedTodos;

    if (tabId === this.host.getActiveTabId()) {
      this.host.renderSessionTodoDock(tabId);
    }

    this.reconcileStaleSessionTodoState(tabId);
  }

  getTabSessionStatus(
    tabId: TabId | null = this.host.getActiveTabId(),
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionActivityStatus | null {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return null;
    }

    if (sessionId && runtime.sessionStatusSessionId && runtime.sessionStatusSessionId !== sessionId) {
      return null;
    }

    return runtime.sessionStatus;
  }

  setTabSessionStatus(
    tabId: TabId | null,
    status: SessionActivityStatus | null,
    sessionId: string | null = this.host.getSessionIdForTab(tabId),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const previousFingerprint = this.getSessionStatusFingerprint(runtime.sessionStatus);
    const nextFingerprint = this.getSessionStatusFingerprint(status);

    runtime.sessionStatusSessionId = sessionId;
    runtime.sessionStatus = status;
    if (previousFingerprint !== nextFingerprint) {
      runtime.sessionStatusLastChangedAt = Date.now();
    }

    if (this.isSessionStatusLive(status) && runtime.sessionTodoSuppressedFingerprint) {
      logger.debug(`Clearing stale session todo suppression because session became live again: ${this.stringifyLogPayload({
        tabId,
        sessionId,
        status,
      })}`);
      runtime.sessionTodoSuppressedFingerprint = null;
      runtime.sessionTodoStaleNoticeFingerprint = null;
      if (tabId === this.host.getActiveTabId()) {
        this.host.renderSessionTodoDock(tabId);
      }
    }

    this.reconcileStaleSessionTodoState(tabId);
  }

  extractSessionTodosFromToolInput(input: Record<string, unknown>): SessionTodo[] {
    const rawTodos = Array.isArray(input.todos) ? input.todos : [];
    return this.normalizeSessionTodosForView(rawTodos);
  }

  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean {
    return todos.some((todo) => todo.status !== 'completed' && todo.status !== 'cancelled');
  }

  hasIncompleteTabSessionTodos(tabId: TabId | null = this.host.getActiveTabId()): boolean {
    return this.hasIncompleteTodos(this.getTabSessionTodos(tabId, this.host.getSessionIdForTab(tabId)));
  }

  isTabSessionLive(tabId: TabId | null = this.host.getActiveTabId()): boolean {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    if (runtime.isStreaming) {
      return true;
    }

    const status = this.getTabSessionStatus(tabId, this.host.getSessionIdForTab(tabId));
    return this.isSessionStatusLive(status);
  }

  suppressStaleSessionTodosIfNeeded(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): SessionTodo[] | null {
    const runtime = this.host.getTabRuntimeState(tabId);
    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!runtime || !sessionId || runtime.isStreaming) {
      return null;
    }

    const status = this.getTabSessionStatus(tabId, sessionId);
    if (this.isSessionStatusLive(status)) {
      return null;
    }

    const staleAgeMs = this.getTabSessionTodoStaleAgeMs(tabId);
    if (staleAgeMs === null || staleAgeMs < STALE_SESSION_TODO_TIMEOUT_MS) {
      return null;
    }

    const visibleTodos = this.getTabSessionTodos(tabId, sessionId);
    if (!this.hasIncompleteTodos(visibleTodos)) {
      return null;
    }

    const fingerprint = runtime.sessionTodoFingerprint ?? this.getSessionTodoFingerprint(visibleTodos);
    if (runtime.sessionTodoSuppressedFingerprint === fingerprint) {
      return null;
    }

    runtime.sessionTodoSuppressedFingerprint = fingerprint;
    runtime.sessionTodos = [];
    if (tabId === this.host.getActiveTabId()) {
      this.host.renderSessionTodoDock(tabId);
    }

    logger.debug(`Suppressing stale session todos after prolonged inactivity: ${this.stringifyLogPayload({
      tabId,
      sessionId,
      staleAgeMs,
      todoCount: visibleTodos.length,
      status,
      todos: visibleTodos.map((todo) => ({
        id: todo.id ?? null,
        status: todo.status,
        content: this.getLogPreview(todo.content, 120),
      })),
    })}`);

    return visibleTodos;
  }

  reconcileStaleSessionTodoState(tabId: TabId | null = this.host.getActiveTabId()): void {
    const staleTodos = this.suppressStaleSessionTodosIfNeeded(tabId);
    if (staleTodos && staleTodos.length > 0) {
      void this.appendStaleSessionTodoNotice(tabId, staleTodos);
    }
  }

  buildStaleSessionTodoNoticeContent(todos: readonly SessionTodo[]): string {
    const incompleteTodos = todos.filter((todo) =>
      todo.status !== 'completed' && todo.status !== 'cancelled',
    );
    if (incompleteTodos.length === 0) {
      return t('chat.todo.staleBody');
    }

    return [
      t('chat.todo.staleBody'),
      '',
      `**${t('chat.backgroundTask.taskListLabel')}**`,
      ...incompleteTodos.map((todo) => `- ${todo.content}`),
    ].join('\n');
  }

  private normalizeSessionTodosForView(todos: readonly unknown[]): SessionTodo[] {
    const normalized: SessionTodo[] = [];
    const seen = new Set<string>();

    for (const rawTodo of todos) {
      const todo = this.normalizeSessionTodoForView(rawTodo);
      if (!todo) {
        continue;
      }

      const dedupeKey = todo.id
        ? `id:${todo.id}`
        : `${todo.status}:${todo.content.trim().toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      normalized.push(todo);
    }

    return normalized;
  }

  private normalizeSessionTodoForView(todo: unknown): SessionTodo | null {
    if (!todo || typeof todo !== 'object') {
      return null;
    }

    const raw = todo as Record<string, unknown>;
    const content = typeof raw.content === 'string' ? raw.content.trim() : '';
    const status = raw.status;

    if (!content) {
      return null;
    }

    if (
      status !== 'pending'
      && status !== 'in_progress'
      && status !== 'completed'
      && status !== 'cancelled'
    ) {
      return null;
    }

    const priority = raw.priority;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined;

    return {
      id,
      content,
      status,
      priority: priority === 'low' || priority === 'medium' || priority === 'high'
        ? priority
        : undefined,
    };
  }

  private getSessionTodoFingerprint(todos: readonly SessionTodo[]): string {
    return JSON.stringify(todos.map((todo) => ({
      id: todo.id ?? null,
      content: todo.content,
      status: todo.status,
      priority: todo.priority ?? null,
    })));
  }

  private getSessionStatusFingerprint(status: SessionActivityStatus | null): string {
    return JSON.stringify(status ?? null);
  }

  private isSessionStatusLive(status: SessionActivityStatus | null | undefined): boolean {
    return status?.type === 'busy' || status?.type === 'retry';
  }

  private restorePersistedStaleSessionTodoSuppressionIfNeeded(
    tabId: TabId | null,
    sessionId: string | null,
    todos: SessionTodo[],
    fingerprint: string,
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (
      !runtime
      || !sessionId
      || runtime.isStreaming
      || runtime.sessionTodoSuppressedFingerprint
      || !this.hasIncompleteTodos(todos)
      || this.isSessionStatusLive(this.getTabSessionStatus(tabId, sessionId))
    ) {
      return;
    }

    const conversation = this.host.getConversationForTab(tabId);
    if (!conversation || conversation.openCodeSessionId !== sessionId) {
      return;
    }

    const content = this.buildStaleSessionTodoNoticeContent(todos);
    if (!this.host.hasMatchingPersistentAssistantNoticeMessage(
      t('chat.todo.staleTitle'),
      content,
      'warning',
      conversation,
    )) {
      return;
    }

    runtime.sessionTodoSuppressedFingerprint = fingerprint;
    runtime.sessionTodoStaleNoticeFingerprint = content;
    logger.debug(`Restored stale session todo suppression from persisted notice: ${this.stringifyLogPayload({
      tabId,
      sessionId,
      fingerprint,
    })}`);
  }

  private shouldHideSuppressedTodoSnapshot(
    tabId: TabId | null,
    sessionId: string | null,
    fingerprint: string,
  ): boolean {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || runtime.sessionTodoSuppressedFingerprint !== fingerprint) {
      return false;
    }

    const status = this.getTabSessionStatus(tabId, sessionId);
    return !runtime.isStreaming && !this.isSessionStatusLive(status);
  }

  private getTabSessionTodoStaleAgeMs(tabId: TabId | null = this.host.getActiveTabId()): number | null {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return null;
    }

    const lastActivity = Math.max(
      runtime.sessionTodoLastChangedAt ?? 0,
      runtime.sessionStatusLastChangedAt ?? 0,
      runtime.backgroundTaskStartedAt ?? 0,
    );
    if (lastActivity <= 0) {
      return null;
    }

    return Date.now() - lastActivity;
  }

  private async appendStaleSessionTodoNotice(
    tabId: TabId | null,
    todos: SessionTodo[],
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !tabId || tabId !== this.host.getActiveTabId()) {
      return;
    }

    const conversation = this.host.getConversationForTab(tabId);
    if (!conversation) {
      return;
    }

    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId || sessionId !== conversation.openCodeSessionId) {
      return;
    }

    const title = t('chat.todo.staleTitle');
    const content = this.buildStaleSessionTodoNoticeContent(todos);
    if (runtime.sessionTodoStaleNoticeFingerprint === content) {
      return;
    }

    if (this.host.hasMatchingPersistentAssistantNoticeMessage(title, content, 'warning', conversation)) {
      runtime.sessionTodoStaleNoticeFingerprint = content;
      return;
    }

    runtime.sessionTodoStaleNoticeFingerprint = content;
    try {
      await this.host.appendPersistentAssistantNoticeMessage({
        title,
        content,
        tone: 'warning',
      });
    } catch (error) {
      if (runtime.sessionTodoStaleNoticeFingerprint === content) {
        runtime.sessionTodoStaleNoticeFingerprint = null;
      }
      logger.warn('Failed to append stale session todo notice', error);
    }
  }

  private getLogPreview(text: string, maxLength = 180): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
  }

  private stringifyLogPayload(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return '[unserializable]';
    }
  }
}
