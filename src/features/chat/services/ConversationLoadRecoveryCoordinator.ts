import { Notice } from 'obsidian';

import type {
  ChatMessage,
  Conversation,
  PersistedTabState,
} from '../../../core/types';
import { getConversationBackendSessionId, getDefaultPersistedTabState } from '../../../core/types';
import type { AgentBackendKind } from '../../../core/types/chat';
import { t } from '../../../i18n';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
} from '../../../shared';
import { chooseForkTarget, type ForkTarget } from '../../../shared/modals';
import { cloneMessagesBeforeForkTarget } from '../forkMessages';
import type { ConversationHydrationOutcomePort } from '../runtime/ConversationHydrationOutcomeBridge';
import type { ConversationLoadRuntimePort } from '../runtime/ConversationLoadRuntimeBridge';
import type { ConversationTransitionPort } from '../runtime/ConversationTransitionBridge';
import type { TabConversationActivationBridge } from '../runtime/TabConversationActivationBridge';
import type { TabConversationStateBridge } from '../runtime/TabConversationStateBridge';
import type {
  RestoredTabState,
  TabData,
  TabId,
  TabModelOverride,
} from '../tabs';
import { ClaudeUserMessageIdentityBackfillService } from './ClaudeUserMessageIdentityBackfillService';
import {
  ConversationTabLifecycleRecoveryCoordinator,
  type ConversationTabLifecycleRecoveryHost,
} from './ConversationTabLifecycleRecoveryCoordinator';
import {
  ConversationTabOpenCoordinator,
  type ConversationTabOpenHost,
} from './ConversationTabOpenCoordinator';
import type { LoadConversationOptions } from './ConversationViewStateService';
import {
  type ConversationViewStateHost,
  ConversationViewStateService,
  type TabViewActivationPort,
} from './ConversationViewStateService';
import type { PersistentAssistantNoticeMessageOptions } from './PersistentAssistantNoticeService';

const logger = createLogger('ConversationLoadRecoveryCoordinator');

interface ConversationLoadRecoveryTabManager {
  areTabsEnabled?(): boolean;
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
  backend?: AgentBackendKind;
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
  getActiveBackend(): AgentBackendKind | undefined;
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
  backfillClaudeUserMessageIdentities?(conversation: Conversation): Promise<boolean>;
  hasMatchingPersistentNotice?(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentNotice?(options: PersistentAssistantNoticeMessageOptions): Promise<void>;
}

import type { App } from 'obsidian';

/** Flat dependency object passed from OpenCodianView to assemble a ConversationLoadRecoveryHost. */
export interface ConversationLoadRecoveryHostDependencies {
  isActiveTabStreaming(): boolean;
  getCurrentConversation(): Conversation | null;
  getTabManager(): ConversationLoadRecoveryTabManager | null;
  getMaxTabs(): number;
  getPersistedTabState(): PersistedTabState;
  setPersistedTabState(state: PersistedTabState): void;
  persistTabState(options?: { flush?: boolean }): void;
  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  getActiveBackend(): AgentBackendKind | undefined;
  createConversation(): Promise<Conversation>;
  app: App;
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
  backfillClaudeUserMessageIdentities?(conversation: Conversation): Promise<boolean>;
  hasMatchingPersistentNotice?(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentNotice?(options: PersistentAssistantNoticeMessageOptions): Promise<void>;
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
    resetPersistedTabState: () => {
      deps.setPersistedTabState(getDefaultPersistedTabState());
    },
    persistTabState: (options) => deps.persistTabState(options),
    loadConversations: () => deps.loadConversations(),
    getConversations: () => deps.getConversations(),
    getActiveBackend: () => deps.getActiveBackend(),
    createConversation: () => deps.createConversation(),
    chooseForkTarget: () => chooseForkTarget(deps.app, {
      allowNewTab: deps.getTabManager()?.areTabsEnabled?.() ?? true,
    }),
    confirmRewind: () => window.confirm(t('chat.rewind.confirm')),
    revertSession: (sessionId, messageId) => deps.revertSession(sessionId, messageId),
    unrevertSession: (sessionId) => deps.unrevertSession(sessionId),
    forkSession: (sessionId, messageId) => deps.forkSession(sessionId, messageId),
    createConversationFromSession: (sessionId, initial) =>
      deps.createConversationFromSession(sessionId, initial),
    deleteConversation: (conversationId) => deps.deleteConversation(conversationId),
    syncActiveTabConversation: (conversation) => deps.syncActiveTabConversation(conversation),
    updateModelSelectorDisplay: () => deps.updateModelSelectorDisplay(),
    showNotice: (message) => {
      new Notice(message);
    },
    ...(deps.backfillClaudeUserMessageIdentities
      ? { backfillClaudeUserMessageIdentities: deps.backfillClaudeUserMessageIdentities }
      : {}),
    ...(deps.hasMatchingPersistentNotice
      ? { hasMatchingPersistentNotice: deps.hasMatchingPersistentNotice }
      : {}),
    ...(deps.appendPersistentNotice
      ? { appendPersistentNotice: deps.appendPersistentNotice }
      : {}),
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
    const conversation = this.host.getCurrentConversation();
    if (conversation && this.shouldShowCodexProvisionalWarning(conversation)) {
      await this.appendCodexProvisionalWarningIfNeeded(conversation);
    }
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
    const conversation = this.host.getCurrentConversation();
    if (conversation?.backend === 'claude-code' && this.host.backfillClaudeUserMessageIdentities) {
      try {
        await this.host.backfillClaudeUserMessageIdentities(conversation);
      } catch { /* best-effort */ }
    }

    if (conversation && this.shouldShowCodexProvisionalWarning(conversation)) {
      await this.appendCodexProvisionalWarningIfNeeded(conversation);
    }
  }

