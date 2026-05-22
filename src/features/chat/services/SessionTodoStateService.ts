import type { SessionActivityStatus } from '../../../core/opencode';
import { type ChatMessage, type Conversation, getConversationBackendSessionId, type SessionTodo } from '../../../core/types';
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

interface SessionTodoSnapshot {
  todos: SessionTodo[];
  fingerprint: string;
  hasIncompleteTodos: boolean;
}

interface StaleSessionTodoSuppressionCandidate {
  runtime: SessionTodoStateRuntime;
  sessionId: string;
  status: SessionActivityStatus | null;
  staleAgeMs: number;
  visibleTodos: SessionTodo[];
  fingerprint: string;
}

interface StaleSessionTodoNoticeTarget {
  runtime: SessionTodoStateRuntime;
  conversation: Conversation;
  title: string;
  content: string;
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
    const snapshot = this.createSessionTodoSnapshot(todos);
    runtime.sessionTodos = this.applySessionTodoSnapshotState(tabId, sessionId, runtime, snapshot);

    if (this.isActiveTab(tabId)) {
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
      this.clearStaleSessionTodoSuppression(runtime);
      if (this.isActiveTab(tabId)) {
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
    const candidate = this.getStaleSessionTodoSuppressionCandidate(tabId);
    if (!candidate) {
      return null;
    }

    this.applyStaleSessionTodoSuppression(tabId, candidate);
    return candidate.visibleTodos;
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

  private createSessionTodoSnapshot(todos: readonly unknown[]): SessionTodoSnapshot {
    const normalizedTodos = this.normalizeSessionTodosForView(todos);
    return {
      todos: normalizedTodos,
      fingerprint: this.getSessionTodoFingerprint(normalizedTodos),
      hasIncompleteTodos: this.hasIncompleteTodos(normalizedTodos),
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

  private applySessionTodoSnapshotState(
    tabId: TabId | null,
    sessionId: string | null,
    runtime: SessionTodoStateRuntime,
    snapshot: SessionTodoSnapshot,
  ): SessionTodo[] {
    this.syncSessionTodoFingerprint(tabId, sessionId, runtime, snapshot.fingerprint);
    if (!snapshot.hasIncompleteTodos) {
      this.clearStaleSessionTodoSuppression(runtime);
      return snapshot.todos;
    }

    this.restorePersistedStaleSessionTodoSuppressionIfNeeded(
      tabId,
      sessionId,
      snapshot,
    );

    return this.shouldHideSuppressedTodoSnapshot(tabId, sessionId, runtime, snapshot.fingerprint)
      ? []
      : snapshot.todos;
  }

  private syncSessionTodoFingerprint(
    tabId: TabId | null,
    sessionId: string | null,
    runtime: SessionTodoStateRuntime,
    fingerprint: string,
  ): void {
    if (runtime.sessionTodoFingerprint === fingerprint) {
      return;
    }

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
      this.clearStaleSessionTodoSuppression(runtime);
    }
  }

  private restorePersistedStaleSessionTodoSuppressionIfNeeded(
    tabId: TabId | null,
    sessionId: string | null,
    snapshot: SessionTodoSnapshot,
  ): void {
    if (!sessionId || !snapshot.hasIncompleteTodos) {
      return;
    }

    const target = this.getStaleSessionTodoNoticeTarget(tabId, sessionId, snapshot.todos);
    if (
      !target
      || target.runtime.isStreaming
      || target.runtime.sessionTodoSuppressedFingerprint
      || this.isSessionStatusLive(this.getTabSessionStatus(tabId, sessionId))
    ) {
      return;
    }

    if (!this.host.hasMatchingPersistentAssistantNoticeMessage(
      target.title,
      target.content,
      'warning',
      target.conversation,
    )) {
      return;
    }

    target.runtime.sessionTodoSuppressedFingerprint = snapshot.fingerprint;
    target.runtime.sessionTodoStaleNoticeFingerprint = target.content;
    logger.debug(`Restored stale session todo suppression from persisted notice: ${this.stringifyLogPayload({
      tabId,
      sessionId,
      fingerprint: snapshot.fingerprint,
    })}`);
  }

  private shouldHideSuppressedTodoSnapshot(
    tabId: TabId | null,
    sessionId: string | null,
    runtime: SessionTodoStateRuntime,
    fingerprint: string,
  ): boolean {
    if (runtime.sessionTodoSuppressedFingerprint !== fingerprint) {
      return false;
    }

    const status = this.getTabSessionStatus(tabId, sessionId);
    return !runtime.isStreaming && !this.isSessionStatusLive(status);
  }

  private getStaleSessionTodoSuppressionCandidate(
    tabId: TabId | null,
  ): StaleSessionTodoSuppressionCandidate | null {
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

    return {
      runtime,
      sessionId,
      status,
      staleAgeMs,
      visibleTodos,
      fingerprint,
    };
  }

  private applyStaleSessionTodoSuppression(
    tabId: TabId | null,
    candidate: StaleSessionTodoSuppressionCandidate,
  ): void {
    candidate.runtime.sessionTodoSuppressedFingerprint = candidate.fingerprint;
    candidate.runtime.sessionTodos = [];
    if (this.isActiveTab(tabId)) {
      this.host.renderSessionTodoDock(tabId);
    }

    logger.debug(`Suppressing stale session todos after prolonged inactivity: ${this.stringifyLogPayload({
      tabId,
      sessionId: candidate.sessionId,
      staleAgeMs: candidate.staleAgeMs,
      todoCount: candidate.visibleTodos.length,
      status: candidate.status,
      todos: candidate.visibleTodos.map((todo) => ({
        id: todo.id ?? null,
        status: todo.status,
        content: this.getLogPreview(todo.content, 120),
      })),
    })}`);
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
    const target = this.getStaleSessionTodoNoticeTarget(
      tabId,
      this.host.getSessionIdForTab(tabId),
      todos,
      true,
    );
    if (!target || target.runtime.sessionTodoStaleNoticeFingerprint === target.content) {
      return;
    }

    if (this.host.hasMatchingPersistentAssistantNoticeMessage(
      target.title,
      target.content,
      'warning',
      target.conversation,
    )) {
      target.runtime.sessionTodoStaleNoticeFingerprint = target.content;
      return;
    }

    target.runtime.sessionTodoStaleNoticeFingerprint = target.content;
    try {
      await this.host.appendPersistentAssistantNoticeMessage({
        title: target.title,
        content: target.content,
        tone: 'warning',
      });
    } catch (error) {
      if (target.runtime.sessionTodoStaleNoticeFingerprint === target.content) {
        target.runtime.sessionTodoStaleNoticeFingerprint = null;
      }
      logger.warn('Failed to append stale session todo notice', error);
    }
  }

  private getStaleSessionTodoNoticeTarget(
    tabId: TabId | null,
    sessionId: string | null,
    todos: readonly SessionTodo[],
    requireActiveTab = false,
  ): StaleSessionTodoNoticeTarget | null {
    if (!sessionId) {
      return null;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || (requireActiveTab && !this.isActiveTab(tabId))) {
      return null;
    }

    const conversation = this.host.getConversationForTab(tabId);
    if (!conversation || sessionId !== getConversationBackendSessionId(conversation)) {
      return null;
    }

    return {
      runtime,
      conversation,
      title: t('chat.todo.staleTitle'),
      content: this.buildStaleSessionTodoNoticeContent(todos),
    };
  }

  private isActiveTab(tabId: TabId | null): boolean {
    return Boolean(tabId) && tabId === this.host.getActiveTabId();
  }

  private clearStaleSessionTodoSuppression(runtime: SessionTodoStateRuntime): void {
    runtime.sessionTodoSuppressedFingerprint = null;
    runtime.sessionTodoStaleNoticeFingerprint = null;
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
