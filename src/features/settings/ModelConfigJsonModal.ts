import { App, Modal, Notice } from 'obsidian';

import type { OpencodeModelConfigSubset } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { TextareaSizeMemory } from './TextareaSizeMemory';

const logger = createLogger('ModelConfigJsonModal');

export class ModelConfigJsonModal extends Modal {
  private editorEl: HTMLTextAreaElement | null = null;
  private restartToggleEl: HTMLInputElement | null = null;
  private editorSizeMemory: TextareaSizeMemory | null = null;
  private initialEditorValue = '';

  constructor(
    app: App,
    private readonly plugin: OpenCodianPlugin,
  ) {
    super(app);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const service = this.plugin.modelConfigService;
    if (!service) {
      contentEl.createEl('p', { text: t('settings.model.config.unavailable') });
      return;
    }

    const config = await service.readLocalModelConfig();

    contentEl.createEl('h2', { text: t('settings.model.jsonEditor.title') });
    contentEl.createEl('p', {
      text: `${t('settings.model.config.path')}: ${service.getConfigPath()}`,
      cls: 'opencodian-config-path',
    });

    this.editorEl = contentEl.createEl('textarea', {
      cls: 'opencodian-config-editor opencodian-model-config-json-editor',
      attr: {
        spellcheck: 'false',
        placeholder: '{\n  "provider": {}\n}',
      },
    });
    this.editorEl.value = JSON.stringify(config, null, 2);
    this.initialEditorValue = this.editorEl.value;
    this.editorSizeMemory = TextareaSizeMemory.attach(this.editorEl, 'model-config-json-editor');

    const optionsEl = contentEl.createDiv({ cls: 'opencodian-model-config-options' });
    const restartLabel = optionsEl.createEl('label', { cls: 'opencodian-model-config-checkbox' });
    this.restartToggleEl = restartLabel.createEl('input', { attr: { type: 'checkbox' } });
    this.restartToggleEl.checked = this.plugin.settings.server.mode === 'local';
    restartLabel.createSpan({ text: t('settings.model.config.restart') });

    const helpEl = contentEl.createDiv({ cls: 'opencodian-config-help opencodian-model-config-help' });
    helpEl.createEl('h4', { text: t('settings.model.jsonEditor.helpTitle') });
    helpEl.createEl('p', { text: t('settings.model.jsonEditor.helpDesc') });
    helpEl.createEl('pre', {
      text: JSON.stringify(
        {
          model: 'myprovider/my-model',
          provider: {
            myprovider: {
              name: 'My Provider',
              npm: '@ai-sdk/openai-compatible',
              options: {
                baseURL: 'https://api.example.com/v1',
                apiKey: '{env:MY_API_KEY}',
              },
              models: {
                'my-model': {
                  name: 'My Model',
                  limit: {
                    context: 200000,
                    output: 65536,
                  },
                },
              },
            },
          },
        },
        null,
        2,
      ),
    });

    const buttonContainer = contentEl.createDiv({ cls: 'opencodian-config-buttons' });
    const formatButton = buttonContainer.createEl('button', { text: t('settings.model.jsonEditor.format') });
    formatButton.type = 'button';
    formatButton.addEventListener('click', () => this.formatJson());
    const saveButton = buttonContainer.createEl('button', { text: t('settings.model.jsonEditor.save'), cls: 'mod-cta' });
    saveButton.type = 'button';
    saveButton.addEventListener('click', () => void this.save());
    const closeButton = buttonContainer.createEl('button', { text: t('settings.model.jsonEditor.close') });
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => this.close());
  }

  close(): void {
    if (this.hasUnsavedChanges()) {
      const confirmed = window.confirm(t('settings.model.config.unsavedConfirm'));
      if (!confirmed) {
        return;
      }
    }

    super.close();
  }

  onClose() {
    this.editorSizeMemory?.destroy();
    this.editorSizeMemory = null;
    this.contentEl.empty();
  }

  private formatJson(): void {
    if (!this.editorEl) {
      return;
    }

    try {
      const value = JSON.parse(this.editorEl.value) as OpencodeModelConfigSubset;
      this.validate(value);
      this.editorEl.value = JSON.stringify(value, null, 2);
      new Notice(t('settings.model.jsonEditor.formatSuccess'));
    } catch (error) {
      new Notice(`${t('settings.model.jsonEditor.invalidJson')}: ${(error as Error).message}`);
    }
  }

  private async save(): Promise<void> {
    if (!this.editorEl || !this.plugin.modelConfigService) {
      return;
    }

    try {
      const value = JSON.parse(this.editorEl.value) as OpencodeModelConfigSubset;
      this.validate(value);
      await this.plugin.modelConfigService.writeLocalModelConfig(value);
      await this.maybeRestartServer();
      await this.plugin.saveSettings({ syncConfig: false });
      this.initialEditorValue = this.editorEl.value;
      new Notice(t('settings.model.jsonEditor.saveSuccess'));
      this.close();
    } catch (error) {
      logger.error('Failed to save model JSON config:', error);
      new Notice(`${t('settings.model.jsonEditor.saveFailed')}: ${(error as Error).message}`);
    }
  }

  private validate(value: OpencodeModelConfigSubset): void {
    if (value.provider !== undefined && (typeof value.provider !== 'object' || value.provider === null || Array.isArray(value.provider))) {
      throw new Error(t('settings.model.jsonEditor.providerObject'));
    }

    for (const key of ['enabled_providers', 'disabled_providers'] as const) {
      const list = value[key];
      if (list !== undefined && (!Array.isArray(list) || list.some((item) => typeof item !== 'string'))) {
        throw new Error(t('settings.model.jsonEditor.providerListArray'));
      }
    }
  }

  private hasUnsavedChanges(): boolean {
    return (this.editorEl?.value ?? '') !== this.initialEditorValue;
  }

  private async maybeRestartServer(): Promise<void> {
    if (!this.restartToggleEl?.checked) {
      return;
    }

    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.server.remoteManageUnavailable'));
      return;
    }

    const running = await this.plugin.openCodeService.checkHealth();
    if (!running) {
      return;
    }

    await this.plugin.openCodeService.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.plugin.openCodeService.start();
    new Notice(t('settings.model.config.restartSuccess'));
  }
}
