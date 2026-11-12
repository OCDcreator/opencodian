/** Project-level Claude provider preset settings surface. */

import { Notice, Setting } from 'obsidian';

import {
  applyClaudeProviderPreset,
  type ClaudeProviderConfigSnapshot,
  migrateClaudeProviderModels,
  readClaudeProviderConfigSnapshot,
  validateClaudeProviderPreset,
} from '../../../../core/agents/backend';
import { CLAUDE_OFFICIAL_PROVIDER_PRESET, type ClaudeProviderPreset } from '../../../../core/types';
import { t, type TranslationKey } from '../../../../i18n';
import type OpenCodianPlugin from '../../../../main';
import { getVaultBasePath } from '../../../../shared';
import { SettingsClaudeProviderMetadataPersistenceCoordinator } from './SettingsClaudeProviderMetadataPersistenceCoordinator';
import { ClaudeProviderConfigModal, ClaudeProviderPresetModal } from './SettingsClaudeProviderModals';

export interface SettingsClaudeProvidersSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  onAfterMutation?: () => void;
}

function clonePreset(preset: ClaudeProviderPreset): ClaudeProviderPreset {
  return { ...preset, extraEnv: { ...preset.extraEnv } };
}

function isOfficialPreset(preset: ClaudeProviderPreset): boolean {
  return preset.id === CLAUDE_OFFICIAL_PROVIDER_PRESET.id;
}

function providerAddress(value: unknown): { text: string; route: string } {
  if (typeof value !== 'string' || !value.trim()) return { text: t('settings.claudeCode.providers.readback.notSet'), route: 'unspecified' };
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported');
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return { text: url.toString().replace(/\/$/, ''), route: local ? 'proxy' : url.hostname === 'api.anthropic.com' ? 'anthropic' : 'custom' };
  } catch {
    return { text: t('settings.claudeCode.providers.readback.invalidAddress'), route: 'unspecified' };
  }
}

function layerValue(content: Record<string, unknown>, key: string): unknown {
  if (!key.startsWith('ANTHROPIC_')) return content[key];
  const env = content.env;
  return env && typeof env === 'object' && !Array.isArray(env) ? (env as Record<string, unknown>)[key] : undefined;
}

type ClaudeProviderConflict = { kind: 'preset'; preset: ClaudeProviderPreset } | { kind: 'migration' };
type ClaudeProviderRenderContext = {
  bodyEl: HTMLElement;
  generation: number;
  snapshotPromise: Promise<ClaudeProviderConfigSnapshot>;
  vaultPath: string;
  migrationButton?: HTMLButtonElement | null;
  detailsEl?: HTMLElement;
};

export class SettingsClaudeProvidersSection {
  private migrationInFlight = false;
  private applying = false;
  private localReady = false;
  private renderGeneration = 0;
  private localRevision: Awaited<ReturnType<typeof readClaudeProviderConfigSnapshot>>['layers'][number]['revision'] = null;
  private conflict: ClaudeProviderConflict | null = null;
  private readonly metadataPersistence: SettingsClaudeProviderMetadataPersistenceCoordinator;

  constructor(private readonly options: SettingsClaudeProvidersSectionOptions) {
    this.metadataPersistence = new SettingsClaudeProviderMetadataPersistenceCoordinator({
      plugin: options.plugin, getSettings: () => this.getSettings(),
      requestRender: (bodyEl) => { bodyEl.empty(); this.render(bodyEl); },
      onAfterMutation: options.onAfterMutation,
    });
  }

