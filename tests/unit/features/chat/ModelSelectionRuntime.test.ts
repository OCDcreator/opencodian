import * as obsidian from 'obsidian';

import type { ModelCatalogBundle } from '../../../../src/core/config';
import type { ModelCatalogProvider } from '../../../../src/core/config/modelConfig';
import type { ModelSourceMode } from '../../../../src/core/types/settings';
import {
  ModelSelectionRuntime,
  type ModelSelectionRuntimeHost,
} from '../../../../src/features/chat/services/ModelSelectionRuntime';
import type {
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../../../../src/features/chat/ui/modelSelector/types';
import { t } from '../../../../src/i18n';

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

function createRuntimeFixture(options: FixtureOptions = {}) {
  let activeTabModelOverride = options.activeTabModelOverride ?? null;
  let defaultModelSelection: ModelSelectorSelection | null = options.defaultModelSelection ?? {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet',
  };
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

  const host: jest.Mocked<ModelSelectionRuntimeHost> = {
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
  };

  return {
    host,
    runtime: new ModelSelectionRuntime(host),
    availableProviders,
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

describe('ModelSelectionRuntime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves requested models against the effective catalog while preserving base metadata', async () => {
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
    const { host, runtime } = createRuntimeFixture({
      activeTabModelOverride: {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      },
      loadModelCatalogData: {
        catalogBundle: createCatalogBundle(effectiveProviders, baseProviders),
        providers: effectiveProviders,
      },
    });

    await runtime.reloadModelCatalog();

    expect(host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(1);
    expect(runtime.getCurrentSessionModel()).toEqual({
      provider: 'openai',
      model: 'o4-mini',
    });
    expect(runtime.getCurrentSessionModelResolution()).toMatchObject({
      status: 'available',
      provider: 'openai',
      model: 'o4-mini',
      providerName: 'OpenAI',
      modelName: 'o4-mini',
    });
    expect(
      runtime.findKnownModelInfo({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      }),
    ).toMatchObject({
      providerName: 'Anthropic',
      modelName: 'Claude 3.7 Sonnet',
      contextWindow: 200000,
    });
  });

  it('writes selected models through the active-tab override seam only when accepted', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const acceptedFixture = createRuntimeFixture();
    const rejectedFixture = createRuntimeFixture({ allowActiveTabModelOverrideWrite: false });

    await acceptedFixture.runtime.reloadModelCatalog();
    await rejectedFixture.runtime.reloadModelCatalog();
    acceptedFixture.runtime.switchModel('openai', 'o4-mini');
    rejectedFixture.runtime.switchModel('openai', 'o4-mini');

    expect(acceptedFixture.host.setActiveTabModelOverride).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'o4-mini',
    });
    expect(acceptedFixture.host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(2);
    expect(acceptedFixture.runtime.getCurrentSessionModel()).toEqual({
      provider: 'openai',
      model: 'o4-mini',
    });
    expect(rejectedFixture.host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(1);
    expect(rejectedFixture.runtime.getCurrentSessionModel()).toEqual({
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
    });
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(noticeSpy).toHaveBeenCalledWith('Model switched to: o4-mini');
  });

  it('keeps unavailable follow-up copy tied to source mode and selected model state', async () => {
    const fixture = createRuntimeFixture({
      loadModelCatalogData: {
        catalogBundle: null,
        providers: [],
      },
      modelSourceMode: 'server',
    });

    await fixture.runtime.reloadModelCatalog();

    expect(fixture.runtime.getModelUnavailableNoticeContent()).toEqual({
      title: t('chat.notice.modelUnavailable.serverTitle'),
      message: t('chat.notice.modelUnavailable.serverBody'),
    });

    fixture.setDefaultModelSelection(null);
    expect(fixture.runtime.getModelUnavailableNoticeContent()).toEqual({
      title: t('chat.notice.modelUnavailable.unconfiguredTitle'),
      message: t('chat.notice.modelUnavailable.unconfiguredBody'),
    });
  });
});
