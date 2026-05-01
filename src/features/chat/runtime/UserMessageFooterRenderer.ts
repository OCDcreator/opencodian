import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n';
import { ConversationRenderService } from '../services/ConversationRenderService';

const FORK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/><path d="M12 12v3"/></svg>`;
const REWIND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;

export interface UserMessageFooterRendererHost {
  isStreaming(): boolean;
  handleRewindRequest(message: ChatMessage): Promise<void> | void;
  handleForkRequest(message: ChatMessage): Promise<void> | void;
}

export class UserMessageFooterRenderer {
  constructor(private readonly host: UserMessageFooterRendererHost) {}

  render(messageEl: HTMLElement, message: ChatMessage, copyContent?: string): void {
    const footerEl = messageEl.createDiv({ cls: 'opencodian-user-message-footer' });
    const hasActions = Boolean(copyContent) || Boolean(message.sourceMessageId);

    if (hasActions) {
      const actionsEl = footerEl.createDiv({ cls: 'opencodian-user-message-actions' });

      if (copyContent) {
        this.renderCopyButton(actionsEl, copyContent);
      }

      if (message.sourceMessageId) {
        this.renderActionButton(actionsEl, {
          label: t('chat.rewind.button'),
          icon: REWIND_ICON,
          isDisabled: this.host.isStreaming(),
          onClick: () => this.host.handleRewindRequest(message),
        });
        this.renderActionButton(actionsEl, {
          label: t('chat.fork.button'),
          icon: FORK_ICON,
          isDisabled: this.host.isStreaming(),
          onClick: () => this.host.handleForkRequest(message),
        });
      }
    }

    this.renderTimestamp(footerEl, message.timestamp);
  }

  private renderCopyButton(actionsEl: HTMLElement, copyContent: string): void {
    const copyLabel = t('chat.action.copy');
    const copyBtn = actionsEl.createEl('button', {
      cls: 'opencodian-copy-btn-inline opencodian-copy-btn-inline--user opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'data-tooltip': copyLabel,
      },
    });

    copyBtn.insertAdjacentHTML('afterbegin', ConversationRenderService.COPY_ICON);
    ConversationRenderService.attachTooltipLabel(copyBtn, copyLabel);
    ConversationRenderService.attachCopyButtonBehavior(copyBtn, copyContent);
  }

  private renderActionButton(
    actionsEl: HTMLElement,
    options: {
      label: string;
      icon: string;
      isDisabled: boolean;
      onClick: () => Promise<void> | void;
    },
  ): void {
    const buttonEl = actionsEl.createEl('button', {
      cls: 'opencodian-user-action-btn opencodian-user-action-btn--icon opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'data-tooltip': options.label,
      },
    });

    buttonEl.innerHTML = options.icon;
    ConversationRenderService.attachTooltipLabel(buttonEl, options.label);
    buttonEl.disabled = options.isDisabled;
    buttonEl.addEventListener('click', (event) => {
      event.stopPropagation();
      void options.onClick();
    });
  }

  private renderTimestamp(footerEl: HTMLElement, timestamp: number): void {
    const timeStr = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const timeEl = footerEl.createSpan({ cls: 'opencodian-message-time-text', text: timeStr });
    timeEl.addClass('opencodian-user-message-time');
  }
}