  render(bodyEl: HTMLElement): void {
    const generation = ++this.renderGeneration;
    this.localReady = false;
    this.metadataPersistence.setRenderGeneration(generation, bodyEl);
    const settings = this.getSettings();
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    this.options.createSectionHeading(
      bodyEl,
      t('settings.claudeCode.providers.title'),
      t('settings.claudeCode.providers.description'),
    );

    if (!settings.settingSources.includes('local')) {
      this.renderLocalGate(bodyEl);
      return;
    }
    if (!vaultPath) {
      bodyEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.noVault') });
      return;
    }

    this.metadataPersistence.render(bodyEl, generation);
    const snapshotPromise = readClaudeProviderConfigSnapshot(vaultPath);
    const context: ClaudeProviderRenderContext = { bodyEl, generation, snapshotPromise, vaultPath };
    this.renderConflictResolution(context);
    this.renderCurrentConfiguration(bodyEl, context);
    const toolbar = bodyEl.createDiv({ cls: 'opencodian-claude-provider-list-header' });
    toolbar.createEl('h4', { text: t('settings.claudeCode.providers.presetsTitle') });
    const add = toolbar.createEl('button', { text: t('settings.claudeCode.providers.add.button'), attr: { type: 'button' } });
    add.disabled = this.metadataPersistence.hasPendingPersistence();
    add.addEventListener('click', () => this.openPresetEditor(null, bodyEl, vaultPath));
    const listEl = bodyEl.createDiv({ cls: 'opencodian-claude-provider-list' });
    for (const preset of settings.providers.presets) this.renderPresetCard(listEl, preset, context);
    const details = bodyEl.createEl('details', { cls: 'opencodian-claude-provider-details' });
    details.createEl('summary', { text: t('settings.claudeCode.providers.detailsTitle') });
    context.detailsEl = details.createDiv({ cls: 'opencodian-claude-provider-details-body' });
    this.renderGuidance(context.detailsEl);
    context.migrationButton = this.renderMigrationAction(context);
    this.renderLocalStatus(context);
    this.renderGlobalConfigurationAction(context.detailsEl, vaultPath);
  }

  private getSettings() {
    return this.options.plugin.settings.backendSettings.claudeCode;
  }

  private renderLocalGate(bodyEl: HTMLElement): void {
    const gateEl = bodyEl.createDiv({
      cls: 'opencodian-claude-provider-gate',
      attr: { 'data-claude-provider-local-gate': 'true' },
    });
    gateEl.createEl('strong', { text: t('settings.claudeCode.providers.localGate.title') });
    gateEl.createEl('p', { text: t('settings.claudeCode.providers.localGate.desc') });
    const fixButton = gateEl.createEl('button', { cls: 'mod-cta', text: t('settings.claudeCode.providers.localGate.fix') });
    fixButton.addEventListener('click', () => {
      const settings = this.getSettings();
      if (!settings.settingSources.includes('local')) {
        settings.settingSources = [...settings.settingSources, 'local'];
      }
      void this.options.plugin.saveSettings().then(() => {
        bodyEl.empty();
        this.render(bodyEl);
      });
    });
  }

  private renderGuidance(bodyEl: HTMLElement): void {
    const settings = this.getSettings();
    const activePreset = settings.providers.presets.find((preset) => preset.id === settings.providers.activePresetId);
    if (activePreset?.baseUrl.trim() && !activePreset.authToken.trim()) {
      bodyEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.guidance.baseUrlWithoutToken') });
    }
    if (activePreset?.authToken.trim()) {
      bodyEl.createEl('p', { cls: 'opencodian-claude-provider-info', text: t('settings.claudeCode.providers.guidance.tokenOverridesOauth') });
    }
    if (Object.keys(settings.env).some((key) => key.startsWith('ANTHROPIC_'))) {
      bodyEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.guidance.legacyEnv') });
    }
  }

  private renderMigrationAction(context: ClaudeProviderRenderContext): HTMLButtonElement | null {
    const { bodyEl, generation, snapshotPromise, vaultPath } = context;
    const settings = this.getSettings();
    if (settings.providers.modelMigrationDone) {
      return null;
    }
    const setting = new Setting(context.detailsEl ?? bodyEl)
      .setName(t('settings.claudeCode.providers.migrationAction.name'))
      .setDesc(t('settings.claudeCode.providers.migrationAction.desc'));
    const migrationButton = setting.controlEl.createEl('button', {
      text: t('settings.claudeCode.providers.migrationAction.button'),
    });
    migrationButton.disabled = true;
    migrationButton.addEventListener('click', () => this.migrateLegacyModels(vaultPath, bodyEl));
    void snapshotPromise.then((snapshot) => {
      if (generation !== this.renderGeneration || !migrationButton) return;
      const local = snapshot.layers.find((layer) => layer.id === 'local');
      migrationButton.disabled = this.metadataPersistence.hasPendingPersistence() || !local || Boolean(local.parseError);
    }).catch(() => {
      if (generation === this.renderGeneration && migrationButton) {
        migrationButton.disabled = true;
      }
    });
    return migrationButton;
  }

