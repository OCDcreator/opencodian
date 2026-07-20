import type { ModelPickerOption } from '../../../../src/features/settings/modelPicker';
import { ModelPickerModal } from '../../../../src/features/settings/ModelPickerModal';
import { SettingsModelCatalogCoordinator } from '../../../../src/features/settings/SettingsModelCatalogCoordinator';

jest.mock('../../../../src/features/settings/ModelPickerModal', () => ({
  ModelPickerModal: jest.fn().mockImplementation((_app, options) => ({
    open: jest.fn(),
    options,
  })),
}));

function createRuntime(writeLocalModelConfig = jest.fn().mockResolvedValue(undefined)) {
  const smallModelButton = {
    buttonEl: document.createElement('button'),
    setButtonText(text: string) {
      this.buttonEl.textContent = text;
      return this;
    },
    setDisabled(disabled: boolean) {
      this.buttonEl.disabled = disabled;
      return this;
    },
  };
  return {
    modelConfigService: {
      readLocalModelConfig: jest.fn().mockResolvedValue({
        provider: {
          openai: {
            name: 'OpenAI',
            models: {
              'gpt-4.1': { name: 'GPT-4.1' },
              'gpt-4.1-mini': { name: 'GPT-4.1 Mini' },
            },
          },
        },
        small_model: 'openai/gpt-4.1-mini',
      }),
      writeLocalModelConfig,
    },
    modelCatalogStateService: {},
    catalogState: null,
    catalogs: null,
    localModelConfig: {
      small_model: 'openai/gpt-4.1-mini',
    },
    modelPickerGroups: [{
      providerId: 'openai',
      providerName: 'OpenAI',
      source: 'local',
      searchText: 'openai',
      options: [
        {
          ref: 'openai/gpt-4.1',
          providerId: 'openai',
          providerName: 'OpenAI',
          modelId: 'gpt-4.1',
          modelName: 'GPT-4.1',
          source: 'local',
          searchText: 'openai gpt-4.1',
        },
        {
          ref: 'openai/gpt-4.1-mini',
          providerId: 'openai',
          providerName: 'OpenAI',
          modelId: 'gpt-4.1-mini',
          modelName: 'GPT-4.1 Mini',
          source: 'local',
          searchText: 'openai gpt-4.1-mini',
        },
      ],
    }],
    commonSummaryEl: document.createElement('div'),
    catalogComparisonEl: document.createElement('div'),
    configBodyEl: document.createElement('div'),
    availabilityManagementEl: document.createElement('div'),
    defaultModelButton: null,
    smallModelButton,
    refreshModelsButton: null,
    isRefreshingModelCatalog: false,
  };
}

function createCoordinator(runtime: ReturnType<typeof createRuntime>) {
  return new SettingsModelCatalogCoordinator({
    app: {} as never,
    plugin: {
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: [],
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      openCodeService: {
        checkHealth: jest.fn(),
        getServerStatus: jest.fn(),
      },
    } as never,
    refreshTitleModels: jest.fn(),
    getServerState: () => ({ healthy: true, status: 'running' }),
    setServerState: jest.fn(),
    getPresenter: () => ({
      getCatalogModelCount: (catalog: { providers: Array<{ models: unknown[] }> }) => (
        catalog.providers.reduce((count, provider) => count + provider.models.length, 0)
      ),
    }) as never,
    getRuntime: () => runtime as never,
    isRuntimeActive: () => true,
    refreshIconCacheOverview: jest.fn().mockResolvedValue(undefined),
    applyProviderIcon: jest.fn().mockResolvedValue(undefined),
  });
}

describe('SettingsModelCatalogCoordinator small_model picker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('shows the selected OpenCode small_model on the Common tab button', () => {
    const runtime = createRuntime();
    const coordinator = createCoordinator(runtime);

    coordinator.updateSmallModelButton();

    expect(runtime.smallModelButton.buttonEl.textContent).toBe('OpenAI / GPT-4.1 Mini');
  });

  it('renders a neutral V2 drift summary without exposing detailed IDs', () => {
    const runtime = createRuntime();
    runtime.catalogs = {
      effective: { providers: [], defaults: {} },
    } as never;
    runtime.catalogState = {
      catalogComparison: {
        status: 'drift',
        legacyProviderCount: 1,
        legacyModelCount: 2,
        v2ProviderCount: 2,
        v2ModelCount: 3,
        legacyOnlyProviderIds: ['private-provider'],
        v2OnlyProviderIds: ['new-provider'],
        legacyOnlyModelRefs: [],
        v2OnlyModelRefs: ['new-provider/new-model'],
      },
    } as never;
    const coordinator = createCoordinator(runtime);

    coordinator.updateCommonSummary();

    expect(runtime.catalogComparisonEl.textContent).toBe(
      'V2 catalog differs · stable-only 1 provider / 0 models · V2-only 1 provider / 1 models',
    );
    expect(runtime.catalogComparisonEl.classList.contains('is-drift')).toBe(true);
    expect(runtime.catalogComparisonEl.textContent).not.toContain('private-provider');
  });

  it('writes selected small_model to local OpenCode config', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const runtime = createRuntime(writeLocalModelConfig);
    const coordinator = createCoordinator(runtime);

    coordinator.openSmallModelPicker();
    const modalOptions = (ModelPickerModal as unknown as jest.Mock).mock.calls[0][1];
    await modalOptions.onChoose({
      ref: 'openai/gpt-4.1',
    } as ModelPickerOption);

    expect(writeLocalModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      small_model: 'openai/gpt-4.1',
    }));
  });

  it('clears small_model when the empty picker option is selected', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const runtime = createRuntime(writeLocalModelConfig);
    const coordinator = createCoordinator(runtime);

    coordinator.openSmallModelPicker();
    const modalOptions = (ModelPickerModal as unknown as jest.Mock).mock.calls[0][1];
    await modalOptions.onChoose(null);

    expect(writeLocalModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      small_model: undefined,
    }));
  });
});
