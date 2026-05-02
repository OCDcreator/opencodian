import type {
  ChatMessage,
  Conversation,
  PersistedTabState,
} from '../../../core/types';
import { t } from '../../../i18n';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
} from '../../../shared';
import type { ForkTarget } from '../../../shared/modals';
import { cloneMessagesBeforeForkTarget } from '../forkMessages';
import type {
  RestoredTabState,
  TabData,
  TabId,
  TabModelOverride,
} from '../tabs';
import type { LoadConversationOptions } from './ConversationViewStateService';

const logger = createLogger('ConversationLoadRecoveryCoordinator');

interface ConversationLoadRecoveryTabManager {
  canCreateTab(): boolean;
  createTab(conversation?: Pick<Conversation, 'id' | 'title'> | null): TabData | null;
  getActiveTabModelOverride(): TabModelOverride | null;
  setActiveTabModelOverride(modelOverride: TabModelOverride | null): void;
  restoreTabs(
    items: RestoredTabState[],
    activeTabIndex: number,
    conversations: ReadonlyMap<string, Pick<Conversation, 'id' | 'title'>>,
  ): TabData | null;
}

interface ForkConversationInitialState {
  title: string;
  messages: ChatMessage[];
  currentNote?: string;
  externalContextPaths?: string[];
}

export interface ConversationLoadRecoveryHost {
  isActiveTabStreaming(): boolean;
  getCurrentConversation(): Conversation | null;
  getTabManager(): ConversationLoadRecoveryTabManager | null;
  getMaxTabs(): number;
  getPersistedTabState(): PersistedTabState;
  resetPersistedTabState(): void;
  persistTabState(options?: { flush?: boolean }): void;
  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  createConversation(): Promise<Conversation>;
  chooseForkTarget(): Promise<ForkTarget | null>;
  confirmRewind(): boolean;
  revertSession(sessionId: string, messageId: string): Promise<boolean>;
  unrevertSession(sessionId: string): Promise<boolean>;
  forkSession(sessionId: string, messageId: string): Promise<{ id: string }>;
  createConversationFromSession(
    sessionId: string,
    initial: ForkConversationInitialState,
  ): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  syncActiveTabConversation(conversation: Conversation): void;
  updateModelSelectorDisplay(): void;
  showNotice(message: string): void;
}

/** Flat dependency object passed from OpenCodianView to assemble a ConversationLoadRecoveryHost. */
export interface ConversationLoadRecoveryHostDependencies {
  isActiveTabStreaming(): boolean;
  getCurrentConversation(): Conversation | null;
  getTabManager(): ConversationLoadRecoveryTabManager | null;
  getMaxTabs(): number;
  getPersistedTabState(): PersistedTabState;
  resetPersistedTabState(): void;
  persistTabState(options?: { flush?: boolean }): void;
  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  createConversation(): Promise<Conversation>;
  chooseForkTarget(): Promise<ForkTarget | null>;
  confirmRewind(): boolean;
  revertSession(sessionId: string, messageId: string): Promise<boolean>;
  unrevertSession(sessionId: string): Promise<boolean>;
  forkSession(sessionId: string, messageId: string): Promise<{ id: string }>;
  createConversationFromSession(
    sessionId: string,
    initial: ForkConversationInitialState,
  ): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  syncActiveTabConversation(conversation: Conversation): void;
  updateModelSelectorDisplay(): void;
  showNotice(message: string): void;
}

export function createConversationLoadRecoveryHost(
  deps: ConversationLoadRecoveryHostDependencies,
): ConversationLoadRecoveryHost {
  return {
    isActiveTabStreaming: () => deps.isActiveTabStreaming(),
    getCurrentConversation: () => deps.getCurrentConversation(),
    getTabManager: () => deps.getTabManager(),
    getMaxTabs: () => deps.getMaxTabs(),
    getPersistedTabState: () => deps.getPersistedTabState(),
    resetPersistedTabState: () => deps.resetPersistedTabState(),
    persistTabState: (options) => deps.persistTabState(options),
    loadConversations: () => deps.loadConversations(),
    getConversations: () => deps.getConversations(),
    createConversation: () => deps.createConversation(),
    chooseForkTarget: () => deps.chooseForkTarget(),
    confirmRewind: () => deps.confirmRewind(),
    revertSession: (sessionId, messageId) => deps.revertSession(sessionId, messageId),
    unrevertSession: (sessionId) => deps.unrevertSession(sessionId),
    forkSession: (sessionId, messageId) => deps.forkSession(sessionId, messageId),
    createConversationFromSession: (sessionId, initial) =>
      deps.createConversationFromSession(sessionId, initial),
    deleteConversation: (conversationId) => deps.deleteConversation(conversationId),
    syncActiveTabConversation: (conversation) => deps.syncActiveTabConversation(conversation),
    updateModelSelectorDisplay: () => deps.updateModelSelectorDisplay(),
    showNotice: (message) => deps.showNotice(message),
  };
}

