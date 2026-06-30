import { Setting } from 'obsidian';

import { IMPLEMENTED_AGENT_BACKENDS } from '../../core/agents/backend';
import type { AgentBackendKind } from '../../core/types/chat';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

const ALL_BACKEND_OPTIONS: Array<{
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

export const BACKEND_OPTIONS = ALL_BACKEND_OPTIONS.filter(
  (option): option is (typeof ALL_BACKEND_OPTIONS)[number] =>
    IMPLEMENTED_AGENT_BACKENDS.includes(option.id),
);

interface BackendStatusBadge {
  readonly kind: 'active' | 'enabled' | 'off';
  readonly label: string;
}

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
    const shellEl = containerEl.createDiv({ cls: 'opencodian-agent-settings-shell opencodian-backend-agent-surface' });
    this.addDefaultBackendSetting(shellEl);
    this.addEnabledBackendsSettings(shellEl);
  }

  private addDefaultBackendSetting(containerEl: HTMLElement): void {
    const enabledBackends = this.getEnabledBackends();
    const setting = new Setting(containerEl)
      .setName(t('settings.agent.default'))
      .setDesc(enabledBackends.length === 0 ? t('settings.agent.default.empty.desc') : t('settings.agent.default.desc'))
      .setClass('opencodian-agent-settings-control-row');
    setting.settingEl.addClass('opencodian-backend-agent-default-row');

    if (enabledBackends.length === 0) {
      setting.controlEl.createDiv({
        cls: 'opencodian-agent-settings-alert',
        text: t('settings.agent.empty.notice'),
        attr: { 'data-alert-state': 'empty' },
      });
      return;
    }

    setting
      .addDropdown((dropdown) => {
        for (const backend of enabledBackends) {
          const option = BACKEND_OPTIONS.find((candidate) => candidate.id === backend);
          if (option) {
            dropdown.addOption(option.id, t(option.labelKey));
          }
        }
        dropdown
          .setValue(this.plugin.settings.activeBackend ?? '')
          .onChange(async (value) => {
            if (value) {
              const previousActive = this.plugin.settings.activeBackend;
              this.plugin.settings.activeBackend = value as AgentBackendKind;
              // Sync registry active backend
              this.plugin.agentServiceRegistry?.setActive(value as AgentBackendKind);
              await this.plugin.saveSettings();

              // Stop the previous adapter and start the new one
              if (previousActive && previousActive !== value) {
                try {
                  const prevAdapter = this.plugin.agentServiceRegistry?.get(previousActive as AgentBackendKind);
                  if (prevAdapter) { await prevAdapter.stop(); }
                } catch { /* best effort */ }
              }
              try {
                const newAdapter = this.plugin.agentServiceRegistry?.get(value as AgentBackendKind);
                if (newAdapter) { await newAdapter.start(); }
              } catch { /* best effort */ }

              this.requestDisplayRefresh();
            }
          });
      });
  }

  private addEnabledBackendsSettings(containerEl: HTMLElement): void {
    const groupEl = containerEl.createDiv({ cls: 'opencodian-backend-agent-group' });
    groupEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading opencodian-backend-agent-group-title',
      text: t('settings.agent.enabled'),
    });
    const listEl = groupEl.createDiv({
      cls: 'opencodian-backend-agent-list',
      attr: { role: 'list' },
    });

    for (const backend of BACKEND_OPTIONS) {
      const enabled = this.getEnabledBackends().includes(backend.id);
      const active = this.plugin.settings.activeBackend === backend.id;
      const setting = new Setting(listEl)
        .setName(t(backend.labelKey))
        .setDesc(t(backend.descriptionKey))
        .setClass('opencodian-backend-agent-row')
        .addToggle((toggle) => {
          toggle
            .setValue(enabled)
            .setDisabled(false)
            .onChange(async (value) => {
              await this.setBackendEnabled(backend.id, value);
              await this.plugin.saveSettings();
              this.requestDisplayRefresh();
            });
        });
      setting.settingEl.setAttribute('role', 'listitem');
      setting.settingEl.setAttribute('data-backend-agent-id', backend.id);
      setting.settingEl.setAttribute('data-backend-agent-active', active ? 'true' : 'false');
      setting.settingEl.setAttribute('data-backend-agent-enabled', enabled ? 'true' : 'false');
      this.decorateBackendRow(setting.settingEl, this.getBackendStatusBadges(enabled, active));
    }
  }

  private decorateBackendRow(rowEl: HTMLElement, badges: readonly BackendStatusBadge[]): void {
    const nameEl = rowEl.querySelector<HTMLElement>('.setting-item-name');
    if (!nameEl) {
      return;
    }
    const badgeStripEl = nameEl.createSpan({ cls: 'opencodian-agent-catalog-badges' });
    for (const badge of badges) {
      badgeStripEl.createSpan({
        cls: `opencodian-agent-badge opencodian-backend-agent-badge opencodian-backend-agent-badge-${badge.kind}`,
        text: badge.label,
      });
    }
  }

  private getBackendStatusBadges(enabled: boolean, active: boolean): BackendStatusBadge[] {
    if (active) {
      return [{ kind: 'active', label: t('settings.agent.status.active') }];
    }
    if (enabled) {
      return [{ kind: 'enabled', label: t('settings.agent.status.enabled') }];
    }
    return [{ kind: 'off', label: t('settings.agent.status.disabled') }];
  }

  private getEnabledBackends(): AgentBackendKind[] {
    return this.plugin.settings.enabledBackends.filter((backend) =>
      IMPLEMENTED_AGENT_BACKENDS.includes(backend),
    );
  }

  private async setBackendEnabled(backend: AgentBackendKind, enabled: boolean): Promise<void> {
    const enabledBackends = new Set(this.getEnabledBackends());
    const isActive = this.plugin.settings.activeBackend === backend;

    if (enabled) {
      enabledBackends.add(backend);
    } else {
      enabledBackends.delete(backend);
    }

    this.plugin.settings.enabledBackends = BACKEND_OPTIONS
      .map((option) => option.id)
      .filter((candidate) => enabledBackends.has(candidate));

    // Sync registry enabled state
    if (this.plugin.agentServiceRegistry) {
      if (enabled) {
        this.plugin.agentServiceRegistry.setEnabled(backend);
      } else {
        this.plugin.agentServiceRegistry.setDisabled(backend);
      }
    }

    this.ensureValidBackendState();

    // Lifecycle: only start/stop the adapter if the backend IS the active backend.
    // Enabling a non-active backend should NOT start its adapter.
    // Disabling a non-active backend only needs registry cleanup (done above).
    try {
      if (isActive) {
        const adapter = this.plugin.agentServiceRegistry?.get(backend);
        if (adapter) {
          if (enabled) {
            await adapter.start();
          } else {
            await adapter.stop();
          }
        } else if (backend === 'opencode') {
          // Fallback: for OpenCode, the service may exist independently.
          if (enabled) {
            await this.plugin.openCodeService?.start();
          } else {
            await this.plugin.openCodeService?.stop();
          }
        }
      }
    } catch {
      // Best effort: the setting change should still be saved even if start/stop fails.
    }
  }

  private ensureValidBackendState(): void {
    this.plugin.settings.enabledBackends = this.getEnabledBackends();
    if (!this.plugin.settings.enabledBackends.includes(this.plugin.settings.activeBackend as AgentBackendKind)) {
      this.plugin.settings.activeBackend = this.plugin.settings.enabledBackends[0];
    }
  }
}
