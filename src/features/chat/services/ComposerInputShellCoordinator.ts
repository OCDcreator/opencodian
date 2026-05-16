import { setIcon } from 'obsidian';

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
  mountSelectionControls(toolbar: HTMLElement): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
  mountModifiedFilesToggle(container: HTMLElement): void;
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
  private slashCommandMenuEl: HTMLElement | null = null;
  private layoutSyncFrameId: number | null = null;
  private inputContainerResizeObserver: ResizeObserver | null = null;
  private slashCommandMenuCatalogItems: SlashCommandMenuItem[] | null = null;
  private readonly agentMentionController: AgentMentionComposerController;
  private readonly agentSelectionController: ChatAgentSelectionCoordinator;
  private readonly slashCommandMenuController: SlashCommandMenuCoordinator;

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
      this.agentMentionController.syncContent(this.inputTextareaEl?.value ?? '');
      this.syncHighlightBackdrop();
      void this.refreshComposerSuggestionMenu();
    });
    this.inputTextareaEl.addEventListener('scroll', () => {
      this.syncHighlightBackdropScroll();
    });
    this.inputTextareaEl.addEventListener('keydown', (event) => {
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

    const toolbarEl = this.composerShellEl.createDiv({ cls: 'opencodian-input-toolbar' });
    this.agentSelectionController.mount(toolbarEl.createDiv({ cls: 'opencodian-agent-selector' }));
    this.host.mountSelectionControls(toolbarEl);
    this.host.mountContextUsageIndicator(toolbarEl.createDiv({ cls: 'opencodian-context-usage-slot' }));
    this.host.mountEffortSelector(toolbarEl.createDiv({ cls: 'opencodian-effort-slot' }));
    this.host.mountModifiedFilesToggle(toolbarEl.createDiv({ cls: 'opencodian-modified-files-toggle-slot' }));

    this.initializeLayoutMetrics();
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
    this.agentSelectionController.applyLocaleTexts();
  }

  updateSendButtonState(): void {
    if (!this.sendBtnEl) {
      return;
    }

    this.sendBtnEl.empty();
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

  destroy(): void {
    this.clearScheduledLayoutSync();
    this.inputContainerResizeObserver?.disconnect();
    this.inputContainerResizeObserver = null;
    this.host.setContextRowElement(null);
    this.inputContainerEl = null;
    this.inputTabBarSlotEl = null;
    this.composerShellEl = null;
    this.inputWrapperEl = null;
    this.addContextBtnEl = null;
    this.sendBtnEl = null;
    this.inputTextareaEl = null;
    this.highlightBackdropEl = null;
    this.slashCommandMenuEl = null;
    this.slashCommandMenuCatalogItems = null;
    this.slashCommandMenuController.reset();
    this.agentMentionController.reset();
    this.agentSelectionController.destroy();
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

  private syncLayoutMetrics(): void {
    if (!this.inputContainerEl) {
      return;
    }

    const stackHeight = Math.ceil(this.inputContainerEl.offsetHeight);
    this.host.setComposerStackHeight(Math.max(0, stackHeight));
    this.host.scheduleSettledScrollToBottomIfNeeded();
  }

  private trySubmitCurrentInput(): void {
    if (!this.inputTextareaEl) {
      return;
    }

    if (this.host.isTabForegroundBusy()) {
      this.host.showProcessingBlockedNotice();
      return;
    }

    const rawContent = this.inputTextareaEl.value;
    const submission = buildComposerInputSubmissionWithAgentIntents(
      rawContent,
      this.host.getComposerInputMode(),
      this.agentMentionController.resolveMentionIntents(rawContent),
      this.agentSelectionController.getSelectedAgentId(),
    );
    if (!submission) {
      return;
    }

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
    const agentQuery = this.agentMentionController.getQuery(textarea);
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
