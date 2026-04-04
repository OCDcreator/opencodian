import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export class LiquidGlassSettingHelpModal extends Modal {
  constructor(
    app: App,
    private readonly titleText: string,
    private readonly bodyText: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: this.titleText });

    const helpEl = contentEl.createEl('div', {
      cls: 'opencodian-config-help opencodian-liquid-glass-help',
    });
    helpEl.createEl('h5', {
      text: t('settings.style.input.help.plainLanguageHeading'),
    });

    for (const paragraph of this.bodyText.split(/\n\s*\n/g)) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) {
        continue;
      }

      helpEl.createEl('p', { text: trimmedParagraph });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
