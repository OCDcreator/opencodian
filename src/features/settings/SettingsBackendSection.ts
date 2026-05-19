import { Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

const BACKEND_OPTIONS: Array<{
  id: AgentBackendKind;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { id: 'opencode', labelKey: 'settings.agent.name.opencode', descriptionKey: 'settings.agent.opencode.desc' },
  { id: 'claude-code', labelKey: 'settings.agent.name.claude-code', descriptionKey: 'settings.agent.claude-code.desc' },
  { id: 'codex', labelKey: 'settings.agent.name.codex', descriptionKey: 'settings.agent.codex.desc' },
  { id: 'copilot', labelKey: 'settings.agent.name.copilot', descriptionKey: 'settings.agent.copilot.desc' },
  { id: 'pi', labelKey: 'settings.agent.name.pi', descriptionKey: 'settings.agent.pi.desc' },
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
      .setName(t('settings.agent.default'))
      .setDesc(t('settings.agent.default.desc'))
      .addDropdown((dropdown) => {
        for (const backend of this.getEnabledBackends()) {
          const option = BACKEND_OPTIONS.find((candidate) => candidate.id === backend);
          if (option) {
            dropdown.addOption(option.id, t(option.labelKey));
          }
        }
        dropdown
          .setValue(this.plugin.settings.activeBackend ?? '')
          .onChange(async (value) => {
            this.plugin.settings.activeBackend = value as AgentBackendKind;
            await this.plugin.saveSettings();
          });
      });
  }

  private addEnabledBackendsSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.agent.enabled'),
    });

    for (const backend of BACKEND_OPTIONS) {
      const enabled = this.getEnabledBackends().includes(backend.id);
      const active = this.plugin.settings.activeBackend === backend.id;
      const status = active
        ? t('settings.agent.status.active')
        : enabled
          ? t('settings.agent.status.enabled')
          : '';

      new Setting(containerEl)
        .setName(status ? `${t(backend.labelKey)} ${status}` : t(backend.labelKey))
        .setDesc(t(backend.descriptionKey))
        .addToggle((toggle) => {
          toggle
            .setValue(enabled)
            .setDisabled(false)
            .onChange(async (value) => {
              this.setBackendEnabled(backend.id, value);
              await this.plugin.saveSettings();
              this.requestDisplayRefresh();
            });
        });
    }
  }

  private getEnabledBackends(): AgentBackendKind[] {
    return this.plugin.settings.enabledBackends;
  }

  private setBackendEnabled(backend: AgentBackendKind, enabled: boolean): void {
    const enabledBackends = new Set(this.getEnabledBackends());
    if (enabled) {
      enabledBackends.add(backend);
    } else {
      enabledBackends.delete(backend);
    }

    this.plugin.settings.enabledBackends = BACKEND_OPTIONS
      .map((option) => option.id)
      .filter((candidate) => enabledBackends.has(candidate));

    this.ensureValidBackendState();
  }

  private ensureValidBackendState(): void {
    if (!this.plugin.settings.enabledBackends.includes(this.plugin.settings.activeBackend as AgentBackendKind)) {
      this.plugin.settings.activeBackend = this.plugin.settings.enabledBackends[0];
    }
  }
}
