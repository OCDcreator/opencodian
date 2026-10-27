/* eslint-disable max-lines -- This owner keeps composer textarea, @agent selector, slash menu, and layout sync together because they share DOM, focus, and overlay lifecycle. */
import { Notice, setIcon } from 'obsidian';

import {
  createPromptSuggestionChannel,
  deletePromptSuggestionChannel,
  onPromptSuggestionSessionChange,
  onPromptSuggestionSinkChange,
  removePromptSuggestionScope,
  stampPromptSuggestionScope,
} from '../../../../core/agents/backend/promptSuggestionSink';
import type { SlashCommandMenuItem } from '../../../../core/config/slashCommandCatalog';
import type { ImageAttachment, SlashCommandSkillMode } from '../../../../core/types';
import { t } from '../../../../i18n';
import { createLogger } from '../../../../shared';
import { openImagePreview } from '../../ui/ImagePreviewOverlay';
import {
  loadAgentMentionCandidatesFromComposerCatalog,
  loadAgentSelectionCandidatesFromComposerCatalog,
} from '../commands/SlashCommandMenuCatalogCache';
import { SlashCommandMenuCoordinator } from '../commands/SlashCommandMenuCoordinator';
import { ChatAgentSelectionCoordinator } from '../selection/ChatAgentSelectionCoordinator';
import type {
  ComposerInputMode,
  ComposerInputSubmission,
  MessageSendPreparationOutcome,
} from '../send/MessageSendPreparationService';
import { PromptSuggestionService } from '../send/PromptSuggestionService';
import { type AgentMentionCandidate, AgentMentionComposerController } from './AgentMentionComposerController';
import {
  buildComposerInputSubmissionWithAgentIntents,
  getCodexSkillMenuQuery,
  getSlashCommandMenuQuery,
  isCommandComposerText,
} from './composerInputParsing';

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;
let composerInputLabelId = 0;

/**
 * F2 SEND-STOP-COLLISION: send and stop are one morphing control at the same
 * coordinates. After a cancel, trailing stream teardown can leave a short
 * window where the control's click semantics are still in flux; a click in
 * that window used to re-hit the transitional control and silently drop the
 * drafted message. The control therefore converges immediately and stays
 * disabled (unclickable) for this window before re-arming as send.
 */
const SEND_CANCEL_SETTLE_WINDOW_MS = 200;

function resolveTextareaMaxHeightFallback(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 120 && value <= 480
    ? value
    : COMPOSER_TEXTAREA_MAX_HEIGHT;
}
const COMPOSER_AVAILABILITY_NOTICE_GAP_PX = 8;
const INPUT_HIGHLIGHT_SLASH_REGEX = /(^|\s)(\/(?:skills|skill)(?:\s+\S+)?|\/\S+)/g;

const logger = createLogger('ComposerInputShellCoordinator');

type InputHighlightKind = 'agent' | 'command' | 'skill';

interface InputHighlightSpan {
  start: number;
  end: number;
  kind: InputHighlightKind;
  agentId?: string;
  value?: string;
}

function readOpenCodianPlugin(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).app?.plugins?.plugins?.opencodian ?? null;
  } catch {
    return null;
  }
}

function readActiveBackendFromPlugin(): string {
  return (readOpenCodianPlugin() as { settings?: { activeBackend?: string } } | null)?.settings?.activeBackend ?? 'opencode';
}

function readActiveBackendDisplayNameFromPlugin(): string {
  const plugin = readOpenCodianPlugin() as {
    settings?: { activeBackend?: string };
    agentServiceRegistry?: { get?: (id: string) => { displayName?: string } | null };
  } | null;
  const activeBackend = plugin?.settings?.activeBackend ?? 'opencode';
  return plugin?.agentServiceRegistry?.get?.(activeBackend)?.displayName ?? activeBackend;
}

export { buildComposerInputSubmission } from './composerInputParsing';

export interface ComposerInputShellCoordinatorHost {
  attachSessionTodo(container: HTMLElement): void;
  attachQuestionDock(container: HTMLElement): void;
  /** R-F1: the queued follow-up bar host element (rendered above the chips). */
  setQueuedFollowUpBarElement?(element: HTMLElement): void;
  setContextRowElement(element: HTMLElement | null): void;
  setTooltipLabel(element: HTMLElement, label: string, position?: 'bottom' | 'left' | 'right' | 'top'): void;
  getInputPlaceholder(): string;
  /** Composer textarea growth cap; driven by the input appearance setting. */
  getComposerTextareaMaxHeight?(): number;
  getSlashCommandSkillMode(): SlashCommandSkillMode;
  /**
   * Whether the Codex backend is the active conversation backend. Drives the
   * runtime-only Codex skill menu (`/skills` browser + `$skill-name` insert).
   * Never persists or alters `slashCommandSkillMode`.
   */
  isCodexBackendActive?(): boolean;
  /**
   * Invoked once per `@` token when the Codex backend is active, because Codex
   * has no native agent dispatch API and cannot produce @agent candidates.
   * The host shows an actionable notice (no native dispatch + a link into the
   * Codex resource management settings). Implementations must debounce so the
   * notice does not repeat on every keystroke.
   */
  onCodexAgentMentionUnavailable?(): void;
  /** Invoked when the Codex skill selector is opened but has no skills. */
  onCodexSkillsEmpty?(): void;
  addChosenFileContextToActiveTab(): Promise<void>;
  /**
   * Vault drop entry point (R-A7): claim a raw `text/plain` drop payload.
   * Returns true when it resolved to a vault text file or folder (attach
   * started asynchronously); false leaves the drop to its default handling
   * (e.g. editor text drops insert into the textarea). Absent disables the
   * surface.
   */
  addVaultPathContextFromDrop?(rawPath: string): boolean;
  /**
   * R-C1: optional observation of composer text changes for the opt-in
   * whole-vault retrieval. Absent (or feature off) costs nothing: the
   * coordinator-side guard runs first and the hook stays a no-op.
   */
  onComposerInputChanged?(value: string): void;
  /** R-C1: turn boundary — the composer submitted; draft clearing happens in the pipeline. */
  onComposerSubmitted?(): void;
  registerEscapeHandler(handler: () => boolean): void;
  mountSelectionControls(toolbar: HTMLElement, options: {
    showModels: boolean;
    showPermissions: boolean;
    /** When set, the model selector mounts here instead of inside `toolbar`. */
    modelContainer?: HTMLElement;
  }): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
  /**
   * Whether to mount the agent (@agent) selector dropdown. Gated on the Subagents
   * capability; Claude Code and Codex lack it, so they hide the dropdown.
   */
  shouldMountAgentSelector?(): boolean;
  /**
   * Whether to handle inline `@agent` mentions (typing `@` in the textarea).
   * Decoupled from the dropdown: Claude Code keeps the mention menu despite lacking
   * the Subagents capability, because it has a dedicated runtime-agent catalog and
   * preserves `@name` text verbatim for the model's Task tool.
   * Falls back to `shouldMountAgentSelector` when the host does not implement this seam.
   */
  shouldHandleAgentMentions?(): boolean;
  isActiveTabStreaming(): boolean;
  cancelStreaming(): void;
  isTabForegroundBusy(): boolean;
  showProcessingBlockedNotice(): void;
  getComposerInputMode(): ComposerInputMode;
  /**
   * Prompt submissions retain their visible draft until
   * send preparation explicitly accepts or queues them. This prevents a
   * rejected preflight from silently discarding user-provided text or files.
   */
  submitMessage(
    submission: ComposerInputSubmission,
    onPreparationOutcome?: (outcome: MessageSendPreparationOutcome) => void,
  ): void | Promise<void>;
  loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]>;
  loadAgentMentionCandidates?(): Promise<AgentMentionCandidate[]>;
  setComposerStackHeight(stackHeight: number): void;
  scheduleSettledScrollToBottomIfNeeded(): void;
  getComposerAvailabilityState?(): {
    kind: 'ready' | 'no-backend' | 'backend-offline';
    title?: string;
    description?: string;
  };
  /**
   * Optional backend-specific capability chip rendered in the composer footer.
   * Returns null when no hint should be displayed.
   * This is intentionally narrow: the host decides what copy (and optional
   * insertion affordance) is appropriate for the active backend.
   * Currently falls back to deriving the Claude `/json` affordance from
   * shouldMountAgentSelector when the host does not implement this seam.
   */
  getComposerCapabilityHint?(): ComposerCapabilityHint | null;
  /** Whether the active backend supports image input. */
  hasImageInputCapability?(): boolean;
  /**
   * R-C2: open the text-to-image generation card. Absent hides the composer
   * button — the affordance never appears half-wired. Generation is
   * plugin-side HTTP, independent of the active backend.
   */
  onRequestImageGeneration?(): void;
  /**
   * R-E1: attach a pasted URL as a webpage context chip (send-time local
   * fetch). Absent disables the paste affordance entirely.
   */
  attachUrlContextToActiveTab?(href: string): boolean;
  /**
   * R-E2: the active Web Viewer tab as a context source. Null (or absent)
   * hides the composer affordance — the entry only exists while a webviewer
   * tab is active with the core plugin enabled.
   */
  getActiveWebViewerTabContext?(): Promise<{ url: string; title?: string } | null>;
  /**
   * R-E2: attach the active Web Viewer tab (R-E1 URL item shape). Absent
   * disables the button even when a tab context exists.
   */
  attachWebViewerTabContextToActiveTab?(tab: { url: string; title?: string }): boolean;
}

export interface ComposerCapabilityHint {
  text: string;
  tooltip?: string;
  insertText?: string;
}

