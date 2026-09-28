import { Notice, Setting } from 'obsidian';

import { IMPLEMENTED_AGENT_BACKENDS } from '../../core/agents/backend';
import type { OpenCode2Adapter } from '../../core/agents/backend/OpenCode2Adapter';
import type { AgentBackendKind } from '../../core/types/chat';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

const ALL_BACKEND_OPTIONS: Array<{
  id: AgentBackendKind;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { id: 'opencode', labelKey: 'settings.agent.name.opencode', descriptionKey: 'settings.agent.opencode.desc' },
  { id: 'opencode2', labelKey: 'settings.agent.name.opencode2', descriptionKey: 'settings.agent.opencode2.desc' },
  { id: 'claude-code', labelKey: 'settings.agent.name.claude-code', descriptionKey: 'settings.agent.claude-code.desc' },
  { id: 'codex', labelKey: 'settings.agent.name.codex', descriptionKey: 'settings.agent.codex.desc' },
  { id: 'copilot', labelKey: 'settings.agent.name.copilot', descriptionKey: 'settings.agent.copilot.desc' },
  { id: 'pi', labelKey: 'settings.agent.name.pi', descriptionKey: 'settings.agent.pi.desc' },
  { id: 'zcode', labelKey: 'settings.agent.name.zcode', descriptionKey: 'settings.agent.zcode.desc' },
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
    this.addChatWarmSessionSetting(shellEl);
    this.addEnabledBackendsSettings(shellEl);
    this.addOpenCode2Settings(shellEl);
  }

  private addOpenCode2Settings(containerEl: HTMLElement): void {
    if (!this.getEnabledBackends().includes('opencode2')) return;
    const settings = this.plugin.settings.backendSettings.opencode2;
    const group = containerEl.createDiv({ cls: 'opencodian-backend-agent-group' });
    group.createEl('h4', { cls: 'opencodian-settings-subsection-heading', text: t('settings.agent.opencode2.connection') });
    new Setting(group)
      .setName(t('settings.agent.opencode2.mode'))
      .addDropdown((dropdown) => dropdown
        .addOption('local', t('settings.server.mode.local'))
        .addOption('remote', t('settings.server.mode.remote'))
        .setValue(settings.mode)
        .onChange(async (value) => {
          settings.mode = value === 'remote' ? 'remote' : 'local';
          await this.plugin.saveSettings();
          this.requestDisplayRefresh();
        }));
    if (settings.mode === 'local') {
      new Setting(group)
        .setName(t('settings.agent.opencode2.executable'))
        .setDesc(t('settings.agent.opencode2.executable.desc'))
        .addText((input) => input
          .setPlaceholder('opencode2')
          .setValue(settings.executablePath)
          .onChange(async (value) => {
            settings.executablePath = value.trim();
            await this.plugin.saveSettings();
          }));
      const config = new Setting(group)
        .setName(t('settings.agent.opencode2.config'))
        .setDesc(t('settings.agent.opencode2.config.desc'));
      let draft = settings.configContent ?? '';
      config.addTextArea((input) => {
        input.setValue(draft).setPlaceholder('{}').onChange((value) => { draft = value; });
        input.inputEl.rows = 8;
        input.inputEl.addClass('opencodian-config-editor');
      });
      config.addButton((button) => button.setButtonText(t('settings.agent.opencode2.config.apply')).onClick(async () => {
        button.setDisabled(true);
        try {
          const adapter = this.plugin.agentServiceRegistry?.get('opencode2') as {
            validateConfigContent?(content: string): Promise<void>;
          } | undefined;
          if (!adapter?.validateConfigContent) throw new Error('OpenCode 2 adapter unavailable');
          await adapter.validateConfigContent(draft);
          await this.plugin.saveSettings();
          new Notice(t('settings.agent.opencode2.config.verified'));
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        } finally { button.setDisabled(false); }
      }));
    } else {
      new Setting(group)
        .setName(t('settings.agent.opencode2.url'))
        .addText((input) => input
          .setPlaceholder('http://127.0.0.1:4096')
          .setValue(settings.baseUrl)
          .onChange(async (value) => {
            settings.baseUrl = value.trim();
            await this.plugin.saveSettings();
          }));
      new Setting(group)
        .setName(t('settings.agent.opencode2.password'))
        .addText((input) => {
          input.inputEl.type = 'password';
          input.setValue(settings.password).onChange(async (value) => {
            settings.password = value;
            await this.plugin.saveSettings();
          });
        });
    }
    const catalogStatus = group.createDiv({ cls: 'setting-item-description' });
    const management = group.createDiv();
    new Setting(group).setName(t('settings.agent.opencode2.catalog'))
      .addButton((button) => button.setButtonText(t('settings.agent.opencode2.catalog.refresh')).onClick(async () => {
        button.setDisabled(true);
        try {
          const adapter = this.plugin.agentServiceRegistry?.get('opencode2') as {
            readConfigurationSummary?(): Promise<{ version: string; providers: number; models: number; agents: number; skills: number; commands: number; mcp: number }>;
          } | undefined;
          const summary = await adapter?.readConfigurationSummary?.();
          if (!summary) throw new Error('OpenCode 2 adapter unavailable');
          catalogStatus.setText(t('settings.agent.opencode2.catalog.summary', summary));
          await this.renderOpenCode2Management(management);
        } catch (error) { catalogStatus.setText(error instanceof Error ? error.message : String(error)); }
        finally { button.setDisabled(false); }
      }));
  }

  private async renderOpenCode2Management(container: HTMLElement): Promise<void> {
    const adapter = this.plugin.agentServiceRegistry?.get('opencode2') as OpenCode2Adapter | undefined;
    if (!adapter) throw new Error('OpenCode 2 adapter unavailable');
    const catalog = await adapter.readManagementCatalog();
    container.empty();
    const run = async (action: () => Promise<void>) => {
      try { await action(); await this.renderOpenCode2Management(container); }
      catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
    };
    container.createEl('h4', { text: t('settings.agent.opencode2.mcp') });
    for (const server of catalog.mcp) {
      const row = new Setting(container).setName(server.name).setDesc(server.status.status);
      row.addButton((button) => button.setButtonText(t(server.status.status === 'connected'
        ? 'settings.agent.opencode2.disconnect' : 'settings.agent.opencode2.connect'))
        .onClick(() => run(() => adapter.setMcpConnection(server.name, server.status.status !== 'connected'))));
    }
    container.createEl('h4', { text: t('settings.agent.opencode2.integrations') });
    for (const integration of catalog.integrations) {
      const group = container.createDiv({ cls: 'opencodian-backend-agent-group' });
      group.createEl('h5', { text: integration.name });
      let answer: Record<string, string | number | boolean | readonly string[]> | undefined;
      let answerError = '';
      const formMethods = integration.methods.filter((method) => 'form' in method && method.form);
      if (formMethods.length) {
        new Setting(group).setName(t('settings.agent.opencode2.auth.answers'))
          .setDesc(JSON.stringify(formMethods.map((method) => 'form' in method ? method.form : undefined)))
          .addTextArea((input) => input.setPlaceholder('{}').onChange((value) => {
            try {
              const parsed: unknown = value.trim() ? JSON.parse(value) : undefined;
              if (parsed && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('Expected a JSON object');
              answer = parsed as typeof answer;
              answerError = '';
            } catch (error) { answer = undefined; answerError = error instanceof Error ? error.message : String(error); }
          }));
      }
      for (const method of integration.methods) {
        if (method.type === 'key') {
          let key = '';
          new Setting(group).setName(method.label ?? t('settings.agent.opencode2.auth.key'))
            .addText((input) => { input.inputEl.type = 'password'; input.onChange((value) => { key = value; }); })
            .addButton((button) => button.setButtonText(t('settings.agent.opencode2.connect')).onClick(() => run(async () => {
              if (!key.trim()) throw new Error(t('settings.agent.opencode2.auth.keyRequired'));
              if (answerError) throw new Error(answerError);
              await adapter.connectIntegrationKey(integration.id, key, answer);
              key = '';
            })));
        } else if (method.type === 'oauth') {
          const details = group.createDiv();
          new Setting(group).setName(method.label)
            .addButton((button) => button.setButtonText(t('settings.agent.opencode2.connect')).onClick(async () => {
              try {
                if (answerError) throw new Error(answerError);
                const attempt = await adapter.beginIntegrationOAuth(integration.id, method.id, answer);
                details.empty();
                details.createEl('a', { text: t('settings.agent.opencode2.auth.open'), href: attempt.url }).setAttr('target', '_blank');
                details.createEl('p', { text: attempt.instructions });
                let code = '';
                const row = new Setting(details).setName(t('settings.agent.opencode2.auth.status'));
                if (attempt.mode === 'code') row.addText((input) => input.onChange((value) => { code = value; }));
                row.addButton((control) => control.setButtonText(t('settings.agent.opencode2.auth.complete')).onClick(() => run(
                  () => adapter.finishIntegrationOAuth(integration.id, attempt.attemptID, code || undefined))));
                row.addButton((control) => control.setButtonText(t('settings.agent.opencode2.auth.check')).onClick(async () => {
                  try { row.setDesc((await adapter.readIntegrationOAuth(integration.id, attempt.attemptID)).status); }
                  catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
                }));
                row.addButton((control) => control.setButtonText(t('settings.agent.opencode2.auth.cancel')).onClick(() => run(
                  () => adapter.cancelIntegrationOAuth(integration.id, attempt.attemptID))));
              } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
            }));
        } else if (method.type === 'env') {
          group.createEl('p', { text: `${t('settings.agent.opencode2.auth.env')}: ${method.names.join(', ')}` });
        }
      }
      for (const connection of integration.connections) {
        if (connection.type !== 'credential') continue;
        new Setting(group).setName(connection.label).setDesc(connection.method)
          .addButton((button) => button.setButtonText(t('settings.agent.opencode2.auth.activate')).onClick(() => run(
            () => adapter.manageCredential(connection.id, 'activate'))))
          .addButton((button) => button.setButtonText(t('settings.agent.opencode2.auth.remove')).onClick(() => run(
            () => adapter.manageCredential(connection.id, 'remove'))));
      }
    }
    for (const [key, entries] of Object.entries({ agents: catalog.agents, commands: catalog.commands, skills: catalog.skills, plugins: catalog.plugins })) {
      const details = container.createEl('details');
      details.createEl('summary', { text: `${key} (${entries.length})` });
      details.createEl('p', { text: entries.map((entry) => 'name' in entry ? String(entry.name) : 'id' in entry ? String(entry.id) : '').filter(Boolean).join(', ') });
    }
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

              this.plugin.onChatWarmSessionBackendChanged?.();
              this.requestDisplayRefresh();
            }
          });
      });
  }

  /** R-F4 is backend-scoped, so its quiet opt-in belongs beside the selector. */
  private addChatWarmSessionSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.agent.chatWarmSession.name'))
      .setDesc(t('settings.agent.chatWarmSession.desc'))
      .setClass('opencodian-agent-settings-control-row')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.chatWarmSessionEnabled)
        .onChange(async (value) => {
          this.plugin.settings.chatWarmSessionEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.onChatWarmSessionSettingChanged?.(value);
        }));
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
    const previousActive = this.plugin.settings.activeBackend;
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

    if (this.plugin.settings.activeBackend !== previousActive) {
      this.plugin.onChatWarmSessionBackendChanged?.();
    }
  }

  private ensureValidBackendState(): void {
    this.plugin.settings.enabledBackends = this.getEnabledBackends();
    if (!this.plugin.settings.enabledBackends.includes(this.plugin.settings.activeBackend as AgentBackendKind)) {
      this.plugin.settings.activeBackend = this.plugin.settings.enabledBackends[0];
    }
  }
}
