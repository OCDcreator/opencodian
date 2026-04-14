/**
 * OpenCodian View
 *
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { Editor, EventRef, WorkspaceLeaf } from 'obsidian';
import { addIcon, Component, ItemView, MarkdownView, normalizePath, Notice, Scope, setIcon } from 'obsidian';

import type { ModelCatalogBundle } from '../../core/config';
import {
  formatModelReference,
  type ResolvedModelSelection,
  resolveModelSelection,
  resolvePreferredAvailableModel,
} from '../../core/config/modelConfig';
import {
  type SessionActivityStatus,
} from '../../core/opencode';
import {
  getThemePresetDefinition,
  THEME_PRESET_CSS_VARIABLE_NAMES,
  THEME_STYLE_CONTAINER_CLASSES,
} from '../../core/theme';
import {
  type ChatMessage,
  type ContentBlock,
  type Conversation,
  createEmptyTabContextState,
  getDefaultPersistedTabState,
  type PromptContextItem,
  type QuestionRequest,
  type QuestionResolution,
  type SessionDiffEntry,
  type SessionTodo,
  type ToolCallInfo,
  VIEW_TYPE_OPENCODIAN,
} from '../../core/types';
import type { EffortLevel, PermissionMode, ThinkingBudget } from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  createLogger,
  getVaultBasePath,
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
} from '../../shared';
import { chooseForkTarget } from '../../shared/modals';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { MarkdownRenderService } from '../../utils/markdown';
import {
  StreamController,
  ThinkingBlockRenderer,
  ToolCallRenderer,
} from '../../utils/streaming';
import {
  buildChatAppearanceCustomCss,
  getChatAppearanceCssVariables,
  getInputPanelGlassRefractionCssVariables,
} from './chatAppearance';
import {
  type FocusContextPreview,
} from './composerContext';
import { cloneMessagesBeforeForkTarget } from './forkMessages';
import { GlassOctahedronDemoController } from './glassOctahedronDemo';
import { LiquidDiamondDemoController } from './liquidDiamondDemo';
import { buildMessageRenderGroups, mergeAssistantMessagesForRender } from './renderGroups';
import { type CollapsibleState, setupCollapsible } from './rendering/collapsible';
import {
  AssistantNoticeCardRenderer,
  type AssistantNoticeCardRendererHost,
} from './runtime/AssistantNoticeCardRenderer';
import {
  buildStreamErrorNotice,
} from './runtime/AssistantNoticeRenderer';
import {
  renderAssistantPlainTextFallbackContent,
} from './runtime/AssistantPlainTextFallbackRenderer';
import {
  AssistantShellViewHostAdapter,
  type AssistantShellViewHostAdapterHost,
} from './runtime/AssistantShellViewHostAdapter';
import {
  renderAssistantStructuredContent,
} from './runtime/AssistantStructuredContentRenderer';
import {
  BackgroundTaskIndicatorCoordinator,
  type BackgroundTaskIndicatorCoordinatorHost,
} from './runtime/BackgroundTaskIndicatorCoordinator';
import {
  BackgroundTaskInlinePanelRenderer,
  type BackgroundTaskInlinePanelRendererHost,
} from './runtime/BackgroundTaskInlinePanelRenderer';
import {
  BackgroundTaskStreamTriggerCoordinator,
  type BackgroundTaskStreamTriggerCoordinatorHost,
} from './runtime/BackgroundTaskStreamTriggerCoordinator';
import {
  ConversationHydrationOutcomeBridge,
} from './runtime/ConversationHydrationOutcomeBridge';
import {
  ConversationHydrationRenderBridge,
} from './runtime/ConversationHydrationRenderBridge';
import {
  ConversationLoadRuntimeBridge,
} from './runtime/ConversationLoadRuntimeBridge';
import {
  ConversationTransitionBridge,
} from './runtime/ConversationTransitionBridge';
import {
  PermissionInlineCardRenderer,
} from './runtime/PermissionInlineCardRenderer';
import {
  buildQuestionResolutionCardRenderPlan,
} from './runtime/QuestionResolutionCardRenderer';
import {
  type SendPipelineDebugContentBlock,
  type SendPipelineDebugPort,
  type SendPipelineHost,
  type SendPipelinePersistencePort,
  SendPipelineRuntime,
  type SendPipelineShellPort,
  type SendPipelineTransportPort,
  type SendPipelineViewPort,
} from './runtime/SendPipelineRuntime';
import {
  StreamingInlineCardRenderer,
  type StreamingInlineCardRendererHost,
} from './runtime/StreamingInlineCardRenderer';
import {
  TabConversationActivationBridge,
} from './runtime/TabConversationActivationBridge';
import {
  TabConversationStateBridge,
} from './runtime/TabConversationStateBridge';
import {
  TabRuntimeStateBridge,
} from './runtime/TabRuntimeStateBridge';
import {
  TabViewActivationBridge,
} from './runtime/TabViewActivationBridge';
import {
  UserMessageFooterRenderer,
  type UserMessageFooterRendererHost,
} from './runtime/UserMessageFooterRenderer';
import {
  ActiveTabContextUsageCoordinator,
  type ActiveTabContextUsageCoordinatorHost,
} from './services/ActiveTabContextUsageCoordinator';
import {
  type BackgroundTaskCompletionInfo,
  BackgroundTaskCompletionNoticeService,
  type BackgroundTaskCompletionNoticeServiceHost,
} from './services/BackgroundTaskCompletionNoticeService';
import {
  BackgroundTaskLiveSignalCoordinator,
} from './services/BackgroundTaskLiveSignalCoordinator';
import {
  type BackgroundTaskLiveSignalCoordinatorHostProviderHost,
  createBackgroundTaskLiveSignalCoordinatorViewHostFactoryHost,
} from './services/BackgroundTaskLiveSignalCoordinatorHostProvider';
import {
  createBackgroundTaskLiveSignalCoordinatorHost,
} from './services/BackgroundTaskLiveSignalCoordinatorViewHostFactory';
import {
  BackgroundTaskNoticeStateService,
  type BackgroundTaskNoticeStateServiceHost,
} from './services/BackgroundTaskNoticeStateService';
import {
  type BackgroundTaskLaunchInfo,
  type BackgroundTaskSegment,
  BackgroundTaskTimelineService,
  type BackgroundTaskTimelineServiceHost,
} from './services/BackgroundTaskTimelineService';
import {
  ChatHeaderPresenter,
  type ChatHeaderPresenterHost,
  type ChatServerAvailability,
} from './services/ChatHeaderPresenter';
import {
  ConversationHistoryActionsCoordinator,
  type ConversationHistoryActionsHost,
} from './services/ConversationHistoryActionsCoordinator';
import {
  ChatSelectionControlsCoordinator,
  type ChatSelectionControlsCoordinatorHost,
} from './services/ChatSelectionControlsCoordinator';
import {
  ComposerContextViewFacade,
  type ComposerContextViewHost,
  type FocusContextPreviewWritebackHost,
  type FocusContextRuntimeViewHost,
} from './services/ComposerContextViewFacade';
import {
  ComposerInputShellCoordinator,
  type ComposerInputShellCoordinatorHost,
} from './services/ComposerInputShellCoordinator';
import { ContextUsageService } from './services/ContextUsageService';
import {
  type ConversationHydrationRuntimeHostProviderHost,
  createConversationHydrationRuntimeViewHostFactoryHost,
} from './services/ConversationHydrationRuntimeHostProvider';
import {
  createConversationHydrationRuntimeViewHosts,
} from './services/ConversationHydrationRuntimeViewHostFactory';
import {
  type ConversationAssistantTailRenderPort,
  type ConversationRenderHost,
  ConversationRenderService,
  getIncrementalRenderedMessageUpdate as getConversationIncrementalRenderedMessageUpdate,
  type IncrementalRenderedMessageUpdate,
} from './services/ConversationRenderService';
import {
  ConversationRestoreBootstrapCoordinator,
  type ConversationRestoreBootstrapHost,
} from './services/ConversationRestoreBootstrapCoordinator';
import {
  ConversationSessionSignalRuntime,
  type ConversationSessionSignalRuntimeHost,
} from './services/ConversationSessionSignalRuntime';
import {
  ConversationSyncBridge,
} from './services/ConversationSyncBridge';
import {
  type ConversationSyncBridgePortProviderHost,
  type ConversationSyncBridgePorts,
  createConversationSyncBridgePorts,
} from './services/ConversationSyncBridgePortProvider';
import {
  createConversationSyncServices,
} from './services/ConversationSyncHostAdapter';
import {
  type ConversationSyncLoadRuntimeHostProviderHost,
  createConversationSyncLoadRuntimeViewHostFactoryHost,
} from './services/ConversationSyncLoadRuntimeHostProvider';
import {
  createConversationSyncLoadRuntimeViewHosts,
} from './services/ConversationSyncLoadRuntimeViewHostFactory';
import {
  ConversationSyncOrchestrationService,
} from './services/ConversationSyncOrchestrationService';
import {
  ConversationSyncRuntimeCoordinator,
} from './services/ConversationSyncRuntimeCoordinator';
import {
  ConversationTabLifecycleRecoveryCoordinator,
  type ConversationTabLifecycleRecoveryHost,
} from './services/ConversationTabLifecycleRecoveryCoordinator';
import {
  ConversationTabOpenCoordinator,
  type ConversationTabOpenHost,
} from './services/ConversationTabOpenCoordinator';
import {
  type ConversationViewStateHost,
  ConversationViewStateService,
} from './services/ConversationViewStateService';
import {
  InputPanelAppearanceCoordinator,
  type InputPanelAppearanceCoordinatorHost,
} from './services/InputPanelAppearanceCoordinator';
import {
  type MessageFinalizationHost,
  MessageFinalizationService,
} from './services/MessageFinalizationService';
import {
  type MessageSendPreparationHost,
  MessageSendPreparationService,
} from './services/MessageSendPreparationService';
import {
  PersistentAssistantNoticeService,
  type PersistentAssistantNoticeServiceHost,
} from './services/PersistentAssistantNoticeService';
import { QuestionDockSlotCoordinator } from './services/QuestionDockSlotCoordinator';
import {
  createQuestionPostResolutionRuntimeHostAdapter,
} from './services/QuestionPostResolutionRuntimeHostAdapter';
import {
  createQuestionRuntimeServices,
  type QuestionRuntimeServices,
} from './services/QuestionRuntimeHostAdapter';
import {
  createQuestionRuntimeViewHost,
  type QuestionRuntimeViewHostFactoryHost,
} from './services/QuestionRuntimeViewHostFactory';
import {
  createQuestionTodoBackgroundTaskRuntimeServiceBundle,
  type QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
} from './services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  isElementNearBottom,
} from './services/ScrollManager';
import {
  createSessionTodoCoordinator,
  type SessionTodoCoordinator,
  type SessionTodoViewHost,
} from './services/SessionTodoHostAdapter';
import {
  createTabActivationConversationSyncRuntimePort,
  type TabActivationConversationSyncPortProviderHost,
  type TabActivationConversationSyncRuntimePort,
} from './services/TabActivationConversationSyncPortProvider';
import {
  createTabActivationRuntimeViewHostFactoryHost,
  type TabActivationRuntimeHostProviderHost,
} from './services/TabActivationRuntimeHostProvider';
import {
  createTabActivationRuntimeViewHosts,
} from './services/TabActivationRuntimeViewHostFactory';
import {
  createTabConversationSyncFingerprintRuntimePort,
  type TabConversationSyncFingerprintPortProviderHost,
  type TabConversationSyncFingerprintRuntimePort,
} from './services/TabConversationSyncFingerprintPortProvider';
import {
  TabMessagesPaneCoordinator,
  type TabMessagesPaneCoordinatorHost,
  type TabMessagesPaneState,
} from './services/TabMessagesPaneCoordinator';
import { TitleGenerationService } from './services/TitleGenerationService';
import { TabBar, type TabBarLayoutMode, type TabId, TabManager } from './tabs';
import { ContextDetailModal, type ContextRawMessageItem } from './ui/ContextDetailModal';
import { ContextRing } from './ui/ContextRing';
import { EffortSelector } from './ui/EffortSelector';
import type {
  ModelSelectorAvailableModelInfo,
  ModelSelectorKnownModelInfo,
  ModelSelectorProvider,
  ModelSelectorSelection,
} from './ui/modelSelector/types';
import { NavigationSidebar } from './ui/NavigationSidebar';
import { prepareUserMessageMarkdownForDisplay } from './userMessageDisplay';

const logger = createLogger('OpenCodianView');

const ASSISTANT_DEBUG_STAGE_ALLOWLIST = new Set([
  'assistant-message-finalization-complete',
  'conversation-sync-lock-cleared',
  'message-metadata-received',
  'message-start-received',
  'message-stop-received',
  'patch-trailing-assistant-render-complete',
  'patch-trailing-assistant-render-skipped',
  'pending-indicator-cleared',
  'pending-indicator-shown',
  'post-sync-full-rerender-complete',
  'post-sync-tail-render-attempt',
  'rerender-conversation-messages-complete',
  'rerender-conversation-messages-start',
  'server-sync-complete',
  'server-sync-failed',
  'server-sync-requested',
  'stream-controller-started',
  'stream-finally-enter',
  'stream-loop-break-not-streaming',
  'stream-loop-error',
  'stream-progress',
  'stream-visibility-changed',
  'streaming-shell-finalized',
  'trace-armed',
  'turn-diff-processed',
]);

const OPENCODIAN_APP_ICON = 'opencodian-app-icon';

interface OmoBackgroundTaskLogState {
  anchorKey: string;
  loggedPendingTaskIds: Set<string>;
  completionLogged: boolean;
}

interface ConversationRevertState {
  messageID: string;
  partID?: string;
}

type OpenCodeSessionMessages = Awaited<ReturnType<OpenCodianPlugin['openCodeService']['getSessionMessages']>>;

interface LatestServerUserMessageHydration {
  hydratedMessage: ChatMessage;
  rawServerUserText: string;
}

interface ConversationServerSyncSnapshot {
  serverMessages: OpenCodeSessionMessages;
  convertedServerMessages: ChatMessage[];
  revertState: ConversationRevertState | null;
}

interface ConversationServerSyncMergeResult {
  merged: ChatMessage[];
  preservedClientOnlyMessages: ChatMessage[];
  fingerprint: string;
  changed: boolean;
}

interface HydratedUserMessageMismatchContext {
  sessionId: string;
  optimisticMessageId: string;
  rawServerUserText: string;
}

interface HydratedOptimisticUserMessageUpdate {
  conversation: Conversation;
  optimisticIndex: number;
  optimisticMessage: ChatMessage;
  mergedHydratedMessage: ChatMessage;
  tabId: TabId | null;
}

interface ConversationServerSyncContext {
  conversation: Conversation;
  tabId: TabId | null;
  reason: string;
  verbose: boolean;
}

interface DeferredQuestionRequest {
  promise: Promise<void>;
  resolve: () => void;
}

type QuestionTodoBackgroundTaskRuntimeCoordinators = ReturnType<
  typeof createQuestionTodoBackgroundTaskRuntimeServiceBundle
>;

interface OpenCodianViewSurfaceRuntimeWiring {
  titleGenerationService: TitleGenerationService;
  tabMessagesPaneCoordinator: TabMessagesPaneCoordinator<TabRuntimeState>;
  chatHeaderPresenter: ChatHeaderPresenter;
  conversationHistoryActionsCoordinator: ConversationHistoryActionsCoordinator;
  chatSelectionControlsCoordinator: ChatSelectionControlsCoordinator;
  composerInputShellCoordinator: ComposerInputShellCoordinator;
  inputPanelAppearanceCoordinator: InputPanelAppearanceCoordinator;
  composerContextViewFacade: ComposerContextViewFacade;
  tabConversationSyncFingerprintRuntimePort: TabConversationSyncFingerprintRuntimePort;
  persistentAssistantNoticeService: PersistentAssistantNoticeService;
  sessionTodoCoordinator: SessionTodoCoordinator;
  questionDockSlotCoordinator: QuestionDockSlotCoordinator;
  assistantShellViewHostAdapter: AssistantShellViewHostAdapter;
}

interface OpenCodianViewBackgroundTaskRuntimeWiring {
  visibleConversationPostSyncCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['visibleConversationPostSyncCoordinator'];
  backgroundConversationPostSyncHandoffCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['backgroundConversationPostSyncHandoffCoordinator'];
  questionTodoActivationRefreshCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['questionTodoActivationRefreshCoordinator'];
  backgroundTaskActivationIndicatorCoordinator:
    QuestionTodoBackgroundTaskRuntimeCoordinators['backgroundTaskActivationIndicatorCoordinator'];
  activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  backgroundTaskNoticeStateService: BackgroundTaskNoticeStateService;
  backgroundTaskTimelineService: BackgroundTaskTimelineService;
  backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
}

interface OpenCodianViewConversationRuntimeWiring {
  conversationHydrationRenderBridge: ConversationHydrationRenderBridge;
  conversationTransitionBridge: ConversationTransitionBridge;
  tabConversationStateBridge: TabConversationStateBridge;
  tabViewActivationBridge: TabViewActivationBridge;
  conversationHydrationOutcomeBridge: ConversationHydrationOutcomeBridge;
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
  conversationViewStateService: ConversationViewStateService;
  conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  conversationTabLifecycleRecoveryCoordinator: ConversationTabLifecycleRecoveryCoordinator;
  conversationRestoreBootstrapCoordinator: ConversationRestoreBootstrapCoordinator;
}

interface OpenCodianViewInteractionRuntimeWiring {
  conversationRenderService: ConversationRenderService;
  messageSendPreparationService: MessageSendPreparationService;
  messageFinalizationService: MessageFinalizationService;
  assistantNoticeCardRenderer: AssistantNoticeCardRenderer;
  userMessageFooterRenderer: UserMessageFooterRenderer;
  streamingInlineCardRenderer: StreamingInlineCardRenderer;
  permissionInlineCardRenderer: PermissionInlineCardRenderer;
  questionRuntimeServices: QuestionRuntimeServices;
  sendPipelineRuntime: SendPipelineRuntime;
}

interface TabRuntimeState {
  isStreaming: boolean;
  streamController: StreamController | null;
  streamingMessageEl: HTMLElement | null;
  streamingContentEl: HTMLElement | null;
  currentTurnBodyEl: HTMLElement | null;
  autoScrollEnabled: boolean;
  isNearBottom: boolean;
  programmaticScrollGuardUntil: number;
  isConversationSyncInFlight: boolean;
  lastConversationSyncFingerprint: string | null;
  lastInterruptedSyncPreservationLogFingerprint: string | null;
  sessionTodoSessionId: string | null;
  sessionTodos: SessionTodo[];
  sessionTodoFingerprint: string | null;
  sessionTodoLastChangedAt: number | null;
  sessionTodoSuppressedFingerprint: string | null;
  sessionTodoStaleNoticeFingerprint: string | null;
  todoRequestId: number;
  sessionStatusSessionId: string | null;
  sessionStatus: SessionActivityStatus | null;
  sessionStatusLastChangedAt: number | null;
  statusRequestId: number;
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskInlineEls: Map<string, HTMLElement>;
  turnBodyByAnchorKey: Map<string, HTMLElement>;
  backgroundTaskStartedAt: number | null;
  backgroundTaskActiveAnchorKey: string | null;
  backgroundTaskModeTag: string | null;
  backgroundTaskLaunches: Map<string, BackgroundTaskLaunchInfo>;
  backgroundTaskCompletedTasks: Map<string, BackgroundTaskCompletionInfo>;
  backgroundTaskWaitingForFollowUp: boolean;
  backgroundTaskAwaitingAuthoritativeSync: boolean;
  backgroundTaskLastAuthoritativeSyncAt: number | null;
  backgroundTaskStaleNoticeFingerprint: string | null;
  backgroundTaskSuppressedFingerprint: string | null;
  isHydratingConversation: boolean;
  pendingLayoutMutations: number;
  pendingSignalConversationSyncReasons: Set<string>;
  signalConversationSyncTimerId: number | null;
  focusContextPreview: FocusContextPreview | null;
  draftContextItems: PromptContextItem[];
  pendingEditedFiles: Set<string>;
  questionInlineCardEl: HTMLElement | null;
  pendingQuestionResolution: QuestionResolution | null;
  pendingQuestionRequests: QuestionRequest[];
  resolvedQuestionRequestIds: Set<string>;
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Map<string, DeferredQuestionRequest>;
}

type TabPaneState = TabMessagesPaneState<TabRuntimeState>;

/** Clipboard icon SVG for copy button */
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const NEW_TAB_ICON = `<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="41.667"/><path d="M33.333 50h33.334"/><path d="M50 33.333v33.334"/></g>`;
const CURRENT_TAB_NEW_CONVERSATION_ICON = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="scale(4.166667)"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/></g>`;

addIcon('opencodian-circle-plus', NEW_TAB_ICON);
addIcon('opencodian-message-square-plus', CURRENT_TAB_NEW_CONVERSATION_ICON);

export class OpenCodianView extends ItemView {
  private static tooltipLabelId = 0;
  private plugin: OpenCodianPlugin;
  private chatContainerEl: HTMLElement | null = null;
  private messagesShellEl: HTMLElement | null = null;
  private themeBackgroundImageEl: HTMLDivElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private glassOctahedronDemoController: GlassOctahedronDemoController | null = null;
  private liquidDiamondDemoController: LiquidDiamondDemoController | null = null;
  private liquidDiamondWebGlDemoController: LiquidDiamondDemoController | null = null;
  private currentConversation: Conversation | null = null;
  private currentConversationRevertState: ConversationRevertState | null = null;
  private markdownService: MarkdownRenderService | null = null;
  private messageComponent: Component;

  // Event refs for cleanup
  private eventRefs: EventRef[] = [];

  private headerTabBarSlotEl: HTMLElement | null = null;
  private belowHeaderTabBarSlotEl: HTMLElement | null = null;
  private outerVerticalTabBarHostEl: HTMLElement | null = null;
  private outerVerticalTabBarSlotEl: HTMLElement | null = null;
  private tabBarMountEl: HTMLElement | null = null;
  private tabBar: TabBar | null = null;
  private tabManager: TabManager | null = null;
  private tabMessagesPaneCoordinator: TabMessagesPaneCoordinator<TabRuntimeState>;
  private chatHeaderPresenter: ChatHeaderPresenter;
  private conversationHistoryActionsCoordinator: ConversationHistoryActionsCoordinator;
  private chatSelectionControlsCoordinator: ChatSelectionControlsCoordinator;
  private composerInputShellCoordinator: ComposerInputShellCoordinator;
  private inputPanelAppearanceCoordinator: InputPanelAppearanceCoordinator;

  // Model catalog state
  private availableModels: ModelSelectorAvailableModelInfo[] = [];
  private availableProviders: ModelSelectorProvider[] = [];
  private modelCatalogBundle: ModelCatalogBundle | null = null;
  private hasLoadedModelCatalog = false;

  // Navigation sidebar
  private navigationSidebar: NavigationSidebar | null = null;

  // Effort selector
  private effortSelector: EffortSelector | null = null;
  private currentEffortLevel: EffortLevel;
  private currentThinkingBudget: ThinkingBudget;
  private effortContainerEl: HTMLElement | null = null;
  private contextRing: ContextRing | null = null;
  private contextRingContainerEl: HTMLElement | null = null;

  private chatSurfaceSyncFrameId: number | null = null;
  private chatSurfaceSyncTimeoutId: number | null = null;
  private scrollToBottomFrameId: number | null = null;
  private chatAppearanceStyleEl: HTMLStyleElement | null = null;
  private themeBackgroundRequestId = 0;
  private titleGenerationService: TitleGenerationService;
  private persistentAssistantNoticeService: PersistentAssistantNoticeService;
  private sessionTodoCoordinator: SessionTodoCoordinator;
  private questionDockSlotCoordinator: QuestionDockSlotCoordinator;
  private activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  private backgroundTaskTimelineService: BackgroundTaskTimelineService;
  private backgroundTaskCompletionNoticeService: BackgroundTaskCompletionNoticeService;
  private backgroundTaskNoticeStateService: BackgroundTaskNoticeStateService;
  private backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
  private conversationHydrationOutcomeBridge: ConversationHydrationOutcomeBridge;
  private conversationHydrationRenderBridge: ConversationHydrationRenderBridge;
  private conversationTransitionBridge: ConversationTransitionBridge;
  private tabConversationStateBridge: TabConversationStateBridge;
  private tabConversationActivationBridge: TabConversationActivationBridge;
  private tabViewActivationBridge: TabViewActivationBridge;
  private tabRuntimeStateBridge: TabRuntimeStateBridge;
  private conversationSyncOrchestrationService: ConversationSyncOrchestrationService;
  private conversationSyncRuntimeCoordinator: ConversationSyncRuntimeCoordinator;
  private conversationSyncBridge: ConversationSyncBridge;
  private conversationSyncBridgePorts!: ConversationSyncBridgePorts;
  private tabConversationSyncFingerprintRuntimePort!:
    TabConversationSyncFingerprintRuntimePort;
  private tabActivationConversationSyncRuntimePort!: TabActivationConversationSyncRuntimePort;
  private conversationSessionSignalRuntime: ConversationSessionSignalRuntime;
  private conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  private conversationTabLifecycleRecoveryCoordinator: ConversationTabLifecycleRecoveryCoordinator;
  private conversationRestoreBootstrapCoordinator: ConversationRestoreBootstrapCoordinator;
  private conversationViewStateService: ConversationViewStateService;
  private conversationRenderService: ConversationRenderService;
  private messageSendPreparationService: MessageSendPreparationService;
  private messageFinalizationService: MessageFinalizationService;
  private assistantNoticeCardRenderer: AssistantNoticeCardRenderer;
  private userMessageFooterRenderer: UserMessageFooterRenderer;
  private assistantShellViewHostAdapter: AssistantShellViewHostAdapter;
  private backgroundTaskInlinePanelRenderer: BackgroundTaskInlinePanelRenderer;
  private backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
  private backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
  private streamingInlineCardRenderer: StreamingInlineCardRenderer;
  private permissionInlineCardRenderer: PermissionInlineCardRenderer;
  private questionRuntimeServices: QuestionRuntimeServices;
  private sendPipelineRuntime: SendPipelineRuntime;
  private composerContextViewFacade: ComposerContextViewFacade;
  private omoBackgroundTaskLogStates = new Map<string, OmoBackgroundTaskLogState>();

  private appSettings(): { open: () => void; openTabById: (id: string) => void } {
    return (this.app as typeof this.app & {
      setting: { open: () => void; openTabById: (id: string) => void };
    }).setting;
  }

  private get questionDockCoordinator(): QuestionRuntimeServices['dockCoordinator'] {
    return this.questionRuntimeServices.dockCoordinator;
  }

  private createChatHeaderPresenterHost(): ChatHeaderPresenterHost {
    return {
      setTooltipLabel: (element, label, position) => {
        this.setTooltipLabel(element, label, position);
      },
      registerCssChangeListener: (listener) => {
        this.registerEvent(this.app.workspace.on('css-change', listener));
      },
      resolveAssetUrl: (relativePath) => this.resolvePluginAssetUrl(relativePath),
      scheduleChatSurfaceColorSync: () => {
        this.scheduleChatSurfaceColorSync();
      },
      scheduleComposerLayoutSync: () => {
        this.scheduleComposerLayoutSync();
      },
      resolveServerAvailability: () => this.getServerAvailability(),
      isLocalServerMode: () => this.plugin.settings.server.mode === 'local',
      refreshContextUsageIndicator: () => {
        this.refreshContextUsageIndicator();
      },
      openServerSettings: () => {
        this.openPluginSettingsAtServerSection();
      },
      createConversationInNewTab: () => this.createNewConversation(),
      createConversationInCurrentTab: () => this.createNewConversationInCurrentTab(),
      showConversationHistory: (event) => {
        this.conversationHistoryActionsCoordinator.show(event);
      },
      openSettings: () => {
        this.openPluginSettingsPreservingScroll();
      },
    };
  }

  private createConversationHistoryActionsHost(
    titleGenerationService: TitleGenerationService,
  ): ConversationHistoryActionsHost {
    return {
      getConversations: () => this.plugin.getConversations(),
      getCurrentConversation: () => this.currentConversation,
      isActiveTabStreaming: () => this.isActiveTabStreaming(),
      loadConversation: (conversationId) => this.loadConversation(conversationId),
      getConversationById: (conversationId) =>
        this.plugin.getConversationById(conversationId, {
          preferCache: true,
        }),
      cancelConversationTitleGeneration: (conversationId) => {
        titleGenerationService.cancelConversation(conversationId);
      },
      updateConversationTitle: (conversationId, title) =>
        this.updateConversationTitleState(conversationId, {
          title,
          titleGenerationStatus: undefined,
        }),
      deleteConversationsAndCleanupTabs: (conversationIds) =>
        this.deleteConversationsAndCleanupTabs(conversationIds),
      deleteAllConversationsAndReset: (conversationIds) =>
        this.conversationTabLifecycleRecoveryCoordinator.deleteAllConversationsAndReset(
          conversationIds,
        ),
      showNotice: (message) => {
        new Notice(message);
      },
    };
  }

  private createComposerInputShellCoordinatorHost(): ComposerInputShellCoordinatorHost {
    return {
      attachSessionTodo: (container) => {
        this.sessionTodoCoordinator.attach(container);
      },
      attachQuestionDock: (container) => {
        this.questionDockSlotCoordinator.attach(container);
      },
      setContextRowElement: (element) => {
        this.composerContextViewFacade.setContextRowElement(element);
      },
      setTooltipLabel: (element, label, position) => {
        this.setTooltipLabel(element, label, position);
      },
      getInputPlaceholder: () => this.getInputPlaceholder(),
      addChosenFileContextToActiveTab: () =>
        this.composerContextViewFacade.addChosenFileContextToActiveTab(),
      mountSelectionControls: (toolbar) => {
        this.chatSelectionControlsCoordinator.build(toolbar);
      },
      mountContextUsageIndicator: (container) => {
        this.contextRingContainerEl = container;
        this.contextRing = new ContextRing(container, () => {
          this.openContextUsageDetails();
        });
        this.refreshContextUsageIndicator();
      },
      mountEffortSelector: (container) => {
        this.effortContainerEl = container;
        this.effortSelector = new EffortSelector(container, {
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
      },
      isActiveTabStreaming: () => this.isActiveTabStreaming(),
      cancelStreaming: () => {
        this.cancelStreaming();
      },
      isTabForegroundBusy: () => this.isTabForegroundBusy(),
      showProcessingBlockedNotice: () => {
        new Notice(t('chat.tab.processingBlocked'));
      },
      submitMessage: (message) => this.sendMessage(message),
      setComposerStackHeight: (stackHeight) => {
        this.chatContainerEl?.style.setProperty('--opencodian-composer-stack-height', `${stackHeight}px`);
      },
      scheduleSettledScrollToBottomIfNeeded: () => {
        this.scheduleSettledScrollToBottomIfNeeded();
      },
    };
  }

  private createInputPanelAppearanceCoordinatorHost(): InputPanelAppearanceCoordinatorHost {
    return {
      getComposerShellEl: () => this.composerInputShellCoordinator.getComposerShellEl(),
      getInputWrapperEl: () => this.composerInputShellCoordinator.getInputWrapperEl(),
      getChatContainerEl: () => this.chatContainerEl,
      getMessagesShellEl: () => this.messagesShellEl,
      getMessagesContainerEl: () => this.messagesContainer,
      getInputPanelTheme: () => this.plugin.settings.inputPanelTheme,
      getInputActionButtonStyle: () => this.plugin.settings.chatAppearance.input.actionButtonStyle,
      getInputPanelGlassRefractionSvgFilterSettings: () =>
        this.plugin.settings.inputPanelGlassRefractionSvgFilter,
      getLiquidGlassAdapterSettings: (adapterId) => this.plugin.settings.inputPanelLiquidGlass[adapterId],
      isDebugLoggingEnabled: () => this.plugin.settings.enableDebugLogging,
      resolveAssetUrl: (relativePath) => this.resolvePluginAssetUrl(relativePath),
      getLogPreview: (text, maxLength) => this.getLogPreview(text, maxLength),
      stringifyLogPayload: (payload) => this.stringifyLogPayload(payload),
    };
  }

  private createChatSelectionControlsCoordinatorHost(): ChatSelectionControlsCoordinatorHost {
    return {
      registerEscapeHandler: (handler) => {
        this.scope?.register([], 'Escape', handler);
      },
      loadModelCatalog: () => this.loadAvailableModels(),
      getAvailableProviders: () => this.availableProviders,
      hasLoadedModelCatalog: () => this.hasLoadedModelCatalog,
      getCurrentSessionModel: () => this.getCurrentSessionModel(),
      getCurrentSessionModelResolution: () => this.getCurrentSessionModelResolution(),
      findKnownModelInfo: (selection) => this.findKnownModelInfo(selection),
      getModelUnavailableTitle: () => this.getModelUnavailableNoticeContent().message,
      resolveProviderIconUrl: (providerId) =>
        ProviderIconService.resolveIconUrl(
          this.app,
          providerId,
          this.plugin.settings.providerIconLibrary,
        ),
      switchModel: (provider, model) => {
        this.switchModel(provider, model);
      },
      updateEffortSelectorDisplay: () => {
        this.effortSelector?.updateDisplay();
      },
      getPermissionMode: () => this.plugin.settings.permissionMode,
      switchPermissionMode: (mode) => this.switchPermissionMode(mode),
    };
  }

  private createTabRuntimeState(): TabRuntimeState {
    return {
      isStreaming: false,
      streamController: null,
      streamingMessageEl: null,
      streamingContentEl: null,
      currentTurnBodyEl: null,
      autoScrollEnabled: true,
      isNearBottom: true,
      programmaticScrollGuardUntil: 0,
      isConversationSyncInFlight: false,
      lastConversationSyncFingerprint: null,
      lastInterruptedSyncPreservationLogFingerprint: null,
      sessionTodoSessionId: null,
      sessionTodos: [],
      sessionTodoFingerprint: null,
      sessionTodoLastChangedAt: null,
      sessionTodoSuppressedFingerprint: null,
      sessionTodoStaleNoticeFingerprint: null,
      todoRequestId: 0,
      sessionStatusSessionId: null,
      sessionStatus: null,
      sessionStatusLastChangedAt: null,
      statusRequestId: 0,
      backgroundTaskIndicatorEl: null,
      backgroundTaskInlineEls: new Map(),
      turnBodyByAnchorKey: new Map(),
      backgroundTaskStartedAt: null,
      backgroundTaskActiveAnchorKey: null,
      backgroundTaskModeTag: null,
      backgroundTaskLaunches: new Map(),
      backgroundTaskCompletedTasks: new Map(),
      backgroundTaskWaitingForFollowUp: false,
      backgroundTaskAwaitingAuthoritativeSync: false,
      backgroundTaskLastAuthoritativeSyncAt: null,
      backgroundTaskStaleNoticeFingerprint: null,
      backgroundTaskSuppressedFingerprint: null,
      isHydratingConversation: false,
      pendingLayoutMutations: 0,
      pendingSignalConversationSyncReasons: new Set(),
      signalConversationSyncTimerId: null,
      focusContextPreview: null,
      draftContextItems: [],
      pendingEditedFiles: new Set(),
      questionInlineCardEl: null,
      pendingQuestionResolution: null,
      pendingQuestionRequests: [],
      resolvedQuestionRequestIds: new Set(),
      questionDraftAnswers: new Map(),
      questionActiveGroupKeys: new Map(),
      questionActiveIndexes: new Map(),
      questionRequestWaiters: new Map(),
    };
  }

  private createTabMessagesPaneCoordinatorHost(): TabMessagesPaneCoordinatorHost<TabRuntimeState> {
    return {
      getMessagesShellEl: () => this.messagesShellEl,
      getMessagesContainer: () => this.messagesContainer,
      setMessagesContainer: (messagesEl) => {
        this.messagesContainer = messagesEl;
      },
      getActiveTabId: () => this.getActiveTabId(),
      createRuntimeState: () => this.createTabRuntimeState(),
      applyChatScrollModeToMessagesEl: (messagesEl) => {
        this.applyChatScrollModeToMessagesEl(messagesEl);
      },
      resetTurnState: () => {
        this.resetTurnState();
      },
      restoreTurnStateFromActivePane: () => {
        this.restoreTurnStateFromActivePane();
      },
      rebuildNavigationSidebar: () => {
        this.rebuildNavigationSidebar();
      },
      destroyNavigationSidebar: () => {
        this.navigationSidebar?.destroy();
        this.navigationSidebar = null;
      },
      updateNavigationSidebarVisibility: () => {
        this.navigationSidebar?.updateVisibility();
      },
      clearScheduledSignalConversationSync: (tabId) => {
        this.conversationSyncBridgePorts.getSignalScheduler().clearScheduledSignalConversationSync(
          tabId,
        );
      },
      shouldAutoScroll: (tabId) => this.shouldAutoScroll(tabId),
      scheduleSettledScrollToBottomIfNeeded: (shouldScroll, tabId) => {
        this.scheduleSettledScrollToBottomIfNeeded(shouldScroll, tabId);
      },
    };
  }

  private getTabPaneState(tabId: TabId | null): TabPaneState | null {
    return this.tabMessagesPaneCoordinator.getPaneState(tabId);
  }

  private getTabRuntimeState(tabId: TabId | null = this.getActiveTabId()): TabRuntimeState | null {
    return this.tabMessagesPaneCoordinator.getRuntimeState(tabId);
  }

  private ensureTabRuntimeState(tabId: TabId | null = this.getActiveTabId()): TabRuntimeState | null {
    return this.tabMessagesPaneCoordinator.ensureRuntimeState(tabId);
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
            this.scrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
          }
        },
      });
      paneState.runtime.streamController.setCallbacks({
        onToolCallStart: (toolCall) => {
          void this.backgroundTaskStreamTriggerCoordinator.handleToolCallStart(toolCall, tabId);
        },
        onToolCallEnd: (toolCall) => {
          void this.backgroundTaskStreamTriggerCoordinator.handleToolCallEnd(toolCall, tabId);
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

  private set backgroundTaskIndicatorEl(value: HTMLElement | null) {
    const runtime = this.ensureTabRuntimeState();
    if (runtime) {
      runtime.backgroundTaskIndicatorEl = value;
    }
  }

  private isComposerInteractionFocused(): boolean {
    const activeElement = document.activeElement;
    return Boolean(activeElement && this.inputContainer?.contains(activeElement));
  }

  private getSessionIdForTab(tabId: TabId | null = this.getActiveTabId()): string | null {
    if (!tabId) {
      return null;
    }

    if (tabId === this.getActiveTabId()) {
      return this.currentConversation?.openCodeSessionId ?? null;
    }

    const tab = this.tabManager?.getTab(tabId);
    if (!tab?.conversationId) {
      return this.getTabRuntimeState(tabId)?.sessionTodoSessionId ?? null;
    }

    const conversation = this.plugin.getConversations().find((item) => item.id === tab.conversationId);
    return conversation?.openCodeSessionId
      ?? this.getTabRuntimeState(tabId)?.sessionTodoSessionId
      ?? null;
  }

  private getConversationForTab(tabId: TabId | null = this.getActiveTabId()): Conversation | null {
    if (!tabId) {
      return null;
    }

    if (tabId === this.getActiveTabId()) {
      return this.currentConversation;
    }

    const tab = this.tabManager?.getTab(tabId);
    if (!tab?.conversationId) {
      return null;
    }

    return this.plugin.getConversations().find((item) => item.id === tab.conversationId) ?? null;
  }

  private renderSessionTodoDock(tabId: TabId | null = this.getActiveTabId()): void {
    this.sessionTodoCoordinator.render(tabId);
  }

  private beginConversationHydration(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.isHydratingConversation = true;
    runtime.pendingLayoutMutations = 0;
    this.backgroundTaskLiveSignalCoordinator.armAuthoritativeSyncGate(tabId);
    this.conversationSyncBridgePorts.getSignalScheduler().clearScheduledSignalConversationSync(tabId);
  }

  private endConversationHydration(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.isHydratingConversation = false;
    if (runtime.pendingLayoutMutations > 0) {
      runtime.pendingLayoutMutations = 0;
      this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
    }
  }

  private markBackgroundTaskAuthoritativeSync(
    tabId: TabId | null,
    reason: string,
  ): void {
    this.backgroundTaskLiveSignalCoordinator.markAuthoritativeSync(tabId, reason);
  }

  private isSuppressedBackgroundTaskSegment(
    segment: BackgroundTaskSegment,
    tabId: TabId | null = this.getActiveTabId(),
    conversation: Conversation | null = this.currentConversation,
  ): boolean {
    if (segment.pending.length === 0) {
      return false;
    }

    return this.backgroundTaskNoticeStateService.isPendingLaunchSetSuppressed(
      segment.pending,
      tabId,
      conversation,
    );
  }

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.messageComponent = new Component();
    this.currentEffortLevel = this.plugin.settings.effortLevel;
    this.currentThinkingBudget = this.plugin.settings.thinkingBudget;

    const surfaceRuntime = this.createSurfaceRuntimeWiring();
    this.titleGenerationService = surfaceRuntime.titleGenerationService;
    this.tabMessagesPaneCoordinator = surfaceRuntime.tabMessagesPaneCoordinator;
    this.chatHeaderPresenter = surfaceRuntime.chatHeaderPresenter;
    this.conversationHistoryActionsCoordinator =
      surfaceRuntime.conversationHistoryActionsCoordinator;
    this.chatSelectionControlsCoordinator = surfaceRuntime.chatSelectionControlsCoordinator;
    this.composerInputShellCoordinator = surfaceRuntime.composerInputShellCoordinator;
    this.inputPanelAppearanceCoordinator = surfaceRuntime.inputPanelAppearanceCoordinator;
    this.composerContextViewFacade = surfaceRuntime.composerContextViewFacade;
    this.tabConversationSyncFingerprintRuntimePort =
      surfaceRuntime.tabConversationSyncFingerprintRuntimePort;
    this.persistentAssistantNoticeService = surfaceRuntime.persistentAssistantNoticeService;
    this.sessionTodoCoordinator = surfaceRuntime.sessionTodoCoordinator;
    this.questionDockSlotCoordinator = surfaceRuntime.questionDockSlotCoordinator;
    this.assistantShellViewHostAdapter = surfaceRuntime.assistantShellViewHostAdapter;

    const backgroundTaskRuntime = this.createBackgroundTaskRuntimeWiring();
    this.activeTabContextUsageCoordinator =
      backgroundTaskRuntime.activeTabContextUsageCoordinator;
    this.backgroundTaskNoticeStateService =
      backgroundTaskRuntime.backgroundTaskNoticeStateService;
    this.backgroundTaskTimelineService = backgroundTaskRuntime.backgroundTaskTimelineService;
    this.backgroundTaskLiveSignalCoordinator =
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator;

    const conversationRuntime = this.createConversationRuntimeWiring(backgroundTaskRuntime);
    this.conversationHydrationRenderBridge =
      conversationRuntime.conversationHydrationRenderBridge;
    this.conversationTransitionBridge = conversationRuntime.conversationTransitionBridge;
    this.tabConversationStateBridge = conversationRuntime.tabConversationStateBridge;
    this.tabViewActivationBridge = conversationRuntime.tabViewActivationBridge;
    this.conversationHydrationOutcomeBridge =
      conversationRuntime.conversationHydrationOutcomeBridge;
    this.tabConversationActivationBridge =
      conversationRuntime.tabConversationActivationBridge;
    this.tabRuntimeStateBridge = conversationRuntime.tabRuntimeStateBridge;
    this.conversationSyncRuntimeCoordinator =
      conversationRuntime.conversationSyncRuntimeCoordinator;
    this.conversationSyncOrchestrationService =
      conversationRuntime.conversationSyncOrchestrationService;
    this.conversationSyncBridge = conversationRuntime.conversationSyncBridge;
    this.conversationSyncBridgePorts = conversationRuntime.conversationSyncBridgePorts;
    this.tabActivationConversationSyncRuntimePort =
      conversationRuntime.tabActivationConversationSyncRuntimePort;
    this.conversationSessionSignalRuntime =
      conversationRuntime.conversationSessionSignalRuntime;
    this.backgroundTaskCompletionNoticeService =
      conversationRuntime.backgroundTaskCompletionNoticeService;
    this.backgroundTaskInlinePanelRenderer =
      conversationRuntime.backgroundTaskInlinePanelRenderer;
    this.backgroundTaskIndicatorCoordinator =
      conversationRuntime.backgroundTaskIndicatorCoordinator;
    this.backgroundTaskStreamTriggerCoordinator =
      conversationRuntime.backgroundTaskStreamTriggerCoordinator;
    this.conversationViewStateService = conversationRuntime.conversationViewStateService;
    this.conversationTabOpenCoordinator = conversationRuntime.conversationTabOpenCoordinator;
    this.conversationTabLifecycleRecoveryCoordinator =
      conversationRuntime.conversationTabLifecycleRecoveryCoordinator;
    this.conversationRestoreBootstrapCoordinator =
      conversationRuntime.conversationRestoreBootstrapCoordinator;

    const interactionRuntime = this.createInteractionRuntimeWiring(
      conversationRuntime.conversationSyncBridgePorts,
    );
    this.conversationRenderService = interactionRuntime.conversationRenderService;
    this.messageSendPreparationService = interactionRuntime.messageSendPreparationService;
    this.messageFinalizationService = interactionRuntime.messageFinalizationService;
    this.assistantNoticeCardRenderer = interactionRuntime.assistantNoticeCardRenderer;
    this.userMessageFooterRenderer = interactionRuntime.userMessageFooterRenderer;
    this.streamingInlineCardRenderer = interactionRuntime.streamingInlineCardRenderer;
    this.permissionInlineCardRenderer = interactionRuntime.permissionInlineCardRenderer;
    this.questionRuntimeServices = interactionRuntime.questionRuntimeServices;
    this.sendPipelineRuntime = interactionRuntime.sendPipelineRuntime;
  }

  private createSurfaceRuntimeWiring(): OpenCodianViewSurfaceRuntimeWiring {
    const composerContextViewFacade = ComposerContextViewFacade.create({
      app: this.app,
      getServerMode: () => this.plugin.settings.server.mode,
      viewHost: this.createComposerContextViewHost(),
      focusRuntimeViewHost: this.createFocusContextRuntimeViewHost(),
      focusPreviewWritebackHost: this.createFocusContextPreviewWritebackHost(),
    });
    const titleGenerationService = new TitleGenerationService(this.plugin);
    const questionDockSlotCoordinator = new QuestionDockSlotCoordinator(
      {
        shouldUseAboveInputQuestionDock: () => this.plugin.settings.questionCardPosition === 'above_input',
      },
      () => {
        this.questionDockCoordinator.render();
      },
    );
    const conversationHistoryActionsCoordinator = new ConversationHistoryActionsCoordinator(
      this.createConversationHistoryActionsHost(titleGenerationService),
    );

    return {
      titleGenerationService,
      tabMessagesPaneCoordinator: new TabMessagesPaneCoordinator(
        this.createTabMessagesPaneCoordinatorHost(),
      ),
      chatHeaderPresenter: new ChatHeaderPresenter(this.createChatHeaderPresenterHost()),
      conversationHistoryActionsCoordinator,
      chatSelectionControlsCoordinator: new ChatSelectionControlsCoordinator(
        this.createChatSelectionControlsCoordinatorHost(),
      ),
      composerInputShellCoordinator: new ComposerInputShellCoordinator(
        this.createComposerInputShellCoordinatorHost(),
      ),
      inputPanelAppearanceCoordinator: new InputPanelAppearanceCoordinator(
        this.createInputPanelAppearanceCoordinatorHost(),
      ),
      composerContextViewFacade,
      tabConversationSyncFingerprintRuntimePort:
        createTabConversationSyncFingerprintRuntimePort(
          this.createTabConversationSyncFingerprintPortProviderHost(),
        ),
      persistentAssistantNoticeService: new PersistentAssistantNoticeService(
        this.createPersistentAssistantNoticeServiceHost(),
      ),
      sessionTodoCoordinator: createSessionTodoCoordinator(this.createSessionTodoViewHost()),
      questionDockSlotCoordinator,
      assistantShellViewHostAdapter: new AssistantShellViewHostAdapter(
        this.createAssistantShellViewHostAdapterHost(),
      ),
    };
  }

  private createBackgroundTaskRuntimeWiring(): OpenCodianViewBackgroundTaskRuntimeWiring {
    const questionTodoBackgroundTaskRuntime =
      createQuestionTodoBackgroundTaskRuntimeServiceBundle(
        this.createQuestionTodoBackgroundTaskRuntimeServiceBundleHost(),
      );
    const activeTabContextUsageCoordinator = new ActiveTabContextUsageCoordinator(
      this.createActiveTabContextUsageCoordinatorHost(),
    );
    const backgroundTaskNoticeStateService = new BackgroundTaskNoticeStateService(
      this.createBackgroundTaskNoticeStateServiceHost(),
    );
    const backgroundTaskTimelineService = new BackgroundTaskTimelineService(
      this.createBackgroundTaskTimelineServiceHost(),
    );
    const backgroundTaskLiveSignalCoordinator = new BackgroundTaskLiveSignalCoordinator(
      this.sessionTodoCoordinator,
      backgroundTaskTimelineService,
      backgroundTaskNoticeStateService,
      createBackgroundTaskLiveSignalCoordinatorHost(
        createBackgroundTaskLiveSignalCoordinatorViewHostFactoryHost(
          this.createBackgroundTaskLiveSignalCoordinatorHostProviderHost(),
        ),
      ),
    );

    return {
      ...questionTodoBackgroundTaskRuntime,
      activeTabContextUsageCoordinator,
      backgroundTaskNoticeStateService,
      backgroundTaskTimelineService,
      backgroundTaskLiveSignalCoordinator,
    };
  }

  private createConversationRuntimeWiring(
    backgroundTaskRuntime: OpenCodianViewBackgroundTaskRuntimeWiring,
  ): OpenCodianViewConversationRuntimeWiring {
    const conversationHydrationRuntimeViewHosts = createConversationHydrationRuntimeViewHosts(
      createConversationHydrationRuntimeViewHostFactoryHost(
        this.createConversationHydrationRuntimeHostProviderHost(),
      ),
    );
    const conversationHydrationRenderBridge = new ConversationHydrationRenderBridge(
      conversationHydrationRuntimeViewHosts.conversationHydrationRenderBridgeHost,
    );
    const conversationTransitionBridge = new ConversationTransitionBridge(
      conversationHydrationRuntimeViewHosts.conversationTransitionBridgeHost,
      conversationHydrationRenderBridge,
    );
    const tabActivationRuntimeBridgeHosts = createTabActivationRuntimeViewHosts(
      createTabActivationRuntimeViewHostFactoryHost(
        this.createTabActivationRuntimeHostProviderHost(),
      ),
    );
    const tabConversationStateBridge = new TabConversationStateBridge(
      tabActivationRuntimeBridgeHosts.tabConversationStateBridgeHost,
    );
    const tabViewActivationBridge = new TabViewActivationBridge(
      tabActivationRuntimeBridgeHosts.tabActivationBridgeHosts.tabViewActivationBridgeHost,
      this.composerContextViewFacade,
      backgroundTaskRuntime.questionTodoActivationRefreshCoordinator,
      backgroundTaskRuntime.backgroundTaskActivationIndicatorCoordinator,
      backgroundTaskRuntime.activeTabContextUsageCoordinator,
    );
    const conversationHydrationOutcomeBridge = new ConversationHydrationOutcomeBridge(
      conversationHydrationRuntimeViewHosts.conversationHydrationOutcomeBridgeHost,
      tabConversationStateBridge,
      tabViewActivationBridge,
    );
    const tabConversationActivationBridge = new TabConversationActivationBridge(
      tabActivationRuntimeBridgeHosts.tabActivationBridgeHosts.tabConversationActivationBridgeHost,
      tabConversationStateBridge,
      tabViewActivationBridge,
      backgroundTaskRuntime.questionTodoActivationRefreshCoordinator,
      backgroundTaskRuntime.backgroundTaskActivationIndicatorCoordinator,
      backgroundTaskRuntime.activeTabContextUsageCoordinator,
    );
    const tabRuntimeStateBridge = new TabRuntimeStateBridge(
      tabActivationRuntimeBridgeHosts.tabRuntimeStateBridgeHost,
    );
    const conversationSyncLoadRuntimeHosts = createConversationSyncLoadRuntimeViewHosts(
      createConversationSyncLoadRuntimeViewHostFactoryHost(
        this.createConversationSyncLoadRuntimeHostProviderHost(),
      ),
    );
    const conversationSyncServices = createConversationSyncServices(
      conversationSyncLoadRuntimeHosts.conversationSyncViewHost,
      backgroundTaskRuntime.visibleConversationPostSyncCoordinator,
      backgroundTaskRuntime.backgroundConversationPostSyncHandoffCoordinator,
    );
    const conversationSyncBridgePorts = createConversationSyncBridgePorts(
      this.createConversationSyncBridgePortProviderHost(),
    );
    const tabActivationConversationSyncRuntimePort =
      createTabActivationConversationSyncRuntimePort(
        this.createTabActivationConversationSyncPortProviderHost(),
      );
    const conversationSessionSignalRuntime = new ConversationSessionSignalRuntime(
      this.createConversationSessionSignalRuntimeHost(),
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
    );
    const backgroundTaskCompletionNoticeService = new BackgroundTaskCompletionNoticeService(
      this.createBackgroundTaskCompletionNoticeServiceHost(),
    );
    const backgroundTaskInlinePanelRenderer = new BackgroundTaskInlinePanelRenderer(
      backgroundTaskRuntime.backgroundTaskTimelineService,
      this.createBackgroundTaskInlinePanelRendererHost(),
    );
    const backgroundTaskIndicatorCoordinator = new BackgroundTaskIndicatorCoordinator(
      backgroundTaskInlinePanelRenderer,
      backgroundTaskRuntime.backgroundTaskTimelineService,
      backgroundTaskCompletionNoticeService,
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
      tabRuntimeStateBridge,
      this.createBackgroundTaskIndicatorCoordinatorHost(),
    );
    const backgroundTaskStreamTriggerCoordinator = new BackgroundTaskStreamTriggerCoordinator(
      backgroundTaskIndicatorCoordinator,
      backgroundTaskRuntime.backgroundTaskTimelineService,
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
      this.createBackgroundTaskStreamTriggerCoordinatorHost(),
    );
    const conversationLoadRuntimeBridge = new ConversationLoadRuntimeBridge(
      conversationSyncLoadRuntimeHosts.conversationLoadRuntimeBridgeHost,
    );
    const conversationViewStateService = new ConversationViewStateService(
      this.createConversationViewStateHost(),
      tabConversationActivationBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
    );
    const conversationTabOpenCoordinator = new ConversationTabOpenCoordinator(
      this.createConversationTabOpenHost(),
      {
        activateTab: (tabId) => conversationViewStateService.activateTab(tabId),
        openConversationInCurrentTab: (conversation) => {
          tabConversationActivationBridge.openConversation(conversation);
        },
      },
    );
    const conversationTabLifecycleRecoveryCoordinator =
      new ConversationTabLifecycleRecoveryCoordinator(
        this.createConversationTabLifecycleRecoveryHost(),
        {
          activateTab: (tabId) => conversationViewStateService.activateTab(tabId),
          createConversationInNewTab: () =>
            conversationTabOpenCoordinator.createConversationInNewTab(),
        },
      );
    const conversationRestoreBootstrapCoordinator = new ConversationRestoreBootstrapCoordinator(
      this.createConversationRestoreBootstrapHost(),
      {
        activateTab: (tabId) => conversationViewStateService.activateTab(tabId),
      },
    );

    return {
      conversationHydrationRenderBridge,
      conversationTransitionBridge,
      tabConversationStateBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      tabConversationActivationBridge,
      tabRuntimeStateBridge,
      conversationSyncRuntimeCoordinator: conversationSyncServices.runtimeCoordinator,
      conversationSyncOrchestrationService: conversationSyncServices.orchestrationService,
      conversationSyncBridge: conversationSyncServices.bridge,
      conversationSyncBridgePorts,
      tabActivationConversationSyncRuntimePort,
      conversationSessionSignalRuntime,
      backgroundTaskCompletionNoticeService,
      backgroundTaskInlinePanelRenderer,
      backgroundTaskIndicatorCoordinator,
      backgroundTaskStreamTriggerCoordinator,
      conversationViewStateService,
      conversationTabOpenCoordinator,
      conversationTabLifecycleRecoveryCoordinator,
      conversationRestoreBootstrapCoordinator,
    };
  }

  private createInteractionRuntimeWiring(
    conversationSyncBridgePorts: ConversationSyncBridgePorts,
  ): OpenCodianViewInteractionRuntimeWiring {
    const conversationRenderService = new ConversationRenderService(
      this.createConversationRenderHost(),
    );
    const messageSendPreparationService = new MessageSendPreparationService(
      this.createMessageSendPreparationHost(),
    );
    const messageFinalizationService = new MessageFinalizationService(
      this.createMessageFinalizationHost(),
    );
    const assistantNoticeCardRenderer = new AssistantNoticeCardRenderer(
      this.createAssistantNoticeCardRendererHost(),
    );
    const userMessageFooterRenderer = new UserMessageFooterRenderer(
      this.createUserMessageFooterRendererHost(),
    );
    const streamingInlineCardRenderer = new StreamingInlineCardRenderer(
      this.createStreamingInlineCardRendererHost(),
    );
    const permissionInlineCardRenderer = new PermissionInlineCardRenderer(
      streamingInlineCardRenderer,
    );
    const questionRuntimeViewHostFactoryHost = this.createQuestionRuntimeViewHostFactoryHost();
    const questionRuntimeServices = createQuestionRuntimeServices(
      createQuestionRuntimeViewHost(questionRuntimeViewHostFactoryHost),
      createQuestionPostResolutionRuntimeHostAdapter({
        viewHost: questionRuntimeViewHostFactoryHost,
        conversationSync: conversationSyncBridgePorts.getVisibleSyncFollowUp(),
        statusRefresh: this.sessionTodoCoordinator,
      }),
      streamingInlineCardRenderer,
    );
    const sendPipelineRuntime = new SendPipelineRuntime(
      this.createSendPipelineRuntimeHost(),
      messageSendPreparationService,
      messageFinalizationService,
    );

    return {
      conversationRenderService,
      messageSendPreparationService,
      messageFinalizationService,
      assistantNoticeCardRenderer,
      userMessageFooterRenderer,
      streamingInlineCardRenderer,
      permissionInlineCardRenderer,
      questionRuntimeServices,
      sendPipelineRuntime,
    };
  }

  private createComposerContextViewHost(): ComposerContextViewHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      getActiveMarkdownView: () => this.getActiveMarkdownView(),
      getInputContainer: () => this.inputContainer,
      registerEvent: (eventRef) => {
        this.registerEvent(eventRef);
      },
      registerDomEvent: (target, type, callback, options) => {
        this.registerDomEvent(target, type, callback, options);
      },
    };
  }

  private createFocusContextRuntimeViewHost(): FocusContextRuntimeViewHost {
    return {
      getCurrentConversationNotePath: () => this.currentConversation?.currentNote ?? null,
      isComposerInteractionFocused: () => this.isComposerInteractionFocused(),
    };
  }

  private createFocusContextPreviewWritebackHost(): FocusContextPreviewWritebackHost {
    return {
      setCurrentConversationNotePath: (path) => {
        if (this.currentConversation) {
          this.currentConversation.currentNote = path;
        }
      },
    };
  }

  private createPersistentAssistantNoticeServiceHost(): PersistentAssistantNoticeServiceHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      getConversationSyncRuntime: () => this.tabConversationSyncFingerprintRuntimePort,
      renderAssistantMessage: (message) =>
        this.assistantShellViewHostAdapter.renderPersistedAssistantMessage({ message }),
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      handleVisibleNoticeMessageAppended: () => {
        const runtime = this.getActiveTabRuntimeState();
        if (runtime?.isHydratingConversation) {
          runtime.pendingLayoutMutations += 1;
          return;
        }

        this.scheduleSettledScrollToBottomIfNeeded();
      },
      setTabNeedsAttention: (tabId, needsAttention) => this.setTabNeedsAttention(tabId, needsAttention),
    };
  }

  private createSessionTodoViewHost(): SessionTodoViewHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getActiveTabId: () => this.getActiveTabId(),
      getCurrentConversationSessionId: () => this.currentConversation?.openCodeSessionId ?? null,
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      getConversationForTab: (tabId: TabId | null) => this.getConversationForTab(tabId),
      hasMatchingPersistentAssistantNoticeMessage: (
        title: string,
        content: string,
        tone: ChatMessage['noticeTone'],
        conversation?: Conversation | null,
      ) => this.persistentAssistantNoticeService.hasMatchingMessage(title, content, tone, conversation),
      appendPersistentAssistantNoticeMessage: (options: {
        title: string;
        content: string;
        tone: ChatMessage['noticeTone'];
      }) => this.persistentAssistantNoticeService.appendMessage(options),
      getSessionTodos: (sessionId) => this.plugin.openCodeService.getSessionTodos(sessionId),
      getSessionStatuses: () => this.plugin.openCodeService.getSessionStatuses(),
      reconcileBackgroundTaskLiveSignals: (tabId) => {
        this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
      },
    };
  }

  private createQuestionTodoBackgroundTaskRuntimeServiceBundleHost():
    QuestionTodoBackgroundTaskRuntimeServiceBundleHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      getConversationSyncRuntime: () => this.tabConversationSyncFingerprintRuntimePort,
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      renderSessionTodoDock: (tabId) => {
        this.renderSessionTodoDock(tabId);
      },
      getQuestionDockCoordinator: () => this.questionDockCoordinator,
      getSessionTodoCoordinator: () => this.sessionTodoCoordinator,
      getQuestionDockSlotCoordinator: () => this.questionDockSlotCoordinator,
      resetBackgroundTaskIndicator: () => {
        this.resetBackgroundTaskIndicator();
      },
      syncBackgroundTaskStateFromConversation: (conversation, tabId?: TabId | null) => {
        this.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      getBackgroundTaskIndicatorCoordinator: () => this.backgroundTaskIndicatorCoordinator,
      getBackgroundTaskLiveSignalCoordinator: () => this.backgroundTaskLiveSignalCoordinator,
      getTabRuntimeStateBridge: () => this.tabRuntimeStateBridge,
    };
  }

  private createBackgroundTaskNoticeStateServiceHost(): BackgroundTaskNoticeStateServiceHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getActiveTabId: () => this.getActiveTabId(),
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      getCurrentConversation: () => this.currentConversation,
      hasMatchingPersistentAssistantNoticeMessage: (
        title: string,
        content: string,
        tone: ChatMessage['noticeTone'],
        conversation?: Conversation | null,
      ) => this.persistentAssistantNoticeService.hasMatchingMessage(title, content, tone, conversation),
      appendPersistentAssistantNoticeMessage: (options: {
        title: string;
        content: string;
        tone: ChatMessage['noticeTone'];
      }) => this.persistentAssistantNoticeService.appendMessage(options),
    };
  }

  private createTabActivationRuntimeHostProviderHost(): TabActivationRuntimeHostProviderHost {
    return {
      getTabManager: () => this.tabManager,
      getActiveTabId: () => this.getActiveTabId(),
      getSessionIdForTab: (tabId) => this.getSessionIdForTab(tabId),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      getTabMessagesContainer: (tabId) => this.getTabPaneState(tabId)?.messagesEl ?? null,
      setCurrentConversation: (conversation) => {
        this.currentConversation = conversation;
      },
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      setOpenCodeSessionId: (sessionId) => {
        this.plugin.openCodeService.setSessionId(sessionId);
      },
      clearPendingQuestionsForTab: (tabId) => {
        this.questionDockCoordinator.clearPendingQuestionsForTab(tabId);
      },
      resetTabSessionState: (tabId, sessionId) => {
        this.sessionTodoCoordinator.resetTabSessionState(tabId, sessionId);
      },
      clearTabSessionState: (tabId) => {
        this.sessionTodoCoordinator.clearTabSessionState(tabId);
      },
      resetBackgroundTaskSuppressedFingerprint: (tabId) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.backgroundTaskSuppressedFingerprint = null;
        }
      },
      hasBackgroundTaskIndicator: (tabId) =>
        Boolean(this.backgroundTaskLiveSignalCoordinator.hasIndicator(tabId)),
      getConversationSyncRuntime: () => this.tabActivationConversationSyncRuntimePort,
      updateSendButtonState: () => {
        this.updateSendButtonState();
      },
      setActiveMessagesPane: (tabId) => {
        this.setActiveMessagesPane(tabId);
      },
      scheduleComposerLayoutSync: () => {
        this.scheduleComposerLayoutSync();
      },
      updateModelSelectorDisplay: () => {
        this.updateModelSelectorDisplay();
      },
      clearMessagesContainer: () => {
        this.messagesContainer?.empty();
      },
      resetTurnState: () => {
        this.resetTurnState();
      },
      scheduleSettledScrollToBottom: (tabId) => {
        this.scheduleSettledScrollToBottom(tabId);
      },
    };
  }

  private createActiveTabContextUsageCoordinatorHost(): ActiveTabContextUsageCoordinatorHost {
    return {
      hasActiveTab: () => Boolean(this.tabManager?.getActiveTab()),
      getCurrentConversation: () => this.currentConversation,
      getCurrentSessionModel: () => this.getCurrentSessionModel(),
      getCurrentSessionModelResolution: () => this.getCurrentSessionModelResolution(),
      findKnownModelInfo: (selection) => this.findKnownModelInfo(selection),
      getActiveTabContextUsage: () => this.tabManager?.getActiveTabContextUsage() ?? null,
      setActiveTabContextUsage: (contextUsage) => {
        this.tabManager?.setActiveTabContextUsage(contextUsage);
      },
      renderContextUsageIndicator: (state) => {
        this.contextRing?.update(state);
      },
      getSessionContextUsageSnapshot: (sessionId) =>
        this.plugin.openCodeService.getSessionContextUsageSnapshot(sessionId),
    };
  }

  private createBackgroundTaskLiveSignalCoordinatorHostProviderHost():
  BackgroundTaskLiveSignalCoordinatorHostProviderHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      getTabSessionStatus: (tabId, sessionId) =>
        this.sessionTodoCoordinator.getTabSessionStatus(tabId, sessionId),
      syncTabStreamLikeState: (tabId) => {
        this.syncTabStreamLikeState(tabId);
      },
      resetBackgroundTaskIndicator: (tabId) => {
        this.resetBackgroundTaskIndicator(tabId);
      },
    };
  }

  private createBackgroundTaskTimelineServiceHost(): BackgroundTaskTimelineServiceHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getActiveTabId: () => this.getActiveTabId(),
      getMessageAnchorKey: (message) => this.getMessageAnchorKey(message),
      clearInlinePanel: (tabId) => {
        this.backgroundTaskInlinePanelRenderer.clear(tabId);
      },
      armAuthoritativeSyncGate: (tabId) => {
        this.backgroundTaskLiveSignalCoordinator.armAuthoritativeSyncGate(tabId);
      },
      clearAuthoritativeSyncGate: (tabId) => {
        this.backgroundTaskLiveSignalCoordinator.clearAuthoritativeSyncGate(tabId);
      },
      syncTabStreamLikeState: (tabId) => {
        this.syncTabStreamLikeState(tabId);
      },
      isSuppressedBackgroundTaskSegment: (segment, tabId, conversation) =>
        this.isSuppressedBackgroundTaskSegment(segment, tabId, conversation),
    };
  }

  private createBackgroundTaskInlinePanelRendererHost(): BackgroundTaskInlinePanelRendererHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      renderMarkdownInto: (container, markdown) => this.renderMarkdownInto(container, markdown),
    };
  }

  private createBackgroundTaskIndicatorCoordinatorHost(): BackgroundTaskIndicatorCoordinatorHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getCurrentConversation: () => this.currentConversation,
      hasTabRuntime: (tabId: TabId | null) => Boolean(this.getTabRuntimeState(tabId)),
    };
  }

  private createBackgroundTaskStreamTriggerCoordinatorHost(): BackgroundTaskStreamTriggerCoordinatorHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      applyStreamingTodoSnapshotFromTool: (toolCall, tabId) => {
        this.sessionTodoCoordinator.applyStreamingTodoSnapshotFromTool(toolCall, tabId);
      },
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      refreshTabSessionTodos: (tabId, sessionId, options) =>
        this.sessionTodoCoordinator.refreshTabSessionTodos(tabId, sessionId, options),
      resetBackgroundTaskIndicator: (tabId) => {
        this.resetBackgroundTaskIndicator(tabId);
      },
    };
  }

  private createConversationSyncLoadRuntimeHostProviderHost():
  ConversationSyncLoadRuntimeHostProviderHost {
    return {
      loadConversations: () => this.plugin.loadConversations(),
      getConversationById: async (id) => (await this.plugin.getConversationById(id)) ?? null,
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      getAllTabs: () => this.tabManager?.getAllTabs() ?? [],
      getTab: (tabId) => this.tabManager?.getTab(tabId) ?? null,
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
        this.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        this.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      hasInterruptedLocalAssistantTail: (messages) => this.hasInterruptedLocalAssistantTail(messages),
    };
  }

  private createConversationSyncBridgePortProviderHost():
  ConversationSyncBridgePortProviderHost {
    return {
      startConversationSyncLoop: () => {
        this.conversationSyncBridge.startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        this.conversationSyncBridge.stopConversationSyncLoop();
      },
      clearScheduledSignalConversationSync: (tabId) => {
        this.conversationSyncBridge.clearScheduledSignalConversationSync(tabId);
      },
      scheduleConversationSyncFromSignal: (tabId, reason) => {
        this.conversationSyncBridge.scheduleConversationSyncFromSignal(tabId, reason);
      },
      syncVisibleConversationInBackground: () =>
        this.conversationSyncBridge.syncVisibleConversationInBackground(),
    };
  }

  private createTabConversationSyncFingerprintPortProviderHost():
  TabConversationSyncFingerprintPortProviderHost {
    return {
      getConversationSyncFingerprint: (messages) =>
        this.getConversationSyncFingerprint(messages),
      setTabConversationSyncFingerprint: (tabId, fingerprint) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.lastConversationSyncFingerprint = fingerprint;
        }
      },
    };
  }

  private createTabActivationConversationSyncPortProviderHost():
  TabActivationConversationSyncPortProviderHost {
    return {
      getConversationSyncFingerprint: (messages) =>
        this.getConversationSyncFingerprint(messages),
      setLastConversationSyncFingerprint: (fingerprint) => {
        this.lastConversationSyncFingerprint = fingerprint;
      },
      startConversationSyncLoop: () => {
        this.conversationSyncBridgePorts.getLoopControl().startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        this.conversationSyncBridgePorts.getLoopControl().stopConversationSyncLoop();
      },
    };
  }

  private createConversationSessionSignalRuntimeHost():
  ConversationSessionSignalRuntimeHost {
    return {
      subscribeToSessionSyncEvents: (listener) =>
        this.plugin.openCodeService.subscribeToSessionSyncEvents(listener),
      subscribeToSessionTodoUpdates: (listener) =>
        this.plugin.openCodeService.subscribeToSessionTodoUpdates(listener),
      subscribeToSessionStatusUpdates: (listener) =>
        this.plugin.openCodeService.subscribeToSessionStatusUpdates(listener),
      applySessionTodoUpdate: (tabId, sessionId, todos) =>
        this.sessionTodoCoordinator.applySessionTodoUpdate(tabId, sessionId, todos),
      applySessionStatusUpdate: (tabId, sessionId, status) =>
        this.sessionTodoCoordinator.applySessionStatusUpdate(tabId, sessionId, status),
      getAllTabs: () => this.tabManager?.getAllTabs() ?? [],
      getConversations: () => this.plugin.getConversations(),
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      scheduleConversationSyncFromSignal: (tabId, reason) =>
        this.conversationSyncBridgePorts.getSignalScheduler().scheduleConversationSyncFromSignal(
          tabId,
          reason,
        ),
    };
  }

  private createBackgroundTaskCompletionNoticeServiceHost(): BackgroundTaskCompletionNoticeServiceHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      appendPersistentAssistantNoticeMessage: (options) => this.persistentAssistantNoticeService.appendMessage(options),
    };
  }

  private createConversationHydrationRuntimeHostProviderHost():
  ConversationHydrationRuntimeHostProviderHost {
    return {
      getMessagesContainer: () => this.messagesContainer,
      getActiveTabId: () => this.getActiveTabId(),
      getScrollRuntimeForTab: (tabId) => this.getTabRuntimeState(tabId),
      scrollToBottom: ({ tabId }) => {
        this.scrollToBottom({ tabId });
      },
      syncPaneScrollMetrics: (tabId, messagesEl) => {
        this.syncPaneScrollMetrics(tabId, messagesEl);
      },
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      syncBackgroundTaskStateFromConversation: (conversation) => {
        this.syncBackgroundTaskStateFromConversation(conversation);
      },
      renderMessages: (messages) => this.renderMessages(messages),
      getCurrentConversation: () => this.currentConversation,
      cancelTitleGeneration: (conversationId) => {
        this.titleGenerationService.cancelConversation(conversationId);
      },
      clearPendingTitleGenerationStatus: (conversationId) =>
        this.updateConversationTitleState(conversationId, {
          titleGenerationStatus: undefined,
        }),
      resetBackgroundTaskIndicator: () => {
        this.resetBackgroundTaskIndicator();
      },
      clearScheduledScrollToBottom: () => {
        this.clearScheduledScrollToBottom();
      },
      beginConversationHydration: (tabId) => {
        this.beginConversationHydration(tabId);
      },
      clearMessagesContainer: () => {
        this.messagesContainer?.empty();
      },
      resetTurnState: () => {
        this.resetTurnState();
      },
      endConversationHydration: (tabId) => {
        this.endConversationHydration(tabId);
      },
    };
  }

  private createConversationViewStateHost(): ConversationViewStateHost {
    return {
      getTabManager: () => this.tabManager,
    };
  }

  private createConversationTabOpenHost(): ConversationTabOpenHost {
    return {
      getTabManager: () => this.tabManager,
      getMaxTabs: () => this.plugin.settings.maxTabs,
      isActiveTabStreaming: () => this.isActiveTabStreaming(),
      createConversation: () => this.plugin.createConversation(),
      showNotice: (message) => {
        new Notice(message);
      },
    };
  }

  private createConversationTabLifecycleRecoveryHost(): ConversationTabLifecycleRecoveryHost {
    return {
      getTabManager: () => this.tabManager,
      isTabForegroundBusy: (tabId) => this.isTabForegroundBusy(tabId),
      getCurrentConversationId: () => this.currentConversation?.id ?? null,
      createConversation: () => this.plugin.createConversation(),
      deleteConversation: (conversationId) => this.plugin.deleteConversation(conversationId),
      clearTabMessagesPanes: () => {
        this.clearTabMessagesPanes();
      },
      resetTabManager: () => {
        this.resetTabManager();
      },
      removeTabMessagesPane: (tabId) => {
        this.removeTabMessagesPane(tabId);
      },
      showNotice: (message) => {
        new Notice(message);
      },
    };
  }

  private createConversationRestoreBootstrapHost(): ConversationRestoreBootstrapHost {
    return {
      getTabManager: () => this.tabManager,
      getPersistedTabState: () => this.plugin.settings.tabState,
      resetPersistedTabState: () => {
        this.plugin.settings.tabState = getDefaultPersistedTabState();
      },
      persistTabState: (options) => {
        this.persistTabState(options);
      },
      loadConversations: () => this.plugin.loadConversations(),
      getConversations: () => this.plugin.getConversations(),
      createConversation: () => this.plugin.createConversation(),
    };
  }

  private createConversationRenderHost(): ConversationRenderHost {
    const assistantTailRender: ConversationAssistantTailRenderPort =
      this.createConversationAssistantTailRenderPort();

    return {
      getCurrentConversation: () => this.currentConversation,
      getMessagesContainer: () => this.messagesContainer,
      getActiveTabId: () => this.getActiveTabId(),
      getScrollRuntimeForTab: (tabId) => this.getTabRuntimeState(tabId),
      getRenderRuntimeForTab: (tabId) => this.getTabRuntimeState(tabId),
      clearScheduledScrollToBottom: () => {
        this.clearScheduledScrollToBottom();
      },
      beginConversationHydration: (tabId) => {
        this.beginConversationHydration(tabId);
      },
      endConversationHydration: (tabId) => {
        this.endConversationHydration(tabId);
      },
      clearMessagesContainer: () => {
        this.messagesContainer?.empty();
      },
      resetTurnState: () => {
        this.resetTurnState();
      },
      renderMessages: (messages) => this.renderMessages(messages),
      renderMessage: (message) => this.renderMessage(message),
      renderSyncedAssistantMessageWithReveal: (message) => this.renderSyncedAssistantMessageWithReveal(message),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) => this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      syncBackgroundTaskStateFromConversation: (conversation) => {
        this.syncBackgroundTaskStateFromConversation(conversation);
      },
      shouldAutoScroll: (tabId) => this.shouldAutoScroll(tabId),
      scrollToBottom: (options) => {
        this.scrollToBottom(options);
      },
      syncPaneScrollMetrics: (tabId, messagesEl) => {
        this.syncPaneScrollMetrics(tabId, messagesEl);
      },
      scheduleComposerLayoutSync: () => {
        this.scheduleComposerLayoutSync();
      },
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      getMessagesForRender: (messages) => this.getMessagesForRender(messages),
      getMessageVisualSignature: (message) => this.getMessageVisualSignature(message),
      shouldPseudoStreamSyncedAssistantMessage: (message) => this.shouldPseudoStreamSyncedAssistantMessage(message),
      assistantTailRender,
      logAssistantFinalizationDebug: (label, payload) => {
        this.logAssistantFinalizationDebug(label, payload);
      },
      summarizeChatMessageForDebug: (message) => this.summarizeChatMessageForDebug(message),
    };
  }

  private createConversationAssistantTailRenderPort(): ConversationAssistantTailRenderPort {
    return {
      getBodySignature: (message) => this.getAssistantBodySignature(message),
      renderMessageBody: (contentEl, message) =>
        this.renderAssistantMessageBody(contentEl, message),
      finalizePersistedFooter: (messageEl, message) => {
        this.assistantShellViewHostAdapter.finalizePersistedFooter(messageEl, message);
      },
    };
  }

  private createMessageFinalizationHost(): MessageFinalizationHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      syncConversationMessagesFromServer: (conversation, tabId, reason) =>
        this.syncConversationMessagesFromServer(conversation, tabId, reason),
      getConversationVisualFingerprint: (messages) => this.getConversationVisualFingerprint(messages),
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      patchTrailingAssistantRender: (previousMessages, nextMessages, tabId) =>
        this.patchTrailingAssistantRender(previousMessages, nextMessages, tabId),
      rerenderConversationMessages: (conversation) => this.rerenderConversationMessages(conversation),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) => this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      appendTurnDiffNoticeIfNeeded: (conversation, editedFiles, tabId) =>
        this.appendTurnDiffNoticeIfNeeded(conversation, editedFiles, tabId),
      refreshTabSessionTodos: (tabId, sessionId, options) =>
        this.sessionTodoCoordinator.refreshTabSessionTodos(tabId, sessionId, options),
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      setConversationSyncInFlight: (tabId, value) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.isConversationSyncInFlight = value;
        }
      },
      setLastConversationSyncFingerprint: (tabId, fingerprint) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.lastConversationSyncFingerprint = fingerprint;
        }
      },
      clearPendingEditedFiles: (tabId) => {
        this.getTabRuntimeState(tabId)?.pendingEditedFiles.clear();
      },
      setTabNeedsAttention: (tabId, needsAttention) => this.setTabNeedsAttention(tabId, needsAttention),
      setActiveTabConversation: (conversation) => {
        this.tabConversationStateBridge.syncActiveTabConversation(conversation);
      },
      syncActiveTabContextUsageIdentity: () => {
        this.activeTabContextUsageCoordinator.syncIdentity();
      },
      refreshActiveTabContextUsageFromServer: () =>
        this.activeTabContextUsageCoordinator.refreshFromServer(),
      summarizeChatMessageForDebug: (message) => this.summarizeChatMessageForDebug(message),
    };
  }

  private createMessageSendPreparationHost(): MessageSendPreparationHost {
    return {
      ensureConversationReady: async () => {
        if (!this.currentConversation) {
          await this.createNewConversation();
        }

        return this.currentConversation;
      },
      getActiveTabId: () => this.getActiveTabId(),
      ensureTabRuntime: (tabId) => Boolean(this.ensureTabRuntimeState(tabId)),
      isTabForegroundBusy: (tabId) => this.isTabForegroundBusy(tabId),
      notifyForegroundBusy: () => {
        new Notice(t('chat.tab.processingBlocked'));
      },
      composerSendContext: this.composerContextViewFacade.sendContext,
      getServerAvailability: () => this.getServerAvailability(),
      refreshServerStatusBadge: () => this.chatHeaderPresenter.refreshServerStatusBadge(),
      ensureServerReadyForChat: (availability) => this.ensureServerReadyForChat(availability),
      hasLoadedModelCatalog: () => this.hasLoadedModelCatalog,
      loadAvailableModels: () => this.reloadModelCatalog(),
      getSendMessageOptions: () => this.getSendMessageOptions(),
      formatModelId: (model) => this.formatModelId(model),
      ensureSelectedModelAvailable: (provider, model) => this.ensureSelectedModelAvailable(provider, model),
      appendModelUnavailableNoticeMessage: () => this.appendModelUnavailableNoticeMessage(),
      resetBackgroundTaskIndicator: (tabId) => {
        this.resetBackgroundTaskIndicator(tabId);
      },
      armBackgroundTaskIndicatorForUserMessage: (message, tabId) => {
        this.armBackgroundTaskIndicatorForUserMessage(message, tabId);
      },
      startConversationSyncLoop: () => {
        this.conversationSyncBridgePorts.getLoopControl().startConversationSyncLoop();
      },
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      setAutoScrollEnabled: (tabId, enabled) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.autoScrollEnabled = enabled;
        }
      },
      renderMessage: (message) => this.renderMessage(message),
      scrollToBottom: (options) => {
        this.scrollToBottom(options);
      },
      applyFallbackConversationTitle: (conversationId, firstMessage) =>
        this.applyFallbackConversationTitle(conversationId, firstMessage),
      shouldGenerateAiTitle: () => this.plugin.settings.titleMode === 'ai',
      startAiConversationTitleGeneration: (conversationId, firstMessage, modelOptions) => {
        void this.startAiConversationTitleGeneration(conversationId, firstMessage, modelOptions);
      },
      setStreaming: (tabId, value) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.isStreaming = value;
        }
      },
      syncTabStreamLikeState: (tabId) => {
        this.syncTabStreamLikeState(tabId);
      },
      beginTabContextUsageStream: (tabId) => {
        this.beginTabContextUsageStream(tabId);
      },
      clearPendingEditedFiles: (tabId) => {
        this.getTabRuntimeState(tabId)?.pendingEditedFiles.clear();
      },
    };
  }

  private createSendPipelineRuntimeHost(): SendPipelineHost {
    const viewPort: SendPipelineViewPort = {
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      getActiveTabId: () => this.getActiveTabId(),
      shouldAutoScroll: (tabId) => this.shouldAutoScroll(tabId),
      scheduleSettledScrollToBottomIfNeeded: (shouldScroll, tabId) => {
        this.scheduleSettledScrollToBottomIfNeeded(shouldScroll, tabId);
      },
      getOrCreateTabStreamController: (tabId) => this.getOrCreateTabStreamController(tabId),
      finalizeBackgroundTaskIndicatorAfterPrimaryStream: (tabId) =>
        this.backgroundTaskStreamTriggerCoordinator.finalizeAfterPrimaryStream(tabId),
      removeEmptyAssistantShells: () => {
        this.removeEmptyAssistantShells();
      },
      syncTabStreamLikeState: (tabId) => {
        this.syncTabStreamLikeState(tabId);
      },
      refreshServerStatusBadge: () => this.chatHeaderPresenter.refreshServerStatusBadge(),
    };
    const transportPort: SendPipelineTransportPort = {
      sendStreamMessage: (content, options) => this.plugin.openCodeService.sendMessage(content, options),
      detachStream: (sessionId) => {
        if (sessionId) {
          this.plugin.openCodeService.detachStream(sessionId);
        }
      },
      syncLatestUserMessageFromServer: (conversation, optimisticMessageId, tabId) =>
        this.syncLatestUserMessageFromServer(conversation, optimisticMessageId, tabId),
      beginTabContextUsageStream: (tabId) => {
        this.beginTabContextUsageStream(tabId);
      },
      completeTabContextUsageStream: (tabId) => {
        this.completeTabContextUsageStream(tabId);
      },
      applyUsageChunkToTab: (tabId, chunk) => {
        this.applyUsageChunkToTab(tabId, chunk);
      },
      showPermissionDialog: (request, tabId) => this.showPermissionDialog(request, tabId),
      showQuestionDialog: (request, tabId) =>
        this.questionRuntimeServices.resolutionFlowCoordinator.showQuestionDialog(request, tabId),
      convertToStreamingChunk: (chunk) => this.convertToStreamingChunk(chunk),
      getFriendlyStreamErrorMessage: (rawMessage) => this.getFriendlyStreamErrorMessage(rawMessage),
    };
    const shellPort: SendPipelineShellPort = this.assistantShellViewHostAdapter.createSendPipelineShellPort();
    const persistencePort: SendPipelinePersistencePort = {
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
    };
    const debugPort: SendPipelineDebugPort = {
      summarizeContentBlocksForDebug: (blocks) =>
        this.summarizeContentBlocksForDebug(blocks as SendPipelineDebugContentBlock[] | undefined),
      logAssistantFinalizationDebug: (label, payload) => {
        this.logAssistantFinalizationDebug(label, payload);
      },
      getLogPreview: (text, maxLength) => this.getLogPreview(text, maxLength),
      summarizeCoreStreamChunkForDebug: (chunk) => this.summarizeCoreStreamChunkForDebug(chunk),
      summarizeChatMessageForDebug: (message) => this.summarizeChatMessageForDebug(message),
      stringifyLogPayload: (payload) => this.stringifyLogPayload(payload),
    };

    return {
      ...viewPort,
      ...transportPort,
      ...shellPort,
      ...persistencePort,
      ...debugPort,
    };
  }

  private createAssistantNoticeCardRendererHost(): AssistantNoticeCardRendererHost {
    return {
      renderMarkdownInto: (container, markdown) => this.renderMarkdownInto(container, markdown),
      handleNoticeAction: (actionType) => this.handleNoticeAction(actionType),
    };
  }

  private createUserMessageFooterRendererHost(): UserMessageFooterRendererHost {
    return {
      attachTooltipLabel: (buttonEl, label) => this.attachTooltipLabel(buttonEl, label),
      initializeCopyButton: (copyBtn, content) => {
        copyBtn.insertAdjacentHTML('afterbegin', COPY_ICON);
        this.attachCopyButtonBehavior(copyBtn, content);
      },
      isStreaming: () => this.isActiveTabStreaming(),
      handleRewindRequest: (message) => this.handleRewindRequest(message),
      handleForkRequest: (message) => this.handleForkRequest(message),
    };
  }

  private createAssistantShellViewHostAdapterHost(): AssistantShellViewHostAdapterHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      ensureTurnBody: (tabId) => this.ensureTurnBody(tabId),
      shouldAutoScroll: (tabId) => this.shouldAutoScroll(tabId),
      scheduleSettledScrollToBottomIfNeeded: (shouldScroll, tabId) => {
        this.scheduleSettledScrollToBottomIfNeeded(shouldScroll, tabId);
      },
      setStreamingAssistantMessageVisibility: (messageEl, visible, reason) => {
        this.setStreamingAssistantMessageVisibility(messageEl, visible, reason);
      },
      initializeAssistantCopyButton: (copyBtn, content) => {
        copyBtn.innerHTML = COPY_ICON;
        this.attachCopyButtonBehavior(copyBtn, content);
      },
      renderNoticeCard: (container, message) =>
        this.assistantNoticeCardRenderer.render(container, message),
      renderPersistedAssistantMessageBody: (container, message) =>
        this.renderAssistantMessageBody(container, message),
    };
  }

  private createStreamingInlineCardRendererHost(): StreamingInlineCardRendererHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      revealStreamingAssistantMessageElement: (tabId) =>
        this.assistantShellViewHostAdapter.revealStreamingAssistantMessageElement(tabId),
    };
  }

  private createQuestionRuntimeViewHostFactoryHost(): QuestionRuntimeViewHostFactoryHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      ensureTabRuntimeState: (tabId) => this.ensureTabRuntimeState(tabId),
      getCurrentConversationSessionId: () => this.currentConversation?.openCodeSessionId,
      getSessionIdForTab: (tabId) => this.getSessionIdForTab(tabId),
      keepQuestionCardPinnedToBottom: (tabId) => {
        this.keepQuestionCardPinnedToBottom(tabId);
      },
      settings: this.plugin.settings,
      getQuestionDockSlotCoordinator: () => this.questionDockSlotCoordinator,
      getQuestionApi: () => this.plugin.openCodeService,
      getTabAttention: () => this.tabRuntimeStateBridge,
    };
  }

  getViewType(): string {
    return VIEW_TYPE_OPENCODIAN;
  }

  getDisplayText(): string {
    return 'OpenCodian';
  }

  getIcon(): string {
    return OPENCODIAN_APP_ICON;
  }

  async onOpen() {
    // Build UI
    this.buildUI();
    this.initializeTabSystem();
    this.chatHeaderPresenter.startServerStatusLoop();

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
    this.conversationSessionSignalRuntime.start();

    await this.initializeFirstTab();
  }

  async onClose() {
    this.persistTabState({ flush: true });
    this.chatHeaderPresenter.destroy();
    this.conversationHistoryActionsCoordinator.destroy();
    this.conversationSyncBridgePorts.getLoopControl().stopConversationSyncLoop();
    this.composerContextViewFacade.dispose();
    this.clearChatSurfaceSyncTimers();
    this.clearScheduledComposerLayoutSync();
    this.clearScheduledScrollToBottom();
    this.chatAppearanceStyleEl?.remove();
    this.chatAppearanceStyleEl = null;
    this.titleGenerationService.cancelAll();
    this.chatSelectionControlsCoordinator.destroy();
    this.inputPanelAppearanceCoordinator.destroy();
    this.composerInputShellCoordinator.destroy();
    this.effortSelector?.destroy();
    this.effortSelector = null;
    this.effortContainerEl = null;
    this.contextRing?.destroy();
    this.contextRing = null;
    this.contextRingContainerEl = null;
    this.destroyGlassOctahedronDemo();
    this.destroyLiquidDiamondDemo();

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
    this.questionDockSlotCoordinator.destroy();
    this.sessionTodoCoordinator.destroy();
    this.conversationSessionSignalRuntime.stop();
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
    this.chatHeaderPresenter.build(header);
    this.headerTabBarSlotEl = this.chatHeaderPresenter.getTabBarSlotEl();
    this.belowHeaderTabBarSlotEl = this.chatContainerEl.createDiv({
      cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--below-header',
    });

    // Messages area
    this.messagesShellEl = this.chatContainerEl.createDiv({ cls: 'opencodian-messages-shell' });
    const themeBackgroundLayerEl = this.messagesShellEl.createDiv({ cls: 'opencodian-theme-background-layer' });
    this.themeBackgroundImageEl = themeBackgroundLayerEl.createDiv({ cls: 'opencodian-theme-background-image' });
    this.themeBackgroundImageEl.setAttribute('aria-hidden', 'true');
    this.messagesContainer = null;

    // Input area
    this.inputContainer = this.chatContainerEl.createDiv({ cls: 'opencodian-input-area' });
    this.composerInputShellCoordinator.build(this.inputContainer);
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

  private syncPaneScrollMetrics(
    tabId: TabId | null,
    messagesEl: HTMLElement | null = this.getTabPaneState(tabId)?.messagesEl ?? null,
  ): boolean {
    return this.tabMessagesPaneCoordinator.syncScrollMetrics(tabId, messagesEl);
  }

  private ensureTabMessagesPane(tabId: TabId): TabPaneState | null {
    return this.tabMessagesPaneCoordinator.ensurePane(tabId);
  }

  private setActiveMessagesPane(tabId: TabId): void {
    this.tabMessagesPaneCoordinator.setActivePane(tabId);
  }

  private removeTabMessagesPane(tabId: TabId): void {
    this.tabMessagesPaneCoordinator.removePane(tabId);
  }

  private clearTabMessagesPanes(): void {
    this.tabMessagesPaneCoordinator.clearPanes();
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
      {
        onScrollToBottom: () => {
          const tabId = this.getActiveTabId();
          if (!tabId) {
            return;
          }

          const runtime = this.getTabRuntimeState(tabId);
          if (runtime) {
            runtime.autoScrollEnabled = true;
          }
          this.scrollToBottom({ tabId, behavior: 'smooth', enableAutoScroll: true });
        },
      },
    );
  }

  private restoreTurnStateFromActivePane(): void {
    if (!this.messagesContainer) {
      this.resetTurnState();
      return;
    }

    const turnBodies = Array.from(this.messagesContainer.querySelectorAll('.opencodian-turn-body'));
    this.currentTurnBodyEl = (turnBodies[turnBodies.length - 1] as HTMLElement | undefined) ?? null;
    this.backgroundTaskIndicatorEl = null;
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

    this.tabManager = this.createTabManager();

    this.applyTabBarLayout();
  }

  private createTabManager(): TabManager {
    return new TabManager(t('chat.tab.new'), {
      getMaxTabs: () => this.plugin.settings.maxTabs,
      onChanged: () => {
        this.renderTabBar();
        this.persistTabState();
      },
    });
  }

  private resetTabManager(): void {
    this.tabManager = this.createTabManager();
    this.renderTabBar();
  }

  private async initializeFirstTab(): Promise<void> {
    await this.conversationRestoreBootstrapCoordinator.initializeFirstTab();
  }

  private renderTabBar(): void {
    if (!this.tabBar || !this.tabManager) {
      return;
    }

    this.tabBar.render(this.tabManager.getTabBarItems(), this.getTabBarLayoutMode());
  }

  private restorePersistedTabs(): string | null {
    return this.conversationRestoreBootstrapCoordinator.restorePersistedTabs();
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
      void this.plugin.saveSettingsUiStateImmediately();
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

  private isTabForegroundBusy(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    if (runtime.isStreaming) {
      return true;
    }

    const status = this.sessionTodoCoordinator.getTabSessionStatus(
      tabId,
      this.getSessionIdForTab(tabId),
    );
    return status?.type === 'busy' || status?.type === 'retry';
  }

  private syncTabStreamLikeState(tabId: TabId | null): void {
    this.tabRuntimeStateBridge.syncStreamLikeState(tabId);
  }

  private syncActiveTabStreamLikeState(): void {
    this.tabRuntimeStateBridge.syncActiveStreamLikeState();
  }

  private setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void {
    this.tabRuntimeStateBridge.setNeedsAttention(tabId, needsAttention);
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
    await this.conversationTabLifecycleRecoveryCoordinator.closeTabAndRecover(tabId);
  }

  private async activateTab(tabId: string): Promise<void> {
    await this.conversationViewStateService.activateTab(tabId);
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
    const inputTabBarSlotEl = this.composerInputShellCoordinator.getTabBarSlotEl();
    if (
      !this.chatContainerEl
      || !this.tabBarMountEl
      || !this.headerTabBarSlotEl
      || !this.belowHeaderTabBarSlotEl
      || !this.outerVerticalTabBarSlotEl
      || !inputTabBarSlotEl
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
          : inputTabBarSlotEl;

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
    inputTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === inputTabBarSlotEl);
    this.renderTabBar();
  }

  public applyChatAppearanceSettings(): void {
    if (!this.chatContainerEl) {
      return;
    }

    const activePreset = getThemePresetDefinition(this.plugin.settings.theme.activePresetId);
    for (const containerClass of THEME_STYLE_CONTAINER_CLASSES) {
      this.chatContainerEl.removeClass(containerClass);
    }
    for (const cssVar of THEME_PRESET_CSS_VARIABLE_NAMES) {
      this.chatContainerEl.style.removeProperty(cssVar);
    }
    if (activePreset) {
      this.chatContainerEl.addClass(activePreset.containerClass);
      for (const [cssVar, cssValue] of Object.entries(activePreset.cssVariables)) {
        this.chatContainerEl.style.setProperty(cssVar, cssValue);
      }
    }

    const cssVariables = getChatAppearanceCssVariables(this.plugin.settings.chatAppearance);
    for (const [cssVar, cssValue] of Object.entries(cssVariables)) {
      this.chatContainerEl.style.setProperty(cssVar, cssValue);
    }

    const glassRefractionCssVariables = getInputPanelGlassRefractionCssVariables(
      this.plugin.settings.inputPanelGlassRefraction,
    );
    for (const [cssVar, cssValue] of Object.entries(glassRefractionCssVariables)) {
      this.chatContainerEl.style.setProperty(cssVar, cssValue);
    }

    this.themeBackgroundRequestId += 1;
    this.chatContainerEl.removeClass('opencodian-container--theme-background');
    this.themeBackgroundImageEl?.style.removeProperty('background-image');
    void this.applyThemeBackgroundImage(this.themeBackgroundRequestId);

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

    this.applyInputActionButtonStyleState();
    this.applyInputPanelThemeState();
    this.scheduleChatSurfaceColorSync();
    this.scheduleComposerLayoutSync();
  }

  private async applyThemeBackgroundImage(requestId: number): Promise<void> {
    if (!this.chatContainerEl || !this.themeBackgroundImageEl) {
      return;
    }

    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    if (!backgroundSettings.imagePath) {
      return;
    }

    const dataUrl = await this.plugin.resolveChatThemeBackgroundDataUrl();
    if (!this.chatContainerEl || !this.themeBackgroundImageEl || requestId !== this.themeBackgroundRequestId || !dataUrl) {
      return;
    }

    this.themeBackgroundImageEl.style.backgroundImage = `url(${JSON.stringify(dataUrl)})`;
    this.chatContainerEl.addClass('opencodian-container--theme-background');
  }

  public refreshCurrentConversationRendering(): void {
    if (!this.currentConversation) {
      return;
    }

    void this.rerenderConversationMessages(this.currentConversation);
  }

  /** Apply configured chat scroll mode to the messages container */
  public applyChatScrollMode(): void {
    this.syncChatSurfaceColor();

    if (this.tabMessagesPaneCoordinator.applyScrollModeToPanes()) {
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
    runtime.turnBodyByAnchorKey.clear();
    runtime.backgroundTaskInlineEls.clear();
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

  private getMessageAnchorKey(message: ChatMessage): string {
    return message.sourceMessageId ?? message.id;
  }

  private isBackgroundTaskCompletionReminder(message: ChatMessage): boolean {
    return message.omo?.kind === 'system-reminder'
      && (
        message.omo.reminderType === 'background-task-completed'
        || message.omo.reminderType === 'all-background-tasks-complete'
      );
  }

  public applyLocaleTexts(): void {
    this.chatHeaderPresenter.applyLocaleTexts();
    this.composerInputShellCoordinator.applyLocaleTexts();
    this.chatSelectionControlsCoordinator.applyLocaleTexts();
    this.renderSessionTodoDock();
    this.questionDockSlotCoordinator.render();
    this.renderTabBar();
  }

  public refreshQuestionUi(): void {
    this.questionDockSlotCoordinator.render();
    if (this.currentConversation) {
      void this.rerenderConversationMessages(this.currentConversation);
    }
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

  public toggleLiquidDiamondDemo(): void {
    this.toggleLiquidDiamondDemoVariant('cpu');
  }

  public toggleLiquidDiamondWebGlDemo(): void {
    this.toggleLiquidDiamondDemoVariant('webgl');
  }

  public async toggleGlassOctahedron(): Promise<void> {
    if (!this.messagesShellEl) {
      return;
    }

    if (!this.glassOctahedronDemoController) {
      this.glassOctahedronDemoController = new GlassOctahedronDemoController(
        this.messagesShellEl,
      );
    }

    if (this.glassOctahedronDemoController.isVisible()) {
      this.destroyGlassOctahedronDemo();
      return;
    }

    try {
      await this.glassOctahedronDemoController.show();
    } catch (error) {
      logger.warn('Failed to initialize glass octahedron demo', error);
      new Notice(
        'Glass octahedron is not available in this environment. See developer console for details.',
      );
      this.destroyGlassOctahedronDemo();
    }
  }

  private toggleLiquidDiamondDemoVariant(backend: 'cpu' | 'webgl'): void {
    if (!this.messagesShellEl) {
      return;
    }

    const activeController =
      backend === 'webgl'
        ? this.liquidDiamondWebGlDemoController
        : this.liquidDiamondDemoController;
    const otherController =
      backend === 'webgl'
        ? this.liquidDiamondDemoController
        : this.liquidDiamondWebGlDemoController;

    if (!activeController) {
      const controller = new LiquidDiamondDemoController(this.messagesShellEl, backend);
      if (backend === 'webgl') {
        this.liquidDiamondWebGlDemoController = controller;
      } else {
        this.liquidDiamondDemoController = controller;
      }
    }

    const nextActiveController =
      backend === 'webgl'
        ? this.liquidDiamondWebGlDemoController
        : this.liquidDiamondDemoController;
    if (!nextActiveController) {
      return;
    }

    if (nextActiveController.isVisible()) {
      nextActiveController.destroy();
      if (backend === 'webgl') {
        this.liquidDiamondWebGlDemoController = null;
      } else {
        this.liquidDiamondDemoController = null;
      }
      return;
    }

    otherController?.destroy();
    if (backend === 'webgl') {
      this.liquidDiamondDemoController = null;
    } else {
      this.liquidDiamondWebGlDemoController = null;
    }

    try {
      nextActiveController.show();
    } catch (error) {
      logger.warn(`Failed to initialize ${backend} liquid diamond demo`, error);
      new Notice(
        backend === 'webgl'
          ? 'WebGL diamond demo is not available in this environment. See developer console for details.'
          : 'Diamond demo is not available in this environment.',
      );
      this.destroyLiquidDiamondDemo();
      return;
    }
  }

  private destroyLiquidDiamondDemo(): void {
    this.liquidDiamondDemoController?.destroy();
    this.liquidDiamondDemoController = null;
    this.liquidDiamondWebGlDemoController?.destroy();
    this.liquidDiamondWebGlDemoController = null;
  }

  private destroyGlassOctahedronDemo(): void {
    this.glassOctahedronDemoController?.destroy();
    this.glassOctahedronDemoController = null;
  }

  private resolvePluginAssetUrl(relativePath: string): string | null {
    const adapter = this.app.vault.adapter;
    const pluginDir = this.plugin.manifest.dir?.trim()
      ? normalizePath(this.plugin.manifest.dir)
      : normalizePath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`);
    const assetPath = normalizePath(`${pluginDir}/${relativePath}`);

    if (typeof adapter.getResourcePath !== 'function') {
      return null;
    }

    return adapter.getResourcePath(assetPath);
  }

  private applyInputPanelThemeState(): void {
    this.inputPanelAppearanceCoordinator.applyThemeState();
  }

  private logLiquidGlassDiagnosticsEntry(label: string, payload: unknown): void {
    this.inputPanelAppearanceCoordinator.logDiagnosticsEntry(label, payload);
  }

  private shouldLogAssistantFinalizationDebug(label: string): boolean {
    return ASSISTANT_DEBUG_STAGE_ALLOWLIST.has(label);
  }

  private logAssistantFinalizationDebug(label: string, payload: unknown): void {
    if (!this.shouldLogAssistantFinalizationDebug(label)) {
      return;
    }

    logger.debug(`Assistant message finalization [${label}]: ${this.stringifyLogPayload(payload)}`);
  }

  private summarizeContentBlocksForDebug(
    blocks:
      | Array<{
        type?: string;
        text?: string;
        content?: string;
        toolId?: string;
        toolName?: string;
        toolCall?: { id?: string; name?: string } | null;
      }>
      | undefined,
  ): {
    count: number;
    types: string[];
    textLength: number;
    toolCount: number;
    thinkingCount: number;
  } {
    if (!blocks || blocks.length === 0) {
      return {
        count: 0,
        types: [],
        textLength: 0,
        toolCount: 0,
        thinkingCount: 0,
      };
    }

    let textLength = 0;
    let toolCount = 0;
    let thinkingCount = 0;

    for (const block of blocks) {
      const type = block.type ?? 'unknown';
      if (type === 'text') {
        const text = typeof block.text === 'string'
          ? block.text
          : typeof block.content === 'string'
            ? block.content
            : '';
        textLength += text.length;
      } else if (type === 'tool_use' || type === 'tool_call' || block.toolCall) {
        toolCount += 1;
      } else if (type === 'thinking') {
        thinkingCount += 1;
      }
    }

    return {
      count: blocks.length,
      types: blocks.map((block) => block.type ?? 'unknown'),
      textLength,
      toolCount,
      thinkingCount,
    };
  }

  private summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null {
    if (!message) {
      return null;
    }

    return {
      id: message.id,
      sourceMessageId: message.sourceMessageId ?? null,
      role: message.role,
      timestamp: message.timestamp,
      modelId: message.modelId ?? null,
      streamState: message.streamState ?? null,
      displayStyle: message.displayStyle ?? 'default',
      contentLength: message.content.length,
      contentPreview: this.getLogPreview(message.content, 120),
      contentBlocks: this.summarizeContentBlocksForDebug(message.contentBlocks),
      toolCallsCount: message.toolCalls?.length ?? 0,
      structuredPresent: message.structured !== undefined,
      partsCount: message.parts?.length ?? 0,
      questionResolution: message.questionResolution
        ? {
            requestId: message.questionResolution.request.id,
            status: message.questionResolution.status,
          }
        : null,
      omoKind: message.omo?.kind ?? null,
    };
  }

  private summarizeCoreStreamChunkForDebug(
    chunk: import('../../core/types').StreamChunk,
  ): Record<string, unknown> {
    switch (chunk.type) {
      case 'text':
        return {
          type: chunk.type,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
        };
      case 'thinking':
        return {
          type: chunk.type,
          partId: chunk.partId ?? null,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
          durationSeconds: chunk.durationSeconds ?? null,
        };
      case 'tool_use':
        return {
          type: chunk.type,
          id: chunk.id,
          name: chunk.name,
          inputKeys: Object.keys(chunk.input ?? {}),
        };
      case 'tool_result':
        return {
          type: chunk.type,
          toolUseId: chunk.toolUseId,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
          isError: chunk.isError ?? false,
        };
      case 'usage':
        return {
          type: chunk.type,
          inputTokens: chunk.inputTokens,
          outputTokens: chunk.outputTokens,
          sessionId: chunk.sessionId ?? null,
        };
      case 'message_metadata':
        return {
          type: chunk.type,
          messageId: chunk.messageId,
          timestamp: chunk.timestamp,
          modelId: chunk.modelId ?? null,
        };
      case 'file_edited':
        return {
          type: chunk.type,
          file: chunk.file,
        };
      case 'permission_request':
        return {
          type: chunk.type,
          id: chunk.id,
          permission: chunk.permission,
          patternCount: chunk.patterns.length,
        };
      case 'question_request':
        return {
          type: chunk.type,
          requestId: chunk.request.id,
          questionCount: chunk.request.questions.length,
        };
      case 'error':
        return {
          type: chunk.type,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
        };
      default:
        return { type: chunk.type };
    }
  }

  private summarizeRenderedStreamChunkForDebug(
    chunk: import('../../utils/streaming').StreamChunk,
  ): Record<string, unknown> {
    switch (chunk.type) {
      case 'text':
        return {
          type: chunk.type,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
        };
      case 'thinking':
        return {
          type: chunk.type,
          partId: chunk.partId ?? null,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
          durationSeconds: chunk.durationSeconds ?? null,
        };
      case 'tool_use':
        return {
          type: chunk.type,
          id: chunk.id,
          name: chunk.name,
          inputKeys: Object.keys(chunk.input ?? {}),
        };
      case 'tool_result':
        return {
          type: chunk.type,
          id: chunk.id,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
          isError: chunk.isError ?? false,
        };
      case 'error':
        return {
          type: chunk.type,
          length: chunk.content.length,
          preview: this.getLogPreview(chunk.content, 120),
        };
      case 'done':
        return { type: chunk.type };
      default:
        return { type: 'unknown' };
    }
  }

  private applyInputActionButtonStyleState(): void {
    this.inputPanelAppearanceCoordinator.applyActionButtonStyleState();
  }

  private scheduleComposerLayoutSync(): void {
    this.composerInputShellCoordinator.scheduleLayoutSync();
  }

  private clearScheduledComposerLayoutSync(): void {
    this.composerInputShellCoordinator.clearScheduledLayoutSync();
  }

  private shouldRenderQuestionResolutionCards(): boolean {
    return this.plugin.settings.showAnsweredQuestionCards;
  }

  private getContextKindLabel(kind: PromptContextItem['kind']): string {
    switch (kind) {
      case 'current_note':
        return t('chat.context.kind.currentNote');
      case 'selection':
        return t('chat.context.kind.selection');
      default:
        return t('chat.context.kind.file');
    }
  }

  private getActiveMarkdownView(): MarkdownView | null {
    return this.composerContextViewFacade.getActiveMarkdownView();
  }

  public async addCurrentNoteContextFromActiveEditor(view?: MarkdownView | null): Promise<boolean> {
    return this.composerContextViewFacade.addCurrentNoteContextFromActiveEditor(view);
  }

  public async addSelectionContextFromActiveEditor(
    editor?: Editor | null,
    view?: MarkdownView | null,
  ): Promise<boolean> {
    return this.composerContextViewFacade.addSelectionContextFromActiveEditor(editor, view);
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

    this.composerContextViewFacade.start();
  }

  /** Create a new conversation */
  private async createNewConversation() {
    await this.conversationTabOpenCoordinator.createConversationInNewTab();
  }

  /** Create a new conversation in the current tab */
  private async createNewConversationInCurrentTab(): Promise<void> {
    await this.conversationTabOpenCoordinator.createConversationInCurrentTab();
  }

  /** Load a conversation */
  private async loadConversation(
    id: string,
    options: { forceServerSync?: boolean; preserveScrollPosition?: boolean } = {},
  ): Promise<void> {
    await this.conversationViewStateService.loadConversation(id, options);
  }

  private getConversationSyncFingerprint(messages: ChatMessage[]): string {
    return messages
      .map((message) => JSON.stringify({
        id: message.id,
        role: message.role,
        sourceMessageId: message.sourceMessageId ?? null,
        streamState: message.streamState ?? null,
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

  private getInterruptedSyncPreservationLogFingerprint(
    conversation: Conversation,
    messages: ChatMessage[],
  ): string {
    return JSON.stringify({
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      messages: messages.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        streamState: message.streamState ?? null,
        timestamp: message.timestamp,
        content: message.content,
        contentBlocks: message.contentBlocks ?? [],
      })),
    });
  }

  private getConversationVisualFingerprint(messages: ChatMessage[]): string {
    return this.getMessagesForRender(messages)
      .map((message) => this.getMessageVisualSignature(message))
      .join('|');
  }

  private getMessageVisualSignature(message: ChatMessage): string {
    return JSON.stringify({
      role: message.role,
      streamState: message.streamState ?? null,
      displayStyle: message.displayStyle ?? null,
      content: message.content,
      timestamp: message.timestamp,
      modelId: message.modelId ?? null,
      noticeTitle: message.noticeTitle ?? null,
      noticeTone: message.noticeTone ?? null,
      noticeActions: message.noticeActions ?? null,
      images: message.images ?? null,
      omo: message.omo ?? null,
      questionResolution: message.questionResolution ? {
        requestId: message.questionResolution.request.id,
        status: message.questionResolution.status,
        answers: message.questionResolution.answers ?? null,
      } : null,
      contentBlocks: (message.contentBlocks ?? []).map((block) => ({
        type: block.type,
        text: block.text ?? null,
        thinking: block.thinking ?? null,
        durationSeconds: block.durationSeconds ?? null,
        toolId: block.toolId ?? null,
        toolName: block.toolName ?? null,
        toolKind: block.toolKind ?? null,
        toolInput: block.toolInput ?? null,
        toolStatus: block.toolStatus ?? null,
        toolResult: block.toolResult ?? null,
        subagentId: block.subagentId ?? null,
        subagentMode: block.subagentMode ?? null,
      })),
    });
  }

  private async deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void> {
    await this.conversationTabLifecycleRecoveryCoordinator.deleteConversationsAndRecover(conversationIds);
  }

  /** Send a message */
  private async sendMessage(content: string) {
    await this.sendPipelineRuntime.sendMessage(content);
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
      this.scrollToBottom({ enableAutoScroll: true });
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
    const timestamp = Date.now();
    const modelId = this.formatModelId(this.getCurrentSessionModel());
    this.assistantShellViewHostAdapter.renderStreamError({
      messageEl,
      contentEl,
      timestamp,
      content: message,
      modelId,
    });

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

    this.scrollToBottom({ enableAutoScroll: true });
  }

  private async refreshStatusSurfaces(): Promise<void> {
    await this.chatHeaderPresenter.refreshServerStatusBadge();
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
    const timestamp = Date.now();
    const modelId = this.formatModelId(this.getCurrentSessionModel());
    const noticeMessage = buildStreamErrorNotice(timestamp, message, modelId);
    const { messageEl } = this.assistantShellViewHostAdapter.createAssistantMessageElement(activeTabId);
    await this.assistantShellViewHostAdapter.renderAssistantPlaceholderAsNotice({
      messageEl,
      noticeMessage,
      reason: 'render-stream-error-notice',
    });
    if (activeRuntime) {
      activeRuntime.streamingMessageEl = null;
      activeRuntime.streamingContentEl = null;
    }

    if (this.currentConversation) {
      this.currentConversation.messages.push(noticeMessage);
      this.currentConversation.updatedAt = Date.now();
      await this.plugin.storage.saveConversation(this.currentConversation);
    }

    this.scrollToBottom({ enableAutoScroll: true });
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

    new Notice(t('chat.stream.cancelledToast'));
  }

  /** Update send button icon based on streaming state */
  private updateSendButtonState() {
    this.composerInputShellCoordinator.updateSendButtonState();
  }

  /** Render a message */
  private async renderMessage(message: ChatMessage) {
    if (message.role === 'assistant') {
      return this.assistantShellViewHostAdapter.renderPersistedAssistantMessage({
        message,
      });
    }

    const turn = this.createTurn();
    const parentEl = turn?.headerEl;
    const messageEl = parentEl?.createDiv({
      cls: `opencodian-message opencodian-message--${message.role}`,
    });

    if (!messageEl) return;
    const runtime = this.getTabRuntimeState();
    runtime?.turnBodyByAnchorKey.set(this.getMessageAnchorKey(message), turn.bodyEl);
    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
    }

    // Content container
    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });

    const copyContent = await this.renderUserMessageContent(content, message);
    this.addUserMessageFooter(messageEl, message, copyContent);

    return messageEl;
  }

  private async renderAssistantMessageBody(
    content: HTMLElement,
    message: ChatMessage,
  ): Promise<void> {
    const questionResolutionRenderPlan = buildQuestionResolutionCardRenderPlan({
      contentBlocks: message.contentBlocks,
      questionResolution: message.questionResolution,
      shouldRenderQuestionResolutionCard: this.shouldRenderQuestionResolutionCards(),
    });

    if (questionResolutionRenderPlan.hasContentBlocks) {
      await renderAssistantStructuredContent({
        containerEl: content,
        questionResolutionRenderPlan,
        renderContentBlock: async (containerEl, block) => {
          await this.renderContentBlock(containerEl, block);
        },
      });
    } else {
      await renderAssistantPlainTextFallbackContent({
        containerEl: content,
        messageContent: message.content,
        markdownService: this.markdownService,
        questionResolutionRenderPlan,
      });
    }
  }

  private getAssistantBodySignature(message: ChatMessage): string {
    return JSON.stringify({
      displayStyle: message.displayStyle ?? null,
      content: message.content,
      omo: message.omo ?? null,
      questionResolution: message.questionResolution ? {
        requestId: message.questionResolution.request.id,
        status: message.questionResolution.status,
        answers: message.questionResolution.answers ?? null,
      } : null,
      contentBlocks: (message.contentBlocks ?? []).map((block) => ({
        type: block.type,
        text: block.text ?? null,
        thinking: block.thinking ?? null,
        durationSeconds: block.durationSeconds ?? null,
        toolId: block.toolId ?? null,
        toolName: block.toolName ?? null,
        toolKind: block.toolKind ?? null,
        toolInput: block.toolInput ?? null,
        toolStatus: block.toolStatus ?? null,
        toolResult: block.toolResult ?? null,
        subagentId: block.subagentId ?? null,
        subagentMode: block.subagentMode ?? null,
      })),
    });
  }

  private async renderUserMessageContent(container: HTMLElement, message: ChatMessage): Promise<string> {
    const visibleText = this.getVisibleUserMessageText(message);
    if (visibleText) {
      const textEl = container.createDiv({ cls: 'opencodian-message-text' });
      const displayText = this.plugin.settings.renderUserMarkupAsCodeBlocks
        ? prepareUserMessageMarkdownForDisplay(visibleText)
        : visibleText;
      await this.renderMarkdownInto(textEl, displayText);
      const collapseToggleEl = container.createEl('button');
      const collapsibleState: CollapsibleState = {
        isExpanded: false,
        isCollapsible: false,
      };
      setupCollapsible({
        wrapperEl: container,
        headerEl: collapseToggleEl,
        contentEl: textEl,
        state: collapsibleState,
        options: {
          showMoreLabel: t('chat.action.showMore'),
          showLessLabel: t('chat.action.showLess'),
        },
      });
    }

    if (message.contextAttachments && message.contextAttachments.length > 0) {
      this.renderUserContextAttachments(container, message.contextAttachments);
    }

    if (message.omo?.kind === 'user-injection') {
      await this.renderOmoUserInjection(container, message);
    }

    return visibleText;
  }

  private renderUserContextAttachments(
    container: HTMLElement,
    attachments: NonNullable<ChatMessage['contextAttachments']>,
  ): void {
    const listEl = container.createDiv({ cls: 'opencodian-user-context-list' });

    for (const attachment of attachments) {
      const openBtn = listEl.createEl('button', {
        cls: 'opencodian-user-context-chip opencodian-composer-context-chip is-attached',
        text: attachment.label,
        attr: {
          type: 'button',
          title: attachment.path,
          'aria-label': `${this.getContextKindLabel(attachment.kind)}: ${attachment.label}`,
        },
      });
      openBtn.dataset.contextKind = attachment.kind;
      if (attachment.kind === 'selection') {
        openBtn.addClass('is-selection');
      }
      openBtn.addEventListener('click', () => {
        void this.app.workspace.openLinkText(attachment.path, '', 'tab');
      });
    }
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
    setupCollapsible({
      wrapperEl: rawWrapperEl,
      headerEl: rawToggleEl,
      contentEl: rawContentEl,
      state: rawState,
      options: {
        collapsedHeight: 96,
        showMoreLabel: t('chat.omo.injected.showRaw'),
        showLessLabel: t('chat.omo.injected.hideRaw'),
      },
    });
  }

  private async renderMessages(messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) {
      if (this.currentConversationRevertState?.messageID) {
        await this.renderMessage(this.createEmptyConversationNoticeMessage());
      }
      return;
    }

    for (const message of this.getMessagesForRender(messages)) {
      await this.renderMessage(message);
    }
  }

  private armBackgroundTaskIndicatorForUserMessage(
    message: ChatMessage,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    this.backgroundTaskTimelineService.armIndicatorForUserMessage(message, tabId);
  }

  private resetBackgroundTaskIndicator(tabId: TabId | null = this.getActiveTabId()): void {
    this.backgroundTaskTimelineService.resetIndicatorState(tabId);
  }

  private collectBackgroundTaskSegments(
    messages: ChatMessage[],
    tabId: TabId | null = this.getActiveTabId(),
  ): BackgroundTaskSegment[] {
    return this.backgroundTaskTimelineService.collectSegments(messages, tabId);
  }

  private syncBackgroundTaskStateFromConversation(
    conversation: Conversation | null = this.currentConversation,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    this.backgroundTaskTimelineService.syncStateFromConversation(conversation, tabId);
  }

  private collectBackgroundTaskDiagnostics(messages: ChatMessage[]): {
    anchorKey: string;
    completed: BackgroundTaskCompletionInfo[];
    pending: BackgroundTaskLaunchInfo[];
    sawAllTasksComplete: boolean;
  } | null {
    return this.backgroundTaskTimelineService.collectDiagnostics(messages);
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

  private async renderBackgroundTaskIndicatorIfNeeded(
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    await this.backgroundTaskIndicatorCoordinator.renderIfNeeded(tabId);
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
        if (isInternalStructuredOutputTool(block.toolName)) {
          break;
        }

        if (block.toolName && block.toolId) {
          const toolRenderer = new ToolCallRenderer();
          const toolCall: ToolCallInfo = {
            id: block.toolId,
            name: block.toolName,
            kind: block.toolKind,
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

  private getClientOnlyMessagesToPreserveOnSync(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
  ): ChatMessage[] {
    return existingMessages.filter((message) => {
      if (message.displayStyle === 'notice') {
        if (!message.sourceMessageId) {
          return true;
        }

        return !syncedMessages.some((candidate) => candidate.sourceMessageId === message.sourceMessageId);
      }

      if (
        message.role !== 'assistant'
        || message.streamState !== 'interrupted'
      ) {
        return false;
      }

      const hasVisibleContent = Boolean(
        message.content?.trim()
        || (message.contentBlocks?.length ?? 0) > 0,
      );
      if (!hasVisibleContent) {
        return false;
      }

      if (message.sourceMessageId) {
        return !syncedMessages.some((candidate) => candidate.sourceMessageId === message.sourceMessageId);
      }

      return true;
    });
  }

  private shouldRenderConversationMessage(message: ChatMessage): boolean {
    if (this.isBackgroundTaskCompletionReminder(message)) {
      return false;
    }

    if (message.role !== 'assistant' || message.displayStyle === 'notice') {
      return true;
    }

    return Boolean(
      message.content?.trim()
      || (message.contentBlocks?.length ?? 0) > 0
      || (message.toolCalls?.length ?? 0) > 0
      || message.questionResolution
      || message.omo,
    );
  }

  private setStreamingAssistantMessageVisibility(
    messageEl: HTMLElement | null,
    visible: boolean,
    reason = 'unspecified',
  ): void {
    if (!messageEl) {
      return;
    }

    const previousHidden = messageEl.hidden;
    const nextHidden = !visible;
    messageEl.hidden = nextHidden;

    if (previousHidden !== nextHidden) {
      this.logAssistantFinalizationDebug('stream-visibility-changed', {
        reason,
        messageId: messageEl.dataset.messageId ?? null,
        sourceMessageId: messageEl.dataset.sourceMessageId ?? null,
        hidden: nextHidden,
        hasStreamingClass: messageEl.classList.contains('is-streaming'),
      });
    }
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
    buttonEl.removeAttribute('title');
    buttonEl.removeAttribute('aria-label');
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

  private removeEmptyAssistantShells(): void {
    if (!this.messagesContainer) {
      return;
    }

    const assistantMessages = this.messagesContainer.querySelectorAll<HTMLElement>(
      '.opencodian-message--assistant:not(.opencodian-message--notice):not(.opencodian-message--background-task)',
    );

    for (const messageEl of assistantMessages) {
      const contentEl = messageEl.querySelector(':scope > .opencodian-message-content');
      if (!(contentEl instanceof HTMLElement)) {
        continue;
      }

      const hasStructuredContent = Boolean(
        contentEl.querySelector(
          '.streaming-text-block, .opencodian-message-text, .streaming-error-block, .streaming-tool-call, .streaming-thinking-block, .opencodian-permission-inline, .opencodian-question-inline, .opencodian-chat-notice-card, .opencodian-pending',
        ),
      );
      const hasVisibleText = Boolean(contentEl.textContent?.trim());

      if (!hasStructuredContent && !hasVisibleText) {
        messageEl.remove();
      }
    }
  }

  private mergeSyncedMessageModelIds(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
    verbose = true,
  ): ChatMessage[] {
    const modelIdBySourceMessageId = new Map<string, string>();
    const messageBySourceMessageId = new Map<string, ChatMessage>();
    const fallbackAssistantMessages = existingMessages.filter(
      (message) => message.role === 'assistant' && message.modelId && !message.sourceMessageId,
    );

    for (const message of existingMessages) {
      if (message.role !== 'assistant' || !message.modelId || !message.sourceMessageId) {
        if (message.sourceMessageId) {
          messageBySourceMessageId.set(message.sourceMessageId, message);
        }
        continue;
      }

      modelIdBySourceMessageId.set(message.sourceMessageId, message.modelId);
      messageBySourceMessageId.set(message.sourceMessageId, message);
    }

    const mergedMessages = syncedMessages.map((message) => {
      const existingMessage = message.sourceMessageId
        ? messageBySourceMessageId.get(message.sourceMessageId)
        : undefined;
      const mergedMessage = existingMessage
        ? this.mergeClientOnlyMessageFields(existingMessage, message, verbose)
        : message;

      if (mergedMessage.role !== 'assistant') {
        return mergedMessage;
      }

      const persistedModelId = mergedMessage.sourceMessageId
        ? modelIdBySourceMessageId.get(mergedMessage.sourceMessageId)
        : undefined;

      return persistedModelId
        ? { ...mergedMessage, modelId: persistedModelId }
        : mergedMessage;
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

  private mergeClientOnlyMessageFields(existingMessage: ChatMessage, syncedMessage: ChatMessage, verbose = true): ChatMessage {
    const contextAttachments = this.mergeSyncedMessageContextAttachments(existingMessage, syncedMessage);
    const content = this.mergeSyncedMessageContent(existingMessage, syncedMessage);
    const contentBlocks = this.mergeSyncedMessageContentBlocks(existingMessage, syncedMessage);
    const toolCalls = this.mergeSyncedMessageToolCalls(existingMessage, syncedMessage);
    const preservedFlags = this.getClientOnlyMessagePreservationFlags(
      existingMessage,
      syncedMessage,
      { content, contentBlocks, toolCalls },
    );
    this.logClientOnlyMessageFieldPreservation(existingMessage, syncedMessage, preservedFlags, verbose);

    return {
      ...syncedMessage,
      content,
      contentBlocks,
      toolCalls,
      contextAttachments,
      questionResolution: syncedMessage.questionResolution ?? existingMessage.questionResolution,
      streamState: syncedMessage.streamState ?? existingMessage.streamState,
      structured: syncedMessage.structured ?? existingMessage.structured,
      parts: syncedMessage.parts ?? existingMessage.parts,
    };
  }

  private mergeSyncedMessageContextAttachments(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): ChatMessage['contextAttachments'] {
    const existingAttachments = existingMessage.contextAttachments;
    const syncedAttachments = syncedMessage.contextAttachments;
    if (!existingAttachments?.length) {
      return syncedAttachments;
    }

    if (!syncedAttachments?.length) {
      return existingAttachments;
    }

    return syncedAttachments.map((attachment) =>
      existingAttachments.find((candidate) => this.isMatchingMessageContextAttachment(candidate, attachment))
      ?? attachment,
    );
  }

  private isMatchingMessageContextAttachment(
    left: NonNullable<ChatMessage['contextAttachments']>[number],
    right: NonNullable<ChatMessage['contextAttachments']>[number],
  ): boolean {
    return left.path === right.path
      && left.lineRange?.startLine === right.lineRange?.startLine
      && left.lineRange?.endLine === right.lineRange?.endLine;
  }

  private mergeSyncedMessageContent(existingMessage: ChatMessage, syncedMessage: ChatMessage): string {
    if (!syncedMessage.content?.trim() && existingMessage.content?.trim()) {
      return existingMessage.content;
    }

    return syncedMessage.content;
  }

  private mergeSyncedMessageContentBlocks(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): ChatMessage['contentBlocks'] {
    return this.shouldPreserveExistingAssistantContentBlocks(existingMessage, syncedMessage)
      ? existingMessage.contentBlocks
      : syncedMessage.contentBlocks;
  }

  private mergeSyncedMessageToolCalls(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): ChatMessage['toolCalls'] {
    if (syncedMessage.toolCalls?.length) {
      return syncedMessage.toolCalls;
    }

    if (existingMessage.toolCalls?.length) {
      return existingMessage.toolCalls;
    }

    return syncedMessage.toolCalls;
  }

  private getClientOnlyMessagePreservationFlags(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    mergedFields: Pick<ChatMessage, 'content' | 'contentBlocks' | 'toolCalls'>,
  ): Record<string, boolean> {
    return {
      preservedExistingContent:
        mergedFields.content === existingMessage.content && mergedFields.content !== syncedMessage.content,
      preservedExistingContentBlocks: mergedFields.contentBlocks === existingMessage.contentBlocks,
      preservedExistingToolCalls:
        mergedFields.toolCalls === existingMessage.toolCalls && mergedFields.toolCalls !== syncedMessage.toolCalls,
      preservedExistingStructured: syncedMessage.structured === undefined && existingMessage.structured !== undefined,
      preservedExistingParts: syncedMessage.parts === undefined && existingMessage.parts !== undefined,
    };
  }

  private logClientOnlyMessageFieldPreservation(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    preservedFlags: Record<string, boolean>,
    verbose: boolean,
  ): void {
    if (!verbose || !Object.values(preservedFlags).some(Boolean)) {
      return;
    }

    this.logAssistantFinalizationDebug('merge-client-only-message-fields', {
      existingMessage: this.summarizeChatMessageForDebug(existingMessage),
      syncedMessage: this.summarizeChatMessageForDebug(syncedMessage),
      preservedFlags,
    });
  }

  private shouldPreserveExistingAssistantContentBlocks(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): boolean {
    if (existingMessage.role !== 'assistant') {
      return false;
    }

    const existingBlocks = existingMessage.contentBlocks;
    if (!existingBlocks || existingBlocks.length === 0) {
      return false;
    }

    const syncedBlocks = syncedMessage.contentBlocks;
    if (!syncedBlocks || syncedBlocks.length === 0) {
      return true;
    }

    const existingHasRichBlocks = this.hasRichAssistantContentBlocks(existingBlocks);
    const syncedHasRichBlocks = this.hasRichAssistantContentBlocks(syncedBlocks);
    if (existingHasRichBlocks && !syncedHasRichBlocks) {
      return this.getAssistantTextBlockSignature(existingBlocks, existingMessage.content)
        === this.getAssistantTextBlockSignature(syncedBlocks, syncedMessage.content);
    }

    if (existingBlocks.length <= syncedBlocks.length) {
      return false;
    }

    return this.getAssistantTextBlockSignature(existingBlocks, existingMessage.content)
      === this.getAssistantTextBlockSignature(syncedBlocks, syncedMessage.content);
  }

  private hasRichAssistantContentBlocks(blocks: ContentBlock[]): boolean {
    return blocks.some((block) => block.type !== 'text');
  }

  private getAssistantTextBlockSignature(blocks: ContentBlock[] | undefined, fallbackContent: string): string {
    if (!blocks || blocks.length === 0) {
      return fallbackContent.trim();
    }

    return blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join('\n\n');
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
      const hydration = await this.getLatestServerUserMessageHydration(sessionId);
      if (!hydration) {
        return;
      }

      this.logLatestServerUserMessageHydration(sessionId, optimisticMessageId, hydration);
      const optimisticIndex = conversation.messages.findIndex(
        (message) => message.id === optimisticMessageId,
      );
      if (optimisticIndex < 0) {
        return;
      }

      const optimisticMessage = conversation.messages[optimisticIndex];
      const hydratedMessage = hydration.hydratedMessage;
      if (this.hasVisibleTextMismatchForHydratedUserMessage(
        optimisticMessage,
        hydratedMessage,
        {
          sessionId,
          optimisticMessageId,
          rawServerUserText: hydration.rawServerUserText,
        },
      )) {
        return;
      }

      const mergedHydratedMessage = this.mergeClientOnlyMessageFields(optimisticMessage, hydratedMessage);
      if (!this.hasHydratedOptimisticUserMessageChanged(optimisticMessage, mergedHydratedMessage)) {
        this.logSkippedUnchangedHydratedUserMessage(sessionId, optimisticMessageId, hydratedMessage);
        return;
      }

      await this.applyHydratedOptimisticUserMessage({
        conversation,
        optimisticIndex,
        optimisticMessage,
        mergedHydratedMessage,
        tabId,
      });
      logger.debug(`Applied hydrated server user message to optimistic bubble: ${this.stringifyLogPayload({
        sessionId,
        optimisticMessageId,
        sourceMessageId: mergedHydratedMessage.sourceMessageId ?? null,
        omoDetected: Boolean(mergedHydratedMessage.omo),
        omoKind: mergedHydratedMessage.omo?.kind ?? null,
      })}`);
    } catch (error) {
      logger.debug('Failed to hydrate optimistic user message from server', error);
    }
  }

  private async getLatestServerUserMessageHydration(
    sessionId: string,
  ): Promise<LatestServerUserMessageHydration | null> {
    const serverMessages = await this.plugin.openCodeService.getSessionMessages(sessionId);
    const latestServerUser = [...serverMessages]
      .reverse()
      .find(({ info }) => info.role === 'user');
    if (!latestServerUser) {
      return null;
    }

    const hydratedMessage = this.plugin.openCodeService.hydrateOpenCodeMessage(
      latestServerUser.info,
      latestServerUser.parts,
      getVaultBasePath(this.app) ?? undefined,
    );
    const rawServerUserText = latestServerUser.parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('');

    return { hydratedMessage, rawServerUserText };
  }

  private logLatestServerUserMessageHydration(
    sessionId: string,
    optimisticMessageId: string,
    hydration: LatestServerUserMessageHydration,
  ): void {
    const { hydratedMessage, rawServerUserText } = hydration;
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
  }

  private hasVisibleTextMismatchForHydratedUserMessage(
    optimisticMessage: ChatMessage,
    hydratedMessage: ChatMessage,
    context: HydratedUserMessageMismatchContext,
  ): boolean {
    const optimisticVisibleText = this.getVisibleUserMessageText(optimisticMessage).trim();
    const hydratedVisibleText = this.getVisibleUserMessageText(hydratedMessage).trim();
    if (!optimisticVisibleText || !hydratedVisibleText || optimisticVisibleText === hydratedVisibleText) {
      return false;
    }

    logger.debug(`Skipped optimistic user message hydration due to visible text mismatch: ${this.stringifyLogPayload({
      sessionId: context.sessionId,
      optimisticMessageId: context.optimisticMessageId,
      optimisticVisibleTextPreview: this.getLogPreview(optimisticVisibleText),
      hydratedVisibleTextPreview: this.getLogPreview(hydratedVisibleText),
      rawTextPreview: this.getLogPreview(context.rawServerUserText),
      omoDetected: Boolean(hydratedMessage.omo),
      omoKind: hydratedMessage.omo?.kind ?? null,
    })}`);
    return true;
  }

  private hasHydratedOptimisticUserMessageChanged(
    optimisticMessage: ChatMessage,
    mergedHydratedMessage: ChatMessage,
  ): boolean {
    return optimisticMessage.sourceMessageId !== mergedHydratedMessage.sourceMessageId
      || optimisticMessage.content !== mergedHydratedMessage.content
      || JSON.stringify(optimisticMessage.omo ?? null) !== JSON.stringify(mergedHydratedMessage.omo ?? null)
      || JSON.stringify(optimisticMessage.contextAttachments ?? null)
        !== JSON.stringify(mergedHydratedMessage.contextAttachments ?? null);
  }

  private logSkippedUnchangedHydratedUserMessage(
    sessionId: string,
    optimisticMessageId: string,
    hydratedMessage: ChatMessage,
  ): void {
    logger.debug(`Skipped optimistic user message hydration because nothing changed: ${this.stringifyLogPayload({
      sessionId,
      optimisticMessageId,
      sourceMessageId: hydratedMessage.sourceMessageId ?? null,
      omoDetected: Boolean(hydratedMessage.omo),
      omoKind: hydratedMessage.omo?.kind ?? null,
    })}`);
  }

  private async applyHydratedOptimisticUserMessage(
    update: HydratedOptimisticUserMessageUpdate,
  ): Promise<void> {
    const { conversation, optimisticIndex, optimisticMessage, mergedHydratedMessage, tabId } = update;
    conversation.messages.splice(optimisticIndex, 1, mergedHydratedMessage);
    this.armBackgroundTaskIndicatorForUserMessage(mergedHydratedMessage, tabId);
    this.updateHydratedUserMessageRuntimeAnchors(conversation, optimisticMessage, mergedHydratedMessage, tabId);
    await this.plugin.saveConversation(conversation);

    if (this.currentConversation?.id !== conversation.id || this.getActiveTabId() !== tabId) {
      return;
    }

    await this.rerenderSingleUserMessage(optimisticMessage.id, mergedHydratedMessage);
    await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
  }

  private updateHydratedUserMessageRuntimeAnchors(
    conversation: Conversation,
    optimisticMessage: ChatMessage,
    mergedHydratedMessage: ChatMessage,
    tabId: TabId | null,
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const previousAnchorKey = this.getMessageAnchorKey(optimisticMessage);
    const nextAnchorKey = this.getMessageAnchorKey(mergedHydratedMessage);
    const bodyEl = runtime.turnBodyByAnchorKey.get(previousAnchorKey);
    if (bodyEl) {
      runtime.turnBodyByAnchorKey.delete(previousAnchorKey);
      runtime.turnBodyByAnchorKey.set(nextAnchorKey, bodyEl);
    }
    runtime.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(conversation.messages);
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
    this.userMessageFooterRenderer.render(messageEl, message, content);
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

  private createEmptyConversationNoticeMessage(): ChatMessage {
    const rewound = Boolean(this.currentConversationRevertState?.messageID);

    return {
      id: rewound ? 'opencodian-empty-rewind' : 'opencodian-empty-state',
      role: 'assistant',
      content: rewound
        ? t('chat.rewind.empty.description')
        : t('chat.empty.description'),
      timestamp: Date.now(),
      displayStyle: 'notice',
      noticeTitle: rewound
        ? t('chat.rewind.empty.title')
        : t('chat.empty.title'),
      noticeTone: rewound ? 'warning' : 'info',
      noticeActions: rewound ? [{ type: 'restore_rewind' }] : undefined,
    };
  }

  private getInputPlaceholder(): string {
    return t('chat.input.placeholder');
  }

  private async handleRestoreRewindRequest(): Promise<void> {
    if (this.isActiveTabStreaming()) {
      new Notice(t('chat.rewind.streamingBlocked'));
      return;
    }

    if (!this.currentConversation?.openCodeSessionId) {
      new Notice(t('chat.rewind.restoreFailed'));
      return;
    }

    try {
      const restored = await this.plugin.openCodeService.unrevertSession(
        this.currentConversation.openCodeSessionId,
      );
      if (!restored) {
        new Notice(t('chat.rewind.restoreFailed'));
        return;
      }

      await this.loadConversation(this.currentConversation.id, { forceServerSync: true });
      new Notice(t('chat.rewind.restoreSuccess'));
    } catch (error) {
      logger.error('Failed to restore rewound conversation:', error);
      new Notice(t('chat.rewind.restoreFailed'));
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

      const forkMessages = this.cloneMessagesBefore(message);
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

      this.tabConversationStateBridge.syncActiveTabConversation(forkConversation);
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
    reason = 'unspecified',
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<{
    messages: ChatMessage[];
    changed: boolean;
    fingerprint: string;
    revertState: ConversationRevertState | null;
  }> {
    const verbose = !options?.suppressVerboseLogs;
    try {
      const syncContext = { conversation, tabId, reason, verbose };
      this.logConversationServerSyncBegin(syncContext);
      const snapshot = await this.getConversationServerSyncSnapshot(conversation);
      this.logConversationServerSyncFetched(syncContext, snapshot);
      this.logOmoBackgroundTaskDiagnostics(conversation, conversation.messages, snapshot.convertedServerMessages);
      const syncMerge = this.getConversationServerSyncMerge(syncContext, snapshot);

      await this.applyConversationServerSyncMessages(conversation, syncMerge.merged, syncMerge.changed);

      this.markBackgroundTaskAuthoritativeSync(tabId, reason);

      await this.refreshContextUsageAfterActiveConversationSync(conversation, tabId);
      this.logConversationServerSyncComplete(conversation, reason, snapshot, syncMerge);
      this.logConversationServerSyncFinished(syncContext, snapshot, syncMerge);
      return {
        messages: syncMerge.merged,
        changed: syncMerge.changed,
        fingerprint: syncMerge.fingerprint,
        revertState: snapshot.revertState,
      };
    } catch (error) {
      logger.error('Failed to sync conversation messages from server:', error);
      const fingerprint = this.getConversationSyncFingerprint(conversation.messages);
      this.logAssistantFinalizationDebug('server-sync-failed', {
        reason,
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        tabId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return {
        messages: conversation.messages,
        changed: false,
        fingerprint,
        revertState: this.currentConversation?.id === conversation.id
          ? this.currentConversationRevertState
          : null,
      };
    }
  }

  private logConversationServerSyncBegin(context: ConversationServerSyncContext): void {
    if (!context.verbose) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.logAssistantFinalizationDebug('server-sync-begin', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      existingMessageCount: conversation.messages.length,
      localTailAssistant: this.summarizeChatMessageForDebug(
        [...conversation.messages].reverse().find((message) => message.role === 'assistant'),
      ),
    });
  }

  private async getConversationServerSyncSnapshot(
    conversation: Conversation,
  ): Promise<ConversationServerSyncSnapshot> {
    const serverMessages = await this.plugin.openCodeService.getSessionMessages(conversation.openCodeSessionId);
    const revertState = await this.getConversationServerSyncRevertState(conversation, serverMessages);
    const convertedServerMessages = serverMessages
      .map(({ info, parts }) =>
        this.plugin.openCodeService.hydrateOpenCodeMessage(info, parts, getVaultBasePath(this.app) ?? undefined),
      )
      .filter((message) => this.shouldRenderConversationMessage(message));

    return { serverMessages, convertedServerMessages, revertState };
  }

  private async getConversationServerSyncRevertState(
    conversation: Conversation,
    serverMessages: OpenCodeSessionMessages,
  ): Promise<ConversationRevertState | null> {
    if (serverMessages.length > 0) {
      return null;
    }

    return this.plugin.openCodeService.getSessionRevertState(conversation.openCodeSessionId);
  }

  private logConversationServerSyncFetched(
    context: ConversationServerSyncContext,
    snapshot: ConversationServerSyncSnapshot,
  ): void {
    if (!context.verbose) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.logAssistantFinalizationDebug('server-sync-fetched', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      serverMessageCount: snapshot.serverMessages.length,
      convertedMessageCount: snapshot.convertedServerMessages.length,
      serverTailAssistant: this.summarizeChatMessageForDebug(
        [...snapshot.convertedServerMessages].reverse().find((message) => message.role === 'assistant'),
      ),
    });
  }

  private getConversationServerSyncMerge(
    context: ConversationServerSyncContext,
    snapshot: ConversationServerSyncSnapshot,
  ): ConversationServerSyncMergeResult {
    const { conversation, tabId, verbose } = context;
    const converted = this.mergeSyncedMessageModelIds(
      conversation.messages,
      snapshot.convertedServerMessages,
      verbose,
    );
    const preservedClientOnlyMessages = this.getClientOnlyMessagesToPreserveOnSync(
      conversation.messages,
      converted,
    );
    this.logPreservedInterruptedMessagesDuringSync(conversation, tabId, preservedClientOnlyMessages);

    const merged = [...converted, ...preservedClientOnlyMessages]
      .sort((left, right) => left.timestamp - right.timestamp);
    this.logConversationServerSyncMerged(context, merged, preservedClientOnlyMessages);

    const fingerprint = this.getConversationSyncFingerprint(merged);
    const previousFingerprint = this.getTabRuntimeState(tabId)?.lastConversationSyncFingerprint
      ?? this.getConversationSyncFingerprint(conversation.messages);

    return {
      merged,
      preservedClientOnlyMessages,
      fingerprint,
      changed: fingerprint !== previousFingerprint,
    };
  }

  private logPreservedInterruptedMessagesDuringSync(
    conversation: Conversation,
    tabId: TabId | null,
    preservedClientOnlyMessages: ChatMessage[],
  ): void {
    const preservedInterruptedMessages = preservedClientOnlyMessages.filter(
      (message) => message.streamState === 'interrupted',
    );
    const runtime = this.getTabRuntimeState(tabId);
    const preservedInterruptedLogFingerprint = preservedInterruptedMessages.length > 0
      ? this.getInterruptedSyncPreservationLogFingerprint(conversation, preservedInterruptedMessages)
      : null;

    this.logPreservedInterruptedMessagesIfNeeded(
      conversation,
      preservedInterruptedMessages,
      runtime,
      preservedInterruptedLogFingerprint,
    );
    if (runtime) {
      runtime.lastInterruptedSyncPreservationLogFingerprint = preservedInterruptedLogFingerprint;
    }
  }

  private logPreservedInterruptedMessagesIfNeeded(
    conversation: Conversation,
    preservedInterruptedMessages: ChatMessage[],
    runtime: TabRuntimeState | null,
    preservedInterruptedLogFingerprint: string | null,
  ): void {
    if (preservedInterruptedMessages.length === 0) {
      return;
    }

    if (runtime?.lastInterruptedSyncPreservationLogFingerprint === preservedInterruptedLogFingerprint) {
      return;
    }

    logger.debug(`Preserving local interrupted assistant message(s) during conversation sync: ${this.stringifyLogPayload({
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      count: preservedInterruptedMessages.length,
      messages: preservedInterruptedMessages.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        contentPreview: this.getLogPreview(message.content, 120),
        contentBlockCount: message.contentBlocks?.length ?? 0,
      })),
    })}`);
  }

  private logConversationServerSyncMerged(
    context: ConversationServerSyncContext,
    merged: ChatMessage[],
    preservedClientOnlyMessages: ChatMessage[],
  ): void {
    if (!context.verbose) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.logAssistantFinalizationDebug('server-sync-merged', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      mergedMessageCount: merged.length,
      preservedClientOnlyMessageCount: preservedClientOnlyMessages.length,
      mergedTailAssistant: this.summarizeChatMessageForDebug(
        [...merged].reverse().find((message) => message.role === 'assistant'),
      ),
    });
  }

  private async applyConversationServerSyncMessages(
    conversation: Conversation,
    merged: ChatMessage[],
    changed: boolean,
  ): Promise<void> {
    conversation.messages = merged;
    if (!changed) {
      return;
    }

    conversation.updatedAt = Date.now();
    await this.plugin.saveConversation(conversation);
  }

  private async refreshContextUsageAfterActiveConversationSync(
    conversation: Conversation,
    tabId: TabId | null,
  ): Promise<void> {
    if (this.currentConversation?.id !== conversation.id || this.getActiveTabId() !== tabId) {
      return;
    }

    await this.activeTabContextUsageCoordinator.refreshFromServer();
  }

  private logConversationServerSyncComplete(
    conversation: Conversation,
    reason: string,
    snapshot: ConversationServerSyncSnapshot,
    syncMerge: ConversationServerSyncMergeResult,
  ): void {
    if (!syncMerge.changed) {
      return;
    }

    logger.debug('Conversation sync complete', {
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      reason,
      serverMessageCount: snapshot.serverMessages.length,
      mergedMessageCount: syncMerge.merged.length,
      preservedClientOnlyMessageCount: syncMerge.preservedClientOnlyMessages.length,
      revertApplied: Boolean(snapshot.revertState),
      revertMessageId: snapshot.revertState?.messageID ?? null,
      changed: syncMerge.changed,
    });
  }

  private logConversationServerSyncFinished(
    context: ConversationServerSyncContext,
    snapshot: ConversationServerSyncSnapshot,
    syncMerge: ConversationServerSyncMergeResult,
  ): void {
    if (!context.verbose && !syncMerge.changed) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.logAssistantFinalizationDebug('server-sync-finished', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      changed: syncMerge.changed,
      fingerprint: syncMerge.fingerprint,
      revertApplied: Boolean(snapshot.revertState),
      revertMessageId: snapshot.revertState?.messageID ?? null,
    });
  }

  private async rerenderConversationMessages(conversation: Conversation): Promise<void> {
    await this.conversationRenderService.rerenderConversationMessages(conversation);
  }

  private getMessagesForRender(messages: ChatMessage[]): ChatMessage[] {
    return buildMessageRenderGroups(messages.filter((message) => this.shouldRenderConversationMessage(message))).map((group) =>
      group.mergedAssistant && group.messages.length > 1
        ? mergeAssistantMessagesForRender(group.messages)
        : group.messages[0],
    );
  }

  private async patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<boolean> {
    return this.conversationRenderService.patchTrailingAssistantRender(previousMessages, nextMessages, tabId);
  }

  private async applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void> {
    await this.conversationRenderService.applySyncedConversationUpdate(previousMessages, nextMessages);
  }

  private getIncrementalRenderedMessageUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): IncrementalRenderedMessageUpdate | null {
    return getConversationIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => this.getMessagesForRender(messages),
      getMessageVisualSignature: (message) => this.getMessageVisualSignature(message),
    });
  }

  private shouldPseudoStreamSyncedAssistantMessage(message: ChatMessage): boolean {
    if (message.role !== 'assistant' || message.displayStyle === 'notice') {
      return false;
    }

    if (message.questionResolution) {
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
    const { messageEl, contentEl } = this.assistantShellViewHostAdapter.createAssistantMessageElement();
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
    this.assistantShellViewHostAdapter.finalizePseudoStreamFooter(messageEl, message);
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

  private isNearBottom(threshold?: number): boolean {
    if (!this.messagesContainer) {
      return true;
    }

    return isElementNearBottom(this.messagesContainer, threshold);
  }

  private cloneMessagesBefore(targetMessage: ChatMessage): ChatMessage[] {
    if (!this.currentConversation) {
      return [];
    }

    return cloneMessagesBeforeForkTarget(this.currentConversation.messages, targetMessage);
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
        const conversation = await this.plugin.getConversationById(
          generatedConversationId,
          { preferCache: true },
        );
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
    const conversation = await this.plugin.getConversationById(conversationId, {
      preferCache: true,
    });
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

  /** Scroll to bottom of messages */
  private scrollToBottom(options: {
    tabId?: TabId | null;
    behavior?: ScrollBehavior;
    enableAutoScroll?: boolean;
  } = {}): void {
    const tabId = options.tabId ?? this.getActiveTabId();
    if (!tabId) {
      return;
    }

    this.tabMessagesPaneCoordinator.scrollToBottom(tabId, options);
  }

  private shouldAutoScroll(tabId: TabId | null = this.getActiveTabId()): boolean {
    return this.plugin.settings.enableAutoScroll
      && (this.getTabRuntimeState(tabId)?.autoScrollEnabled ?? true);
  }

  private scrollToBottomIfNeeded(
    shouldScroll = this.shouldAutoScroll(),
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    if (!shouldScroll) {
      return;
    }

    this.scrollToBottom({ tabId });
  }

  private scheduleSettledScrollToBottomIfNeeded(
    shouldScroll = this.shouldAutoScroll(),
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    if (!shouldScroll) {
      return;
    }

    this.scheduleSettledScrollToBottom(tabId);
  }

  private scheduleSettledScrollToBottom(tabId: TabId | null = this.getActiveTabId()): void {
    this.clearScheduledScrollToBottom();
    this.scrollToBottomFrameId = window.requestAnimationFrame(() => {
      this.scrollToBottomFrameId = window.requestAnimationFrame(() => {
        this.scrollToBottomFrameId = null;
        this.scrollToBottom({ tabId });
      });
    });
  }

  private clearScheduledScrollToBottom(): void {
    if (this.scrollToBottomFrameId !== null) {
      window.cancelAnimationFrame(this.scrollToBottomFrameId);
      this.scrollToBottomFrameId = null;
    }
  }

  public async reloadModelCatalog(): Promise<void> {
    await this.chatSelectionControlsCoordinator.reloadModelCatalog();
  }

  /** Load available models from OpenCode service */
  private async loadAvailableModels(): Promise<void> {
    try {
      const catalogBundle = this.plugin.modelConfigService
        ? await this.plugin.modelConfigService.getCatalogs(
            this.plugin.settings.modelSourceMode,
            this.plugin.settings.disabledModelRefs,
          )
        : null;
      const providers = catalogBundle
        ? catalogBundle.effective.providers
        : (await this.plugin.openCodeService.getAvailableModels()).providers;
      this.hasLoadedModelCatalog = true;
      this.modelCatalogBundle = catalogBundle;
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

      this.activeTabContextUsageCoordinator.syncIdentity();
    } catch (error) {
      logger.error('Failed to load models:', error);
    }
  }

  private updateModelSelectorDisplay(): void {
    this.chatSelectionControlsCoordinator.updateModelSelectorDisplay();
  }

  /** Get current model for this session */
  private getCurrentSessionModel(): ModelSelectorSelection | null {
    const requestedModel = this.getRequestedSessionModel();
    if (!this.hasLoadedModelCatalog || !this.modelCatalogBundle) {
      return requestedModel;
    }

    const resolvedModel = resolvePreferredAvailableModel(
      this.modelCatalogBundle.effective,
      requestedModel?.provider,
      requestedModel?.model,
    );
    if (!resolvedModel) {
      return null;
    }

    return {
      provider: resolvedModel.provider,
      model: resolvedModel.model,
    };
  }

  private getRequestedSessionModel(): ModelSelectorSelection | null {
    const override = this.tabManager?.getActiveTabModelOverride() ?? null;
    if (override) {
      return override;
    }

    if (!this.plugin.settings.defaultProvider || !this.plugin.settings.defaultModel) {
      return null;
    }

    return {
      provider: this.plugin.settings.defaultProvider,
      model: this.plugin.settings.defaultModel,
    };
  }

  private getCurrentSessionModelResolution(): ResolvedModelSelection {
    const currentModel = this.getCurrentSessionModel();
    if (!currentModel) {
      return {
        status: 'unconfigured',
        provider: '',
        model: '',
        ref: '',
      };
    }

    if (!this.hasLoadedModelCatalog || !this.modelCatalogBundle) {
      return {
        status: 'available',
        provider: currentModel.provider,
        model: currentModel.model,
        ref: formatModelReference(currentModel.provider, currentModel.model),
      };
    }

    return resolveModelSelection(
      this.modelCatalogBundle.baseEffective,
      this.modelCatalogBundle.effective,
      currentModel.provider,
      currentModel.model,
    );
  }

  private findKnownModelInfo(
    selection: ModelSelectorSelection | null,
  ): ModelSelectorKnownModelInfo | null {
    if (!selection) {
      return null;
    }

    const availableModel = this.availableModels.find(
      (item) => item.provider === selection.provider && item.model === selection.model,
    );
    if (availableModel) {
      return availableModel;
    }

    const baseProvider = this.modelCatalogBundle?.baseEffective.providers.find(
      (provider) => provider.id === selection.provider,
    );
    const baseModel = baseProvider?.models.find((model) => model.id === selection.model);
    if (!baseProvider || !baseModel) {
      return null;
    }

    return {
      providerName: baseProvider.name,
      modelName: baseModel.name,
      contextWindow: baseModel.contextWindow,
    };
  }

  private formatModelId(
    model: Partial<ModelSelectorSelection> | null | undefined,
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
    this.activeTabContextUsageCoordinator.syncIdentity();

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
    if (!this.hasLoadedModelCatalog) {
      await this.reloadModelCatalog();
    }

    const resolution = this.modelCatalogBundle
      ? resolveModelSelection(this.modelCatalogBundle.baseEffective, this.modelCatalogBundle.effective, provider, model)
      : this.getCurrentSessionModelResolution();
    if (resolution.status !== 'available') {
      return false;
    }

    if (!provider || !model) {
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

  private async appendTurnDiffNoticeIfNeeded(
    conversation: Conversation,
    editedFiles: string[],
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    if (!conversation.openCodeSessionId || editedFiles.length === 0) {
      return;
    }

    const latestUserMessage = [...conversation.messages]
      .reverse()
      .find((message) => message.role === 'user' && message.sourceMessageId);
    if (!latestUserMessage?.sourceMessageId) {
      return;
    }

    const diffEntries = await this.plugin.openCodeService.getSessionDiff(
      conversation.openCodeSessionId,
      latestUserMessage.sourceMessageId,
    );
    const fallbackEntries: SessionDiffEntry[] = [...new Set(editedFiles)].map((file) => ({
      file,
      additions: 0,
      deletions: 0,
    }));
    const entries = diffEntries.length > 0 ? diffEntries : fallbackEntries;
    if (entries.length === 0) {
      return;
    }

    await this.persistentAssistantNoticeService.appendMessage({
      title: t('chat.diffNotice.title'),
      content: this.buildDiffNoticeMarkdown(entries),
      tone: 'info',
      conversation,
      tabId,
    });

    if (tabId === this.getActiveTabId()) {
      await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
    }
  }

  private buildDiffNoticeMarkdown(entries: SessionDiffEntry[]): string {
    const lines = entries.map((entry) => {
      const link = `[[${entry.file}]]`;
      const stats = entry.additions > 0 || entry.deletions > 0
        ? ` (+${entry.additions} / -${entry.deletions})`
        : '';
      const status = entry.status ? ` ${entry.status}` : '';
      return `- ${link}${status}${stats}`;
    });

    return [
      t('chat.diffNotice.description'),
      '',
      ...lines,
    ].join('\n');
  }

  private async appendModelUnavailableNoticeMessage(): Promise<void> {
    const { title, message } = this.getModelUnavailableNoticeContent();
    await this.persistentAssistantNoticeService.appendMessage({
      title,
      content: message,
      tone: 'warning',
      noticeActions: [{ type: 'open_model_settings' }],
    });
  }

  private getModelUnavailableNoticeContent(): { title: string; message: string } {
    const resolution = this.getCurrentSessionModelResolution();
    if (resolution.status === 'unconfigured') {
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
      case 'restore_rewind':
        await this.handleRestoreRewindRequest();
        return;
      default:
        return;
    }
  }

  /** Convert OpenCode stream chunk to streaming module format */
  private convertToStreamingChunk(
    chunk: import('../../core/types').StreamChunk
  ): import('../../utils/streaming').StreamChunk | null {


    switch (chunk.type) {
      case 'text':
        return { type: 'text', content: chunk.content };

      case 'thinking':
        return {
          type: 'thinking',
          content: chunk.content,
          partId: chunk.partId,
          durationSeconds: chunk.durationSeconds,
        };

      case 'tool_use':
        if (isInternalStructuredOutputTool(chunk.name)) {
          return null;
        }

        return {
          type: 'tool_use',
          id: chunk.id,
          name: chunk.name,
          kind: chunk.kind,
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
      case 'message_metadata':
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
    new ContextDetailModal(this.app, {
      conversation: this.currentConversation,
      contextState,
      systemPrompt: this.plugin.settings.systemPrompt,
      rawMessageLoader: async (): Promise<ContextRawMessageItem[]> => {
        const sessionId = this.currentConversation?.openCodeSessionId;
        if (!sessionId) {
          return [];
        }

        const messages = await this.plugin.openCodeService.getSessionMessages(sessionId);
        return messages.map(({ info, parts }) => ({
          id: info.id,
          role: info.role,
          createdAt: info.time.created ?? null,
          payload: JSON.stringify({
            message: info,
            parts,
          }, null, 2),
        }));
      },
    }).open();
  }

  private refreshContextUsageIndicator(): void {
    if (!this.contextRing) {
      return;
    }

    this.contextRing.update(this.tabManager?.getActiveTabContextUsage() ?? null);
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

  /** Switch permission mode and restart OpenCode service */
  private async switchPermissionMode(mode: PermissionMode): Promise<void> {
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

  private keepQuestionCardPinnedToBottom(tabId: TabId | null): void {
    if (this.getActiveTabId() !== tabId) {
      return;
    }

    this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
  }


  /** Show inline permission request card in the chat stream */
  private async showPermissionDialog(
    request: Extract<import('../../core/types').StreamChunk, { type: 'permission_request' }>,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const result = await this.permissionInlineCardRenderer.collectResponse(
      request,
      tabId,
    );
    if (!result) {
      logger.error('No streaming message element found for permission card');
      return;
    }

    // Send response to server
    try {
      await this.plugin.openCodeService.respondToPermission(request.id, result);
    } catch (error) {
      logger.error('Failed to respond to permission:', error);
      new Notice(t('permissionDialog.notice.error'));
    }
  }
}
