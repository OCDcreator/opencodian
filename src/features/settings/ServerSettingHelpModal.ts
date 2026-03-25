import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export type ServerHelpTopic =
  | 'mode'
  | 'autoStart'
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

    contentEl.empty();
    contentEl.createEl('h2', {
      text: this.tr(`settings.server.help.${this.topic}.title`),
    });

    const helpText = contentEl.createEl('div', { cls: 'opencodian-config-help opencodian-server-help' });
    helpText.innerHTML = this.getHelpContent();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private getHelpContent(): string {
    const example = this.tr(`settings.server.help.${this.topic}.example`);
    const extra = this.tr(`settings.server.help.${this.topic}.extra`);
    const tips = [
      this.tr(`settings.server.help.${this.topic}.tip1`),
      this.tr(`settings.server.help.${this.topic}.tip2`),
    ].filter((item) => item && !item.includes(`settings.server.help.${this.topic}.tip`));

    return `
      <div class="opencodian-help-section">
        <p class="opencodian-help-intro">${this.tr(`settings.server.help.${this.topic}.intro`)}</p>
      </div>

      <div class="opencodian-help-section">
        <h5>${t('settings.server.help.whatItMeans')}</h5>
        <div class="opencodian-help-mode">
          <p>${this.tr(`settings.server.help.${this.topic}.meaning`)}</p>
        </div>
      </div>

      <div class="opencodian-help-section">
        <h5>${t('settings.server.help.howToFill')}</h5>
        <div class="opencodian-help-mode">
          <p>${this.tr(`settings.server.help.${this.topic}.fill`)}</p>
        </div>
      </div>

      ${extra && !extra.includes(`settings.server.help.${this.topic}.extra`) ? `
        <div class="opencodian-help-section">
          <h5>${t('settings.server.help.moreNotes')}</h5>
          <div class="opencodian-help-mode">
            <p>${extra}</p>
          </div>
        </div>
      ` : ''}

      ${example && !example.includes(`settings.server.help.${this.topic}.example`) ? `
        <div class="opencodian-help-section">
          <h5>${t('settings.server.help.exampleLabel')}</h5>
          <div class="opencodian-help-example">
            <pre><code>${this.escapeHtml(example)}</code></pre>
          </div>
        </div>
      ` : ''}

      ${tips.length > 0 ? `
        <div class="opencodian-help-section">
          <h5>${t('settings.server.help.tipsLabel')}</h5>
          <ul class="opencodian-help-tips">
            ${tips.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;
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
