/** Credential editing and masked source inspection for Claude provider settings. */
import { Modal, Notice, Setting } from 'obsidian';

import {
  type ClaudeProviderConfigSnapshot,
  maskClaudeProviderConfigSnapshot,
  validateClaudeProviderPreset,
} from '../../../../core/agents/backend';
import type { ClaudeProviderPreset } from '../../../../core/types';
import { t, type TranslationKey } from '../../../../i18n';

export class ClaudeProviderConfigModal extends Modal {
  constructor(app: Modal['app'], private readonly snapshot: ClaudeProviderConfigSnapshot) {
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

function parseExtraEnv(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key) result[key] = line.slice(separator + 1).trim();
  }
  return result;
}

export class ClaudeProviderPresetModal extends Modal {
  private readonly draft: ClaudeProviderPreset;
  private saving = false;

  constructor(
    app: Modal['app'],
    preset: ClaudeProviderPreset | null,
    private readonly onSave: (preset: ClaudeProviderPreset, apply: boolean) => Promise<void>,
  ) {
    super(app);
    this.draft = preset
      ? { ...preset, extraEnv: { ...preset.extraEnv } }
      : { id: `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', baseUrl: '', authToken: '', model: '', fallbackModel: '', haikuModel: '', extraEnv: {} };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('opencodian-claude-provider-preset-modal');
    contentEl.createEl('h2', { text: t('settings.claudeCode.providers.editor.title') });
    contentEl.createEl('p', { cls: 'opencodian-claude-provider-info', text: t('settings.claudeCode.providers.editor.desc') });
    this.addTextSetting(contentEl, 'name');
    this.addTextSetting(contentEl, 'baseUrl');
    this.addTextSetting(contentEl, 'authToken');
    this.addTextSetting(contentEl, 'model');
    this.addTextSetting(contentEl, 'fallbackModel');
    this.addTextSetting(contentEl, 'haikuModel');
    new Setting(contentEl)
      .setName(t('settings.claudeCode.providers.field.extraEnv'))
      .setDesc(t('settings.claudeCode.providers.field.extraEnvDesc'))
      .addTextArea((text) => {
        text.inputEl.setAttribute('aria-label', t('settings.claudeCode.providers.field.extraEnv'));
        text.setValue(Object.entries(this.draft.extraEnv).map(([key, value]) => `${key}=${value}`).join('\n'))
          .onChange((value) => { this.draft.extraEnv = parseExtraEnv(value); });
      });
    const status = contentEl.createDiv({ attr: { role: 'status', 'aria-live': 'polite' }, cls: 'opencodian-claude-provider-editor-status' });
    const actions = contentEl.createDiv({ cls: 'opencodian-claude-provider-modal-actions' });
    for (const apply of [false, true]) {
      const button = actions.createEl('button', {
        cls: apply ? 'mod-cta' : '',
        text: t(apply ? 'settings.claudeCode.providers.editor.saveApply' : 'settings.claudeCode.providers.editor.save'),
        attr: { type: 'button' },
      });
      button.addEventListener('click', () => { void this.save(apply, status, actions); });
    }
  }

  onClose(): void {
    this.contentEl.empty();
    this.draft.authToken = '';
    this.draft.extraEnv = {};
  }

  private async save(apply: boolean, status: HTMLElement, actions: HTMLElement): Promise<void> {
    if (this.saving) return;
    if (!this.draft.name.trim() || Object.values(validateClaudeProviderPreset(this.draft)).some(Boolean)) {
      new Notice(t('settings.claudeCode.providers.editor.invalid'));
      return;
    }
    this.saving = true;
    const buttons = Array.from(actions.querySelectorAll('button'));
    buttons.forEach(button => { button.disabled = true; });
    status.setText(t('settings.claudeCode.providers.editor.saving'));
    try {
      await this.onSave({ ...this.draft, extraEnv: { ...this.draft.extraEnv } }, apply);
      this.close();
    } catch {
      status.setText(t('settings.claudeCode.providers.editor.saveFailed'));
    } finally {
      this.saving = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  private addTextSetting(containerEl: HTMLElement, field: 'name' | 'baseUrl' | 'authToken' | 'model' | 'fallbackModel' | 'haikuModel'): void {
    const key = `settings.claudeCode.providers.field.${field}`;
    const label = t(`${key}.name` as TranslationKey);
    new Setting(containerEl)
      .setName(label)
      .setDesc(t(`${key}.desc` as TranslationKey))
      .addText((text) => {
        text.inputEl.setAttribute('aria-label', label);
        text.setValue(this.draft[field]).onChange((value) => { this.draft[field] = value; });
        if (field === 'authToken') {
          text.inputEl.type = 'password';
          text.inputEl.autocomplete = 'off';
        }
      });
  }
}
