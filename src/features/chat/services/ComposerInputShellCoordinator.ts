/* eslint-disable max-lines -- This owner keeps composer textarea, @agent selector, slash menu, and layout sync together because they share DOM, focus, and overlay lifecycle. */
import { setIcon } from 'obsidian';

import {
  createPromptSuggestionChannel,
  deletePromptSuggestionChannel,
  onPromptSuggestionSessionChange,
  onPromptSuggestionSinkChange,
  removePromptSuggestionScope,
  stampPromptSuggestionScope,
} from '../../../core/agents/backend/promptSuggestionSink';
import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';
import type { SlashCommandSkillMode } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { type AgentMentionCandidate, AgentMentionComposerController } from './AgentMentionComposerController';
import { ChatAgentSelectionCoordinator } from './ChatAgentSelectionCoordinator';
import {
  buildComposerInputSubmissionWithAgentIntents,
  getSlashCommandMenuQuery,
  isCommandComposerText,
} from './composerInputParsing';
import type { ComposerInputMode, ComposerInputSubmission } from './MessageSendPreparationService';
import { PromptSuggestionService } from './PromptSuggestionService';
import {
  loadAgentMentionCandidatesFromComposerCatalog,
  loadAgentSelectionCandidatesFromComposerCatalog,
} from './SlashCommandMenuCatalogCache';
import { SlashCommandMenuCoordinator } from './SlashCommandMenuCoordinator';

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;
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

export { buildComposerInputSubmission } from './composerInputParsing';

export interface ComposerInputShellCoordinatorHost {
  attachSessionTodo(container: HTMLElement): void;
  attachQuestionDock(container: HTMLElement): void;
  setContextRowElement(element: HTMLElement | null): void;
  setTooltipLabel(element: HTMLElement, label: string, position?: 'bottom' | 'top' | 'right'): void;
  getInputPlaceholder(): string;
  getSlashCommandSkillMode(): SlashCommandSkillMode;
  addChosenFileContextToActiveTab(): Promise<void>;
  mountSelectionControls(toolbar: HTMLElement, options: { showModels: boolean; showPermissions: boolean }): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
  /** Whether to mount the agent (@agent) selector and sync agent mentions. Defaults to true. */
  shouldMountAgentSelector?(): boolean;
  isActiveTabStreaming(): boolean;
  cancelStreaming(): void;
  isTabForegroundBusy(): boolean;
  showProcessingBlockedNotice(): void;
  getComposerInputMode(): ComposerInputMode;
  submitMessage(submission: ComposerInputSubmission): void | Promise<void>;
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
   * Optional backend-specific capability hint rendered near the composer input.
   * Returns null when no hint should be displayed.
   * This is intentionally narrow: the coordinator renders the hint as-is;
   * the host decides what hint (if any) is appropriate for the active backend.
   * Currently falls back to deriving the hint from shouldMountAgentSelector
   * when the host does not implement getComposerCapabilityHint.
   */
  getComposerCapabilityHint?(): { text: string } | null;
}

