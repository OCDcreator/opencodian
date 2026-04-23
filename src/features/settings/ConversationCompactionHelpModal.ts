import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export type ConversationCompactionHelpTopic =
  | 'auto'
  | 'prune'
  | 'tailTurns'
  | 'preserveRecentTokens'
  | 'reserved';

export class ConversationCompactionHelpModal extends Modal {
  constructor(
    app: App,
    private readonly topic: ConversationCompactionHelpTopic,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    this.modalEl.addClass('opencodian-conversation-compaction-help-modal');
    contentEl.empty();
    const shellEl = contentEl.createDiv({
      cls: 'opencodian-conversation-compaction-help',
    });
    const headerEl = shellEl.createDiv({
      cls: 'opencodian-compaction-help-header',
    });
    headerEl.createEl('h2', {
      text: this.tr(`settings.conversation.compaction.help.${this.topic}.title`),
    });
    headerEl.createEl('p', {
      cls: 'opencodian-compaction-help-subtitle',
      text: this.tr(`settings.conversation.compaction.help.${this.topic}.intro`),
    });

    const gridEl = shellEl.createDiv({
      cls: 'opencodian-compaction-help-grid',
    });
    this.createCard(
      gridEl,
      this.tr('settings.conversation.compaction.help.whatItMeans'),
      this.tr(`settings.conversation.compaction.help.${this.topic}.meaning`),
    );
    this.createCard(
      gridEl,
      this.tr('settings.conversation.compaction.help.opencodeDefault'),
      this.tr(`settings.conversation.compaction.help.${this.topic}.default`),
    );
    this.createCard(
      gridEl,
      this.tr('settings.conversation.compaction.help.adjustmentEffect'),
      this.tr(`settings.conversation.compaction.help.${this.topic}.effect`),
    );
    this.createTipsCard(gridEl);
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-conversation-compaction-help-modal');
  }

  private createCard(containerEl: HTMLElement, title: string, body: string): void {
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-compaction-help-card',
    });
    cardEl.createDiv({
      cls: 'opencodian-compaction-help-card-title',
      text: title,
    });
    cardEl.createDiv({
      cls: 'opencodian-compaction-help-card-body',
      text: body,
    });
  }

  private createTipsCard(containerEl: HTMLElement): void {
    const extra = this.tr(`settings.conversation.compaction.help.${this.topic}.extra`);
    const tips = [
      this.tr(`settings.conversation.compaction.help.${this.topic}.tip1`),
      this.tr(`settings.conversation.compaction.help.${this.topic}.tip2`),
    ].filter((item) => item && !item.includes(`settings.conversation.compaction.help.${this.topic}.tip`));

    const cardEl = containerEl.createDiv({
      cls: 'opencodian-compaction-help-card',
    });
    cardEl.createDiv({
      cls: 'opencodian-compaction-help-card-title',
      text: t('settings.conversation.compaction.help.tipsLabel'),
    });

    if (extra && !extra.includes(`settings.conversation.compaction.help.${this.topic}.extra`)) {
      cardEl.createDiv({
        cls: 'opencodian-compaction-help-card-body',
        text: extra,
      });
    }

    if (tips.length > 0) {
      const listEl = cardEl.createEl('ul', {
        cls: 'opencodian-compaction-help-tip-list',
      });
      for (const tip of tips) {
        listEl.createEl('li', {
          text: tip,
        });
      }
    }
  }

  private tr(key: string): string {
    return t(key as never);
  }

}
