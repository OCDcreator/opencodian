/**
 * OpenCodian View
 *
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { Editor, EventRef, WorkspaceLeaf } from 'obsidian';
import { addIcon, Component, ItemView, MarkdownView, normalizePath, Notice, Scope } from 'obsidian';

import {
  type ResolvedModelSelection,
} from '../../core/config/modelConfig';
import type { SlashCommandMenuItem } from '../../core/config/slashCommandCatalog';
import {
  OpenCodeService,
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
  formatDurationMs,
  getPerformanceTimestampMs,
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
  type BackgroundTaskLiveSignalCoordinatorHostBuilderHost,
  createBackgroundTaskLiveSignalCoordinatorHost,
} from './services/BackgroundTaskLiveSignalCoordinator';
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
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
} from './services/ConversationAuthoritativeSyncCoordinator';
import {
  ConversationHistoryActionsCoordinator,
  type ConversationHistoryActionsHost,
} from './services/ConversationHistoryActionsCoordinator';
import {
  type ConversationHydrationRuntimeViewHost,
  createConversationHydrationRuntimeViewHosts,
} from './services/ConversationHydrationRuntimeViewHostFactory';
import {
  ConversationLoadRecoveryCoordinator,
  type ConversationLoadRecoveryHost,
} from './services/ConversationLoadRecoveryCoordinator';
import {
  type ConversationAssistantShellRenderPort,
  type ConversationAssistantTailRenderPort,
  type ConversationRenderHost,
  ConversationRenderService,
  type ConversationUserMessageRenderFrame,
} from './services/ConversationRenderService';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from './services/ConversationSessionSettingsCoordinator';
import {
  ConversationSessionSignalRuntime,
  type ConversationSessionSignalRuntimeHost,
} from './services/ConversationSessionSignalRuntime';
import {
  ConversationSyncBridge,
  type ConversationSyncBridgePortBuilderHost,
  type ConversationSyncBridgePorts,
  createConversationSyncBridgePorts,
} from './services/ConversationSyncBridge';
import {
  createConversationSyncServices,
} from './services/ConversationSyncHostAdapter';
import {
  type ConversationSyncLoadRuntimeViewHost,
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
  ConversationTabRuntimeCoordinator,
  type ConversationTabRuntimeCoordinatorHost,
  type ConversationTabRuntimeState,
} from './services/ConversationTabRuntimeCoordinator';
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
  type ComposerInputSubmission,
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
  type SlashCommandExecutionHost,
  SlashCommandExecutionService,
} from './services/SlashCommandExecutionService';
import { SlashCommandMenuCatalogCache } from './services/SlashCommandMenuCatalogCache';
import {
  createTabActivationRuntimeViewHostFactoryHost,
  type TabActivationRuntimeHostProviderHost,
} from './services/TabActivationRuntimeHostProvider';
import {
  createTabActivationConversationSyncRuntimePort,
  createTabActivationRuntimeViewHosts,
  type TabActivationConversationSyncRuntimePort,
  type TabActivationConversationSyncRuntimePortHost,
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
import type { TabBar, TabId, TabManager } from './tabs';
import { ContextDetailModal, type ContextRawMessageItem } from './ui/ContextDetailModal';
import { ContextRing } from './ui/ContextRing';
import { EffortSelector } from './ui/EffortSelector';
import type {
  ModelSelectorKnownModelInfo,
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
  conversationSessionSettingsCoordinator: ConversationSessionSettingsCoordinator;
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
  backgroundTaskStreamTriggerViewHost:
    QuestionTodoBackgroundTaskRuntimeCoordinators['backgroundTaskStreamTriggerViewHost'];
  activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  backgroundTaskNoticeStateService: BackgroundTaskNoticeStateService;
  backgroundTaskTimelineService: BackgroundTaskTimelineService;
  backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
}

interface OpenCodianViewConversationRuntimeWiring {
  conversationAuthoritativeSyncCoordinator: ConversationAuthoritativeSyncCoordinator;
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
  conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
  conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator<TabRuntimeState>;
}

interface OpenCodianViewInteractionRuntimeWiring {
  messageSendPreparationService: MessageSendPreparationService;
  messageFinalizationService: MessageFinalizationService;
  assistantNoticeCardRenderer: AssistantNoticeCardRenderer;
  userMessageFooterRenderer: UserMessageFooterRenderer;
  streamingInlineCardRenderer: StreamingInlineCardRenderer;
  permissionInlineCardRenderer: PermissionInlineCardRenderer;
  questionRuntimeServices: QuestionRuntimeServices;
  sendPipelineRuntime: SendPipelineRuntime;
}

interface TabRuntimeState extends ConversationTabRuntimeState {
  streamController: StreamController | null;
  streamingMessageEl: HTMLElement | null;
  streamingContentEl: HTMLElement | null;
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
  pendingSignalConversationSyncReasons: Set<string>;
  signalConversationSyncTimerId: number | null;
  focusContextPreview: FocusContextPreview | null;
  draftContextItems: PromptContextItem[];
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
  private readonly sessionDiffEntriesBySessionId = new Map<string, SessionDiffEntry[]>();
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
  private slashCommandMenuCatalogCache: SlashCommandMenuCatalogCache;
  private slashCommandMenuPreloadTimerId: number | null = null;

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
  private conversationAuthoritativeSyncCoordinator!: ConversationAuthoritativeSyncCoordinator;
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
  private conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
  private conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator<TabRuntimeState>;
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
  private conversationSessionSettingsCoordinator: ConversationSessionSettingsCoordinator;
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
      openConversationSessionSettings: () => {
        this.conversationSessionSettingsCoordinator.openCurrentConversationSettings();
      },
      openSettings: () => {
        this.openPluginSettingsPreservingScroll();
      },
    };
  }

  private createConversationSessionSettingsCoordinatorHost():
  ConversationSessionSettingsCoordinatorHost {
    return {
      app: this.app,
      getCurrentConversation: () => this.currentConversation,
      getSessionSettingsDefaults: () => ({
        autoCompactionEnabled: this.plugin.settings.autoCompactionEnabled,
        compactionReservedTokens: this.plugin.settings.compactionReservedTokens,
        chatFontSizePx: this.plugin.settings.chatFontSizePx,
      }),
      getChatContainerEl: () => this.chatContainerEl,
      getOpencodeConfigManager: () => this.plugin.opencodeConfigManager,
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      showNotice: (message) => {
        new Notice(message);
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
      getConversationById: async (conversationId) =>
        (await this.plugin.getConversationById(conversationId, {
          preferCache: true,
        })) ?? null,
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
        this.conversationLoadRecoveryCoordinator.deleteAllConversationsAndReset(conversationIds),
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
      getSlashCommandSkillMode: () => this.plugin.settings.slashCommandSkillMode,
      addChosenFileContextToActiveTab: async () => {
        await this.composerContextViewFacade.addChosenFileContextToActiveTab();
      },
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
      getComposerInputMode: () => 'prompt',
      submitMessage: (submission) => this.handleComposerInputSubmission(submission),
      loadSlashCommandMenuItems: () => this.loadSlashCommandMenuItems(),
      setComposerStackHeight: (stackHeight) => {
        this.chatContainerEl?.style.setProperty('--opencodian-composer-stack-height', `${stackHeight}px`);
      },
      scheduleSettledScrollToBottomIfNeeded: () => {
        this.scheduleSettledScrollToBottomIfNeeded();
      },
    };
  }

  private handleComposerInputSubmission(
    submission: ComposerInputSubmission,
  ): Promise<void> | void {
    if (submission.kind === 'shell') {
      logger.warn('Ignoring shell composer submission because the stable shell runtime is not enabled in this view', {
        commandPreview: this.getLogPreview(submission.command, 120),
      });
      return;
    }

    const content = submission.kind === 'prompt'
      ? submission.content
      : submission.rawContent;
    return this.sendPipelineRuntime.sendMessage(content);
  }

  private loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]> {
    if (!this.plugin.opencodeConfigManager) {
      return Promise.resolve([]);
    }

    return this.slashCommandMenuCatalogCache.load();
  }

  private scheduleSlashCommandMenuPreload(): void {
    if (this.slashCommandMenuPreloadTimerId !== null) {
      window.clearTimeout(this.slashCommandMenuPreloadTimerId);
    }

    this.slashCommandMenuPreloadTimerId = window.setTimeout(() => {
      this.slashCommandMenuPreloadTimerId = null;
      if (!this.plugin.opencodeConfigManager) {
        return;
      }

      this.slashCommandMenuCatalogCache.warm();
    }, 0);
  }

  private clearSlashCommandMenuPreload(): void {
    if (this.slashCommandMenuPreloadTimerId !== null) {
      window.clearTimeout(this.slashCommandMenuPreloadTimerId);
      this.slashCommandMenuPreloadTimerId = null;
    }

    this.slashCommandMenuCatalogCache.invalidate();
  }

  public invalidateSlashCommandMenuCatalog(options: { preload?: boolean } = {}): void {
    this.clearSlashCommandMenuPreload();
    if (options.preload) {
      this.scheduleSlashCommandMenuPreload();
    }
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
      scheduleChatSurfaceColorSync: () => {
        this.scheduleChatSurfaceColorSync();
      },
      scheduleComposerLayoutSync: () => {
        this.scheduleComposerLayoutSync();
      },
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
      loadModelCatalogData: async () => {
        const catalogBundle = this.plugin.modelConfigService
          ? await this.plugin.modelConfigService.getCatalogs(
              this.plugin.settings.modelSourceMode,
              this.plugin.settings.disabledModelRefs,
            )
          : null;
        const providers = catalogBundle
          ? catalogBundle.effective.providers
          : (await this.plugin.openCodeService.getAvailableModels()).providers;
        return {
          catalogBundle,
          providers,
        };
      },
      getActiveTabModelOverride: () => this.tabManager?.getActiveTabModelOverride() ?? null,
      setActiveTabModelOverride: (selection) => {
        if (!this.tabManager?.getActiveTab()) {
          return false;
        }

        this.tabManager.setActiveTabModelOverride(selection);
        return true;
      },
      getDefaultModelSelection: () => {
        if (!this.plugin.settings.defaultProvider || !this.plugin.settings.defaultModel) {
          return null;
        }

        return {
          provider: this.plugin.settings.defaultProvider,
          model: this.plugin.settings.defaultModel,
        };
      },
      syncActiveTabContextUsageIdentity: () => {
        this.activeTabContextUsageCoordinator.syncIdentity();
      },
      getModelSourceMode: () => this.plugin.settings.modelSourceMode,
      isModelAvailableOnServer: async (provider, model) => (
        this.plugin.modelConfigService
          ? this.plugin.modelConfigService.isModelAvailableOnServer(provider, model)
          : true
      ),
      resolveProviderIconUrl: (providerId) =>
        ProviderIconService.resolveIconUrl(
          this.app,
          providerId,
          this.plugin.settings.providerIconLibrary,
        ),
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
    return this.conversationTabRuntimeCoordinator.getPaneState(tabId);
  }

  private getTabRuntimeState(tabId: TabId | null = this.getActiveTabId()): TabRuntimeState | null {
    return this.conversationTabRuntimeCoordinator.getRuntimeState(tabId);
  }

  private ensureTabRuntimeState(tabId: TabId | null = this.getActiveTabId()): TabRuntimeState | null {
    return this.conversationTabRuntimeCoordinator.ensureRuntimeState(tabId);
  }

  private getActiveTabRuntimeState(): TabRuntimeState | null {
    return this.conversationTabRuntimeCoordinator.getActiveRuntimeState();
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
        onCollapsibleToggle: () => {
          if (this.getActiveTabId() === tabId) {
            this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
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
    const isTrackingHydration = this.conversationTabRuntimeCoordinator.beginConversationHydration(tabId);
    if (!isTrackingHydration) {
      return;
    }

    this.backgroundTaskLiveSignalCoordinator.armAuthoritativeSyncGate(tabId);
    this.conversationSyncBridgePorts.getSignalScheduler().clearScheduledSignalConversationSync(tabId);
  }

  private endConversationHydration(tabId: TabId | null = this.getActiveTabId()): void {
    const hadPendingLayoutMutations =
      this.conversationTabRuntimeCoordinator.endConversationHydration(tabId);
    if (hadPendingLayoutMutations) {
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
    this.slashCommandMenuCatalogCache = new SlashCommandMenuCatalogCache({
      getHiddenCommandIds: () => this.plugin.settings.hiddenSlashCommands ?? [],
      loadProjectAgents: async () => this.plugin.opencodeConfigManager?.getAgentConfig() ?? {},
      loadProjectCommands: async () => this.plugin.opencodeConfigManager?.getCommandConfig() ?? {},
      loadRuntimeCommands: async () => this.plugin.openCodeService.sdk.command.list(),
      loadRuntimeSkills: async () => this.plugin.openCodeService.sdk.app.skills(),
      getVaultPath: () => getVaultBasePath(this.app),
      onWarmLoadFailed: (error) => {
        logger.debug('Failed to preload slash command menu items:', error);
      },
    });

    const surfaceRuntime = this.createSurfaceRuntimeWiring();
    this.titleGenerationService = surfaceRuntime.titleGenerationService;
    this.tabMessagesPaneCoordinator = surfaceRuntime.tabMessagesPaneCoordinator;
    this.chatHeaderPresenter = surfaceRuntime.chatHeaderPresenter;
    this.conversationHistoryActionsCoordinator =
      surfaceRuntime.conversationHistoryActionsCoordinator;
    this.chatSelectionControlsCoordinator = surfaceRuntime.chatSelectionControlsCoordinator;
    this.composerInputShellCoordinator = surfaceRuntime.composerInputShellCoordinator;
    this.inputPanelAppearanceCoordinator = surfaceRuntime.inputPanelAppearanceCoordinator;
    this.conversationSessionSettingsCoordinator =
      surfaceRuntime.conversationSessionSettingsCoordinator;
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

    const conversationRenderService = new ConversationRenderService(
      this.createConversationRenderHost(),
      {
        getCanonicalSessionState: (sessionId) =>
          this.plugin.openCodeService.getCanonicalSessionState(sessionId),
        hydrateOpenCodeMessage: (info, parts) =>
          this.plugin.openCodeService.hydrateOpenCodeMessage(info, parts),
      },
    );
    this.conversationRenderService = conversationRenderService;

    const conversationRuntime = this.createConversationRuntimeWiring(
      backgroundTaskRuntime,
      conversationRenderService,
    );
    this.conversationAuthoritativeSyncCoordinator =
      conversationRuntime.conversationAuthoritativeSyncCoordinator;
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
    this.conversationLoadRecoveryCoordinator =
      conversationRuntime.conversationLoadRecoveryCoordinator;
    this.conversationTabRuntimeCoordinator =
      conversationRuntime.conversationTabRuntimeCoordinator;

    const interactionRuntime = this.createInteractionRuntimeWiring(
      conversationRuntime.conversationSyncBridgePorts,
      conversationRenderService,
    );
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
    const conversationSessionSettingsCoordinator = new ConversationSessionSettingsCoordinator(
      this.createConversationSessionSettingsCoordinatorHost(),
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
      conversationSessionSettingsCoordinator,
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
        this.createBackgroundTaskLiveSignalCoordinatorHostBuilderHost(),
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
    conversationRenderService: ConversationRenderService,
  ): OpenCodianViewConversationRuntimeWiring {
    const conversationAuthoritativeSyncCoordinator = new ConversationAuthoritativeSyncCoordinator(
      this.createConversationAuthoritativeSyncHost(conversationRenderService),
    );
    this.conversationAuthoritativeSyncCoordinator = conversationAuthoritativeSyncCoordinator;
    const conversationHydrationRuntimeViewHosts = createConversationHydrationRuntimeViewHosts(
      this.createConversationHydrationRuntimeViewHost(conversationRenderService),
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
    const tabViewActivationBridge = new TabViewActivationBridge({
      host: tabActivationRuntimeBridgeHosts.tabActivationBridgeHosts.tabViewActivationBridgeHost,
      focusContextPreviewCoordinator: this.composerContextViewFacade,
      questionTodoActivationRefreshCoordinator:
        backgroundTaskRuntime.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator:
        backgroundTaskRuntime.backgroundTaskActivationIndicatorCoordinator,
      activeTabContextUsageCoordinator: backgroundTaskRuntime.activeTabContextUsageCoordinator,
    });
    const conversationHydrationOutcomeBridge = new ConversationHydrationOutcomeBridge(
      conversationHydrationRuntimeViewHosts.conversationHydrationOutcomeBridgeHost,
      tabConversationStateBridge,
      tabViewActivationBridge,
    );
    const tabConversationActivationBridge = new TabConversationActivationBridge({
      host:
        tabActivationRuntimeBridgeHosts.tabActivationBridgeHosts
          .tabConversationActivationBridgeHost,
      tabConversationStateBridge,
      tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator:
        backgroundTaskRuntime.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator:
        backgroundTaskRuntime.backgroundTaskActivationIndicatorCoordinator,
      activeTabContextUsageCoordinator: backgroundTaskRuntime.activeTabContextUsageCoordinator,
    });
    const tabRuntimeStateBridge = new TabRuntimeStateBridge(
      tabActivationRuntimeBridgeHosts.tabRuntimeStateBridgeHost,
    );
    const conversationSyncLoadRuntimeHosts = createConversationSyncLoadRuntimeViewHosts(
      this.createConversationSyncLoadRuntimeViewHost(conversationRenderService),
    );
    const conversationSyncServices = createConversationSyncServices(
      conversationSyncLoadRuntimeHosts.conversationSyncViewHost,
      backgroundTaskRuntime.visibleConversationPostSyncCoordinator,
      backgroundTaskRuntime.backgroundConversationPostSyncHandoffCoordinator,
    );
    const conversationSyncBridgePorts = createConversationSyncBridgePorts(
      this.createConversationSyncBridgePortBuilderHost(),
    );
    const tabActivationConversationSyncRuntimePort =
      createTabActivationConversationSyncRuntimePort(
        this.createTabActivationConversationSyncRuntimePortHost(),
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
    const backgroundTaskIndicatorCoordinator = new BackgroundTaskIndicatorCoordinator({
      inlinePanelRenderer: backgroundTaskInlinePanelRenderer,
      timelineService: backgroundTaskRuntime.backgroundTaskTimelineService,
      completionNoticeService: backgroundTaskCompletionNoticeService,
      liveSignalCoordinator: backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
      tabRuntimeStateBridge,
      host: this.createBackgroundTaskIndicatorCoordinatorHost(),
    });
    const backgroundTaskStreamTriggerCoordinator = new BackgroundTaskStreamTriggerCoordinator(
      backgroundTaskIndicatorCoordinator,
      backgroundTaskRuntime.backgroundTaskTimelineService,
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
      backgroundTaskRuntime.backgroundTaskStreamTriggerViewHost,
    );
    const conversationLoadRuntimeBridge = new ConversationLoadRuntimeBridge(
      conversationSyncLoadRuntimeHosts.conversationLoadRuntimeBridgeHost,
    );
    const conversationViewStateService = new ConversationViewStateService({
      host: this.createConversationViewStateHost(),
      tabConversationActivationBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
    });
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
    const conversationLoadRecoveryCoordinator = new ConversationLoadRecoveryCoordinator(
      this.createConversationLoadRecoveryHost(),
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
    const conversationTabRuntimeCoordinator = new ConversationTabRuntimeCoordinator(
      this.createConversationTabRuntimeCoordinatorHost(),
      this.tabMessagesPaneCoordinator,
      {
        activateTab: (tabId) => conversationLoadRecoveryCoordinator.activateTab(tabId),
        closeTabAndRecover: (tabId) =>
          conversationTabLifecycleRecoveryCoordinator.closeTabAndRecover(tabId),
        initializeFirstTab: () => conversationLoadRecoveryCoordinator.initializeFirstTab(),
        restorePersistedTabs: () => conversationLoadRecoveryCoordinator.restorePersistedTabs(),
        syncTabStreamLikeState: (tabId) => tabRuntimeStateBridge.syncStreamLikeState(tabId),
        syncActiveTabStreamLikeState: () => tabRuntimeStateBridge.syncActiveStreamLikeState(),
        setTabNeedsAttention: (tabId, needsAttention) =>
          tabRuntimeStateBridge.setNeedsAttention(tabId, needsAttention),
      },
    );

    return {
      conversationAuthoritativeSyncCoordinator,
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
      conversationLoadRecoveryCoordinator,
      conversationTabRuntimeCoordinator,
    };
  }

  private createInteractionRuntimeWiring(
    conversationSyncBridgePorts: ConversationSyncBridgePorts,
    conversationRenderService: ConversationRenderService,
  ): OpenCodianViewInteractionRuntimeWiring {
    const messageSendPreparationService = new MessageSendPreparationService(
      this.createMessageSendPreparationHost(conversationRenderService),
      this.composerContextViewFacade.sendContext,
    );
    const messageFinalizationService = new MessageFinalizationService(
      this.createMessageFinalizationHost(conversationRenderService),
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
    const slashCommandExecutionService = new SlashCommandExecutionService(
      this.createSlashCommandExecutionHost(conversationSyncBridgePorts),
    );
    const sendPipelineRuntime = new SendPipelineRuntime(
      this.createSendPipelineRuntimeHost(),
      messageSendPreparationService,
      messageFinalizationService,
      slashCommandExecutionService,
    );

    return {
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
        const registerDomEvent = this.registerDomEvent.bind(this) as unknown as ComposerContextViewHost['registerDomEvent'];
        registerDomEvent(target, type, callback, options);
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
          this.currentConversation.currentNote = path ?? undefined;
        }
      },
    };
  }

  private createPersistentAssistantNoticeServiceHost(): PersistentAssistantNoticeServiceHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      getConversationSyncRuntime: () => this.tabConversationSyncFingerprintRuntimePort,
      renderAssistantMessage: async (message) => {
        await this.assistantShellViewHostAdapter.renderPersistedAssistantMessage({ message });
      },
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      handleVisibleNoticeMessageAppended: () => {
        if (this.conversationTabRuntimeCoordinator.recordHydrationLayoutMutation()) {
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
      getActiveTabId: () => this.getActiveTabId(),
      getCurrentConversation: () => this.currentConversation,
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      getConversationSyncRuntime: () => this.tabConversationSyncFingerprintRuntimePort,
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      renderSessionTodoDock: (tabId) => {
        this.renderSessionTodoDock(tabId);
      },
      getQuestionDockCoordinator: () => this.questionDockCoordinator,
      getSessionTodoCoordinator: () => this.sessionTodoCoordinator,
      getQuestionDockSlotCoordinator: () => this.questionDockSlotCoordinator,
      resetBackgroundTaskIndicator: (tabId) => {
        this.resetBackgroundTaskIndicator(tabId);
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
      applyConversationSessionSettings: (conversation) => {
        void this.conversationSessionSettingsCoordinator.applyConversationRuntimeState(
          conversation,
        );
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

  private createBackgroundTaskLiveSignalCoordinatorHostBuilderHost():
  BackgroundTaskLiveSignalCoordinatorHostBuilderHost {
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

  private createConversationSyncLoadRuntimeViewHost(
    conversationRenderService: ConversationRenderService,
  ):
  ConversationSyncLoadRuntimeViewHost {
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
      syncConversationMessagesFromCanonicalState: (conversation, tabId, reason, options) =>
        this.syncConversationMessagesFromCanonicalState(conversation, tabId, reason, options),
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        conversationRenderService.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      hasInterruptedLocalAssistantTail: (messages) => this.hasInterruptedLocalAssistantTail(messages),
    };
  }

  private createConversationAuthoritativeSyncHost(
    conversationRenderService: ConversationRenderService,
  ):
  ConversationAuthoritativeSyncHost {
    return {
      getVaultBasePath: () => getVaultBasePath(this.app) ?? undefined,
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      getCurrentConversationId: () => this.currentConversation?.id ?? null,
      getCurrentConversationRevertState: () => this.currentConversationRevertState,
      getActiveTabId: () => this.getActiveTabId(),
      getSessionMessages: (sessionId) => this.plugin.openCodeService.getSessionMessages(sessionId),
      getCanonicalSessionMessages: (sessionId) =>
        this.plugin.openCodeService.getCanonicalSessionMessages(sessionId),
      getSessionRevertState: (sessionId) => this.plugin.openCodeService.getSessionRevertState(sessionId),
      hydrateOpenCodeMessage: (info, parts, vaultBasePath) =>
        this.plugin.openCodeService.hydrateOpenCodeMessage(info, parts, vaultBasePath),
      shouldRenderConversationMessage: (message) => this.shouldRenderConversationMessage(message),
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      getInterruptedSyncPreservationLogFingerprint: (conversation, messages) =>
        this.getInterruptedSyncPreservationLogFingerprint(conversation, messages),
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      logOmoBackgroundTaskDiagnostics: (conversation, previousMessages, nextMessages) => {
        this.logOmoBackgroundTaskDiagnostics(conversation, previousMessages, nextMessages);
      },
      markBackgroundTaskAuthoritativeSync: (tabId, reason) => {
        this.markBackgroundTaskAuthoritativeSync(tabId, reason);
      },
      refreshContextUsageAfterActiveConversationSync: (conversation, tabId) =>
        this.refreshContextUsageAfterActiveConversationSync(conversation, tabId),
      armBackgroundTaskIndicatorForUserMessage: (message, tabId) => {
        this.armBackgroundTaskIndicatorForUserMessage(message, tabId);
      },
      updateHydratedUserMessageRuntimeAnchors: (
        conversation,
        optimisticMessage,
        mergedHydratedMessage,
        tabId,
      ) => {
        this.updateHydratedUserMessageRuntimeAnchors(
          conversation,
          optimisticMessage,
          mergedHydratedMessage,
          tabId,
        );
      },
      rerenderSingleUserMessage: (previousMessageId, message) =>
        conversationRenderService.rerenderSingleUserMessage(previousMessageId, message),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      summarizeChatMessageForDebug: (message) => this.summarizeChatMessageForDebug(message),
      logAssistantFinalizationDebug: (label, payload) => {
        this.logAssistantFinalizationDebug(label, payload);
      },
      stringifyLogPayload: (payload) => this.stringifyLogPayload(payload),
      getLogPreview: (text, maxLength) => this.getLogPreview(text, maxLength),
    };
  }

  private createConversationSyncBridgePortBuilderHost():
  ConversationSyncBridgePortBuilderHost {
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
        this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, {
          fingerprint,
        });
      },
    };
  }

  private createTabActivationConversationSyncRuntimePortHost():
  TabActivationConversationSyncRuntimePortHost {
    return {
      getConversationSyncFingerprint: (messages) =>
        this.getConversationSyncFingerprint(messages),
      setLastConversationSyncFingerprint: (fingerprint) => {
        this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(
          this.getActiveTabId(),
          { fingerprint },
        );
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
      applySessionSyncEvent: (tabId, update) => {
        this.conversationSyncBridge.applySessionSyncEvent(tabId, update);
      },
      applySessionDiffUpdate: (_tabId, update) => {
        this.sessionDiffEntriesBySessionId.set(update.sessionId, update.diff ?? []);
      },
    };
  }

  private createBackgroundTaskCompletionNoticeServiceHost(): BackgroundTaskCompletionNoticeServiceHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      appendPersistentAssistantNoticeMessage: (options) => this.persistentAssistantNoticeService.appendMessage(options),
    };
  }

  private createConversationHydrationRuntimeViewHost(
    conversationRenderService: ConversationRenderService,
  ):
  ConversationHydrationRuntimeViewHost {
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
      reapplyConversationSessionVisualState: (conversation) => {
        this.conversationSessionSettingsCoordinator.applyConversationVisualState(conversation);
      },
      renderMessages: (messages) => conversationRenderService.renderMessages(messages),
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

  private createConversationLoadRecoveryHost(): ConversationLoadRecoveryHost {
    return {
      isActiveTabStreaming: () => this.isActiveTabStreaming(),
      getCurrentConversation: () => this.currentConversation,
      getTabManager: () => this.tabManager,
      getMaxTabs: () => this.plugin.settings.maxTabs,
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
      chooseForkTarget: () => chooseForkTarget(this.app),
      confirmRewind: () => window.confirm(t('chat.rewind.confirm')),
      revertSession: (sessionId, messageId) =>
        this.plugin.openCodeService.revertSession(sessionId, messageId),
      unrevertSession: (sessionId) =>
        this.plugin.openCodeService.unrevertSession(sessionId),
      forkSession: (sessionId, messageId) =>
        this.plugin.openCodeService.forkSession(sessionId, messageId),
      createConversationFromSession: (sessionId, initial) =>
        this.plugin.createConversationFromSession(sessionId, initial),
      deleteConversation: (conversationId) =>
        this.plugin.deleteConversation(conversationId),
      syncActiveTabConversation: (conversation) => {
        this.tabConversationStateBridge.syncActiveTabConversation(conversation);
      },
      updateModelSelectorDisplay: () => {
        this.updateModelSelectorDisplay();
      },
      showNotice: (message) => {
        new Notice(message);
      },
    };
  }

  private createConversationTabRuntimeCoordinatorHost(): ConversationTabRuntimeCoordinatorHost {
    return {
      getMaxTabs: () => this.plugin.settings.maxTabs,
      getTabManager: () => this.tabManager,
      setTabManager: (tabManager) => {
        this.tabManager = tabManager;
      },
      getTabBar: () => this.tabBar,
      setTabBar: (tabBar) => {
        this.tabBar = tabBar;
      },
      getTabBarMountEl: () => this.tabBarMountEl,
      setTabBarMountEl: (element) => {
        this.tabBarMountEl = element;
      },
      getChatContainerEl: () => this.chatContainerEl,
      getHeaderTabBarSlotEl: () => this.headerTabBarSlotEl,
      getBelowHeaderTabBarSlotEl: () => this.belowHeaderTabBarSlotEl,
      getOuterVerticalTabBarSlotEl: () => this.outerVerticalTabBarSlotEl,
      getInputTabBarSlotEl: () => this.composerInputShellCoordinator.getTabBarSlotEl(),
      getTabBarPosition: () => this.plugin.settings.tabBarPosition,
      getBelowHeaderTabBarLayout: () => this.plugin.settings.belowHeaderTabBarLayout,
      setPersistedTabState: (tabState) => {
        this.plugin.settings.tabState = tabState;
      },
      savePersistedTabState: (options = {}) => {
        if (options.flush) {
          void this.plugin.saveSettingsUiStateImmediately();
          return;
        }

        this.plugin.scheduleSettingsUiStateSave();
      },
      getSessionIdForTab: (tabId) => this.getSessionIdForTab(tabId),
      getTabSessionStatus: (tabId, sessionId) =>
        this.sessionTodoCoordinator.getTabSessionStatus(tabId, sessionId),
    };
  }

  private createConversationRenderHost(): ConversationRenderHost {
    const assistantShellRender: ConversationAssistantShellRenderPort =
      this.createConversationAssistantShellRenderPort();
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
      shouldRenderEmptyConversationNotice: () =>
        Boolean(this.currentConversationRevertState?.messageID),
      createEmptyConversationNoticeMessage: () =>
        this.createEmptyConversationNoticeMessage(),
      createUserMessageFrame: (message) =>
        this.createUserMessageRenderFrame(message),
      renderUserMessageContent: (container, message) =>
        this.renderUserMessageContent(container, message),
      addUserMessageFooter: (messageEl, message, content) => {
        this.addUserMessageFooter(messageEl, message, content);
      },
      renderMarkdownInto: (container, markdown) =>
        this.renderMarkdownInto(container, markdown),
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
      assistantShellRender,
      assistantTailRender,
      logAssistantFinalizationDebug: (label, payload) => {
        this.logAssistantFinalizationDebug(label, payload);
      },
      summarizeChatMessageForDebug: (message) => this.summarizeChatMessageForDebug(message),
    };
  }

  private createConversationAssistantShellRenderPort(): ConversationAssistantShellRenderPort {
    return {
      renderPersistedMessage: (message) =>
        this.assistantShellViewHostAdapter.renderPersistedAssistantMessage({ message }),
      createAssistantMessageElement: () =>
        this.assistantShellViewHostAdapter.createAssistantMessageElement(),
      finalizePseudoStreamFooter: (messageEl, message) => {
        this.assistantShellViewHostAdapter.finalizePseudoStreamFooter(messageEl, message);
      },
      clearStreamingMessageState: () => {
        this.streamingMessageEl = null;
        this.streamingContentEl = null;
      },
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

  private createMessageFinalizationHost(
    conversationRenderService: ConversationRenderService,
  ): MessageFinalizationHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      syncConversationMessagesFromServer: (conversation, tabId, reason) =>
        this.syncConversationMessagesFromServer(conversation, tabId, reason),
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        conversationRenderService.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) => this.renderBackgroundTaskIndicatorIfNeeded(tabId),
      appendTurnDiffNoticeIfNeeded: (conversation, editedFiles, tabId) =>
        this.appendTurnDiffNoticeIfNeeded(conversation, editedFiles, tabId),
      refreshTabSessionTodos: (tabId, sessionId, options) =>
        this.sessionTodoCoordinator.refreshTabSessionTodos(tabId, sessionId, options),
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      setConversationSyncInFlight: (tabId, value) => {
        this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, {
          inFlight: value,
        });
      },
      setLastConversationSyncFingerprint: (tabId, fingerprint) => {
        this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, {
          fingerprint,
        });
      },
      clearPendingEditedFiles: (tabId) => {
        this.conversationTabRuntimeCoordinator.clearPendingEditedFiles(tabId);
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

  private createMessageSendPreparationHost(
    conversationRenderService: ConversationRenderService,
  ): MessageSendPreparationHost {
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
      getServerAvailability: () => this.getServerAvailability(),
      refreshServerStatusBadge: () => this.chatHeaderPresenter.refreshServerStatusBadge(),
      ensureServerReadyForChat: (availability) => this.ensureServerReadyForChat(availability),
      hasLoadedModelCatalog: () => this.chatSelectionControlsCoordinator.hasLoadedModelCatalog(),
      loadAvailableModels: () => this.reloadModelCatalog(),
      getSendMessageOptions: () => this.getSendMessageOptions(),
      formatModelId: (model) => this.chatSelectionControlsCoordinator.formatModelId(model),
      ensureSelectedModelAvailable: (provider, model) =>
        this.chatSelectionControlsCoordinator.ensureSelectedModelAvailable(provider, model),
      appendModelUnavailableNoticeMessage: () => this.appendModelUnavailableNoticeMessage(),
      buildStructuredPromptSendPayload: (content, options) =>
        this.plugin.openCodeService.buildStructuredPromptSendPayload(content, options),
      seedCanonicalUserMessage: (input) => {
        this.plugin.openCodeService.seedCanonicalUserMessage(input);
      },
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
        this.conversationTabRuntimeCoordinator.setAutoScrollEnabled(tabId, enabled);
      },
      renderMessage: (message) => conversationRenderService.renderMessage(message),
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
        this.conversationTabRuntimeCoordinator.setStreaming(tabId, value);
      },
      syncTabStreamLikeState: (tabId) => {
        this.syncTabStreamLikeState(tabId);
      },
      beginTabContextUsageStream: (tabId) => {
        this.beginTabContextUsageStream(tabId);
      },
      clearPendingEditedFiles: (tabId) => {
        this.conversationTabRuntimeCoordinator.clearPendingEditedFiles(tabId);
      },
    };
  }

  private createSlashCommandExecutionHost(
    conversationSyncBridgePorts: ConversationSyncBridgePorts,
  ): SlashCommandExecutionHost {
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
      getServerAvailability: () => this.getServerAvailability(),
      refreshServerStatusBadge: () => this.chatHeaderPresenter.refreshServerStatusBadge(),
      ensureServerReadyForChat: (availability) => this.ensureServerReadyForChat(availability),
      getProjectCommands: async () => this.plugin.opencodeConfigManager?.getCommandConfig() ?? {},
      getRuntimeCommands: async () => {
        const runtimeCommands = await this.plugin.openCodeService.sdk.command.list();
        return Array.isArray(runtimeCommands) ? runtimeCommands : [];
      },
      getRuntimeSkills: async () => {
        const runtimeSkills = await this.plugin.openCodeService.sdk.app.skills();
        return Array.isArray(runtimeSkills) ? runtimeSkills : [];
      },
      getSlashCommandSkillMode: () => this.plugin.settings.slashCommandSkillMode,
      getVaultPath: () => getVaultBasePath(this.app),
      refreshActiveFocusContextPreview: () => {
        this.composerContextViewFacade.refreshActiveFocusContextPreview();
      },
      getActiveFocusContextPreview: () =>
        this.getTabRuntimeState(this.getActiveTabId())?.focusContextPreview ?? null,
      runSessionCommand: (sessionId, input) =>
        this.plugin.openCodeService.runSessionCommand(sessionId, input),
      startConversationSyncLoop: () => {
        conversationSyncBridgePorts.getLoopControl().startConversationSyncLoop();
      },
      syncVisibleConversationInBackground: () =>
        conversationSyncBridgePorts.getVisibleSyncFollowUp().syncVisibleConversationInBackground(),
      notifySlashCommandFailed: (commandId, error) => {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(t('chat.slashCommand.executionFailed', {
          command: commandId,
          message,
        }));
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
      handleCollapsibleToggle: () => this.scheduleActiveSettledScrollToBottomIfNeeded(),
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
    const startedAt = getPerformanceTimestampMs();
    const stepSummaries: string[] = [];
    const measureStep = async <T>(step: string, operation: () => Promise<T> | T): Promise<T> => {
      const stepStartedAt = getPerformanceTimestampMs();
      try {
        return await Promise.resolve(operation());
      } finally {
        const elapsedMs = getPerformanceTimestampMs() - stepStartedAt;
        stepSummaries.push(`${step}=${formatDurationMs(elapsedMs)}`);
        logger.debug(`[view-open] ${step} completed in ${formatDurationMs(elapsedMs)}`);
      }
    };

    await measureStep('buildUI', () => {
      this.buildUI();
    });
    await measureStep('initializeTabSystem', () => {
      this.initializeTabSystem();
    });
    await measureStep('startServerStatusLoop', () => {
      this.chatHeaderPresenter.startServerStatusLoop();
    });
    await measureStep('initializeMarkdownService', () => {
      if (this.messagesShellEl) {
        this.markdownService = new MarkdownRenderService({
          app: this.app,
          component: this.messageComponent,
          container: this.messagesShellEl,
        });
      }
    });
    await measureStep('wireEventHandlers', () => {
      this.wireEventHandlers();
    });
    await measureStep('startConversationSessionSignalRuntime', () => {
      this.conversationSessionSignalRuntime.start();
    });
    await measureStep('initializeFirstTab', () => this.initializeFirstTab());

    logger.info(
      `[view-open] completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} | ${stepSummaries.join(', ')}`,
    );
    this.scheduleSlashCommandMenuPreload();
  }

  async onClose() {
    this.persistTabState({ flush: true });
    this.clearSlashCommandMenuPreload();
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
    this.conversationTabRuntimeCoordinator.destroyTabSystem();
    this.headerTabBarSlotEl = null;
    this.belowHeaderTabBarSlotEl = null;
    this.outerVerticalTabBarSlotEl = null;
    this.outerVerticalTabBarHostEl?.remove();
    this.outerVerticalTabBarHostEl = null;
    this.questionDockSlotCoordinator.destroy();
    this.sessionTodoCoordinator.destroy();
    this.conversationSessionSignalRuntime.stop();

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
    return this.conversationTabRuntimeCoordinator.syncPaneScrollMetrics(tabId, messagesEl);
  }

  private ensureTabMessagesPane(tabId: TabId): TabPaneState | null {
    return this.conversationTabRuntimeCoordinator.ensureTabMessagesPane(tabId);
  }

  private setActiveMessagesPane(tabId: TabId): void {
    this.conversationTabRuntimeCoordinator.setActiveMessagesPane(tabId);
  }

  private removeTabMessagesPane(tabId: TabId): void {
    this.conversationTabRuntimeCoordinator.removeTabMessagesPane(tabId);
  }

  private clearTabMessagesPanes(): void {
    this.conversationTabRuntimeCoordinator.clearTabMessagesPanes();
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

          this.conversationTabRuntimeCoordinator.setAutoScrollEnabled(tabId, true);
          this.scrollToBottom({ tabId, behavior: 'smooth', enableAutoScroll: true });
        },
      },
    );
  }

  private restoreTurnStateFromActivePane(): void {
    this.conversationTabRuntimeCoordinator.restoreTurnStateFromPane();
  }

  private initializeTabSystem(): void {
    this.conversationTabRuntimeCoordinator.initializeTabSystem();
  }

  private resetTabManager(): void {
    this.conversationTabRuntimeCoordinator.resetTabManager();
  }

  private async initializeFirstTab(): Promise<void> {
    await this.conversationTabRuntimeCoordinator.initializeFirstTab();
  }

  private renderTabBar(): void {
    this.conversationTabRuntimeCoordinator.renderTabBar();
  }

  private restorePersistedTabs(): string | null {
    return this.conversationTabRuntimeCoordinator.restorePersistedTabs();
  }

  private persistTabState(options: { flush?: boolean } = {}): void {
    this.conversationTabRuntimeCoordinator.persistTabState(options);
  }

  private getActiveTabId(): TabId | null {
    return this.conversationTabRuntimeCoordinator.getActiveTabId();
  }

  private isActiveTabStreaming(): boolean {
    return this.conversationTabRuntimeCoordinator.isActiveTabStreaming();
  }

  private isTabForegroundBusy(tabId: TabId | null = this.getActiveTabId()): boolean {
    return this.conversationTabRuntimeCoordinator.isTabForegroundBusy(tabId);
  }

  private syncTabStreamLikeState(tabId: TabId | null): void {
    this.conversationTabRuntimeCoordinator.syncTabStreamLikeState(tabId);
  }

  private syncActiveTabStreamLikeState(): void {
    this.conversationTabRuntimeCoordinator.syncActiveTabStreamLikeState();
  }

  private setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void {
    this.conversationTabRuntimeCoordinator.setTabNeedsAttention(tabId, needsAttention);
  }

  private async handleTabSwitch(tabId: string): Promise<void> {
    await this.conversationTabRuntimeCoordinator.handleTabSwitch(tabId);
  }

  private async handleTabClose(tabId: string): Promise<void> {
    await this.conversationTabRuntimeCoordinator.handleTabClose(tabId);
  }

  private async activateTab(tabId: string): Promise<void> {
    await this.conversationTabRuntimeCoordinator.activateTab(tabId);
  }

  public applyTabBarLayout(): void {
    this.conversationTabRuntimeCoordinator.applyTabBarLayout();
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
    this.conversationSessionSettingsCoordinator.applyConversationVisualState(
      this.currentConversation,
    );

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

    this.inputPanelAppearanceCoordinator.syncAppearanceState();
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

    void this.conversationRenderService.rerenderConversationMessages(this.currentConversation);
  }

  public async reapplyCurrentConversationSessionSettings(): Promise<void> {
    await this.conversationSessionSettingsCoordinator.applyConversationRuntimeState(
      this.currentConversation,
    );
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
    this.conversationTabRuntimeCoordinator.resetTurnState(tabId);
  }

  /** Create a new turn with sticky user header */
  private createTurn(tabId: TabId | null = this.getActiveTabId()): { turnEl: HTMLElement; headerEl: HTMLElement; bodyEl: HTMLElement } | null {
    return this.conversationTabRuntimeCoordinator.createTurn(tabId);
  }

  /** Ensure there is a turn body available for assistant messages */
  private ensureTurnBody(tabId: TabId | null = this.getActiveTabId()): HTMLElement | null {
    return this.conversationTabRuntimeCoordinator.ensureTurnBody(tabId);
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
      void this.conversationRenderService.rerenderConversationMessages(this.currentConversation);
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
    await this.conversationLoadRecoveryCoordinator.createConversationInNewTab();
  }

  /** Create a new conversation in the current tab */
  private async createNewConversationInCurrentTab(): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.createConversationInCurrentTab();
  }

  /** Load a conversation */
  private async loadConversation(
    id: string,
    options: { forceServerSync?: boolean; preserveScrollPosition?: boolean } = {},
  ): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.loadConversation(id, options);
  }

  private getConversationSyncFingerprint(messages: ChatMessage[]): string {
    const fingerprintBuilder = (
      this.plugin.openCodeService?.constructor as typeof OpenCodeService | undefined
    )?.getCanonicalConversationFingerprint;
    if (typeof fingerprintBuilder === 'function') {
      return fingerprintBuilder(messages);
    }

    return JSON.stringify(messages.map((message) => ({
      id: message.id,
      role: message.role,
      modelId: message.modelId ?? null,
      sourceMessageId: message.sourceMessageId ?? null,
      streamState: message.streamState ?? null,
      displayStyle: message.displayStyle ?? null,
      noticeTitle: message.noticeTitle ?? null,
      noticeTone: message.noticeTone ?? null,
      noticeActions: message.noticeActions ?? null,
      noticeMeta: message.noticeMeta ?? null,
      content: message.content,
      timestamp: message.timestamp,
      images: message.images ?? null,
      toolCalls: message.toolCalls ?? null,
      contentBlocks: message.contentBlocks ?? null,
      contextAttachments: message.contextAttachments ?? null,
      questionResolution: message.questionResolution ?? null,
      omo: message.omo ?? null,
      structured: message.structured ?? null,
      parts: message.parts ?? null,
    })));
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
    await this.conversationLoadRecoveryCoordinator.deleteConversationsAndRecover(conversationIds);
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
      this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(
        this.getActiveTabId(),
        {
          fingerprint: this.getConversationSyncFingerprint(this.currentConversation.messages),
        },
      );
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
    this.conversationTabRuntimeCoordinator.setStreaming(this.getActiveTabId(), false);
    this.streamController?.cancelStream();
    this.syncActiveTabStreamLikeState();
    logger.debug('isStreaming set to false');

    new Notice(t('chat.stream.cancelledToast'));
  }

  /** Update send button icon based on streaming state */
  private updateSendButtonState() {
    this.composerInputShellCoordinator.updateSendButtonState();
  }

  private createUserMessageRenderFrame(message: ChatMessage): ConversationUserMessageRenderFrame | null {
    const tabId = this.getActiveTabId();
    const turn = this.createTurn(tabId);
    const parentEl = turn?.headerEl;
    const messageEl = parentEl?.createDiv({
      cls: `opencodian-message opencodian-message--${message.role}`,
    });

    if (!messageEl || !turn) return null;
    this.conversationTabRuntimeCoordinator.registerTurnBodyAnchor(
      tabId,
      this.getMessageAnchorKey(message),
      turn.bodyEl,
    );
    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
    }

    // Content container
    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });

    return {
      messageEl,
      contentEl: content,
    };
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
        onToggle: () => this.scheduleActiveSettledScrollToBottomIfNeeded(),
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
      onToggle: () => this.scheduleActiveSettledScrollToBottomIfNeeded(),
    });
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
            onCollapsibleToggle: () => this.scheduleActiveSettledScrollToBottomIfNeeded(),
          });
          thinkingRenderer.renderStored(container, block.thinking, block.durationSeconds);
        }
        break;

      case 'tool_use':
        if (isInternalStructuredOutputTool(block.toolName)) {
          break;
        }

        if (block.toolName && block.toolId) {
          const toolRenderer = new ToolCallRenderer({
            onCollapsibleToggle: () => this.scheduleActiveSettledScrollToBottomIfNeeded(),
          });
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

  private mergeClientOnlyMessageFields(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    verbose = true,
  ): ChatMessage {
    return this.conversationAuthoritativeSyncCoordinator.mergeClientOnlyMessageFields(
      existingMessage,
      syncedMessage,
      verbose,
    );
  }

  private async syncLatestUserMessageFromServer(
    conversation: Conversation,
    optimisticMessageId: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    await this.conversationAuthoritativeSyncCoordinator.syncLatestUserMessageFromServer(
      conversation,
      optimisticMessageId,
      tabId,
    );
  }

  private updateHydratedUserMessageRuntimeAnchors(
    conversation: Conversation,
    optimisticMessage: ChatMessage,
    mergedHydratedMessage: ChatMessage,
    tabId: TabId | null,
  ): void {
    this.conversationTabRuntimeCoordinator.rekeyTurnBodyAnchor(
      tabId,
      this.getMessageAnchorKey(optimisticMessage),
      this.getMessageAnchorKey(mergedHydratedMessage),
    );
    this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, {
      fingerprint: this.getConversationSyncFingerprint(conversation.messages),
    });
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

  private addUserMessageFooter(messageEl: HTMLElement, message: ChatMessage, content?: string): void {
    this.userMessageFooterRenderer.render(messageEl, message, content);
  }

  private async handleRewindRequest(message: ChatMessage): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.handleRewindRequest(message);
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
    await this.conversationLoadRecoveryCoordinator.handleRestoreRewindRequest();
  }

  private async handleForkRequest(message: ChatMessage): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.handleForkRequest(message);
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
    return this.conversationAuthoritativeSyncCoordinator.syncConversationMessagesFromServer(
      conversation,
      tabId,
      reason,
      options,
    );
  }

  private async syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null = this.getActiveTabId(),
    reason = 'sync-event',
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<{
    messages: ChatMessage[];
    changed: boolean;
    fingerprint: string;
    revertState: ConversationRevertState | null;
  } | null> {
    return this.conversationAuthoritativeSyncCoordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      tabId,
      reason,
      options,
    );
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

  private getMessagesForRender(messages: ChatMessage[]): ChatMessage[] {
    return buildMessageRenderGroups(messages.filter((message) => this.shouldRenderConversationMessage(message))).map((group) =>
      group.mergedAssistant && group.messages.length > 1
        ? mergeAssistantMessagesForRender(group.messages)
        : group.messages[0],
    );
  }

  private isNearBottom(threshold?: number): boolean {
    if (!this.messagesContainer) {
      return true;
    }

    return isElementNearBottom(this.messagesContainer, threshold);
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

  private scheduleActiveSettledScrollToBottomIfNeeded(): void {
    const activeTabId = this.getActiveTabId();
    this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(activeTabId), activeTabId);
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

  private updateModelSelectorDisplay(): void {
    this.chatSelectionControlsCoordinator.updateModelSelectorDisplay();
  }

  /** Get current model for this session */
  private getCurrentSessionModel(): ModelSelectorSelection | null {
    return this.chatSelectionControlsCoordinator.getCurrentSessionModel();
  }

  private getCurrentSessionModelResolution(): ResolvedModelSelection {
    return this.chatSelectionControlsCoordinator.getCurrentSessionModelResolution();
  }

  private findKnownModelInfo(
    selection: ModelSelectorSelection | null,
  ): ModelSelectorKnownModelInfo | null {
    return this.chatSelectionControlsCoordinator.findKnownModelInfo(selection);
  }

  private formatModelId(
    model: Partial<ModelSelectorSelection> | null | undefined,
  ): string | undefined {
    return this.chatSelectionControlsCoordinator.formatModelId(model);
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
    return this.chatSelectionControlsCoordinator.ensureSelectedModelAvailable(provider, model);
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
    const cachedDiffEntries = this.sessionDiffEntriesBySessionId.get(conversation.openCodeSessionId) ?? [];
    const fallbackEntries: SessionDiffEntry[] = [...new Set(editedFiles)].map((file) => ({
      file,
      additions: 0,
      deletions: 0,
    }));
    const entries = diffEntries.length > 0
      ? diffEntries
      : cachedDiffEntries.length > 0
        ? cachedDiffEntries
        : fallbackEntries;
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
    return this.chatSelectionControlsCoordinator.getModelUnavailableNoticeContent();
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
