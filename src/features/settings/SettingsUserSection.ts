/**
 * User settings section helpers
 *
 * Extracted from OpenCodianSettings to keep that file under the max-lines limit.
 */

import { Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { TextareaSizeMemory } from './TextareaSizeMemory';

interface SettingsUserSectionOptions {
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsUserSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsUserSectionOptions['createSectionHeading'];
  private textareaSizeMemories: TextareaSizeMemory[] = [];

  constructor(plugin: OpenCodianPlugin, options: SettingsUserSectionOptions) {
    this.plugin = plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.dispose();
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.user.title'),
      t('settings.quickNav.userDesc'),
    );

    this.renderUserProfileSetting(containerEl);
    this.renderUserPromptSetting(containerEl);
    this.renderUserExcludedTagsSetting(containerEl);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.dispose();
    switch (secondaryTabId) {
      case 'profile':
        this.renderUserProfileSetting(containerEl);
        break;
      case 'prompt':
        this.renderUserPromptSetting(containerEl);
        break;
      case 'tags':
        this.renderUserExcludedTagsSetting(containerEl);
        break;
    }
  }

  dispose(): void {
    for (const memory of this.textareaSizeMemories) {
      memory.destroy();
    }
    this.textareaSizeMemories = [];
  }

  private renderUserProfileSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.user.name.name'))
      .setDesc(t('settings.user.name.desc'))
      .addText((text) =>
        text.setPlaceholder('User').setValue(this.plugin.settings.userName).onChange(async (value) => {
          this.plugin.settings.userName = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderUserPromptSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.user.systemPrompt.name'))
      .setDesc(t('settings.user.systemPrompt.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('You are a helpful assistant...')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        this.textareaSizeMemories.push(TextareaSizeMemory.attach(text.inputEl, 'user-system-prompt'));
      });
  }

  private renderUserExcludedTagsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.user.excludedTags.name'))
      .setDesc(t('settings.user.excludedTags.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('system\nprivate')
          .setValue(this.plugin.settings.excludedTags.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedTags = value
              .split('\n')
              .map((s) => s.trim().replace(/^#/, ''))
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        this.textareaSizeMemories.push(TextareaSizeMemory.attach(text.inputEl, 'user-excluded-tags'));
      });
  }
}
