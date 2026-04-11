/**
 * OpenCodian View
 *
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { EditorView } from '@codemirror/view';
import type { Editor, EventRef, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { addIcon, Component, ItemView, MarkdownView, normalizePath, Notice, Scope, setIcon, TFile } from 'obsidian';

import type { ModelCatalogBundle } from '../../core/config';
import {
  formatModelReference,
  type ResolvedModelSelection,
  resolveModelSelection,
  resolvePreferredAvailableModel,
} from '../../core/config/modelConfig';
import {
  type SessionActivityStatus,
  type SessionSyncEventUpdate,
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
  type PromptContextLineRange,
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
  buildContextAttachment,
  createLogger,
  formatContextLabel,
  getContextPathExtension,
  getVaultBasePath,
  isEligibleContextFilePath,
  isInternalStructuredOutputTool,
  isTextLikeMime,
  resolveContextMimeFromPath,
  resolveTextMimeFromPath,
  resolveToolExecutionStatus,
} from '../../shared';
import { chooseForkTarget } from '../../shared/modals';
import { hideSelectionHighlight, showSelectionHighlight } from '../../utils/editorSelectionHighlight';
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
  getProgrammaticScrollGuardDelayMs,
  hasProgrammaticScrollGuard,
  isNearBottom as isNearBottomByMetrics,
} from './autoScrollState';
import {
  buildChatAppearanceCustomCss,
  getChatAppearanceCssVariables,
  getInputPanelGlassRefractionCssVariables,
} from './chatAppearance';
import {
  buildComposerContextChipStates,
  createFocusContextPreview,
  type FocusContextPreview,
  getContextTargetKey,
  removeDraftContextItemsByTarget,
  resolveFocusContextPreview,
  upsertDraftContextItem,
} from './composerContext';
import { cloneMessagesBeforeForkTarget } from './forkMessages';
import { GlassOctahedronDemoController } from './glassOctahedronDemo';
import { LiquidDiamondDemoController } from './liquidDiamondDemo';
import { buildMessageRenderGroups, mergeAssistantMessagesForRender } from './renderGroups';
import { type CollapsibleState, setupCollapsible } from './rendering/collapsible';
import { ContextUsageService } from './services/ContextUsageService';
import { TitleGenerationService } from './services/TitleGenerationService';
import { type RestoredTabState, TabBar, type TabBarLayoutMode, type TabId, TabManager } from './tabs';
import { ContextDetailModal,type ContextRawMessageItem } from './ui/ContextDetailModal';
import {
  chooseContextFile,
  type ContextFileCatalog,
  type ContextFileEntry,
} from './ui/ContextFilePickerModal';
import { ContextRing } from './ui/ContextRing';
import { EffortSelector } from './ui/EffortSelector';
import { NavigationSidebar } from './ui/NavigationSidebar';
import { QuestionDock } from './ui/QuestionDock';
import {
  buildQuestionDockViewModel,
  getPreferredQuestionIndexForGroup,
  isQuestionAnswerComplete,
  normalizeQuestionDraftAnswers,
} from './ui/questionDockState';
import { SessionTodoDock } from './ui/SessionTodoDock';
import { syncUserMessageStreamingActionState } from './userMessageActions';
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

const STREAM_PROGRESS_LOG_MIN_INTERVAL_MS = 1200;
const STREAM_PROGRESS_LOG_MIN_TEXT_DELTA = 400;
const OPENCODIAN_APP_ICON = 'opencodian-app-icon';

/** Logo SVG for light theme (dark logo on light bg) - from opencode-logo-light.svg */
const LOGO_SVG_LIGHT = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_light)"><mask id="mask0_light" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_light)"><path d="M180 240H60V120H180V240Z" fill="#CFCECD"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E"/></g></g><defs><clipPath id="clip0_light"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Logo SVG for dark theme (light logo on dark bg) - from opencode-logo-dark.svg */
const LOGO_SVG_DARK = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_dark)"><mask id="mask0_dark" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_dark)"><path d="M180 240H60V120H180V240Z" fill="#4B4646"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/></g></g><defs><clipPath id="clip0_dark"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;
const TITLE_WORDMARK_LIGHT_ASSET_PATH = 'assets/branding/opencodian-wordmark-light.svg';
const TITLE_WORDMARK_DARK_ASSET_PATH = 'assets/branding/opencodian-wordmark-dark.svg';

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

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;

/** Get a random pending message */
function getRandomPendingMessage(): string {
  return PENDING_MESSAGES[Math.floor(Math.random() * PENDING_MESSAGES.length)];
}

const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;
const RETAINED_SELECTION_DOM_HIGHLIGHT_KEY = 'opencodian-selection';
const RETAINED_SELECTION_INPUT_HANDOFF_GRACE_MS = 1500;
const RETAINED_SELECTION_POLL_INTERVAL_MS = 250;
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

interface BackgroundTaskLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

interface BackgroundTaskCompletionInfo {
  taskId: string;
  description: string;
}

interface BackgroundTaskCompletionEvent {
  anchorKey: string;
  reminderMessageId: string;
  reminderType: 'background-task-completed' | 'all-background-tasks-complete';
  tasks: BackgroundTaskCompletionInfo[];
  timestamp: number;
}

interface BackgroundTaskSegment {
  anchorKey: string;
  anchorTimestamp: number;
  modeTag: string | null;
  launches: BackgroundTaskLaunchInfo[];
  completed: BackgroundTaskCompletionInfo[];
  pending: BackgroundTaskLaunchInfo[];
  sawAllTasksComplete: boolean;
  waitingForFollowUp: boolean;
  completionEvents: BackgroundTaskCompletionEvent[];
}

interface QueuedBackgroundTaskCompletionNotice {
  anchorKey: string;
  allComplete: boolean;
  sourceReminderIds: Set<string>;
  tasks: Map<string, BackgroundTaskCompletionInfo>;
  latestTimestamp: number;
}

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

