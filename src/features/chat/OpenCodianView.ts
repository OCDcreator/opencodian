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
  type InputPanelActionButtonStyleId,
  type InputPanelGlassRefractionSvgFilterPresetId,
  type InputPanelGlassRefractionSvgFilterSettings,
  type InputPanelThemeId,
  type LiquidGlassAdapterId,
  type PromptContextItem,
  type QuestionRequest,
  type QuestionResolution,
  type SessionDiffEntry,
  type SessionTodo,
  type ToolCallInfo,
  VIEW_TYPE_OPENCODIAN,
} from '../../core/types';
import type { EffortLevel, ThinkingBudget } from '../../core/types/settings';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  createLogger,
  getVaultBasePath,
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
} from '../../shared';
import { chooseForkTarget } from '../../shared/modals';
import { getGlassAdapter, type GlassEffectAdapter, type GlassMountContext } from '../../utils/glass';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { MarkdownRenderService } from '../../utils/markdown';
import {
  StreamController,
  ThinkingBlockRenderer,
  ToolCallRenderer,
} from '../../utils/streaming';
import {
  applyPassiveScrollMeasurement,
  applyUserScrollIntent,
  hasProgrammaticScrollGuard,
} from './autoScrollState';
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
  type ConversationHydrationOutcomeBridgeHost,
} from './runtime/ConversationHydrationOutcomeBridge';
import {
  ConversationHydrationRenderBridge,
  type ConversationHydrationRenderBridgeHost,
} from './runtime/ConversationHydrationRenderBridge';
import {
  ConversationLoadRuntimeBridge,
  type ConversationLoadRuntimeBridgeHost,
} from './runtime/ConversationLoadRuntimeBridge';
import {
  ConversationTransitionBridge,
  type ConversationTransitionBridgeHost,
} from './runtime/ConversationTransitionBridge';
import {
  TabConversationActivationBridge,
  type TabConversationActivationBridgeHost,
} from './runtime/TabConversationActivationBridge';
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
  TabConversationStateBridge,
  type TabConversationStateBridgeHost,
} from './runtime/TabConversationStateBridge';
import {
  TabRuntimeStateBridge,
  type TabRuntimeStateBridgeHost,
} from './runtime/TabRuntimeStateBridge';
import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from './runtime/TabViewActivationBridge';
import {
  ActiveTabContextUsageCoordinator,
  type ActiveTabContextUsageCoordinatorHost,
} from './services/ActiveTabContextUsageCoordinator';
import {
  type BackgroundTaskCompletionInfo,
  BackgroundTaskCompletionNoticeService,
  type BackgroundTaskCompletionNoticeServiceHost,
  type QueuedBackgroundTaskCompletionNotice,
} from './services/BackgroundTaskCompletionNoticeService';
import {
  BackgroundTaskLiveSignalCoordinator,
  type BackgroundTaskLiveSignalCoordinatorHost,
} from './services/BackgroundTaskLiveSignalCoordinator';
import {
  BackgroundTaskNoticeStateService,
  type BackgroundTaskNoticeStateServiceHost,
} from './services/BackgroundTaskNoticeStateService';
import {
  type BackgroundTaskPostSyncCoordinator,
} from './services/BackgroundTaskPostSyncCoordinator';
import {
  type BackgroundTaskLaunchInfo,
  type BackgroundTaskSegment,
  BackgroundTaskTimelineService,
  type BackgroundTaskTimelineServiceHost,
} from './services/BackgroundTaskTimelineService';
import {
  createComposerContextServices,
  type ComposerContextViewHost,
  type FocusContextPreviewWritebackHost,
  type FocusContextRuntimeViewHost,
} from './services/ComposerContextHostAdapter';
import type { ComposerContextViewFacade } from './services/ComposerContextViewFacade';
import { ContextAttachmentBuilder } from './services/ContextAttachmentBuilder';
import { ContextFileCatalogService } from './services/ContextFileCatalogService';
import { ContextUsageService } from './services/ContextUsageService';
import {
  type ConversationAssistantTailRenderPort,
  type ConversationRenderHost,
  ConversationRenderService,
  getIncrementalRenderedMessageUpdate as getConversationIncrementalRenderedMessageUpdate,
  type IncrementalRenderedMessageUpdate,
} from './services/ConversationRenderService';
import {
  ConversationSessionLiveSignalAdapter,
  type ConversationSessionLiveSignalAdapterHost,
} from './services/ConversationSessionLiveSignalAdapter';
import {
  ConversationSyncBridge,
} from './services/ConversationSyncBridge';
import {
  ConversationSyncEventAdapter,
  type ConversationSyncEventAdapterHost,
} from './services/ConversationSyncEventAdapter';
import {
  type ConversationSyncViewHost,
  createConversationSyncServices,
} from './services/ConversationSyncHostAdapter';
import {
  ConversationSyncOrchestrationService,
} from './services/ConversationSyncOrchestrationService';
import {
  ConversationSyncRuntimeCoordinator,
} from './services/ConversationSyncRuntimeCoordinator';
import {
  ConversationRestoreBootstrapCoordinator,
  type ConversationRestoreBootstrapHost,
} from './services/ConversationRestoreBootstrapCoordinator';
import {
  ConversationTabOpenCoordinator,
  type ConversationTabOpenHost,
} from './services/ConversationTabOpenCoordinator';
import {
  ConversationTabLifecycleRecoveryCoordinator,
  type ConversationTabLifecycleRecoveryHost,
} from './services/ConversationTabLifecycleRecoveryCoordinator';
import {
  type ConversationViewStateHost,
  ConversationViewStateService,
} from './services/ConversationViewStateService';
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
  createQuestionRuntimeServices,
  type QuestionRuntimeServices,
} from './services/QuestionRuntimeHostAdapter';
import {
  createQuestionRuntimeViewHostAdapter,
  type QuestionRuntimeViewHostAdapterHost,
} from './services/QuestionRuntimeViewHostAdapter';
import {
  createQuestionTodoBackgroundTaskActivationServices,
  createQuestionTodoBackgroundTaskActivationViewHostAdapter,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
} from './services/QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshServices,
  createQuestionTodoBackgroundTaskRefreshViewHostAdapter,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterHost,
} from './services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import type { QuestionTodoStatusRefreshCoordinator } from './services/QuestionTodoStatusRefreshCoordinator';
import {
  isElementNearBottom,
  scrollElementToBottom,
} from './services/ScrollManager';
import {
  createSessionTodoServices,
  type SessionTodoServices,
  type SessionTodoViewHost,
} from './services/SessionTodoHostAdapter';
import { TitleGenerationService } from './services/TitleGenerationService';
import { TabBar, type TabBarLayoutMode, type TabId, TabManager } from './tabs';
import { ContextDetailModal, type ContextRawMessageItem } from './ui/ContextDetailModal';
import { ContextRing } from './ui/ContextRing';
import { EffortSelector } from './ui/EffortSelector';
import { buildModelSelectorDisplayState } from './ui/modelSelector/ModelSelectorDisplay';
import {
  highlightModelOption as highlightRenderedModelOption,
  navigateModelList as navigateRenderedModelList,
  scrollToCurrentModel as scrollRenderedCurrentModel,
  selectHighlightedModel as selectRenderedHighlightedModel,
} from './ui/modelSelector/ModelSelectorInteractions';
import { renderModelList as renderModelSelectorList } from './ui/modelSelector/ModelSelectorRenderer';
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

/** Logo SVG for light theme (dark logo on light bg) - from opencode-logo-light.svg */
const LOGO_SVG_LIGHT = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_light)"><mask id="mask0_light" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_light)"><path d="M180 240H60V120H180V240Z" fill="#CFCECD"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E"/></g></g><defs><clipPath id="clip0_light"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Logo SVG for dark theme (light logo on dark bg) - from opencode-logo-dark.svg */
const LOGO_SVG_DARK = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_dark)"><mask id="mask0_dark" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_dark)"><path d="M180 240H60V120H180V240Z" fill="#4B4646"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/></g></g><defs><clipPath id="clip0_dark"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;
const TITLE_WORDMARK_LIGHT_ASSET_PATH = 'assets/branding/opencodian-wordmark-light.svg';
const TITLE_WORDMARK_DARK_ASSET_PATH = 'assets/branding/opencodian-wordmark-dark.svg';

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;
const INPUT_PANEL_THEME_CLASS_BY_ID: Record<
  Exclude<
    InputPanelThemeId,
    'preset' | 'liquid-glass-shuding' | 'liquid-glass-nikdelvin'
  >,
  string
> = {
  'glass-refraction-glass': 'opencodian-composer-shell--gr-glass',
  'glass-refraction-card': 'opencodian-composer-shell--gr-card',
  'glass-refraction-pill': 'opencodian-composer-shell--gr-pill',
};
const INPUT_PANEL_THEME_CLASS_NAMES = [
  ...Object.values(INPUT_PANEL_THEME_CLASS_BY_ID),
  'opencodian-composer-shell--liquid-glass',
];
const INPUT_PANEL_SVG_FILTER_CLASS_BY_ID: Record<Exclude<InputPanelGlassRefractionSvgFilterPresetId, 'none'>, string> = {
  subtle: 'opencodian-composer-shell--gr-svg-filter-subtle',
  strong: 'opencodian-composer-shell--gr-svg-filter-strong',
};
const INPUT_PANEL_SVG_FILTER_CLASS_NAMES = Object.values(INPUT_PANEL_SVG_FILTER_CLASS_BY_ID);
const INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_BY_ID: Record<
  Exclude<InputPanelActionButtonStyleId, 'default'>,
  string
> = {
  etched: 'opencodian-composer-shell--action-buttons-etched',
};
const INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_NAMES = Object.values(
  INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_BY_ID,
);
const COMPOSER_GLASS_SVG_DEFS_ID = 'opencodian-glass-svg-defs';
const COMPOSER_GLASS_SVG_FILTER_ID = 'opencodian-glass-refract';
const COMPOSER_GLASS_SVG_FILTER_STRONG_ID = 'opencodian-glass-refract-strong';

interface LiquidGlassDiagnosticElementDescriptor {
  tag: string;
  id: string | null;
  classes: string[];
  messageId: string | null;
  role: string | null;
  textPreview: string;
}

interface LiquidGlassBackdropPointSample {
  point: string;
  x: number;
  y: number;
  underlayChain: LiquidGlassDiagnosticElementDescriptor[];
}

interface LiquidGlassOverlapElementDiagnostic {
  overlapArea: number;
  overlapPercentOfShell: number;
  element: LiquidGlassDiagnosticElementDescriptor | null;
}

interface LiquidGlassBackdropOverlapDiagnostics {
  shellArea: number;
  intersectingElementCount: number;
  topIntersectingElements: LiquidGlassOverlapElementDiagnostic[];
  lastContentBottom: number | null;
  shellTop: number;
  gapAboveShellFromLastContentPx: number | null;
}

