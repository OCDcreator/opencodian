import { Notice, Setting } from 'obsidian';

import type { DshBackendSettings, DshMcpServer } from '../../../../core/types/settings';
import { t, type TranslationKey } from '../../../../i18n';

interface DshSettingsConnectionPort {
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'error';
  start(): Promise<void>;
  applyMcpConfiguration?(): Promise<number>;
  readSessionConfiguration(sessionId?: string): Promise<{
    sessionId: string; images: boolean;
    controls: Array<{ id: string; name: string; value: string; choices: Array<{ value: string; name: string }> }>;
  }>;
}

export interface DshSettingsHost {
  getSettings(): DshBackendSettings;
  isEnabled(): boolean;
  getAdapter(): DshSettingsConnectionPort | undefined;
  validateMcpServers(value: unknown): DshMcpServer[];
  saveSettings(): Promise<void>;
}

/** DSH connection, MCP declarations and native configuration readback. */
export class SettingsDshSection {
  constructor(private readonly host: DshSettingsHost) {}

  attach(containerEl: HTMLElement): void {
    if (!this.host.isEnabled()) return;
    const settings = this.host.getSettings();
    const group = containerEl.createDiv({ cls: 'opencodian-backend-agent-group' });
    group.createEl('h4', { cls: 'opencodian-settings-subsection-heading', text: t('settings.agent.dsh.connection') });
    new Setting(group).setName(t('settings.agent.dsh.transport')).setDesc(t('settings.agent.dsh.transport.desc'))
      .addDropdown((dropdown) => dropdown
        .addOption('native', t('settings.agent.dsh.transport.native')).addOption('acp', t('settings.agent.dsh.transport.acp'))
        .setValue(settings.transport ?? 'native').onChange(async (value) => {
          settings.transport = value === 'acp' ? 'acp' : 'native'; await this.host.saveSettings();
        }));
    new Setting(group)
      .setName(t('settings.agent.dsh.executable'))
      .setDesc(t('settings.agent.dsh.executable.desc'))
      .addText((input) => input
        .setPlaceholder('dsh')
        .setValue(settings.executablePath)
        .onChange(async (value) => {
          settings.executablePath = value.trim();
          await this.host.saveSettings();
        }));
    new Setting(group)
      .setName(t('settings.agent.dsh.workingDirectory'))
      .setDesc(t('settings.agent.dsh.workingDirectory.desc'))
      .addText((input) => input
        .setPlaceholder(t('settings.agent.dsh.workingDirectory.placeholder'))
        .setValue(settings.workingDirectory)
        .onChange(async (value) => {
          settings.workingDirectory = value.trim();
          await this.host.saveSettings();
        }));
    const status = group.createDiv({ cls: 'setting-item-description', text: t('settings.agent.dsh.status.disconnected') });
    const adapter = this.host.getAdapter();
    const statusKey = (): TranslationKey => `settings.agent.dsh.status.${adapter?.status ?? 'disconnected'}`;
    status.setText(t(statusKey()));
    new Setting(group).setName(t('settings.agent.dsh.connection'))
      .addButton((button) => button.setButtonText(t('settings.agent.dsh.testConnection')).onClick(async () => {
        button.setDisabled(true);
        status.setText(t('settings.agent.dsh.status.connecting'));
        try {
          if (!adapter) throw new Error(t('settings.agent.dsh.status.unavailable'));
          await adapter.start();
          status.setText(t(statusKey()));
        } catch (error) {
          status.setText(t('settings.agent.dsh.status.error'));
          new Notice(error instanceof Error ? error.message : String(error));
        } finally { button.setDisabled(false); }
      }));
    this.addDshMcpSettings(group);
    const configuration = group.createDiv();
    new Setting(group).setName(t('settings.agent.dsh.configuration'))
      .setDesc(t('settings.agent.dsh.configuration.desc'))
      .addButton((button) => button.setButtonText(t('settings.agent.dsh.configuration.read')).onClick(async () => {
        button.setDisabled(true);
        try { await this.renderDshConfiguration(configuration); }
        catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
        finally { status.setText(t(statusKey())); button.setDisabled(false); }
      }));
    group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.limits') });
  }

  private addDshMcpSettings(container: HTMLElement): void {
    const settings = this.host.getSettings();
    const disclosure = container.createEl('details');
    disclosure.createEl('summary', { text: t('settings.agent.dsh.mcp') });
    let draft = JSON.stringify(settings.mcpServers ?? [], null, 2);
    const row = new Setting(disclosure).setName(t('settings.agent.dsh.mcp'))
      .setDesc(t('settings.agent.dsh.mcp.desc')).setClass('opencodian-wide-text-setting');
    row.addTextArea((input) => {
      input.setValue(draft).setPlaceholder('[]').onChange((value) => { draft = value; });
      input.inputEl.rows = 8;
      input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp'));
      input.inputEl.addClass('opencodian-config-editor');
    });
    const feedback = disclosure.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    row.addButton((button) => button.setButtonText(t('settings.agent.dsh.save')).onClick(async () => {
      button.setDisabled(true);
      feedback.empty();
      const previous = settings.mcpServers;
      try {
        settings.mcpServers = this.host.validateMcpServers(JSON.parse(draft) as unknown);
        await this.host.saveSettings();
        feedback.setText(t('settings.agent.dsh.mcp.saved'));
        new Notice(t('settings.agent.dsh.mcp.saved'));
      } catch (error) {
        settings.mcpServers = previous;
        const message = error instanceof Error ? error.message : String(error);
        feedback.setText(message);
        new Notice(message);
      } finally { button.setDisabled(false); }
    }));
    new Setting(disclosure).setName(t('settings.agent.dsh.mcp.apply')).setDesc(t('settings.agent.dsh.mcp.apply.desc'))
      .addButton((button) => button.setButtonText(t('settings.agent.dsh.mcp.apply')).onClick(async () => {
        button.setDisabled(true);
        try {
          const adapter = this.host.getAdapter();
          if (!adapter?.applyMcpConfiguration) throw new Error(t('settings.agent.dsh.status.unavailable'));
          const count = await adapter.applyMcpConfiguration();
          feedback.setText(t('settings.agent.dsh.mcp.applied', { count }));
        } catch (error) { feedback.setText(error instanceof Error ? error.message : String(error)); }
        finally { button.setDisabled(false); }
      }));
  }

  private async renderDshConfiguration(container: HTMLElement): Promise<void> {
    const adapter = this.host.getAdapter();
    if (!adapter) throw new Error(t('settings.agent.dsh.status.unavailable'));
    const configuration = await adapter.readSessionConfiguration();
    container.empty();
    container.setAttribute('aria-live', 'polite');
    container.createEl('p', { cls: 'setting-item-description', text: t(configuration.images
      ? 'settings.agent.dsh.images.available' : 'settings.agent.dsh.images.unavailable') });
    if (!configuration.controls.length) {
      container.createEl('p', { cls: 'setting-item-description', text: t('chat.dsh.configurationUnavailable') });
    }
    for (const option of configuration.controls) {
      new Setting(container).setName(option.name)
        .setDesc(option.choices.find((choice) => choice.value === option.value)?.name ?? option.value);
    }
  }

}
