import * as nodeOs from 'node:os';

import { type App, Notice, Setting } from 'obsidian';

import type { PiAdapter } from '../../../../core/agents/backend/pi/PiAdapter';
import { PiMcpConfigService } from '../../../../core/agents/backend/pi/PiMcpConfigService';
import { toPiChatMessages } from '../../../../core/agents/backend/pi/PiStreamMapper';
import type { PiBackendSettings } from '../../../../core/types/settings';
import { normalizePiBackendSettings } from '../../../../core/types/settings';
import { t } from '../../../../i18n';
import { getVaultBasePath } from '../../../../shared';
import { sanitizeDiagnosticReport } from '../../../../shared/diagnosticSecretSanitizer';
import { addBackendChoiceSetting, describeBackendSetting } from '../../controls/BackendSettingsControls';
import { SettingsInlineEditSection } from '../../general/SettingsInlineEditSection';
import { PiWorkbenchModal } from './PiWorkbenchModal';
import { SettingsPiConfigurationSection } from './SettingsPiConfigurationSection';
import { SettingsPiProvidersSection } from './SettingsPiProvidersSection';

/**
 * Task subtabs. `execution` keeps the native execution fields and hosts the
 * advanced native editor as a clearly separate high-risk disclosure; legacy
 * ids keep resolving through {@link SettingsPiSection.attachTabbed}.
 */
const PI_TABS = ['connection', 'providers', 'model', 'execution', 'account', 'mcp', 'sessions'] as const;
type PiSettingsTab = (typeof PI_TABS)[number];
const PI_TAB_ALIASES: Record<string, PiSettingsTab> = { resources: 'sessions', advanced: 'execution' };

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

/**
 * Credential-free installation failure classes. The resolver throws a fixed
 * set of messages; anything unclassifiable renders the generic recovery copy
 * instead of surfacing raw CLI/provider error text (which can embed
 * credentials or URLs) in the settings DOM.
 */
