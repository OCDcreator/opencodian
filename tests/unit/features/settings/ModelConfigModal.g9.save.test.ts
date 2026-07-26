import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { Modal } from 'obsidian';

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

beforeEach(() => {
  jest.spyOn(ProviderIconService, 'resolveIconUrl').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ModelConfigModal G9 selected-source save revisions', () => {
  it('uses the mutation revision for the next save instead of reusing a stale revision', async () => {
    const source = createSourceCandidate();
    const nextRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'revision-2' };
    const applyModelConfigurationSource = jest.fn()
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'success', revision: nextRevision },
        evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      })
      .mockResolvedValueOnce({
        targetPath: source.path,
        result: { status: 'success', revision: { canonicalPath: source.path, mtimeMs: 3, size: 3, sha256: 'revision-3' } },
        evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      });
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({ source, content: '{}', subset: {} }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();

    await (modal as unknown as { save(): Promise<void> }).save();
    await (modal as unknown as { save(): Promise<void> }).save();

    expect(applyModelConfigurationSource.mock.calls[1]?.[2]).toEqual(nextRevision);
  });

  it('keeps persistence visible as pending restart without explicit opt-in', async () => {
    const source = createSourceCandidate();
    const nextRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'revision-2' };
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({ source, content: '{}', subset: {} }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource: jest.fn().mockResolvedValue({
          targetPath: source.path,
          result: { status: 'success', revision: nextRevision },
          evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
        }),
      },
    });
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();

    await (modal as unknown as { save(): Promise<void> }).save();

    expect(plugin.openCodeService.stop).not.toHaveBeenCalled();
    expect(plugin.openCodeService.start).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('restart'));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('[data-model-config-save-pending-restart]')).not.toBeNull();
    expect(modal.contentEl.textContent).toContain(t('settings.model.config.savePendingRestart'));
    expect(modal.contentEl.textContent).toContain(t('settings.model.config.source.evidence', {
      persistence: t('settings.model.config.source.evidence.verified'),
      application: t('settings.model.config.source.evidence.pending'),
      runtime: t('settings.model.config.source.evidence.unavailable'),
    }));
    expect((modal as unknown as { selectedSource: OpencodeConfigSourceCandidate }).selectedSource.revision).toEqual(nextRevision);

    modal.close();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ModelConfigModal G9 partial persistence', () => {
  it('retains source evidence but rolls back plugin-only state when plugin settings persistence fails', async () => {
    const source = createSourceCandidate({
      evidence: {
        persistence: 'failed',
        application: 'not-applicable',
        runtime: 'not-applicable',
      },
    });
    const nextRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'revision-2' };
    const partialFailureMessage = 'Configuration source was saved, but plugin settings could not be saved. Application and runtime evidence remain pending.';
    const onSaved = jest.fn().mockResolvedValue(undefined);
    const plugin = createPlugin({
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: [],
        providerIconLibrary: 'lobehub',
        server: { mode: 'local' },
      },
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source,
          content: '{}',
          subset: {
            provider: {
              openai: {
                name: 'OpenAI',
                npm: '@ai-sdk/openai',
                options: { baseURL: 'https://api.openai.com/v1' },
                models: { 'gpt-4o': {} },
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource: jest.fn().mockResolvedValue({
          targetPath: source.path,
          result: { status: 'success', revision: nextRevision },
          evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
        }),
      },
      saveSettings: jest.fn().mockRejectedValue(new Error('plugin settings storage unavailable')),
      openCodeService: {
        checkHealth: jest.fn().mockResolvedValue(true),
        stop: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
      },
    });
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback();
      return 0 as never;
    }) as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const modal = new ModelConfigModal({} as App, plugin as never, { onSaved });
    await modal.onOpen();
    const state = modal as unknown as {
      providers: Array<{ models: Array<{ enabled: boolean }> }>;
      selectedSource: OpencodeConfigSourceCandidate;
    };
    state.providers[0]!.models[0]!.enabled = false;
    const restartToggle = modal.contentEl.querySelector<HTMLInputElement>('.opencodian-model-workspace-restart-toggle input');
    restartToggle!.checked = true;

    await (modal as unknown as { save(): Promise<void> }).save();

    expect(plugin.settings.disabledModelRefs).toEqual([]);
    expect(state.selectedSource.revision).toEqual(nextRevision);
    expect(state.selectedSource.evidence).toEqual({
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    });
    expect(plugin.openCodeService.stop).not.toHaveBeenCalled();
    expect(plugin.openCodeService.start).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(partialFailureMessage);
    expect(noticeSpy).not.toHaveBeenCalledWith(t('settings.model.visualEditor.saveSuccess'));
    expect(modal.contentEl.querySelector('[data-model-config-partial-persistence]')).not.toBeNull();
    expect(modal.contentEl.textContent).toContain(partialFailureMessage);
  });
});

