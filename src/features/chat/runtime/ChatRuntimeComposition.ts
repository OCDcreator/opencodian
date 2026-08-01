/**
 * ChatRuntimeComposition — owns chat runtime coordinator construction.
 *
 * Plan: docs/superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md § Task 15
 * Inventory (APPROVED, 4 review rounds): docs/superpowers/plans/task15-chat-runtime-composition-inventory.md
 *
 * Relocated the four `create*RuntimeWiring()` orchestration methods plus the constructor's
 * inline runtime assembly out of `OpenCodianView`. It receives the view's forwarding closures
 * and value getters via {@link ChatRuntimeCompositionHost} (structural port — the view satisfies
 * it by shape) and returns ONE assembled {@link ChatRuntime} struct the view destructures into
 * its existing private fields.
 *
 * Invariants (pinned by characterization + codex review):
 *  - NEVER references the `OpenCodianView` class. The view is passed only as the typed host.
 *  - For `assembleConversationTabRuntime`, the narrow `TabRuntimeViewSource` is used — never the
 *    full view (no god-object leak). See inventory §2.2c.
 *  - Returns a struct; the view does not retrieve services by key/type (no service locator).
 *  - Owns NO disposal. `OpenCodianView.onClose` tears down the destructured fields in the
 *    documented 26-step order (inventory §4); this owner constructs only.
 *
 * Cross-phase value flow: coordinators built in an earlier phase and consumed in a later one
 * are threaded as locals through compose(). Lazily-read view state (coordinators whose closures
 * fire only after the view has destructured the result) is read via host.X so it resolves live.
 */

import { Notice } from 'obsidian';

import { AgentCapability, hasCapability } from '../../../core/agents';
import { getConversationChatBackendService } from '../../../core/agents/backend/AgentBackendRouting';
import { OpenCodeService } from '../../../core/opencode';
import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { getVaultBasePath } from '../../../shared';
import { AssistantNoticeCardRenderer } from '../runtime/AssistantNoticeCardRenderer';
import { AssistantShellViewHostAdapter } from '../runtime/AssistantShellViewHostAdapter';
import { BackgroundTaskIndicatorCoordinator } from '../runtime/BackgroundTaskIndicatorCoordinator';
import { BackgroundTaskInlinePanelRenderer } from '../runtime/BackgroundTaskInlinePanelRenderer';
import { BackgroundTaskStreamTriggerCoordinator } from '../runtime/BackgroundTaskStreamTriggerCoordinator';
import { ConversationLoadRuntimeBridge } from '../runtime/ConversationLoadRuntimeBridge';
import { PermissionInlineCardRenderer } from '../runtime/PermissionInlineCardRenderer';
import {
  summarizeChatMessageForDebug,
  summarizeContentBlocksForDebug,
  summarizeCoreStreamChunkForDebug,
} from '../runtime/SendPipelineDebugSummaries';
import type { SendPipelineDebugContentBlock,SendPipelineHostDependencies } from '../runtime/SendPipelineRuntime';
import { createSendPipelineRuntimeHost,SendPipelineRuntime } from '../runtime/SendPipelineRuntime';
import { shouldRefreshOpenCodeDiagnosticsHeader } from '../runtime/SendPipelineRuntime';
import { StreamingInlineCardRenderer } from '../runtime/StreamingInlineCardRenderer';
import { TabConversationActivationBridge } from '../runtime/TabConversationActivationBridge';
import { TabConversationStateBridge } from '../runtime/TabConversationStateBridge';
import { TabRuntimeStateBridge } from '../runtime/TabRuntimeStateBridge';
import { TabViewActivationBridge } from '../runtime/TabViewActivationBridge';
import { UserMessageContentRenderer } from '../runtime/UserMessageContentRenderer';
import { UserMessageFooterRenderer } from '../runtime/UserMessageFooterRenderer';
import { ActiveTabContextUsageCoordinator } from '../services/ActiveTabContextUsageCoordinator';
import { BackgroundTaskCompletionNoticeService } from '../services/BackgroundTaskCompletionNoticeService';
import { BackgroundTaskLiveSignalCoordinator } from '../services/BackgroundTaskLiveSignalCoordinator';
import { BackgroundTaskNoticeStateService } from '../services/BackgroundTaskNoticeStateService';
import type { BackgroundTaskViewHost } from '../services/BackgroundTaskTimelineService';
import { BackgroundTaskTimelineService, createBackgroundTaskViewHost } from '../services/BackgroundTaskTimelineService';
import { ChatHeaderPresenter } from '../services/ChatHeaderPresenter';
import { ChatSelectionControlsCoordinator } from '../services/ChatSelectionControlsCoordinator';
import { ChatSurfaceAppearanceCoordinator } from '../services/ChatSurfaceAppearanceCoordinator';
import { ChildSessionGraphCoordinator } from '../services/ChildSessionGraphCoordinator';
import { ComposerContextViewFacade } from '../services/ComposerContextViewFacade';
import { ComposerInputShellCoordinator } from '../services/ComposerInputShellCoordinator';
import { ConversationAuthoritativeSyncCoordinator } from '../services/ConversationAuthoritativeSyncCoordinator';
import { ConversationHistoryActionsCoordinator } from '../services/ConversationHistoryActionsCoordinator';
import type { ConversationHydrationRuntimeBridges, ConversationHydrationRuntimeViewHost } from '../services/ConversationHydrationRuntimeViewHostFactory';
import {
  assembleConversationHydrationRuntime,
} from '../services/ConversationHydrationRuntimeViewHostFactory';
import { ConversationIdentityRuntime } from '../services/ConversationIdentityRuntime';
import {
  assembleConversationLoadRecovery,
  ConversationLoadRecoveryCoordinator,
} from '../services/ConversationLoadRecoveryCoordinator';
import { ConversationNoticeCoordinator } from '../services/ConversationNoticeCoordinator';
import { ConversationRenderService, createConversationRenderHost } from '../services/ConversationRenderService';
import { ConversationSessionSettingsCoordinator } from '../services/ConversationSessionSettingsCoordinator';
import { ConversationSessionSignalRuntime } from '../services/ConversationSessionSignalRuntime';
import type { ConversationSyncBridgePorts } from '../services/ConversationSyncBridge';
import { ConversationSyncBridge } from '../services/ConversationSyncBridge';
import type { ConversationSyncRuntimeAssemblyViewHost } from '../services/ConversationSyncHostAdapter';
import { assembleConversationSyncRuntime } from '../services/ConversationSyncHostAdapter';
import { ConversationSyncOrchestrationService } from '../services/ConversationSyncOrchestrationService';
import { ConversationSyncRuntimeCoordinator } from '../services/ConversationSyncRuntimeCoordinator';
import { ConversationTabOpenCoordinator } from '../services/ConversationTabOpenCoordinator';
import type { TabRuntimeViewSource } from '../services/ConversationTabRuntimeCoordinator';
import {
  assembleConversationTabRuntime,
  ConversationTabRuntimeCoordinator,
} from '../services/ConversationTabRuntimeCoordinator';
import { InputPanelAppearanceCoordinator } from '../services/InputPanelAppearanceCoordinator';
import { createMessageFinalizationHost,MessageFinalizationService } from '../services/MessageFinalizationService';
import { createMessageSendPreparationHost,MessageSendPreparationService } from '../services/MessageSendPreparationService';
import { PersistentAssistantNoticeService } from '../services/PersistentAssistantNoticeService';
import { QuestionDockSlotCoordinator } from '../services/QuestionDockSlotCoordinator';
import type { QuestionRuntimeServices } from '../services/QuestionRuntimeHostAdapter';
import { createQuestionRuntimeBundle } from '../services/QuestionRuntimeViewHostFactory';
import type { TabConversationSyncFingerprintRuntimePort } from '../services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam,
} from '../services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import type { SettledScrollScheduler } from '../services/ScrollManager';
import { ServerReferenceContextService } from '../services/ServerReferenceContextService';
import type { SessionTodoCoordinator } from '../services/SessionTodoHostAdapter';
import { createSessionTodoCoordinator } from '../services/SessionTodoHostAdapter';
import { createSlashCommandExecutionHost, executeCompactSession } from '../services/SlashCommandExecutionHostFactory';
import { SlashCommandExecutionService } from '../services/SlashCommandExecutionService';
import type { TabActivationConversationSyncRuntimePort } from '../services/TabActivationRuntimeViewHostFactory';
import {
  assembleTabActivationConversationSyncRuntimePort,
  createTabActivationRuntimeAssembly,
} from '../services/TabActivationRuntimeViewHostFactory';
import { TabMessagesPaneCoordinator } from '../services/TabMessagesPaneCoordinator';
import { TitleGenerationService } from '../services/TitleGenerationService';
import { createDebugLogCallbacks } from '../services/trailingAssistantPatchDebug';
import type { TabId } from '../tabs/types';

