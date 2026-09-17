import * as nodeOs from 'node:os';

import { type App, Notice, Setting } from 'obsidian';

import type { PiAdapter } from '../../core/agents/backend/pi/PiAdapter';
import { PiMcpConfigService } from '../../core/agents/backend/pi/PiMcpConfigService';
import { toPiChatMessages } from '../../core/agents/backend/pi/PiStreamMapper';
import type { PiBackendSettings } from '../../core/types/settings';
import { normalizePiBackendSettings } from '../../core/types/settings';
import { t } from '../../i18n';
import { getVaultBasePath } from '../../shared';
import { PiWorkbenchModal } from './PiWorkbenchModal';
import { SettingsPiConfigurationSection } from './SettingsPiConfigurationSection';
import { SettingsPiProvidersSection } from './SettingsPiProvidersSection';

const PI_TABS = ['connection', 'providers', 'model', 'execution', 'mcp', 'resources', 'account', 'sessions', 'advanced'] as const;

/** Config paths are shown for orientation only; the home prefix is the noisy part. */
function shortenConfigPath(filePath: string): string {
  const home = nodeOs.homedir();
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedHome = home.replace(/\\/g, '/');
  return normalized.startsWith(`${normalizedHome}/`) ? `~/${normalized.slice(normalizedHome.length + 1)}` : filePath;
}

export interface SettingsPiHost {
  app?: App;
  loadBackendSessionConversation?(conversationId: string): Promise<void>;
  invalidateSlashCommandCatalog?(): void;
  createConversationFromBackendSession?(id: string, title?: string, messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>, backend?: 'pi'): Promise<string | null>;
  settings: { backendSettings: { pi?: PiBackendSettings } };
  saveSettings(): Promise<void>;
  agentServiceRegistry?: { get(kind: 'pi'): { start(): Promise<void> } | undefined };
}

/** Owns Pi settings only; auth, providers and extensions remain managed by the external Pi installation. */
export class SettingsPiSection {
  constructor(
    private readonly host: SettingsPiHost,
    private readonly mcpConfig: PiMcpConfigService = new PiMcpConfigService(),
  ) {}

  attach(container: HTMLElement): void {
    container.createEl('h2', { text: t('settings.pi.title') });
    const tabs = container.createDiv({ cls: 'opencodian-settings-tabs-secondary' });
    const body = container.createDiv();
    for (const id of PI_TABS) {
      const button = tabs.createEl('button', { cls: 'opencodian-settings-tab-secondary', text: t(`settings.pi.tab.${id}`) });
      button.addEventListener('click', () => { body.empty(); this.attachTabbed(body, id); });
    }
    this.attachTabbed(body, 'connection');
  }

  attachTabbed(container: HTMLElement, requested: string): void {
    const tab = PI_TABS.find(id => id === requested) ?? 'connection';
    const section = container.createDiv({ cls: 'opencodian-settings-block opencodian-settings-section opencodian-pi-settings', attr: { 'data-settings-surface': 'section', 'data-settings-target': `pi-${tab}`, 'data-pi-section': tab } });
    const body = section.createDiv({ cls: 'opencodian-settings-block-body opencodian-settings-section-body', attr: { 'data-settings-surface': 'section-body' } });
    body.createEl('h3', { text: t(`settings.pi.tab.${tab}`) });
    const adapter = this.adapter;
    if (tab === 'connection') { this.connection(body); return; }
    if (tab === 'mcp') { this.mcp(body, adapter); return; }
    if (!adapter) { body.createEl('p', { text: t('settings.pi.unavailable') }); return; }
    if (tab === 'providers') { new SettingsPiProvidersSection(adapter, () => this.reconnect()).attach(body); return; }
    if (tab === 'account') { this.account(body, adapter); return; }
    if (tab === 'sessions') { this.sessions(body, adapter); return; }
    new SettingsPiConfigurationSection(adapter, keys => this.clearLegacyDefaults(keys), () => this.reconnect()).attach(body, tab);
    if (tab === 'resources') this.workbench(body);
  }

  private get adapter(): PiAdapter | undefined { return this.host.agentServiceRegistry?.get('pi') as PiAdapter | undefined; }

  private async reconnect(): Promise<void> {
    const adapter = this.adapter; if (!adapter) throw new Error(t('settings.pi.unavailable'));
    await adapter.stop(); await adapter.start(); this.host.invalidateSlashCommandCatalog?.();
  }

  private async clearLegacyDefaults(keys: string[]): Promise<void> {
    const settings = normalizePiBackendSettings(this.host.settings.backendSettings.pi);
    for (const [native, local] of [['defaultProvider', 'provider'], ['defaultModel', 'model'], ['defaultThinkingLevel', 'thinkingLevel']] as const) if (keys.includes(native)) settings[local] = '';
    this.host.settings.backendSettings.pi = settings; await this.host.saveSettings();
    this.host.invalidateSlashCommandCatalog?.();
  }

