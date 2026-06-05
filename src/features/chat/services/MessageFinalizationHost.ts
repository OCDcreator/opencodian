import type {
  ChatMessage,
  Conversation,
  SessionTodo,
} from '../../../core/types';
import { summarizeChatMessageForDebug } from '../runtime/SendPipelineDebugSummaries';
import type { TabId } from '../tabs';
import { ClaudeUserMessageIdentityBackfillService, setBackfillPersistenceHost } from './ClaudeUserMessageIdentityBackfillService';
import type { ConversationWriteTicket } from './ConversationWriteSerializationService';
import type { WritableTabSessionPhase } from './TabSessionPhase';

export interface ShouldSyncAfterStreamOptions {
  streamCompleted: boolean;
  streamTimedOut: boolean;
  streamInterrupted: boolean;
  latestErrorMessage: string | null;
}

export function shouldSyncAfterStream(options: ShouldSyncAfterStreamOptions): boolean {
  return options.streamCompleted
    && !options.streamTimedOut
    && !options.streamInterrupted
    && !options.latestErrorMessage;
}

export interface FinalizeMessageOptions {
  conversation: Conversation;
  tabId: TabId | null;
  shouldSyncFromServer: boolean;
  editedFiles: string[];
  logStage(stage: string, payload?: Record<string, unknown>): void;
}

export interface MessageFinalizationSyncResult {
  messages: ChatMessage[];
  changed: boolean;
  fingerprint: string;
}

export interface AssistantErrorRenderOptions {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
  timestamp: number;
  content: string;
  modelId?: string;
}

export interface MessageFinalizationHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult | null>;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult>;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  appendTurnDiffNoticeIfNeeded(
    conversation: Conversation,
    editedFiles: string[],
    tabId?: TabId | null,
  ): Promise<void>;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionTodo[]>;
  createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
  commitConversationWrite(
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ): Promise<boolean>;
  setConversationSyncInFlight(tabId: TabId | null, value: boolean): void;
  setLastConversationSyncFingerprint(tabId: TabId | null, fingerprint: string): void;
  clearPendingEditedFiles(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  setActiveTabConversation(conversation: Conversation): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null;
  renderStreamError(options: AssistantErrorRenderOptions): void;
  formatCurrentSessionModelId(): string | undefined;
  updateConversationSyncRuntime(tabId: TabId | null, update: { fingerprint?: string | null }): void;
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
  scrollToBottom(options: { enableAutoScroll: boolean }): void;
  backfillClaudeUserMessageIdentities(conversation: Conversation): Promise<boolean>;
}

export interface MessageFinalizationHostDependencies {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult | null>;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult>;
  conversationIdentityRuntime: {
    getConversationSyncFingerprint(messages: ChatMessage[]): string;
  };
  conversationRenderService: {
    applySyncedConversationUpdate(
      previousMessages: ChatMessage[],
      nextMessages: ChatMessage[],
    ): Promise<void>;
  };
  backgroundTaskHost: {
    renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  };
  conversationNoticeCoordinator: {
    appendTurnDiffNoticeIfNeeded(
      conversation: Conversation,
      editedFiles: string[],
      tabId?: TabId | null,
    ): Promise<void>;
  };
  sessionTodoCoordinator: {
    refreshTabSessionTodos(
      tabId: TabId | null,
      sessionId: string | undefined,
      options: { suppressErrors?: boolean },
    ): Promise<SessionTodo[]>;
  };
  createConversationWriteTicket: (conversationId: string) => ConversationWriteTicket;
  commitConversationWrite: (
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ) => Promise<boolean>;
  conversationTabRuntimeCoordinator: {
    updateConversationSyncRuntime(
      tabId: TabId | null,
      update: { inFlight?: boolean; fingerprint?: string | null },
    ): void;
    clearPendingEditedFiles(tabId: TabId | null): void;
    transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
  };
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  tabConversationStateBridge: {
    syncActiveTabConversation(conversation: Conversation): void;
  };
  activeTabContextUsageCoordinator: {
    syncIdentity(): void;
    refreshFromServer(): Promise<void>;
  };
  assistantShellViewHostAdapter: {
    renderStreamError(options: AssistantErrorRenderOptions): void;
  };
  formatCurrentSessionModelId(): string | undefined;
  scrollToBottom(options: { enableAutoScroll: boolean }): void;
}

