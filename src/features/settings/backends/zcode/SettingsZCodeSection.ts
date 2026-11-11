import * as nodeOs from 'node:os';

import { Setting } from 'obsidian';

import type { FileRevision } from '../../../../core/agents/backend/configuration/ProjectResourceSecureWrite';
import type { ZCodeAdapter, ZCodeAdapterRuntimeDiagnostics, ZCodeManagementCatalog, ZCodeManagementMutationResult } from '../../../../core/agents/backend/zcode';
import type { ZCodeWorkspaceCatalogOptions } from '../../../../core/agents/backend/zcode/ZCodeModelCatalog';
import { normalizeZCodeBackendSettings, type ZCodeBackendSettings } from '../../../../core/types/settings';
import { t } from '../../../../i18n';
import { addBackendChoiceSetting, describeBackendSetting } from '../../controls/BackendSettingsControls';
import { SettingsZCodeAccounts, type ZCodeAccountsBackend, zcodeSettingsError } from './SettingsZCodeAccounts';
import { SettingsZCodeModelControls, type ZCodeModelSettingsHost, type ZCodeSettingsModelCatalog } from './SettingsZCodeModelControls';

/** Minimal host surface; keeps this section testable without the full plugin type. */
export interface SettingsZCodeHost extends ZCodeModelSettingsHost {
  agentServiceRegistry?: {
    get(kind: 'zcode'): {
      start(): Promise<void>;
      stop(): Promise<void>;
      getRuntimeDiagnostics?(): ZCodeAdapterRuntimeDiagnostics;
      getWorkspaceModelCatalog?(options?: ZCodeWorkspaceCatalogOptions): Promise<ZCodeSettingsModelCatalog>;
      accounts?: ZCodeAccountsBackend['accounts'];
      getPersonalConfigService?: ZCodeAccountsBackend['getPersonalConfigService'];
      refreshConfiguration?: ZCodeAccountsBackend['refreshConfiguration'];
      reconnectFromSettings?(): Promise<boolean>;
      getManagementCatalog?(): Promise<ZCodeManagementCatalog | null>;
      setManagedPluginEnabled?(pluginId: string, enabled: boolean, expectedRevision: FileRevision | null): Promise<ZCodeManagementMutationResult>;
    } | undefined;
  };
  invalidateSlashCommandCatalog?(): void;
}

/** Config and entry paths are shown for orientation; the home prefix is the noisy part. */
function shortenPath(filePath: string): string {
  const home = nodeOs.homedir();
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedHome = home.replace(/\\/g, '/');
  return normalized.startsWith(`${normalizedHome}/`) ? `~/${normalized.slice(normalizedHome.length + 1)}` : filePath;
}

/**
 * Task subtabs; legacy ids (model/management/connection) keep resolving through
 * {@link SettingsZCodeSection.attachTabbed} and the shared legacy tab map.
 */
const ZCODE_TABS = ['installation', 'chat', 'providers', 'account', 'tools', 'permissions-safety', 'resources', 'diagnostics'] as const;
type ZCodeSettingsTab = (typeof ZCODE_TABS)[number];
const ZCODE_TAB_LABEL_KEYS: Record<ZCodeSettingsTab, Parameters<typeof t>[0]> = {
  installation: 'settings.zcode.ui.installation',
  chat: 'settings.zcode.ui.chat',
  providers: 'settings.zcode.tab.providers',
  account: 'settings.zcode.tab.account',
  tools: 'settings.zcode.ui.tools',
  'permissions-safety': 'settings.zcode.tab.permissionsSafety',
  resources: 'settings.zcode.tab.resources',
  diagnostics: 'settings.backend.tabs.debug',
};

/** Parent supplies locale entries; keep the surface usable until that handoff lands. */
function managementText(key: string, fallback: string): string {
  const translated = t(key as Parameters<typeof t>[0]);
  return translated === key ? fallback : translated;
}

/**
 * Owns the ZCode settings surface: installation, chat defaults, shared API
 * services, isolated official login, tools, permissions, read-only resources
 * and diagnostics. Native session and runtime state stay in the adapter.
 */
export class SettingsZCodeSection {
  constructor(private readonly host: SettingsZCodeHost, private readonly openCompletionSettings: () => void = () => {}) {}

  attach(container: HTMLElement): void {
    container.createEl('h2', { text: t('settings.zcode.title') });
    for (const tab of ZCODE_TABS) this.renderTab(container, tab);
  }