  private workbench(container: HTMLElement): void {
    new Setting(container).setName(t('settings.pi.workbench')).setDesc(t('settings.pi.workbench.help')).addButton(button => {
      button.setButtonText(t('settings.pi.open')).onClick(() => {
        if (this.host.app && this.adapter) new PiWorkbenchModal(this.host.app, this.adapter, id => this.openChat(id)).open();
      });
    });
  }

  private async openChat(id: string): Promise<void> {
    if (!this.adapter) return;
    const transcript = toPiChatMessages(await this.adapter.getSessionMessages(id));
    const conversation = await this.host.createConversationFromBackendSession?.(id, (await this.adapter.getSession(id))?.title, transcript, 'pi');
    if (conversation) await this.host.loadBackendSessionConversation?.(conversation);
  }

  private connection(section: HTMLElement): void {
    section.createEl('p', { text: t('settings.pi.description'), cls: 'setting-item-description' });
    const settings = normalizePiBackendSettings(this.host.settings.backendSettings.pi);
    this.addText(section, 'executablePath', settings, [t('settings.pi.executable'), t('settings.pi.executable.desc')]);
    const status = section.createDiv({ cls: 'opencodian-pi-config-status', attr: { role: 'status' } });
    new Setting(section).setName(t('settings.pi.reconnect')).setDesc(t('settings.pi.reconnect.help')).addButton(button => button.setButtonText(t('settings.pi.reconnect')).onClick(async () => {
      button.setDisabled(true);
      try { await this.reconnect(); status.setText(t('settings.pi.connected')); } catch (error) { status.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
    if (settings.provider || settings.model || settings.thinkingLevel) new Setting(section).setName(t('settings.pi.legacyDefaults')).setDesc(`${settings.provider}/${settings.model} · ${settings.thinkingLevel}`)
      .addButton(button => button.setButtonText(t('settings.pi.useNativeDefaults')).onClick(async () => { await this.clearLegacyDefaults(['defaultProvider', 'defaultModel', 'defaultThinkingLevel']); status.setText(t('settings.pi.saved')); }));
    this.workbench(section);
    new Setting(section).setName(t('settings.pi.storage')).setDesc(t('settings.pi.storage.help'));
    new Setting(section).setName(t('settings.pi.check')).setDesc(t('settings.pi.check.desc')).addButton((button) => {
      button.setButtonText(t('settings.pi.check')).onClick(async () => {
        button.setDisabled(true);
        try {
          const adapter = this.host.agentServiceRegistry?.get('pi');
          if (!adapter) throw new Error(t('settings.pi.unavailable'));
          await adapter.start();
          new Notice(t('settings.pi.connected'));
        } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
        finally { button.setDisabled(false); }
      });
    });
  }

  private account(container: HTMLElement, adapter: PiAdapter): void {
    const status = container.createDiv({ text: t('settings.pi.loading'), attr: { role: 'status' } });
    const body = container.createDiv({ cls: 'opencodian-settings-form-stack' });
    void adapter.command(undefined, 'get_auth').then(result => {
      status.setText(t('settings.pi.account.help'));
      for (const record of result.providers as Array<{ provider: string; configured: boolean }>) {
        new Setting(body).setName(record.provider).setDesc(record.configured ? t('settings.pi.authConfigured') : t('settings.pi.authMissing'));
      }
      let provider = '';
      new Setting(body).setName(t('settings.pi.oauthProvider')).addDropdown(dropdown => {
        dropdown.addOption('', t('settings.pi.selectProvider'));
        for (const item of result.oauthProviders as Array<{ id: string; name: string }>) dropdown.addOption(item.id, item.name);
        dropdown.onChange(value => { provider = value; });
      }).addButton(button => button.setButtonText(t('settings.pi.login')).onClick(async () => {
        button.setDisabled(true);
        try { await adapter.command(undefined, 'login', { provider }); status.setText(t('settings.pi.authConfigured')); }
        catch (error) { status.setText(String(error)); }
        finally { button.setDisabled(false); }
      })).addButton(button => button.setButtonText(t('settings.pi.cancel')).onClick(() => adapter.stopSession()));
      let keyProvider = '', apiKey = '';
      new Setting(body).setName(t('settings.pi.providerId')).addText(input => input.onChange(value => { keyProvider = value.trim(); }));
      new Setting(body).setName('API key').addText(input => { input.inputEl.type = 'password'; input.onChange(value => { apiKey = value; }); })
        .addButton(button => button.setButtonText(t('settings.pi.save')).onClick(async () => {
          try { await adapter.command(undefined, 'set_api_key', { provider: keyProvider, apiKey }); status.setText(t('settings.pi.authConfigured')); apiKey = ''; const input = body.querySelector<HTMLInputElement>('input[type=password]'); if (input) input.value = ''; }
          catch (error) { status.setText(String(error)); }
        }));
      let confirmed = false;
      new Setting(body).setName(t('settings.pi.logout')).setDesc(t('settings.pi.logout.help')).addToggle(toggle => toggle.onChange(value => { confirmed = value; }))
        .addButton(button => button.setButtonText(t('settings.pi.logout')).onClick(async () => {
          if (!confirmed) { status.setText(t('settings.pi.confirmRemoval')); return; }
          try { await adapter.command(undefined, 'logout', { provider: keyProvider || provider }); status.setText(t('settings.pi.authMissing')); } catch (error) { status.setText(String(error)); }
        }));
    }).catch(error => status.setText(String(error)));
  }

  /** Read-only: Pi owns MCP configuration, and its extensions own the runtime status. */
  private mcp(container: HTMLElement, adapter: PiAdapter | undefined): void {
    container.createEl('p', { text: t('settings.pi.mcp.intro'), cls: 'setting-item-description' });
    const workingDirectory = this.host.app ? getVaultBasePath(this.host.app) : null;
    const snapshot = workingDirectory
      ? this.mcpConfig.read({ workingDirectory })
      : { servers: [], sources: [], exclusive: false };
    const body = container.createDiv({ cls: 'opencodian-settings-form-stack' });
    if (!snapshot.servers.length) body.createEl('p', { text: t('settings.pi.mcp.empty') });
    for (const server of snapshot.servers) {
      new Setting(body).setName(server.name).setDesc([
        t(`settings.pi.mcp.transport.${server.transport}`),
        server.endpoint || t('settings.pi.mcp.endpointUnknown'),
        server.disabled ? t('settings.pi.mcp.disabled') : '',
        server.auth === 'none' ? '' : t('settings.pi.mcp.authValue', { auth: t(`settings.pi.mcp.auth.${server.auth}`) }),
        t('settings.pi.mcp.sourceValue', { file: shortenConfigPath(server.source) }),
      ].filter(Boolean).join(' · '));
    }
    if (snapshot.exclusive) container.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.mcp.exclusive') });
    if (snapshot.sources.length) {
      container.createEl('p', {
        cls: 'setting-item-description opencodian-pi-mcp-sources',
        text: t('settings.pi.mcp.sourcesValue', { files: snapshot.sources.map(shortenConfigPath).join(' · ') }),
      });
    }
    container.createEl('h4', { text: t('settings.pi.mcp.status.title') });
    container.createEl('p', { text: t('settings.pi.mcp.status.help'), cls: 'setting-item-description' });
    this.mcpStatus(container, adapter);
  }

  private mcpStatus(container: HTMLElement, adapter: PiAdapter | undefined): void {
    const snapshot = adapter?.getExtensionStatus?.();
    const lines = snapshot ? Object.values(snapshot.statuses).filter(Boolean) : [];
    if (!snapshot || (!lines.length && !snapshot.message)) {
      container.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.mcp.status.none') });
      return;
    }
    const block = container.createDiv({ cls: 'opencodian-pi-mcp-status', attr: { role: 'status' } });
    for (const line of lines) block.createDiv({ cls: 'opencodian-pi-mcp-status-line', text: line });
    if (snapshot.message) block.createDiv({ cls: 'opencodian-pi-mcp-status-message', text: snapshot.message });
    container.createEl('p', {
      cls: 'setting-item-description opencodian-pi-mcp-status-meta',
      text: t('settings.pi.mcp.status.updatedAt', { time: new Date(snapshot.updatedAt).toLocaleTimeString() }),
    });
  }

  private sessions(container: HTMLElement, adapter: PiAdapter): void {
    this.workbench(container);
    const body = container.createDiv({ cls: 'opencodian-settings-form-stack' });
    void adapter.listSessions().then(sessions => {
      if (!sessions.length) body.createEl('p', { text: t('settings.pi.noSessions') });
      for (const session of sessions) new Setting(body).setName(session.title).setDesc(new Date(session.updatedAt).toLocaleString())
        .addButton(button => button.setButtonText(t('settings.pi.openChat')).onClick(() => { void this.openChat(session.id).catch(error => new Notice(String(error))); }));
    }).catch(error => body.setText(String(error)));
  }

  private addText(container: HTMLElement, key: 'executablePath' | 'provider' | 'model', settings: PiBackendSettings, [name, description]: [string, string]): void {
    new Setting(container).setName(name).setDesc(description).addText((text) => {
      text.setValue(settings[key]).onChange(async (value) => {
        settings[key] = value.trim();
        this.host.settings.backendSettings.pi = { ...settings };
        await this.host.saveSettings();
      });
    });
  }
}
