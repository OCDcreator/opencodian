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

type ProviderInterfaceFormatId =
  | 'openai-responses'
  | 'openai-compatible'
  | 'anthropic'
  | 'amazon-bedrock'
  | 'google-gemini'
  | 'custom';

interface ProviderInterfaceFormatOption {
  id: ProviderInterfaceFormatId;
  npm: string | null;
  labelKey: string;
  descriptionKey: string;
}

const DEFAULT_PROVIDER_INTERFACE_FORMAT: ProviderInterfaceFormatId = 'openai-compatible';

const PROVIDER_INTERFACE_FORMAT_OPTIONS: ProviderInterfaceFormatOption[] = [
  {
    id: 'openai-responses',
    npm: '@ai-sdk/openai',
    labelKey: 'settings.model.visualEditor.interfaceFormat.openaiResponses',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.openaiResponsesDesc',
  },
  {
    id: 'openai-compatible',
    npm: '@ai-sdk/openai-compatible',
    labelKey: 'settings.model.visualEditor.interfaceFormat.openaiCompatible',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.openaiCompatibleDesc',
  },
  {
    id: 'anthropic',
    npm: '@ai-sdk/anthropic',
    labelKey: 'settings.model.visualEditor.interfaceFormat.anthropic',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.anthropicDesc',
  },
  {
    id: 'amazon-bedrock',
    npm: '@ai-sdk/amazon-bedrock',
    labelKey: 'settings.model.visualEditor.interfaceFormat.amazonBedrock',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.amazonBedrockDesc',
  },
  {
    id: 'google-gemini',
    npm: '@ai-sdk/google',
    labelKey: 'settings.model.visualEditor.interfaceFormat.googleGemini',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.googleGeminiDesc',
  },
  {
    id: 'custom',
    npm: null,
    labelKey: 'settings.model.visualEditor.interfaceFormat.custom',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.customDesc',
  },
];

const PROVIDER_INTERFACE_FORMAT_BY_NPM = new Map<string, ProviderInterfaceFormatId>(
  PROVIDER_INTERFACE_FORMAT_OPTIONS
    .filter((option): option is ProviderInterfaceFormatOption & { npm: string } => typeof option.npm === 'string')
    .map((option) => [option.npm, option.id]),
);

const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  interfaceFormat: ProviderInterfaceFormatId;
  customNpm: string;
  baseURL: string;
  apiKey: string;
  models: ModelFormState[];
  raw: OpencodeProviderConfig;
}

export class ModelConfigModal extends Modal {
  private modelValue = '';
  private smallModelValue = '';
  private enabledProviders: string[] | null = null;
  private disabledProviders: string[] | null = null;
  private providers: ProviderFormState[] = [];
  private restartToggleEl: HTMLInputElement | null = null;
  private providersEl: HTMLElement | null = null;
  private initialSnapshot = '';

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
    this.initialSnapshot = this.createSnapshot();

    contentEl.createEl('h2', { text: t('settings.model.visualEditor.title') });
    contentEl.createEl('p', {
      text: t('settings.model.visualEditor.intro'),
      cls: 'opencodian-model-config-intro',
    });
    contentEl.createEl('p', {
      text: `${t('settings.model.config.path')}: ${service.getConfigPath()}`,
      cls: 'opencodian-config-path',
    });

    this.createSectionHeader(
      contentEl,
      t('settings.model.visualEditor.providersTitle'),
      t('settings.model.visualEditor.providersDesc'),
    );

    this.providersEl = contentEl.createDiv({ cls: 'opencodian-model-config-providers' });
    this.renderProviders();

    const actionsEl = contentEl.createDiv({ cls: 'opencodian-model-config-actions' });
    const addProviderButton = actionsEl.createEl('button', {
      text: t('settings.model.visualEditor.addProvider'),
      cls: 'mod-cta',
    });
    addProviderButton.type = 'button';
    addProviderButton.addEventListener('click', () => {
      this.providers.push(this.createEmptyProvider());
      this.renderProviders();
      this.focusProviderIdInput(this.providers.length - 1);
    });

    this.createSectionHeader(
      contentEl,
      t('settings.model.visualEditor.defaultsTitle'),
      t('settings.model.visualEditor.defaultsDesc'),
    );
    const defaultsEl = contentEl.createDiv({ cls: 'opencodian-model-config-defaults' });
    const defaultModelField = this.createField(defaultsEl, t('settings.model.visualEditor.defaultModel'), this.modelValue, (value) => {
      this.modelValue = value;
    }, 'provider/model');
    defaultModelField.createDiv({
      cls: 'opencodian-model-config-field-description',
      text: t('settings.model.visualEditor.defaultModelDesc'),
    });
    const smallModelField = this.createField(defaultsEl, t('settings.model.visualEditor.smallModel'), this.smallModelValue, (value) => {
      this.smallModelValue = value;
    }, 'provider/model');
    smallModelField.createDiv({
      cls: 'opencodian-model-config-field-description',
      text: t('settings.model.visualEditor.smallModelDesc'),
    });

