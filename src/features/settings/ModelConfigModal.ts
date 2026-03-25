import { App, Modal, Notice } from 'obsidian';

import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';

const logger = createLogger('ModelConfigModal');

interface ModelFormState {
  id: string;
  name: string;
  context: string;
  output: string;
  raw: OpencodeProviderModelConfig;
}

interface ProviderFormState {
  id: string;
  name: string;
  npm: string;
  baseURL: string;
  apiKey: string;
  models: ModelFormState[];
  raw: OpencodeProviderConfig;
}

export class ModelConfigModal extends Modal {
  private modelValue = '';
  private smallModelValue = '';
  private providers: ProviderFormState[] = [];
  private restartToggleEl: HTMLInputElement | null = null;
  private providersEl: HTMLElement | null = null;

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
    this.hydrate(config);

    contentEl.createEl('h2', { text: t('settings.model.visualEditor.title') });
    contentEl.createEl('p', {
      text: `${t('settings.model.config.path')}: ${service.getConfigPath()}`,
      cls: 'opencodian-config-path',
    });

    const defaultsEl = contentEl.createDiv({ cls: 'opencodian-model-config-defaults' });
    this.createField(defaultsEl, t('settings.model.visualEditor.defaultModel'), this.modelValue, (value) => {
      this.modelValue = value;
    }, 'provider/model');
    this.createField(defaultsEl, t('settings.model.visualEditor.smallModel'), this.smallModelValue, (value) => {
      this.smallModelValue = value;
    }, 'provider/model');

    this.providersEl = contentEl.createDiv({ cls: 'opencodian-model-config-providers' });
    this.renderProviders();

    const actionsEl = contentEl.createDiv({ cls: 'opencodian-model-config-actions' });
    actionsEl.createEl('button', {
      text: t('settings.model.visualEditor.addProvider'),
      cls: 'mod-cta',
    }).addEventListener('click', () => {
      this.providers.push(this.createEmptyProvider());
      this.renderProviders();
    });

    const optionsEl = contentEl.createDiv({ cls: 'opencodian-model-config-options' });
    const restartLabel = optionsEl.createEl('label', { cls: 'opencodian-model-config-checkbox' });
    this.restartToggleEl = restartLabel.createEl('input', { attr: { type: 'checkbox' } });
    this.restartToggleEl.checked = this.plugin.settings.server.mode === 'local';
    restartLabel.createSpan({ text: t('settings.model.config.restart') });