/** Local alias relocated from OpenCodianView (pre-Task-15 line 389). */
type QuestionTodoBackgroundTaskRuntimeCoordinators = ReturnType<
  typeof createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam
>;

/** Inputs threaded from compose() into the conversation/interaction phase methods (≤4 params). */
interface ConversationWiringInputs {
  conversationRenderService: ConversationRenderService;
  conversationIdentityRuntime: ConversationIdentityRuntime;
  composerContextViewFacade: ComposerContextViewFacade;
  tabMessagesPaneCoordinator: TabMessagesPaneCoordinator;
}

interface ConversationRuntimeResult extends ConversationRuntimeWiring {
  backgroundTaskHost: BackgroundTaskViewHost;
  conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
}

interface InteractionWiringInputs {
  conversation: ConversationRuntimeResult;
  surface: SurfaceRuntimeWiring;
  userMessageContentRenderer: UserMessageContentRenderer;
}

interface SurfaceRuntimeWiring {
  titleGenerationService: TitleGenerationService;
  tabMessagesPaneCoordinator: TabMessagesPaneCoordinator;
  chatHeaderPresenter: ChatHeaderPresenter;
  conversationHistoryActionsCoordinator: ConversationHistoryActionsCoordinator;
  chatSelectionControlsCoordinator: ChatSelectionControlsCoordinator;
  composerInputShellCoordinator: ComposerInputShellCoordinator;
  inputPanelAppearanceCoordinator: InputPanelAppearanceCoordinator;
  chatSurfaceAppearanceCoordinator: ChatSurfaceAppearanceCoordinator;
  conversationSessionSettingsCoordinator: ConversationSessionSettingsCoordinator;
  composerContextViewFacade: ComposerContextViewFacade;
  tabConversationSyncFingerprintRuntimePort: TabConversationSyncFingerprintRuntimePort;
  persistentAssistantNoticeService: PersistentAssistantNoticeService;
  conversationNoticeCoordinator: ConversationNoticeCoordinator;
  sessionTodoCoordinator: SessionTodoCoordinator;
  childSessionGraphCoordinator: ChildSessionGraphCoordinator;
  questionDockSlotCoordinator: QuestionDockSlotCoordinator;
  assistantShellViewHostAdapter: AssistantShellViewHostAdapter;
}

interface BackgroundTaskRuntimeWiring {
  visibleConversationPostSyncCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['visibleConversationPostSyncCoordinator'];
  backgroundConversationPostSyncHandoffCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['backgroundConversationPostSyncHandoffCoordinator'];
  questionTodoActivationRefreshCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['questionTodoActivationRefreshCoordinator'];
  backgroundTaskActivationIndicatorCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['backgroundTaskActivationIndicatorCoordinator'];
  backgroundTaskStreamTriggerViewHost:
    QuestionTodoBackgroundTaskRuntimeCoordinators['backgroundTaskStreamTriggerViewHost'];
  activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  backgroundTaskNoticeStateService: BackgroundTaskNoticeStateService;
  backgroundTaskTimelineService: BackgroundTaskTimelineService;
  backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
}

interface ConversationRuntimeWiring {
  conversationAuthoritativeSyncCoordinator: ConversationAuthoritativeSyncCoordinator;
  conversationHydrationRenderBridge: ConversationHydrationRuntimeBridges['conversationHydrationRenderBridge'];
  conversationTransitionBridge: ConversationHydrationRuntimeBridges['conversationTransitionBridge'];
  tabConversationStateBridge: TabConversationStateBridge;
  tabViewActivationBridge: TabViewActivationBridge;
  conversationHydrationOutcomeBridge: ConversationHydrationRuntimeBridges['conversationHydrationOutcomeBridge'];
  tabConversationActivationBridge: TabConversationActivationBridge;
  tabRuntimeStateBridge: TabRuntimeStateBridge;
  conversationSyncRuntimeCoordinator: ConversationSyncRuntimeCoordinator;
  conversationSyncOrchestrationService: ConversationSyncOrchestrationService;
  conversationSyncBridge: ConversationSyncBridge;
  conversationSyncBridgePorts: ConversationSyncBridgePorts;
  tabActivationConversationSyncRuntimePort: TabActivationConversationSyncRuntimePort;
  conversationSessionSignalRuntime: ConversationSessionSignalRuntime;
  backgroundTaskCompletionNoticeService: BackgroundTaskCompletionNoticeService;
  backgroundTaskInlinePanelRenderer: BackgroundTaskInlinePanelRenderer;
  backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
  backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
  conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
  conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator;
}

interface InteractionRuntimeWiring {
  messageSendPreparationService: MessageSendPreparationService;
  messageFinalizationService: MessageFinalizationService;
  assistantNoticeCardRenderer: AssistantNoticeCardRenderer;
  userMessageContentRenderer: UserMessageContentRenderer;
  userMessageFooterRenderer: UserMessageFooterRenderer;
  streamingInlineCardRenderer: StreamingInlineCardRenderer;
  permissionInlineCardRenderer: PermissionInlineCardRenderer;
  questionRuntimeServices: QuestionRuntimeServices;
  sendPipelineRuntime: SendPipelineRuntime;
}

/**
 * The single assembled runtime struct. The view destructures every field into its private
 * fields exactly as the pre-Task-15 constructor did. Adding/removing a field is a contract
 * change caught by `OpenCodianView.task15.characterization.test.ts`.
 */
export interface ChatRuntime
  extends SurfaceRuntimeWiring,
    BackgroundTaskRuntimeWiring,
    ConversationRuntimeWiring,
    InteractionRuntimeWiring {
  conversationIdentityRuntime: ConversationIdentityRuntime;
  conversationRenderService: ConversationRenderService;
  backgroundTaskHost: BackgroundTaskViewHost;
  conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
}

/**
 * Structural port the view satisfies by shape; the view passes itself
 * `as unknown as ChatRuntimeCompositionHost`. {@link ChatRuntimeComposition} never imports the
 * view type, preserving the no-god-object invariant.
 */
export interface ChatRuntimeCompositionHost {
  readonly app: unknown;
  readonly caps: unknown;
  readonly scrollScheduler: SettledScrollScheduler;
  readonly plugin: {
    readonly settings: {
      readonly maxTabs: number;
      readonly tabState: unknown;
      readonly activeBackend: string;
      readonly titleMode: unknown;
      readonly server: { readonly mode: unknown };
      readonly slashCommandSkillMode: unknown;
      readonly questionCardPosition: string;
      readonly backendSettings: { readonly claudeCode: { readonly autoTitle: boolean } };
    };
    readonly settingsTab: unknown;
    readonly openCodeService: (InstanceType<typeof OpenCodeService>) & {
      start(): unknown;
      readonly sdk: unknown;
      requireSdkCapability(id: unknown): unknown;
      getCanonicalSessionState(sessionId: string): unknown;
      hydrateOpenCodeMessage(info: unknown, parts: unknown): unknown;
    };
    readonly opencodeConfigManager: unknown;
    loadConversations(): unknown;
    getConversations(): unknown;
    createConversation(): unknown;
    createConversationFromSession(sessionId: string, initial: unknown): unknown;
    deleteConversation(conversationId: string): unknown;
    readonly agentServiceRegistry: unknown;
  };