export function createMessageFinalizationHost(
  deps: MessageFinalizationHostDependencies,
): MessageFinalizationHost {
  setBackfillPersistenceHost({
    createConversationWriteTicket: deps.createConversationWriteTicket,
    commitConversationWrite: deps.commitConversationWrite,
  });
  const tabRuntime = deps.conversationTabRuntimeCoordinator;
  const ctxUsage = deps.activeTabContextUsageCoordinator;
  return {
    getCurrentConversation: () => deps.getCurrentConversation(),
    getActiveTabId: () => deps.getActiveTabId(),
    syncConversationMessagesFromCanonicalState: (conversation, tabId, reason) =>
      deps.syncConversationMessagesFromCanonicalState(conversation, tabId, reason),
    syncConversationMessagesFromServer: (conversation, tabId, reason) =>
      deps.syncConversationMessagesFromServer(conversation, tabId, reason),
    getConversationSyncFingerprint: (messages) =>
      deps.conversationIdentityRuntime.getConversationSyncFingerprint(messages),
    applySyncedConversationUpdate: (previousMessages, nextMessages) =>
      deps.conversationRenderService.applySyncedConversationUpdate(previousMessages, nextMessages),
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      deps.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
    appendTurnDiffNoticeIfNeeded: (conversation, editedFiles, tabId) =>
      deps.conversationNoticeCoordinator.appendTurnDiffNoticeIfNeeded(conversation, editedFiles, tabId),
    refreshTabSessionTodos: (tabId, sessionId, options) =>
      deps.sessionTodoCoordinator.refreshTabSessionTodos(tabId, sessionId, options),
    createConversationWriteTicket: (conversationId) =>
      deps.createConversationWriteTicket(conversationId),
    commitConversationWrite: (conversation, ticket, reason, write) =>
      deps.commitConversationWrite(conversation, ticket, reason, write),
    setConversationSyncInFlight: (tabId, value) => {
      tabRuntime.updateConversationSyncRuntime(tabId, { inFlight: value });
    },
    setLastConversationSyncFingerprint: (tabId, fingerprint) => {
      tabRuntime.updateConversationSyncRuntime(tabId, { fingerprint });
    },
    clearPendingEditedFiles: (tabId) => tabRuntime.clearPendingEditedFiles(tabId),
    setTabNeedsAttention: (tabId, needsAttention) =>
      deps.setTabNeedsAttention(tabId, needsAttention),
    setActiveTabConversation: (conversation) =>
      deps.tabConversationStateBridge.syncActiveTabConversation(conversation),
    syncActiveTabContextUsageIdentity: () => ctxUsage.syncIdentity(),
    refreshActiveTabContextUsageFromServer: () => ctxUsage.refreshFromServer(),
    summarizeChatMessageForDebug: (message) => summarizeChatMessageForDebug(message),
    renderStreamError: (options) =>
      deps.assistantShellViewHostAdapter.renderStreamError(options),
    formatCurrentSessionModelId: () => deps.formatCurrentSessionModelId(),
    updateConversationSyncRuntime: (tabId, update) =>
      tabRuntime.updateConversationSyncRuntime(tabId, update),
    transitionTabSessionLifecycle: (tabId, phase, reason) =>
      tabRuntime.transitionTabSessionLifecycle(tabId, phase, reason),
    scrollToBottom: (options) => deps.scrollToBottom(options),
    backfillClaudeUserMessageIdentities: (conversation) =>
      new ClaudeUserMessageIdentityBackfillService(
        deps,
      ).backfill(conversation),
  };
}
