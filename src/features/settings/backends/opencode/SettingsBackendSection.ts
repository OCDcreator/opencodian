/* eslint-disable max-lines -- Backend management plus the OpenCode 2 workspace live in this owner to avoid a new settings SCC member. */
import { Notice, Setting } from 'obsidian';

import { IMPLEMENTED_AGENT_BACKENDS } from '../../../../core/agents/backend';
import { backendSessionCatalogFailure } from '../../../../core/agents/backend/AgentBackendRouting';
import type { DshAdapter } from '../../../../core/agents/backend/dsh/DshAdapter';
import { validateDshMcpServers } from '../../../../core/agents/backend/dsh/DshProtocolCodec';
import type { OpenCodianSettings } from '../../../../core/types';
import type { AgentBackendKind } from '../../../../core/types/chat';
import { t, type TranslationKey } from '../../../../i18n';
import type OpenCodianPlugin from '../../../../main';
import { SettingsInlineEditSection } from '../../general/SettingsInlineEditSection';
import { SettingsDshSection } from '../dsh/SettingsDshSection';

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
  { id: 'dsh', labelKey: 'settings.agent.name.dsh', descriptionKey: 'settings.agent.dsh.desc' },
];

export const BACKEND_OPTIONS = ALL_BACKEND_OPTIONS.filter(
  (option): option is (typeof ALL_BACKEND_OPTIONS)[number] =>
    IMPLEMENTED_AGENT_BACKENDS.includes(option.id),
);

/**
 * Fixed catalog-failure classification shared by the backend management and
 * OpenCode 2 workspace. Never echoes the raw error text (which may contain
 * credentials or host paths) into the settings surface.
 */
export function getSettingsCatalogFailureMessage(error: unknown): string {
  const failure = backendSessionCatalogFailure(error);
  return t(failure.errorReason === 'Permission denied'
    ? 'chat.backendSessions.catalogPermissionDenied'
    : failure.status === 'unavailable'
      ? 'chat.backendSessions.catalogUnavailable'
      : 'chat.backendSessions.catalogFailed');
}

/**
 * Compose the DSH workspace host inside the backend settings owner so the
 * settings shell does not import DSH runtime protocols directly.
 */
