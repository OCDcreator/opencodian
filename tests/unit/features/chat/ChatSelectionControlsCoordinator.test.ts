import type { ModelCatalogBundle } from '../../../../src/core/config';
import type { ModelCatalogProvider } from '../../../../src/core/config/modelConfig';
import type { ModelSourceMode, PermissionMode } from '../../../../src/core/types/settings';
import {
  ChatSelectionControlsCoordinator,
  type ChatSelectionControlsCoordinatorHost,
} from '../../../../src/features/chat/services/ChatSelectionControlsCoordinator';
import type {
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../../../../src/features/chat/ui/modelSelector/types';
import { t } from '../../../../src/i18n';

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createModelCatalogProvider(provider: ModelSelectorProvider): ModelCatalogProvider {
  return {
    id: provider.id,
    name: provider.name,
    source: 'merge',
    existsInLocal: true,
    existsInServer: true,
    models: provider.models.map((model) => ({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      source: 'merge',
      existsInLocal: true,
      existsInServer: true,
    })),
  };
}

function createEmptyProviderDirectory(): ModelCatalogBundle['providerDirectory'] {
  return {
    catalog: { providers: [], defaults: {} },
    connectedProviderIds: [],
    defaults: {},
  };
}

function createCatalogBundle(
  effectiveProviders: ModelSelectorProvider[],
  baseProviders: ModelSelectorProvider[] = effectiveProviders,
): ModelCatalogBundle {
  const effectiveCatalogProviders = effectiveProviders.map(createModelCatalogProvider);
  const baseCatalogProviders = baseProviders.map(createModelCatalogProvider);
  return {
    local: {
      providers: [],
      defaults: {},
    },
    server: {
      providers: baseCatalogProviders,
      defaults: {},
    },
    baseEffective: {
      providers: baseCatalogProviders,
      defaults: {},
    },
    effective: {
      providers: effectiveCatalogProviders,
      defaults: {},
    },
    currentEnabledProviderIds: effectiveProviders.map((provider) => provider.id),
    serverConfig: {},
    effectiveProviderConfig: {},
    providerDirectory: createEmptyProviderDirectory(),
  };
}

interface FixtureOptions {
  activeTabModelOverride?: ModelSelectorSelection | null;
  defaultModelSelection?: ModelSelectorSelection | null;
  loadModelCatalogData?: {
    catalogBundle: ModelCatalogBundle | null;
    providers: readonly ModelSelectorProvider[];
  };
  modelSourceMode?: ModelSourceMode;
  serverModelAvailable?: boolean;
  allowActiveTabModelOverrideWrite?: boolean;
}

async function createFixture(options: FixtureOptions = {}) {
  let escapeHandler: (() => boolean) | null = null;
  let activeTabModelOverride = options.activeTabModelOverride ?? null;
  let defaultModelSelection: ModelSelectorSelection | null = options.defaultModelSelection ?? {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet',
  };
  let permissionMode: PermissionMode = 'normal';
  let modelSourceMode: ModelSourceMode = options.modelSourceMode ?? 'merge';
  let serverModelAvailable = options.serverModelAvailable ?? true;
  const allowActiveTabModelOverrideWrite = options.allowActiveTabModelOverrideWrite ?? true;

  const availableProviders: ModelSelectorProvider[] = [
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000 }],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      models: [{ id: 'o4-mini', name: 'o4-mini', contextWindow: 128000 }],
    },
  ];

  const loadModelCatalogData = options.loadModelCatalogData ?? {
    catalogBundle: createCatalogBundle(availableProviders),
    providers: availableProviders,
  };

  const host: jest.Mocked<ChatSelectionControlsCoordinatorHost> = {
    registerEscapeHandler: jest.fn((handler) => {
      escapeHandler = handler;
    }),
    loadModelCatalogData: jest.fn(async () => loadModelCatalogData),
    getActiveTabModelOverride: jest.fn(() => activeTabModelOverride),
    setActiveTabModelOverride: jest.fn((selection) => {
      if (!allowActiveTabModelOverrideWrite) {
        return false;
      }

      activeTabModelOverride = selection;
      return true;
    }),
    getDefaultModelSelection: jest.fn(() => defaultModelSelection),
    syncActiveTabContextUsageIdentity: jest.fn(),
    getModelSourceMode: jest.fn(() => modelSourceMode),
    isModelAvailableOnServer: jest.fn(async () => serverModelAvailable),
    resolveProviderIconUrl: jest.fn(async (providerId) =>
      providerId === 'anthropic' ? 'app://vault/provider-icons/anthropic.svg' : null,
    ),
    updateEffortSelectorDisplay: jest.fn(),
    getPermissionMode: jest.fn(() => permissionMode),
    switchPermissionMode: jest.fn(async (mode) => {
      permissionMode = mode;
    }),
  };

  const toolbarEl = document.createElement('div');
  document.body.appendChild(toolbarEl);

  const coordinator = new ChatSelectionControlsCoordinator(host);
  coordinator.build(toolbarEl);
  await settleAsyncWork();

  return {
    coordinator,
    host,
    toolbarEl,
    getEscapeHandler: () => escapeHandler,
    setDefaultModelSelection: (selection: ModelSelectorSelection | null) => {
      defaultModelSelection = selection;
    },
    setModelSourceMode: (mode: ModelSourceMode) => {
      modelSourceMode = mode;
    },
    setServerModelAvailable: (available: boolean) => {
      serverModelAvailable = available;
    },
  };
}