  // --- lazily-read live state (resolves after the view destructures the result) ---
  readonly currentConversation: Conversation | null;
  readonly tabManager: { getTabContextUsage(tabId: TabId): unknown } | null;
  readonly messagesContainer: HTMLElement | null;
  readonly streamingMessageEl: HTMLElement | null;
  readonly streamingContentEl: HTMLElement | null;
  readonly questionDockCoordinator: unknown;
  readonly backgroundTaskHost: BackgroundTaskViewHost;
  readonly backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
  readonly backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
  readonly backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
  readonly tabRuntimeStateBridge: TabRuntimeStateBridge;
  readonly chatHeaderPresenter: ChatHeaderPresenter;
  readonly chatSelectionControlsCoordinator: ChatSelectionControlsCoordinator;
  readonly composerContextViewFacade: ComposerContextViewFacade;
  readonly conversationAuthoritativeSyncCoordinator: ConversationAuthoritativeSyncCoordinator;
  readonly conversationIdentityRuntime: ConversationIdentityRuntime;
  readonly conversationNoticeCoordinator: ConversationNoticeCoordinator;
  readonly conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  readonly conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator;
  readonly persistentAssistantNoticeService: PersistentAssistantNoticeService;
  readonly questionDockSlotCoordinator: QuestionDockSlotCoordinator;
  readonly sessionTodoCoordinator: SessionTodoCoordinator;
  readonly assistantShellViewHostAdapter: AssistantShellViewHostAdapter;
  readonly tabConversationStateBridge: TabConversationStateBridge;
  readonly tabConversationSyncFingerprintRuntimePort: TabConversationSyncFingerprintRuntimePort;
  readonly tabMessagesPaneCoordinator: TabMessagesPaneCoordinator;
  readonly activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  readonly userMessageContentRenderer: UserMessageContentRenderer;
  readonly tabRuntimeViewSource: TabRuntimeViewSource;

  // --- value methods ---
  getActiveTabId(): TabId | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabRuntimeState(tabId: TabId): unknown;
  renderSessionTodoDock(tabId: TabId | null): void;
  persistTabState(options?: { flush?: boolean }): void;
  isActiveTabStreaming(): boolean;
  isTabForegroundBusy(tabId: TabId | null): boolean;
  ensureTabRuntimeState(tabId: TabId): unknown;
  syncTabStreamLikeState(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId, needsAttention: boolean): void;
  syncConversationMessagesFromCanonicalState(conversation: Conversation, tabId: TabId | null, reason: unknown): void;
  syncConversationMessagesFromServer(conversation: Conversation, tabId: TabId | null, reason: unknown): void;
  scrollToBottom(options?: unknown): void;
  clearScheduledScrollToBottom(): void;
  scheduleComposerLayoutSync(): void;
  beginConversationHydration(tabId: TabId | null): void;
  endConversationHydration(tabId: TabId | null): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement | null): boolean;
  shouldAutoScroll(tabId: TabId | null): boolean;
  resetTurnState(tabId?: TabId | null): void;
  createUserMessageRenderFrame(message: unknown): unknown;
  addUserMessageFooter(messageEl: HTMLElement, message: unknown, content?: string): void;
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
  getServerAvailability(): unknown;
  getSendMessageOptions(): unknown;
  getCurrentSessionModel(): unknown;
  getCurrentSessionModelResolution(): unknown;
  getCurrentConversationForkService(): unknown;
  getCurrentConversationBranchService(): unknown;
  formatModelId(model: unknown): string;
  reloadModelCatalog(): void;
  appendModelUnavailableNoticeMessage(): void;
  updateModelSelectorDisplay(): void;
  applyFallbackConversationTitle(conversationId: string, firstMessage: unknown): void;
  startAiConversationTitleGeneration(conversationId: string, firstMessage: unknown, modelOptions: unknown): void;
  createNewConversation(): Promise<void>;
  createConversationWriteTicket(conversationId: string): unknown;
  commitConversationWrite(conversation: Conversation, ticket: unknown, reason: string, write: () => void | Promise<void>): Promise<boolean>;
  routeConversationRevertSession(sessionId: string, messageId: unknown): void;
  routeConversationUnrevertSession(sessionId: string): void;
  routeConversationForkSession(sessionId: string, messageId: unknown): void;
  openCodexMcpServerDetailFromChat(serverName: string): void;
  authenticateMcpServerFromChat(serverName: string): void;
  retryMcpToolCallFromChat(toolCall: unknown): void;
  openPluginSettingsAtServerSection(): void;
  createTabBarMutableState(): unknown;
  // --- accessors consumed by the relocated createSendPipelineHostDependencies ---
  readonly chatDiagnosticsCoordinator: {
    claimOpenCodeDiagnosticRunToken(tabId: TabId | null, sessionId: string): unknown;
    claimCodexDiagnosticRunToken(tabId: TabId | null, threadId?: string): unknown;
    claimClaudeDiagnosticRunToken(tabId: TabId | null, sessionId?: string): unknown;
  };
  scheduleSettledScrollToBottomIfNeeded(shouldScroll: unknown, tabId: TabId | null): void;
  getOrCreateTabStreamController(tabId: TabId): unknown;
  getConversationForTab(tabId: TabId): Conversation | null;
  showPermissionDialog(request: unknown, tabId: TabId | null): void;
  showQuestionDialog(request: unknown, tabId: TabId | null): Promise<void>;
  convertToStreamingChunk(chunk: unknown): unknown;
  getFriendlyStreamErrorMessage(rawMessage: unknown): string;
  syncLatestUserMessageFromServer(conversation: Conversation, optimisticMessageId: unknown, tabId: TabId | null): void;

  // --- host factories ---
  createChatHeaderPresenterHost(): unknown;
  createChatSelectionControlsCoordinatorHost(): unknown;
  createComposerInputShellCoordinatorHost(): unknown;
  createInputPanelAppearanceCoordinatorHost(): unknown;
  createChatSurfaceAppearanceCoordinatorHost(): unknown;
  createConversationSessionSettingsCoordinatorHost(): unknown;
  createConversationHistoryActionsHost(titleGenerationService: TitleGenerationService): unknown;
  createPersistentAssistantNoticeServiceHost(): unknown;
  createConversationNoticeCoordinatorHost(): unknown;
  createChildSessionGraphCoordinatorHost(): unknown;
  createAssistantShellViewHostAdapterHost(): unknown;
  createComposerContextViewHost(): unknown;
  createFocusContextRuntimeViewHost(): unknown;
  createFocusContextPreviewWritebackHost(): unknown;
  createSessionTodoViewHost(): unknown;
  createTabMessagesPaneCoordinatorHost(): unknown;
  createActiveTabContextUsageCoordinatorHost(): unknown;
  createBackgroundTaskNoticeStateServiceHost(): unknown;
  createBackgroundTaskTimelineServiceHost(): unknown;
  createBackgroundTaskLiveSignalCoordinatorHostBuilderHost(): unknown;
  createBackgroundTaskInlinePanelRendererHost(): unknown;
  createBackgroundTaskIndicatorCoordinatorHost(): unknown;
  createBackgroundTaskCompletionNoticeServiceHost(): unknown;
  createTabActivationRuntimeHostProviderHost(): unknown;
  createConversationSyncLoadRuntimeViewHost(conversationRenderService: ConversationRenderService): ConversationSyncRuntimeAssemblyViewHost;
  createConversationAuthoritativeSyncHost(conversationRenderService: ConversationRenderService): unknown;
  createHydrationRuntimeHostDeps(conversationRenderService: ConversationRenderService): ConversationHydrationRuntimeViewHost;
  createConversationSessionSignalRuntimeHost(): unknown;
  createConversationViewStateHost(): unknown;
  createConversationTabOpenHost(): unknown;
  createConversationTabLifecycleRecoveryHost(): unknown;
  createAssistantNoticeCardRendererHost(): unknown;
  createUserMessageContentRendererHost(): unknown;
  createUserMessageFooterRendererHost(): unknown;
  createStreamingInlineCardRendererHost(): unknown;
  createQuestionRuntimeViewHostFactoryHost(): unknown;
  createSendPipelineHostDependencies(): unknown;
  createTabConversationSyncFingerprintRuntimePort(): TabConversationSyncFingerprintRuntimePort;
}