  private shouldShowCodexProvisionalWarning(conversation: Conversation): boolean {
    if (conversation.backend !== 'codex') {
      return false;
    }
    const sessionId = getConversationBackendSessionId(conversation);
    return !!sessionId && sessionId.startsWith('codex-local-');
  }

  private async appendCodexProvisionalWarningIfNeeded(conversation: Conversation): Promise<void> {
    if (!this.host.appendPersistentNotice) {
      return;
    }

    const title = t('chat.codex.provisionalWarning.title');
    const content = t('chat.codex.provisionalWarning.description');
    const tone: ChatMessage['noticeTone'] = 'warning';

    const hasNotice = this.host.hasMatchingPersistentNotice?.(
      title,
      content,
      tone,
      conversation,
    ) ?? false;

    if (hasNotice) {
      return;
    }

    await this.host.appendPersistentNotice({
      title,
      content,
      tone,
      conversation,
      noticeMeta: { kind: 'codex-provisional-warning' },
    });
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
      await measureStep('activateRestoredTab', () => this.activateTab(restoredTabId));
      logger.info(
        `[view-open] initializeFirstTab restored tab in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} | ${stepSummaries.join(', ')}`,
      );
      return;
    }

    let initialConversation: Conversation | null = this.getActiveBackendConversations()[0] ?? null;
    if (!initialConversation) {
      try {
        initialConversation = await measureStep('createConversation', () => this.host.createConversation());
      } catch (error) {
        logger.warn('Failed to bootstrap initial conversation; falling back to an empty tab', error);
        initialConversation = null;
      }
    }

