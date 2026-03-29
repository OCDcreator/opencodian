/**
 * OpenCodian View
 * 
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { EventRef, WorkspaceLeaf } from 'obsidian';
import { addIcon, Component, ItemView, Notice, Scope, setIcon } from 'obsidian';

import { OpenCodeService } from '../../core/opencode';
import {
  type ChatMessage,
  type ContentBlock,
  type Conversation,
  createEmptyTabContextState,
  getDefaultPersistedTabState,
  type ToolCallInfo,
  VIEW_TYPE_OPENCODIAN,
} from '../../core/types';
import type { EffortLevel, ThinkingBudget } from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, resolveToolExecutionStatus } from '../../shared';
import { chooseForkTarget } from '../../shared/modals';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { MarkdownRenderService } from '../../utils/markdown';
import {
  StreamController,
  ThinkingBlockRenderer,
  ToolCallRenderer,
} from '../../utils/streaming';
import { buildChatAppearanceCustomCss, getChatAppearanceCssVariables } from './chatAppearance';
import { buildMessageRenderGroups, mergeAssistantMessagesForRender } from './renderGroups';
import { type CollapsibleState, setupCollapsible } from './rendering/collapsible';
import { ContextUsageService } from './services/ContextUsageService';
import { TitleGenerationService } from './services/TitleGenerationService';
import { type RestoredTabState, TabBar, type TabBarLayoutMode, type TabId,TabManager } from './tabs';
import { ContextDetailModal } from './ui/ContextDetailModal';
import { ContextRing } from './ui/ContextRing';
import { EffortSelector } from './ui/EffortSelector';
import { NavigationSidebar } from './ui/NavigationSidebar';

const logger = createLogger('OpenCodianView');

/** Logo SVG for light theme (dark logo on light bg) - from opencode-logo-light.svg */
const LOGO_SVG_LIGHT = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_light)"><mask id="mask0_light" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_light)"><path d="M180 240H60V120H180V240Z" fill="#CFCECD"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E"/></g></g><defs><clipPath id="clip0_light"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Logo SVG for dark theme (light logo on dark bg) - from opencode-logo-dark.svg */
const LOGO_SVG_DARK = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_dark)"><mask id="mask0_dark" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_dark)"><path d="M180 240H60V120H180V240Z" fill="#4B4646"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/></g></g><defs><clipPath id="clip0_dark"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Pending indicator messages - randomly selected for variety */
const PENDING_MESSAGES = [
  // Technical
  'Booting up...',
  'Initializing...',
  'Loading modules...',
  'Processing...',
  'Computing...',
  'Analyzing...',
  'Thinking...',
  // Action
  'Getting to work...',
  'Diving in...',
  'Rolling up sleeves...',
  'Tackling this...',
  'On the case...',
  'Investigating...',
  'Exploring...',
  'Digging deeper...',
  // Casual
  'Bear with me...',
  'Hang tight...',
  'Just a sec...',
  'Working my magic...',
  'Almost there...',
  'Give me a moment...',
  // Whimsical
  'Asking the stars...',
  'Consulting ancient scrolls...',
  'Decoding the matrix...',
  'Channeling the cosmos...',
  'Peering into the abyss...',
];

/** Get a random pending message */
function getRandomPendingMessage(): string {
  return PENDING_MESSAGES[Math.floor(Math.random() * PENDING_MESSAGES.length)];
}

type ChatServerAvailability = 'checking' | 'running' | 'starting' | 'offline' | 'external';

interface BackgroundTaskLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

interface BackgroundTaskCompletionInfo {
  taskId: string;
  description: string;
}

interface OmoBackgroundTaskLogState {
  anchorKey: string;
  loggedPendingTaskIds: Set<string>;
  completionLogged: boolean;
}

interface TabRuntimeState {
  isStreaming: boolean;
  streamController: StreamController | null;
  streamingMessageEl: HTMLElement | null;
  streamingContentEl: HTMLElement | null;
  currentTurnBodyEl: HTMLElement | null;
  isConversationSyncInFlight: boolean;
  lastConversationSyncFingerprint: string | null;
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskStartedAt: number | null;
  backgroundTaskModeTag: string | null;
  backgroundTaskLaunches: Map<string, BackgroundTaskLaunchInfo>;
  backgroundTaskCompletedTasks: Map<string, BackgroundTaskCompletionInfo>;
  backgroundTaskWaitingForFollowUp: boolean;
}

interface TabPaneState {
  tabId: TabId;
  messagesEl: HTMLElement;
  runtime: TabRuntimeState;
}

/** Clipboard icon SVG for copy button */
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const FORK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/><path d="M12 12v3"/></svg>`;
const REWIND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
const NEW_TAB_ICON = `<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="41.667"/><path d="M33.333 50h33.334"/><path d="M50 33.333v33.334"/></g>`;
const CURRENT_TAB_NEW_CONVERSATION_ICON = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="scale(4.166667)"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/></g>`;

addIcon('opencodian-circle-plus', NEW_TAB_ICON);
addIcon('opencodian-message-square-plus', CURRENT_TAB_NEW_CONVERSATION_ICON);

export class OpenCodianView extends ItemView {
  private static tooltipLabelId = 0;
  private plugin: OpenCodianPlugin;
  private chatContainerEl: HTMLElement | null = null;
  private messagesShellEl: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private currentConversation: Conversation | null = null;
  private markdownService: MarkdownRenderService | null = null;
  private messageComponent: Component;

  // Event refs for cleanup
  private eventRefs: EventRef[] = [];

  private headerTabBarSlotEl: HTMLElement | null = null;
  private belowHeaderTabBarSlotEl: HTMLElement | null = null;
  private outerVerticalTabBarHostEl: HTMLElement | null = null;
  private outerVerticalTabBarSlotEl: HTMLElement | null = null;
  private inputTabBarSlotEl: HTMLElement | null = null;
  private tabBarMountEl: HTMLElement | null = null;
  private tabBar: TabBar | null = null;
  private tabManager: TabManager | null = null;
  private tabPaneStates = new Map<TabId, TabPaneState>();

