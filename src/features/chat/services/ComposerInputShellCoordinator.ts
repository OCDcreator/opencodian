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
import { filterSlashCommandMenuItems } from './slashCommandMenuFilter';
import { renderSlashCommandMenu, type SlashCommandMenuStatus } from './slashCommandMenuRenderer';

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;

const logger = createLogger('ComposerInputShellCoordinator');

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
  private slashCommandMenuEl: HTMLElement | null = null;
  private layoutSyncFrameId: number | null = null;
  private inputContainerResizeObserver: ResizeObserver | null = null;
  private slashCommandMenuCatalogItems: SlashCommandMenuItem[] | null = null;
  private visibleSlashCommandMenuItems: SlashCommandMenuItem[] = [];
  private selectedSlashCommandMenuItemIndex = 0;
  private slashCommandMenuRunId = 0;
  private slashCommandMenuStatus: SlashCommandMenuStatus = 'idle';
  private slashCommandMenuQuery: string | null = null;
  private readonly agentMentionController: AgentMentionComposerController;
  private readonly agentSelectionController: ChatAgentSelectionCoordinator;

  constructor(private readonly host: ComposerInputShellCoordinatorHost) {
    this.agentMentionController = new AgentMentionComposerController({
      getComposerInputMode: () => this.host.getComposerInputMode(),
      loadAgentMentionCandidates: () => loadAgentMentionCandidatesFromComposerCatalog(
        this.host, this.slashCommandMenuCatalogItems, (items) => { this.slashCommandMenuCatalogItems = items; },
      ),
      scheduleLayoutSync: () => this.scheduleLayoutSync(),
      onMentionInserted: () => this.syncTextareaHeight(),
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

    this.inputTextareaEl = composerContentEl.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { placeholder: this.host.getInputPlaceholder(), rows: '1' },
    });
    this.inputTextareaEl.addEventListener('input', () => {
      this.syncTextareaHeight();
      this.agentMentionController.syncContent(this.inputTextareaEl?.value ?? '');
      void this.refreshComposerSuggestionMenu();
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

    this.inputTextareaEl?.setAttribute('placeholder', this.host.getInputPlaceholder());
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
    this.slashCommandMenuEl = null;
    this.slashCommandMenuCatalogItems = null;
    this.visibleSlashCommandMenuItems = [];
    this.selectedSlashCommandMenuItemIndex = 0;
    this.slashCommandMenuRunId += 1;
    this.slashCommandMenuStatus = 'idle';
    this.slashCommandMenuQuery = null;
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
    this.agentMentionController.clear(this.slashCommandMenuEl);
  }

  private syncTextareaHeight(): void {
    if (!this.inputTextareaEl) {
      return;
    }

    this.inputTextareaEl.style.height = 'auto';
    const nextHeight = Math.min(this.inputTextareaEl.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT);
    this.inputTextareaEl.style.height = `${nextHeight}px`;
    this.inputTextareaEl.style.overflowY = this.inputTextareaEl.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT
      ? 'auto'
      : 'hidden';
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

    if (isCommandComposerText(textarea.value)) {
      this.agentMentionController.clear(this.slashCommandMenuEl);
      this.clearSlashCommandMenu();
      return;
    }

    const agentQuery = this.agentMentionController.getQuery(textarea);
    if (agentQuery) {
      this.clearSlashCommandMenu();
      await this.agentMentionController.refresh(agentQuery, this.slashCommandMenuEl);
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
    this.syncSlashCommandMenuStateWithCurrentContext();

    if (this.visibleSlashCommandMenuItems.length === 0) {
      if (event.key === 'Escape' && this.slashCommandMenuStatus !== 'idle') {
        event.preventDefault();
        this.clearSlashCommandMenu();
        return true;
      }

      return false;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSlashCommandMenuSelection(1);
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSlashCommandMenuSelection(-1);
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.clearSlashCommandMenu();
      return true;
    }

    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      this.applySelectedSlashCommandMenuItem();
      return true;
    }

    return false;
  }

  private moveSlashCommandMenuSelection(delta: number): void {
    if (this.visibleSlashCommandMenuItems.length === 0) {
      return;
    }

    const itemCount = this.visibleSlashCommandMenuItems.length;
    this.selectedSlashCommandMenuItemIndex =
      (this.selectedSlashCommandMenuItemIndex + delta + itemCount) % itemCount;
    this.renderSlashCommandMenu();
    this.scrollSelectedItemIntoView();
  }

  private scrollSelectedItemIntoView(): void {
    if (!this.slashCommandMenuEl) {
      return;
    }

    const selectedEl = this.slashCommandMenuEl.querySelector<HTMLElement>(
      '.opencodian-slash-command-menu-item.is-selected',
    );
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  private applySelectedSlashCommandMenuItem(): void {
    this.syncSlashCommandMenuStateWithCurrentContext();

    const item = this.visibleSlashCommandMenuItems[this.selectedSlashCommandMenuItemIndex];
    if (!item || !this.inputTextareaEl) {
      return;
    }

    const nextValue = item.insertText ?? `/${item.id} `;
    this.inputTextareaEl.value = nextValue;
    this.inputTextareaEl.focus();
    this.inputTextareaEl.setSelectionRange(nextValue.length, nextValue.length);
    this.syncTextareaHeight();
    if (item.source === 'skills-command') {
      void this.refreshSlashCommandMenu();
      return;
    }

    this.clearSlashCommandMenu();
  }

  private async refreshSlashCommandMenu(): Promise<void> {
    const textarea = this.inputTextareaEl;
    if (!textarea) {
      return;
    }

    const query = getSlashCommandMenuQuery(textarea);
    if (query === null) {
      this.clearSlashCommandMenu();
      return;
    }

    this.slashCommandMenuQuery = query;

    const currentRunId = ++this.slashCommandMenuRunId;
    this.visibleSlashCommandMenuItems = [];
    this.selectedSlashCommandMenuItemIndex = 0;
    this.slashCommandMenuStatus = 'loading';
    this.renderSlashCommandMenu();

    try {
      const items = this.slashCommandMenuCatalogItems ?? await this.host.loadSlashCommandMenuItems();
      if (currentRunId !== this.slashCommandMenuRunId) {
        return;
      }

      this.slashCommandMenuCatalogItems = items;
      this.visibleSlashCommandMenuItems = filterSlashCommandMenuItems(
        this.slashCommandMenuCatalogItems,
        query,
        {
          skillMode: this.host.getSlashCommandSkillMode(),
          skillsCommandDescription: t('slashCommand.skillsCommand.description'),
        },
      );
      this.selectedSlashCommandMenuItemIndex = 0;
      this.slashCommandMenuStatus = this.visibleSlashCommandMenuItems.length > 0
        ? 'idle'
        : this.getEmptySlashCommandMenuStatus(items);
      this.renderSlashCommandMenu();
    } catch (error) {
      if (currentRunId !== this.slashCommandMenuRunId) {
        return;
      }

      logger.debug('Failed to load slash command menu items:', error);
      this.slashCommandMenuCatalogItems = null;
      this.visibleSlashCommandMenuItems = [];
      this.selectedSlashCommandMenuItemIndex = 0;
      this.slashCommandMenuStatus = 'loadFailed';
      this.renderSlashCommandMenu();
    }
  }

  private clearSlashCommandMenu(): void {
    this.slashCommandMenuRunId += 1;
    this.slashCommandMenuCatalogItems = null;
    this.visibleSlashCommandMenuItems = [];
    this.selectedSlashCommandMenuItemIndex = 0;
    this.slashCommandMenuStatus = 'idle';
    this.slashCommandMenuQuery = null;
    this.renderSlashCommandMenu();
  }

  private renderSlashCommandMenu(): void {
    if (!this.slashCommandMenuEl) {
      return;
    }

    this.syncSlashCommandMenuStateWithCurrentContext();

    renderSlashCommandMenu({
      menuEl: this.slashCommandMenuEl,
      items: this.visibleSlashCommandMenuItems,
      selectedIndex: this.selectedSlashCommandMenuItemIndex,
      status: this.slashCommandMenuStatus,
      onHoverItem: (index) => {
        if (this.selectedSlashCommandMenuItemIndex === index) {
          return;
        }

        this.selectedSlashCommandMenuItemIndex = index;
        this.renderSlashCommandMenu();
      },
      onSelectItem: (index) => {
        this.selectedSlashCommandMenuItemIndex = index;
        this.applySelectedSlashCommandMenuItem();
      },
    });

    this.scheduleLayoutSync();
  }

  private syncSlashCommandMenuStateWithCurrentContext(): void {
    if (this.slashCommandMenuQuery === null || !this.slashCommandMenuCatalogItems) {
      return;
    }

    this.visibleSlashCommandMenuItems = filterSlashCommandMenuItems(
      this.slashCommandMenuCatalogItems,
      this.slashCommandMenuQuery,
      {
        skillMode: this.host.getSlashCommandSkillMode(),
        skillsCommandDescription: t('slashCommand.skillsCommand.description'),
      },
    );
    this.selectedSlashCommandMenuItemIndex = Math.min(
      this.selectedSlashCommandMenuItemIndex,
      Math.max(0, this.visibleSlashCommandMenuItems.length - 1),
    );
    this.slashCommandMenuStatus = this.visibleSlashCommandMenuItems.length > 0
      ? 'idle'
      : this.getEmptySlashCommandMenuStatus(this.slashCommandMenuCatalogItems);
  }

  private getEmptySlashCommandMenuStatus(items: SlashCommandMenuItem[]): SlashCommandMenuStatus {
    return items.length === 0 ? 'emptyCatalog' : 'noMatches';
  }

}
