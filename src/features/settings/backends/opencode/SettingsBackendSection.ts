/* eslint-disable max-lines -- Backend management plus the OpenCode 2 workspace live in this owner to avoid a new settings SCC member. */
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { addIcon, Notice, Setting } from 'obsidian';

import { IMPLEMENTED_AGENT_BACKENDS } from '../../../../core/agents/backend';
import { backendSessionCatalogFailure } from '../../../../core/agents/backend/AgentBackendRouting';
import { type BackendConfigRecoveryStore,backendRecoveryIdentity, createBackendConfigRecoveryStore, recoveryRevision } from '../../../../core/agents/backend/configuration/BackendConfigRecoveryStore';
import type { DshAdapter } from '../../../../core/agents/backend/dsh/DshAdapter';
import { validateDshMcpServers } from '../../../../core/agents/backend/dsh/DshProtocolCodec';
import type { OpenCodianSettings } from '../../../../core/types';
import type { AgentBackendKind } from '../../../../core/types/chat';
import { t, type TranslationKey } from '../../../../i18n';
import type OpenCodianPlugin from '../../../../main';
import { getVaultBasePath } from '../../../../shared/vault';
import { addBackendChoiceSetting, describeBackendSetting } from '../../controls/BackendSettingsControls';
import { SettingsInlineEditSection } from '../../general/SettingsInlineEditSection';
import { SettingsDshSection } from '../dsh/SettingsDshSection';

// Official OpenCode v2 mark, embedded so the settings tab works offline.
addIcon('opencodian-opencode2', '<g transform="translate(17.18 -7.5)" fill="currentColor" stroke="none"><path d="M49.2308 32.8573H16.4103V82.143H49.2308V32.8573ZM65.641 98.5716H0V16.4287H65.641V98.5716Z"/></g>');

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
    vaultPath: plugin.app ? getVaultBasePath(plugin.app) ?? undefined : undefined,
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
  getModelSelectorProviders?(): Promise<ModelProvider[]>;
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
  /** Stable absolute vault base path; scopes recovery snapshots per vault. */
  vaultPath?: string;
  /** Test/fixture seam: redirects the machine-local recovery store. */
  recoveryBaseDir?: string;
}

// Durable machine-local recovery for the secret-bearing saved configContent:
// previous SAVED configurations snapshotted outside the vault at 0700/0600,
// listed as metadata only, restored through the validated apply path.
const OC2_RECOVERY_KEY = 'opencode2-config-content';

interface SettingsOpenCode2SectionOptions {
  plugin: SettingsOpenCode2Host;
  requestDisplayRefresh: () => void;
  /** Shared title-generation controls for the real OpenCode 2 consumers. */
  renderTitleSettings: (containerEl: HTMLElement) => void;
  /** Stable absolute vault base path for machine-local recovery snapshots. */
  vaultPath?: string;
}


type OpenCode2Copy = TranslationKey extends infer Key
  ? Key extends `settings.opencode2.workspace.${infer Name}` ? Name : never : never;
function oc2(key: OpenCode2Copy): string {
  return t(`settings.opencode2.workspace.${key}` as TranslationKey);
}

type OpenCode2Tab = 'connection' | 'model' | 'agents' | 'permissions' | 'mcp' | 'advanced';
/** Recovery copy keys land with the next locales drop; cast until then. */
function rc2(key: string, params?: Record<string, string | number>): string {
  return t(`settings.opencode2.workspace.${key}` as TranslationKey, params);
}
type ConfigPath = string[];
type ModelProvider = { id: string; name: string; models: Array<{ id: string; name: string; variants?: string[] }> };
type CatalogSummary = Awaited<ReturnType<OpenCode2AdapterPort['readConfigurationSummary']>>;
interface OpenCode2WorkspaceState {
  key: string;
  saved: string;
  draft: string;
  catalog: OpenCode2Catalog | null;
  summary?: CatalogSummary;
  models: ModelProvider[];
  updatedAt: number;
  loading?: Promise<void>;
  failure: string;
  saving: boolean;
  feedback: string;
  selected: Record<string, string>;
  resourceType: string;
  buffers: Map<string, { text: string; invalid: boolean }>;
}
interface OpenCode2Mount { root: HTMLElement; tab: OpenCode2Tab }
const OPENCODE2_WORKSPACES = new WeakMap<SettingsOpenCode2Host, OpenCode2WorkspaceState>();
const OPENCODE2_TABS: readonly OpenCode2Tab[] = ['connection', 'model', 'agents', 'permissions', 'mcp', 'advanced'];
const OPENCODE2_TAB_LABELS: Record<OpenCode2Tab, TranslationKey> = {
  connection: 'settings.opencode2.tab.connection', model: 'settings.opencode2.tab.model',
  agents: 'settings.opencode2.tab.agents', permissions: 'settings.opencode2.tab.permissions',
  mcp: 'settings.opencode2.tab.mcp', advanced: 'settings.opencode2.tab.advanced',
};
/** Merged-page destinations for retired secondary-tab ids; the registry alias map stays authoritative. */
const OPENCODE2_TAB_ALIASES: Readonly<Record<string, OpenCode2Tab>> = {
  resources: 'advanced', context: 'advanced', catalog: 'advanced',
  auth: 'model', integrations: 'model', models: 'model', extensions: 'mcp',
};

/** OpenCode 2-only settings draft and native catalog surface. No global-file writer. */
export class SettingsOpenCode2Section {
  private readonly plugin: SettingsOpenCode2Host;
  private readonly requestDisplayRefresh: () => void;
  private readonly renderTitleSettings: (containerEl: HTMLElement) => void;
  private readonly state: OpenCode2WorkspaceState;
  private readonly mounts: OpenCode2Mount[] = [];
  private readonly recovery: BackendConfigRecoveryStore;
  private readonly vaultPath: string | undefined;
  /** Per-vault, per-target identity; null (recovery unavailable) without a
   *  stable vault path, so vaults never share a synthetic snapshot namespace. */
  private configRecoveryIdentity(): string | null {
    return backendRecoveryIdentity(this.vaultPath, 'opencode2:configContent');
  }

