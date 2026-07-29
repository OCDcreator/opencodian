/**
 * OpenCodian View
 *
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { Editor, EventRef, WorkspaceLeaf } from 'obsidian';
import { addIcon, Component, ItemView, MarkdownView, Menu, normalizePath, Notice, Scope } from 'obsidian';

import {
  AgentCapability,
  getActiveBackendCapabilities,
  hasCapability,
} from '../../core/agents/AgentCapability';
import {
  getBackendSessionPreview,
  getConversationChatBackendService,
  getConversationSessionBackendService,
  loadBackendSessionMessages,
} from '../../core/agents/backend/AgentBackendRouting';
import type { AgentConnectionStatus } from '../../core/agents/backend/AgentService';
import {
  buildClaudeCodeModelSelectorProviders,
  CLAUDE_CODE_EFFORT_VARIANTS,
  CLAUDE_CODE_PROVIDER_ID,
  CODEX_EFFORT_VARIANTS,
} from '../../core/agents/backend/ClaudeCodeModelCatalog';
import {
  buildCodexApprovalQuestionRequest,
  mapCodexApprovalResolution,
} from '../../core/agents/backend/CodexDefaultApprovalHost';
import {
  type ResolvedModelSelection,
} from '../../core/config/modelConfig';
import type { SlashCommandMenuItem } from '../../core/config/slashCommandCatalog';
import {
  OpenCodeService,
  type SessionActivityStatus,
} from '../../core/opencode';
import {
  type ChatMessage,
  type ContextUsageSnapshot,
  type Conversation,
  getConversationBackendSessionId,
  type PromptContextItem,
  type QuestionRequest,
  type QuestionResolution,
  type SessionTodo,
  VIEW_TYPE_OPENCODIAN,
} from '../../core/types';
import type { AgentBackendKind } from '../../core/types/chat';
import type { PermissionMode } from '../../core/types/settings';
import type { CodexReasoningEffort, CodexSandboxMode } from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
  getVaultBasePath,
  isInternalStructuredOutputTool,
} from '../../shared';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { MarkdownRenderService } from '../../utils/markdown';
import type { ToolCallInfo } from '../../utils/streaming';
import {
  StreamController,
} from '../../utils/streaming';
import { applyMcpAuthOutcomeToContainer, applyMcpRetryOutcome, getMcpServerName } from '../../utils/streaming/McpToolCallRenderer';
import {
  CodexMcpServerDetailModal,
  createCodexMcpServerDetailHost,
} from '../settings/CodexMcpServerDetailModal';
import {
  type FocusContextPreview,
} from './composerContext';
import {
  AssistantNoticeCardRenderer,
  type AssistantNoticeCardRendererHost,
} from './runtime/AssistantNoticeCardRenderer';
import {
  AssistantShellViewHostAdapter,
  type AssistantShellViewHostAdapterHost,
} from './runtime/AssistantShellViewHostAdapter';
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
  ConversationLoadRuntimeBridge,
} from './runtime/ConversationLoadRuntimeBridge';
import {
  PermissionInlineCardRenderer,
} from './runtime/PermissionInlineCardRenderer';
import {
  summarizeChatMessageForDebug,
  summarizeContentBlocksForDebug,
  summarizeCoreStreamChunkForDebug,
} from './runtime/SendPipelineDebugSummaries';
import {
  createSendPipelineRuntimeHost,
  type SendPipelineDebugContentBlock,
  type SendPipelineHostDependencies,
  SendPipelineRuntime,
  shouldRefreshOpenCodeDiagnosticsHeader,
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
  UserMessageContentRenderer,
  type UserMessageContentRendererHost,
} from './runtime/UserMessageContentRenderer';
import {
  UserMessageFooterRenderer,
  type UserMessageFooterRendererHost,
} from './runtime/UserMessageFooterRenderer';
import {
  ActiveTabContextUsageCoordinator,
  type ActiveTabContextUsageCoordinatorHost,
  type ForegroundCompactionActionOptions,
  type ForegroundCompactionActionResult,
  type ForegroundCompactionAvailability,
} from './services/ActiveTabContextUsageCoordinator';
import {
  type BackgroundTaskCompletionInfo,
  BackgroundTaskCompletionNoticeService,
  type BackgroundTaskCompletionNoticeServiceHost,
} from './services/BackgroundTaskCompletionNoticeService';
import {
  BackgroundTaskLiveSignalCoordinator,
  type BackgroundTaskLiveSignalCoordinatorHostBuilderHost,
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
  type BackgroundTaskViewHost,
  createBackgroundTaskViewHost,
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
  ChatSurfaceAppearanceCoordinator,
  type ChatSurfaceAppearanceCoordinatorHost,
} from './services/ChatSurfaceAppearanceCoordinator';
import {
  ChatVisualDemoCoordinator,
} from './services/ChatVisualDemoCoordinator';
import {
  ChildSessionGraphCoordinator,
  type ChildSessionGraphCoordinatorHost,
} from './services/ChildSessionGraphCoordinator';
import { CodexChatSurfaceBinding } from './services/CodexChatSurfaceBinding';
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
import {
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
} from './services/ConversationAuthoritativeSyncCoordinator';
import {
  ConversationHistoryActionsCoordinator,
  type ConversationHistoryActionsHost,
} from './services/ConversationHistoryActionsCoordinator';
import {
  assembleConversationHydrationRuntime,
  type ConversationHydrationRuntimeBridges,
  type ConversationHydrationRuntimeViewHost,
} from './services/ConversationHydrationRuntimeViewHostFactory';
import { ConversationIdentityRuntime } from './services/ConversationIdentityRuntime';
import {
  assembleConversationLoadRecovery,
  ConversationLoadRecoveryCoordinator,
} from './services/ConversationLoadRecoveryCoordinator';
import {
  ConversationNoticeCoordinator,
  type ConversationNoticeCoordinatorHost,
} from './services/ConversationNoticeCoordinator';
import {
  hasInterruptedLocalAssistantTail,
} from './services/ConversationRenderRuntime';
import {
  ConversationRenderService,
  type ConversationUserMessageRenderFrame,
  createConversationRenderHost,
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
  type ConversationSyncBridgePorts,
} from './services/ConversationSyncBridge';
import {
  assembleConversationSyncRuntime,
  type ConversationSyncRuntimeAssemblyViewHost,
} from './services/ConversationSyncHostAdapter';
import {
  ConversationSyncOrchestrationService,
} from './services/ConversationSyncOrchestrationService';
import {
  ConversationSyncRuntimeCoordinator,
} from './services/ConversationSyncRuntimeCoordinator';
import {
  type ConversationTabLifecycleRecoveryHost,
} from './services/ConversationTabLifecycleRecoveryCoordinator';
import {
  ConversationTabOpenCoordinator,
  type ConversationTabOpenHost,
} from './services/ConversationTabOpenCoordinator';
import {
  assembleConversationTabRuntime,
  ConversationTabRuntimeCoordinator,
  type ConversationTabRuntimeState,
  type TabBarMutableState,
} from './services/ConversationTabRuntimeCoordinator';
import {
  type ConversationViewStateHost,
} from './services/ConversationViewStateService';
import {
  ConversationWriteSerializationService,
  type ConversationWriteTicket,
} from './services/ConversationWriteSerializationService';
import {
  InputPanelAppearanceCoordinator,
  type InputPanelAppearanceCoordinatorHost,
} from './services/InputPanelAppearanceCoordinator';
import {
  createMessageFinalizationHost,
  MessageFinalizationService,
} from './services/MessageFinalizationService';
import {
  type ComposerInputSubmission,
  createMessageSendPreparationHost,
  MessageSendPreparationService,
} from './services/MessageSendPreparationService';
import { ModifiedFilesSidebarCoordinator } from './services/ModifiedFilesSidebarCoordinator';
import {
  PersistentAssistantNoticeService,
  type PersistentAssistantNoticeServiceHost,
} from './services/PersistentAssistantNoticeService';
import { QuestionDockSlotCoordinator } from './services/QuestionDockSlotCoordinator';
import type { QuestionRuntimeServices } from './services/QuestionRuntimeHostAdapter';
import {
  createQuestionRuntimeBundle,
  type QuestionRuntimeViewHostFactoryHost,
} from './services/QuestionRuntimeViewHostFactory';
import {
  createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam,
  type TabConversationSyncFingerprintRuntimePort,
} from './services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  SettledScrollScheduler,
} from './services/ScrollManager';
import { ServerReferenceContextService } from './services/ServerReferenceContextService';
import {
  createSessionTodoCoordinator,
  type SessionTodoCoordinator,
  type SessionTodoViewHost,
} from './services/SessionTodoHostAdapter';
import {
  createSlashCommandExecutionHost,
  executeCompactSession,
} from './services/SlashCommandExecutionHostFactory';
import {
  SlashCommandExecutionService,
} from './services/SlashCommandExecutionService';
import { SlashCommandMenuCatalogCache } from './services/SlashCommandMenuCatalogCache';
import {
  type TabActivationRuntimeHostProviderHost,
} from './services/TabActivationRuntimeHostProvider';
import {
  assembleTabActivationConversationSyncRuntimePort,
  createTabActivationRuntimeAssembly,
  type TabActivationConversationSyncRuntimePort,
} from './services/TabActivationRuntimeViewHostFactory';
import {
  TabMessagesPaneCoordinator,
  type TabMessagesPaneCoordinatorHost,
  type TabMessagesPaneState,
} from './services/TabMessagesPaneCoordinator';
import {
  createInitialTabSessionLifecycleState,
} from './services/TabSessionPhase';
import { TitleGenerationService } from './services/TitleGenerationService';
import {
  createDebugLogCallbacks,
  logAssistantFinalizationDebug,
  previewLogText,
} from './services/trailingAssistantPatchDebug';
import type { TabBar, TabId, TabManager } from './tabs';
import { type BackendSessionBrowserHost,BackendSessionBrowserModal } from './ui/BackendSessionBrowserModal';
import { ContextDetailModal } from './ui/ContextDetailModal';
import { ContextRing } from './ui/ContextRing';
import { EffortSelector } from './ui/EffortSelector';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from './ui/modelSelector/types';
import { NavigationSidebar } from './ui/NavigationSidebar';
import { OpenCodeExperimentalActionModal } from './ui/OpenCodeExperimentalActionModal';


const logger = createLogger('OpenCodianView');

const OPENCODIAN_APP_ICON = 'opencodian-app-icon';

/**
 * Pure capability-availability lookup. Accepts the bound `requireSdkCapability`
 * function and returns whether the capability id is supported. Absorbs lookup
 * failures as `false` so callers (cache keys, gating) never throw. Exported for
 * unit testing of the cache-key/gating logic in isolation.
 */