export interface ConversationLoadRecoveryPort {
  activateTab(tabId: TabId): Promise<void>;
  createConversationInNewTab(): Promise<void>;
  createConversationInCurrentTab(): Promise<void>;
  loadConversation(id: string, options?: LoadConversationOptions): Promise<void>;
  deleteConversationsAndRecover(conversationIds: readonly string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: readonly string[]): Promise<void>;
}

export class ConversationLoadRecoveryCoordinator {
  constructor(
    private readonly host: ConversationLoadRecoveryHost,
    private readonly port: ConversationLoadRecoveryPort,
  ) {}

  async activateTab(tabId: TabId): Promise<void> {
    await this.port.activateTab(tabId);
  }

  async createConversationInNewTab(): Promise<void> {
    await this.port.createConversationInNewTab();
  }

  async createConversationInCurrentTab(): Promise<void> {
    await this.port.createConversationInCurrentTab();
  }

  async loadConversation(
    id: string,
    options: LoadConversationOptions = {},
  ): Promise<void> {
    await this.port.loadConversation(id, options);
  }

  async deleteConversationsAndRecover(conversationIds: readonly string[]): Promise<void> {
    await this.port.deleteConversationsAndRecover(conversationIds);
  }

  async deleteAllConversationsAndReset(conversationIds: readonly string[]): Promise<void> {
    await this.port.deleteAllConversationsAndReset(conversationIds);
  }

  async initializeFirstTab(): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    const startedAt = getPerformanceTimestampMs();
    const stepSummaries: string[] = [];
    const measureStep = async <T>(step: string, operation: () => Promise<T> | T): Promise<T> => {
      const stepStartedAt = getPerformanceTimestampMs();
      try {
        return await Promise.resolve(operation());
      } finally {
        const elapsedMs = getPerformanceTimestampMs() - stepStartedAt;
        stepSummaries.push(`${step}=${formatDurationMs(elapsedMs)}`);
        logger.debug(`[view-open] initializeFirstTab:${step} completed in ${formatDurationMs(elapsedMs)}`);
      }
    };

    await measureStep('loadConversations', () => this.host.loadConversations());

    const restoredTabId = await measureStep('restorePersistedTabs', () => this.restorePersistedTabs());
    if (restoredTabId) {
      await measureStep('activateRestoredTab', () => this.port.activateTab(restoredTabId));
      logger.info(
        `[view-open] initializeFirstTab restored tab in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} | ${stepSummaries.join(', ')}`,
      );
      return;
    }

    let initialConversation = this.host.getConversations()[0];
    if (!initialConversation) {
      initialConversation = await measureStep('createConversation', () => this.host.createConversation());
    }

    const tab = await measureStep('createTab', () => tabManager.createTab(initialConversation));
    if (tab) {
      await measureStep('activateCreatedTab', () => this.port.activateTab(tab.id));
    }