/**
 * Composes the chat runtime. One instance per view; {@link compose} runs once at view
 * construction in the same phase order the pre-Task-15 constructor used (surface →
 * identity/render → background → conversation → interaction).
 */
export class ChatRuntimeComposition {
  constructor(private readonly host: ChatRuntimeCompositionHost) {}

  compose(): ChatRuntime {
    const surface = this.createSurfaceRuntimeWiring();
    const conversationIdentityRuntime = this.createConversationIdentityRuntime();
    const userMessageContentRenderer = this.createUserMessageContentRenderer();
    const conversationRenderService = this.createConversationRenderService(userMessageContentRenderer);
    const background = this.createBackgroundTaskRuntimeWiring(surface.sessionTodoCoordinator);
    const conversation = this.createConversationRuntimeWiring(
      background,
      {
        conversationRenderService,
        conversationIdentityRuntime,
        composerContextViewFacade: surface.composerContextViewFacade,
        tabMessagesPaneCoordinator: surface.tabMessagesPaneCoordinator,
      },
    );
    const interaction = this.createInteractionRuntimeWiring(
      conversation.conversationSyncBridgePorts,
      conversationRenderService,
      {
        conversation,
        surface,
        userMessageContentRenderer,
      },
    );

    return {
      ...surface,
      ...background,
      ...conversation,
      ...interaction,
      conversationIdentityRuntime,
      conversationRenderService,
      backgroundTaskHost: conversation.backgroundTaskHost,
      conversationTabOpenCoordinator: conversation.conversationTabOpenCoordinator,
    };
  }

  // The four wiring methods below were relocated verbatim from OpenCodianView; `this.X` view
  // accessors became `this.host.X`, and cross-phase values are threaded via compose() locals.

  private createSurfaceRuntimeWiring(): SurfaceRuntimeWiring {
    const host = this.host;
    const serverReferenceContextService = host.plugin.openCodeService
      ? new ServerReferenceContextService({
          requireCapability: (id: unknown) => {
            try {
              const availability = host.plugin.openCodeService.requireSdkCapability(id) as
                | { supported?: boolean; reason?: string }
                | undefined;
              if (availability && 'supported' in availability && availability.supported === false) {
                return { supported: false, reason: availability.reason };
              }
              return { supported: true };
            } catch {
              return { supported: false };
            }
          },
        })
      : undefined;
    const composerContextViewFacade = ComposerContextViewFacade.create({
      app: host.app as never,
      getServerMode: () => host.plugin.settings.server.mode as never,
      viewHost: host.createComposerContextViewHost() as never,
      focusRuntimeViewHost: host.createFocusContextRuntimeViewHost() as never,
      focusPreviewWritebackHost: host.createFocusContextPreviewWritebackHost() as never,
      serverContext: serverReferenceContextService,
    });
    const titleGenerationService = new TitleGenerationService(host.plugin as never);
    const questionDockSlotCoordinator = new QuestionDockSlotCoordinator(
      {
        shouldUseAboveInputQuestionDock: () => host.plugin.settings.questionCardPosition === 'above_input',
      },
      () => {
        if (hasCapability(host.caps as never, AgentCapability.Questions)) {
          (host.questionDockCoordinator as { render(): void } | null)?.render();
        }
      },
    );
    const conversationHistoryActionsCoordinator = new ConversationHistoryActionsCoordinator(
      host.createConversationHistoryActionsHost(titleGenerationService) as never,
    );
    const conversationSessionSettingsCoordinator = new ConversationSessionSettingsCoordinator(
      host.createConversationSessionSettingsCoordinatorHost() as never,
    );

    return {
      titleGenerationService,
      tabMessagesPaneCoordinator: new TabMessagesPaneCoordinator(
        host.createTabMessagesPaneCoordinatorHost() as never,
        host.scrollScheduler,
      ),
      chatHeaderPresenter: new ChatHeaderPresenter(host.createChatHeaderPresenterHost() as never),
      conversationHistoryActionsCoordinator,
      chatSelectionControlsCoordinator: new ChatSelectionControlsCoordinator(
        host.createChatSelectionControlsCoordinatorHost() as never,
      ),
      composerInputShellCoordinator: new ComposerInputShellCoordinator(
        host.createComposerInputShellCoordinatorHost() as never,
      ),
      inputPanelAppearanceCoordinator: new InputPanelAppearanceCoordinator(
        host.createInputPanelAppearanceCoordinatorHost() as never,
      ),
      chatSurfaceAppearanceCoordinator: new ChatSurfaceAppearanceCoordinator(
        host.createChatSurfaceAppearanceCoordinatorHost() as never,
      ),
      conversationSessionSettingsCoordinator,
      composerContextViewFacade,
      tabConversationSyncFingerprintRuntimePort: host.createTabConversationSyncFingerprintRuntimePort(),
      persistentAssistantNoticeService: new PersistentAssistantNoticeService(
        host.createPersistentAssistantNoticeServiceHost() as never,
      ),
      conversationNoticeCoordinator: new ConversationNoticeCoordinator(
        host.createConversationNoticeCoordinatorHost() as never,
      ),
      sessionTodoCoordinator: createSessionTodoCoordinator(host.createSessionTodoViewHost() as never),
      childSessionGraphCoordinator: new ChildSessionGraphCoordinator(
        host.createChildSessionGraphCoordinatorHost() as never,
        (sessionId: string) => {
          void host.conversationTabOpenCoordinator.openTaskToolSession(
            sessionId,
            null,
            host.currentConversation?.backend,
          );
        },
      ),
      questionDockSlotCoordinator,
      assistantShellViewHostAdapter: new AssistantShellViewHostAdapter(
        host.createAssistantShellViewHostAdapterHost() as never,
        (sessionId: string, toolCall: unknown) =>
          host.conversationTabOpenCoordinator.openTaskToolSession(
            sessionId,
            toolCall as never,
            host.currentConversation?.backend,
          ),
        {
          onOpenMcpServerDetail: (serverName: string) => host.openCodexMcpServerDetailFromChat(serverName),
          onAuthenticateMcpServer: (serverName: string) => { host.authenticateMcpServerFromChat(serverName); },
          onRetryMcpToolCall: (toolCall: unknown) => { host.retryMcpToolCallFromChat(toolCall); },
        },
      ),
    };
  }

  private createConversationIdentityRuntime(): ConversationIdentityRuntime {
    const host = this.host;
    return new ConversationIdentityRuntime({
      getCanonicalConversationFingerprint: (messages: unknown) => {
        const fingerprintBuilder = (
          host.plugin.openCodeService?.constructor as typeof OpenCodeService | undefined
        )?.getCanonicalConversationFingerprint;
        if (typeof fingerprintBuilder === 'function') {
          return fingerprintBuilder(messages as never);
        }
        return undefined;
      },
      getActiveTabId: () => host.getActiveTabId(),
      getTabContextUsage: (tabId: TabId) => (host.tabManager?.getTabContextUsage(tabId) ?? null) as never,
    });
  }

  private createUserMessageContentRenderer(): UserMessageContentRenderer {
    return new UserMessageContentRenderer(this.host.createUserMessageContentRendererHost() as never);
  }