describe('ChatSelectionControlsCoordinator', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('loads model selector state and routes model selection through the active-tab override seam', async () => {
    const fixture = await createFixture();
    const modelTrigger = fixture.toolbarEl.querySelector<HTMLElement>('.opencodian-model-trigger');

    expect(fixture.host.registerEscapeHandler).toHaveBeenCalledTimes(1);
    expect(fixture.host.loadModelCatalogData).toHaveBeenCalledTimes(1);
    expect(fixture.host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(1);
    expect(
      modelTrigger?.querySelector<HTMLElement>('.opencodian-model-trigger-text')?.textContent,
    ).toBe('Claude 3.7 Sonnet');
    expect(modelTrigger?.getAttribute('title')).toBe(
      'Current tab send override: Anthropic/Claude 3.7 Sonnet',
    );
    expect(modelTrigger?.querySelector('img')?.getAttribute('src')).toBe(
      'app://vault/provider-icons/anthropic.svg',
    );

    modelTrigger?.click();

    const searchInput = fixture.toolbarEl.querySelector<HTMLInputElement>(
      '.opencodian-model-dropdown-search-input',
    );
    if (!searchInput) {
      throw new Error('expected model search input');
    }

    searchInput.value = 'o4';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    const option = fixture.toolbarEl.querySelector<HTMLElement>('[data-value="openai::o4-mini"]');
    option?.click();
    await settleAsyncWork();

    expect(fixture.host.setActiveTabModelOverride).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'o4-mini',
    });
    expect(
      modelTrigger?.querySelector<HTMLElement>('.opencodian-model-trigger-text')?.textContent,
    ).toBe('o4-mini');
    expect(modelTrigger?.getAttribute('title')).toBe('Current tab send override: OpenAI/o4-mini');
    expect(fixture.host.updateEffortSelectorDisplay).toHaveBeenCalled();
    expect(fixture.host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(2);
    expect(modelTrigger?.hasClass('is-open')).toBe(false);
  });

  it('resolves requested models against the loaded catalog and preserves base-catalog metadata lookups', async () => {
    const effectiveProviders: ModelSelectorProvider[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        models: [{ id: 'o4-mini', name: 'o4-mini', contextWindow: 128000 }],
      },
    ];
    const baseProviders: ModelSelectorProvider[] = [
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000 }],
      },
      ...effectiveProviders,
    ];
    const fixture = await createFixture({
      activeTabModelOverride: {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      },
      loadModelCatalogData: {
        catalogBundle: createCatalogBundle(effectiveProviders, baseProviders),
        providers: effectiveProviders,
      },
    });

    expect(fixture.coordinator.getCurrentSessionModel()).toEqual({
      provider: 'openai',
      model: 'o4-mini',
    });
    expect(fixture.coordinator.getCurrentSessionModelResolution()).toMatchObject({
      status: 'available',
      provider: 'openai',
      model: 'o4-mini',
      providerName: 'OpenAI',
      modelName: 'o4-mini',
    });
    expect(
      fixture.coordinator.findKnownModelInfo({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      }),
    ).toMatchObject({
      providerName: 'Anthropic',
      modelName: 'Claude 3.7 Sonnet',
      contextWindow: 200000,
    });
  });

  it('surfaces selected-model unavailable follow-up content when server validation rejects the resolved model', async () => {
    const fixture = await createFixture({
      serverModelAvailable: false,
    });

    expect(await fixture.coordinator.ensureSelectedModelAvailable('anthropic', 'claude-3-7-sonnet')).toBe(false);
    expect(fixture.host.isModelAvailableOnServer).toHaveBeenCalledWith(
      'anthropic',
      'claude-3-7-sonnet',
    );
    expect(fixture.coordinator.getModelUnavailableNoticeContent()).toEqual({
      title: t('chat.notice.modelUnavailable.selectedTitle'),
      message: t('chat.notice.modelUnavailable.selectedBody'),
    });
  });

  it('updates permission display and closes open dropdowns through the shared escape handler', async () => {
    const fixture = await createFixture();
    const permissionTrigger = fixture.toolbarEl.querySelector<HTMLElement>('.opencodian-permission-trigger');

    expect(
      permissionTrigger?.querySelector<HTMLElement>('.opencodian-permission-trigger-text')?.textContent,
    ).toBe('ASK');

    permissionTrigger?.click();

    const planOption = fixture.toolbarEl.querySelector<HTMLElement>('[data-mode="plan"]');
    planOption?.click();
    await settleAsyncWork();

    expect(fixture.host.switchPermissionMode).toHaveBeenCalledWith('plan');
    expect(
      permissionTrigger?.querySelector<HTMLElement>('.opencodian-permission-trigger-text')?.textContent,
    ).toBe('PLAN');
    expect(permissionTrigger?.hasClass('mode-plan')).toBe(true);

    permissionTrigger?.click();
    expect(fixture.getEscapeHandler()?.()).toBe(true);
    expect(permissionTrigger?.hasClass('is-open')).toBe(false);
  });

});
