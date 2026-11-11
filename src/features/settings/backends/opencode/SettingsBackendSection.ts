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
interface OpenCode2CatalogEntry {
  name?: string;
  id?: string;
  description?: string;
  mode?: string;
  model?: unknown;
  system?: string;
  hidden?: boolean;
  disabled?: boolean;
  steps?: number;
}
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

type OpenCode2Tab = 'connection' | 'model' | 'agents' | 'permissions' | 'context' | 'tools' | 'mcp' | 'configuration' | 'advanced';
/** Recovery copy keys land with the next locales drop; cast until then. */
function rc2(key: string, params?: Record<string, string | number>): string {
  return t(`settings.opencode2.workspace.${key}` as TranslationKey, params);
}
type ConfigPath = string[];
type ModelProvider = { id: string; name: string; models: Array<{ id: string; name: string; variants?: string[] }> };
type CatalogSummary = Awaited<ReturnType<OpenCode2AdapterPort['readConfigurationSummary']>>;
interface OpenCode2RuleControls {
  original: Record<string, unknown>;
  action: HTMLSelectElement;
  custom: HTMLInputElement;
  resource: HTMLInputElement;
  effect: HTMLSelectElement;
}
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
  buffers: Map<string, { text: string; invalid: boolean; message?: string }>;
  rawDraft?: string;
  creating: Set<string>;
  searches: Record<string, string>;
  transports: Map<string, Record<string, unknown>>;
}
interface OpenCode2Mount { root: HTMLElement; tab: OpenCode2Tab }
const OPENCODE2_WORKSPACES = new WeakMap<SettingsOpenCode2Host, OpenCode2WorkspaceState>();
const OPENCODE2_TABS: readonly OpenCode2Tab[] = ['connection', 'model', 'agents', 'permissions', 'context', 'tools', 'mcp', 'configuration', 'advanced'];
const OPENCODE2_TAB_LABELS: Record<OpenCode2Tab, TranslationKey> = {
  connection: 'settings.opencode2.tab.connection', model: 'settings.opencode2.tab.model',
  agents: 'settings.opencode2.tab.agents', permissions: 'settings.opencode2.tab.permissions',
  context: 'settings.opencode2.tab.context', tools: 'settings.opencode2.tab.tools',
  mcp: 'settings.opencode2.tab.mcp', configuration: 'settings.opencode2.tab.configuration', advanced: 'settings.opencode2.tab.advanced',
};
/** Merged-page destinations for retired secondary-tab ids; the registry alias map stays authoritative. */
const OPENCODE2_TAB_ALIASES: Readonly<Record<string, OpenCode2Tab>> = {
  resources: 'configuration', catalog: 'advanced',
  auth: 'model', integrations: 'model', models: 'model', extensions: 'configuration',
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
      failure: '', saving: false, feedback: '', selected: {}, buffers: new Map(),
      creating: new Set(), searches: {}, transports: new Map(),
    };
    if (!this.state.saving && this.state.saved !== saved && this.state.draft === this.state.saved && !this.state.buffers.size && this.state.rawDraft === undefined) {
      this.state.saved = saved;
      this.state.draft = saved;
      this.state.buffers.clear(); this.state.searches = {}; this.state.transports.clear(); this.state.creating.clear();
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
    const open = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>('details[open]')).map((details) => details.dataset.disclosureKey));
    const scroll = root.querySelector('.opencodian-opencode2-list')?.scrollTop ?? 0;
    const focus = this.captureFocus(root);
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
    for (const details of Array.from(root.querySelectorAll<HTMLDetailsElement>('details'))) {
      if (open.has(details.dataset.disclosureKey)) details.open = true;
    }
    const list = root.querySelector('.opencodian-opencode2-list');
    if (list) list.scrollTop = scroll;
    this.restoreFocus(root, focus);
  }

  private captureFocus(root: HTMLElement): { label: string; fieldKey?: string; ordinal: number; cursor: number | null } | undefined {
    const active = root.ownerDocument.activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!active || !root.contains(active) || !active.matches('input[aria-label], textarea[aria-label], select[aria-label]')) return;
    const label = active.getAttribute('aria-label')!;
    const fieldKey = active.closest<HTMLElement>('[data-config-key]')?.dataset.configKey;
    const peers = Array.from(root.querySelectorAll<HTMLElement>('[aria-label]')).filter((element) => element.getAttribute('aria-label') === label && element.closest<HTMLElement>('[data-config-key]')?.dataset.configKey === fieldKey);
    const cursor = active.tagName === 'SELECT' ? null : (active as HTMLInputElement).selectionStart;
    return { label, fieldKey, ordinal: peers.indexOf(active), cursor };
  }

  private restoreFocus(root: HTMLElement, focus: ReturnType<SettingsOpenCode2Section['captureFocus']>): void {
    if (!focus) return;
    const candidates = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[aria-label], textarea[aria-label], select[aria-label]'))
      .filter((element) => element.getAttribute('aria-label') === focus.label && element.closest<HTMLElement>('[data-config-key]')?.dataset.configKey === focus.fieldKey);
    const next = candidates[focus.ordinal];
    if (!next || next.disabled || next.hidden) return;
    next.focus({ preventScroll: true });
    const textInput = next.tagName === 'TEXTAREA' || (next.tagName === 'INPUT' && ['text', 'search'].includes((next as HTMLInputElement).type));
    if (focus.cursor !== null && textInput) (next as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(focus.cursor, focus.cursor);
  }

  private renderPage(body: HTMLElement, tab: OpenCode2Tab): void {
    switch (tab) {
      case 'connection': this.renderConnection(body); break;
      case 'model': this.renderModel(body); break;
      case 'agents': this.renderAgents(body); break;
      case 'permissions': this.renderPermissions(body); break;
      case 'context': this.renderContext(body); this.renderSources(body); break;
      case 'tools': this.renderCommands(body); break;
      case 'mcp': this.renderExtensions(body); break;
      case 'configuration': this.renderConfiguration(body); break;
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
    if (!this.editable()) return;
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
    const owner = parent.closest<HTMLElement>('[data-definition-path]')?.dataset.definitionPath ?? '';
    const details = parent.createEl('details', { cls: 'opencodian-opencode2-disclosure', attr: { 'data-disclosure-key': `${owner}:${title}` } });
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

  private editable(): boolean {
    return this.local() && !this.state.saving && this.state.rawDraft === undefined && !!this.document() && !this.conflict();
  }

  /** Catalog readbacks are current runtime values, never fabricated configuration defaults. */
  private inheritedValue(path: ConfigPath): unknown {
    if (path[0] === 'agents' && path.length === 3 && path[2] !== 'permissions') {
      const entry = this.catalog?.agents.find((agent) => (agent.id ?? agent.name) === path[1]);
      return entry ? (entry as unknown as Record<string, unknown>)[path[2]] : undefined;
    }
    if (path[0] === 'providers' && path[2] === 'models' && path[4] === 'name') {
      return this.state.models.find((provider) => provider.id === path[1])?.models.find((model) => model.id === path[3])?.name;
    }
    return undefined;
  }

  private clearBuffers(path: ConfigPath): void {
    for (const key of this.state.buffers.keys()) {
      const candidate = JSON.parse(key) as ConfigPath;
      if (path.every((part, index) => candidate[index] === part)) this.state.buffers.delete(key);
    }
  }

  private fieldSource(path: ConfigPath, present: boolean): string {
    if (present) return oc2('override');
    return path[0] === 'mcp' && path.length > 3 && this.value(path.slice(0, 3)) !== undefined ? rc2('mcpFieldDefault') : oc2('inherited');
  }

  private field(parent: HTMLElement, path: ConfigPath, label: string, description: string): HTMLElement {
    const row = parent.createDiv({ cls: 'setting-item opencodian-opencode2-field', attr: {
      'data-config-path': path.join('.'), 'data-config-key': JSON.stringify(path),
    } });
    const info = row.createDiv({ cls: 'setting-item-info' });
    const title = info.createDiv({ cls: 'setting-item-name', text: label });
    title.createSpan({ cls: 'opencodian-opencode2-badge', text: this.fieldSource(path, this.value(path) !== undefined) });
    if (description) info.createDiv({ cls: 'setting-item-description', text: description });
    const host = row.createDiv({ cls: 'setting-item-control' });
    if (path[0] === 'mcp' && path.length === 4 && ['type', 'command', 'url'].includes(path[3])) return host;
    if (parent.closest<HTMLElement>('[data-definition-path]')?.dataset.definitionPath === JSON.stringify(path)) return host;
    const reset = this.button(host, rc2(path[0] === 'mcp' && path.length > 3 ? 'mcpFieldRestore' : 'fieldRestore'), () => {
      this.clearBuffers(path); this.setValue(path, undefined); this.repaint();
    }, !this.editable() || this.value(path) === undefined);
    reset.classList.add('opencodian-opencode2-reset');
    reset.dataset.configAction = 'reset';
    reset.hidden = this.value(path) === undefined;
    return host;
  }

  private bindValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, path: ConfigPath, transform: (text: string) => unknown): void {
    const key = JSON.stringify(path);
    const buffered = this.state.buffers.get(key);
    const host = control.parentElement!;
    const status = host.querySelector<HTMLElement>('.opencodian-opencode2-field-error')
      ?? host.createDiv({ cls: 'opencodian-opencode2-field-error', attr: { role: 'status' } });
    if (buffered?.invalid) status.setText(buffered.message ?? rc2('collectionInvalid'));
    control.disabled = !this.editable();
    control.dataset.configControl = 'true';
    control.setAttribute('aria-invalid', String(buffered?.invalid ?? false));
    control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (!this.editable()) return;
      try {
        const value = transform(control.value);
        this.state.buffers.delete(key);
        this.setValue(path, value);
        status.setText(''); control.setAttribute('aria-invalid', 'false');
      } catch (error) {
        const message = error instanceof Error ? error.message : oc2('invalidJson');
        this.state.buffers.set(key, { text: control.value, invalid: true, message });
        status.setText(message);
        control.setAttribute('aria-invalid', 'true');
      }
      this.updateFooters();
    });
  }

  private textField(parent: HTMLElement, path: ConfigPath, label: string, options: { description?: string; multiline?: boolean; required?: boolean } = {}): void {
    const { description = '', multiline = false, required = false } = options;
    const host = this.field(parent, path, label, description);
    const value = this.value(path) ?? this.inheritedValue(path);
    const input = multiline ? host.createEl('textarea') : host.createEl('input', { type: 'text' });
    input.setAttribute('aria-label', label);
    input.placeholder = rc2('fieldUnknown');
    input.value = this.state.buffers.get(JSON.stringify(path))?.text ?? (typeof value === 'string' ? value : '');
    if (multiline) host.parentElement?.addClass('opencodian-opencode2-wide');
    this.bindValue(input, path, (text) => {
      if (required && !text.trim()) throw new Error(rc2('fieldRequired'));
      return text || undefined;
    });
  }

  private numberField(parent: HTMLElement, path: ConfigPath, label: string, options: string | { description?: string; min?: number } = ''): void {
    const { description = '', min = 0 } = typeof options === 'string' ? { description: options } : options;
    const host = this.field(parent, path, label, description);
    const input = host.createEl('input', { type: 'number', attr: { min: String(min), step: '1', 'aria-label': label } });
    const value = this.value(path) ?? this.inheritedValue(path);
    input.value = this.state.buffers.get(JSON.stringify(path))?.text ?? (typeof value === 'number' ? String(value) : '');
    input.placeholder = oc2('inherited');
    this.bindValue(input, path, (text) => {
      if (!text) return undefined;
      const value = Number(text);
      if (!Number.isInteger(value) || value < min || !input.validity.valid) throw new Error(rc2('fieldNumberInvalid', { min }));
      return value;
    });
  }

  private selectField(parent: HTMLElement, path: ConfigPath, label: string, config: { values: Array<[string, string]>; description?: string; boolean?: boolean }): void {
    const { values: options, description = '', boolean = false } = config;
    const host = this.field(parent, path, label, description);
    const input = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
    const inherited = this.inheritedValue(path);
    const inheritedLabel = options.find(([value]) => value === String(inherited))?.[1];
    input.createEl('option', { attr: { value: '' }, text: this.fieldSource(path, false) + (inheritedLabel ? ` · ${inheritedLabel}` : '') });
    for (const [value, text] of options) input.createEl('option', { attr: { value }, text });
    const value = this.value(path);
    if (value !== undefined && !options.some(([option]) => option === String(value))) input.createEl('option', { attr: { value: String(value) }, text: String(value) });
    input.value = value === undefined ? '' : String(value);
    this.bindValue(input, path, (text) => text === '' ? undefined : boolean ? text === 'true' : text);
  }

  private booleanField(parent: HTMLElement, path: ConfigPath, label: string, description = ''): void {
    const key = path.at(-1);
    const values: Array<[string, string]> = key === 'hidden' ? [['true', rc2('trueHidden')], ['false', rc2('falseHidden')]]
      : key === 'disabled' ? [['true', rc2('trueDisabled')], ['false', rc2('falseDisabled')]]
        : [['true', oc2('enabled')], ['false', oc2('disabled')]];
    this.selectField(parent, path, label, { values, description, boolean: true });
  }

  private jsonField(parent: HTMLElement, path: ConfigPath, label: string, options: { kind: 'object' | 'array' | 'any'; description?: string }): void {
    const { kind, description = '' } = options;
    const host = this.field(parent, path, label, description);
    host.parentElement?.addClass('opencodian-opencode2-wide');
    const input = host.createEl('textarea', { cls: 'opencodian-config-editor', attr: { 'aria-label': label, rows: '5', spellcheck: 'false' } });
    const buffer = this.state.buffers.get(JSON.stringify(path));
    input.value = buffer?.text ?? (this.value(path) === undefined ? '' : JSON.stringify(this.value(path), null, 2));
    input.placeholder = kind === 'array' ? '[]' : '{}';
    this.bindValue(input, path, (text) => {
      const errors: ParseError[] = [];
      const value: unknown = text.trim() ? parse(text, errors, { allowTrailingComma: true }) : undefined;
      const wrongShape = value !== undefined && (kind === 'array' ? !Array.isArray(value)
        : kind === 'object' ? !value || typeof value !== 'object' || Array.isArray(value) : false);
      if (errors.length || wrongShape) throw new Error(oc2('invalidJson'));
      return value;
    });
  }

  private linesField(parent: HTMLElement, path: ConfigPath, label: string, description: string): void {
    const value = this.value(path);
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      this.jsonField(parent, path, label, { kind: 'array', description });
      return;
    }
    const host = this.field(parent, path, label, `${description} ${rc2('sourcesLinesDesc')}`);
    host.parentElement?.addClass('opencodian-opencode2-wide');
    const input = host.createEl('textarea', { attr: { 'aria-label': label, rows: '4', spellcheck: 'false' } });
    input.value = this.state.buffers.get(JSON.stringify(path))?.text ?? (Array.isArray(value) ? value.join('\n') : '');
    this.bindValue(input, path, (text) => text.trim() ? text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : undefined);
  }

  private modelField(parent: HTMLElement, path: ConfigPath, label: string, description = ''): void {
    const host = this.field(parent, path, label, description);
    const key = JSON.stringify(path);
    const select = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label, 'data-config-control': 'true' } });
    select.createEl('option', { text: oc2('inherited'), attr: { value: '' } });
    const options = this.modelOptions();
    for (const [value, text] of options) select.createEl('option', { text, attr: { value } });
    select.createEl('option', { text: oc2('modelReference'), attr: { value: '__custom__' } });
    const stored = this.value(path);
    const reference = this.modelReference(stored ?? this.inheritedValue(path));
    const custom = host.createEl('input', { type: 'text', attr: { 'aria-label': `${label} · ${oc2('modelReference')}` } });
    custom.value = this.state.buffers.get(key)?.text ?? reference;
    custom.placeholder = 'provider/model#variant';
    select.value = this.state.searches[`model:${key}`] === 'custom' || this.state.buffers.has(key) ? '__custom__'
      : stored === undefined ? '' : options.some(([value]) => value === reference) ? reference : '__custom__';
    custom.hidden = select.value !== '__custom__';
    select.disabled = !this.editable();
    this.bindValue(custom, path, (text) => {
      if (!/^[^/#\s]+\/[^#\s]+(#[^\s]+)?$/.test(text)) throw new Error(oc2('modelReference'));
      return text;
    });
    select.addEventListener('change', () => {
      if (!this.editable()) return;
      custom.hidden = select.value !== '__custom__';
      if (select.value === '__custom__') {
        this.state.searches[`model:${key}`] = 'custom';
        if (!custom.value) {
          this.state.buffers.set(key, { text: '', invalid: true });
          host.querySelector('.opencodian-opencode2-field-error')?.setText(rc2('fieldRequired'));
          custom.setAttribute('aria-invalid', 'true');
        }
        custom.focus();
      } else {
        delete this.state.searches[`model:${key}`];
        this.clearBuffers(path);
        this.setValue(path, select.value || undefined);
        host.querySelector('.opencodian-opencode2-field-error')?.setText('');
        custom.setAttribute('aria-invalid', 'false');
      }
      this.updateFooters();
    });
  }

  private modelReference(value: unknown): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const reference = value as { providerID?: string; model?: string; variant?: string };
    return reference.providerID && reference.model ? `${reference.providerID}/${reference.model}${reference.variant ? `#${reference.variant}` : ''}` : '';
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
    const sources = this.group(parent, oc2('configSources'), oc2('configSourcesDesc'));
    new Setting(sources).setName(rc2('configNativeSource')).setDesc(rc2('configNativeSourceDesc'));
    new Setting(sources).setName(rc2(this.local() ? 'configVaultSource' : 'configRemoteSource'))
      .setDesc(rc2(this.local() ? this.state.saved.trim() ? 'configVaultSaved' : 'configVaultEmpty' : 'configRemoteSourceDesc'));
  }

  private modelOptions(): Array<[string, string]> {
    return this.state.models.flatMap((provider) => provider.models.map((model): [string, string] => [`${provider.id}/${model.id}`, `${provider.name} / ${model.name}`]));
  }

  private renderModel(parent: HTMLElement): void {
    this.modelField(this.group(parent, oc2('defaultModel')), ['model'], oc2('chatModel'), oc2('chatModelDesc'));
    this.renderMapEditor(this.group(parent, oc2('providers')), 'providers', {
      catalog: this.state.models.map(({ id, name }) => ({ id, name })),
      fields: (editor, path) => {
        this.textField(editor, [...path, 'package'], oc2('providerPackage'), { description: oc2('providerPackageDesc') });
        this.textField(editor, [...path, 'settings', 'baseURL'], oc2('baseUrl'));
        this.renderProviderModels(editor, path);
        this.jsonField(this.disclosure(editor, oc2('providerAdvanced')), [...path, 'settings'], oc2('providerSettings'), { kind: 'object', description: oc2('credentialsHint') });
      },
    });
    const auxiliary = this.disclosure(parent, t('settings.opencode2.model.title'));
    this.renderTitleSettings(auxiliary);
    SettingsInlineEditSection.renderBackendModelOverrides(auxiliary, 'opencode2', this.plugin);
    const auth = this.disclosure(parent, oc2('authentication'));
    this.notice(auth, oc2('authenticationDesc'));
    if (this.catalog) this.renderAuthCatalog(auth, this.catalog); else this.notice(auth, oc2('catalogPending'));
  }

  private renderProviderModels(parent: HTMLElement, providerPath: ConfigPath): void {
    const base = [...providerPath, 'models'];
    const key = JSON.stringify(base);
    const catalog = this.state.models.find((provider) => provider.id === providerPath[1])?.models ?? [];
    const ids = this.definitionIds(base, catalog);
    const section = parent.createDiv({ cls: 'opencodian-opencode2-models', attr: { 'data-models-path': key } });
    const header = section.createDiv({ cls: 'opencodian-opencode2-subheader' });
    header.createEl('h6', { text: rc2('modelCount', { count: ids.length }) });
    this.button(header, rc2('modelAdd'), () => { this.state.creating.add(key); this.repaint(); }, !this.editable()).dataset.configAction = 'add';
    section.createEl('p', { cls: 'setting-item-description', text: rc2('modelHint') });
    this.createDefinition(section, base, oc2('modelsConfig'), ids);
    const list = section.createDiv({ cls: 'opencodian-opencode2-model-list' });
    const selected = this.state.selected[key];
    for (const id of ids) {
      const path = [...base, id];
      const name = this.value([...path, 'name']) ?? catalog.find((model) => model.id === id)?.name ?? id;
      const button = this.button(list, '', () => { this.state.selected[key] = selected === id ? '' : id; this.repaint(); });
      button.classList.add('opencodian-opencode2-model-item');
      button.dataset.modelId = id;
      button.setAttribute('aria-expanded', String(selected === id));
      const copy = button.createSpan({ cls: 'opencodian-opencode2-item-copy' });
      copy.createSpan({ text: String(name), cls: 'opencodian-opencode2-item-name' });
      copy.createSpan({ text: `${providerPath[1]}/${id}`, cls: 'opencodian-opencode2-list-meta' });
    }
    if (!ids.length) this.notice(section, rc2('collectionEmpty'));
    if (!selected || !ids.includes(selected)) return;
    const path = [...base, selected];
    const editor = section.createDiv({ cls: 'opencodian-opencode2-model-editor', attr: { 'data-definition-path': JSON.stringify(path) } });
    editor.createEl('h6', { text: `${oc2('agentModel')} · ${providerPath[1]}/${selected}` });
    this.textField(editor, [...path, 'name'], rc2('modelName'));
    this.textField(editor, [...path, 'modelID'], rc2('modelId'));
    const advanced = this.disclosure(editor, rc2('modelAdvanced'));
    this.numberField(advanced, [...path, 'limit', 'context'], rc2('modelContext'), { description: 'Token', min: 1 });
    this.numberField(advanced, [...path, 'limit', 'output'], rc2('modelOutput'), { description: 'Token', min: 1 });
    this.jsonField(advanced, [...path, 'settings'], rc2('modelSettings'), { kind: 'object' });
    this.jsonField(advanced, [...path, 'variants'], rc2('modelVariants'), { kind: 'array' });
    const runtime = catalog.some((model) => model.id === selected);
    const actions = editor.createDiv({ cls: 'opencodian-opencode2-model-actions' });
    const remove = this.button(actions, rc2(runtime ? 'modelRestore' : 'modelRemove'), () => {
      this.clearBuffers(path); this.setValue(path, undefined); delete this.state.selected[key]; this.repaint();
    }, !this.editable() || this.value(path) === undefined);
    remove.dataset.configAction = 'remove-record'; remove.dataset.definitionPath = JSON.stringify(path);
  }

  private definitionIds(base: ConfigPath, catalog: OpenCode2CatalogEntry[]): string[] {
    const configured = this.value(base);
    return [...new Set([...catalog.map((entry) => entry.id ?? entry.name ?? '').filter(Boolean),
      ...(configured && typeof configured === 'object' && !Array.isArray(configured) ? Object.keys(configured) : [])])];
  }

  private definitionState(path: ConfigPath, runtime: boolean): string {
    const current = this.value(path);
    if ([...this.state.buffers].some(([key, value]) => value.invalid && path.every((part, index) => (JSON.parse(key) as ConfigPath)[index] === part))) return rc2('collectionInvalid');
    if (current === undefined) return rc2('collectionInherited');
    let saved: unknown = this.state.saved.trim() ? parse(this.state.saved) : {};
    for (const part of path) saved = saved && typeof saved === 'object' ? (saved as Record<string, unknown>)[part] : undefined;
    if (JSON.stringify(current) !== JSON.stringify(saved)) return rc2(runtime ? 'collectionDirty' : 'collectionNew');
    return runtime ? oc2('override') : rc2('collectionCustom');
  }

  private definitionSummary(path: ConfigPath, entry?: OpenCode2CatalogEntry): string {
    const description = this.value([...path, 'description']);
    if (typeof description === 'string') return description;
    if (entry?.description) return entry.description;
    if (path[0] === 'providers') {
      const models = this.definitionIds([...path, 'models'], this.state.models.find((provider) => provider.id === path[1])?.models ?? []);
      return rc2('collectionCount', { count: models.length });
    }
    if (path[0] === 'references') {
      const value = this.value(path);
      const local = typeof value === 'string' ? value : this.value([...path, 'path']);
      const repository = this.value([...path, 'repository']);
      if (typeof local === 'string') return rc2('referenceSummaryLocal', { path: local });
      if (typeof repository === 'string') return rc2('referenceSummaryRepo', { repository });
      return rc2('fieldUnknown');
    }
    if (path[0] === 'mcp') {
      const type = this.value([...path, 'type']);
      const status = this.catalog?.mcp.find((server) => server.name === path.at(-1))?.status.status;
      return type === 'local' ? oc2('localProcess') : type === 'remote' ? oc2('remoteHttp') : status ?? oc2('runtimeDefinition');
    }
    if (path[0] === 'commands' && !entry) return rc2('collectionNoDescription');
    return entry?.mode ?? oc2('runtimeDefinition');
  }

  private createDefinition(parent: HTMLElement, base: ConfigPath, title: string, ids: string[]): void {
    const key = JSON.stringify(base);
    if (!this.state.creating.has(key)) return;
    const form = parent.createEl('form', { cls: 'opencodian-opencode2-create' });
    const label = form.createEl('label', { text: oc2('newId') });
    const input = label.createEl('input', { type: 'text', attr: { 'aria-label': rc2('collectionAdd', { name: title }), placeholder: oc2('newId') } });
    input.value = this.state.searches[`create:${key}`] ?? '';
    input.addEventListener('input', () => { this.state.searches[`create:${key}`] = input.value; });
    const actions = form.createDiv({ cls: 'opencodian-opencode2-toolbar' });
    const error = form.createDiv({ cls: 'opencodian-opencode2-field-error', attr: { role: 'status' } });
    const create = (): void => {
      if (!this.editable()) return;
      const id = input.value.trim();
      if (!/^[\w./@:-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) { error.setText(oc2('invalidName')); return; }
      if (ids.includes(id)) { error.setText(oc2('alreadyExists')); return; }
      const value = base[0] === 'commands' ? { template: '' } : base[0] === 'mcp' ? { type: 'local', command: [] } : {};
      this.setValue([...base, id], value);
      this.state.selected[key] = id;
      this.state.creating.delete(key); delete this.state.searches[`create:${key}`];
      this.repaint();
    };
    this.button(actions, rc2('collectionCreate', { name: title }), create, !this.editable());
    this.button(actions, rc2('cancel'), () => { this.state.creating.delete(key); this.repaint(); });
    form.addEventListener('submit', (event) => { event.preventDefault(); create(); });
  }

  private renderMapEditor(parent: HTMLElement, key: string, options: { catalog: OpenCode2CatalogEntry[]; fields: (editor: HTMLElement, path: ConfigPath) => void; nested?: string[] }): void {
    const { catalog, fields, nested = [] } = options;
    const base = [key, ...nested];
    const collectionKey = JSON.stringify(base);
    const ids = this.definitionIds(base, catalog);
    const original = parent.querySelector('h4');
    const title = original?.textContent ?? oc2('definitionList');
    original?.remove();
    parent.querySelector(':scope > .setting-item-description')?.remove();
    parent.addClass('opencodian-opencode2-collection');
    parent.setAttribute('role', 'region'); parent.setAttribute('aria-label', title);
    parent.dataset.collectionPath = collectionKey;
    const header = parent.createDiv({ cls: 'opencodian-opencode2-collection-header' });
    header.createEl('h4', { text: title });
    header.createSpan({ cls: 'opencodian-opencode2-count', text: rc2('collectionCount', { count: ids.length }) });
    const add = this.button(header, rc2('collectionAdd', { name: title }), () => { this.state.creating.add(collectionKey); this.repaint(); }, !this.editable());
    add.dataset.configAction = 'add';
    parent.createEl('p', { cls: 'opencodian-opencode2-collection-note', text: rc2('collectionHint') });
    this.createDefinition(parent, base, title, ids);
    if (!ids.length) { this.notice(parent, rc2('collectionEmpty')); return; }
    const selected = ids.includes(this.state.selected[collectionKey]) ? this.state.selected[collectionKey] : ids[0];
    this.state.selected[collectionKey] = selected;
    const split = parent.createDiv({ cls: 'opencodian-opencode2-split' });
    const index = split.createDiv({ cls: 'opencodian-opencode2-index' });
    const search = index.createEl('input', { type: 'search', cls: 'opencodian-opencode2-search', attr: {
      'aria-label': rc2('collectionSearch', { name: title }), placeholder: rc2('collectionSearch', { name: title }),
    } });
    search.value = this.state.searches[collectionKey] ?? '';
    const list = index.createDiv({ cls: 'opencodian-opencode2-list', attr: { 'aria-label': oc2('definitionList') } });
    for (const id of ids) {
      const entry = catalog.find((candidate) => (candidate.id ?? candidate.name) === id);
      const button = this.button(list, '', () => {
        const mount = this.mounts.find(({ root }) => root.contains(parent));
        this.state.selected[collectionKey] = id; this.repaint();
        const collection = Array.from(mount?.root.querySelectorAll<HTMLElement>('[data-collection-path]') ?? [])
          .find((element) => element.dataset.collectionPath === collectionKey);
        const next = Array.from(collection?.querySelectorAll<HTMLButtonElement>('.opencodian-opencode2-item') ?? []).find((item) => item.dataset.resourceId === id);
        next?.focus({ preventScroll: true });
        const width = collection?.getBoundingClientRect().width ?? 0;
        if (width > 0 && width <= 720) collection?.querySelector('.opencodian-opencode2-editor')?.scrollIntoView?.({ block: 'start' });
      });
      button.classList.add('opencodian-opencode2-item');
      button.dataset.resourceId = id;
      button.dataset.definitionPath = JSON.stringify([...base, id]);
      button.dataset.runtimeDefinition = String(!!entry);
      button.setAttribute('aria-pressed', String(id === selected));
      const copy = button.createSpan({ cls: 'opencodian-opencode2-item-copy' });
      copy.createSpan({ text: entry?.name ?? id, cls: 'opencodian-opencode2-item-name' });
      copy.createSpan({ text: this.definitionSummary([...base, id], entry), cls: 'opencodian-opencode2-list-meta' });
      button.createSpan({ text: this.definitionState([...base, id], !!entry), cls: 'opencodian-opencode2-item-state' });
    }
    const empty = index.createDiv({ cls: 'opencodian-opencode2-empty', text: rc2('collectionNoMatches') });
    const filter = (): void => {
      this.state.searches[collectionKey] = search.value;
      let visible = 0;
      for (const button of Array.from(list.querySelectorAll<HTMLButtonElement>('button'))) {
        button.hidden = !(button.textContent ?? '').toLowerCase().includes(search.value.toLowerCase());
        if (!button.hidden) visible += 1;
      }
      empty.hidden = visible > 0;
    };
    search.addEventListener('input', filter); filter();
    const path = [...base, selected];
    const runtime = catalog.some((entry) => (entry.id ?? entry.name) === selected);
    const editor = split.createDiv({ cls: 'opencodian-opencode2-editor', attr: { role: 'region', 'aria-label': rc2('collectionOwner', { name: title, id: selected }) } });
    editor.dataset.definitionPath = JSON.stringify(path);
    const editorHeader = editor.createDiv({ cls: 'opencodian-opencode2-editor-header' });
    const copy = editorHeader.createDiv();
    copy.createEl('h5', { text: rc2('collectionOwner', { name: title, id: selected }) });
    copy.createDiv({ cls: 'opencodian-opencode2-editor-id', text: rc2('collectionIdentity', { id: selected }) });
    copy.createDiv({ cls: 'opencodian-opencode2-editor-status', text: rc2('collectionTiming') });
    this.button(editorHeader, rc2('collectionBack'), () => { index.scrollIntoView?.({ block: 'start' }); search.focus({ preventScroll: true }); }).classList.add('opencodian-opencode2-back');
    if (runtime && (key === 'commands' || key === 'mcp')) this.notice(editor, rc2('recordRuntimeOnly'));
    fields(editor.createDiv({ cls: 'opencodian-opencode2-editor-fields' }), path);
    this.renderDefinitionActions(editor, path, runtime);
  }

  private renderDefinitionActions(parent: HTMLElement, path: ConfigPath, runtime: boolean): void {
    const footer = parent.createDiv({ cls: 'opencodian-opencode2-editor-footer' });
    footer.createSpan({ text: `${rc2('collectionScope')} · ${path.at(-1)}`, cls: 'setting-item-description' });
    const remove = (): void => { this.clearBuffers(path); this.setValue(path, undefined); this.repaint(); };
    const button = this.button(footer, rc2(runtime ? 'collectionRestore' : 'collectionRemove'), () => {
      if (!this.editable()) return;
      if (runtime) { remove(); return; }
      if (parent.querySelector('.opencodian-opencode2-confirm')) return;
      const confirm = parent.createDiv({ cls: 'opencodian-opencode2-confirm' });
      confirm.createEl('p', { text: rc2('collectionRemoveConfirm', { id: path.at(-1) ?? '' }) });
      this.button(confirm, rc2('confirmRemove'), remove, !this.editable());
      this.button(confirm, rc2('cancel'), () => confirm.remove());
    }, !this.editable() || this.value(path) === undefined);
    button.dataset.configAction = runtime ? 'restore-record' : 'remove-record';
    button.dataset.definitionPath = JSON.stringify(path);
  }

  private renderAgents(parent: HTMLElement): void {
    const defaults = this.group(parent, oc2('agentDefaults'));
    const catalogAgents = this.definitionIds(['agents'], this.catalog?.agents ?? []).filter((id) => {
      const mode = this.value(['agents', id, 'mode']) ?? this.inheritedValue(['agents', id, 'mode']);
      const disabled = this.value(['agents', id, 'disabled']) ?? this.inheritedValue(['agents', id, 'disabled']);
      return mode !== 'subagent' && disabled !== true;
    });
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
      this.modelField(editor, [...path, 'model'], oc2('agentModel'), oc2('variantHint'));
      this.selectField(editor, [...path, 'mode'], oc2('agentMode'), { values: [['primary', oc2('primaryAgent')], ['subagent', oc2('subagent')], ['all', oc2('allModes')]], description: rc2('modeDesc') });
      this.textField(editor, [...path, 'system'], oc2('systemPrompt'), { description: oc2('systemPromptDesc'), multiline: true });
      const advanced = this.disclosure(editor, oc2('agentAdvanced'));
      this.booleanField(advanced, [...path, 'hidden'], oc2('hiddenAgent'), rc2('hiddenAgentDesc'));
      this.booleanField(advanced, [...path, 'disabled'], oc2('disableAgent'), rc2('disableAgentDesc'));
      this.numberField(advanced, [...path, 'steps'], oc2('agentSteps'), { description: rc2('agentStepsDesc'), min: 1 });
      this.renderRules(advanced, [...path, 'permissions'], oc2('agentPermissions'));
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
    this.renderRules(this.group(parent, oc2('permissionRules'), oc2('permissionRulesDesc')), ['permissions'], oc2('orderedPermissions'));
  }

  private renderRules(parent: HTMLElement, path: ConfigPath, label: string): void {
    const key = JSON.stringify(path);
    const buffer = this.state.buffers.get(key);
    const value: unknown = buffer ? parse(buffer.text) : this.value(path);
    const rules = Array.isArray(value) ? value : [];
    if ((value !== undefined && !Array.isArray(value)) || rules.some((rule) => !rule || typeof rule !== 'object' || Array.isArray(rule))) {
      this.jsonField(parent, path, label, { kind: 'array', description: oc2('permissionsFormat') });
      return;
    }
    const collection = parent.createDiv({ cls: 'opencodian-opencode2-rule-collection' });
    const collectionHeader = collection.createDiv({ cls: 'opencodian-opencode2-rule-collection-header' });
    collectionHeader.createEl('h6', { text: label });
    collectionHeader.createSpan({ cls: 'opencodian-opencode2-count', text: rc2('ruleCount', { count: rules.length }) });
    const host = this.field(collection, path, oc2('scopeLabel'), oc2('permissionsFormat'));
    host.parentElement?.addClass('opencodian-opencode2-wide');
    const list = host.createDiv({ cls: 'opencodian-opencode2-rule-list' });
    const controls: OpenCode2RuleControls[] = [];
    const read = (): Array<Record<string, unknown>> => controls.map(({ original, action, custom, resource, effect }) => ({
      ...original, action: action.value === '__custom__' ? custom.value : action.value, resource: resource.value, effect: effect.value,
    }));
    const status = host.createDiv({ cls: 'opencodian-opencode2-field-error', attr: { role: 'status' } });
    const write = (next: Array<Record<string, unknown>>): void => {
      if (!this.editable()) return;
      if (next.some((rule) => !this.validRule(rule))) {
        this.state.buffers.set(key, { text: JSON.stringify(next), invalid: true });
        status.setText(rc2('ruleInvalid'));
      } else {
        this.state.buffers.delete(key); this.setValue(path, next); status.setText('');
      }
      this.updateFooters();
    };
    this.button(collectionHeader, rc2('ruleAdd'), () => { write([...read(), { action: 'read', resource: '*', effect: 'ask' }]); this.repaint(); }, !this.editable()).dataset.configAction = 'add';
    for (const [index, raw] of rules.entries()) {
      const original = raw as Record<string, unknown>;
      const row = list.createEl('fieldset', { cls: 'opencodian-opencode2-rule' });
      row.createEl('legend', { cls: 'opencodian-opencode2-rule-legend', text: rc2('ruleNumber', { index: index + 1 }) });
      const header = row.createDiv({ cls: 'opencodian-opencode2-rule-header' });
      header.createEl('strong', { text: rc2('ruleNumber', { index: index + 1 }), attr: { 'aria-hidden': 'true' } });
      const toolbar = header.createDiv({ cls: 'opencodian-opencode2-toolbar' });
      for (const [offset, name] of [[-1, 'ruleUp'], [1, 'ruleDown']] as const) {
        this.button(toolbar, rc2(name), () => {
          const next = read(); [next[index], next[index + offset]] = [next[index + offset], next[index]];
          write(next); this.repaint();
        }, !this.editable() || index + offset < 0 || index + offset >= rules.length);
      }
      this.button(toolbar, rc2('ruleRemove'), () => { const next = read(); next.splice(index, 1); write(next); this.repaint(); }, !this.editable());
      controls.push(this.renderRuleFields(row, original, () => write(read())));
    }
    if (!rules.length) this.notice(list, rc2('rulesEmpty'));
    if (buffer?.invalid) status.setText(rc2('ruleInvalid'));
    const json = this.disclosure(collection, rc2('ruleJson'));
    this.jsonField(json, path, label, { kind: 'array', description: oc2('permissionsFormat') });
    json.querySelector('textarea')?.addEventListener('change', () => { if (!this.state.buffers.has(key)) this.repaint(); });
  }

  private renderRuleFields(parent: HTMLElement, original: Record<string, unknown>, onChange: () => void): OpenCode2RuleControls {
    const actions: Array<[string, string]> = [
      ['read', rc2('ruleActionRead')], ['edit', rc2('ruleActionEdit')], ['shell', rc2('ruleActionShell')], ['subagent', rc2('ruleActionSubagent')],
      ...['glob', 'grep', 'webfetch', 'websearch', 'external_directory', 'skill', 'execute'].map((id): [string, string] => [id, id]),
    ];
    const fields = parent.createDiv({ cls: 'opencodian-opencode2-rule-fields' });
    const actionLabel = fields.createEl('label', { text: oc2('permissionAction') });
    const action = actionLabel.createEl('select', { cls: 'dropdown', attr: { 'aria-label': oc2('permissionAction'), 'data-config-control': 'true' } });
    for (const [id, text] of actions) action.createEl('option', { text, attr: { value: id } });
    action.createEl('option', { text: rc2('ruleActionCustom'), attr: { value: '__custom__' } });
    const custom = actionLabel.createEl('input', { type: 'text', attr: { 'aria-label': rc2('ruleActionCustom'), 'data-config-control': 'true' } });
    custom.value = typeof original.action === 'string' ? original.action : '';
    action.value = actions.some(([id]) => id === original.action) ? String(original.action) : '__custom__';
    custom.hidden = action.value !== '__custom__';
    const resourceLabel = fields.createEl('label', { text: oc2('permissionResource') });
    const resource = resourceLabel.createEl('input', { type: 'text', attr: { 'aria-label': oc2('permissionResource'), 'data-config-control': 'true' } });
    resource.value = typeof original.resource === 'string' ? original.resource : '';
    const effectLabel = fields.createEl('label', { text: oc2('permissionEffect') });
    const effect = effectLabel.createEl('select', { cls: 'dropdown', attr: { 'aria-label': oc2('permissionEffect'), 'data-config-control': 'true' } });
    for (const id of ['ask', 'allow', 'deny'] as const) effect.createEl('option', { text: oc2(id), attr: { value: id } });
    if (!['ask', 'allow', 'deny'].includes(String(original.effect))) effect.createEl('option', { text: String(original.effect ?? ''), attr: { value: String(original.effect ?? '') } });
    effect.value = String(original.effect ?? '');
    for (const control of [action, custom, resource, effect]) {
      control.disabled = !this.editable();
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => { custom.hidden = action.value !== '__custom__'; onChange(); });
    }
    return { original, action, custom, resource, effect };
  }

  private validRule(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const rule = value as Record<string, unknown>;
    return typeof rule.action === 'string' && !!rule.action.trim() && typeof rule.resource === 'string' && !!rule.resource.trim()
      && ['allow', 'deny', 'ask'].includes(String(rule.effect));
  }

  private renderExtensions(parent: HTMLElement): void {
    this.renderMapEditor(this.group(parent, oc2('mcpDefinitions')), 'mcp', {
      catalog: (this.catalog?.mcp ?? []).map(({ name }) => ({ id: name })), nested: ['servers'],
      fields: (editor, path) => this.renderMcpDefinition(editor, path),
    });
    const runtime = this.disclosure(parent, oc2('mcpConnections'));
    this.notice(runtime, oc2('mcpConnectionsDesc'));
    if (this.catalog) this.renderMcpCatalog(runtime, this.catalog); else this.notice(runtime, oc2('catalogPending'));
  }

  private renderMcpDefinition(parent: HTMLElement, path: ConfigPath): void {
    this.notice(parent, rc2('mcpReplaceHint'));
    const host = this.field(parent, [...path, 'type'], oc2('transport'), rc2('mcpTransportRequired'));
    const select = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': oc2('transport'), 'data-config-control': 'true' } });
    if (this.value([...path, 'type']) === undefined) select.createEl('option', { text: rc2('mcpFieldDefault'), attr: { value: '', disabled: 'true' } });
    for (const [value, label] of [['local', oc2('localProcess')], ['remote', oc2('remoteHttp')]]) select.createEl('option', { text: label, attr: { value } });
    select.value = String(this.value([...path, 'type']) ?? '');
    select.disabled = !this.editable();
    select.addEventListener('change', () => {
      if (!this.editable() || !['local', 'remote'].includes(select.value)) return;
      const previous = this.value(path) as Record<string, unknown> | undefined;
      const key = JSON.stringify(path);
      if (previous?.type === 'local' || previous?.type === 'remote') {
        this.state.transports.set(`${key}:${previous.type}`, {
          value: previous,
          buffers: [...this.state.buffers].filter(([candidate]) => path.every((part, index) => (JSON.parse(candidate) as ConfigPath)[index] === part)),
        });
      }
      this.clearBuffers(path);
      const shared = Object.fromEntries(Object.entries(previous ?? {}).filter(([key]) => !['command', 'environment', 'url', 'headers'].includes(key)));
      const cached = this.state.transports.get(`${key}:${select.value}`);
      const retained = cached?.value as Record<string, unknown> | undefined;
      const next = select.value === 'local'
        ? { ...shared, type: 'local', command: retained?.command ?? [], ...(retained?.environment === undefined ? {} : { environment: retained.environment }) }
        : { ...shared, type: 'remote', url: retained?.url ?? '', ...(retained?.headers === undefined ? {} : { headers: retained.headers }) };
      this.setValue(path, next);
      for (const [bufferKey, buffer] of (cached?.buffers ?? []) as Array<[string, { text: string; invalid: boolean }]>) this.state.buffers.set(bufferKey, buffer);
      this.repaint();
    });
    const type = this.value([...path, 'type']);
    if (type === 'local') {
      const commandPath = [...path, 'command'];
      const control = this.field(parent, commandPath, oc2('mcpCommand'), rc2('mcpCommandLinesDesc'));
      control.parentElement?.addClass('opencodian-opencode2-wide');
      const input = control.createEl('textarea', { attr: { 'aria-label': oc2('mcpCommand'), rows: '4', spellcheck: 'false' } });
      const command = this.value(commandPath);
      input.value = this.state.buffers.get(JSON.stringify(commandPath))?.text ?? (Array.isArray(command) ? command.join('\n') : '');
      this.bindValue(input, commandPath, (text) => {
        const args = text.split(/\r?\n/);
        if (!args[0]?.trim()) throw new Error(rc2('fieldRequired'));
        return args;
      });
      this.renderKeyValues(parent, [...path, 'environment'], oc2('environment'));
    } else if (type === 'remote') {
      this.textField(parent, [...path, 'url'], oc2('mcpUrl'), { required: true });
      this.renderKeyValues(parent, [...path, 'headers'], oc2('headers'));
    }
    this.booleanField(parent, [...path, 'disabled'], oc2('disableServer'), rc2('disableServerDesc'));
    const advanced = this.disclosure(parent, oc2('mcpAdvanced'));
    this.numberField(advanced, [...path, 'timeout', 'catalog'], oc2('catalogTimeout'), { description: oc2('milliseconds'), min: 1 });
    this.numberField(advanced, [...path, 'timeout', 'execution'], oc2('executionTimeout'), { description: oc2('milliseconds'), min: 1 });
    this.jsonField(advanced, path, rc2('mcpFullDeclaration'), { kind: 'object', description: rc2('mcpFullDeclarationDesc') });
  }

  private renderKeyValues(parent: HTMLElement, path: ConfigPath, label: string): void {
    const key = JSON.stringify(path);
    const current = this.value(path);
    if (current && (typeof current !== 'object' || Array.isArray(current) || Object.values(current).some((value) => typeof value !== 'string'))) {
      this.jsonField(parent, path, label, { kind: 'object', description: oc2('credentialsHint') }); return;
    }
    const host = this.field(parent, path, label, oc2('credentialsHint'));
    host.parentElement?.addClass('opencodian-opencode2-wide');
    const buffered: unknown = this.state.buffers.has(key) ? parse(this.state.buffers.get(key)!.text) : undefined;
    const entries: Array<[string, string]> = Array.isArray(buffered) ? buffered as Array<[string, string]> : Object.entries(current ?? {}) as Array<[string, string]>;
    const section = host.createDiv({ cls: 'opencodian-opencode2-kv' });
    if (!entries.length) section.createEl('p', { text: rc2('kvEmpty') });
    const header = section.createDiv({ cls: 'opencodian-opencode2-subheader' });
    header.createEl('h6', { text: label });
    const controls: Array<[HTMLInputElement, HTMLInputElement]> = [];
    const status = section.createDiv({ cls: 'opencodian-opencode2-field-error', attr: { role: 'status' } });
    const read = (): Array<[string, string]> => controls.map(([name, value]) => [name.value, value.value]);
    const write = (next: Array<[string, string]>): void => {
      if (!this.editable()) return;
      const names = next.map(([name]) => name.trim());
      if (names.some((name) => !name || ['__proto__', 'prototype', 'constructor'].includes(name)) || new Set(names).size !== names.length) {
        this.state.buffers.set(key, { text: JSON.stringify(next), invalid: true }); status.setText(rc2('kvInvalid'));
      } else {
        this.state.buffers.delete(key); this.setValue(path, Object.fromEntries(next.map(([name, value]) => [name.trim(), value]))); status.setText('');
      }
      this.updateFooters();
    };
    this.button(header, rc2('kvAdd'), () => { write([...read(), ['', '']]); this.repaint(); }, !this.editable());
    for (const [index, entry] of entries.entries()) {
      const row = section.createDiv({ cls: 'opencodian-opencode2-kv-row' });
      const nameLabel = row.createEl('label', { text: rc2('kvKey') });
      const name = nameLabel.createEl('input', { type: 'text', attr: { 'aria-label': `${label} · ${rc2('kvKey')}`, 'data-config-control': 'true', spellcheck: 'false' } });
      const valueLabel = row.createEl('label', { text: rc2('kvValue') });
      const value = valueLabel.createEl('input', { type: 'text', attr: { 'aria-label': `${label} · ${rc2('kvValue')}`, 'data-config-control': 'true', spellcheck: 'false' } });
      [name.value, value.value] = entry;
      controls.push([name, value]);
      for (const input of [name, value]) { input.disabled = !this.editable(); input.addEventListener('input', () => write(read())); }
      this.button(row, rc2('kvRemove'), () => { const next = read(); next.splice(index, 1); write(next); this.repaint(); }, !this.editable());
    }
    if (this.state.buffers.get(key)?.invalid) status.setText(rc2('kvInvalid'));
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

  private renderCommands(parent: HTMLElement): void {
    this.button(parent, rc2('permissionsLink'), () => {
      const button = parent.closest('.opencodian-settings')?.querySelector<HTMLButtonElement>('.opencodian-settings-tabs-secondary [data-tab-id="permissions"]');
      if (button) button.click();
      else this.mounts.find((mount) => mount.tab === 'permissions')?.root.scrollIntoView?.({ block: 'start' });
    });
    this.renderMapEditor(this.group(parent, oc2('commands')), 'commands', { catalog: this.catalog?.commands ?? [], fields: (editor, path) => {
      this.textField(editor, [...path, 'description'], oc2('description'));
      this.textField(editor, [...path, 'template'], oc2('commandTemplate'), { description: oc2('commandTemplateDesc'), multiline: true, required: true });
      const agents = this.definitionIds(['agents'], this.catalog?.agents ?? []);
      if (agents.length) this.selectField(editor, [...path, 'agent'], oc2('commandAgent'), { values: agents.map((id): [string, string] => [id, id]) });
      else this.textField(editor, [...path, 'agent'], oc2('commandAgent'));
      this.modelField(editor, [...path, 'model'], oc2('agentModel'), oc2('variantHint'));
      this.booleanField(editor, [...path, 'subagent'], oc2('commandSubagent'));
    } });
    this.jsonField(this.disclosure(parent, oc2('formatters')), ['formatter'], oc2('formatterConfig'), { kind: 'any', description: oc2('formatterConfigDesc') });
  }

  private renderSources(parent: HTMLElement): void {
    const sources = this.disclosure(parent, oc2('advancedSources'));
    for (const kind of ['instructions', 'skills'] as const) {
      const group = this.group(sources, oc2(kind));
      this.linesField(group, [kind], oc2(kind === 'instructions' ? 'instructionSources' : 'skillSources'), oc2(kind === 'instructions' ? 'instructionSourcesDesc' : 'skillSourcesDesc'));
      this.notice(group, oc2('sourceFilesHint'));
      if (kind === 'skills') this.renderCatalogList(group, this.catalog?.skills ?? []);
    }
  }

  private renderConfiguration(parent: HTMLElement): void {
    this.renderMapEditor(this.group(parent, oc2('references')), 'references', { catalog: [], fields: (editor, path) => this.renderReference(editor, path) });
    this.jsonField(this.group(parent, oc2('plugins'), oc2('pluginsDesc')), ['plugins'], oc2('pluginSources'), { kind: 'array', description: oc2('pluginSourcesDesc') });
    this.renderConfigRecovery(parent);
  }

  private renderReference(parent: HTMLElement, path: ConfigPath): void {
    const value = this.value(path);
    if (typeof value === 'string') {
      const host = this.field(parent, [...path, 'path'], oc2('referencePath'), rc2('referenceStringDesc'));
      const row = host.parentElement!;
      row.dataset.configKey = JSON.stringify(path);
      host.querySelector('[data-config-action="reset"]')?.remove();
      const input = host.createEl('input', { type: 'text', attr: { 'aria-label': oc2('referencePath') } });
      input.value = this.state.buffers.get(JSON.stringify(path))?.text ?? value;
      this.bindValue(input, path, (text) => {
        if (!text.trim()) throw new Error(rc2('fieldRequired'));
        return text;
      });
    } else {
      this.textField(parent, [...path, 'description'], oc2('description'));
      this.textField(parent, [...path, 'path'], oc2('referencePath'), { description: oc2('referencePathDesc') });
      this.textField(parent, [...path, 'repository'], oc2('referenceRepository'));
      this.textField(parent, [...path, 'branch'], oc2('referenceBranch'));
    }
    this.jsonField(this.disclosure(parent, oc2('rawConfiguration')), path, oc2('references'), { kind: 'any' });
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
    this.renderCompactionBuffer(advanced);
    this.modelField(advanced, ['agents', 'compaction', 'model'], oc2('compactionModel'), oc2('modelReference'));
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
    this.renderWarming(warming);
    this.booleanField(warming, ['experimental', 'background_compaction'], oc2('backgroundCompaction'));
  }

  private renderCompactionBuffer(parent: HTMLElement): void {
    const path = ['compaction', 'buffer'];
    const key = JSON.stringify(path);
    const value = this.value(path);
    const host = this.field(parent, path, oc2('bufferTokens'), oc2('bufferTokensDesc'));
    const select = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': rc2('bufferMode'), 'data-config-control': 'true' } });
    for (const [id, text] of [['', oc2('inherited')], ['percent', rc2('bufferPercent')], ['tokens', rc2('bufferTokensUnit')]]) select.createEl('option', { text, attr: { value: id } });
    select.value = this.state.searches[`buffer:${key}`] ?? (value === undefined ? '' : typeof value === 'number' ? 'tokens' : 'percent');
    select.disabled = !this.editable();
    const input = host.createEl('input', { type: 'text', attr: { inputmode: 'decimal', 'aria-label': oc2('bufferTokens') } });
    input.value = this.state.buffers.get(key)?.text ?? (value === undefined ? '' : String(value).replace(/%$/, ''));
    input.hidden = !select.value;
    this.bindValue(input, path, (text) => {
      const amount = Number(text);
      if (!text.trim() || !/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(amount) || amount < 0
        || (select.value === 'percent' ? amount < 1 || amount >= 100 : !Number.isSafeInteger(amount))) throw new Error(rc2('bufferInvalid'));
      return select.value === 'percent' ? `${amount}%` : amount;
    });
    select.addEventListener('change', () => {
      if (!this.editable()) return;
      this.state.searches[`buffer:${key}`] = select.value;
      input.hidden = !select.value;
      if (!select.value) {
        this.clearBuffers(path); this.setValue(path, undefined); host.querySelector('.opencodian-opencode2-field-error')?.setText('');
      } else {
        input.dispatchEvent(new Event('input')); input.focus();
      }
      this.updateFooters();
    });
  }

  private renderWarming(parent: HTMLElement): void {
    const path = ['warming'];
    const host = this.field(parent, path, rc2('warmingMode'), oc2('warmingOptionsDesc'));
    const value = this.value(path);
    const select = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': rc2('warmingMode'), 'data-config-control': 'true' } });
    for (const [id, text] of [['', oc2('inherited')], ['false', rc2('warmingOff')], ['true', rc2('warmingOn')], ['custom', rc2('warmingCustom')]]) select.createEl('option', { text, attr: { value: id } });
    select.value = value === undefined ? '' : typeof value === 'boolean' ? String(value) : 'custom';
    select.disabled = !this.editable();
    const input = host.createEl('textarea', { cls: 'opencodian-config-editor', attr: { 'aria-label': oc2('warmingOptions'), rows: '5', spellcheck: 'false' } });
    input.value = this.state.buffers.get(JSON.stringify(path))?.text ?? (value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '{}');
    input.hidden = select.value !== 'custom';
    this.bindValue(input, path, (text) => {
      const errors: ParseError[] = [];
      const object: unknown = parse(text, errors, { allowTrailingComma: true });
      if (errors.length || !object || typeof object !== 'object' || Array.isArray(object)) throw new Error(oc2('invalidJson'));
      return object;
    });
    select.addEventListener('change', () => {
      if (!this.editable()) return;
      this.clearBuffers(path);
      input.hidden = select.value !== 'custom';
      if (select.value === 'custom') input.dispatchEvent(new Event('input'));
      else { this.setValue(path, select.value === '' ? undefined : select.value === 'true'); host.querySelector('.opencodian-opencode2-field-error')?.setText(''); }
      this.updateFooters();
    });
  }

  private renderAdvanced(parent: HTMLElement): void {
    const raw = this.group(parent, oc2('rawConfiguration'), oc2('rawConfigurationDesc'));
    const input = raw.createEl('textarea', { cls: 'opencodian-config-editor opencodian-opencode2-raw', attr: { 'aria-label': oc2('rawConfiguration'), rows: '16', spellcheck: 'false' } });
    input.value = this.state.rawDraft ?? this.state.draft;
    input.disabled = !this.local() || this.state.saving || this.conflict();
    input.addEventListener('input', () => {
      this.state.rawDraft = input.value === this.state.draft ? undefined : input.value;
      this.state.feedback = ''; this.updateFooters();
    });
    const actions = raw.createDiv({ cls: 'opencodian-opencode2-toolbar' });
    this.button(actions, rc2('rawMerge'), () => {
      if (!this.local() || this.state.saving || this.conflict() || this.state.rawDraft === undefined) return;
      const errors: ParseError[] = [];
      const value: unknown = this.state.rawDraft.trim() ? parse(this.state.rawDraft, errors, { allowTrailingComma: true }) : {};
      if (errors.length || !value || typeof value !== 'object' || Array.isArray(value)) {
        this.state.feedback = rc2('rawMergeInvalid'); this.updateFooters(); return;
      }
      this.state.draft = this.state.rawDraft; this.state.rawDraft = undefined;
      this.state.buffers.clear(); this.state.transports.clear(); this.state.searches = {};
      this.state.feedback = rc2('rawMerged'); this.repaint();
    }).dataset.action = 'merge-raw';
    this.button(actions, rc2('rawDiscard'), () => { this.state.rawDraft = undefined; this.state.feedback = ''; this.repaint(); }).dataset.action = 'discard-raw';
    actions.createSpan({ cls: 'opencodian-opencode2-raw-status', attr: { role: 'status' } });
    const files = this.disclosure(parent, oc2('advancedRuntime'));
    this.linesField(files, ['watcher', 'ignore'], oc2('watcherIgnore'), oc2('watcherIgnoreDesc'));
    this.textField(files, ['shell'], oc2('shell'), { description: oc2('shellDesc') });
    this.textField(files, ['worktree', 'directory'], oc2('worktreeDirectory'), { description: oc2('worktreeDirectoryDesc') });
    this.jsonField(files, ['websearch'], oc2('websearchConfig'), { kind: 'any' });
    this.jsonField(this.disclosure(parent, oc2('advancedPolicies')), ['policies'], oc2('policies'), { kind: 'array', description: oc2('policiesDesc') });
    const experiments = this.disclosure(parent, oc2('experimental'));
    this.booleanField(experiments, ['experimental', 'todo'], oc2('todo'));
    this.numberField(experiments, ['experimental', 'subagent_depth'], oc2('subagentDepth'), { min: 1 });
    this.booleanField(experiments, ['experimental', 'portable_shell_scanner'], oc2('shellScanner'));
    this.textField(experiments, ['experimental', 'location_idle_timeout'], oc2('idleTimeout'), { description: oc2('durationHint') });
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
        this.state.draft = snapshot.raw; this.state.rawDraft = undefined;
        this.state.buffers.clear(); this.state.transports.clear(); this.state.searches = {};
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
      this.state.draft = this.state.saved; this.state.rawDraft = undefined; this.state.buffers.clear();
      this.state.transports.clear(); this.state.creating.clear(); this.state.searches = {}; this.state.feedback = ''; this.repaint();
    }).setAttribute('data-action', 'discard');
    this.button(footer, oc2('apply'), () => this.applyDraft()).setAttribute('data-action', 'apply');
    const preview = this.disclosure(parent, rc2('draftPreview'));
    preview.parentElement?.addClass('opencodian-opencode2-draft-preview');
    preview.createEl('pre', { cls: 'opencodian-config-editor', text: this.state.draft, attr: { 'data-draft-preview': 'true' } });
    this.updateFooters();
  }

  private draftErrors(): Array<{ path: ConfigPath; message: string }> {
    const errors: Array<{ path: ConfigPath; message: string }> = [];
    const document = this.document();
    if (!document) return [{ path: [], message: oc2('invalidJson') }];
    const rules = (path: ConfigPath): void => {
      const value = this.value(path);
      if (value !== undefined && (!Array.isArray(value) || value.some((rule) => !this.validRule(rule)))) errors.push({ path, message: rc2('ruleInvalid') });
    };
    rules(['permissions']);
    for (const id of this.definitionIds(['agents'], [])) {
      const path = ['agents', id];
      const steps = this.value([...path, 'steps']);
      if (steps !== undefined && (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 1)) errors.push({ path: [...path, 'steps'], message: rc2('fieldNumberInvalid', { min: 1 }) });
      rules([...path, 'permissions']);
    }
    for (const id of this.definitionIds(['commands'], [])) {
      const path = ['commands', id, 'template'];
      const value = this.value(path);
      if (typeof value !== 'string' || !value.trim()) errors.push({ path, message: rc2('commandRequired') });
    }
    errors.push(...this.mcpDraftErrors());
    const buffer = this.value(['compaction', 'buffer']);
    if (buffer !== undefined) {
      const valid = typeof buffer === 'number' ? Number.isSafeInteger(buffer) && buffer >= 0
        : typeof buffer === 'string' && /^[1-9]\d?(?:\.\d+)?%$/.test(buffer);
      if (!valid) errors.push({ path: ['compaction', 'buffer'], message: rc2('bufferInvalid') });
    }
    return errors;
  }

  private mcpDraftErrors(): Array<{ path: ConfigPath; message: string }> {
    const errors: Array<{ path: ConfigPath; message: string }> = [];
    for (const id of this.definitionIds(['mcp', 'servers'], [])) {
      const path = ['mcp', 'servers', id];
      const type = this.value([...path, 'type']);
      const command = this.value([...path, 'command']);
      const url = this.value([...path, 'url']);
      if (type === 'local') {
        if (!Array.isArray(command) || !command.length || command.some((arg) => typeof arg !== 'string') || !String(command[0]).trim()) errors.push({ path: [...path, 'command'], message: rc2('mcpLocalRequired') });
      } else if (type === 'remote') {
        if (typeof url !== 'string' || !url.trim()) errors.push({ path: [...path, 'url'], message: rc2('mcpRemoteRequired') });
      } else errors.push({ path: [...path, 'type'], message: rc2('mcpRequired') });
    }
    return errors;
  }

  private updateFooters(): void {
    const raw = this.state.rawDraft !== undefined;
    const dirty = raw || this.state.draft !== this.state.saved || this.state.buffers.size > 0;
    const errors = this.draftErrors();
    const invalid = errors.length > 0 || [...this.state.buffers.values()].some((buffer) => buffer.invalid);
    for (const { root } of this.mounts) {
      root.querySelector('[data-draft-preview]')?.setText(this.state.draft);
      root.querySelector('.opencodian-opencode2-save-status')?.setText(this.state.saving ? oc2('applying') : this.state.feedback || (raw ? rc2('rawPending') : invalid ? errors[0]?.message ?? rc2('collectionInvalid') : oc2(dirty ? 'unsaved' : 'unchanged')));
      const apply = root.querySelector<HTMLButtonElement>('[data-action="apply"]');
      if (apply) apply.disabled = !dirty || invalid || !this.editable();
      const discard = root.querySelector<HTMLButtonElement>('[data-action="discard"]');
      if (discard) discard.disabled = (!dirty && !this.conflict()) || this.state.saving;
      this.updateRawActions(root, raw);
      this.updateNativeControls(root);
      this.updateFieldStates(root, errors);
      this.updateCollectionStates(root);
    }
  }

  private updateRawActions(root: HTMLElement, pending: boolean): void {
    for (const action of ['merge-raw', 'discard-raw']) {
      const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (button) button.disabled = !pending || !this.local() || this.state.saving || this.conflict();
    }
    const status = root.querySelector<HTMLElement>('.opencodian-opencode2-raw-status');
    status?.setText(this.state.feedback || (pending ? rc2('rawPending') : ''));
    status?.classList.toggle('opencodian-opencode2-field-error', pending && this.state.feedback === rc2('rawMergeInvalid'));
    const lock = root.querySelector<HTMLElement>('.opencodian-opencode2-draft-lock');
    if (pending && !lock) {
      const notice = root.createEl('p', { cls: 'opencodian-opencode2-notice opencodian-opencode2-draft-lock', text: rc2('rawPending'), attr: { role: 'status' } });
      root.insertBefore(notice, root.querySelector('.opencodian-opencode2-body'));
    } else if (!pending) lock?.remove();
  }

  private updateNativeControls(root: HTMLElement): void {
    const controls = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('[data-config-control], [data-config-action], .opencodian-opencode2-rule-list button, .opencodian-opencode2-kv button, .opencodian-opencode2-create input, .opencodian-opencode2-create button');
    for (const control of Array.from(controls)) {
      if (!this.editable()) {
        control.dataset.editLock ??= String(control.disabled); control.disabled = true;
      } else if (control.dataset.editLock !== undefined) {
        control.disabled = control.dataset.editLock === 'true'; delete control.dataset.editLock;
      }
    }
  }

  private updateFieldStates(root: HTMLElement, errors: Array<{ path: ConfigPath; message: string }>): void {
    for (const row of Array.from(root.querySelectorAll<HTMLElement>('.opencodian-opencode2-field[data-config-key]'))) {
      const key = row.dataset.configKey!;
      const path = JSON.parse(key) as ConfigPath;
      const present = this.value(path) !== undefined || this.state.buffers.has(key);
      row.querySelector('.setting-item-name > .opencodian-opencode2-badge')?.setText(this.fieldSource(path, present));
      const reset = row.querySelector<HTMLButtonElement>(':scope > .setting-item-control > [data-config-action="reset"]');
      if (reset) { reset.hidden = !present; reset.disabled = !present || !this.editable(); }
      const error = errors.find((error) => JSON.stringify(error.path) === key);
      const status = row.querySelector<HTMLElement>(':scope > .setting-item-control > .opencodian-opencode2-field-error');
      if (status && !this.state.buffers.has(key)) status.setText(error?.message ?? '');
    }
  }

  private updateCollectionStates(root: HTMLElement): void {
    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('.opencodian-opencode2-item[data-definition-path]'))) {
      const path = JSON.parse(button.dataset.definitionPath!) as ConfigPath;
      const runtime = button.dataset.runtimeDefinition === 'true';
      button.querySelector('.opencodian-opencode2-item-state')?.setText(this.definitionState(path, runtime));
      const catalog = path[0] === 'agents' ? this.catalog?.agents : path[0] === 'commands' ? this.catalog?.commands : undefined;
      const entry = catalog?.find((entry) => (entry.id ?? entry.name) === path[1]);
      button.querySelector('.opencodian-opencode2-list-meta')?.setText(this.definitionSummary(path, entry));
    }
    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-config-action="restore-record"], [data-config-action="remove-record"]'))) {
      button.disabled = !this.editable() || this.value(JSON.parse(button.dataset.definitionPath!) as ConfigPath) === undefined;
    }
  }

  private async applyDraft(): Promise<void> {
    if (!this.editable() || this.draftErrors().length || [...this.state.buffers.values()].some((buffer) => buffer.invalid)) return;
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
      this.state.buffers.clear(); this.state.transports.clear(); this.state.searches = {};
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
