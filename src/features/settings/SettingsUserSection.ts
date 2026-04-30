/**
 * User settings section helpers
 *
 * Extracted from OpenCodianSettings to keep that file under the max-lines limit.
 */

import { Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

interface SettingsUserSectionOptions {
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsUserSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsUserSectionOptions['createSectionHeading'];

  constructor(plugin: OpenCodianPlugin, options: SettingsUserSectionOptions) {
    this.plugin = plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.user.title'),
      t('settings.quickNav.userDesc'),
    );

    renderUserProfileSetting(containerEl, this.plugin);
    renderUserPromptSetting(containerEl, this.plugin);
    renderUserExcludedTagsSetting(containerEl, this.plugin);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    switch (secondaryTabId) {
      case 'profile':
        renderUserProfileSetting(containerEl, this.plugin);
        break;
      case 'prompt':
        renderUserPromptSetting(containerEl, this.plugin);
        break;
      case 'tags':
        renderUserExcludedTagsSetting(containerEl, this.plugin);
        break;
    }
  }
}

export function renderUserProfileSetting(containerEl: HTMLElement, plugin: OpenCodianPlugin): void {
  new Setting(containerEl)
    .setName(t('settings.user.name.name'))
    .setDesc(t('settings.user.name.desc'))
    .addText((text) =>
      text.setPlaceholder('User').setValue(plugin.settings.userName).onChange(async (value) => {
        plugin.settings.userName = value;
        await plugin.saveSettings();
      }),
    );
}

export function renderUserPromptSetting(containerEl: HTMLElement, plugin: OpenCodianPlugin): void {
  new Setting(containerEl)
    .setName(t('settings.user.systemPrompt.name'))
    .setDesc(t('settings.user.systemPrompt.desc'))
    .addTextArea((text) => {
      text
        .setPlaceholder('You are a helpful assistant...')
        .setValue(plugin.settings.systemPrompt)
        .onChange(async (value) => {
          plugin.settings.systemPrompt = value;
          await plugin.saveSettings();
        });
      text.inputEl.rows = 6;
    });
}

export function renderUserExcludedTagsSetting(containerEl: HTMLElement, plugin: OpenCodianPlugin): void {
  new Setting(containerEl)
    .setName(t('settings.user.excludedTags.name'))
    .setDesc(t('settings.user.excludedTags.desc'))
    .addTextArea((text) => {
      text
        .setPlaceholder('system\nprivate')
        .setValue(plugin.settings.excludedTags.join('\n'))
        .onChange(async (value) => {
          plugin.settings.excludedTags = value
            .split('\n')
            .map((s) => s.trim().replace(/^#/, ''))
            .filter((s) => s.length > 0);
          await plugin.saveSettings();
        });
      text.inputEl.rows = 4;
    });
}
