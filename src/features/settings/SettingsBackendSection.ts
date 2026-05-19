import { Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

const BACKEND_OPTIONS: Array<{
  id: AgentBackendKind;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { id: 'opencode', labelKey: 'settings.backend.name.opencode', descriptionKey: 'settings.backend.opencode.desc' },
  { id: 'claude-code', labelKey: 'settings.backend.name.claude-code', descriptionKey: 'settings.backend.claude-code.desc' },
  { id: 'codex', labelKey: 'settings.backend.name.codex', descriptionKey: 'settings.backend.codex.desc' },
  { id: 'copilot', labelKey: 'settings.backend.name.copilot', descriptionKey: 'settings.backend.copilot.desc' },
  { id: 'pi', labelKey: 'settings.backend.name.pi', descriptionKey: 'settings.backend.pi.desc' },
];

interface SettingsBackendSectionOptions {
  plugin: OpenCodianPlugin;
  requestDisplayRefresh: () => void;
}

export class SettingsBackendSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly requestDisplayRefresh: () => void;

  constructor(options: SettingsBackendSectionOptions) {
    this.plugin = options.plugin;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
  }

  attach(containerEl: HTMLElement): void {
    this.ensureValidBackendState();
    this.addDefaultBackendSetting(containerEl);
    this.addEnabledBackendsSettings(containerEl);
  }

  private addDefaultBackendSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.backend.default'))
      .setDesc(t('settings.backend.default.desc'))
      .addDropdown((dropdown) => {
        for (const backend of this.getEnabledBackends()) {
          const option = BACKEND_OPTIONS.find((candidate) => candidate.id === backend);
          if (option) {
            dropdown.addOption(option.id, t(option.labelKey));
          }
        }
        dropdown
          .setValue(this.plugin.settings.activeBackend)
          .onChange(async (value) => {
            this.plugin.settings.activeBackend = value as AgentBackendKind;
            await this.plugin.saveSettings();
          });
      });
  }

  private addEnabledBackendsSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.backend.enabled'),
    });

    for (const backend of BACKEND_OPTIONS) {
      const enabled = this.getEnabledBackends().includes(backend.id);
      const active = this.plugin.settings.activeBackend === backend.id;
      const desc = backend.id === 'opencode' && enabled
        ? `${t(backend.descriptionKey)}\n${t('settings.backend.opencode.required')}`
        : t(backend.descriptionKey);
      const status = active
        ? t('settings.backend.status.active')
        : enabled
          ? t('settings.backend.status.enabled')
          : '';

      new Setting(containerEl)
        .setName(status ? `${t(backend.labelKey)} ${status}` : t(backend.labelKey))
        .setDesc(desc)
        .addToggle((toggle) => {
          const cannotDisable = backend.id === 'opencode' || (enabled && this.getEnabledBackends().length <= 1);
          toggle
            .setValue(enabled)
            .setDisabled(cannotDisable)
            .onChange(async (value) => {
              this.setBackendEnabled(backend.id, value);
              await this.plugin.saveSettings();
              this.requestDisplayRefresh();
            });
        });
    }
  }

  private getEnabledBackends(): AgentBackendKind[] {
    return this.plugin.settings.enabledBackends.length > 0
      ? this.plugin.settings.enabledBackends
      : ['opencode'];
  }

  private setBackendEnabled(backend: AgentBackendKind, enabled: boolean): void {
    if (backend === 'opencode') {
      this.plugin.settings.enabledBackends = this.getEnabledBackends().includes('opencode')
        ? this.getEnabledBackends()
        : ['opencode', ...this.getEnabledBackends()];
      return;
    }

    const enabledBackends = new Set(this.getEnabledBackends());
    if (enabled) {
      enabledBackends.add(backend);
    } else if (enabledBackends.size > 1) {
      enabledBackends.delete(backend);
    }

    this.plugin.settings.enabledBackends = BACKEND_OPTIONS
      .map((option) => option.id)
      .filter((candidate) => enabledBackends.has(candidate));

    if (!this.plugin.settings.enabledBackends.includes(this.plugin.settings.activeBackend)) {
      this.plugin.settings.activeBackend = 'opencode';
    }
  }

  private ensureValidBackendState(): void {
    if (!this.plugin.settings.enabledBackends.includes('opencode')) {
      this.plugin.settings.enabledBackends = ['opencode', ...this.plugin.settings.enabledBackends];
    }
    if (!this.plugin.settings.enabledBackends.includes(this.plugin.settings.activeBackend)) {
      this.plugin.settings.activeBackend = 'opencode';
    }
  }
}