export function isSdkCapabilitySupportedByLookup(
  requireCapability: (id: string) => { supported: boolean; reason?: string } | { kind: string } | unknown,
  capabilityId: string,
): boolean {
  try {
    const availability = requireCapability(capabilityId);
    if (availability && typeof availability === 'object' && 'supported' in availability) {
      return (availability as { supported: unknown }).supported === true;
    }
    return true;
  } catch {
    return false;
  }
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
  typeof createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam
>;

interface OpenCodianViewSurfaceRuntimeWiring {
  titleGenerationService: TitleGenerationService;
  tabMessagesPaneCoordinator: TabMessagesPaneCoordinator<TabRuntimeState>;
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
  conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator<TabRuntimeState>;
}

interface OpenCodianViewInteractionRuntimeWiring {
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

const NEW_TAB_ICON = `<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="41.667"/><path d="M33.333 50h33.334"/><path d="M50 33.333v33.334"/></g>`;
const CURRENT_TAB_NEW_CONVERSATION_ICON = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="scale(4.166667)"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/></g>`;
addIcon('opencodian-circle-plus', NEW_TAB_ICON);
addIcon('opencodian-message-square-plus', CURRENT_TAB_NEW_CONVERSATION_ICON);

export class OpenCodianView extends ItemView {
  private plugin: OpenCodianPlugin;
  private chatContainerEl: HTMLElement | null = null;
  private messagesShellEl: HTMLElement | null = null;
  private themeBackgroundImageEl: HTMLDivElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private chatVisualDemoCoordinator: ChatVisualDemoCoordinator;
  private conversationNoticeCoordinator: ConversationNoticeCoordinator;
  private currentConversation: Conversation | null = null;
  private currentConversationRevertState: ConversationRevertState | null = null;
  private markdownService: MarkdownRenderService | null = null;
  private messageComponent: Component;

  // Event refs for cleanup
  private eventRefs: EventRef[] = [];
  private backendActiveChangeDisposable: { dispose(): void } | null = null;
  private backendCapabilityChangeDisposable: { dispose(): void } | null = null;
  private readonly codexChatSurfaceBinding: CodexChatSurfaceBinding;
  private escapeHandlers: Array<() => boolean> = [];
  private backendSurfaceSwitchPromise: Promise<void> | null = null;

  private headerTabBarSlotEl: HTMLElement | null = null;
  private belowHeaderTabBarSlotEl: HTMLElement | null = null;
  private outerVerticalTabBarHostEl: HTMLElement | null = null;
  private outerVerticalTabBarSlotEl: HTMLElement | null = null;
  private tabBarMountEl: HTMLElement | null = null;
  private tabBar: TabBar | null = null;
  private tabManager: TabManager | null = null;
  private readonly conversationCachePinProvider = (): Iterable<string> =>
    this.getPinnedConversationIdsForFullMessageCache();
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
  private modifiedFilesSidebarCoordinator: ModifiedFilesSidebarCoordinator;

  // Effort selector
  private effortSelector: EffortSelector | null = null;
  private currentVariant: string | undefined;
  private readonly variantStore: Record<string, string | undefined> = {};
  private effortContainerEl: HTMLElement | null = null;
  private contextRing: ContextRing | null = null;
  private contextRingContainerEl: HTMLElement | null = null;

  private readonly scrollScheduler = new SettledScrollScheduler();
  private readonly conversationWriteSerializationService = new ConversationWriteSerializationService();
  private chatSurfaceAppearanceCoordinator: ChatSurfaceAppearanceCoordinator;
  private titleGenerationService: TitleGenerationService;
  private persistentAssistantNoticeService: PersistentAssistantNoticeService;
  private sessionTodoCoordinator: SessionTodoCoordinator;
  private childSessionGraphCoordinator: ChildSessionGraphCoordinator;
  private questionDockSlotCoordinator: QuestionDockSlotCoordinator;
  private activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  private backgroundTaskTimelineService: BackgroundTaskTimelineService;
  private backgroundTaskCompletionNoticeService: BackgroundTaskCompletionNoticeService;
  private backgroundTaskNoticeStateService: BackgroundTaskNoticeStateService;
  private backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
  private conversationHydrationOutcomeBridge: ConversationHydrationRuntimeBridges['conversationHydrationOutcomeBridge'];
  private conversationHydrationRenderBridge: ConversationHydrationRuntimeBridges['conversationHydrationRenderBridge'];
  private conversationTransitionBridge: ConversationHydrationRuntimeBridges['conversationTransitionBridge'];
  private conversationAuthoritativeSyncCoordinator!: ConversationAuthoritativeSyncCoordinator;
  private tabConversationStateBridge: TabConversationStateBridge;
  private tabConversationActivationBridge: TabConversationActivationBridge;
  private tabViewActivationBridge: TabViewActivationBridge;
  private tabRuntimeStateBridge: TabRuntimeStateBridge;
  private conversationSyncOrchestrationService: ConversationSyncOrchestrationService;
  private conversationSyncRuntimeCoordinator: ConversationSyncRuntimeCoordinator;
  private conversationSyncBridge: ConversationSyncBridge;
  private readonly conversationIdentityRuntime: ConversationIdentityRuntime;
  private lastResolvedServerAvailability: ChatServerAvailability | null = null;
  private conversationSyncBridgePorts!: ConversationSyncBridgePorts;
  private tabConversationSyncFingerprintRuntimePort!:
    TabConversationSyncFingerprintRuntimePort;
  private tabActivationConversationSyncRuntimePort!: TabActivationConversationSyncRuntimePort;
  private conversationSessionSignalRuntime: ConversationSessionSignalRuntime;
  private conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
  private conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  private conversationTabRuntimeCoordinator: ConversationTabRuntimeCoordinator<TabRuntimeState>;
  private conversationRenderService: ConversationRenderService;
  private messageSendPreparationService: MessageSendPreparationService;
  private messageFinalizationService: MessageFinalizationService;
  private assistantNoticeCardRenderer: AssistantNoticeCardRenderer;
  private userMessageContentRenderer: UserMessageContentRenderer;
  private userMessageFooterRenderer: UserMessageFooterRenderer;
  private assistantShellViewHostAdapter: AssistantShellViewHostAdapter;
  private backgroundTaskInlinePanelRenderer: BackgroundTaskInlinePanelRenderer;
  private backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
  private backgroundTaskHost: BackgroundTaskViewHost;
  private backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
  private streamingInlineCardRenderer: StreamingInlineCardRenderer;
  private permissionInlineCardRenderer: PermissionInlineCardRenderer;
  private questionRuntimeServices: QuestionRuntimeServices;
  private sendPipelineRuntime: SendPipelineRuntime;
  private conversationSessionSettingsCoordinator: ConversationSessionSettingsCoordinator;
  private composerContextViewFacade: ComposerContextViewFacade;

  private appSettings(): { open: () => void; openTabById: (id: string) => void } {
    return (this.app as typeof this.app & {
      setting: { open: () => void; openTabById: (id: string) => void };
    }).setting;
  }

  private get questionDockCoordinator(): QuestionRuntimeServices['dockCoordinator'] {
    return this.questionRuntimeServices.dockCoordinator;
  }

  /** Get current backend capabilities. Phase 0: always OpenCode full set. */
  private get caps() {
    return getActiveBackendCapabilities();
  }

  private isOpenCodeBackendActive(): boolean {
    return this.plugin.settings.activeBackend === 'opencode'
      && this.plugin.settings.enabledBackends.includes('opencode');
  }

  private hasAnyEnabledBackend(): boolean {
    const enabledBackends = this.plugin.settings.enabledBackends;
    if (!Array.isArray(enabledBackends)) {
      return false;
    }
    return enabledBackends.length > 0;
  }

  private hasBackendConnection(): boolean {
    const enabledBackends = this.plugin.settings.enabledBackends;
    if (!Array.isArray(enabledBackends)) {
      return false;
    }
    return this.hasAnyEnabledBackend()
      && enabledBackends.includes(this.plugin.settings.activeBackend ?? 'opencode');
  }

  private isActiveBackendOpenCode(): boolean {
    return (this.plugin.settings.activeBackend ?? 'opencode') === 'opencode';
  }

  private mapAgentConnectionStatusToServerAvailability(
    status: AgentConnectionStatus,
  ): ChatServerAvailability {
    switch (status) {
      case 'connected':
        return 'running';
      case 'connecting':
        return 'starting';
      case 'disconnected':
      case 'error':
      default:
        return 'offline';
    }
  }

  private async canSyncConversationWithServer(): Promise<boolean> {
    const availability = await this.getServerAvailability();
    return availability === 'running' || availability === 'external';
  }

  private shouldStartConversationSessionSignalRuntime(): boolean {
    return this.isOpenCodeBackendActive();
  }

  private createChatHeaderPresenterHost(): ChatHeaderPresenterHost {
    return {
      setTooltipLabel: (element, label, position) => {
        ConversationRenderService.setTooltipLabel(element, label, position);
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
      isOpenCodeBackend: () => this.isOpenCodeBackendActive(),
      getActiveBackendDisplayName: () => {
        const activeBackend = this.plugin.settings.activeBackend ?? 'opencode';
        return this.plugin.agentServiceRegistry?.get(activeBackend)?.displayName ?? activeBackend;
      },
      refreshContextUsageIndicator: () => {
        this.activeTabContextUsageCoordinator.refreshContextUsageIndicator();
      },
      onServerAvailabilityRefreshed: () => {
        this.updateComposerAvailabilityUi();
      },
      openServerSettings: () => {
        this.openPluginSettingsAtActiveBackendRuntimeSection();
      },
      createConversationInNewTab: () => this.createNewConversation(),
      createConversationInCurrentTab: () => this.createNewConversationInCurrentTab(),
      showConversationHistory: (event) => {
        this.conversationHistoryActionsCoordinator.show(event);
      },
      openConversationSessionSettings: () => {
        this.conversationSessionSettingsCoordinator.openCurrentConversationSettings();
      },
      getOpenCodeDiagnosticsState: () => {
        const settings = this.plugin.settings.backendSettings.opencode.sessionTrace;
        if (!settings.enabled) return 'disabled';
        const storeStatus = this.plugin.openCodeTraceService.store.getStatus();
        if (storeStatus.mode === 'memory' || storeStatus.lastError) return 'degraded';
        const tabId = this.getActiveTabId();
        if (!tabId) return 'normal';
        const captureState = this.plugin.openCodeTraceService.getCaptureState(tabId);
        if (captureState !== 'off') return captureState;
        const sessionId = this.getSessionIdForTab(tabId);
        const traceId = sessionId
          ? this.plugin.openCodeTraceService.store.resolveTraceId(sessionId)
          : undefined;
        const summary = traceId
          ? this.plugin.openCodeTraceService.store.listSummaries(100).find((item) => item.traceId === traceId)
          : undefined;
        if (!summary?.unreadAnomalyCount) return 'normal';
        return summary.highestUnreadSeverity === 'critical' || summary.highestUnreadSeverity === 'error'
          ? 'critical'
          : 'warning';
      },
      showOpenCodeDiagnostics: (event) => {
        const tabId = this.getActiveTabId();
        if (!tabId) return;
        const sessionId = this.getSessionIdForTab(tabId) ?? undefined;
        const menu = new Menu();
        const captureState = this.plugin.openCodeTraceService.getCaptureState(tabId);
        if (captureState === 'armed') {
          menu.addItem((item) => item
            .setTitle(t('chat.opencodeDiagnostics.cancelCapture'))
            .setIcon('circle-stop')
            .onClick(() => {
              this.plugin.openCodeTraceService.cancelDeepCapture(tabId);
              this.chatHeaderPresenter.refreshBackendChrome();
            }));
        } else {
          menu.addItem((item) => item
            .setTitle(t('chat.opencodeDiagnostics.captureNext'))
            .setIcon('radio')
            .onClick(() => {
              this.plugin.openCodeTraceService.armDeepCapture(tabId, sessionId);
              this.chatHeaderPresenter.refreshBackendChrome();
              new Notice(t('chat.opencodeDiagnostics.captureArmed'));
            }));
        }
        menu.addItem((item) => item
          .setTitle(t('chat.opencodeDiagnostics.copySession'))
          .setIcon('copy')
          .onClick(async () => {
            const traceId = sessionId
              ? this.plugin.openCodeTraceService.store.resolveTraceId(sessionId)
              : undefined;
            const actual = window.prompt(t('chat.opencodeDiagnostics.actualPrompt')) ?? undefined;
            const expected = window.prompt(t('chat.opencodeDiagnostics.expectedPrompt')) ?? undefined;
            const reproduction = window.prompt(t('chat.opencodeDiagnostics.reproductionPrompt')) ?? undefined;
            const report = await this.plugin.openCodeTraceService.reportBuilder.buildSmartReport(traceId, {
              actual,
              expected,
              reproduction,
            }, { selection: 'current-session' });
            await navigator.clipboard.writeText(report);
            this.chatHeaderPresenter.refreshBackendChrome();
            new Notice(t('chat.opencodeDiagnostics.copySuccess'));
          }));
        menu.showAtMouseEvent(event);
      },
      openSettings: () => {
        this.openPluginSettingsPreservingScroll();
      },
    };
  }

  private createChildSessionGraphCoordinatorHost(): ChildSessionGraphCoordinatorHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getSessionChildren: async (sessionId) => {
        // Re-check the stable session read capability before action. Defaults to
        // supported for non-OpenCode backends and transient lookup failures, so
        // the Chat main chain (concurrent streaming, hydration, sync) is never
        // blocked by a capability probe.
        if (!this.isSessionCapabilityAvailable('v2.session.get')) {
          return [];
        }
        const sessions = await this.plugin.openCodeService.getSessionChildren(sessionId);
        return sessions.map((session) => ({
          id: session.id,
          title: session.title,
          createdAt: session.time?.created,
          updatedAt: session.time?.updated,
        }));
      },
      onGraphUpdated: (graph) => {
        if (hasCapability(this.caps, AgentCapability.Subagents)) {
          this.childSessionGraphCoordinator.render(graph);
        }
      },
      getMessagesContainerEl: () => this.messagesContainer,
    };
  }

  private createConversationSessionSettingsCoordinatorHost():
  ConversationSessionSettingsCoordinatorHost {
    return {
      app: this.app,
      getCurrentConversation: () => this.currentConversation,
      getSessionSettingsDefaults: () => ({
        chatFontSizePx: this.plugin.settings.chatFontSizePx,
      }),
      getCodexGlobalDefaults: () => ({
        sandboxMode: this.plugin.settings.backendSettings.codex.sandboxMode,
        modelReasoningEffort: this.plugin.settings.backendSettings.codex.modelReasoningEffort,
        model: this.plugin.settings.backendSettings.codex.model,
        additionalDirectories: this.plugin.settings.backendSettings.codex.additionalDirectories
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0),
        networkAccessEnabled: this.plugin.settings.backendSettings.codex.networkAccessEnabled,
        webSearchMode: this.plugin.settings.backendSettings.codex.webSearchMode,
      }),
      getChatContainerEl: () => this.chatContainerEl,
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      showNotice: (message) => {
        new Notice(message);
      },
      supportsSessionSharing: () => hasCapability(this.caps, AgentCapability.Sharing),
      supportsCompaction: () => hasCapability(this.caps, AgentCapability.Compaction),
      canOpenExperimentalActions: () => this.getAvailableExperimentalActionIds().length > 0,
      openExperimentalActions: () => this.openExperimentalActionsForCurrentConversation(),
      applyCodexRuntimeOverrides: (overrides) => {
        const adapter = this.plugin.agentServiceRegistry?.get('codex');
        if (!adapter) return;
        if ('updateSandboxMode' in adapter) {
          (adapter as { updateSandboxMode(m: CodexSandboxMode): void })
            .updateSandboxMode(overrides.sandboxMode);
        }
        if ('updateModelReasoningEffort' in adapter) {
          (adapter as { updateModelReasoningEffort(e: CodexReasoningEffort): void })
            .updateModelReasoningEffort(overrides.modelReasoningEffort);
        }
        if ('updateModel' in adapter) {
          (adapter as { updateModel(m: string | undefined): void })
            .updateModel(overrides.model);
        }
        if ('updateAdditionalDirectories' in adapter) {
          (adapter as { updateAdditionalDirectories(d: readonly string[] | undefined): void })
            .updateAdditionalDirectories(overrides.additionalDirectories);
        }
        if ('updateNetworkAccessEnabled' in adapter) {
          (adapter as { updateNetworkAccessEnabled(v: boolean | undefined): void })
            .updateNetworkAccessEnabled(overrides.networkAccessEnabled);
        }
        if ('updateWebSearchMode' in adapter) {
          (adapter as { updateWebSearchMode(m: string | undefined): void })
            .updateWebSearchMode(overrides.webSearchMode);
        }
      },
      agentServiceRegistry: this.plugin.agentServiceRegistry,
      openBackendSessionAsConversation: async (sessionId, title) => {
        try {
          const registry = this.plugin.agentServiceRegistry;
          let initialMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }> | undefined;
          if (registry) {
            const preview = await getBackendSessionPreview(registry, sessionId);
            if (preview && preview.length > 0) {
              initialMessages = preview.map((msg, idx) => ({
                id: `review-${idx}-${Date.now()}`,
                role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: msg.parts
                  .filter((p) => p.type === 'text' && p.text)
                  .map((p) => p.text)
                  .join('\n') || '(empty)',
                timestamp: Date.now(),
              }));
            }
          }
          const conversationId = await this.plugin.createConversationFromBackendSession(sessionId, title, initialMessages, 'codex');
          if (conversationId) {
            await this.loadConversation(conversationId);
          }
          return conversationId;
        } catch {
          return null;
        }
      },
    };
  }

  private createConversationWriteTicket(conversationId: string): ConversationWriteTicket {
    return this.conversationWriteSerializationService.createTicket(conversationId);
  }

  private async commitConversationWrite(
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ): Promise<boolean> {
    const result = await this.conversationWriteSerializationService.commit({
      conversation,
      ticket,
      reason,
      write: async () => {
        await write();
        await this.plugin.saveConversation(conversation);
      },
    });

    return result.applied;
  }

  private createConversationHistoryActionsHost(
    titleGenerationService: TitleGenerationService,
  ): ConversationHistoryActionsHost {
    return {
      getConversations: () => this.plugin.getConversations().filter(
        (conversation) => (conversation.backend ?? 'opencode') === this.plugin.settings.activeBackend,
      ),
      getCurrentConversation: () => this.currentConversation,
      getHistoryBackendDisplayName: () => {
        const activeBackend = this.plugin.settings.activeBackend ?? 'opencode';
        return this.plugin.agentServiceRegistry?.get(activeBackend)?.displayName ?? activeBackend;
      },
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
      openTitleSettings: () => { const titleSettings = this.appSettings(); this.plugin.settingsTab?.prepareScrollToConversationOnNextOpen('title'); titleSettings.open(); try { titleSettings.openTabById('opencodian'); } catch { /* title settings not ready */ } },
      openBackendSessionBrowserModal: () => {
        const modalHost: BackendSessionBrowserHost = {
          getAgentServiceRegistry: () => this.plugin.agentServiceRegistry ?? null,
          createConversationFromBackendSession: async (sessionId, title, initialMessages, backend?: AgentBackendKind) => {
            const resolvedBackend = backend ?? this.plugin.settings.activeBackend ?? 'opencode';
            const conversation = await this.plugin.createConversationFromSession(sessionId, { title, backend: resolvedBackend, messages: initialMessages as ChatMessage[] });
            return conversation.id;
          },
          loadConversation: (conversationId) => this.loadConversation(conversationId),
          getActiveBackendKind: () => this.plugin.settings.activeBackend ?? null,
          showNotice: (message) => { new Notice(message); },
          isStreaming: () => this.isActiveTabStreaming(),
        };
        new BackendSessionBrowserModal(this.app, modalHost).open();
      },
    };
  }

  private createComposerInputShellCoordinatorHost(): ComposerInputShellCoordinatorHost {
    return {
      registerEscapeHandler: (handler) => {
        this.escapeHandlers.push(handler);
      },
      attachSessionTodo: (container) => {
        if (hasCapability(this.caps, AgentCapability.Todos)) {
          this.sessionTodoCoordinator.attach(container);
        }
      },
      attachQuestionDock: (container) => {
        if (hasCapability(this.caps, AgentCapability.Questions)) {
          this.questionDockSlotCoordinator.attach(container);
        }
      },
      setContextRowElement: (element) => {
        this.composerContextViewFacade.setContextRowElement(element);
      },
      setTooltipLabel: (element, label, position) => {
        ConversationRenderService.setTooltipLabel(element, label, position);
      },
      getInputPlaceholder: () => this.getInputPlaceholder(),
      getSlashCommandSkillMode: () => this.plugin.settings.slashCommandSkillMode,
      isCodexBackendActive: () => this.isCodexConversationActive(),
      onCodexAgentMentionUnavailable: () => this.codexChatSurfaceBinding.notifyAgentMentionUnavailable(),
      onCodexSkillsEmpty: () => this.codexChatSurfaceBinding.notifySkillsEmpty(),
      addChosenFileContextToActiveTab: async () => {
        await this.composerContextViewFacade.addChosenFileContextToActiveTab();
      },
      mountSelectionControls: (toolbar, options) => {
        this.chatSelectionControlsCoordinator.build(toolbar, {
          showModels: options.showModels && hasCapability(this.caps, AgentCapability.Models),
          showPermissions: options.showPermissions && hasCapability(this.caps, AgentCapability.Permissions),
        });
      },
      shouldMountAgentSelector: () => {
        // Pure capability gate: only show the primary-agent selector dropdown for
        // backends that declare the Subagents capability (OpenCode). Claude Code and
        // Codex lack it — Claude doesn't support choosing a "primary" agent before send
        // (its subagents are spawned on demand via the Task tool, surfaced through the
        // `@agent` inline mention, not this dropdown).
        return hasCapability(this.caps, AgentCapability.Subagents);
      },
      shouldHandleAgentMentions: () => {
        // The inline `@agent` mention menu (typing `@` in the textarea) is decoupled
        // from the dropdown above. OpenCode gates on Subagents; Claude keeps the mention
        // menu even though it lacks that capability, because it has a dedicated catalog
        // source (`loadClaudeRuntimeAgents` → `query.supportedAgents()`) and preserves
        // `@name` text verbatim in the prompt (MessageSendPreparationService) so the
        // model can spawn a Task-tool subagent at runtime.
        return hasCapability(this.caps, AgentCapability.Subagents) || this.isClaudeCodeConversationActive();
      },
      getComposerCapabilityHint: () => {
        // Show /json structured-output chip for backends that support it.
        // OpenCode backend: no hint (uses model selector + permissions instead).
        if (!this.isClaudeCodeConversationActive() && !this.isCodexConversationActive()) {
          return null;
        }
        return {
          text: t('chat.input.capabilityHint.jsonLabel'),
          tooltip: t('chat.input.capabilityHint.jsonTooltip'),
          insertText: '/json ',
        };
      },
      mountContextUsageIndicator: (container) => {
        if (!hasCapability(this.caps, AgentCapability.Context)) {
          return;
        }
        this.contextRingContainerEl = container;
        this.contextRing = new ContextRing(container, () => {
          this.activeTabContextUsageCoordinator.openContextUsageDetails();
        });
        this.activeTabContextUsageCoordinator.refreshContextUsageIndicator();
      },
      mountEffortSelector: (container) => {
        if (!hasCapability(this.caps, AgentCapability.Thinking)) {
          return;
        }

        this.effortContainerEl = container;
        this.effortSelector = new EffortSelector(container, {
          getVariants: () => {
            if (this.isClaudeCodeConversationActive()) {
              return [...CLAUDE_CODE_EFFORT_VARIANTS];
            }
            if (this.isCodexConversationActive()) {
              return [...CODEX_EFFORT_VARIANTS];
            }
            const current = this.getCurrentSessionModel();
            if (!current) return [];
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const modelRef = `${current.provider}/${current.model}`;
            return this.findKnownModelInfo({ provider: current.provider, model: current.model })?.variants ?? [];
          },
          getVariant: () => this.getCurrentEffortVariant(),
          onVariantChange: async (variant: string | undefined) => {
            if (this.isCodexConversationActive()) {
              // Codex effort: write back to persisted settings and update the
              // adapter so subsequent thread creation uses the new value.
              const effort = (variant ?? 'medium') as CodexReasoningEffort;
              this.plugin.settings.backendSettings.codex.modelReasoningEffort = effort;
              await this.plugin.saveSettings();
              this.currentVariant = effort;
              this.updateCodexAdapterEffort(effort);
              return;
            }
            const current = this.getCurrentSessionModel();
            this.currentVariant = this.normalizeEffortVariantForCurrentBackend(variant);
            if (current) {
              this.variantStore[`${current.provider}/${current.model}`] = this.currentVariant;
            }
          },
          getCurrentModel: () => {
            if (this.isCodexConversationActive()) {
              // Codex does not use the model catalog, but the effort selector
              // needs a non-empty model string to stay visible.
              return 'codex/default';
            }
            const current = this.getCurrentSessionModel();
            return current ? `${current.provider}/${current.model}` : '';
          },
          allowDefaultOption: () => !this.isClaudeCodeConversationActive() && !this.isCodexConversationActive(),
          getDefaultOptionLabel: () => t('chat.effort.disabled'),
          getBoundaryHint: () =>
            this.isCodexConversationActive() ? t('chat.effort.boundaryHint.codex') : undefined,
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
      getComposerAvailabilityState: () => this.getComposerAvailabilityState(),
      hasImageInputCapability: () => hasCapability(this.caps, AgentCapability.Images),
    };
  }

  private handleComposerInputSubmission(
    submission: ComposerInputSubmission,
  ): Promise<void> | void {
    if (submission.kind === 'shell') {
      logger.warn('Ignoring shell composer submission because the stable shell runtime is not enabled in this view', {
        commandPreview: previewLogText(submission.command, 120),
      });
      return;
    }

    if (submission.kind === 'prompt') {
      return this.sendPipelineRuntime.sendMessage({
        content: submission.content,
        ...(submission.syntheticTextParts ? { syntheticTextParts: submission.syntheticTextParts } : {}),
        ...(submission.invocationIntent ? { invocationIntent: submission.invocationIntent } : {}),
        ...(submission.images ? { images: submission.images } : {}),
      });
    }

    return this.sendPipelineRuntime.sendMessage(submission.rawContent);
  }

  private loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]> {
    if (!this.isOpenCodeBackendActive() && !this.isClaudeCodeConversationActive() && !this.isCodexConversationActive()) {
      return Promise.resolve([]);
    }

    // Codex skills come from the app-server via the cache host's
    // loadCodexRuntimeSkills seam, so Codex does not require opencodeConfigManager.
    if (!this.plugin.opencodeConfigManager && !this.isClaudeCodeConversationActive() && !this.isCodexConversationActive()) {
      return Promise.resolve([]);
    }

    return this.slashCommandMenuCatalogCache.load();
  }

  private scheduleSlashCommandMenuPreload(): void {
    if (!this.isOpenCodeBackendActive() && !this.isClaudeCodeConversationActive() && !this.isCodexConversationActive()) {
      return;
    }

    if (this.slashCommandMenuPreloadTimerId !== null) {
      window.clearTimeout(this.slashCommandMenuPreloadTimerId);
    }

    this.slashCommandMenuPreloadTimerId = window.setTimeout(() => {
      this.slashCommandMenuPreloadTimerId = null;
      if (!this.plugin.opencodeConfigManager) {
        return;
      }

      void this.getServerAvailability().then((availability) => {
        if (availability === 'disabled' || availability === 'offline' || availability === 'checking') {
          return;
        }

        this.slashCommandMenuCatalogCache.warm();
      });
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
      getInputPanelGlassRefractionSettings: () => this.plugin.settings.inputPanelGlassRefraction,
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
      ...createDebugLogCallbacks(),
    };
  }

  private createChatSurfaceAppearanceCoordinatorHost(): ChatSurfaceAppearanceCoordinatorHost {
    return {
      getChatContainerEl: () => this.chatContainerEl,
      getThemeBackgroundImageEl: () => this.themeBackgroundImageEl,
      getMessagesContainerEl: () => this.messagesContainer,
      getChatAppearanceSettings: () => this.plugin.settings.chatAppearance,
      getActiveThemePresetId: () => this.plugin.settings.theme.activePresetId,
      getChatScrollMode: () => this.plugin.settings.chatScrollMode,
      resolveChatThemeBackgroundDataUrl: () => this.plugin.resolveChatThemeBackgroundDataUrl(),
      applyConversationVisualState: () => {
        this.conversationSessionSettingsCoordinator.applyConversationVisualState(
          this.currentConversation,
        );
      },
      syncInputPanelAppearance: () => {
        this.inputPanelAppearanceCoordinator.syncAppearanceState();
      },
    };
  }

  private createChatSelectionControlsCoordinatorHost(): ChatSelectionControlsCoordinatorHost {
    return {
      registerEscapeHandler: (handler) => {
        this.escapeHandlers.push(handler);
      },
      loadModelCatalogData: async () => {
        if (this.isClaudeCodeConversationActive()) {
          const adapter = this.plugin.agentServiceRegistry?.get('claude-code') as {
            supportedModels?: () => Promise<Array<{ id: string; name: string; provider?: string }>>;
          } | undefined;
          const supportedModels = adapter?.supportedModels
            ? await adapter.supportedModels()
            : [];
          return {
            catalogBundle: null,
            providers: buildClaudeCodeModelSelectorProviders(supportedModels),
          };
        }
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
      getActiveTabModelOverride: () => this.getBackendScopedActiveTabModelOverride(),
      setActiveTabModelOverride: (selection) => {
        if (!this.tabManager?.getActiveTab()) {
          return false;
        }

        this.tabManager.setActiveTabModelOverride(selection);
        return true;
      },
      getDefaultModelSelection: () => {
        if (this.isClaudeCodeConversationActive()) {
          const model = this.plugin.settings.backendSettings.claudeCode.model.trim() || 'default';
          return {
            provider: CLAUDE_CODE_PROVIDER_ID,
            model,
          };
        }
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
      isModelAvailableOnServer: async (provider, model) => {
        if (this.isClaudeCodeConversationActive()) {
          return Boolean(provider && model);
        }
        return this.plugin.modelConfigService
          ? this.plugin.modelConfigService.isModelAvailableOnServer(provider, model)
          : true;
      },
      resolveProviderIconUrl: (providerId) =>
        ProviderIconService.resolveIconUrl(
          this.app,
          providerId,
          this.plugin.settings.providerIconLibrary,
        ),
      updateEffortSelectorDisplay: () => {
        if (this.isClaudeCodeConversationActive()) {
          const current = this.getCurrentSessionModel();
          if (current) {
            const modelRef = `${current.provider}/${current.model}`;
            const saved = this.variantStore[modelRef];
            this.currentVariant = this.normalizeEffortVariantForCurrentBackend(saved);
          } else {
            this.currentVariant = undefined;
          }
          this.effortSelector?.updateDisplay();
          return;
        }
        if (this.isCodexConversationActive()) {
          // Codex effort is stored in settings, not per-model variantStore.
          this.currentVariant = this.normalizeEffortVariantForCurrentBackend(this.currentVariant);
          this.effortSelector?.updateDisplay();
          return;
        }
        const current = this.getCurrentSessionModel();
        if (current) {
          const modelRef = `${current.provider}/${current.model}`;
          const saved = this.variantStore[modelRef];
          const available = this.findKnownModelInfo({ provider: current.provider, model: current.model })?.variants ?? [];
          this.currentVariant = saved && available.includes(saved) ? saved : undefined;
        } else {
          this.currentVariant = undefined;
        }
        this.effortSelector?.updateDisplay();
      },
      restoreComposerInputFocus: () => this.composerInputShellCoordinator.focusInput(),
      getPermissionMode: () => this.plugin.settings.permissionMode,
      switchPermissionMode: (mode) => this.switchPermissionMode(mode),
    };
  }

  private createTabRuntimeState(): TabRuntimeState {
    return {
      isStreaming: false,
      tabSessionLifecycle: createInitialTabSessionLifecycleState(),
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
      suppressNextLayoutAutoScroll: false,
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
        this.childSessionGraphCoordinator.clearContainer();
        const currentGraph = this.childSessionGraphCoordinator?.getGraph() ?? null;
        if (currentGraph && hasCapability(this.caps, AgentCapability.Subagents)) {
          this.childSessionGraphCoordinator.render(currentGraph);
        }
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
        this.modifiedFilesSidebarCoordinator.destroy();
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
            this.conversationTabRuntimeCoordinator.suppressNextLayoutAutoScroll(tabId);
          }
        },
      }, {
        onOpenToolSession: (sessionId, toolCall) =>
          this.conversationTabOpenCoordinator.openTaskToolSession(
            sessionId,
            toolCall,
            this.currentConversation?.backend,
          ),
        onOpenMcpServerDetail: (serverName) => this.openCodexMcpServerDetailFromChat(serverName),
        onAuthenticateMcpServer: (serverName) => { void this.authenticateMcpServerFromChat(serverName); },
        onRetryMcpToolCall: (toolCall) => { void this.retryMcpToolCallFromChat(toolCall); },
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

  getSessionIdForTab(tabId: TabId | null = this.getActiveTabId()): string | null {
    if (!tabId) {
      return null;
    }

    if (tabId === this.getActiveTabId()) {
      return this.getOpenCodeSessionIdForConversation(this.currentConversation);
    }

    const tab = this.tabManager?.getTab(tabId);
    if (!tab?.conversationId) {
      return this.getTabRuntimeState(tabId)?.sessionTodoSessionId ?? null;
    }

    const conversation = this.plugin.getConversations().find((item) => item.id === tab.conversationId);
    return this.getOpenCodeSessionIdForConversation(conversation)
      ?? this.getTabRuntimeState(tabId)?.sessionTodoSessionId
      ?? null;
  }

  private getOpenCodeSessionIdForConversation(
    conversation: Pick<Conversation, 'backend' | 'openCodeSessionId' | 'backendSessionId' | 'acpSessionId'> | null | undefined,
  ): string | null {
    // Use the universal resolver so all backends (OpenCode, Claude Code, ACP)
    // resolve their authoritative session ID.  The method name is historical;
    // the resolved value is the backend-agnostic session key used by
    // SessionTodoCoordinator for snapshot storage.
    return conversation ? (getConversationBackendSessionId(conversation) ?? null) : null;
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
    if (hasCapability(this.caps, AgentCapability.Todos)) {
      this.sessionTodoCoordinator.render(tabId);
    }
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
    this.modifiedFilesSidebarCoordinator = new ModifiedFilesSidebarCoordinator();
    this.currentVariant = undefined;
    this.slashCommandMenuCatalogCache = new SlashCommandMenuCatalogCache({
      getHiddenCommandIds: () => this.plugin.settings.hiddenSlashCommands ?? [],
      loadProjectAgents: async () => (this.isClaudeCodeConversationActive() || this.isCodexConversationActive()) ? {} : (this.plugin.opencodeConfigManager?.getAgentConfig() ?? {}),
      loadProjectCommands: async () => (this.isClaudeCodeConversationActive() || this.isCodexConversationActive()) ? {} : (this.plugin.opencodeConfigManager?.getCommandConfig() ?? {}),
      loadRuntimeCommands: async () => (this.isClaudeCodeConversationActive() || this.isCodexConversationActive()) ? [] : this.plugin.openCodeService.sdk.command.list(),
      loadRuntimeSkills: async () => (this.isClaudeCodeConversationActive() || this.isCodexConversationActive()) ? [] : this.plugin.openCodeService.sdk.app.skills(),
      loadClaudeRuntimeCommands: async () => {
        if (!this.isClaudeCodeConversationActive()) return null;
        const adapter = this.plugin.agentServiceRegistry?.get('claude-code') as {
          getRuntimeCatalog?: () => Promise<{ commands: Array<{ name: string; description?: string }> } | null>;
        } | undefined;
        const catalog = await adapter?.getRuntimeCatalog?.();
        return catalog?.commands ?? null;
      },
      loadClaudeRuntimeAgents: async () => {
        if (!this.isClaudeCodeConversationActive()) return null;
        const adapter = this.plugin.agentServiceRegistry?.get('claude-code') as {
          getRuntimeCatalog?: () => Promise<{ agents: Array<{ name: string; description?: string }> } | null>;
        } | undefined;
        const catalog = await adapter?.getRuntimeCatalog?.();
        return catalog?.agents ?? null;
      },
      loadCodexRuntimeSkills: async () => {
        if (!this.isCodexConversationActive()) return null;
        const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
          getRuntimeSkills?: () => Promise<Array<{ name: string; description?: string; enabled?: boolean; scope?: string }> | null>;
        } | undefined;
        const skills = await adapter?.getRuntimeSkills?.();
        return skills ?? null;
      },
      getBackendKey: () => this.isClaudeCodeConversationActive() ? 'claude-code' : (this.isCodexConversationActive() ? 'codex' : 'opencode'),
      getSlashCommandCapabilityKey: () => {
        // Fold the current v2.command.list / v2.skill.list capability
        // availability into the cache key. When server support flips, the key
        // mismatches and the next load() rebuilds the catalog. Defaults to a
        // stable constant for non-OpenCode backends or when the service is
        // unavailable, so existing behavior is preserved.
        if (this.isClaudeCodeConversationActive()) {
          return 'claude-code';
        }
        if (this.isCodexConversationActive()) {
          return 'codex';
        }
        const service = this.plugin.openCodeService;
        const requireCapability = service?.requireSdkCapability?.bind(service);
        if (typeof requireCapability !== 'function') {
          return 'default';
        }
        const commandSupported = isSdkCapabilitySupportedByLookup(requireCapability, 'v2.command.list');
        const skillSupported = isSdkCapabilitySupportedByLookup(requireCapability, 'v2.skill.list');
        return `cmd:${commandSupported ? '1' : '0'}:skill:${skillSupported ? '1' : '0'}`;
      },
      getVaultPath: () => getVaultBasePath(this.app),
      onWarmLoadFailed: (error) => { logger.debug('Failed to preload slash command menu items:', error); },
    });
    this.codexChatSurfaceBinding = new CodexChatSurfaceBinding({
      getCodexAdapter: () => this.plugin.agentServiceRegistry?.get('codex') as {
        onSkillsChanged?(handler: () => void): { dispose(): void };
      } | null ?? null,
      invalidateSlashCommandMenuCache: () => this.slashCommandMenuCatalogCache.invalidate(),
      openPluginSettings: () => this.openPluginSettingsPreservingScroll(),
      isCodexActive: () => this.isCodexConversationActive(),
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
    this.chatSurfaceAppearanceCoordinator = surfaceRuntime.chatSurfaceAppearanceCoordinator;
    this.conversationSessionSettingsCoordinator =
      surfaceRuntime.conversationSessionSettingsCoordinator;
    this.composerContextViewFacade = surfaceRuntime.composerContextViewFacade;
    this.tabConversationSyncFingerprintRuntimePort =
      surfaceRuntime.tabConversationSyncFingerprintRuntimePort;
    this.persistentAssistantNoticeService = surfaceRuntime.persistentAssistantNoticeService;
    this.conversationNoticeCoordinator = surfaceRuntime.conversationNoticeCoordinator;
    this.sessionTodoCoordinator = surfaceRuntime.sessionTodoCoordinator;
    this.childSessionGraphCoordinator = surfaceRuntime.childSessionGraphCoordinator;
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
    this.conversationIdentityRuntime = new ConversationIdentityRuntime({
      getCanonicalConversationFingerprint: (messages) => {
        const fingerprintBuilder = (
          this.plugin.openCodeService?.constructor as typeof OpenCodeService | undefined
        )?.getCanonicalConversationFingerprint;
        if (typeof fingerprintBuilder === 'function') {
          return fingerprintBuilder(messages);
        }
        return undefined;
      },
      getActiveTabId: () => this.getActiveTabId(),
      getTabContextUsage: (tabId) => this.tabManager?.getTabContextUsage(tabId) ?? null,
    });

    const userMessageContentRenderer = new UserMessageContentRenderer(
      this.createUserMessageContentRendererHost(),
    );
    this.userMessageContentRenderer = userMessageContentRenderer;
    const conversationRenderService = new ConversationRenderService(
      createConversationRenderHost({
        getCurrentConversation: () => this.currentConversation,
        getMessagesContainer: () => this.messagesContainer,
        getActiveTabId: () => this.getActiveTabId(),
        getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
        clearScheduledScrollToBottom: () => {
          this.clearScheduledScrollToBottom();
        },
        beginConversationHydration: (tabId) => {
          this.beginConversationHydration(tabId);
        },
        endConversationHydration: (tabId) => {
          this.endConversationHydration(tabId);
        },
        shouldRenderEmptyConversationNotice: () =>
          this.conversationNoticeCoordinator.shouldRenderEmptyConversationNotice(),
        createEmptyConversationNotice: () =>
          this.conversationNoticeCoordinator.createEmptyConversationNotice(),
        createUserMessageFrame: (message) =>
          this.createUserMessageRenderFrame(message),
        userMessageContentRenderer,
        addUserMessageFooter: (messageEl, message, content) => {
          this.addUserMessageFooter(messageEl, message, content);
        },
        renderMarkdownInto: (container, markdown) =>
          this.renderMarkdownInto(container, markdown),
        renderBackgroundTaskIndicatorIfNeeded: (tabId) => {
          if (hasCapability(this.caps, AgentCapability.Subagents)) {
            return this.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId);
          }
          return Promise.resolve();
        },
        syncBackgroundTaskStateFromConversation: (conversation) => {
          this.backgroundTaskHost.syncBackgroundTaskStateFromConversation(conversation);
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
        getMessagesForRender: (messages) =>
          this.conversationIdentityRuntime.getMessagesForRender(messages),
        getMessageVisualSignature: (message) =>
          this.conversationIdentityRuntime.getMessageVisualSignature(message),
        renderPersistedAssistantMessage: (options) =>
          this.assistantShellViewHostAdapter.renderPersistedAssistantMessage(options),
        createAssistantMessageElements: () =>
          this.assistantShellViewHostAdapter.createAssistantMessageElement(),
        finalizePseudoStreamFooter: (messageEl, message) => {
          this.assistantShellViewHostAdapter.finalizePseudoStreamFooter(messageEl, message);
        },
        clearStreamingMessageState: () => {
          this.streamingMessageEl = null;
          this.streamingContentEl = null;
        },
        getAssistantBodySignature: (message) => this.assistantShellViewHostAdapter.getAssistantBodySignature(message),
        renderAssistantMessageBody: (contentEl, message) =>
          this.assistantShellViewHostAdapter.renderMessageBody(contentEl, message),
        finalizePersistedFooter: (messageEl, message) => {
          this.assistantShellViewHostAdapter.finalizePersistedFooter(messageEl, message);
        },
        resetTurnState: () => {
          this.resetTurnState();
        },
      }),
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
    this.userMessageContentRenderer = interactionRuntime.userMessageContentRenderer;
    this.userMessageFooterRenderer = interactionRuntime.userMessageFooterRenderer;
    this.streamingInlineCardRenderer = interactionRuntime.streamingInlineCardRenderer;
    this.permissionInlineCardRenderer = interactionRuntime.permissionInlineCardRenderer;
    this.questionRuntimeServices = interactionRuntime.questionRuntimeServices;
    this.sendPipelineRuntime = interactionRuntime.sendPipelineRuntime;
    this.installClaudeCodePermissionHostContext();
    this.installCodexApprovalHostContext();
  }

  private installClaudeCodePermissionHostContext(): void {
    if (!this.plugin.claudeCodePermissionHostContext) {
      return;
    }

    this.plugin.claudeCodePermissionHostContext.getActiveTabId = () => this.getActiveTabId();
    this.plugin.claudeCodePermissionHostContext.permissionCardRenderer = this.permissionInlineCardRenderer;
    this.plugin.claudeCodePermissionHostContext.questionCardRenderer = {
      collectResponse: async (request, tabId) => {
        try {
          const result = await this.questionRuntimeServices.resolutionFlowCoordinator.showQuestionDialog(
            request,
            tabId,
            { applyResolution: false, forceInline: true },
          );
          return result.status === 'answered' ? result.answers : null;
        } finally {
          this.questionRuntimeServices.inlineCardRenderer.clear(tabId);
        }
      },
    };
    this.plugin.claudeCodePermissionHostContext.elicitationCardRenderer = {
      collectResponse: async (request, tabId) => {
        try {
          const result = await this.questionRuntimeServices.resolutionFlowCoordinator.showQuestionDialog(
            request,
            tabId,
            { applyResolution: false, forceInline: true },
          );
          if (result.status === 'rejected') {
            return { action: 'decline' };
          }
          if (result.status !== 'answered') {
            return { action: 'cancel' };
          }
          return { action: 'accept', answers: result.answers };
        } finally {
          this.questionRuntimeServices.inlineCardRenderer.clear(tabId);
        }
      },
    };
  }

  private installCodexApprovalHostContext(): void {
    if (!this.plugin.codexApprovalHostContext) {
      return;
    }
    this.plugin.codexApprovalHostContext.getActiveTabId = () => this.getActiveTabId();
    this.plugin.codexApprovalHostContext.approvalCardRenderer = {
      collectResponse: async (request, tabId) => {
        try {
          const questionRequest = buildCodexApprovalQuestionRequest(request);
          const result = await this.questionRuntimeServices.resolutionFlowCoordinator.showQuestionDialog(
            questionRequest,
            tabId,
            { applyResolution: false, forceInline: true },
          );
          return mapCodexApprovalResolution(result);
        } finally {
          this.questionRuntimeServices.inlineCardRenderer.clear(tabId);
        }
      },
    };
  }

  private createSurfaceRuntimeWiring(): OpenCodianViewSurfaceRuntimeWiring {
    // Read-only server-side fs/reference context surface. Only resolves support
    // for the v2 fs/reference capability family; never throws, so the Chat
    // context picker remains unaffected when the capability is absent.
    const serverReferenceContextService = this.plugin.openCodeService
      ? new ServerReferenceContextService({
          requireCapability: (id) => {
            try {
              const availability = this.plugin.openCodeService.requireSdkCapability(id);
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
      app: this.app,
      getServerMode: () => this.plugin.settings.server.mode,
      viewHost: this.createComposerContextViewHost(),
      focusRuntimeViewHost: this.createFocusContextRuntimeViewHost(),
      focusPreviewWritebackHost: this.createFocusContextPreviewWritebackHost(),
      serverContext: serverReferenceContextService,
    });
    const titleGenerationService = new TitleGenerationService(this.plugin);
    const questionDockSlotCoordinator = new QuestionDockSlotCoordinator(
      {
        shouldUseAboveInputQuestionDock: () => this.plugin.settings.questionCardPosition === 'above_input',
      },
      () => {
        if (hasCapability(this.caps, AgentCapability.Questions)) {
          this.questionDockCoordinator.render();
        }
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
        this.scrollScheduler,
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
      chatSurfaceAppearanceCoordinator: new ChatSurfaceAppearanceCoordinator(
        this.createChatSurfaceAppearanceCoordinatorHost(),
      ),
      conversationSessionSettingsCoordinator,
      composerContextViewFacade,
      tabConversationSyncFingerprintRuntimePort: this.createTabConversationSyncFingerprintRuntimePort(),
      persistentAssistantNoticeService: new PersistentAssistantNoticeService(
        this.createPersistentAssistantNoticeServiceHost(),
      ),
      conversationNoticeCoordinator: new ConversationNoticeCoordinator(
        this.createConversationNoticeCoordinatorHost(),
      ),
      sessionTodoCoordinator: createSessionTodoCoordinator(this.createSessionTodoViewHost()),
      childSessionGraphCoordinator: new ChildSessionGraphCoordinator(
        this.createChildSessionGraphCoordinatorHost(),
        (sessionId) => {
          void this.conversationTabOpenCoordinator.openTaskToolSession(
            sessionId,
            null,
            this.currentConversation?.backend,
          );
        },
      ),
      questionDockSlotCoordinator,
      assistantShellViewHostAdapter: new AssistantShellViewHostAdapter(
        this.createAssistantShellViewHostAdapterHost(),
        (sessionId, toolCall) =>
          this.conversationTabOpenCoordinator.openTaskToolSession(
            sessionId,
            toolCall,
            this.currentConversation?.backend,
          ),
        {
          onOpenMcpServerDetail: (serverName) => this.openCodexMcpServerDetailFromChat(serverName),
          onAuthenticateMcpServer: (serverName) => { void this.authenticateMcpServerFromChat(serverName); },
          onRetryMcpToolCall: (toolCall) => { void this.retryMcpToolCallFromChat(toolCall); },
        },
      ),
    };
  }

  private createBackgroundTaskRuntimeWiring(): OpenCodianViewBackgroundTaskRuntimeWiring {
    const questionTodoBackgroundTaskRuntime =
      createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam({
        getActiveTabId: () => this.getActiveTabId(),
        getCurrentConversation: () => this.currentConversation,
        setCurrentConversationRevertState: (revertState) => {
          this.currentConversationRevertState = revertState;
        },
        getConversationSyncRuntime: () => this.tabConversationSyncFingerprintRuntimePort,
        getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
        getSessionIdForTab: (tabId) => this.getSessionIdForTab(tabId),
        renderSessionTodoDock: (tabId) => {
          this.renderSessionTodoDock(tabId);
        },
        getQuestionDockCoordinator: () => this.questionDockCoordinator,
        getSessionTodoCoordinator: () => this.sessionTodoCoordinator,
        getQuestionDockSlotCoordinator: () => this.questionDockSlotCoordinator,
        getBackgroundTaskHost: () => this.backgroundTaskHost,
        getBackgroundTaskIndicatorCoordinator: () => this.backgroundTaskIndicatorCoordinator,
        getBackgroundTaskLiveSignalCoordinator: () => this.backgroundTaskLiveSignalCoordinator,
        getTabRuntimeStateBridge: () => this.tabRuntimeStateBridge,
      });
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
      this.createBackgroundTaskLiveSignalCoordinatorHostBuilderHost(),
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
    const tabActivationAssembly = createTabActivationRuntimeAssembly({
      hostProviderHost: this.createTabActivationRuntimeHostProviderHost(),
      focusPreviewRefresh: this.composerContextViewFacade,
      questionTodoActivationRefresh:
        backgroundTaskRuntime.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicator:
        backgroundTaskRuntime.backgroundTaskActivationIndicatorCoordinator,
      activeTabContextUsage: backgroundTaskRuntime.activeTabContextUsageCoordinator,
    });
    const { tabConversationStateBridge, tabViewActivationBridge } = tabActivationAssembly;
    const {
      conversationHydrationRenderBridge,
      conversationTransitionBridge,
      conversationHydrationOutcomeBridge,
    } = assembleConversationHydrationRuntime({
      host: this.createHydrationRuntimeHostDeps(conversationRenderService),
      tabConversationStateBridge,
      tabViewActivationBridge,
    });
    const tabConversationActivationBridge = tabActivationAssembly.tabConversationActivationBridge;
    const tabRuntimeStateBridge = tabActivationAssembly.tabRuntimeStateBridge;
    const conversationSyncRuntime = assembleConversationSyncRuntime({
      viewHost: this.createConversationSyncLoadRuntimeViewHost(conversationRenderService),
      visiblePostSyncCoordinator: backgroundTaskRuntime.visibleConversationPostSyncCoordinator,
      backgroundPostSyncHandoffCoordinator:
        backgroundTaskRuntime.backgroundConversationPostSyncHandoffCoordinator,
    });
    const tabActivationConversationSyncRuntimePort =
      assembleTabActivationConversationSyncRuntimePort({
        getConversationSyncFingerprint: (messages) =>
          this.conversationIdentityRuntime.getConversationSyncFingerprint(messages),
        setActiveTabConversationSyncFingerprint: (fingerprint) => {
          this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(
            this.getActiveTabId(),
            { fingerprint },
          );
        },
        startConversationSyncLoop: () => {
          conversationSyncRuntime.bridgePorts.getLoopControl().startConversationSyncLoop();
        },
        stopConversationSyncLoop: () => {
          conversationSyncRuntime.bridgePorts.getLoopControl().stopConversationSyncLoop();
        },
      });
    const conversationSessionSignalRuntime = new ConversationSessionSignalRuntime(
      this.createConversationSessionSignalRuntimeHost(),
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
    );
    const {
      backgroundTaskCompletionNoticeService,
      backgroundTaskInlinePanelRenderer,
      backgroundTaskIndicatorCoordinator,
      backgroundTaskStreamTriggerCoordinator,
      backgroundTaskHost,
    } = this.createBackgroundTaskInfrastructure(backgroundTaskRuntime, tabRuntimeStateBridge);
    this.backgroundTaskHost = backgroundTaskHost;
    const conversationLoadRuntimeBridge = new ConversationLoadRuntimeBridge(
      conversationSyncRuntime.conversationLoadRuntimeBridgeHost,
    );
    const loadRecoveryAssembly = assembleConversationLoadRecovery({
      viewStateHost: this.createConversationViewStateHost(),
      tabConversationStateBridge,
      tabConversationActivationBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
      tabOpenHost: this.createConversationTabOpenHost(),
      lifecycleRecoveryHost: this.createConversationTabLifecycleRecoveryHost(),
      loadRecoveryHostDeps: {
        isActiveTabStreaming: () => this.isActiveTabStreaming(),
        getCurrentConversation: () => this.currentConversation,
        getTabManager: () => this.tabManager,
        getMaxTabs: () => this.plugin.settings.maxTabs,
        getPersistedTabState: () => this.plugin.settings.tabState,
        setPersistedTabState: (state) => { this.plugin.settings.tabState = state; },
        persistTabState: (options) => { this.persistTabState(options); },
        loadConversations: () => this.plugin.loadConversations(),
        getConversations: () => this.plugin.getConversations(),
        getActiveBackend: () => this.plugin.settings.activeBackend,
        createConversation: () => this.plugin.createConversation(),
        app: this.app,
        revertSession: (sessionId, messageId) => this.routeConversationRevertSession(sessionId, messageId),
        unrevertSession: (sessionId) => this.routeConversationUnrevertSession(sessionId),
        forkSession: (sessionId, messageId) => this.routeConversationForkSession(sessionId, messageId),
        createConversationFromSession: (sessionId, initial) =>
          this.plugin.createConversationFromSession(sessionId, initial),
        deleteConversation: (conversationId) =>
          this.plugin.deleteConversation(conversationId),
        syncActiveTabConversation: (conversation) => {
          this.tabConversationStateBridge.syncActiveTabConversation(conversation);
        },
        updateModelSelectorDisplay: () => { this.updateModelSelectorDisplay(); },
        hasMatchingPersistentNotice: (title, content, tone, conversation) =>
          this.persistentAssistantNoticeService.hasMatchingMessage(title, content, tone, conversation),
        appendPersistentNotice: (options) =>
          this.persistentAssistantNoticeService.appendMessage(options),
      },
    });
    const {
      conversationLoadRecoveryCoordinator,
      conversationTabOpenCoordinator,
      conversationTabLifecycleRecoveryCoordinator,
    } = loadRecoveryAssembly;
    this.conversationTabOpenCoordinator = conversationTabOpenCoordinator;
    const conversationTabRuntimeCoordinator = assembleConversationTabRuntime({
      tabBarState: this.createTabBarMutableState(),
      settings: this.plugin.settings,
      plugin: this.plugin,
      view: this,
      paneCoordinator: this.tabMessagesPaneCoordinator,
      loadRecoveryCoordinator: conversationLoadRecoveryCoordinator,
      lifecycleRecoveryCoordinator: conversationTabLifecycleRecoveryCoordinator,
      runtimeStateBridge: tabRuntimeStateBridge,
    });

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
      backgroundTaskCompletionNoticeService,
      backgroundTaskInlinePanelRenderer,
      backgroundTaskIndicatorCoordinator,
      backgroundTaskStreamTriggerCoordinator,
      conversationLoadRecoveryCoordinator,
      conversationTabRuntimeCoordinator,
    };
  }

  private createBackgroundTaskInfrastructure(
    backgroundTaskRuntime: OpenCodianViewBackgroundTaskRuntimeWiring,
    tabRuntimeStateBridge: TabRuntimeStateBridge,
  ): {
    backgroundTaskCompletionNoticeService: BackgroundTaskCompletionNoticeService;
    backgroundTaskInlinePanelRenderer: BackgroundTaskInlinePanelRenderer;
    backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
    backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
    backgroundTaskHost: BackgroundTaskViewHost;
  } {
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
    const backgroundTaskIndicatorRenderPort = {
      renderIfNeeded: (tabId?: TabId | null) => {
        if (hasCapability(this.caps, AgentCapability.Subagents)) {
          return backgroundTaskIndicatorCoordinator.renderIfNeeded(tabId);
        }
        return Promise.resolve();
      },
    };
    const backgroundTaskHost = createBackgroundTaskViewHost({
      timelineService: backgroundTaskRuntime.backgroundTaskTimelineService,
      indicatorRenderPort: backgroundTaskIndicatorRenderPort,
    });
    const backgroundTaskStreamTriggerCoordinator = new BackgroundTaskStreamTriggerCoordinator(
      backgroundTaskIndicatorRenderPort,
      backgroundTaskRuntime.backgroundTaskTimelineService,
      backgroundTaskRuntime.backgroundTaskLiveSignalCoordinator,
      backgroundTaskRuntime.backgroundTaskStreamTriggerViewHost,
    );

    return {
      backgroundTaskCompletionNoticeService,
      backgroundTaskInlinePanelRenderer,
      backgroundTaskIndicatorCoordinator,
      backgroundTaskStreamTriggerCoordinator,
      backgroundTaskHost,
    };
  }

  private getCurrentConversationForkService():
    import('../../core/agents/backend/AgentService').AgentForkCapability | null {
    const conversation = this.currentConversation;
    const service = getConversationSessionBackendService(
      this.plugin.agentServiceRegistry,
      conversation,
    );
    if (!service?.hasCapability(AgentCapability.Fork)) {
      return null;
    }
    return service as unknown as import('../../core/agents/backend/AgentService').AgentForkCapability;
  }

  private getCurrentConversationBranchService():
    import('../../core/agents/backend/AgentService').AgentBranchCapability | null {
    const conversation = this.currentConversation;
    const service = getConversationSessionBackendService(
      this.plugin.agentServiceRegistry,
      conversation,
    );
    if (!service?.hasCapability(AgentCapability.Branching)) {
      return null;
    }
    return service as unknown as import('../../core/agents/backend/AgentService').AgentBranchCapability;
  }

  private routeConversationRevertSession(sessionId: string, messageId: string): Promise<boolean> {
    const backend = this.currentConversation?.backend ?? 'opencode';
    const branchService = this.getCurrentConversationBranchService();
    if (branchService) {
      return branchService.revertSession(sessionId, messageId);
    }
    if (backend === 'opencode') {
      return this.plugin.openCodeService.revertSession(sessionId, messageId);
    }
    throw new Error(`Rewind not available for backend "${backend}"`);
  }

  private routeConversationUnrevertSession(sessionId: string): Promise<boolean> {
    const backend = this.currentConversation?.backend ?? 'opencode';
    const branchService = this.getCurrentConversationBranchService();
    if (branchService) {
      return branchService.unrevertSession(sessionId);
    }
    if (backend === 'opencode') {
      return this.plugin.openCodeService.unrevertSession(sessionId);
    }
    throw new Error(`Restore rewind not available for backend "${backend}"`);
  }

  private routeConversationForkSession(sessionId: string, messageId: string): Promise<{ id: string; title: string }> {
    const backend = this.currentConversation?.backend ?? 'opencode';
    const forkService = this.getCurrentConversationForkService();
    if (forkService) {
      return forkService.forkSession(sessionId, messageId);
    }
    if (backend === 'opencode') {
      return this.plugin.openCodeService.forkSession(sessionId, messageId);
    }
    throw new Error(`Fork not available for backend "${backend}"`);
  }

  private createInteractionRuntimeWiring(
    conversationSyncBridgePorts: ConversationSyncBridgePorts,
    conversationRenderService: ConversationRenderService,
  ): OpenCodianViewInteractionRuntimeWiring {
    const messageFinalizationService = new MessageFinalizationService(
      createMessageFinalizationHost({
        getCurrentConversation: () => this.currentConversation,
        getActiveTabId: () => this.getActiveTabId(),
        syncConversationMessagesFromCanonicalState: (conversation, tabId, reason) =>
          this.syncConversationMessagesFromCanonicalState(conversation, tabId, reason),
        syncConversationMessagesFromServer: (conversation, tabId, reason) =>
          this.syncConversationMessagesFromServer(conversation, tabId, reason),
        conversationIdentityRuntime: this.conversationIdentityRuntime,
        conversationRenderService,
        backgroundTaskHost: this.backgroundTaskHost,
        conversationNoticeCoordinator: this.conversationNoticeCoordinator,
        sessionTodoCoordinator: this.sessionTodoCoordinator,
        createConversationWriteTicket: (conversationId) =>
          this.createConversationWriteTicket(conversationId),
        commitConversationWrite: (conversation, ticket, reason, write) =>
          this.commitConversationWrite(conversation, ticket, reason, write),
        conversationTabRuntimeCoordinator: this.conversationTabRuntimeCoordinator,
        setTabNeedsAttention: (tabId, needsAttention) =>
          this.setTabNeedsAttention(tabId, needsAttention),
        tabConversationStateBridge: this.tabConversationStateBridge,
        activeTabContextUsageCoordinator: this.activeTabContextUsageCoordinator,
        assistantShellViewHostAdapter: this.assistantShellViewHostAdapter,
        formatCurrentSessionModelId: () =>
          this.formatModelId(this.getCurrentSessionModel()),
        scrollToBottom: (options) => this.scrollToBottom(options),
      }),
    );
    const messageSendPreparationService = new MessageSendPreparationService(
      createMessageSendPreparationHost({
        getCurrentConversation: () => this.currentConversation,
        createNewConversation: async () => {
          await this.createNewConversation();
          return this.currentConversation;
        },
        createConversationWriteTicket: (conversationId) =>
          this.createConversationWriteTicket(conversationId),
        commitConversationWrite: (conversation, ticket, reason, write) =>
          this.commitConversationWrite(conversation, ticket, reason, write),
        getActiveTabId: () => this.getActiveTabId(),
        ensureTabRuntimeState: (tabId) => this.ensureTabRuntimeState(tabId),
        isTabForegroundBusy: (tabId) => this.isTabForegroundBusy(tabId),
        conversationTabRuntimeCoordinator: this.conversationTabRuntimeCoordinator,
        getServerAvailability: () => this.getServerAvailability(),
        chatHeaderPresenter: this.chatHeaderPresenter,
        settingsTab: this.plugin.settingsTab ?? null,
        getServerMode: () => this.plugin.settings.server.mode,
        openPluginSettingsAtServerSection: () => this.openPluginSettingsAtServerSection(),
        startServer: () => this.plugin.openCodeService.start(),
        notifyForegroundBusy: () => {
          new Notice(t('chat.tab.processingBlocked'));
        },
        assistantShellViewHostAdapter: this.assistantShellViewHostAdapter,
        messageFinalizationService,
        chatSelectionControlsCoordinator: this.chatSelectionControlsCoordinator,
        reloadModelCatalog: () => this.reloadModelCatalog(),
        getSendMessageOptions: () => this.getSendMessageOptions(),
        appendModelUnavailableNoticeMessage: () => this.appendModelUnavailableNoticeMessage(),
        openCodeService: this.plugin.openCodeService,
        backgroundTaskHost: this.backgroundTaskHost,
        conversationSyncBridgePorts,
        conversationRenderService,
        scrollToBottom: (options) => this.scrollToBottom(options),
        applyFallbackConversationTitle: (conversationId, firstMessage) =>
          this.applyFallbackConversationTitle(conversationId, firstMessage),
        getTitleMode: () => this.plugin.settings.titleMode,
        getClaudeAutoTitle: () => this.plugin.settings.backendSettings.claudeCode.autoTitle,
        startAiConversationTitleGeneration: (conversationId, firstMessage, modelOptions) => {
          void this.startAiConversationTitleGeneration(conversationId, firstMessage, modelOptions);
        },
        activeTabContextUsageCoordinator: this.activeTabContextUsageCoordinator,
        syncTabStreamLikeState: (tabId) => this.syncTabStreamLikeState(tabId),
      }),
      this.composerContextViewFacade.sendContext,
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
    const questionRuntimeServices = createQuestionRuntimeBundle(
      questionRuntimeViewHostFactoryHost,
      {
        conversationSync: conversationSyncBridgePorts.getVisibleSyncFollowUp(),
        statusRefresh: this.sessionTodoCoordinator,
        streamingInlineCardRenderer,
      },
    );
    const slashCommandExecutionService = new SlashCommandExecutionService(
      createSlashCommandExecutionHost({
        getCurrentConversation: () => this.currentConversation,
        createNewConversation: async () => {
          await this.createNewConversation();
        },
        getActiveTabId: () => this.getActiveTabId(),
        ensureTabRuntimeState: (tabId) => this.ensureTabRuntimeState(tabId),
        isTabForegroundBusy: (tabId) => this.isTabForegroundBusy(tabId),
        notifyForegroundBusy: () => {
          new Notice(t('chat.tab.processingBlocked'));
        },
        getServerAvailability: () => this.getServerAvailability(),
        chatHeaderPresenter: this.chatHeaderPresenter,
        ensureServerReadyForChat: (availability) =>
          messageSendPreparationService.ensureServerReadyForChat(availability),
        opencodeConfigManager: this.plugin.opencodeConfigManager,
        getSlashCommandSkillMode: () => this.plugin.settings.slashCommandSkillMode,
        openCodeServiceSdk: this.plugin.openCodeService.sdk,
        openCodeService: this.plugin.openCodeService,
        runCompactSession: (sessionId) => executeCompactSession(
          sessionId,
          this.plugin.openCodeService,
          () => this.getCurrentSessionModel(),
          () => this.getCurrentSessionModelResolution(),
        ),
        getVaultPath: () => getVaultBasePath(this.app),
        composerContextViewFacade: this.composerContextViewFacade,
        getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
        conversationSyncBridgePorts,
        notifySlashCommandFailed: (commandId, error) => {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(t('chat.slashCommand.executionFailed', {
            command: commandId,
            message,
          }));
        },
      }),
    );
    const sendPipelineRuntime = new SendPipelineRuntime(
      createSendPipelineRuntimeHost(this.createSendPipelineHostDependencies()),
      messageSendPreparationService,
      messageFinalizationService,
      slashCommandExecutionService,
    );

    return {
      messageSendPreparationService,
      messageFinalizationService,
      assistantNoticeCardRenderer,
      userMessageContentRenderer: this.userMessageContentRenderer,
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

  private createConversationNoticeCoordinatorHost(): ConversationNoticeCoordinatorHost {
    return {
      getCurrentSessionModel: () => this.getCurrentSessionModel(),
      formatModelId: (model) => this.chatSelectionControlsCoordinator.formatModelId(model),
      isConversationRewound: () => Boolean(this.currentConversationRevertState?.messageID),
      getActiveTabId: () => this.getActiveTabId(),
      getSessionDiff: (sessionId, sourceMessageId) =>
        this.plugin.openCodeService.getSessionDiff(sessionId, sourceMessageId),
      getCachedSessionDiffEntries: (sessionId) =>
        this.plugin.openCodeService.getCachedSessionDiffEntries(sessionId),
      appendPersistentNotice: (options) =>
        this.persistentAssistantNoticeService.appendMessage(options),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) => {
        if (hasCapability(this.caps, AgentCapability.Subagents)) {
          return this.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId);
        }
        return Promise.resolve();
      },
      handleRestoreRewindRequest: () => this.handleRestoreRewindRequest(),
      openPluginSettingsPreservingScroll: () => {
        this.openPluginSettingsPreservingScroll();
        window.setTimeout(() => {
          this.plugin.settingsTab?.scrollToModelSection();
        }, 50);
      },
      hasAnyEnabledBackend: () => this.hasAnyEnabledBackend(),
      hasBackendConnection: () => this.hasBackendConnection(),
    };
  }

  private createSessionTodoViewHost(): SessionTodoViewHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getActiveTabId: () => this.getActiveTabId(),
      getCurrentConversationSessionId: () => this.currentConversation ? getConversationBackendSessionId(this.currentConversation) : null,
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
        if (!conversation) {
          this.childSessionGraphCoordinator.clearGraph();
          this.childSessionGraphCoordinator.hide();
        }
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
        this.childSessionGraphCoordinator.clearContainer();
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
        if (hasCapability(this.caps, AgentCapability.Context)) {
          this.contextRing?.update(state);
        }
      },
      getSessionContextUsageSnapshot: (sessionId) => {
        const conversation = this.currentConversation;
        const backend = conversation ? (conversation.backend ?? 'opencode') : 'opencode';
        if (backend === 'claude-code') {
          const adapter = this.plugin.agentServiceRegistry?.get('claude-code') as {
            getSessionContextUsageSnapshot?(sessionId: string): Promise<unknown | null>;
          } | undefined;
          if (typeof adapter?.getSessionContextUsageSnapshot === 'function') {
            return adapter.getSessionContextUsageSnapshot(sessionId).then((result) => {
              if (result && typeof result === 'object' && 'sessionId' in result) {
                return result as ContextUsageSnapshot;
              }
              return null;
            });
          }
          return Promise.resolve(null);
        }
        if (backend === 'codex') {
          const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
            getContextUsageSnapshot?(sessionId: string): Promise<unknown | null>;
          } | undefined;
          if (typeof adapter?.getContextUsageSnapshot === 'function') {
            return adapter.getContextUsageSnapshot(sessionId).then((result) => {
              if (result && typeof result === 'object' && 'sessionId' in result) {
                return result as ContextUsageSnapshot;
              }
              return null;
            });
          }
          return Promise.resolve(null);
        }
        return this.plugin.openCodeService.getSessionContextUsageSnapshot(sessionId);
      },
      getForegroundCompactionAvailability: (sessionId): ForegroundCompactionAvailability => {
        const conversation = this.currentConversation;
        if ((conversation?.backend ?? 'opencode') !== 'codex') {
          return { status: 'unavailable' };
        }
        const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
          getForegroundCompactionAvailability?(sessionId: string): ForegroundCompactionAvailability;
        } | undefined;
        if (typeof adapter?.getForegroundCompactionAvailability !== 'function') {
          return { status: 'unavailable' };
        }
        return adapter.getForegroundCompactionAvailability(sessionId);
      },
      compactForegroundThread: (
        sessionId,
        options,
      ): Promise<ForegroundCompactionActionResult> => {
        const conversation = this.currentConversation;
        if ((conversation?.backend ?? 'opencode') !== 'codex') {
          return Promise.resolve({
            status: 'unavailable',
            acknowledged: false,
            runtimeVerified: false,
            started: false,
            completed: false,
            tokenUsageObserved: false,
          });
        }
        const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
          compactForegroundThread?(
            sessionId: string,
            options?: ForegroundCompactionActionOptions,
          ): Promise<ForegroundCompactionActionResult>;
        } | undefined;
        if (typeof adapter?.compactForegroundThread !== 'function') {
          return Promise.resolve({
            status: 'unavailable',
            acknowledged: false,
            runtimeVerified: false,
            started: false,
            completed: false,
            tokenUsageObserved: false,
          });
        }
        return adapter.compactForegroundThread(sessionId, options);
      },
      hasTab: (tabId) => Boolean(this.tabManager?.getTab(tabId)),
      getTabContextUsage: (tabId) => this.tabManager?.getTabContextUsage(tabId) ?? null,
      setTabContextUsage: (tabId, contextUsage) => {
        this.tabManager?.setTabContextUsage(tabId, contextUsage);
      },
      getActiveTabId: () => this.getActiveTabId(),
      openContextUsageDetailsModal: (contextState) => {
        new ContextDetailModal(this.app, {
          conversation: this.currentConversation,
          contextState,
          systemPrompt: this.plugin.settings.systemPrompt,
          rawMessageLoader: () => {
            const conversation = this.currentConversation;
            const sessionId = conversation ? getConversationBackendSessionId(conversation) ?? null : null;
            return loadBackendSessionMessages(
              this.plugin.agentServiceRegistry,
              conversation,
              sessionId,
            );
          },
          compactionCoordinator: this.activeTabContextUsageCoordinator,
        }).open();
      },
      persistContextUsageSnapshot: async (tabId, snapshot) => {
        const conversation = this.getConversationForTab(tabId);
        if (!conversation) {
          return;
        }
        const backendSessionId = getConversationBackendSessionId(conversation);
        const canFinalizeProvisionalCodexSession = (conversation.backend ?? 'opencode') === 'codex'
          && typeof backendSessionId === 'string'
          && backendSessionId.startsWith('codex-local-');
        if (backendSessionId !== snapshot.sessionId && !canFinalizeProvisionalCodexSession) {
          return;
        }
        if (canFinalizeProvisionalCodexSession) {
          conversation.backendSessionId = snapshot.sessionId;
        }
        conversation.lastContextUsage = snapshot;
        await this.plugin.saveConversation(conversation);
      },
      enrichContextUsageSnapshot: (snapshot) => {
        const service = this.plugin.modelPricingService;
        const backend = this.currentConversation?.backend ?? 'opencode';
        return service?.enrichContextUsageSnapshot(
          snapshot,
          service.getBackendPricingIdentityHint(backend, this.plugin.settings.backendSettings),
        ) ?? snapshot;
      },
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
        this.backgroundTaskHost.resetBackgroundTaskIndicator(tabId);
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
  ConversationSyncRuntimeAssemblyViewHost {
    return {
      loadConversations: () => this.plugin.loadConversations(),
      getConversationById: async (id) => (await this.plugin.getConversationById(id)) ?? null,
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      getAllTabs: () => this.tabManager?.getAllTabs() ?? [],
      getTab: (tabId) => this.tabManager?.getTab(tabId) ?? null,
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getConversationSyncFingerprint: (messages) =>
        this.conversationIdentityRuntime.getConversationSyncFingerprint(messages),
      canSyncConversationWithServer: () => this.canSyncConversationWithServer(),
      syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
        this.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      syncConversationMessagesFromCanonicalState: (conversation, tabId, reason, options) =>
        this.syncConversationMessagesFromCanonicalState(conversation, tabId, reason, options),
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        conversationRenderService.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) => {
        if (hasCapability(this.caps, AgentCapability.Subagents)) {
          return this.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId);
        }
        return Promise.resolve();
      },
      hasInterruptedLocalAssistantTail: (messages) => hasInterruptedLocalAssistantTail(messages),
      transitionTabSessionLifecycle: (tabId, phase, reason) =>
        this.conversationTabRuntimeCoordinator.transitionTabSessionLifecycle(tabId, phase, reason),
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
      shouldRenderConversationMessage: (message) =>
        this.conversationIdentityRuntime.shouldRenderConversationMessage(message),
      getConversationSyncFingerprint: (messages) =>
        this.conversationIdentityRuntime.getConversationSyncFingerprint(messages),
      getInterruptedSyncPreservationLogFingerprint: (conversation, messages) =>
        this.conversationIdentityRuntime.getInterruptedSyncPreservationLogFingerprint(
          conversation,
          messages,
        ),
      createConversationWriteTicket: (conversationId) =>
        this.createConversationWriteTicket(conversationId),
      commitConversationWrite: (conversation, ticket, reason, write) =>
        this.commitConversationWrite(conversation, ticket, reason, write),
      logOmoBackgroundTaskDiagnostics: (conversation, previousMessages, nextMessages) => {
        this.backgroundTaskHost.logOmoBackgroundTaskDiagnostics(
          conversation, previousMessages, nextMessages,
        );
      },
      markBackgroundTaskAuthoritativeSync: (tabId, reason) => {
        this.markBackgroundTaskAuthoritativeSync(tabId, reason);
      },
      refreshContextUsageAfterActiveConversationSync: (conversation, tabId) =>
        this.refreshContextUsageAfterActiveConversationSync(conversation, tabId),
      armBackgroundTaskIndicatorForUserMessage: (message, tabId) => {
        this.backgroundTaskHost.armBackgroundTaskIndicatorForUserMessage(message, tabId);
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
      renderBackgroundTaskIndicatorIfNeeded: (tabId) => {
        if (hasCapability(this.caps, AgentCapability.Subagents)) {
          return this.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId);
        }
        return Promise.resolve();
      },
      summarizeChatMessageForDebug: (message) => summarizeChatMessageForDebug(message),
      ...createDebugLogCallbacks(),
    };
  }

  private createTabConversationSyncFingerprintRuntimePort():
    TabConversationSyncFingerprintRuntimePort {
    return {
      getConversationSyncFingerprint: (messages) =>
        this.conversationIdentityRuntime.getConversationSyncFingerprint(messages),
      setTabConversationSyncFingerprint: (tabId, fingerprint) => {
        this.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, {
          fingerprint,
        });
      },
    };
  }

  private createHydrationRuntimeHostDeps(
    conversationRenderService: ConversationRenderService,
  ): ConversationHydrationRuntimeViewHost {
    return {
      getMessagesContainer: () => this.messagesContainer,
      getActiveTabId: () => this.getActiveTabId(),
      getScrollRuntimeForTab: (tabId) => this.getTabRuntimeState(tabId),
      scrollToBottom: ({ tabId }) => { this.scrollToBottom({ tabId }); },
      syncPaneScrollMetrics: (tabId, messagesEl) => {
        this.syncPaneScrollMetrics(tabId, messagesEl);
      },
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      syncBackgroundTaskStateFromConversation: (conversation) => {
        this.backgroundTaskHost.syncBackgroundTaskStateFromConversation(conversation);
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
        this.updateConversationTitleState(conversationId, { titleGenerationStatus: undefined }),
      resetBackgroundTaskIndicator: () => {
        this.backgroundTaskHost.resetBackgroundTaskIndicator();
      },
      clearScheduledScrollToBottom: () => { this.clearScheduledScrollToBottom(); },
      beginConversationHydration: (tabId) => { this.beginConversationHydration(tabId); },
      clearMessagesContainer: () => { this.messagesContainer?.empty(); },
      resetTurnState: () => { this.resetTurnState(); },
      endConversationHydration: (tabId) => { this.endConversationHydration(tabId); },
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
      applySessionDiffUpdate: (_tabId, _update) => {
        // stored in sessionStateStore via OpenCodeService sync handler
        this.refreshModifiedFilesSidebar();
      },
    };
  }

  private createBackgroundTaskCompletionNoticeServiceHost(): BackgroundTaskCompletionNoticeServiceHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      appendPersistentAssistantNoticeMessage: (options) => {
        if (hasCapability(this.caps, AgentCapability.Subagents)) {
          return this.persistentAssistantNoticeService.appendMessage(options);
        }
        return Promise.resolve();
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
      createConversationFromSession: (sessionId, initial) =>
        this.plugin.createConversationFromSession(sessionId, initial),
      deleteConversation: (conversationId) =>
        this.plugin.deleteConversation(conversationId),
      showNotice: (message) => {
        new Notice(message);
      },
    };
  }

  private createTabBarMutableState(): TabBarMutableState {
    const state: TabBarMutableState = {
      tabManager: this.tabManager,
      tabBar: this.tabBar,
      tabBarMountEl: this.tabBarMountEl,
    };
    Object.defineProperty(state, 'tabManager', {
      get: () => this.tabManager,
      set: (v: TabManager | null) => { this.tabManager = v; },
      enumerable: true,
      configurable: false,
    });
    Object.defineProperty(state, 'tabBar', {
      get: () => this.tabBar,
      set: (v: TabBar | null) => { this.tabBar = v; },
      enumerable: true,
      configurable: false,
    });
    Object.defineProperty(state, 'tabBarMountEl', {
      get: () => this.tabBarMountEl,
      set: (v: HTMLElement | null) => { this.tabBarMountEl = v; },
      enumerable: true,
      configurable: false,
    });
    return state;
  }

  getInputTabBarSlotEl(): HTMLElement | null {
    return this.composerInputShellCoordinator.getTabBarSlotEl();
  }

  getChatContainerEl(): HTMLElement | null {
    return this.chatContainerEl;
  }

  getHeaderTabBarSlotEl(): HTMLElement | null {
    return this.headerTabBarSlotEl;
  }

  getBelowHeaderTabBarSlotEl(): HTMLElement | null {
    return this.belowHeaderTabBarSlotEl;
  }

  getOuterVerticalTabBarSlotEl(): HTMLElement | null {
    return this.outerVerticalTabBarSlotEl;
  }

  getTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
  ): SessionActivityStatus | null {
    return this.sessionTodoCoordinator.getTabSessionStatus(tabId, sessionId);
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
      cancelOpenCodeDiagnosticCapture: (tabId) => {
        this.plugin.openCodeTraceService.cancelDeepCapture(tabId);
      },
      showNotice: (message) => {
        new Notice(message);
      },
    };
  }

  private createSendPipelineHostDependencies(): SendPipelineHostDependencies {
    return {
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
        if (this.messagesContainer) {
          ConversationRenderService.removeEmptyAssistantShells(this.messagesContainer);
        }
      },
      syncTabStreamLikeState: (tabId) => {
        this.syncTabStreamLikeState(tabId);
      },
      transitionTabSessionLifecycle: (tabId, phase, reason) =>
        this.conversationTabRuntimeCoordinator.transitionTabSessionLifecycle(tabId, phase, reason),
      refreshServerStatusBadge: () => this.chatHeaderPresenter.refreshServerStatusBadge(),
      claimOpenCodeDiagnosticRunToken: (tabId, sessionId) => {
        if (!tabId) return undefined;
        return this.plugin.openCodeTraceService.claimDeepCapture(tabId, sessionId);
      },
      refreshOpenCodeDiagnosticsState: (tabId) => {
        if (!shouldRefreshOpenCodeDiagnosticsHeader(this.getActiveTabId(), tabId)) return;
        this.chatHeaderPresenter.refreshBackendChrome();
      },
      sendStreamMessage: (conversation, content, options) => {
        const backend = getConversationChatBackendService(this.plugin.agentServiceRegistry, conversation);
        if (!backend) {
          throw new Error(`Backend ${conversation.backend ?? 'opencode'} does not support chat`);
        }
        return backend.sendMessage({
          sessionId: options.sessionId ?? '',
          content,
          images: options.images,
          options: { ...options },
        });
      },
      detachStream: (sessionId) => {
        if (sessionId) {
          const conversation = this.currentConversation;
          const backend = conversation
            ? getConversationChatBackendService(this.plugin.agentServiceRegistry, conversation)
            : undefined;
          const conversationBackend = conversation?.backend ?? 'opencode';
          if (backend && conversationBackend !== 'opencode') {
            backend.cancelStream(sessionId);
          } else {
            this.plugin.openCodeService.detachStream(sessionId);
          }
        }
      },
      syncLatestUserMessageFromServer: (conversation, optimisticMessageId, tabId) =>
        this.syncLatestUserMessageFromServer(conversation, optimisticMessageId, tabId),
      beginTabContextUsageStream: (tabId) => {
        const conversation = this.getConversationForTab(tabId);
        if (conversation && (conversation.backend ?? 'opencode') !== 'opencode') {
          return;
        }
        this.activeTabContextUsageCoordinator.beginTabContextUsageStream(tabId);
      },
      completeTabContextUsageStream: (tabId) => {
        this.activeTabContextUsageCoordinator.completeTabContextUsageStream(tabId);
      },
      applyUsageChunkToTab: (tabId, chunk) => {
        this.activeTabContextUsageCoordinator.applyUsageChunkToTab(tabId, chunk);
      },
      applyContextUsageSnapshotToTab: (tabId, snapshot) => {
        this.activeTabContextUsageCoordinator.applyContextUsageSnapshotToTab(tabId, snapshot);
      },
      showPermissionDialog: (request, tabId) => this.showPermissionDialog(request, tabId),
      showQuestionDialog: async (request, tabId) => {
        await this.questionRuntimeServices.resolutionFlowCoordinator.showQuestionDialog(request, tabId);
      },
      convertToStreamingChunk: (chunk) => this.convertToStreamingChunk(chunk),
      getFriendlyStreamErrorMessage: (rawMessage) => this.conversationNoticeCoordinator.getFriendlyStreamErrorMessage(rawMessage),
      createSendPipelineShellPort: () => this.assistantShellViewHostAdapter.createSendPipelineShellPort(),
      createConversationWriteTicket: (conversationId) =>
        this.createConversationWriteTicket(conversationId),
      commitConversationWrite: (conversation, ticket, reason, write) =>
        this.commitConversationWrite(conversation, ticket, reason, write),
      summarizeContentBlocksForDebug: (blocks) =>
        summarizeContentBlocksForDebug(blocks as SendPipelineDebugContentBlock[] | undefined),
      summarizeCoreStreamChunkForDebug: (chunk) => summarizeCoreStreamChunkForDebug(chunk),
      summarizeChatMessageForDebug: (message) => summarizeChatMessageForDebug(message),
      ...createDebugLogCallbacks(),
    };
  }

  private createAssistantNoticeCardRendererHost(): AssistantNoticeCardRendererHost {
    return {
      renderMarkdownInto: (container, markdown) => this.renderMarkdownInto(container, markdown),
      handleNoticeAction: (actionType) => this.conversationNoticeCoordinator.routeNoticeAction(actionType),
      handleCollapsibleToggle: () => this.scheduleActiveSettledScrollToBottomIfNeeded(),
    };
  }

  private createUserMessageContentRendererHost(): UserMessageContentRendererHost {
    return {
      getRenderUserMarkupAsCodeBlocks: () => this.plugin.settings.renderUserMarkupAsCodeBlocks,
      hasCompactionCapability: () => hasCapability(this.caps, AgentCapability.Compaction),
      renderMarkdownInto: (container, markdown) => this.renderMarkdownInto(container, markdown),
      scheduleActiveSettledScrollToBottomIfNeeded: () => {
        this.scheduleActiveSettledScrollToBottomIfNeeded();
      },
      openContextAttachment: (path) => {
        void this.app.workspace.openLinkText(path, '', 'tab');
      },
    };
  }

  private createUserMessageFooterRendererHost(): UserMessageFooterRendererHost {
    const hasCurrentConversationCapability = (capability: AgentCapability): boolean => {
      const conversation = this.currentConversation;
      const service = getConversationSessionBackendService(
        this.plugin.agentServiceRegistry,
        conversation,
      );
      if (service) {
        return service.hasCapability(capability);
      }
      if ((conversation?.backend ?? 'opencode') === 'opencode') {
        return hasCapability(getActiveBackendCapabilities(), capability);
      }
      return false;
    };

    return {
      isStreaming: () => this.isActiveTabStreaming(),
      hasForkCapability: () =>
        hasCurrentConversationCapability(AgentCapability.Fork),
      hasRewindCapability: () =>
        hasCurrentConversationCapability(AgentCapability.Branching),
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
        this.assistantShellViewHostAdapter.setStreamingAssistantMessageVisibility(
          messageEl,
          visible,
          reason,
          (payload) => {
            logAssistantFinalizationDebug('stream-visibility-changed', payload);
          },
        );
      },

      renderNoticeCard: (container, message) =>
        this.assistantNoticeCardRenderer.render(container, message),
      shouldRenderQuestionResolutionCards: () => this.shouldRenderQuestionResolutionCards(),
      suppressActiveLayoutAutoScrollOnce: () => this.suppressActiveLayoutAutoScrollOnce(),
      getMarkdownService: () => this.markdownService,
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
      getCurrentConversationSessionId: () => this.currentConversation ? getConversationBackendSessionId(this.currentConversation) : null,
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

    await measureStep('wireEventHandlers', () => {
      this.wireEventHandlers();
    });
    await measureStep('buildUI', () => {
      this.buildUI();
    });
    await measureStep('initializeTabSystem', () => {
      this.initializeTabSystem();
    });
    await measureStep('startServerStatusLoop', () => {
      this.chatHeaderPresenter.startServerStatusLoop();
    });
    await measureStep('startLspStatusLoop', () => {
      this.chatHeaderPresenter.startLspStatusLoop(
        () => this.plugin.openCodeService.getLspStatus(),
        () => {
          this.plugin.settingsTab?.prepareScrollToLspOnNextOpen();
          const settings = this.appSettings();
          settings.open();
          try { settings.openTabById('opencodian'); } catch { /* DOM not ready yet */ }
        },
      );
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
    await measureStep('wireBackendSurfaceSwitch', () => {
      this.wireBackendSurfaceSwitch();
      this.codexChatSurfaceBinding.syncSkillsChangedSubscription();
    });
    await measureStep('startConversationSessionSignalRuntime', () => {
      if (this.shouldStartConversationSessionSignalRuntime()) {
        this.conversationSessionSignalRuntime.start();
      }
    });
    await measureStep('initializeFirstTab', () => this.initializeFirstTab());
    this.plugin.registerConversationCachePinProvider(this.conversationCachePinProvider);

    logger.info(
      `[view-open] completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} | ${stepSummaries.join(', ')}`,
    );
    this.scheduleSlashCommandMenuPreload();
  }

  async onClose() {
    this.plugin.unregisterConversationCachePinProvider(this.conversationCachePinProvider);
    this.persistTabState({ flush: true });
    this.clearSlashCommandMenuPreload();
    this.chatHeaderPresenter.destroy();
    this.conversationHistoryActionsCoordinator.destroy();
    this.conversationSyncBridgePorts.getLoopControl().stopConversationSyncLoop();
    this.composerContextViewFacade.dispose();
    this.chatSurfaceAppearanceCoordinator.destroy();
    this.clearScheduledComposerLayoutSync();
    this.clearScheduledScrollToBottom();
    this.childSessionGraphCoordinator.clearGraph();
    this.childSessionGraphCoordinator.hide();
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
    this.modifiedFilesSidebarCoordinator.destroy();
    this.chatVisualDemoCoordinator.destroyAll();
    this.permissionInlineCardRenderer.clearSessionApprovals();
    this.backendActiveChangeDisposable?.dispose();
    this.backendActiveChangeDisposable = null;
    this.backendCapabilityChangeDisposable?.dispose();
    this.backendCapabilityChangeDisposable = null;
    this.codexChatSurfaceBinding.dispose();

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

  private getPinnedConversationIdsForFullMessageCache(): ReadonlySet<string> {
    const conversationIds = new Set<string>();
    if (this.currentConversation?.id) {
      conversationIds.add(this.currentConversation.id);
    }
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      if (tab.conversationId) {
        conversationIds.add(tab.conversationId);
      }
    }
    return conversationIds;
  }

  /** Build the UI structure */
  private buildUI() {
    if (this.chatContainerEl) {
      return;
    }
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

    // Visual demo coordinator
    this.chatVisualDemoCoordinator = new ChatVisualDemoCoordinator({
      getMessagesShellEl: () => this.messagesShellEl,
      showNotice: (message: string) => { new Notice(message); },
      logWarn: (message: string, ...args: unknown[]) => { logger.warn(message, ...args); },
    });

    // Input area
    this.inputContainer = this.chatContainerEl.createDiv({ cls: 'opencodian-input-area' });
    this.composerInputShellCoordinator.build(this.inputContainer);
    this.updateComposerAvailabilityUi();
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
    this.modifiedFilesSidebarCoordinator.destroy();

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
    this.modifiedFilesSidebarCoordinator.mountSidebar(outerMountEl as HTMLElement, this.app);
    this.refreshModifiedFilesSidebar();
  }

  private refreshModifiedFilesSidebar(): void {
    const conversation = this.currentConversation;
    const backend = conversation?.backend ?? 'opencode';
    // Session diff is OpenCode-only.  Claude's rewind/diff surface is not
    // stable-complete — see status doc §"What Exists But Must Not Be Described As Stable Completion".
    const sessionId = backend === 'opencode' && conversation
      ? (conversation.openCodeSessionId ?? null)
      : null;
    this.modifiedFilesSidebarCoordinator.setVisible(
      this.plugin.settings.showModifiedFilesSidebar
      && hasCapability(this.caps, AgentCapability.Context),
    );
    this.modifiedFilesSidebarCoordinator.refresh(
      sessionId,
      (id) => this.plugin.openCodeService.getCachedSessionDiffEntries(id),
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
    this.refreshModifiedFilesSidebar();
  }

  private async handleTabClose(tabId: string): Promise<void> {
    await this.conversationTabRuntimeCoordinator.handleTabClose(tabId);
  }

  private async activateTab(tabId: string): Promise<void> {
    await this.conversationTabRuntimeCoordinator.activateTab(tabId);
    this.refreshModifiedFilesSidebar();
  }

  public applyTabBarLayout(): void {
    this.conversationTabRuntimeCoordinator.applyTabBarLayout();
  }

  public applyChatAppearanceSettings(): void {
    this.chatSurfaceAppearanceCoordinator.syncAppearanceState();
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
    if (this.tabMessagesPaneCoordinator.applyScrollModeToPanes()) {
      this.chatSurfaceAppearanceCoordinator.syncChatSurfaceColor();
      return;
    }

    this.chatSurfaceAppearanceCoordinator.syncScrollMode();
  }

  public applyChatScrollModeToMessagesEl(messagesEl: HTMLElement): void {
    this.chatSurfaceAppearanceCoordinator.applyScrollModeToMessagesEl(messagesEl);
  }

  /** Re-sync sticky mask color after theme/layout changes settle */
  public scheduleChatSurfaceColorSync(): void {
    this.chatSurfaceAppearanceCoordinator.scheduleSurfaceColorSync();
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

  public refreshAvailabilityUi(): void {
    void this.chatHeaderPresenter.refreshServerStatusBadge();
    this.updateComposerAvailabilityUi();
  }

  private openPluginSettingsPreservingScroll(): void {
    const savedScrollTop = this.plugin.settings.settingsPanelScrollTop;
    this.plugin.settingsTab?.prepareRestoreScrollOnNextOpen(savedScrollTop);
    const settings = this.appSettings();
    settings.open();
    try { settings.openTabById('opencodian'); } catch { /* DOM not ready yet */ }
  }

  private openPluginSettingsAtServerSection(): void {
    this.plugin.settingsTab?.prepareScrollToServerOnNextOpen();
    const settings = this.appSettings();
    settings.open();
    try { settings.openTabById('opencodian'); } catch { /* DOM not ready yet */ }
  }

  private openPluginSettingsAtActiveBackendRuntimeSection(): void {
    if (this.isActiveBackendOpenCode()) {
      this.openPluginSettingsAtServerSection();
      return;
    }

    this.plugin.settingsTab?.prepareScrollToClaudeCodeOnNextOpen();
    const settings = this.appSettings();
    settings.open();
    try { settings.openTabById('opencodian'); } catch { /* DOM not ready yet */ }
  }

  private async getServerAvailability(): Promise<ChatServerAvailability> {
    if (!this.hasAnyEnabledBackend()) {
      this.lastResolvedServerAvailability = 'disabled';
      return 'disabled';
    }

    if (!this.hasBackendConnection()) {
      this.lastResolvedServerAvailability = 'disabled';
      return 'disabled';
    }

    if (!this.isActiveBackendOpenCode()) {
      const activeBackend = this.plugin.settings.activeBackend ?? 'opencode';
      const adapterStatus = this.plugin.agentServiceRegistry?.get(activeBackend)?.status;
      const availability = adapterStatus
        ? this.mapAgentConnectionStatusToServerAvailability(adapterStatus)
        : 'offline';
      this.lastResolvedServerAvailability = availability;
      return availability;
    }

    const isHealthy = await this.plugin.openCodeService.checkHealth();
    const internalStatus = this.plugin.openCodeService.getServerStatus();
    const hasManagedProcess = this.plugin.openCodeService.isServerProcessRunning();

    if (isHealthy && !hasManagedProcess) {
      this.lastResolvedServerAvailability = 'external';
      return 'external';
    }

    if (isHealthy) {
      this.lastResolvedServerAvailability = 'running';
      return 'running';
    }

    if (internalStatus === 'starting' || internalStatus === 'restarting') {
      this.lastResolvedServerAvailability = 'starting';
      return 'starting';
    }

    this.lastResolvedServerAvailability = 'offline';
    return 'offline';
  }

  private getComposerAvailabilityState(): {
    kind: 'ready' | 'no-backend' | 'backend-offline';
    title: string;
    description: string;
  } {
    if (!this.hasAnyEnabledBackend()) {
      return {
        kind: 'no-backend',
        title: t('chat.empty.noBackend.title'),
        description: t('chat.empty.noBackend.description'),
      };
    }

    if (!this.hasBackendConnection()) {
      return {
        kind: 'backend-offline',
        title: t('chat.empty.backendOffline.title'),
        description: t('chat.empty.backendOffline.description'),
      };
    }

    if (this.lastResolvedServerAvailability === 'offline' || this.lastResolvedServerAvailability === 'disabled') {
      return {
        kind: 'backend-offline',
        title: t('chat.empty.backendOffline.title'),
        description: t('chat.empty.backendOffline.description'),
      };
    }

    if (this.lastResolvedServerAvailability === 'running' || this.lastResolvedServerAvailability === 'external') {
      return {
        kind: 'ready',
        title: '',
        description: '',
      };
    }

    // null (initial load before first health check) or 'starting'/'checking' — optimistic ready.
    // The first onServerAvailabilityRefreshed callback will correct the state within one polling cycle.
    return {
      kind: 'ready',
      title: '',
      description: '',
    };
  }

  public toggleLiquidDiamondDemo(): void {
    this.chatVisualDemoCoordinator?.toggleLiquidDiamondDemo();
  }

  public toggleLiquidDiamondWebGlDemo(): void {
    this.chatVisualDemoCoordinator?.toggleLiquidDiamondWebGlDemo();
  }

  public async toggleGlassOctahedron(): Promise<void> {
    await this.chatVisualDemoCoordinator?.toggleGlassOctahedron();
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

  private scheduleComposerLayoutSync(): void {
    this.composerInputShellCoordinator.scheduleLayoutSync();
  }

  private clearScheduledComposerLayoutSync(): void {
    this.composerInputShellCoordinator.clearScheduledLayoutSync();
  }

  private shouldRenderQuestionResolutionCards(): boolean {
    return this.plugin.settings.showAnsweredQuestionCards;
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
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', () => {
      for (const handler of this.escapeHandlers) {
        if (handler()) {
          return false;
        }
      }
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
  async createConversationInCurrentTab(): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.createConversationInCurrentTab();
  }

  /**
   * Minimal public seam for external hosts (e.g. settings-side backend session browser)
   * to load a resumed conversation without exposing the full private load path.
   */
  async loadConversationForExternalHost(conversationId: string): Promise<void> {
    await this.loadConversation(conversationId);
  }

  /** Create a new conversation in the current tab */
  private async createNewConversationInCurrentTab(): Promise<void> {
    await this.createConversationInCurrentTab();
  }

  /** Load a conversation */
  private async loadConversation(
    id: string,
    options: { forceServerSync?: boolean; preserveScrollPosition?: boolean } = {},
  ): Promise<void> {
    const conversation = await this.plugin.getConversationById(id, { preferCache: true });
    const activeBackend = this.plugin.settings.activeBackend ?? 'opencode';
    if (conversation && (conversation.backend ?? 'opencode') !== activeBackend) {
      logger.warn('Blocked cross-backend conversation load', {
        conversationId: id,
        conversationBackend: conversation.backend ?? 'opencode',
        activeBackend,
      });
      await this.ensureActiveBackendConversationSurface(activeBackend);
      return;
    }

    await this.conversationLoadRecoveryCoordinator.loadConversation(id, options);
    this.refreshModifiedFilesSidebar();
    await this.childSessionGraphCoordinator.refreshGraph();
  }

  private wireBackendSurfaceSwitch(): void {
    this.backendActiveChangeDisposable?.dispose();
    this.backendActiveChangeDisposable = this.plugin.agentServiceRegistry?.onActiveChange((backend) => {
      void this.ensureActiveBackendConversationSurface(backend ?? undefined);
    }) ?? null;
    this.backendCapabilityChangeDisposable?.dispose();
    this.backendCapabilityChangeDisposable = this.plugin.agentServiceRegistry?.onCapabilitiesChange((backend) => {
      if (backend !== this.plugin.agentServiceRegistry?.getActiveKind()) {
        return;
      }
      this.refreshComposerToolbarForActiveBackend();
      this.activeTabContextUsageCoordinator.syncIdentity();
      this.codexChatSurfaceBinding.syncSkillsChangedSubscription();
    }) ?? null;
  }

  private async ensureActiveBackendConversationSurface(
    activeBackend = this.plugin.settings.activeBackend,
  ): Promise<void> {
    if (!activeBackend) {
      return;
    }

    if (this.backendSurfaceSwitchPromise) {
      await this.backendSurfaceSwitchPromise;
      return;
    }

    this.backendSurfaceSwitchPromise = this.applyActiveBackendConversationSurface(activeBackend)
      .finally(() => {
        this.backendSurfaceSwitchPromise = null;
      });
    await this.backendSurfaceSwitchPromise;
  }

  private async applyActiveBackendConversationSurface(activeBackend: AgentBackendKind): Promise<void> {
    this.chatHeaderPresenter.refreshBackendChrome();
    this.chatHeaderPresenter.applyLocaleTexts();
    this.refreshComposerToolbarForActiveBackend();
    void this.chatHeaderPresenter.refreshServerStatusBadge();

    if ((this.currentConversation?.backend ?? 'opencode') === activeBackend) {
      return;
    }

    if (this.isActiveTabStreaming()) {
      new Notice(t('chat.tab.streamingBlocked'));
      return;
    }

    await this.plugin.loadConversations();
    const targetConversation = this.plugin.getConversations().find(
      (conversation) => (conversation.backend ?? 'opencode') === activeBackend,
    );

    if (targetConversation) {
      await this.loadConversation(targetConversation.id);
      return;
    }

    await this.createConversationInCurrentTab();
  }

  private refreshComposerToolbarForActiveBackend(): void {
    this.contextRing?.destroy();
    this.contextRing = null;
    this.contextRingContainerEl = null;
    this.effortSelector?.destroy();
    this.effortSelector = null;
    this.effortContainerEl = null;
    this.chatSelectionControlsCoordinator.destroy();
    this.composerInputShellCoordinator.refreshToolbarControls();
  }

  private async deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.deleteConversationsAndRecover(conversationIds);
  }

  /** Cancel streaming */
  private cancelStreaming() {
    logger.debug('cancelStreaming called, isStreaming:', this.isStreaming);
    if (!this.isActiveTabStreaming()) {
      return;
    }

    const currentConversation = this.currentConversation;
    const backendSessionId = currentConversation
      ? getConversationBackendSessionId(currentConversation)
      : null;
    if (currentConversation && backendSessionId) {
      const backend = getConversationChatBackendService(this.plugin.agentServiceRegistry, currentConversation);
      backend?.cancelStream(backendSessionId);
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

  private updateComposerAvailabilityUi(): void {
    this.composerInputShellCoordinator.updateComposerAvailabilityState();
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

  private async renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void> {
    if (this.markdownService) {
      await this.markdownService.render(container, markdown);
      return;
    }

    container.setText(markdown);
  }

  public shouldRenderConversationMessage(message: ChatMessage): boolean {
    return this.conversationIdentityRuntime.shouldRenderConversationMessage(message);
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
      fingerprint: this.conversationIdentityRuntime.getConversationSyncFingerprint(
        conversation.messages,
      ),
    });
  }

  private addUserMessageFooter(messageEl: HTMLElement, message: ChatMessage, content?: string): void {
    this.userMessageFooterRenderer.render(messageEl, message, content);
  }

  private async handleRewindRequest(message: ChatMessage): Promise<void> {
    await this.conversationLoadRecoveryCoordinator.handleRewindRequest(message);
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
    const result = await this.conversationAuthoritativeSyncCoordinator.syncConversationMessagesFromServer(
      conversation,
      tabId,
      reason,
      options,
    );
    await this.refreshChildSessionGraphIfVisibleConversation(conversation, tabId);
    return result;
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
    const result = await this.conversationAuthoritativeSyncCoordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      tabId,
      reason,
      options,
    );
    if (result) {
      await this.refreshChildSessionGraphIfVisibleConversation(conversation, tabId);
    }
    return result;
  }

  private async refreshChildSessionGraphIfVisibleConversation(
    conversation: Conversation,
    tabId: TabId | null,
  ): Promise<void> {
    if (this.currentConversation?.id !== conversation.id || this.getActiveTabId() !== tabId) {
      return;
    }

    await this.childSessionGraphCoordinator.refreshGraph();
  }

  private async refreshContextUsageAfterActiveConversationSync(
    conversation: Conversation,
    tabId: TabId | null,
  ): Promise<void> {
    if (this.currentConversation?.id !== conversation.id || this.getActiveTabId() !== tabId) {
      return;
    }
    if ((conversation.backend ?? 'opencode') !== 'opencode') {
      return;
    }

    await this.activeTabContextUsageCoordinator.refreshFromServer();
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
      const backendSessionId = getConversationBackendSessionId(conversation);
      const backend = this.plugin.agentServiceRegistry
        ? getConversationSessionBackendService(this.plugin.agentServiceRegistry, conversation)
        : null;
      if (backendSessionId && backend) {
        try {
          await backend.updateSessionTitle(backendSessionId, conversation.title);
        } catch (error) {
          logger.warn('Failed to sync conversation title to server:', error);
        }
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

  private suppressActiveLayoutAutoScrollOnce(tabId: TabId | null = this.getActiveTabId()): void {
    this.conversationTabRuntimeCoordinator.suppressNextLayoutAutoScroll(tabId);
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
    this.scrollScheduler.schedule(() => {
      this.scrollToBottom({ tabId });
    });
  }

  private clearScheduledScrollToBottom(): void {
    this.scrollScheduler.clear();
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

  private isClaudeCodeConversationActive(): boolean {
    return (
      this.plugin.settings.activeBackend
      ?? this.currentConversation?.backend
      ?? 'opencode'
    ) === 'claude-code';
  }

  private isCodexConversationActive(): boolean {
    return (
      this.plugin.settings.activeBackend
      ?? this.currentConversation?.backend
      ?? 'opencode'
    ) === 'codex';
  }

  /**
   * Checks whether an OpenCode SDK capability is available before rendering OR
   * acting on a session/fs/reference affordance. Non-OpenCode backends and any
   * transient lookup failure default to `true` (preserves existing behavior and
   * never blocks the Chat main chain). Callers MUST re-check before action.
   */
  private isSessionCapabilityAvailable(capabilityId: string): boolean {
    if (!this.isOpenCodeBackendActive()) {
      return true;
    }
    const service = this.plugin.openCodeService;
    const requireCapability = service?.requireSdkCapability?.bind(service);
    if (typeof requireCapability !== 'function') {
      return true;
    }
    // Optimistic on lookup failure: never block the Chat main chain (streaming,
    // hydration, sync) due to a transient capability probe error.
    try {
      const availability = requireCapability(capabilityId);
      if (availability && 'supported' in availability && availability.supported === false) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  private getAvailableExperimentalActionIds(): string[] {
    if (!this.isOpenCodeBackendActive()) {
      return [];
    }

    const actions = [
      ['pty.create', 'v2.pty.create'],
      ['control-plane.move-session', 'experimental.controlPlane.moveSession'],
      ['session.background', 'experimental.session.background'],
      ['project-copy.create', 'v2.projectCopy.create'],
    ] as const;
    return actions.flatMap(([action, capabilityId]) => {
      const availability = this.plugin.openCodeService.requireSdkCapability(capabilityId);
      return availability.kind === 'available' ? [action] : [];
    });
  }

  private async openExperimentalActionsForCurrentConversation(): Promise<void> {
    const conversation = this.currentConversation;
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : null;
    const defaultDirectory = getVaultBasePath(this.app);
    if (!sessionId || !defaultDirectory) {
      new Notice(t('chat.experimentalActions.noSessionScope'));
      return;
    }

    const availableActions = new Set(this.getAvailableExperimentalActionIds());
    if (availableActions.size === 0) {
      return;
    }

    const projectId = availableActions.has('project-copy.create')
      ? await this.plugin.openCodeService.getCurrentProjectId()
      : null;
    if (!projectId) {
      availableActions.delete('project-copy.create');
    }

    if (availableActions.size === 0) {
      return;
    }

    new OpenCodeExperimentalActionModal(this.app, {
      sessionId,
      defaultDirectory,
      projectId,
      availableActions,
      runAction: (request) => this.plugin.openCodeService.runExperimentalAction(request),
      onBackgroundActionCompleted: () => {
        this.handleExperimentalBackgroundActionCompleted();
      },
    }).open();
  }

  private handleExperimentalBackgroundActionCompleted(): void {
    const tabId = this.getActiveTabId();
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const latestUserMessage = this.currentConversation?.messages
      .filter((message) => message.role === 'user')
      .at(-1);
    const anchorKey = latestUserMessage ? this.getMessageAnchorKey(latestUserMessage) : null;
    const turnBodyEl = anchorKey ? runtime.turnBodyByAnchorKey.get(anchorKey) : null;
    if (turnBodyEl?.isConnected) {
      const statusEl = turnBodyEl.createDiv({
        cls: 'opencodian-experimental-background-status',
        text: t('chat.experimentalActions.background.inlineCompleted'),
      });
      statusEl.dataset.experimentalBackgroundStatus = 'completed';
    }
  }

  private openCodexMcpServerDetailFromChat(serverName: string): void {
    if (!this.isCodexConversationActive()) {
      return;
    }
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getMcpServerStatus?: () => Promise<unknown[] | null>;
      reloadMcpServers?: () => Promise<boolean>;
      triggerMcpServerOAuth?: (name: string, options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void }) => Promise<import('../../core/agents/backend/CodexAppServerClient').McpOauthLoginResult | null>;
      readMcpServerResource?: (server: string, uri: string) => Promise<unknown>;
    } | null;
    if (!adapter) {
      return;
    }
    new CodexMcpServerDetailModal(
      this.app,
      createCodexMcpServerDetailHost(adapter),
      serverName,
    ).open();
  }

  private async authenticateMcpServerFromChat(serverName: string): Promise<void> {
    if (!this.isCodexConversationActive()) {
      return;
    }
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      triggerMcpServerOAuth?: (name: string, options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void }) => Promise<import('../../core/agents/backend/CodexAppServerClient').McpOauthLoginResult | null>;
    } | null;
    if (!adapter?.triggerMcpServerOAuth) {
      return;
    }
    new Notice(t('settings.codex.mcpDetail.authenticating'));
    try {
      const result = await adapter.triggerMcpServerOAuth(serverName, {
        onAuthorizationUrl: (url: string) => {
          new Notice(t('settings.codex.mcpDetail.authBrowserOpened'));
          window.open(url, '_blank');
        },
      });
      if (!result || result.outcome === 'failed') {
        new Notice(t('settings.codex.mcpDetail.authFailed'));
        applyMcpAuthOutcomeToContainer(this.contentEl, serverName, 'failed');
      } else if (result.outcome === 'completed') {
        new Notice(t('settings.codex.mcpDetail.authSucceeded'));
        applyMcpAuthOutcomeToContainer(this.contentEl, serverName, 'completed');
      } else {
        new Notice(t('settings.codex.mcpDetail.authPending'));
        applyMcpAuthOutcomeToContainer(this.contentEl, serverName, 'pending');
      }
    } catch {
      new Notice(t('settings.codex.mcpDetail.authFailed'));
      applyMcpAuthOutcomeToContainer(this.contentEl, serverName, 'failed');
    }
  }

  private async retryMcpToolCallFromChat(toolCall: ToolCallInfo): Promise<void> {
    if (!this.isCodexConversationActive()) {
      return;
    }
    const serverName = getMcpServerName(toolCall);
    if (!serverName) {
      return;
    }
    const backendSessionId = this.currentConversation?.backendSessionId;
    if (!backendSessionId) {
      applyMcpRetryOutcome(this.contentEl, toolCall.id, {
        ok: false,
        text: 'Retry unavailable — no backend thread yet. Re-send your message to continue.',
      });
      return;
    }
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      retryMcpToolCall?: (
        backendSessionId: string,
        server: string,
        tool: string,
        toolArguments: Record<string, unknown>,
      ) => Promise<import('../../core/agents/backend/CodexAppServerClient').AppServerMcpToolCallResult | null>;
    } | null;
    if (!adapter?.retryMcpToolCall) {
      applyMcpRetryOutcome(this.contentEl, toolCall.id, {
        ok: false,
        text: 'Retry unavailable — app-server not reachable.',
      });
      return;
    }
    try {
      const result = await adapter.retryMcpToolCall(
        backendSessionId,
        serverName,
        toolCall.name,
        toolCall.input ?? {},
      );
      if (!result) {
        applyMcpRetryOutcome(this.contentEl, toolCall.id, {
          ok: false,
          text: 'Retry failed — app-server not reachable.',
        });
        return;
      }
      if (result.errorReason) {
        applyMcpRetryOutcome(this.contentEl, toolCall.id, {
          ok: false,
          text: `Retry failed: ${result.errorReason}`,
        });
        return;
      }
      const text = result.content
        .map((entry) => entry.text ?? '')
        .filter((line) => line.length > 0)
        .join('\n')
        .trim();
      if (result.isError) {
        applyMcpRetryOutcome(this.contentEl, toolCall.id, {
          ok: false,
          text: text || 'Retry failed — the tool returned an error. Auth may not be the only issue.',
        });
        return;
      }
      const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      applyMcpRetryOutcome(this.contentEl, toolCall.id, {
        ok: true,
        text: preview
          ? `Retry succeeded. ${preview}`
          : 'Retry succeeded — the tool call works now. Re-send your message to continue.',
      });
    } catch {
      applyMcpRetryOutcome(this.contentEl, toolCall.id, {
        ok: false,
        text: 'Retry failed — unexpected error.',
      });
    }
  }

  private getBackendScopedActiveTabModelOverride(): ModelSelectorSelection | null {
    const override = this.tabManager?.getActiveTabModelOverride() ?? null;
    if (!override || !this.isClaudeCodeConversationActive()) {
      return override;
    }

    return this.isClaudeCodeModelProvider(override.provider) ? override : null;
  }

  private isClaudeCodeModelProvider(provider: string | undefined): boolean {
    return provider === CLAUDE_CODE_PROVIDER_ID
      || provider === 'anthropic'
      || provider === 'claude';
  }

  private normalizeEffortVariantForCurrentBackend(variant: string | undefined): string | undefined {
    if (this.isCodexConversationActive()) {
      // Codex uses its own effort scale; fall back to persisted setting.
      return variant && CODEX_EFFORT_VARIANTS.some((candidate) => candidate === variant)
        ? variant
        : this.plugin.settings.backendSettings.codex.modelReasoningEffort;
    }
    if (!this.isClaudeCodeConversationActive()) {
      return variant;
    }
    return variant && CLAUDE_CODE_EFFORT_VARIANTS.some((candidate) => candidate === variant)
      ? variant
      : this.plugin.settings.backendSettings.claudeCode.effort;
  }

  private getCurrentEffortVariant(): string | undefined {
    return this.normalizeEffortVariantForCurrentBackend(this.currentVariant);
  }

  /**
   * Push a new reasoning-effort value into the live Codex adapter so that
   * subsequent thread creation/resume uses the updated level.
   * This does NOT affect already-running threads.
   */
  private updateCodexAdapterEffort(effort: CodexReasoningEffort): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex');
    if (adapter && 'updateModelReasoningEffort' in adapter) {
      (adapter as { updateModelReasoningEffort(e: CodexReasoningEffort): void })
        .updateModelReasoningEffort(effort);
    }
  }

  /** Get model options for sendMessage */
  private getSendMessageOptions(): { provider?: string; model?: string; variant?: string } {
    const current = this.getCurrentSessionModel();
    if (!current) {
      return {};
    }

    return {
      provider: current.provider,
      model: current.model,
      variant: this.getCurrentEffortVariant(),
    };
  }

  private async ensureSelectedModelAvailable(
    provider: string | undefined,
    model: string | undefined,
  ): Promise<boolean> {
    return this.chatSelectionControlsCoordinator.ensureSelectedModelAvailable(provider, model);
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
          toolMetadata: chunk.toolMetadata,
          resultVisibility: chunk.toolResultVisibility,
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
      case 'backend_event':
      case 'content_block_start':
      case 'content_block_stop':
        // These chunks don't need to be converted for rendering
        return null;

      default:
        return null;
    }
  }

  /** Switch permission mode and restart OpenCode service */
  private async switchPermissionMode(mode: PermissionMode): Promise<boolean> {
    const previousMode = this.plugin.settings.permissionMode;
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
      return true;
    } catch (error) {
      this.plugin.settings.permissionMode = previousMode;
      try {
        await this.plugin.saveSettings();
      } catch (rollbackError) {
        logger.error('Failed to persist permission mode rollback:', rollbackError);
      }
      logger.error('Failed to switch permission mode:', error);
      new Notice(t('settings.security.autoRestart.failed'));
      return false;
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
    if (!hasCapability(this.caps, AgentCapability.Permissions)) {
      return;
    }

    try {
      const responded = await this.permissionInlineCardRenderer.collectAndRespond(
        request,
        tabId,
        (requestId, reply) => this.plugin.openCodeService.respondToPermission(requestId, reply),
      );
      if (!responded) {
        logger.error('No streaming message element found for permission card');
        return;
      }
    } catch (error) {
      logger.error('Failed to respond to permission:', error);
      new Notice(t('permissionDialog.notice.error'));
    }
  }
}