export class ComposerInputShellCoordinator {
  private inputContainerEl: HTMLElement | null = null;
  private inputTabBarSlotEl: HTMLElement | null = null;
  private composerShellEl: HTMLElement | null = null;
  private queuedFollowUpBarEl: HTMLElement | null = null;
  private inputWrapperEl: HTMLElement | null = null;
  private composerInputRowEl: HTMLElement | null = null;
  private composerContextActionsEl: HTMLElement | null = null;
  private composerSubmitControlsEl: HTMLElement | null = null;
  private composerStatusBarEl: HTMLElement | null = null;
  private composerContextUsageSlotEl: HTMLElement | null = null;
  private composerCountsEl: HTMLElement | null = null;
  private modelSlotEl: HTMLElement | null = null;
  private permissionSlotEl: HTMLElement | null = null;
  private agentSelectorSlotEl: HTMLElement | null = null;
  private agentSettingsBodyEl: HTMLElement | null = null;
  private agentToolbarEl: HTMLElement | null = null;
  private capabilityHintSlotEl: HTMLElement | null = null;
  private attachmentMenuEl: HTMLElement | null = null;
  private attachmentMenuTriggerEl: HTMLButtonElement | null = null;
  private attachmentMenuPanelEl: HTMLElement | null = null;
  private agentMenuEl: HTMLElement | null = null;
  private agentMenuTriggerEl: HTMLButtonElement | null = null;
  private agentMenuPanelEl: HTMLElement | null = null;
  private agentMenuTriggerTextEl: HTMLElement | null = null;
  private agentMenuHeadingEl: HTMLElement | null = null;
  private attachmentAddFileLabelEl: HTMLElement | null = null;
  private attachmentAddImageLabelEl: HTMLElement | null = null;
  private attachmentImageGenLabelEl: HTMLElement | null = null;
  private attachmentWebViewerLabelEl: HTMLElement | null = null;
  private isAttachmentMenuOpen = false;
  private isAgentMenuOpen = false;
  private hasRegisteredMenuEscapeHandler = false;
  private menuDocumentClickHandler: ((event: MouseEvent) => void) | null = null;
  private addContextBtnEl: HTMLButtonElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private inputTextareaEl: HTMLTextAreaElement | null = null;
  private highlightBackdropEl: HTMLElement | null = null;
  private placeholderOverlayEl: HTMLElement | null = null;
  private availabilityNoticeEl: HTMLElement | null = null;
  private capabilityHintEl: HTMLButtonElement | null = null;
  private activeCapabilityHint: ComposerCapabilityHint | null = null;
  private readonly capabilityHintHostClass = 'opencodian-input-capability-hint';
  private slashCommandMenuEl: HTMLElement | null = null;
  private layoutSyncFrameId: number | null = null;
  private inputContainerResizeObserver: ResizeObserver | null = null;
  private slashCommandMenuCatalogItems: SlashCommandMenuItem[] | null = null;
  /**
   * Tracks the raw input length at which the Codex agent-mention notice was
   * last shown, so the actionable notice fires once per `@` token rather than
   * on every keystroke.
   */
  private codexAgentNoticeInputSignature: string | null = null;
  private readonly agentMentionController: AgentMentionComposerController;
  private readonly agentSelectionController: ChatAgentSelectionCoordinator;
  private readonly slashCommandMenuController: SlashCommandMenuCoordinator;
  private readonly promptSuggestionService: PromptSuggestionService;
  private promptSuggestionSinkUnsub: (() => void) | null = null;
  private promptSuggestionAdapterUnsub: (() => void) | null = null;
  private promptSuggestionSessionUnsub: (() => void) | null = null;
  private promptSuggestionChannelId: string | null = null;
  private suggestionBarEl: HTMLElement | null = null;
  private suggestionBarRefreshUnsub: (() => void) | null = null;
  private promptSuggestionPlacementObserver: MutationObserver | null = null;
  private promptSuggestionPlacementRootEl: HTMLElement | null = null;
  private composerAvailabilityObserver: MutationObserver | null = null;
  private composerAvailabilityObserverRootEl: HTMLElement | null = null;
  private composerAvailabilityNoticeSignature: string | null = null;
  private addImageBtnEl: HTMLButtonElement | null = null;
  private imageChipContainerEl: HTMLElement | null = null;
  private attachedImages: ImageAttachment[] = [];
  private promptSubmissionPending = false;
  private cancelSettleTimeoutId: number | null = null;
  private fileInputEl: HTMLInputElement | null = null;
  private imageDropSurfaceEl: HTMLElement | null = null;

  constructor(private readonly host: ComposerInputShellCoordinatorHost) {
    this.agentMentionController = new AgentMentionComposerController({
      getComposerInputMode: () => this.host.getComposerInputMode(),
      loadAgentMentionCandidates: () => loadAgentMentionCandidatesFromComposerCatalog(
        this.host, this.slashCommandMenuCatalogItems, (items) => { this.slashCommandMenuCatalogItems = items; },
      ),
      scheduleLayoutSync: () => this.scheduleLayoutSync(),
      onMentionInserted: () => { this.syncTextareaHeight(); this.syncHighlightBackdrop(); },
      onLoadFailed: (error) => { logger.debug('Failed to load agent mention candidates:', error); },
    });
    this.agentSelectionController = new ChatAgentSelectionCoordinator({
      loadAgentSelectionCandidates: () => loadAgentSelectionCandidatesFromComposerCatalog(
        this.host,
        this.slashCommandMenuCatalogItems,
        (items) => { this.slashCommandMenuCatalogItems = items; },
      ),
      closePeerDropdowns: () => {
        this.clearSlashCommandMenu();
        this.agentMentionController.clear(this.slashCommandMenuEl);
      },
      restoreInputFocus: () => this.inputTextareaEl?.focus(),
      registerEscapeHandler: (handler) => this.host.registerEscapeHandler(handler),
    });
    this.slashCommandMenuController = new SlashCommandMenuCoordinator({
      getTextarea: () => this.inputTextareaEl,
      getMenuElement: () => this.slashCommandMenuEl,
      getCatalogItems: () => this.slashCommandMenuCatalogItems,
      setCatalogItems: (items) => { this.slashCommandMenuCatalogItems = items; },
      loadItems: () => this.host.loadSlashCommandMenuItems(),
      getSkillMode: () => this.host.getSlashCommandSkillMode(),
      ...(typeof this.host.isCodexBackendActive === 'function'
        ? { isCodexSkillMode: () => this.host.isCodexBackendActive!() }
        : {}),
      ...(typeof this.host.onCodexSkillsEmpty === 'function'
        ? { onCodexSkillsEmpty: () => this.host.onCodexSkillsEmpty!() }
        : {}),
      onMenuLoadFailed: (error) => { logger.debug('Failed to load slash command menu items:', error); },
      onCatalogStateChanged: () => this.syncHighlightBackdrop(),
      onMenuItemApplied: () => {
        this.syncTextareaHeight();
        this.syncHighlightBackdrop();
      },
      scheduleLayoutSync: () => this.scheduleLayoutSync(),
    });
    this.promptSuggestionService = new PromptSuggestionService();
  }