export function createSettingsDshSection(plugin: OpenCodianPlugin): SettingsDshSection {
  return new SettingsDshSection({
    getSettings: () => plugin.settings.backendSettings.dsh,
    isEnabled: () => true,
    getAdapter: () => plugin.agentServiceRegistry?.get('dsh') as DshAdapter | undefined,
    validateMcpServers: validateDshMcpServers,
    saveSettings: () => plugin.saveSettings(),
    modelOverridesHost: plugin,
  });
}

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
              this.plugin.settings.activeBackend = value as AgentBackendKind;
              // Sync registry active backend
              this.plugin.agentServiceRegistry?.setActive(value as AgentBackendKind);
              await this.plugin.saveSettings();

              // Keep other enabled adapters available to their existing conversation tabs.
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

    // Start only the active backend; disabling owns teardown even after the default changed.
    try {
      if (isActive || !enabled) {
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

type OpenCode2Answer = Record<string, string | number | boolean | readonly string[]>;
interface OpenCode2IntegrationMethod {
  type: string;
  id: string;
  label?: string;
  form?: unknown;
  names?: readonly string[];
}
interface OpenCode2IntegrationConnection {
  type: string;
  id: string;
  label: string;
  method?: string;
}
interface OpenCode2Integration {
  id: string;
  name: string;
  methods: OpenCode2IntegrationMethod[];
  connections: OpenCode2IntegrationConnection[];
}
interface OpenCode2CatalogEntry { name?: string; id?: string }
interface OpenCode2Catalog {
  mcp: Array<{ name: string; status: { status: string } }>;
  integrations: OpenCode2Integration[];
  agents: OpenCode2CatalogEntry[];
  commands: OpenCode2CatalogEntry[];
  skills: OpenCode2CatalogEntry[];
  plugins: OpenCode2CatalogEntry[];
}
interface OpenCode2AdapterPort {
  validateConfigContent?(content: string): Promise<void>;
  readConfigurationSummary(): Promise<{
    version: string; providers: number; models: number; agents: number;
    skills: number; commands: number; mcp: number;
  }>;
  readManagementCatalog(): Promise<OpenCode2Catalog>;
  setMcpConnection(server: string, connected: boolean): Promise<void>;
  connectIntegrationKey(integrationId: string, key: string, answer?: OpenCode2Answer): Promise<void>;
  beginIntegrationOAuth(
    integrationId: string,
    methodId: string,
    answer?: OpenCode2Answer,
  ): Promise<{ url: string; instructions: string; mode: string; attemptID: string }>;
  finishIntegrationOAuth(
    integrationId: string,
    attemptId: string,
    code?: string,
  ): Promise<void>;
  readIntegrationOAuth(integrationId: string, attemptId: string): Promise<{ status: string }>;
  cancelIntegrationOAuth(integrationId: string, attemptId: string): Promise<void>;
  manageCredential(credentialId: string, action: 'activate' | 'remove'): Promise<void>;
}

export interface SettingsOpenCode2Host {
  settings: Pick<OpenCodianSettings, 'backendSettings' | 'inlineEditModelOverrides' | 'inlineCompletionModelOverrides'>;
  saveSettings(): Promise<unknown>;
  agentServiceRegistry?: { get(kind: 'opencode2'): unknown };
}

interface SettingsOpenCode2SectionOptions {
  plugin: SettingsOpenCode2Host;
  requestDisplayRefresh: () => void;
  /** Shared title-generation controls for the real OpenCode 2 consumers. */
  renderTitleSettings: (containerEl: HTMLElement) => void;
}

const OPENCODE2_TABS: readonly { id: string; labelKey: TranslationKey }[] = [
  { id: 'connection', labelKey: 'settings.opencode2.tab.connection' },
  { id: 'model', labelKey: 'settings.opencode2.tab.model' },
  { id: 'auth', labelKey: 'settings.opencode2.tab.auth' },
  { id: 'mcp', labelKey: 'settings.opencode2.tab.mcp' },
  { id: 'resources', labelKey: 'settings.opencode2.tab.resources' },
];

/**
 * OpenCode 2 workspace: connection/config, title and inline models, provider
 * authentication, MCP connections and native runtime catalogs.
 *
 * The section reads/writes only `backendSettings.opencode2` and the shared
 * title/inline-override fields consumed by the OpenCode 2 adapter. It never
 * presents the retired OpenCode 1 protocol or configuration as OpenCode 2.
 */
export class SettingsOpenCode2Section {
  private readonly plugin: SettingsOpenCode2Host;
  private readonly requestDisplayRefresh: () => void;
  private readonly renderTitleSettings: (containerEl: HTMLElement) => void;
  private catalog: OpenCode2Catalog | null = null;
  private catalogStatus = '';

  constructor(options: SettingsOpenCode2SectionOptions) {
    this.plugin = options.plugin;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
    this.renderTitleSettings = options.renderTitleSettings;
  }

  attach(containerEl: HTMLElement): void {
    for (const tab of OPENCODE2_TABS) {
      this.renderTab(containerEl, tab.id, { showSubheading: true });
    }
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const tab = OPENCODE2_TABS.find((candidate) => candidate.id === secondaryTabId)?.id
      ?? OPENCODE2_TABS[0].id;
    this.renderTab(containerEl, tab, { showSubheading: false });
  }

  private renderTab(
    containerEl: HTMLElement,
    tabId: string,
    options: { showSubheading: boolean },
  ): void {
    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-opencode2-settings',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': `opencode2-${tabId}`,
      },
    });
    if (options.showSubheading) {
      blockEl.createEl('h3', {
        cls: 'opencodian-settings-subheading',
        text: t(OPENCODE2_TABS.find((candidate) => candidate.id === tabId)?.labelKey
          ?? 'settings.opencode2.tab.connection'),
      });
    }
    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    if (tabId === 'connection') {
      this.renderConnection(bodyEl);
      return;
    }
    if (tabId === 'model') {
      this.renderModel(bodyEl);
      return;
    }
    this.renderCatalogTab(bodyEl, tabId as 'auth' | 'mcp' | 'resources');
  }

  private renderConnection(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.backendSettings.opencode2;
    const group = containerEl.createDiv({ cls: 'opencodian-backend-agent-group' });
    group.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.agent.opencode2.connection'),
    });
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
      config.addButton((button) => button
        .setButtonText(t('settings.agent.opencode2.config.apply'))
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const adapter = this.getAdapter();
            if (!adapter?.validateConfigContent) throw new Error('OpenCode 2 adapter unavailable');
            await adapter.validateConfigContent(draft);
            await this.plugin.saveSettings();
            new Notice(t('settings.agent.opencode2.config.verified'));
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
          } finally {
            button.setDisabled(false);
          }
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
  }

  private renderModel(containerEl: HTMLElement): void {
    const group = containerEl.createDiv({ cls: 'opencodian-backend-agent-group' });
    group.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.opencode2.model.title'),
    });
    group.createDiv({
      cls: 'setting-item-description',
      text: t('settings.opencode2.model.desc'),
    });
    this.renderTitleSettings(group);
    SettingsInlineEditSection.renderBackendModelOverrides(
      group,
      'opencode2' as AgentBackendKind,
      this.plugin,
    );
  }

  private renderCatalogTab(
    containerEl: HTMLElement,
    tabId: 'auth' | 'mcp' | 'resources',
  ): void {
    const titleKey: TranslationKey = tabId === 'auth'
      ? 'settings.agent.opencode2.integrations'
      : tabId === 'mcp'
        ? 'settings.agent.opencode2.mcp'
        : 'settings.agent.opencode2.catalog';
    containerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t(titleKey),
    });
    const statusEl = containerEl.createDiv({
      cls: 'setting-item-description',
      attr: { role: 'status', 'aria-live': 'polite' },
    });
    if (this.catalogStatus) statusEl.setText(this.catalogStatus);
    const contentEl = containerEl.createDiv();
    if (this.catalog) this.renderCatalogContent(contentEl, tabId, this.catalog);

    new Setting(containerEl)
      .setName(t('settings.agent.opencode2.catalog.refresh'))
      .addButton((button) => button
        .setButtonText(t('settings.agent.opencode2.catalog.refresh'))
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const adapter = this.getAdapter();
            if (!adapter) throw new Error('OpenCode 2 adapter unavailable');
            const summary = await adapter.readConfigurationSummary();
            this.catalog = await adapter.readManagementCatalog();
            this.catalogStatus = t('settings.agent.opencode2.catalog.summary', {
              version: summary.version,
              providers: summary.providers,
              models: summary.models,
              agents: summary.agents,
              skills: summary.skills,
              commands: summary.commands,
              mcp: summary.mcp,
            });
            statusEl.setAttribute('data-catalog-state', 'complete');
            statusEl.setText(this.catalogStatus);
            contentEl.empty();
            this.renderCatalogContent(contentEl, tabId, this.catalog);
          } catch (error) {
            statusEl.setAttribute('data-catalog-state', 'failed');
            statusEl.setText(getSettingsCatalogFailureMessage(error));
          } finally {
            button.setDisabled(false);
          }
        }));
  }

  private renderCatalogContent(
    containerEl: HTMLElement,
    tabId: 'auth' | 'mcp' | 'resources',
    catalog: OpenCode2Catalog,
  ): void {
    if (tabId === 'mcp') {
      this.renderMcpCatalog(containerEl, catalog);
      return;
    }
    if (tabId === 'auth') {
      this.renderAuthCatalog(containerEl, catalog);
      return;
    }
    this.renderResourcesCatalog(containerEl, catalog);
  }

  private renderMcpCatalog(containerEl: HTMLElement, catalog: OpenCode2Catalog): void {
    const adapter = this.getAdapter();
    for (const server of catalog.mcp) {
      new Setting(containerEl)
        .setName(server.name)
        .setDesc(server.status.status)
        .addButton((button) => button
          .setButtonText(t(server.status.status === 'connected'
            ? 'settings.agent.opencode2.disconnect'
            : 'settings.agent.opencode2.connect'))
          .onClick(async () => {
            if (!adapter) return;
            try {
              await adapter.setMcpConnection(server.name, server.status.status !== 'connected');
              this.catalog = await adapter.readManagementCatalog();
              containerEl.empty();
              this.renderMcpCatalog(containerEl, this.catalog);
            } catch (error) {
              new Notice(error instanceof Error ? error.message : String(error));
            }
          }));
    }
  }

  private renderAuthCatalog(containerEl: HTMLElement, catalog: OpenCode2Catalog): void {
    const adapter = this.getAdapter();
    if (!adapter) return;
    const run = async (action: () => Promise<void>) => {
      try {
        await action();
        this.catalog = await adapter.readManagementCatalog();
        containerEl.empty();
        this.renderAuthCatalog(containerEl, this.catalog);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    };
    for (const integration of catalog.integrations) {
      const group = containerEl.createDiv({ cls: 'opencodian-backend-agent-group' });
      group.createEl('h5', { text: integration.name });
      let answer: OpenCode2Answer | undefined;
      let answerError = '';
      const formMethods = integration.methods.filter((method) => 'form' in method && method.form);
      if (formMethods.length) {
        new Setting(group)
          .setName(t('settings.agent.opencode2.auth.answers'))
          .setDesc(JSON.stringify(formMethods.map((method) => 'form' in method ? method.form : undefined)))
          .addTextArea((input) => input.setPlaceholder('{}').onChange((value) => {
            try {
              const parsed: unknown = value.trim() ? JSON.parse(value) : undefined;
              if (parsed && (typeof parsed !== 'object' || Array.isArray(parsed))) {
                throw new Error('Expected a JSON object');
              }
              answer = parsed as typeof answer;
              answerError = '';
            } catch (error) {
              answer = undefined;
              answerError = error instanceof Error ? error.message : String(error);
            }
          }));
      }
      for (const method of integration.methods) {
        if (method.type === 'key') {
          let key = '';
          new Setting(group)
            .setName(method.label ?? t('settings.agent.opencode2.auth.key'))
            .addText((input) => {
              input.inputEl.type = 'password';
              input.onChange((value) => { key = value; });
            })
            .addButton((button) => button
              .setButtonText(t('settings.agent.opencode2.connect'))
              .onClick(() => run(async () => {
                if (!key.trim()) throw new Error(t('settings.agent.opencode2.auth.keyRequired'));
                if (answerError) throw new Error(answerError);
                await adapter.connectIntegrationKey(integration.id, key, answer);
                key = '';
              })));
        } else if (method.type === 'oauth') {
          const details = group.createDiv();
          new Setting(group)
            .setName(method.label ?? method.id)
            .addButton((button) => button
              .setButtonText(t('settings.agent.opencode2.connect'))
              .onClick(async () => {
                try {
                  if (answerError) throw new Error(answerError);
                  const attempt = await adapter.beginIntegrationOAuth(integration.id, method.id, answer);
                  details.empty();
                  details.createEl('a', {
                    text: t('settings.agent.opencode2.auth.open'),
                    href: attempt.url,
                  }).setAttr('target', '_blank');
                  details.createEl('p', { text: attempt.instructions });
                  let code = '';
                  const row = new Setting(details).setName(t('settings.agent.opencode2.auth.status'));
                  if (attempt.mode === 'code') {
                    row.addText((input) => input.onChange((value) => { code = value; }));
                  }
                  row.addButton((control) => control
                    .setButtonText(t('settings.agent.opencode2.auth.complete'))
                    .onClick(() => run(() => adapter.finishIntegrationOAuth(
                      integration.id,
                      attempt.attemptID,
                      code || undefined,
                    ))));
                  row.addButton((control) => control
                    .setButtonText(t('settings.agent.opencode2.auth.check'))
                    .onClick(async () => {
                      try {
                        row.setDesc((await adapter.readIntegrationOAuth(
                          integration.id,
                          attempt.attemptID,
                        )).status);
                      } catch (error) {
                        new Notice(error instanceof Error ? error.message : String(error));
                      }
                    }));
                  row.addButton((control) => control
                    .setButtonText(t('settings.agent.opencode2.auth.cancel'))
                    .onClick(() => run(() => adapter.cancelIntegrationOAuth(
                      integration.id,
                      attempt.attemptID,
                    ))));
                } catch (error) {
                  new Notice(error instanceof Error ? error.message : String(error));
                }
              }));
        } else if (method.type === 'env') {
          group.createEl('p', {
            text: `${t('settings.agent.opencode2.auth.env')}: ${method.names?.join(', ') ?? ''}`,
          });
        }
      }
      for (const connection of integration.connections) {
        if (connection.type !== 'credential') continue;
        new Setting(group)
          .setName(connection.label)
          .setDesc(connection.method ?? '')
          .addButton((button) => button
            .setButtonText(t('settings.agent.opencode2.auth.activate'))
            .onClick(() => run(() => adapter.manageCredential(connection.id, 'activate'))))
          .addButton((button) => button
            .setButtonText(t('settings.agent.opencode2.auth.remove'))
            .onClick(() => run(() => adapter.manageCredential(connection.id, 'remove'))));
      }
    }
  }

  private renderResourcesCatalog(containerEl: HTMLElement, catalog: OpenCode2Catalog): void {
    const groups: Array<[string, ReadonlyArray<{ name?: string; id?: string }>]> = [
      ['agents', catalog.agents],
      ['commands', catalog.commands],
      ['skills', catalog.skills],
      ['plugins', catalog.plugins],
    ];
    for (const [label, entries] of groups) {
      const details = containerEl.createEl('details');
      details.createEl('summary', { text: `${label} (${entries.length})` });
      details.createEl('p', {
        text: entries
          .map((entry) => entry.name ?? entry.id ?? '')
          .filter(Boolean)
          .join(', '),
      });
    }
  }

  private getAdapter(): OpenCode2AdapterPort | undefined {
    return this.plugin.agentServiceRegistry?.get('opencode2') as OpenCode2AdapterPort | undefined;
  }
}
