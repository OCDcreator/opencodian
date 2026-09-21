/**
 * QueuedFollowUpBarCoordinator — R-F1 (advantage-parity): the visible
 * follow-up message queue bar above the composer.
 *
 * Claudian's queueing affordance, on our per-tab runtime: messages submitted
 * while the tab is streaming enter THIS tab's FIFO queue (never dropped),
 * the bar lists them with per-item retract, and the honest status line
 * depends on the backend — `turn-steering` capability exposes a per-item
 * 「立即注入」 (native steer into the active turn); otherwise the line states
 * plainly 「将在本轮结束后发送」. When the tab is idle (e.g. the turn was
 * cancelled — the queue survives per the requirement), each item offers
 * 「立即发送」 as a normal send instead.
 */

import { setIcon } from 'obsidian';

import { t } from '../../../i18n';

export interface QueuedFollowUpBarHost {
  isTabStreaming(): boolean;
  hasTurnSteering(): boolean;
  onRetract(index: number): void;
  /** Steer into the ACTIVE turn (steering-capable backends only). */
  onSteer(index: number): void;
  /** Normal send of one queued item (idle tab, e.g. after a cancelled turn). */
  onSendNow(index: number): void;
}

const PREVIEW_MAX_CHARS = 120;

function previewOf(content: string): string {
  const flattened = content.replace(/\s+/g, ' ').trim();
  return flattened.length > PREVIEW_MAX_CHARS
    ? `${flattened.slice(0, PREVIEW_MAX_CHARS)}…`
    : flattened;
}

export class QueuedFollowUpBarCoordinator {
  private barEl: HTMLElement | null = null;
  private host: QueuedFollowUpBarHost | null = null;

  attach(barEl: HTMLElement, host: QueuedFollowUpBarHost): void {
    this.barEl = barEl;
    this.host = host;
    this.render([]);
  }

  detach(): void {
    this.barEl = null;
    this.host = null;
  }

  /** Idempotent full render; an empty queue hides the bar entirely. */
  render(items: readonly { content: string }[]): void {
    const barEl = this.barEl;
    if (!barEl) {
      return;
    }
    barEl.empty();
    if (items.length === 0 || !this.host) {
      barEl.addClass('is-hidden');
      return;
    }
    barEl.removeClass('is-hidden');

    const streaming = this.host.isTabStreaming();
    const steering = this.host.hasTurnSteering();

    const titleEl = barEl.createDiv({ cls: 'opencodian-queued-followup-title' });
    titleEl.textContent = t('chat.queue.barTitle', { count: items.length });

    const listEl = barEl.createDiv({ cls: 'opencodian-queued-followup-list' });
    items.forEach((item, index) => {
      const rowEl = listEl.createDiv({ cls: 'opencodian-queued-followup-item' });
      const contentEl = rowEl.createDiv({ cls: 'opencodian-queued-followup-item-content' });
      contentEl.textContent = previewOf(item.content);
      contentEl.setAttribute('title', item.content);

      if (streaming && steering) {
        const steerBtn = rowEl.createEl('button', {
          cls: 'opencodian-queued-followup-action opencodian-queued-followup-steer',
          attr: {
            type: 'button',
            title: t('chat.queue.steerAction'),
            'aria-label': t('chat.queue.steerAction'),
          },
        });
        setIcon(steerBtn, 'zap');
        steerBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.host?.onSteer(index);
        });
      } else if (!streaming) {
        const sendBtn = rowEl.createEl('button', {
          cls: 'opencodian-queued-followup-action opencodian-queued-followup-send',
          attr: {
            type: 'button',
            title: t('chat.queue.sendNowAction'),
            'aria-label': t('chat.queue.sendNowAction'),
          },
        });
        setIcon(sendBtn, 'send');
        sendBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.host?.onSendNow(index);
        });
      }

      const retractBtn = rowEl.createEl('button', {
        cls: 'opencodian-queued-followup-action opencodian-queued-followup-retract',
        attr: {
          type: 'button',
          title: t('chat.queue.retractAction'),
          'aria-label': t('chat.queue.retractAction'),
        },
      });
      setIcon(retractBtn, 'x');
      retractBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.host?.onRetract(index);
      });
    });

    const statusEl = barEl.createDiv({ cls: 'opencodian-queued-followup-status' });
    statusEl.textContent = streaming
      ? (steering
        ? t('chat.queue.statusSteerAvailable')
        : t('chat.queue.statusQueueOnly'))
      : t('chat.queue.statusIdle');
  }
}