  private createConversationRenderService(
    userMessageContentRenderer: UserMessageContentRenderer,
  ): ConversationRenderService {
    const host = this.host;
    return new ConversationRenderService(
      createConversationRenderHost({
        getCurrentConversation: () => host.currentConversation,
        getMessagesContainer: () => host.messagesContainer,
        getActiveTabId: () => host.getActiveTabId(),
        getTabRuntimeState: (tabId: TabId) => host.getTabRuntimeState(tabId),
        clearScheduledScrollToBottom: () => { host.clearScheduledScrollToBottom(); },
        beginConversationHydration: (tabId: TabId | null) => { host.beginConversationHydration(tabId); },
        endConversationHydration: (tabId: TabId | null) => { host.endConversationHydration(tabId); },
        shouldRenderEmptyConversationNotice: () =>
          host.conversationNoticeCoordinator.shouldRenderEmptyConversationNotice(),
        createEmptyConversationNotice: () =>
          host.conversationNoticeCoordinator.createEmptyConversationNotice(),
        createUserMessageFrame: (message: unknown) => host.createUserMessageRenderFrame(message),
        userMessageContentRenderer,
        addUserMessageFooter: (messageEl: HTMLElement, message: unknown, content?: string) => {
          host.addUserMessageFooter(messageEl, message, content);
        },
        renderMarkdownInto: (container: HTMLElement, markdown: string) =>
          host.renderMarkdownInto(container, markdown),
        renderBackgroundTaskIndicatorIfNeeded: (tabId: TabId | null) => {
          if (hasCapability(host.caps as never, AgentCapability.Subagents)) {
            return host.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId);
          }
          return Promise.resolve();
        },
        syncBackgroundTaskStateFromConversation: (conversation: Conversation) => {
          host.backgroundTaskHost.syncBackgroundTaskStateFromConversation(conversation, host.getActiveTabId());
        },
        shouldAutoScroll: (tabId: TabId | null) => host.shouldAutoScroll(tabId),
        scrollToBottom: (options?: unknown) => { host.scrollToBottom(options); },
        syncPaneScrollMetrics: (tabId: TabId | null, messagesEl: HTMLElement | null) =>
          host.syncPaneScrollMetrics(tabId, messagesEl),
        scheduleComposerLayoutSync: () => { host.scheduleComposerLayoutSync(); },
        getMessagesForRender: (messages: unknown) =>
          host.conversationIdentityRuntime.getMessagesForRender(messages as never),
        getMessageVisualSignature: (message: unknown) =>
          host.conversationIdentityRuntime.getMessageVisualSignature(message as never),
        renderPersistedAssistantMessage: (options: unknown) =>
          host.assistantShellViewHostAdapter.renderPersistedAssistantMessage(options as never),
        createAssistantMessageElements: () =>
          host.assistantShellViewHostAdapter.createAssistantMessageElement(),
        finalizePseudoStreamFooter: (messageEl: HTMLElement, message: unknown) => {
          host.assistantShellViewHostAdapter.finalizePseudoStreamFooter(messageEl, message as never);
        },
        clearStreamingMessageState: () => {
          // streamingMessageEl/streamingContentEl are view-private mutable fields; the view owns
          // their null-out. Exposed read-only here; the write is performed via a host callback.
          (host as unknown as { streamingMessageEl: HTMLElement | null }).streamingMessageEl = null;
          (host as unknown as { streamingContentEl: HTMLElement | null }).streamingContentEl = null;
        },
        getAssistantBodySignature: (message: unknown) =>
          host.assistantShellViewHostAdapter.getAssistantBodySignature(message as never),
        renderAssistantMessageBody: (contentEl: HTMLElement, message: unknown) =>
          host.assistantShellViewHostAdapter.renderMessageBody(contentEl, message as never),
        finalizePersistedFooter: (messageEl: HTMLElement, message: unknown) => {
          host.assistantShellViewHostAdapter.finalizePersistedFooter(messageEl, message as never);
        },
        resetTurnState: (tabId?: TabId | null) => { host.resetTurnState(tabId); },
      } as never),
      {
        getCanonicalSessionState: (sessionId: string) =>
          host.plugin.openCodeService.getCanonicalSessionState(sessionId),
        hydrateOpenCodeMessage: (info: unknown, parts: unknown) =>
          host.plugin.openCodeService.hydrateOpenCodeMessage(info, parts) as never,
      },
    );
  }

  private createBackgroundTaskRuntimeWiring(
    sessionTodoCoordinator: SessionTodoCoordinator,
  ): BackgroundTaskRuntimeWiring {
    const host = this.host;
    const bundle = createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam({
      getActiveTabId: () => host.getActiveTabId(),
      getCurrentConversation: () => host.currentConversation,
      setCurrentConversationRevertState: (revertState: unknown) => {
        (host as unknown as { currentConversationRevertState: unknown }).currentConversationRevertState = revertState;
      },
      getConversationSyncRuntime: () => host.tabConversationSyncFingerprintRuntimePort,
      getTabRuntimeState: (tabId: TabId) => host.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => host.getSessionIdForTab(tabId),
      renderSessionTodoDock: (tabId: TabId | null) => { host.renderSessionTodoDock(tabId); },
      getQuestionDockCoordinator: () => host.questionDockCoordinator as never,
      getSessionTodoCoordinator: () => host.sessionTodoCoordinator,
      getQuestionDockSlotCoordinator: () => host.questionDockSlotCoordinator,
      getBackgroundTaskHost: () => host.backgroundTaskHost,
      getBackgroundTaskIndicatorCoordinator: () => host.backgroundTaskIndicatorCoordinator,
      getBackgroundTaskLiveSignalCoordinator: () => host.backgroundTaskLiveSignalCoordinator,
      getTabRuntimeStateBridge: () => host.tabRuntimeStateBridge,
    } as never);
    const activeTabContextUsageCoordinator = new ActiveTabContextUsageCoordinator(
      host.createActiveTabContextUsageCoordinatorHost() as never,
    );
    const backgroundTaskNoticeStateService = new BackgroundTaskNoticeStateService(
      host.createBackgroundTaskNoticeStateServiceHost() as never,
    );
    const backgroundTaskTimelineService = new BackgroundTaskTimelineService(
      host.createBackgroundTaskTimelineServiceHost() as never,
    );
    const backgroundTaskLiveSignalCoordinator = new BackgroundTaskLiveSignalCoordinator(
      sessionTodoCoordinator,
      backgroundTaskTimelineService,
      backgroundTaskNoticeStateService,
      host.createBackgroundTaskLiveSignalCoordinatorHostBuilderHost() as never,
    );
    return {
      ...bundle,
      activeTabContextUsageCoordinator,
      backgroundTaskNoticeStateService,
      backgroundTaskTimelineService,
      backgroundTaskLiveSignalCoordinator,
    };
  }

  private createConversationRuntimeWiring(
    background: BackgroundTaskRuntimeWiring,
    inputs: ConversationWiringInputs,
  ): ConversationRuntimeResult {
    const host = this.host;
    const { conversationRenderService, conversationIdentityRuntime, composerContextViewFacade, tabMessagesPaneCoordinator } = inputs;
    const conversationAuthoritativeSyncCoordinator = new ConversationAuthoritativeSyncCoordinator(
      host.createConversationAuthoritativeSyncHost(conversationRenderService) as never,
    );
    const tabActivationAssembly = createTabActivationRuntimeAssembly({
      hostProviderHost: host.createTabActivationRuntimeHostProviderHost() as never,
      focusPreviewRefresh: composerContextViewFacade,
      questionTodoActivationRefresh: background.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicator: background.backgroundTaskActivationIndicatorCoordinator,
      activeTabContextUsage: background.activeTabContextUsageCoordinator,
    } as never);
    const { tabConversationStateBridge, tabViewActivationBridge } = tabActivationAssembly;
    const {
      conversationHydrationRenderBridge,
      conversationTransitionBridge,
      conversationHydrationOutcomeBridge,
    } = assembleConversationHydrationRuntime({
      host: host.createHydrationRuntimeHostDeps(conversationRenderService),
      tabConversationStateBridge,
      tabViewActivationBridge,
    } as never);
    const tabConversationActivationBridge = tabActivationAssembly.tabConversationActivationBridge;
    const tabRuntimeStateBridge = tabActivationAssembly.tabRuntimeStateBridge;
    const conversationSyncRuntime = assembleConversationSyncRuntime({
      viewHost: host.createConversationSyncLoadRuntimeViewHost(conversationRenderService),
      visiblePostSyncCoordinator: background.visibleConversationPostSyncCoordinator,
      backgroundPostSyncHandoffCoordinator: background.backgroundConversationPostSyncHandoffCoordinator,
    } as never);
    const tabActivationConversationSyncRuntimePort = assembleTabActivationConversationSyncRuntimePort({
      getConversationSyncFingerprint: (messages: unknown) =>
        conversationIdentityRuntime.getConversationSyncFingerprint(messages as never),
      setActiveTabConversationSyncFingerprint: (fingerprint: unknown) => {
        host.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(
          host.getActiveTabId(),
          { fingerprint } as never,
        );
      },
      startConversationSyncLoop: () => {
        conversationSyncRuntime.bridgePorts.getLoopControl().startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        conversationSyncRuntime.bridgePorts.getLoopControl().stopConversationSyncLoop();
      },
    } as never);
    const conversationSessionSignalRuntime = new ConversationSessionSignalRuntime(
      host.createConversationSessionSignalRuntimeHost() as never,
      background.backgroundTaskLiveSignalCoordinator,
    );
    const infrastructure = this.createBackgroundTaskInfrastructure(background, tabRuntimeStateBridge);

    const conversationLoadRuntimeBridge = new ConversationLoadRuntimeBridge(
      conversationSyncRuntime.conversationLoadRuntimeBridgeHost,
    );
    const loadRecoveryAssembly = assembleConversationLoadRecovery({
      viewStateHost: host.createConversationViewStateHost() as never,
      tabConversationStateBridge,
      tabConversationActivationBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
      tabOpenHost: host.createConversationTabOpenHost() as never,
      lifecycleRecoveryHost: host.createConversationTabLifecycleRecoveryHost() as never,
      loadRecoveryHostDeps: {
        isActiveTabStreaming: () => host.isActiveTabStreaming(),
        getCurrentConversation: () => host.currentConversation,
        getTabManager: () => host.tabManager,
        getMaxTabs: () => host.plugin.settings.maxTabs,
        getPersistedTabState: () => host.plugin.settings.tabState,
        setPersistedTabState: (state: unknown) => {
          (host.plugin.settings as { tabState: unknown }).tabState = state;
        },
        persistTabState: (options?: { flush?: boolean }) => { host.persistTabState(options); },
        loadConversations: () => host.plugin.loadConversations(),
        getConversations: () => host.plugin.getConversations(),
        getActiveBackend: () => host.plugin.settings.activeBackend,
        createConversation: () => host.plugin.createConversation(),
        app: host.app as never,
        revertSession: (sessionId: string, messageId: unknown) => host.routeConversationRevertSession(sessionId, messageId),
        unrevertSession: (sessionId: string) => host.routeConversationUnrevertSession(sessionId),
        forkSession: (sessionId: string, messageId: unknown) => host.routeConversationForkSession(sessionId, messageId),
        createConversationFromSession: (sessionId: string, initial: unknown) =>
          host.plugin.createConversationFromSession(sessionId, initial),
        deleteConversation: (conversationId: string) => host.plugin.deleteConversation(conversationId),
        syncActiveTabConversation: (conversation: Conversation) => {
          host.tabConversationStateBridge.syncActiveTabConversation(conversation);
        },
        updateModelSelectorDisplay: () => { host.updateModelSelectorDisplay(); },
        hasMatchingPersistentNotice: (title: unknown, content: unknown, tone: unknown, conversation: Conversation) =>
          host.persistentAssistantNoticeService.hasMatchingMessage(title as never, content as never, tone as never, conversation),
        appendPersistentNotice: (options: unknown) =>
          host.persistentAssistantNoticeService.appendMessage(options as never),
      } as never,
    } as never);
    const {
      conversationLoadRecoveryCoordinator,
      conversationTabOpenCoordinator,
      conversationTabLifecycleRecoveryCoordinator,
    } = loadRecoveryAssembly;
    const conversationTabRuntimeCoordinator = assembleConversationTabRuntime({
      tabBarState: host.createTabBarMutableState() as never,
      settings: host.plugin.settings as never,
      plugin: host.plugin as never,
      view: host.tabRuntimeViewSource,
      paneCoordinator: tabMessagesPaneCoordinator,
      loadRecoveryCoordinator: conversationLoadRecoveryCoordinator,
      lifecycleRecoveryCoordinator: conversationTabLifecycleRecoveryCoordinator,
      runtimeStateBridge: tabRuntimeStateBridge,
    } as never);

    return {
      conversationAuthoritativeSyncCoordinator,
      conversationHydrationRenderBridge,
      conversationTransitionBridge,
      tabConversationStateBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      tabConversationActivationBridge,
      tabRuntimeStateBridge,
      conversationSyncRuntimeCoordinator: conversationSyncRuntime.runtimeCoordinator,
      conversationSyncOrchestrationService: conversationSyncRuntime.orchestrationService,
      conversationSyncBridge: conversationSyncRuntime.bridge,
      conversationSyncBridgePorts: conversationSyncRuntime.bridgePorts,
      tabActivationConversationSyncRuntimePort,
      conversationSessionSignalRuntime,
      backgroundTaskCompletionNoticeService: infrastructure.backgroundTaskCompletionNoticeService,
      backgroundTaskInlinePanelRenderer: infrastructure.backgroundTaskInlinePanelRenderer,
      backgroundTaskIndicatorCoordinator: infrastructure.backgroundTaskIndicatorCoordinator,
      backgroundTaskStreamTriggerCoordinator: infrastructure.backgroundTaskStreamTriggerCoordinator,
      conversationLoadRecoveryCoordinator,
      conversationTabRuntimeCoordinator,
      backgroundTaskHost: infrastructure.backgroundTaskHost,
      conversationTabOpenCoordinator,
    };
  }

  private createBackgroundTaskInfrastructure(
    background: BackgroundTaskRuntimeWiring,
    tabRuntimeStateBridge: TabRuntimeStateBridge,
  ): {
    backgroundTaskCompletionNoticeService: BackgroundTaskCompletionNoticeService;
    backgroundTaskInlinePanelRenderer: BackgroundTaskInlinePanelRenderer;
    backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
    backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
    backgroundTaskHost: BackgroundTaskViewHost;
  } {
    const host = this.host;
    const backgroundTaskCompletionNoticeService = new BackgroundTaskCompletionNoticeService(
      host.createBackgroundTaskCompletionNoticeServiceHost() as never,
    );
    const backgroundTaskInlinePanelRenderer = new BackgroundTaskInlinePanelRenderer(
      background.backgroundTaskTimelineService,
      host.createBackgroundTaskInlinePanelRendererHost() as never,
    );
    const backgroundTaskIndicatorCoordinator = new BackgroundTaskIndicatorCoordinator({
      inlinePanelRenderer: backgroundTaskInlinePanelRenderer,
      timelineService: background.backgroundTaskTimelineService,
      completionNoticeService: backgroundTaskCompletionNoticeService,
      liveSignalCoordinator: background.backgroundTaskLiveSignalCoordinator,
      tabRuntimeStateBridge,
      host: host.createBackgroundTaskIndicatorCoordinatorHost() as never,
    } as never);
    const backgroundTaskIndicatorRenderPort = {
      renderIfNeeded: (tabId?: TabId | null) => {
        if (hasCapability(host.caps as never, AgentCapability.Subagents)) {
          return backgroundTaskIndicatorCoordinator.renderIfNeeded(tabId);
        }
        return Promise.resolve();
      },
    };
    const backgroundTaskHost = createBackgroundTaskViewHost({
      timelineService: background.backgroundTaskTimelineService,
      indicatorRenderPort: backgroundTaskIndicatorRenderPort,
    });
    const backgroundTaskStreamTriggerCoordinator = new BackgroundTaskStreamTriggerCoordinator(
      backgroundTaskIndicatorRenderPort,
      background.backgroundTaskTimelineService,
      background.backgroundTaskLiveSignalCoordinator,
      background.backgroundTaskStreamTriggerViewHost,
    );
    return {
      backgroundTaskCompletionNoticeService,
      backgroundTaskInlinePanelRenderer,
      backgroundTaskIndicatorCoordinator,
      backgroundTaskStreamTriggerCoordinator,
      backgroundTaskHost,
    };
  }

  private createInteractionRuntimeWiring(
    conversationSyncBridgePorts: ConversationSyncBridgePorts,
    conversationRenderService: ConversationRenderService,
    inputs: InteractionWiringInputs,
  ): InteractionRuntimeWiring {
    const { conversation, surface, userMessageContentRenderer } = inputs;
    const host = this.host;
    const messageFinalizationService = new MessageFinalizationService(
      createMessageFinalizationHost({
        getCurrentConversation: () => host.currentConversation,
        getActiveTabId: () => host.getActiveTabId(),
        syncConversationMessagesFromCanonicalState: (c: Conversation, tabId: TabId | null, reason: unknown) =>
          host.syncConversationMessagesFromCanonicalState(c, tabId, reason),
        syncConversationMessagesFromServer: (c: Conversation, tabId: TabId | null, reason: unknown) =>
          host.syncConversationMessagesFromServer(c, tabId, reason),
        conversationIdentityRuntime: host.conversationIdentityRuntime,
        conversationRenderService,
        backgroundTaskHost: conversation.backgroundTaskHost,
        conversationNoticeCoordinator: host.conversationNoticeCoordinator,
        sessionTodoCoordinator: host.sessionTodoCoordinator,
        createConversationWriteTicket: (conversationId: string) => host.createConversationWriteTicket(conversationId),
        commitConversationWrite: (c: Conversation, ticket: unknown, reason: string, write: () => void | Promise<void>) =>
          host.commitConversationWrite(c, ticket, reason, write),
        conversationTabRuntimeCoordinator: host.conversationTabRuntimeCoordinator,
        setTabNeedsAttention: (tabId: TabId, needsAttention: boolean) => host.setTabNeedsAttention(tabId, needsAttention),
        tabConversationStateBridge: host.tabConversationStateBridge,
        activeTabContextUsageCoordinator: host.activeTabContextUsageCoordinator,
        assistantShellViewHostAdapter: host.assistantShellViewHostAdapter,
        formatCurrentSessionModelId: () => host.formatModelId(host.getCurrentSessionModel()),
        scrollToBottom: (options?: unknown) => host.scrollToBottom(options),
      } as never),
    );
    const messageSendPreparationService = new MessageSendPreparationService(
      createMessageSendPreparationHost({
        getCurrentConversation: () => host.currentConversation,
        createNewConversation: async () => {
          await host.createNewConversation();
          return host.currentConversation;
        },
        createConversationWriteTicket: (conversationId: string) => host.createConversationWriteTicket(conversationId),
        commitConversationWrite: (c: Conversation, ticket: unknown, reason: string, write: () => void | Promise<void>) =>
          host.commitConversationWrite(c, ticket, reason, write),
        getActiveTabId: () => host.getActiveTabId(),
        ensureTabRuntimeState: (tabId: TabId) => host.ensureTabRuntimeState(tabId),
        isTabForegroundBusy: (tabId: TabId | null) => host.isTabForegroundBusy(tabId),
        conversationTabRuntimeCoordinator: host.conversationTabRuntimeCoordinator,
        getServerAvailability: () => host.getServerAvailability(),
        chatHeaderPresenter: host.chatHeaderPresenter,
        settingsTab: host.plugin.settingsTab ?? null,
        getServerMode: () => host.plugin.settings.server.mode as never,
        openPluginSettingsAtServerSection: () => host.openPluginSettingsAtServerSection(),
        startServer: () => host.plugin.openCodeService.start(),
        notifyForegroundBusy: () => { new Notice(t('chat.tab.processingBlocked')); },
        assistantShellViewHostAdapter: host.assistantShellViewHostAdapter,
        messageFinalizationService,
        chatSelectionControlsCoordinator: host.chatSelectionControlsCoordinator,
        reloadModelCatalog: () => host.reloadModelCatalog(),
        getSendMessageOptions: () => host.getSendMessageOptions(),
        appendModelUnavailableNoticeMessage: () => host.appendModelUnavailableNoticeMessage(),
        openCodeService: host.plugin.openCodeService,
        backgroundTaskHost: conversation.backgroundTaskHost,
        conversationSyncBridgePorts,
        conversationRenderService,
        scrollToBottom: (options?: unknown) => host.scrollToBottom(options),
        applyFallbackConversationTitle: (conversationId: string, firstMessage: unknown) =>
          host.applyFallbackConversationTitle(conversationId, firstMessage),
        getTitleMode: () => host.plugin.settings.titleMode,
        getClaudeAutoTitle: () => host.plugin.settings.backendSettings.claudeCode.autoTitle,
        startAiConversationTitleGeneration: (conversationId: string, firstMessage: unknown, modelOptions: unknown) => {
          void host.startAiConversationTitleGeneration(conversationId, firstMessage, modelOptions);
        },
        activeTabContextUsageCoordinator: host.activeTabContextUsageCoordinator,
        syncTabStreamLikeState: (tabId: TabId | null) => host.syncTabStreamLikeState(tabId),
      } as never),
      surface.composerContextViewFacade.sendContext,
    );
    const assistantNoticeCardRenderer = new AssistantNoticeCardRenderer(
      host.createAssistantNoticeCardRendererHost() as never,
    );
    const userMessageFooterRenderer = new UserMessageFooterRenderer(
      host.createUserMessageFooterRendererHost() as never,
    );
    const streamingInlineCardRenderer = new StreamingInlineCardRenderer(
      host.createStreamingInlineCardRendererHost() as never,
    );
    const permissionInlineCardRenderer = new PermissionInlineCardRenderer(streamingInlineCardRenderer);
    const questionRuntimeViewHostFactoryHost = host.createQuestionRuntimeViewHostFactoryHost();
    const questionRuntimeServices = createQuestionRuntimeBundle(
      questionRuntimeViewHostFactoryHost as never,
      {
        conversationSync: conversationSyncBridgePorts.getVisibleSyncFollowUp(),
        statusRefresh: host.sessionTodoCoordinator,
        streamingInlineCardRenderer,
      } as never,
    );
    const slashCommandExecutionService = new SlashCommandExecutionService(
      createSlashCommandExecutionHost({
        getCurrentConversation: () => host.currentConversation,
        createNewConversation: async () => { await host.createNewConversation(); },
        getActiveTabId: () => host.getActiveTabId(),
        ensureTabRuntimeState: (tabId: TabId) => host.ensureTabRuntimeState(tabId),
        isTabForegroundBusy: (tabId: TabId | null) => host.isTabForegroundBusy(tabId),
        notifyForegroundBusy: () => { new Notice(t('chat.tab.processingBlocked')); },
        getServerAvailability: () => host.getServerAvailability(),
        chatHeaderPresenter: host.chatHeaderPresenter,
        ensureServerReadyForChat: (availability: unknown) =>
          messageSendPreparationService.ensureServerReadyForChat(availability as never),
        opencodeConfigManager: host.plugin.opencodeConfigManager,
        getSlashCommandSkillMode: () => host.plugin.settings.slashCommandSkillMode,
        openCodeServiceSdk: host.plugin.openCodeService.sdk,
        openCodeService: host.plugin.openCodeService,
        runCompactSession: (sessionId: string) => executeCompactSession(
          sessionId,
          host.plugin.openCodeService,
          () => host.getCurrentSessionModel() as never,
          () => host.getCurrentSessionModelResolution() as never,
        ),
        getVaultPath: () => getVaultBasePath(host.app as never),
        composerContextViewFacade: surface.composerContextViewFacade,
        getTabRuntimeState: (tabId: TabId) => host.getTabRuntimeState(tabId),
        conversationSyncBridgePorts,
        notifySlashCommandFailed: (commandId: string, error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(t('chat.slashCommand.executionFailed', { command: commandId, message }));
        },
      } as never),
    );
    const sendPipelineRuntime = new SendPipelineRuntime(
      createSendPipelineRuntimeHost(this.buildSendPipelineHostDependencies(surface)),
      messageSendPreparationService,
      messageFinalizationService,
      slashCommandExecutionService,
    );
    void surface;
    return {
      messageSendPreparationService,
      messageFinalizationService,
      assistantNoticeCardRenderer,
      userMessageContentRenderer,
      userMessageFooterRenderer,
      streamingInlineCardRenderer,
      permissionInlineCardRenderer,
      questionRuntimeServices,
      sendPipelineRuntime,
    };
  }

  /**
   * Relocated from OpenCodianView.createSendPipelineHostDependencies. Reads view state via
   * the host; the synchronously-invoked `createSendPipelineShellPort` reads the
   * surface-built assistantShellViewHostAdapter (passed as `surface`), because that closure
   * is invoked during SendPipelineRuntime construction, before the view has destructured the
   * runtime. All other closures are lazy and resolve host.X live.
   */
  private buildSendPipelineHostDependencies(surface: SurfaceRuntimeWiring): SendPipelineHostDependencies {
    const host = this.host;
    return {
      getTabRuntimeState: (tabId: TabId) => host.getTabRuntimeState(tabId),
      getActiveTabId: () => host.getActiveTabId(),
      shouldAutoScroll: (tabId: TabId | null) => host.shouldAutoScroll(tabId),
      scheduleSettledScrollToBottomIfNeeded: (shouldScroll: unknown, tabId: TabId | null) => {
        host.scheduleSettledScrollToBottomIfNeeded(shouldScroll, tabId);
      },
      getOrCreateTabStreamController: (tabId: TabId) => host.getOrCreateTabStreamController(tabId),
      finalizeBackgroundTaskIndicatorAfterPrimaryStream: (tabId: TabId | null) =>
        host.backgroundTaskStreamTriggerCoordinator.finalizeAfterPrimaryStream(tabId),
      removeEmptyAssistantShells: () => {
        if (host.messagesContainer) {
          ConversationRenderService.removeEmptyAssistantShells(host.messagesContainer);
        }
      },
      syncTabStreamLikeState: (tabId: TabId | null) => { host.syncTabStreamLikeState(tabId); },
      transitionTabSessionLifecycle: (tabId: TabId | null, phase: unknown, reason: unknown) =>
        host.conversationTabRuntimeCoordinator.transitionTabSessionLifecycle(tabId, phase as never, reason as never),
      refreshServerStatusBadge: () => host.chatHeaderPresenter.refreshServerStatusBadge(),
      claimOpenCodeDiagnosticRunToken: (tabId: TabId | null, sessionId: string) =>
        host.chatDiagnosticsCoordinator.claimOpenCodeDiagnosticRunToken(tabId, sessionId),
      claimCodexDiagnosticRunToken: (tabId: TabId | null, threadId?: string) =>
        host.chatDiagnosticsCoordinator.claimCodexDiagnosticRunToken(tabId, threadId ?? undefined),
      claimClaudeDiagnosticRunToken: (tabId: TabId | null, sessionId?: string) =>
        host.chatDiagnosticsCoordinator.claimClaudeDiagnosticRunToken(tabId, sessionId ?? undefined),
      refreshOpenCodeDiagnosticsState: (tabId: TabId | null) => {
        if (!shouldRefreshOpenCodeDiagnosticsHeader(host.getActiveTabId(), tabId)) return;
        host.chatHeaderPresenter.refreshBackendChrome();
      },
      refreshCodexDiagnosticsState: (tabId: TabId | null) => {
        if (!shouldRefreshOpenCodeDiagnosticsHeader(host.getActiveTabId(), tabId)) return;
        host.chatHeaderPresenter.refreshBackendChrome();
      },
      refreshClaudeDiagnosticsState: (tabId: TabId | null) => {
        if (!shouldRefreshOpenCodeDiagnosticsHeader(host.getActiveTabId(), tabId)) return;
        host.chatHeaderPresenter.refreshBackendChrome();
      },
      sendStreamMessage: (conversation: Conversation, content: unknown, options: unknown) => {
        const backend = getConversationChatBackendService(host.plugin.agentServiceRegistry as never, conversation);
        if (!backend) {
          throw new Error(`Backend ${conversation.backend ?? 'opencode'} does not support chat`);
        }
        return (backend as unknown as {
          sendMessage(args: unknown): unknown;
        }).sendMessage({
          sessionId: (options as { sessionId?: string })?.sessionId ?? '',
          content,
          images: (options as { images?: unknown }).images,
          options: { ...(options as object) },
          ...((options as { diagnosticRunToken?: unknown }).diagnosticRunToken
            ? { diagnosticRunToken: (options as { diagnosticRunToken: unknown }).diagnosticRunToken }
            : {}),
        });
      },
      detachStream: (sessionId: string) => {
        if (sessionId) {
          const conversation = host.currentConversation;
          const backend = conversation
            ? getConversationChatBackendService(host.plugin.agentServiceRegistry as never, conversation)
            : undefined;
          const conversationBackend = conversation?.backend ?? 'opencode';
          if (backend && conversationBackend !== 'opencode') {
            (backend as unknown as { cancelStream(id: string): void }).cancelStream(sessionId);
          } else {
            (host.plugin.openCodeService as unknown as { detachStream(id: string): void }).detachStream(sessionId);
          }
        }
      },
      syncLatestUserMessageFromServer: (conversation: Conversation, optimisticMessageId: unknown, tabId: TabId | null) =>
        host.syncLatestUserMessageFromServer(conversation, optimisticMessageId, tabId),
      beginTabContextUsageStream: (tabId: TabId | null) => {
        const conversation = host.getConversationForTab(tabId as TabId);
        if (conversation && (conversation.backend ?? 'opencode') !== 'opencode') {
          return;
        }
        host.activeTabContextUsageCoordinator.beginTabContextUsageStream(tabId as TabId);
      },
      completeTabContextUsageStream: (tabId: TabId | null) => {
        host.activeTabContextUsageCoordinator.completeTabContextUsageStream(tabId as TabId);
      },
      applyUsageChunkToTab: (tabId: TabId | null, chunk: unknown) => {
        host.activeTabContextUsageCoordinator.applyUsageChunkToTab(tabId as TabId, chunk as never);
      },
      applyContextUsageSnapshotToTab: (tabId: TabId | null, snapshot: unknown) => {
        host.activeTabContextUsageCoordinator.applyContextUsageSnapshotToTab(tabId as TabId, snapshot as never);
      },
      showPermissionDialog: (request: unknown, tabId: TabId | null) => host.showPermissionDialog(request, tabId),
      showQuestionDialog: async (request: unknown, tabId: TabId | null) => {
        await host.showQuestionDialog(request, tabId);
      },
      convertToStreamingChunk: (chunk: unknown) => host.convertToStreamingChunk(chunk),
      getFriendlyStreamErrorMessage: (rawMessage: unknown) =>
        host.conversationNoticeCoordinator.getFriendlyStreamErrorMessage(rawMessage as never),
      // Synchronously invoked during SendPipelineRuntime construction — read the surface-built
      // adapter (not host.X, which is unset until compose() returns).
      createSendPipelineShellPort: () => surface.assistantShellViewHostAdapter.createSendPipelineShellPort(),
      createConversationWriteTicket: (conversationId: string) => host.createConversationWriteTicket(conversationId),
      commitConversationWrite: (conversation: Conversation, ticket: unknown, reason: string, write: () => void | Promise<void>) =>
        host.commitConversationWrite(conversation, ticket, reason, write),
      summarizeContentBlocksForDebug: (blocks: unknown) =>
        summarizeContentBlocksForDebug(blocks as SendPipelineDebugContentBlock[] | undefined),
      summarizeCoreStreamChunkForDebug: (chunk: unknown) => summarizeCoreStreamChunkForDebug(chunk as never),
      summarizeChatMessageForDebug: (message: unknown) => summarizeChatMessageForDebug(message as never),
      ...createDebugLogCallbacks(),
    } as never;
  }
}