    const tab = await measureStep('createTab', () => tabManager.createTab(initialConversation));
    if (tab) {
      await measureStep('activateCreatedTab', () => this.activateTab(tab.id));
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

    const activeConversations = this.getActiveBackendConversations();
    const conversationMap = new Map(
      activeConversations.map((conversation) => [conversation.id, conversation] as const),
    );
    const activeConversationIds = new Set(conversationMap.keys());
    const filteredTabs = (savedState.tabs as RestoredTabState[]).filter(
      (tab) => tab.conversationId && activeConversationIds.has(tab.conversationId),
    );
    if (filteredTabs.length === 0) {
      this.host.resetPersistedTabState();
      this.host.persistTabState({ flush: true });
      return null;
    }
    const restoredTab = tabManager.restoreTabs(
      filteredTabs,
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

  private getActiveBackendConversations(): Conversation[] {
    const activeBackend = this.host.getActiveBackend() ?? 'opencode';
    return this.host.getConversations().filter(
      (conversation) => (conversation.backend ?? 'opencode') === activeBackend,
    );
  }

  async handleRewindRequest(message: ChatMessage): Promise<void> {
    if (this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.rewind.streamingBlocked'));
      return;
    }

    const currentConversation = this.host.getCurrentConversation();
    if (!currentConversation) {
      this.host.showNotice(t('chat.rewind.unavailable'));
      return;
    }

    const sessionId = getConversationBackendSessionId(currentConversation);
    const backend = currentConversation.backend ?? 'opencode';

    // Revert is OpenCode-only until Claude runtime proof justifies it.
    // See docs/status/claude-code-current-state-2026-05-22.md §"What Exists But Must Not Be Described As Stable Completion".
    if (!sessionId || !message.sourceMessageId || backend !== 'opencode') {
      logger.debug('Rewind unavailable due to missing identifiers or unsupported backend', {
        conversationId: currentConversation.id,
        sessionId,
        backend,
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
        sessionId,
        backend,
        messageId: message.id,
        sourceMessageId: message.sourceMessageId,
        messagePreview: message.content.slice(0, 120),
      });

      const reverted = await this.host.revertSession(
        sessionId,
        message.sourceMessageId,
      );

      logger.debug('Rewind API result', {
        conversationId: currentConversation.id,
        sessionId,
        sourceMessageId: message.sourceMessageId,
        reverted,
      });

      if (!reverted) {
        logger.warn('Rewind API returned false', {
          conversationId: currentConversation.id,
          sessionId,
          sourceMessageId: message.sourceMessageId,
        });
        this.host.showNotice(t('chat.rewind.failed'));
        return;
      }

      await this.port.loadConversation(currentConversation.id, { forceServerSync: true });
      const loadedConversation = this.host.getCurrentConversation() ?? currentConversation;
      logger.debug('Rewind reload complete', {
        conversationId: loadedConversation.id,
        sessionId: getConversationBackendSessionId(loadedConversation),
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
    if (!currentConversation) {
      this.host.showNotice(t('chat.rewind.restoreFailed'));
      return;
    }

    const sessionId = getConversationBackendSessionId(currentConversation);
    const backend = currentConversation.backend ?? 'opencode';

    // Unrevert is OpenCode-only until Claude runtime proof justifies it.
    if (!sessionId || backend !== 'opencode') {
      this.host.showNotice(t('chat.rewind.restoreFailed'));
      return;
    }

    try {
      const restored = await this.host.unrevertSession(sessionId);
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
    if (!currentConversation || !message.sourceMessageId || !tabManager) {
      this.host.showNotice(t('chat.fork.unavailable'));
      return;
    }
    const sessionId = getConversationBackendSessionId(currentConversation);
    if (!sessionId) {
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
        sessionId,
        message.sourceMessageId,
      );
      const forkConversation = await this.createForkConversation(
        currentConversation,
        forkedSession.id,
        message,
      );

      if (target === 'new-tab' && this.areTabsEnabled(tabManager)) {
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
      backend: currentConversation.backend,
    });
  }

  private async openForkInNewTab(
    tabManager: ConversationLoadRecoveryTabManager,
    forkConversation: Conversation,
    activeModelOverride: TabModelOverride | null,
  ): Promise<void> {
    if (!this.areTabsEnabled(tabManager)) {
      await this.openForkInCurrentTab(forkConversation);
      return;
    }

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

  private areTabsEnabled(tabManager: ConversationLoadRecoveryTabManager | null): boolean {
    return tabManager?.areTabsEnabled?.() ?? true;
  }
}

export interface ConversationLoadRecoveryAssemblyDependencies {
  viewStateHost: ConversationViewStateHost;
  tabConversationStateBridge: Pick<TabConversationStateBridge, 'syncActiveTabConversation'>;
  tabConversationActivationBridge: TabConversationActivationBridge;
  tabViewActivationBridge: TabViewActivationPort;
  conversationHydrationOutcomeBridge: ConversationHydrationOutcomePort;
  conversationTransitionBridge: ConversationTransitionPort;
  conversationLoadRuntimeBridge: ConversationLoadRuntimePort;
  tabOpenHost: ConversationTabOpenHost;
  lifecycleRecoveryHost: ConversationTabLifecycleRecoveryHost;
  loadRecoveryHostDeps: ConversationLoadRecoveryHostDependencies;
}

export interface ConversationLoadRecoveryAssemblyResult {
  conversationViewStateService: ConversationViewStateService;
  conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  conversationTabLifecycleRecoveryCoordinator: ConversationTabLifecycleRecoveryCoordinator;
  conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
}

export function assembleConversationLoadRecovery(
  deps: ConversationLoadRecoveryAssemblyDependencies,
): ConversationLoadRecoveryAssemblyResult {
  const conversationViewStateService = new ConversationViewStateService({
    host: deps.viewStateHost,
    tabConversationActivationBridge: deps.tabConversationActivationBridge,
    tabViewActivationBridge: deps.tabViewActivationBridge,
    conversationHydrationOutcomeBridge: deps.conversationHydrationOutcomeBridge,
    conversationTransitionBridge: deps.conversationTransitionBridge,
    conversationLoadRuntimeBridge: deps.conversationLoadRuntimeBridge,
  });

  const conversationTabOpenCoordinator = new ConversationTabOpenCoordinator(
    deps.tabOpenHost,
    {
      activateTab: (tabId) => conversationViewStateService.activateTab(tabId),
      openConversationInCurrentTab: (conversation) => {
        deps.tabConversationActivationBridge.openConversation(conversation);
      },
      syncActiveTabConversation: (conversation) => {
        deps.tabConversationStateBridge.syncActiveTabConversation(conversation);
      },
      loadConversation: (id, options) =>
        conversationViewStateService.loadConversation(id, options),
    },
  );

  const conversationTabLifecycleRecoveryCoordinator =
    new ConversationTabLifecycleRecoveryCoordinator(
      deps.lifecycleRecoveryHost,
      {
        activateTab: (tabId) => conversationViewStateService.activateTab(tabId),
        createConversationInNewTab: () =>
          conversationTabOpenCoordinator.createConversationInNewTab(),
      },
    );

  const claudeBackfillService = new ClaudeUserMessageIdentityBackfillService();

  const conversationLoadRecoveryCoordinator = new ConversationLoadRecoveryCoordinator(
    {
      ...createConversationLoadRecoveryHost(deps.loadRecoveryHostDeps),
      backfillClaudeUserMessageIdentities: (conversation: Conversation) => claudeBackfillService.backfill(conversation),
    },
    {
      activateTab: (tabId) => conversationViewStateService.activateTab(tabId),
      createConversationInNewTab: () =>
        conversationTabOpenCoordinator.createConversationInNewTab(),
      createConversationInCurrentTab: () =>
        conversationTabOpenCoordinator.createConversationInCurrentTab(),
      loadConversation: (id, options) =>
        conversationViewStateService.loadConversation(id, options),
      deleteConversationsAndRecover: (conversationIds) =>
        conversationTabLifecycleRecoveryCoordinator.deleteConversationsAndRecover(
          conversationIds,
        ),
      deleteAllConversationsAndReset: (conversationIds) =>
        conversationTabLifecycleRecoveryCoordinator.deleteAllConversationsAndReset(
          conversationIds,
        ),
    },
  );

  return {
    conversationViewStateService,
    conversationTabOpenCoordinator,
    conversationTabLifecycleRecoveryCoordinator,
    conversationLoadRecoveryCoordinator,
  };
}
