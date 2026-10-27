import { Notice, Setting } from 'obsidian';

import type { DshBackendSettings, DshMcpServer } from '../../../../core/types/settings';
import { t, type TranslationKey } from '../../../../i18n';
import { type InlineEditModelOverrideHost,SettingsInlineEditSection } from '../../general/SettingsInlineEditSection';

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
  modelOverridesHost?: InlineEditModelOverrideHost;
}

const DSH_TABS: readonly { id: string; labelKey: TranslationKey }[] = [
  { id: 'connection', labelKey: 'settings.dsh.tab.connection' },
  { id: 'model', labelKey: 'settings.dsh.tab.model' },
  { id: 'mcp', labelKey: 'settings.dsh.tab.mcp' },
  { id: 'configuration', labelKey: 'settings.dsh.tab.configuration' },
];

/**
 * DSH workspace: connection, MCP declarations and native configuration
 * readback. The section is mounted only for the active DSH backend; it reads
 * and writes `backendSettings.dsh` and never presents another backend's
 * configuration as DSH.
 */
export class SettingsDshSection {
  constructor(private readonly host: DshSettingsHost) {}

  attach(containerEl: HTMLElement): void {
    for (const tab of DSH_TABS) {
      this.renderTab(containerEl, tab.id, { showSubheading: true });
    }
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const tab = DSH_TABS.find((candidate) => candidate.id === secondaryTabId)?.id
      ?? DSH_TABS[0].id;
    this.renderTab(containerEl, tab, { showSubheading: false });
  }

  private renderTab(
    containerEl: HTMLElement,
    tabId: string,
    options: { showSubheading: boolean },
  ): void {
    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-dsh-settings',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': `dsh-${tabId}`,
      },
    });
    if (options.showSubheading) {
      blockEl.createEl('h3', {
        cls: 'opencodian-settings-subheading',
        text: t(DSH_TABS.find((candidate) => candidate.id === tabId)?.labelKey
          ?? 'settings.dsh.tab.connection'),
      });
    }
    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });
    const group = bodyEl.createDiv({ cls: 'opencodian-backend-agent-group opencodian-dsh-settings' });
    if (tabId === 'connection') {
      this.renderConnection(group);
      return;
    }
    if (tabId === 'model') {
      this.renderModel(group);
      return;
    }
    if (tabId === 'mcp') {
      this.renderMcp(group);
      return;
    }
    this.renderConfiguration(group);
  }

  private renderModel(group: HTMLElement): void {
    group.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.dsh.model.title'),
    });
    group.createEl('p', {
      cls: 'setting-item-description',
      text: t('settings.dsh.model.desc'),
    });
    if (!this.host.modelOverridesHost) {
      group.createEl('p', {
        cls: 'setting-item-description',
        text: t('settings.dsh.model.unavailable'),
      });
      return;
    }
    SettingsInlineEditSection.renderBackendModelOverrides(
      group,
      'dsh',
      this.host.modelOverridesHost,
    );
  }

  private renderConnection(group: HTMLElement): void {
    const settings = this.host.getSettings();
    group.createEl('h4', { cls: 'opencodian-settings-subsection-heading', text: t('settings.agent.dsh.connection') });
    new Setting(group).setName(t('settings.agent.dsh.transport')).setDesc(t('settings.agent.dsh.transport.desc'))
      .addDropdown((dropdown) => {
        dropdown.selectEl.setAttribute('aria-label', t('settings.agent.dsh.transport'));
        dropdown
          .addOption('native', t('settings.agent.dsh.transport.native')).addOption('acp', t('settings.agent.dsh.transport.acp'))
          .setValue(settings.transport ?? 'native').onChange(async (value) => {
            settings.transport = value === 'acp' ? 'acp' : 'native'; await this.host.saveSettings();
          });
      });
    new Setting(group)
      .setName(t('settings.agent.dsh.executable'))
      .setDesc(t('settings.agent.dsh.executable.desc'))
      .addText((input) => {
        input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.executable'));
        input.setPlaceholder('dsh')
        .setValue(settings.executablePath)
        .onChange(async (value) => {
          settings.executablePath = value.trim();
          await this.host.saveSettings();
        });
      });
    new Setting(group)
      .setName(t('settings.agent.dsh.workingDirectory'))
      .setDesc(t('settings.agent.dsh.workingDirectory.desc'))
      .addText((input) => {
        input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.workingDirectory'));
        input.setPlaceholder(t('settings.agent.dsh.workingDirectory.placeholder'))
        .setValue(settings.workingDirectory)
        .onChange(async (value) => {
          settings.workingDirectory = value.trim();
          await this.host.saveSettings();
        });
      });
    const status = group.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
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
    group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.limits') });
  }

  private renderMcp(group: HTMLElement): void {
    this.addDshMcpSettings(group);
    group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.limits') });
  }

  private renderConfiguration(group: HTMLElement): void {
    const configuration = group.createDiv();
    new Setting(group).setName(t('settings.agent.dsh.configuration'))
      .setDesc(t('settings.agent.dsh.configuration.desc'))
      .addButton((button) => button.setButtonText(t('settings.agent.dsh.configuration.read')).onClick(async () => {
        button.setDisabled(true);
        try { await this.renderDshConfiguration(configuration); }
        catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
        finally { button.setDisabled(false); }
      }));
    group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.limits') });
  }

  private addDshMcpSettings(container: HTMLElement): void {
    const settings = this.host.getSettings();
    const disclosure = container.createEl('details');
    disclosure.createEl('summary', { text: t('settings.agent.dsh.mcp') });
    let draft = JSON.stringify(settings.mcpServers ?? [], null, 2);
    const serializeDeclarations = (value: unknown): string => JSON.stringify(this.host.validateMcpServers(value));
    const hasUnsavedChanges = (): boolean => {
      try {
        return serializeDeclarations(JSON.parse(draft)) !== serializeDeclarations(settings.mcpServers ?? []);
      } catch {
        return draft !== JSON.stringify(settings.mcpServers ?? [], null, 2);
      }
    };
    const row = new Setting(disclosure).setName(t('settings.agent.dsh.mcp.declarations'))
      .setDesc(t('settings.agent.dsh.mcp.desc')).setClass('opencodian-wide-text-setting');
    const feedback = disclosure.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    row.addTextArea((input) => {
      input.setValue(draft).setPlaceholder('[]').onChange((value) => {
        draft = value;
        const message = hasUnsavedChanges() ? t('settings.agent.dsh.mcp.unsaved') : '';
        if (feedback.textContent !== message) feedback.setText(message);
      });
      input.inputEl.rows = 8;
      input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp.declarations'));
      input.inputEl.addClass('opencodian-config-editor');
    });
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
          const unsaved = hasUnsavedChanges();
          feedback.setText(t('settings.agent.dsh.mcp.applied', { count })
            + (unsaved ? ` ${t('settings.agent.dsh.mcp.draftNotApplied')}` : ''));
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
      const name = option.id === 'model' ? t('settings.agent.dsh.model')
        : option.id === 'reasoning_effort' ? t('settings.agent.dsh.effort') : option.name;
      const selected = option.choices.find((choice) => choice.value === option.value)?.name ?? option.value;
      const separator = selected.indexOf(': ');
      const value = separator > 0 && selected.slice(0, separator) === selected.slice(separator + 2)
        ? selected.slice(separator + 2) : selected;
      new Setting(container).setName(name).setDesc(value);
    }
  }

}