export class ComposerInputShellCoordinator {
  private inputContainerEl: HTMLElement | null = null;
  private inputTabBarSlotEl: HTMLElement | null = null;
  private composerShellEl: HTMLElement | null = null;
  private inputWrapperEl: HTMLElement | null = null;
  private addContextBtnEl: HTMLButtonElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private inputTextareaEl: HTMLTextAreaElement | null = null;
  private highlightBackdropEl: HTMLElement | null = null;
  private placeholderOverlayEl: HTMLElement | null = null;
  private disabledStateEl: HTMLElement | null = null;
  private capabilityHintEl: HTMLElement | null = null;
  private readonly capabilityHintHostClass = 'opencodian-input-capability-hint';
  private slashCommandMenuEl: HTMLElement | null = null;
  private layoutSyncFrameId: number | null = null;
  private inputContainerResizeObserver: ResizeObserver | null = null;
  private slashCommandMenuCatalogItems: SlashCommandMenuItem[] | null = null;
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
    });
    this.slashCommandMenuController = new SlashCommandMenuCoordinator({
      getTextarea: () => this.inputTextareaEl,
      getMenuElement: () => this.slashCommandMenuEl,
      getCatalogItems: () => this.slashCommandMenuCatalogItems,
      setCatalogItems: (items) => { this.slashCommandMenuCatalogItems = items; },
      loadItems: () => this.host.loadSlashCommandMenuItems(),
      getSkillMode: () => this.host.getSlashCommandSkillMode(),
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

    this.inputTabBarSlotEl = container.createDiv({
      cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--input',
    });
    this.host.attachSessionTodo(container);
    this.host.attachQuestionDock(container);

    this.composerShellEl = container.createDiv({ cls: 'opencodian-composer-shell' });
    this.inputWrapperEl = this.composerShellEl.createDiv({ cls: 'opencodian-input-wrapper' });
    const composerContentEl = this.inputWrapperEl.createDiv({ cls: 'opencodian-composer-content' });
    this.host.setContextRowElement(
      composerContentEl.createDiv({ cls: 'opencodian-composer-context-row is-empty' }),
    );

    const highlightContainerEl = composerContentEl.createDiv({ cls: 'opencodian-input-highlight-container' });
    this.highlightBackdropEl = highlightContainerEl.createDiv({
      cls: 'opencodian-input-highlight-backdrop',
      attr: { 'aria-hidden': 'true' },
    });

    // Custom placeholder overlay (-webkit-line-clamp:2; native placeholder cannot be clamped).
    const placeholderText = this.host.getInputPlaceholder();
    this.placeholderOverlayEl = highlightContainerEl.createDiv({ cls: 'opencodian-input-placeholder', attr: { 'aria-hidden': 'true' } });
    this.placeholderOverlayEl.createSpan({ cls: 'opencodian-input-placeholder-text', text: placeholderText });

    this.inputTextareaEl = highlightContainerEl.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { rows: '1' },
    });
    this.inputTextareaEl.addEventListener('input', () => {
      this.syncTextareaHeight();
      if (this.host.shouldMountAgentSelector?.() !== false) {
        this.agentMentionController.syncContent(this.inputTextareaEl?.value ?? '');
      }
      this.syncHighlightBackdrop();
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
    this.syncTextareaHeight();
    this.slashCommandMenuEl = this.composerShellEl.createDiv({
      cls: 'opencodian-slash-command-menu is-hidden',
    });
    this.slashCommandMenuEl.setAttribute('role', 'listbox');

    // Prompt suggestion bar — rendered between textarea and footer
    this.suggestionBarEl = composerContentEl.createDiv({
      cls: 'opencodian-suggestion-bar is-hidden',
    });

    const composerFooterEl = composerContentEl.createDiv({ cls: 'opencodian-composer-footer' });
    this.addContextBtnEl = composerFooterEl.createEl('button', {
      cls: 'opencodian-composer-add-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'aria-label': t('chat.context.addContext'),
      },
    });
    setIcon(this.addContextBtnEl, 'plus');
    this.host.setTooltipLabel(this.addContextBtnEl, t('chat.context.addContext'), 'top');
    this.addContextBtnEl.addEventListener('click', () => {
      void this.host.addChosenFileContextToActiveTab();
    });

    this.sendBtnEl = composerFooterEl.createEl('button', {
      cls: 'opencodian-send-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
      },
    });
    this.sendBtnEl.addEventListener('click', () => {
      if (this.host.isActiveTabStreaming()) {
        this.host.cancelStreaming();
      } else {
        this.trySubmitCurrentInput();
      }
    });
    this.updateSendButtonState();
    this.updateComposerAvailabilityState();

    this.mountToolbarControls();
    this.renderCapabilityHint();

    this.initializeLayoutMetrics();

    this.wirePromptSuggestionFromSink();
  }

  refreshToolbarControls(): void {
    this.mountToolbarControls();
    this.renderCapabilityHint();
  }

  private mountToolbarControls(): void {
    if (!this.composerShellEl) {
      return;
    }

    this.agentSelectionController.destroy();
    this.composerShellEl.querySelector(':scope > .opencodian-input-toolbar')?.remove();

    const toolbarEl = this.composerShellEl.createDiv({ cls: 'opencodian-input-toolbar' });
    if (this.host.shouldMountAgentSelector?.() !== false) {
      this.agentSelectionController.mount(toolbarEl.createDiv({ cls: 'opencodian-agent-selector' }));
    }
    this.host.mountSelectionControls(toolbarEl, {
      showModels: true,   // Host will gate based on capability
      showPermissions: true, // Host will gate based on capability
    });
    this.host.mountContextUsageIndicator(toolbarEl.createDiv({ cls: 'opencodian-context-usage-slot' }));
    this.host.mountEffortSelector(toolbarEl.createDiv({ cls: 'opencodian-effort-slot' }));
    this.pruneEmptyToolbar(toolbarEl);
  }

  /**
   * Render or remove a backend-specific capability hint near the composer input.
   * First tries the host's getComposerCapabilityHint(); if the host does not
   * implement that seam, derives the hint from existing host signals:
   *   - When shouldMountAgentSelector is defined and returns false → Claude Code
   *     backend (lacks Subagents capability); show the /json structured-output hint.
   *   - Otherwise → no hint (OpenCode or unknown backend).
   * The hint is intentionally narrow: one fixed-schema trigger, no schema authoring.
   */
  private renderCapabilityHint(): void {
    const hint = this.resolveCapabilityHint();
    if (!hint) {
      this.capabilityHintEl?.remove();
      this.capabilityHintEl = null;
      return;
    }

    if (!this.capabilityHintEl) {
      // Insert after the composer content (textarea area) but before the toolbar,
      // inside inputWrapperEl — this is the most discoverable position near the text input.
      this.capabilityHintEl = this.inputWrapperEl?.createDiv({ cls: this.capabilityHintHostClass }) ?? null;
    }

    if (this.capabilityHintEl) {
      this.capabilityHintEl.empty();
      this.capabilityHintEl.createSpan({
        cls: `${this.capabilityHintHostClass}-text`,
        text: hint.text,
      });
    }
  }

  /**
   * Resolve the current capability hint from host seams.
   * Falls back to deriving the hint when the host does not implement
   * getComposerCapabilityHint: when shouldMountAgentSelector is explicitly
   * false (no Subagents → Claude Code), show the /json hint.
   */
  private resolveCapabilityHint(): { text: string } | null {
    // When the host explicitly implements getComposerCapabilityHint, use it directly
    // (even if it returns null — that means "no hint for this backend").
    if (typeof this.host.getComposerCapabilityHint === 'function') {
      return this.host.getComposerCapabilityHint();
    }

    // Fallback: derive the hint from existing host signals.
    // No agent selector → Claude Code backend (lacks Subagents capability).
    if (this.host.shouldMountAgentSelector?.() === false) {
      return { text: t('chat.input.capabilityHint.json') };
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

  applyLocaleTexts(): void {
    if (this.addContextBtnEl) {
      this.host.setTooltipLabel(this.addContextBtnEl, t('chat.context.addContext'), 'top');
    }

    const placeholderText = this.host.getInputPlaceholder();
    // aria-label removed — the custom placeholder overlay already provides the visual cue,
    // and aria-label on the textarea caused an unwanted native tooltip on hover in Obsidian.
    const textSpan = this.placeholderOverlayEl?.querySelector('.opencodian-input-placeholder-text');
    if (textSpan) { textSpan.textContent = placeholderText; }
    this.updateSendButtonState();
    this.updateComposerAvailabilityState();
    this.agentSelectionController.applyLocaleTexts();
    this.renderCapabilityHint();
  }

  updateSendButtonState(): void {
    if (!this.sendBtnEl) {
      return;
    }

    this.sendBtnEl.empty();
    this.sendBtnEl.disabled = this.isComposerInteractionDisabled();
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
      this.suggestionBarEl.empty();
      this.suggestionBarEl.addClass('is-hidden');
      return;
    }

    this.suggestionBarEl.empty();
    this.suggestionBarEl.removeClass('is-hidden');

    const chipEl = this.suggestionBarEl.createEl('button', {
      cls: 'opencodian-suggestion-chip',
      attr: { type: 'button' },
    });
    chipEl.createSpan({ cls: 'opencodian-suggestion-chip-text', text: suggestionText });

    chipEl.addEventListener('click', () => {
      if (this.inputTextareaEl) {
        this.inputTextareaEl.value = suggestionText;
        this.syncTextareaHeight();
        this.syncHighlightBackdrop();
        this.inputTextareaEl.focus();
      }
      this.promptSuggestionService.acceptActiveSuggestion();
      this.renderSuggestionBar();
    });
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
    this.inputContainerResizeObserver?.disconnect();
    this.inputContainerResizeObserver = null;
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
    this.addContextBtnEl = null;
    this.sendBtnEl = null;
    this.inputTextareaEl = null;
    this.highlightBackdropEl = null;
    this.disabledStateEl = null;
    this.capabilityHintEl = null;
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

    const stackHeight = Math.ceil(this.inputContainerEl.offsetHeight);
    this.host.setComposerStackHeight(Math.max(0, stackHeight));
    this.host.scheduleSettledScrollToBottomIfNeeded();
  }

  private get shouldHandleAgentFeatures(): boolean {
    return this.host.shouldMountAgentSelector?.() !== false;
  }

  private trySubmitCurrentInput(): void {
    if (!this.inputTextareaEl) {
      return;
    }

    if (this.isComposerInteractionDisabled()) {
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
    );
    if (!submission) {
      return;
    }

    this.promptSuggestionService.clearActiveOnTurnStart();
    void this.host.submitMessage(submission);
    this.inputTextareaEl.value = '';
    this.agentMentionController.clearTrackedMentions();
    this.syncTextareaHeight();
    this.syncHighlightBackdrop();
    this.agentMentionController.clear(this.slashCommandMenuEl);
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

    this.inputTextareaEl.style.height = 'auto';
    const nextHeight = Math.min(this.inputTextareaEl.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT);
    this.inputTextareaEl.style.height = `${nextHeight}px`;
    this.inputTextareaEl.style.overflowY = this.inputTextareaEl.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT
      ? 'auto'
      : 'hidden';
    if (this.highlightBackdropEl) {
      this.highlightBackdropEl.style.height = `${nextHeight}px`;
    }
    this.scheduleLayoutSync();
  }

  updateComposerAvailabilityState(): void {
    const state = this.host.getComposerAvailabilityState?.() ?? { kind: 'ready' as const };
    const isDisabled = state.kind !== 'ready';

    this.composerShellEl?.toggleClass('is-composer-disabled', isDisabled);
    this.inputWrapperEl?.toggleClass('is-composer-disabled', isDisabled);
    this.inputTextareaEl?.toggleAttribute('disabled', isDisabled);
    this.addContextBtnEl?.toggleAttribute('disabled', isDisabled);
    this.updateSendButtonState();

    if (!this.inputWrapperEl) {
      return;
    }

    if (!isDisabled) {
      this.disabledStateEl?.remove();
      this.disabledStateEl = null;
      return;
    }

    if (!this.disabledStateEl) {
      this.disabledStateEl = this.inputWrapperEl.createDiv({ cls: 'opencodian-composer-disabled-state' });
    } else {
      this.disabledStateEl.empty();
    }

    this.disabledStateEl.createDiv({
      cls: 'opencodian-composer-disabled-title',
      text: state.title ?? t('chat.empty.noBackend.title'),
    });
    this.disabledStateEl.createDiv({
      cls: 'opencodian-composer-disabled-description',
      text: state.description ?? t('chat.empty.noBackend.description'),
    });
  }

  private isComposerInteractionDisabled(): boolean {
    return (this.host.getComposerAvailabilityState?.().kind ?? 'ready') !== 'ready';
  }

  private async refreshComposerSuggestionMenu(): Promise<void> {
    const textarea = this.inputTextareaEl;
    if (!textarea) {
      return;
    }

    const slashQuery = getSlashCommandMenuQuery(textarea);
    if (slashQuery !== null) {
      this.agentMentionController.clear(this.slashCommandMenuEl);
      await this.refreshSlashCommandMenu();
      return;
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
    const isSelectingSlashCommand = getSlashCommandMenuQuery(textarea) !== null;
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

}

function escapeHtmlContent(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(text: string): string {
  return escapeHtmlContent(text).replace(/"/g, '&quot;');
}
