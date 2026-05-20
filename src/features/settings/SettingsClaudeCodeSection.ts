/**
 * Claude Code settings section.
 *
 * Holds the Phase 1 configuration foundation for the Claude Code backend
 * without exposing Claude as an enabled runtime backend before smoke validation.
 */

import { Setting } from 'obsidian';

import {
  type ClaudeCodeProcessResolution,
  type ClaudeCodeProcessResolverOptions,
  resolveClaudeCodeProcess,
} from '../../core/agents/backend/ClaudeCodeProcessResolver';
import {
  type ClaudeCodeEffort,
  type ClaudeCodePermissionMode,
  type ClaudeCodeSettingSource,
  type ClaudeCodeThinking,
  getDefaultClaudeCodeBackendSettings,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

interface SettingsClaudeCodeSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  resolveProcess?: (options: ClaudeCodeProcessResolverOptions) => ClaudeCodeProcessResolution;
}

const SETTING_SOURCE_OPTIONS: ClaudeCodeSettingSource[] = ['user', 'project', 'local'];
const PERMISSION_MODE_OPTIONS: ClaudeCodePermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
const THINKING_TYPE_OPTIONS: ClaudeCodeThinking['type'][] = ['adaptive', 'disabled', 'fixed'];
const EFFORT_OPTIONS: ClaudeCodeEffort[] = ['low', 'medium', 'high', 'max'];

