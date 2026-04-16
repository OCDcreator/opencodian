import { setIcon } from 'obsidian';

import { t } from '../../../i18n';

const COMPOSER_TEXTAREA_MAX_HEIGHT = 240;

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
  private layoutSyncFrameId: number | null = null;
  private inputContainerResizeObserver: ResizeObserver | null = null;

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
    });
    this.inputTextareaEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.trySubmitCurrentInput();
      }
    });
    this.syncTextareaHeight();

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
}
