import type { App } from 'obsidian';
import * as obsidian from 'obsidian';

import type { ModelCatalogBundle } from '../../../../src/core/config';
import type { OpencodeConfigSourceCandidate } from '../../../../src/core/config/OpencodeConfigSourceService';
import { ModelConfigModal } from '../../../../src/features/settings/ModelConfigModal';
import { t } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

const PROJECT_SOURCE_PATH = '/vault/.opencode/opencode.jsonc';

function createSourceCandidate(
  overrides: Partial<OpencodeConfigSourceCandidate> = {},
): OpencodeConfigSourceCandidate {
  return {
    scope: 'project',
    source: 'project-default',
    path: PROJECT_SOURCE_PATH,
    exists: true,
    editable: true,
    revision: {
      canonicalPath: PROJECT_SOURCE_PATH,
      mtimeMs: 1,
      size: 1,
      sha256: 'revision-1',
    },
    evidence: {
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    },
    ...overrides,
  };
}

function createEmptyCatalogBundle(): ModelCatalogBundle {
  return {
    local: { providers: [], defaults: {} },
    server: { providers: [], defaults: {} },
    baseEffective: { providers: [], defaults: {} },
    effective: { providers: [], defaults: {} },
    currentEnabledProviderIds: [],
    serverConfig: {},
    effectiveProviderConfig: {},
    providerDirectory: {
      catalog: { providers: [], defaults: {} },
      connectedProviderIds: [],
      defaults: {},
    },
  };
}

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
    app: { vault: { adapter: { basePath: '/vault' } } },
    modelConfigService: {
      readLocalModelConfig: jest.fn().mockResolvedValue({}),
      getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
      getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
      writeLocalModelConfig: jest.fn().mockResolvedValue(undefined),
    },
    settings: {
      modelSourceMode: 'local',
      disabledModelRefs: [],
      providerIconLibrary: 'lobehub',
      server: { mode: 'local' },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(false),
      stop: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function createWorkspaceSubset() {
  return {
    provider: {
      openai: {
        name: 'OpenAI',
        npm: '@ai-sdk/openai',
        options: { baseURL: 'https://api.openai.com/v1' },
        models: { 'gpt-4o': {} },
      },
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  jest.spyOn(ProviderIconService, 'resolveIconUrl').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ModelConfigModal G9 fresh conflict retry', () => {
  it('retries a conflicted draft only after a fresh source read and CASes against that exact revision', async () => {
    const source = createSourceCandidate();
    const freshRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'fresh-revision' };
    const freshSource = createSourceCandidate({ revision: freshRevision });
    const applyModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'conflict', expected: source.revision, current: freshRevision },
        evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      })
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'success', revision: { canonicalPath: source.path, mtimeMs: 3, size: 3, sha256: 'saved-revision' } },
        evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      });
    const plugin = createPlugin({
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: ['retained/provider-model'],
        providerIconLibrary: 'lobehub',
        server: { mode: 'local' },
      },
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn()
          .mockResolvedValueOnce({ source, content: '{"model":"before"}', subset: { model: 'before' } })
          .mockResolvedValueOnce({ source: freshSource, content: '{"model":"external"}', subset: { model: 'external' } }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    (modal as unknown as { modelValue: string }).modelValue = 'draft-model';

    await (modal as unknown as { save(): Promise<void> }).save();
    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(1);

    modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-retry]')!.click();
    await flushAsyncWork();

    expect((plugin.modelConfigService.readModelConfigurationSource as jest.Mock)).toHaveBeenCalledTimes(2);
    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(2);
    expect(applyModelConfigurationSource.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ model: 'draft-model' }));
    expect(applyModelConfigurationSource.mock.calls[1]?.[2]).toEqual(freshRevision);
    expect(plugin.settings.disabledModelRefs).toEqual(['retained/provider-model']);
  });
});

describe('ModelConfigModal G9 retry partial persistence', () => {
  it('clears stale conflict recovery after a fresh CAS succeeds but plugin settings persistence rejects', async () => {
    const source = createSourceCandidate();
    const freshRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'fresh-revision' };
    const savedRevision = { canonicalPath: source.path, mtimeMs: 3, size: 3, sha256: 'saved-revision' };
    const freshSource = createSourceCandidate({ revision: freshRevision });
    const applyModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'conflict', expected: source.revision, current: freshRevision },
        evidence: { persistence: 'failed', application: 'not-applicable', runtime: 'not-applicable' },
      })
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'success', revision: savedRevision },
        evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      });
    const plugin = createPlugin({
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: [],
        providerIconLibrary: 'lobehub',
        server: { mode: 'local' },
      },
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn()
          .mockResolvedValueOnce({ source, content: '{"model":"before"}', subset: createWorkspaceSubset() })
          .mockResolvedValueOnce({ source: freshSource, content: '{"model":"external"}', subset: { model: 'external' } }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
      saveSettings: jest.fn().mockRejectedValue(new Error('plugin settings storage unavailable')),
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    const state = modal as unknown as {
      providers: Array<{ models: Array<{ enabled: boolean }> }>;
      selectedSource: OpencodeConfigSourceCandidate;
    };
    state.providers[0]!.models[0]!.enabled = false;

    await (modal as unknown as { save(): Promise<void> }).save();
    expect(modal.contentEl.querySelector('[data-model-config-conflict]')).not.toBeNull();

    modal.contentEl.querySelector<HTMLButtonElement>('[data-model-config-retry]')!.click();
    await flushAsyncWork();

    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(2);
    expect(applyModelConfigurationSource.mock.calls[1]?.[2]).toEqual(freshRevision);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(state.providers[0]!.models[0]!.enabled).toBe(false);
    expect(state.selectedSource.revision).toEqual(savedRevision);
    expect(state.selectedSource.evidence).toEqual({
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    });
    expect(plugin.settings.disabledModelRefs).toEqual([]);
    expect(modal.contentEl.querySelector('[data-model-config-partial-persistence]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-conflict]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-retry]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-reload]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-model-config-inspect]')).toBeNull();
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.model.config.source.pluginSettingsSaveFailed'));
  });
});