  build(container: HTMLElement): void {
    this.destroy();
    this.inputContainerEl = container;

    this.host.attachSessionTodo(container);
    this.host.attachQuestionDock(container);
    this.inputTabBarSlotEl = container.createDiv({
      cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--input',
    });

    // Prompt suggestion chip is mounted under the latest assistant turn body,
    // so it stays semantically tied to the assistant follow-up it suggests.
    this.suggestionBarEl = document.createElement('div');
    this.suggestionBarEl.className = 'opencodian-suggestion-bar is-hidden';

    this.composerShellEl = container.createDiv({ cls: 'opencodian-composer-shell' });
    this.inputWrapperEl = this.composerShellEl.createDiv({ cls: 'opencodian-input-wrapper' });
    const composerContentEl = this.inputWrapperEl.createDiv({ cls: 'opencodian-composer-content' });
    // R-F1: queued follow-up messages render above the context chips row.
    this.queuedFollowUpBarEl = composerContentEl.createDiv({
      cls: 'opencodian-queued-followup-bar is-hidden',
    });
    this.host.setQueuedFollowUpBarElement?.(this.queuedFollowUpBarEl);
    this.host.setContextRowElement(
      composerContentEl.createDiv({ cls: 'opencodian-composer-context-row is-empty' }),
    );

    const highlightContainerEl = composerContentEl.createDiv({ cls: 'opencodian-input-highlight-container' });
    this.highlightBackdropEl = highlightContainerEl.createDiv({
      cls: 'opencodian-input-highlight-backdrop',
      attr: { 'aria-hidden': 'true' },
    });

    // Custom placeholder overlay (-webkit-line-clamp:2; native placeholder cannot be clamped).
    const placeholderText = this.resolveInputPlaceholder();
    this.placeholderOverlayEl = highlightContainerEl.createDiv({ cls: 'opencodian-input-placeholder', attr: { 'aria-hidden': 'true' } });
    this.placeholderOverlayEl.createSpan({ cls: 'opencodian-input-placeholder-text', text: placeholderText });

    this.inputTextareaEl = highlightContainerEl.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { rows: '1' },
    });
    const inputLabel = highlightContainerEl.createSpan({
      cls: 'opencodian-visually-hidden',
      text: t('chat.input.label'),
    });
    inputLabel.id = `opencodian-input-label-${++composerInputLabelId}`;
    this.inputTextareaEl.setAttribute('aria-labelledby', inputLabel.id);
    this.inputTextareaEl.addEventListener('input', () => {
      this.syncTextareaHeight();
      if (this.host.shouldMountAgentSelector?.() !== false) {
        this.agentMentionController.syncContent(this.inputTextareaEl?.value ?? '');
      }
      this.syncHighlightBackdrop();
      this.renderInputCounts();
      this.host.onComposerInputChanged?.(this.inputTextareaEl?.value ?? '');
      void this.refreshComposerSuggestionMenu();
    });
    this.inputTextareaEl.addEventListener('scroll', () => {
      this.syncHighlightBackdropScroll();
    });
    this.inputTextareaEl.addEventListener('keydown', (event) => {
      if (this.isComposerInteractionDisabled()) {
        return;
      }
      if (this.tryHandleAgentMentionMenuKeydown(event)) {
        return;
      }

      if (this.tryHandleSlashCommandMenuKeydown(event)) {
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.trySubmitCurrentInput();
      }
    });

    // Clipboard paste of images (capability-gated)
    if (this.host.hasImageInputCapability?.()) {
      this.inputTextareaEl.addEventListener('paste', (event) => {
        const files = event.clipboardData?.files;
        if (!files || files.length === 0) {
          return;
        }
        const imageFiles = this.filterImageFiles(files);
        if (imageFiles.length === 0) {
          return;
        }
        event.preventDefault();
        void this.processImageFiles(imageFiles);
      });
    }

    // R-E1: pasting a bare http(s) URL attaches it as a webpage context chip
    // (send-time local fetch). URLs embedded in longer pastes stay text —
    // the affordance only fires when the whole paste IS the URL, so nothing
    // is silently swallowed. Only user-pasted URLs ever fetch.
    if (this.host.attachUrlContextToActiveTab) {
      this.inputTextareaEl.addEventListener('paste', (event) => {
        if (event.defaultPrevented) {
          return;
        }
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          return;
        }
        const text = event.clipboardData?.getData('text') ?? '';
        const trimmed = text.trim();
        if (!/^https?:\/\/\S+$/i.test(trimmed)) {
          return;
        }
        if (this.host.attachUrlContextToActiveTab?.(trimmed)) {
          event.preventDefault();
        }
      });
    }

    this.syncTextareaHeight();
    this.slashCommandMenuEl = this.composerShellEl.createDiv({
      cls: 'opencodian-slash-command-menu is-hidden',
    });
    this.slashCommandMenuEl.setAttribute('role', 'listbox');

    // Single-rail composer: attachment, permission, agent, model/effort, send.
    // Context usage and input stats live in the external status bar.
    this.composerInputRowEl = composerContentEl.createDiv({
      cls: 'opencodian-composer-input-row opencodian-composer-footer opencodian-composer-action-zone',
    });
    this.composerContextActionsEl = this.composerInputRowEl.createDiv({
      cls: 'opencodian-composer-context-actions opencodian-composer-footer-tools',
    });
    this.buildAttachmentMenu();
    this.permissionSlotEl = this.composerContextActionsEl.createDiv({
      cls: 'opencodian-composer-permission-slot',
    });
    this.agentSelectorSlotEl = this.composerContextActionsEl.createDiv({
      cls: 'opencodian-composer-agent-slot',
    });
    this.buildAgentMenu();
    this.modelSlotEl = this.composerContextActionsEl.createDiv({
      cls: 'opencodian-composer-model-slot',
    });
    this.composerSubmitControlsEl = this.composerInputRowEl.createDiv({
      cls: 'opencodian-composer-submit-controls',
    });

    this.sendBtnEl = this.composerSubmitControlsEl.createEl('button', {
      cls: 'opencodian-send-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
      },
    });
    this.sendBtnEl.addEventListener('click', () => {
      if (this.isCancelSettlePending()) {
        // The control is converging after a cancel; a click in this window
        // would land on the transitional control instead of sending.
        return;
      }
      if (this.host.isActiveTabStreaming()) {
        this.host.cancelStreaming();
        this.beginCancelSettleWindow();
      } else {
        this.trySubmitCurrentInput();
      }
    });

    this.buildStatusBar(container);
    this.installComposerMenuDismissal();
    this.updateSendButtonState();
    this.updateComposerAvailabilityState();

    this.mountToolbarControls();
    this.renderCapabilityHint();
    if (!this.hasRegisteredMenuEscapeHandler) {
      this.hasRegisteredMenuEscapeHandler = true;
      this.host.registerEscapeHandler(() => this.closeComposerMenuFromEscape());
    }

    this.initializeLayoutMetrics();

    this.wirePromptSuggestionFromSink();
  }

  refreshToolbarControls(): void {
    this.mountToolbarControls();
    this.renderCapabilityHint();
  }

  private buildAttachmentMenu(): void {
    if (!this.composerContextActionsEl) {
      return;
    }

    const menuEl = this.composerContextActionsEl.createDiv({
      cls: 'opencodian-composer-menu opencodian-composer-attachment-menu',
    });
    this.attachmentMenuEl = menuEl;
    const triggerEl = menuEl.createEl('button', {
      cls: 'opencodian-composer-menu-trigger opencodian-composer-attachment-trigger opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        'aria-label': t('chat.composerMenu.attachment'),
      },
    });
    this.attachmentMenuTriggerEl = triggerEl;
    setIcon(triggerEl, 'plus');
    this.host.setTooltipLabel(triggerEl, t('chat.composerMenu.attachment'), 'top');
    triggerEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleAttachmentMenu();
    });

    const panelEl = menuEl.createDiv({
      cls: 'opencodian-composer-menu-panel opencodian-composer-attachment-panel',
      attr: { role: 'menu' },
    });
    this.attachmentMenuPanelEl = panelEl;

    this.addContextBtnEl = this.createComposerMenuItem(
      panelEl,
      'file-plus',
      t('chat.composerMenu.addFile'),
      'opencodian-composer-add-btn',
    );
    this.attachmentAddFileLabelEl = this.addContextBtnEl.querySelector('.opencodian-composer-menu-item-label');
    this.addContextBtnEl.addEventListener('click', () => {
      this.closeAttachmentMenu();
      void this.host.addChosenFileContextToActiveTab();
    });

    // Image attach item (capability-gated)
    if (this.host.hasImageInputCapability?.()) {
      this.addImageBtnEl = this.createComposerMenuItem(
        panelEl,
        'image',
        t('chat.composerMenu.addImage'),
        'opencodian-composer-image-btn',
      );
      this.attachmentAddImageLabelEl = this.addImageBtnEl.querySelector('.opencodian-composer-menu-item-label');
      this.addImageBtnEl.addEventListener('click', () => {
        this.closeAttachmentMenu();
        this.fileInputEl?.click();
      });

      // Hidden file input
      this.fileInputEl = document.createElement('input');
      this.fileInputEl.type = 'file';
      this.fileInputEl.accept = 'image/jpeg,image/png,image/gif,image/webp';
      this.fileInputEl.style.display = 'none';
      this.fileInputEl.addEventListener('change', (event) => {
        void this.handleFileSelection(event);
      });
      document.body.appendChild(this.fileInputEl);

      // The entire conversation surface accepts images, not just the compact
      // composer card. It is intentionally mounted on the chat root so users
      // can drop while reading a turn and receive an explicit release affordance.
      this.installImageDropSurface();
    }

    // R-C2 text-to-image entry (host-gated): opens the generation card.
    // Generation is plugin-side HTTP and never touches the conversation.
    if (this.host.onRequestImageGeneration) {
      const imageGenBtnEl = this.createComposerMenuItem(
        panelEl,
        'sparkles',
        t('chat.composerMenu.generateImage'),
        'opencodian-composer-imagegen-btn',
      );
      this.attachmentImageGenLabelEl = imageGenBtnEl.querySelector('.opencodian-composer-menu-item-label');
      imageGenBtnEl.addEventListener('click', () => {
        this.closeAttachmentMenu();
        this.host.onRequestImageGeneration?.();
      });
    }

    // R-E2: attach the active Web Viewer tab (globe item). Rendered only
    // when both host seams exist AND the current tab resolves to a webviewer
    // context — the affordance never appears half-wired.
    if (this.host.getActiveWebViewerTabContext && this.host.attachWebViewerTabContextToActiveTab) {
      void this.setupWebViewerContextButton();
    }
  }

  private buildAgentMenu(): void {
    if (!this.composerContextActionsEl) {
      return;
    }

    const menuEl = this.composerContextActionsEl.createDiv({
      cls: 'opencodian-composer-menu opencodian-composer-agent-menu',
    });
    this.agentMenuEl = menuEl;
    const triggerEl = menuEl.createEl('button', {
      cls: 'opencodian-composer-menu-trigger opencodian-agent-settings-trigger opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-label': t('chat.composerMenu.runSettings'),
      },
    });
    this.agentMenuTriggerEl = triggerEl;
    const iconEl = triggerEl.createSpan({ cls: 'opencodian-agent-settings-trigger-icon' });
    setIcon(iconEl, 'bot');
    this.agentMenuTriggerTextEl = triggerEl.createSpan({
      cls: 'opencodian-agent-settings-trigger-text',
      text: t('chat.agentSelector.trigger'),
    });
    const chevronEl = triggerEl.createSpan({ cls: 'opencodian-agent-settings-trigger-chevron' });
    setIcon(chevronEl, 'chevron-down');
    this.host.setTooltipLabel(triggerEl, t('chat.composerMenu.runSettings'), 'top');
    triggerEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleAgentMenu();
    });

    const panelEl = menuEl.createDiv({
      cls: 'opencodian-composer-menu-panel opencodian-composer-agent-panel',
      attr: { role: 'group', 'aria-label': t('chat.composerMenu.runSettings') },
    });
    this.agentMenuPanelEl = panelEl;
    this.agentMenuHeadingEl = panelEl.createDiv({
      cls: 'opencodian-composer-menu-heading',
      text: t('chat.composerMenu.runSettings'),
    });
    this.agentSettingsBodyEl = panelEl.createDiv({ cls: 'opencodian-agent-settings-body' });
    this.capabilityHintSlotEl = panelEl.createDiv({ cls: 'opencodian-composer-capability-slot' });
  }

  private createComposerMenuItem(
    parentEl: HTMLElement,
    icon: string,
    label: string,
    extraClass?: string,
  ): HTMLButtonElement {
    const itemEl = parentEl.createEl('button', {
      cls: 'opencodian-composer-menu-item opencodian-tooltip-trigger',
      attr: { type: 'button', role: 'menuitem' },
    });
    if (extraClass) {
      itemEl.addClass(extraClass);
    }
    const iconEl = itemEl.createSpan({ cls: 'opencodian-composer-menu-item-icon' });
    setIcon(iconEl, icon);
    itemEl.createSpan({ cls: 'opencodian-composer-menu-item-label', text: label });
    this.host.setTooltipLabel(itemEl, label, 'top');
    return itemEl;
  }

  private buildStatusBar(container: HTMLElement): void {
    this.composerStatusBarEl = container.createDiv({
      cls: 'opencodian-composer-status-bar',
    });
    this.composerContextUsageSlotEl = this.composerStatusBarEl.createDiv({
      cls: 'opencodian-composer-context-slot',
    });
    this.composerStatusBarEl.createDiv({ cls: 'opencodian-composer-status-middle' });
    this.composerCountsEl = this.composerStatusBarEl.createSpan({
      cls: 'opencodian-composer-counts is-hidden',
    });
    this.renderInputCounts();
  }

  private mountToolbarControls(): void {
    if (!this.permissionSlotEl || !this.agentSelectorSlotEl || !this.composerContextUsageSlotEl) {
      return;
    }

    this.agentSelectionController.destroy();
    this.agentToolbarEl?.remove();
    this.agentToolbarEl = null;
    this.permissionSlotEl.empty();
    this.agentSelectorSlotEl.empty();
    this.modelSlotEl?.empty();
    this.composerContextUsageSlotEl.empty();

    const toolbarEl = document.createElement('div');
    toolbarEl.className = 'opencodian-input-toolbar';
    this.agentToolbarEl = toolbarEl;
    this.permissionSlotEl.appendChild(toolbarEl);
    if (this.host.shouldMountAgentSelector?.() !== false) {
      this.agentSelectionController.mount(this.agentSelectorSlotEl.createDiv({ cls: 'opencodian-agent-selector' }));
    }
    if (this.modelSlotEl) {
      this.host.mountSelectionControls(toolbarEl, {
        showModels: true,
        showPermissions: true,
        modelContainer: this.modelSlotEl,
      });
    }
    this.host.mountContextUsageIndicator(this.composerContextUsageSlotEl.createDiv({
      cls: 'opencodian-context-usage-slot',
    }));
    this.pruneEmptyToolbar(toolbarEl);
    this.syncAgentMenuVisibility();
  }

  private installComposerMenuDismissal(): void {
    if (this.menuDocumentClickHandler) {
      return;
    }
    const doc = this.composerShellEl?.ownerDocument ?? document;
    this.menuDocumentClickHandler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (this.isAttachmentMenuOpen && !this.attachmentMenuEl?.contains(target)) {
        this.closeAttachmentMenu();
      }
      if (this.isAgentMenuOpen && !this.agentMenuEl?.contains(target)) {
        this.closeAgentMenu();
      }
    };
    doc.addEventListener('click', this.menuDocumentClickHandler, true);
  }

  private toggleAttachmentMenu(): void {
    if (this.isAttachmentMenuOpen) {
      this.closeAttachmentMenu();
      return;
    }
    this.openAttachmentMenu();
  }

  private openAttachmentMenu(): void {
    this.closeAgentMenu();
    this.isAttachmentMenuOpen = true;
    this.attachmentMenuEl?.addClass('is-open');
    this.attachmentMenuTriggerEl?.addClass('is-open');
    this.attachmentMenuTriggerEl?.setAttribute('aria-expanded', 'true');
  }

  private closeAttachmentMenu(restoreFocus = false): void {
    this.isAttachmentMenuOpen = false;
    this.attachmentMenuEl?.removeClass('is-open');
    this.attachmentMenuTriggerEl?.removeClass('is-open');
    this.attachmentMenuTriggerEl?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      this.attachmentMenuTriggerEl?.focus({ preventScroll: true });
    }
  }

  private toggleAgentMenu(): void {
    if (this.isAgentMenuOpen) {
      this.closeAgentMenu();
      return;
    }
    this.openAgentMenu();
  }

  private openAgentMenu(): void {
    this.closeAttachmentMenu();
    this.isAgentMenuOpen = true;
    this.agentMenuEl?.addClass('is-open');
    this.agentMenuTriggerEl?.addClass('is-open');
    this.agentMenuTriggerEl?.setAttribute('aria-expanded', 'true');
  }

  private closeAgentMenu(restoreFocus = false): void {
    this.isAgentMenuOpen = false;
    this.agentMenuEl?.removeClass('is-open');
    this.agentMenuTriggerEl?.removeClass('is-open');
    this.agentMenuTriggerEl?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      this.agentMenuTriggerEl?.focus({ preventScroll: true });
    }
  }

  private closeComposerMenuFromEscape(): boolean {
    if (this.isAttachmentMenuOpen) {
      this.closeAttachmentMenu(true);
      return true;
    }
    if (this.isAgentMenuOpen) {
      this.closeAgentMenu(true);
      return true;
    }
    return false;
  }

  private syncAgentMenuVisibility(): void {
    const hasContent = Boolean(this.capabilityHintEl?.isConnected);
    this.agentMenuEl?.toggleClass('is-hidden', !hasContent);
    if (!hasContent) {
      this.closeAgentMenu();
    }
  }

  private renderInputCounts(): void {
    if (!this.composerCountsEl || !this.inputTextareaEl) {
      return;
    }
    const value = this.inputTextareaEl.value;
    const words = value.trim() ? value.trim().split(/\s+/u).length : 0;
    this.composerCountsEl.setText(words === 0
      ? ''
      : t('chat.composerMenu.inputCounts', { words, characters: value.length }));
    this.composerCountsEl.toggleClass('is-hidden', value.length === 0);
  }

  /**
   * Render or remove a backend-specific capability chip near the send action.
   * First tries the host's getComposerCapabilityHint(); if the host does not
   * implement that seam, derives the hint from existing host signals:
   *   - When shouldMountAgentSelector is defined and returns false → Claude Code
   *     backend (lacks Subagents capability); show the /json structured-output chip.
   *   - Otherwise → no hint (OpenCode or unknown backend).
   * The hint is intentionally narrow: one fixed-schema trigger, no schema authoring.
   */
  private renderCapabilityHint(): void {
    const hint = this.resolveCapabilityHint();
    if (!hint) {
      this.activeCapabilityHint = null;
      this.capabilityHintEl?.remove();
      this.capabilityHintEl = null;
      this.syncAgentMenuVisibility();
      return;
    }

    if (!this.capabilityHintSlotEl) {
      return;
    }

    this.activeCapabilityHint = hint;

    if (!this.capabilityHintEl) {
      this.capabilityHintEl = this.capabilityHintSlotEl.createEl('button', {
        cls: `${this.capabilityHintHostClass} opencodian-composer-menu-item opencodian-tooltip-trigger`,
        attr: {
          type: 'button',
        },
      });
      this.capabilityHintEl.addEventListener('click', () => {
        this.applyCapabilityHintAction();
      });
    }

    if (this.capabilityHintEl) {
      this.capabilityHintEl.empty();
      this.capabilityHintEl.disabled = !hint.insertText || this.isComposerInteractionDisabled();
      this.capabilityHintEl.toggleClass('is-actionable', Boolean(hint.insertText));
      this.capabilityHintEl.setAttribute('aria-label', hint.tooltip ?? hint.text);
      this.host.setTooltipLabel(this.capabilityHintEl, hint.tooltip ?? hint.text, 'top');
      this.capabilityHintEl.createSpan({
        cls: `${this.capabilityHintHostClass}-glyph`,
        text: '{ }',
      });
      this.capabilityHintEl.createSpan({
        cls: `${this.capabilityHintHostClass}-text opencodian-composer-menu-item-label`,
        text: hint.text,
      });
    }
    this.syncAgentMenuVisibility();
  }

  /**
   * Resolve the current capability hint from host seams.
   * Falls back to deriving the hint when the host does not implement
   * getComposerCapabilityHint: when shouldMountAgentSelector is explicitly
   * false (no Subagents → Claude Code), show the /json hint.
   */
  private resolveCapabilityHint(): ComposerCapabilityHint | null {
    // When the host explicitly implements getComposerCapabilityHint, use it directly
    // (even if it returns null — that means "no hint for this backend").
    if (typeof this.host.getComposerCapabilityHint === 'function') {
      return this.host.getComposerCapabilityHint();
    }

    // Fallback: derive the hint from existing host signals.
    // No agent selector → Claude Code backend (lacks Subagents capability).
    if (this.host.shouldMountAgentSelector?.() === false) {
      return {
        text: t('chat.input.capabilityHint.jsonLabel'),
        tooltip: t('chat.input.capabilityHint.jsonTooltip'),
        insertText: '/json ',
      };
    }

    return null;
  }

  getTabBarSlotEl(): HTMLElement | null {
    return this.inputTabBarSlotEl;
  }

  getComposerShellEl(): HTMLElement | null {
    return this.composerShellEl;
  }

  getInputWrapperEl(): HTMLElement | null {
    return this.inputWrapperEl;
  }

  focusInput(): void {
    this.inputTextareaEl?.focus();
  }

  applyLocaleTexts(): void {
    if (this.addContextBtnEl) {
      this.host.setTooltipLabel(this.addContextBtnEl, t('chat.composerMenu.addFile'), 'top');
    }
    this.attachmentAddFileLabelEl?.setText(t('chat.composerMenu.addFile'));
    this.attachmentAddImageLabelEl?.setText(t('chat.composerMenu.addImage'));
    this.attachmentImageGenLabelEl?.setText(t('chat.composerMenu.generateImage'));
    this.attachmentWebViewerLabelEl?.setText(t('chat.composerMenu.attachWebViewer'));
    if (this.attachmentMenuTriggerEl) {
      this.attachmentMenuTriggerEl.setAttribute('aria-label', t('chat.composerMenu.attachment'));
      this.host.setTooltipLabel(this.attachmentMenuTriggerEl, t('chat.composerMenu.attachment'), 'top');
    }
    if (this.agentMenuTriggerEl) {
      this.agentMenuTriggerEl.setAttribute('aria-label', t('chat.composerMenu.runSettings'));
      this.host.setTooltipLabel(this.agentMenuTriggerEl, t('chat.composerMenu.runSettings'), 'top');
    }
    this.agentMenuTriggerTextEl?.setText(t('chat.agentSelector.trigger'));
    this.agentMenuHeadingEl?.setText(t('chat.composerMenu.runSettings'));
    this.agentMenuPanelEl?.setAttribute('aria-label', t('chat.composerMenu.runSettings'));

    const placeholderText = this.resolveInputPlaceholder();
    const labelId = this.inputTextareaEl?.getAttribute('aria-labelledby');
    const inputLabel = labelId ? this.inputTextareaEl?.ownerDocument.getElementById(labelId) : null;
    if (inputLabel) { inputLabel.textContent = t('chat.input.label'); }
    const textSpan = this.placeholderOverlayEl?.querySelector('.opencodian-input-placeholder-text');
    if (textSpan) { textSpan.textContent = placeholderText; }
    this.updateSendButtonState();
    this.updateComposerAvailabilityState();
    this.agentSelectionController.applyLocaleTexts();
    this.renderCapabilityHint();
    this.renderInputCounts();
  }

  updateSendButtonState(): void {
    if (!this.sendBtnEl) {
      return;
    }

    this.sendBtnEl.empty();
    this.sendBtnEl.disabled =
      this.isComposerInteractionDisabled() || this.promptSubmissionPending || this.isCancelSettlePending();
    if (this.host.isActiveTabStreaming()) {
      setIcon(this.sendBtnEl, 'square');
      this.sendBtnEl.addClass('opencodian-stop-btn');
      this.sendBtnEl.removeClass('opencodian-send-btn');
      this.host.setTooltipLabel(this.sendBtnEl, t('chat.input.stopStreaming'), 'top');
      return;
    }

    setIcon(this.sendBtnEl, 'send');
    this.sendBtnEl.addClass('opencodian-send-btn');
    this.sendBtnEl.removeClass('opencodian-stop-btn');
    this.host.setTooltipLabel(this.sendBtnEl, t('chat.input.sendMessage'), 'top');
  }

  /**
   * F2: converge the send/stop control after a cancel. The host flip happens
   * synchronously inside `cancelStreaming()`, so re-rendering here presents the
   * converged affordance right away; the control stays disabled until the
   * settle window elapses so the next click cannot land on a transitional
   * control. If the turn is still streaming when the window elapses (cancel
   * did not take effect), the control re-arms as an enabled stop button.
   */
  private beginCancelSettleWindow(): void {
    this.clearCancelSettleWindow();
    this.cancelSettleTimeoutId = window.setTimeout(() => {
      this.cancelSettleTimeoutId = null;
      this.updateSendButtonState();
    }, SEND_CANCEL_SETTLE_WINDOW_MS);
    this.updateSendButtonState();
  }

  private isCancelSettlePending(): boolean {
    return this.cancelSettleTimeoutId !== null;
  }

  private clearCancelSettleWindow(): void {
    if (this.cancelSettleTimeoutId !== null) {
      window.clearTimeout(this.cancelSettleTimeoutId);
      this.cancelSettleTimeoutId = null;
    }
  }

  scheduleLayoutSync(): void {
    if (this.layoutSyncFrameId !== null) {
      return;
    }

    this.layoutSyncFrameId = window.requestAnimationFrame(() => {
      this.layoutSyncFrameId = null;
      this.syncLayoutMetrics();
    });
  }

  clearScheduledLayoutSync(): void {
    if (this.layoutSyncFrameId !== null) {
      window.cancelAnimationFrame(this.layoutSyncFrameId);
      this.layoutSyncFrameId = null;
    }
  }

  private renderSuggestionBar(): void {
    if (!this.suggestionBarEl) {
      return;
    }

    const suggestionText = this.promptSuggestionService.getActiveSuggestionText();
    if (!suggestionText) {
      this.suggestionBarEl.replaceChildren();
      this.suggestionBarEl.classList.add('is-hidden');
      this.suggestionBarEl.remove();
      this.syncPromptSuggestionPlacementObserver(false);
      return;
    }

    this.suggestionBarEl.replaceChildren();
    this.suggestionBarEl.classList.remove('is-hidden');
    this.syncPromptSuggestionPlacementObserver(true);
    this.syncPromptSuggestionPlacement();

    const chipEl = this.suggestionBarEl.createEl('button', {
      cls: 'opencodian-suggestion-chip opencodian-tooltip-trigger',
      attr: { type: 'button' },
    });
    chipEl.createSpan({ cls: 'opencodian-suggestion-chip-text', text: suggestionText });
    this.host.setTooltipLabel(chipEl, suggestionText, 'top');

    chipEl.addEventListener('click', () => {
      this.replaceComposerInputValue(suggestionText);
      this.promptSuggestionService.acceptActiveSuggestion();
      this.renderSuggestionBar();
    });
  }

  private applyCapabilityHintAction(): void {
    const hint = this.activeCapabilityHint;
    if (!hint?.insertText || this.isComposerInteractionDisabled()) {
      return;
    }

    const textarea = this.inputTextareaEl;
    if (!textarea) {
      return;
    }

    if (/^\s*\/json(?:\s|$)/i.test(textarea.value)) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      return;
    }

    this.replaceComposerInputValue(`${hint.insertText}${textarea.value}`);
  }

  private replaceComposerInputValue(nextValue: string): void {
    if (!this.inputTextareaEl) {
      return;
    }

    this.inputTextareaEl.value = nextValue;
    this.syncTextareaHeight();
    if (this.host.shouldMountAgentSelector?.() !== false) {
      this.agentMentionController.syncContent(nextValue);
    }
    this.syncHighlightBackdrop();
    this.renderInputCounts();
    this.inputTextareaEl.focus();
    const cursor = nextValue.length;
    this.inputTextareaEl.setSelectionRange(cursor, cursor);
    void this.refreshComposerSuggestionMenu();
  }

  private wirePromptSuggestionFromSink(): void {
    // Clean up previous wiring if rebuild
    this.promptSuggestionSinkUnsub?.();
    this.promptSuggestionSessionUnsub?.();
    this.suggestionBarRefreshUnsub?.();
    this.promptSuggestionAdapterUnsub?.();
    this.promptSuggestionSinkUnsub = null;
    this.promptSuggestionSessionUnsub = null;
    this.suggestionBarRefreshUnsub = null;
    this.promptSuggestionAdapterUnsub = null;

    // Create a channel for scoped session changes
    this.promptSuggestionChannelId = createPromptSuggestionChannel();
    if (this.inputContainerEl) {
      stampPromptSuggestionScope(this.inputContainerEl, this.promptSuggestionChannelId);
    }

    // Subscribe to scoped session changes from the channel bus
    this.promptSuggestionSessionUnsub = onPromptSuggestionSessionChange(
      (sessionId) => {
        this.promptSuggestionService.setActiveSession(sessionId);
        this.renderSuggestionBar();
      },
      this.promptSuggestionChannelId,
    );

    // Subscribe to adapter (sink) changes
    this.promptSuggestionSinkUnsub = onPromptSuggestionSinkChange((sink) => {
      this.promptSuggestionAdapterUnsub?.();
      this.promptSuggestionAdapterUnsub = null;
      if (sink) {
        this.promptSuggestionAdapterUnsub = this.promptSuggestionService.attachAdapter(sink);
      } else {
        this.promptSuggestionService.clearAll();
        this.renderSuggestionBar();
      }
    });

    // Subscribe to bar refresh requests from the service
    this.suggestionBarRefreshUnsub = this.promptSuggestionService.onBarRefreshRequested(() => {
      this.renderSuggestionBar();
    });
  }

  destroy(): void {
    this.clearScheduledLayoutSync();
    this.clearCancelSettleWindow();
    if (this.menuDocumentClickHandler) {
      (this.composerShellEl?.ownerDocument ?? document).removeEventListener('click', this.menuDocumentClickHandler, true);
      this.menuDocumentClickHandler = null;
    }
    this.closeAttachmentMenu();
    this.closeAgentMenu();
    this.teardownImageDropSurface();
    this.inputContainerResizeObserver?.disconnect();
    this.inputContainerResizeObserver = null;
    this.syncComposerAvailabilityObserver(false);
    this.syncPromptSuggestionPlacementObserver(false);
    // Remove prompt suggestion scope and delete channel BEFORE nulling container
    const containerEl = this.inputContainerEl;
    const channelId = this.promptSuggestionChannelId;
    if (containerEl && channelId) {
      removePromptSuggestionScope(containerEl);
      deletePromptSuggestionChannel(channelId);
    }
    this.promptSuggestionChannelId = null;
    this.host.setContextRowElement(null);
    this.inputContainerEl = null;
    this.inputTabBarSlotEl = null;
    this.composerShellEl = null;
    this.inputWrapperEl = null;
    this.composerInputRowEl = null;
    this.composerContextActionsEl = null;
    this.composerSubmitControlsEl = null;
    this.composerStatusBarEl = null;
    this.composerContextUsageSlotEl = null;
    this.composerCountsEl = null;
    this.modelSlotEl = null;
    this.permissionSlotEl = null;
    this.agentSelectorSlotEl = null;
    this.agentSettingsBodyEl = null;
    this.agentToolbarEl = null;
    this.capabilityHintSlotEl = null;
    this.attachmentMenuEl = null;
    this.attachmentMenuTriggerEl = null;
    this.attachmentMenuPanelEl = null;
    this.agentMenuEl = null;
    this.agentMenuTriggerEl = null;
    this.agentMenuPanelEl = null;
    this.agentMenuTriggerTextEl = null;
    this.agentMenuHeadingEl = null;
    this.attachmentAddFileLabelEl = null;
    this.attachmentAddImageLabelEl = null;
    this.attachmentImageGenLabelEl = null;
    this.attachmentWebViewerLabelEl = null;
    this.addContextBtnEl = null;
    this.sendBtnEl = null;
    this.inputTextareaEl = null;
    this.highlightBackdropEl = null;
    this.availabilityNoticeEl?.remove();
    this.availabilityNoticeEl = null;
    this.composerAvailabilityNoticeSignature = null;
    this.capabilityHintEl = null;
    this.activeCapabilityHint = null;
    this.addImageBtnEl = null;
    this.imageChipContainerEl = null;
    this.attachedImages = [];
    this.promptSubmissionPending = false;
    this.fileInputEl?.remove();
    this.fileInputEl = null;
    this.slashCommandMenuEl = null;
    this.slashCommandMenuCatalogItems = null;
    this.suggestionBarEl?.remove();
    this.suggestionBarEl = null;
    this.slashCommandMenuController.reset();
    this.agentMentionController.reset();
    this.agentSelectionController.destroy();
    this.promptSuggestionAdapterUnsub?.();
    this.promptSuggestionAdapterUnsub = null;
    this.promptSuggestionSinkUnsub?.();
    this.promptSuggestionSinkUnsub = null;
    this.promptSuggestionSessionUnsub?.();
    this.promptSuggestionSessionUnsub = null;
    this.suggestionBarRefreshUnsub?.();
    this.suggestionBarRefreshUnsub = null;
    this.promptSuggestionService.clearAll();
  }

  private initializeLayoutMetrics(): void {
    if (!this.inputContainerEl) {
      return;
    }

    this.inputContainerResizeObserver?.disconnect();
    this.inputContainerResizeObserver = null;

    if (typeof ResizeObserver !== 'undefined') {
      this.inputContainerResizeObserver = new ResizeObserver(() => {
        this.scheduleLayoutSync();
      });
      this.inputContainerResizeObserver.observe(this.inputContainerEl);
    }

    this.scheduleLayoutSync();
  }

  private pruneEmptyToolbar(toolbarEl: HTMLElement): void {
    for (const child of Array.from(toolbarEl.children)) {
      if (child instanceof HTMLElement && child.childElementCount === 0 && (child.textContent ?? '').trim().length === 0) {
        child.remove();
      }
    }

    if (toolbarEl.childElementCount === 0) {
      toolbarEl.remove();
    }
  }

  private syncLayoutMetrics(): void {
    if (!this.inputContainerEl) {
      return;
    }

    this.syncComposerAvailabilityNoticePosition();
    const stackHeight = Math.ceil(
      this.inputContainerEl.offsetHeight + this.measureComposerAvailabilityNoticeReservedHeight(),
    );
    this.host.setComposerStackHeight(Math.max(0, stackHeight));
    this.host.scheduleSettledScrollToBottomIfNeeded();
  }

  private resolveInputPlaceholder(): string {
    if (readActiveBackendFromPlugin() === 'codex') {
      return t('chat.input.placeholderCodex');
    }
    return this.host.getInputPlaceholder();
  }

  private resolveComposerAvailabilityState(): NonNullable<ReturnType<NonNullable<ComposerInputShellCoordinatorHost['getComposerAvailabilityState']>>> {
    const state = this.host.getComposerAvailabilityState?.() ?? { kind: 'ready' as const };
    if (state.kind !== 'backend-offline') {
      return state;
    }

    const backendName = readActiveBackendDisplayNameFromPlugin();
    return {
      kind: 'backend-offline',
      title: t('chat.empty.backendOffline.titleWithBackend', { backend: backendName }),
      description: t('chat.empty.backendOffline.descriptionWithBackend', { backend: backendName }),
    };
  }

  private get shouldHandleAgentFeatures(): boolean {
    // Prefer the dedicated mention seam; fall back to the selector gate so existing
    // hosts/tests that only implement shouldMountAgentSelector keep working.
    if (typeof this.host.shouldHandleAgentMentions === 'function') {
      return this.host.shouldHandleAgentMentions() !== false;
    }
    return this.host.shouldMountAgentSelector?.() !== false;
  }

  private trySubmitCurrentInput(): void {
    if (!this.inputTextareaEl) {
      return;
    }

    if (this.isComposerInteractionDisabled()) {
      return;
    }

    if (this.promptSubmissionPending) {
      return;
    }

    if (this.host.isTabForegroundBusy()) {
      this.host.showProcessingBlockedNotice();
      return;
    }

    const rawContent = this.inputTextareaEl.value;
    const mentionIntents = this.shouldHandleAgentFeatures
      ? this.agentMentionController.resolveMentionIntents(rawContent)
      : [];
    const selectedAgentId = this.shouldHandleAgentFeatures
      ? this.agentSelectionController.getSelectedAgentId()
      : undefined;
    const submission = buildComposerInputSubmissionWithAgentIntents(
      rawContent,
      this.host.getComposerInputMode(),
      mentionIntents,
      selectedAgentId,
    ) ?? (
      this.host.getComposerInputMode() === 'prompt' && this.attachedImages.length > 0
        ? { kind: 'prompt' as const, content: '' }
        : null
    );
    if (submission === null) {
      return;
    }

    // Attach images to prompt submissions when present
    if (submission.kind === 'prompt' && this.attachedImages.length > 0) {
      submission.images = [...this.attachedImages];
    }

    this.promptSuggestionService.clearActiveOnTurnStart();
    if (submission.kind === 'prompt') {
      this.submitPromptWithRecovery(submission, rawContent, [...(submission.images ?? [])]);
      return;
    }
    void this.host.submitMessage(submission);
    this.clearSubmittedDraft();
  }

  /**
   * Prompt sends wait for the preparation decision. The callback is reached
   * before streaming begins; a rejected preflight leaves the submitted text
   * and chips available for correction, including a tab change during awaits.
   */
  private submitPromptWithRecovery(
    submission: Extract<ComposerInputSubmission, { kind: 'prompt' }>,
    submittedText: string,
    submittedImages: readonly ImageAttachment[],
  ): void {
    const submittedTextarea = this.inputTextareaEl;
    this.promptSubmissionPending = true;
    this.updateSendButtonState();
    const onPreparationOutcome = (outcome: MessageSendPreparationOutcome): void => {
      if (this.inputTextareaEl !== submittedTextarea) return;
      this.promptSubmissionPending = false;
      this.updateSendButtonState();
      if (outcome === 'rejected' || !this.isUnchangedPromptDraft(submittedText, submittedImages)) {
        return;
      }
      this.clearSubmittedDraft();
    };
    void Promise.resolve(this.host.submitMessage(submission, onPreparationOutcome)).catch((error) => {
      if (this.inputTextareaEl !== submittedTextarea) return;
      this.promptSubmissionPending = false;
      this.updateSendButtonState();
      logger.warn('Prompt submission failed before preparation completed', { error });
    });
  }

  private isUnchangedPromptDraft(
    submittedText: string,
    submittedImages: readonly ImageAttachment[],
  ): boolean {
    return this.inputTextareaEl?.value === submittedText
      && this.attachedImages.length === submittedImages.length
      && this.attachedImages.every((image, index) => image === submittedImages[index]);
  }

  private clearSubmittedDraft(): void {
    if (!this.inputTextareaEl) {
      return;
    }
    this.inputTextareaEl.value = '';
    this.host.onComposerSubmitted?.();
    this.agentMentionController.clearTrackedMentions();
    this.clearAttachedImages();
    this.syncTextareaHeight();
    this.syncHighlightBackdrop();
    this.renderInputCounts();
    this.agentMentionController.clear(this.slashCommandMenuEl);
  }

  private resolveTextareaMaxHeight(): number {
    return resolveTextareaMaxHeightFallback(this.host.getComposerTextareaMaxHeight?.());
  }

  private syncTextareaHeight(): void {
    if (!this.inputTextareaEl) {
      return;
    }

    // Toggle custom placeholder overlay visibility
    const isEmpty = !this.inputTextareaEl.value;
    if (this.placeholderOverlayEl) {
      this.placeholderOverlayEl.classList.toggle('is-hidden', !isEmpty);
    }

    const maxHeight = this.resolveTextareaMaxHeight();
    this.inputTextareaEl.style.height = 'auto';
    const nextHeight = Math.min(this.inputTextareaEl.scrollHeight, maxHeight);
    this.inputTextareaEl.style.height = `${nextHeight}px`;
    this.inputTextareaEl.style.overflowY = this.inputTextareaEl.scrollHeight > maxHeight
      ? 'auto'
      : 'hidden';
    if (this.highlightBackdropEl) {
      this.highlightBackdropEl.style.height = `${nextHeight}px`;
    }
    this.scheduleLayoutSync();
  }

  updateComposerAvailabilityState(): void {
    const state = this.resolveComposerAvailabilityState();
    const isDisabled = state.kind !== 'ready';

    if (isDisabled) {
      this.closeAttachmentMenu();
      this.closeAgentMenu();
    }
    this.composerShellEl?.toggleClass('is-composer-disabled', isDisabled);
    this.inputWrapperEl?.toggleClass('is-composer-disabled', isDisabled);
    this.inputTextareaEl?.toggleAttribute('disabled', isDisabled);
    this.addContextBtnEl?.toggleAttribute('disabled', isDisabled);
    this.attachmentMenuTriggerEl?.toggleAttribute('disabled', isDisabled);
    this.agentMenuTriggerEl?.toggleAttribute('disabled', isDisabled);
    this.updateSendButtonState();
    this.renderCapabilityHint();
    this.syncComposerAvailabilityObserver(isDisabled);
    this.renderComposerAvailabilityNotice(state);
    this.scheduleLayoutSync();
  }

  private isComposerInteractionDisabled(): boolean {
    return (this.resolveComposerAvailabilityState().kind ?? 'ready') !== 'ready';
  }

  private syncPromptSuggestionPlacement(): void {
    const suggestionBarEl = this.suggestionBarEl;
    if (!suggestionBarEl || suggestionBarEl.classList.contains('is-hidden')) {
      return;
    }

    const mountTarget = this.resolvePromptSuggestionMountTarget();
    const mountParent = mountTarget?.parentElement;
    if (!mountTarget?.isConnected || !mountParent) {
      suggestionBarEl.remove();
      return;
    }

    if (suggestionBarEl.parentElement !== mountParent || suggestionBarEl.previousElementSibling !== mountTarget) {
      mountParent.insertBefore(suggestionBarEl, mountTarget.nextSibling);
    }
  }

  private syncPromptSuggestionPlacementObserver(shouldObserve: boolean): void {
    if (!shouldObserve) {
      this.promptSuggestionPlacementObserver?.disconnect();
      this.promptSuggestionPlacementObserver = null;
      this.promptSuggestionPlacementRootEl = null;
      return;
    }

    const nextRoot = this.resolvePromptSuggestionPlacementRoot();
    if (!nextRoot?.isConnected) {
      this.promptSuggestionPlacementObserver?.disconnect();
      this.promptSuggestionPlacementObserver = null;
      this.promptSuggestionPlacementRootEl = null;
      return;
    }

    if (this.promptSuggestionPlacementObserver && this.promptSuggestionPlacementRootEl === nextRoot) {
      return;
    }

    this.promptSuggestionPlacementObserver?.disconnect();
    this.promptSuggestionPlacementRootEl = nextRoot;
    this.promptSuggestionPlacementObserver = new MutationObserver(() => {
      this.syncPromptSuggestionPlacement();
    });
    this.promptSuggestionPlacementObserver.observe(nextRoot, {
      childList: true,
      subtree: true,
    });
  }

  private renderComposerAvailabilityNotice(
    state: NonNullable<ReturnType<ComposerInputShellCoordinator['resolveComposerAvailabilityState']>>,
  ): boolean {
    if (state.kind === 'ready' || this.shouldSuppressComposerAvailabilityNotice()) {
      const hadNotice = Boolean(this.availabilityNoticeEl?.isConnected);
      this.availabilityNoticeEl?.remove();
      this.composerAvailabilityNoticeSignature = null;
      return hadNotice;
    }

    if (!this.inputContainerEl?.parentElement) {
      return false;
    }

    let didMutate = false;

    if (!this.availabilityNoticeEl) {
      this.availabilityNoticeEl = document.createElement('div');
      this.availabilityNoticeEl.className =
        'opencodian-composer-availability-notice opencodian-chat-notice-card is-warning';
      didMutate = true;
    }

    const title = state.title ?? t('chat.empty.noBackend.title');
    const description = state.description ?? t('chat.empty.noBackend.description');
    const actionLabel = this.resolveSettingsActionButton()
      ? t('chat.settings.open')
      : '';
    const nextSignature = `${state.kind}\u0000${title}\u0000${description}\u0000${actionLabel}`;
    if (this.composerAvailabilityNoticeSignature !== nextSignature) {
      this.availabilityNoticeEl.replaceChildren();
      const iconEl = this.availabilityNoticeEl.createDiv({ cls: 'opencodian-chat-notice-icon' });
      setIcon(iconEl, 'alert-triangle');

      const bodyEl = this.availabilityNoticeEl.createDiv({ cls: 'opencodian-chat-notice-body' });
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-title',
        text: title,
      });
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-text',
        text: description,
      });

      if (actionLabel) {
        const actionsEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-actions' });
        const actionBtn = actionsEl.createEl('button', {
          cls: 'opencodian-chat-notice-action-btn',
          text: actionLabel,
        });
        actionBtn.type = 'button';
        actionBtn.addEventListener('click', () => {
          this.resolveSettingsActionButton()?.click();
        });
      }

      this.composerAvailabilityNoticeSignature = nextSignature;
      didMutate = true;
    }

    if (this.availabilityNoticeEl.parentElement !== this.inputContainerEl.parentElement
      || this.availabilityNoticeEl.nextElementSibling !== this.inputContainerEl) {
      this.inputContainerEl.before(this.availabilityNoticeEl);
      didMutate = true;
    }
    if (this.syncComposerAvailabilityNoticePosition()) {
      didMutate = true;
    }
    return didMutate;
  }

  private resolvePromptSuggestionPlacementRoot(): HTMLElement | null {
    const containerEl = this.inputContainerEl?.closest<HTMLElement>('.opencodian-container');
    if (!containerEl) {
      return null;
    }

    return containerEl.querySelector<HTMLElement>('.opencodian-messages.is-active')
      ?? containerEl.querySelector<HTMLElement>('.opencodian-messages');
  }

  private resolvePromptSuggestionMountTarget(): HTMLElement | null {
    const messagesRoot = this.resolvePromptSuggestionPlacementRoot();
    const assistantMessages = Array.from(
      messagesRoot?.querySelectorAll<HTMLElement>(
        '.opencodian-message--assistant:not(.opencodian-message--notice):not(.opencodian-message--background-task)',
      ) ?? [],
    );
    return assistantMessages.at(-1) ?? null;
  }

  private shouldSuppressComposerAvailabilityNotice(): boolean {
    const messagesRoot = this.resolvePromptSuggestionPlacementRoot();
    if (!messagesRoot) {
      return false;
    }

    return Boolean(
      messagesRoot.querySelector<HTMLElement>(
        '.opencodian-message[data-message-id="opencodian-empty-state-no-backend"],'
        + '.opencodian-message[data-message-id="opencodian-empty-state-backend-offline"]',
      ),
    );
  }

  private resolveSettingsActionButton(): HTMLButtonElement | null {
    const containerEl = this.inputContainerEl?.closest<HTMLElement>('.opencodian-container');
    if (!containerEl) {
      return null;
    }

    const buttonEl = containerEl.querySelector<HTMLButtonElement>('.opencodian-header-btn[data-action="settings"]');
    return buttonEl?.isConnected ? buttonEl : null;
  }

  private syncComposerAvailabilityObserver(shouldObserve: boolean): void {
    if (!shouldObserve) {
      this.composerAvailabilityObserver?.disconnect();
      this.composerAvailabilityObserver = null;
      this.composerAvailabilityObserverRootEl = null;
      return;
    }

    const nextRoot = this.inputContainerEl?.parentElement ?? null;
    if (!nextRoot?.isConnected) {
      this.composerAvailabilityObserver?.disconnect();
      this.composerAvailabilityObserver = null;
      this.composerAvailabilityObserverRootEl = null;
      return;
    }

    if (this.composerAvailabilityObserver && this.composerAvailabilityObserverRootEl === nextRoot) {
      return;
    }

    this.composerAvailabilityObserver?.disconnect();
    this.composerAvailabilityObserverRootEl = nextRoot;
    this.composerAvailabilityObserver = new MutationObserver(() => {
      const didMutate = this.renderComposerAvailabilityNotice(
        this.resolveComposerAvailabilityState(),
      );
      if (didMutate) {
        this.scheduleLayoutSync();
      }
    });
    this.composerAvailabilityObserver.observe(nextRoot, {
      childList: true,
      subtree: true,
    });
  }

  private measureComposerAvailabilityNoticeHeight(): number {
    const noticeEl = this.availabilityNoticeEl;
    if (!noticeEl?.isConnected) {
      return 0;
    }

    const styles = window.getComputedStyle(noticeEl);
    const marginTop = Number.parseFloat(styles.marginTop || '0') || 0;
    const marginBottom = Number.parseFloat(styles.marginBottom || '0') || 0;
    return Math.ceil(noticeEl.getBoundingClientRect().height + marginTop + marginBottom);
  }

  private measureComposerAvailabilityNoticeReservedHeight(): number {
    const noticeHeight = this.measureComposerAvailabilityNoticeHeight();
    if (noticeHeight <= 0) {
      return 0;
    }

    return noticeHeight + COMPOSER_AVAILABILITY_NOTICE_GAP_PX;
  }

  private syncComposerAvailabilityNoticePosition(): boolean {
    if (!this.inputContainerEl || !this.availabilityNoticeEl?.isConnected) {
      return false;
    }

    const nextBottom = `${Math.ceil(this.inputContainerEl.offsetHeight + COMPOSER_AVAILABILITY_NOTICE_GAP_PX)}px`;
    if (this.availabilityNoticeEl.style.bottom === nextBottom) {
      return false;
    }

    this.availabilityNoticeEl.style.bottom = nextBottom;
    return true;
  }

  private async refreshComposerSuggestionMenu(): Promise<void> {
    const textarea = this.inputTextareaEl;
    if (!textarea) {
      return;
    }

    const slashQuery = getSlashCommandMenuQuery(textarea);
    // Codex `$skill-name` is a first-class trigger that opens the SAME skill
    // selector as `/`. Detect it here and route to the slash menu exactly like
    // `/` so no intermediate agent/command logic can clear the textarea or hide
    // the menu. This must run before any input-state reset.
    const codexSkillQuery = this.host.isCodexBackendActive?.()
      ? getCodexSkillMenuQuery(textarea)
      : null;
    if (slashQuery !== null || codexSkillQuery !== null) {
      this.agentMentionController.clear(this.slashCommandMenuEl);
      await this.refreshSlashCommandMenu();
      return;
    }

    // Codex has no native agent dispatch API and cannot produce @agent
    // candidates. When the user types `@`, surface an actionable notice once
    // per token (pointing to the Codex resource settings) instead of silently
    // doing nothing.
    if (this.host.isCodexBackendActive?.() && typeof this.host.onCodexAgentMentionUnavailable === 'function') {
      const codexAgentQuery = this.agentMentionController.getQuery(textarea);
      if (codexAgentQuery) {
        const signature = `${textarea.value.length}:${textarea.selectionStart ?? textarea.value.length}`;
        if (this.codexAgentNoticeInputSignature !== signature) {
          this.codexAgentNoticeInputSignature = signature;
          this.host.onCodexAgentMentionUnavailable();
        }
      } else {
        this.codexAgentNoticeInputSignature = null;
      }
    } else {
      this.codexAgentNoticeInputSignature = null;
    }

    // Check agent mention query before isCommandComposerText, so that typing
    // @ after mid-text slash commands (e.g. "text /cmd @agent") still shows
    // the agent autocomplete. When the input starts with /command, only block
    // agent suggestions while the user is actively selecting a command name;
    // once a command is chosen and arguments are being typed, @ should trigger
    // agent mentions normally.
    // Skip agent mention queries when the agent feature is disabled.
    const agentQuery = this.shouldHandleAgentFeatures
      ? this.agentMentionController.getQuery(textarea)
      : null;
    const isSelectingSlashCommand = getSlashCommandMenuQuery(textarea) !== null
      || codexSkillQuery !== null;
    if (agentQuery && !isSelectingSlashCommand) {
      this.clearSlashCommandMenu();
      await this.agentMentionController.refresh(agentQuery, this.slashCommandMenuEl);
      return;
    }

    if (isCommandComposerText(textarea.value)) {
      this.agentMentionController.clear(this.slashCommandMenuEl);
      this.clearSlashCommandMenu();
      return;
    }

    this.agentMentionController.clear(this.slashCommandMenuEl);
    await this.refreshSlashCommandMenu();
  }

  private tryHandleAgentMentionMenuKeydown(event: KeyboardEvent): boolean {
    if (!this.shouldHandleAgentFeatures) {
      return false;
    }
    return this.agentMentionController.tryHandleKeydown(
      event,
      this.inputTextareaEl,
      this.slashCommandMenuEl,
    );
  }

  private tryHandleSlashCommandMenuKeydown(event: KeyboardEvent): boolean {
    return this.slashCommandMenuController.tryHandleKeydown(event);
  }

  private async refreshSlashCommandMenu(): Promise<void> {
    await this.slashCommandMenuController.refresh();
  }

  private clearSlashCommandMenu(options: { resetCatalog?: boolean } = {}): void {
    this.slashCommandMenuController.clear(options);
  }

  private syncHighlightBackdrop(): void {
    const textarea = this.inputTextareaEl;
    const backdrop = this.highlightBackdropEl;
    if (!textarea || !backdrop) {
      return;
    }

    const content = textarea.value;
    if (!content) {
      backdrop.empty();
      backdrop.scrollTop = 0;
      return;
    }

    // Collect all highlight spans
    const spans: InputHighlightSpan[] = [];

    for (const slashMatch of this.extractKnownSlashHighlightMatches(content)) {
      spans.push({
        start: slashMatch.start,
        end: slashMatch.end,
        kind: slashMatch.kind,
      });
    }

    // Agent mention highlights
    const mentions = this.agentMentionController.resolveMentionPillSpans(content);
    for (const mention of mentions) {
      spans.push({
        start: mention.start,
        end: mention.end,
        kind: 'agent',
        agentId: mention.agentId,
        value: mention.value,
      });
    }

    // Sort by position and render
    spans.sort((a, b) => a.start - b.start);

    let html = '';
    let lastIndex = 0;
    for (const span of spans) {
      if (span.start < lastIndex) {
        continue;
      }
      html += escapeHtmlContent(content.slice(lastIndex, span.start));
      html += `<span class="${this.getInputHighlightClassName(span.kind)}"${this.getInputHighlightAttributes(span)}>${escapeHtmlContent(content.slice(span.start, span.end))}</span>`;
      lastIndex = span.end;
    }

    html += escapeHtmlContent(content.slice(lastIndex));

    if (content.endsWith('\n')) {
      html += '\n';
    }

    backdrop.innerHTML = html;
    backdrop.scrollTop = textarea.scrollTop;
  }

  private extractKnownSlashHighlightMatches(content: string): InputHighlightSpan[] {
    if (!content || !this.slashCommandMenuCatalogItems || this.slashCommandMenuCatalogItems.length === 0) {
      return [];
    }

    const matches: InputHighlightSpan[] = [];
    let slashMatch: RegExpExecArray | null;
    while ((slashMatch = INPUT_HIGHLIGHT_SLASH_REGEX.exec(content)) !== null) {
      const token = slashMatch[2];
      const kind = token ? this.getKnownSlashHighlightKind(token) : null;
      if (!kind) {
        continue;
      }

      const start = slashMatch.index + slashMatch[1].length;
      const end = start + token.length;
      matches.push({ start, end, kind });
    }

    return matches;
  }

  private getKnownSlashHighlightKind(token: string): 'command' | 'skill' | null {
    if (!this.slashCommandMenuCatalogItems || !token.startsWith('/')) {
      return null;
    }

    const skillMode = this.host.getSlashCommandSkillMode();
    if (/^\/skills(?:\s|$)/i.test(token)) {
      if (skillMode !== 'skills-command') {
        return null;
      }

      const trimmed = token.trim();
      if (trimmed === '/skills') {
        return this.slashCommandMenuCatalogItems.some((item) => item.source === 'skill')
          ? 'command'
          : null;
      }

      const skillName = trimmed.slice('/skills '.length).trim();
      return skillName.length > 0
        && this.slashCommandMenuCatalogItems.some((item) => item.source === 'skill' && item.id === skillName)
        ? 'skill'
        : null;
    }

    const commandId = token.slice(1);
    if (commandId.length === 0) {
      return null;
    }

    const catalogItem = this.slashCommandMenuCatalogItems.find((item) => item.id === commandId);
    if (!catalogItem) {
      return null;
    }

    return catalogItem.source === 'skill' ? 'skill' : 'command';
  }

  private getInputHighlightClassName(kind: InputHighlightKind): string {
    return `opencodian-input-highlight-token opencodian-input-highlight-${kind}`;
  }

  private getInputHighlightAttributes(span: InputHighlightSpan): string {
    if (span.kind !== 'agent' || !span.agentId || !span.value) {
      return '';
    }

    return [
      ' contenteditable="false"',
      ' data-type="agent"',
      ` data-name="${escapeHtmlAttribute(span.agentId)}"`,
      ` data-value="${escapeHtmlAttribute(span.value)}"`,
    ].join('');
  }

  private syncHighlightBackdropScroll(): void {
    const textarea = this.inputTextareaEl;
    const backdrop = this.highlightBackdropEl;
    if (!textarea || !backdrop) {
      return;
    }

    backdrop.scrollTop = textarea.scrollTop;
  }

  // -------------------------------------------------------------------------
  // Image attachment helpers
  // -------------------------------------------------------------------------

  private filterImageFiles(files: FileList): File[] {
    return Array.from(files).filter((file) => this.inferMediaType(file.type) !== null);
  }

  private async processImageFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const mediaType = this.inferMediaType(file.type);
      if (!mediaType) {
        continue;
      }
      try {
        const data = await this.readFileAsBase64(file);
        this.attachedImages.push({
          data,
          mediaType,
          filename: file.name,
        });
      } catch (error) {
        logger.warn('Failed to read image attachment', { filename: file.name, error });
        new Notice(t('chat.image.readFailed'));
      }
    }

    this.renderImageChips();
    this.scheduleLayoutSync();
  }

  private async handleFileSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    const imageFiles = this.filterImageFiles(files);
    if (imageFiles.length > 0) {
      await this.processImageFiles(imageFiles);
    }
    input.value = '';
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private inferMediaType(mime: string): ImageAttachment['mediaType'] | null {
    if (mime === 'image/jpeg') return 'image/jpeg';
    if (mime === 'image/png') return 'image/png';
    if (mime === 'image/gif') return 'image/gif';
    if (mime === 'image/webp') return 'image/webp';
    return null;
  }

  private renderImageChips(): void {
    if (!this.inputWrapperEl) {
      return;
    }

    if (!this.imageChipContainerEl) {
      this.imageChipContainerEl = this.inputWrapperEl.createDiv({
        cls: 'opencodian-composer-image-chips',
      });
      this.inputWrapperEl.insertBefore(
        this.imageChipContainerEl,
        this.inputWrapperEl.querySelector('.opencodian-composer-content'),
      );
    }

    this.imageChipContainerEl.empty();

    if (this.attachedImages.length === 0) {
      // Removing the last chip must not leave the empty chip row mounted:
      // its margins would render as a blank strip above the input inside
      // bordered composer cards. Keep this consistent with clearAttachedImages().
      this.imageChipContainerEl.remove();
      this.imageChipContainerEl = null;
      return;
    }

    for (let i = 0; i < this.attachedImages.length; i++) {
      const image = this.attachedImages[i];
      const chipEl = this.imageChipContainerEl.createDiv({
        cls: 'opencodian-composer-image-chip',
      });

      const previewButton = chipEl.createEl('button', {
        cls: 'opencodian-composer-image-chip-preview',
        attr: {
          type: 'button',
          'aria-label': t('chat.image.openPreview'),
        },
      });
      previewButton.createEl('img', {
        cls: 'opencodian-composer-image-chip-thumb',
        attr: {
          src: `data:${image.mediaType};base64,${image.data}`,
          alt: image.filename ?? t('chat.image.untitledImage'),
        },
      });
      previewButton.addEventListener('click', () => {
        openImagePreview({
          src: `data:${image.mediaType};base64,${image.data}`,
          alt: image.filename ?? t('chat.image.untitledImage'),
        });
      });

      const removeBtn = chipEl.createEl('button', {
        cls: 'opencodian-composer-image-chip-remove',
        attr: {
          type: 'button',
          'aria-label': t('chat.image.removeImage'),
        },
      });
      setIcon(removeBtn, 'x');
      removeBtn.addEventListener('click', () => {
        this.attachedImages.splice(i, 1);
        this.renderImageChips();
        this.scheduleLayoutSync();
      });
    }
  }

  private clearAttachedImages(): void {
    this.attachedImages = [];
    this.imageChipContainerEl?.remove();
    this.imageChipContainerEl = null;
  }

  /**
   * R-E2: the Web Viewer attach button. Availability is checked up front AND
   * again on every click (the active tab can change between render and
   * click); a null context removes the button so the entry tracks the
   * active leaf honestly.
   */
  private async setupWebViewerContextButton(): Promise<void> {
    const tab = await this.host.getActiveWebViewerTabContext?.() ?? null;
    if (!tab || !this.attachmentMenuPanelEl?.isConnected) {
      return;
    }
    const btnEl = this.attachmentMenuPanelEl.createEl('button', {
      cls: 'opencodian-composer-menu-item opencodian-composer-webviewer-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        role: 'menuitem',
        'aria-label': t('chat.webViewer.attachButton'),
      },
    });
    const iconEl = btnEl.createSpan({ cls: 'opencodian-composer-menu-item-icon' });
    setIcon(iconEl, 'globe');
    this.attachmentWebViewerLabelEl = btnEl.createSpan({
      cls: 'opencodian-composer-menu-item-label',
      text: t('chat.composerMenu.attachWebViewer'),
    });
    this.host.setTooltipLabel(btnEl, t('chat.webViewer.attachButton'), 'top');
    btnEl.addEventListener('click', async () => {
      const current = await this.host.getActiveWebViewerTabContext?.() ?? null;
      if (!current) {
        btnEl.remove();
        this.attachmentWebViewerLabelEl = null;
        return;
      }
      this.closeAttachmentMenu();
      this.host.attachWebViewerTabContextToActiveTab?.(current);
    });
  }

  private installImageDropSurface(): void {
    const surface = this.inputContainerEl?.parentElement ?? this.inputContainerEl;
    if (!surface) {
      return;
    }

    this.imageDropSurfaceEl = surface;
    surface.addClass('opencodian-image-drop-surface');
    surface.dataset.imageDropLabel = t('chat.image.dropToAttach');
    surface.addEventListener('dragover', this.handleImageDropDragOver);
    surface.addEventListener('dragleave', this.handleImageDropDragLeave);
    surface.addEventListener('drop', this.handleImageDrop);
  }

  private teardownImageDropSurface(): void {
    const surface = this.imageDropSurfaceEl;
    if (!surface) {
      return;
    }

    surface.removeEventListener('dragover', this.handleImageDropDragOver);
    surface.removeEventListener('dragleave', this.handleImageDropDragLeave);
    surface.removeEventListener('drop', this.handleImageDrop);
    surface.removeClass('opencodian-image-drop-surface', 'is-image-drag-over');
    delete surface.dataset.imageDropLabel;
    this.imageDropSurfaceEl = null;
  }

  private readonly handleImageDropDragOver = (event: DragEvent): void => {
    if (this.isComposerInteractionDisabled()) {
      return;
    }

    const files = event.dataTransfer?.files;
    if (!files || this.filterImageFiles(files).length === 0) {
      return;
    }

    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    this.imageDropSurfaceEl?.addClass('is-image-drag-over');
  };

  private readonly handleImageDropDragLeave = (event: DragEvent): void => {
    const surface = this.imageDropSurfaceEl;
    if (!surface?.contains(event.relatedTarget as Node)) {
      surface?.removeClass('is-image-drag-over');
    }
  };

  private readonly handleImageDrop = (event: DragEvent): void => {
    this.imageDropSurfaceEl?.removeClass('is-image-drag-over');
    if (this.isComposerInteractionDisabled()) {
      return;
    }

    // R-A7: vault paths ride `text/plain` (Obsidian file-explorer drags).
    // Resolution goes through `app.vault.getAbstractFileByPath()` on the
    // host side; only a claimed drop is preventDefault-ed, so editor text
    // drags keep their default insert behaviour.
    const rawPath = typeof event.dataTransfer?.getData === 'function'
      ? event.dataTransfer.getData('text/plain') ?? ''
      : '';
    if (rawPath.trim() && this.host.addVaultPathContextFromDrop) {
      if (this.host.addVaultPathContextFromDrop(rawPath)) {
        event.preventDefault();
        return;
      }
    }

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    const imageFiles = this.filterImageFiles(files);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void this.processImageFiles(imageFiles);
  };

}

function escapeHtmlContent(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(text: string): string {
  return escapeHtmlContent(text).replace(/"/g, '&quot;');
}