  private renderLocalStatus(context: ClaudeProviderRenderContext): void {
    const { bodyEl, generation, snapshotPromise, vaultPath } = context;
    const migrationButton = context.migrationButton ?? null;
    const statusEl = bodyEl.createDiv({ cls: 'opencodian-claude-provider-local-status', attr: { 'data-claude-provider-local-status': 'true', role: 'status' }, text: t('settings.claudeCode.providers.localStatus.loading') });
    bodyEl.insertBefore(statusEl, bodyEl.querySelector('[data-claude-provider-current]'));
    void snapshotPromise.then((snapshot) => {
      if (generation !== this.renderGeneration) return;
      const local = snapshot.layers.find((layer) => layer.id === 'local');
      this.localRevision = local?.revision ?? null;
      if (!local || local.parseError) {
        this.renderLocalFailure(statusEl, local ? 'parse' : 'read', migrationButton);
        return;
      }
      const revision = local?.revision?.sha256.slice(0, 8) ?? t('settings.claudeCode.providers.localStatus.newFile');
      statusEl.dataset.claudeProviderLocalStatusState = 'ready';
      statusEl.setText(t('settings.claudeCode.providers.localStatus.ready', {
        path: local?.filePath || vaultPath,
        revision,
      }));
      this.localReady = true;
      context.detailsEl?.prepend(statusEl);
      for (const button of bodyEl.querySelectorAll<HTMLButtonElement>('[data-claude-provider-apply]')) {
        button.disabled = this.metadataPersistence.hasPendingPersistence() || this.applying;
      }
      if (migrationButton) migrationButton.disabled = this.metadataPersistence.hasPendingPersistence();
    }).catch(() => {
      if (generation === this.renderGeneration) {
        this.localRevision = null;
        this.renderLocalFailure(statusEl, 'read', migrationButton);
        statusEl.dataset.claudeProviderLocalStatusState = 'unavailable';
      }
    });
  }

  private renderLocalFailure(statusEl: HTMLElement, reason: 'parse' | 'read', migrationButton: HTMLButtonElement | null): void {
    statusEl.dataset.claudeProviderLocalStatusState = 'failed';
    statusEl.setText(t('settings.claudeCode.providers.localStatus.failed', { reason: t(`settings.claudeCode.providers.localStatus.reason.${reason}` as TranslationKey) }));
    if (migrationButton) migrationButton.disabled = true;
  }

  private renderConflictResolution(context: ClaudeProviderRenderContext): void {
    const { bodyEl, vaultPath, generation } = context;
    const conflict = this.conflict;
    if (!conflict) return;
    const conflictEl = bodyEl.createDiv({ cls: 'opencodian-claude-provider-conflict', attr: { 'data-claude-provider-conflict': 'true', role: 'alert' } });
    conflictEl.createEl('strong', { text: t('settings.claudeCode.providers.conflict.title') });
    conflictEl.createEl('p', {
      text: t(conflict.kind === 'migration'
        ? 'settings.claudeCode.providers.conflict.migrationDesc'
        : 'settings.claudeCode.providers.conflict.desc'),
    });
    const actions = conflictEl.createDiv({ cls: 'opencodian-claude-provider-card-actions' });
    actions.createEl('button', { text: t('settings.claudeCode.providers.conflict.reload') }).addEventListener('click', () => {
      this.conflict = null;
      bodyEl.empty();
      this.render(bodyEl);
    });
    actions.createEl('button', { text: t('settings.claudeCode.providers.conflict.inspect') }).addEventListener('click', () => {
      void readClaudeProviderConfigSnapshot(vaultPath).then((snapshot) => {
        new ClaudeProviderConfigModal(this.options.plugin.app, snapshot).open();
      }).catch(() => new Notice(t('settings.claudeCode.providers.globalUnavailable')));
    });
    actions.createEl('button', { cls: 'mod-cta', text: t('settings.claudeCode.providers.conflict.retry') }).addEventListener('click', () => {
      void readClaudeProviderConfigSnapshot(vaultPath).then((snapshot) => {
        if (generation !== this.renderGeneration) return;
        const local = snapshot.layers.find((layer) => layer.id === 'local');
        this.localRevision = local?.revision ?? null;
        if (!local || local.parseError) {
          new Notice(t('settings.claudeCode.providers.localStatus.failed', {
            reason: t(`settings.claudeCode.providers.localStatus.reason.${local ? 'parse' : 'read'}` as TranslationKey),
          }));
          return;
        }
        this.localReady = true;
        if (conflict.kind === 'migration') {
          this.migrateLegacyModels(vaultPath, bodyEl);
        } else {
          this.activatePreset(conflict.preset, vaultPath, bodyEl);
        }
      }).catch(() => new Notice(t('settings.claudeCode.providers.localStatus.unavailable')));
    });
  }

