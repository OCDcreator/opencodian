import { setIcon } from 'obsidian';

import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { filterSlashCommandMenuItems } from './slashCommandMenuFilter';

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;

type SlashCommandMenuStatus =
  | 'idle'
  | 'loading'
  | 'emptyCatalog'
  | 'noMatches'
  | 'loadFailed';

const logger = createLogger('ComposerInputShellCoordinator');

export interface ComposerInputShellCoordinatorHost {
  attachSessionTodo(container: HTMLElement): void;
  attachQuestionDock(container: HTMLElement): void;
  setContextRowElement(element: HTMLElement | null): void;
  setTooltipLabel(
    element: HTMLElement,
    label: string,
    position?: 'bottom' | 'top' | 'right',
  ): void;
  getInputPlaceholder(): string;
  addChosenFileContextToActiveTab(): Promise<void>;
  mountSelectionControls(toolbar: HTMLElement): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
  isActiveTabStreaming(): boolean;
  cancelStreaming(): void;
  isTabForegroundBusy(): boolean;
  showProcessingBlockedNotice(): void;
  submitMessage(message: string): void | Promise<void>;
  loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]>;
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

  constructor(private readonly host: ComposerInputShellCoordinatorHost) {}

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
      void this.refreshSlashCommandMenu();
    });
    this.inputTextareaEl.addEventListener('keydown', (event) => {
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

    const message = this.inputTextareaEl.value.trim();
    if (!message) {
      return;
    }

    void this.host.submitMessage(message);
    this.inputTextareaEl.value = '';
    this.syncTextareaHeight();
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

  private tryHandleSlashCommandMenuKeydown(event: KeyboardEvent): boolean {
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
    const item = this.visibleSlashCommandMenuItems[this.selectedSlashCommandMenuItemIndex];
    if (!item || !this.inputTextareaEl) {
      return;
    }

    const nextValue = `/${item.id} `;
    this.inputTextareaEl.value = nextValue;
    this.inputTextareaEl.focus();
    this.inputTextareaEl.setSelectionRange(nextValue.length, nextValue.length);
    this.clearSlashCommandMenu();
    this.syncTextareaHeight();
  }

  private async refreshSlashCommandMenu(): Promise<void> {
    const textarea = this.inputTextareaEl;
    if (!textarea) {
      return;
    }

    const query = this.getSlashCommandMenuQuery(textarea);
    if (query === null) {
      this.clearSlashCommandMenu();
      return;
    }

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

  private getSlashCommandMenuQuery(textarea: HTMLTextAreaElement): string | null {
    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    if (selectionStart !== selectionEnd) {
      return null;
    }

    const beforeCursor = textarea.value.slice(0, selectionStart);

    // Scan backward from cursor to find the trigger '/' character.
    // The '/' is valid only at position 0 or when preceded by whitespace.
    let slashIndex = -1;
    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      const ch = beforeCursor[i];
      if (ch === '/') {
        slashIndex = i;
        break;
      }

      if (/\s/.test(ch)) {
        break;
      }
    }

    if (slashIndex < 0) {
      return null;
    }

    // Reject '//' (escaped slash or comment syntax).
    if (slashIndex > 0 && beforeCursor[slashIndex - 1] === '/') {
      return null;
    }

    const searchText = beforeCursor.slice(slashIndex + 1);

    // If the search text (the portion after '/') contains whitespace,
    // the user has moved past the command name into argument territory.
    if (/\s/.test(searchText)) {
      return null;
    }

    return searchText;
  }

  private clearSlashCommandMenu(): void {
    this.slashCommandMenuRunId += 1;
    this.slashCommandMenuCatalogItems = null;
    this.visibleSlashCommandMenuItems = [];
    this.selectedSlashCommandMenuItemIndex = 0;
    this.slashCommandMenuStatus = 'idle';
    this.renderSlashCommandMenu();
  }

  private renderSlashCommandMenu(): void {
    if (!this.slashCommandMenuEl) {
      return;
    }

    this.slashCommandMenuEl.replaceChildren();

    if (this.visibleSlashCommandMenuItems.length === 0) {
      const stateText = this.getSlashCommandMenuStateText();
      if (!stateText) {
        this.slashCommandMenuEl.addClass('is-hidden');
        this.scheduleLayoutSync();
        return;
      }

      this.slashCommandMenuEl.removeClass('is-hidden');
      this.slashCommandMenuEl.createDiv({
        cls: `opencodian-slash-command-menu-state opencodian-slash-command-menu-state--${this.slashCommandMenuStatus}`,
        text: stateText,
        attr: { role: 'status' },
      });
      this.scheduleLayoutSync();
      return;
    }

    this.slashCommandMenuEl.removeClass('is-hidden');

    this.visibleSlashCommandMenuItems.forEach((item, index) => {
      const itemEl = this.slashCommandMenuEl?.createDiv({
        cls: 'opencodian-slash-command-menu-item',
        attr: {
          role: 'option',
          'aria-selected': index === this.selectedSlashCommandMenuItemIndex ? 'true' : 'false',
        },
      });
      if (!itemEl) {
        return;
      }

      if (index === this.selectedSlashCommandMenuItemIndex) {
        itemEl.addClass('is-selected');
      }

      itemEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      itemEl.addEventListener('mouseenter', () => {
        if (this.selectedSlashCommandMenuItemIndex === index) {
          return;
        }

        this.selectedSlashCommandMenuItemIndex = index;
        this.renderSlashCommandMenu();
      });
      itemEl.addEventListener('click', () => {
        this.selectedSlashCommandMenuItemIndex = index;
        this.applySelectedSlashCommandMenuItem();
      });

      const titleRowEl = itemEl.createDiv({
        cls: 'opencodian-slash-command-menu-title-row',
      });
      titleRowEl.createDiv({
        cls: 'opencodian-slash-command-menu-title',
        text: `/${item.id}`,
      });

      const sourceBadge = this.buildSourceBadge(item);
      if (sourceBadge) {
        titleRowEl.createDiv({
          cls: `opencodian-slash-command-menu-badge ${sourceBadge.cls}`,
          text: sourceBadge.text,
        });
      }

      if (item.description) {
        itemEl.createDiv({
          cls: 'opencodian-slash-command-menu-description',
          text: item.description,
          attr: { title: item.description },
        });
      }
    });

    this.scheduleLayoutSync();
  }

  private getEmptySlashCommandMenuStatus(items: SlashCommandMenuItem[]): SlashCommandMenuStatus {
    return items.length === 0 ? 'emptyCatalog' : 'noMatches';
  }

  private getSlashCommandMenuStateText(): string | null {
    switch (this.slashCommandMenuStatus) {
      case 'loading':
        return t('slashCommand.menu.loading');
      case 'emptyCatalog':
        return t('slashCommand.menu.empty');
      case 'noMatches':
        return t('slashCommand.menu.noMatches');
      case 'loadFailed':
        return t('slashCommand.menu.loadFailed');
      case 'idle':
      default:
        return null;
    }
  }

  private buildSourceBadge(
    item: SlashCommandMenuItem,
  ): { text: string; cls: string } | null {
    if (item.runtimeAvailable && item.hasProjectOverride) {
      return {
        text: t('slashCommand.sourceBadge.override'),
        cls: 'opencodian-slash-command-menu-badge--override',
      };
    }

    if (item.runtimeAvailable) {
      return {
        text: t('slashCommand.sourceBadge.runtime'),
        cls: 'opencodian-slash-command-menu-badge--runtime',
      };
    }

    return {
      text: t('slashCommand.sourceBadge.project'),
      cls: 'opencodian-slash-command-menu-badge--project',
    };
  }
}