  constructor(options: SettingsOpenCode2SectionOptions) {
    this.plugin = options.plugin;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
    this.vaultPath = options.vaultPath ?? options.plugin.vaultPath;
    this.recovery = createBackendConfigRecoveryStore({ baseDir: options.plugin.recoveryBaseDir });
    this.renderTitleSettings = options.renderTitleSettings;
    const key = this.connectionKey();
    const saved = this.plugin.settings.backendSettings.opencode2.configContent ?? '';
    const previous = OPENCODE2_WORKSPACES.get(this.plugin);
    this.state = previous?.key === key ? previous : {
      key, saved, draft: saved, catalog: null, models: [], updatedAt: 0,
      failure: '', saving: false, feedback: '', selected: {}, resourceType: 'instructions', buffers: new Map(),
    };
    if (!this.state.saving && this.state.saved !== saved && this.state.draft === this.state.saved) {
      this.state.saved = saved;
      this.state.draft = saved;
      this.state.buffers.clear();
    }
    OPENCODE2_WORKSPACES.set(this.plugin, this.state);
  }

  private get catalog(): OpenCode2Catalog | null { return this.state.catalog; }
  private set catalog(value: OpenCode2Catalog | null) { this.state.catalog = value; }

  attach(containerEl: HTMLElement): void {
    for (const tab of OPENCODE2_TABS) this.mount(containerEl, tab);
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const tab = OPENCODE2_TABS.find((candidate) => candidate === secondaryTabId)
      ?? OPENCODE2_TAB_ALIASES[secondaryTabId] ?? 'connection';
    this.mount(containerEl, tab);
  }

  private connectionKey(): string {
    const settings = this.plugin.settings.backendSettings.opencode2;
    return JSON.stringify([settings.mode, settings.executablePath, settings.baseUrl, settings.password]);
  }

  private current(): boolean {
    return OPENCODE2_WORKSPACES.get(this.plugin) === this.state && this.connectionKey() === this.state.key;
  }

  private mount(containerEl: HTMLElement, tab: OpenCode2Tab): void {
    const root = containerEl.createDiv({ cls: 'opencodian-settings-section opencodian-opencode2-settings', attr: {
      'data-settings-surface': 'section', 'data-settings-target': `opencode2-${tab}`,
    } });
    const mount = { root, tab };
    this.mounts.push(mount);
    this.renderMount(mount);
    void this.loadCatalog().then(() => this.repaint());
  }

  private repaint(): void {
    if (!this.current()) return;
    for (const mount of this.mounts) if (mount.root.parentElement) this.renderMount(mount);
  }

  private async loadCatalog(force = false): Promise<void> {
    if (!this.current()) return;
    if (this.state.loading) return this.state.loading;
    if (!force && this.state.updatedAt && Date.now() - this.state.updatedAt < 30_000) return;
    const adapter = this.getAdapter();
    if (!adapter) { this.state.failure = oc2('unavailable'); return; }
    this.state.failure = '';
    this.state.loading = (async () => {
      try {
        const [summary, catalog, models] = await Promise.all([
          adapter.readConfigurationSummary(), adapter.readManagementCatalog(),
          adapter.getModelSelectorProviders?.() ?? Promise.resolve([]),
        ]);
        if (!this.current()) return;
        this.state.summary = summary;
        this.state.catalog = catalog;
        this.state.models = models;
        this.state.updatedAt = Date.now();
      } catch (error) {
        if (this.current()) this.state.failure = getSettingsCatalogFailureMessage(error);
      } finally { this.state.loading = undefined; }
    })();
    if (force) this.repaint();
    return this.state.loading;
  }

  private renderMount({ root, tab }: OpenCode2Mount): void {
    root.empty();
    root.setAttribute('data-workspace-tab', tab);
    const header = root.createDiv({ cls: 'opencodian-opencode2-header' });
    const heading = header.createDiv();
    heading.createEl('h3', { text: t(OPENCODE2_TAB_LABELS[tab]) });
    heading.createEl('p', { text: oc2(`intro.${tab}`), cls: 'setting-item-description' });
    const status = header.createDiv({ cls: 'opencodian-opencode2-sync', attr: { role: 'status', 'aria-live': 'polite' } });
    status.setAttribute('data-catalog-state', this.state.loading ? 'loading' : this.state.failure ? 'failed' : this.catalog ? 'complete' : 'idle');
    status.createSpan({ text: this.state.loading ? oc2('loading') : this.state.failure ? oc2(this.catalog ? 'cached' : 'notConnected') : oc2(this.catalog ? 'synced' : 'loading') });
    this.button(status, oc2('refresh'), async () => { await this.loadCatalog(true); this.repaint(); }, !!this.state.loading);
    const scope = root.createDiv({ cls: 'opencodian-opencode2-scope' });
    scope.createSpan({ text: oc2('scopeLabel'), cls: 'opencodian-opencode2-badge' });
    scope.createSpan({ text: oc2(this.local() ? 'localScope' : 'remoteScope') });
    if (this.state.summary) scope.createSpan({ text: `OpenCode ${this.state.summary.version}`, cls: 'opencodian-opencode2-badge' });
    if (this.state.failure) this.notice(root, this.state.failure);
    if (!this.local()) this.notice(root, oc2('remoteReadOnly'));
    if (this.conflict()) this.notice(root, oc2('conflict'));
    const body = root.createDiv({ cls: 'opencodian-opencode2-body' });
    this.renderPage(body, tab);
    if (tab !== 'connection') this.renderFooter(root);
  }

  private renderPage(body: HTMLElement, tab: OpenCode2Tab): void {
    switch (tab) {
      case 'connection': this.renderConnection(body); break;
      case 'model': this.renderModel(body); break;
      case 'agents': this.renderAgents(body); break;
      case 'permissions': this.renderPermissions(body); break;
      case 'mcp': this.renderExtensions(body); break;
      case 'advanced': this.renderAdvanced(body); break;
    }
  }

  private local(): boolean { return this.plugin.settings.backendSettings.opencode2.mode === 'local'; }
  private conflict(): boolean { return (this.plugin.settings.backendSettings.opencode2.configContent ?? '') !== this.state.saved && !this.state.saving; }