  // Model selector state
  private modelSelectorContainer: HTMLElement | null = null;
  private modelSelectorTrigger: HTMLElement | null = null;
  private modelSelectorDropdown: HTMLElement | null = null;
  private modelSelectorSearchInput: HTMLInputElement | null = null;
  private modelSelectorScrollContainer: HTMLElement | null = null;
  private availableModels: Array<{ provider: string; model: string; label: string; providerName: string; modelName: string; contextWindow?: number }> = [];
  private availableProviders: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }> = [];
  private hasLoadedModelCatalog = false;
  private isModelDropdownOpen = false;
  private modelFilterQuery = '';
  private modelDropdownClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private currentModelTriggerIconUrl: string | null = null;

  // Navigation sidebar
  private navigationSidebar: NavigationSidebar | null = null;

  // Effort selector
  private effortSelector: EffortSelector | null = null;
  private currentEffortLevel: EffortLevel;
  private currentThinkingBudget: ThinkingBudget;
  private effortContainerEl: HTMLElement | null = null;
  private contextRing: ContextRing | null = null;
  private contextRingContainerEl: HTMLElement | null = null;

  // Send/Stop button reference
  private sendBtn: HTMLElement | null = null;
  private inputTextarea: HTMLTextAreaElement | null = null;
  private serverStatusBadgeEl: HTMLElement | null = null;
  private serverStatusTextEl: HTMLElement | null = null;
  private newConversationBtnEl: HTMLElement | null = null;
  private newConversationCurrentTabBtnEl: HTMLElement | null = null;
  private historyBtnEl: HTMLElement | null = null;
  private settingsBtnEl: HTMLElement | null = null;
  private serverStatusIntervalId: number | null = null;
  private isRefreshingServerStatus = false;
  private lastServerAvailability: ChatServerAvailability | null = null;
  private chatSurfaceSyncFrameId: number | null = null;
  private chatSurfaceSyncTimeoutId: number | null = null;
  private scrollToBottomFrameId: number | null = null;
  private chatAppearanceStyleEl: HTMLStyleElement | null = null;
  private titleGenerationService: TitleGenerationService;
  private conversationSyncIntervalId: number | null = null;
  private omoBackgroundTaskLogStates = new Map<string, OmoBackgroundTaskLogState>();

  private appSettings(): { open: () => void; openTabById: (id: string) => void } {
    return (this.app as typeof this.app & {
      setting: { open: () => void; openTabById: (id: string) => void };
    }).setting;
  }

  private createTabRuntimeState(): TabRuntimeState {
    return {
      isStreaming: false,
      streamController: null,
      streamingMessageEl: null,
      streamingContentEl: null,
      currentTurnBodyEl: null,
      isConversationSyncInFlight: false,
      lastConversationSyncFingerprint: null,
      backgroundTaskIndicatorEl: null,
      backgroundTaskStartedAt: null,
      backgroundTaskModeTag: null,
      backgroundTaskLaunches: new Map(),
      backgroundTaskCompletedTasks: new Map(),
      backgroundTaskWaitingForFollowUp: false,
    };
  }

  private getTabPaneState(tabId: TabId | null): TabPaneState | null {
    if (!tabId) {
      return null;
    }

    return this.tabPaneStates.get(tabId) ?? null;
  }

  private getTabRuntimeState(tabId: TabId | null = this.getActiveTabId()): TabRuntimeState | null {
    return this.getTabPaneState(tabId)?.runtime ?? null;
  }

  private ensureTabRuntimeState(tabId: TabId | null = this.getActiveTabId()): TabRuntimeState | null {
    if (!tabId) {
      return null;
    }

    return this.ensureTabMessagesPane(tabId)?.runtime ?? null;
  }

  private getActiveTabRuntimeState(): TabRuntimeState | null {
    return this.getTabRuntimeState(this.getActiveTabId());
  }

  private getOrCreateTabStreamController(tabId: TabId | null): StreamController | null {
    if (!tabId || !this.markdownService) {
      return null;
    }

    const paneState = this.ensureTabMessagesPane(tabId);
    if (!paneState) {
      return null;
    }

    if (!paneState.runtime.streamController) {
      paneState.runtime.streamController = new StreamController({
        containerEl: paneState.messagesEl,
        markdownService: this.markdownService,
        scrollToBottom: () => {
          if (this.getActiveTabId() === tabId) {
            this.scrollToBottomIfNeeded();
          }
        },
      });
      paneState.runtime.streamController.setCallbacks({
        onToolCallStart: (toolCall) => {
          void this.handleStreamingToolCallStart(toolCall, tabId);
        },
        onToolCallEnd: (toolCall) => {
          void this.handleStreamingToolCallEnd(toolCall, tabId);
        },
      });
    }

    return paneState.runtime.streamController;
  }

  private get isStreaming(): boolean {
    return this.getActiveTabRuntimeState()?.isStreaming ?? false;
  }

  private set isStreaming(value: boolean) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.isStreaming = value;
    }
  }

  private get streamController(): StreamController | null {
    return this.getActiveTabRuntimeState()?.streamController ?? null;
  }

  private get streamingMessageEl(): HTMLElement | null {
    return this.getActiveTabRuntimeState()?.streamingMessageEl ?? null;
  }

  private set streamingMessageEl(value: HTMLElement | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.streamingMessageEl = value;
    }
  }

  private get streamingContentEl(): HTMLElement | null {
    return this.getActiveTabRuntimeState()?.streamingContentEl ?? null;
  }

  private set streamingContentEl(value: HTMLElement | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.streamingContentEl = value;
    }
  }

  private get currentTurnBodyEl(): HTMLElement | null {
    return this.getActiveTabRuntimeState()?.currentTurnBodyEl ?? null;
  }

  private set currentTurnBodyEl(value: HTMLElement | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.currentTurnBodyEl = value;
    }
  }

  private get isConversationSyncInFlight(): boolean {
    return this.getActiveTabRuntimeState()?.isConversationSyncInFlight ?? false;
  }

  private set isConversationSyncInFlight(value: boolean) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.isConversationSyncInFlight = value;
    }
  }

  private get lastConversationSyncFingerprint(): string | null {
    return this.getActiveTabRuntimeState()?.lastConversationSyncFingerprint ?? null;
  }

  private set lastConversationSyncFingerprint(value: string | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.lastConversationSyncFingerprint = value;
    }
  }

  private get backgroundTaskIndicatorEl(): HTMLElement | null {
    return this.getActiveTabRuntimeState()?.backgroundTaskIndicatorEl ?? null;
  }

  private set backgroundTaskIndicatorEl(value: HTMLElement | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.backgroundTaskIndicatorEl = value;
    }
  }

  private get backgroundTaskStartedAt(): number | null {
    return this.getActiveTabRuntimeState()?.backgroundTaskStartedAt ?? null;
  }

  private set backgroundTaskStartedAt(value: number | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.backgroundTaskStartedAt = value;
    }
  }

  private get backgroundTaskModeTag(): string | null {
    return this.getActiveTabRuntimeState()?.backgroundTaskModeTag ?? null;
  }

  private set backgroundTaskModeTag(value: string | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.backgroundTaskModeTag = value;
    }
  }

  private get backgroundTaskLaunches(): Map<string, BackgroundTaskLaunchInfo> {
    return this.getActiveTabRuntimeState()?.backgroundTaskLaunches ?? new Map();
  }

  private get backgroundTaskCompletedTasks(): Map<string, BackgroundTaskCompletionInfo> {
    return this.getActiveTabRuntimeState()?.backgroundTaskCompletedTasks ?? new Map();
  }

  private get backgroundTaskWaitingForFollowUp(): boolean {
    return this.getActiveTabRuntimeState()?.backgroundTaskWaitingForFollowUp ?? false;
  }

  private set backgroundTaskWaitingForFollowUp(value: boolean) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.backgroundTaskWaitingForFollowUp = value;
    }
  }

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.messageComponent = new Component();
    this.currentEffortLevel = this.plugin.settings.effortLevel;
    this.currentThinkingBudget = this.plugin.settings.thinkingBudget;
    this.titleGenerationService = new TitleGenerationService(this.plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_OPENCODIAN;
  }

  getDisplayText(): string {
    return 'OpenCodian';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen() {
    // Build UI
    this.buildUI();
    this.initializeTabSystem();
    this.startServerStatusLoop();

    // Initialize markdown service
    if (this.messagesShellEl) {
      this.markdownService = new MarkdownRenderService({
        app: this.app,
        component: this.messageComponent,
        container: this.messagesShellEl,
      });
    }

    // Wire events
    this.wireEventHandlers();

    await this.initializeFirstTab();
  }

  async onClose() {
    this.persistTabState({ flush: true });
    this.stopServerStatusLoop();
    this.stopConversationSyncLoop();
    this.clearChatSurfaceSyncTimers();
    this.clearScheduledScrollToBottom();
    this.chatAppearanceStyleEl?.remove();
    this.chatAppearanceStyleEl = null;
    this.titleGenerationService.cancelAll();
    this.effortSelector?.destroy();
    this.effortSelector = null;
    this.effortContainerEl = null;
    this.contextRing?.destroy();
    this.contextRing = null;
    this.contextRingContainerEl = null;

    // Cleanup navigation sidebar
    this.clearTabMessagesPanes();
    this.tabBar?.destroy();
    this.tabBar = null;
    this.tabBarMountEl = null;
    this.headerTabBarSlotEl = null;
    this.belowHeaderTabBarSlotEl = null;
    this.outerVerticalTabBarSlotEl = null;
    this.outerVerticalTabBarHostEl?.remove();
    this.outerVerticalTabBarHostEl = null;
    this.inputTabBarSlotEl = null;
    this.tabManager = null;

    // Cleanup event refs
    for (const ref of this.eventRefs) {
      this.plugin.app.vault.offref(ref);
    }
    this.eventRefs = [];

    // Cleanup markdown service
    this.messageComponent.unload();
    this.markdownService = null;
  }

  /** Build the UI structure */
  private buildUI() {
    this.chatContainerEl = this.contentEl.createDiv({ cls: 'opencodian-container' });

    // Header
    const header = this.chatContainerEl.createDiv({ cls: 'opencodian-header' });
    this.buildHeader(header);
    this.belowHeaderTabBarSlotEl = this.chatContainerEl.createDiv({
      cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--below-header',
    });

    // Messages area
    this.messagesShellEl = this.chatContainerEl.createDiv({ cls: 'opencodian-messages-shell' });
    this.messagesContainer = null;

    // Input area
    this.inputContainer = this.chatContainerEl.createDiv({ cls: 'opencodian-input-area' });
    this.buildInputArea(this.inputContainer);
    this.applyChatAppearanceSettings();

    const outerMountEl = this.contentEl.closest('.workspace-leaf-content[data-type="opencodian-view"]')
      ?? this.contentEl;
    this.outerVerticalTabBarHostEl = (outerMountEl as HTMLElement).createDiv({
      cls: 'opencodian-tab-bar-external-host',
    });
    this.outerVerticalTabBarSlotEl = this.outerVerticalTabBarHostEl.createDiv({
      cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--outer-vertical',
    });

    // Navigation sidebar is attached after the active tab pane is created.
  }

  private ensureTabMessagesPane(tabId: TabId): TabPaneState | null {
    const existing = this.tabPaneStates.get(tabId);
    if (existing?.messagesEl?.isConnected) {
      return existing;
    }

    if (!this.messagesShellEl) {
      return null;
    }

    const messagesEl = this.messagesShellEl.createDiv({ cls: 'opencodian-messages opencodian-messages-pane' });
    messagesEl.dataset.tabId = tabId;
    this.applyChatScrollModeToMessagesEl(messagesEl);
    const paneState: TabPaneState = {
      tabId,
      messagesEl,
      runtime: this.createTabRuntimeState(),
    };
    this.tabPaneStates.set(tabId, paneState);
    return paneState;
  }

  private setActiveMessagesPane(tabId: TabId): void {
    const activePaneState = this.ensureTabMessagesPane(tabId);
    if (!activePaneState) {
      this.messagesContainer = null;
      this.resetTurnState();
      this.navigationSidebar?.destroy();
      this.navigationSidebar = null;
      return;
    }

    for (const [paneTabId, paneState] of this.tabPaneStates) {
      paneState.messagesEl.classList.toggle('is-active', paneTabId === tabId);
    }

    this.messagesContainer = activePaneState.messagesEl;
    this.restoreTurnStateFromActivePane();
    this.rebuildNavigationSidebar();
  }

  private removeTabMessagesPane(tabId: TabId): void {
    const paneState = this.tabPaneStates.get(tabId);
    if (!paneState) {
      return;
    }

    if (this.messagesContainer === paneState.messagesEl) {
      this.messagesContainer = null;
      this.resetTurnState();
      this.navigationSidebar?.destroy();
      this.navigationSidebar = null;
    }

    paneState.runtime.streamController?.cancelStream();
    paneState.messagesEl.remove();
    this.tabPaneStates.delete(tabId);
  }

  private clearTabMessagesPanes(): void {
    for (const paneState of this.tabPaneStates.values()) {
      paneState.runtime.streamController?.cancelStream();
      paneState.messagesEl.remove();
    }
    this.tabPaneStates.clear();
    this.messagesContainer = null;
    this.resetTurnState();
    this.navigationSidebar?.destroy();
    this.navigationSidebar = null;
  }

  private rebuildNavigationSidebar(): void {
    this.navigationSidebar?.destroy();
    this.navigationSidebar = null;

    if (!this.messagesShellEl || !this.messagesContainer) {
      return;
    }

    const outerMountEl = this.contentEl.closest('.workspace-leaf-content[data-type="opencodian-view"]')
      ?? this.contentEl;
    this.navigationSidebar = new NavigationSidebar(
      outerMountEl as HTMLElement,
      this.messagesShellEl,
      this.messagesContainer,
    );
  }

  private restoreTurnStateFromActivePane(): void {
    if (!this.messagesContainer) {
      this.resetTurnState();
      return;
    }

    const turnBodies = Array.from(this.messagesContainer.querySelectorAll('.opencodian-turn-body'));
    this.currentTurnBodyEl = (turnBodies[turnBodies.length - 1] as HTMLElement | undefined) ?? null;
    this.backgroundTaskIndicatorEl = this.messagesContainer.querySelector<HTMLElement>(
      '.opencodian-message--background-task[data-message-id="transient-background-task"]',
    );
  }

  private initializeTabSystem(): void {
    if (!this.chatContainerEl) {
      return;
    }

    this.tabBarMountEl = document.createElement('div');
    this.tabBarMountEl.className = 'opencodian-tab-bar-mount';
    this.tabBar = new TabBar(this.tabBarMountEl, {
      onTabClick: (tabId) => {
        void this.handleTabSwitch(tabId);
      },
      onTabClose: (tabId) => {
        void this.handleTabClose(tabId);
      },
    });

    this.tabManager = new TabManager(t('chat.tab.new'), {
      getMaxTabs: () => this.plugin.settings.maxTabs,
      onChanged: () => {
        this.renderTabBar();
        this.persistTabState();
      },
    });

    this.applyTabBarLayout();
  }

  private async initializeFirstTab(): Promise<void> {
    if (!this.tabManager) {
      return;
    }

    const restoredTabId = this.restorePersistedTabs();
    if (restoredTabId) {
      await this.activateTab(restoredTabId);
      return;
    }

    let initialConversation = this.plugin.getConversations()[0];
    if (!initialConversation) {
      initialConversation = await this.plugin.createConversation();
    }

    const tab = this.tabManager.createTab(initialConversation);
    if (tab) {
      await this.activateTab(tab.id);
    }
  }

  private renderTabBar(): void {
    if (!this.tabBar || !this.tabManager) {
      return;
    }

    this.tabBar.render(this.tabManager.getTabBarItems(), this.getTabBarLayoutMode());
  }

  private restorePersistedTabs(): string | null {
    if (!this.tabManager) {
      return null;
    }

    const savedState = this.plugin.settings.tabState;
    if (!savedState.tabs.length) {
      return null;
    }

    const conversationMap = new Map(
      this.plugin.getConversations().map((conversation) => [conversation.id, conversation] as const),
    );
    const restoredTab = this.tabManager.restoreTabs(
      savedState.tabs as RestoredTabState[],
      savedState.activeTabIndex,
      conversationMap,
    );

    if (!restoredTab) {
      this.plugin.settings.tabState = getDefaultPersistedTabState();
      this.persistTabState({ flush: true });
      return null;
    }

    return restoredTab.id;
  }

  private persistTabState(options: { flush?: boolean } = {}): void {
    if (!this.tabManager) {
      return;
    }

    const tabs = this.tabManager.getAllTabs();
    const activeTabId = this.tabManager.getActiveTab()?.id ?? null;
    const activeTabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));

    this.plugin.settings.tabState = {
      tabs: tabs.map((tab) => ({
        conversationId: tab.conversationId,
        title: tab.title,
        modelOverride: tab.modelOverride,
      })),
      activeTabIndex,
    };

    if (options.flush) {
      void this.plugin.storage.saveSettings(this.plugin.settings);
      return;
    }

    this.plugin.scheduleSettingsUiStateSave();
  }

  private getActiveTabId(): TabId | null {
    return this.tabManager?.getActiveTab()?.id ?? null;
  }

  private isActiveTabStreaming(): boolean {
    return Boolean(this.getActiveTabRuntimeState()?.isStreaming);
  }

  private hasTabBackgroundTaskIndicator(tabId: TabId | null): boolean {
    const runtime = this.getTabRuntimeState(tabId);
    return Boolean(runtime?.backgroundTaskStartedAt) && (
      runtime?.backgroundTaskModeTag === 'search-mode'
      || (runtime?.backgroundTaskLaunches.size ?? 0) > 0
    );
  }

  private syncTabStreamLikeState(tabId: TabId | null): void {
    if (!tabId) {
      this.updateSendButtonState();
      return;
    }

    const runtime = this.getTabRuntimeState(tabId);
    this.tabManager?.setTabStreaming(tabId, runtime?.isStreaming ?? false);
    this.tabManager?.setTabBackgroundTaskRunning(
      tabId,
      Boolean(runtime && this.hasTabBackgroundTaskIndicator(tabId) && !runtime.isStreaming),
    );

    if (tabId === this.getActiveTabId()) {
      this.updateSendButtonState();
    }
  }

  private syncActiveTabStreamLikeState(): void {
    this.syncTabStreamLikeState(this.getActiveTabId());
  }

  private async handleTabSwitch(tabId: string): Promise<void> {
    if (!this.tabManager) {
      return;
    }

    const switched = this.tabManager.switchToTab(tabId);
    if (switched) {
      await this.activateTab(tabId);
    }
  }

  private async handleTabClose(tabId: string): Promise<void> {
    if (!this.tabManager) {
      return;
    }

    const tab = this.tabManager.getTab(tabId);
    if (!tab) {
      return;
    }

    if (tab.isStreaming || tab.hasBackgroundTask) {
      new Notice(t('chat.tab.streamingBlocked'));
      return;
    }

    const result = this.tabManager.closeTab(tabId);
    if (!result.closed) {
      return;
    }

    this.removeTabMessagesPane(tabId);

    if (result.nextActiveTabId) {
      await this.activateTab(result.nextActiveTabId);
      return;
    }

    const conversation = await this.plugin.createConversation();
    const nextTab = this.tabManager.createTab(conversation);
    if (nextTab) {
      await this.activateTab(nextTab.id);
    }
  }

  private async activateTab(tabId: string): Promise<void> {
    if (!this.tabManager) {
      return;
    }

    const tab = this.tabManager.getTab(tabId);
    if (!tab) {
      return;
    }

    this.setActiveMessagesPane(tabId);

    if (tab.conversationId) {
      if (tab.isStreaming) {
        const conversation = await this.plugin.getConversationById(tab.conversationId);
        if (!conversation) {
          return;
        }

        this.currentConversation = conversation;
        this.tabManager.setActiveTabConversation(conversation);
        this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);
        this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(conversation.messages);
        this.startConversationSyncLoop();
        this.updateModelSelectorDisplay();
        this.syncActiveTabContextUsageIdentity();
        this.updateSendButtonState();
        return;
      }

      await this.loadConversation(tab.conversationId);
      return;
    }

    this.currentConversation = null;
    this.stopConversationSyncLoop();
    this.messagesContainer?.empty();
    this.resetTurnState();
    this.updateModelSelectorDisplay();
    this.syncActiveTabContextUsageIdentity();
    this.updateSendButtonState();
  }

  private getTabBarLayoutMode(): TabBarLayoutMode {
    if (this.plugin.settings.tabBarPosition === 'header') {
      return 'header';
    }

    if (this.plugin.settings.tabBarPosition === 'below-header') {
      return this.plugin.settings.belowHeaderTabBarLayout === 'vertical'
        ? 'below-header-vertical'
        : 'below-header-grid';
    }

    return 'input';
  }

  public applyTabBarLayout(): void {
    if (
      !this.chatContainerEl
      || !this.tabBarMountEl
      || !this.headerTabBarSlotEl
      || !this.belowHeaderTabBarSlotEl
      || !this.outerVerticalTabBarSlotEl
      || !this.inputTabBarSlotEl
    ) {
      return;
    }

    const isBelowHeader = this.plugin.settings.tabBarPosition === 'below-header';
    const isVerticalBelowHeader =
      isBelowHeader && this.plugin.settings.belowHeaderTabBarLayout === 'vertical';

    const targetSlot = this.plugin.settings.tabBarPosition === 'header'
      ? this.headerTabBarSlotEl
      : isVerticalBelowHeader
        ? this.outerVerticalTabBarSlotEl
        : isBelowHeader
          ? this.belowHeaderTabBarSlotEl
          : this.inputTabBarSlotEl;

    if (this.tabBarMountEl.parentElement !== targetSlot) {
      this.tabBarMountEl.remove();
      targetSlot.appendChild(this.tabBarMountEl);
    }

    this.chatContainerEl.toggleClass('opencodian-container--tab-pos-header', this.plugin.settings.tabBarPosition === 'header');
    this.chatContainerEl.toggleClass('opencodian-container--tab-pos-below-header', isBelowHeader);
    this.chatContainerEl.toggleClass('opencodian-container--tab-pos-input', this.plugin.settings.tabBarPosition === 'input');
    this.chatContainerEl.toggleClass(
      'opencodian-container--tab-layout-grid',
      isBelowHeader && this.plugin.settings.belowHeaderTabBarLayout === 'grid',
    );
    this.chatContainerEl.toggleClass(
      'opencodian-container--tab-layout-vertical',
      isVerticalBelowHeader,
    );
    this.headerTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === this.headerTabBarSlotEl);
    this.belowHeaderTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === this.belowHeaderTabBarSlotEl);
    this.outerVerticalTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === this.outerVerticalTabBarSlotEl);
    this.inputTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === this.inputTabBarSlotEl);
    this.renderTabBar();
  }

  public applyChatAppearanceSettings(): void {
    if (!this.chatContainerEl) {
      return;
    }

    const cssVariables = getChatAppearanceCssVariables(this.plugin.settings.chatAppearance);
    for (const [cssVar, cssValue] of Object.entries(cssVariables)) {
      this.chatContainerEl.style.setProperty(cssVar, cssValue);
    }

    const customCss = buildChatAppearanceCustomCss(
      this.plugin.settings.chatAppearance.advanced.customCssDeclarations,
    );

    if (customCss) {
      if (!this.chatAppearanceStyleEl) {
        this.chatAppearanceStyleEl = document.createElement('style');
        this.chatAppearanceStyleEl.className = 'opencodian-chat-appearance-style';
        this.chatContainerEl.appendChild(this.chatAppearanceStyleEl);
      }
      this.chatAppearanceStyleEl.textContent = customCss;
    } else if (this.chatAppearanceStyleEl) {
      this.chatAppearanceStyleEl.remove();
      this.chatAppearanceStyleEl = null;
    }

    this.scheduleChatSurfaceColorSync();
  }

  /** Apply configured chat scroll mode to the messages container */
  public applyChatScrollMode(): void {
    this.syncChatSurfaceColor();

    if (this.tabPaneStates.size > 0) {
      for (const paneState of this.tabPaneStates.values()) {
        this.applyChatScrollModeToMessagesEl(paneState.messagesEl);
      }
      return;
    }

    if (this.messagesContainer) {
      this.applyChatScrollModeToMessagesEl(this.messagesContainer);
    }
  }

  private applyChatScrollModeToMessagesEl(messagesEl: HTMLElement): void {
    messagesEl.removeClass('opencodian-messages--sticky-basic');
    messagesEl.removeClass('opencodian-messages--sticky-mask');
    messagesEl.removeClass('opencodian-messages--natural');

    const scrollMode = this.plugin.settings.chatScrollMode;
    if (scrollMode === 'natural') {
      messagesEl.addClass('opencodian-messages--natural');
    } else if (scrollMode === 'sticky-basic') {
      messagesEl.addClass('opencodian-messages--sticky-basic');
    } else {
      messagesEl.addClass('opencodian-messages--sticky-mask');
    }
  }

  /** Re-sync sticky mask color after theme/layout changes settle */
  private scheduleChatSurfaceColorSync(): void {
    this.clearChatSurfaceSyncTimers();

    this.chatSurfaceSyncFrameId = window.requestAnimationFrame(() => {
      this.chatSurfaceSyncFrameId = window.requestAnimationFrame(() => {
        this.syncChatSurfaceColor();
        this.chatSurfaceSyncFrameId = null;
      });
    });

    this.chatSurfaceSyncTimeoutId = window.setTimeout(() => {
      this.syncChatSurfaceColor();
      this.chatSurfaceSyncTimeoutId = null;
    }, 80);
  }

  /** Clear pending sticky mask sync timers */
  private clearChatSurfaceSyncTimers(): void {
    if (this.chatSurfaceSyncFrameId !== null) {
      window.cancelAnimationFrame(this.chatSurfaceSyncFrameId);
      this.chatSurfaceSyncFrameId = null;
    }

    if (this.chatSurfaceSyncTimeoutId !== null) {
      window.clearTimeout(this.chatSurfaceSyncTimeoutId);
      this.chatSurfaceSyncTimeoutId = null;
    }
  }

  /** Sync sticky mask color to the actual pane background */
  private syncChatSurfaceColor(): void {
    if (!this.chatContainerEl) return;

    let currentEl: HTMLElement | null = this.chatContainerEl;
    let resolvedColor = '';

    while (currentEl) {
      const backgroundColor = window.getComputedStyle(currentEl).backgroundColor;
      if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        resolvedColor = backgroundColor;
        break;
      }
      currentEl = currentEl.parentElement;
    }

    if (!resolvedColor) {
      resolvedColor = 'var(--background-secondary)';
    }

    this.chatContainerEl.style.setProperty('--opencodian-chat-surface', resolvedColor);
  }

  /** Reset active turn references */
  private resetTurnState(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.currentTurnBodyEl = null;
    runtime.backgroundTaskIndicatorEl = null;
  }

  /** Create a new turn with sticky user header */
  private createTurn(tabId: TabId | null = this.getActiveTabId()): { turnEl: HTMLElement; headerEl: HTMLElement; bodyEl: HTMLElement } | null {
    const paneState = this.getTabPaneState(tabId);
    if (!paneState) return null;

    const turnEl = paneState.messagesEl.createDiv({ cls: 'opencodian-turn' });
    const headerEl = turnEl.createDiv({ cls: 'opencodian-turn-header' });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });

    paneState.runtime.currentTurnBodyEl = bodyEl;

    return { turnEl, headerEl, bodyEl };
  }

  /** Ensure there is a turn body available for assistant messages */
  private ensureTurnBody(tabId: TabId | null = this.getActiveTabId()): HTMLElement | null {
    const paneState = this.getTabPaneState(tabId);
    if (!paneState) return null;

    if (paneState.runtime.currentTurnBodyEl?.isConnected) {
      return paneState.runtime.currentTurnBodyEl;
    }

    const turnEl = paneState.messagesEl.createDiv({
      cls: 'opencodian-turn opencodian-turn--assistant-only',
    });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });

    paneState.runtime.currentTurnBodyEl = bodyEl;

    return bodyEl;
  }

  /** Build header */
  private buildHeader(header: HTMLElement) {
    // Logo and title
    const titleEl = header.createDiv({ cls: 'opencodian-title' });
    
    // Create logo container
    const logoContainer = titleEl.createDiv({ cls: 'opencodian-logo' });
    logoContainer.innerHTML = this.getLogoSvg();

    titleEl.createEl('span', { text: 'OpenCodian', cls: 'opencodian-title-text' });
    this.headerTabBarSlotEl = header.createDiv({ cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--header' });
    
    // Listen for theme changes
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        logoContainer.innerHTML = this.getLogoSvg();
        this.scheduleChatSurfaceColorSync();
      })
    );

    // Actions
    const actions = header.createDiv({ cls: 'opencodian-header-actions' });

    this.serverStatusBadgeEl = actions.createDiv({ cls: 'opencodian-server-status-badge is-checking' });
    this.serverStatusBadgeEl.addClass('opencodian-tooltip-trigger');
    this.setTooltipLabel(this.serverStatusBadgeEl, t('chat.serverStatus.openSettings'), 'bottom');
    this.serverStatusBadgeEl.createSpan({ cls: 'opencodian-server-status-dot' });
    this.serverStatusTextEl = this.serverStatusBadgeEl.createSpan({
      cls: 'opencodian-server-status-text',
      text: t('chat.serverStatus.checking'),
    });
    this.serverStatusBadgeEl.addEventListener('click', () => {
      this.openPluginSettingsAtServerSection();
    });

    // New conversation button
    this.newConversationBtnEl = actions.createDiv({ cls: 'opencodian-header-btn opencodian-tooltip-trigger' });
    setIcon(this.newConversationBtnEl, 'opencodian-circle-plus');
    this.setTooltipLabel(this.newConversationBtnEl, t('chat.tab.newTooltip'), 'bottom');
    this.newConversationBtnEl.addEventListener('click', () => {
      void this.createNewConversation();
    });

    // New conversation in current tab button
    this.newConversationCurrentTabBtnEl = actions.createDiv({ cls: 'opencodian-header-btn opencodian-tooltip-trigger' });
    setIcon(this.newConversationCurrentTabBtnEl, 'opencodian-message-square-plus');
    this.setTooltipLabel(this.newConversationCurrentTabBtnEl, t('chat.tab.newCurrentTooltip'), 'bottom');
    this.newConversationCurrentTabBtnEl.addEventListener('click', () => {
      void this.createNewConversationInCurrentTab();
    });

    // History button
    this.historyBtnEl = actions.createDiv({ cls: 'opencodian-header-btn opencodian-tooltip-trigger' });
    setIcon(this.historyBtnEl, 'history');
    this.setTooltipLabel(this.historyBtnEl, t('chat.history.open'), 'bottom');
    this.historyBtnEl.addEventListener('click', (event) => {
      this.showConversationHistory(event);
    });

    // Settings button
    this.settingsBtnEl = actions.createDiv({ cls: 'opencodian-header-btn opencodian-tooltip-trigger' });
    setIcon(this.settingsBtnEl, 'settings');
    this.setTooltipLabel(this.settingsBtnEl, t('chat.settings.open'), 'bottom');
    this.settingsBtnEl.addEventListener('click', () => {
      this.openPluginSettingsPreservingScroll();
    });
  }

  public applyLocaleTexts(): void {
    if (this.serverStatusBadgeEl) {
      this.setTooltipLabel(this.serverStatusBadgeEl, t('chat.serverStatus.openSettings'), 'bottom');
    }

    if (this.newConversationBtnEl) {
      this.setTooltipLabel(this.newConversationBtnEl, t('chat.tab.newTooltip'), 'bottom');
    }

    if (this.newConversationCurrentTabBtnEl) {
      this.setTooltipLabel(this.newConversationCurrentTabBtnEl, t('chat.tab.newCurrentTooltip'), 'bottom');
    }

    if (this.historyBtnEl) {
      this.setTooltipLabel(this.historyBtnEl, t('chat.history.open'), 'bottom');
    }

    if (this.settingsBtnEl) {
      this.setTooltipLabel(this.settingsBtnEl, t('chat.settings.open'), 'bottom');
    }

    this.renderTabBar();
  }

  private openPluginSettingsPreservingScroll(): void {
    const savedScrollTop = this.plugin.settings.settingsPanelScrollTop;
    this.plugin.settingsTab?.prepareRestoreScrollOnNextOpen(savedScrollTop);
    const settings = this.appSettings();
    settings.open();
    settings.openTabById('opencodian');
  }

  private openPluginSettingsAtServerSection(): void {
    this.plugin.settingsTab?.prepareScrollToServerOnNextOpen();
    const settings = this.appSettings();
    settings.open();
    settings.openTabById('opencodian');
  }

  private startServerStatusLoop(): void {
    void this.refreshServerStatusBadge();
    if (this.serverStatusIntervalId) {
      window.clearInterval(this.serverStatusIntervalId);
    }
    this.serverStatusIntervalId = window.setInterval(() => {
      void this.refreshServerStatusBadge();
    }, 5000);
  }

  private stopServerStatusLoop(): void {
    if (this.serverStatusIntervalId) {
      window.clearInterval(this.serverStatusIntervalId);
      this.serverStatusIntervalId = null;
    }
  }

  private async refreshServerStatusBadge(): Promise<void> {
    if (!this.serverStatusBadgeEl || !this.serverStatusTextEl || this.isRefreshingServerStatus) {
      return;
    }

    this.isRefreshingServerStatus = true;
    try {
      const availability = await this.getServerAvailability();
      if (availability !== this.lastServerAvailability) {
        logger.debug(`Chat server availability -> ${availability}`);
        this.lastServerAvailability = availability;
      }
      const statusKeyMap: Record<ChatServerAvailability, 'chat.serverStatus.checking' | 'chat.serverStatus.running' | 'chat.serverStatus.starting' | 'chat.serverStatus.offline' | 'chat.serverStatus.external'> = {
        checking: 'chat.serverStatus.checking',
        running: 'chat.serverStatus.running',
        starting: 'chat.serverStatus.starting',
        offline: 'chat.serverStatus.offline',
        external: 'chat.serverStatus.external',
      };
      this.serverStatusBadgeEl.removeClass(
        'is-checking',
        'is-running',
        'is-starting',
        'is-offline',
        'is-external'
      );
      this.serverStatusBadgeEl.addClass(`is-${availability}`);
      this.serverStatusTextEl.setText(this.getServerStatusLabel(availability, statusKeyMap));
      this.setTooltipLabel(this.serverStatusBadgeEl, t('chat.serverStatus.openSettings'), 'bottom');
      this.refreshContextUsageIndicator();
    } finally {
      this.isRefreshingServerStatus = false;
    }
  }

  private getServerStatusLabel(
    availability: ChatServerAvailability,
    statusKeyMap: Record<ChatServerAvailability, 'chat.serverStatus.checking' | 'chat.serverStatus.running' | 'chat.serverStatus.starting' | 'chat.serverStatus.offline' | 'chat.serverStatus.external'>
  ): string {
    if (this.plugin.settings.server.mode === 'local') {
      if (availability === 'running') {
        return t('chat.serverStatus.localManaged');
      }
      if (availability === 'external') {
        return t('chat.serverStatus.localExternal');
      }
    }

    if (availability === 'running' || availability === 'external') {
      return t('chat.serverStatus.remoteConnected');
    }

    return t(statusKeyMap[availability]);
  }

  private async getServerAvailability(): Promise<ChatServerAvailability> {
    const isHealthy = await this.plugin.openCodeService.checkHealth();
    const internalStatus = this.plugin.openCodeService.getServerStatus();
    const hasManagedProcess = this.plugin.openCodeService.isServerProcessRunning();

    if (isHealthy && !hasManagedProcess) {
      return 'external';
    }

    if (isHealthy) {
      return 'running';
    }

    if (internalStatus === 'starting' || internalStatus === 'restarting') {
      return 'starting';
    }

    return 'offline';
  }

  /** Get logo SVG based on current theme */
  private getLogoSvg(): string {
    // Check if we're in dark mode by looking for .theme-dark class
    const isDark = document.body.classList.contains('theme-dark');
    return isDark ? LOGO_SVG_DARK : LOGO_SVG_LIGHT;
  }

  /** Build input area */
  private buildInputArea(container: HTMLElement) {
    this.inputTabBarSlotEl = container.createDiv({ cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--input' });

    // Input wrapper - textarea only (send button moved to toolbar)
    const inputWrapper = container.createDiv({ cls: 'opencodian-input-wrapper' });
    
    this.inputTextarea = inputWrapper.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { placeholder: 'Ask anything...', rows: '1' },
    });

    // Auto-resize textarea
    this.inputTextarea.addEventListener('input', () => {
      if (this.inputTextarea) {
        this.inputTextarea.style.height = 'auto';
        this.inputTextarea.style.height = `${Math.min(this.inputTextarea.scrollHeight, 200)}px`;
      }
    });

    // Send on Enter (Shift+Enter for new line)
    this.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.trySubmitCurrentInput();
      }
    });

    // Bottom toolbar: Permission mode (left) | Model selector (center) | Send button (right)
    const toolbar = container.createDiv({ cls: 'opencodian-input-toolbar' });
    
    // Left side: Permission mode selector
    const permissionContainer = toolbar.createDiv({ cls: 'opencodian-permission-selector' });
    this.initializePermissionSelector(permissionContainer);
    
    // Center: Model selector (opencode-style)
    this.modelSelectorContainer = toolbar.createDiv({ cls: 'opencodian-model-selector' });
    this.initializeModelSelector(this.modelSelectorContainer);

    // Effort selector (between model and send button)
    this.effortContainerEl = toolbar.createDiv({ cls: 'opencodian-effort-slot' });
    this.effortSelector = new EffortSelector(this.effortContainerEl, {
      onEffortLevelChange: async (effort: EffortLevel) => {
        this.currentEffortLevel = effort;
        this.plugin.settings.effortLevel = effort;
        await this.plugin.saveSettings();
      },
      onThinkingBudgetChange: async (budget: ThinkingBudget) => {
        this.currentThinkingBudget = budget;
        this.plugin.settings.thinkingBudget = budget;
        await this.plugin.saveSettings();
      },
      getEffortLevel: () => this.currentEffortLevel,
      getThinkingBudget: () => this.currentThinkingBudget,
      getCurrentModel: () => {
        const current = this.getCurrentSessionModel();
        return current ? `${current.provider}/${current.model}` : '';
      },
    });
    this.effortSelector.updateDisplay();

    this.contextRingContainerEl = toolbar.createDiv({ cls: 'opencodian-context-usage-slot' });
    this.contextRing = new ContextRing(this.contextRingContainerEl, () => {
      this.openContextUsageDetails();
    });
    this.refreshContextUsageIndicator();

    // Right side: Send/Stop button
    this.sendBtn = toolbar.createDiv({ cls: 'opencodian-send-btn' });
    setIcon(this.sendBtn, 'send');
    this.sendBtn.addEventListener('click', () => {
      if (this.isActiveTabStreaming()) {
        // Stop streaming
        this.cancelStreaming();
      } else {
        this.trySubmitCurrentInput();
      }
    });
  }

  private trySubmitCurrentInput(): void {
    if (!this.inputTextarea) {
      return;
    }

    if (this.isStreaming || this.hasActiveBackgroundTaskIndicator()) {
      new Notice(t('chat.tab.processingBlocked'));
      return;
    }

    const message = this.inputTextarea.value.trim();
    if (!message) {
      return;
    }

    void this.sendMessage(message);
    this.inputTextarea.value = '';
    this.inputTextarea.style.height = 'auto';
  }

  /** Wire event handlers */
  private wireEventHandlers() {
    // Escape to cancel streaming
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', () => {
      if (this.isActiveTabStreaming()) {
        this.cancelStreaming();
      }
      return false;
    });

    // File open event
    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file && this.currentConversation) {
          this.currentConversation.currentNote = file.path;
        }
      })
    );
  }

  /** Create a new conversation */
  private async createNewConversation() {
    if (!this.tabManager) {
      return;
    }

    if (!this.tabManager.canCreateTab()) {
      new Notice(t('chat.tab.maxReached', { count: String(this.plugin.settings.maxTabs) }));
      return;
    }

    try {
      const conversation = await this.plugin.createConversation();
      const tab = this.tabManager.createTab(conversation);
      if (tab) {
        await this.activateTab(tab.id);
      }
      new Notice(t('chat.tab.created'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create conversation';
      new Notice(msg);
    }
  }

  /** Create a new conversation in the current tab */
  private async createNewConversationInCurrentTab(): Promise<void> {
    if (!this.tabManager) {
      return;
    }

    if (this.isActiveTabStreaming()) {
      new Notice(t('chat.tab.newBlockedWhileStreaming'));
      return;
    }

    try {
      const conversation = await this.plugin.createConversation();
      this.openConversationInCurrentTab(conversation);
      new Notice(t('chat.tab.newCurrentCreated'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create conversation';
      new Notice(msg);
    }
  }

  /** Load a conversation */
  private async loadConversation(id: string, options: { forceServerSync?: boolean } = {}) {
    if (this.currentConversation?.id && this.currentConversation.id !== id) {
      const previousConversationId = this.currentConversation.id;
      this.titleGenerationService.cancelConversation(previousConversationId);
      this.resetBackgroundTaskIndicator();
      if (this.currentConversation.titleGenerationStatus === 'pending') {
        void this.updateConversationTitleState(previousConversationId, {
          titleGenerationStatus: undefined,
        });
      }
    }

    const conversation = await this.plugin.getConversationById(id);
    if (!conversation) return;

    this.currentConversation = conversation;
    this.tabManager?.setActiveTabConversation(conversation);

    // Clear messages display
    this.messagesContainer?.empty();
    this.resetTurnState();

    // Set session in service
    this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);

    const shouldSyncFromServer =
      options.forceServerSync
      || !conversation.messages
      || conversation.messages.length === 0
      || (
        !this.hasInterruptedLocalAssistantTail(conversation.messages)
        && conversation.messages.some((message) =>
          message.displayStyle !== 'notice'
          && !message.sourceMessageId
        )
      );

    const messages = shouldSyncFromServer
      ? (await this.syncConversationMessagesFromServer(conversation)).messages
      : conversation.messages;

    this.syncBackgroundTaskStateFromConversation(conversation);
    await this.renderMessages(messages);
    await this.renderBackgroundTaskIndicatorIfNeeded();
    this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(messages);
    this.startConversationSyncLoop();

    // Scroll to bottom
    this.scrollToBottom();
    
    // Update model selector to reflect this session's model
    this.updateModelSelectorDisplay();
    this.syncActiveTabContextUsageIdentity();
    await this.refreshActiveTabContextUsageFromServer();
  }

  private openConversationInCurrentTab(conversation: Conversation): void {
    if (this.currentConversation?.id !== conversation.id) {
      this.resetBackgroundTaskIndicator();
    }
    this.tabManager?.setActiveTabConversation(conversation);
    this.currentConversation = conversation;
    this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);
    this.messagesContainer?.empty();
    this.resetTurnState();
    this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(conversation.messages);
    this.startConversationSyncLoop();
    this.updateModelSelectorDisplay();
    this.syncActiveTabContextUsageIdentity();
    this.syncBackgroundTaskStateFromConversation(conversation);
    void this.renderBackgroundTaskIndicatorIfNeeded();
    void this.refreshActiveTabContextUsageFromServer();
    this.scrollToBottom();
  }

  private startConversationSyncLoop(): void {
    this.stopConversationSyncLoop();

    const shouldSyncVisibleConversation = Boolean(
      this.currentConversation?.openCodeSessionId
      && this.currentConversation.messages.length > 0,
    );
    const shouldSyncBackgroundTabs = Boolean(
      this.tabManager?.getAllTabs().some((tab) =>
        Boolean(tab.conversationId) && tab.hasBackgroundTask,
      ),
    );

    if (!shouldSyncVisibleConversation && !shouldSyncBackgroundTabs) {
      return;
    }

    this.conversationSyncIntervalId = window.setInterval(() => {
      void this.syncVisibleConversationInBackground();
      void this.syncBackgroundTaskTabsInBackground();
    }, 2000);
  }

  private stopConversationSyncLoop(): void {
    if (this.conversationSyncIntervalId !== null) {
      window.clearInterval(this.conversationSyncIntervalId);
      this.conversationSyncIntervalId = null;
    }
  }

  private async syncVisibleConversationInBackground(): Promise<void> {
    const activeTabId = this.getActiveTabId();
    const runtime = this.getTabRuntimeState(activeTabId);
    if (
      !activeTabId
      || !runtime
      || runtime.isStreaming
      || runtime.isConversationSyncInFlight
      || !this.currentConversation?.openCodeSessionId
    ) {
      return;
    }

    const expectedConversationId = this.currentConversation.id;
    runtime.isConversationSyncInFlight = true;
    try {
      const previousMessages = [...this.currentConversation.messages];
      const syncResult = await this.syncConversationMessagesFromServer(this.currentConversation, activeTabId);
      if (!syncResult.changed || this.currentConversation?.id !== expectedConversationId) {
        await this.renderBackgroundTaskIndicatorIfNeeded(activeTabId);
        return;
      }

      runtime.lastConversationSyncFingerprint = syncResult.fingerprint;
      await this.applySyncedConversationUpdate(previousMessages, this.currentConversation.messages);
    } finally {
      runtime.isConversationSyncInFlight = false;
    }
  }

  private async syncBackgroundTaskTabsInBackground(): Promise<void> {
    if (!this.tabManager) {
      return;
    }

    const activeConversationId = this.currentConversation?.id ?? null;
    for (const tab of this.tabManager.getAllTabs()) {
      if (!tab.conversationId || tab.conversationId === activeConversationId) {
        continue;
      }

      const runtime = this.getTabRuntimeState(tab.id);
      if (!runtime || runtime.isStreaming || runtime.isConversationSyncInFlight || !tab.hasBackgroundTask) {
        continue;
      }

      const conversation = await this.plugin.getConversationById(tab.conversationId);
      if (!conversation?.openCodeSessionId) {
        continue;
      }

      runtime.isConversationSyncInFlight = true;
      try {
        const previousFingerprint = runtime.lastConversationSyncFingerprint
          ?? this.getConversationSyncFingerprint(conversation.messages);
        const syncResult = await this.syncConversationMessagesFromServer(conversation, tab.id);
        this.syncBackgroundTaskStateFromConversation(conversation, tab.id);
        this.syncTabStreamLikeState(tab.id);

        if (syncResult.changed || syncResult.fingerprint !== previousFingerprint) {
          this.tabManager?.setTabNeedsAttention(tab.id, true);
        }
      } finally {
        runtime.isConversationSyncInFlight = false;
      }
    }
  }

  private getConversationSyncFingerprint(messages: ChatMessage[]): string {
    return messages
      .map((message) => JSON.stringify({
        id: message.id,
        role: message.role,
        sourceMessageId: message.sourceMessageId ?? null,
        displayStyle: message.displayStyle ?? null,
        content: message.content,
        timestamp: message.timestamp,
        omo: message.omo ? {
          kind: message.omo.kind,
          headline: message.omo.headline,
          rawText: message.omo.rawText,
        } : null,
      }))
      .join('|');
  }

  // History dropdown state
  private historyDropdownEl: HTMLElement | null = null;
  private historyDropdownClickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  /** Show conversation history */
  private showConversationHistory(event: MouseEvent) {
    const conversations = this.plugin.getConversations();
    
    if (conversations.length === 0) {
      new Notice(t('chat.history.empty'));
      return;
    }

    // Close existing dropdown if open
    this.closeHistoryDropdown();

    // Create custom dropdown
    this.historyDropdownEl = document.createElement('div');
    this.historyDropdownEl.addClass('opencodian-history-dropdown');
    
    // Create scrollable container for conversations only
    const scrollContainer = this.historyDropdownEl.createDiv({ cls: 'opencodian-history-scroll' });
    
    // Add each conversation to the dropdown
    for (const conv of conversations) {
      const isActive = this.currentConversation?.id === conv.id;
      const title = conv.title || t('chat.history.untitled');
      // Format: YYYY/M/D HH:MM:SS
      const createdAt = new Date(conv.createdAt);
      const dateStr = `${createdAt.getFullYear()}/${createdAt.getMonth() + 1}/${createdAt.getDate()} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`;
      
      const itemEl = scrollContainer.createDiv({ 
        cls: `opencodian-history-item${isActive ? ' is-active' : ''}` 
      });
      
      // Icon
      const iconEl = itemEl.createSpan({ cls: 'opencodian-history-item-icon' });
      setIcon(iconEl, isActive ? 'check' : 'message-square');
      
      // Content container for title and date
      const contentEl = itemEl.createDiv({ cls: 'opencodian-history-item-content' });
      contentEl.createDiv({ cls: 'opencodian-history-item-title', text: title });
      const metaEl = contentEl.createDiv({ cls: 'opencodian-history-item-meta' });
      metaEl.createDiv({ cls: 'opencodian-history-item-date', text: dateStr });
      if (conv.titleGenerationStatus === 'pending' || conv.titleGenerationStatus === 'failed') {
        metaEl.createSpan({
          cls: `opencodian-history-item-status is-${conv.titleGenerationStatus}`,
          text: t(`chat.history.titleGeneration.${conv.titleGenerationStatus}`),
        });
      }

      const controlsEl = itemEl.createDiv({ cls: 'opencodian-history-item-controls' });
      const renameBtn = controlsEl.createEl('button', {
        cls: 'opencodian-history-item-edit',
        attr: {
          type: 'button',
          title: t('chat.history.rename'),
          'aria-label': t('chat.history.rename'),
        },
      });
      setIcon(renameBtn, 'pencil');
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.renameConversation(conv.id);
      });
      
      // Click handler
      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeHistoryDropdown();
        if (this.isActiveTabStreaming()) {
          new Notice(t('chat.tab.streamingBlocked'));
          return;
        }
        if (!isActive) {
          void this.loadConversation(conv.id);
        }
      });
    }
    
    // Fixed footer with delete actions (outside scroll container)
    const footerEl = this.historyDropdownEl.createDiv({ cls: 'opencodian-history-footer' });
    
    // Add separator line
    footerEl.createDiv({ cls: 'opencodian-history-separator' });
    
    // Delete actions section
    const actionsEl = footerEl.createDiv({ cls: 'opencodian-history-actions' });
    
    // Delete current conversation
    const deleteCurrentEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
    const deleteCurrentIcon = deleteCurrentEl.createSpan({ cls: 'opencodian-history-action-icon' });
    setIcon(deleteCurrentIcon, 'trash');
    deleteCurrentEl.createSpan({ cls: 'opencodian-history-action-text', text: t('chat.history.deleteCurrent') });
    deleteCurrentEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeHistoryDropdown();
      void this.deleteCurrentConversation();
    });
    
    // Delete all conversations (if more than 1)
    if (conversations.length > 1) {
      const deleteAllEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
      const deleteAllIcon = deleteAllEl.createSpan({ cls: 'opencodian-history-action-icon' });
      setIcon(deleteAllIcon, 'trash-2');
      deleteAllEl.createSpan({ cls: 'opencodian-history-action-text', text: t('chat.history.deleteAll') });
      deleteAllEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeHistoryDropdown();
        void this.deleteAllConversations();
      });
    }
    
    // Add to document first so we can measure its size
    document.body.appendChild(this.historyDropdownEl);
    
    // Position the dropdown intelligently to stay within viewport
    const targetEl = event.target as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const dropdownRect = this.historyDropdownEl.getBoundingClientRect();
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate available space
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    
    // Decide whether to show below or above
    let top: number;
    if (spaceBelow >= dropdownRect.height || spaceBelow >= spaceAbove) {
      // Show below (preferred) or if there's more space below
      top = rect.bottom + 4;
      // But if it would overflow, adjust
      if (top + dropdownRect.height > viewportHeight - 8) {
        top = Math.max(8, viewportHeight - dropdownRect.height - 8);
      }
    } else {
      // Show above
      top = rect.top - dropdownRect.height - 4;
      if (top < 8) {
        top = 8;
      }
    }
    
    // Calculate left position to keep within viewport
    let left = rect.left;
    if (left + dropdownRect.width > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - dropdownRect.width - 8);
    }
    if (left < 8) {
      left = 8;
    }
    
    this.historyDropdownEl.style.position = 'fixed';
    this.historyDropdownEl.style.top = `${top}px`;
    this.historyDropdownEl.style.left = `${left}px`;
    this.historyDropdownEl.style.zIndex = '1000';
    
    // Setup click outside handler
    this.historyDropdownClickOutsideHandler = (e: MouseEvent) => {
      if (!this.historyDropdownEl?.contains(e.target as Node)) {
        this.closeHistoryDropdown();
      }
    };
    
    // Add click outside listener with small delay to avoid immediate close
    setTimeout(() => {
      document.addEventListener('click', this.historyDropdownClickOutsideHandler!);
    }, 0);
  }
  
  /** Close history dropdown */
  private closeHistoryDropdown(): void {
    if (this.historyDropdownEl) {
      this.historyDropdownEl.remove();
      this.historyDropdownEl = null;
    }
    if (this.historyDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.historyDropdownClickOutsideHandler);
      this.historyDropdownClickOutsideHandler = null;
    }
  }

  /** Delete current conversation with 3-second confirmation */
  private async deleteCurrentConversation() {
    if (!this.currentConversation) return;
    
    // Create custom confirmation modal with 3-second countdown
    const confirmed = await this.showDeleteCurrentConfirmDialog(this.currentConversation.title || t('chat.history.untitled'));
    if (!confirmed) return;
    
    const deletedId = this.currentConversation.id;
    await this.plugin.deleteConversation(deletedId);

    const activeTabId = this.tabManager?.getActiveTab()?.id ?? null;
    if (activeTabId && this.tabManager) {
      const closeResult = this.tabManager.closeTab(activeTabId);
      if (closeResult.nextActiveTabId) {
        await this.activateTab(closeResult.nextActiveTabId);
      } else {
        await this.createNewConversation();
      }
    } else {
      await this.createNewConversation();
    }
    
    new Notice(t('chat.deleteCurrentConfirm.success') || 'Conversation deleted');
  }

  /** Show delete current conversation confirmation dialog with 3-second countdown */
  private async showDeleteCurrentConfirmDialog(title: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.addClass('opencodian-delete-confirm-overlay');
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.addClass('opencodian-delete-confirm-dialog');
      
      // Title with warning icon
      const titleEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-title' });
      titleEl.setText(t('chat.deleteCurrentConfirm.title'));
      
      // Warning text
      const warningEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-warning' });
      warningEl.setText(t('chat.deleteCurrentConfirm.warning'));
      
      // Description with conversation title
      const descEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-desc' });
      descEl.setText(t('chat.deleteCurrentConfirm.description', { title }));
      
      // Emphasis text
      const emphasisEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-emphasis' });
      emphasisEl.setText(t('chat.deleteCurrentConfirm.emphasis'));
      
      // Buttons container
      const buttonsEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-buttons' });
      
      // Confirm button (red, with countdown) - LEFT side
      const confirmBtn = buttonsEl.createEl('button', { 
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-confirm',
        text: t('chat.deleteCurrentConfirm.confirm', { seconds: '3' })
      });
      confirmBtn.setAttribute('disabled', 'true');
      
      // Cancel button - RIGHT side, larger
      const cancelBtn = buttonsEl.createEl('button', { 
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-cancel',
        text: t('chat.deleteCurrentConfirm.cancel')
      });
      
      // Append to document
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      let countdown = 3;
      let timerId: number | null = null;
      
      // Countdown logic (3 seconds)
      const startCountdown = () => {
        timerId = window.setInterval(() => {
          countdown--;
          if (countdown > 0) {
            confirmBtn.setText(t('chat.deleteCurrentConfirm.confirm', { seconds: String(countdown) }));
          } else {
            // Enable confirm button
            if (timerId) {
              window.clearInterval(timerId);
              timerId = null;
            }
            confirmBtn.removeAttribute('disabled');
            // Remove countdown text, show only confirm text
            confirmBtn.setText(t('chat.deleteCurrentConfirm.confirmText'));
          }
        }, 1000);
      };
      
      // Start countdown after a short delay
      setTimeout(startCountdown, 100);
      
      // Cancel handler
      const handleCancel = () => {
        if (timerId) {
          window.clearInterval(timerId);
        }
        overlay.remove();
        resolve(false);
      };
      
      // Confirm handler
      const handleConfirm = () => {
        if (countdown > 0) return; // Still counting down
        if (timerId) {
          window.clearInterval(timerId);
        }
        overlay.remove();
        resolve(true);
      };
      
      // Click outside to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });
      
      // Button handlers
      cancelBtn.addEventListener('click', handleCancel);
      confirmBtn.addEventListener('click', handleConfirm);
      
      // Escape to cancel
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }

  /** Delete all conversations with 5-second confirmation */
  private async deleteAllConversations() {
    const conversations = this.plugin.getConversations();
    if (conversations.length === 0) return;

    // Create custom confirmation modal
    const confirmed = await this.showDeleteAllConfirmDialog(conversations.length);
    if (!confirmed) return;
    
    for (const conv of conversations) {
      await this.plugin.deleteConversation(conv.id);
    }

    this.clearTabMessagesPanes();

    this.tabManager = new TabManager(t('chat.tab.new'), {
      getMaxTabs: () => this.plugin.settings.maxTabs,
      onChanged: () => {
        this.renderTabBar();
        this.persistTabState();
      },
    });
    this.renderTabBar();
    await this.createNewConversation();
    new Notice(t('chat.deleteAllConfirm.success') || 'All conversations deleted');
  }

  /** Show delete all confirmation dialog with 5-second countdown */
  private async showDeleteAllConfirmDialog(count: number): Promise<boolean> {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.addClass('opencodian-delete-confirm-overlay');
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.addClass('opencodian-delete-confirm-dialog');
      
      // Title with warning icon
      const titleEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-title' });
      titleEl.setText(t('chat.deleteAllConfirm.title'));
      
      // Warning text
      const warningEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-warning' });
      warningEl.setText(t('chat.deleteAllConfirm.warning'));
      
      // Description
      const descEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-desc' });
      descEl.setText(t('chat.deleteAllConfirm.description', { count: String(count) }));
      
      // Emphasis text
      const emphasisEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-emphasis' });
      emphasisEl.setText(t('chat.deleteAllConfirm.emphasis'));
      
      // Buttons container
      const buttonsEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-buttons' });
      
      // Confirm button (red, with countdown) - LEFT side
      const confirmBtn = buttonsEl.createEl('button', { 
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-confirm',
        text: t('chat.deleteAllConfirm.confirm', { seconds: '6' })
      });
      confirmBtn.setAttribute('disabled', 'true');
      
      // Cancel button - RIGHT side, larger
      const cancelBtn = buttonsEl.createEl('button', { 
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-cancel',
        text: t('chat.deleteAllConfirm.cancel')
      });
      
      // Append to document
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      let countdown = 6;
      let timerId: number | null = null;
      
      // Countdown logic (6 seconds)
      const startCountdown = () => {
        timerId = window.setInterval(() => {
          countdown--;
          if (countdown > 0) {
            confirmBtn.setText(t('chat.deleteAllConfirm.confirm', { seconds: String(countdown) }));
          } else {
            // Enable confirm button
            if (timerId) {
              window.clearInterval(timerId);
              timerId = null;
            }
            confirmBtn.removeAttribute('disabled');
            // Remove countdown text, show only confirm text
            confirmBtn.setText(t('chat.deleteAllConfirm.confirmText'));
          }
        }, 1000);
      };
      
      // Start countdown after a short delay
      setTimeout(startCountdown, 100);
      
      // Cancel handler
      const handleCancel = () => {
        if (timerId) {
          window.clearInterval(timerId);
        }
        overlay.remove();
        resolve(false);
      };
      
      // Confirm handler
      const handleConfirm = () => {
        if (countdown > 0) return; // Still counting down
        if (timerId) {
          window.clearInterval(timerId);
        }
        overlay.remove();
        resolve(true);
      };
      
      // Click outside to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });
      
      // Button handlers
      cancelBtn.addEventListener('click', handleCancel);
      confirmBtn.addEventListener('click', handleConfirm);
      
      // Escape to cancel
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }

  /** Send a message */
  private async sendMessage(content: string) {
    if (!this.currentConversation) {
      await this.createNewConversation();
    }

    if (!this.currentConversation) return;
    const sendingConversation = this.currentConversation;
    const sendingTabId = this.getActiveTabId();
    if (!sendingTabId) {
      return;
    }
    const sendingRuntime = this.ensureTabRuntimeState(sendingTabId);
    if (!sendingRuntime) {
      return;
    }

    if (sendingRuntime.isStreaming || this.hasTabBackgroundTaskIndicator(sendingTabId)) {
      new Notice(t('chat.tab.processingBlocked'));
      return;
    }

    const shouldAutoScrollOnSend = this.shouldAutoScroll();

    // Add user message to conversation and UI
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.resetBackgroundTaskIndicator();
    this.armBackgroundTaskIndicatorForUserMessage(userMessage);
    sendingConversation.messages.push(userMessage);
    this.startConversationSyncLoop();
    await this.renderMessage(userMessage);
    this.scrollToBottomIfNeeded(shouldAutoScrollOnSend);

    const isFirstUserMessage = sendingConversation.messages.filter((message) => message.role === 'user').length === 1;
    const modelOptions = this.getSendMessageOptions();
    if (isFirstUserMessage) {
      await this.applyFallbackConversationTitle(sendingConversation.id, content);
      if (this.plugin.settings.titleMode === 'ai') {
        void this.startAiConversationTitleGeneration(sendingConversation.id, content, modelOptions);
      }
    }

    const availability = await this.getServerAvailability();
    await this.refreshServerStatusBadge();
    if (availability !== 'running' && availability !== 'external') {
      const ready = await this.ensureServerReadyForChat(availability);
      if (!ready) {
        return;
      }
    }

    const activeModelId = this.formatModelId(modelOptions);
    if (!(await this.ensureSelectedModelAvailable(modelOptions.provider, modelOptions.model))) {
      await this.appendModelUnavailableNoticeMessage();
      return;
    }

    sendingRuntime.isStreaming = true;
    this.syncTabStreamLikeState(sendingTabId);
    this.beginTabContextUsageStream(sendingTabId);

    const STREAM_IDLE_TIMEOUT_MS = 300000; // 5 minutes of no new stream chunks
    let timeoutId: number | null = null;
    let streamCompleted = false;
    let streamInterrupted = false;
    let streamTimedOut = false;
    const resetStreamingState = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      sendingRuntime.isStreaming = false;
      this.syncTabStreamLikeState(sendingTabId);
    };

    const scheduleStreamTimeout = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        if (!sendingRuntime.isStreaming) {
          return;
        }

        streamTimedOut = true;
        streamInterrupted = true;
        latestErrorMessage = this.getFriendlyStreamErrorMessage('Response timeout');
        logger.warn('Stream idle timeout, forcing state reset');

        sendingRuntime.streamController?.timeoutStream();
        this.plugin.openCodeService.cancelStream(sendingConversation.openCodeSessionId);
        resetStreamingState();
      }, STREAM_IDLE_TIMEOUT_MS);
    };

    scheduleStreamTimeout();

    // Stream response with current session model
    const stream = this.plugin.openCodeService.sendMessage(content, {
      sessionId: sendingConversation.openCodeSessionId,
      ...modelOptions,
    });

    const { contentEl } = this.createAssistantMessageElement(sendingTabId);
    const streamController = this.getOrCreateTabStreamController(sendingTabId);
    if (this.getActiveTabId() === sendingTabId) {
      this.scheduleSettledScrollToBottomIfNeeded(shouldAutoScrollOnSend);
    }

    // Show pending indicator after a short delay
    const pendingState: { element: HTMLElement | null } = { element: null };
    let pendingStartTime = 0;
    const pendingMessage = getRandomPendingMessage();
    let latestErrorMessage: string | null = null;
    let receivedMeaningfulChunk = false;
    logger.debug('Setting up pending indicator timeout');
    const pendingTimeout = window.setTimeout(() => {
      logger.debug('Pending indicator timeout fired, isStreaming:', sendingRuntime.isStreaming);
      if (!sendingRuntime.isStreaming || !contentEl) {
        logger.debug('Not showing pending indicator - not streaming or no element');
        return;
      }

      const shouldAutoScrollPending = this.getActiveTabId() === sendingTabId && this.shouldAutoScroll();
      logger.debug('Showing pending indicator:', pendingMessage);
      pendingState.element = contentEl.createDiv({ cls: 'opencodian-pending' });
      pendingState.element.createSpan({ 
        text: pendingMessage,
        cls: 'opencodian-pending-text' 
      });
      const hintEl = pendingState.element.createSpan({ cls: 'opencodian-pending-hint' });
      pendingStartTime = Date.now();
      
      // Update timer every second
      const updateTimer = () => {
        if (!pendingState.element || !pendingState.element.isConnected) return;
        const elapsed = Math.floor((Date.now() - pendingStartTime) / 1000);
        hintEl.setText(` (esc to interrupt · ${elapsed}s)`);
      };
      updateTimer();
      pendingState.element.dataset.timerInterval = String(window.setInterval(updateTimer, 1000));
      if (this.getActiveTabId() === sendingTabId) {
        this.scheduleSettledScrollToBottomIfNeeded(shouldAutoScrollPending);
      }
    }, 1000); // Show after 1s delay

    if (streamController) {
      streamController.startStream(contentEl);
    }

    let receivedFirstChunk = false;

    try {
      for await (const chunk of stream) {
        if (!sendingRuntime.isStreaming) {
          logger.debug('Streaming cancelled, breaking loop');
          streamInterrupted = true;
          break;
        }

        scheduleStreamTimeout();

        if (chunk.type === 'message_start') {
          void this.syncLatestUserMessageFromServer(
            sendingConversation,
            userMessage.id,
            sendingTabId,
          );
          this.beginTabContextUsageStream(sendingTabId);
          continue;
        }

        if (chunk.type === 'usage') {
          this.applyUsageChunkToTab(sendingTabId, chunk);
          continue;
        }

        if (chunk.type === 'message_stop') {
          streamCompleted = true;
          this.completeTabContextUsageStream(sendingTabId);
        }

        // Handle permission request
        if (chunk.type === 'permission_request') {
          receivedMeaningfulChunk = true;
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          await this.showPermissionDialog(chunk, sendingTabId);
          
          if (sendingRuntime.isStreaming) {
            scheduleStreamTimeout();
          }
          continue;
        }

        const streamingChunk = this.convertToStreamingChunk(chunk);
        if (streamingChunk && streamController) {
          if (streamingChunk.type === 'error') {
            latestErrorMessage = this.getFriendlyStreamErrorMessage(streamingChunk.content);
            streamingChunk.content = latestErrorMessage;
          } else {
            receivedMeaningfulChunk = true;
          }
          await streamController.handleChunk(streamingChunk);
          
          const hasContent = (streamingChunk.type === 'text' && streamingChunk.content?.trim()) ||
                            (streamingChunk.type === 'thinking' && streamingChunk.content?.trim()) ||
                            streamingChunk.type === 'tool_use';
          
          if (!receivedFirstChunk && hasContent) {
            receivedFirstChunk = true;
            logger.debug('First content chunk received, clearing pending timeout/indicator');
            window.clearTimeout(pendingTimeout);
            if (pendingState.element?.parentNode) {
              logger.debug('Removing pending indicator');
              // Clear timer interval
              if (pendingState.element.dataset.timerInterval) {
                window.clearInterval(Number(pendingState.element.dataset.timerInterval));
              }
              pendingState.element.remove();
              pendingState.element = null;
            }
          }
        }
      }

      if (sendingRuntime.isStreaming && !receivedMeaningfulChunk && !latestErrorMessage && streamController) {
        latestErrorMessage = this.getFriendlyStreamErrorMessage('');
        await streamController.handleChunk({
          type: 'error',
          content: latestErrorMessage,
        });
      }
      
      if (sendingRuntime.isStreaming && streamController) {
        await streamController.handleChunk({ type: 'done' });
      }
    } catch (error) {
      logger.error('Streaming error:', error);
      latestErrorMessage = this.getFriendlyStreamErrorMessage(
        error instanceof Error ? error.message : 'Unknown error'
      );
      if (streamController) {
        await streamController.handleChunk({ 
          type: 'error', 
          content: latestErrorMessage,
        });
      }
    } finally {
      logger.debug('Stream loop ended');
      resetStreamingState();
      this.completeTabContextUsageStream(sendingTabId);
      window.clearTimeout(pendingTimeout);
      if (pendingState.element?.dataset.timerInterval) {
        window.clearInterval(Number(pendingState.element.dataset.timerInterval));
      }
      pendingState.element?.remove();
      pendingState.element = null;
      await this.finalizeBackgroundTaskIndicatorAfterPrimaryStream(sendingTabId);
      this.syncTabStreamLikeState(sendingTabId);
      await this.refreshServerStatusBadge();
      
      const finalizedTimestamp = Date.now();

      if (sendingRuntime.streamingMessageEl) {
        const streamContentBlocks = streamController?.getContentBlocks();
        const textContent = streamContentBlocks
          ?.filter((b): b is { type: 'text'; content: string } => b.type === 'text')
          .map(b => b.content.trim())
          .filter(Boolean)
          .join('') || '';
        this.addTimestampWithCopyButton(
          sendingRuntime.streamingMessageEl,
          finalizedTimestamp,
          textContent,
          activeModelId,
        );
        if (this.getActiveTabId() === sendingTabId) {
          this.scheduleSettledScrollToBottomIfNeeded();
        }
      }
      
      const streamContentBlocks = streamController?.getContentBlocks();
      sendingRuntime.streamingMessageEl = null;
      sendingRuntime.streamingContentEl = null;
      
      if (streamContentBlocks && streamContentBlocks.length > 0) {
        const textContent = streamContentBlocks
          .filter((b): b is { type: 'text'; content: string } => b.type === 'text')
          .map(b => b.content)
          .join('');
        
        const contentBlocks: ContentBlock[] = streamContentBlocks.map(b => {
          if (b.type === 'text') {
            return { type: 'text', text: b.content };
          } else if (b.type === 'thinking') {
            return { 
              type: 'thinking', 
              thinking: b.content,
              durationSeconds: b.durationSeconds,
            };
          } else if (b.type === 'tool_call') {
            return {
              type: 'tool_use',
              toolId: b.toolCall.id,
              toolName: b.toolCall.name,
              toolInput: b.toolCall.input,
              toolStatus: b.toolCall.status,
              toolResult: b.toolCall.result,
            };
          }
          return { type: 'text', text: '' };
        });
        
        const assistantMessage: ChatMessage = {
          id: `assistant-${finalizedTimestamp}`,
          role: 'assistant',
          content: textContent,
          timestamp: finalizedTimestamp,
          modelId: activeModelId,
          contentBlocks: contentBlocks,
        };
        
        sendingConversation.messages.push(assistantMessage);
      } else if (latestErrorMessage) {
        sendingConversation.messages.push({
          id: `assistant-${finalizedTimestamp}`,
          role: 'assistant',
          content: latestErrorMessage,
          timestamp: finalizedTimestamp,
          modelId: activeModelId,
        });
      }
    }

    if (sendingConversation) {
      const shouldSyncFromServer = streamCompleted && !streamTimedOut && !streamInterrupted && !latestErrorMessage;
      if (shouldSyncFromServer) {
        const syncResult = await this.syncConversationMessagesFromServer(sendingConversation, sendingTabId);
        if (this.currentConversation?.id === sendingConversation.id && this.getActiveTabId() === sendingTabId) {
          const activeRuntime = this.getTabRuntimeState(sendingTabId);
          if (activeRuntime) {
            activeRuntime.lastConversationSyncFingerprint = syncResult.fingerprint;
          }
          await this.rerenderConversationMessages(sendingConversation);
        }
      }
      sendingConversation.updatedAt = Date.now();
      await this.plugin.saveConversation(sendingConversation);
      if (this.currentConversation?.id === sendingConversation.id && this.getActiveTabId() === sendingTabId) {
        const activeRuntime = this.getTabRuntimeState(sendingTabId);
        if (activeRuntime) {
          activeRuntime.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(sendingConversation.messages);
        }
        this.tabManager?.setTabNeedsAttention(sendingTabId, false);
        this.tabManager?.setActiveTabConversation(sendingConversation);
        this.syncActiveTabContextUsageIdentity();
        await this.refreshActiveTabContextUsageFromServer();
      } else {
        this.tabManager?.setTabNeedsAttention(sendingTabId, true);
      }
    }
  }

  private async ensureServerReadyForChat(availability: Exclude<ChatServerAvailability, 'running' | 'external'>): Promise<boolean> {
    const { messageEl, contentEl } = this.createAssistantContainerElement();
    const cardEl = contentEl.createDiv({ cls: 'opencodian-server-action-card' });
    cardEl.createDiv({
      cls: 'opencodian-server-action-title',
      text: t('chat.serverPrompt.title'),
    });
    cardEl.createDiv({
      cls: 'opencodian-server-action-desc',
      text: this.getUnavailableServerMessage(availability),
    });

    const statusEl = cardEl.createDiv({
      cls: 'opencodian-server-action-status',
      text: `${t('chat.serverPrompt.currentStatus')} ${t(
        availability === 'starting'
          ? 'chat.serverStatus.starting'
          : 'chat.serverStatus.offline'
      )}`,
    });

    const buttonRow = cardEl.createDiv({ cls: 'opencodian-server-action-buttons' });
    const primaryButtonLabel = this.plugin.settings.server.mode === 'local'
      ? t('chat.serverPrompt.start')
      : t('chat.serverPrompt.retry');
    const startBtn = buttonRow.createEl('button', {
      cls: 'opencodian-server-action-btn mod-cta',
      text: primaryButtonLabel,
    });
    const skipBtn = buttonRow.createEl('button', {
      cls: 'opencodian-server-action-btn',
      text: t('chat.serverPrompt.skip'),
    });
    const settingsBtn = buttonRow.createEl('button', {
      cls: 'opencodian-server-action-btn',
      text: t('chat.serverPrompt.settings'),
    });

    const choice = await new Promise<'start' | 'skip' | 'settings'>((resolve) => {
      startBtn.addEventListener('click', () => resolve('start'));
      skipBtn.addEventListener('click', () => resolve('skip'));
      settingsBtn.addEventListener('click', () => resolve('settings'));
    });

    if (choice === 'settings') {
      this.openPluginSettingsAtServerSection();
      await this.refreshStatusSurfaces();
      const latestAvailability = await this.getServerAvailability();
      if (latestAvailability === 'running' || latestAvailability === 'external') {
        messageEl.remove();
        return true;
      }
      await this.finalizeAssistantMessageWithError(
        messageEl,
        contentEl,
        this.getUnavailableServerMessage(latestAvailability)
      );
      return false;
    }

    if (choice === 'skip') {
      await this.refreshStatusSurfaces();
      const latestAvailability = await this.getServerAvailability();
      if (latestAvailability === 'running' || latestAvailability === 'external') {
        messageEl.remove();
        return true;
      }
      await this.finalizeAssistantMessageWithError(
        messageEl,
        contentEl,
        this.getUnavailableServerMessage(latestAvailability)
      );
      return false;
    }

    startBtn.disabled = true;
    skipBtn.disabled = true;
    settingsBtn.disabled = true;
    cardEl.addClass('is-starting');
    statusEl.setText(
      this.plugin.settings.server.mode === 'local'
        ? t('chat.serverPrompt.starting')
        : t('chat.serverStatus.checking')
    );

    try {
      await this.plugin.openCodeService.start();
      await this.refreshStatusSurfaces();
      messageEl.remove();
      this.scrollToBottom();
      return true;
    } catch (error) {
      logger.error('Failed to start server from chat prompt:', error);
      await this.refreshStatusSurfaces();
      await this.finalizeAssistantMessageWithError(
        messageEl,
        contentEl,
        this.getFriendlyServerStartErrorMessage(error)
      );
      return false;
    }
  }

  private createAssistantContainerElement(): { messageEl: HTMLElement; contentEl: HTMLElement } {
    const messageEl = this.ensureTurnBody()?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant',
    });

    if (!messageEl) {
      const fallback = document.createElement('div');
      return { messageEl: fallback, contentEl: fallback };
    }

    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    return { messageEl, contentEl };
  }

  private async finalizeAssistantMessageWithError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    message: string
  ): Promise<void> {
    contentEl.empty();
    const errorEl = contentEl.createDiv({ cls: 'streaming-error-block' });
    errorEl.createSpan({ cls: 'streaming-error-icon', text: '❌' });
    errorEl.createSpan({ cls: 'streaming-error-text', text: message });

    const timestamp = Date.now();
    const modelId = this.formatModelId(this.getCurrentSessionModel());
    this.addTimestampWithCopyButton(messageEl, timestamp, message, modelId);

    if (this.currentConversation) {
      this.currentConversation.messages.push({
        id: `assistant-${timestamp}`,
        role: 'assistant',
        content: message,
        timestamp,
        modelId,
      });
      this.currentConversation.updatedAt = Date.now();
      await this.plugin.storage.saveConversation(this.currentConversation);
      this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(this.currentConversation.messages);
    }

    this.scrollToBottom();
  }

  private async refreshStatusSurfaces(): Promise<void> {
    await this.refreshServerStatusBadge();
    this.plugin.settingsTab?.refreshServerStatusDisplay();
  }

  private getFriendlyServerStartErrorMessage(error: unknown): string {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const lowerMessage = rawMessage.toLowerCase();

    if (lowerMessage.includes('opencode not found')) {
      return t('chat.error.serverBinaryMissing');
    }

    if (lowerMessage.includes('already in use')) {
      return t('chat.error.serverPortInUse');
    }

    return `${t('chat.error.serverStartFailed')}\n${rawMessage}`;
  }

  private getUnavailableServerMessage(availability: Exclude<ChatServerAvailability, 'running' | 'external'>): string {
    if (availability === 'starting') {
      return t('chat.error.serverStarting');
    }

    return t('chat.error.serverOffline');
  }

  private getFriendlyStreamErrorMessage(rawMessage: string): string {
    const message = rawMessage.trim();
    const lowerMessage = message.toLowerCase();

    if (!message) {
      return t('chat.error.serverNoResponse');
    }

    if (
      lowerMessage.includes('failed to fetch')
      || lowerMessage.includes('econnrefused')
      || lowerMessage.includes('networkerror')
      || lowerMessage.includes('sse connection failed')
      || lowerMessage.includes('fetch failed')
      || lowerMessage.includes('http 0')
    ) {
      return t('chat.error.serverConnection');
    }

    if (lowerMessage.includes('opencode not found')) {
      return t('chat.error.serverBinaryMissing');
    }

    return `${t('chat.error.sendFailed')}\n${message}`;
  }

  private async appendAssistantErrorMessage(message: string): Promise<void> {
    const activeTabId = this.getActiveTabId();
    const activeRuntime = this.getTabRuntimeState(activeTabId);
    const { messageEl, contentEl } = this.createAssistantMessageElement(activeTabId);
    const streamController = this.getOrCreateTabStreamController(activeTabId);

    if (streamController) {
      streamController.startStream(contentEl);
      await streamController.handleChunk({ type: 'error', content: message });
      await streamController.handleChunk({ type: 'done' });
    } else {
      const errorEl = contentEl.createDiv({ cls: 'streaming-error-block' });
      errorEl.createSpan({ cls: 'streaming-error-icon', text: '❌' });
      errorEl.createSpan({ cls: 'streaming-error-text', text: message });
    }

    const timestamp = Date.now();
    const modelId = this.formatModelId(this.getCurrentSessionModel());
    this.addTimestampWithCopyButton(messageEl, timestamp, message, modelId);
    if (activeRuntime) {
      activeRuntime.streamingMessageEl = null;
      activeRuntime.streamingContentEl = null;
    }

    if (this.currentConversation) {
      this.currentConversation.messages.push({
        id: `assistant-${timestamp}`,
        role: 'assistant',
        content: message,
        timestamp,
        modelId,
      });
      this.currentConversation.updatedAt = Date.now();
      await this.plugin.storage.saveConversation(this.currentConversation);
    }

    this.scrollToBottom();
  }

  /** Cancel streaming */
  private cancelStreaming() {
    logger.debug('cancelStreaming called, isStreaming:', this.isStreaming);
    if (!this.isActiveTabStreaming()) {
      return;
    }
    
    // Call service to abort the SSE connection
    logger.debug('Calling openCodeService.cancelStream()...');
    if (this.currentConversation?.openCodeSessionId) {
      this.plugin.openCodeService.cancelStream(this.currentConversation.openCodeSessionId);
    }
    
    // Update local state
    this.isStreaming = false;
    this.streamController?.cancelStream();
    this.syncActiveTabStreamLikeState();
    logger.debug('isStreaming set to false');
    
    new Notice('Streaming cancelled');
  }

  /** Update send button icon based on streaming state */
  private updateSendButtonState() {
    if (!this.sendBtn) return;
    
    // Clear current icon
    this.sendBtn.empty();
    
    if (this.isActiveTabStreaming()) {
      // Show stop icon (square)
      setIcon(this.sendBtn, 'square');
      this.sendBtn.addClass('opencodian-stop-btn');
      this.sendBtn.removeClass('opencodian-send-btn');
      this.sendBtn.setAttribute('aria-label', 'Stop streaming');
    } else {
      // Show send icon
      setIcon(this.sendBtn, 'send');
      this.sendBtn.addClass('opencodian-send-btn');
      this.sendBtn.removeClass('opencodian-stop-btn');
      this.sendBtn.setAttribute('aria-label', 'Send message');
    }
  }

  /** Render a message */
  private async renderMessage(message: ChatMessage) {
    const parentEl =
      message.displayStyle === 'notice'
        ? this.ensureTurnBody()
        : message.role === 'user'
        ? this.createTurn()?.headerEl
        : this.ensureTurnBody();
    const messageEl = parentEl?.createDiv({
      cls: `opencodian-message opencodian-message--${message.role}`,
    });

    if (!messageEl) return;
    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
    }
    if (message.displayStyle === 'notice') {
      messageEl.removeClass('opencodian-message--user');
      messageEl.addClass('opencodian-message--assistant');
    }

    // Content container
    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });

    if (message.displayStyle === 'notice') {
      messageEl.addClass('opencodian-message--notice');
      await this.renderNoticeCard(content, message);
      this.addTimestampWithCopyButton(messageEl, message.timestamp, undefined, message.modelId);
    } else if (message.role === 'user') {
      const copyContent = await this.renderUserMessageContent(content, message);
      this.addUserMessageFooter(messageEl, message, copyContent);
    } else if (message.contentBlocks && message.contentBlocks.length > 0) {
      // For assistant messages, render content blocks (thinking, tools, etc.)
      for (const block of message.contentBlocks) {
        await this.renderContentBlock(content, block);
      }
      // Collect all text content (trim leading/trailing whitespace)
      const textContent = message.contentBlocks
        .filter(b => b.type === 'text' && b.text)
        .map(b => b.text?.trim())
        .filter(Boolean)
        .join('\n\n');
      // Add timestamp with copy button
      this.addTimestampWithCopyButton(messageEl, message.timestamp, textContent, message.modelId);
    } else if (message.content) {
      // Fallback to simple text rendering for assistant
      const textEl = content.createDiv({ cls: 'opencodian-message-text' });
      if (this.markdownService) {
        await this.markdownService.render(textEl, message.content);
      } else {
        textEl.textContent = message.content;
      }
      // Add timestamp with copy button
      this.addTimestampWithCopyButton(messageEl, message.timestamp, message.content, message.modelId);
    }

    return messageEl;
  }

  private async renderUserMessageContent(container: HTMLElement, message: ChatMessage): Promise<string> {
    const visibleText = this.getVisibleUserMessageText(message);
    if (visibleText) {
      const textEl = container.createDiv({ cls: 'opencodian-message-text' });
      textEl.textContent = visibleText;
      const collapseToggleEl = container.createEl('button');
      const collapsibleState: CollapsibleState = {
        isExpanded: false,
        isCollapsible: false,
      };
      setupCollapsible(container, collapseToggleEl, textEl, collapsibleState, {
        showMoreLabel: t('chat.action.showMore'),
        showLessLabel: t('chat.action.showLess'),
      });
    }

    if (message.omo?.kind === 'user-injection') {
      await this.renderOmoUserInjection(container, message);
    }

    return visibleText;
  }

  private getVisibleUserMessageText(message: ChatMessage): string {
    return message.omo?.kind === 'user-injection'
      ? message.omo.originalText
      : message.content;
  }

  private async renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void> {
    if (this.markdownService) {
      await this.markdownService.render(container, markdown);
      return;
    }

    container.setText(markdown);
  }

  private async renderOmoUserInjection(container: HTMLElement, message: ChatMessage): Promise<void> {
    if (message.omo?.kind !== 'user-injection') {
      return;
    }

    const panelEl = container.createDiv({ cls: 'opencodian-omo-injection' });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-omo-injection-header' });
    headerEl.createSpan({
      cls: 'opencodian-omo-injection-badge',
      text: this.getOmoModeBadgeLabel(message.omo.modeTag),
    });
    headerEl.createSpan({
      cls: 'opencodian-omo-injection-title',
      text: t('chat.omo.injected.title'),
    });

    const summaryEl = panelEl.createDiv({ cls: 'opencodian-omo-injection-summary' });
    await this.renderMarkdownInto(summaryEl, this.getOmoInjectionSummary(message));

    const rawWrapperEl = panelEl.createDiv({ cls: 'opencodian-omo-raw-block' });
    rawWrapperEl.createDiv({
      cls: 'opencodian-omo-raw-label',
      text: t('chat.omo.injected.rawLabel'),
    });
    const rawContentEl = rawWrapperEl.createEl('pre', {
      cls: 'opencodian-omo-raw-content',
      text: message.omo.injectedPrompt,
    });
    const rawToggleEl = rawWrapperEl.createEl('button');
    const rawState: CollapsibleState = {
      isExpanded: false,
      isCollapsible: false,
    };
    setupCollapsible(rawWrapperEl, rawToggleEl, rawContentEl, rawState, {
      collapsedHeight: 96,
      showMoreLabel: t('chat.omo.injected.showRaw'),
      showLessLabel: t('chat.omo.injected.hideRaw'),
    });
  }

  private async renderMessages(messages: ChatMessage[]): Promise<void> {
    const groups = buildMessageRenderGroups(messages);

    for (const group of groups) {
      if (!group.mergedAssistant || group.messages.length === 1) {
        await this.renderMessage(group.messages[0]);
        continue;
      }

      await this.renderMessage(mergeAssistantMessagesForRender(group.messages));
    }
  }

  private armBackgroundTaskIndicatorForUserMessage(
    message: ChatMessage,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (message.omo?.kind !== 'user-injection' || message.omo.modeTag !== 'search-mode') {
      return;
    }

    runtime.backgroundTaskStartedAt = message.timestamp;
    runtime.backgroundTaskModeTag = message.omo.modeTag;
    runtime.backgroundTaskWaitingForFollowUp = false;
  }

  private hasActiveBackgroundTaskIndicator(): boolean {
    return this.hasTabBackgroundTaskIndicator(this.getActiveTabId());
  }

  private resetBackgroundTaskIndicator(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.backgroundTaskIndicatorEl?.remove();
    runtime.backgroundTaskIndicatorEl = null;
    runtime.backgroundTaskStartedAt = null;
    runtime.backgroundTaskModeTag = null;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskLaunches.clear();
    runtime.backgroundTaskCompletedTasks.clear();
    this.syncTabStreamLikeState(tabId);
  }

  private isBackgroundTaskTool(toolName: string): boolean {
    return toolName === 'task';
  }

  private getBackgroundTaskDescription(
    input: Record<string, unknown>,
    fallbackResult?: string,
  ): string {
    const description = [
      input.description,
      input.prompt,
      input.title,
      input.summary,
      input.query,
      input.command,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (description) {
      return description.trim();
    }

    if (fallbackResult) {
      const trimmed = fallbackResult.trim();
      if (trimmed.length > 0) {
        return trimmed.split(/\r?\n/)[0].trim();
      }
    }

    return t('chat.backgroundTask.noDescription');
  }

  private extractBackgroundTaskId(...sources: unknown[]): string | null {
    const pattern = /\b(bg_[a-z0-9]+)\b/i;

    for (const source of sources) {
      if (typeof source === 'string') {
        const match = source.match(pattern);
        if (match?.[1]) {
          return match[1];
        }
        continue;
      }

      if (source && typeof source === 'object') {
        const nested = [
          (source as Record<string, unknown>).task_id,
          (source as Record<string, unknown>).taskId,
          (source as Record<string, unknown>).id,
        ];
        const directMatch = this.extractBackgroundTaskId(...nested);
        if (directMatch) {
          return directMatch;
        }

        try {
          const match = JSON.stringify(source).match(pattern);
          if (match?.[1]) {
            return match[1];
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private upsertBackgroundTaskLaunch(toolCall: {
    id: string;
    input: Record<string, unknown>;
    result?: string;
  }, target: Map<string, BackgroundTaskLaunchInfo> = this.backgroundTaskLaunches): void {
    const existing = target.get(toolCall.id);
    const description = this.getBackgroundTaskDescription(toolCall.input, toolCall.result ?? existing?.description);
    const taskId = this.extractBackgroundTaskId(toolCall.input, toolCall.result, existing?.taskId) ?? null;

    target.set(toolCall.id, {
      launchId: toolCall.id,
      taskId,
      description,
    });
  }

  private addCompletedBackgroundTasksFromMessage(
    message: ChatMessage,
    target: Map<string, BackgroundTaskCompletionInfo> = this.backgroundTaskCompletedTasks,
  ): void {
    if (message.omo?.kind !== 'system-reminder' || !message.omo.tasks || message.omo.tasks.length === 0) {
      return;
    }

    for (const task of message.omo.tasks) {
      if (!task.id && !task.description) {
        continue;
      }

      const completionId = task.id || task.description;
      target.set(completionId, {
        taskId: task.id || completionId,
        description: task.description || t('chat.backgroundTask.noDescription'),
      });
    }
  }

  private findBackgroundTaskAnchorIndex(messages: ChatMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        return index;
      }
    }

    return -1;
  }

  private syncBackgroundTaskStateFromConversation(
    conversation: Conversation | null = this.currentConversation,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.backgroundTaskStartedAt = null;
    runtime.backgroundTaskModeTag = null;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskLaunches.clear();
    runtime.backgroundTaskCompletedTasks.clear();

    if (!conversation || conversation.messages.length === 0) {
      runtime.backgroundTaskIndicatorEl?.remove();
      runtime.backgroundTaskIndicatorEl = null;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    const anchorIndex = this.findBackgroundTaskAnchorIndex(conversation.messages);
    if (anchorIndex < 0) {
      return;
    }

    const anchorMessage = conversation.messages[anchorIndex];
    runtime.backgroundTaskStartedAt = anchorMessage.timestamp;
    runtime.backgroundTaskModeTag = anchorMessage.omo?.kind === 'user-injection'
      ? anchorMessage.omo.modeTag
      : null;

    let sawAllTasksComplete = false;
    for (const message of conversation.messages.slice(anchorIndex + 1)) {
      if (message.omo?.kind === 'system-reminder') {
        this.addCompletedBackgroundTasksFromMessage(message, runtime.backgroundTaskCompletedTasks);
        if (message.omo.reminderType === 'all-background-tasks-complete') {
          sawAllTasksComplete = true;
        }
      }

      for (const block of message.contentBlocks ?? []) {
        if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
          continue;
        }

        this.upsertBackgroundTaskLaunch({
          id: block.toolId,
          input: block.toolInput ?? {},
          result: block.toolResult,
        }, runtime.backgroundTaskLaunches);
      }
    }

    if (sawAllTasksComplete) {
      runtime.backgroundTaskStartedAt = null;
      runtime.backgroundTaskModeTag = null;
      runtime.backgroundTaskLaunches.clear();
      runtime.backgroundTaskCompletedTasks.clear();
      runtime.backgroundTaskIndicatorEl?.remove();
      runtime.backgroundTaskIndicatorEl = null;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    if (runtime.backgroundTaskLaunches.size === 0 && runtime.backgroundTaskModeTag !== 'search-mode') {
      runtime.backgroundTaskStartedAt = null;
      runtime.backgroundTaskModeTag = null;
      runtime.backgroundTaskIndicatorEl?.remove();
      runtime.backgroundTaskIndicatorEl = null;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    runtime.backgroundTaskWaitingForFollowUp = runtime.backgroundTaskLaunches.size > 0 && !runtime.isStreaming;
    this.syncTabStreamLikeState(tabId);
  }

  private getCompletedBackgroundTasks(tabId: TabId | null = this.getActiveTabId()): BackgroundTaskCompletionInfo[] {
    return Array.from(this.getTabRuntimeState(tabId)?.backgroundTaskCompletedTasks.values() ?? []);
  }

  private isLaunchMatchedByCompletion(
    launch: BackgroundTaskLaunchInfo,
    completion: BackgroundTaskCompletionInfo,
  ): boolean {
    if (launch.taskId && launch.taskId === completion.taskId) {
      return true;
    }

    return launch.description.trim().toLowerCase() === completion.description.trim().toLowerCase();
  }

  private getPendingBackgroundTaskLaunches(tabId: TabId | null = this.getActiveTabId()): BackgroundTaskLaunchInfo[] {
    const runtime = this.getTabRuntimeState(tabId);
    return this.filterPendingBackgroundTaskLaunches(
      Array.from(runtime?.backgroundTaskLaunches.values() ?? []),
      this.getCompletedBackgroundTasks(tabId),
    );
  }

  private filterPendingBackgroundTaskLaunches(
    launches: BackgroundTaskLaunchInfo[],
    completed: BackgroundTaskCompletionInfo[],
  ): BackgroundTaskLaunchInfo[] {
    return launches.filter((launch) =>
      !completed.some((completion) => this.isLaunchMatchedByCompletion(launch, completion)),
    );
  }

  private collectBackgroundTaskDiagnostics(messages: ChatMessage[]): {
    anchorKey: string;
    completed: BackgroundTaskCompletionInfo[];
    pending: BackgroundTaskLaunchInfo[];
    sawAllTasksComplete: boolean;
  } | null {
    if (messages.length === 0) {
      return null;
    }

    const anchorIndex = this.findBackgroundTaskAnchorIndex(messages);
    if (anchorIndex < 0) {
      return null;
    }

    const anchorMessage = messages[anchorIndex];
    const launches = new Map<string, BackgroundTaskLaunchInfo>();
    const completed = new Map<string, BackgroundTaskCompletionInfo>();
    let sawAllTasksComplete = false;

    for (const message of messages.slice(anchorIndex + 1)) {
      if (message.omo?.kind === 'system-reminder') {
        this.addCompletedBackgroundTasksFromMessage(message, completed);
        if (message.omo.reminderType === 'all-background-tasks-complete') {
          sawAllTasksComplete = true;
        }
      }

      for (const block of message.contentBlocks ?? []) {
        if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
          continue;
        }

        this.upsertBackgroundTaskLaunch({
          id: block.toolId,
          input: block.toolInput ?? {},
          result: block.toolResult,
        }, launches);
      }
    }

    const isSearchModeAnchor = anchorMessage.omo?.kind === 'user-injection' && anchorMessage.omo.modeTag === 'search-mode';
    if (!isSearchModeAnchor && launches.size === 0 && completed.size === 0 && !sawAllTasksComplete) {
      return null;
    }

    return {
      anchorKey: anchorMessage.sourceMessageId ?? anchorMessage.id,
      completed: Array.from(completed.values()),
      pending: this.filterPendingBackgroundTaskLaunches(Array.from(launches.values()), Array.from(completed.values())),
      sawAllTasksComplete,
    };
  }

  private logOmoBackgroundTaskDiagnostics(
    conversation: Conversation,
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): void {
    const diagnostics = this.collectBackgroundTaskDiagnostics(nextMessages);
    if (!diagnostics) {
      this.omoBackgroundTaskLogStates.delete(conversation.id);
      return;
    }

    const previousDiagnostics = this.collectBackgroundTaskDiagnostics(previousMessages);
    const previousHasSameAnchor = previousDiagnostics?.anchorKey === diagnostics.anchorKey;
    const previousPendingTaskIds = new Set(
      previousHasSameAnchor
        ? previousDiagnostics.pending
          .map((task) => task.taskId)
          .filter((taskId): taskId is string => Boolean(taskId))
        : [],
    );
    const previousCompletionLogged = previousHasSameAnchor && (
      previousDiagnostics.sawAllTasksComplete
      || (previousDiagnostics.pending.length === 0 && previousDiagnostics.completed.length > 0)
    );

    let state = this.omoBackgroundTaskLogStates.get(conversation.id);
    if (!state || state.anchorKey !== diagnostics.anchorKey) {
      state = {
        anchorKey: diagnostics.anchorKey,
        loggedPendingTaskIds: new Set(previousPendingTaskIds),
        completionLogged: previousCompletionLogged,
      };
    } else if (previousCompletionLogged) {
      state.completionLogged = true;
    }

    for (const task of diagnostics.pending) {
      if (!task.taskId || previousPendingTaskIds.has(task.taskId) || state.loggedPendingTaskIds.has(task.taskId)) {
        continue;
      }

      logger.debug(`OMO background task running: ${task.taskId} - ${this.getLogPreview(task.description, 140)}`);
      state.loggedPendingTaskIds.add(task.taskId);
    }

    if (!state.completionLogged && (diagnostics.sawAllTasksComplete || (diagnostics.pending.length === 0 && diagnostics.completed.length > 0))) {
      logger.debug(`OMO background tasks completed: ${this.stringifyLogPayload({
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        completedTasks: diagnostics.completed.map((task) => ({
          id: task.taskId,
          description: task.description,
        })),
      })}`);
      state.completionLogged = true;
    }

    this.omoBackgroundTaskLogStates.set(conversation.id, state);
  }

  private getBackgroundTaskLaunchDisplayId(launch: BackgroundTaskLaunchInfo): string {
    if (launch.taskId) {
      return launch.taskId;
    }

    return `launch_${launch.launchId.slice(-8)}`;
  }

  private buildBackgroundTaskIndicatorTasksMarkdown(tabId: TabId | null = this.getActiveTabId()): string | undefined {
    const lines: string[] = [];
    const completed = this.getCompletedBackgroundTasks(tabId);
    const pending = this.getPendingBackgroundTaskLaunches(tabId);

    if (completed.length === 0 && pending.length === 0) {
      return undefined;
    }

    lines.push(`**${t('chat.backgroundTask.taskListLabel')}**`);

    for (const task of completed) {
      lines.push(`- ${t('chat.backgroundTask.taskStatusCompleted')} · \`${task.taskId}\`: ${task.description}`);
    }

    for (const task of pending) {
      lines.push(`- ${t('chat.backgroundTask.taskStatusRunning')} · \`${this.getBackgroundTaskLaunchDisplayId(task)}\`: ${task.description}`);
    }

    return lines.join('\n');
  }

  private async handleStreamingToolCallStart(
    toolCall: ToolCallInfo,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (!this.isBackgroundTaskTool(toolCall.name)) {
      return;
    }

    if (!runtime.backgroundTaskStartedAt) {
      runtime.backgroundTaskStartedAt = Date.now();
    }
    this.upsertBackgroundTaskLaunch({
      id: toolCall.id,
      input: toolCall.input ?? {},
    }, runtime.backgroundTaskLaunches);
    runtime.backgroundTaskWaitingForFollowUp = false;
    await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
  }

  private async handleStreamingToolCallEnd(
    toolCall: ToolCallInfo,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (!this.isBackgroundTaskTool(toolCall.name)) {
      return;
    }

    this.upsertBackgroundTaskLaunch({
      id: toolCall.id,
      input: toolCall.input ?? {},
      result: toolCall.result,
    }, runtime.backgroundTaskLaunches);
    await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
  }

  private async finalizeBackgroundTaskIndicatorAfterPrimaryStream(
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !this.hasTabBackgroundTaskIndicator(tabId)) {
      return;
    }

    if (runtime.backgroundTaskLaunches.size === 0) {
      this.resetBackgroundTaskIndicator(tabId);
      return;
    }

    runtime.backgroundTaskWaitingForFollowUp = true;
    await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
  }

  private async renderBackgroundTaskIndicatorIfNeeded(
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (!this.hasTabBackgroundTaskIndicator(tabId)) {
      runtime.backgroundTaskIndicatorEl?.remove();
      runtime.backgroundTaskIndicatorEl = null;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    const parentEl = this.ensureTurnBody(tabId);
    if (!parentEl) {
      return;
    }

    let messageEl = runtime.backgroundTaskIndicatorEl;
    if (!messageEl || !messageEl.isConnected) {
      messageEl = parentEl.createDiv({
        cls: 'opencodian-message opencodian-message--assistant opencodian-message--notice opencodian-message--background-task',
      });
      messageEl.dataset.messageId = 'transient-background-task';
      runtime.backgroundTaskIndicatorEl = messageEl;
    }

    if (messageEl.parentElement !== parentEl || messageEl !== parentEl.lastElementChild) {
      parentEl.appendChild(messageEl);
    }

    let contentEl = messageEl.querySelector('.opencodian-message-content') as HTMLElement | null;
    if (!contentEl) {
      contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    }

    contentEl.empty();

    const cardEl = contentEl.createDiv({ cls: 'opencodian-chat-notice-card is-info is-background-task' });
    const iconEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-icon opencodian-chat-notice-icon--background-task' });
    setIcon(iconEl, 'loader');

    const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });
    const copy = this.getBackgroundTaskIndicatorCopy(tabId);
    bodyEl.createDiv({
      cls: 'opencodian-chat-notice-title',
      text: copy.title,
    });

    const textEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-text' });
    await this.renderMarkdownInto(textEl, copy.body);

    if (copy.detail) {
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-meta',
        text: copy.detail,
      });
    }

    if (copy.tasksMarkdown) {
      const tasksEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-task-list' });
      await this.renderMarkdownInto(tasksEl, copy.tasksMarkdown);
    }

    this.syncTabStreamLikeState(tabId);
  }

  private getBackgroundTaskIndicatorCopy(
    tabId: TabId | null = this.getActiveTabId(),
  ): { title: string; body: string; detail?: string; tasksMarkdown?: string } {
    const runtime = this.getTabRuntimeState(tabId);
    const launched = runtime?.backgroundTaskLaunches.size ?? 0;
    const completed = Math.min(launched, this.getCompletedBackgroundTasks(tabId).length);
    const tasksMarkdown = this.buildBackgroundTaskIndicatorTasksMarkdown(tabId);

    if (launched === 0) {
      return {
        title: t('chat.backgroundTask.preparingTitle'),
        body: t('chat.backgroundTask.preparingBody'),
        tasksMarkdown,
      };
    }

    if (runtime?.backgroundTaskWaitingForFollowUp) {
      return {
        title: t('chat.backgroundTask.waitingTitle'),
        body: t('chat.backgroundTask.waitingBody', {
          total: String(launched),
          completed: String(completed),
        }),
        detail: t('chat.backgroundTask.progressDetail', {
          total: String(launched),
          completed: String(completed),
        }),
        tasksMarkdown,
      };
    }

    return {
      title: t('chat.backgroundTask.runningTitle'),
      body: t('chat.backgroundTask.runningBody', {
        total: String(launched),
        completed: String(completed),
      }),
      detail: t('chat.backgroundTask.progressDetail', {
        total: String(launched),
        completed: String(completed),
      }),
      tasksMarkdown,
    };
  }

  /** Render a content block using the same renderers as streaming */
  private async renderContentBlock(container: HTMLElement, block: ContentBlock) {
    if (!this.markdownService) return;

    switch (block.type) {
      case 'thinking':
        if (block.thinking) {
          const thinkingRenderer = new ThinkingBlockRenderer(this.markdownService, {
            collapsedByDefault: true,
            showTimer: false,
          });
          thinkingRenderer.renderStored(container, block.thinking, block.durationSeconds);
        }
        break;

      case 'tool_use':
        if (block.toolName && block.toolId) {
          const toolRenderer = new ToolCallRenderer();
          const toolCall: ToolCallInfo = {
            id: block.toolId,
            name: block.toolName,
            input: block.toolInput || {},
            status: this.getStoredToolStatus(block),
            result: block.toolResult,
          };
          toolRenderer.render(container, toolCall);
        }
        break;

      case 'tool_result':
        // Tool results are rendered as part of tool_use or separately if needed
        // For now, skip as they're typically shown within the tool call UI
        break;

      case 'text':
      default:
        if (block.text) {
          const textEl = container.createDiv({ cls: 'opencodian-message-text' });
          await this.markdownService.render(textEl, block.text);
        }
        break;
    }
  }

  /** Resolve persisted tool status, with fallback for older stored messages */
  private getStoredToolStatus(block: ContentBlock): ToolCallInfo['status'] {
    return resolveToolExecutionStatus({
      toolName: block.toolName,
      storedStatus: block.toolStatus,
      result: block.toolResult,
    });
  }

  private hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean {
    return messages.some((message) =>
      message.role === 'assistant'
      && !message.sourceMessageId
      && message.displayStyle !== 'notice'
      && (
        (message.contentBlocks?.length ?? 0) > 0
        || Boolean(message.content)
      ),
    );
  }

  /** Create assistant message element for streaming */
  private createAssistantMessageElement(tabId: TabId | null = this.getActiveTabId()): { messageEl: HTMLElement; contentEl: HTMLElement } {
    const paneState = this.getTabPaneState(tabId);
    const messageEl = this.ensureTurnBody(tabId)?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant',
    });

    if (!messageEl) {
      const fallback = document.createElement('div');
      return { messageEl: fallback, contentEl: fallback };
    }

    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    this.ensureAssistantTimestampRow(messageEl, true);

    if (paneState) {
      paneState.runtime.streamingMessageEl = messageEl;
      paneState.runtime.streamingContentEl = contentEl;
    }

    return { messageEl, contentEl };
  }

  /** Update message content during streaming */
  private async updateMessageContent(contentEl: HTMLElement, content: string) {
    if (!this.markdownService) {
      contentEl.textContent = content;
      return;
    }

    // Use markdown rendering for streaming updates
    await this.markdownService.render(contentEl, content);
  }

  /** Render tool use */
  private renderToolUse(name: string, input: Record<string, unknown>) {
    const toolEl = this.messagesContainer?.createDiv({ cls: 'opencodian-tool-use' });
    if (!toolEl) return;

    const header = toolEl.createDiv({ cls: 'opencodian-tool-header' });
    setIcon(header.createDiv({ cls: 'opencodian-tool-icon' }), 'wrench');
    header.createEl('span', { text: name });

    const inputEl = toolEl.createEl('pre', { cls: 'opencodian-tool-input' });
    inputEl.textContent = JSON.stringify(input, null, 2);
  }

  private attachCopyButtonBehavior(copyBtn: HTMLElement, content: string): void {
    let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
    const labelId = copyBtn.getAttribute('aria-labelledby');
    const labelText = copyBtn.getAttribute('data-tooltip') ?? '';

    const setButtonContent = (text?: string): void => {
      copyBtn.empty();

      if (text) {
        copyBtn.setText(text);
      } else {
        copyBtn.innerHTML = COPY_ICON;
      }

      if (labelId && labelText) {
        const labelEl = copyBtn.createSpan({
          cls: 'opencodian-visually-hidden',
          text: labelText,
        });
        labelEl.id = labelId;
        copyBtn.setAttribute('aria-labelledby', labelId);
      }
    };

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(content);
      } catch {
        // Clipboard API may fail in non-secure contexts
        return;
      }

      // Clear any pending timeout from rapid clicks
      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }

      // Show "copied!" feedback
      setButtonContent('copied!');
      copyBtn.classList.add('copied');

      feedbackTimeout = setTimeout(() => {
        setButtonContent();
        copyBtn.classList.remove('copied');
        feedbackTimeout = null;
      }, 1500);
    });
  }

  private setTooltipLabel(buttonEl: HTMLElement, label: string, position?: 'bottom' | 'top' | 'right'): void {
    buttonEl.setAttribute('data-tooltip', label);
    if (position) {
      buttonEl.setAttribute('data-tooltip-position', position);
    }

    const existingLabelEl = buttonEl.querySelector('.opencodian-visually-hidden[data-tooltip-label="true"]');
    if (existingLabelEl instanceof HTMLElement) {
      existingLabelEl.textContent = label;
      return;
    }

    this.attachTooltipLabel(buttonEl, label);
  }

  private attachTooltipLabel(buttonEl: HTMLElement, label: string): void {
    const labelId = `opencodian-tooltip-label-${OpenCodianView.tooltipLabelId++}`;
    const labelEl = buttonEl.createSpan({
      cls: 'opencodian-visually-hidden',
      text: label,
    });
    labelEl.id = labelId;
    labelEl.setAttribute('data-tooltip-label', 'true');
    buttonEl.setAttribute('aria-labelledby', labelId);
  }

  /**
   * Adds timestamp with copy button for assistant messages.
   * Creates a row with timestamp and copy button side by side.
   * @param messageEl The message element container
   * @param timestamp The message timestamp
   * @param content The text content to copy
   */
  private addTimestampWithCopyButton(
    messageEl: HTMLElement,
    timestamp: number,
    content?: string,
    modelId?: string,
  ): void {
    const timeRow = this.ensureAssistantTimestampRow(messageEl);
    timeRow.empty();
    timeRow.classList.remove('is-pending');

    // Timestamp
    const timeStr = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    timeRow.createSpan({ cls: 'opencodian-message-time-text', text: timeStr });

    if (modelId) {
      timeRow.createSpan({ cls: 'opencodian-message-model-id', text: `· ${modelId}` });
    }

    if (!content) {
      return;
    }

    // Copy button
    const copyBtn = timeRow.createSpan({ cls: 'opencodian-copy-btn-inline' });
    copyBtn.innerHTML = COPY_ICON;
    this.attachCopyButtonBehavior(copyBtn, content);
  }

  private ensureAssistantTimestampRow(messageEl: HTMLElement, reserveSpace = false): HTMLElement {
    const existingRow = messageEl.querySelector('.opencodian-message-time-row');
    const timeRow = existingRow instanceof HTMLElement
      ? existingRow
      : messageEl.createDiv({ cls: 'opencodian-message-time-row' });

    timeRow.classList.toggle('is-pending', reserveSpace);
    return timeRow;
  }

  private mergeSyncedMessageModelIds(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
  ): ChatMessage[] {
    const modelIdBySourceMessageId = new Map<string, string>();
    const fallbackAssistantMessages = existingMessages.filter(
      (message) => message.role === 'assistant' && message.modelId && !message.sourceMessageId,
    );

    for (const message of existingMessages) {
      if (message.role !== 'assistant' || !message.modelId || !message.sourceMessageId) {
        continue;
      }

      modelIdBySourceMessageId.set(message.sourceMessageId, message.modelId);
    }

    const mergedMessages = syncedMessages.map((message) => {
      if (message.role !== 'assistant') {
        return message;
      }

      const persistedModelId = message.sourceMessageId
        ? modelIdBySourceMessageId.get(message.sourceMessageId)
        : undefined;

      return persistedModelId
        ? { ...message, modelId: persistedModelId }
        : message;
    });

    const unmatchedSyncedIndexes = mergedMessages.reduce<number[]>((indexes, message, index) => {
      if (message.role === 'assistant' && !message.modelId) {
        indexes.push(index);
      }

      return indexes;
    }, []);

    for (let fallbackIndex = fallbackAssistantMessages.length - 1; fallbackIndex >= 0; fallbackIndex--) {
      if (unmatchedSyncedIndexes.length === 0) {
        break;
      }

      const fallbackMessage = fallbackAssistantMessages[fallbackIndex];
      let preferredMatchPosition = -1;
      if (fallbackMessage.content) {
        for (let indexPosition = unmatchedSyncedIndexes.length - 1; indexPosition >= 0; indexPosition--) {
          const unmatchedIndex = unmatchedSyncedIndexes[indexPosition];
          if (mergedMessages[unmatchedIndex].content === fallbackMessage.content) {
            preferredMatchPosition = indexPosition;
            break;
          }
        }
      }
      const targetPosition = preferredMatchPosition >= 0
        ? preferredMatchPosition
        : unmatchedSyncedIndexes.length - 1;
      const targetIndex = unmatchedSyncedIndexes.splice(targetPosition, 1)[0];

      mergedMessages[targetIndex] = {
        ...mergedMessages[targetIndex],
        modelId: fallbackMessage.modelId,
      };
    }

    return mergedMessages;
  }

  private async syncLatestUserMessageFromServer(
    conversation: Conversation,
    optimisticMessageId: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const sessionId = conversation.openCodeSessionId;
    if (!sessionId) {
      return;
    }

    try {
      const serverMessages = await this.plugin.openCodeService.getSessionMessages(sessionId);
      const latestServerUser = [...serverMessages]
        .reverse()
        .find(({ info }) => info.role === 'user');
      if (!latestServerUser) {
        return;
      }

      const hydratedMessage = OpenCodeService.openCodeMessageToChatMessage(
        latestServerUser.info,
        latestServerUser.parts,
      );
      const rawServerUserText = latestServerUser.parts
        .filter((part) => typeof part.text === 'string')
        .map((part) => part.text as string)
        .join('');
      logger.debug(`Hydrated latest server user message: ${this.stringifyLogPayload({
        sessionId,
        optimisticMessageId,
        sourceMessageId: hydratedMessage.sourceMessageId ?? null,
        rawTextPreview: this.getLogPreview(rawServerUserText),
        visibleTextPreview: this.getLogPreview(this.getVisibleUserMessageText(hydratedMessage)),
        omoDetected: Boolean(hydratedMessage.omo),
        omoKind: hydratedMessage.omo?.kind ?? null,
        omoModeTag: hydratedMessage.omo?.kind === 'user-injection' ? hydratedMessage.omo.modeTag : null,
      })}`);
      const optimisticIndex = conversation.messages.findIndex(
        (message) => message.id === optimisticMessageId,
      );
      if (optimisticIndex < 0) {
        return;
      }

      const optimisticMessage = conversation.messages[optimisticIndex];
      const optimisticVisibleText = this.getVisibleUserMessageText(optimisticMessage).trim();
      const hydratedVisibleText = this.getVisibleUserMessageText(hydratedMessage).trim();
      if (
        optimisticVisibleText
        && hydratedVisibleText
        && optimisticVisibleText !== hydratedVisibleText
      ) {
        logger.debug(`Skipped optimistic user message hydration due to visible text mismatch: ${this.stringifyLogPayload({
          sessionId,
          optimisticMessageId,
          optimisticVisibleTextPreview: this.getLogPreview(optimisticVisibleText),
          hydratedVisibleTextPreview: this.getLogPreview(hydratedVisibleText),
          rawTextPreview: this.getLogPreview(rawServerUserText),
          omoDetected: Boolean(hydratedMessage.omo),
          omoKind: hydratedMessage.omo?.kind ?? null,
        })}`);
        return;
      }

      if (
        optimisticMessage.sourceMessageId === hydratedMessage.sourceMessageId
        && optimisticMessage.content === hydratedMessage.content
        && JSON.stringify(optimisticMessage.omo ?? null) === JSON.stringify(hydratedMessage.omo ?? null)
      ) {
        logger.debug(`Skipped optimistic user message hydration because nothing changed: ${this.stringifyLogPayload({
          sessionId,
          optimisticMessageId,
          sourceMessageId: hydratedMessage.sourceMessageId ?? null,
          omoDetected: Boolean(hydratedMessage.omo),
          omoKind: hydratedMessage.omo?.kind ?? null,
        })}`);
        return;
      }

      conversation.messages.splice(optimisticIndex, 1, hydratedMessage);
      this.armBackgroundTaskIndicatorForUserMessage(hydratedMessage, tabId);
      const runtime = this.getTabRuntimeState(tabId);
      if (runtime) {
        runtime.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(conversation.messages);
      }
      await this.plugin.saveConversation(conversation);
      if (this.currentConversation?.id === conversation.id && this.getActiveTabId() === tabId) {
        await this.rerenderSingleUserMessage(optimisticMessageId, hydratedMessage);
        await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
      }
      logger.debug(`Applied hydrated server user message to optimistic bubble: ${this.stringifyLogPayload({
        sessionId,
        optimisticMessageId,
        sourceMessageId: hydratedMessage.sourceMessageId ?? null,
        omoDetected: Boolean(hydratedMessage.omo),
        omoKind: hydratedMessage.omo?.kind ?? null,
      })}`);
    } catch (error) {
      logger.debug('Failed to hydrate optimistic user message from server', error);
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

  private async rerenderSingleUserMessage(
    previousMessageId: string,
    message: ChatMessage,
  ): Promise<void> {
    const messageEl = this.messagesContainer
      ?.querySelector<HTMLElement>(`.opencodian-message[data-message-id="${previousMessageId}"]`);
    if (!messageEl) {
      return;
    }

    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
    } else {
      delete messageEl.dataset.sourceMessageId;
    }

    messageEl.empty();
    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    const copyContent = await this.renderUserMessageContent(contentEl, message);
    this.addUserMessageFooter(messageEl, message, copyContent);
  }

  private addUserMessageFooter(messageEl: HTMLElement, message: ChatMessage, content?: string): void {
    const footerEl = messageEl.createDiv({ cls: 'opencodian-user-message-footer' });
    const hasActions = Boolean(content) || Boolean(message.sourceMessageId);

    if (hasActions) {
      const actionsEl = footerEl.createDiv({ cls: 'opencodian-user-message-actions' });

      if (content) {
        const copyLabel = t('chat.action.copy');
        const copyBtn = actionsEl.createEl('button', {
          cls: 'opencodian-copy-btn-inline opencodian-copy-btn-inline--user opencodian-tooltip-trigger',
          attr: {
            type: 'button',
            'data-tooltip': copyLabel,
          },
        });
        copyBtn.innerHTML = COPY_ICON;
        this.attachTooltipLabel(copyBtn, copyLabel);
        this.attachCopyButtonBehavior(copyBtn, content);
      }

      if (message.sourceMessageId) {
        const rewindLabel = t('chat.rewind.button');
        const rewindBtn = actionsEl.createEl('button', {
          cls: 'opencodian-user-action-btn opencodian-user-action-btn--icon opencodian-tooltip-trigger',
          attr: {
            type: 'button',
            'data-tooltip': rewindLabel,
          },
        });
        rewindBtn.innerHTML = REWIND_ICON;
        this.attachTooltipLabel(rewindBtn, rewindLabel);
        rewindBtn.disabled = this.isActiveTabStreaming();
        rewindBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          void this.handleRewindRequest(message);
        });

        const forkLabel = t('chat.fork.button');
        const forkBtn = actionsEl.createEl('button', {
          cls: 'opencodian-user-action-btn opencodian-user-action-btn--icon opencodian-tooltip-trigger',
          attr: {
            type: 'button',
            'data-tooltip': forkLabel,
          },
        });
        forkBtn.innerHTML = FORK_ICON;
        this.attachTooltipLabel(forkBtn, forkLabel);
        forkBtn.disabled = this.isActiveTabStreaming();
        forkBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          void this.handleForkRequest(message);
        });
      }
    }

    const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const timeEl = footerEl.createSpan({ cls: 'opencodian-message-time-text', text: timeStr });
    timeEl.addClass('opencodian-user-message-time');
  }

  private async handleRewindRequest(message: ChatMessage): Promise<void> {
    if (this.isActiveTabStreaming()) {
      new Notice(t('chat.rewind.streamingBlocked'));
      return;
    }

    if (!this.currentConversation?.openCodeSessionId || !message.sourceMessageId) {
      logger.debug('Rewind unavailable due to missing identifiers', {
        conversationId: this.currentConversation?.id ?? null,
        sessionId: this.currentConversation?.openCodeSessionId ?? null,
        messageId: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
      });
      new Notice(t('chat.rewind.unavailable'));
      return;
    }

    const confirmed = window.confirm(t('chat.rewind.confirm'));
    if (!confirmed) {
      return;
    }

    try {
      logger.debug('Attempting rewind', {
        conversationId: this.currentConversation.id,
        sessionId: this.currentConversation.openCodeSessionId,
        messageId: message.id,
        sourceMessageId: message.sourceMessageId,
        messagePreview: message.content.slice(0, 120),
      });

      const reverted = await this.plugin.openCodeService.revertSession(
        this.currentConversation.openCodeSessionId,
        message.sourceMessageId,
      );

      logger.debug('Rewind API result', {
        conversationId: this.currentConversation.id,
        sessionId: this.currentConversation.openCodeSessionId,
        sourceMessageId: message.sourceMessageId,
        reverted,
      });

      if (!reverted) {
        logger.warn('Rewind API returned false', {
          conversationId: this.currentConversation.id,
          sessionId: this.currentConversation.openCodeSessionId,
          sourceMessageId: message.sourceMessageId,
        });
        new Notice(t('chat.rewind.failed'));
        return;
      }

      await this.loadConversation(this.currentConversation.id, { forceServerSync: true });
      logger.debug('Rewind reload complete', {
        conversationId: this.currentConversation.id,
        sessionId: this.currentConversation.openCodeSessionId,
        messagesAfterReload: this.currentConversation.messages.length,
      });
      new Notice(t('chat.rewind.success'));
    } catch (error) {
      logger.error('Failed to rewind conversation:', error);
      new Notice(t('chat.rewind.failed'));
    }
  }

  private async handleForkRequest(message: ChatMessage): Promise<void> {
    if (this.isActiveTabStreaming()) {
      new Notice(t('chat.fork.streamingBlocked'));
      return;
    }

    if (!this.currentConversation?.openCodeSessionId || !message.sourceMessageId || !this.tabManager) {
      new Notice(t('chat.fork.unavailable'));
      return;
    }

    const target = await chooseForkTarget(this.app);
    if (!target) {
      return;
    }

    try {
      const activeModelOverride = this.tabManager.getActiveTabModelOverride();
      const forkedSession = await this.plugin.openCodeService.forkSession(
        this.currentConversation.openCodeSessionId,
        message.sourceMessageId,
      );

      const forkMessages = this.cloneMessagesUpTo(message.id);
      const title = this.buildForkTitle(this.currentConversation.title);
      const forkConversation = await this.plugin.createConversationFromSession(forkedSession.id, {
        title,
        messages: forkMessages,
        currentNote: this.currentConversation.currentNote,
        externalContextPaths: this.currentConversation.externalContextPaths,
      });

      if (target === 'new-tab') {
        if (!this.tabManager.canCreateTab()) {
          await this.plugin.deleteConversation(forkConversation.id);
          new Notice(t('chat.fork.maxTabsReached', { count: String(this.plugin.settings.maxTabs) }));
          return;
        }

        const tab = this.tabManager.createTab(forkConversation);
        if (tab) {
          await this.activateTab(tab.id);
          if (activeModelOverride) {
            this.tabManager.setActiveTabModelOverride(activeModelOverride);
            this.updateModelSelectorDisplay();
          }
        }
        new Notice(t('chat.fork.successNewTab'));
        return;
      }

      this.tabManager.setActiveTabConversation(forkConversation);
      await this.loadConversation(forkConversation.id, { forceServerSync: false });
      new Notice(t('chat.fork.successCurrentTab'));
    } catch (error) {
      logger.error('Failed to fork conversation:', error);
      new Notice(t('chat.fork.failed'));
    }
  }

  private async syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<{ messages: ChatMessage[]; changed: boolean; fingerprint: string }> {
    try {
      const serverMessages = await this.plugin.openCodeService.getSessionMessages(conversation.openCodeSessionId);
      const convertedServerMessages = serverMessages.map(({ info, parts }) =>
        OpenCodeService.openCodeMessageToChatMessage(info, parts),
      );
      this.logOmoBackgroundTaskDiagnostics(conversation, conversation.messages, convertedServerMessages);
      const converted = this.mergeSyncedMessageModelIds(
        conversation.messages,
        convertedServerMessages,
      );
      const noticeMessages = conversation.messages.filter(
        (message) => message.displayStyle === 'notice' && !message.sourceMessageId,
      );
      const merged = [...converted, ...noticeMessages].sort((left, right) => left.timestamp - right.timestamp);
      const fingerprint = this.getConversationSyncFingerprint(merged);
      const previousFingerprint = this.getTabRuntimeState(tabId)?.lastConversationSyncFingerprint
        ?? this.getConversationSyncFingerprint(conversation.messages);
      const changed = fingerprint !== previousFingerprint;

      if (changed) {
        conversation.messages = merged;
        conversation.updatedAt = Date.now();
        await this.plugin.saveConversation(conversation);
      } else {
        conversation.messages = merged;
      }

      if (this.currentConversation?.id === conversation.id && this.getActiveTabId() === tabId) {
        await this.refreshActiveTabContextUsageFromServer();
      }
      if (changed) {
        logger.debug('Conversation sync complete', {
          conversationId: conversation.id,
          sessionId: conversation.openCodeSessionId,
          serverMessageCount: serverMessages.length,
          mergedMessageCount: merged.length,
          changed,
        });
      }
      return { messages: merged, changed, fingerprint };
    } catch (error) {
      logger.error('Failed to sync conversation messages from server:', error);
      const fingerprint = this.getConversationSyncFingerprint(conversation.messages);
      return {
        messages: conversation.messages,
        changed: false,
        fingerprint,
      };
    }
  }

  private async rerenderConversationMessages(conversation: Conversation): Promise<void> {
    if (!this.currentConversation || this.currentConversation.id !== conversation.id || !this.messagesContainer) {
      return;
    }

    const shouldStickToBottom = this.isNearBottom();

    this.messagesContainer.empty();
    this.resetTurnState();

    await this.renderMessages(conversation.messages);
    await this.renderBackgroundTaskIndicatorIfNeeded();

    if (shouldStickToBottom) {
      this.scrollToBottom();
    }
  }

  private async applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void> {
    if (!this.currentConversation) {
      return;
    }

    const appendedMessages = this.getSimpleAppendedMessages(previousMessages, nextMessages);
    if (!appendedMessages) {
      await this.rerenderConversationMessages(this.currentConversation);
      return;
    }

    const shouldStickToBottom = this.isNearBottom();
    this.syncBackgroundTaskStateFromConversation(this.currentConversation);

    const groups = buildMessageRenderGroups(appendedMessages);
    for (const group of groups) {
      const messageToRender = group.mergedAssistant && group.messages.length > 1
        ? mergeAssistantMessagesForRender(group.messages)
        : group.messages[0];

      if (this.shouldPseudoStreamSyncedAssistantMessage(messageToRender)) {
        await this.renderSyncedAssistantMessageWithReveal(messageToRender);
      } else {
        await this.renderMessage(messageToRender);
      }
    }

    await this.renderBackgroundTaskIndicatorIfNeeded();

    if (shouldStickToBottom) {
      this.scrollToBottom();
    }
  }

  private getSimpleAppendedMessages(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): ChatMessage[] | null {
    if (nextMessages.length < previousMessages.length) {
      return null;
    }

    for (let index = 0; index < previousMessages.length; index += 1) {
      if (this.getMessageRenderSignature(previousMessages[index]) !== this.getMessageRenderSignature(nextMessages[index])) {
        return null;
      }
    }

    return nextMessages.slice(previousMessages.length);
  }

  private getMessageRenderSignature(message: ChatMessage): string {
    return JSON.stringify({
      id: message.id,
      role: message.role,
      sourceMessageId: message.sourceMessageId ?? null,
      displayStyle: message.displayStyle ?? null,
      content: message.content,
      timestamp: message.timestamp,
      omo: message.omo ? {
        kind: message.omo.kind,
        headline: message.omo.headline,
      } : null,
    });
  }

  private shouldPseudoStreamSyncedAssistantMessage(message: ChatMessage): boolean {
    if (message.role !== 'assistant' || message.displayStyle === 'notice') {
      return false;
    }

    if (!message.content?.trim()) {
      return false;
    }

    if (!message.contentBlocks || message.contentBlocks.length === 0) {
      return true;
    }

    return message.contentBlocks.every((block) => block.type === 'text' && Boolean(block.text));
  }

  private async renderSyncedAssistantMessageWithReveal(message: ChatMessage): Promise<void> {
    const { messageEl, contentEl } = this.createAssistantMessageElement();
    const textEl = contentEl.createDiv({ cls: 'streaming-text-block' });
    const chunks = this.splitPseudoStreamChunks(message.content);
    const delayMs = this.getPseudoStreamDelay(chunks.length);

    messageEl.style.visibility = 'hidden';

    let rendered = '';
    for (const chunk of chunks) {
      rendered += chunk;
      await this.renderMarkdownInto(textEl, rendered);
      if (messageEl.style.visibility === 'hidden') {
        messageEl.style.visibility = '';
      }
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
    }

    if (messageEl.style.visibility === 'hidden') {
      messageEl.style.visibility = '';
    }
    this.addTimestampWithCopyButton(messageEl, message.timestamp, message.content, message.modelId);
    this.streamingMessageEl = null;
    this.streamingContentEl = null;
  }

  private splitPseudoStreamChunks(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n');
    const chunks: string[] = [];
    let buffer = '';

    for (const char of normalized) {
      buffer += char;
      if (buffer.length >= 12 || /[\n，。！？；：,.!?;:]/u.test(char)) {
        chunks.push(buffer);
        buffer = '';
      }
    }

    if (buffer) {
      chunks.push(buffer);
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private getPseudoStreamDelay(chunkCount: number): number {
    if (chunkCount <= 1) {
      return 0;
    }

    const targetDurationMs = 900;
    return Math.max(12, Math.min(36, Math.round(targetDurationMs / chunkCount)));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  private isNearBottom(threshold = 48): boolean {
    if (!this.messagesContainer) {
      return true;
    }

    const { scrollTop, scrollHeight, clientHeight } = this.messagesContainer;
    return scrollHeight - (scrollTop + clientHeight) <= threshold;
  }

  private cloneMessagesUpTo(targetMessageId: string): ChatMessage[] {
    if (!this.currentConversation) {
      return [];
    }

    const index = this.currentConversation.messages.findIndex((message) => message.id === targetMessageId);
    const messages = index >= 0
      ? this.currentConversation.messages.slice(0, index + 1)
      : this.currentConversation.messages;

    return JSON.parse(JSON.stringify(messages)) as ChatMessage[];
  }

  private buildForkTitle(sourceTitle: string): string {
    const baseTitle = sourceTitle?.trim() || t('chat.tab.new');
    return `Fork: ${baseTitle}`;
  }

  private async applyFallbackConversationTitle(conversationId: string, firstMessage: string): Promise<void> {
    const fallbackTitle = this.plugin.generateDefaultTitle(firstMessage);
    await this.updateConversationTitleState(conversationId, {
      title: fallbackTitle,
      titleGenerationStatus: this.plugin.settings.titleMode === 'ai' ? 'pending' : undefined,
    });
  }

  private async startAiConversationTitleGeneration(
    conversationId: string,
    firstMessage: string,
    modelOptions: { provider?: string; model?: string },
  ): Promise<void> {
    const expectedFallbackTitle = this.plugin.generateDefaultTitle(firstMessage);
    await this.titleGenerationService.generateTitle(
      conversationId,
      firstMessage,
      {
        provider: modelOptions.provider ?? this.plugin.settings.defaultProvider,
        model: modelOptions.model ?? this.plugin.settings.defaultModel,
      },
      async (generatedConversationId, result) => {
        const conversation = await this.plugin.getConversationById(generatedConversationId);
        if (!conversation) {
          return;
        }

        if (conversation.title !== expectedFallbackTitle || conversation.titleGenerationStatus !== 'pending') {
          return;
        }

        if (result.success) {
          await this.updateConversationTitleState(generatedConversationId, {
            title: result.title,
            titleGenerationStatus: 'success',
          });
          return;
        }

        await this.updateConversationTitleState(generatedConversationId, {
          titleGenerationStatus: 'failed',
        });
      },
    );
  }

  private async updateConversationTitleState(
    conversationId: string,
    update: {
      title?: string;
      titleGenerationStatus?: 'pending' | 'success' | 'failed';
    },
  ): Promise<void> {
    const conversation = await this.plugin.getConversationById(conversationId);
    if (!conversation) {
      return;
    }

    if (typeof update.title === 'string') {
      conversation.title = update.title;
    }
    conversation.titleGenerationStatus = update.titleGenerationStatus;
    conversation.updatedAt = Date.now();
    await this.plugin.saveConversation(conversation);

    if (this.currentConversation?.id === conversationId) {
      this.currentConversation = conversation;
    }

    if (typeof update.title === 'string') {
      this.tabManager?.syncConversationTitle(conversationId, conversation.title);
      try {
        await this.plugin.openCodeService.updateSessionTitle(conversation.openCodeSessionId, conversation.title);
      } catch (error) {
        logger.warn('Failed to sync conversation title to server:', error);
      }
    }
  }

  private async renameConversation(conversationId: string): Promise<void> {
    const conversation = await this.plugin.getConversationById(conversationId);
    if (!conversation) {
      return;
    }

    this.titleGenerationService.cancelConversation(conversationId);
    const initialValue = conversation.title || t('chat.history.untitled');
    const nextTitle = await this.showRenameConversationDialog(initialValue);
    if (nextTitle === null) {
      return;
    }

    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      new Notice(t('chat.history.renameInvalid'));
      return;
    }

    try {
      await this.updateConversationTitleState(conversationId, {
        title: trimmedTitle,
        titleGenerationStatus: undefined,
      });
      new Notice(t('chat.history.renameSuccess'));
      this.closeHistoryDropdown();
    } catch (error) {
      logger.error('Failed to rename conversation:', error);
      new Notice(t('chat.history.renameFailed'));
    }
  }

  private async showRenameConversationDialog(initialValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.addClass('opencodian-rename-dialog-overlay');

      const dialog = document.createElement('div');
      dialog.addClass('opencodian-rename-dialog');

      const titleEl = dialog.createDiv({ cls: 'opencodian-rename-dialog-title' });
      titleEl.setText(t('chat.history.rename'));

      const descEl = dialog.createDiv({ cls: 'opencodian-rename-dialog-desc' });
      descEl.setText(t('chat.history.renamePrompt'));

      const inputEl = dialog.createEl('input', {
        cls: 'opencodian-rename-dialog-input',
        attr: {
          type: 'text',
          value: initialValue,
          maxlength: '120',
          placeholder: t('chat.history.untitled'),
        },
      });

      const buttonsEl = dialog.createDiv({ cls: 'opencodian-rename-dialog-buttons' });
      const cancelBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-rename-dialog-btn',
        text: t('chat.history.renameCancel'),
      });
      const saveBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-rename-dialog-btn mod-cta',
        text: t('chat.history.renameSave'),
      });

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      let settled = false;
      const cleanup = () => {
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
      };
      const finish = (value: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          finish(inputEl.value);
        }
      };

      document.addEventListener('keydown', handleKeydown);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          finish(null);
        }
      });
      cancelBtn.addEventListener('click', () => finish(null));
      saveBtn.addEventListener('click', () => finish(inputEl.value));

      window.setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 0);
    });
  }

  /** Scroll to bottom of messages */
  private scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    this.navigationSidebar?.updateVisibility();
  }

  private shouldAutoScroll(threshold = 48): boolean {
    return this.plugin.settings.enableAutoScroll && this.isNearBottom(threshold);
  }

  private scrollToBottomIfNeeded(shouldScroll = this.shouldAutoScroll()): void {
    if (!shouldScroll) {
      return;
    }

    this.scrollToBottom();
  }

  private scheduleSettledScrollToBottomIfNeeded(shouldScroll = this.shouldAutoScroll()): void {
    if (!shouldScroll) {
      return;
    }

    this.scheduleSettledScrollToBottom();
  }

  private scheduleSettledScrollToBottom(): void {
    this.clearScheduledScrollToBottom();
    this.scrollToBottomFrameId = window.requestAnimationFrame(() => {
      this.scrollToBottomFrameId = window.requestAnimationFrame(() => {
        this.scrollToBottomFrameId = null;
        this.scrollToBottom();
      });
    });
  }

  private clearScheduledScrollToBottom(): void {
    if (this.scrollToBottomFrameId !== null) {
      window.cancelAnimationFrame(this.scrollToBottomFrameId);
      this.scrollToBottomFrameId = null;
    }
  }

  /** Initialize model selector (opencode-style) */
  private initializeModelSelector(containerEl: HTMLElement): void {
    this.modelSelectorContainer = containerEl;
    
    // Create trigger button - ghost style, shows provider icon + model name + chevron
    this.modelSelectorTrigger = containerEl.createDiv({ cls: 'opencodian-model-trigger' });
    const triggerContent = this.modelSelectorTrigger.createDiv({ cls: 'opencodian-model-trigger-content' });
    
    // Provider icon
    const iconWrapper = triggerContent.createSpan({ cls: 'opencodian-model-trigger-icon' });
    setIcon(iconWrapper, 'bot'); // Default icon, will be updated
    
    // Model name
    triggerContent.createSpan({ cls: 'opencodian-model-trigger-text' });
    
    // Create dropdown (hidden by default)
    this.modelSelectorDropdown = containerEl.createDiv({ cls: 'opencodian-model-dropdown' });
    this.modelSelectorDropdown.style.display = 'none';
    
    // Build dropdown structure
    this.buildModelDropdown();
    
    // Load models
    void this.reloadModelCatalog();
    
    // Update display
    this.updateModelSelectorDisplay();
    
    // Handle trigger click
    this.modelSelectorTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleModelDropdown();
    });
    
    // Setup click outside handler
    this.modelDropdownClickOutsideHandler = (e: MouseEvent) => {
      if (!this.modelSelectorContainer?.contains(e.target as Node)) {
        this.closeModelDropdown();
      }
    };
  }
  
  /** Build model dropdown structure */
  private buildModelDropdown(): void {
    if (!this.modelSelectorDropdown) return;
    
    this.modelSelectorDropdown.empty();
    
    // Search section
    const searchWrapper = this.modelSelectorDropdown.createDiv({ cls: 'opencodian-model-dropdown-search' });
    const searchContainer = searchWrapper.createDiv({ cls: 'opencodian-model-dropdown-search-container' });
    const searchIcon = searchContainer.createSpan({ cls: 'opencodian-model-dropdown-search-icon' });
    setIcon(searchIcon, 'search');
    
    this.modelSelectorSearchInput = searchContainer.createEl('input', {
      cls: 'opencodian-model-dropdown-search-input',
      attr: { 
        type: 'text', 
        placeholder: 'Search models...'
      }
    });
    
    // Handle search input
    this.modelSelectorSearchInput.addEventListener('input', (e) => {
      this.modelFilterQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderModelList();
    });
    
    // Handle keyboard navigation in search
    this.modelSelectorSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModelDropdown();
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        this.navigateModelList(e.key === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        this.selectHighlightedModel();
        e.preventDefault();
      }
    });
    
    // Scrollable list container
    this.modelSelectorScrollContainer = this.modelSelectorDropdown.createDiv({ 
      cls: 'opencodian-model-dropdown-scroll' 
    });
    
    // Don't render list here - wait for models to load
    // Initial render will show loading state
    this.renderLoadingState();
  }
  
  /** Render loading state */
  private renderLoadingState(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    this.modelSelectorScrollContainer.empty();
    
    const loading = this.modelSelectorScrollContainer.createDiv({ 
      cls: 'opencodian-model-dropdown-loading' 
    });
    loading.setText('Loading models...');
  }
  
  /** Toggle dropdown visibility */
  private toggleModelDropdown(): void {
    if (this.isModelDropdownOpen) {
      this.closeModelDropdown();
    } else {
      this.openModelDropdown();
    }
  }
  
  /** Open dropdown */
  private openModelDropdown(): void {
    if (!this.modelSelectorDropdown || !this.modelSelectorTrigger) return;
    
    this.isModelDropdownOpen = true;
    this.modelSelectorDropdown.style.display = 'block';
    this.modelSelectorTrigger.addClass('is-open');
    
    // Reset filter
    this.modelFilterQuery = '';
    if (this.modelSelectorSearchInput) {
      this.modelSelectorSearchInput.value = '';
    }
    this.renderModelList();
    
    // Focus search input
    setTimeout(() => {
      this.modelSelectorSearchInput?.focus();
      this.scrollToCurrentModel();
    }, 0);
    
    // Add click outside listener
    document.addEventListener('click', this.modelDropdownClickOutsideHandler!);
    
    // Register escape key handler
    this.scope?.register([], 'Escape', () => {
      if (this.isModelDropdownOpen) {
        this.closeModelDropdown();
        return true;
      }
      return false;
    });
  }
  
  /** Close dropdown */
  private closeModelDropdown(): void {
    if (!this.modelSelectorDropdown || !this.modelSelectorTrigger) return;
    
    this.isModelDropdownOpen = false;
    this.modelSelectorDropdown.style.display = 'none';
    this.modelSelectorTrigger.removeClass('is-open');
    
    // Remove click outside listener
    if (this.modelDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.modelDropdownClickOutsideHandler);
    }
  }
  
  /** Render model list based on filter */
  private renderModelList(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    this.modelSelectorScrollContainer.empty();
    
    // Check if models are still loading
    if (this.availableProviders.length === 0) {
      if (!this.hasLoadedModelCatalog) {
        this.renderLoadingState();
      } else {
        const emptyState = this.modelSelectorScrollContainer.createDiv({
          cls: 'opencodian-model-dropdown-empty',
        });
        emptyState.setText(t('settings.model.noModels'));
      }
      return;
    }
    
    // Filter models
    const filteredProviders = this.availableProviders
      .map(provider => ({
        ...provider,
        models: provider.models.filter(model => 
          model.name.toLowerCase().includes(this.modelFilterQuery) ||
          provider.name.toLowerCase().includes(this.modelFilterQuery)
        )
      }))
      .filter(provider => provider.models.length > 0);
    
    if (filteredProviders.length === 0) {
      const emptyState = this.modelSelectorScrollContainer.createDiv({ 
        cls: 'opencodian-model-dropdown-empty' 
      });
      emptyState.setText(this.modelFilterQuery ? 'No models found' : 'No models available');
      return;
    }
    
    const current = this.getCurrentSessionModel();
    
    // Create all groups in a single container for proper scrolling
    const groupsContainer = this.modelSelectorScrollContainer.createDiv({
      cls: 'opencodian-model-groups'
    });
    
    // Track headers for stuck effect
    const headers: Array<{ el: HTMLElement; scrollHandler: () => void }> = [];
    
    // Create provider groups
    for (const provider of filteredProviders) {
      // Group container
      const groupEl = groupsContainer.createDiv({
        cls: 'opencodian-model-group'
      });
      
      // Provider header (sticky)
      const header = groupEl.createDiv({ 
        cls: 'opencodian-model-provider-header' 
      });
      header.setText(provider.name);
      
      // Setup stuck detection for this header
      const scrollHandler = () => {
        if (!this.modelSelectorScrollContainer || !header) return;
        const scrollRect = this.modelSelectorScrollContainer.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const isStuck = headerRect.top <= scrollRect.top + 1 && 
                        this.modelSelectorScrollContainer.scrollTop > 0;
        header.setAttribute('data-stuck', String(isStuck));
      };
      
      headers.push({ el: header, scrollHandler });
      
      // Models for this provider
      for (const model of provider.models) {
        const isSelected = current?.provider === provider.id && current?.model === model.id;
        const modelValue = `${provider.id}::${model.id}`;
        
        const modelOption = groupEl.createDiv({ 
          cls: 'opencodian-model-option',
          attr: { 'data-value': modelValue }
        });
        
        if (isSelected) {
          modelOption.addClass('is-selected');
        }
        
        // Model name
        const nameSpan = modelOption.createSpan({ cls: 'opencodian-model-option-name' });
        nameSpan.setText(model.name);
        
        // Checkmark for selected model
        const checkmark = modelOption.createSpan({ cls: 'opencodian-model-option-check' });
        setIcon(checkmark, 'check');
        
        // Click handler
        modelOption.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchModel(provider.id, model.id);
          this.closeModelDropdown();
        });
        
        // Hover handler for keyboard navigation
        modelOption.addEventListener('mouseenter', () => {
          this.highlightModelOption(modelValue);
        });
      }
    }
    
    // Add scroll listener to container
    if (this.modelSelectorScrollContainer) {
      // Remove old listener if exists
      if ((this.modelSelectorScrollContainer as any)._stuckHandler) {
        this.modelSelectorScrollContainer.removeEventListener(
          'scroll', 
          (this.modelSelectorScrollContainer as any)._stuckHandler
        );
      }
      
      const handler = () => {
        headers.forEach(h => h.scrollHandler());
      };
      
      (this.modelSelectorScrollContainer as any)._stuckHandler = handler;
      this.modelSelectorScrollContainer.addEventListener('scroll', handler, { passive: true });
      
      // Initial check
      handler();
    }
  }
  
  /** Navigate model list with keyboard */
  private navigateModelList(direction: 1 | -1): void {
    if (!this.modelSelectorScrollContainer) return;
    
    const options = Array.from(this.modelSelectorScrollContainer.querySelectorAll('.opencodian-model-option'));
    if (options.length === 0) return;
    
    const currentIndex = options.findIndex(opt => opt.hasClass('is-highlighted'));
    let nextIndex = currentIndex + direction;
    
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= options.length) nextIndex = options.length - 1;
    
    if (currentIndex >= 0) {
      options[currentIndex].removeClass('is-highlighted');
    }
    options[nextIndex].addClass('is-highlighted');
    
    // Scroll into view
    options[nextIndex].scrollIntoView({ block: 'nearest' });
  }
  
  /** Highlight a specific model option */
  private highlightModelOption(value: string): void {
    if (!this.modelSelectorScrollContainer) return;
    
    this.modelSelectorScrollContainer.querySelectorAll('.opencodian-model-option').forEach(opt => {
      opt.removeClass('is-highlighted');
    });
    
    const option = this.modelSelectorScrollContainer.querySelector(`[data-value="${value}"]`);
    if (option) {
      option.addClass('is-highlighted');
    }
  }
  
  /** Select currently highlighted model */
  private selectHighlightedModel(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    const highlighted = this.modelSelectorScrollContainer.querySelector('.opencodian-model-option.is-highlighted');
    if (highlighted) {
      const value = highlighted.getAttribute('data-value');
      if (value) {
        const [provider, model] = value.split('::');
        this.switchModel(provider, model);
        this.closeModelDropdown();
      }
    }
  }
  
  /** Scroll to current model in dropdown */
  private scrollToCurrentModel(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    const current = this.getCurrentSessionModel();
    if (!current) {
      return;
    }
    const currentValue = `${current.provider}::${current.model}`;
    
    const currentEl = this.modelSelectorScrollContainer.querySelector(`[data-value="${currentValue}"]`) as HTMLElement;
    if (currentEl) {
      currentEl.scrollIntoView({ block: 'center' });
    }
  }

  public async reloadModelCatalog(): Promise<void> {
    await this.loadAvailableModels();
  }

  /** Load available models from OpenCode service */
  private async loadAvailableModels(): Promise<void> {
    try {
      const providers = this.plugin.modelConfigService
        ? (await this.plugin.modelConfigService.getCatalogs(this.plugin.settings.modelSourceMode)).effective.providers
        : (await this.plugin.openCodeService.getAvailableModels()).providers;
      this.hasLoadedModelCatalog = true;
      this.availableModels = [];
      this.availableProviders = [];
      
      for (const provider of providers) {
        const providerModels = [];
        for (const model of provider.models) {
          this.availableModels.push({
            provider: provider.id,
            model: model.id,
            label: `${provider.name}/${model.name}`,
            providerName: provider.name,
            modelName: model.name,
            contextWindow: 'contextWindow' in model ? model.contextWindow : undefined,
          });
          providerModels.push({
            id: model.id,
            name: model.name,
            contextWindow: 'contextWindow' in model ? model.contextWindow : undefined,
          });
        }
        this.availableProviders.push({
          id: provider.id,
          name: provider.name,
          models: providerModels,
        });
      }
      
      // Re-render dropdown with new data
      this.renderModelList();
      this.updateModelSelectorDisplay();
      this.syncActiveTabContextUsageIdentity();
    } catch (error) {
      logger.error('Failed to load models:', error);
    }
  }

  /** Update model selector to show current model */
  private updateModelSelectorDisplay(): void {
    const current = this.getCurrentSessionModel();
    
    if (!this.modelSelectorTrigger) return;
    
    // Find model info from available models
    const modelInfo = current
      ? this.availableModels.find(
        m => m.provider === current.provider && m.model === current.model
      )
      : null;
    
    // Update text
    const textEl = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-text');
    if (textEl) {
      textEl.textContent = current
        ? (modelInfo?.modelName || current.model)
        : t('settings.model.unconfigured');
    }
    
    // Update provider icon using Lobehub icons
    const iconWrapper = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-icon');
    if (iconWrapper) {
      const iconUrl = current ? ProviderIconService.getIconUrl(current.provider) : null;
      const iconLabel = modelInfo?.providerName || current?.provider || 'model';

      if (iconUrl !== this.currentModelTriggerIconUrl) {
        iconWrapper.empty();

        if (iconUrl) {
          const img = document.createElement('img');
          img.src = iconUrl;
          img.alt = iconLabel;
          img.title = iconLabel;
          iconWrapper.appendChild(img);
        } else {
          // Fallback to Obsidian icon
          setIcon(iconWrapper as HTMLElement, 'bot');
        }

        this.currentModelTriggerIconUrl = iconUrl;
      } else if (iconUrl) {
        const existingImg = iconWrapper.querySelector('img');
        if (existingImg) {
          existingImg.alt = iconLabel;
          existingImg.title = iconLabel;
        }
      }
    }

    this.effortSelector?.updateDisplay();
  }

  /** Get current model for this session */
  private getCurrentSessionModel(): { provider: string; model: string } | null {
    if (!this.hasLoadedModelCatalog) {
      if (!this.plugin.settings.defaultProvider || !this.plugin.settings.defaultModel) {
        return null;
      }

      return {
        provider: this.plugin.settings.defaultProvider,
        model: this.plugin.settings.defaultModel,
      };
    }

    const override = this.tabManager?.getActiveTabModelOverride() ?? null;
    if (override) {
      if (this.isModelInAvailableProviders(override.provider, override.model)) {
        return override;
      }
    }

    if (this.isModelInAvailableProviders(
      this.plugin.settings.defaultProvider,
      this.plugin.settings.defaultModel,
    )) {
      return {
        provider: this.plugin.settings.defaultProvider,
        model: this.plugin.settings.defaultModel,
      };
    }

    if (!this.plugin.settings.defaultProvider || !this.plugin.settings.defaultModel) {
      return null;
    }

    return this.getFirstAvailableModel();
  }

  private formatModelId(
    model: { provider?: string; model?: string } | null | undefined,
  ): string | undefined {
    if (!model?.provider || !model.model) {
      return undefined;
    }

    return `${model.provider}/${model.model}`;
  }

  /** Switch model for current session */
  private switchModel(provider: string, model: string): void {
    if (!this.tabManager?.getActiveTab()) return;

    this.tabManager.setActiveTabModelOverride({ provider, model });
    
    // Update display
    this.updateModelSelectorDisplay();
    this.syncActiveTabContextUsageIdentity();
    
    // Show notification with model name only
    const modelInfo = this.availableModels.find(
      m => m.provider === provider && m.model === model
    );
    const modelName = modelInfo?.modelName || model;
    new Notice(`Model switched to: ${modelName}`);
  }

  /** Get model options for sendMessage */
  private getSendMessageOptions(): { provider?: string; model?: string } {
    const current = this.getCurrentSessionModel();
    if (!current) {
      return {};
    }

    const modelRef = `${current.provider}/${current.model}`;
    const reasoningOptions = this.getReasoningOptionsForModel(modelRef);

    return {
      provider: current.provider,
      model: current.model,
      ...reasoningOptions,
    };
  }

  private getReasoningOptionsForModel(
    modelRef: string,
  ): { reasoningEffort?: EffortLevel; thinkingBudget?: ThinkingBudget } {
    if (!modelRef) {
      return {};
    }

    if (this.effortSelector && this.effortSelector.isEffortModel(modelRef)) {
      return {
        reasoningEffort: this.currentEffortLevel,
      };
    }

    return {
      thinkingBudget: this.currentThinkingBudget,
    };
  }

  private async ensureSelectedModelAvailable(
    provider: string | undefined,
    model: string | undefined,
  ): Promise<boolean> {
    if (!provider || !model) {
      return false;
    }

    if (!this.isModelInAvailableProviders(provider, model)) {
      return false;
    }

    if (!this.plugin.modelConfigService) {
      return true;
    }

    try {
      const available = await this.plugin.modelConfigService.isModelAvailableOnServer(provider, model);
      if (available) {
        return true;
      }
    } catch (error) {
      logger.warn('Failed to verify model availability on server', error);
    }

    return false;
  }

  private async renderNoticeCard(container: HTMLElement, message: ChatMessage): Promise<void> {
    const tone = message.noticeTone ?? 'info';
    const cardEl = container.createDiv({ cls: `opencodian-chat-notice-card is-${tone}` });
    const iconEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-icon' });
    setIcon(
      iconEl,
      tone === 'error' ? 'x-circle' : tone === 'warning' ? 'alert-triangle' : 'info',
    );

    const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });
    const noticeTitle = message.noticeTitle ?? this.getOmoNoticeTitle(message);
    if (noticeTitle) {
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-title',
        text: noticeTitle,
      });
    }

    const textEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-text' });
    await this.renderMarkdownInto(textEl, this.getNoticeBodyText(message));

    if (message.omo?.kind === 'system-reminder') {
      const rawWrapperEl = bodyEl.createDiv({ cls: 'opencodian-omo-raw-block opencodian-omo-raw-block--notice' });
      rawWrapperEl.createDiv({
        cls: 'opencodian-omo-raw-label',
        text: t('chat.omo.system.rawLabel'),
      });
      const rawContentEl = rawWrapperEl.createEl('pre', {
        cls: 'opencodian-omo-raw-content',
        text: message.omo.rawText,
      });
      const rawToggleEl = rawWrapperEl.createEl('button');
      const rawState: CollapsibleState = {
        isExpanded: false,
        isCollapsible: false,
      };
      setupCollapsible(rawWrapperEl, rawToggleEl, rawContentEl, rawState, {
        collapsedHeight: 88,
        showMoreLabel: t('chat.omo.system.showRaw'),
        showLessLabel: t('chat.omo.system.hideRaw'),
      });
    }

    if (message.noticeActions && message.noticeActions.length > 0) {
      const actionsEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-actions' });
      for (const action of message.noticeActions) {
        const buttonEl = actionsEl.createEl('button', {
          cls: 'opencodian-chat-notice-action-btn',
          text: this.getNoticeActionLabel(action.type),
        });
        buttonEl.type = 'button';
        buttonEl.addEventListener('click', () => {
          void this.handleNoticeAction(action.type);
        });
      }
    }
  }

  private getOmoModeBadgeLabel(modeTag: string): string {
    switch (modeTag) {
      case 'search-mode':
        return t('chat.omo.mode.search');
      case 'analyze-mode':
        return t('chat.omo.mode.analyze');
      default:
        return t('chat.omo.mode.custom');
    }
  }

  private getOmoInjectionSummary(message: ChatMessage): string {
    if (message.omo?.kind !== 'user-injection') {
      return '';
    }

    const headline = message.omo.headline || t('chat.omo.injected.defaultHeadline');
    return t('chat.omo.injected.summary', { headline });
  }

  private getOmoNoticeTitle(message: ChatMessage): string | undefined {
    if (message.omo?.kind !== 'system-reminder') {
      return undefined;
    }

    switch (message.omo.reminderType) {
      case 'background-task-completed':
        return t('chat.omo.system.backgroundCompleted');
      case 'all-background-tasks-complete':
        return t('chat.omo.system.allCompleted');
      default:
        return t('chat.omo.system.generic');
    }
  }

  private getNoticeBodyText(message: ChatMessage): string {
    if (message.omo?.kind !== 'system-reminder') {
      return message.content;
    }

    const lines = message.omo.reminderText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const headline = message.omo.headline;
    const detailLines = lines.filter((line) => line !== headline);
    if (detailLines.length > 0) {
      return detailLines.join('\n\n');
    }

    switch (message.omo.reminderType) {
      case 'background-task-completed':
        return t('chat.omo.system.backgroundCompletedSummary');
      case 'all-background-tasks-complete':
        return t('chat.omo.system.allCompletedSummary');
      default:
        return message.content || headline;
    }
  }

  private async appendPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'] = 'warning',
    noticeActions?: ChatMessage['noticeActions'],
  ): Promise<void> {
    const noticeMessage: ChatMessage = {
      id: `assistant-notice-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      displayStyle: 'notice',
      noticeTitle: title,
      noticeTone: tone,
      noticeActions,
    };

    await this.renderMessage(noticeMessage);

    if (this.currentConversation) {
      this.currentConversation.messages.push(noticeMessage);
      this.currentConversation.updatedAt = Date.now();
      await this.plugin.storage.saveConversation(this.currentConversation);
      this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(this.currentConversation.messages);
    }

    this.scrollToBottom();
  }

  private async appendModelUnavailableNoticeMessage(): Promise<void> {
    const { title, message } = this.getModelUnavailableNoticeContent();
    await this.appendPersistentAssistantNoticeMessage(
      title,
      message,
      'warning',
      [{ type: 'open_model_settings' }],
    );
  }

  private getModelUnavailableNoticeContent(): { title: string; message: string } {
    if (!this.getCurrentSessionModel()) {
      return {
        title: t('chat.notice.modelUnavailable.unconfiguredTitle'),
        message: t('chat.notice.modelUnavailable.unconfiguredBody'),
      };
    }

    if (this.availableProviders.length === 0) {
      switch (this.plugin.settings.modelSourceMode) {
        case 'local':
          return {
            title: t('chat.notice.modelUnavailable.localTitle'),
            message: t('chat.notice.modelUnavailable.localBody'),
          };
        case 'server':
          return {
            title: t('chat.notice.modelUnavailable.serverTitle'),
            message: t('chat.notice.modelUnavailable.serverBody'),
          };
        default:
          return {
            title: t('chat.notice.modelUnavailable.mergeTitle'),
            message: t('chat.notice.modelUnavailable.mergeBody'),
          };
      }
    }

    return {
      title: t('chat.notice.modelUnavailable.selectedTitle'),
      message: t('chat.notice.modelUnavailable.selectedBody'),
    };
  }

  private getNoticeActionLabel(actionType: NonNullable<ChatMessage['noticeActions']>[number]['type']): string {
    switch (actionType) {
      case 'open_model_settings':
        return t('chat.notice.action.openModelSettings');
      default:
        return t('chat.notice.action.openModelSettings');
    }
  }

  private async handleNoticeAction(
    actionType: NonNullable<ChatMessage['noticeActions']>[number]['type'],
  ): Promise<void> {
    switch (actionType) {
      case 'open_model_settings': {
        this.openPluginSettingsPreservingScroll();
        window.setTimeout(() => {
          this.plugin.settingsTab?.scrollToModelSection();
        }, 50);
        return;
      }
      default:
        return;
    }
  }

  private isModelInAvailableProviders(provider: string, model: string): boolean {
    return this.availableProviders.some(
      (item) => item.id === provider && item.models.some((entry) => entry.id === model),
    );
  }

  private getFirstAvailableModel(): { provider: string; model: string } | null {
    for (const provider of this.availableProviders) {
      const firstModel = provider.models[0];
      if (firstModel) {
        return {
          provider: provider.id,
          model: firstModel.id,
        };
      }
    }

    return null;
  }

  /** Convert OpenCode stream chunk to streaming module format */
  private convertToStreamingChunk(
    chunk: import('../../core/types').StreamChunk
  ): import('../../utils/streaming').StreamChunk | null {

    
    switch (chunk.type) {
      case 'text':
        return { type: 'text', content: chunk.content };
      
      case 'thinking':

        return { type: 'thinking', content: chunk.content };
      
      case 'tool_use':

        return {
          type: 'tool_use',
          id: chunk.id,
          name: chunk.name,
          input: chunk.input,
        };
      
      case 'tool_result':

        return {
          type: 'tool_result',
          id: chunk.toolUseId,
          content: chunk.content,
          isError: chunk.isError,
        };
      
      case 'error':
        return { type: 'error', content: chunk.content };
      
      case 'message_start':
      case 'message_stop':
      case 'usage':
      case 'content_block_start':
      case 'content_block_stop':
        // These chunks don't need to be converted for rendering
        return null;
      
      default:
        return null;
    }
  }

  private openContextUsageDetails(): void {
    const contextState = this.tabManager?.getActiveTabContextUsage() ?? null;
    new ContextDetailModal(
      this.app,
      this.currentConversation,
      contextState,
      this.plugin.settings.systemPrompt,
    ).open();
  }

  private refreshContextUsageIndicator(): void {
    if (!this.contextRing) {
      return;
    }

    this.contextRing.update(this.tabManager?.getActiveTabContextUsage() ?? null);
  }

  private syncActiveTabContextUsageIdentity(): void {
    if (!this.tabManager?.getActiveTab()) {
      this.contextRing?.update(null);
      return;
    }

    const currentModel = this.getCurrentSessionModel();
    const modelInfo = currentModel
      ? this.availableModels.find(
        (item) => item.provider === currentModel.provider && item.model === currentModel.model,
      )
      : null;
    const currentState = this.tabManager.getActiveTabContextUsage() ?? createEmptyTabContextState();
    const nextState = ContextUsageService.syncStateIdentity(
      currentState,
      {
        provider: currentModel?.provider ?? null,
        providerName: modelInfo?.providerName ?? currentModel?.provider ?? null,
        model: currentModel?.model ?? null,
        modelName: modelInfo?.modelName ?? currentModel?.model ?? null,
        contextWindow: modelInfo?.contextWindow,
      },
      {
        sessionId: this.currentConversation?.openCodeSessionId ?? null,
        sessionTitle: this.currentConversation?.title ?? null,
        createdAt: this.currentConversation?.createdAt ?? null,
        updatedAt: this.currentConversation?.updatedAt ?? null,
      },
    );

    this.tabManager.setActiveTabContextUsage(nextState);
    this.refreshContextUsageIndicator();
  }

  private async refreshActiveTabContextUsageFromServer(): Promise<void> {
    if (!this.currentConversation?.openCodeSessionId || !this.tabManager?.getActiveTab()) {
      return;
    }

    const expectedConversationId = this.currentConversation.id;
    const expectedSessionId = this.currentConversation.openCodeSessionId;
    const snapshot = await this.plugin.openCodeService.getSessionContextUsageSnapshot(
      expectedSessionId,
    );
    if (
      !snapshot
      || this.currentConversation?.id !== expectedConversationId
      || this.currentConversation?.openCodeSessionId !== expectedSessionId
      || !this.tabManager?.getActiveTab()
    ) {
      return;
    }

    const currentState = this.tabManager.getActiveTabContextUsage() ?? createEmptyTabContextState();
    const nextState = ContextUsageService.syncStateIdentity(
      currentState,
      {
        provider: snapshot.providerId,
        providerName: snapshot.providerName,
        model: snapshot.modelId,
        modelName: snapshot.modelName,
        contextWindow: snapshot.contextWindow,
      },
      {
        sessionId: snapshot.sessionId,
        sessionTitle: snapshot.sessionTitle,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    );

    const calibratedState = ContextUsageService.applyPreciseUsage(nextState, {
      input: snapshot.inputTokens,
      output: snapshot.outputTokens,
      reasoning: snapshot.reasoningTokens,
      cacheRead: snapshot.cacheReadTokens,
      cacheWrite: snapshot.cacheWriteTokens,
      totalCost: snapshot.totalCost,
    });

    this.tabManager.setActiveTabContextUsage(calibratedState);
    this.refreshContextUsageIndicator();
  }

  private beginActiveTabContextUsageStream(): void {
    this.beginTabContextUsageStream(this.getActiveTabId());
  }

  private completeActiveTabContextUsageStream(): void {
    this.completeTabContextUsageStream(this.getActiveTabId());
  }

  private applyUsageChunkToActiveTab(
    chunk: Extract<import('../../core/types').StreamChunk, { type: 'usage' }>,
  ): void {
    this.applyUsageChunkToTab(this.getActiveTabId(), chunk);
  }

  private beginTabContextUsageStream(tabId: TabId | null): void {
    if (!this.tabManager?.getTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.beginStream(
      this.tabManager.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
    );
    this.tabManager.setTabContextUsage(tabId, nextState);
    if (tabId === this.getActiveTabId()) {
      this.refreshContextUsageIndicator();
    }
  }

  private completeTabContextUsageStream(tabId: TabId | null): void {
    if (!this.tabManager?.getTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.completeStream(
      this.tabManager.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
    );
    this.tabManager.setTabContextUsage(tabId, nextState);
    if (tabId === this.getActiveTabId()) {
      this.refreshContextUsageIndicator();
    }
  }

  private applyUsageChunkToTab(
    tabId: TabId | null,
    chunk: Extract<import('../../core/types').StreamChunk, { type: 'usage' }>,
  ): void {
    if (!this.tabManager?.getTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.applyUsageChunk(
      this.tabManager.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
      chunk,
    );
    this.tabManager.setTabContextUsage(tabId, nextState);
    if (tabId === this.getActiveTabId()) {
      this.refreshContextUsageIndicator();
    }
  }

  // Permission selector state
  private permissionSelectorContainer: HTMLElement | null = null;
  private permissionSelectorTrigger: HTMLElement | null = null;
  private permissionSelectorDropdown: HTMLElement | null = null;
  private isPermissionDropdownOpen = false;
  private permissionDropdownClickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  /** Initialize permission mode selector */
  private initializePermissionSelector(containerEl: HTMLElement): void {
    this.permissionSelectorContainer = containerEl;
    
    // Create trigger button
    this.permissionSelectorTrigger = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });
    
    const iconEl = this.permissionSelectorTrigger.createSpan({ cls: 'opencodian-permission-trigger-icon' });
    setIcon(iconEl, 'shield');
    
    const textEl = this.permissionSelectorTrigger.createSpan({ cls: 'opencodian-permission-trigger-text' });
    
    // Create dropdown (hidden by default)
    this.permissionSelectorDropdown = containerEl.createDiv({ cls: 'opencodian-permission-dropdown' });
    this.permissionSelectorDropdown.style.display = 'none';
    
    // Build dropdown content
    this.buildPermissionDropdown();
    
    // Update display based on current mode
    const updateDisplay = () => {
      const mode = this.plugin.settings.permissionMode;
      // Use uppercase mode names for consistency: YOLO / ASK / PLAN
      const modeText: Record<string, string> = {
        'yolo': 'YOLO',
        'normal': 'ASK',
        'plan': 'PLAN',
      };
      textEl.textContent = modeText[mode] || mode;
      
      // Update icon color based on mode
      this.permissionSelectorTrigger?.removeClass('mode-yolo', 'mode-normal', 'mode-plan');
      this.permissionSelectorTrigger?.addClass(`mode-${mode}`);
      
      // Update dropdown selection
      this.updatePermissionDropdownSelection();
    };
    
    updateDisplay();
    
    // Handle trigger click
    this.permissionSelectorTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePermissionDropdown();
    });
    
    // Setup click outside handler
    this.permissionDropdownClickOutsideHandler = (e: MouseEvent) => {
      if (!this.permissionSelectorContainer?.contains(e.target as Node)) {
        this.closePermissionDropdown();
      }
    };
  }
  
  /** Build permission dropdown content */
  private buildPermissionDropdown(): void {
    if (!this.permissionSelectorDropdown) return;
    
    this.permissionSelectorDropdown.empty();
    
    // Create option items
    const modes: Array<{ id: string; label: string; description: string }> = [
      { 
        id: 'yolo', 
        label: t('settings.security.permissionMode.yolo'),
        description: t('settings.security.permissionMode.yoloDescription') || 'Allow all tools without asking'
      },
      { 
        id: 'normal', 
        label: t('settings.security.permissionMode.normal'),
        description: t('settings.security.permissionMode.normalDescription') || 'Ask before executing tools'
      },
      { 
        id: 'plan', 
        label: t('settings.security.permissionMode.plan'),
        description: t('settings.security.permissionMode.planDescription') || 'Review and approve all actions'
      },
    ];
    
    for (const mode of modes) {
      const optionEl = this.permissionSelectorDropdown.createDiv({ 
        cls: 'opencodian-permission-option',
        attr: { 'data-mode': mode.id }
      });
      
      // Icon - use consistent shield icon like the trigger
      const iconWrapper = optionEl.createSpan({ cls: 'opencodian-permission-option-icon' });
      setIcon(iconWrapper, 'shield');
      
      // Content container for label and description
      const contentEl = optionEl.createDiv({ cls: 'opencodian-permission-option-content' });
      contentEl.createDiv({ cls: 'opencodian-permission-option-label', text: mode.label });
      contentEl.createDiv({ cls: 'opencodian-permission-option-desc', text: mode.description });
      
      // Checkmark for selected state
      const checkmark = optionEl.createSpan({ cls: 'opencodian-permission-option-check' });
      setIcon(checkmark, 'check');
      
      // Click handler
      optionEl.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.switchPermissionMode(mode.id as 'yolo' | 'normal' | 'plan').then(() => {
          this.updatePermissionTriggerDisplay();
          this.closePermissionDropdown();
        });
      });
    }
    
    // Update selection state
    this.updatePermissionDropdownSelection();
  }
  
  /** Update permission dropdown selection state */
  private updatePermissionDropdownSelection(): void {
    if (!this.permissionSelectorDropdown) return;
    
    const currentMode = this.plugin.settings.permissionMode;
    
    this.permissionSelectorDropdown.querySelectorAll('.opencodian-permission-option').forEach(opt => {
      const mode = opt.getAttribute('data-mode');
      if (mode === currentMode) {
        opt.addClass('is-selected');
      } else {
        opt.removeClass('is-selected');
      }
    });
  }
  
  /** Update permission trigger display */
  private updatePermissionTriggerDisplay(): void {
    if (!this.permissionSelectorTrigger) return;
    
    const mode = this.plugin.settings.permissionMode;
    const modeText: Record<string, string> = {
      'yolo': 'YOLO',
      'normal': 'ASK',
      'plan': 'PLAN',
    };
    
    const textEl = this.permissionSelectorTrigger.querySelector('.opencodian-permission-trigger-text');
    if (textEl) {
      textEl.textContent = modeText[mode] || mode;
    }
    
    // Update icon color based on mode
    this.permissionSelectorTrigger.removeClass('mode-yolo', 'mode-normal', 'mode-plan');
    this.permissionSelectorTrigger.addClass(`mode-${mode}`);
  }
  
  /** Toggle permission dropdown visibility */
  private togglePermissionDropdown(): void {
    if (this.isPermissionDropdownOpen) {
      this.closePermissionDropdown();
    } else {
      this.openPermissionDropdown();
    }
  }
  
  /** Open permission dropdown */
  private openPermissionDropdown(): void {
    if (!this.permissionSelectorDropdown || !this.permissionSelectorTrigger) return;
    
    this.isPermissionDropdownOpen = true;
    this.permissionSelectorDropdown.style.display = 'block';
    this.permissionSelectorTrigger.addClass('is-open');
    
    // Update selection
    this.updatePermissionDropdownSelection();
    
    // Add click outside listener
    document.addEventListener('click', this.permissionDropdownClickOutsideHandler!);
    
    // Register escape key handler
    this.scope?.register([], 'Escape', () => {
      if (this.isPermissionDropdownOpen) {
        this.closePermissionDropdown();
        return true;
      }
      return false;
    });
  }
  
  /** Close permission dropdown */
  private closePermissionDropdown(): void {
    if (!this.permissionSelectorDropdown || !this.permissionSelectorTrigger) return;
    
    this.isPermissionDropdownOpen = false;
    this.permissionSelectorDropdown.style.display = 'none';
    this.permissionSelectorTrigger.removeClass('is-open');
    
    // Remove click outside listener
    if (this.permissionDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.permissionDropdownClickOutsideHandler);
    }
  }

  /** Switch permission mode and restart OpenCode service */
  private async switchPermissionMode(mode: 'yolo' | 'normal' | 'plan'): Promise<void> {
    try {
      // Update setting
      this.plugin.settings.permissionMode = mode;
      await this.plugin.saveSettings();
      
      // Show restarting notice
      const notice = new Notice(t('settings.security.autoRestart.manual'), 0);
      
      // Restart OpenCode service
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (isRunning) {
        await this.plugin.openCodeService.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await this.plugin.openCodeService.start();
      
      notice.hide();
      new Notice(t('settings.security.autoRestart.success'));
    } catch (error) {
      logger.error('Failed to switch permission mode:', error);
      new Notice(t('settings.security.autoRestart.failed'));
    }
  }

  /** Show inline permission request card in the chat stream */
  private async showPermissionDialog(
    request: Extract<import('../../core/types').StreamChunk, { type: 'permission_request' }>,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const { t } = await import('../../i18n');
    const { id, permission, patterns, metadata } = request;
    
    // Get tool description based on permission type
    const getToolDescription = (perm: string): string => {
      // Extract base tool name (e.g., 'websearch_web_search' -> 'websearch')
      const baseTool = perm.split('_')[0].toLowerCase();
      const toolKey = `permissionDialog.tools.${baseTool}`;
      const description = t(toolKey as any);
      // If translation not found, return default
      return description === toolKey ? t('permissionDialog.tools.default') : description;
    };

    // Find the message element to insert the permission card
    // Note: Tool calls are rendered directly on messageEl, not in contentEl
    const messageEl = this.getTabRuntimeState(tabId)?.streamingMessageEl ?? null;
    if (!messageEl) {
      logger.error('No streaming message element found for permission card');
      return;
    }

    // Find the last tool call card to insert permission card after it
    const lastToolCall = messageEl.querySelector('.streaming-tool-call:last-of-type');
    
    // Create inline permission card
    const permissionCard = document.createElement('div');
    permissionCard.className = 'opencodian-permission-inline';
    
    if (lastToolCall && lastToolCall.parentNode) {
      // Insert after the last tool call (so it appears right after the tool)
      lastToolCall.parentNode.insertBefore(permissionCard, lastToolCall.nextSibling);
    } else {
      // Fallback: append to message content area if no tool call found
      const contentEl = messageEl.querySelector('.opencodian-message-content');
      if (contentEl) {
        contentEl.appendChild(permissionCard);
      } else {
        messageEl.appendChild(permissionCard);
      }
    }
    
    // Header with tool name
    const headerEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-header' });
    headerEl.createSpan({ cls: 'opencodian-permission-inline-icon', text: '🔐' });
    headerEl.createSpan({ 
      cls: 'opencodian-permission-inline-title', 
      text: t('permissionDialog.title') 
    });
    
    // Tool info section
    const infoEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-info' });
    infoEl.createDiv({ 
      cls: 'opencodian-permission-inline-tool',
      text: `${t('permissionDialog.description')} ${permission}`
    });
    infoEl.createDiv({ 
      cls: 'opencodian-permission-inline-desc',
      text: `${getToolDescription(permission)}`
    });

    // Show patterns (only if meaningful)
    if (patterns.length > 0 && !(patterns.length === 1 && patterns[0] === '*')) {
      const patternsEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-patterns' });
      patternsEl.createDiv({ 
        cls: 'opencodian-permission-inline-label', 
        text: t('permissionDialog.patterns') 
      });
      patterns.forEach(pattern => {
        patternsEl.createDiv({ cls: 'opencodian-permission-inline-pattern-item', text: pattern });
      });
    }

    // Show command if present
    if (metadata.command) {
      const commandEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-command' });
      commandEl.createSpan({ 
        cls: 'opencodian-permission-inline-label', 
        text: `${t('permissionDialog.command')}: ` 
      });
      commandEl.createEl('code', { text: String(metadata.command) });
    }

    // Action buttons
    const buttonsEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-buttons' });
    
    const onceBtn = buttonsEl.createEl('button', { 
      cls: 'opencodian-permission-inline-btn opencodian-permission-inline-once',
      text: t('permissionDialog.allowOnce')
    });
    
    const alwaysBtn = buttonsEl.createEl('button', { 
      cls: 'opencodian-permission-inline-btn opencodian-permission-inline-always',
      text: t('permissionDialog.allowAlways')
    });
    
    const rejectBtn = buttonsEl.createEl('button', { 
      cls: 'opencodian-permission-inline-btn opencodian-permission-inline-reject',
      text: t('permissionDialog.reject')
    });

    // Wait for user choice
    const result = await new Promise<'once' | 'always' | 'reject'>((resolve) => {
      onceBtn.addEventListener('click', () => resolve('once'));
      alwaysBtn.addEventListener('click', () => resolve('always'));
      rejectBtn.addEventListener('click', () => resolve('reject'));
    });

    // Remove the permission card entirely after selection
    // The tool execution status will be shown by the tool call renderer
    permissionCard.remove();

    // Send response to server
    try {
      await this.plugin.openCodeService.respondToPermission(id, result);
    } catch (error) {
      logger.error('Failed to respond to permission:', error);
      new Notice(t('permissionDialog.notice.error'));
    }
  }
}