interface RetainedSelectionHighlight {
  path: string;
  editorView: EditorView | null;
  from: number | null;
  to: number | null;
  domRanges: Range[];
  captureSource: 'offsets' | 'dom' | 'mixed';
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

type ConversationScrollRestoreMode = 'bottom' | 'preserve-distance' | 'preserve-anchor';

interface ConversationScrollRestoreSnapshot {
  mode: ConversationScrollRestoreMode;
  scrollTop: number;
  distanceFromBottom: number;
  anchorMessageId: string | null;
  anchorOffsetTop: number;
}

/** Clipboard icon SVG for copy button */
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const FORK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/><path d="M12 12v3"/></svg>`;
const REWIND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
const NEW_TAB_ICON = `<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="41.667"/><path d="M33.333 50h33.334"/><path d="M50 33.333v33.334"/></g>`;
const CURRENT_TAB_NEW_CONVERSATION_ICON = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="scale(4.166667)"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/></g>`;
const BACKGROUND_TASK_GRACE_PERIOD_MS = 15_000;
const STALE_SESSION_TODO_TIMEOUT_MS = 120_000;

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
  private composerContextRowEl: HTMLElement | null = null;
  private questionDockMountEl: HTMLElement | null = null;
  private questionDock: QuestionDock | null = null;
  private todoDockMountEl: HTMLElement | null = null;
  private sessionTodoDock: SessionTodoDock | null = null;
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
  private availableModels: Array<{ provider: string; model: string; label: string; providerName: string; modelName: string; contextWindow?: number }> = [];
  private availableProviders: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }> = [];
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
  private conversationSyncIntervalId: number | null = null;
  private omoBackgroundTaskLogStates = new Map<string, OmoBackgroundTaskLogState>();
  private disposeSessionTodoSubscription: (() => void) | null = null;
  private disposeSessionStatusSubscription: (() => void) | null = null;
  private disposeSessionSyncEventSubscription: (() => void) | null = null;
  private lastKnownMarkdownFilePath: string | null = null;
  private contextFileCatalogCache: ContextFileCatalog | null = null;
  private contextFileCatalogBuildPromise: Promise<ContextFileCatalog> | null = null;
  private focusContextRefreshTimeoutId: number | null = null;
  private retainedSelectionHighlight: RetainedSelectionHighlight | null = null;
  private retainedSelectionInputHandoffGraceUntil: number | null = null;
  private retainedSelectionPollIntervalId: number | null = null;
  private lastLiquidGlassDiagnosticsFingerprint: string | null = null;

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

  private getDraftContextItems(tabId: TabId | null = this.getActiveTabId()): PromptContextItem[] {
    const runtime = this.getTabRuntimeState(tabId);
    return runtime ? [...runtime.draftContextItems] : [];
  }

  private getFocusContextPreview(tabId: TabId | null = this.getActiveTabId()): FocusContextPreview | null {
    return this.getTabRuntimeState(tabId)?.focusContextPreview ?? null;
  }

  private setDraftContextItems(
    items: PromptContextItem[],
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.draftContextItems = [...items];
    if (tabId === this.getActiveTabId()) {
      this.renderComposerContextChips();
    }
  }

  private addDraftContextItem(
    item: PromptContextItem,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const existingItems = this.getDraftContextItems(tabId);
    const nextItems = upsertDraftContextItem(existingItems, item);
    this.setDraftContextItems(nextItems, tabId);
  }

  private setFocusContextPreview(
    preview: FocusContextPreview | null,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const previous = runtime.focusContextPreview;
    if (this.areFocusContextPreviewsEqual(previous, preview)) {
      return;
    }

    runtime.focusContextPreview = preview;
    if (tabId === this.getActiveTabId()) {
      this.renderComposerContextChips();
    }
  }

  private removeDraftContextItemsForTarget(
    target: Pick<PromptContextItem, 'path' | 'lineRange'>,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const nextItems = removeDraftContextItemsByTarget(this.getDraftContextItems(tabId), target);
    this.setDraftContextItems(nextItems, tabId);
  }

  private clearDraftContextItems(tabId: TabId | null = this.getActiveTabId()): void {
    this.setDraftContextItems([], tabId);
  }

  private areFocusContextPreviewsEqual(
    left: FocusContextPreview | null,
    right: FocusContextPreview | null,
  ): boolean {
    if (!left || !right) {
      return left === right;
    }

    return left.kind === right.kind
      && left.textSnapshot === right.textSnapshot
      && getContextTargetKey(left.path, left.lineRange) === getContextTargetKey(right.path, right.lineRange);
  }

  private isComposerInteractionFocused(): boolean {
    const activeElement = document.activeElement;
    return Boolean(activeElement && this.inputContainer?.contains(activeElement));
  }

  private markRetainedSelectionInputHandoff(): void {
    this.retainedSelectionInputHandoffGraceUntil = Date.now() + RETAINED_SELECTION_INPUT_HANDOFF_GRACE_MS;
  }

  private clearRetainedSelectionInputHandoff(): void {
    this.retainedSelectionInputHandoffGraceUntil = null;
  }

  private isRetainedSelectionInputHandoffActive(): boolean {
    return this.retainedSelectionInputHandoffGraceUntil !== null
      && Date.now() <= this.retainedSelectionInputHandoffGraceUntil;
  }

  private shouldRetainSelectionPreviewDuringTransition(): boolean {
    return this.isComposerInteractionFocused() || this.isRetainedSelectionInputHandoffActive();
  }

  private getRetainedSelectionCaptureQuality(retained: RetainedSelectionHighlight | null): number {
    if (!retained) {
      return 0;
    }

    if (retained.editorView && retained.from !== null && retained.to !== null) {
      return 2;
    }

    if (retained.domRanges.length > 0) {
      return 1;
    }

    return 0;
  }

  private shouldPreserveExistingRetainedSelection(
    existing: RetainedSelectionHighlight | null,
    next: RetainedSelectionHighlight,
  ): boolean {
    if (!this.isComposerInteractionFocused()) {
      return false;
    }

    if (!existing || existing.path !== next.path) {
      return false;
    }

    return this.getRetainedSelectionCaptureQuality(existing) > this.getRetainedSelectionCaptureQuality(next);
  }

  private getCssHighlightRegistry():
    | { set: (name: string, highlight: unknown) => void; delete: (name: string) => void }
    | null {
    if (typeof CSS === 'undefined') {
      return null;
    }

    const cssWithHighlights = CSS as typeof CSS & {
      highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void };
    };
    return cssWithHighlights.highlights ?? null;
  }

  private createDomHighlight(ranges: Range[]): unknown | null {
    const HighlightCtor = (window as Window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }).Highlight;
    if (!HighlightCtor) {
      return null;
    }

    return new HighlightCtor(...ranges);
  }

  private cloneDocumentSelectionRanges(): Range[] {
    const selection = document.getSelection();
    if (!selection) {
      return [];
    }

    const ranges: Range[] = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index).cloneRange());
    }

    return ranges;
  }

  private clearRetainedDomSelectionHighlight(): void {
    this.getCssHighlightRegistry()?.delete(RETAINED_SELECTION_DOM_HIGHLIGHT_KEY);
  }

  private startRetainedSelectionPolling(): void {
    if (this.retainedSelectionPollIntervalId !== null) {
      return;
    }

    this.pollRetainedSelectionState();
    this.retainedSelectionPollIntervalId = window.setInterval(() => {
      this.pollRetainedSelectionState();
    }, RETAINED_SELECTION_POLL_INTERVAL_MS);
  }

  private stopRetainedSelectionPolling(): void {
    if (this.retainedSelectionPollIntervalId === null) {
      return;
    }

    window.clearInterval(this.retainedSelectionPollIntervalId);
    this.retainedSelectionPollIntervalId = null;
  }

  private pollRetainedSelectionState(): void {
    const view = this.getActiveMarkdownView();
    this.refreshActiveFocusContextPreview(view, view?.editor ?? null);
    this.refreshRetainedSelectionHighlight();
  }

  private primeRetainedSelectionHighlightFromActiveEditor(): void {
    const view = this.getActiveMarkdownView();
    this.refreshActiveFocusContextPreview(view, view?.editor ?? null);
  }

  private getEditorView(editor: Editor | null): EditorView | null {
    return (editor as unknown as { cm?: EditorView | null })?.cm ?? null;
  }

  private getEditorSelectionOffsets(
    editor: Editor | null,
    editorView: EditorView | null,
  ): { from: number; to: number } | null {
    if (editor) {
      const editorWithOffsets = editor as Editor & {
        posToOffset?: (position: { line: number; ch: number }) => number;
      };
      if (typeof editorWithOffsets.posToOffset === 'function') {
        try {
          return {
            from: editorWithOffsets.posToOffset(editor.getCursor('from')),
            to: editorWithOffsets.posToOffset(editor.getCursor('to')),
          };
        } catch (error) {
          logger.debug('Failed to resolve editor offsets for retained selection highlight', error);
        }
      }
    }

    const selection = editorView?.state.selection.main;
    if (!selection || selection.empty) {
      return null;
    }

    return {
      from: selection.from,
      to: selection.to,
    };
  }

  private setRetainedSelectionHighlight(next: RetainedSelectionHighlight | null): void {
    const current = this.retainedSelectionHighlight;
    if (next && this.shouldPreserveExistingRetainedSelection(current, next)) {
      return;
    }

    if (current && (!next
      || current.editorView !== next.editorView
      || current.from !== next.from
      || current.to !== next.to)) {
      if (current.editorView) {
        hideSelectionHighlight(current.editorView);
      }
    }

    this.retainedSelectionHighlight = next;
  }

  private clearRetainedSelectionHighlight(): void {
    if (!this.retainedSelectionHighlight) {
      return;
    }

    if (this.retainedSelectionHighlight.editorView) {
      hideSelectionHighlight(this.retainedSelectionHighlight.editorView);
    }
    this.clearRetainedDomSelectionHighlight();
    this.retainedSelectionHighlight = null;
  }

  private refreshRetainedSelectionHighlight(): void {
    const retained = this.retainedSelectionHighlight;
    if (!retained) {
      return;
    }

    const focusPreview = this.getFocusContextPreview();
    const shouldShow = this.isComposerInteractionFocused()
      && focusPreview?.kind === 'selection'
      && focusPreview.path === retained.path;

    if (shouldShow) {
      if (
        retained.editorView
        && retained.from !== null
        && retained.to !== null
      ) {
        this.clearRetainedDomSelectionHighlight();
        showSelectionHighlight(retained.editorView, retained.from, retained.to);
        return;
      }

      const validDomRanges = retained.domRanges.filter((range) => range.startContainer.isConnected && range.endContainer.isConnected);
      const domHighlight = validDomRanges.length > 0
        ? this.createDomHighlight(validDomRanges)
        : null;
      if (domHighlight) {
        this.getCssHighlightRegistry()?.set(RETAINED_SELECTION_DOM_HIGHLIGHT_KEY, domHighlight);
      } else {
        this.clearRetainedDomSelectionHighlight();
      }
      return;
    }

    if (retained.editorView) {
      hideSelectionHighlight(retained.editorView);
    }
    this.clearRetainedDomSelectionHighlight();
  }

  private syncRetainedSelectionHighlight(
    actualPreview: FocusContextPreview | null,
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void {
    const composerFocused = this.isComposerInteractionFocused();
    if (actualPreview?.kind === 'selection') {
      const activeEditor = editor ?? view?.editor ?? null;
      const editorView = this.getEditorView(activeEditor);
      const offsets = this.getEditorSelectionOffsets(activeEditor, editorView);
      const domRanges = this.cloneDocumentSelectionRanges();
      if (offsets || domRanges.length > 0) {
        const captureSource: RetainedSelectionHighlight['captureSource'] = offsets && domRanges.length > 0
          ? 'mixed'
          : offsets
            ? 'offsets'
            : 'dom';
        this.setRetainedSelectionHighlight({
          path: actualPreview.path,
          editorView: editorView ?? null,
          from: offsets?.from ?? null,
          to: offsets?.to ?? null,
          domRanges,
          captureSource,
        });
      } else if (!composerFocused) {
        this.clearRetainedSelectionHighlight();
      }
    } else if (
      !this.shouldRetainSelectionPreviewDuringTransition()
      || !actualPreview
      || actualPreview.path !== this.retainedSelectionHighlight?.path
    ) {
      this.clearRetainedSelectionHighlight();
    }

    this.refreshRetainedSelectionHighlight();
  }

  private subscribeToSessionTodoUpdates(): void {
    this.disposeSessionTodoSubscription?.();
    this.disposeSessionTodoSubscription = this.plugin.openCodeService.subscribeToSessionTodoUpdates(
      ({ sessionId, todos }) => {
        this.applySessionTodoUpdate(sessionId, todos);
      },
    );
  }

  private subscribeToSessionStatusUpdates(): void {
    this.disposeSessionStatusSubscription?.();
    this.disposeSessionStatusSubscription = this.plugin.openCodeService.subscribeToSessionStatusUpdates(
      ({ sessionId, status }) => {
        this.applySessionStatusUpdate(sessionId, status);
      },
    );
  }

  private subscribeToSessionSyncEvents(): void {
    this.disposeSessionSyncEventSubscription?.();
    this.disposeSessionSyncEventSubscription = this.plugin.openCodeService.subscribeToSessionSyncEvents(
      (update) => {
        void this.applySessionSyncEventUpdate(update);
      },
    );
  }

  private applySessionTodoUpdate(sessionId: string, todos: SessionTodo[]): void {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    const conversations = new Map(this.plugin.getConversations().map((conversation) => [conversation.id, conversation]));
    let matched = false;

    for (const tab of tabs) {
      const conversation = tab.conversationId ? conversations.get(tab.conversationId) : null;
      if (conversation?.openCodeSessionId !== sessionId) {
        continue;
      }

      this.setTabSessionTodos(tab.id, todos, sessionId);
      this.reconcileBackgroundTaskStateFromLiveSignals(tab.id);
      matched = true;
    }

    if (!matched && this.currentConversation?.openCodeSessionId === sessionId) {
      this.setTabSessionTodos(this.getActiveTabId(), todos, sessionId);
      this.reconcileBackgroundTaskStateFromLiveSignals(this.getActiveTabId());
    }
  }

  private applySessionStatusUpdate(sessionId: string, status: SessionActivityStatus): void {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    const conversations = new Map(this.plugin.getConversations().map((conversation) => [conversation.id, conversation]));
    let matched = false;

    for (const tab of tabs) {
      const conversation = tab.conversationId ? conversations.get(tab.conversationId) : null;
      if (conversation?.openCodeSessionId !== sessionId) {
        continue;
      }

      this.setTabSessionStatus(tab.id, status, sessionId);
      this.reconcileBackgroundTaskStateFromLiveSignals(tab.id);
      matched = true;
    }

    if (!matched && this.currentConversation?.openCodeSessionId === sessionId) {
      this.setTabSessionStatus(this.getActiveTabId(), status, sessionId);
      this.reconcileBackgroundTaskStateFromLiveSignals(this.getActiveTabId());
    }
  }

  private getTabIdsForSession(sessionId: string): TabId[] {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    const conversations = new Map(this.plugin.getConversations().map((conversation) => [conversation.id, conversation]));

    return tabs
      .filter((tab) => {
        const conversation = tab.conversationId ? conversations.get(tab.conversationId) : null;
        return conversation?.openCodeSessionId === sessionId;
      })
      .map((tab) => tab.id);
  }

  private async applySessionSyncEventUpdate(update: SessionSyncEventUpdate): Promise<void> {
    const matchedTabIds = this.getTabIdsForSession(update.sessionId);
    const activeTabId = this.getActiveTabId();
    if (
      matchedTabIds.length === 0
      && this.currentConversation?.openCodeSessionId === update.sessionId
      && activeTabId
    ) {
      matchedTabIds.push(activeTabId);
    }

    for (const tabId of matchedTabIds) {
      const runtime = this.getTabRuntimeState(tabId);
      if (!runtime) {
        continue;
      }

      if (update.type === 'message.updated' || update.type === 'message.part.updated' || update.type === 'session.diff') {
        this.scheduleConversationSyncFromSignal(tabId, update.type);
      }
    }
  }

  private getTabSessionTodos(
    tabId: TabId | null = this.getActiveTabId(),
    sessionId = this.currentConversation?.openCodeSessionId ?? null,
  ): SessionTodo[] {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return [];
    }

    if (sessionId && runtime.sessionTodoSessionId && runtime.sessionTodoSessionId !== sessionId) {
      return [];
    }

    return [...runtime.sessionTodos];
  }

  private setTabSessionTodos(
    tabId: TabId | null,
    todos: SessionTodo[],
    sessionId: string | null = this.currentConversation?.openCodeSessionId ?? null,
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.sessionTodoSessionId = sessionId;
    const normalizedTodos = this.normalizeSessionTodosForView(todos);
    const fingerprint = this.getSessionTodoFingerprint(normalizedTodos);
    if (runtime.sessionTodoFingerprint !== fingerprint) {
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
        runtime.sessionTodoSuppressedFingerprint = null;
        runtime.sessionTodoStaleNoticeFingerprint = null;
      }
    }

    if (!this.hasIncompleteTodos(normalizedTodos)) {
      runtime.sessionTodoSuppressedFingerprint = null;
      runtime.sessionTodoStaleNoticeFingerprint = null;
    } else {
      this.restorePersistedStaleSessionTodoSuppressionIfNeeded(
        tabId,
        sessionId,
        normalizedTodos,
        fingerprint,
      );
    }

    runtime.sessionTodos = this.shouldHideSuppressedTodoSnapshot(tabId, sessionId, fingerprint)
      ? []
      : normalizedTodos;
    if (tabId === this.getActiveTabId()) {
      this.renderSessionTodoDock(tabId);
    }
    this.reconcileStaleSessionTodoState(tabId);
  }

  private getTabSessionStatus(
    tabId: TabId | null = this.getActiveTabId(),
    sessionId = this.currentConversation?.openCodeSessionId ?? null,
  ): SessionActivityStatus | null {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return null;
    }

    if (sessionId && runtime.sessionStatusSessionId && runtime.sessionStatusSessionId !== sessionId) {
      return null;
    }

    return runtime.sessionStatus;
  }

  private setTabSessionStatus(
    tabId: TabId | null,
    status: SessionActivityStatus | null,
    sessionId: string | null = this.currentConversation?.openCodeSessionId ?? null,
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
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
      runtime.sessionTodoSuppressedFingerprint = null;
      runtime.sessionTodoStaleNoticeFingerprint = null;
      if (tabId === this.getActiveTabId()) {
        this.renderSessionTodoDock(tabId);
      }
    }

    this.reconcileStaleSessionTodoState(tabId);
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

  private restorePersistedStaleSessionTodoSuppressionIfNeeded(
    tabId: TabId | null,
    sessionId: string | null,
    todos: SessionTodo[],
    fingerprint: string,
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (
      !runtime
      || !sessionId
      || runtime.isStreaming
      || runtime.sessionTodoSuppressedFingerprint
      || !this.hasIncompleteTodos(todos)
      || this.isSessionStatusLive(this.getTabSessionStatus(tabId, sessionId))
    ) {
      return;
    }

    const conversation = this.getConversationForTab(tabId);
    if (!conversation || conversation.openCodeSessionId !== sessionId) {
      return;
    }

    const content = this.buildStaleSessionTodoNoticeContent(todos);
    if (!this.hasMatchingPersistentAssistantNoticeMessage(
      t('chat.todo.staleTitle'),
      content,
      'warning',
      conversation,
    )) {
      return;
    }

    runtime.sessionTodoSuppressedFingerprint = fingerprint;
    runtime.sessionTodoStaleNoticeFingerprint = content;
    logger.debug(`Restored stale session todo suppression from persisted notice: ${this.stringifyLogPayload({
      tabId,
      sessionId,
      fingerprint,
    })}`);
  }

  private shouldHideSuppressedTodoSnapshot(
    tabId: TabId | null,
    sessionId: string | null,
    fingerprint: string,
  ): boolean {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || runtime.sessionTodoSuppressedFingerprint !== fingerprint) {
      return false;
    }

    const status = this.getTabSessionStatus(tabId, sessionId);
    return !runtime.isStreaming && !this.isSessionStatusLive(status);
  }

  private getTabSessionTodoStaleAgeMs(tabId: TabId | null = this.getActiveTabId()): number | null {
    const runtime = this.getTabRuntimeState(tabId);
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

  private suppressStaleSessionTodosIfNeeded(
    tabId: TabId | null = this.getActiveTabId(),
  ): SessionTodo[] | null {
    const runtime = this.getTabRuntimeState(tabId);
    const sessionId = this.getSessionIdForTab(tabId);
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

    runtime.sessionTodoSuppressedFingerprint = fingerprint;
    runtime.sessionTodos = [];
    if (tabId === this.getActiveTabId()) {
      this.renderSessionTodoDock(tabId);
    }

    logger.debug(`Suppressing stale session todos after prolonged inactivity: ${this.stringifyLogPayload({
      tabId,
      sessionId,
      staleAgeMs,
      todoCount: visibleTodos.length,
      status,
      todos: visibleTodos.map((todo) => ({
        id: todo.id ?? null,
        status: todo.status,
        content: this.getLogPreview(todo.content, 120),
      })),
    })}`);

    return visibleTodos;
  }

  private reconcileStaleSessionTodoState(tabId: TabId | null = this.getActiveTabId()): void {
    const staleTodos = this.suppressStaleSessionTodosIfNeeded(tabId);
    if (staleTodos && staleTodos.length > 0) {
      void this.appendStaleSessionTodoNotice(tabId, staleTodos);
    }
  }

  private normalizeSessionTodosForView(todos: readonly SessionTodo[] | unknown[]): SessionTodo[] {
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

  private extractSessionTodosFromToolInput(input: Record<string, unknown>): SessionTodo[] {
    const rawTodos = Array.isArray(input.todos) ? input.todos : [];
    return this.normalizeSessionTodosForView(rawTodos);
  }

  private applyStreamingTodoSnapshotFromTool(
    toolCall: ToolCallInfo,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    if (toolCall.name !== 'todowrite') {
      return;
    }

    const todos = this.extractSessionTodosFromToolInput(toolCall.input ?? {});
    if (todos.length === 0) {
      return;
    }

    const sessionId = this.getSessionIdForTab(tabId);
    if (!sessionId) {
      return;
    }

    this.setTabSessionTodos(tabId, todos, sessionId);
  }

  private renderSessionTodoDock(tabId: TabId | null = this.getActiveTabId()): void {
    const activeSessionId = tabId === this.getActiveTabId()
      ? (this.currentConversation?.openCodeSessionId ?? null)
      : this.getTabRuntimeState(tabId)?.sessionTodoSessionId ?? null;
    this.sessionTodoDock?.update(this.getTabSessionTodos(tabId, activeSessionId));
  }

  private async refreshActiveSessionTodos(options: { suppressErrors?: boolean } = {}): Promise<SessionTodo[]> {
    return this.refreshTabSessionTodos(this.getActiveTabId(), this.currentConversation?.openCodeSessionId, options);
  }

  private async refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionTodo[]> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.renderSessionTodoDock(tabId);
      return [];
    }

    const requestId = runtime.todoRequestId + 1;
    runtime.todoRequestId = requestId;

    try {
      const todos = await this.plugin.openCodeService.getSessionTodos(sessionId);
      const latestRuntime = this.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.todoRequestId !== requestId) {
        return this.getTabSessionTodos(tabId);
      }

      this.setTabSessionTodos(tabId, todos, sessionId);
      this.reconcileBackgroundTaskStateFromLiveSignals(tabId);
      return todos;
    } catch (error) {
      logger.debug('Failed to refresh session todos', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.getTabSessionTodos(tabId);
    }
  }

  private async refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionActivityStatus | null> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.setTabSessionStatus(tabId, null, sessionId ?? null);
      return null;
    }

    const requestId = runtime.statusRequestId + 1;
    runtime.statusRequestId = requestId;

    try {
      const statuses = await this.plugin.openCodeService.getSessionStatuses();
      const latestRuntime = this.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.statusRequestId !== requestId) {
        return this.getTabSessionStatus(tabId, sessionId);
      }

      const status = statuses[sessionId] ?? { type: 'idle' as const };
      this.setTabSessionStatus(tabId, status, sessionId);
      this.reconcileBackgroundTaskStateFromLiveSignals(tabId);
      return status;
    } catch (error) {
      logger.debug('Failed to refresh session status', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.getTabSessionStatus(tabId, sessionId);
    }
  }

  private hasIncompleteTodos(todos: readonly SessionTodo[]): boolean {
    return todos.some((todo) => todo.status !== 'completed' && todo.status !== 'cancelled');
  }

  private hasIncompleteTabSessionTodos(tabId: TabId | null = this.getActiveTabId()): boolean {
    return this.hasIncompleteTodos(this.getTabSessionTodos(tabId, this.getSessionIdForTab(tabId)));
  }

  private isTabSessionLive(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    if (runtime.isStreaming) {
      return true;
    }

    const status = this.getTabSessionStatus(tabId, this.getSessionIdForTab(tabId));
    return status?.type === 'busy' || status?.type === 'retry';
  }

  private isBackgroundTaskGracePeriodActive(tabId: TabId | null = this.getActiveTabId()): boolean {
    const startedAt = this.getTabRuntimeState(tabId)?.backgroundTaskStartedAt;
    return typeof startedAt === 'number' && Date.now() - startedAt < BACKGROUND_TASK_GRACE_PERIOD_MS;
  }

  private beginConversationHydration(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.isHydratingConversation = true;
    runtime.pendingLayoutMutations = 0;
    runtime.backgroundTaskAwaitingAuthoritativeSync = true;
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
    const runtime = this.getTabRuntimeState(tabId);
    if (
      !runtime
      || runtime.isHydratingConversation
      || !runtime.backgroundTaskAwaitingAuthoritativeSync
    ) {
      return;
    }

    runtime.backgroundTaskAwaitingAuthoritativeSync = false;
    runtime.backgroundTaskLastAuthoritativeSyncAt = Date.now();
    logger.debug('Background task authoritative sync ready', {
      tabId,
      sessionId: this.getSessionIdForTab(tabId),
      reason,
    });
  }

  private reconcileBackgroundTaskStateFromLiveSignals(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || runtime.isStreaming || !runtime.backgroundTaskStartedAt) {
      return;
    }

    this.reconcileStaleSessionTodoState(tabId);

    if (runtime.isHydratingConversation || runtime.backgroundTaskAwaitingAuthoritativeSync) {
      this.syncTabStreamLikeState(tabId);
      return;
    }

    const status = this.getTabSessionStatus(tabId, this.getSessionIdForTab(tabId));
    if (status?.type === 'busy' || status?.type === 'retry') {
      runtime.backgroundTaskWaitingForFollowUp = runtime.backgroundTaskLaunches.size > 0;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    if (status?.type !== 'idle' && this.hasIncompleteTabSessionTodos(tabId)) {
      runtime.backgroundTaskWaitingForFollowUp = runtime.backgroundTaskLaunches.size > 0;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    if (this.isBackgroundTaskGracePeriodActive(tabId)) {
      this.syncTabStreamLikeState(tabId);
      return;
    }

    if (runtime.backgroundTaskLaunches.size === 0) {
      if (runtime.backgroundTaskModeTag === 'search-mode') {
        this.resetBackgroundTaskIndicator(tabId);
      }
      return;
    }

    const stalePending = this.getPendingBackgroundTaskLaunches(tabId);
    if (stalePending.length > 0) {
      runtime.backgroundTaskSuppressedFingerprint = this.buildBackgroundTaskStoppedNoticeContent(stalePending);
      void this.appendBackgroundTaskStoppedNotice(tabId, stalePending);
    }
    logger.debug('Clearing stale background task indicator after session became idle without incomplete todos', {
      tabId,
      sessionId: this.getSessionIdForTab(tabId),
      launchCount: runtime.backgroundTaskLaunches.size,
    });
    this.resetBackgroundTaskIndicator(tabId);
  }

  private async appendBackgroundTaskStoppedNotice(
    tabId: TabId | null,
    pending: BackgroundTaskLaunchInfo[],
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !tabId || tabId !== this.getActiveTabId() || !this.currentConversation) {
      return;
    }

    const sessionId = this.getSessionIdForTab(tabId);
    if (!sessionId || sessionId !== this.currentConversation.openCodeSessionId) {
      return;
    }

    const title = t('chat.backgroundTask.staleTitle');
    const content = this.buildBackgroundTaskStoppedNoticeContent(pending);
    if (runtime.backgroundTaskStaleNoticeFingerprint === content) {
      runtime.backgroundTaskSuppressedFingerprint = content;
      return;
    }

    if (this.hasMatchingPersistentAssistantNoticeMessage(title, content, 'warning')) {
      runtime.backgroundTaskStaleNoticeFingerprint = content;
      runtime.backgroundTaskSuppressedFingerprint = content;
      return;
    }

    runtime.backgroundTaskStaleNoticeFingerprint = content;
    runtime.backgroundTaskSuppressedFingerprint = content;
    try {
      await this.appendPersistentAssistantNoticeMessage(title, content, 'warning');
    } catch (error) {
      if (runtime.backgroundTaskStaleNoticeFingerprint === content) {
        runtime.backgroundTaskStaleNoticeFingerprint = null;
      }
      if (runtime.backgroundTaskSuppressedFingerprint === content) {
        runtime.backgroundTaskSuppressedFingerprint = null;
      }
      logger.warn('Failed to append stale background task notice', error);
    }
  }

  private buildBackgroundTaskStoppedNoticeContent(pending: BackgroundTaskLaunchInfo[]): string {
    const sortedPending = [...pending].sort((left, right) => {
      const leftId = this.getBackgroundTaskLaunchDisplayId(left);
      const rightId = this.getBackgroundTaskLaunchDisplayId(right);
      return leftId.localeCompare(rightId) || left.description.localeCompare(right.description);
    });

    return [
      t('chat.backgroundTask.staleBody'),
      '',
      `**${t('chat.backgroundTask.taskListLabel')}**`,
      ...sortedPending.map((task) =>
        `- ${t('chat.backgroundTask.taskStatusStopped')} · \`${this.getBackgroundTaskLaunchDisplayId(task)}\`: ${task.description}`,
      ),
    ].join('\n');
  }

  private hasPersistedBackgroundTaskStoppedNoticeForPending(
    pending: BackgroundTaskLaunchInfo[],
    conversation: Conversation | null = this.currentConversation,
  ): boolean {
    return this.hasMatchingPersistentAssistantNoticeMessage(
      t('chat.backgroundTask.staleTitle'),
      this.buildBackgroundTaskStoppedNoticeContent(pending),
      'warning',
      conversation,
    );
  }

  private isSuppressedBackgroundTaskSegment(
    segment: BackgroundTaskSegment,
    tabId: TabId | null = this.getActiveTabId(),
    conversation: Conversation | null = this.currentConversation,
  ): boolean {
    if (segment.pending.length === 0) {
      return false;
    }

    const fingerprint = this.buildBackgroundTaskStoppedNoticeContent(segment.pending);
    const runtime = this.getTabRuntimeState(tabId);
    if (runtime?.backgroundTaskSuppressedFingerprint === fingerprint) {
      return true;
    }

    return this.hasPersistedBackgroundTaskStoppedNoticeForPending(segment.pending, conversation);
  }

  private async appendStaleSessionTodoNotice(
    tabId: TabId | null,
    todos: SessionTodo[],
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !tabId || tabId !== this.getActiveTabId() || !this.currentConversation) {
      return;
    }

    const sessionId = this.getSessionIdForTab(tabId);
    if (!sessionId || sessionId !== this.currentConversation.openCodeSessionId) {
      return;
    }

    const title = t('chat.todo.staleTitle');
    const content = this.buildStaleSessionTodoNoticeContent(todos);
    if (runtime.sessionTodoStaleNoticeFingerprint === content) {
      return;
    }

    if (this.hasMatchingPersistentAssistantNoticeMessage(title, content, 'warning')) {
      runtime.sessionTodoStaleNoticeFingerprint = content;
      return;
    }

    runtime.sessionTodoStaleNoticeFingerprint = content;
    try {
      await this.appendPersistentAssistantNoticeMessage(title, content, 'warning');
    } catch (error) {
      if (runtime.sessionTodoStaleNoticeFingerprint === content) {
        runtime.sessionTodoStaleNoticeFingerprint = null;
      }
      logger.warn('Failed to append stale session todo notice', error);
    }
  }

  private buildStaleSessionTodoNoticeContent(todos: SessionTodo[]): string {
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

  private hasMatchingPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation: Conversation | null = this.currentConversation,
  ): boolean {
    return conversation?.messages.some((message) =>
      message.role === 'assistant'
      && message.displayStyle === 'notice'
      && message.noticeTitle === title
      && message.noticeTone === tone
      && message.content === content,
    ) ?? false;
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
    this.startRetainedSelectionPolling();
    this.subscribeToSessionTodoUpdates();
    this.subscribeToSessionStatusUpdates();
    this.subscribeToSessionSyncEvents();

    await this.initializeFirstTab();
  }

  async onClose() {
    this.persistTabState({ flush: true });
    this.stopServerStatusLoop();
    this.stopConversationSyncLoop();
    this.stopRetainedSelectionPolling();
    this.clearScheduledFocusContextPreviewRefresh();
    this.clearRetainedSelectionInputHandoff();
    this.clearRetainedSelectionHighlight();
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
    this.composerContextRowEl = null;
    this.addContextBtn = null;
    this.sendBtn = null;
    this.inputTextarea = null;
    this.questionDock?.destroy();
    this.questionDock = null;
    this.questionDockMountEl = null;
    this.sessionTodoDock?.destroy();
    this.sessionTodoDock = null;
    this.todoDockMountEl = null;
    this.disposeSessionTodoSubscription?.();
    this.disposeSessionTodoSubscription = null;
    this.disposeSessionStatusSubscription?.();
    this.disposeSessionStatusSubscription = null;
    this.disposeSessionSyncEventSubscription?.();
    this.disposeSessionSyncEventSubscription = null;
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

    const nearBottom = this.isNearBottomForElement(messagesEl);
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

    await this.plugin.loadConversations();

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

  private hasTabBackgroundTaskIndicator(tabId: TabId | null): boolean {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime?.backgroundTaskStartedAt) {
      return false;
    }

    const status = this.getTabSessionStatus(tabId, this.getSessionIdForTab(tabId));
    const pending = this.getPendingBackgroundTaskLaunches(tabId);
    if (pending.length > 0) {
      if (status?.type === 'idle') {
        return this.isBackgroundTaskGracePeriodActive(tabId);
      }

      return this.isTabSessionLive(tabId)
        || this.hasIncompleteTabSessionTodos(tabId)
        || this.isBackgroundTaskGracePeriodActive(tabId);
    }

    return runtime.backgroundTaskModeTag === 'search-mode' && (
      runtime.isStreaming || this.isBackgroundTaskGracePeriodActive(tabId)
    );
  }

  private isTabForegroundBusy(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    if (runtime.isStreaming) {
      return true;
    }

    const status = this.getTabSessionStatus(tabId, this.getSessionIdForTab(tabId));
    return status?.type === 'busy' || status?.type === 'retry';
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
      Boolean(runtime && this.hasTabBackgroundTaskIndicator(tabId)),
    );
    this.syncTabUserMessageActionButtons(tabId);

    if (tabId === this.getActiveTabId()) {
      this.updateSendButtonState();
    }
  }

  private syncTabUserMessageActionButtons(tabId: TabId | null): void {
    const pane = this.getTabPaneState(tabId);
    if (!pane) {
      return;
    }

    syncUserMessageStreamingActionState(
      pane.messagesEl,
      Boolean(this.getTabRuntimeState(tabId)?.isStreaming),
    );
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

    if (this.isTabForegroundBusy(tabId)) {
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
    this.refreshActiveFocusContextPreview();
    this.renderQuestionDock();
    this.sessionTodoDock?.update(
      this.getTabSessionTodos(tabId, this.getTabRuntimeState(tabId)?.sessionTodoSessionId ?? null),
    );

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
        this.renderSessionTodoDock(tabId);
        this.renderQuestionDock();
        void this.refreshTabSessionStatus(tabId, conversation.openCodeSessionId, { suppressErrors: true });
        void this.refreshPendingQuestionsForTab(tabId, conversation.openCodeSessionId);
        void this.refreshTabSessionTodos(tabId, conversation.openCodeSessionId, { suppressErrors: true });
        this.updateSendButtonState();
        return;
      }

      await this.loadConversation(tab.conversationId, {
        preserveScrollPosition: true,
      });
      return;
    }

    this.currentConversation = null;
    this.stopConversationSyncLoop();
    this.messagesContainer?.empty();
    this.resetTurnState();
    this.setTabSessionTodos(tabId, [], null);
    this.setTabSessionStatus(tabId, null, null);
    this.clearPendingQuestionsForTab(tabId);
    this.renderSessionTodoDock(tabId);
    this.renderQuestionDock();
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
    this.renderQuestionDock();
    this.renderTabBar();
  }

  public refreshQuestionUi(): void {
    this.renderQuestionDock();
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
    this.todoDockMountEl = container.createDiv({ cls: 'opencodian-session-todo-slot' });
    this.sessionTodoDock = new SessionTodoDock(this.todoDockMountEl);

    this.questionDockMountEl = container.createDiv({ cls: 'opencodian-question-dock-slot' });
    this.questionDock = new QuestionDock(this.questionDockMountEl);
    this.renderQuestionDock();

    const composerShellEl = container.createDiv({ cls: 'opencodian-composer-shell' });
    this.composerShellEl = composerShellEl;

    const inputWrapper = composerShellEl.createDiv({ cls: 'opencodian-input-wrapper' });
    this.inputWrapperEl = inputWrapper;
    const composerContentEl = inputWrapper.createDiv({ cls: 'opencodian-composer-content' });
    this.composerContextRowEl = composerContentEl.createDiv({ cls: 'opencodian-composer-context-row is-empty' });
    this.renderComposerContextChips();

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
      void this.addChosenFileContextToActiveTab();
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

  private renderComposerContextChips(): void {
    if (!this.composerContextRowEl) {
      return;
    }

    const chipStates = buildComposerContextChipStates(
      this.getDraftContextItems(),
      this.getFocusContextPreview(),
    );

    this.composerContextRowEl.empty();
    this.composerContextRowEl.toggleClass('is-empty', chipStates.length === 0);
    if (chipStates.length === 0) {
      return;
    }

    for (const chipState of chipStates) {
      const chipEl = this.composerContextRowEl.createEl('button', {
        cls: 'opencodian-composer-context-chip',
        text: chipState.label,
        attr: {
          type: 'button',
          title: chipState.path,
          'aria-pressed': String(chipState.attached),
        },
      });

      if (chipState.preview) {
        chipEl.addClass('is-preview');
      } else {
        chipEl.addClass('is-attached');
      }
      if (chipState.lineRange) {
        chipEl.addClass('is-selection');
      }

      chipEl.addEventListener('click', () => {
        void this.handleComposerContextChipClick(chipState);
      });
    }
  }

  private async handleComposerContextChipClick(
    chipState: ReturnType<typeof buildComposerContextChipStates>[number],
  ): Promise<void> {
    if (chipState.attached) {
      this.removeDraftContextItemsForTarget(chipState);
      return;
    }

    const focusPreview = this.getFocusContextPreview();
    if (!focusPreview) {
      return;
    }

    if (getContextTargetKey(focusPreview.path, focusPreview.lineRange) !== chipState.key) {
      this.refreshActiveFocusContextPreview();
      return;
    }

    await this.attachFocusContextPreview(focusPreview);
  }

  private async attachFocusContextPreview(preview: FocusContextPreview): Promise<void> {
    if (preview.kind === 'selection') {
      const contextItem = this.buildSelectionContextItemFromPreview(preview);
      if (contextItem) {
        this.addDraftContextItem(contextItem);
      }
      return;
    }

    const targetFile = this.app.vault.getAbstractFileByPath(preview.path);
    if (!(targetFile instanceof TFile)) {
      new Notice(t('chat.context.notice.noActiveNote'));
      this.refreshActiveFocusContextPreview();
      return;
    }

    const contextItem = await this.buildFileContextItem(targetFile, 'current_note');
    if (contextItem) {
      this.addDraftContextItem(contextItem);
    }
  }

  private shouldUseAboveInputQuestionDock(): boolean {
    return this.plugin.settings.questionCardPosition === 'above_input';
  }

  private shouldRenderQuestionResolutionCards(): boolean {
    return this.plugin.settings.showAnsweredQuestionCards;
  }

  private sanitizeQuestionAnswer(
    answer: readonly string[],
    request: QuestionRequest,
    questionIndex: number,
  ): string[] {
    const cleaned = answer
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (request.questions[questionIndex]?.multiple) {
      return [...new Set(cleaned)];
    }

    return cleaned.length > 0 ? [cleaned[0]] : [];
  }

  private getActivePendingQuestionRequest(tabId: TabId | null = this.getActiveTabId()): QuestionRequest | null {
    return this.getTabRuntimeState(tabId)?.pendingQuestionRequests[0] ?? null;
  }

  private getQuestionDraftAnswers(
    request: QuestionRequest,
    tabId: TabId | null = this.getActiveTabId(),
  ): string[][] {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return normalizeQuestionDraftAnswers(request.questions.length);
    }

    const normalized = normalizeQuestionDraftAnswers(
      request.questions.length,
      runtime.questionDraftAnswers.get(request.id),
    );
    runtime.questionDraftAnswers.set(request.id, normalized);
    return normalized;
  }

  private setQuestionDraftAnswer(
    request: QuestionRequest,
    questionIndex: number,
    answer: readonly string[],
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const nextAnswers = this.getQuestionDraftAnswers(request, tabId);
    nextAnswers[questionIndex] = this.sanitizeQuestionAnswer(answer, request, questionIndex);
    runtime.questionDraftAnswers.set(request.id, nextAnswers);
  }

  private getOrCreateQuestionWaiter(
    requestId: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): DeferredQuestionRequest | null {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return null;
    }

    const existing = runtime.questionRequestWaiters.get(requestId);
    if (existing) {
      return existing;
    }

    let resolve = () => {};
    const promise = new Promise<void>((resolver) => {
      resolve = resolver;
    });
    const waiter = { promise, resolve };
    runtime.questionRequestWaiters.set(requestId, waiter);
    return waiter;
  }

  private resolveQuestionWaiter(
    requestId: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    const waiter = runtime?.questionRequestWaiters.get(requestId);
    if (!waiter) {
      return;
    }

    waiter.resolve();
    runtime?.questionRequestWaiters.delete(requestId);
  }

  private enqueuePendingQuestionRequest(
    request: QuestionRequest,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.ensureTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (!runtime.pendingQuestionRequests.some((item) => item.id === request.id)) {
      runtime.pendingQuestionRequests = [...runtime.pendingQuestionRequests, request];
    }

    this.getQuestionDraftAnswers(request, tabId);

    const answers = this.getQuestionDraftAnswers(request, tabId);
    if (!runtime.questionActiveGroupKeys.has(request.id)) {
      const viewModel = buildQuestionDockViewModel(request, answers, {
        displayMode: this.plugin.settings.questionDisplayMode,
      });
      runtime.questionActiveGroupKeys.set(request.id, viewModel.activeGroupKey);
      runtime.questionActiveIndexes.set(request.id, viewModel.activeQuestionIndex);
    }

    if (tabId !== this.getActiveTabId()) {
      if (tabId) {
        this.tabManager?.setTabNeedsAttention(tabId, true);
      }
      return;
    }

    if (tabId) {
      this.tabManager?.setTabNeedsAttention(tabId, false);
    }
    this.renderQuestionDock();
  }

  private removePendingQuestionRequest(
    requestId: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.pendingQuestionRequests = runtime.pendingQuestionRequests.filter((request) => request.id !== requestId);
    runtime.questionDraftAnswers.delete(requestId);
    runtime.questionActiveGroupKeys.delete(requestId);
    runtime.questionActiveIndexes.delete(requestId);
    this.resolveQuestionWaiter(requestId, tabId);

    if (tabId === this.getActiveTabId()) {
      if (tabId) {
        this.tabManager?.setTabNeedsAttention(tabId, false);
      }
      this.renderQuestionDock();
      return;
    }

    if (tabId) {
      this.tabManager?.setTabNeedsAttention(tabId, runtime.pendingQuestionRequests.length > 0);
    }
  }

  private suppressResolvedQuestionRequest(
    requestId: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    runtime?.resolvedQuestionRequestIds.add(requestId);
  }

  private clearPendingQuestionsForTab(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.pendingQuestionRequests = [];
    runtime.resolvedQuestionRequestIds.clear();
    runtime.questionDraftAnswers.clear();
    runtime.questionActiveGroupKeys.clear();
    runtime.questionActiveIndexes.clear();
    runtime.questionRequestWaiters.clear();

    if (tabId) {
      this.tabManager?.setTabNeedsAttention(tabId, false);
    }

    if (tabId === this.getActiveTabId()) {
      this.renderQuestionDock();
    }
  }

  private async refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined = this.getSessionIdForTab(tabId),
  ): Promise<QuestionRequest[]> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.clearPendingQuestionsForTab(tabId);
      return [];
    }

    try {
      const pendingRequests = await this.plugin.openCodeService.getPendingQuestions();
      const sessionRequests = pendingRequests.filter((request) => request.sessionId === sessionId);
      const rawSessionRequestIds = new Set(sessionRequests.map((request) => request.id));
      const filteredSessionRequests = sessionRequests.filter(
        (request) => !runtime.resolvedQuestionRequestIds.has(request.id),
      );
      const waitingIds = new Set(runtime.questionRequestWaiters.keys());
      const mergedRequests = [...filteredSessionRequests];

      for (const existing of runtime.pendingQuestionRequests) {
        if (waitingIds.has(existing.id) && !mergedRequests.some((request) => request.id === existing.id)) {
          mergedRequests.push(existing);
        }
      }

      for (const requestId of [...runtime.resolvedQuestionRequestIds]) {
        if (!rawSessionRequestIds.has(requestId)) {
          runtime.resolvedQuestionRequestIds.delete(requestId);
        }
      }

      runtime.pendingQuestionRequests = mergedRequests;
      const activeRequestIds = new Set(mergedRequests.map((request) => request.id));

      for (const request of mergedRequests) {
        this.getQuestionDraftAnswers(request, tabId);
      }

      for (const requestId of [...runtime.questionDraftAnswers.keys()]) {
        if (!activeRequestIds.has(requestId)) {
          runtime.questionDraftAnswers.delete(requestId);
        }
      }
      for (const requestId of [...runtime.questionActiveGroupKeys.keys()]) {
        if (!activeRequestIds.has(requestId)) {
          runtime.questionActiveGroupKeys.delete(requestId);
        }
      }
      for (const requestId of [...runtime.questionActiveIndexes.keys()]) {
        if (!activeRequestIds.has(requestId)) {
          runtime.questionActiveIndexes.delete(requestId);
        }
      }

      if (tabId === this.getActiveTabId()) {
        if (tabId) {
          this.tabManager?.setTabNeedsAttention(tabId, false);
        }
        this.renderQuestionDock();
      } else {
        if (tabId) {
          this.tabManager?.setTabNeedsAttention(tabId, mergedRequests.length > 0);
        }
      }

      return mergedRequests;
    } catch (error) {
      logger.debug('Failed to refresh pending questions', error);
      return runtime.pendingQuestionRequests;
    }
  }

  private renderQuestionDock(): void {
    if (!this.questionDock) {
      return;
    }

    if (!this.shouldUseAboveInputQuestionDock()) {
      this.questionDock.render({
        request: null,
        answers: [],
        displayMode: this.plugin.settings.questionDisplayMode,
      }, {
        onAnswerChange: () => {},
        onSelectGroup: () => {},
        onSelectQuestion: () => {},
        onSubmit: () => {},
        onReject: () => {},
        onClose: () => {},
      });
      return;
    }

    const activeTabId = this.getActiveTabId();
    const activeRequest = this.getActivePendingQuestionRequest(activeTabId);
    const activeSessionId = this.currentConversation?.openCodeSessionId ?? null;

    if (!activeTabId || !activeRequest || activeRequest.sessionId !== activeSessionId) {
      this.questionDock.render({
        request: null,
        answers: [],
        displayMode: this.plugin.settings.questionDisplayMode,
      }, {
        onAnswerChange: () => {},
        onSelectGroup: () => {},
        onSelectQuestion: () => {},
        onSubmit: () => {},
        onReject: () => {},
        onClose: () => {},
      });
      return;
    }

    const runtime = this.getTabRuntimeState(activeTabId);
    if (!runtime) {
      return;
    }

    const answers = this.getQuestionDraftAnswers(activeRequest, activeTabId);
    const viewModel = buildQuestionDockViewModel(activeRequest, answers, {
      activeGroupKey: runtime.questionActiveGroupKeys.get(activeRequest.id),
      activeQuestionIndex: runtime.questionActiveIndexes.get(activeRequest.id),
      displayMode: this.plugin.settings.questionDisplayMode,
    });
    runtime.questionActiveGroupKeys.set(activeRequest.id, viewModel.activeGroupKey);
    runtime.questionActiveIndexes.set(activeRequest.id, viewModel.activeQuestionIndex);

    this.questionDock.render({
      request: activeRequest,
      answers,
      displayMode: this.plugin.settings.questionDisplayMode,
      activeGroupKey: viewModel.activeGroupKey,
      activeQuestionIndex: viewModel.activeQuestionIndex,
    }, {
      onAnswerChange: (questionIndex, answer) => {
        this.setQuestionDraftAnswer(activeRequest, questionIndex, answer, activeTabId);
      },
      onSelectGroup: (groupKey) => {
        const nextAnswers = this.getQuestionDraftAnswers(activeRequest, activeTabId);
        runtime.questionActiveGroupKeys.set(activeRequest.id, groupKey);
        runtime.questionActiveIndexes.set(
          activeRequest.id,
          getPreferredQuestionIndexForGroup(activeRequest, nextAnswers, groupKey),
        );
        this.renderQuestionDock();
      },
      onSelectQuestion: (questionIndex) => {
        const nextViewModel = buildQuestionDockViewModel(
          activeRequest,
          this.getQuestionDraftAnswers(activeRequest, activeTabId),
          {
            activeQuestionIndex: questionIndex,
            displayMode: this.plugin.settings.questionDisplayMode,
          },
        );
        runtime.questionActiveGroupKeys.set(activeRequest.id, nextViewModel.activeGroupKey);
        runtime.questionActiveIndexes.set(activeRequest.id, nextViewModel.activeQuestionIndex);
        this.renderQuestionDock();
      },
      onSubmit: () => {
        void this.handleQuestionDockSubmit(activeTabId);
      },
      onReject: () => {
        void this.handleQuestionDockReject(activeTabId);
      },
      onClose: () => {
        void this.handleQuestionDockReject(activeTabId);
      },
    });
  }

  private async handleQuestionDockSubmit(tabId: TabId | null = this.getActiveTabId()): Promise<void> {
    const request = this.getActivePendingQuestionRequest(tabId);
    if (!request) {
      return;
    }

    const answers = this.getQuestionDraftAnswers(request, tabId).map((answer, index) =>
      this.sanitizeQuestionAnswer(answer, request, index),
    );
    const hasEmptyAnswer = request.questions.some((question, index) =>
      !isQuestionAnswerComplete(question, answers[index]),
    );
    if (hasEmptyAnswer) {
      new Notice(t('chat.question.answerRequired'));
      return;
    }

    try {
      await this.plugin.openCodeService.replyToQuestion(request.id, answers);
      this.suppressResolvedQuestionRequest(request.id, tabId);
      this.applyResolvedQuestionState({
        request,
        status: 'answered',
        answers,
      }, tabId);
      this.removePendingQuestionRequest(request.id, tabId);
      await this.afterQuestionDockResolution(tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private async handleQuestionDockReject(tabId: TabId | null = this.getActiveTabId()): Promise<void> {
    const request = this.getActivePendingQuestionRequest(tabId);
    if (!request) {
      return;
    }

    try {
      await this.plugin.openCodeService.rejectQuestion(request.id);
      this.suppressResolvedQuestionRequest(request.id, tabId);
      this.applyResolvedQuestionState({
        request,
        status: 'rejected',
      }, tabId);
      this.removePendingQuestionRequest(request.id, tabId);
      await this.afterQuestionDockResolution(tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private async afterQuestionDockResolution(tabId: TabId | null): Promise<void> {
    const sessionId = this.getSessionIdForTab(tabId);
    this.renderQuestionDock();

    if (!sessionId) {
      return;
    }

    void this.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true });
    this.startConversationSyncLoop();

    if (tabId === this.getActiveTabId() && !this.getTabRuntimeState(tabId)?.isStreaming) {
      await this.syncVisibleConversationInBackground();
    }
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
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file) {
      this.lastKnownMarkdownFilePath = activeView.file.path;
      return activeView;
    }

    const preferredPaths = [
      this.lastKnownMarkdownFilePath,
      this.currentConversation?.currentNote ?? null,
    ].filter((value): value is string => Boolean(value));
    const markdownViews = this.app.workspace.getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && Boolean(view.file));

    for (const preferredPath of preferredPaths) {
      const matchedView = markdownViews.find((view) => view.file?.path === preferredPath);
      if (matchedView?.file) {
        this.lastKnownMarkdownFilePath = matchedView.file.path;
        return matchedView;
      }
    }

    const fallbackView = markdownViews[0] ?? null;
    if (fallbackView?.file) {
      this.lastKnownMarkdownFilePath = fallbackView.file.path;
    }

    return fallbackView;
  }

  private getMarkdownViews(): MarkdownView[] {
    return this.app.workspace.getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && Boolean(view.file));
  }

  private getMarkdownViewByPath(path: string | null): MarkdownView | null {
    if (!path) {
      return null;
    }

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file?.path === path) {
      return activeView;
    }

    return this.getMarkdownViews().find((view) => view.file?.path === path) ?? null;
  }

  private computeFocusContextPreview(
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): FocusContextPreview | null {
    const activeView = view?.file ? view : this.getActiveMarkdownView();
    const file = activeView?.file ?? null;
    if (!file) {
      return null;
    }

    const activeEditor = editor ?? activeView?.editor ?? null;
    const selectedText = activeEditor?.getSelection?.() ?? '';
    if (activeEditor && selectedText.trim()) {
      const from = activeEditor.getCursor('from');
      const to = activeEditor.getCursor('to');
      return createFocusContextPreview(file.path, {
        startLine: from.line + 1,
        endLine: to.line + 1,
      }, selectedText);
    }

    return createFocusContextPreview(file.path);
  }

  private refreshActiveFocusContextPreview(
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void {
    const actualPreview = this.computeFocusContextPreview(view, editor);
    const nextPreview = resolveFocusContextPreview(
      actualPreview,
      this.getFocusContextPreview(),
      {
        retainSelectionPreview: this.shouldRetainSelectionPreviewDuringTransition(),
      },
    );
    this.setFocusContextPreview(nextPreview);
    this.syncRetainedSelectionHighlight(actualPreview, view, editor);
  }

  private scheduleFocusContextPreviewRefresh(): void {
    this.clearScheduledFocusContextPreviewRefresh();
    this.focusContextRefreshTimeoutId = window.setTimeout(() => {
      this.focusContextRefreshTimeoutId = null;
      this.refreshActiveFocusContextPreview();
    }, 40);
  }

  private clearScheduledFocusContextPreviewRefresh(): void {
    if (this.focusContextRefreshTimeoutId !== null) {
      window.clearTimeout(this.focusContextRefreshTimeoutId);
      this.focusContextRefreshTimeoutId = null;
    }
  }

  public async addCurrentNoteContextFromActiveEditor(view?: MarkdownView | null): Promise<boolean> {
    const contextItem = await this.buildCurrentNoteContextItem(view ?? this.getActiveMarkdownView());
    if (!contextItem) {
      return false;
    }

    this.addDraftContextItem(contextItem);
    return true;
  }

  public async addSelectionContextFromActiveEditor(
    editor?: Editor | null,
    view?: MarkdownView | null,
  ): Promise<boolean> {
    const contextItem = await this.buildSelectionContextItem(
      editor ?? (view ?? this.getActiveMarkdownView())?.editor ?? null,
      view ?? this.getActiveMarkdownView(),
    );
    if (!contextItem) {
      return false;
    }

    this.addDraftContextItem(contextItem);
    return true;
  }

  private async addChosenFileContextToActiveTab(): Promise<boolean> {
    const file = await chooseContextFile(this.app, async () => this.getContextFileCatalog());
    if (!file) {
      return false;
    }

    const contextItem = await this.buildFileContextItem(file, 'file');
    if (!contextItem) {
      return false;
    }

    this.addDraftContextItem(contextItem);
    return true;
  }

  private async getContextFileCatalog(): Promise<ContextFileCatalog> {
    if (this.contextFileCatalogCache) {
      return this.contextFileCatalogCache;
    }

    if (this.contextFileCatalogBuildPromise) {
      return this.contextFileCatalogBuildPromise;
    }

    this.contextFileCatalogBuildPromise = this.buildContextFileCatalog();
    try {
      const catalog = await this.contextFileCatalogBuildPromise;
      this.contextFileCatalogCache = catalog;
      return catalog;
    } finally {
      this.contextFileCatalogBuildPromise = null;
    }
  }

  private async buildContextFileCatalog(): Promise<ContextFileCatalog> {
    const files = this.app.vault.getFiles();
    const entries: ContextFileEntry[] = [];
    const extensionCounts = new Map<string, number>();
    const batchSize = 400;

    for (let index = 0; index < files.length; index += batchSize) {
      const batch = files.slice(index, index + batchSize);
      for (const file of batch) {
        const entry = this.createContextFileEntry(file);
        if (!entry) {
          continue;
        }

        entries.push(entry);
        extensionCounts.set(entry.extension, (extensionCounts.get(entry.extension) ?? 0) + 1);
      }

      if (index + batchSize < files.length) {
        await this.yieldContextCatalogBuild();
      }
    }

    entries.sort((left, right) => this.compareContextFileEntries(left, right));

    return {
      entries,
      extensions: this.buildContextFileExtensionBuckets(extensionCounts),
    };
  }

  private createContextFileEntry(file: TFile): ContextFileEntry | null {
    if (!isEligibleContextFilePath(file.path)) {
      return null;
    }

    const extension = getContextPathExtension(file.path);
    if (!extension) {
      return null;
    }

    return {
      file,
      lowerPath: file.path.toLowerCase(),
      lowerBasename: file.basename.toLowerCase(),
      lowerExtension: extension.toLowerCase(),
      extension,
    };
  }

  private buildContextFileExtensionBuckets(extensionCounts: Map<string, number>) {
    return [...extensionCounts.entries()]
      .sort((left, right) => {
        return left[0].localeCompare(right[0]);
      })
      .map(([value, count]) => ({ value, count }));
  }

  private async yieldContextCatalogBuild(): Promise<void> {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  private invalidateContextFileCatalogCache(): void {
    this.contextFileCatalogCache = null;
    this.contextFileCatalogBuildPromise = null;
  }

  private updateContextFileCatalogForCreate(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.invalidateContextFileCatalogCache();
      return;
    }

    if (!this.contextFileCatalogCache) {
      return;
    }

    this.upsertContextFileCatalogEntry(file);
  }

  private updateContextFileCatalogForDelete(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.invalidateContextFileCatalogCache();
      return;
    }

    if (!this.contextFileCatalogCache) {
      return;
    }

    this.removeContextFileCatalogEntry(file.path);
  }

  private updateContextFileCatalogForRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) {
      this.invalidateContextFileCatalogCache();
      return;
    }

    if (!this.contextFileCatalogCache) {
      return;
    }

    this.removeContextFileCatalogEntry(oldPath);
    this.upsertContextFileCatalogEntry(file);
  }

  private upsertContextFileCatalogEntry(file: TFile): void {
    if (!this.contextFileCatalogCache) {
      return;
    }

    const existingIndex = this.contextFileCatalogCache.entries.findIndex((entry) => entry.file.path === file.path);
    if (existingIndex >= 0) {
      this.contextFileCatalogCache.entries.splice(existingIndex, 1);
    }

    const nextEntry = this.createContextFileEntry(file);
    if (!nextEntry) {
      this.recomputeContextFileCatalogBuckets();
      return;
    }

    this.contextFileCatalogCache.entries.push(nextEntry);
    this.contextFileCatalogCache.entries.sort((left, right) => this.compareContextFileEntries(left, right));
    this.recomputeContextFileCatalogBuckets();
  }

  private removeContextFileCatalogEntry(targetPath: string): void {
    if (!this.contextFileCatalogCache) {
      return;
    }

    const nextEntries = this.contextFileCatalogCache.entries.filter((entry) => entry.file.path !== targetPath);
    if (nextEntries.length === this.contextFileCatalogCache.entries.length) {
      return;
    }

    this.contextFileCatalogCache.entries = nextEntries;
    this.recomputeContextFileCatalogBuckets();
  }

  private recomputeContextFileCatalogBuckets(): void {
    if (!this.contextFileCatalogCache) {
      return;
    }

    const extensionCounts = new Map<string, number>();
    for (const entry of this.contextFileCatalogCache.entries) {
      extensionCounts.set(entry.extension, (extensionCounts.get(entry.extension) ?? 0) + 1);
    }

    this.contextFileCatalogCache.extensions = this.buildContextFileExtensionBuckets(extensionCounts);
  }

  private compareContextFileEntries(left: ContextFileEntry, right: ContextFileEntry): number {
    const extensionCompare = left.extension.localeCompare(right.extension);
    if (extensionCompare !== 0) {
      return extensionCompare;
    }

    const basenameCompare = left.file.basename.localeCompare(right.file.basename);
    if (basenameCompare !== 0) {
      return basenameCompare;
    }

    return left.file.path.localeCompare(right.file.path);
  }

  private async buildCurrentNoteContextItem(view: MarkdownView | null): Promise<PromptContextItem | null> {
    const file = view?.file ?? null;
    if (!file) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    return this.buildFileContextItem(file, 'current_note');
  }

  private async buildSelectionContextItem(
    editor: Editor | null,
    view: MarkdownView | null,
  ): Promise<PromptContextItem | null> {
    const file = view?.file ?? null;
    if (!editor || !file) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    const selectedText = editor.getSelection();
    if (!selectedText.trim()) {
      new Notice(t('chat.context.notice.noSelection'));
      return null;
    }

    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    return this.createSelectionContextItem(file.path, {
      startLine: from.line + 1,
      endLine: to.line + 1,
    }, selectedText);
  }

  private buildSelectionContextItemFromPreview(preview: FocusContextPreview): PromptContextItem | null {
    if (
      preview.kind !== 'selection'
      || !preview.lineRange
      || !preview.textSnapshot?.trim()
    ) {
      new Notice(t('chat.context.notice.noSelection'));
      return null;
    }

    const targetFile = this.app.vault.getAbstractFileByPath(preview.path);
    if (!(targetFile instanceof TFile)) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    return this.createSelectionContextItem(targetFile.path, preview.lineRange, preview.textSnapshot);
  }

  private createSelectionContextItem(
    path: string,
    lineRange: PromptContextLineRange,
    selectedText: string,
  ): PromptContextItem | null {
    const mime = resolveTextMimeFromPath(path);
    if (!isTextLikeMime(mime)) {
      new Notice(t('chat.context.notice.binaryUnsupported'));
      return null;
    }

    const textSnapshot = this.validateRemoteContextText(selectedText, path);
    if (this.isRemoteContextMode() && textSnapshot === null) {
      return null;
    }

    return {
      id: this.createPromptContextId(),
      kind: 'selection',
      path,
      label: formatContextLabel(path, lineRange),
      mime,
      lineRange,
      textSnapshot: textSnapshot ?? undefined,
    };
  }

  private async buildFileContextItem(
    file: TFile,
    kind: 'current_note' | 'file',
  ): Promise<PromptContextItem | null> {
    const mime = resolveContextMimeFromPath(file.path);
    if (this.isRemoteContextMode() && !isTextLikeMime(mime)) {
      new Notice(t('chat.context.notice.binaryUnsupportedRemote'));
      return null;
    }

    let textSnapshot: string | undefined;
    if (this.isRemoteContextMode()) {
      const fileText = await this.app.vault.read(file);
      const validatedText = this.validateRemoteContextText(fileText, file.path);
      if (validatedText === null) {
        return null;
      }
      textSnapshot = validatedText;
    }

    return {
      id: this.createPromptContextId(),
      kind,
      path: file.path,
      label: formatContextLabel(file.path),
      mime,
      textSnapshot,
    };
  }

  private isRemoteContextMode(): boolean {
    return this.plugin.settings.server.mode === 'remote';
  }

  private validateRemoteContextText(text: string, label: string): string | null {
    if (!this.isRemoteContextMode()) {
      return text;
    }

    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > REMOTE_CONTEXT_TEXT_LIMIT_BYTES) {
      new Notice(t('chat.context.notice.tooLarge', { label }));
      return null;
    }

    return text;
  }

  private createPromptContextId(): string {
    return `context-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    const scheduleFocusPreviewRefresh = () => {
      this.scheduleFocusContextPreviewRefresh();
    };

    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        this.lastKnownMarkdownFilePath = file?.path ?? null;
        if (file && this.currentConversation) {
          this.currentConversation.currentNote = file.path;
        }
        scheduleFocusPreviewRefresh();
      })
    );
    this.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', () => {
        scheduleFocusPreviewRefresh();
      })
    );
    this.registerEvent(
      this.plugin.app.workspace.on('editor-change', (editor, info) => {
        this.refreshActiveFocusContextPreview(info instanceof MarkdownView ? info : undefined, editor);
      })
    );
    if (this.inputContainer) {
      const handleComposerFocusIn = () => {
        this.clearRetainedSelectionInputHandoff();
        this.refreshActiveFocusContextPreview();
        this.refreshRetainedSelectionHighlight();
      };
      const handleComposerFocusOut = () => {
        window.setTimeout(() => {
          this.refreshActiveFocusContextPreview();
          this.refreshRetainedSelectionHighlight();
        }, 0);
      };
      this.registerDomEvent(this.inputContainer, 'pointerdown', () => {
        this.markRetainedSelectionInputHandoff();
        this.primeRetainedSelectionHighlightFromActiveEditor();
      });
      this.registerDomEvent(this.inputContainer, 'focusin', handleComposerFocusIn);
      this.registerDomEvent(this.inputContainer, 'focusout', handleComposerFocusOut);
    }
    this.registerDomEvent(document, 'selectionchange', scheduleFocusPreviewRefresh);
    this.registerDomEvent(document, 'mouseup', scheduleFocusPreviewRefresh);
    this.registerDomEvent(document, 'keyup', scheduleFocusPreviewRefresh);

    this.registerEvent(this.plugin.app.vault.on('create', (file) => {
      this.updateContextFileCatalogForCreate(file);
    }));
    this.registerEvent(this.plugin.app.vault.on('delete', (file) => {
      this.updateContextFileCatalogForDelete(file);
    }));
    this.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => {
      this.updateContextFileCatalogForRename(file, oldPath);
    }));
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
  private async loadConversation(
    id: string,
    options: { forceServerSync?: boolean; preserveScrollPosition?: boolean } = {},
  ) {
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

    let conversation = await this.plugin.getConversationById(id);
    if (!conversation) {
      await this.plugin.loadConversations();
      conversation = await this.plugin.getConversationById(id);
    }
    if (!conversation) return;

    const messagesEl = this.messagesContainer;
    const preserveScrollPosition = Boolean(options.preserveScrollPosition && messagesEl);
    const previousScrollTop = preserveScrollPosition && messagesEl
      ? messagesEl.scrollTop
      : 0;
    const shouldStickToBottom = preserveScrollPosition && messagesEl
      ? this.getTabRuntimeState(this.getActiveTabId())?.autoScrollEnabled ?? this.isNearBottomForElement(messagesEl)
      : true;
    const activeTabId = this.getActiveTabId();
    const previousSessionId = this.getSessionIdForTab(activeTabId);

    this.currentConversation = conversation;
    this.currentConversationRevertState = null;
    this.tabManager?.setActiveTabConversation(conversation);

    // Clear messages display
    this.clearScheduledScrollToBottom();
    this.beginConversationHydration(activeTabId);
    messagesEl?.addClass('is-rehydrating');
    this.messagesContainer?.empty();
    this.resetTurnState();

    // Set session in service
    this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);
    if (previousSessionId !== conversation.openCodeSessionId) {
      this.clearPendingQuestionsForTab(activeTabId);
    }
    this.setTabSessionTodos(activeTabId, [], conversation.openCodeSessionId);
    this.setTabSessionStatus(activeTabId, null, conversation.openCodeSessionId);
    const activeRuntime = this.getTabRuntimeState(activeTabId);
    if (activeRuntime) {
      activeRuntime.backgroundTaskSuppressedFingerprint = null;
    }

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

    try {
      let messages = conversation.messages;
      if (shouldSyncFromServer) {
        const syncResult = await this.syncConversationMessagesFromServer(conversation, this.getActiveTabId(), 'load-conversation');
        messages = syncResult.messages;
        this.currentConversationRevertState = syncResult.revertState;
      }

      this.syncBackgroundTaskStateFromConversation(conversation);
      await this.renderMessages(messages);
      await this.renderBackgroundTaskIndicatorIfNeeded();
      this.renderSessionTodoDock();
      this.renderQuestionDock();
      void this.refreshTabSessionStatus(activeTabId, conversation.openCodeSessionId, { suppressErrors: true });
      void this.refreshPendingQuestionsForTab(activeTabId, conversation.openCodeSessionId);
      void this.refreshActiveSessionTodos({ suppressErrors: true });
      this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(messages);
      this.startConversationSyncLoop();

      if (messagesEl) {
        const runtime = this.getTabRuntimeState(activeTabId);
        if (runtime) {
          runtime.autoScrollEnabled = shouldStickToBottom;
        }
        const scrollSnapshot = this.captureElementScrollRestoreSnapshot(
          messagesEl,
          !(preserveScrollPosition && !shouldStickToBottom),
          previousScrollTop,
        );
        this.restoreElementScrollAfterRender(messagesEl, scrollSnapshot);
        window.requestAnimationFrame(() => {
          messagesEl.removeClass('is-rehydrating');
        });
      }
      this.scheduleComposerLayoutSync();

      // Update model selector to reflect this session's model
      this.updateModelSelectorDisplay();
      this.syncActiveTabContextUsageIdentity();
      await this.refreshActiveTabContextUsageFromServer();
    } finally {
      this.endConversationHydration(activeTabId);
    }
  }

  private openConversationInCurrentTab(conversation: Conversation): void {
    if (this.currentConversation?.id !== conversation.id) {
      this.resetBackgroundTaskIndicator();
    }
    const activeTabId = this.getActiveTabId();
    const previousSessionId = this.getSessionIdForTab(activeTabId);

    this.tabManager?.setActiveTabConversation(conversation);
    this.currentConversation = conversation;
    this.currentConversationRevertState = null;
    this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);
    if (previousSessionId !== conversation.openCodeSessionId) {
      this.clearPendingQuestionsForTab(activeTabId);
    }
    this.setTabSessionTodos(activeTabId, [], conversation.openCodeSessionId);
    this.setTabSessionStatus(activeTabId, null, conversation.openCodeSessionId);
    this.messagesContainer?.empty();
    this.resetTurnState();
    this.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(conversation.messages);
    this.startConversationSyncLoop();
    this.updateModelSelectorDisplay();
    this.syncActiveTabContextUsageIdentity();
    this.syncBackgroundTaskStateFromConversation(conversation);
    this.renderSessionTodoDock();
    this.renderQuestionDock();
    void this.refreshTabSessionStatus(activeTabId, conversation.openCodeSessionId, { suppressErrors: true });
    void this.refreshPendingQuestionsForTab(activeTabId, conversation.openCodeSessionId);
    void this.refreshActiveSessionTodos({ suppressErrors: true });
    void this.renderBackgroundTaskIndicatorIfNeeded();
    void this.refreshActiveTabContextUsageFromServer();
    this.scheduleSettledScrollToBottom();
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

  private clearScheduledSignalConversationSync(tabId: TabId | null): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || runtime.signalConversationSyncTimerId === null) {
      return;
    }

    window.clearTimeout(runtime.signalConversationSyncTimerId);
    runtime.signalConversationSyncTimerId = null;
    runtime.pendingSignalConversationSyncReasons.clear();
  }

  private scheduleConversationSyncFromSignal(
    tabId: TabId | null,
    reason: SessionSyncEventUpdate['type'],
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.pendingSignalConversationSyncReasons.add(reason);
    if (runtime.signalConversationSyncTimerId !== null) {
      return;
    }

    runtime.signalConversationSyncTimerId = window.setTimeout(() => {
      runtime.signalConversationSyncTimerId = null;
      const mergedReason = [...runtime.pendingSignalConversationSyncReasons].sort().join('+') || reason;
      runtime.pendingSignalConversationSyncReasons.clear();
      void this.syncConversationFromSignal(tabId, mergedReason);
    }, 120);
  }

  private async syncConversationFromSignal(
    tabId: TabId | null,
    reason: string,
  ): Promise<void> {
    if (!tabId) {
      return;
    }

    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || runtime.isStreaming || runtime.isConversationSyncInFlight) {
      return;
    }

    const activeTabId = this.getActiveTabId();
    if (tabId === activeTabId && this.currentConversation?.openCodeSessionId) {
      await this.syncVisibleConversationInBackground();
      return;
    }

    const tab = this.tabManager?.getTab(tabId);
    if (!tab?.conversationId) {
      return;
    }

    const conversation = await this.plugin.getConversationById(tab.conversationId);
    if (!conversation?.openCodeSessionId) {
      return;
    }

    runtime.isConversationSyncInFlight = true;
    try {
      const previousFingerprint = runtime.lastConversationSyncFingerprint
        ?? this.getConversationSyncFingerprint(conversation.messages);
      const syncResult = await this.syncConversationMessagesFromServer(
        conversation,
        tabId,
        `sync-event:${reason}`,
        { suppressVerboseLogs: true },
      );
      runtime.lastConversationSyncFingerprint = syncResult.fingerprint;
      this.markBackgroundTaskAuthoritativeSync(tabId, `sync-event:${reason}`);
      await this.refreshPendingQuestionsForTab(tabId, conversation.openCodeSessionId);
      this.syncBackgroundTaskStateFromConversation(conversation, tabId);
      if (this.hasIncompleteTodos(runtime.sessionTodos) || tab.hasBackgroundTask) {
        await this.refreshTabSessionStatus(tabId, conversation.openCodeSessionId, { suppressErrors: true });
        await this.refreshTabSessionTodos(tabId, conversation.openCodeSessionId, { suppressErrors: true });
      }
      await this.queueBackgroundTaskCompletionNotices(tabId, conversation);
      await this.flushQueuedBackgroundTaskCompletionNotices(tabId, conversation);
      this.syncTabStreamLikeState(tabId);
      if (syncResult.changed || syncResult.fingerprint !== previousFingerprint) {
        this.tabManager?.setTabNeedsAttention(tabId, tabId !== activeTabId);
      }
    } finally {
      runtime.isConversationSyncInFlight = false;
    }
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
    const expectedSessionId = this.currentConversation.openCodeSessionId;
    runtime.isConversationSyncInFlight = true;
    try {
      const previousMessages = [...this.currentConversation.messages];
      const syncResult = await this.syncConversationMessagesFromServer(
        this.currentConversation,
        activeTabId,
        'visible-background-sync',
        { suppressVerboseLogs: true },
      );
      await this.refreshPendingQuestionsForTab(activeTabId, expectedSessionId);
      if (!syncResult.changed || this.currentConversation?.id !== expectedConversationId) {
        if (this.currentConversation?.id === expectedConversationId) {
          this.currentConversationRevertState = syncResult.revertState;
        }
        if (
          this.hasIncompleteTodos(runtime.sessionTodos)
          || runtime.backgroundTaskLaunches.size > 0
          || runtime.backgroundTaskWaitingForFollowUp
        ) {
          await this.refreshTabSessionStatus(activeTabId, this.currentConversation?.openCodeSessionId, { suppressErrors: true });
          await this.refreshTabSessionTodos(activeTabId, this.currentConversation?.openCodeSessionId, { suppressErrors: true });
        }
        await this.renderBackgroundTaskIndicatorIfNeeded(activeTabId);
        return;
      }

      this.currentConversationRevertState = syncResult.revertState;
      runtime.lastConversationSyncFingerprint = syncResult.fingerprint;
      if (
        this.hasIncompleteTodos(runtime.sessionTodos)
        || runtime.backgroundTaskLaunches.size > 0
        || runtime.backgroundTaskWaitingForFollowUp
      ) {
        await this.refreshTabSessionStatus(activeTabId, this.currentConversation.openCodeSessionId, { suppressErrors: true });
        await this.refreshTabSessionTodos(activeTabId, this.currentConversation.openCodeSessionId, { suppressErrors: true });
      }
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
        const syncResult = await this.syncConversationMessagesFromServer(
          conversation,
          tab.id,
          'background-tab-sync',
        );
        await this.refreshPendingQuestionsForTab(tab.id, conversation.openCodeSessionId);
        this.syncBackgroundTaskStateFromConversation(conversation, tab.id);
        if (this.hasIncompleteTodos(runtime.sessionTodos) || tab.hasBackgroundTask) {
          await this.refreshTabSessionStatus(tab.id, conversation.openCodeSessionId, { suppressErrors: true });
          await this.refreshTabSessionTodos(tab.id, conversation.openCodeSessionId, { suppressErrors: true });
        }
        await this.queueBackgroundTaskCompletionNotices(tab.id, conversation);
        await this.flushQueuedBackgroundTaskCompletionNotices(tab.id, conversation);
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
    const uniqueConversationIds = Array.from(new Set(conversationIds));
    if (uniqueConversationIds.length === 0) {
      return;
    }

    const conversationIdSet = new Set(uniqueConversationIds);
    for (const conversationId of uniqueConversationIds) {
      await this.plugin.deleteConversation(conversationId);
    }

    if (!this.tabManager) {
      if (this.currentConversation && conversationIdSet.has(this.currentConversation.id)) {
        await this.createNewConversation();
      }
      return;
    }

    const tabsToClose = this.tabManager.getAllTabs()
      .filter((tab) => tab.conversationId && conversationIdSet.has(tab.conversationId));
    const activeTabId = this.tabManager.getActiveTab()?.id ?? null;
    const activeTabWillBeClosed = activeTabId
      ? tabsToClose.some((tab) => tab.id === activeTabId)
      : false;
    const closeResult = this.tabManager.closeTabs(tabsToClose.map((tab) => tab.id));

    for (const tabId of closeResult.closedTabIds) {
      this.removeTabMessagesPane(tabId);
    }

    if (this.tabManager.getTabCount() === 0) {
      await this.createNewConversation();
      return;
    }

    if (activeTabWillBeClosed && closeResult.nextActiveTabId) {
      await this.activateTab(closeResult.nextActiveTabId);
    }
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

    if (this.isTabForegroundBusy(sendingTabId)) {
      new Notice(t('chat.tab.processingBlocked'));
      return;
    }

    const draftContextItems = [...sendingRuntime.draftContextItems];
    const availability = await this.getServerAvailability();
    await this.refreshServerStatusBadge();
    if (availability !== 'running' && availability !== 'external') {
      const ready = await this.ensureServerReadyForChat(availability);
      if (!ready) {
        return;
      }
    }

    if (!this.hasLoadedModelCatalog) {
      await this.loadAvailableModels();
    }

    const modelOptions = this.getSendMessageOptions();

    const activeModelId = this.formatModelId(modelOptions);
    if (!(await this.ensureSelectedModelAvailable(modelOptions.provider, modelOptions.model))) {
      await this.appendModelUnavailableNoticeMessage();
      return;
    }

    const contextAttachments = draftContextItems.map((item) => buildContextAttachment(item));
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      contextAttachments: contextAttachments.length > 0 ? contextAttachments : undefined,
    };
    this.resetBackgroundTaskIndicator();
    this.armBackgroundTaskIndicatorForUserMessage(userMessage);
    sendingConversation.messages.push(userMessage);
    sendingConversation.updatedAt = userMessage.timestamp;
    this.startConversationSyncLoop();
    await this.plugin.saveConversation(sendingConversation);
    sendingRuntime.autoScrollEnabled = true;
    await this.renderMessage(userMessage);
    this.scrollToBottom({ tabId: sendingTabId, enableAutoScroll: true });

    const isFirstUserMessage = sendingConversation.messages.filter((message) => message.role === 'user').length === 1;
    if (isFirstUserMessage) {
      await this.applyFallbackConversationTitle(sendingConversation.id, content);
      if (this.plugin.settings.titleMode === 'ai') {
        void this.startAiConversationTitleGeneration(sendingConversation.id, content, modelOptions);
      }
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
        logger.warn('Stream idle timeout reached, detaching local stream and continuing background sync', {
          conversationId: sendingConversation.id,
          sessionId: sendingConversation.openCodeSessionId,
          timeoutMs: STREAM_IDLE_TIMEOUT_MS,
          hasVisibleAssistantContent: Boolean(streamController?.getContentBlocks().length),
        });

        sendingRuntime.streamController?.cancelStream();
        this.plugin.openCodeService.detachStream(sendingConversation.openCodeSessionId);
        resetStreamingState();
      }, STREAM_IDLE_TIMEOUT_MS);
    };

    scheduleStreamTimeout();

    // Stream response with current session model
    const stream = this.plugin.openCodeService.sendMessage(content, {
      sessionId: sendingConversation.openCodeSessionId,
      ...modelOptions,
      contextItems: draftContextItems,
    });
    sendingRuntime.pendingEditedFiles.clear();
    this.clearDraftContextItems(sendingTabId);

    const { contentEl } = this.createAssistantMessageElement(sendingTabId, true);
    const streamController = this.getOrCreateTabStreamController(sendingTabId);
    if (this.getActiveTabId() === sendingTabId) {
      this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(sendingTabId), sendingTabId);
    }

    // Show pending indicator after a short delay
    const pendingState: { element: HTMLElement | null } = { element: null };
    let pendingStartTime = 0;
    const pendingMessage = getRandomPendingMessage();
    let latestErrorMessage: string | null = null;
    let finalizedAssistantMetadata: Extract<import('../../core/types').StreamChunk, { type: 'message_metadata' }> | null = null;
    let receivedMeaningfulChunk = false;
    let rawStreamChunkCount = 0;
    let renderedStreamChunkCount = 0;
    let lastRawTextChunk: Record<string, unknown> | null = null;
    let lastRenderedTextChunk: Record<string, unknown> | null = null;
    let totalRenderedTextLength = 0;
    let lastProgressLoggedAt = 0;
    let lastProgressLoggedTextLength = 0;
    const finalizationTraceId = `${sendingConversation.openCodeSessionId}:${userMessage.id}:${Date.now()}`;
    const getStreamControllerSnapshot = (): Record<string, unknown> => ({
      hasController: Boolean(streamController),
      persistedBlocks: this.summarizeContentBlocksForDebug(
        streamController?.getContentBlocks() as Array<{
          type?: string;
          text?: string;
          content?: string;
          toolId?: string;
          toolName?: string;
          toolCall?: { id?: string; name?: string } | null;
        }> | undefined,
      ),
    });
    const logAssistantFinalizationStage = (
      stage: string,
      payload: Record<string, unknown> = {},
    ): void => {
      this.logAssistantFinalizationDebug(stage, {
        traceId: finalizationTraceId,
        tabId: sendingTabId,
        conversationId: sendingConversation.id,
        sessionId: sendingConversation.openCodeSessionId,
        userMessageId: userMessage.id,
        streamCompleted,
        streamInterrupted,
        streamTimedOut,
        latestErrorMessage: latestErrorMessage ? this.getLogPreview(latestErrorMessage, 160) : null,
        rawStreamChunkCount,
        renderedStreamChunkCount,
        lastRawTextChunk,
        lastRenderedTextChunk,
        finalizedAssistantMetadata: finalizedAssistantMetadata
          ? {
              messageId: finalizedAssistantMetadata.messageId,
              timestamp: finalizedAssistantMetadata.timestamp,
              modelId: finalizedAssistantMetadata.modelId ?? null,
            }
          : null,
        ...payload,
      });
    };
    const logStreamProgressCheckpoint = (
      reason: 'first-content' | 'text-growth' | 'thinking' | 'tool' | 'error',
      payload: Record<string, unknown> = {},
    ): void => {
      const now = Date.now();
      const shouldLog = reason !== 'text-growth'
        || lastProgressLoggedAt === 0
        || totalRenderedTextLength - lastProgressLoggedTextLength >= STREAM_PROGRESS_LOG_MIN_TEXT_DELTA
        || now - lastProgressLoggedAt >= STREAM_PROGRESS_LOG_MIN_INTERVAL_MS;
      if (!shouldLog) {
        return;
      }

      lastProgressLoggedAt = now;
      lastProgressLoggedTextLength = totalRenderedTextLength;
      logAssistantFinalizationStage('stream-progress', {
        reason,
        totalRenderedTextLength,
        messageVisible: !(sendingRuntime.streamingMessageEl?.hidden ?? true),
        pendingIndicatorVisible: Boolean(pendingState.element?.isConnected),
        streamController: getStreamControllerSnapshot(),
        ...payload,
      });
    };
    logAssistantFinalizationStage('trace-armed', {
      activeModelId,
      pendingMessage,
      streamControllerAvailable: Boolean(streamController),
    });
    const pendingTimeout = window.setTimeout(() => {
      if (!sendingRuntime.isStreaming || !contentEl) {
        return;
      }

      pendingState.element = contentEl.createDiv({ cls: 'opencodian-pending' });
      pendingState.element.createSpan({
        text: pendingMessage,
        cls: 'opencodian-pending-text'
      });
      const hintEl = pendingState.element.createSpan({ cls: 'opencodian-pending-hint' });
      pendingStartTime = Date.now();
      this.revealStreamingAssistantMessageElement(sendingTabId);

      // Update timer every second
      const updateTimer = () => {
        if (!pendingState.element || !pendingState.element.isConnected) return;
        const elapsed = Math.floor((Date.now() - pendingStartTime) / 1000);
        hintEl.setText(` (esc to interrupt · ${elapsed}s)`);
      };
      updateTimer();
      pendingState.element.dataset.timerInterval = String(window.setInterval(updateTimer, 1000));
      logAssistantFinalizationStage('pending-indicator-shown', {
        pendingMessage,
        revealReason: 'pending-timeout',
      });
      if (this.getActiveTabId() === sendingTabId) {
        this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(sendingTabId), sendingTabId);
      }
    }, 1000); // Show after 1s delay

    if (streamController) {
      streamController.startStream(contentEl);
      logAssistantFinalizationStage('stream-controller-started', {
        activeModelId,
        pendingMessage,
        streamController: getStreamControllerSnapshot(),
      });
    }

    let receivedFirstChunk = false;

    try {
      for await (const chunk of stream) {
        rawStreamChunkCount += 1;
        if (chunk.type === 'text' && chunk.content.length > 0) {
          lastRawTextChunk = {
            sequence: rawStreamChunkCount,
            length: chunk.content.length,
            preview: this.getLogPreview(chunk.content, 120),
          };
        }
        if (!sendingRuntime.isStreaming) {
          logger.debug('Streaming cancelled, breaking loop');
          streamInterrupted = true;
          logAssistantFinalizationStage('stream-loop-break-not-streaming');
          break;
        }

        scheduleStreamTimeout();

        if (chunk.type === 'message_start') {
          logAssistantFinalizationStage('message-start-received');
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

        if (chunk.type === 'message_metadata') {
          finalizedAssistantMetadata = chunk;
          logAssistantFinalizationStage('message-metadata-received', {
            metadata: this.summarizeCoreStreamChunkForDebug(chunk),
          });
          continue;
        }

        if (chunk.type === 'message_stop') {
          streamCompleted = true;
          this.completeTabContextUsageStream(sendingTabId);
          logAssistantFinalizationStage('message-stop-received', {
            streamController: getStreamControllerSnapshot(),
          });
        }

        if (chunk.type === 'file_edited') {
          sendingRuntime.pendingEditedFiles.add(chunk.file);
          logAssistantFinalizationStage('file-edited-recorded', {
            file: chunk.file,
            pendingEditedFileCount: sendingRuntime.pendingEditedFiles.size,
          });
          continue;
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

        if (chunk.type === 'question_request') {
          receivedMeaningfulChunk = true;
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }

          await this.showQuestionDialog(chunk.request, sendingTabId);

          if (sendingRuntime.isStreaming) {
            scheduleStreamTimeout();
          }
          continue;
        }

        const streamingChunk = this.convertToStreamingChunk(chunk);
        if (streamingChunk && streamController) {
          renderedStreamChunkCount += 1;
          if (streamingChunk.type === 'text' && streamingChunk.content.length > 0) {
            totalRenderedTextLength += streamingChunk.content.length;
            lastRenderedTextChunk = {
              sequence: renderedStreamChunkCount,
              length: streamingChunk.content.length,
              preview: this.getLogPreview(streamingChunk.content, 120),
            };
          }
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

          if (streamingChunk.type === 'text' && streamingChunk.content.length > 0) {
            logStreamProgressCheckpoint(receivedFirstChunk ? 'text-growth' : 'first-content', {
              renderedChunkSequence: renderedStreamChunkCount,
              chunkLength: streamingChunk.content.length,
            });
          } else if (streamingChunk.type === 'thinking' && streamingChunk.content?.trim()) {
            logStreamProgressCheckpoint('thinking', {
              renderedChunkSequence: renderedStreamChunkCount,
              chunkLength: streamingChunk.content.length,
            });
          } else if (streamingChunk.type === 'tool_use') {
            logStreamProgressCheckpoint('tool', {
              renderedChunkSequence: renderedStreamChunkCount,
              toolName: streamingChunk.name,
            });
          } else if (streamingChunk.type === 'error') {
            logStreamProgressCheckpoint('error', {
              renderedChunkSequence: renderedStreamChunkCount,
              errorPreview: this.getLogPreview(streamingChunk.content, 160),
            });
          }

          if (streamingChunk.type === 'error' || hasContent) {
            this.revealStreamingAssistantMessageElement(sendingTabId);
          }

          if (!receivedFirstChunk && hasContent) {
            receivedFirstChunk = true;
            window.clearTimeout(pendingTimeout);
            if (pendingState.element?.parentNode) {
              // Clear timer interval
              if (pendingState.element.dataset.timerInterval) {
                window.clearInterval(Number(pendingState.element.dataset.timerInterval));
              }
              pendingState.element.remove();
              pendingState.element = null;
              logAssistantFinalizationStage('pending-indicator-cleared', {
                reason: 'first-content',
                renderedChunkSequence: renderedStreamChunkCount,
                totalRenderedTextLength,
              });
            }
          }
        }
      }

      if (sendingRuntime.isStreaming && !receivedMeaningfulChunk && !latestErrorMessage && streamController) {
        latestErrorMessage = this.getFriendlyStreamErrorMessage('');
        logAssistantFinalizationStage('injecting-fallback-error-before-done');
        await streamController.handleChunk({
          type: 'error',
          content: latestErrorMessage,
        });
        this.revealStreamingAssistantMessageElement(sendingTabId);
      }

      if (sendingRuntime.isStreaming && streamController) {
        logAssistantFinalizationStage('render-done-dispatch', {
          streamController: getStreamControllerSnapshot(),
        });
        await streamController.handleChunk({ type: 'done' });
        logAssistantFinalizationStage('render-done-applied', {
          streamController: getStreamControllerSnapshot(),
        });
      }
    } catch (error) {
      logger.error('Streaming error:', error);
      latestErrorMessage = this.getFriendlyStreamErrorMessage(
        error instanceof Error ? error.message : 'Unknown error'
      );
      logAssistantFinalizationStage('stream-loop-error', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (streamController) {
        await streamController.handleChunk({
          type: 'error',
          content: latestErrorMessage,
        });
        this.revealStreamingAssistantMessageElement(sendingTabId);
      }
    } finally {
      const finalizedTimestamp = finalizedAssistantMetadata?.timestamp ?? Date.now();
      const finalizedModelId = finalizedAssistantMetadata?.modelId ?? activeModelId;
      const finalizedAssistantMessageId = finalizedAssistantMetadata?.messageId;
      const finalizedStreamingMessageEl = sendingRuntime.streamingMessageEl;
      const streamContentBlocks = streamController?.getContentBlocks();
      const streamedTextContent = streamContentBlocks
        ?.filter((b): b is { type: 'text'; content: string } => b.type === 'text')
        .map(b => b.content)
        .join('') ?? '';
      const hasStreamContentBlocks = Boolean(streamContentBlocks && streamContentBlocks.length > 0);
      const shouldPersistInterruptedState = streamInterrupted && !streamCompleted && !latestErrorMessage;
      let interruptedNoticeMessage: ChatMessage | null = null;
      const streamErrorNoticeMessage = latestErrorMessage && !hasStreamContentBlocks
        ? this.buildStreamErrorNotice(
          finalizedTimestamp,
          latestErrorMessage,
          finalizedModelId,
          finalizedAssistantMessageId,
        )
        : null;

      const shouldSyncFromServer = streamCompleted && !streamTimedOut && !streamInterrupted && !latestErrorMessage;
      logAssistantFinalizationStage('stream-finally-enter', {
        shouldPersistInterruptedState,
        shouldSyncFromServer,
        finalTimestampCandidate: finalizedTimestamp,
        finalModelIdCandidate: finalizedModelId,
        finalizedAssistantMessageId: finalizedAssistantMessageId ?? null,
        streamedTextLength: streamedTextContent.length,
        streamContentBlocks: this.summarizeContentBlocksForDebug(
          streamContentBlocks as Array<{
            type?: string;
            text?: string;
            content?: string;
            toolId?: string;
            toolName?: string;
            toolCall?: { id?: string; name?: string } | null;
          }> | undefined,
        ),
        streamController: getStreamControllerSnapshot(),
      });
      if (shouldSyncFromServer) {
        sendingRuntime.isConversationSyncInFlight = true;
      }

      logger.debug('Stream loop ended');
      resetStreamingState();
      this.completeTabContextUsageStream(sendingTabId);
      window.clearTimeout(pendingTimeout);
      if (pendingState.element?.dataset.timerInterval) {
        window.clearInterval(Number(pendingState.element.dataset.timerInterval));
      }
      pendingState.element?.remove();
      pendingState.element = null;

      if (finalizedStreamingMessageEl) {
        let shellFinalizeAction = 'removed';
        if (hasStreamContentBlocks) {
          this.addTimestampWithCopyButton(
            finalizedStreamingMessageEl,
            finalizedTimestamp,
            streamedTextContent.trim() || undefined,
            finalizedModelId,
            shouldPersistInterruptedState ? t('chat.stream.interruptedBadge') : undefined,
          );
          shellFinalizeAction = 'timestamp-added';
        } else if (streamErrorNoticeMessage) {
          await this.renderAssistantPlaceholderAsNotice(
            finalizedStreamingMessageEl,
            streamErrorNoticeMessage,
            'render-stream-error-notice',
          );
          shellFinalizeAction = 'error-notice-rendered';
        } else if (shouldPersistInterruptedState) {
          interruptedNoticeMessage = this.buildInterruptedAssistantNotice(finalizedTimestamp, finalizedModelId);
          await this.renderAssistantPlaceholderAsNotice(
            finalizedStreamingMessageEl,
            interruptedNoticeMessage,
            'render-interrupted-notice',
          );
          shellFinalizeAction = 'interrupted-notice-rendered';
        } else {
          finalizedStreamingMessageEl.remove();
        }
        logAssistantFinalizationStage('streaming-shell-finalized', {
          action: shellFinalizeAction,
        });

        if (this.getActiveTabId() === sendingTabId) {
          this.scheduleSettledScrollToBottomIfNeeded();
        }
      }

      await this.finalizeBackgroundTaskIndicatorAfterPrimaryStream(sendingTabId);
      this.removeEmptyAssistantShells();
      this.syncTabStreamLikeState(sendingTabId);
      await this.refreshServerStatusBadge();

      if (hasStreamContentBlocks && streamContentBlocks) {
        const contentBlocks: ContentBlock[] = streamContentBlocks.map((b) => {
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
              toolKind: b.toolCall.kind,
              toolInput: b.toolCall.input,
              toolStatus: b.toolCall.status,
              toolResult: b.toolCall.result,
            };
          }
          return { type: 'text', text: '' };
        });

        const assistantMessage: ChatMessage = {
          id: finalizedAssistantMessageId ?? `assistant-${finalizedTimestamp}`,
          role: 'assistant',
          content: streamedTextContent,
          timestamp: finalizedTimestamp,
          modelId: finalizedModelId,
          sourceMessageId: finalizedAssistantMessageId,
          streamState: shouldPersistInterruptedState ? 'interrupted' : undefined,
          contentBlocks,
          questionResolution: sendingRuntime.pendingQuestionResolution ?? undefined,
        };
        logAssistantFinalizationStage('local-assistant-message-built', {
          message: this.summarizeChatMessageForDebug(assistantMessage),
        });

        if (shouldPersistInterruptedState) {
          logger.debug(`Persisting interrupted assistant message after stream cancellation: ${this.stringifyLogPayload({
            tabId: sendingTabId,
            conversationId: sendingConversation.id,
            sessionId: sendingConversation.openCodeSessionId,
            messageId: assistantMessage.id,
            sourceMessageId: assistantMessage.sourceMessageId ?? null,
            contentPreview: this.getLogPreview(assistantMessage.content, 160),
            contentBlockCount: assistantMessage.contentBlocks?.length ?? 0,
          })}`);
        }

        if (finalizedStreamingMessageEl) {
          finalizedStreamingMessageEl.dataset.messageId = assistantMessage.id;
          if (assistantMessage.sourceMessageId) {
            finalizedStreamingMessageEl.dataset.sourceMessageId = assistantMessage.sourceMessageId;
          } else {
            delete finalizedStreamingMessageEl.dataset.sourceMessageId;
          }
        }

        sendingConversation.messages.push(assistantMessage);
        logAssistantFinalizationStage('local-assistant-message-appended', {
          conversationMessageCount: sendingConversation.messages.length,
          message: this.summarizeChatMessageForDebug(assistantMessage),
        });
      } else if (streamErrorNoticeMessage) {
        sendingConversation.messages.push(streamErrorNoticeMessage);
        logAssistantFinalizationStage('local-error-notice-appended', {
          conversationMessageCount: sendingConversation.messages.length,
          latestAssistantMessage: this.summarizeChatMessageForDebug(streamErrorNoticeMessage),
        });
      } else if (interruptedNoticeMessage) {
        logger.debug(`Persisting interrupted assistant notice because no visible assistant content survived cancellation: ${this.stringifyLogPayload({
          tabId: sendingTabId,
          conversationId: sendingConversation.id,
          sessionId: sendingConversation.openCodeSessionId,
          noticeId: interruptedNoticeMessage.id,
        })}`);
        sendingConversation.messages.push(interruptedNoticeMessage);
        logAssistantFinalizationStage('local-interrupted-notice-appended', {
          conversationMessageCount: sendingConversation.messages.length,
          latestAssistantMessage: this.summarizeChatMessageForDebug(interruptedNoticeMessage),
        });
      }

      if (hasStreamContentBlocks || streamErrorNoticeMessage || interruptedNoticeMessage) {
        sendingConversation.updatedAt = finalizedTimestamp;
        sendingConversation.lastResponseAt = finalizedTimestamp;
        await this.plugin.saveConversation(sendingConversation);
        logAssistantFinalizationStage('conversation-saved-after-local-finalization', {
          updatedAt: sendingConversation.updatedAt,
          lastResponseAt: sendingConversation.lastResponseAt ?? null,
          messageCount: sendingConversation.messages.length,
        });
      }

      sendingRuntime.streamingMessageEl = null;
      sendingRuntime.streamingContentEl = null;
      sendingRuntime.pendingQuestionResolution = null;
      logAssistantFinalizationStage('stream-runtime-cleared');
    }

    if (sendingConversation) {
      const shouldSyncFromServer = streamCompleted && !streamTimedOut && !streamInterrupted && !latestErrorMessage;
      try {
        if (shouldSyncFromServer) {
          const previousMessagesBeforeSync = [...sendingConversation.messages];
          const previousVisualFingerprint = this.getConversationVisualFingerprint(sendingConversation.messages);
          logAssistantFinalizationStage('server-sync-requested', {
            previousVisualFingerprint,
            localTailAssistant: this.summarizeChatMessageForDebug(
              [...sendingConversation.messages].reverse().find((message) => message.role === 'assistant'),
            ),
          });
          const syncResult = await this.syncConversationMessagesFromServer(
            sendingConversation,
            sendingTabId,
            'send-finalization',
          );
          logAssistantFinalizationStage('server-sync-complete', {
            changed: syncResult.changed,
            fingerprint: syncResult.fingerprint,
            syncedTailAssistant: this.summarizeChatMessageForDebug(
              [...syncResult.messages].reverse().find((message) => message.role === 'assistant'),
            ),
          });
          if (this.currentConversation?.id === sendingConversation.id && this.getActiveTabId() === sendingTabId) {
            const activeRuntime = this.getTabRuntimeState(sendingTabId);
            if (activeRuntime) {
              activeRuntime.lastConversationSyncFingerprint = syncResult.fingerprint;
            }
            if (previousVisualFingerprint !== this.getConversationVisualFingerprint(syncResult.messages)) {
              const patchedTail = await this.patchTrailingAssistantRender(
                previousMessagesBeforeSync,
                syncResult.messages,
                sendingTabId,
              );
              logAssistantFinalizationStage('post-sync-tail-render-attempt', {
                patchedTail,
              });
              if (!patchedTail) {
                await this.rerenderConversationMessages(sendingConversation);
                logAssistantFinalizationStage('post-sync-full-rerender-complete');
              }
            }
          }
          await this.renderBackgroundTaskIndicatorIfNeeded(sendingTabId);

          await this.appendTurnDiffNoticeIfNeeded(
            sendingConversation,
            [...sendingRuntime.pendingEditedFiles],
            sendingTabId,
          );
          logAssistantFinalizationStage('turn-diff-processed', {
            pendingEditedFileCount: sendingRuntime.pendingEditedFiles.size,
          });
        }
        await this.refreshTabSessionTodos(sendingTabId, sendingConversation.openCodeSessionId, { suppressErrors: true });
        logAssistantFinalizationStage('session-todos-refreshed');
        sendingConversation.updatedAt = Date.now();
        await this.plugin.saveConversation(sendingConversation);
        logAssistantFinalizationStage('conversation-final-save-complete', {
          updatedAt: sendingConversation.updatedAt,
          messageCount: sendingConversation.messages.length,
        });
        sendingRuntime.pendingEditedFiles.clear();
        if (this.currentConversation?.id === sendingConversation.id && this.getActiveTabId() === sendingTabId) {
          const activeRuntime = this.getTabRuntimeState(sendingTabId);
          if (activeRuntime) {
            activeRuntime.lastConversationSyncFingerprint = this.getConversationSyncFingerprint(sendingConversation.messages);
          }
          this.tabManager?.setTabNeedsAttention(sendingTabId, false);
          this.tabManager?.setActiveTabConversation(sendingConversation);
          this.syncActiveTabContextUsageIdentity();
          await this.refreshActiveTabContextUsageFromServer();
          logAssistantFinalizationStage('assistant-message-finalization-complete', {
            tabNeedsAttentionCleared: true,
            latestAssistantMessage: this.summarizeChatMessageForDebug(
              [...sendingConversation.messages].reverse().find((message) => message.role === 'assistant'),
            ),
          });
        } else {
          this.tabManager?.setTabNeedsAttention(sendingTabId, true);
          logAssistantFinalizationStage('assistant-message-finalization-complete', {
            tabNeedsAttentionCleared: false,
          });
        }
      } finally {
        if (shouldSyncFromServer) {
          sendingRuntime.isConversationSyncInFlight = false;
          logAssistantFinalizationStage('conversation-sync-lock-cleared');
        }
      }
    }
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
    const noticeMessage = this.buildStreamErrorNotice(timestamp, message, modelId);
    const { messageEl } = this.createAssistantMessageElement(activeTabId);
    await this.renderAssistantPlaceholderAsNotice(messageEl, noticeMessage, 'render-stream-error-notice');
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
      await this.renderNoticeCard(content, message);
      this.addTimestampWithCopyButton(messageEl, message.timestamp, undefined, message.modelId);
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
    const streamStatusLabel = this.getAssistantStreamStatusLabel(message);

    if (message.contentBlocks && message.contentBlocks.length > 0) {
      const nonTextBlocks = message.contentBlocks.filter((block) => block.type !== 'text');
      const textBlocks = message.contentBlocks.filter((block) => block.type === 'text');

      for (const block of nonTextBlocks) {
        await this.renderContentBlock(content, block);
      }
      if (message.questionResolution && this.shouldRenderQuestionResolutionCards()) {
        const questionCardEl = content.createDiv({
          cls: 'opencodian-question-inline opencodian-question-inline--resolved',
        });
        this.populateQuestionResolutionCard(questionCardEl, message.questionResolution);
      }
      for (const block of textBlocks) {
        await this.renderContentBlock(content, block);
      }

      this.addTimestampWithCopyButton(
        messageEl,
        message.timestamp,
        this.getAssistantCopyContent(message),
        message.modelId,
        streamStatusLabel,
      );
      return;
    }

    if (message.questionResolution && this.shouldRenderQuestionResolutionCards()) {
      const questionCardEl = content.createDiv({
        cls: 'opencodian-question-inline opencodian-question-inline--resolved',
      });
      this.populateQuestionResolutionCard(questionCardEl, message.questionResolution);
    }

    if (message.content) {
      const textEl = content.createDiv({ cls: 'opencodian-message-text' });
      if (this.markdownService) {
        await this.markdownService.render(textEl, message.content);
      } else {
        textEl.textContent = message.content;
      }
    }

    this.addTimestampWithCopyButton(
      messageEl,
      message.timestamp,
      this.getAssistantCopyContent(message),
      message.modelId,
      streamStatusLabel,
    );
  }

  private getAssistantCopyContent(message: ChatMessage): string | undefined {
    if (message.contentBlocks && message.contentBlocks.length > 0) {
      const textContent = message.contentBlocks
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text?.trim())
        .filter(Boolean)
        .join('\n\n');
      return textContent || undefined;
    }

    return message.content || undefined;
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
      setupCollapsible(container, collapseToggleEl, textEl, collapsibleState, {
        showMoreLabel: t('chat.action.showMore'),
        showLessLabel: t('chat.action.showLess'),
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
    setupCollapsible(rawWrapperEl, rawToggleEl, rawContentEl, rawState, {
      collapsedHeight: 96,
      showMoreLabel: t('chat.omo.injected.showRaw'),
      showLessLabel: t('chat.omo.injected.hideRaw'),
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
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (message.omo?.kind !== 'user-injection' || message.omo.modeTag !== 'search-mode') {
      return;
    }

    runtime.backgroundTaskStartedAt = message.timestamp;
    runtime.backgroundTaskActiveAnchorKey = this.getMessageAnchorKey(message);
    runtime.backgroundTaskModeTag = message.omo.modeTag;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskAwaitingAuthoritativeSync = true;
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
    runtime.backgroundTaskStaleNoticeFingerprint = null;
    runtime.backgroundTaskSuppressedFingerprint = null;
  }

  private resetBackgroundTaskIndicator(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.backgroundTaskIndicatorEl?.remove();
    runtime.backgroundTaskIndicatorEl = null;
    for (const element of runtime.backgroundTaskInlineEls.values()) {
      element.remove();
    }
    runtime.backgroundTaskInlineEls.clear();
    runtime.backgroundTaskStartedAt = null;
    runtime.backgroundTaskActiveAnchorKey = null;
    runtime.backgroundTaskModeTag = null;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskAwaitingAuthoritativeSync = false;
    runtime.backgroundTaskLaunches.clear();
    runtime.backgroundTaskCompletedTasks.clear();
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
    runtime.backgroundTaskStaleNoticeFingerprint = null;
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

  private createBackgroundTaskSegment(
    anchorMessage: ChatMessage,
  ): BackgroundTaskSegment {
    return {
      anchorKey: this.getMessageAnchorKey(anchorMessage),
      anchorTimestamp: anchorMessage.timestamp,
      modeTag: anchorMessage.omo?.kind === 'user-injection' ? anchorMessage.omo.modeTag : null,
      launches: [],
      completed: [],
      pending: [],
      sawAllTasksComplete: false,
      waitingForFollowUp: false,
      completionEvents: [],
    };
  }

  private addCompletionToSegment(
    segment: BackgroundTaskSegment,
    completion: BackgroundTaskCompletionInfo,
  ): void {
    if (segment.completed.some((item) => item.taskId === completion.taskId && item.description === completion.description)) {
      return;
    }

    segment.completed.push(completion);
  }

  private findBackgroundTaskSegmentByTaskId(
    segments: BackgroundTaskSegment[],
    taskId: string,
  ): BackgroundTaskSegment | null {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index].launches.some((launch) => launch.taskId === taskId)) {
        return segments[index];
      }
    }

    return null;
  }

  private getLatestPendingBackgroundTaskSegment(
    segments: BackgroundTaskSegment[],
  ): BackgroundTaskSegment | null {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index].pending.length > 0 || segments[index].launches.length > 0) {
        return segments[index];
      }
    }

    return null;
  }

  private collectBackgroundTaskSegments(
    messages: ChatMessage[],
    tabId: TabId | null = this.getActiveTabId(),
  ): BackgroundTaskSegment[] {
    if (messages.length === 0) {
      return [];
    }

    const segments: BackgroundTaskSegment[] = [];
    const segmentByAnchorKey = new Map<string, BackgroundTaskSegment>();
    let latestUserMessage: ChatMessage | null = null;

    const getOrCreateSegment = (anchorMessage: ChatMessage | null): BackgroundTaskSegment | null => {
      if (!anchorMessage) {
        return null;
      }

      const anchorKey = this.getMessageAnchorKey(anchorMessage);
      const existing = segmentByAnchorKey.get(anchorKey);
      if (existing) {
        return existing;
      }

      const created = this.createBackgroundTaskSegment(anchorMessage);
      segmentByAnchorKey.set(anchorKey, created);
      segments.push(created);
      return created;
    };

    const applyReminderToSegment = (
      segment: BackgroundTaskSegment | null,
      message: ChatMessage,
    ): void => {
      if (!segment || message.omo?.kind !== 'system-reminder') {
        return;
      }

      const tasks = (message.omo.tasks ?? [])
        .filter((task) => task.id || task.description)
        .map((task) => ({
          taskId: task.id || task.description,
          description: task.description || t('chat.backgroundTask.noDescription'),
        }));

      for (const completion of tasks) {
        this.addCompletionToSegment(segment, completion);
      }

      segment.completionEvents.push({
        anchorKey: segment.anchorKey,
        reminderMessageId: message.sourceMessageId ?? message.id,
        reminderType: message.omo.reminderType === 'all-background-tasks-complete'
          ? 'all-background-tasks-complete'
          : 'background-task-completed',
        tasks,
        timestamp: message.timestamp,
      });

      if (message.omo.reminderType === 'all-background-tasks-complete') {
        segment.sawAllTasksComplete = true;
      }
    };

    for (const message of messages) {
      if (message.role === 'user') {
        latestUserMessage = message;
        if (message.omo?.kind === 'user-injection' && message.omo.modeTag === 'search-mode') {
          getOrCreateSegment(message);
        }
        continue;
      }

      for (const block of message.contentBlocks ?? []) {
        if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
          continue;
        }

        const segment = getOrCreateSegment(latestUserMessage);
        if (!segment) {
          continue;
        }

        const launches = new Map(segment.launches.map((launch) => [launch.launchId, launch] as const));
        this.upsertBackgroundTaskLaunch({
          id: block.toolId,
          input: block.toolInput ?? {},
          result: block.toolResult,
        }, launches);
        segment.launches = Array.from(launches.values());
      }

      if (!this.isBackgroundTaskCompletionReminder(message) || message.omo?.kind !== 'system-reminder') {
        continue;
      }

      const matched = new Set<BackgroundTaskSegment>();
      for (const task of message.omo.tasks ?? []) {
        if (!task.id) {
          continue;
        }
        const segment = this.findBackgroundTaskSegmentByTaskId(segments, task.id);
        if (segment) {
          matched.add(segment);
        }
      }

      if (matched.size === 0) {
        const fallback = this.getLatestPendingBackgroundTaskSegment(segments) ?? getOrCreateSegment(latestUserMessage);
        if (fallback) {
          matched.add(fallback);
        }
      }

      for (const segment of matched) {
        applyReminderToSegment(segment, message);
      }
    }

    const runtime = this.getTabRuntimeState(tabId);
    if (runtime?.backgroundTaskActiveAnchorKey && runtime.backgroundTaskStartedAt) {
      const existing = segmentByAnchorKey.get(runtime.backgroundTaskActiveAnchorKey);
      const segment = existing ?? {
        anchorKey: runtime.backgroundTaskActiveAnchorKey,
        anchorTimestamp: runtime.backgroundTaskStartedAt,
        modeTag: runtime.backgroundTaskModeTag,
        launches: [],
        completed: [],
        pending: [],
        sawAllTasksComplete: false,
        waitingForFollowUp: false,
        completionEvents: [],
      };

      if (!existing) {
        segmentByAnchorKey.set(segment.anchorKey, segment);
        segments.push(segment);
      }

      const launches = new Map(segment.launches.map((launch) => [launch.launchId, launch] as const));
      for (const launch of runtime.backgroundTaskLaunches.values()) {
        launches.set(launch.launchId, launch);
      }
      segment.launches = Array.from(launches.values());

      const completed = new Map(segment.completed.map((item) => [item.taskId, item] as const));
      for (const item of runtime.backgroundTaskCompletedTasks.values()) {
        completed.set(item.taskId, item);
      }
      segment.completed = Array.from(completed.values());
      segment.modeTag = segment.modeTag ?? runtime.backgroundTaskModeTag;
      segment.waitingForFollowUp = runtime.backgroundTaskWaitingForFollowUp;
    }

    for (const segment of segments) {
      segment.pending = this.filterPendingBackgroundTaskLaunches(segment.launches, segment.completed);
      segment.waitingForFollowUp = segment.waitingForFollowUp || segment.pending.length > 0;
      if (segment.sawAllTasksComplete) {
        segment.pending = [];
        segment.waitingForFollowUp = false;
      }
    }

    return segments.sort((left, right) => left.anchorTimestamp - right.anchorTimestamp);
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
    runtime.backgroundTaskActiveAnchorKey = null;
    runtime.backgroundTaskModeTag = null;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskAwaitingAuthoritativeSync = false;
    runtime.backgroundTaskLaunches.clear();
    runtime.backgroundTaskCompletedTasks.clear();
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
    runtime.backgroundTaskStaleNoticeFingerprint = null;

    if (!conversation || conversation.messages.length === 0) {
      runtime.backgroundTaskIndicatorEl?.remove();
      runtime.backgroundTaskIndicatorEl = null;
      for (const element of runtime.backgroundTaskInlineEls.values()) {
        element.remove();
      }
      runtime.backgroundTaskInlineEls.clear();
      this.syncTabStreamLikeState(tabId);
      return;
    }

    const segments = this.collectBackgroundTaskSegments(conversation.messages, tabId);
    const latestActiveSegment = [...segments]
      .reverse()
      .find((segment) =>
        !this.isSuppressedBackgroundTaskSegment(segment, tabId, conversation)
        && !segment.sawAllTasksComplete
        && (segment.pending.length > 0 || (segment.modeTag === 'search-mode' && segment.launches.length === 0))
      ) ?? null;

    if (!latestActiveSegment) {
      runtime.backgroundTaskIndicatorEl?.remove();
      runtime.backgroundTaskIndicatorEl = null;
      this.syncTabStreamLikeState(tabId);
      return;
    }

    runtime.backgroundTaskStartedAt = latestActiveSegment.anchorTimestamp;
    runtime.backgroundTaskActiveAnchorKey = latestActiveSegment.anchorKey;
    runtime.backgroundTaskModeTag = latestActiveSegment.modeTag;
    runtime.backgroundTaskWaitingForFollowUp = latestActiveSegment.waitingForFollowUp && !runtime.isStreaming;
    runtime.backgroundTaskAwaitingAuthoritativeSync = runtime.backgroundTaskAwaitingAuthoritativeSync
      || runtime.isHydratingConversation;
    for (const launch of latestActiveSegment.launches) {
      runtime.backgroundTaskLaunches.set(launch.launchId, launch);
    }
    for (const completion of latestActiveSegment.completed) {
      runtime.backgroundTaskCompletedTasks.set(completion.taskId, completion);
    }
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

  private async handleStreamingToolCallStart(
    toolCall: ToolCallInfo,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.applyStreamingTodoSnapshotFromTool(toolCall, tabId);

    if (!this.isBackgroundTaskTool(toolCall.name)) {
      return;
    }

    if (!runtime.backgroundTaskStartedAt) {
      runtime.backgroundTaskStartedAt = Date.now();
    }
    runtime.backgroundTaskAwaitingAuthoritativeSync = true;
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
    runtime.backgroundTaskStaleNoticeFingerprint = null;
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

    this.applyStreamingTodoSnapshotFromTool(toolCall, tabId);

    if (toolCall.name === 'todowrite' || toolCall.name === 'todoread') {
      const sessionId = this.getSessionIdForTab(tabId);
      if (sessionId) {
        await this.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true });
      }
    }

    if (!this.isBackgroundTaskTool(toolCall.name)) {
      return;
    }

    this.upsertBackgroundTaskLaunch({
      id: toolCall.id,
      input: toolCall.input ?? {},
      result: toolCall.result,
    }, runtime.backgroundTaskLaunches);
    runtime.backgroundTaskAwaitingAuthoritativeSync = true;
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
    runtime.backgroundTaskStaleNoticeFingerprint = null;
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

    this.reconcileBackgroundTaskStateFromLiveSignals(tabId);
    await this.renderInlineBackgroundTaskPanels(tabId);
    await this.queueBackgroundTaskCompletionNotices(tabId);
    await this.flushQueuedBackgroundTaskCompletionNotices(tabId);
    this.syncTabStreamLikeState(tabId);
  }

  private shouldRenderInlineBackgroundTaskSegment(segment: BackgroundTaskSegment): boolean {
    if (segment.sawAllTasksComplete) {
      return false;
    }

    if (segment.pending.length > 0) {
      return true;
    }

    return segment.modeTag === 'search-mode' && segment.launches.length === 0;
  }

  private buildBackgroundTaskTasksMarkdown(segment: BackgroundTaskSegment): string | undefined {
    const lines: string[] = [];

    if (segment.completed.length === 0 && segment.pending.length === 0) {
      return undefined;
    }

    lines.push(`**${t('chat.backgroundTask.taskListLabel')}**`);

    for (const task of segment.completed) {
      lines.push(`- ${t('chat.backgroundTask.taskStatusCompleted')} · \`${task.taskId}\`: ${task.description}`);
    }

    for (const task of segment.pending) {
      lines.push(`- ${t('chat.backgroundTask.taskStatusRunning')} · \`${this.getBackgroundTaskLaunchDisplayId(task)}\`: ${task.description}`);
    }

    return lines.join('\n');
  }

  private getBackgroundTaskInlineCopy(
    segment: BackgroundTaskSegment,
  ): { title: string; body: string; detail?: string; tasksMarkdown?: string } {
    const total = segment.launches.length;
    const completed = Math.min(total, segment.completed.length);
    const tasksMarkdown = this.buildBackgroundTaskTasksMarkdown(segment);

    if (total === 0) {
      return {
        title: t('chat.backgroundTask.preparingTitle'),
        body: t('chat.backgroundTask.preparingBody'),
        tasksMarkdown,
      };
    }

    if (segment.waitingForFollowUp) {
      return {
        title: t('chat.backgroundTask.waitingTitle'),
        body: t('chat.backgroundTask.waitingBody', {
          total: String(total),
          completed: String(completed),
        }),
        detail: t('chat.backgroundTask.progressDetail', {
          total: String(total),
          completed: String(completed),
        }),
        tasksMarkdown,
      };
    }

    return {
      title: t('chat.backgroundTask.runningTitle'),
      body: t('chat.backgroundTask.runningBody', {
        total: String(total),
        completed: String(completed),
      }),
      detail: t('chat.backgroundTask.progressDetail', {
        total: String(total),
        completed: String(completed),
      }),
      tasksMarkdown,
    };
  }

  private async renderInlineBackgroundTaskPanels(
    tabId: TabId | null = this.getActiveTabId(),
    conversation: Conversation | null = this.currentConversation,
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const segments = this.collectBackgroundTaskSegments(conversation?.messages ?? [], tabId)
      .filter((segment) =>
        this.shouldRenderInlineBackgroundTaskSegment(segment)
        && !this.isSuppressedBackgroundTaskSegment(segment, tabId, conversation),
      );
    const activeKeys = new Set(segments.map((segment) => segment.anchorKey));

    for (const [anchorKey, element] of runtime.backgroundTaskInlineEls.entries()) {
      if (activeKeys.has(anchorKey)) {
        continue;
      }
      element.remove();
      runtime.backgroundTaskInlineEls.delete(anchorKey);
      if (runtime.backgroundTaskIndicatorEl === element) {
        runtime.backgroundTaskIndicatorEl = null;
      }
    }

    for (const segment of segments) {
      const parentEl = runtime.turnBodyByAnchorKey.get(segment.anchorKey);
      if (!parentEl?.isConnected) {
        continue;
      }

      let panelEl = runtime.backgroundTaskInlineEls.get(segment.anchorKey);
      if (!panelEl || !panelEl.isConnected) {
        panelEl = parentEl.createDiv({
          cls: 'opencodian-background-task-inline',
        });
        panelEl.dataset.anchorKey = segment.anchorKey;
        runtime.backgroundTaskInlineEls.set(segment.anchorKey, panelEl);
      }

      if (panelEl.parentElement !== parentEl || panelEl !== parentEl.lastElementChild) {
        parentEl.appendChild(panelEl);
      }

      panelEl.empty();

      const cardEl = panelEl.createDiv({ cls: 'opencodian-chat-notice-card is-info is-background-task is-inline' });
      const iconEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-icon opencodian-chat-notice-icon--background-task' });
      setIcon(iconEl, 'loader');

      const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });
      const copy = this.getBackgroundTaskInlineCopy(segment);
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

      if (runtime.backgroundTaskActiveAnchorKey === segment.anchorKey) {
        runtime.backgroundTaskIndicatorEl = panelEl;
      }
    }
  }

  private getPersistedBackgroundTaskCompletionNoticeFingerprints(
    conversation: Conversation | null,
  ): Set<string> {
    const fingerprints = new Set<string>();
    for (const message of conversation?.messages ?? []) {
      const meta = message.noticeMeta;
      if (meta?.kind !== 'background-task-completion') {
        continue;
      }
      fingerprints.add(this.getBackgroundTaskCompletionNoticeFingerprint({
        anchorKey: meta.anchorKey ?? 'unknown',
        allComplete: Boolean(meta.allComplete),
        taskIds: meta.taskIds ?? [],
      }));
      for (const reminderId of meta.sourceReminderIds ?? []) {
        fingerprints.add(`source:${reminderId}`);
      }
    }

    return fingerprints;
  }

  private getBackgroundTaskCompletionNoticeFingerprint(input: {
    anchorKey: string;
    allComplete: boolean;
    taskIds: string[];
  }): string {
    const taskIds = [...new Set(input.taskIds)].sort();
    return JSON.stringify({
      anchorKey: input.anchorKey,
      allComplete: input.allComplete,
      taskIds,
    });
  }

  private async queueBackgroundTaskCompletionNotices(
    tabId: TabId | null = this.getActiveTabId(),
    conversation: Conversation | null = this.currentConversation,
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !conversation) {
      return;
    }

    const persisted = this.getPersistedBackgroundTaskCompletionNoticeFingerprints(conversation);
    const segments = this.collectBackgroundTaskSegments(conversation.messages, tabId);

    for (const segment of segments) {
      for (const event of segment.completionEvents) {
        const reminderFingerprint = `source:${event.reminderMessageId}`;
        if (persisted.has(reminderFingerprint)) {
          continue;
        }

        let queued = runtime.queuedBackgroundTaskCompletionNotices.get(segment.anchorKey);
        if (!queued) {
          queued = {
            anchorKey: segment.anchorKey,
            allComplete: false,
            sourceReminderIds: new Set(),
            tasks: new Map(),
            latestTimestamp: event.timestamp,
          };
          runtime.queuedBackgroundTaskCompletionNotices.set(segment.anchorKey, queued);
        }

        queued.latestTimestamp = Math.max(queued.latestTimestamp, event.timestamp);
        queued.sourceReminderIds.add(event.reminderMessageId);
        queued.allComplete = queued.allComplete || event.reminderType === 'all-background-tasks-complete';
        for (const task of event.tasks) {
          queued.tasks.set(task.taskId, task);
        }
      }
    }
  }

  private buildBackgroundTaskCompletionNoticeContent(
    queued: QueuedBackgroundTaskCompletionNotice,
  ): string {
    const tasks = [...queued.tasks.values()].sort((left, right) =>
      left.taskId.localeCompare(right.taskId) || left.description.localeCompare(right.description),
    );
    const lines = queued.allComplete
      ? [t('chat.omo.system.allCompletedSummary')]
      : [t('chat.omo.system.backgroundCompletedSummary')];

    if (tasks.length > 0) {
      lines.push('', `**${t('chat.backgroundTask.taskListLabel')}**`);
      for (const task of tasks) {
        lines.push(`- \`${task.taskId}\`: ${task.description}`);
      }
    }

    return lines.join('\n');
  }

  private async flushQueuedBackgroundTaskCompletionNotices(
    tabId: TabId | null = this.getActiveTabId(),
    conversation: Conversation | null = this.currentConversation,
  ): Promise<void> {
    const runtime = this.getTabRuntimeState(tabId);
    if (!runtime || !conversation || runtime.isStreaming) {
      return;
    }

    for (const [anchorKey, queued] of [...runtime.queuedBackgroundTaskCompletionNotices.entries()]) {
      const taskIds = [...queued.tasks.keys()].sort();
      const fingerprint = this.getBackgroundTaskCompletionNoticeFingerprint({
        anchorKey,
        allComplete: queued.allComplete,
        taskIds,
      });
      if (this.getPersistedBackgroundTaskCompletionNoticeFingerprints(conversation).has(fingerprint)) {
        runtime.queuedBackgroundTaskCompletionNotices.delete(anchorKey);
        continue;
      }

      const title = queued.allComplete
        ? t('chat.omo.system.allCompleted')
        : t('chat.omo.system.backgroundCompleted');
      const content = this.buildBackgroundTaskCompletionNoticeContent(queued);
      await this.appendPersistentAssistantNoticeMessage(
        title,
        content,
        'info',
        undefined,
        {
          conversation,
          tabId,
          timestamp: queued.latestTimestamp,
          noticeMeta: {
            kind: 'background-task-completion',
            conversationId: conversation.id,
            anchorKey,
            sourceReminderIds: [...queued.sourceReminderIds].sort(),
            allComplete: queued.allComplete,
            taskIds,
          },
        },
      );
      logger.debug('Background task completion notice persisted', {
        tabId,
        anchorKey,
        allComplete: queued.allComplete,
        taskCount: taskIds.length,
        reminderCount: queued.sourceReminderIds.size,
      });
      runtime.queuedBackgroundTaskCompletionNotices.delete(anchorKey);
    }
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

  private revealStreamingAssistantMessageElement(tabId: TabId | null = this.getActiveTabId()): HTMLElement | null {
    const messageEl = this.getTabRuntimeState(tabId)?.streamingMessageEl ?? null;
    if (!messageEl) {
      return null;
    }

    const wasHidden = messageEl.hidden;
    this.setStreamingAssistantMessageVisibility(messageEl, true, 'reveal-streaming-shell');

    if (wasHidden && this.getActiveTabId() === tabId) {
      this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
    }

    return messageEl;
  }

  /** Create assistant message element for streaming */
  private createAssistantMessageElement(
    tabId: TabId | null = this.getActiveTabId(),
    hiddenUntilVisible = false,
  ): { messageEl: HTMLElement; contentEl: HTMLElement } {
    const paneState = this.getTabPaneState(tabId);
    const messageEl = this.ensureTurnBody(tabId)?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant is-streaming',
    });

    if (!messageEl) {
      const fallback = document.createElement('div');
      return { messageEl: fallback, contentEl: fallback };
    }

    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    this.ensureAssistantTimestampRow(messageEl, true);
    this.setStreamingAssistantMessageVisibility(
      messageEl,
      !hiddenUntilVisible,
      hiddenUntilVisible ? 'create-streaming-shell-hidden' : 'create-streaming-shell-visible',
    );

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
    statusLabel?: string,
  ): void {
    const timeRow = this.ensureAssistantTimestampRow(messageEl);
    const fragment = document.createDocumentFragment();

    // Timestamp
    const timeStr = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const timeTextEl = document.createElement('span');
    timeTextEl.className = 'opencodian-message-time-text';
    timeTextEl.textContent = timeStr;
    fragment.appendChild(timeTextEl);

    if (modelId) {
      const modelEl = document.createElement('span');
      modelEl.className = 'opencodian-message-model-id';
      modelEl.textContent = `· ${modelId}`;
      fragment.appendChild(modelEl);
    }

    if (statusLabel) {
      const statusEl = document.createElement('span');
      statusEl.className = 'opencodian-message-time-status is-warning';
      statusEl.textContent = statusLabel;
      fragment.appendChild(statusEl);
    }
    if (content) {
      const copyBtn = document.createElement('span');
      copyBtn.className = 'opencodian-copy-btn-inline';
      copyBtn.innerHTML = COPY_ICON;
      this.attachCopyButtonBehavior(copyBtn, content);
      fragment.appendChild(copyBtn);
    }

    timeRow.replaceChildren(fragment);
    timeRow.classList.remove('is-pending');
    if (messageEl.classList.contains('is-streaming')) {
      // Pin animation to 'none' before removing is-streaming so the base
      // messageSlideIn keyframe does not re-trigger and cause a visual flicker.
      messageEl.style.animation = 'none';
      messageEl.removeClass('is-streaming');
    }
    this.setStreamingAssistantMessageVisibility(messageEl, true, 'finalize-streaming-shell');
  }

  private ensureAssistantTimestampRow(messageEl: HTMLElement, reserveSpace = false): HTMLElement {
    const existingRow = messageEl.querySelector('.opencodian-message-time-row');
    const timeRow = existingRow instanceof HTMLElement
      ? existingRow
      : messageEl.createDiv({ cls: 'opencodian-message-time-row' });

    timeRow.classList.toggle('is-pending', reserveSpace);
    return timeRow;
  }

  private getAssistantStreamStatusLabel(message: ChatMessage): string | undefined {
    if (message.streamState === 'interrupted') {
      return t('chat.stream.interruptedBadge');
    }

    return undefined;
  }

  private buildInterruptedAssistantNotice(timestamp: number, modelId?: string): ChatMessage {
    return {
      id: `assistant-interrupted-${timestamp}`,
      role: 'assistant',
      content: t('chat.stream.interruptedNoticeBody'),
      timestamp,
      modelId,
      displayStyle: 'notice',
      noticeTitle: t('chat.stream.interruptedNoticeTitle'),
      noticeTone: 'warning',
    };
  }

  private buildStreamErrorNotice(
    timestamp: number,
    content: string,
    modelId?: string,
    sourceMessageId?: string,
  ): ChatMessage {
    return {
      id: sourceMessageId ? `assistant-error-notice-${sourceMessageId}` : `assistant-error-notice-${timestamp}`,
      role: 'assistant',
      content,
      timestamp,
      modelId,
      sourceMessageId,
      displayStyle: 'notice',
      noticeTitle: t('chat.notice.streamErrorTitle'),
      noticeTone: 'error',
    };
  }

  private async renderAssistantPlaceholderAsNotice(
    messageEl: HTMLElement,
    noticeMessage: ChatMessage,
    reason = 'render-notice',
  ): Promise<void> {
    messageEl.dataset.messageId = noticeMessage.id;
    if (noticeMessage.sourceMessageId) {
      messageEl.dataset.sourceMessageId = noticeMessage.sourceMessageId;
    } else {
      delete messageEl.dataset.sourceMessageId;
    }
    messageEl.addClass('opencodian-message--assistant');
    messageEl.addClass('opencodian-message--notice');
    messageEl.removeClass('opencodian-message--background-task');
    messageEl.empty();
    this.setStreamingAssistantMessageVisibility(messageEl, true, reason);

    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    await this.renderNoticeCard(contentEl, noticeMessage);
    this.addTimestampWithCopyButton(messageEl, noticeMessage.timestamp, undefined, noticeMessage.modelId);
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
        await this.refreshActiveTabContextUsageFromServer();
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
    if (!this.currentConversation || this.currentConversation.id !== conversation.id || !this.messagesContainer) {
      return;
    }

    this.logAssistantFinalizationDebug('rerender-conversation-messages-start', {
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      messageCount: conversation.messages.length,
      tailAssistant: this.summarizeChatMessageForDebug(
        [...conversation.messages].reverse().find((message) => message.role === 'assistant'),
      ),
    });
    const messagesEl = this.messagesContainer;
    const shouldStickToBottom = this.getActiveTabRuntimeState()?.autoScrollEnabled ?? this.isNearBottomForElement(messagesEl);
    const previousScrollTop = messagesEl.scrollTop;
    const activeTabId = this.getActiveTabId();
    this.beginConversationHydration(activeTabId);
    const scrollSnapshot = this.captureElementScrollRestoreSnapshot(
      messagesEl,
      shouldStickToBottom,
      previousScrollTop,
    );

    this.clearScheduledScrollToBottom();
    messagesEl.addClass('is-rehydrating');
    this.messagesContainer.empty();
    this.resetTurnState();

    try {
      await this.renderMessages(conversation.messages);
      await this.renderBackgroundTaskIndicatorIfNeeded();
      this.restoreElementScrollAfterRender(messagesEl, scrollSnapshot);
      this.scheduleComposerLayoutSync();

      window.requestAnimationFrame(() => {
        messagesEl.removeClass('is-rehydrating');
      });
    } finally {
      this.endConversationHydration(activeTabId);
    }
    this.logAssistantFinalizationDebug('rerender-conversation-messages-complete', {
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      shouldStickToBottom,
      previousScrollTop,
    });
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
    const fail = (reason: string, payload: Record<string, unknown> = {}): false => {
      this.logAssistantFinalizationDebug('patch-trailing-assistant-render-skipped', {
        reason,
        tabId,
        previousRenderedCount: this.getMessagesForRender(previousMessages).length,
        nextRenderedCount: this.getMessagesForRender(nextMessages).length,
        ...payload,
      });
      return false;
    };
    if (!this.messagesContainer || this.getActiveTabId() !== tabId) {
      return fail('missing-container-or-inactive-tab');
    }

    const previousRenderedMessages = this.getMessagesForRender(previousMessages);
    const nextRenderedMessages = this.getMessagesForRender(nextMessages);
    if (
      previousRenderedMessages.length === 0
      || previousRenderedMessages.length !== nextRenderedMessages.length
    ) {
      return fail('rendered-message-count-mismatch');
    }

    const lastIndex = previousRenderedMessages.length - 1;
    for (let index = 0; index < lastIndex; index += 1) {
      if (
        this.getMessageVisualSignature(previousRenderedMessages[index])
        !== this.getMessageVisualSignature(nextRenderedMessages[index])
      ) {
        return fail('non-tail-message-signature-mismatch', {
          mismatchIndex: index,
        });
      }
    }

    const previousTailMessage = previousRenderedMessages[lastIndex];
    const nextTailMessage = nextRenderedMessages[lastIndex];
    if (
      previousTailMessage.role !== 'assistant'
      || nextTailMessage.role !== 'assistant'
      || previousTailMessage.displayStyle === 'notice'
      || nextTailMessage.displayStyle === 'notice'
    ) {
      return fail('tail-message-not-mergeable-assistant', {
        previousTail: this.summarizeChatMessageForDebug(previousTailMessage),
        nextTail: this.summarizeChatMessageForDebug(nextTailMessage),
      });
    }

    const existingTailMessageEl = Array.from(
      this.messagesContainer.querySelectorAll<HTMLElement>('.opencodian-message--assistant'),
    )
      .filter((element) => !element.classList.contains('opencodian-message--notice'))
      .pop();
    if (!existingTailMessageEl || !(existingTailMessageEl.parentElement instanceof HTMLElement)) {
      return fail('missing-existing-tail-element');
    }

    const parentEl = existingTailMessageEl.parentElement;
    const runtime = this.getTabRuntimeState(tabId);
    const previousTurnBodyEl = runtime?.currentTurnBodyEl ?? null;
    const shouldStickToBottom = this.shouldAutoScroll(tabId);
    const existingContentEl = existingTailMessageEl.querySelector('.opencodian-message-content');
    if (!(existingContentEl instanceof HTMLElement)) {
      return fail('missing-tail-content-element');
    }

    if (runtime) {
      runtime.currentTurnBodyEl = parentEl;
    }

    try {
      existingTailMessageEl.dataset.messageId = nextTailMessage.id;
      if (nextTailMessage.sourceMessageId) {
        existingTailMessageEl.dataset.sourceMessageId = nextTailMessage.sourceMessageId;
      } else {
        delete existingTailMessageEl.dataset.sourceMessageId;
      }
      if (this.getAssistantBodySignature(previousTailMessage) === this.getAssistantBodySignature(nextTailMessage)) {
        this.addTimestampWithCopyButton(
          existingTailMessageEl,
          nextTailMessage.timestamp,
          this.getAssistantCopyContent(nextTailMessage),
          nextTailMessage.modelId,
          this.getAssistantStreamStatusLabel(nextTailMessage),
        );
      } else {
        existingContentEl.empty();
        await this.renderAssistantMessageContent(existingTailMessageEl, existingContentEl, nextTailMessage);
      }
      existingTailMessageEl.style.animation = 'none';
      if (shouldStickToBottom) {
        this.scrollToBottom({ tabId });
      }
      this.logAssistantFinalizationDebug('patch-trailing-assistant-render-complete', {
        tabId,
        shouldStickToBottom,
        previousTail: this.summarizeChatMessageForDebug(previousTailMessage),
        nextTail: this.summarizeChatMessageForDebug(nextTailMessage),
      });
      return true;
    } finally {
      if (runtime) {
        runtime.currentTurnBodyEl = previousTurnBodyEl ?? parentEl;
      }
    }
  }

  private async applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void> {
    if (!this.currentConversation) {
      return;
    }

    const incrementalUpdate = this.getIncrementalRenderedMessageUpdate(previousMessages, nextMessages);
    if (!incrementalUpdate) {
      await this.rerenderConversationMessages(this.currentConversation);
      return;
    }

    const shouldStickToBottom = this.shouldAutoScroll();
    this.syncBackgroundTaskStateFromConversation(this.currentConversation);

    if (incrementalUpdate.patchTrailingAssistant) {
      const patchedTail = await this.patchTrailingAssistantRender(previousMessages, nextMessages);
      if (!patchedTail) {
        await this.rerenderConversationMessages(this.currentConversation);
        return;
      }
    }

    for (const messageToRender of incrementalUpdate.appendedRenderedMessages) {
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

  private getIncrementalRenderedMessageUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): {
    appendedRenderedMessages: ChatMessage[];
    patchTrailingAssistant: boolean;
  } | null {
    const previousRenderedMessages = this.getMessagesForRender(previousMessages);
    const nextRenderedMessages = this.getMessagesForRender(nextMessages);

    if (nextRenderedMessages.length < previousRenderedMessages.length) {
      return null;
    }

    if (previousRenderedMessages.length === 0) {
      return {
        appendedRenderedMessages: nextRenderedMessages,
        patchTrailingAssistant: false,
      };
    }

    for (let index = 0; index < previousRenderedMessages.length - 1; index += 1) {
      if (
        this.getMessageVisualSignature(previousRenderedMessages[index])
        !== this.getMessageVisualSignature(nextRenderedMessages[index])
      ) {
        return null;
      }
    }

    const lastSharedIndex = previousRenderedMessages.length - 1;
    const patchTrailingAssistant = this.getMessageVisualSignature(previousRenderedMessages[lastSharedIndex])
      !== this.getMessageVisualSignature(nextRenderedMessages[lastSharedIndex]);

    return {
      appendedRenderedMessages: nextRenderedMessages.slice(previousRenderedMessages.length),
      patchTrailingAssistant,
    };
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

  private isNearBottomForElement(messagesEl: HTMLElement, threshold?: number): boolean {
    return isNearBottomByMetrics({
      scrollTop: messagesEl.scrollTop,
      scrollHeight: messagesEl.scrollHeight,
      clientHeight: messagesEl.clientHeight,
    }, threshold);
  }

  private isNearBottom(threshold?: number): boolean {
    if (!this.messagesContainer) {
      return true;
    }

    return this.isNearBottomForElement(this.messagesContainer, threshold);
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

    if (options.enableAutoScroll) {
      paneState.runtime.autoScrollEnabled = true;
    }
    paneState.runtime.programmaticScrollGuardUntil = Date.now()
      + getProgrammaticScrollGuardDelayMs(options.behavior);

    if (options.behavior === 'smooth') {
      paneState.messagesEl.scrollTo({
        top: paneState.messagesEl.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      paneState.messagesEl.scrollTop = paneState.messagesEl.scrollHeight;
    }

    this.syncPaneScrollMetrics(tabId, paneState.messagesEl);
  }

  private captureElementScrollRestoreSnapshot(
    messagesEl: HTMLElement,
    shouldStickToBottom: boolean,
    fallbackScrollTop = messagesEl.scrollTop,
  ): ConversationScrollRestoreSnapshot {
    const scrollTop = Number.isFinite(fallbackScrollTop) ? fallbackScrollTop : messagesEl.scrollTop;
    const distanceFromBottom = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight - scrollTop);
    const messageElements = Array.from(messagesEl.querySelectorAll<HTMLElement>('.opencodian-message[data-message-id]'));
    const anchorMessageEl = messageElements.find((element) => {
      const rect = element.getBoundingClientRect();
      const containerRect = messagesEl.getBoundingClientRect();
      return rect.bottom >= containerRect.top;
    }) ?? null;

    return {
      mode: shouldStickToBottom
        ? 'bottom'
        : anchorMessageEl?.dataset.messageId
          ? 'preserve-anchor'
          : 'preserve-distance',
      scrollTop,
      distanceFromBottom,
      anchorMessageId: anchorMessageEl?.dataset.messageId ?? null,
      anchorOffsetTop: anchorMessageEl
        ? anchorMessageEl.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top
        : 0,
    };
  }

  private restoreElementScrollAfterRender(
    messagesEl: HTMLElement,
    snapshot: ConversationScrollRestoreSnapshot,
  ): void {
    const tabId = messagesEl.dataset.tabId ?? null;
    const apply = () => {
      if (snapshot.mode === 'bottom') {
        this.scrollToBottom({ tabId });
        return;
      }

      if (tabId) {
        const runtime = this.getTabRuntimeState(tabId);
        if (runtime) {
          runtime.programmaticScrollGuardUntil = Date.now()
            + getProgrammaticScrollGuardDelayMs();
        }
      }

      const maxScrollTop = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
      let nextScrollTop = Math.min(Math.max(0, snapshot.scrollTop), maxScrollTop);

      if (snapshot.mode === 'preserve-anchor' && snapshot.anchorMessageId) {
        const anchorEl = Array.from(messagesEl.querySelectorAll<HTMLElement>('.opencodian-message[data-message-id]'))
          .find((element) => element.dataset.messageId === snapshot.anchorMessageId) ?? null;
        if (anchorEl) {
          const anchorOffsetTop = anchorEl.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top;
          nextScrollTop = Math.min(
            Math.max(0, messagesEl.scrollTop + (anchorOffsetTop - snapshot.anchorOffsetTop)),
            maxScrollTop,
          );
        } else {
          nextScrollTop = Math.min(Math.max(0, maxScrollTop - snapshot.distanceFromBottom), maxScrollTop);
        }
      } else {
        nextScrollTop = Math.min(Math.max(0, maxScrollTop - snapshot.distanceFromBottom), maxScrollTop);
      }

      messagesEl.scrollTop = nextScrollTop;
      this.syncPaneScrollMetrics(tabId, messagesEl);
    };

    apply();
    window.requestAnimationFrame(apply);
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
      this.syncActiveTabContextUsageIdentity();
    } catch (error) {
      logger.error('Failed to load models:', error);
    }
  }

  /** Update model selector to show current model */
  private updateModelSelectorDisplay(): void {
    const current = this.getCurrentSessionModel();
    const resolution = this.getCurrentSessionModelResolution();

    if (!this.modelSelectorTrigger) return;

    // Find model info from available models
    const modelInfo = this.findKnownModelInfo(current);
    this.modelSelectorTrigger.toggleClass('is-unavailable', resolution.status === 'unavailable');
    this.modelSelectorTrigger.toggleClass('is-unconfigured', !current);

    // Update text
    const textEl = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-text');
    if (textEl) {
      textEl.textContent = current
        ? (modelInfo?.modelName || resolution.modelName || current.model)
        : t('settings.model.unconfigured');
    }

    const emptyStateTitle = this.hasLoadedModelCatalog && this.availableProviders.length === 0
      ? this.getModelUnavailableNoticeContent().message
      : t('settings.model.unconfigured');

    this.modelSelectorTrigger.setAttribute(
      'title',
      resolution.status === 'unavailable'
        ? t('chat.notice.modelUnavailable.selectedBody')
        : current
          ? formatModelReference(
              modelInfo?.providerName || resolution.providerName || current.provider,
              modelInfo?.modelName || resolution.modelName || current.model,
            )
          : emptyStateTitle,
    );

    const iconLabel = modelInfo?.providerName || resolution.providerName || current?.provider || t('settings.model.unconfigured');
    void this.updateModelSelectorIcon(current?.provider ?? null, iconLabel);

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
  private getCurrentSessionModel(): { provider: string; model: string } | null {
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

  private getRequestedSessionModel(): { provider: string; model: string } | null {
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
    selection: { provider: string; model: string } | null,
  ): { providerName?: string; modelName?: string; contextWindow?: number } | null {
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
    options: {
      conversation?: Conversation | null;
      tabId?: TabId | null;
      timestamp?: number;
      noticeMeta?: ChatMessage['noticeMeta'];
    } = {},
  ): Promise<void> {
    const timestamp = options.timestamp ?? Date.now();
    const noticeMessage: ChatMessage = {
      id: `assistant-notice-${timestamp}`,
      role: 'assistant',
      content,
      timestamp,
      displayStyle: 'notice',
      noticeTitle: title,
      noticeTone: tone,
      noticeActions,
      noticeMeta: options.noticeMeta,
    };

    const targetConversation = options.conversation ?? this.currentConversation;
    if (!targetConversation) {
      return;
    }

    const targetTabId = options.tabId ?? this.getActiveTabId();
    const fingerprint = this.getConversationSyncFingerprint([...targetConversation.messages, noticeMessage]);
    const targetConversationIsVisible = this.currentConversation?.id === targetConversation.id;

    if (targetConversationIsVisible) {
      await this.renderMessage(noticeMessage);
    }

    targetConversation.messages.push(noticeMessage);
    targetConversation.updatedAt = timestamp;
    await this.plugin.saveConversation(targetConversation);

    if (targetConversationIsVisible) {
      this.lastConversationSyncFingerprint = fingerprint;
      const runtime = this.getTabRuntimeState(targetTabId);
      if (runtime?.isHydratingConversation) {
        runtime.pendingLayoutMutations += 1;
      } else {
        this.scheduleSettledScrollToBottomIfNeeded();
      }
      return;
    }

    if (targetTabId) {
      const runtime = this.getTabRuntimeState(targetTabId);
      if (runtime) {
        runtime.lastConversationSyncFingerprint = fingerprint;
      }
      this.tabManager?.setTabNeedsAttention(targetTabId, true);
    }
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

    await this.appendPersistentAssistantNoticeMessage(
      t('chat.diffNotice.title'),
      this.buildDiffNoticeMarkdown(entries),
      'info',
      undefined,
      { conversation, tabId },
    );

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
    await this.appendPersistentAssistantNoticeMessage(
      title,
      message,
      'warning',
      [{ type: 'open_model_settings' }],
    );
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

  private getNoticeActionLabel(actionType: NonNullable<ChatMessage['noticeActions']>[number]['type']): string {
    switch (actionType) {
      case 'open_model_settings':
        return t('chat.notice.action.openModelSettings');
      case 'restore_rewind':
        return t('chat.rewind.empty.restore');
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
    new ContextDetailModal(
      this.app,
      this.currentConversation,
      contextState,
      this.plugin.settings.systemPrompt,
      async (): Promise<ContextRawMessageItem[]> => {
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
    const resolution = this.getCurrentSessionModelResolution();
    const modelInfo = this.findKnownModelInfo(currentModel);
    const currentState = this.tabManager.getActiveTabContextUsage() ?? createEmptyTabContextState();
    const nextState = ContextUsageService.syncStateIdentity(
      currentState,
      {
        provider: currentModel?.provider ?? null,
        providerName: modelInfo?.providerName ?? resolution.providerName ?? currentModel?.provider ?? null,
        model: currentModel?.model ?? null,
        modelName: modelInfo?.modelName ?? resolution.modelName ?? currentModel?.model ?? null,
        contextWindow: modelInfo?.contextWindow ?? resolution.contextWindow,
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

  private createStreamingInlineCard(
    className: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): HTMLElement | null {
    const messageEl = this.getTabRuntimeState(tabId)?.streamingMessageEl ?? null;
    if (!messageEl) {
      return null;
    }

    const cardEl = document.createElement('div');
    cardEl.className = className;

    const lastToolCall = messageEl.querySelector('.streaming-tool-call:last-of-type');
    if (lastToolCall?.parentNode) {
      lastToolCall.parentNode.insertBefore(cardEl, lastToolCall.nextSibling);
      this.revealStreamingAssistantMessageElement(tabId);
      return cardEl;
    }

    const contentEl = messageEl.querySelector('.opencodian-message-content');
    if (contentEl) {
      contentEl.appendChild(cardEl);
      this.revealStreamingAssistantMessageElement(tabId);
      return cardEl;
    }

    messageEl.appendChild(cardEl);
    this.revealStreamingAssistantMessageElement(tabId);
    return cardEl;
  }

  private getOrCreateQuestionInlineCard(
    className: string,
    tabId: TabId | null = this.getActiveTabId(),
  ): HTMLElement | null {
    const runtime = this.getTabRuntimeState(tabId);
    const existing = runtime?.questionInlineCardEl ?? null;

    if (existing?.isConnected) {
      existing.className = className;
      existing.empty();
      this.keepQuestionCardPinnedToBottom(tabId);
      return existing;
    }

    const cardEl = this.createStreamingInlineCard(className, tabId);
    if (!cardEl) {
      return null;
    }

    if (runtime) {
      runtime.questionInlineCardEl = cardEl;
    }
    this.keepQuestionCardPinnedToBottom(tabId);
    return cardEl;
  }

  private clearQuestionInlineCard(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getTabRuntimeState(tabId);
    runtime?.questionInlineCardEl?.remove();
    if (runtime) {
      runtime.questionInlineCardEl = null;
    }
  }

  private async showQuestionDialog(
    request: QuestionRequest,
    tabId: TabId | null = this.getActiveTabId(),
  ): Promise<void> {
    if (this.shouldUseAboveInputQuestionDock() && tabId) {
      const waiter = this.getOrCreateQuestionWaiter(request.id, tabId);
      if (waiter) {
        this.enqueuePendingQuestionRequest(request, tabId);
        await waiter.promise;
        return;
      }
    }

    const action = this.plugin.settings.questionDisplayMode === 'single'
      ? await this.collectSequentialQuestionAction(request, tabId)
      : await this.collectGroupedQuestionAction(request, tabId);

    if (!action) {
      return;
    }

    try {
      if (action.type === 'reject') {
        await this.plugin.openCodeService.rejectQuestion(request.id);
        this.suppressResolvedQuestionRequest(request.id, tabId);
        this.applyResolvedQuestionState({
          request,
          status: 'rejected',
        }, tabId);
        return;
      }

      await this.plugin.openCodeService.replyToQuestion(request.id, action.answers);
      this.suppressResolvedQuestionRequest(request.id, tabId);
      this.applyResolvedQuestionState({
        request,
        status: 'answered',
        answers: action.answers,
      }, tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private applyResolvedQuestionState(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void {
    const runtime = this.getTabRuntimeState(tabId);
    if (runtime) {
      runtime.pendingQuestionResolution = resolution;
    }

    if (!this.shouldRenderQuestionResolutionCards()) {
      this.clearQuestionInlineCard(tabId);
      return;
    }

    this.renderQuestionResolutionCard(resolution, tabId);
  }

  private renderQuestionResolutionCard(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void {
    const cardEl = this.getOrCreateQuestionInlineCard(
      'opencodian-question-inline opencodian-question-inline--resolved',
      tabId,
    );
    if (!cardEl) {
      return;
    }

    this.populateQuestionResolutionCard(cardEl, resolution);
    this.keepQuestionCardPinnedToBottom(tabId);
  }

  private populateQuestionResolutionCard(cardEl: HTMLElement, resolution: QuestionResolution): void {
    const detailsEl = cardEl.createEl('details', {
      cls: 'opencodian-question-inline-details',
    });
    detailsEl.open = true;

    const summaryEl = detailsEl.createEl('summary', {
      cls: 'opencodian-question-inline-summary-toggle',
    });
    const headerEl = summaryEl.createDiv({ cls: 'opencodian-question-inline-header' });
    headerEl.createSpan({
      cls: 'opencodian-question-inline-icon',
      text: resolution.status === 'answered' ? 'i' : '!',
    });
    headerEl.createSpan({
      cls: 'opencodian-question-inline-title',
      text: resolution.status === 'answered'
        ? t('chat.question.notice.answeredTitle')
        : t('chat.question.notice.rejectedTitle'),
    });
    headerEl.createSpan({
      cls: 'opencodian-question-inline-collapse-hint',
      text: '',
    });
    const updateCollapseHint = () => {
      const hintEl = headerEl.querySelector('.opencodian-question-inline-collapse-hint');
      if (hintEl instanceof HTMLElement) {
        hintEl.setText(detailsEl.open ? t('chat.action.showLess') : t('chat.action.showMore'));
      }
    };
    updateCollapseHint();
    detailsEl.addEventListener('toggle', updateCollapseHint);

    const bodyEl = detailsEl.createDiv({ cls: 'opencodian-question-inline-details-body' });
    bodyEl.createDiv({
      cls: 'opencodian-question-inline-body-text',
      text: resolution.status === 'answered'
        ? t('chat.question.notice.answeredBody')
        : t('chat.question.notice.rejectedBody'),
    });

    const listEl = bodyEl.createEl('ul', { cls: 'opencodian-question-inline-summary-list' });
    resolution.request.questions.forEach((question, index) => {
      const itemEl = listEl.createEl('li', { cls: 'opencodian-question-inline-summary-item' });
      const labelEl = itemEl.createSpan({ cls: 'opencodian-question-inline-summary-label' });
      labelEl.setText(`${question.header}: `);
      itemEl.createSpan({
        cls: 'opencodian-question-inline-summary-value',
        text: resolution.status === 'answered'
          ? (resolution.answers?.[index]?.join(', ') ?? '')
          : t('chat.question.reject'),
      });
    });
  }

  private keepQuestionCardPinnedToBottom(tabId: TabId | null): void {
    if (this.getActiveTabId() !== tabId) {
      return;
    }

    this.scheduleSettledScrollToBottomIfNeeded(this.shouldAutoScroll(tabId), tabId);
  }

  private async collectGroupedQuestionAction(
    request: QuestionRequest,
    tabId: TabId | null,
  ): Promise<{ type: 'reply'; answers: string[][] } | { type: 'reject' } | null> {
    const questionCard = this.getOrCreateQuestionInlineCard('opencodian-question-inline', tabId);
    if (!questionCard) {
      logger.error('No streaming message element found for question card');
      return null;
    }

    const headerEl = questionCard.createDiv({ cls: 'opencodian-question-inline-header' });
    headerEl.createSpan({ cls: 'opencodian-question-inline-icon', text: '?' });
    headerEl.createSpan({
      cls: 'opencodian-question-inline-title',
      text: t('chat.question.title'),
    });

    const state = request.questions.map(() => ({
      optionInputs: [] as HTMLInputElement[],
      customInput: null as HTMLInputElement | null,
    }));

    request.questions.forEach((question, index) => {
      const sectionEl = questionCard.createDiv({ cls: 'opencodian-question-inline-section' });
      sectionEl.createDiv({
        cls: 'opencodian-question-inline-header-text',
        text: question.header,
      });
      sectionEl.createDiv({
        cls: 'opencodian-question-inline-body-text',
        text: question.question,
      });

      if (question.options.length > 0) {
        const optionsEl = sectionEl.createDiv({ cls: 'opencodian-question-inline-options' });
        const inputType = question.multiple ? 'checkbox' : 'radio';

        for (const option of question.options) {
          const labelEl = optionsEl.createEl('label', {
            cls: 'opencodian-question-inline-option',
          });
          const inputEl = labelEl.createEl('input', {
            attr: {
              type: inputType,
              name: `opencodian-question-${request.id}-${index}`,
              value: option.label,
            },
          });
          state[index].optionInputs.push(inputEl);

          const textWrap = labelEl.createDiv({ cls: 'opencodian-question-inline-option-copy' });
          textWrap.createDiv({
            cls: 'opencodian-question-inline-option-label',
            text: option.label,
          });
          if (option.description) {
            textWrap.createDiv({
              cls: 'opencodian-question-inline-option-description',
              text: option.description,
            });
          }
        }
      }

      if (question.custom !== false) {
        const customInput = sectionEl.createEl('input', {
          cls: 'opencodian-question-inline-custom',
          attr: {
            type: 'text',
            placeholder: t('chat.question.customPlaceholder'),
          },
        });
        state[index].customInput = customInput;
      }
    });

    const buttonsEl = questionCard.createDiv({ cls: 'opencodian-question-inline-buttons' });
    const submitBtn = buttonsEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-submit',
      text: t('chat.question.submit'),
      attr: { type: 'button' },
    });
    const rejectBtn = buttonsEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-reject',
      text: t('chat.question.reject'),
      attr: { type: 'button' },
    });

    const action = await new Promise<{ type: 'reply'; answers: string[][] } | { type: 'reject' }>((resolve) => {
      submitBtn.addEventListener('click', () => {
        submitBtn.blur();
        const answers = request.questions.map((question, index) => {
          const selectedValues = state[index].optionInputs
            .filter((input) => input.checked)
            .map((input) => input.value);
          const customValue = state[index].customInput?.value.trim() ?? '';

          if (question.multiple) {
            const combined = customValue ? [...selectedValues, customValue] : selectedValues;
            return [...new Set(combined)];
          }

          if (customValue) {
            return [customValue];
          }

          return selectedValues.length > 0 ? [selectedValues[0]] : [];
        });

        const hasEmptyAnswer = answers.some((answer) => answer.length === 0);
        if (hasEmptyAnswer) {
          new Notice(t('chat.question.answerRequired'));
          return;
        }

        resolve({ type: 'reply', answers });
      });

      rejectBtn.addEventListener('click', () => {
        rejectBtn.blur();
        resolve({ type: 'reject' });
      });
    });

    this.keepQuestionCardPinnedToBottom(tabId);
    return action;
  }

  private async collectSequentialQuestionAction(
    request: QuestionRequest,
    tabId: TabId | null,
  ): Promise<{ type: 'reply'; answers: string[][] } | { type: 'reject' } | null> {
    const answers: string[][] = [];

    for (let index = 0; index < request.questions.length; index += 1) {
      const action = await this.promptForSingleQuestion(
        request,
        request.questions[index],
        index,
        request.questions.length,
        tabId,
      );

      if (!action) {
        return null;
      }

      if (action.type === 'reject') {
        return action;
      }

      answers.push(action.answer);
    }

    return {
      type: 'reply',
      answers,
    };
  }

  private async promptForSingleQuestion(
    request: QuestionRequest,
    question: QuestionRequest['questions'][number],
    index: number,
    total: number,
    tabId: TabId | null,
  ): Promise<{ type: 'reply'; answer: string[] } | { type: 'reject' } | null> {
    const questionCard = this.getOrCreateQuestionInlineCard('opencodian-question-inline', tabId);
    if (!questionCard) {
      logger.error('No streaming message element found for question card');
      return null;
    }

    const headerEl = questionCard.createDiv({ cls: 'opencodian-question-inline-header' });
    headerEl.createSpan({ cls: 'opencodian-question-inline-icon', text: '?' });
    headerEl.createSpan({
      cls: 'opencodian-question-inline-title',
      text: t('chat.question.title'),
    });
    if (total > 1) {
      headerEl.createSpan({
        cls: 'opencodian-question-inline-progress',
        text: t('chat.question.progress', {
          current: String(index + 1),
          total: String(total),
        }),
      });
    }

    const sectionEl = questionCard.createDiv({ cls: 'opencodian-question-inline-section' });
    sectionEl.createDiv({
      cls: 'opencodian-question-inline-header-text',
      text: question.header,
    });
    sectionEl.createDiv({
      cls: 'opencodian-question-inline-body-text',
      text: question.question,
    });

    const optionInputs: HTMLInputElement[] = [];
    let customInput: HTMLInputElement | null = null;

    if (question.options.length > 0) {
      const optionsEl = sectionEl.createDiv({ cls: 'opencodian-question-inline-options' });
      const inputType = question.multiple ? 'checkbox' : 'radio';

      for (const option of question.options) {
        const labelEl = optionsEl.createEl('label', {
          cls: 'opencodian-question-inline-option',
        });
        const inputEl = labelEl.createEl('input', {
          attr: {
            type: inputType,
            name: `opencodian-question-${request.id}-${index}`,
            value: option.label,
          },
        });
        optionInputs.push(inputEl);

        const textWrap = labelEl.createDiv({ cls: 'opencodian-question-inline-option-copy' });
        textWrap.createDiv({
          cls: 'opencodian-question-inline-option-label',
          text: option.label,
        });
        if (option.description) {
          textWrap.createDiv({
            cls: 'opencodian-question-inline-option-description',
            text: option.description,
          });
        }
      }
    }

    if (question.custom !== false) {
      customInput = sectionEl.createEl('input', {
        cls: 'opencodian-question-inline-custom',
        attr: {
          type: 'text',
          placeholder: t('chat.question.customPlaceholder'),
        },
      });
    }

    const buttonsEl = questionCard.createDiv({ cls: 'opencodian-question-inline-buttons' });
    const submitBtn = buttonsEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-submit',
      text: index === total - 1 ? t('chat.question.submit') : t('chat.question.next'),
      attr: { type: 'button' },
    });
    const rejectBtn = buttonsEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-reject',
      text: t('chat.question.reject'),
      attr: { type: 'button' },
    });

    const action = await new Promise<{ type: 'reply'; answer: string[] } | { type: 'reject' }>((resolve) => {
      submitBtn.addEventListener('click', () => {
        submitBtn.blur();
        const selectedValues = optionInputs
          .filter((input) => input.checked)
          .map((input) => input.value);
        const customValue = customInput?.value.trim() ?? '';

        const answer = question.multiple
          ? [...new Set(customValue ? [...selectedValues, customValue] : selectedValues)]
          : customValue
            ? [customValue]
            : selectedValues.length > 0
              ? [selectedValues[0]]
              : [];

        if (answer.length === 0) {
          new Notice(t('chat.question.answerRequired'));
          return;
        }

        resolve({ type: 'reply', answer });
      });

      rejectBtn.addEventListener('click', () => {
        rejectBtn.blur();
        resolve({ type: 'reject' });
      });
    });
    this.keepQuestionCardPinnedToBottom(tabId);
    return action;
  }

  private buildQuestionAnswerMarkdown(request: QuestionRequest, answers: string[][]): string {
    const lines = request.questions.map((question, index) => {
      const answer = answers[index]?.join(', ') ?? '';
      return `- **${question.header}**: ${answer}`;
    });

    return [
      t('chat.question.notice.answeredBody'),
      '',
      ...lines,
    ].join('\n');
  }

  private buildQuestionRejectedMarkdown(request: QuestionRequest): string {
    const lines = request.questions.map((question) => `- ${question.header}`);
    return [
      t('chat.question.notice.rejectedBody'),
      '',
      ...lines,
    ].join('\n');
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
    this.revealStreamingAssistantMessageElement(tabId);

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