interface LiquidGlassAncestorDiagnostic {
  depth: number;
  element: LiquidGlassDiagnosticElementDescriptor | null;
  position: string;
  zIndex: string;
  overflow: string;
  isolation: string;
  transform: string;
  filter: string;
  backdropFilter: string;
  opacity: string;
  contain: string;
  mixBlendMode: string;
  pointerEvents: string;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function createComposerGlassFilterElement(
  filterId: string,
  config: {
    initialBlur: number;
    baseFrequency: string;
    numOctaves: number;
    noiseBlur: number;
    scale: number;
    saturation: number;
  },
): SVGFilterElement {
  const filter = createSvgElement('filter', {
    id: filterId,
    x: '-5%',
    y: '-5%',
    width: '110%',
    height: '110%',
    'color-interpolation-filters': 'sRGB',
  });

  filter.append(
    createSvgElement('feGaussianBlur', {
      in: 'SourceGraphic',
      stdDeviation: `${config.initialBlur}`,
      result: 'preblur',
    }),
    createSvgElement('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: config.baseFrequency,
      numOctaves: `${config.numOctaves}`,
      seed: '42',
      result: 'noise',
    }),
    createSvgElement('feGaussianBlur', {
      in: 'noise',
      stdDeviation: `${config.noiseBlur}`,
      result: 'smooth',
    }),
    createSvgElement('feDisplacementMap', {
      in: 'preblur',
      in2: 'smooth',
      scale: `${config.scale}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'displaced',
    }),
    createSvgElement('feColorMatrix', {
      in: 'displaced',
      type: 'saturate',
      values: `${config.saturation}`,
    }),
  );

  return filter;
}

function ensureComposerGlassSvgRootElement(): SVGSVGElement {
  let svg = document.getElementById(COMPOSER_GLASS_SVG_DEFS_ID) as SVGSVGElement | null;
  if (!svg) {
    svg = createSvgElement('svg', {
      id: COMPOSER_GLASS_SVG_DEFS_ID,
      width: '0',
      height: '0',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.pointerEvents = 'none';
    (document.body ?? document.documentElement).appendChild(svg);
  }

  return svg;
}

function ensureComposerGlassSvgDefs(settings: InputPanelGlassRefractionSvgFilterSettings): void {
  const svg = ensureComposerGlassSvgRootElement();
  const defs = createSvgElement('defs', {});
  defs.append(
    createComposerGlassFilterElement(COMPOSER_GLASS_SVG_FILTER_ID, {
      initialBlur: 0.3,
      baseFrequency: '0.015 0.012',
      numOctaves: 2,
      noiseBlur: 3,
      scale: settings.subtleScale,
      saturation: 1.3,
    }),
    createComposerGlassFilterElement(COMPOSER_GLASS_SVG_FILTER_STRONG_ID, {
      initialBlur: 0.4,
      baseFrequency: '0.012 0.010',
      numOctaves: 3,
      noiseBlur: 4,
      scale: settings.strongScale,
      saturation: 1.5,
    }),
  );
  svg.replaceChildren(defs);
}

type ChatServerAvailability = 'checking' | 'running' | 'starting' | 'offline' | 'external';

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
  queuedBackgroundTaskCompletionNotices: Map<string, QueuedBackgroundTaskCompletionNotice>;
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

interface TabPaneState {
  tabId: TabId;
  messagesEl: HTMLElement;
  runtime: TabRuntimeState;
  scrollHandler: () => void;
  mutationObserver: MutationObserver | null;
  resizeObserver: ResizeObserver | null;
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
  private themeBackgroundImageEl: HTMLDivElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private inputWrapperEl: HTMLElement | null = null;
  private composerShellEl: HTMLElement | null = null;
  private composerSvgFilterLayerEl: HTMLElement | null = null;
  private activeLiquidGlassAdapter: GlassEffectAdapter | null = null;
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
  private disposeModelSelectorStickyHeaders: (() => void) | null = null;
  private availableModels: ModelSelectorAvailableModelInfo[] = [];
  private availableProviders: ModelSelectorProvider[] = [];
  private modelCatalogBundle: ModelCatalogBundle | null = null;
  private hasLoadedModelCatalog = false;
  private isModelDropdownOpen = false;
  private modelFilterQuery = '';
  private modelDropdownClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private currentModelTriggerIconUrl: string | null = null;
  private modelSelectorIconRequestId = 0;

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
  private addContextBtn: HTMLElement | null = null;
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
  private composerLayoutSyncFrameId: number | null = null;
  private inputContainerResizeObserver: ResizeObserver | null = null;
  private scrollToBottomFrameId: number | null = null;
  private chatAppearanceStyleEl: HTMLStyleElement | null = null;
  private themeBackgroundRequestId = 0;
  private titleGenerationService: TitleGenerationService;
  private persistentAssistantNoticeService: PersistentAssistantNoticeService;
  private sessionTodoServices: SessionTodoServices;
  private questionDockSlotCoordinator: QuestionDockSlotCoordinator;
  private questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshCoordinator;
  private activeTabContextUsageCoordinator: ActiveTabContextUsageCoordinator;
  private backgroundTaskTimelineService: BackgroundTaskTimelineService;
  private backgroundTaskCompletionNoticeService: BackgroundTaskCompletionNoticeService;
  private backgroundTaskNoticeStateService: BackgroundTaskNoticeStateService;
  private backgroundTaskLiveSignalCoordinator: BackgroundTaskLiveSignalCoordinator;
  private backgroundTaskPostSyncCoordinator: BackgroundTaskPostSyncCoordinator;
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
  private conversationSyncEventAdapter: ConversationSyncEventAdapter;
  private conversationSessionLiveSignalAdapter: ConversationSessionLiveSignalAdapter;
  private conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  private conversationTabLifecycleRecoveryCoordinator: ConversationTabLifecycleRecoveryCoordinator;
  private conversationRestoreBootstrapCoordinator: ConversationRestoreBootstrapCoordinator;
  private conversationViewStateService: ConversationViewStateService;
  private conversationRenderService: ConversationRenderService;
  private messageSendPreparationService: MessageSendPreparationService;
  private messageFinalizationService: MessageFinalizationService;
  private assistantNoticeCardRenderer: AssistantNoticeCardRenderer;
  private assistantShellViewHostAdapter: AssistantShellViewHostAdapter;
  private backgroundTaskInlinePanelRenderer: BackgroundTaskInlinePanelRenderer;
  private backgroundTaskIndicatorCoordinator: BackgroundTaskIndicatorCoordinator;
  private backgroundTaskStreamTriggerCoordinator: BackgroundTaskStreamTriggerCoordinator;
  private streamingInlineCardRenderer: StreamingInlineCardRenderer;
  private permissionInlineCardRenderer: PermissionInlineCardRenderer;
  private questionRuntimeServices: QuestionRuntimeServices;
  private sendPipelineRuntime: SendPipelineRuntime;
  private composerContextViewFacade: ComposerContextViewFacade;
  private contextAttachmentBuilder: ContextAttachmentBuilder;
  private contextFileCatalogService: ContextFileCatalogService;
  private omoBackgroundTaskLogStates = new Map<string, OmoBackgroundTaskLogState>();
  private lastLiquidGlassDiagnosticsFingerprint: string | null = null;

  private appSettings(): { open: () => void; openTabById: (id: string) => void } {
    return (this.app as typeof this.app & {
      setting: { open: () => void; openTabById: (id: string) => void };
    }).setting;
  }

  private get sessionTodoDockCoordinator(): SessionTodoServices['dockCoordinator'] {
    return this.sessionTodoServices.dockCoordinator;
  }

  private get sessionTodoStateService(): SessionTodoServices['stateService'] {
    return this.sessionTodoServices.stateService;
  }

  private get sessionTodoStatusRefreshService(): SessionTodoServices['statusRefreshService'] {
    return this.sessionTodoServices.statusRefreshService;
  }

  private get sessionTodoRuntimeFacade(): SessionTodoServices['runtimeFacade'] {
    return this.sessionTodoServices.runtimeFacade;
  }

  private get questionDockCoordinator(): QuestionRuntimeServices['dockCoordinator'] {
    return this.questionRuntimeServices.dockCoordinator;
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
      queuedBackgroundTaskCompletionNotices: new Map(),
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
    this.sessionTodoDockCoordinator.render(tabId);
  }

  private hasIncompleteTodos(todos: readonly SessionTodo[]): boolean {
    return this.sessionTodoStateService.hasIncompleteTodos(todos);
  }

  private suppressStaleSessionTodosIfNeeded(
    tabId: TabId | null = this.getActiveTabId(),
  ): SessionTodo[] | null {
    return this.sessionTodoStateService.suppressStaleSessionTodosIfNeeded(tabId);
  }

  private buildStaleSessionTodoNoticeContent(todos: SessionTodo[]): string {
    return this.sessionTodoStateService.buildStaleSessionTodoNoticeContent(todos);
  }

  private beginConversationHydration(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.isHydratingConversation = true;
    runtime.pendingLayoutMutations = 0;
    this.backgroundTaskLiveSignalCoordinator.armAuthoritativeSyncGate(tabId);
    this.clearScheduledSignalConversationSync(tabId);
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
    this.titleGenerationService = new TitleGenerationService(this.plugin);
    this.contextAttachmentBuilder = new ContextAttachmentBuilder(this.app, {
      getServerMode: () => this.plugin.settings.server.mode,
    });
    this.contextFileCatalogService = new ContextFileCatalogService(this.app);
    const composerContextServices = createComposerContextServices({
      app: this.app,
      contextAttachmentBuilder: this.contextAttachmentBuilder,
      contextFileCatalogService: this.contextFileCatalogService,
      viewHost: this.createComposerContextViewHost(),
      focusRuntimeViewHost: this.createFocusContextRuntimeViewHost(),
      focusPreviewWritebackHost: this.createFocusContextPreviewWritebackHost(),
    });
    this.composerContextViewFacade = composerContextServices.viewFacade;
    this.persistentAssistantNoticeService = new PersistentAssistantNoticeService(
      this.createPersistentAssistantNoticeServiceHost(),
    );
    this.sessionTodoServices = createSessionTodoServices(this.createSessionTodoViewHost());
    this.questionDockSlotCoordinator = new QuestionDockSlotCoordinator(
      {
        shouldUseAboveInputQuestionDock: () => this.plugin.settings.questionCardPosition === 'above_input',
      },
      () => {
        this.questionDockCoordinator.render();
      },
    );
    const {
      questionTodoStatusRefreshCoordinator,
      backgroundTaskPostSyncCoordinator,
    } = createQuestionTodoBackgroundTaskRefreshServices(
      createQuestionTodoBackgroundTaskRefreshViewHostAdapter({
        viewHost: this.createQuestionTodoBackgroundTaskRefreshViewHostAdapterHost(),
        getQuestionDockCoordinator: () => this.questionDockCoordinator,
        getSessionTodoStateService: () => this.sessionTodoStateService,
        getSessionTodoStatusRefreshService: () => this.sessionTodoStatusRefreshService,
        getBackgroundTaskIndicatorCoordinator: () => this.backgroundTaskIndicatorCoordinator,
        getBackgroundTaskLiveSignalCoordinator: () => this.backgroundTaskLiveSignalCoordinator,
        getTabRuntimeStateBridge: () => this.tabRuntimeStateBridge,
      }),
    );
    this.questionTodoStatusRefreshCoordinator = questionTodoStatusRefreshCoordinator;
    this.backgroundTaskPostSyncCoordinator = backgroundTaskPostSyncCoordinator;
    const {
      questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator,
    } = createQuestionTodoBackgroundTaskActivationServices(
      createQuestionTodoBackgroundTaskActivationViewHostAdapter({
        viewHost: this.createQuestionTodoBackgroundTaskActivationViewHostAdapterHost(),
        getQuestionDockSlotCoordinator: () => this.questionDockSlotCoordinator,
        getSessionTodoDockCoordinator: () => this.sessionTodoDockCoordinator,
      }),
      this.questionTodoStatusRefreshCoordinator,
    );
    this.activeTabContextUsageCoordinator = new ActiveTabContextUsageCoordinator(
      this.createActiveTabContextUsageCoordinatorHost(),
    );
    this.backgroundTaskNoticeStateService = new BackgroundTaskNoticeStateService(
      this.createBackgroundTaskNoticeStateServiceHost(),
    );
    this.backgroundTaskTimelineService = new BackgroundTaskTimelineService(
      this.createBackgroundTaskTimelineServiceHost(),
    );
    this.backgroundTaskLiveSignalCoordinator = new BackgroundTaskLiveSignalCoordinator(
      this.sessionTodoStateService,
      this.backgroundTaskTimelineService,
      this.backgroundTaskNoticeStateService,
      this.createBackgroundTaskLiveSignalCoordinatorHost(),
    );
    this.conversationHydrationRenderBridge = new ConversationHydrationRenderBridge(
      this.createConversationHydrationRenderBridgeHost(),
    );
    this.conversationTransitionBridge = new ConversationTransitionBridge(
      this.createConversationTransitionBridgeHost(),
      this.conversationHydrationRenderBridge,
    );
    this.tabConversationStateBridge = new TabConversationStateBridge(
      this.createTabConversationStateBridgeHost(),
    );
    this.tabViewActivationBridge = new TabViewActivationBridge(
      this.createTabViewActivationBridgeHost(),
      this.composerContextViewFacade,
      questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator,
      this.activeTabContextUsageCoordinator,
    );
    this.conversationHydrationOutcomeBridge = new ConversationHydrationOutcomeBridge(
      this.createConversationHydrationOutcomeBridgeHost(),
      this.tabConversationStateBridge,
      this.tabViewActivationBridge,
    );
    this.tabConversationActivationBridge = new TabConversationActivationBridge(
      this.createTabConversationActivationBridgeHost(),
      this.tabConversationStateBridge,
      this.tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator,
      this.activeTabContextUsageCoordinator,
    );
    this.tabRuntimeStateBridge = new TabRuntimeStateBridge(this.createTabRuntimeStateBridgeHost());
    const conversationSyncServices = createConversationSyncServices(
      this.createConversationSyncViewHost(),
      this.backgroundTaskPostSyncCoordinator,
    );
    this.conversationSyncRuntimeCoordinator = conversationSyncServices.runtimeCoordinator;
    this.conversationSyncOrchestrationService = conversationSyncServices.orchestrationService;
    this.conversationSyncBridge = conversationSyncServices.bridge;
    this.conversationSyncEventAdapter = new ConversationSyncEventAdapter(
      this.createConversationSyncEventAdapterHost(),
    );
    this.conversationSessionLiveSignalAdapter = new ConversationSessionLiveSignalAdapter(
      this.createConversationSessionLiveSignalAdapterHost(),
      this.backgroundTaskLiveSignalCoordinator,
    );
    this.backgroundTaskCompletionNoticeService = new BackgroundTaskCompletionNoticeService(
      this.createBackgroundTaskCompletionNoticeServiceHost(),
    );
    this.backgroundTaskInlinePanelRenderer = new BackgroundTaskInlinePanelRenderer(
      this.backgroundTaskTimelineService,
      this.createBackgroundTaskInlinePanelRendererHost(),
    );
    this.backgroundTaskIndicatorCoordinator = new BackgroundTaskIndicatorCoordinator(
      this.backgroundTaskInlinePanelRenderer,
      this.backgroundTaskTimelineService,
      this.backgroundTaskCompletionNoticeService,
      this.backgroundTaskLiveSignalCoordinator,
      this.tabRuntimeStateBridge,
      this.createBackgroundTaskIndicatorCoordinatorHost(),
    );
    this.backgroundTaskStreamTriggerCoordinator = new BackgroundTaskStreamTriggerCoordinator(
      this.backgroundTaskIndicatorCoordinator,
      this.backgroundTaskTimelineService,
      this.backgroundTaskLiveSignalCoordinator,
      this.createBackgroundTaskStreamTriggerCoordinatorHost(),
    );
    const conversationLoadRuntimeBridge = new ConversationLoadRuntimeBridge(
      this.createConversationLoadRuntimeBridgeHost(),
    );
    this.conversationViewStateService = new ConversationViewStateService(
      this.createConversationViewStateHost(),
      this.tabConversationActivationBridge,
      this.tabViewActivationBridge,
      this.conversationHydrationOutcomeBridge,
      this.conversationTransitionBridge,
      conversationLoadRuntimeBridge,
    );
    this.conversationTabOpenCoordinator = new ConversationTabOpenCoordinator(
      this.createConversationTabOpenHost(),
      {
        activateTab: (tabId) => this.conversationViewStateService.activateTab(tabId),
        openConversationInCurrentTab: (conversation) => {
          this.tabConversationActivationBridge.openConversation(conversation);
        },
      },
    );
    this.conversationTabLifecycleRecoveryCoordinator = new ConversationTabLifecycleRecoveryCoordinator(
      this.createConversationTabLifecycleRecoveryHost(),
      {
        activateTab: (tabId) => this.conversationViewStateService.activateTab(tabId),
        createConversationInNewTab: () =>
          this.conversationTabOpenCoordinator.createConversationInNewTab(),
      },
    );
    this.conversationRestoreBootstrapCoordinator = new ConversationRestoreBootstrapCoordinator(
      this.createConversationRestoreBootstrapHost(),
      {
        activateTab: (tabId) => this.conversationViewStateService.activateTab(tabId),
      },
    );
    this.conversationRenderService = new ConversationRenderService(this.createConversationRenderHost());
    this.messageSendPreparationService = new MessageSendPreparationService(this.createMessageSendPreparationHost());
    this.messageFinalizationService = new MessageFinalizationService(this.createMessageFinalizationHost());
    this.assistantNoticeCardRenderer = new AssistantNoticeCardRenderer(
      this.createAssistantNoticeCardRendererHost(),
    );
    this.assistantShellViewHostAdapter = new AssistantShellViewHostAdapter(
      this.createAssistantShellViewHostAdapterHost(),
    );
    this.streamingInlineCardRenderer = new StreamingInlineCardRenderer(this.createStreamingInlineCardRendererHost());
    this.permissionInlineCardRenderer = new PermissionInlineCardRenderer(this.streamingInlineCardRenderer);
    this.questionRuntimeServices = createQuestionRuntimeServices(
      createQuestionRuntimeViewHostAdapter({
        viewHost: this.createQuestionRuntimeViewHostAdapterHost(),
        settings: this.plugin.settings,
        questionDockSlotCoordinator: this.questionDockSlotCoordinator,
        questionApi: this.plugin.openCodeService,
        tabAttention: this.tabRuntimeStateBridge,
        conversationSync: this.conversationSyncBridge,
        statusRefresh: this.sessionTodoStatusRefreshService,
      }),
      this.streamingInlineCardRenderer,
    );
    this.sendPipelineRuntime = new SendPipelineRuntime(
      this.createSendPipelineRuntimeHost(),
      this.messageSendPreparationService,
      this.messageFinalizationService,
    );
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
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      renderMessage: (message) => this.renderMessage(message),
      saveConversation: (conversation) => this.plugin.saveConversation(conversation),
      setTabConversationSyncFingerprint: (tabId, fingerprint) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.lastConversationSyncFingerprint = fingerprint;
        }
      },
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

  private createQuestionTodoBackgroundTaskRefreshViewHostAdapterHost(): QuestionTodoBackgroundTaskRefreshViewHostAdapterHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
        this.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
      setTabConversationSyncFingerprint: (tabId, fingerprint) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.lastConversationSyncFingerprint = fingerprint;
        }
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

  private createTabRuntimeStateBridgeHost(): TabRuntimeStateBridgeHost {
    return {
      getTabManager: () => this.tabManager,
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      getTabMessagesContainer: (tabId) => this.getTabPaneState(tabId)?.messagesEl ?? null,
      hasBackgroundTaskIndicator: (tabId) => Boolean(this.backgroundTaskLiveSignalCoordinator.hasIndicator(tabId)),
      updateSendButtonState: () => {
        this.updateSendButtonState();
      },
    };
  }

  private createTabConversationStateBridgeHost(): TabConversationStateBridgeHost {
    return {
      getTabManager: () => this.tabManager,
      getSessionIdForTab: (tabId) => this.getSessionIdForTab(tabId),
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
        this.sessionTodoRuntimeFacade.resetTabSessionState(tabId, sessionId);
      },
      clearTabSessionState: (tabId) => {
        this.sessionTodoRuntimeFacade.clearTabSessionState(tabId);
      },
      resetBackgroundTaskSuppressedFingerprint: (tabId) => {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.backgroundTaskSuppressedFingerprint = null;
        }
      },
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      setLastConversationSyncFingerprint: (fingerprint) => {
        this.lastConversationSyncFingerprint = fingerprint;
      },
      startConversationSyncLoop: () => {
        this.startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        this.stopConversationSyncLoop();
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

  private createTabViewActivationBridgeHost(): TabViewActivationBridgeHost {
    return {
      setActiveMessagesPane: (tabId) => {
        this.setActiveMessagesPane(tabId);
      },
      scheduleComposerLayoutSync: () => {
        this.scheduleComposerLayoutSync();
      },
      updateModelSelectorDisplay: () => {
        this.updateModelSelectorDisplay();
      },
      updateSendButtonState: () => {
        this.updateSendButtonState();
      },
    };
  }

  private createTabConversationActivationBridgeHost(): TabConversationActivationBridgeHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      clearMessagesContainer: () => {
        this.messagesContainer?.empty();
      },
      resetTurnState: () => {
        this.resetTurnState();
      },
      updateModelSelectorDisplay: () => {
        this.updateModelSelectorDisplay();
      },
      scheduleSettledScrollToBottom: (tabId) => {
        this.scheduleSettledScrollToBottom(tabId);
      },
    };
  }

  private createQuestionTodoBackgroundTaskActivationViewHostAdapterHost(): QuestionTodoBackgroundTaskActivationViewHostAdapterHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      renderSessionTodoDock: (tabId) => {
        this.renderSessionTodoDock(tabId);
      },
      resetBackgroundTaskIndicator: () => {
        this.resetBackgroundTaskIndicator();
      },
      syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
        this.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        this.renderBackgroundTaskIndicatorIfNeeded(tabId),
    };
  }

  private createBackgroundTaskLiveSignalCoordinatorHost(): BackgroundTaskLiveSignalCoordinatorHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      getTabSessionStatus: (tabId, sessionId) =>
        this.sessionTodoRuntimeFacade.getTabSessionStatus(tabId, sessionId),
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
        this.sessionTodoRuntimeFacade.applyStreamingTodoSnapshotFromTool(toolCall, tabId);
      },
      getSessionIdForTab: (tabId: TabId | null) => this.getSessionIdForTab(tabId),
      refreshTabSessionTodos: (tabId, sessionId, options) =>
        this.sessionTodoStatusRefreshService.refreshTabSessionTodos(tabId, sessionId, options),
      resetBackgroundTaskIndicator: (tabId) => {
        this.resetBackgroundTaskIndicator(tabId);
      },
    };
  }

  private createConversationSyncViewHost(): ConversationSyncViewHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      getAllTabs: () => this.tabManager?.getAllTabs() ?? [],
      getTab: (tabId) => this.tabManager?.getTab(tabId) ?? null,
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      getConversationById: async (id) => (await this.plugin.getConversationById(id)) ?? null,
      getConversationSyncFingerprint: (messages) => this.getConversationSyncFingerprint(messages),
      syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
        this.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        this.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        this.renderBackgroundTaskIndicatorIfNeeded(tabId),
    };
  }

  private createConversationSyncEventAdapterHost(): ConversationSyncEventAdapterHost {
    return {
      subscribeToSessionSyncEvents: (listener) =>
        this.plugin.openCodeService.subscribeToSessionSyncEvents(listener),
      getAllTabs: () => this.tabManager?.getAllTabs() ?? [],
      getConversations: () => this.plugin.getConversations(),
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      scheduleConversationSyncFromSignal: (tabId, reason) => {
        this.scheduleConversationSyncFromSignal(tabId, reason);
      },
    };
  }

  private createConversationSessionLiveSignalAdapterHost(): ConversationSessionLiveSignalAdapterHost {
    return {
      subscribeToSessionTodoUpdates: (listener) =>
        this.plugin.openCodeService.subscribeToSessionTodoUpdates(listener),
      subscribeToSessionStatusUpdates: (listener) =>
        this.plugin.openCodeService.subscribeToSessionStatusUpdates(listener),
      getAllTabs: () => this.tabManager?.getAllTabs() ?? [],
      getConversations: () => this.plugin.getConversations(),
      getCurrentConversation: () => this.currentConversation,
      getActiveTabId: () => this.getActiveTabId(),
      applySessionTodoUpdate: (tabId, sessionId, todos) => {
        this.sessionTodoRuntimeFacade.applySessionTodoUpdate(tabId, sessionId, todos);
      },
      applySessionStatusUpdate: (tabId, sessionId, status) => {
        this.sessionTodoRuntimeFacade.applySessionStatusUpdate(tabId, sessionId, status);
      },
    };
  }

  private createBackgroundTaskCompletionNoticeServiceHost(): BackgroundTaskCompletionNoticeServiceHost {
    return {
      getTabRuntimeState: (tabId: TabId | null) => this.getTabRuntimeState(tabId),
      appendPersistentAssistantNoticeMessage: (options) => this.persistentAssistantNoticeService.appendMessage(options),
    };
  }

  private createConversationHydrationRenderBridgeHost(): ConversationHydrationRenderBridgeHost {
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
    };
  }

  private createConversationHydrationOutcomeBridgeHost(): ConversationHydrationOutcomeBridgeHost {
    return {
      syncBackgroundTaskStateFromConversation: (conversation) => {
        this.syncBackgroundTaskStateFromConversation(conversation);
      },
      renderMessages: (messages) => this.renderMessages(messages),
    };
  }

  private createConversationTransitionBridgeHost(): ConversationTransitionBridgeHost {
    return {
      getCurrentConversation: () => this.currentConversation,
      cancelTitleGeneration: (conversationId) => {
        this.titleGenerationService.cancelConversation(conversationId);
      },
      resetBackgroundTaskIndicator: () => {
        this.resetBackgroundTaskIndicator();
      },
      clearPendingTitleGenerationStatus: (conversationId) =>
        this.updateConversationTitleState(conversationId, {
          titleGenerationStatus: undefined,
        }),
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

  private createConversationLoadRuntimeBridgeHost(): ConversationLoadRuntimeBridgeHost {
    return {
      loadConversations: () => this.plugin.loadConversations(),
      getConversationById: async (id) => (await this.plugin.getConversationById(id)) ?? null,
      shouldSyncConversationFromServer: (conversation, options) => {
        const shouldSyncInterrupted = !this.hasInterruptedLocalAssistantTail(conversation.messages)
          && conversation.messages.some((message) =>
            message.displayStyle !== 'notice'
            && !message.sourceMessageId
          );
        return Boolean(
          options.forceServerSync
          || !conversation.messages
          || conversation.messages.length === 0
          || shouldSyncInterrupted,
        );
      },
      syncConversationMessagesFromServer: async (conversation, tabId, reason) => {
        const syncResult = await this.syncConversationMessagesFromServer(conversation, tabId, reason);
        return {
          messages: syncResult.messages,
          revertState: syncResult.revertState,
        };
      },
      setCurrentConversationRevertState: (revertState) => {
        this.currentConversationRevertState = revertState;
      },
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
      renderMessageContent: (messageEl, contentEl, message) =>
        this.renderAssistantMessageContent(messageEl, contentEl, message),
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
        this.sessionTodoStatusRefreshService.refreshTabSessionTodos(tabId, sessionId, options),
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
      refreshServerStatusBadge: () => this.refreshServerStatusBadge(),
      ensureServerReadyForChat: (availability) => this.ensureServerReadyForChat(availability),
      hasLoadedModelCatalog: () => this.hasLoadedModelCatalog,
      loadAvailableModels: () => this.loadAvailableModels(),
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
        this.startConversationSyncLoop();
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
      refreshServerStatusBadge: () => this.refreshServerStatusBadge(),
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

  private createQuestionRuntimeViewHostAdapterHost(): QuestionRuntimeViewHostAdapterHost {
    return {
      getActiveTabId: () => this.getActiveTabId(),
      getTabRuntimeState: (tabId) => this.getTabRuntimeState(tabId),
      ensureTabRuntimeState: (tabId) => this.ensureTabRuntimeState(tabId),
      getCurrentConversationSessionId: () => this.currentConversation?.openCodeSessionId,
      getSessionIdForTab: (tabId) => this.getSessionIdForTab(tabId),
      keepQuestionCardPinnedToBottom: (tabId) => {
        this.keepQuestionCardPinnedToBottom(tabId);
      },
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
    this.conversationSessionLiveSignalAdapter.start();
    this.conversationSyncEventAdapter.start();

    await this.initializeFirstTab();
  }

  async onClose() {
    this.persistTabState({ flush: true });
    this.stopServerStatusLoop();
    this.stopConversationSyncLoop();
    this.composerContextViewFacade.dispose();
    this.clearChatSurfaceSyncTimers();
    this.clearScheduledComposerLayoutSync();
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
    this.inputContainerResizeObserver?.disconnect();
    this.inputContainerResizeObserver = null;
    this.destroyGlassOctahedronDemo();
    this.destroyLiquidDiamondDemo();
    this.unmountLiquidGlassAdapter();
    this.removeComposerSvgFilterLayer();
    this.disposeModelSelectorStickyHeaders?.();
    this.disposeModelSelectorStickyHeaders = null;

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
    this.inputWrapperEl = null;
    this.composerShellEl = null;
    this.composerContextViewFacade.setContextRowElement(null);
    this.addContextBtn = null;
    this.sendBtn = null;
    this.inputTextarea = null;
    this.questionDockSlotCoordinator.destroy();
    this.sessionTodoDockCoordinator.destroy();
    this.conversationSessionLiveSignalAdapter.stop();
    this.conversationSyncEventAdapter.stop();
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
    const themeBackgroundLayerEl = this.messagesShellEl.createDiv({ cls: 'opencodian-theme-background-layer' });
    this.themeBackgroundImageEl = themeBackgroundLayerEl.createDiv({ cls: 'opencodian-theme-background-image' });
    this.themeBackgroundImageEl.setAttribute('aria-hidden', 'true');
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

  private observeMessagesPaneChildren(paneState: TabPaneState): void {
    paneState.resizeObserver?.observe(paneState.messagesEl);
    for (const child of Array.from(paneState.messagesEl.children)) {
      if (child instanceof HTMLElement) {
        paneState.resizeObserver?.observe(child);
      }
    }
  }

  private syncPaneScrollMetrics(
    tabId: TabId | null,
    messagesEl: HTMLElement | null = this.getTabPaneState(tabId)?.messagesEl ?? null,
  ): boolean {
    if (!tabId || !messagesEl) {
      return true;
    }

    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return true;
    }

    const nearBottom = isElementNearBottom(messagesEl);
    const nextState = applyPassiveScrollMeasurement(runtime, nearBottom);
    runtime.isNearBottom = nextState.isNearBottom;
    if (this.getActiveTabId() === tabId) {
      this.navigationSidebar?.updateVisibility();
    }
    return nearBottom;
  }

  private handleMessagesPaneScroll(tabId: TabId): void {
    const paneState = this.getTabPaneState(tabId);
    if (!paneState) {
      return;
    }

    const nearBottom = this.syncPaneScrollMetrics(tabId, paneState.messagesEl);
    if (hasProgrammaticScrollGuard(paneState.runtime)) {
      if (nearBottom) {
        paneState.runtime.programmaticScrollGuardUntil = 0;
      }
      return;
    }

    const nextState = applyUserScrollIntent(paneState.runtime, nearBottom);
    paneState.runtime.autoScrollEnabled = nextState.autoScrollEnabled;
    paneState.runtime.isNearBottom = nextState.isNearBottom;
  }

  private handleMessagesPaneLayoutChange(tabId: TabId): void {
    const paneState = this.getTabPaneState(tabId);
    if (!paneState) {
      return;
    }

    if (paneState.runtime.isHydratingConversation) {
      paneState.runtime.pendingLayoutMutations += 1;
      this.syncPaneScrollMetrics(tabId, paneState.messagesEl);
      return;
    }

    const nearBottom = this.syncPaneScrollMetrics(tabId, paneState.messagesEl);
    if (hasProgrammaticScrollGuard(paneState.runtime) && nearBottom) {
      paneState.runtime.programmaticScrollGuardUntil = 0;
    }

    if (this.getActiveTabId() === tabId) {
      if (paneState.runtime.isStreaming) {
        return;
      }
      this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
    }
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
    const scrollHandler = () => {
      this.handleMessagesPaneScroll(tabId);
    };
    messagesEl.addEventListener('scroll', scrollHandler, { passive: true });

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        this.handleMessagesPaneLayoutChange(tabId);
      })
      : null;
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            resizeObserver?.observe(node);
          }
        });
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            resizeObserver?.unobserve(node);
          }
        });
      }
      this.handleMessagesPaneLayoutChange(tabId);
    });
    mutationObserver.observe(messagesEl, { childList: true });
    const paneState: TabPaneState = {
      tabId,
      messagesEl,
      runtime: this.createTabRuntimeState(),
      scrollHandler,
      mutationObserver,
      resizeObserver,
    };
    this.observeMessagesPaneChildren(paneState);
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
    this.syncPaneScrollMetrics(tabId, activePaneState.messagesEl);
    if (activePaneState.runtime.autoScrollEnabled) {
      this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
    }
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
    this.clearScheduledSignalConversationSync(tabId);
    paneState.messagesEl.removeEventListener('scroll', paneState.scrollHandler);
    paneState.mutationObserver?.disconnect();
    paneState.resizeObserver?.disconnect();
    paneState.messagesEl.remove();
    this.tabPaneStates.delete(tabId);
  }

  private clearTabMessagesPanes(): void {
    for (const paneState of this.tabPaneStates.values()) {
      paneState.runtime.streamController?.cancelStream();
      this.clearScheduledSignalConversationSync(paneState.tabId);
      paneState.messagesEl.removeEventListener('scroll', paneState.scrollHandler);
      paneState.mutationObserver?.disconnect();
      paneState.resizeObserver?.disconnect();
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

    const status = this.sessionTodoRuntimeFacade.getTabSessionStatus(
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

  /** Build header */
  private buildHeader(header: HTMLElement) {
    // Logo and title
    const titleEl = header.createDiv({ cls: 'opencodian-title' });

    // Create logo container
    const logoContainer = titleEl.createDiv({ cls: 'opencodian-logo' });
    logoContainer.innerHTML = this.getLogoSvg();

    const titleTextEl = titleEl.createEl('img', {
      cls: 'opencodian-title-text',
      attr: {
        alt: 'OpenCodian',
        draggable: 'false',
      },
    });
    this.syncTitleWordmarkSrc(titleTextEl);
    this.headerTabBarSlotEl = header.createDiv({ cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--header' });

    // Listen for theme changes
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        logoContainer.innerHTML = this.getLogoSvg();
        this.syncTitleWordmarkSrc(titleTextEl);
        this.scheduleChatSurfaceColorSync();
        this.scheduleComposerLayoutSync();
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

    if (this.addContextBtn) {
      this.setTooltipLabel(this.addContextBtn, t('chat.context.addContext'), 'top');
    }

    if (this.sendBtn) {
      this.updateSendButtonState();
    }

    this.inputTextarea?.setAttribute('placeholder', this.getInputPlaceholder());
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

  /** Get title wordmark image source based on current theme */
  private getTitleWordmarkSrc(): string | null {
    const isDark = document.body.classList.contains('theme-dark');
    const relativePath = isDark ? TITLE_WORDMARK_DARK_ASSET_PATH : TITLE_WORDMARK_LIGHT_ASSET_PATH;
    return this.resolvePluginAssetUrl(relativePath);
  }

  private syncTitleWordmarkSrc(titleWordmarkEl: HTMLImageElement): void {
    const src = this.getTitleWordmarkSrc();
    if (src) {
      titleWordmarkEl.setAttribute('src', src);
      return;
    }

    titleWordmarkEl.removeAttribute('src');
  }

  /** Build input area */
  private buildInputArea(container: HTMLElement) {
    this.inputTabBarSlotEl = container.createDiv({ cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--input' });
    this.sessionTodoDockCoordinator.attach(container);

    this.questionDockSlotCoordinator.attach(container);

    const composerShellEl = container.createDiv({ cls: 'opencodian-composer-shell' });
    this.composerShellEl = composerShellEl;

    const inputWrapper = composerShellEl.createDiv({ cls: 'opencodian-input-wrapper' });
    this.inputWrapperEl = inputWrapper;
    const composerContentEl = inputWrapper.createDiv({ cls: 'opencodian-composer-content' });
    this.composerContextViewFacade.setContextRowElement(
      composerContentEl.createDiv({ cls: 'opencodian-composer-context-row is-empty' }),
    );

    this.inputTextarea = composerContentEl.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { placeholder: this.getInputPlaceholder(), rows: '1' },
    });

    // Auto-resize textarea
    this.inputTextarea.addEventListener('input', () => {
      this.syncInputTextareaHeight();
    });
    this.syncInputTextareaHeight();

    // Send on Enter (Shift+Enter for new line)
    this.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.trySubmitCurrentInput();
      }
    });

    const composerFooterEl = composerContentEl.createDiv({ cls: 'opencodian-composer-footer' });
    const addContextBtn = composerFooterEl.createEl('button', {
      cls: 'opencodian-composer-add-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'aria-label': t('chat.context.addContext'),
      },
    });
    this.addContextBtn = addContextBtn;
    setIcon(addContextBtn, 'plus');
    this.setTooltipLabel(addContextBtn, t('chat.context.addContext'), 'top');
    addContextBtn.addEventListener('click', () => {
      void this.composerContextViewFacade.addChosenFileContextToActiveTab();
    });

    this.sendBtn = composerFooterEl.createEl('button', {
      cls: 'opencodian-send-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
      },
    });
    this.sendBtn.addEventListener('click', () => {
      if (this.isActiveTabStreaming()) {
        this.cancelStreaming();
      } else {
        this.trySubmitCurrentInput();
      }
    });
    this.updateSendButtonState();

    // Bottom toolbar: Permission mode | Model selector | Effort selector | Context usage
    const toolbar = composerShellEl.createDiv({ cls: 'opencodian-input-toolbar' });

    const permissionContainer = toolbar.createDiv({ cls: 'opencodian-permission-selector' });
    this.initializePermissionSelector(permissionContainer);

    this.modelSelectorContainer = toolbar.createDiv({ cls: 'opencodian-model-selector' });
    this.initializeModelSelector(this.modelSelectorContainer);

    this.contextRingContainerEl = toolbar.createDiv({ cls: 'opencodian-context-usage-slot' });
    this.contextRing = new ContextRing(this.contextRingContainerEl, () => {
      this.openContextUsageDetails();
    });
    this.refreshContextUsageIndicator();

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

    this.applyInputPanelThemeState();
    this.initializeComposerLayoutMetrics();
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

  private getLiquidGlassAdapterId(themeId: InputPanelThemeId): LiquidGlassAdapterId | null {
    switch (themeId) {
      case 'liquid-glass-shuding':
        return 'shuding';
      case 'liquid-glass-nikdelvin':
        return 'nikdelvin';
      default:
        return null;
    }
  }

  private ensureComposerGlassSvgRoot(): SVGSVGElement {
    return ensureComposerGlassSvgRootElement();
  }

  private buildLiquidGlassMountContext(): GlassMountContext | null {
    if (!this.composerShellEl || !this.inputWrapperEl) {
      return null;
    }

    const filterLayerEl = this.ensureComposerSvgFilterLayer();
    if (!filterLayerEl) {
      return null;
    }

    return {
      shellEl: this.composerShellEl,
      contentEl: this.inputWrapperEl,
      svgRootEl: this.ensureComposerGlassSvgRoot(),
      filterLayerEl,
      resolveAssetUrl: (relativePath: string) => this.resolvePluginAssetUrl(relativePath),
    };
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
    if (!this.composerShellEl) {
      return;
    }

    for (const className of INPUT_PANEL_THEME_CLASS_NAMES) {
      this.composerShellEl.removeClass(className);
    }
    for (const className of INPUT_PANEL_SVG_FILTER_CLASS_NAMES) {
      this.composerShellEl.removeClass(className);
    }

    if (this.plugin.settings.inputPanelTheme === 'preset') {
      this.unmountLiquidGlassAdapter();
      this.removeComposerSvgFilterLayer();
      return;
    }

    const liquidGlassAdapterId = this.getLiquidGlassAdapterId(this.plugin.settings.inputPanelTheme);
    if (liquidGlassAdapterId) {
      this.composerShellEl.addClass('opencodian-composer-shell--liquid-glass');

      const adapter = getGlassAdapter(liquidGlassAdapterId);
      const ctx = this.buildLiquidGlassMountContext();
      if (!adapter || !ctx) {
        this.unmountLiquidGlassAdapter();
        return;
      }

      const adapterSettings = this.plugin.settings.inputPanelLiquidGlass[liquidGlassAdapterId];
      if (this.activeLiquidGlassAdapter !== adapter) {
        this.unmountLiquidGlassAdapter();
        adapter.mount(ctx, adapterSettings);
        this.activeLiquidGlassAdapter = adapter;
      } else {
        adapter.updateSettings?.(ctx, adapterSettings);
      }
      this.scheduleLiquidGlassDiagnostics(liquidGlassAdapterId);
      return;
    }

    this.unmountLiquidGlassAdapter();
    const themeClassName = INPUT_PANEL_THEME_CLASS_BY_ID[
      this.plugin.settings.inputPanelTheme as keyof typeof INPUT_PANEL_THEME_CLASS_BY_ID
    ];
    if (!themeClassName) {
      this.removeComposerSvgFilterLayer();
      return;
    }

    this.composerShellEl.addClass(themeClassName);

    const svgFilterSettings = this.plugin.settings.inputPanelGlassRefractionSvgFilter;
    const activeSvgFilterPreset = svgFilterSettings.preset;
    const activeSvgFilterScale = this.getActiveInputPanelGlassRefractionSvgFilterScale();
    if (activeSvgFilterPreset === 'none' || activeSvgFilterScale <= 0) {
      this.removeComposerSvgFilterLayer();
      return;
    }

    ensureComposerGlassSvgDefs(svgFilterSettings);
    this.ensureComposerSvgFilterLayer();
    this.composerShellEl.addClass(INPUT_PANEL_SVG_FILTER_CLASS_BY_ID[activeSvgFilterPreset]);
  }

  private scheduleLiquidGlassDiagnostics(adapterId: LiquidGlassAdapterId | null): void {
    if (!adapterId || !this.plugin.settings.enableDebugLogging) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.logLiquidGlassDiagnostics(adapterId);
      });
    });
  }

  private describeLiquidGlassDiagnosticElement(
    el: Element | null,
  ): LiquidGlassDiagnosticElementDescriptor | null {
    if (!el) {
      return null;
    }

    const tagName = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : 'unknown';
    const classNames = Array.from(el.classList ?? []).slice(0, 6);
    const htmlEl = el instanceof HTMLElement ? el : null;
    const messageEl = htmlEl?.closest<HTMLElement>('.opencodian-message') ?? null;
    const previewSource = el instanceof HTMLImageElement
      ? (el.getAttribute('alt') ?? el.getAttribute('src') ?? '')
      : (htmlEl?.textContent ?? '');

    return {
      tag: tagName,
      id: 'id' in el && typeof el.id === 'string' && el.id ? el.id : null,
      classes: classNames,
      messageId: messageEl?.dataset.messageId ?? null,
      role: htmlEl?.getAttribute('role') ?? null,
      textPreview: previewSource ? this.getLogPreview(previewSource, 80) : '',
    };
  }

  private getLiquidGlassRectIntersectionArea(a: DOMRect, b: DOMRect): number {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width <= 0 || height <= 0) {
      return 0;
    }

    return width * height;
  }

  private collectLiquidGlassBackdropPointSamples(
    shellEl: HTMLElement,
  ): LiquidGlassBackdropPointSample[] {
    if (typeof document.elementsFromPoint !== 'function') {
      return [];
    }

    const shellRect = shellEl.getBoundingClientRect();
    if (shellRect.width <= 0 || shellRect.height <= 0) {
      return [];
    }

    const insetX = Math.max(8, Math.min(24, shellRect.width * 0.18));
    const insetY = Math.max(8, Math.min(24, shellRect.height * 0.18));
    const samplePoints = [
      { point: 'top-left', x: shellRect.left + insetX, y: shellRect.top + insetY },
      { point: 'top-center', x: shellRect.left + shellRect.width / 2, y: shellRect.top + insetY },
      { point: 'top-right', x: shellRect.right - insetX, y: shellRect.top + insetY },
      { point: 'center', x: shellRect.left + shellRect.width / 2, y: shellRect.top + shellRect.height / 2 },
      { point: 'bottom-center', x: shellRect.left + shellRect.width / 2, y: shellRect.bottom - insetY },
    ];

    return samplePoints.map((sample) => {
      const x = Math.max(0, Math.min(window.innerWidth - 1, Math.round(sample.x)));
      const y = Math.max(0, Math.min(window.innerHeight - 1, Math.round(sample.y)));
      const underlayChain = document
        .elementsFromPoint(x, y)
        .filter((candidate) => !shellEl.contains(candidate) && !candidate.contains(shellEl))
        .slice(0, 6)
        .map((candidate) => this.describeLiquidGlassDiagnosticElement(candidate))
        .filter((candidate): candidate is LiquidGlassDiagnosticElementDescriptor => candidate !== null);

      return {
        point: sample.point,
        x,
        y,
        underlayChain,
      };
    });
  }

  private collectLiquidGlassBackdropOverlapDiagnostics(
    shellEl: HTMLElement,
  ): LiquidGlassBackdropOverlapDiagnostics | null {
    if (!this.messagesShellEl) {
      return null;
    }

    const shellRect = shellEl.getBoundingClientRect();
    const shellArea = Math.max(1, shellRect.width * shellRect.height);
    const overlapCandidates = Array.from(
      this.messagesShellEl.querySelectorAll<HTMLElement>(
        '.opencodian-message, .opencodian-chat-notice-card, .opencodian-tool-use, .opencodian-message img, .opencodian-message pre, .opencodian-message table',
      ),
    );
    const intersectingElements = overlapCandidates
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const overlapArea = this.getLiquidGlassRectIntersectionArea(shellRect, rect);
        return { candidate, rect, overlapArea };
      })
      .filter((entry) => entry.overlapArea > 0)
      .sort((a, b) => b.overlapArea - a.overlapArea)
      .slice(0, 5)
      .map((entry) => ({
        overlapArea: Math.round(entry.overlapArea),
        overlapPercentOfShell: Number(((entry.overlapArea / shellArea) * 100).toFixed(2)),
        element: this.describeLiquidGlassDiagnosticElement(entry.candidate),
      }));

    const structuralContentElements = Array.from(
      this.messagesShellEl.querySelectorAll<HTMLElement>(
        '.opencodian-turn, .opencodian-chat-notice-card, .opencodian-tool-use',
      ),
    );
    let lastContentBottom = Number.NEGATIVE_INFINITY;
    structuralContentElements.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      lastContentBottom = Math.max(lastContentBottom, rect.bottom);
    });

    return {
      shellArea: Math.round(shellArea),
      intersectingElementCount: intersectingElements.length,
      topIntersectingElements: intersectingElements,
      lastContentBottom: Number.isFinite(lastContentBottom) ? Math.round(lastContentBottom) : null,
      shellTop: Math.round(shellRect.top),
      gapAboveShellFromLastContentPx:
        Number.isFinite(lastContentBottom)
          ? Math.round(shellRect.top - lastContentBottom)
          : null,
    };
  }

  private collectLiquidGlassAncestorChain(
    startEl: HTMLElement,
    stopEl?: HTMLElement | null,
  ): LiquidGlassAncestorDiagnostic[] {
    const chain: LiquidGlassAncestorDiagnostic[] = [];
    let current: HTMLElement | null = startEl;
    let depth = 0;

    while (current && depth < 8) {
      const computed = window.getComputedStyle(current);
      chain.push({
        depth,
        element: this.describeLiquidGlassDiagnosticElement(current),
        position: computed.position,
        zIndex: computed.zIndex,
        overflow: computed.overflow,
        isolation: computed.isolation,
        transform: computed.transform,
        filter: computed.filter,
        backdropFilter:
          computed.getPropertyValue('backdrop-filter')
          || computed.getPropertyValue('-webkit-backdrop-filter'),
        opacity: computed.opacity,
        contain: computed.contain,
        mixBlendMode: computed.mixBlendMode,
        pointerEvents: computed.pointerEvents,
      });

      if (stopEl && current === stopEl) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return chain;
  }

  private logLiquidGlassDiagnostics(adapterId: LiquidGlassAdapterId): void {
    if (!this.composerShellEl || !this.composerSvgFilterLayerEl) {
      this.logLiquidGlassDiagnosticsEntry('Liquid glass diagnostics skipped', {
        adapterId,
        reason: 'missing-shell-or-filter-layer',
      });
      return;
    }

    const shellEl = this.composerShellEl;
    const filterLayerEl = this.composerSvgFilterLayerEl;
    const shellRect = shellEl.getBoundingClientRect();
    const filterRect = filterLayerEl.getBoundingClientRect();
    const filterComputed = window.getComputedStyle(filterLayerEl);
    const shellComputed = window.getComputedStyle(shellEl);
    const messagesEl = this.messagesContainer;
    const inlineFilter = filterLayerEl.style.getPropertyValue('filter');
    const inlineBackdropFilter = filterLayerEl.style.getPropertyValue('backdrop-filter');
    const backdropPointSamples = this.collectLiquidGlassBackdropPointSamples(shellEl);
    const backdropOverlap = this.collectLiquidGlassBackdropOverlapDiagnostics(shellEl);
    const filterLayerAncestorChain = this.collectLiquidGlassAncestorChain(filterLayerEl, this.chatContainerEl);
    const payload = {
      adapterId,
      themeId: this.plugin.settings.inputPanelTheme,
      adapterSettings: this.plugin.settings.inputPanelLiquidGlass[adapterId],
      shellRect: {
        width: Math.round(shellRect.width),
        height: Math.round(shellRect.height),
      },
      filterRect: {
        width: Math.round(filterRect.width),
        height: Math.round(filterRect.height),
      },
      shellStyles: {
        isolation: shellComputed.isolation,
        transform: shellComputed.transform,
        borderRadius: shellComputed.borderRadius,
      },
      filterLayerStyles: {
        inlineFilter,
        computedFilter: filterComputed.filter,
        inlineBackdropFilter,
        computedBackdropFilter:
          filterComputed.getPropertyValue('backdrop-filter')
          || filterComputed.getPropertyValue('-webkit-backdrop-filter'),
        backgroundColor: filterComputed.backgroundColor,
        opacity: filterComputed.opacity,
      },
      messagesMetrics: messagesEl
        ? {
            scrollTop: Math.round(messagesEl.scrollTop),
            scrollHeight: Math.round(messagesEl.scrollHeight),
            clientHeight: Math.round(messagesEl.clientHeight),
            paddingBottom: window.getComputedStyle(messagesEl).paddingBottom,
          }
        : null,
      composerStackHeight: this.chatContainerEl?.style.getPropertyValue('--opencodian-composer-stack-height') ?? '',
      backdropPointSamples,
      backdropOverlap,
      filterLayerAncestorChain,
    };

    this.logLiquidGlassDiagnosticsEntry('Liquid glass diagnostics', payload);
  }

  private logLiquidGlassDiagnosticsEntry(label: string, payload: unknown): void {
    const serializedPayload = this.stringifyLogPayload(payload);
    const fingerprint = `${label}:${serializedPayload}`;
    if (this.lastLiquidGlassDiagnosticsFingerprint === fingerprint) {
      return;
    }

    this.lastLiquidGlassDiagnosticsFingerprint = fingerprint;
    logger.debug(`${label}: ${serializedPayload}`);
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
    if (!this.composerShellEl) {
      return;
    }

    for (const className of INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_NAMES) {
      this.composerShellEl.removeClass(className);
    }

    const actionButtonStyle = this.plugin.settings.chatAppearance.input.actionButtonStyle;
    if (actionButtonStyle === 'default') {
      return;
    }

    this.composerShellEl.addClass(INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_BY_ID[actionButtonStyle]);
  }

  private getActiveInputPanelGlassRefractionSvgFilterScale(): number {
    switch (this.plugin.settings.inputPanelGlassRefractionSvgFilter.preset) {
      case 'subtle':
        return this.plugin.settings.inputPanelGlassRefractionSvgFilter.subtleScale;
      case 'strong':
        return this.plugin.settings.inputPanelGlassRefractionSvgFilter.strongScale;
      default:
        return 0;
    }
  }

  private ensureComposerSvgFilterLayer(): HTMLElement | null {
    if (!this.composerShellEl) {
      return null;
    }

    if (this.composerSvgFilterLayerEl?.isConnected) {
      return this.composerSvgFilterLayerEl;
    }

    const layerEl = document.createElement('div');
    layerEl.className = 'opencodian-composer-svg-filter-layer';
    this.composerShellEl.insertBefore(layerEl, this.composerShellEl.firstChild);
    this.composerSvgFilterLayerEl = layerEl;
    return layerEl;
  }

  private removeComposerSvgFilterLayer(): void {
    this.composerSvgFilterLayerEl?.remove();
    this.composerSvgFilterLayerEl = null;
  }

  private unmountLiquidGlassAdapter(): void {
    if (!this.activeLiquidGlassAdapter) {
      return;
    }

    const ctx = this.buildLiquidGlassMountContext();
    if (ctx) {
      this.activeLiquidGlassAdapter.unmount(ctx);
    }

    this.activeLiquidGlassAdapter = null;
  }

  private initializeComposerLayoutMetrics(): void {
    if (!this.chatContainerEl || !this.inputContainer) {
      return;
    }

    this.inputContainerResizeObserver?.disconnect();
    this.inputContainerResizeObserver = null;

    if (typeof ResizeObserver !== 'undefined') {
      this.inputContainerResizeObserver = new ResizeObserver(() => {
        this.scheduleComposerLayoutSync();
      });
      this.inputContainerResizeObserver.observe(this.inputContainer);
    }

    this.scheduleComposerLayoutSync();
  }

  private scheduleComposerLayoutSync(): void {
    if (this.composerLayoutSyncFrameId !== null) {
      return;
    }

    this.composerLayoutSyncFrameId = window.requestAnimationFrame(() => {
      this.composerLayoutSyncFrameId = null;
      this.syncComposerLayoutMetrics();
    });
  }

  private clearScheduledComposerLayoutSync(): void {
    if (this.composerLayoutSyncFrameId !== null) {
      window.cancelAnimationFrame(this.composerLayoutSyncFrameId);
      this.composerLayoutSyncFrameId = null;
    }
  }

  private syncComposerLayoutMetrics(): void {
    if (!this.chatContainerEl || !this.inputContainer) {
      return;
    }

    const stackHeight = Math.ceil(this.inputContainer.offsetHeight);
    this.chatContainerEl.style.setProperty('--opencodian-composer-stack-height', `${Math.max(0, stackHeight)}px`);
    this.scheduleSettledScrollToBottomIfNeeded();
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

  private trySubmitCurrentInput(): void {
    if (!this.inputTextarea) {
      return;
    }

    if (this.isTabForegroundBusy()) {
      new Notice(t('chat.tab.processingBlocked'));
      return;
    }

    const message = this.inputTextarea.value.trim();
    if (!message) {
      return;
    }

    void this.sendMessage(message);
    this.inputTextarea.value = '';
    this.syncInputTextareaHeight();
  }

  private syncInputTextareaHeight(): void {
    if (!this.inputTextarea) {
      return;
    }

    this.inputTextarea.style.height = 'auto';
    const nextHeight = Math.min(this.inputTextarea.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT);
    this.inputTextarea.style.height = `${nextHeight}px`;
    this.inputTextarea.style.overflowY = this.inputTextarea.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT
      ? 'auto'
      : 'hidden';
    this.scheduleComposerLayoutSync();
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

  private startConversationSyncLoop(): void {
    this.conversationSyncBridge.startConversationSyncLoop();
  }

  private clearScheduledSignalConversationSync(tabId: TabId | null): void {
    this.conversationSyncBridge.clearScheduledSignalConversationSync(tabId);
  }

  private scheduleConversationSyncFromSignal(
    tabId: TabId | null,
    reason: SessionSyncEventUpdate['type'],
  ): void {
    this.conversationSyncBridge.scheduleConversationSyncFromSignal(tabId, reason);
  }

  private stopConversationSyncLoop(): void {
    this.conversationSyncBridge.stopConversationSyncLoop();
  }

  private async syncVisibleConversationInBackground(): Promise<void> {
    await this.conversationSyncBridge.syncVisibleConversationInBackground();
  }

  private async syncBackgroundTaskTabsInBackground(): Promise<void> {
    await this.conversationSyncBridge.syncBackgroundTaskTabsInBackground();
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

  // History dropdown state
  private historyDropdownEl: HTMLElement | null = null;
  private historyDropdownClickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private historyDropdownPositionFrameId: number | null = null;

  /** Show conversation history */
  private showConversationHistory(event: MouseEvent) {
    const conversations = this.plugin.getConversations();
    const selectedConversationIds = new Set<string>();

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

      const checkboxWrapperEl = itemEl.createDiv({ cls: 'opencodian-history-item-checkbox' });
      checkboxWrapperEl.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      const checkboxEl = checkboxWrapperEl.createEl('input', {
        attr: {
          type: 'checkbox',
          'aria-label': `${t('chat.history.selectConversation')}: ${title}`,
        },
      });
      checkboxEl.addEventListener('click', (e) => {
        e.stopPropagation();
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

      checkboxEl.addEventListener('change', (e) => {
        e.stopPropagation();
        const isSelected = checkboxEl.checked;
        itemEl.toggleClass('is-selected', isSelected);
        if (isSelected) {
          selectedConversationIds.add(conv.id);
        } else {
          selectedConversationIds.delete(conv.id);
        }
        updateDeleteActionText();
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
          window.requestAnimationFrame(() => {
            void this.loadConversation(conv.id);
          });
        }
      });
    }

    // Fixed footer with delete actions (outside scroll container)
    const footerEl = this.historyDropdownEl.createDiv({ cls: 'opencodian-history-footer' });

    // Add separator line
    footerEl.createDiv({ cls: 'opencodian-history-separator' });

    // Delete actions section
    const actionsEl = footerEl.createDiv({ cls: 'opencodian-history-actions' });

    // Delete current or selected conversations
    const deleteTargetEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
    const deleteTargetIcon = deleteTargetEl.createSpan({ cls: 'opencodian-history-action-icon' });
    setIcon(deleteTargetIcon, 'trash');
    const deleteTargetTextEl = deleteTargetEl.createSpan({ cls: 'opencodian-history-action-text' });
    const updateDeleteActionText = () => {
      deleteTargetTextEl.setText(
        selectedConversationIds.size > 0
          ? t('chat.history.deleteSelected')
          : t('chat.history.deleteCurrent'),
      );
    };
    updateDeleteActionText();
    deleteTargetEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedIds = Array.from(selectedConversationIds);
      this.closeHistoryDropdown();
      if (selectedIds.length > 0) {
        void this.deleteSelectedConversations(selectedIds);
        return;
      }
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

    const targetEl = (event.currentTarget as HTMLElement | null) ?? (event.target as HTMLElement);
    const rect = targetEl.getBoundingClientRect();

    document.body.appendChild(this.historyDropdownEl);
    this.historyDropdownEl.style.position = 'fixed';
    this.historyDropdownEl.style.top = '0';
    this.historyDropdownEl.style.left = '0';
    this.historyDropdownEl.style.zIndex = '1000';
    this.historyDropdownEl.style.visibility = 'hidden';
    this.scheduleHistoryDropdownPosition(rect);

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
    this.clearScheduledHistoryDropdownPosition();
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
    await this.deleteConversationsAndCleanupTabs([deletedId]);

    new Notice(t('chat.deleteCurrentConfirm.success') || 'Conversation deleted');
  }

  /** Delete selected conversations with the same 3-second confirmation countdown */
  private async deleteSelectedConversations(conversationIds: string[]) {
    const uniqueConversationIds = Array.from(new Set(conversationIds));
    if (uniqueConversationIds.length === 0) {
      return;
    }

    const confirmed = await this.showDeleteSelectedConfirmDialog(uniqueConversationIds.length);
    if (!confirmed) {
      return;
    }

    await this.deleteConversationsAndCleanupTabs(uniqueConversationIds);
    new Notice(t('chat.deleteSelectedConfirm.success') || 'Selected conversations deleted');
  }

  private async deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void> {
    await this.conversationTabLifecycleRecoveryCoordinator.deleteConversationsAndRecover(conversationIds);
  }

  /** Show delete current conversation confirmation dialog with 3-second countdown */
  private async showDeleteCurrentConfirmDialog(title: string): Promise<boolean> {
    return this.showDeleteConfirmDialog({
      titleKey: 'chat.deleteCurrentConfirm.title',
      warningKey: 'chat.deleteCurrentConfirm.warning',
      description: t('chat.deleteCurrentConfirm.description', { title }),
      emphasisKey: 'chat.deleteCurrentConfirm.emphasis',
      cancelKey: 'chat.deleteCurrentConfirm.cancel',
      confirmKey: 'chat.deleteCurrentConfirm.confirm',
      confirmTextKey: 'chat.deleteCurrentConfirm.confirmText',
      countdown: 3,
    });
  }

  /** Show delete selected conversations confirmation dialog with 3-second countdown */
  private async showDeleteSelectedConfirmDialog(count: number): Promise<boolean> {
    return this.showDeleteConfirmDialog({
      titleKey: 'chat.deleteSelectedConfirm.title',
      warningKey: 'chat.deleteSelectedConfirm.warning',
      description: t('chat.deleteSelectedConfirm.description', { count: String(count) }),
      emphasisKey: 'chat.deleteSelectedConfirm.emphasis',
      cancelKey: 'chat.deleteSelectedConfirm.cancel',
      confirmKey: 'chat.deleteSelectedConfirm.confirm',
      confirmTextKey: 'chat.deleteSelectedConfirm.confirmText',
      countdown: 3,
    });
  }

  /** Delete all conversations with 5-second confirmation */
  private async deleteAllConversations() {
    const conversations = this.plugin.getConversations();
    if (conversations.length === 0) return;

    // Create custom confirmation modal
    const confirmed = await this.showDeleteAllConfirmDialog(conversations.length);
    if (!confirmed) return;

    await this.conversationTabLifecycleRecoveryCoordinator.deleteAllConversationsAndReset(
      conversations.map((conversation) => conversation.id),
    );
    new Notice(t('chat.deleteAllConfirm.success') || 'All conversations deleted');
  }

  /** Show delete all confirmation dialog with 5-second countdown */
  private async showDeleteAllConfirmDialog(count: number): Promise<boolean> {
    return this.showDeleteConfirmDialog({
      titleKey: 'chat.deleteAllConfirm.title',
      warningKey: 'chat.deleteAllConfirm.warning',
      description: t('chat.deleteAllConfirm.description', { count: String(count) }),
      emphasisKey: 'chat.deleteAllConfirm.emphasis',
      cancelKey: 'chat.deleteAllConfirm.cancel',
      confirmKey: 'chat.deleteAllConfirm.confirm',
      confirmTextKey: 'chat.deleteAllConfirm.confirmText',
      countdown: 6,
    });
  }

  private async showDeleteConfirmDialog(options: {
    titleKey: TranslationKey;
    warningKey: TranslationKey;
    description: string;
    emphasisKey: TranslationKey;
    cancelKey: TranslationKey;
    confirmKey: TranslationKey;
    confirmTextKey: TranslationKey;
    countdown: number;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.addClass('opencodian-delete-confirm-overlay');

      // Create dialog
      const dialog = document.createElement('div');
      dialog.addClass('opencodian-delete-confirm-dialog');

      // Title with warning icon
      const titleEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-title' });
      titleEl.setText(t(options.titleKey));

      // Warning text
      const warningEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-warning' });
      warningEl.setText(t(options.warningKey));

      // Description
      const descEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-desc' });
      descEl.setText(options.description);

      // Emphasis text
      const emphasisEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-emphasis' });
      emphasisEl.setText(t(options.emphasisKey));

      // Buttons container
      const buttonsEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-buttons' });

      // Confirm button (red, with countdown) - LEFT side
      const confirmBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-confirm',
        text: t(options.confirmKey, { seconds: String(options.countdown) })
      });
      confirmBtn.setAttribute('disabled', 'true');

      // Cancel button - RIGHT side, larger
      const cancelBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-cancel',
        text: t(options.cancelKey)
      });

      // Append to document
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      let countdown = options.countdown;
      let timerId: number | null = null;
      let countdownStartTimeoutId: number | null = null;
      let settled = false;

      const cleanup = () => {
        if (timerId) {
          window.clearInterval(timerId);
          timerId = null;
        }
        if (countdownStartTimeoutId) {
          window.clearTimeout(countdownStartTimeoutId);
          countdownStartTimeoutId = null;
        }
        document.removeEventListener('keydown', escapeHandler);
        overlay.remove();
      };

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      // Countdown logic
      const startCountdown = () => {
        if (settled) {
          return;
        }
        timerId = window.setInterval(() => {
          countdown--;
          if (countdown > 0) {
            confirmBtn.setText(t(options.confirmKey, { seconds: String(countdown) }));
          } else {
            // Enable confirm button
            if (timerId) {
              window.clearInterval(timerId);
              timerId = null;
            }
            confirmBtn.removeAttribute('disabled');
            // Remove countdown text, show only confirm text
            confirmBtn.setText(t(options.confirmTextKey));
          }
        }, 1000);
      };

      // Start countdown after a short delay
      countdownStartTimeoutId = window.setTimeout(startCountdown, 100);

      // Cancel handler
      const handleCancel = () => {
        finish(false);
      };

      // Confirm handler
      const handleConfirm = () => {
        if (countdown > 0) return; // Still counting down
        finish(true);
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
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }

  /** Send a message */
  private async sendMessage(content: string) {
    await this.sendPipelineRuntime.sendMessage(content);
  }

  private scheduleHistoryDropdownPosition(anchorRect: DOMRect): void {
    this.clearScheduledHistoryDropdownPosition();
    this.historyDropdownPositionFrameId = window.requestAnimationFrame(() => {
      this.historyDropdownPositionFrameId = null;
      const dropdownEl = this.historyDropdownEl;
      if (!dropdownEl?.isConnected) {
        return;
      }

      const dropdownRect = dropdownEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - anchorRect.bottom - 8;
      const spaceAbove = anchorRect.top - 8;

      let top: number;
      if (spaceBelow >= dropdownRect.height || spaceBelow >= spaceAbove) {
        top = anchorRect.bottom + 4;
        if (top + dropdownRect.height > viewportHeight - 8) {
          top = Math.max(8, viewportHeight - dropdownRect.height - 8);
        }
      } else {
        top = anchorRect.top - dropdownRect.height - 4;
        if (top < 8) {
          top = 8;
        }
      }

      let left = anchorRect.left;
      if (left + dropdownRect.width > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - dropdownRect.width - 8);
      }
      if (left < 8) {
        left = 8;
      }

      dropdownEl.style.top = `${top}px`;
      dropdownEl.style.left = `${left}px`;
      dropdownEl.style.visibility = 'visible';
    });
  }

  private clearScheduledHistoryDropdownPosition(): void {
    if (this.historyDropdownPositionFrameId !== null) {
      window.cancelAnimationFrame(this.historyDropdownPositionFrameId);
      this.historyDropdownPositionFrameId = null;
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
    if (!this.sendBtn) return;

    // Clear current icon
    this.sendBtn.empty();

    if (this.isActiveTabStreaming()) {
      // Show stop icon (square)
      setIcon(this.sendBtn, 'square');
      this.sendBtn.addClass('opencodian-stop-btn');
      this.sendBtn.removeClass('opencodian-send-btn');
      this.setTooltipLabel(this.sendBtn, t('chat.input.stopStreaming'), 'top');
    } else {
      // Show send icon
      setIcon(this.sendBtn, 'send');
      this.sendBtn.addClass('opencodian-send-btn');
      this.sendBtn.removeClass('opencodian-stop-btn');
      this.setTooltipLabel(this.sendBtn, t('chat.input.sendMessage'), 'top');
    }
  }

  /** Render a message */
  private async renderMessage(message: ChatMessage) {
    const turn = message.role === 'user' && message.displayStyle !== 'notice'
      ? this.createTurn()
      : null;
    const parentEl =
      message.displayStyle === 'notice'
        ? this.ensureTurnBody()
        : message.role === 'user'
          ? turn?.headerEl
          : this.ensureTurnBody();
    const messageEl = parentEl?.createDiv({
      cls: `opencodian-message opencodian-message--${message.role}`,
    });

    if (!messageEl) return;
    if (turn && message.role === 'user') {
      const runtime = this.getTabRuntimeState();
      runtime?.turnBodyByAnchorKey.set(this.getMessageAnchorKey(message), turn.bodyEl);
    }
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
      await this.assistantNoticeCardRenderer.render(content, message);
      this.assistantShellViewHostAdapter.finalizeNoticeFooter(messageEl, message);
    } else if (message.role === 'user') {
      const copyContent = await this.renderUserMessageContent(content, message);
      this.addUserMessageFooter(messageEl, message, copyContent);
    } else {
      await this.renderAssistantMessageContent(messageEl, content, message);
    }

    return messageEl;
  }

  private async renderAssistantMessageContent(
    messageEl: HTMLElement,
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

    this.assistantShellViewHostAdapter.finalizePersistedFooter(messageEl, message);
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
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.backgroundTaskInlinePanelRenderer.clear(tabId);
    runtime.backgroundTaskStartedAt = null;
    runtime.backgroundTaskActiveAnchorKey = null;
    runtime.backgroundTaskModeTag = null;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskLaunches.clear();
    runtime.backgroundTaskCompletedTasks.clear();
    this.backgroundTaskLiveSignalCoordinator.clearAuthoritativeSyncGate(tabId);
    runtime.backgroundTaskStaleNoticeFingerprint = null;
    this.syncTabStreamLikeState(tabId);
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
    let contextAttachments = syncedMessage.contextAttachments;
    if (existingMessage.contextAttachments && existingMessage.contextAttachments.length > 0) {
      if (!contextAttachments || contextAttachments.length === 0) {
        contextAttachments = existingMessage.contextAttachments;
      } else {
        contextAttachments = contextAttachments.map((attachment) => {
          const existingAttachment = existingMessage.contextAttachments?.find((candidate) =>
            candidate.path === attachment.path
            && candidate.lineRange?.startLine === attachment.lineRange?.startLine
            && candidate.lineRange?.endLine === attachment.lineRange?.endLine,
          );

          return existingAttachment ?? attachment;
        });
      }
    }

    let content = syncedMessage.content;
    if (!content?.trim() && existingMessage.content?.trim()) {
      content = existingMessage.content;
    }

    let contentBlocks = syncedMessage.contentBlocks;
    if (this.shouldPreserveExistingAssistantContentBlocks(existingMessage, syncedMessage)) {
      contentBlocks = existingMessage.contentBlocks;
    }

    let toolCalls = syncedMessage.toolCalls;
    if ((!toolCalls || toolCalls.length === 0) && existingMessage.toolCalls?.length) {
      toolCalls = existingMessage.toolCalls;
    }

    const preservedFlags = {
      preservedExistingContent: content === existingMessage.content && content !== syncedMessage.content,
      preservedExistingContentBlocks: contentBlocks === existingMessage.contentBlocks,
      preservedExistingToolCalls: toolCalls === existingMessage.toolCalls && toolCalls !== syncedMessage.toolCalls,
      preservedExistingStructured: syncedMessage.structured === undefined && existingMessage.structured !== undefined,
      preservedExistingParts: syncedMessage.parts === undefined && existingMessage.parts !== undefined,
    };
    if (verbose && Object.values(preservedFlags).some(Boolean)) {
      this.logAssistantFinalizationDebug('merge-client-only-message-fields', {
        existingMessage: this.summarizeChatMessageForDebug(existingMessage),
        syncedMessage: this.summarizeChatMessageForDebug(syncedMessage),
        preservedFlags,
      });
    }

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
      const serverMessages = await this.plugin.openCodeService.getSessionMessages(sessionId);
      const latestServerUser = [...serverMessages]
        .reverse()
        .find(({ info }) => info.role === 'user');
      if (!latestServerUser) {
        return;
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

      const mergedHydratedMessage = this.mergeClientOnlyMessageFields(optimisticMessage, hydratedMessage);

      if (
        optimisticMessage.sourceMessageId === mergedHydratedMessage.sourceMessageId
        && optimisticMessage.content === mergedHydratedMessage.content
        && JSON.stringify(optimisticMessage.omo ?? null) === JSON.stringify(mergedHydratedMessage.omo ?? null)
        && JSON.stringify(optimisticMessage.contextAttachments ?? null) === JSON.stringify(mergedHydratedMessage.contextAttachments ?? null)
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

      conversation.messages.splice(optimisticIndex, 1, mergedHydratedMessage);
      this.armBackgroundTaskIndicatorForUserMessage(mergedHydratedMessage, tabId);
      const runtime = this.getTabRuntimeState(tabId);
      if (runtime) {
        const previousAnchorKey = this.getMessageAnchorKey(optimisticMessage);
        const nextAnchorKey = this.getMessageAnchorKey(mergedHydratedMessage);
        const bodyEl = runtime.turnBodyByAnchorKey.get(previousAnchorKey);
        if (bodyEl) {
          runtime.turnBodyByAnchorKey.delete(previousAnchorKey);
          runtime.turnBodyByAnchorKey.set(nextAnchorKey, bodyEl);
        }
        runtime.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(conversation.messages);
      }
      await this.plugin.saveConversation(conversation);
      if (this.currentConversation?.id === conversation.id && this.getActiveTabId() === tabId) {
        await this.rerenderSingleUserMessage(optimisticMessageId, mergedHydratedMessage);
        await this.renderBackgroundTaskIndicatorIfNeeded(tabId);
      }
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
      if (verbose) this.logAssistantFinalizationDebug('server-sync-begin', {
        reason,
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        tabId,
        existingMessageCount: conversation.messages.length,
        localTailAssistant: this.summarizeChatMessageForDebug(
          [...conversation.messages].reverse().find((message) => message.role === 'assistant'),
        ),
      });
      const serverMessages = await this.plugin.openCodeService.getSessionMessages(conversation.openCodeSessionId);
      const revertState = serverMessages.length === 0
        ? await this.plugin.openCodeService.getSessionRevertState(conversation.openCodeSessionId)
        : null;
      const convertedServerMessages = serverMessages
        .map(({ info, parts }) =>
          this.plugin.openCodeService.hydrateOpenCodeMessage(info, parts, getVaultBasePath(this.app) ?? undefined),
        )
        .filter((message) => this.shouldRenderConversationMessage(message));
      if (verbose) this.logAssistantFinalizationDebug('server-sync-fetched', {
        reason,
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        tabId,
        serverMessageCount: serverMessages.length,
        convertedMessageCount: convertedServerMessages.length,
        serverTailAssistant: this.summarizeChatMessageForDebug(
          [...convertedServerMessages].reverse().find((message) => message.role === 'assistant'),
        ),
      });
      this.logOmoBackgroundTaskDiagnostics(conversation, conversation.messages, convertedServerMessages);
      const converted = this.mergeSyncedMessageModelIds(
        conversation.messages,
        convertedServerMessages,
        verbose,
      );
      const preservedClientOnlyMessages = this.getClientOnlyMessagesToPreserveOnSync(
        conversation.messages,
        converted,
      );
      const preservedInterruptedMessages = preservedClientOnlyMessages.filter(
        (message) => message.streamState === 'interrupted',
      );
      const runtime = this.getTabRuntimeState(tabId);
      const preservedInterruptedLogFingerprint = preservedInterruptedMessages.length > 0
        ? this.getInterruptedSyncPreservationLogFingerprint(conversation, preservedInterruptedMessages)
        : null;
      if (
        preservedInterruptedMessages.length > 0
        && (!runtime || runtime.lastInterruptedSyncPreservationLogFingerprint !== preservedInterruptedLogFingerprint)
      ) {
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
      if (runtime) {
        runtime.lastInterruptedSyncPreservationLogFingerprint = preservedInterruptedLogFingerprint;
      }
      const merged = [...converted, ...preservedClientOnlyMessages]
        .sort((left, right) => left.timestamp - right.timestamp);
      if (verbose) this.logAssistantFinalizationDebug('server-sync-merged', {
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

      this.markBackgroundTaskAuthoritativeSync(tabId, reason);

      if (this.currentConversation?.id === conversation.id && this.getActiveTabId() === tabId) {
        await this.activeTabContextUsageCoordinator.refreshFromServer();
      }
      if (changed) {
        logger.debug('Conversation sync complete', {
          conversationId: conversation.id,
          sessionId: conversation.openCodeSessionId,
          reason,
          serverMessageCount: serverMessages.length,
          mergedMessageCount: merged.length,
          preservedClientOnlyMessageCount: preservedClientOnlyMessages.length,
          revertApplied: Boolean(revertState),
          revertMessageId: revertState?.messageID ?? null,
          changed,
        });
      }
      if (verbose || changed) this.logAssistantFinalizationDebug('server-sync-finished', {
        reason,
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        tabId,
        changed,
        fingerprint,
        revertApplied: Boolean(revertState),
        revertMessageId: revertState?.messageID ?? null,
      });
      return { messages: merged, changed, fingerprint, revertState };
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

  private async renameConversation(conversationId: string): Promise<void> {
    const conversation = await this.plugin.getConversationById(conversationId, {
      preferCache: true,
    });
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
  private scrollToBottom(options: {
    tabId?: TabId | null;
    behavior?: ScrollBehavior;
    enableAutoScroll?: boolean;
  } = {}): void {
    const tabId = options.tabId ?? this.getActiveTabId();
    if (!tabId) {
      return;
    }

    const paneState = this.getTabPaneState(tabId);
    if (!paneState) {
      return;
    }

    scrollElementToBottom(paneState.messagesEl, paneState.runtime, options);

    this.syncPaneScrollMetrics(tabId, paneState.messagesEl);
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

    this.renderModelList();
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

    const highlightedValue = this.modelSelectorScrollContainer
      .querySelector<HTMLElement>('.opencodian-model-option.is-highlighted')
      ?.dataset.value ?? null;
    const renderResult = renderModelSelectorList({
      scrollContainer: this.modelSelectorScrollContainer,
      providers: this.availableProviders,
      hasLoadedModelCatalog: this.hasLoadedModelCatalog,
      filterQuery: this.modelFilterQuery,
      currentSelection: this.getCurrentSessionModel(),
      highlightedValue,
      previousStickyHeadersCleanup: this.disposeModelSelectorStickyHeaders,
      texts: {
        loading: 'Loading models...',
        noModels: t('settings.model.noModels'),
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
      },
      onSelect: (provider, model) => {
        this.switchModel(provider, model);
        this.closeModelDropdown();
      },
      onHighlight: (value) => {
        this.highlightModelOption(value);
      },
    });

    this.disposeModelSelectorStickyHeaders = renderResult.disposeStickyHeaders;
  }

  /** Navigate model list with keyboard */
  private navigateModelList(direction: 1 | -1): void {
    if (!this.modelSelectorScrollContainer) return;
    navigateRenderedModelList(this.modelSelectorScrollContainer, direction);
  }

  /** Highlight a specific model option */
  private highlightModelOption(value: string): void {
    if (!this.modelSelectorScrollContainer) return;
    highlightRenderedModelOption(this.modelSelectorScrollContainer, value);
  }

  /** Select currently highlighted model */
  private selectHighlightedModel(): void {
    if (!this.modelSelectorScrollContainer) return;
    const didSelect = selectRenderedHighlightedModel(
      this.modelSelectorScrollContainer,
      (provider, model) => {
        this.switchModel(provider, model);
      },
    );
    if (didSelect) {
      this.closeModelDropdown();
    }
  }

  /** Scroll to current model in dropdown */
  private scrollToCurrentModel(): void {
    if (!this.modelSelectorScrollContainer) return;
    scrollRenderedCurrentModel(this.modelSelectorScrollContainer, this.getCurrentSessionModel());
  }

  public async reloadModelCatalog(): Promise<void> {
    await this.loadAvailableModels();
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

      // Re-render dropdown with new data
      this.renderModelList();
      this.updateModelSelectorDisplay();
      this.activeTabContextUsageCoordinator.syncIdentity();
    } catch (error) {
      logger.error('Failed to load models:', error);
    }
  }

  /** Update model selector to show current model */
  private updateModelSelectorDisplay(): void {
    const current = this.getCurrentSessionModel();
    const resolution = this.getCurrentSessionModelResolution();

    if (!this.modelSelectorTrigger) return;

    const modelInfo = this.findKnownModelInfo(current);
    const displayState = buildModelSelectorDisplayState({
      currentSelection: current,
      resolution,
      knownModelInfo: modelInfo,
      hasLoadedModelCatalog: this.hasLoadedModelCatalog,
      availableProviderCount: this.availableProviders.length,
      unavailableTitle: this.getModelUnavailableNoticeContent().message,
      unconfiguredLabel: t('settings.model.unconfigured'),
    });
    this.modelSelectorTrigger.toggleClass('is-unavailable', displayState.isUnavailable);
    this.modelSelectorTrigger.toggleClass('is-unconfigured', displayState.isUnconfigured);

    const textEl = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-text');
    if (textEl) {
      textEl.textContent = displayState.text;
    }

    this.modelSelectorTrigger.setAttribute('title', displayState.title);
    void this.updateModelSelectorIcon(current?.provider ?? null, displayState.iconLabel);

    this.effortSelector?.updateDisplay();
  }

  private async updateModelSelectorIcon(providerId: string | null, iconLabel: string): Promise<void> {
    if (!this.modelSelectorTrigger) return;

    const iconWrapper = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-icon');
    if (!iconWrapper) return;

    const requestId = ++this.modelSelectorIconRequestId;

    if (!providerId) {
      iconWrapper.empty();
      setIcon(iconWrapper as HTMLElement, 'bot');
      this.currentModelTriggerIconUrl = null;
      return;
    }

    const iconUrl = await ProviderIconService.resolveIconUrl(
      this.app,
      providerId,
      this.plugin.settings.providerIconLibrary,
    );
    if (requestId !== this.modelSelectorIconRequestId) {
      return;
    }

    if (iconUrl !== this.currentModelTriggerIconUrl) {
      iconWrapper.empty();

      if (iconUrl) {
        const img = document.createElement('img');
        img.classList.add('opencodian-provider-icon-image');
        img.src = iconUrl;
        img.alt = iconLabel;
        img.title = iconLabel;
        iconWrapper.appendChild(img);
      } else {
        setIcon(iconWrapper as HTMLElement, 'bot');
      }

      this.currentModelTriggerIconUrl = iconUrl;
      return;
    }

    if (iconUrl) {
      const existingImg = iconWrapper.querySelector('img');
      if (existingImg) {
        existingImg.alt = iconLabel;
        existingImg.title = iconLabel;
      }
    }
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

    // Update display
    this.updateModelSelectorDisplay();
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
      await this.loadAvailableModels();
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
