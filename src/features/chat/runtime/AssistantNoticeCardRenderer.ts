import { setIcon } from 'obsidian';

import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n';
import { type CollapsibleState, setupCollapsible } from '../rendering/collapsible';

type NoticeActionType = NonNullable<ChatMessage['noticeActions']>[number]['type'];

export interface AssistantNoticeCardRendererHost {
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
  handleNoticeAction(actionType: NoticeActionType): Promise<void> | void;
}

export class AssistantNoticeCardRenderer {
  constructor(private readonly host: AssistantNoticeCardRendererHost) {}

  async render(container: HTMLElement, message: ChatMessage): Promise<void> {
    const tone = message.noticeTone ?? 'info';
    const cardEl = container.createDiv({ cls: `opencodian-chat-notice-card is-${tone}` });
    const iconEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-icon' });
    setIcon(
      iconEl,
      tone === 'error' ? 'x-circle' : tone === 'warning' ? 'alert-triangle' : 'info',
    );

    const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });
    const noticeTitle = message.noticeTitle ?? this.getNoticeTitle(message);
    if (noticeTitle) {
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-title',
        text: noticeTitle,
      });
    }

    const textEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-text' });
    await this.host.renderMarkdownInto(textEl, this.getNoticeBodyText(message));

    this.renderOmoRawSystemReminder(bodyEl, message);

    if (message.noticeActions && message.noticeActions.length > 0) {
      const actionsEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-actions' });
      for (const action of message.noticeActions) {
        const buttonEl = actionsEl.createEl('button', {
          cls: 'opencodian-chat-notice-action-btn',
          text: this.getNoticeActionLabel(action.type),
        });
        buttonEl.type = 'button';
        buttonEl.addEventListener('click', () => {
          void this.host.handleNoticeAction(action.type);
        });
      }
    }
  }

  private renderOmoRawSystemReminder(bodyEl: HTMLElement, message: ChatMessage): void {
    if (message.omo?.kind !== 'system-reminder') {
      return;
    }

    const rawWrapperEl = bodyEl.createDiv({
      cls: 'opencodian-omo-raw-block opencodian-omo-raw-block--notice',
    });
    rawWrapperEl.createDiv({
      cls: 'opencodian-omo-raw-label',
      text: t('chat.omo.system.rawLabel'),
    });
    const rawContentEl = rawWrapperEl.createEl('pre', {
      cls: 'opencodian-omo-raw-content',
      text: message.omo.rawText,
    });
    const rawToggleEl = rawWrapperEl.createEl('button');
    const rawState: CollapsibleState = {
      isExpanded: false,
      isCollapsible: false,
    };
    setupCollapsible({
      wrapperEl: rawWrapperEl,
      headerEl: rawToggleEl,
      contentEl: rawContentEl,
      state: rawState,
      options: {
        collapsedHeight: 88,
        showMoreLabel: t('chat.omo.system.showRaw'),
        showLessLabel: t('chat.omo.system.hideRaw'),
      },
    });
  }

  private getNoticeTitle(message: ChatMessage): string | undefined {
    if (message.omo?.kind !== 'system-reminder') {
      return undefined;
    }

    switch (message.omo.reminderType) {
      case 'background-task-completed':
        return t('chat.omo.system.backgroundCompleted');
      case 'all-background-tasks-complete':
        return t('chat.omo.system.allCompleted');
      default:
        return t('chat.omo.system.generic');
    }
  }

  private getNoticeBodyText(message: ChatMessage): string {
    if (message.omo?.kind !== 'system-reminder') {
      return message.content;
    }

    const lines = message.omo.reminderText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const headline = message.omo.headline;
    const detailLines = lines.filter((line) => line !== headline);
    if (detailLines.length > 0) {
      return detailLines.join('\n\n');
    }

    switch (message.omo.reminderType) {
      case 'background-task-completed':
        return t('chat.omo.system.backgroundCompletedSummary');
      case 'all-background-tasks-complete':
        return t('chat.omo.system.allCompletedSummary');
      default:
        return message.content || headline;
    }
  }

  private getNoticeActionLabel(actionType: NoticeActionType): string {
    switch (actionType) {
      case 'open_model_settings':
        return t('chat.notice.action.openModelSettings');
      case 'restore_rewind':
        return t('chat.rewind.empty.restore');
      default:
        return t('chat.notice.action.openModelSettings');
    }
  }
}
