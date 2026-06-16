import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export type ServerHelpTopic =
  | 'mode'
  | 'autoStart'
  | 'executablePath'
  | 'host'
  | 'port'
  | 'remoteUrl'
  | 'auth'
  | 'username'
  | 'password'
  | 'token'
  | 'status';

export class ServerSettingHelpModal extends Modal {
  constructor(
    app: App,
    private readonly topic: ServerHelpTopic,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    this.modalEl.addClass('opencodian-server-setting-help-modal');
    contentEl.empty();

    const shellEl = contentEl.createDiv({
      cls: 'opencodian-help-modal-shell',
    });
    shellEl.createEl('h2', {
      text: this.tr(`settings.server.help.${this.topic}.title`),
    });

    const introSection = shellEl.createDiv({
      cls: 'opencodian-help-modal-section',
    });
    introSection.createEl('p', {
      cls: 'opencodian-help-intro',
      text: this.tr(`settings.server.help.${this.topic}.intro`),
    });

    this.appendCardSection(
      shellEl,
      t('settings.server.help.whatItMeans'),
      this.tr(`settings.server.help.${this.topic}.meaning`),
    );
    this.appendCardSection(
      shellEl,
      t('settings.server.help.howToFill'),
      this.tr(`settings.server.help.${this.topic}.fill`),
    );

    const extra = this.tr(`settings.server.help.${this.topic}.extra`);
    if (extra && !extra.includes(`settings.server.help.${this.topic}.extra`)) {
      this.appendCardSection(shellEl, t('settings.server.help.moreNotes'), extra);
    }

    const example = this.tr(`settings.server.help.${this.topic}.example`);
    if (example && !example.includes(`settings.server.help.${this.topic}.example`)) {
      this.appendExampleSection(shellEl, example);
    }

    const tips = [
      this.tr(`settings.server.help.${this.topic}.tip1`),
      this.tr(`settings.server.help.${this.topic}.tip2`),
    ].filter((item) => item && !item.includes(`settings.server.help.${this.topic}.tip`));
    if (tips.length > 0) {
      this.appendTipsSection(shellEl, tips);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private appendCardSection(shellEl: HTMLElement, heading: string, body: string): void {
    const sectionEl = shellEl.createDiv({
      cls: 'opencodian-help-modal-section',
    });
    sectionEl.createEl('h5', { text: heading });
    const cardEl = sectionEl.createDiv({
      cls: 'opencodian-help-modal-card',
    });
    cardEl.createEl('p', { text: body });
  }

  private appendExampleSection(shellEl: HTMLElement, example: string): void {
    const sectionEl = shellEl.createDiv({
      cls: 'opencodian-help-modal-section',
    });
    sectionEl.createEl('h5', {
      text: t('settings.server.help.exampleLabel'),
    });
    const preEl = sectionEl.createEl('pre', {
      cls: 'opencodian-help-modal-pre',
    });
    preEl.createEl('code', { text: example });
  }

  private appendTipsSection(shellEl: HTMLElement, tips: string[]): void {
    const sectionEl = shellEl.createDiv({
      cls: 'opencodian-help-modal-section',
    });
    sectionEl.createEl('h5', {
      text: t('settings.server.help.tipsLabel'),
    });
    const listEl = sectionEl.createEl('ul', {
      cls: 'opencodian-help-modal-list',
    });
    for (const tip of tips) {
      listEl.createEl('li', { text: tip });
    }
  }

  private tr(key: string): string {
    return t(key as never);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