    const optionsEl = contentEl.createDiv({ cls: 'opencodian-model-config-options' });
    const restartLabel = optionsEl.createEl('label', { cls: 'opencodian-model-config-checkbox' });
    this.restartToggleEl = restartLabel.createEl('input', { attr: { type: 'checkbox' } });
    this.restartToggleEl.checked = this.plugin.settings.server.mode === 'local';
    restartLabel.createSpan({ text: t('settings.model.config.restart') });

    const buttonContainer = contentEl.createDiv({ cls: 'opencodian-config-buttons' });
    const saveButton = buttonContainer.createEl('button', { text: t('settings.model.visualEditor.save'), cls: 'mod-cta' });
    saveButton.type = 'button';
    saveButton.addEventListener('click', () => void this.save());
    const closeButton = buttonContainer.createEl('button', { text: t('settings.model.visualEditor.close') });
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
    this.contentEl.empty();
  }

  private hydrate(config: OpencodeModelConfigSubset): void {
    this.modelValue = config.model ?? '';
    this.smallModelValue = config.small_model ?? '';
    this.enabledProviders = Array.isArray(config.enabled_providers) ? [...config.enabled_providers] : null;
    this.disabledProviders = Array.isArray(config.disabled_providers) ? [...config.disabled_providers] : null;
    this.providers = Object.entries(config.provider ?? {}).map(([providerId, provider]) => ({
      ...this.resolveInterfaceFormatState(provider.npm),
      id: providerId,
      name: typeof provider.name === 'string' ? provider.name : '',
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
      const deleteProviderButton = header.createEl('button', {
        text: t('settings.model.visualEditor.deleteProvider'),
      });
      deleteProviderButton.type = 'button';
      deleteProviderButton.addEventListener('click', () => {
        this.providers.splice(providerIndex, 1);
        if (this.providers.length === 0) {
          this.providers.push(this.createEmptyProvider());
        }
        this.renderProviders();
        this.focusProviderIdInput(Math.min(providerIndex, this.providers.length - 1));
      });

      const grid = card.createDiv({ cls: 'opencodian-model-provider-grid' });
      const providerIdField = this.createField(grid, `${t('settings.model.visualEditor.providerId')} *`, provider.id, (value) => {
        provider.id = value;
      }, 'my-provider');
      providerIdField.createDiv({
        cls: 'opencodian-model-config-field-description',
        text: t('settings.model.visualEditor.providerIdDesc'),
      });
      this.createField(grid, `${t('settings.model.visualEditor.providerName')} *`, provider.name, (value) => {
        provider.name = value;
      }, 'My Provider');
      this.createField(grid, `${t('settings.model.visualEditor.baseURL')} *`, provider.baseURL, (value) => {
        provider.baseURL = value;
      }, 'https://api.example.com/v1');
      this.createField(grid, t('settings.model.visualEditor.apiKey'), provider.apiKey, (value) => {
        provider.apiKey = value;
      }, '{env:MY_API_KEY}', true);
      const interfaceFormatField = this.createSelectField(
        grid,
        t('settings.model.visualEditor.interfaceFormat'),
        provider.interfaceFormat,
        this.getInterfaceFormatOptions(provider).map((option) => ({
          value: option.id,
          label: t(option.labelKey as any),
        })),
        (value) => {
          provider.interfaceFormat = value as ProviderInterfaceFormatId;
          this.renderProviders();
        },
      );
      interfaceFormatField.createDiv({
        cls: 'opencodian-model-config-field-description',
        text: t('settings.model.visualEditor.interfaceFormatHint'),
      });
      interfaceFormatField.createDiv({
        cls: 'opencodian-model-config-field-description opencodian-model-config-field-description-detail',
        text: t(this.getInterfaceFormatOption(provider.interfaceFormat).descriptionKey as any),
      });

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
        const deleteModelButton = row.createEl('button', {
          text: t('settings.model.visualEditor.deleteModel'),
          cls: 'opencodian-model-provider-delete-model',
        });
        deleteModelButton.type = 'button';
        deleteModelButton.addEventListener('click', () => {
          provider.models.splice(modelIndex, 1);
          this.renderProviders();
        });
      });

      const addModelButton = card.createEl('button', {
        text: t('settings.model.visualEditor.addModel'),
        cls: 'mod-cta',
      });
      addModelButton.type = 'button';
      addModelButton.addEventListener('click', () => {
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
  ): HTMLElement {
    const field = container.createDiv({ cls: 'opencodian-model-config-field' });
    field.createEl('label', { text: label });
    const input = field.createEl('input');
    input.type = secret ? 'password' : 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => onChange(input.value));
    return field;
  }

  private createSectionHeader(container: HTMLElement, title: string, description: string): void {
    const header = container.createDiv({ cls: 'opencodian-model-config-section-header' });
    header.createEl('h3', {
      cls: 'opencodian-model-config-section-title',
      text: title,
    });
    header.createEl('p', {
      cls: 'opencodian-model-config-section-description',
      text: description,
    });
  }

  private createSelectField(
    container: HTMLElement,
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    onChange: (value: string) => void,
  ): HTMLElement {
    const field = container.createDiv({ cls: 'opencodian-model-config-field' });
    field.createEl('label', { text: label });
    const select = field.createEl('select');
    for (const option of options) {
      const optionEl = select.createEl('option', { text: option.label });
      optionEl.value = option.value;
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return field;
  }

  private createEmptyProvider(): ProviderFormState {
    return {
      id: '',
      name: '',
      interfaceFormat: DEFAULT_PROVIDER_INTERFACE_FORMAT,
      customNpm: '',
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

  private resolveInterfaceFormatState(npm: unknown): Pick<ProviderFormState, 'interfaceFormat' | 'customNpm'> {
    if (typeof npm !== 'string') {
      return {
        interfaceFormat: DEFAULT_PROVIDER_INTERFACE_FORMAT,
        customNpm: '',
      };
    }

    const normalizedNpm = npm.trim();
    const knownFormat = PROVIDER_INTERFACE_FORMAT_BY_NPM.get(normalizedNpm);
    if (knownFormat) {
      return {
        interfaceFormat: knownFormat,
        customNpm: '',
      };
    }

    return {
      interfaceFormat: 'custom',
      customNpm: normalizedNpm,
    };
  }

  private getInterfaceFormatOption(id: ProviderInterfaceFormatId): ProviderInterfaceFormatOption {
    return PROVIDER_INTERFACE_FORMAT_OPTIONS.find((option) => option.id === id)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
  }

  private getInterfaceFormatOptions(provider: ProviderFormState): ProviderInterfaceFormatOption[] {
    if (provider.interfaceFormat === 'custom' || provider.customNpm.trim()) {
      return PROVIDER_INTERFACE_FORMAT_OPTIONS;
    }

    return PROVIDER_INTERFACE_FORMAT_OPTIONS.filter((option) => option.id !== 'custom');
  }

  private resolveNpmForInterfaceFormat(provider: ProviderFormState): string {
    const selectedFormat = this.getInterfaceFormatOption(provider.interfaceFormat);
    if (selectedFormat.npm) {
      return selectedFormat.npm;
    }

    const customNpm = provider.customNpm.trim();
    if (customNpm) {
      return customNpm;
    }

    return '@ai-sdk/openai-compatible';
  }

  private createSnapshot(): string {
    return JSON.stringify({
      modelValue: this.modelValue,
      smallModelValue: this.smallModelValue,
      enabledProviders: this.enabledProviders,
      disabledProviders: this.disabledProviders,
      providers: this.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        interfaceFormat: provider.interfaceFormat,
        customNpm: provider.customNpm,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        models: provider.models.map((model) => ({
          id: model.id,
          name: model.name,
          context: model.context,
          output: model.output,
        })),
      })),
    });
  }

  private hasUnsavedChanges(): boolean {
    return this.createSnapshot() !== this.initialSnapshot;
  }

  private focusProviderIdInput(providerIndex: number): void {
    window.requestAnimationFrame(() => {
      const cards = this.providersEl?.querySelectorAll<HTMLElement>('.opencodian-model-provider-card');
      const targetCard = cards?.[providerIndex];
      const input = targetCard?.querySelector<HTMLInputElement>('input');
      input?.focus();
      input?.select();
    });
  }

  private async save(): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    try {
      const modelConfig = this.toModelConfig();
      await this.plugin.modelConfigService.writeLocalModelConfig(modelConfig);
      await this.maybeRestartServer();
      await this.plugin.saveSettings({ syncConfig: false });
      this.initialSnapshot = this.createSnapshot();
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
      if (!PROVIDER_ID_PATTERN.test(providerId)) {
        throw new Error(t('settings.model.visualEditor.errorProviderIdFormat'));
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
      nextProvider.npm = this.resolveNpmForInterfaceFormat(provider);

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
      enabled_providers: this.enabledProviders ? [...this.enabledProviders] : undefined,
      disabled_providers: this.disabledProviders ? [...this.disabledProviders] : undefined,
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
