import { t } from '../../../i18n';
import type {
  ForegroundCompactionActionOptions,
  ForegroundCompactionActionResult,
  ForegroundCompactionControl,
} from '../services/ActiveTabContextUsageCoordinator';

export interface ContextDetailModalCompactionCoordinator {
  getForegroundCompactionControl(): ForegroundCompactionControl;
  compactForegroundThread(
    options?: ForegroundCompactionActionOptions,
  ): Promise<ForegroundCompactionActionResult>;
}

type ForegroundCompactionStatusMessage =
  | 'available'
  | 'requesting'
  | 'accepted'
  | 'verified'
  | 'timeout-accepted'
  | 'unavailable'
  | 'invalid-thread'
  | 'busy'
  | 'failed'
  | 'malformed'
  | 'timed-out'
  | 'stale';

const FOREGROUND_COMPACTION_MESSAGE_KEYS: Record<ForegroundCompactionStatusMessage, Parameters<typeof t>[0]> = {
  available: 'context.compaction.available', requesting: 'context.compaction.requesting',
  accepted: 'context.compaction.accepted', verified: 'context.compaction.verified',
  'timeout-accepted': 'context.compaction.timeoutAccepted', unavailable: 'context.compaction.unavailable',
  'invalid-thread': 'context.compaction.invalidThread', busy: 'context.compaction.busy',
  failed: 'context.compaction.failed', malformed: 'context.compaction.malformed',
  'timed-out': 'context.compaction.timedOut', stale: 'context.compaction.stale',
};

/** Owns the inline Codex compaction action state machine and its accessible status surface. */
export class ContextCompactionActionController {
  private buttonEl: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private inFlight = false;
  private surfaceGeneration = 0;

  constructor(
    private readonly coordinator: ContextDetailModalCompactionCoordinator,
    private readonly isClosed: () => boolean,
  ) {}

  render(containerEl: HTMLElement): void {
    this.surfaceGeneration += 1;
    this.buttonEl = null;
    this.statusEl = null;
    this.inFlight = false;
    const control = this.coordinator.getForegroundCompactionControl();
    if (!control.visible) {
      return;
    }

    const actionRowEl = containerEl.createDiv({ cls: 'opencodian-context-compaction-action-row' });
    const copyEl = actionRowEl.createDiv({ cls: 'opencodian-context-compaction-copy' });
    copyEl.createDiv({ cls: 'opencodian-context-compaction-title', text: t('context.compaction.title') });
    const targetEl = copyEl.createDiv({ cls: 'opencodian-context-compaction-target' });
    targetEl.createSpan({ text: `${t('context.compaction.targetThread')}: ` });
    const threadId = control.threadId ?? t('context.compaction.noThread');
    const threadEl = targetEl.createSpan({ cls: 'opencodian-context-compaction-thread', text: threadId });
    threadEl.setAttribute('title', threadId);

    const controlsEl = actionRowEl.createDiv({ cls: 'opencodian-context-compaction-controls' });
    const buttonEl = controlsEl.createEl('button', {
      cls: 'mod-cta opencodian-context-compaction-button',
      text: t('context.compaction.action'),
    });
    buttonEl.type = 'button';
    buttonEl.dataset.contextCompactionAction = 'true';
    buttonEl.setAttribute('aria-label', t('context.compaction.actionAriaLabel', { thread: threadId }));
    const statusEl = controlsEl.createDiv({
      cls: 'opencodian-context-compaction-status',
      text: this.getAvailabilityMessage(control),
    });
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.setAttribute('aria-atomic', 'true');
    statusEl.setAttribute('aria-busy', control.availability?.status === 'busy' ? 'true' : 'false');
    this.buttonEl = buttonEl;
    this.statusEl = statusEl;
    buttonEl.disabled = control.availability?.status !== 'available'
      || !control.sessionId || !control.threadId;
    buttonEl.addEventListener('click', () => { void this.handleClick(control); });
  }

  dispose(): void {
    this.surfaceGeneration += 1;
    this.buttonEl = null;
    this.statusEl = null;
    this.inFlight = false;
  }

  private async handleClick(control: ForegroundCompactionControl): Promise<void> {
    const surfaceGeneration = this.surfaceGeneration;
    const buttonEl = this.buttonEl;
    if (this.inFlight || !buttonEl || buttonEl.disabled || !control.threadId || !control.sessionId) {
      return;
    }
    if (typeof window.confirm !== 'function' || !window.confirm(t('context.compaction.confirm', {
      thread: control.threadId,
    }))) {
      return;
    }

    this.inFlight = true;
    buttonEl.disabled = true;
    this.setStatus('requesting', true);
    let result: ForegroundCompactionActionResult;
    try {
      result = await this.coordinator.compactForegroundThread({
        expectedSessionId: control.sessionId,
        expectedThreadId: control.threadId,
        expectedTabId: control.tabId,
        onAccepted: () => {
          if (!this.isClosed() && this.surfaceGeneration === surfaceGeneration && this.inFlight) {
            this.setStatus('accepted', true);
          }
        },
      });
    } catch {
      result = {
        status: 'failed', acknowledged: false, runtimeVerified: false,
        started: false, completed: false, tokenUsageObserved: false,
        threadId: control.threadId,
      };
    }
    if (this.isClosed() || this.surfaceGeneration !== surfaceGeneration) return;
    this.inFlight = false;
    if (result.status === 'verified' && result.runtimeVerified && result.acknowledged
      && result.completed && result.tokenUsageObserved) {
      this.setStatus('verified', false);
      return;
    }
    this.setStatus(this.getResultMessage(result), false);
    if (result.status !== 'stale') {
      const latest = this.coordinator.getForegroundCompactionControl();
      buttonEl.disabled = latest.availability?.status !== 'available'
        || !latest.sessionId || !latest.threadId;
    }
  }

  private setStatus(key: ForegroundCompactionStatusMessage, busy: boolean): void {
    if (!this.statusEl) return;
    this.statusEl.setText(t(FOREGROUND_COMPACTION_MESSAGE_KEYS[key]));
    this.statusEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    const isPendingVerification = key === 'timeout-accepted';
    this.statusEl.classList.toggle(
      'is-error',
      !['available', 'requesting', 'accepted', 'verified', 'timeout-accepted'].includes(key),
    );
    this.statusEl.classList.toggle('is-pending-verification', isPendingVerification);
    this.statusEl.classList.toggle('is-success', key === 'verified');
  }

  private getAvailabilityMessage(control: ForegroundCompactionControl): string {
    return t(FOREGROUND_COMPACTION_MESSAGE_KEYS[control.availability?.status ?? 'invalid-thread']);
  }

  private getResultMessage(result: ForegroundCompactionActionResult): ForegroundCompactionStatusMessage {
    if (result.status === 'timed-out' && result.acknowledged) return 'timeout-accepted';
    return result.status === 'verified' ? 'failed' : result.status;
  }
}