    const buttonContainer = contentEl.createDiv({ cls: 'opencodian-config-buttons' });
    buttonContainer.createEl('button', { text: t('settings.model.visualEditor.save'), cls: 'mod-cta' })
      .addEventListener('click', () => void this.save());
    buttonContainer.createEl('button', { text: t('settings.model.visualEditor.close') })
      .addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }

  private hydrate(config: OpencodeModelConfigSubset): void {
    this.modelValue = config.model ?? '';
    this.smallModelValue = config.small_model ?? '';
    this.providers = Object.entries(config.provider ?? {}).map(([providerId, provider]) => ({
      id: providerId,
      name: typeof provider.name === 'string' ? provider.name : '',
      npm: typeof provider.npm === 'string' ? provider.npm : '@ai-sdk/openai-compatible',
      baseURL: this.readString(provider.options, 'baseURL'),
      apiKey: this.readString(provider.options, 'apiKey'),
      models: Object.entries(provider.models ?? {}).map(([modelId, model]) => ({
        id: modelId,
        name: typeof model.name === 'string' ? model.name : '',
        context: this.readNumber(model.limit, 'context'),
        output: this.readNumber(model.limit, 'output'),
        raw: model,
      })),
      raw: provider,
    }));

    if (this.providers.length === 0) {
      this.providers.push(this.createEmptyProvider());
    }
  }

  private renderProviders(): void {
    if (!this.providersEl) {
      return;
    }

    this.providersEl.empty();

    this.providers.forEach((provider, providerIndex) => {
      const card = this.providersEl!.createDiv({ cls: 'opencodian-model-provider-card' });
      const header = card.createDiv({ cls: 'opencodian-model-provider-card-header' });
      header.createEl('h3', {
        text: provider.name.trim() || provider.id.trim() || t('settings.model.visualEditor.providerUntitled'),
      });
      header.createEl('button', {
        text: t('settings.model.visualEditor.deleteProvider'),
      }).addEventListener('click', () => {
        this.providers.splice(providerIndex, 1);
        if (this.providers.length === 0) {
          this.providers.push(this.createEmptyProvider());
        }
        this.renderProviders();
      });

      const grid = card.createDiv({ cls: 'opencodian-model-provider-grid' });
      this.createField(grid, `${t('settings.model.visualEditor.providerId')} *`, provider.id, (value) => {
        provider.id = value;
      }, 'myprovider');
      this.createField(grid, `${t('settings.model.visualEditor.providerName')} *`, provider.name, (value) => {
        provider.name = value;
      }, 'My Provider');
      this.createField(grid, `${t('settings.model.visualEditor.baseURL')} *`, provider.baseURL, (value) => {
        provider.baseURL = value;
      }, 'https://api.example.com/v1');
      this.createField(grid, t('settings.model.visualEditor.apiKey'), provider.apiKey, (value) => {
        provider.apiKey = value;
      }, '{env:MY_API_KEY}', true);
      this.createField(grid, t('settings.model.visualEditor.npmPackage'), provider.npm, (value) => {
        provider.npm = value;
      }, '@ai-sdk/openai-compatible');

      const modelsTitle = card.createDiv({ cls: 'opencodian-model-provider-models-title', text: t('settings.model.visualEditor.models') });
      modelsTitle.createEl('span', { text: ` (${provider.models.length})` });

      const modelsEl = card.createDiv({ cls: 'opencodian-model-provider-models' });
      provider.models.forEach((model, modelIndex) => {
        const row = modelsEl.createDiv({ cls: 'opencodian-model-provider-model-row' });
        this.createField(row, `${t('settings.model.visualEditor.modelId')} *`, model.id, (value) => {
          model.id = value;
        }, 'my-model');
        this.createField(row, t('settings.model.visualEditor.modelName'), model.name, (value) => {
          model.name = value;
        }, 'My Model');
        this.createField(row, t('settings.model.visualEditor.contextLimit'), model.context, (value) => {
          model.context = value;
        }, '200000');
        this.createField(row, t('settings.model.visualEditor.outputLimit'), model.output, (value) => {
          model.output = value;
        }, '65536');
        row.createEl('button', {
          text: t('settings.model.visualEditor.deleteModel'),
          cls: 'opencodian-model-provider-delete-model',
        }).addEventListener('click', () => {
          provider.models.splice(modelIndex, 1);
          this.renderProviders();
        });
      });

      card.createEl('button', {
        text: t('settings.model.visualEditor.addModel'),
        cls: 'mod-cta',
      }).addEventListener('click', () => {
        provider.models.push({
          id: '',
          name: '',
          context: '',
          output: '',
          raw: {},
        });
        this.renderProviders();
      });
    });
  }

  private createField(
    container: HTMLElement,
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder = '',
    secret = false,
  ): void {
    const field = container.createDiv({ cls: 'opencodian-model-config-field' });
    field.createEl('label', { text: label });
    const input = field.createEl('input', {
      attr: {
        type: secret ? 'password' : 'text',
        value,
        placeholder,
      },
    });
    input.addEventListener('input', () => onChange(input.value));
  }

  private createEmptyProvider(): ProviderFormState {
    return {
      id: '',
      name: '',
      npm: '@ai-sdk/openai-compatible',
      baseURL: '',
      apiKey: '',
      models: [],
      raw: {},
    };
  }

  private readString(record: unknown, key: string): string {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      return '';
    }

    const value = (record as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }

  private readNumber(record: unknown, key: string): string {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      return '';
    }

    const value = (record as Record<string, unknown>)[key];
    return typeof value === 'number' ? String(value) : '';
  }

  private async save(): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    try {
      const modelConfig = this.toModelConfig();
      await this.plugin.modelConfigService.writeLocalModelConfig(modelConfig);
      await this.maybeRestartServer();
      await this.plugin.saveSettings();
      new Notice(t('settings.model.visualEditor.saveSuccess'));
      this.close();
    } catch (error) {
      logger.error('Failed to save visual model config:', error);
      new Notice(`${t('settings.model.visualEditor.saveFailed')}: ${(error as Error).message}`);
    }
  }

  private toModelConfig(): OpencodeModelConfigSubset {
    const seenProviders = new Set<string>();
    const providerEntries = this.providers.reduce<Record<string, OpencodeProviderConfig>>((result, provider) => {
      const isBlankProvider =
        !provider.id.trim()
        && !provider.name.trim()
        && !provider.baseURL.trim()
        && !provider.apiKey.trim()
        && provider.models.length === 0;
      if (isBlankProvider) {
        return result;
      }

      const providerId = provider.id.trim();
      const providerName = provider.name.trim();
      const baseURL = provider.baseURL.trim();

      if (!providerId) {
        throw new Error(t('settings.model.visualEditor.errorProviderId'));
      }
      if (!providerName) {
        throw new Error(t('settings.model.visualEditor.errorProviderName'));
      }
      if (!baseURL) {
        throw new Error(t('settings.model.visualEditor.errorBaseURL'));
      }
      if (seenProviders.has(providerId)) {
        throw new Error(t('settings.model.visualEditor.errorProviderDuplicate'));
      }
      seenProviders.add(providerId);

      const nextProvider: OpencodeProviderConfig = { ...provider.raw };
      nextProvider.name = providerName;
      nextProvider.npm = provider.npm.trim() || '@ai-sdk/openai-compatible';

      const nextOptions = typeof nextProvider.options === 'object' && nextProvider.options !== null && !Array.isArray(nextProvider.options)
        ? { ...nextProvider.options }
        : {};
      nextOptions.baseURL = baseURL;
      if (provider.apiKey.trim()) {
        nextOptions.apiKey = provider.apiKey.trim();
      } else {
        delete nextOptions.apiKey;
      }
      nextProvider.options = nextOptions;

      const seenModels = new Set<string>();
      const modelEntries = provider.models.reduce<Record<string, OpencodeProviderModelConfig>>((models, model) => {
        const modelId = model.id.trim();
        if (!modelId) {
          throw new Error(t('settings.model.visualEditor.errorModelId'));
        }
        if (seenModels.has(modelId)) {
          throw new Error(t('settings.model.visualEditor.errorModelDuplicate'));
        }
        seenModels.add(modelId);

        const nextModel: OpencodeProviderModelConfig = { ...model.raw };
        if (model.name.trim()) {
          nextModel.name = model.name.trim();
        } else {
          delete nextModel.name;
        }

        const nextLimit = typeof nextModel.limit === 'object' && nextModel.limit !== null && !Array.isArray(nextModel.limit)
          ? { ...nextModel.limit }
          : {};

        if (model.context.trim()) {
          const contextValue = Number(model.context.trim());
          if (!Number.isFinite(contextValue) || contextValue <= 0) {
            throw new Error(t('settings.model.visualEditor.errorContextLimit'));
          }
          nextLimit.context = contextValue;
        } else {
          delete nextLimit.context;
        }

        if (model.output.trim()) {
          const outputValue = Number(model.output.trim());
          if (!Number.isFinite(outputValue) || outputValue <= 0) {
            throw new Error(t('settings.model.visualEditor.errorOutputLimit'));
          }
          nextLimit.output = outputValue;
        } else {
          delete nextLimit.output;
        }

        if (Object.keys(nextLimit).length > 0) {
          nextModel.limit = nextLimit;
        } else {
          delete nextModel.limit;
        }

        models[modelId] = nextModel;
        return models;
      }, {});

      nextProvider.models = modelEntries;
      result[providerId] = nextProvider;
      return result;
    }, {});

    return {
      model: this.modelValue.trim() || undefined,
      small_model: this.smallModelValue.trim() || undefined,
      provider: providerEntries,
    };
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