  attachTabbed(container: HTMLElement, requested: string): void {
    const mapped = ({ connection: 'installation', model: 'chat', management: 'tools' } as Record<string, string>)[requested] ?? requested;
    const tab = ZCODE_TABS.includes(mapped as ZCodeSettingsTab) ? mapped as ZCodeSettingsTab : 'chat';
    this.renderTab(container, tab, false);
  }

  private renderTab(
    container: HTMLElement,
    tab: ZCodeSettingsTab,
    showSubheading = true,
  ): void {
    // Append-only: the shared backend workspace bar may already live in the
    // container; this section never empties or reorders host content.
    const section = container.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-zcode-settings',
      attr: { 'data-settings-surface': 'section', 'data-settings-target': `zcode-${tab}` },
    });
    if (showSubheading) {
      section.createEl('h3', { text: t(ZCODE_TAB_LABEL_KEYS[tab]) });
    }
    const body = section.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });
    if (tab === 'installation') {
      this.renderConnection(body);
    } else if (tab === 'chat') {
      this.renderModel(body);
    } else if (tab === 'permissions-safety') {
      this.renderPermissions(body);
    } else if (tab === 'account') {
      this.renderAccount(body);
    } else if (tab === 'providers') {
      this.renderProviders(body);
    } else if (tab === 'resources') {
      this.attachResources(body, !showSubheading);
    } else if (tab === 'diagnostics') {
      this.renderDiagnosticsTab(body);
    } else {
      this.attachManagement(body);
    }
  }

  private renderConnection(body: HTMLElement): void {
    body.createEl('p', { text: t('settings.zcode.ui.installHelp'), cls: 'setting-item-description' });
    const diagnostics = this.adapter?.getRuntimeDiagnostics?.();
    const summary = body.createDiv({ cls: 'opencodian-zcode-connection-summary', attr: { role: 'status', 'data-zcode-group': 'connection' } });
    const syncSummary = () => {
      const current = this.adapter?.getRuntimeDiagnostics?.();
      const resolution = current?.resolution;
      summary.setText(t(resolution?.mode === 'missing' ? resolution.reason === 'configured-path-not-found' ? 'settings.zcode.ui.configuredMissing' : 'settings.zcode.ui.installMissing'
        : resolution?.mode === 'incompatible' ? 'settings.zcode.ui.installIncompatible'
          : current?.handshake === 'ready' ? 'settings.zcode.ui.connectionReady' : current?.handshake === 'failed' ? 'settings.zcode.ui.connectionFailed' : 'settings.zcode.ui.connectionIdle'));
    };
    syncSummary();
    const feedback = body.createDiv({ cls: 'opencodian-zcode-feedback', attr: { role: 'status' } });
    new Setting(body).setName(t('settings.zcode.ui.reconnect')).setDesc(t('settings.zcode.ui.reconnectHelp')).addButton((button) => {
      button.setButtonText(t('settings.zcode.ui.reconnect')).setDisabled(!this.adapter).onClick(async () => {
        button.setDisabled(true);
        try {
          const adapter = this.adapter;
          if (adapter?.reconnectFromSettings) {
            if (!await adapter.reconnectFromSettings()) { feedback.setText(t('settings.zcode.ui.reconnectBusy')); return; }
          } else if (adapter) { await adapter.stop(); await adapter.start(); }
          this.host.invalidateSlashCommandCatalog?.();
          feedback.setText('');
        } catch (error) { feedback.setText(zcodeSettingsError(error)); }
        finally { if (body.isConnected) { syncSummary(); button.setDisabled(!this.adapter); } }
      });
    });
    const location = body.createEl('details', { cls: 'opencodian-zcode-disclosure', attr: { 'data-zcode-group': 'installation-location' } });
    location.open = !!diagnostics?.resolution && diagnostics.resolution.mode !== 'ready';
    location.createEl('summary', { text: t('settings.zcode.ui.location') });
    const locationBody = location.createDiv({ cls: 'opencodian-zcode-disclosure-body' });

    // Initial values are a render snapshot; change handlers merge the latest host state.
    const settings = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
    const executableSetting = new Setting(locationBody)
      .setName(t('settings.zcode.executable'))
      .setDesc(t('settings.zcode.ui.locationHelp'));
    describeBackendSetting(executableSetting, {
      key: 'zcode-executable-path',
      scope: 'vault',
      effect: 'new-session',
      risk: 'medium',
      defaultLabel: t('settings.zcode.executable.auto'),
      source: t('settings.zcode.status.discoverySource'),
    });
    executableSetting.addText((text) => {
      text
        .setPlaceholder(t('settings.zcode.executable.auto'))
        .setValue(settings.executablePath)
        .onChange(async (value) => {
          const previous = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode).executablePath;
          this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({
            ...normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode),
            executablePath: value,
          });
          try { await this.host.saveSettings(); feedback.setText(t('settings.zcode.ui.reconnectNeeded')); }
          catch {
            const current = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
            if (current.executablePath === value.trim()) this.host.settings.backendSettings.zcode = { ...current, executablePath: previous };
            text.setValue(previous); feedback.setText(t('settings.zcode.ui.saveFailed'));
          }
        });
      text.inputEl.setAttribute('aria-label', t('settings.zcode.executable'));
    });
  }

  private renderModel(body: HTMLElement): void {
    const unavailableHint = body.createDiv({
      cls: 'opencodian-zcode-feedback',
      attr: { role: 'status', 'data-zcode-group': 'catalog-unavailable' },
    });
    const controls = new SettingsZCodeModelControls(this.host, {
      getCatalog: async (options) => {
        const adapter = this.adapter;
        if (!adapter?.getWorkspaceModelCatalog) throw new Error('zcode-models-unavailable');
        return adapter.getWorkspaceModelCatalog(options);
      },
      // Chat and account/model services are separate tabs now; point at them
      // honestly instead of pretending to reveal hidden controls.
      onCatalogUnavailable: () => {
        if (unavailableHint.isConnected) unavailableHint.setText(t('settings.zcode.ui.catalogUnavailableHint'));
      },
      openCompletionSettings: this.openCompletionSettings,
    });
    controls.attach(body);
  }

  /**
   * Permission mode lives on its own high-risk page, physically separate from
   * the ordinary chat defaults. The persisted default is applied once at
   * session materialization; live conversations switch through setSessionMode.
   */
  private renderPermissions(body: HTMLElement): void {
    body.createEl('p', { text: t('settings.zcode.permissions.help'), cls: 'setting-item-description' });
    const settings = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
    const stack = body.createDiv({ cls: 'opencodian-settings-form-stack' });
    addBackendChoiceSetting(stack, {
      key: 'zcode-default-mode',
      name: t('settings.zcode.ui.mode'),
      description: t('settings.zcode.permissions.modeHelp'),
      value: settings.mode,
      options: [
        { value: '', label: t('settings.zcode.ui.inherit'), description: t('settings.zcode.permissions.inheritHelp'), recommended: true },
        { value: 'plan', label: t('settings.zcode.ui.mode.plan'), description: t('settings.zcode.ui.mode.planHelp') },
        { value: 'build', label: t('settings.zcode.ui.mode.build'), description: t('settings.zcode.ui.mode.buildHelp') },
        { value: 'edit', label: t('settings.zcode.ui.mode.edit'), description: t('settings.zcode.ui.mode.editHelp') },
        { value: 'yolo', label: t('settings.zcode.ui.mode.yolo'), description: t('settings.zcode.ui.mode.yoloHelp') },
      ],
      onChange: async (value) => {
        if (!await this.saveBackendField('mode', value)) throw new Error('zcode-mode-save-failed');
      },
      presentation: {
        key: 'zcode-default-mode',
        scope: 'vault',
        effect: 'new-session',
        risk: 'high',
        defaultLabel: t('settings.zcode.ui.inherit'),
        source: t('settings.zcode.permissions.source'),
      },
    });
    const notes = body.createDiv({ cls: 'opencodian-zcode-supporting', attr: { 'data-zcode-group': 'permissions-notes' } });
    notes.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.permissions.timingHelp') });
    notes.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.permissions.planQuirk') });
    notes.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.permissions.notSandboxHelp') });
  }

  private renderAccount(body: HTMLElement): void {
    const accounts = this.createAccounts();
    if (!accounts) {
      body.createEl('p', { text: t('settings.zcode.ui.connectionIdle'), cls: 'setting-item-description' });
      return;
    }
    accounts.attachAccount(body);
  }

  private renderProviders(body: HTMLElement): void {
    const accounts = this.createAccounts();
    if (!accounts) {
      body.createEl('p', { text: t('settings.zcode.ui.connectionIdle'), cls: 'setting-item-description' });
      return;
    }
    accounts.attachProviders(body);
    void accounts.loadProvidersForExternalCaller();
  }

  private createAccounts(): SettingsZCodeAccounts | undefined {
    const adapter = this.adapter;
    const backend = adapter?.accounts && adapter.getPersonalConfigService && adapter.refreshConfiguration ? {
      accounts: adapter.accounts, getPersonalConfigService: () => adapter.getPersonalConfigService!(),
      refreshConfiguration: () => adapter.refreshConfiguration!(),
    } : undefined;
    if (!backend) return undefined;
    return new SettingsZCodeAccounts(backend, async () => { this.host.invalidateSlashCommandCatalog?.(); });
  }

  private attachResources(body: HTMLElement, loadImmediately: boolean): void {
    const container = body.createDiv({ attr: { 'data-zcode-resources': 'workspace' } });
    container.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.resources.help') });
    const outcome = container.createDiv({ cls: 'opencodian-zcode-feedback', attr: { role: 'status' } });
    const catalogEl = container.createDiv({ cls: 'opencodian-settings-form-stack' });
    let refreshEpoch = 0;
    let refreshButton: { setDisabled(value: boolean): unknown } | undefined;
    const refresh = async (): Promise<void> => {
      refreshButton?.setDisabled(true);
      outcome.setText(t('settings.zcode.ui.toolsLoading'));
      const epoch = ++refreshEpoch;
      try {
        await this.adapter?.start();
        const snapshot = await this.adapter?.getManagementCatalog?.() ?? null;
        if (epoch === refreshEpoch && container.isConnected) {
          this.renderResources(catalogEl, snapshot);
          outcome.setText('');
        }
      } catch {
        if (epoch === refreshEpoch && container.isConnected) outcome.setText(t('settings.zcode.ui.toolsFailed'));
      } finally { refreshButton?.setDisabled(!this.adapter); }
    };
    const refreshRow = new Setting(container).setName(t('settings.zcode.resources.refresh'));
    describeBackendSetting(refreshRow, {
      key: 'zcode-resources-refresh',
      scope: 'project',
      effect: 'immediate',
      risk: 'low',
      source: t('settings.zcode.resources.source'),
    });
    refreshRow.addButton(button => {
      refreshButton = button;
      button.setButtonText(t('settings.zcode.resources.refresh')).setDisabled(!this.adapter).onClick(() => { void refresh(); });
    });
    if (loadImmediately) void refresh();
  }

  private renderResources(container: HTMLElement, catalog: ZCodeManagementCatalog | null): void {
    container.empty();
    if (!catalog) {
      this.addStateRow(container, t('settings.zcode.tab.resources'), managementText('settings.zcode.management.unavailable', 'Unavailable for this runtime or workspace.'));
      return;
    }
    this.addStateRow(container, managementText('settings.zcode.management.declarations', 'Workspace declarations'),
      catalog.configuration.state === 'available'
        ? t('settings.zcode.management.declarationCounts', {
            path: shortenPath(catalog.configuration.targetPath), plugins: catalog.configuration.pluginOverrideCount ?? '?',
            mcp: catalog.configuration.mcpDeclarationCount ?? '?', hooks: catalog.configuration.hookDeclarationCount ?? '?',
          })
        : managementText('settings.zcode.management.failed', 'Readback failed; effective values are unknown.'));
    container.createEl('h4', { text: t('settings.zcode.ui.plugins') });
    if (!catalog.plugins.entries?.length) {
      container.createEl('p', { cls: 'setting-item-description', text: catalog.plugins.state === 'available' ? t('settings.zcode.ui.noPlugins') : managementText(`settings.zcode.management.${catalog.plugins.state}`, catalog.plugins.state) });
    }
    for (const plugin of catalog.plugins.entries ?? []) {
      new Setting(container).setName(plugin.id).setDesc(t('settings.zcode.management.pluginDetails', {
        source: managementText(`settings.zcode.management.sourceValue.${plugin.enabledSource ?? 'unknown'}`, plugin.enabledSource ?? 'unknown'),
        mcp: plugin.mcpCount ?? '?', hooks: plugin.hookCount ?? '?',
        missing: plugin.packageMissing ? t('settings.zcode.management.packageMissing') : '',
      }));
    }
    container.createEl('h4', { text: t('settings.zcode.ui.externalTools') });
    if (!catalog.mcp.entries?.length) {
      container.createEl('p', { cls: 'setting-item-description', text: catalog.mcp.state === 'available' ? t('settings.zcode.ui.noMcp') : managementText(`settings.zcode.management.${catalog.mcp.state}`, catalog.mcp.state) });
    }
    for (const server of catalog.mcp.entries ?? []) {
      this.addStateRow(container, server.id, t('settings.zcode.management.mcpDetails', {
        status: managementText(`settings.zcode.management.mcpStatus.${server.status}`, server.status),
        tools: server.toolCount ?? '?',
        authentication: managementText(`settings.zcode.management.authValue.${server.authentication}`, server.authentication),
      }));
    }
    this.addStateRow(container, managementText('settings.zcode.management.hooks', 'Effective hooks'), managementText('settings.zcode.management.hooksUnavailable', 'Unavailable: this protocol has no independent hook configuration readback. Declaration counts do not prove execution.'));
    this.addStateRow(container, managementText('settings.zcode.management.mutations', 'MCP and hook changes'), managementText('settings.zcode.management.mutationsUnavailable', 'Unavailable: this runtime has no supported management mutation contract.'));
  }

  private renderDiagnosticsTab(body: HTMLElement): void {
    body.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.diagnostics.help') });
    const status = body.createDiv({ cls: 'opencodian-zcode-config-status', attr: { 'data-zcode-group': 'diagnostics' } });
    this.renderDiagnostics(status);
    const refresh = new Setting(body).setName(t('settings.zcode.diagnostics.refresh'));
    describeBackendSetting(refresh, {
      key: 'zcode-diagnostics-refresh',
      scope: 'global',
      effect: 'immediate',
      risk: 'low',
      source: t('settings.zcode.diagnostics.source'),
    });
    refresh.addButton(button => button.setButtonText(t('settings.zcode.diagnostics.refresh')).onClick(() => this.renderDiagnostics(status)));
  }

  private attachManagement(body: HTMLElement): void {
    const container = body.createDiv({ attr: { 'data-settings-target': 'zcode-management' } });
    container.createEl('h3', { text: t('settings.zcode.ui.tools') });
    container.createEl('p', {
      cls: 'setting-item-description',
      text: t('settings.zcode.ui.toolsHelp'),
    });
    const outcome = container.createDiv({ attr: { role: 'status', 'data-zcode-management': 'outcome' } });
    const catalog = container.createDiv({ attr: { 'data-zcode-management': 'catalog' } });
    let refreshEpoch = 0;
    let refreshing = false;
    let refreshButton: { setDisabled(value: boolean): unknown } | undefined;
    const refresh = async (): Promise<void> => {
      if (refreshing) return;
      refreshing = true;
      refreshButton?.setDisabled(true);
      outcome.setText(t('settings.zcode.ui.toolsLoading'));
      const epoch = ++refreshEpoch;
      try {
        await this.adapter?.start();
        const snapshot = await this.adapter?.getManagementCatalog?.() ?? null;
        if (epoch === refreshEpoch && container.isConnected) { this.renderManagement(catalog, snapshot, outcome, refresh); outcome.setText(''); }
      } catch {
        if (epoch === refreshEpoch && container.isConnected) {
          outcome.setText(t('settings.zcode.ui.toolsFailed'));
        }
      } finally { refreshing = false; refreshButton?.setDisabled(!this.adapter); }
    };
    new Setting(container)
      .setName(t('settings.zcode.ui.refreshTools'))
      .addButton((button) => {
        refreshButton = button;
        button.setButtonText(t('settings.zcode.ui.refreshTools')).setDisabled(!this.adapter).onClick(async () => {
        await refresh();
        });
      });
    // The first load starts immediately, before user input can race it.
    void refresh();
  }

  private renderManagement(container: HTMLElement, catalog: ZCodeManagementCatalog | null, outcome: HTMLElement, refresh: () => Promise<void>): void {
    container.empty();
    if (!catalog) {
      this.addStateRow(container, managementText('settings.zcode.management.title', 'Plugins, MCP and hooks'), managementText('settings.zcode.management.unavailable', 'Unavailable for this runtime or workspace.'));
      return;
    }
    const technical = container.createEl('details', { cls: 'opencodian-zcode-disclosure', attr: { 'data-zcode-group': 'tools-details' } });
    technical.createEl('summary', { text: t('settings.zcode.ui.technical') });
    const details = technical.createDiv({ cls: 'opencodian-zcode-disclosure-body' });
    this.addStateRow(details, managementText('settings.zcode.management.declarations', 'Workspace declarations'),
      catalog.configuration.state === 'available'
        ? t('settings.zcode.management.declarationCounts', {
            path: shortenPath(catalog.configuration.targetPath), plugins: catalog.configuration.pluginOverrideCount ?? '?',
            mcp: catalog.configuration.mcpDeclarationCount ?? '?', hooks: catalog.configuration.hookDeclarationCount ?? '?',
          })
        : managementText('settings.zcode.management.failed', 'Readback failed; effective values are unknown.'));
    container.createEl('h4', { text: t('settings.zcode.ui.plugins'), attr: { 'data-zcode-group': 'plugins' } });
    container.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.pluginsHelp') });
    this.addStateRow(details, managementText('settings.zcode.management.plugins', 'Effective plugin configuration'),
      managementText(`settings.zcode.management.${catalog.plugins.state}`, catalog.plugins.state));
    if (!catalog.plugins.entries?.length) container.createEl('p', { cls: 'setting-item-description', text: catalog.plugins.state === 'available' ? t('settings.zcode.ui.noPlugins') : managementText(`settings.zcode.management.${catalog.plugins.state}`, catalog.plugins.state) });
    const scroll = container.createDiv({ cls: 'opencodian-settings-scrollarea opencodian-zcode-plugin-scrollarea' });
    const viewport = scroll.createDiv({ cls: 'opencodian-settings-scrollarea-viewport', attr: { tabindex: '0', 'aria-label': t('settings.zcode.ui.plugins') } });
    const pluginList = viewport.createDiv({ cls: 'opencodian-settings-scrollarea-content' });
    for (const plugin of catalog.plugins.entries ?? []) {
      new Setting(pluginList)
        .setName(plugin.id)
        .setDesc(t('settings.zcode.management.pluginDetails', {
          source: managementText(`settings.zcode.management.sourceValue.${plugin.enabledSource ?? 'unknown'}`, plugin.enabledSource ?? 'unknown'),
          mcp: plugin.mcpCount ?? '?', hooks: plugin.hookCount ?? '?',
          missing: plugin.packageMissing ? t('settings.zcode.management.packageMissing') : '',
        }))
        .addToggle((toggle) => {
          toggle.setValue(plugin.enabled).setDisabled(catalog.mutation.plugins !== 'available' || catalog.configuration.state !== 'available' || plugin.packageMissing || !this.adapter?.setManagedPluginEnabled);
          toggle.onChange(async (enabled) => {
            toggle.setDisabled(true);
            try {
              const result = await this.adapter?.setManagedPluginEnabled?.(plugin.id, enabled, catalog.configuration.revision);
              if (result?.evidence.persistence === 'verified') this.host.invalidateSlashCommandCatalog?.();
              await refresh();
              outcome.setText(result ? t('settings.zcode.management.outcome', {
                  status: managementText(`settings.zcode.management.result.${result.status}`, result.status),
                  persistence: managementText(`settings.zcode.management.evidence.${result.evidence.persistence}`, result.evidence.persistence),
                  application: managementText(`settings.zcode.management.evidence.${result.evidence.application}`, result.evidence.application),
                  runtime: managementText(`settings.zcode.management.evidence.${result.evidence.runtime}`, result.evidence.runtime),
                })
                : managementText('settings.zcode.management.unavailable', 'Unavailable for this runtime or workspace.'));
            } catch {
              toggle.setValue(plugin.enabled).setDisabled(false);
              outcome.setText(managementText('settings.zcode.management.failed', 'Readback failed; effective values are unknown.'));
            }
          });
        });
    }
    container.createEl('h4', { text: t('settings.zcode.ui.externalTools'), attr: { 'data-zcode-group': 'external-tools' } });
    container.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.mcpHelp') });
    if (!catalog.mcp.entries?.length) container.createEl('p', { cls: 'setting-item-description', text: catalog.mcp.state === 'available' ? t('settings.zcode.ui.noMcp') : managementText(`settings.zcode.management.${catalog.mcp.state}`, catalog.mcp.state) });
    for (const server of catalog.mcp.entries ?? []) {
      this.addStateRow(container, server.id, t('settings.zcode.management.mcpDetails', {
        status: managementText(`settings.zcode.management.mcpStatus.${server.status}`, server.status),
        tools: server.toolCount ?? '?',
        authentication: managementText(`settings.zcode.management.authValue.${server.authentication}`, server.authentication),
      }));
    }
    this.addStateRow(details, managementText('settings.zcode.management.hooks', 'Effective hooks'), managementText('settings.zcode.management.hooksUnavailable', 'Unavailable: this protocol has no independent hook configuration readback. Declaration counts do not prove execution.'));
    this.addStateRow(details, managementText('settings.zcode.management.mutations', 'MCP and hook changes'), managementText('settings.zcode.management.mutationsUnavailable', 'Unavailable: this runtime has no supported management mutation contract.'));
    container.appendChild(technical);
  }

  private get adapter(): ReturnType<NonNullable<SettingsZCodeHost['agentServiceRegistry']>['get']> {
    return this.host.agentServiceRegistry?.get('zcode');
  }

  /** Persist one plugin field; on save failure roll back to the previous value. */
  private async saveBackendField(field: keyof ZCodeBackendSettings, value: string): Promise<boolean> {
    const previous = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
    const next = normalizeZCodeBackendSettings({ ...previous, [field]: value });
    this.host.settings.backendSettings.zcode = next;
    try {
      await this.host.saveSettings();
      return true;
    } catch {
      const current = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
      if (current[field] === next[field]) this.host.settings.backendSettings.zcode = { ...current, [field]: previous[field] };
      return false;
    }
  }

  private renderDiagnostics(status: HTMLElement): void {
    status.empty();
    const diagnostics = this.adapter?.getRuntimeDiagnostics?.() ?? null;

    const resolution = diagnostics?.resolution ?? null;
    if (!resolution) {
      this.addStateRow(status, t('settings.zcode.status.runtime'), t('settings.zcode.status.idleHint'));
    } else if (resolution.mode === 'ready') {
      this.addStateRow(status, t('settings.zcode.status.runtime'), t('settings.zcode.status.runtimeReady', {
        path: shortenPath(resolution.launch.entryPath),
        source: resolution.launch.source,
      }));
    } else if (resolution.mode === 'missing') {
      this.addStateRow(status, t('settings.zcode.status.runtime'), resolution.reason === 'configured-path-not-found'
        ? t('settings.zcode.status.configuredMissing', { path: resolution.configuredPath ?? '' })
        : t('settings.zcode.status.runtimeMissing'));
    } else {
      this.addStateRow(status, t('settings.zcode.status.runtime'), t('settings.zcode.status.runtimeIncompatible', {
        detail: resolution.detail,
      }));
    }

    const providerConfig = diagnostics?.providerConfig ?? null;
    if (providerConfig) {
      const path = shortenPath(providerConfig.configPath);
      const detail = providerConfig.state === 'validated'
        ? (providerConfig.providerCount === null
            ? t('settings.zcode.status.providerValidatedNoCount', { path })
            : t('settings.zcode.status.providerValidated', {
                path,
                count: String(providerConfig.providerCount),
              }))
        : providerConfig.state === 'missing'
          ? t('settings.zcode.status.providerMissing', { path })
          : providerConfig.state === 'unreadable'
            ? t('settings.zcode.status.providerUnreadable', { path })
            : t('settings.zcode.status.providerMalformed', { path });
      this.addStateRow(status, t('settings.zcode.status.providerConfig'), detail);
    }

    const handshake = diagnostics?.handshake ?? 'idle';
    const connectionDetail = handshake === 'ready'
      ? t('settings.zcode.connected')
      : handshake === 'failed'
        ? (diagnostics?.lastError ?? t('settings.zcode.status.handshakeFailed'))
        : handshake === 'connecting'
          ? t('settings.zcode.status.connecting')
          : t('settings.zcode.status.disconnected');
    this.addStateRow(status, t('settings.zcode.status.connection'), connectionDetail);
  }

  private addStateRow(container: HTMLElement, label: string, detail: string): void {
    const row = container.createDiv({ cls: 'opencodian-zcode-config-status-row' });
    row.createSpan({ cls: 'opencodian-zcode-config-status-label', text: label });
    row.createSpan({ cls: 'opencodian-zcode-config-status-detail', text: detail });
  }
}

export type { ZCodeAdapter };
