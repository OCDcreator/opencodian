export interface ChatVimNavigationKeys {
  scrollUp: string;
  scrollDown: string;
  focusInput: string;
}

/**
 * Narrow view-owned port for Vim-style chat navigation. The coordinator owns
 * root-scoped event lifetime only; current settings, panes, and overlays stay
 * with the chat runtime that already owns them.
 */
export interface ChatVimNavigationCoordinatorHost {
  isEnabled(): boolean;
  getKeys(): ChatVimNavigationKeys;
  getMessagesContainer(): HTMLElement | null;
  focusComposer(): void;
  hasBlockingOverlay?(): boolean;
}

const PAGE_SCROLL_FRACTION = 0.65;

/**
 * Routes configured Vim-style navigation keys within one chat root. It never
 * observes global keyboard events, so Obsidian and other plugin surfaces keep
 * their existing shortcuts.
 */
export class ChatVimNavigationCoordinator {
  private root: HTMLElement | null = null;

  constructor(private readonly host: ChatVimNavigationCoordinatorHost) {}

  attach(root: HTMLElement): void {
    this.destroy();
    this.root = root;
    root.addEventListener('keydown', this.handleKeydown);
  }

  destroy(): void {
    this.root?.removeEventListener('keydown', this.handleKeydown);
    this.root = null;
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.shouldHandle(event)) {
      return;
    }

    const key = normalizeKey(event.key);
    const keys = this.host.getKeys();
    if (key === normalizeKey(keys.scrollUp)) {
      if (this.scrollMessages(-1)) {
        event.preventDefault();
      }
      return;
    }

    if (key === normalizeKey(keys.scrollDown)) {
      if (this.scrollMessages(1)) {
        event.preventDefault();
      }
      return;
    }

    if (key === normalizeKey(keys.focusInput)) {
      this.host.focusComposer();
      event.preventDefault();
    }
  };

  private shouldHandle(event: KeyboardEvent): boolean {
    return this.host.isEnabled()
      && !event.defaultPrevented
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      // Shift is a modifier too: Shift+W reports key 'W', which normalizes to
      // the configured 'w' and would otherwise scroll the chat and swallow the
      // keystroke instead of letting the capital letter through.
      && !event.shiftKey
      && !event.isComposing
      && !event.repeat
      && !this.host.hasBlockingOverlay?.()
      && !isEditableTarget(event.target);
  }

  private scrollMessages(direction: -1 | 1): boolean {
    const messagesContainer = this.host.getMessagesContainer();
    if (!messagesContainer || typeof messagesContainer.scrollBy !== 'function') {
      return false;
    }

    messagesContainer.scrollBy({
      top: direction * messagesContainer.clientHeight * PAGE_SCROLL_FRACTION,
      behavior: 'smooth',
    });
    return true;
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  const contentEditableOwner = target.closest<HTMLElement>('[contenteditable]');
  return contentEditableOwner?.getAttribute('contenteditable')?.toLowerCase() !== 'false'
    && contentEditableOwner !== null;
}