    logger.info(
      `[view-open] initializeFirstTab completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} | ${stepSummaries.join(', ')}`,
    );
  }

  restorePersistedTabs(): TabId | null {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return null;
    }

    const savedState = this.host.getPersistedTabState();
    if (!savedState.tabs.length) {
      return null;
    }

    const conversationMap = new Map(
      this.host.getConversations().map((conversation) => [conversation.id, conversation] as const),
    );
    const restoredTab = tabManager.restoreTabs(
      savedState.tabs as RestoredTabState[],
      savedState.activeTabIndex,
      conversationMap,
    );

    if (!restoredTab) {
      this.host.resetPersistedTabState();
      this.host.persistTabState({ flush: true });
      return null;
    }

    return restoredTab.id;
  }

  async handleRewindRequest(message: ChatMessage): Promise<void> {
    if (this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.rewind.streamingBlocked'));
      return;
    }

    const currentConversation = this.host.getCurrentConversation();
    if (!currentConversation?.openCodeSessionId || !message.sourceMessageId) {
      logger.debug('Rewind unavailable due to missing identifiers', {
        conversationId: currentConversation?.id ?? null,
        sessionId: currentConversation?.openCodeSessionId ?? null,
        messageId: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
      });
      this.host.showNotice(t('chat.rewind.unavailable'));
      return;
    }

    if (!this.host.confirmRewind()) {
      return;
    }

    try {
      logger.debug('Attempting rewind', {
        conversationId: currentConversation.id,
        sessionId: currentConversation.openCodeSessionId,
        messageId: message.id,
        sourceMessageId: message.sourceMessageId,
        messagePreview: message.content.slice(0, 120),
      });

      const reverted = await this.host.revertSession(
        currentConversation.openCodeSessionId,
        message.sourceMessageId,
      );

      logger.debug('Rewind API result', {
        conversationId: currentConversation.id,
        sessionId: currentConversation.openCodeSessionId,
        sourceMessageId: message.sourceMessageId,
        reverted,
      });

      if (!reverted) {
        logger.warn('Rewind API returned false', {
          conversationId: currentConversation.id,
          sessionId: currentConversation.openCodeSessionId,
          sourceMessageId: message.sourceMessageId,
        });
        this.host.showNotice(t('chat.rewind.failed'));
        return;
      }

      await this.port.loadConversation(currentConversation.id, { forceServerSync: true });
      const loadedConversation = this.host.getCurrentConversation() ?? currentConversation;
      logger.debug('Rewind reload complete', {
        conversationId: loadedConversation.id,
        sessionId: loadedConversation.openCodeSessionId,
        messagesAfterReload: loadedConversation.messages.length,
      });
      this.host.showNotice(t('chat.rewind.success'));
    } catch (error) {
      logger.error('Failed to rewind conversation:', error);
      this.host.showNotice(t('chat.rewind.failed'));
    }
  }

  async handleRestoreRewindRequest(): Promise<void> {
    if (this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.rewind.streamingBlocked'));
      return;
    }

    const currentConversation = this.host.getCurrentConversation();
    if (!currentConversation?.openCodeSessionId) {
      this.host.showNotice(t('chat.rewind.restoreFailed'));
      return;
    }

    try {
      const restored = await this.host.unrevertSession(currentConversation.openCodeSessionId);
      if (!restored) {
        this.host.showNotice(t('chat.rewind.restoreFailed'));
        return;
      }

      await this.port.loadConversation(currentConversation.id, { forceServerSync: true });
      this.host.showNotice(t('chat.rewind.restoreSuccess'));
    } catch (error) {
      logger.error('Failed to restore rewound conversation:', error);
      this.host.showNotice(t('chat.rewind.restoreFailed'));
    }
  }

  async handleForkRequest(message: ChatMessage): Promise<void> {
    if (this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.fork.streamingBlocked'));
      return;
    }

    const currentConversation = this.host.getCurrentConversation();
    const tabManager = this.host.getTabManager();
    if (!currentConversation?.openCodeSessionId || !message.sourceMessageId || !tabManager) {
      this.host.showNotice(t('chat.fork.unavailable'));
      return;
    }

    const target = await this.host.chooseForkTarget();
    if (!target) {
      return;
    }

    try {
      const activeModelOverride = tabManager.getActiveTabModelOverride();
      const forkedSession = await this.host.forkSession(
        currentConversation.openCodeSessionId,
        message.sourceMessageId,
      );
      const forkConversation = await this.createForkConversation(
        currentConversation,
        forkedSession.id,
        message,
      );

      if (target === 'new-tab') {
        await this.openForkInNewTab(
          tabManager,
          forkConversation,
          activeModelOverride,
        );
        return;
      }

      await this.openForkInCurrentTab(forkConversation);
    } catch (error) {
      logger.error('Failed to fork conversation:', error);
      this.host.showNotice(t('chat.fork.failed'));
    }
  }

  private async createForkConversation(
    currentConversation: Conversation,
    forkedSessionId: string,
    targetMessage: ChatMessage,
  ): Promise<Conversation> {
    return this.host.createConversationFromSession(forkedSessionId, {
      title: this.buildForkTitle(currentConversation.title),
      messages: cloneMessagesBeforeForkTarget(currentConversation.messages, targetMessage),
      currentNote: currentConversation.currentNote,
      externalContextPaths: currentConversation.externalContextPaths,
    });
  }

  private async openForkInNewTab(
    tabManager: ConversationLoadRecoveryTabManager,
    forkConversation: Conversation,
    activeModelOverride: TabModelOverride | null,
  ): Promise<void> {
    if (!tabManager.canCreateTab()) {
      await this.host.deleteConversation(forkConversation.id);
      this.host.showNotice(t('chat.fork.maxTabsReached', {
        count: String(this.host.getMaxTabs()),
      }));
      return;
    }

    const tab = tabManager.createTab(forkConversation);
    if (tab) {
      await this.port.activateTab(tab.id);
      if (activeModelOverride) {
        tabManager.setActiveTabModelOverride(activeModelOverride);
        this.host.updateModelSelectorDisplay();
      }
    }
    this.host.showNotice(t('chat.fork.successNewTab'));
  }

  private async openForkInCurrentTab(forkConversation: Conversation): Promise<void> {
    this.host.syncActiveTabConversation(forkConversation);
    await this.port.loadConversation(forkConversation.id, { forceServerSync: false });
    this.host.showNotice(t('chat.fork.successCurrentTab'));
  }

  private buildForkTitle(sourceTitle: string): string {
    const baseTitle = sourceTitle?.trim() || t('chat.tab.new');
    return `Fork: ${baseTitle}`;
  }
}
