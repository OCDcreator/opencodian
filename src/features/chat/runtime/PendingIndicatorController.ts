import type { TabId } from '../tabs';
import type {
  PendingIndicatorHost,
  SendPipelineTabRuntime,
} from './SendPipelineTypes';

const PENDING_INDICATOR_DELAY_MS = 1000;

const PENDING_MESSAGES = [
  'Booting up...',
  'Initializing...',
  'Loading modules...',
  'Processing...',
  'Computing...',
  'Analyzing...',
  'Thinking...',
  'Getting to work...',
  'Diving in...',
  'Rolling up sleeves...',
  'Tackling this...',
  'On the case...',
  'Investigating...',
  'Exploring...',
  'Digging deeper...',
  'Bear with me...',
  'Hang tight...',
  'Just a sec...',
  'Working my magic...',
  'Almost there...',
  'Give me a moment...',
  'Asking the stars...',
  'Consulting ancient scrolls...',
  'Decoding the matrix...',
  'Channeling the cosmos...',
  'Peering into the abyss...',
];

function getRandomPendingMessage(): string {
  return PENDING_MESSAGES[Math.floor(Math.random() * PENDING_MESSAGES.length)];
}

export class PendingIndicatorController {
  private pendingTimeoutId: number | null = null;
  private pendingElement: HTMLElement | null = null;
  private pendingStartTime = 0;
  private readonly pendingMessage = getRandomPendingMessage();

  constructor(
    private readonly host: PendingIndicatorHost,
    private readonly tabId: TabId | null,
    private readonly contentEl: HTMLElement,
  ) {}

  get message(): string {
    return this.pendingMessage;
  }

  get isVisible(): boolean {
    return Boolean(this.pendingElement?.isConnected);
  }

  schedule(
    runtime: SendPipelineTabRuntime,
    onShown: (payload: { pendingMessage: string; revealReason: 'pending-timeout' }) => void,
  ): void {
    this.pendingTimeoutId = window.setTimeout(() => {
      if (!runtime.isStreaming) {
        return;
      }

      this.pendingElement = this.contentEl.createDiv({ cls: 'opencodian-pending' });
      this.pendingElement.createSpan({
        text: this.pendingMessage,
        cls: 'opencodian-pending-text',
      });
      const hintEl = this.pendingElement.createSpan({ cls: 'opencodian-pending-hint' });
      this.pendingStartTime = Date.now();
      this.host.revealStreamingAssistantMessageElement(this.tabId);

      const updateTimer = () => {
        if (!this.pendingElement?.isConnected) {
          return;
        }

        const elapsed = Math.floor((Date.now() - this.pendingStartTime) / 1000);
        hintEl.setText(` (esc to interrupt · ${elapsed}s)`);
      };
      updateTimer();
      this.pendingElement.dataset.timerInterval = String(window.setInterval(updateTimer, 1000));
      onShown({
        pendingMessage: this.pendingMessage,
        revealReason: 'pending-timeout',
      });

      if (this.host.getActiveTabId() === this.tabId) {
        this.host.scheduleSettledScrollToBottomIfNeeded(
          this.host.shouldAutoScroll(this.tabId),
          this.tabId,
        );
      }
    }, PENDING_INDICATOR_DELAY_MS);
  }

  clear(clearDelay = true): void {
    if (clearDelay && this.pendingTimeoutId) {
      window.clearTimeout(this.pendingTimeoutId);
      this.pendingTimeoutId = null;
    }

    if (this.pendingElement?.dataset.timerInterval) {
      window.clearInterval(Number(this.pendingElement.dataset.timerInterval));
    }
    this.pendingElement?.remove();
    this.pendingElement = null;
  }
}