export class SettingsClaudeCodeSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsClaudeCodeSectionOptions['createSectionHeading'];
  private readonly resolveProcess: (options: ClaudeCodeProcessResolverOptions) => ClaudeCodeProcessResolution;

  constructor(options: SettingsClaudeCodeSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.resolveProcess = options.resolveProcess ?? resolveClaudeCodeProcess;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.claudeCode.title'),
      t('settings.claudeCode.desc'),
    );
    this.render(containerEl);
    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.render(containerEl);
  }

  private render(containerEl: HTMLElement): void {
    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-claude-code-block',
      attr: { 'data-settings-surface': 'section' },
    });
    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    this.renderExecutableSetting(bodyEl);
    this.renderEnvironmentHint(bodyEl);
    this.renderSettingSources(bodyEl);
    this.renderPermissionMode(bodyEl);
    this.renderModelSettings(bodyEl);
    this.renderThinkingSettings(bodyEl);
    this.renderAdditionalDirectories(bodyEl);
    this.renderDiagnostics(bodyEl);
  }

  private renderExecutableSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.executablePath.name'))
      .setDesc(t('settings.claudeCode.executablePath.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.executablePath.placeholder'))
          .setValue(this.settings.executablePath)
          .onChange(async (value) => {
            this.settings.executablePath = value.trim();
            await this.saveSettings();
          });
      });
  }

  private renderEnvironmentHint(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.environment.name'))
      .setDesc(t('settings.claudeCode.environment.desc'));
  }

  private renderSettingSources(containerEl: HTMLElement): void {
    containerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.claudeCode.settingSources.name'),
    });

    for (const source of SETTING_SOURCE_OPTIONS) {
      new Setting(containerEl)
        .setName(t(`settings.claudeCode.settingSources.${source}`))
        .setDesc(t(`settings.claudeCode.settingSources.${source}.desc`))
        .addToggle((toggle) => {
          toggle
            .setValue(this.settings.settingSources.includes(source))
            .onChange(async (value) => {
              const selectedSources = new Set(this.settings.settingSources);
              if (value) {
                selectedSources.add(source);
              } else {
                selectedSources.delete(source);
              }
              this.settings.settingSources = SETTING_SOURCE_OPTIONS.filter((candidate) =>
                selectedSources.has(candidate),
              );
              await this.saveSettings();
            });
        });
    }
  }

  private renderPermissionMode(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.permissionMode.name'))
      .setDesc(t('settings.claudeCode.permissionMode.desc'))
      .addDropdown((dropdown) => {
        for (const mode of PERMISSION_MODE_OPTIONS) {
          dropdown.addOption(mode, t(`settings.claudeCode.permissionMode.${mode}`));
        }
        dropdown
          .setValue(this.settings.permissionMode)
          .onChange(async (value) => {
            this.settings.permissionMode = value as ClaudeCodePermissionMode;
            await this.saveSettings();
          });
      });
  }

  private renderModelSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.model.name'))
      .setDesc(t('settings.claudeCode.model.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.model.placeholder'))
          .setValue(this.settings.model)
          .onChange(async (value) => {
            this.settings.model = value.trim();
            await this.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.fallbackModel.name'))
      .setDesc(t('settings.claudeCode.fallbackModel.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.fallbackModel.placeholder'))
          .setValue(this.settings.fallbackModel)
          .onChange(async (value) => {
            this.settings.fallbackModel = value.trim();
            await this.saveSettings();
          });
      });
  }

  private renderThinkingSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.thinking.name'))
      .setDesc(t('settings.claudeCode.thinking.desc'))
      .addDropdown((dropdown) => {
        for (const type of THINKING_TYPE_OPTIONS) {
          dropdown.addOption(type, t(`settings.claudeCode.thinking.${type}`));
        }
        dropdown
          .setValue(this.settings.thinking.type)
          .onChange(async (value) => {
            if (value === 'fixed') {
              const previousBudget = this.settings.thinking.type === 'fixed'
                ? this.settings.thinking.budgetTokens
                : 4096;
              this.settings.thinking = { type: 'fixed', budgetTokens: previousBudget };
            } else {
              this.settings.thinking = { type: value as 'adaptive' | 'disabled' };
            }
            await this.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.thinkingBudget.name'))
      .setDesc(t('settings.claudeCode.thinkingBudget.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.thinkingBudget.placeholder'))
          .setValue(this.settings.thinking.type === 'fixed' ? String(this.settings.thinking.budgetTokens) : '')
          .onChange(async (value) => {
            const parsed = Number.parseInt(value.trim(), 10);
            this.settings.thinking = {
              type: 'fixed',
              budgetTokens: Number.isFinite(parsed) && parsed > 0 ? parsed : 4096,
            };
            await this.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.effort.name'))
      .setDesc(t('settings.claudeCode.effort.desc'))
      .addDropdown((dropdown) => {
        for (const effort of EFFORT_OPTIONS) {
          dropdown.addOption(effort, t(`settings.claudeCode.effort.${effort}`));
        }
        dropdown
          .setValue(this.settings.effort)
          .onChange(async (value) => {
            this.settings.effort = value as ClaudeCodeEffort;
            await this.saveSettings();
          });
      });
  }

  private renderAdditionalDirectories(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.additionalDirectories.name'))
      .setDesc(t('settings.claudeCode.additionalDirectories.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.additionalDirectories.placeholder'))
          .setValue(this.settings.additionalDirectories.join('\n'))
          .onChange(async (value) => {
            this.settings.additionalDirectories = this.parseLineList(value);
            await this.saveSettings();
          });
      });
  }

  private renderDiagnostics(containerEl: HTMLElement): void {
    const resultEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-diagnostics-result',
      text: t('settings.claudeCode.diagnostics.idle'),
    });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.diagnostics.name'))
      .setDesc(t('settings.claudeCode.diagnostics.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.diagnostics.button'))
          .onClick(() => {
            const resolution = this.resolveProcess({ settings: this.settings });
            resultEl.setText(this.formatDiagnostics(resolution));
          });
      });
  }

  private get settings() {
    this.plugin.settings.backendSettings ??= { claudeCode: getDefaultClaudeCodeBackendSettings() };
    this.plugin.settings.backendSettings.claudeCode ??= getDefaultClaudeCodeBackendSettings();
    return this.plugin.settings.backendSettings.claudeCode;
  }

  private parseLineList(value: string): string[] {
    return [...new Set(
      value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )];
  }

  private formatDiagnostics(resolution: ClaudeCodeProcessResolution): string {
    if (resolution.mode === 'external') {
      return t('settings.claudeCode.diagnostics.external', {
        path: resolution.pathToClaudeCodeExecutable ?? '',
      });
    }

    return t('settings.claudeCode.diagnostics.bundled');
  }

  private async saveSettings(): Promise<void> {
    await this.plugin.saveSettings();
  }
}
