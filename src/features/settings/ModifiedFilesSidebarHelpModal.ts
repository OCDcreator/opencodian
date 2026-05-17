import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export class ModifiedFilesSidebarHelpModal extends Modal {
  constructor(app: App) {
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
      text: t('settings.ui.modifiedFilesSidebar.helpTitle'),
    });
    headerEl.createEl('p', {
      cls: 'opencodian-compaction-help-subtitle',
      text: t('settings.ui.modifiedFilesSidebar.helpIntro'),
    });

    const gridEl = shellEl.createDiv({
      cls: 'opencodian-compaction-help-grid',
    });

    this.createCard(
      gridEl,
      t('settings.ui.modifiedFilesSidebar.helpWhenEnabledTitle'),
      t('settings.ui.modifiedFilesSidebar.helpWhenEnabledBody'),
    );

    this.createCard(
      gridEl,
      t('settings.ui.modifiedFilesSidebar.helpWhenDisabledTitle'),
      t('settings.ui.modifiedFilesSidebar.helpWhenDisabledBody'),
    );

    this.createCard(
      gridEl,
      t('settings.ui.modifiedFilesSidebar.howToUseTitle'),
      t('settings.ui.modifiedFilesSidebar.howToUseBody'),
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
    const tips: string[] = [];
    const tip1 = t('settings.ui.modifiedFilesSidebar.helpTip1' as never);
    const tip2 = t('settings.ui.modifiedFilesSidebar.helpTip2' as never);
    if (!tip1.includes('settings.ui.modifiedFilesSidebar.helpTip1')) tips.push(tip1);
    if (!tip2.includes('settings.ui.modifiedFilesSidebar.helpTip2')) tips.push(tip2);

    const cardEl = containerEl.createDiv({
      cls: 'opencodian-compaction-help-card',
    });
    cardEl.createDiv({
      cls: 'opencodian-compaction-help-card-title',
      text: t('settings.ui.modifiedFilesSidebar.helpTipsTitle'),
    });

    if (tips.length > 0) {
      const listEl = cardEl.createEl('ul', {
        cls: 'opencodian-compaction-help-tip-list',
      });
      for (const tip of tips) {
        listEl.createEl('li', { text: tip });
      }
    }
  }
}