type PiInstallFailure = 'missing' | 'incompatible' | 'permission' | 'unknown';
function classifyPiInstallFailure(error: unknown): PiInstallFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/^Pi CLI not found\./.test(message)) return 'missing';
  if (/^Pi (?:shim does not reference|executable must belong|SDK entry is missing|requires an external Node)/.test(message)) return 'incompatible';
  if (/(?:EACCES|EPERM|permission denied)/i.test(message)) return 'permission';
  return 'unknown';
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
    // Append-only: the shared backend workspace bar may already live in the
    // container; this section never empties or reorders host content.
    const tab = PI_TAB_ALIASES[requested] ?? (PI_TABS.find(id => id === requested) as PiSettingsTab | undefined) ?? 'connection';
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
    if (tab === 'execution') { this.execution(body, adapter); return; }
    this.model(body, adapter);
    if (tab === 'model') {
      SettingsInlineEditSection.renderBackendModelOverrides(body, 'pi', this.host as unknown as Parameters<typeof SettingsInlineEditSection.renderBackendModelOverrides>[2]);
    }
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
    const status = section.createDiv({ cls: 'opencodian-pi-config-status', attr: { role: 'status' } });
    // Real detection: the resolver either launches the CLI or reports exactly
    // why it cannot (missing install, wrong path, incompatible package). A
    // registered adapter alone is never treated as a working installation.
    let detecting = false;
    const detectRuntime = async (): Promise<void> => {
      if (detecting) return;
      detecting = true;
      status.empty();
      status.setText(t('settings.pi.status.detecting'));
      try {
        const adapter = this.adapter;
        if (!adapter) throw new Error(t('settings.pi.unavailable'));
        await adapter.start();
        if (status.isConnected) status.setText(t('settings.pi.status.runtimeFound'));
      } catch (error) {
        if (status.isConnected) {
          status.setText(t(`settings.pi.status.runtimeMissing.${classifyPiInstallFailure(error)}` as Parameters<typeof t>[0]));
        }
      } finally { detecting = false; }
    };
    void detectRuntime();
    const executable = new Setting(section).setName(t('settings.pi.executable')).setDesc(t('settings.pi.executable.desc'));
    describeBackendSetting(executable, {
      key: 'pi-executable-path',
      scope: 'vault',
      effect: 'new-session',
      risk: 'medium',
      defaultLabel: t('settings.pi.executable.auto'),
      source: t('settings.pi.status.packageGuard'),
    });
    executable.addText((text) => {
      text.setPlaceholder(t('settings.pi.executable.auto')).setValue(settings.executablePath).onChange(async (value) => {
        const previous = normalizePiBackendSettings(this.host.settings.backendSettings.pi).executablePath;
        const next = normalizePiBackendSettings({ ...normalizePiBackendSettings(this.host.settings.backendSettings.pi), executablePath: value });
        this.host.settings.backendSettings.pi = next;
        try { await this.host.saveSettings(); }
        catch {
          const current = normalizePiBackendSettings(this.host.settings.backendSettings.pi);
          if (current.executablePath === value.trim()) this.host.settings.backendSettings.pi = { ...current, executablePath: previous };
          text.setValue(previous); status.setText(t('settings.pi.saveFailed'));
        }
      });
      text.inputEl.setAttribute('aria-label', t('settings.pi.executable'));
    });
    const feedback = section.createDiv({ cls: 'opencodian-pi-config-status', attr: { role: 'status' } });
    new Setting(section).setName(t('settings.pi.reconnect')).setDesc(t('settings.pi.reconnect.help')).addButton(button => button.setButtonText(t('settings.pi.reconnect')).onClick(async () => {
      button.setDisabled(true);
      try { await this.reconnect(); feedback.setText(t('settings.pi.connected')); void detectRuntime(); } catch (error) { feedback.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
    if (settings.provider || settings.model || settings.thinkingLevel) new Setting(section).setName(t('settings.pi.legacyDefaults')).setDesc(`${settings.provider}/${settings.model} · ${settings.thinkingLevel}`)
      .addButton(button => button.setButtonText(t('settings.pi.useNativeDefaults')).onClick(async () => { await this.clearLegacyDefaults(['defaultProvider', 'defaultModel', 'defaultThinkingLevel']); feedback.setText(t('settings.pi.saved')); }));
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
          void detectRuntime();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
          void detectRuntime();
        }
        finally { button.setDisabled(false); }
      });
    });
  }

  /**
   * Native model-default configuration first (the live authority for new
   * sessions); legacy plugin defaults demoted into an explicitly labeled
   * advanced disclosure below, never the first screen.
   */
  private model(body: HTMLElement, adapter: PiAdapter): void {
    new SettingsPiConfigurationSection(adapter, keys => this.clearLegacyDefaults(keys), () => this.reconnect()).attach(body, ['model']);
    const settings = normalizePiBackendSettings(this.host.settings.backendSettings.pi);
    const legacy = body.createEl('details', { cls: 'opencodian-pi-config-advanced', attr: { 'data-pi-section': 'legacy-defaults' } });
    legacy.createEl('summary', { text: t('settings.pi.legacyDefaults.title') });
    const stack = legacy.createDiv({ cls: 'opencodian-settings-form-stack' });
    addBackendChoiceSetting(stack, {
      key: 'pi-default-thinking-level',
      name: t('settings.pi.thinking'),
      description: t('settings.pi.thinking.desc'),
      value: settings.thinkingLevel,
      options: [
        { value: '', label: t('settings.pi.inherit'), description: t('settings.pi.thinking.inheritShort'), recommended: true },
        ...(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const).map(level => ({
          value: level,
          label: t(`settings.pi.thinking.level.${level}` as Parameters<typeof t>[0]),
        })),
      ],
      onChange: async (value) => {
        if (!await this.saveLegacyDefault('thinkingLevel', value)) throw new Error('pi-default-save-failed');
      },
      presentation: {
        key: 'pi-default-thinking-level',
        scope: 'vault',
        effect: 'new-session',
        risk: 'low',
        defaultLabel: t('settings.pi.inherit'),
        source: t('settings.pi.status.legacyDefaults'),
      },
    });
    const providerRow = new Setting(stack).setName(t('settings.pi.provider')).setDesc(t('settings.pi.provider.desc'));
    describeBackendSetting(providerRow, { key: 'pi-default-provider', scope: 'vault', effect: 'new-session', risk: 'low', defaultLabel: t('settings.pi.inherit'), source: t('settings.pi.status.legacyDefaults') });
    providerRow.addText(text => text.setValue(settings.provider).onChange(async (value) => { await this.saveLegacyDefault('provider', value.trim()); }));
    const modelRow = new Setting(stack).setName(t('settings.pi.model')).setDesc(t('settings.pi.model.desc'));
    describeBackendSetting(modelRow, { key: 'pi-default-model', scope: 'vault', effect: 'new-session', risk: 'low', defaultLabel: t('settings.pi.inherit'), source: t('settings.pi.status.legacyDefaults') });
    modelRow.addText(text => text.setValue(settings.model).onChange(async (value) => { await this.saveLegacyDefault('model', value.trim()); }));
    // Migration context stays outside the choice options; one behavior
    // sentence per option, the full legacy story here.
    stack.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.legacyDefaults.help') });
  }

  /**
   * Native execution settings (tools, extensions, commands) and the advanced
   * native editor. The advanced block is a separate, clearly labeled
   * high-risk disclosure — never absorbed into the ordinary model page.
   */
  private execution(body: HTMLElement, adapter: PiAdapter): void {
    body.createEl('p', { text: t('settings.pi.execution.help'), cls: 'setting-item-description' });
    const configuration = new SettingsPiConfigurationSection(adapter, keys => this.clearLegacyDefaults(keys), () => this.reconnect());
    configuration.attach(body, ['execution']);
    configuration.attachAdvanced(body);
  }

  private async saveLegacyDefault(key: 'provider' | 'model' | 'thinkingLevel', value: string): Promise<boolean> {
    const previous = normalizePiBackendSettings(this.host.settings.backendSettings.pi);
    const next = normalizePiBackendSettings({ ...previous, [key]: value });
    this.host.settings.backendSettings.pi = next;
    try {
      await this.host.saveSettings();
      this.host.invalidateSlashCommandCatalog?.();
      return true;
    } catch {
      const current = normalizePiBackendSettings(this.host.settings.backendSettings.pi);
      if (current[key] === next[key]) this.host.settings.backendSettings.pi = { ...current, [key]: previous[key] };
      return false;
    }
  }

  private account(container: HTMLElement, adapter: PiAdapter): void {
    const status = container.createDiv({ text: t('settings.pi.loading'), attr: { role: 'status' } });
    const body = container.createDiv({ cls: 'opencodian-settings-form-stack' });
    void adapter.command(undefined, 'get_auth').then(result => {
      status.setText(t('settings.pi.account.help'));
      const records = (result.providers ?? []) as Array<{ provider: string; configured: boolean }>;
      // An empty provider list means the Pi installation exposes no auth
      // records yet — it is NOT proof that authentication is missing.
      if (!records.length) body.createEl('p', { text: t('settings.pi.account.empty'), cls: 'setting-item-description', attr: { 'data-pi-auth': 'empty' } });
      for (const record of records) {
        new Setting(body).setName(record.provider).setDesc(record.configured ? t('settings.pi.authConfigured') : t('settings.pi.authMissing'));
      }
      let provider = '';
      new Setting(body).setName(t('settings.pi.oauthProvider')).addDropdown(dropdown => {
        dropdown.addOption('', t('settings.pi.selectProvider'));
        for (const item of (result.oauthProviders ?? []) as Array<{ id: string; name: string }>) dropdown.addOption(item.id, item.name);
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
    for (const line of lines) block.createDiv({ cls: 'opencodian-pi-mcp-status-line', text: sanitizeDiagnosticReport(line, { urlPolicy: 'strict' }) });
    if (snapshot.message) block.createDiv({ cls: 'opencodian-pi-mcp-status-message', text: sanitizeDiagnosticReport(snapshot.message, { urlPolicy: 'strict' }) });
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
}