describe('ModelConfigModal G9 restart recovery', () => {
  it('keeps verified persistence visible without treating a rejected stop as a generic save failure', async () => {
    const source = createSourceCandidate();
    const nextRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'revision-after-stop-rejection' };
    const restartFailureMessage = 'Configuration was saved and persistence is verified, but OpenCodian could not confirm stopping the local service. The restart was not completed; application and runtime evidence remain pending. The service state is unknown. Check it and recover it manually.';
    const onSaved = jest.fn().mockResolvedValue(undefined);
    const applyModelConfigurationSource = jest.fn().mockResolvedValue({
      targetPath: source.path,
      result: { status: 'success', revision: nextRevision },
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
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source,
          content: '{}',
          subset: {
            provider: {
              openai: {
                name: 'OpenAI',
                npm: '@ai-sdk/openai',
                options: { baseURL: 'https://api.openai.com/v1' },
                models: { 'gpt-4o': {} },
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
      openCodeService: {
        checkHealth: jest.fn().mockResolvedValue(true),
        stop: jest.fn().mockRejectedValue(new Error('stop rejected')),
        start: jest.fn().mockResolvedValue(undefined),
      },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const modal = new ModelConfigModal({} as App, plugin as never, { onSaved });
    await modal.onOpen();
    const state = modal as unknown as {
      providers: Array<{ models: Array<{ enabled: boolean }> }>;
      selectedSource: OpencodeConfigSourceCandidate;
    };
    state.providers[0]!.models[0]!.enabled = false;
    modal.contentEl.querySelector<HTMLInputElement>('.opencodian-model-workspace-restart-toggle input')!.checked = true;

    await (modal as unknown as { save(): Promise<void> }).save();

    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.settings.disabledModelRefs).toEqual(['openai/gpt-4o']);
    expect(state.selectedSource.revision).toEqual(nextRevision);
    expect(state.selectedSource.evidence).toEqual({
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    });
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(restartFailureMessage);
    expect(noticeSpy).not.toHaveBeenCalledWith(expect.stringContaining(`${t('settings.model.visualEditor.saveFailed')}:`));
    expect(noticeSpy).not.toHaveBeenCalledWith(t('settings.model.visualEditor.saveSuccess'));
    expect(noticeSpy).not.toHaveBeenCalledWith(t('settings.model.config.restartSuccess'));
    expect(modal.contentEl.querySelector('[data-model-config-restart-failure="stop"]')).not.toBeNull();
    expect(modal.contentEl.textContent).toContain(restartFailureMessage);
  });

  it('keeps verified persistence visible when restart start rejects after a completed stop', async () => {
    const source = createSourceCandidate();
    const nextRevision = { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'revision-after-start-rejection' };
    const restartFailureMessage = 'Configuration was saved and persistence is verified, but the local service could not be restarted after it stopped. Application and runtime evidence remain pending. The service may be stopped; recover it manually.';
    const onSaved = jest.fn().mockResolvedValue(undefined);
    const applyModelConfigurationSource = jest.fn().mockResolvedValue({
      targetPath: source.path,
      result: { status: 'success', revision: nextRevision },
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
        readModelConfigurationSource: jest.fn().mockResolvedValue({
          source,
          content: '{}',
          subset: {
            provider: {
              openai: {
                name: 'OpenAI',
                npm: '@ai-sdk/openai',
                options: { baseURL: 'https://api.openai.com/v1' },
                models: { 'gpt-4o': {} },
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource,
      },
      openCodeService: {
        checkHealth: jest.fn().mockResolvedValue(true),
        stop: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockRejectedValue(new Error('start rejected')),
      },
    });
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback();
      return 0 as never;
    }) as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const modal = new ModelConfigModal({} as App, plugin as never, { onSaved });
    await modal.onOpen();
    const state = modal as unknown as {
      providers: Array<{ models: Array<{ enabled: boolean }> }>;
      selectedSource: OpencodeConfigSourceCandidate;
    };
    state.providers[0]!.models[0]!.enabled = false;
    modal.contentEl.querySelector<HTMLInputElement>('.opencodian-model-workspace-restart-toggle input')!.checked = true;

    await (modal as unknown as { save(): Promise<void> }).save();

    expect(applyModelConfigurationSource).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.settings.disabledModelRefs).toEqual(['openai/gpt-4o']);
    expect(state.selectedSource.revision).toEqual(nextRevision);
    expect(state.selectedSource.evidence).toEqual({
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    });
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(restartFailureMessage);
    expect(noticeSpy).not.toHaveBeenCalledWith(expect.stringContaining(`${t('settings.model.visualEditor.saveFailed')}:`));
    expect(noticeSpy).not.toHaveBeenCalledWith(t('settings.model.visualEditor.saveSuccess'));
    expect(noticeSpy).not.toHaveBeenCalledWith(t('settings.model.config.restartSuccess'));
    expect(modal.contentEl.querySelector('[data-model-config-restart-failure="start"]')).not.toBeNull();
    expect(modal.contentEl.textContent).toContain(restartFailureMessage);
  });
});

describe('ModelConfigModal G9 explicit restart', () => {
  it('restarts and closes only after the user explicitly opts in', async () => {
    const source = createSourceCandidate();
    const plugin = createPlugin({
      modelConfigService: {
        inventoryConfigurationSources: jest.fn().mockResolvedValue([source]),
        readModelConfigurationSource: jest.fn().mockResolvedValue({ source, content: '{}', subset: {} }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue(source.path),
        applyModelConfigurationSource: jest.fn().mockResolvedValue({
          targetPath: source.path,
          result: { status: 'success', revision: { canonicalPath: source.path, mtimeMs: 2, size: 2, sha256: 'revision-2' } },
          evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
        }),
      },
      openCodeService: {
        checkHealth: jest.fn().mockResolvedValue(true),
        stop: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
      },
    });
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback();
      return 0 as never;
    }) as never);
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const modal = new ModelConfigModal({} as App, plugin as never);
    await modal.onOpen();
    const restartToggle = modal.contentEl.querySelector<HTMLInputElement>('.opencodian-model-workspace-restart-toggle input');
    expect(restartToggle?.checked).toBe(false);
    restartToggle!.checked = true;

    await (modal as unknown as { save(): Promise<void> }).save();

    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
