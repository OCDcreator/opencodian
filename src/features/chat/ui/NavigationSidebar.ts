/**
 * NavigationSidebar - Floating sidebar for navigating chat history.
 *
 * Provides quick access to scroll to top/bottom and previous/next user messages.
 * Positioned on the left side of the messages container.
 */

import { setIcon } from 'obsidian';

import { t } from '../../../i18n';

/**
 * Floating sidebar for navigating chat history.
 * Provides quick access to top/bottom and previous/next user messages.
 */
export class NavigationSidebar {
  private static tooltipLabelId = 0;
  private host: HTMLElement;
  private container: HTMLElement;
  private topBtn: HTMLButtonElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private bottomBtn: HTMLButtonElement;
  private scrollHandler: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  constructor(
    private mountEl: HTMLElement,
    private anchorEl: HTMLElement,
    private messagesEl: HTMLElement,
  ) {
    this.host = this.mountEl.createDiv({ cls: 'opencodian-nav-sidebar-host' });
    this.container = this.host.createDiv({ cls: 'opencodian-nav-sidebar' });

    // Create buttons
    this.topBtn = this.createButton('opencodian-nav-btn-top', 'chevrons-up', t('chat.navigation.top'));
    this.prevBtn = this.createButton('opencodian-nav-btn-prev', 'chevron-up', t('chat.navigation.previous'));
    this.nextBtn = this.createButton('opencodian-nav-btn-next', 'chevron-down', t('chat.navigation.next'));
    this.bottomBtn = this.createButton('opencodian-nav-btn-bottom', 'chevrons-down', t('chat.navigation.bottom'));

    this.setupEventListeners();
    this.updateVisibility();
  }

  private createButton(cls: string, icon: string, label: string): HTMLButtonElement {
    const btn = this.container.createEl('button', {
      cls: `opencodian-nav-btn opencodian-tooltip-trigger ${cls}`,
      attr: {
        type: 'button',
        'data-tooltip': label,
        'data-tooltip-align': 'right',
      },
    });
    setIcon(btn, icon);
    const labelEl = btn.createSpan({ cls: 'opencodian-visually-hidden', text: label });
    labelEl.id = `opencodian-nav-tooltip-label-${NavigationSidebar.tooltipLabelId++}`;
    btn.setAttribute('aria-labelledby', labelEl.id);
    return btn;
  }

  private setupEventListeners(): void {
    this.scrollHandler = () => {
      this.updateVisibility();
      this.updatePosition();
    };
    this.messagesEl.addEventListener('scroll', this.scrollHandler, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateVisibility();
        this.updatePosition();
      });
      this.resizeObserver.observe(this.mountEl);
      this.resizeObserver.observe(this.anchorEl);
      this.resizeObserver.observe(this.messagesEl);
    }

    this.mutationObserver = new MutationObserver(() => {
      this.updateVisibility();
      this.updatePosition();
    });
    this.mutationObserver.observe(this.messagesEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    this.topBtn.addEventListener('click', () => {
      this.messagesEl.scrollTo({ top: 0, behavior: 'smooth' });
    });

    this.bottomBtn.addEventListener('click', () => {
      this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
    });

    this.prevBtn.addEventListener('click', () => this.scrollToMessage('prev'));
    this.nextBtn.addEventListener('click', () => this.scrollToMessage('next'));
  }

  /**
   * Updates visibility of the sidebar based on scroll state.
   * Visible if content overflows.
   */
  updateVisibility(): void {
    const { scrollHeight, clientHeight } = this.messagesEl;
    const isScrollable = scrollHeight > clientHeight + 50; // Small buffer
    this.container.classList.toggle('visible', isScrollable);
    this.updatePosition();
  }

  private updatePosition(): void {
    const mountRect = this.mountEl.getBoundingClientRect();
    const anchorRect = this.anchorEl.getBoundingClientRect();

    if (mountRect.height === 0 || anchorRect.height === 0) {
      return;
    }

    const top = anchorRect.top - mountRect.top + (anchorRect.height / 2);
    this.container.style.top = `${Math.round(top)}px`;
  }

  private getElementScrollTop(element: HTMLElement): number {
    const elementRect = element.getBoundingClientRect();
    const containerRect = this.messagesEl.getBoundingClientRect();
    return elementRect.top - containerRect.top + this.messagesEl.scrollTop;
  }

  private isStickyScrollMode(): boolean {
    return (
      this.messagesEl.classList.contains('opencodian-messages--sticky-basic') ||
      this.messagesEl.classList.contains('opencodian-messages--sticky-mask')
    );
  }

  private getMessageTargetScrollTop(messageEl: HTMLElement): number {
    if (!this.isStickyScrollMode()) {
      return this.getElementScrollTop(messageEl);
    }

    const turnEl = messageEl.closest('.opencodian-turn');
    if (!(turnEl instanceof HTMLElement)) {
      return this.getElementScrollTop(messageEl);
    }

    return this.getElementScrollTop(turnEl);
  }

  private getMessageScrollPadding(): number {
    return this.isStickyScrollMode() ? 0 : 10;
  }

  /**
   * Scrolls to previous or next user message.
   */
  private scrollToMessage(direction: 'prev' | 'next'): void {
    const messages = Array.from(this.messagesEl.querySelectorAll('.opencodian-message--user')) as HTMLElement[];

    if (messages.length === 0) return;

    const scrollTop = this.messagesEl.scrollTop;
    const threshold = 30;
    const messagePositions = messages.map(messageEl => ({
      visualTop: this.getElementScrollTop(messageEl),
      targetTop: this.getMessageTargetScrollTop(messageEl),
    }));
    const scrollPadding = this.getMessageScrollPadding();

    if (direction === 'prev') {
      for (let i = messagePositions.length - 1; i >= 0; i--) {
        if (messagePositions[i].visualTop < scrollTop - threshold) {
          this.messagesEl.scrollTo({
            top: Math.max(0, messagePositions[i].targetTop - scrollPadding),
            behavior: 'smooth',
          });
          return;
        }
      }
      this.messagesEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      for (let i = 0; i < messagePositions.length; i++) {
        if (messagePositions[i].visualTop > scrollTop + threshold) {
          this.messagesEl.scrollTo({
            top: Math.max(0, messagePositions[i].targetTop - scrollPadding),
            behavior: 'smooth',
          });
          return;
        }
      }
      this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
    }
  }

  destroy(): void {
    this.messagesEl.removeEventListener('scroll', this.scrollHandler);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.host.remove();
  }
}
