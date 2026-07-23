/** Project-level Claude provider preset settings surface. */

import { Modal, Notice, Setting } from 'obsidian';

import {
  applyClaudeProviderPreset,
  maskClaudeProviderConfigSnapshot,
  maskClaudeProviderValue,
  migrateClaudeProviderModels,
  readClaudeProviderConfigSnapshot,
  resolveClaudeProviderGlobalEffectiveValue,
  validateClaudeProviderPreset,
} from '../../core/agents/backend';
import {
  CLAUDE_OFFICIAL_PROVIDER_PRESET,
  type ClaudeProviderPreset,
} from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';

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
  constructor(
    app: OpenCodianPlugin['app'],
    private readonly snapshot: Awaited<ReturnType<typeof readClaudeProviderConfigSnapshot>>,
  ) {
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
      if (layer.parseError) {
        section.createEl('p', { cls: 'opencodian-claude-provider-warning', text: layer.parseError });
      }
      section.createEl('pre', { text: layer.exists ? JSON.stringify(layer.content, null, 2) : '{}' });
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

  constructor(
    app: OpenCodianPlugin['app'],
    preset: ClaudeProviderPreset | null,
    private readonly onSave: (preset: ClaudeProviderPreset) => Promise<void>,
  ) {
    super(app);
    this.draft = preset ? clonePreset(preset) : {
      id: makePresetId(),
      name: '',
      baseUrl: '',
      authToken: '',
      model: '',
      fallbackModel: '',
      haikuModel: '',
      extraEnv: {},
    };
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

  constructor(private readonly options: SettingsClaudeProvidersSectionOptions) {}

  render(bodyEl: HTMLElement): void {
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

    this.migrateLegacyModels(vaultPath, bodyEl);
    this.renderGuidance(bodyEl);
    this.renderGlobalConfigurationAction(bodyEl, vaultPath);
    const listEl = bodyEl.createDiv({ cls: 'opencodian-claude-provider-list' });
    for (const preset of settings.providers.presets) {
      this.renderPresetCard(listEl, preset, vaultPath, bodyEl);
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
    vaultPath: string,
    bodyEl: HTMLElement,
  ): void {
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
    activateButton.disabled = preset.id === this.getSettings().providers.activePresetId;
    activateButton.addEventListener('click', () => this.activatePreset(preset, vaultPath, bodyEl));
    if (!isOfficialPreset(preset)) {
      const editButton = actions.createEl('button', { text: t('settings.claudeCode.providers.edit') });
      editButton.addEventListener('click', () => this.openPresetEditor(preset, containerEl.parentElement ?? containerEl));
      const deleteButton = actions.createEl('button', { cls: 'mod-warning', text: t('settings.claudeCode.providers.delete') });
      deleteButton.disabled = preset.id === this.getSettings().providers.activePresetId;
      deleteButton.addEventListener('click', () => this.deletePreset(preset, containerEl.parentElement ?? containerEl));
    }
    if (preset.id === this.getSettings().providers.activePresetId) {
      this.renderGlobalEffectiveSummary(cardEl, vaultPath);
    }
  }

  private renderGlobalEffectiveSummary(cardEl: HTMLElement, vaultPath: string): void {
    const summaryEl = cardEl.createDiv({
      cls: 'opencodian-claude-provider-global-summary',
      attr: { 'data-claude-provider-global-values': 'true' },
      text: t('settings.claudeCode.providers.globalLoading'),
    });
    void readClaudeProviderConfigSnapshot(vaultPath).then((snapshot) => {
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
    }).catch(() => summaryEl.setText(t('settings.claudeCode.providers.globalUnavailable')));
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
    const settings = this.getSettings();
    void applyClaudeProviderPreset(vaultPath, preset, settings.providers.lastAppliedManagedEnvKeys)
      .then(async (result) => {
        settings.providers = {
          ...settings.providers,
          activePresetId: preset.id,
          lastAppliedManagedEnvKeys: result.lastAppliedManagedEnvKeys,
        };
        await this.options.plugin.saveSettings();
        this.options.onAfterMutation?.();
        bodyEl.empty();
        this.render(bodyEl);
        new Notice(result.backupPath
          ? t('settings.claudeCode.providers.appliedWithBackup')
          : t('settings.claudeCode.providers.applied'));
      })
      .catch(() => new Notice(t('settings.claudeCode.providers.applyFailed')));
  }

  private migrateLegacyModels(vaultPath: string, bodyEl: HTMLElement): void {
    const settings = this.getSettings();
    if (settings.providers.modelMigrationDone || this.migrationInFlight) {
      return;
    }
    this.migrationInFlight = true;
    void migrateClaudeProviderModels(vaultPath, settings.model, settings.fallbackModel)
      .then(async () => {
        settings.model = '';
        settings.fallbackModel = '';
        settings.providers = { ...settings.providers, modelMigrationDone: true };
        await this.options.plugin.saveSettings();
        new Notice(t('settings.claudeCode.providers.migrationDone'));
        bodyEl.empty();
        this.render(bodyEl);
      })
      .catch(() => new Notice(t('settings.claudeCode.providers.migrationFailed')))
      .finally(() => {
        this.migrationInFlight = false;
      });
  }
}