  private renderGlobalConfigurationAction(bodyEl: HTMLElement, vaultPath: string): void {
    new Setting(bodyEl)
      .setName(t('settings.claudeCode.providers.configModal.name'))
      .setDesc(t('settings.claudeCode.providers.configModal.actionDesc'))
      .addButton((button) => button
        .setButtonText(t('settings.claudeCode.providers.configModal.button'))
        .onClick(() => {
          void readClaudeProviderConfigSnapshot(vaultPath).then((snapshot) => {
            new ClaudeProviderConfigModal(this.options.plugin.app, snapshot).open();
          });
        }));
  }

  private renderPresetCard(
    containerEl: HTMLElement,
    preset: ClaudeProviderPreset,
    context: ClaudeProviderRenderContext,
  ): void {
    const { bodyEl, vaultPath } = context;
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-claude-provider-card',
      attr: { 'data-claude-provider-preset': preset.id },
    });
    const heading = cardEl.createDiv({ cls: 'opencodian-claude-provider-card-heading' });
    heading.createEl('strong', { text: isOfficialPreset(preset) ? t('settings.claudeCode.providers.inherit') : preset.name });
    if (preset.id === this.getSettings().providers.activePresetId) {
      heading.createSpan({ cls: 'opencodian-claude-provider-active-badge', text: t('settings.claudeCode.providers.active') });
    }
    cardEl.createEl('p', {
      cls: 'opencodian-claude-provider-info',
      text: isOfficialPreset(preset) ? t('settings.claudeCode.providers.inheritDesc') : providerAddress(preset.baseUrl).text,
    });
    const validation = validateClaudeProviderPreset(preset);
    if (validation.baseUrlEndsWithV1) cardEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.validation.baseUrlV1') });
    if (validation.authTokenHasBearerPrefix) cardEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.validation.bearer') });
    if (validation.fallbackMatchesModel) cardEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.validation.sameFallback') });
    const actions = cardEl.createDiv({ cls: 'opencodian-claude-provider-card-actions' });
    const activateButton = actions.createEl('button', {
      text: t(isOfficialPreset(preset) ? 'settings.claudeCode.providers.useInherited' : 'settings.claudeCode.providers.activate'),
      attr: { type: 'button', 'data-claude-provider-apply': preset.id },
    });
    activateButton.disabled = true;
    activateButton.addEventListener('click', () => { void this.activatePreset(preset, vaultPath, bodyEl); });
    if (!isOfficialPreset(preset)) {
      const editButton = actions.createEl('button', { text: t('settings.claudeCode.providers.edit') });
      editButton.disabled = this.metadataPersistence.hasPendingPersistence();
      editButton.addEventListener('click', () => this.openPresetEditor(preset, bodyEl, vaultPath));
      const deleteButton = actions.createEl('button', { cls: 'mod-warning', text: t('settings.claudeCode.providers.delete') });
      deleteButton.disabled = this.metadataPersistence.hasPendingPersistence() || preset.id === this.getSettings().providers.activePresetId;
      deleteButton.addEventListener('click', () => this.deletePreset(preset, bodyEl));
    }
  }

  private renderCurrentConfiguration(bodyEl: HTMLElement, context: ClaudeProviderRenderContext): void {
    const { generation, snapshotPromise, vaultPath } = context;
    const current = bodyEl.createDiv({ cls: 'opencodian-claude-provider-current', attr: { 'data-claude-provider-current': 'true', 'aria-live': 'polite' } });
    current.createEl('h4', { text: t('settings.claudeCode.providers.currentTitle') });
    const summary = current.createDiv({ cls: 'opencodian-claude-provider-global-summary', text: t('settings.claudeCode.providers.globalLoading') });
    void snapshotPromise.then((snapshot) => {
      if (generation !== this.renderGeneration) return;
      summary.empty();
      const local = snapshot.layers.find(layer => layer.id === 'local');
      if (!local || local.parseError) {
        summary.setText(t('settings.claudeCode.providers.globalUnavailable'));
        return;
      }
      const env = local.content.env;
      const envKeys = env && typeof env === 'object' ? Object.keys(env) : [];
      const managed = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', ...this.getSettings().providers.lastAppliedManagedEnvKeys];
      const overrides = local.content.model !== undefined || local.content.fallbackModel !== undefined || envKeys.some(key => managed.includes(key));
      current.dataset.claudeProviderMode = overrides ? 'local' : 'inherit';
      summary.createEl('strong', { cls: 'opencodian-claude-provider-mode', text: t(overrides ? 'settings.claudeCode.providers.localConfig' : 'settings.claudeCode.providers.inherit') });
      summary.createEl('p', { cls: 'opencodian-claude-provider-info', text: t(overrides ? 'settings.claudeCode.providers.localConfigDesc' : 'settings.claudeCode.providers.inheritedCurrentDesc') });
      const values = summary.createEl('dl', { cls: 'opencodian-claude-provider-values', attr: { 'data-claude-provider-global-values': 'true' } });
      for (const [key, field] of [
        ['ANTHROPIC_BASE_URL', 'baseUrl'], ['model', 'model'], ['fallbackModel', 'fallbackModel'],
        ['ANTHROPIC_DEFAULT_HAIKU_MODEL', 'haikuModel'], ['ANTHROPIC_AUTH_TOKEN', 'authToken'],
      ] as const) {
        this.renderReadbackValue(values, snapshot, key, field);
      }
      if (snapshot.layers.some(layer => layer.parseError && this.getSettings().settingSources.includes(layer.id))) {
        summary.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.readback.partial') });
      }
      const footer = current.createDiv({ cls: 'opencodian-claude-provider-current-footer' });
      footer.createEl('p', { cls: 'opencodian-claude-provider-info', text: t('settings.claudeCode.providers.readback.runtime') });
      const edit = footer.createEl('button', { cls: 'mod-cta', text: t('settings.claudeCode.providers.configureLocal'), attr: { type: 'button' } });
      edit.disabled = this.metadataPersistence.hasPendingPersistence();
      edit.addEventListener('click', () => this.openPresetEditor(null, bodyEl, vaultPath));
    }).catch(() => {
      if (generation === this.renderGeneration) summary.setText(t('settings.claudeCode.providers.globalUnavailable'));
    });
  }

  private readbackValue(snapshot: ClaudeProviderConfigSnapshot, key: string): { value: unknown; source: string } {
    let value: unknown = snapshot.shellEnv[key];
    let source = value === undefined ? 'none' : 'shell';
    for (const id of ['user', 'project', 'local'] as const) {
      if (!this.getSettings().settingSources.includes(id)) continue;
      const layer = snapshot.layers.find(candidate => candidate.id === id);
      const next = layer && !layer.parseError ? layerValue(layer.content, key) : undefined;
      if (next !== undefined) { value = next; source = id; }
    }
    return { value, source };
  }

  private renderReadbackValue(values: HTMLElement, snapshot: ClaudeProviderConfigSnapshot, key: string, field: string): void {
    const { value, source } = this.readbackValue(snapshot, key);
    const row = values.createDiv({ cls: 'opencodian-claude-provider-value', attr: { 'data-claude-provider-value': field } });
    row.createEl('dt', { text: t(`settings.claudeCode.providers.field.${field}.name` as TranslationKey) });
    const content = row.createEl('dd');
    let display = typeof value === 'string' ? value : Array.isArray(value) ? value.filter(item => typeof item === 'string').join(', ') : '';
    if (field === 'authToken') display = t(display ? 'settings.claudeCode.providers.readback.tokenPresent' : 'settings.claudeCode.providers.readback.tokenAbsent');
    const address = field === 'baseUrl' ? providerAddress(value) : null;
    content.createEl('span', { cls: field === 'authToken' ? '' : 'opencodian-claude-provider-exact', text: address?.text ?? (display || t('settings.claudeCode.providers.readback.notSet')) });
    if (address) content.createSpan({ cls: 'opencodian-claude-provider-route', text: t(`settings.claudeCode.providers.route.${address.route}` as TranslationKey) });
    content.createEl('small', { cls: 'opencodian-claude-provider-source', text: t(`settings.claudeCode.providers.source.${source}` as TranslationKey) });
  }

  private openPresetEditor(preset: ClaudeProviderPreset | null, bodyEl: HTMLElement, vaultPath: string): void {
    if (this.metadataPersistence.hasPendingPersistence() || (preset && isOfficialPreset(preset))) return;
    new ClaudeProviderPresetModal(this.options.plugin.app, preset, async (nextPreset, apply) => {
      if (this.metadataPersistence.hasPendingPersistence() || (apply && (!this.localReady || this.applying))) throw new Error('unavailable');
      const settings = this.getSettings();
      const previous = settings.providers;
      settings.providers = {
        ...previous,
        presets: preset
          ? previous.presets.map((candidate) => candidate.id === preset.id ? nextPreset : candidate)
          : [...previous.presets, nextPreset],
      };
      try {
        await this.options.plugin.saveSettings();
      } catch (error) {
        settings.providers = previous;
        throw error;
      }
      if (apply) await this.activatePreset(nextPreset, vaultPath, bodyEl);
      else { bodyEl.empty(); this.render(bodyEl); }
    }).open();
  }

  private deletePreset(preset: ClaudeProviderPreset, bodyEl: HTMLElement): void {
    const settings = this.getSettings();
    settings.providers = {
      ...settings.providers,
      activePresetId: settings.providers.activePresetId === preset.id ? 'official' : settings.providers.activePresetId,
      presets: settings.providers.presets.filter((candidate) => candidate.id !== preset.id),
    };
    void this.options.plugin.saveSettings().then(() => {
      bodyEl.empty();
      this.render(bodyEl);
    });
  }

  private activatePreset(preset: ClaudeProviderPreset, vaultPath: string, bodyEl: HTMLElement): Promise<void> {
    if (!vaultPath || !this.getSettings().settingSources.includes('local') || !this.localReady || this.applying || this.metadataPersistence.hasPendingPersistence()) return Promise.resolve();
    this.applying = true;
    for (const button of bodyEl.querySelectorAll<HTMLButtonElement>('[data-claude-provider-apply]')) button.disabled = true;
    const settings = this.getSettings();
    return applyClaudeProviderPreset(vaultPath, preset, settings.providers.lastAppliedManagedEnvKeys, {
      expectedRevision: this.localRevision,
    })
      .then(async (result) => {
        this.conflict = null;
        this.localRevision = result.revision;
        settings.providers = {
          ...settings.providers,
          activePresetId: preset.id,
          lastAppliedManagedEnvKeys: result.lastAppliedManagedEnvKeys,
        };
        if (!await this.metadataPersistence.persistPresetMetadata(result, settings, bodyEl)) return;
        this.options.onAfterMutation?.();
        bodyEl.empty();
        this.render(bodyEl);
        new Notice(result.backupPath
          ? t('settings.claudeCode.providers.appliedWithBackup')
          : t('settings.claudeCode.providers.applied'));
      })
      .catch((error: unknown) => {
        if (this.isRevisionConflict(error)) {
          this.conflict = { kind: 'preset', preset: clonePreset(preset) };
          bodyEl.empty();
          this.render(bodyEl);
          return;
        }
        bodyEl.empty();
        this.render(bodyEl);
        new Notice(t('settings.claudeCode.providers.applyFailed'));
      })
      .finally(() => {
        this.applying = false;
        for (const button of bodyEl.querySelectorAll<HTMLButtonElement>('[data-claude-provider-apply]')) button.disabled = !this.localReady || this.metadataPersistence.hasPendingPersistence();
      });
  }

  private isRevisionConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'result' in error && (error as { result?: { status?: string } }).result?.status === 'conflict';
  }

  private migrateLegacyModels(vaultPath: string, bodyEl: HTMLElement): void {
    const settings = this.getSettings();
    if (settings.providers.modelMigrationDone || this.migrationInFlight || this.metadataPersistence.hasPendingPersistence()) {
      return;
    }
    this.migrationInFlight = true;
    void migrateClaudeProviderModels(vaultPath, settings.model, settings.fallbackModel, {
      expectedRevision: this.localRevision,
    })
      .then(async (result) => {
        this.conflict = null;
        if (result.revision) {
          this.localRevision = result.revision;
        }
        settings.model = '';
        settings.fallbackModel = '';
        settings.providers = { ...settings.providers, modelMigrationDone: true };
        if (!await this.metadataPersistence.persistMigrationMetadata(result, settings, bodyEl)) return;
        new Notice(t('settings.claudeCode.providers.migrationDone'));
        bodyEl.empty();
        this.render(bodyEl);
      })
      .catch((error: unknown) => {
        if (this.isRevisionConflict(error)) {
          this.conflict = { kind: 'migration' };
          bodyEl.empty();
          this.render(bodyEl);
          return;
        }
        new Notice(t('settings.claudeCode.providers.migrationFailed'));
      })
      .finally(() => {
        this.migrationInFlight = false;
      });
  }
}
