/** Project-level Claude provider preset settings surface. */

import { Modal, Notice, Setting } from 'obsidian';

import {
  applyClaudeProviderPreset,
  type ClaudeProviderConfigSnapshot,
  maskClaudeProviderConfigSnapshot,
  maskClaudeProviderValue,
  migrateClaudeProviderModels,
  readClaudeProviderConfigSnapshot,
  resolveClaudeProviderGlobalEffectiveValue,
  validateClaudeProviderPreset,
} from '../../core/agents/backend';
import { CLAUDE_OFFICIAL_PROVIDER_PRESET, type ClaudeProviderPreset } from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';
import { SettingsClaudeProviderMetadataPersistenceCoordinator } from './SettingsClaudeProviderMetadataPersistenceCoordinator';

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

type ClaudeProviderConflict = { kind: 'preset'; preset: ClaudeProviderPreset } | { kind: 'migration' };
type ClaudeProviderRenderContext = {
  bodyEl: HTMLElement;
  generation: number;
  snapshotPromise: Promise<ClaudeProviderConfigSnapshot>;
  vaultPath: string;
  migrationButton?: HTMLButtonElement | null;
};

function parseExtraEnv(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (key) {
      result[key] = line.slice(separator + 1).trim();
    }
  }
  return result;
}

function makePresetId(): string {
  return `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class ClaudeProviderConfigModal extends Modal {
  constructor(app: OpenCodianPlugin['app'], private readonly snapshot: Awaited<ReturnType<typeof readClaudeProviderConfigSnapshot>>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('opencodian-claude-provider-config-modal');
    contentEl.createEl('h2', { text: t('settings.claudeCode.providers.configModal.title') });
    contentEl.createEl('p', { text: t('settings.claudeCode.providers.configModal.desc') });
    const masked = maskClaudeProviderConfigSnapshot(this.snapshot);
    for (const layer of masked.layers) {
      const section = contentEl.createDiv({ cls: 'opencodian-claude-provider-config-layer' });
      section.createEl('h3', { text: t(`settings.claudeCode.providers.layer.${layer.id}`) });
      section.createEl('p', {
        cls: 'opencodian-claude-provider-config-path',
        text: layer.filePath || t('settings.claudeCode.providers.noVault'),
      });
      if (layer.parseError) section.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.configModal.unavailable') });
      section.createEl('pre', { text: layer.parseError ? '{}' : layer.exists ? JSON.stringify(layer.content, null, 2) : '{}' });
    }
    const shellSection = contentEl.createDiv({ cls: 'opencodian-claude-provider-config-layer' });
    shellSection.createEl('h3', { text: t('settings.claudeCode.providers.layer.shell') });
    shellSection.createEl('pre', { text: JSON.stringify(masked.shellEnv, null, 2) });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ClaudeProviderPresetModal extends Modal {
  private readonly draft: ClaudeProviderPreset;

  constructor(app: OpenCodianPlugin['app'], preset: ClaudeProviderPreset | null, private readonly onSave: (preset: ClaudeProviderPreset) => Promise<void>) {
    super(app);
    this.draft = preset ? clonePreset(preset) : { id: makePresetId(), name: '', baseUrl: '', authToken: '', model: '', fallbackModel: '', haikuModel: '', extraEnv: {} };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('opencodian-claude-provider-preset-modal');
    contentEl.createEl('h2', { text: t('settings.claudeCode.providers.editor.title') });
    this.addTextSetting(contentEl, 'name', 'settings.claudeCode.providers.field.name');
    this.addTextSetting(contentEl, 'baseUrl', 'settings.claudeCode.providers.field.baseUrl');
    this.addTextSetting(contentEl, 'authToken', 'settings.claudeCode.providers.field.authToken', true);
    this.addTextSetting(contentEl, 'model', 'settings.claudeCode.providers.field.model');
    this.addTextSetting(contentEl, 'fallbackModel', 'settings.claudeCode.providers.field.fallbackModel');
    this.addTextSetting(contentEl, 'haikuModel', 'settings.claudeCode.providers.field.haikuModel');
    new Setting(contentEl)
      .setName(t('settings.claudeCode.providers.field.extraEnv'))
      .setDesc(t('settings.claudeCode.providers.field.extraEnvDesc'))
      .addTextArea((text) => {
        text
          .setValue(Object.entries(this.draft.extraEnv).map(([key, value]) => `${key}=${value}`).join('\n'))
          .onChange((value) => {
            this.draft.extraEnv = parseExtraEnv(value);
          });
      });

    const actions = contentEl.createDiv({ cls: 'opencodian-claude-provider-modal-actions' });
    const saveButton = actions.createEl('button', { cls: 'mod-cta', text: t('settings.claudeCode.providers.editor.save') });
    saveButton.addEventListener('click', () => {
      const validation = validateClaudeProviderPreset(this.draft);
      if (!this.draft.name.trim() || Object.values(validation).some(Boolean)) {
        new Notice(t('settings.claudeCode.providers.editor.invalid'));
        return;
      }
      void this.onSave(clonePreset(this.draft)).then(() => this.close());
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addTextSetting(
    containerEl: HTMLElement,
    field: keyof Pick<ClaudeProviderPreset, 'name' | 'baseUrl' | 'authToken' | 'model' | 'fallbackModel' | 'haikuModel'>,
    key: string,
    secret = false,
  ): void {
    new Setting(containerEl)
      .setName(t(`${key}.name` as TranslationKey))
      .setDesc(t(`${key}.desc` as TranslationKey))
      .addText((text) => {
        text.setValue(this.draft[field]).onChange((value) => {
          this.draft[field] = value;
        });
        if (secret) {
          text.inputEl.type = 'password';
          text.inputEl.autocomplete = 'off';
        }
      });
  }
}

export class SettingsClaudeProvidersSection {
  private migrationInFlight = false;
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

    this.renderGuidance(bodyEl);
    this.metadataPersistence.render(bodyEl, generation);
    const snapshotPromise = readClaudeProviderConfigSnapshot(vaultPath);
    const context: ClaudeProviderRenderContext = { bodyEl, generation, snapshotPromise, vaultPath };
    context.migrationButton = this.renderMigrationAction(context);
    this.renderLocalStatus(context);
    this.renderConflictResolution(context);
    this.renderGlobalConfigurationAction(bodyEl, vaultPath);
    const listEl = bodyEl.createDiv({ cls: 'opencodian-claude-provider-list' });
    for (const preset of settings.providers.presets) {
      this.renderPresetCard(listEl, preset, context);
    }
    new Setting(bodyEl)
      .setName(t('settings.claudeCode.providers.add.name'))
      .setDesc(t('settings.claudeCode.providers.add.desc'))
      .addButton((button) => button
        .setButtonText(t('settings.claudeCode.providers.add.button'))
        .setCta()
        .onClick(() => this.openPresetEditor(null, bodyEl)));
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
    const setting = new Setting(bodyEl)
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
    const statusEl = bodyEl.createDiv({ cls: 'opencodian-claude-provider-local-status', attr: { 'data-claude-provider-local-status': 'true' }, text: t('settings.claudeCode.providers.localStatus.loading') });
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
      if (migrationButton) migrationButton.disabled = false;
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
    const { bodyEl, vaultPath } = context;
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
        const local = snapshot.layers.find((layer) => layer.id === 'local');
        this.localRevision = local?.revision ?? null;
        if (!local || local.parseError) {
          new Notice(t('settings.claudeCode.providers.localStatus.failed', {
            reason: t(`settings.claudeCode.providers.localStatus.reason.${local ? 'parse' : 'read'}` as TranslationKey),
          }));
          return;
        }
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
    heading.createEl('strong', { text: preset.name });
    if (preset.id === this.getSettings().providers.activePresetId) {
      heading.createSpan({ cls: 'opencodian-claude-provider-active-badge', text: t('settings.claudeCode.providers.active') });
    }
    cardEl.createEl('code', { text: preset.baseUrl || t('settings.claudeCode.providers.official') });
    const validation = validateClaudeProviderPreset(preset);
    if (validation.baseUrlEndsWithV1) cardEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.validation.baseUrlV1') });
    if (validation.authTokenHasBearerPrefix) cardEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.validation.bearer') });
    if (validation.fallbackMatchesModel) cardEl.createEl('p', { cls: 'opencodian-claude-provider-warning', text: t('settings.claudeCode.providers.validation.sameFallback') });
    const actions = cardEl.createDiv({ cls: 'opencodian-claude-provider-card-actions' });
    const activateButton = actions.createEl('button', { text: t('settings.claudeCode.providers.activate') });
    activateButton.disabled = this.metadataPersistence.hasPendingPersistence() || preset.id === this.getSettings().providers.activePresetId;
    activateButton.addEventListener('click', () => this.activatePreset(preset, vaultPath, bodyEl));
    if (!isOfficialPreset(preset)) {
      const editButton = actions.createEl('button', { text: t('settings.claudeCode.providers.edit') });
      editButton.disabled = this.metadataPersistence.hasPendingPersistence();
      editButton.addEventListener('click', () => this.openPresetEditor(preset, containerEl.parentElement ?? containerEl));
      const deleteButton = actions.createEl('button', { cls: 'mod-warning', text: t('settings.claudeCode.providers.delete') });
      deleteButton.disabled = this.metadataPersistence.hasPendingPersistence() || preset.id === this.getSettings().providers.activePresetId;
      deleteButton.addEventListener('click', () => this.deletePreset(preset, containerEl.parentElement ?? containerEl));
    }
    if (preset.id === this.getSettings().providers.activePresetId) {
      this.renderGlobalEffectiveSummary(cardEl, context);
    }
  }

  private renderGlobalEffectiveSummary(cardEl: HTMLElement, context: ClaudeProviderRenderContext): void {
    const { generation, snapshotPromise } = context;
    const summaryEl = cardEl.createDiv({ cls: 'opencodian-claude-provider-global-summary', attr: { 'data-claude-provider-global-values': 'true' }, text: t('settings.claudeCode.providers.globalLoading') });
    void snapshotPromise.then((snapshot) => {
      if (generation !== this.renderGeneration) return;
      summaryEl.empty();
      for (const [key, label] of [
        ['model', t('settings.claudeCode.providers.field.model.name')],
        ['fallbackModel', t('settings.claudeCode.providers.field.fallbackModel.name')],
        ['ANTHROPIC_BASE_URL', t('settings.claudeCode.providers.field.baseUrl.name')],
        ['ANTHROPIC_AUTH_TOKEN', t('settings.claudeCode.providers.field.authToken.name')],
        ['ANTHROPIC_DEFAULT_HAIKU_MODEL', t('settings.claudeCode.providers.field.haikuModel.name')],
      ] as const) {
        const value = resolveClaudeProviderGlobalEffectiveValue(snapshot, key);
        const display = value === undefined
          ? '—'
          : JSON.stringify(maskClaudeProviderValue(key, value));
        summaryEl.createEl('small', { text: `${label}: ${display}` });
      }
    }).catch(() => {
      if (generation === this.renderGeneration) {
        summaryEl.setText(t('settings.claudeCode.providers.globalUnavailable'));
      }
    });
  }

  private openPresetEditor(preset: ClaudeProviderPreset | null, bodyEl: HTMLElement): void {
    new ClaudeProviderPresetModal(this.options.plugin.app, preset, async (nextPreset) => {
      const settings = this.getSettings();
      settings.providers = {
        ...settings.providers,
        presets: preset
          ? settings.providers.presets.map((candidate) => candidate.id === preset.id ? nextPreset : candidate)
          : [...settings.providers.presets, nextPreset],
      };
      await this.options.plugin.saveSettings();
      bodyEl.empty();
      this.render(bodyEl);
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

  private activatePreset(preset: ClaudeProviderPreset, vaultPath: string, bodyEl: HTMLElement): void {
    if (this.metadataPersistence.hasPendingPersistence()) return;
    const settings = this.getSettings();
    void applyClaudeProviderPreset(vaultPath, preset, settings.providers.lastAppliedManagedEnvKeys, {
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
        new Notice(t('settings.claudeCode.providers.applyFailed'));
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
