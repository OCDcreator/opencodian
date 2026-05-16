import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export type OpenCodeProjectConfigHelpTopic = 'share' | 'bashPermission' | 'formatterLsp';

const HELP_LINKS: Record<OpenCodeProjectConfigHelpTopic, { href: string; labelKey: string }[]> = {
  share: [
    {
      href: 'https://opencode.ai/docs/zh-cn/share',
      labelKey: 'settings.conversation.share.help.link.share',
    },
    {
      href: 'https://opencode.ai/docs/zh-cn/config',
      labelKey: 'settings.conversation.share.help.link.config',
    },
  ],
  bashPermission: [
    {
      href: 'https://opencode.ai/docs/zh-cn/permissions',
      labelKey: 'settings.security.blockedCommands.help.link.permissions',
    },
    {
      href: 'https://opencode.ai/docs/zh-cn/tools',
      labelKey: 'settings.security.blockedCommands.help.link.tools',
    },
  ],
  formatterLsp: [
    {
      href: 'https://opencode.ai/docs/zh-cn/formatters/',
      labelKey: 'settings.formatter.help.link.formatters',
    },
    {
      href: 'https://opencode.ai/docs/zh-cn/lsp/',
      labelKey: 'settings.formatter.help.link.lsp',
    },
  ],
};

export class OpenCodeProjectConfigHelpModal extends Modal {
  constructor(
    app: App,
    private readonly topic: OpenCodeProjectConfigHelpTopic,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-project-config-help-modal');
    this.contentEl.empty();

    const shellEl = this.contentEl.createDiv({
      cls: 'opencodian-project-config-help',
    });
    shellEl.createEl('h2', {
      text: this.tr(`${this.baseKey}.title`),
    });
    shellEl.createEl('p', {
      cls: 'opencodian-project-config-help-intro',
      text: this.tr(`${this.baseKey}.intro`),
    });

    const listEl = shellEl.createEl('ul', {
      cls: 'opencodian-project-config-help-list',
    });
    for (const key of ['point1', 'point2', 'point3'] as const) {
      listEl.createEl('li', {
        text: this.tr(`${this.baseKey}.${key}`),
      });
    }

    const linksEl = shellEl.createDiv({
      cls: 'opencodian-project-config-help-links',
    });
    linksEl.createDiv({
      cls: 'opencodian-project-config-help-links-title',
      text: t('settings.projectConfigHelp.officialLinks'),
    });
    for (const link of HELP_LINKS[this.topic]) {
      const linkEl = linksEl.createEl('a', {
        text: this.tr(link.labelKey),
        href: link.href,
      });
      linkEl.href = link.href;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener';
    }
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-project-config-help-modal');
  }

  private get baseKey(): string {
    switch (this.topic) {
      case 'share':
        return 'settings.conversation.share.help';
      case 'bashPermission':
        return 'settings.security.blockedCommands.help';
      case 'formatterLsp':
      default:
        return 'settings.formatter.help';
    }
  }

  private tr(key: string): string {
    return t(key as never);
  }
}