  private document(): Record<string, unknown> | null {
    const errors: ParseError[] = [];
    const value: unknown = this.state.draft.trim() ? parse(this.state.draft, errors, { allowTrailingComma: true }) : {};
    return !errors.length && value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private value(path: ConfigPath): unknown {
    let value: unknown = this.document();
    for (const key of path) {
      if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
      value = (value as Record<string, unknown>)[key];
    }
    return value;
  }

  private setValue(path: ConfigPath, value: unknown): void {
    if (!this.local() || this.state.saving || !this.document() || this.conflict()) return;
    if (value === undefined && this.value(path) === undefined) return;
    this.state.draft = applyEdits(this.state.draft.trim() ? this.state.draft : '{}', modify(
      this.state.draft.trim() ? this.state.draft : '{}', path, value,
      { formattingOptions: { insertSpaces: true, tabSize: 2 } },
    ));
    this.state.feedback = '';
    this.updateFooters();
  }

  private group(parent: HTMLElement, title: string, description?: string): HTMLElement {
    const group = parent.createEl('section', { cls: 'opencodian-opencode2-group' });
    group.createEl('h4', { text: title });
    if (description) group.createEl('p', { text: description, cls: 'setting-item-description' });
    return group;
  }

  private disclosure(parent: HTMLElement, title: string): HTMLElement {
    const details = parent.createEl('details', { cls: 'opencodian-opencode2-disclosure' });
    details.createEl('summary', { text: title });
    return details.createDiv({ cls: 'opencodian-opencode2-disclosure-body' });
  }

  private notice(parent: HTMLElement, message: string): void {
    parent.createEl('p', { cls: 'opencodian-opencode2-notice', text: message });
  }

  private button(parent: HTMLElement, label: string, action: () => void | Promise<void>, disabled = false): HTMLButtonElement {
    const button = parent.createEl('button', { text: label, attr: { type: 'button' } });
    button.disabled = disabled;
    button.addEventListener('click', () => {
      void Promise.resolve(action()).catch(() => { new Notice(oc2('operationFailed')); });
    });
    return button;
  }

  private field(parent: HTMLElement, path: ConfigPath, label: string, description: string): HTMLElement {
    const row = parent.createDiv({ cls: 'setting-item opencodian-opencode2-field', attr: { 'data-config-path': path.join('.') } });
    const info = row.createDiv({ cls: 'setting-item-info' });
    const title = info.createDiv({ cls: 'setting-item-name', text: label });
    title.createSpan({ cls: 'opencodian-opencode2-badge', text: oc2(this.value(path) === undefined ? 'inherited' : 'override') });
    if (description) info.createDiv({ cls: 'setting-item-description', text: description });
    return row.createDiv({ cls: 'setting-item-control' });
  }

  private bindValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, path: ConfigPath, transform: (text: string) => unknown): void {
    control.disabled = !this.local() || this.state.saving || !this.document() || this.conflict();
    control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
      this.setValue(path, transform(control.value));
      const badge = control.closest('.setting-item')?.querySelector('.opencodian-opencode2-badge');
      badge?.setText(oc2(this.value(path) === undefined ? 'inherited' : 'override'));
    });
  }

  private textField(parent: HTMLElement, path: ConfigPath, label: string, options: { description?: string; multiline?: boolean } = {}): void {
    const { description = '', multiline = false } = options;
    const host = this.field(parent, path, label, description);
    const value = this.value(path);
    const input = multiline ? host.createEl('textarea') : host.createEl('input', { type: 'text' });
    input.setAttribute('aria-label', label);
    input.placeholder = oc2('inherited');
    input.value = typeof value === 'string' ? value : '';
    if (multiline) { input.classList.add('opencodian-config-editor'); host.parentElement?.addClass('opencodian-opencode2-wide'); }
    this.bindValue(input, path, (text) => text || undefined);
  }

  private numberField(parent: HTMLElement, path: ConfigPath, label: string, description = ''): void {
    const host = this.field(parent, path, label, description);
    const input = host.createEl('input', { type: 'number', attr: { min: '0', step: '1', 'aria-label': label } });
    const value = this.value(path);
    input.value = typeof value === 'number' ? String(value) : '';
    input.placeholder = oc2('inherited');
    this.bindValue(input, path, (text) => text ? Number(text) : undefined);
    input.addEventListener('input', () => {
      this.state.buffers.set(JSON.stringify(path), { text: input.value, invalid: !input.validity.valid });
      this.updateFooters();
    });
  }

  private selectField(parent: HTMLElement, path: ConfigPath, label: string, config: { values: Array<[string, string]>; description?: string; boolean?: boolean }): void {
    const { values: options, description = '', boolean = false } = config;
    const host = this.field(parent, path, label, description);
    const input = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
    input.createEl('option', { attr: { value: '' }, text: oc2('inherited') });
    for (const [value, text] of options) input.createEl('option', { attr: { value }, text });
    const value = this.value(path);
    if (value !== undefined && !options.some(([option]) => option === String(value))) input.createEl('option', { attr: { value: String(value) }, text: String(value) });
    input.value = value === undefined ? '' : String(value);
    this.bindValue(input, path, (text) => text === '' ? undefined : boolean ? text === 'true' : text);
  }

  private booleanField(parent: HTMLElement, path: ConfigPath, label: string, description = ''): void {
    this.selectField(parent, path, label, { values: [['true', oc2('enabled')], ['false', oc2('disabled')]], description: description, boolean: true });
  }

  private jsonField(parent: HTMLElement, path: ConfigPath, label: string, options: { kind: 'object' | 'array'; description?: string }): void {
    const { kind, description = '' } = options;
    const host = this.field(parent, path, label, description);
    host.parentElement?.addClass('opencodian-opencode2-wide');
    const input = host.createEl('textarea', { cls: 'opencodian-config-editor', attr: { 'aria-label': label, rows: '5', spellcheck: 'false' } });
    const bufferKey = JSON.stringify(path);
    const buffer = this.state.buffers.get(bufferKey);
    input.value = buffer?.text ?? (this.value(path) === undefined ? '' : JSON.stringify(this.value(path), null, 2));
    input.placeholder = kind === 'array' ? '[]' : '{}';
    input.disabled = !this.local() || this.state.saving || !this.document() || this.conflict();
    const status = host.createDiv({ cls: 'opencodian-opencode2-field-error', attr: { role: 'status' } });
    if (buffer?.invalid) status.setText(oc2('invalidJson'));
    input.addEventListener('input', () => {
      const errors: ParseError[] = [];
      const value: unknown = input.value.trim() ? parse(input.value, errors, { allowTrailingComma: true }) : undefined;
      const invalid = !!errors.length || (value !== undefined && (kind === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)));
      this.state.buffers.set(bufferKey, { text: input.value, invalid });
      status.setText(invalid ? oc2('invalidJson') : '');
      input.setAttribute('aria-invalid', String(invalid));
      if (!invalid) this.setValue(path, value);
      this.updateFooters();
    });
  }

  private renderConnection(parent: HTMLElement): void {
    const settings = this.plugin.settings.backendSettings.opencode2;
    const group = this.group(parent, oc2('connectionMode'), oc2('connectionDesc'));
    addBackendChoiceSetting(group, {
      key: 'mode',
      name: t('settings.agent.opencode2.mode'),
      description: oc2('connectionDesc'),
      value: settings.mode === 'remote' ? 'remote' : 'local',
      options: [
        { value: 'local', label: t('settings.server.mode.local'), description: oc2('modeLocalDesc'), recommended: true },
        { value: 'remote', label: t('settings.server.mode.remote'), description: oc2('modeRemoteDesc') },
      ],
      onChange: async (value) => {
        if (this.state.saving) throw new Error(oc2('applying'));
        const previous = settings.mode;
        settings.mode = value === 'remote' ? 'remote' : 'local';
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          settings.mode = previous;
          throw error;
        }
        this.requestDisplayRefresh();
      },
      presentation: { key: 'mode', scope: 'vault', effect: 'reconnect', risk: 'low', defaultLabel: t('settings.server.mode.local') },
    });
    if (this.local()) {
      const renderExecutablePath = (force = false): void => {
        pathHolder.empty();
        if (!force && !settings.executablePath) return;
        describeBackendSetting(
          new Setting(pathHolder)
            .setName(t('settings.agent.opencode2.executable'))
            .setDesc(t('settings.agent.opencode2.executable.desc'))
            .addText((input) => {
              input.inputEl.setAttribute('aria-label', t('settings.agent.opencode2.executable'));
              input.setPlaceholder('opencode2').setValue(settings.executablePath).onChange(async (value) => {
                const previous = settings.executablePath;
                settings.executablePath = value.trim();
                try {
                  await this.plugin.saveSettings();
                } catch (error) {
                  settings.executablePath = previous;
                  throw error;
                }
              });
            }),
          { key: 'executablePath', scope: 'vault', effect: 'reconnect', risk: 'medium', defaultLabel: oc2('executableAuto') },
        );
      };
      addBackendChoiceSetting(group, {
        key: 'executablePath',
        name: t('settings.agent.opencode2.executable'),
        description: t('settings.agent.opencode2.executable.desc'),
        value: settings.executablePath ? 'custom' : 'auto',
        options: [
          { value: 'auto', label: oc2('executableAuto'), description: oc2('executableAutoDesc'), recommended: true },
          { value: 'custom', label: oc2('executableCustom'), description: oc2('executableCustomDesc') },
        ],
        onChange: async (value) => {
          const previous = settings.executablePath;
          settings.executablePath = value === 'custom' ? previous : '';
          try {
            await this.plugin.saveSettings();
          } catch (error) {
            settings.executablePath = previous;
            throw error;
          }
          renderExecutablePath(value === 'custom');
        },
        presentation: { key: 'executablePath', scope: 'vault', effect: 'reconnect', risk: 'medium', defaultLabel: oc2('executableAuto') },
      });
      const pathHolder = group.createDiv({ cls: 'opencodian-opencode2-custom-executable' });
      renderExecutablePath();
    } else {
      describeBackendSetting(
        new Setting(group).setName(t('settings.agent.opencode2.url')).addText((input) => input
          .setPlaceholder('http://127.0.0.1:4096').setValue(settings.baseUrl).onChange(async (value) => {
            const previous = settings.baseUrl;
            settings.baseUrl = value.trim();
            try {
              await this.plugin.saveSettings();
            } catch (error) {
              settings.baseUrl = previous;
              throw error;
            }
          })),
        { key: 'baseUrl', scope: 'vault', effect: 'reconnect', risk: 'medium' },
      );
      describeBackendSetting(
        new Setting(group).setName(t('settings.agent.opencode2.password')).addText((input) => {
          input.inputEl.type = 'password';
          input.setValue(settings.password).onChange(async (value) => {
            const previous = settings.password;
            settings.password = value;
            try {
              await this.plugin.saveSettings();
            } catch (error) {
              settings.password = previous;
              throw error;
            }
          });
        }),
        { key: 'password', scope: 'vault', effect: 'reconnect', risk: 'medium' },
      );
    }
    const connection = this.group(parent, oc2('connectionStatus'));
    this.notice(connection, this.state.summary ? oc2('connectionReady') : oc2('connectionPending'));
    this.button(connection, oc2('testConnection'), async () => { await this.loadCatalog(true); this.repaint(); });
    this.group(parent, oc2('configSources'), oc2('configSourcesDesc'));
  }

  private modelOptions(): Array<[string, string]> {
    return this.state.models.flatMap((provider) => provider.models.map((model): [string, string] => [`${provider.id}/${model.id}`, `${provider.name} / ${model.name}`]));
  }

  private renderModel(parent: HTMLElement): void {
    const group = this.group(parent, oc2('defaultModel'));
    if (this.state.models.length) this.selectField(group, ['model'], oc2('chatModel'), { values: this.modelOptions(), description: oc2('chatModelDesc') });
    else this.textField(group, ['model'], oc2('chatModel'), { description: oc2('modelReference') });
    const auth = this.group(parent, oc2('authentication'), oc2('authenticationDesc'));
    if (this.catalog) this.renderAuthCatalog(auth, this.catalog); else this.notice(auth, oc2('catalogPending'));
    const auxiliary = this.group(parent, t('settings.opencode2.model.title'), t('settings.opencode2.model.desc'));
    this.renderTitleSettings(auxiliary);
    SettingsInlineEditSection.renderBackendModelOverrides(this.disclosure(auxiliary, oc2('inlineModels')), 'opencode2', this.plugin);
  }

  private renderMapEditor(parent: HTMLElement, key: string, options: { catalog: OpenCode2CatalogEntry[]; fields: (editor: HTMLElement, path: ConfigPath) => void; nested?: string[] }): void {
    const { catalog, fields, nested = [] } = options;
    const base = [key, ...nested];
    const configured = this.value(base);
    const configuredKeys = configured && typeof configured === 'object' && !Array.isArray(configured) ? Object.keys(configured) : [];
    const ids = [...new Set([...configuredKeys, ...catalog.map((entry) => entry.id ?? entry.name ?? '').filter(Boolean)])];
    const toolbar = parent.createDiv({ cls: 'opencodian-opencode2-toolbar' });
    const name = toolbar.createEl('input', { type: 'text', attr: { 'aria-label': oc2('newId'), placeholder: oc2('newId') } });
    this.button(toolbar, oc2('add'), () => {
      const id = name.value.trim();
      if (!/^[\w./@-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) { new Notice(oc2('invalidName')); return; }
      if (configuredKeys.includes(id)) { new Notice(oc2('alreadyExists')); return; }
      this.setValue([...base, id], {}); this.state.selected[key] = id; this.repaint();
    }, !this.local() || this.state.saving || !this.document());
    if (!ids.length) { this.notice(parent, oc2('emptyDefinitions')); return; }
    const selected = ids.includes(this.state.selected[key]) ? this.state.selected[key] : ids[0];
    this.state.selected[key] = selected;
    const split = parent.createDiv({ cls: 'opencodian-opencode2-split' });
    const list = split.createDiv({ cls: 'opencodian-opencode2-list', attr: { 'aria-label': oc2('definitionList') } });
    for (const id of ids) {
      const button = this.button(list, id, () => { this.state.selected[key] = id; this.repaint(); });
      button.setAttribute('aria-pressed', String(id === selected));
      button.createSpan({ text: oc2(configuredKeys.includes(id) ? 'override' : 'runtimeDefinition'), cls: 'opencodian-opencode2-list-meta' });
    }
    const editor = split.createDiv({ cls: 'opencodian-opencode2-editor' });
    editor.createEl('h5', { text: selected });
    if (!configuredKeys.includes(selected)) {
      this.notice(editor, oc2('runtimeDefinitionDesc'));
      this.button(editor, oc2('createOverride'), () => { this.setValue([...base, selected], {}); this.repaint(); }, !this.local());
      return;
    }
    fields(editor, [...base, selected]);
    const remove = this.disclosure(editor, oc2('restoreInheritance'));
    this.notice(remove, oc2('removeOverrideDesc'));
    this.button(remove, oc2('removeOverride'), () => { this.setValue([...base, selected], undefined); this.repaint(); }, !this.local() || this.state.saving);
  }

  private renderAgents(parent: HTMLElement): void {
    const defaults = this.group(parent, oc2('agentDefaults'));
    const catalogAgents = (this.catalog?.agents ?? [])
      .map((entry) => entry.id ?? entry.name ?? '')
      .filter((id): id is string => Boolean(id));
    if (catalogAgents.length) {
      this.selectField(defaults, ['default_agent'], oc2('defaultAgent'), {
        values: catalogAgents.map((id): [string, string] => [id, id]),
        description: oc2('defaultAgentDesc'),
      });
    } else {
      this.textField(defaults, ['default_agent'], oc2('defaultAgent'), { description: oc2('defaultAgentDesc') });
    }
    const group = this.group(parent, oc2('agents'), oc2('agentsDesc'));
    this.renderMapEditor(group, 'agents', { catalog: this.catalog?.agents ?? [], fields: (editor, path) => {
      this.textField(editor, [...path, 'description'], oc2('description'));
      this.textField(editor, [...path, 'model'], oc2('agentModel'), { description: oc2('variantHint') });
      this.textField(editor, [...path, 'system'], oc2('systemPrompt'), { description: oc2('systemPromptDesc'), multiline: true });
      const advanced = this.disclosure(editor, oc2('agentAdvanced'));
      this.selectField(advanced, [...path, 'mode'], oc2('agentMode'), { values: [['primary', oc2('primaryAgent')], ['subagent', oc2('subagent')], ['all', oc2('allModes')]] });
      this.booleanField(advanced, [...path, 'hidden'], oc2('hiddenAgent'));
      this.booleanField(advanced, [...path, 'disabled'], oc2('disableAgent'));
      this.numberField(advanced, [...path, 'steps'], oc2('agentSteps'));
      this.jsonField(advanced, [...path, 'permissions'], oc2('agentPermissions'), { kind: 'array', description: oc2('permissionsFormat') });
    } });
  }

  private renderPermissions(parent: HTMLElement): void {
    const settings = this.plugin.settings.backendSettings.opencode2;
    const modeGroup = this.group(parent, t('settings.agent.opencode2.permissionMode'), t('settings.agent.opencode2.permissionMode.desc'));
    addBackendChoiceSetting(modeGroup, {
      key: 'permissionMode',
      name: t('settings.agent.opencode2.permissionMode'),
      description: t('settings.agent.opencode2.permissionMode.desc'),
      value: settings.permissionMode ?? 'inherit',
      options: [
        { value: 'inherit', label: t('settings.agent.opencode2.permissionMode.inherit'), description: t('settings.agent.opencode2.permissionMode.inherit.desc'), recommended: true },
        { value: 'normal', label: t('settings.agent.opencode2.permissionMode.normal'), description: t('settings.agent.opencode2.permissionMode.normal.desc') },
        { value: 'plan', label: t('settings.agent.opencode2.permissionMode.plan'), description: t('settings.agent.opencode2.permissionMode.plan.desc') },
        { value: 'yolo', label: t('settings.agent.opencode2.permissionMode.yolo'), description: t('settings.agent.opencode2.permissionMode.yolo.desc') },
      ],
      onChange: async (value) => {
        const previous = settings.permissionMode;
        settings.permissionMode = value === 'normal' || value === 'yolo' || value === 'plan' ? value : 'inherit';
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          settings.permissionMode = previous;
          throw error;
        }
      },
      presentation: { key: 'permissionMode', scope: 'vault', effect: 'next-turn', risk: settings.permissionMode === 'yolo' ? 'high' : 'medium' },
    });
    const group = this.group(parent, oc2('permissionRules'), oc2('permissionRulesDesc'));
    this.jsonField(group, ['permissions'], oc2('orderedPermissions'), { kind: 'array', description: oc2('permissionsFormat') });
    const rules = this.value(['permissions']);
    if (Array.isArray(rules)) {
      const table = group.createDiv({ cls: 'opencodian-opencode2-rules', attr: { role: 'list' } });
      for (const [index, rule] of rules.entries()) {
        if (!rule || typeof rule !== 'object') continue;
        const entry = rule as Record<string, unknown>;
        const row = table.createDiv({ attr: { role: 'listitem' } });
        row.createEl('code', { text: `${String(entry.action ?? '')} · ${String(entry.resource ?? '')}` });
        row.createSpan({ text: String(entry.effect ?? ''), cls: 'opencodian-opencode2-badge' });
        this.button(row, oc2('moveUp'), () => { const next = [...rules]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; this.setValue(['permissions'], next); this.repaint(); }, index === 0 || !this.local());
      }
    }
    const presets = this.group(parent, oc2('addPermission'), oc2('permissionPresetDesc'));
    const action = presets.createEl('select', { cls: 'dropdown', attr: { 'aria-label': oc2('permissionAction') } });
    for (const id of ['read', 'edit', 'shell', 'glob', 'grep', 'webfetch', 'websearch', 'external_directory', 'subagent', 'skill', 'execute']) action.createEl('option', { attr: { value: id }, text: id });
    const resource = presets.createEl('input', { type: 'text', attr: { value: '*', 'aria-label': oc2('permissionResource') } });
    const effect = presets.createEl('select', { cls: 'dropdown', attr: { 'aria-label': oc2('permissionEffect') } });
    for (const id of ['ask', 'allow', 'deny'] as const) effect.createEl('option', { attr: { value: id }, text: oc2(id) });
    this.button(presets, oc2('appendRule'), () => {
      this.setValue(['permissions'], [...(Array.isArray(rules) ? rules : []), { action: action.value, resource: resource.value, effect: effect.value }]); this.repaint();
    }, !this.local());
  }

  private renderExtensions(parent: HTMLElement): void {
    const runtime = this.group(parent, oc2('mcpConnections'), oc2('mcpConnectionsDesc'));
    if (this.catalog) this.renderMcpCatalog(runtime, this.catalog); else this.notice(runtime, oc2('catalogPending'));
    this.renderMapEditor(this.group(parent, oc2('mcpDefinitions')), 'mcp', { catalog: (this.catalog?.mcp ?? []).map(({ name }) => ({ id: name })), fields: (editor, path) => {
      this.selectField(editor, [...path, 'type'], oc2('transport'), { values: [['local', oc2('localProcess')], ['remote', oc2('remoteHttp')]] });
      this.textField(editor, [...path, 'url'], oc2('mcpUrl'));
      this.jsonField(editor, [...path, 'command'], oc2('mcpCommand'), { kind: 'array', description: oc2('mcpCommandDesc') });
      this.booleanField(editor, [...path, 'disabled'], oc2('disableServer'));
      const advanced = this.disclosure(editor, oc2('mcpAdvanced'));
      this.jsonField(advanced, [...path, 'environment'], oc2('environment'), { kind: 'object', description: oc2('credentialsHint') });
      this.jsonField(advanced, [...path, 'headers'], oc2('headers'), { kind: 'object', description: oc2('credentialsHint') });
      this.numberField(advanced, [...path, 'timeout', 'catalog'], oc2('catalogTimeout'), oc2('milliseconds'));
      this.numberField(advanced, [...path, 'timeout', 'execution'], oc2('executionTimeout'), oc2('milliseconds'));
    }, nested: ['servers'] });
    this.jsonField(this.group(parent, oc2('plugins'), oc2('pluginsDesc')), ['plugins'], oc2('pluginSources'), { kind: 'array', description: oc2('pluginSourcesDesc') });
  }

  private renderMcpCatalog(parent: HTMLElement, catalog: OpenCode2Catalog): void {
    if (!catalog.mcp.length) { this.notice(parent, oc2('emptyMcp')); return; }
    for (const server of catalog.mcp) {
      new Setting(parent).setName(server.name).setDesc(server.status.status).addButton((button) => button
        .setButtonText(t(server.status.status === 'connected' ? 'settings.agent.opencode2.disconnect' : 'settings.agent.opencode2.connect'))
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const adapter = this.getAdapter();
            if (!adapter) return;
            await adapter.setMcpConnection(server.name, server.status.status !== 'connected');
            await this.loadCatalog(true); this.repaint();
          } catch (error) { new Notice(getSettingsCatalogFailureMessage(error)); }
          finally { button.setDisabled(false); }
        }));
    }
  }

  private renderResources(parent: HTMLElement): void {
    const tabs = parent.createDiv({ cls: 'opencodian-opencode2-resource-tabs', attr: { role: 'group', 'aria-label': oc2('resourceTypes') } });
    for (const key of ['instructions', 'skills', 'commands', 'references'] as const) {
      const button = this.button(tabs, oc2(key), () => { this.state.resourceType = key; this.repaint(); });
      button.setAttribute('aria-pressed', String(this.state.resourceType === key));
    }
    const kind = this.state.resourceType;
    const group = this.group(parent, oc2(kind as 'instructions' | 'skills' | 'commands' | 'references'));
    if (kind === 'instructions' || kind === 'skills') {
      this.jsonField(group, [kind], oc2(kind === 'instructions' ? 'instructionSources' : 'skillSources'), { kind: 'array', description: oc2(kind === 'instructions' ? 'instructionSourcesDesc' : 'skillSourcesDesc') });
      this.notice(group, oc2('sourceFilesHint'));
      if (kind === 'skills') this.renderCatalogList(group, this.catalog?.skills ?? []);
    } else if (kind === 'commands') {
      this.renderMapEditor(group, 'commands', { catalog: this.catalog?.commands ?? [], fields: (editor, path) => {
        this.textField(editor, [...path, 'description'], oc2('description'));
        this.textField(editor, [...path, 'template'], oc2('commandTemplate'), { description: oc2('commandTemplateDesc'), multiline: true });
        this.textField(editor, [...path, 'agent'], oc2('commandAgent'));
        this.textField(editor, [...path, 'model'], oc2('agentModel'), { description: oc2('variantHint') });
        this.booleanField(editor, [...path, 'subagent'], oc2('commandSubagent'));
      } });
    } else {
      this.renderMapEditor(group, 'references', { catalog: [], fields: (editor, path) => {
        this.textField(editor, [...path, 'description'], oc2('description'));
        this.textField(editor, [...path, 'path'], oc2('referencePath'), { description: oc2('referencePathDesc') });
        this.textField(editor, [...path, 'repository'], oc2('referenceRepository'));
        this.textField(editor, [...path, 'branch'], oc2('referenceBranch'));
      } });
    }
  }

  private renderCatalogList(parent: HTMLElement, entries: OpenCode2CatalogEntry[]): void {
    const list = parent.createDiv({ cls: 'opencodian-opencode2-catalog-list' });
    if (!entries.length) this.notice(list, this.catalog ? oc2('emptyCatalog') : oc2('catalogPending'));
    for (const entry of entries) list.createDiv({ text: entry.name ?? entry.id ?? '', cls: 'opencodian-opencode2-catalog-item' });
  }

  private renderContext(parent: HTMLElement): void {
    const compaction = this.group(parent, oc2('compaction'), oc2('compactionDesc'));
    this.booleanField(compaction, ['compaction', 'auto'], oc2('autoCompact'), oc2('autoCompactDesc'));
    const advanced = this.disclosure(compaction, oc2('compactionAdvanced'));
    this.numberField(advanced, ['compaction', 'keep', 'tokens'], oc2('keepTokens'), oc2('keepTokensDesc'));
    this.numberField(advanced, ['compaction', 'buffer'], oc2('bufferTokens'), oc2('bufferTokensDesc'));
    this.textField(advanced, ['agents', 'compaction', 'model'], oc2('compactionModel'), { description: oc2('modelReference') });
    const output = this.group(parent, oc2('mediaAndOutput'));
    this.booleanField(output, ['media', 'image', 'auto_resize'], oc2('resizeImages'), oc2('resizeImagesDesc'));
    this.numberField(output, ['tool_output', 'max_lines'], oc2('outputLines'), oc2('outputLinesDesc'));
    const limits = this.disclosure(output, oc2('imageLimits'));
    this.numberField(limits, ['media', 'image', 'max_width'], oc2('imageWidth'), oc2('pixels'));
    this.numberField(limits, ['media', 'image', 'max_height'], oc2('imageHeight'), oc2('pixels'));
    this.numberField(limits, ['media', 'image', 'max_base64_bytes'], oc2('imageBytes'), oc2('bytes'));
    this.numberField(limits, ['tool_output', 'max_bytes'], oc2('outputBytes'), oc2('bytes'));
    this.booleanField(limits, ['snapshots'], oc2('snapshots'), oc2('snapshotsDesc'));
    const warming = this.disclosure(parent, oc2('warming'));
    this.notice(warming, oc2('warmingCost'));
    this.jsonField(warming, ['warming'], oc2('warmingOptions'), { kind: 'object', description: oc2('warmingOptionsDesc') });
    this.booleanField(warming, ['experimental', 'background_compaction'], oc2('backgroundCompaction'));
  }

  private renderAdvanced(parent: HTMLElement): void {
    const sources = this.group(parent, oc2('advancedSources'));
    this.renderResources(sources);
    const context = this.group(parent, oc2('advancedContext'));
    this.renderContext(context);
    const providers = this.group(parent, oc2('providers'), oc2('providersMoved'));
    this.renderMapEditor(providers, 'providers', { catalog: [], fields: (editor, path) => {
      this.textField(editor, [...path, 'package'], oc2('providerPackage'), { description: oc2('providerPackageDesc') });
      this.textField(editor, [...path, 'settings', 'baseURL'], oc2('baseUrl'));
      this.jsonField(this.disclosure(editor, oc2('modelParameters')), [...path, 'models'], oc2('modelsConfig'), { kind: 'object', description: oc2('modelsConfigDesc') });
      this.jsonField(this.disclosure(editor, oc2('providerAdvanced')), [...path, 'settings'], oc2('providerSettings'), { kind: 'object', description: oc2('credentialsHint') });
    } });
    const files = this.group(parent, oc2('advancedRuntime'));
    this.jsonField(files, ['watcher', 'ignore'], oc2('watcherIgnore'), { kind: 'array', description: oc2('watcherIgnoreDesc') });
    this.jsonField(this.disclosure(files, oc2('formatters')), ['formatter'], oc2('formatterConfig'), { kind: 'object', description: oc2('formatterConfigDesc') });
    const execution = this.group(parent, oc2('execution'));
    this.textField(execution, ['shell'], oc2('shell'), { description: oc2('shellDesc') });
    this.textField(execution, ['worktree', 'directory'], oc2('worktreeDirectory'), { description: oc2('worktreeDirectoryDesc') });
    this.jsonField(this.disclosure(execution, oc2('websearch')), ['websearch'], oc2('websearchConfig'), { kind: 'object' });
    const policies = this.group(parent, oc2('advancedPolicies'), oc2('policiesDesc'));
    this.jsonField(policies, ['policies'], oc2('policies'), { kind: 'array', description: oc2('policiesDesc') });
    const experiments = this.disclosure(parent, oc2('experimental'));
    this.booleanField(experiments, ['experimental', 'todo'], oc2('todo'));
    this.numberField(experiments, ['experimental', 'subagent_depth'], oc2('subagentDepth'));
    this.booleanField(experiments, ['experimental', 'portable_shell_scanner'], oc2('shellScanner'));
    this.textField(experiments, ['experimental', 'location_idle_timeout'], oc2('idleTimeout'), { description: oc2('durationHint') });
    const raw = this.group(parent, oc2('rawConfiguration'), oc2('rawConfigurationDesc'));
    const input = raw.createEl('textarea', { cls: 'opencodian-config-editor opencodian-opencode2-raw', attr: { 'aria-label': oc2('rawConfiguration'), rows: '12', spellcheck: 'false' } });
    input.value = this.state.draft;
    input.disabled = !this.local() || this.state.saving;
    input.addEventListener('input', () => { this.state.draft = input.value; this.state.buffers.clear(); this.state.feedback = ''; this.updateFooters(); });
    this.notice(parent, oc2('excludedSettings'));
    this.renderConfigRecovery(parent);
  }

  /** Durable machine-local recovery disclosure for previous SAVED
   *  configContent. Metadata-only list; three actions to restore (open ->
   *  Restore -> Confirm); CAS re-checked immediately before the mutation, and
   *  the restore re-enters the validated apply path. */
  private renderConfigRecovery(parent: HTMLElement): void {
    const disclosure = parent.createEl('details', { cls: 'opencodian-opencode2-recovery' });
    disclosure.createEl('summary', { text: rc2('recovery') });
    const body = disclosure.createDiv({ cls: 'opencodian-opencode2-recovery-body' });
    body.createEl('p', { cls: 'setting-item-description', text: rc2('recoveryDesc') });
    const listHost = body.createDiv({ cls: 'opencodian-opencode2-recovery-list' });
    const feedback = body.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    const renderList = (): void => {
      listHost.empty();
      if (!this.local()) {
        listHost.createEl('p', { cls: 'setting-item-description', text: oc2('remoteReadOnly') });
        return;
      }
      const identity = this.configRecoveryIdentity();
      if (!identity) {
        listHost.createEl('p', { cls: 'setting-item-description', text: rc2('recoveryEmpty') });
        return;
      }
      let entries;
      try { entries = this.recovery.list(identity, OC2_RECOVERY_KEY); }
      catch {
        feedback.setText(t('settings.backend.recovery.unavailable' as TranslationKey));
        return;
      }
      if (!entries.length) {
        listHost.createEl('p', { cls: 'setting-item-description', text: rc2('recoveryEmpty') });
        return;
      }
      // CAS snapshot: configContent must not change while this list is open.
      const listedCurrentRevision = recoveryRevision(this.plugin.settings.backendSettings.opencode2.configContent ?? '');
      for (const entry of entries) {
        const row = new Setting(listHost)
          .setName(rc2('recoveryEntry', { date: new Date(entry.savedAt).toLocaleString() }))
          .setDesc(rc2('recoveryEntryDetail', { bytes: entry.bytes }));
        row.addButton((button) => button.setButtonText(rc2('recoveryRestore')).onClick(() => {
          this.confirmConfigRecovery({ identity, listHost, entry, listedCurrentRevision, feedback, renderList });
        }));
      }
    };
    renderList();
    disclosure.addEventListener('toggle', () => {
      if (disclosure.open) renderList();
    });
  }

  /** Inline confirm (third action). CAS re-checked synchronously with the
   *  mutation; the snapshot is applied through applyDraft, so backend
   *  validation and catalog reload keep their existing honest semantics. */
  private confirmConfigRecovery(context: {
    identity: string;
    listHost: HTMLElement;
    entry: { index: number; revision: string };
    listedCurrentRevision: string;
    feedback: HTMLElement;
    renderList: () => void;
  }): void {
    const { identity, listHost, entry, listedCurrentRevision, feedback, renderList } = context;
    feedback.setText('');
    const confirmHost = listHost.createDiv({ cls: 'opencodian-opencode2-recovery-confirm' });
    confirmHost.createEl('p', { cls: 'setting-item-description', text: rc2('recoveryConfirmHelp') });
    const confirm = confirmHost.createEl('button', { text: rc2('recoveryConfirm'), attr: { type: 'button' } });
    const cancel = confirmHost.createEl('button', { text: rc2('recoveryCancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => confirmHost.remove());
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      cancel.disabled = true;
      void (async () => {
        const currentRaw = this.plugin.settings.backendSettings.opencode2.configContent ?? '';
        if (recoveryRevision(currentRaw) !== listedCurrentRevision) {
          feedback.setText(t('settings.backend.recovery.stale' as TranslationKey));
          renderList();
          return;
        }
        const snapshot = this.recovery.read(identity, OC2_RECOVERY_KEY, entry.index);
        if (!snapshot || snapshot.revision !== entry.revision) {
          feedback.setText(t('settings.backend.recovery.stale' as TranslationKey));
          renderList();
          return;
        }
        // Keep the actual saved revision as the conflict baseline. Only the
        // draft adopts the snapshot; applyDraft validates and saves it before
        // archiving the displaced value, including an empty initial overlay.
        this.state.saved = currentRaw;
        this.state.draft = snapshot.raw;
        this.state.buffers.clear();
        await this.applyDraft();
      })().catch(() => {
        feedback.setText(t('settings.backend.recovery.failed'));
        confirm.disabled = false;
        cancel.disabled = false;
      });
    });
    confirm.focus();
  }

  private renderFooter(parent: HTMLElement): void {
    const footer = parent.createDiv({ cls: 'opencodian-opencode2-footer' });
    footer.createDiv({ cls: 'opencodian-opencode2-save-status', attr: { role: 'status', 'aria-live': 'polite' } });
    this.button(footer, oc2('discard'), () => {
      this.state.saved = this.plugin.settings.backendSettings.opencode2.configContent ?? '';
      this.state.draft = this.state.saved; this.state.buffers.clear(); this.state.feedback = ''; this.repaint();
    }).setAttribute('data-action', 'discard');
    this.button(footer, oc2('apply'), () => this.applyDraft()).setAttribute('data-action', 'apply');
    this.updateFooters();
  }

  private updateFooters(): void {
    const dirty = this.state.draft !== this.state.saved || this.state.buffers.size > 0;
    const invalid = !this.document() || [...this.state.buffers.values()].some((buffer) => buffer.invalid);
    for (const { root } of this.mounts) {
      root.querySelector('.opencodian-opencode2-save-status')?.setText(invalid ? oc2('invalidJson') : this.state.saving ? oc2('applying') : this.state.feedback || oc2(dirty ? 'unsaved' : 'unchanged'));
      const apply = root.querySelector<HTMLButtonElement>('[data-action="apply"]');
      if (apply) apply.disabled = !dirty || invalid || !this.local() || this.state.saving || this.conflict();
      const discard = root.querySelector<HTMLButtonElement>('[data-action="discard"]');
      if (discard) discard.disabled = (!dirty && !this.conflict()) || this.state.saving;
    }
  }

  private async applyDraft(): Promise<void> {
    if (!this.local() || this.state.saving || !this.document() || this.conflict()
      || [...this.state.buffers.values()].some((buffer) => buffer.invalid)) return;
    const adapter = this.getAdapter();
    if (!adapter?.validateConfigContent) { this.state.feedback = oc2('unavailable'); this.updateFooters(); return; }
    const submitted = this.state.draft;
    const previous = this.state.saved;
    this.state.saving = true; this.repaint();
    try {
      await adapter.validateConfigContent(submitted);
      if (!this.current()) return;
      await this.plugin.saveSettings();
      if (!this.current()) return;
      this.state.saved = this.plugin.settings.backendSettings.opencode2.configContent ?? '';
      this.state.draft = this.state.saved;
      this.state.buffers.clear();
      // The previous SAVED configuration is snapshotted machine-locally after
      // the successful apply; a recovery-write failure never claims the apply
      // failed, because the saved state is already authoritative.
      let historyUnavailable = false;
      const identity = this.configRecoveryIdentity();
      if (identity && previous !== submitted) {
        try {
          this.recovery.archive(identity, OC2_RECOVERY_KEY, previous);
        } catch { historyUnavailable = true; }
      }
      this.state.feedback = oc2('applied') + (historyUnavailable ? ` ${t('settings.backend.recovery.historyUnavailable' as TranslationKey)}` : '');
      this.state.updatedAt = 0;
      await this.loadCatalog(true);
    } catch {
      if (this.current()) {
        this.plugin.settings.backendSettings.opencode2.configContent = previous;
        this.state.feedback = oc2('applyFailed');
      }
    } finally { this.state.saving = false; this.repaint(); }
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
        new Notice(getSettingsCatalogFailureMessage(error));
      }
    };
    for (const integration of catalog.integrations) {
      const group = containerEl.createEl('details', { cls: 'opencodian-opencode2-disclosure' });
      group.createEl('summary', { text: integration.name });
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
                        new Notice(getSettingsCatalogFailureMessage(error));
                      }
                    }));
                  row.addButton((control) => control
                    .setButtonText(t('settings.agent.opencode2.auth.cancel'))
                    .onClick(() => run(() => adapter.cancelIntegrationOAuth(
                      integration.id,
                      attempt.attemptID,
                    ))));
                } catch (error) {
                  new Notice(getSettingsCatalogFailureMessage(error));
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


  private getAdapter(): OpenCode2AdapterPort | undefined {
    return this.plugin.agentServiceRegistry?.get?.('opencode2') as OpenCode2AdapterPort | undefined;
  }
}
