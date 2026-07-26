import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { Modal } from 'obsidian';

import type { ModelCatalogBundle } from '../../../../src/core/config';
import { ModelConfigModal } from '../../../../src/features/settings/ModelConfigModal';
import { t } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

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
    app: {
      vault: {
        adapter: {
          basePath: '/vault',
        },
      },
    },
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
      server: {
        mode: 'local',
      },
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

function getModalState(modal: ModelConfigModal) {
  return modal as unknown as {
    providers: Array<{
      uid: string;
      id: string;
      name: string;
      baseURL: string;
      enabled: boolean;
      extraOptions: Array<{ key: string; value: string }>;
      models: Array<{ id: string; enabled: boolean }>;
    }>;
    selectedProviderUid: string | null;
    previewEl: HTMLTextAreaElement | null;
  };
}

function getSelectedProviderState(modal: ModelConfigModal) {
  const state = getModalState(modal);
  return state.providers.find((provider) => provider.uid === state.selectedProviderUid) ?? null;
}

function getButtonByText(containerEl: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(containerEl.querySelectorAll('button'))
    .find((entry) => entry.textContent?.trim() === text);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

beforeEach(() => {
  jest.spyOn(ProviderIconService, 'resolveIconUrl').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ModelConfigModal opening flows', () => {
  it('renders an unavailable message when modelConfigService is missing', async () => {
    const plugin = createPlugin({
      modelConfigService: null,
    });
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();

    expect(modal.contentEl.textContent).toContain(t('settings.model.config.unavailable'));
  });

  it('creates and selects a draft provider in preset-selector mode', async () => {
    const plugin = createPlugin();
    const modal = new ModelConfigModal({} as App, plugin as never, {
      initialView: 'preset-selector',
    });

    await modal.onOpen();

    const providers = (modal as unknown as {
      providers: Array<{ uid: string; extraOptions: Array<{ key: string; value: string }> }>;
      selectedProviderUid: string | null;
    }).providers;

    expect(providers).toHaveLength(1);
    expect((modal.contentEl.querySelector('.opencodian-model-workspace-preset-panel'))).not.toBeNull();
    expect((modal as unknown as { selectedProviderUid: string | null }).selectedProviderUid).toBe(providers[0]?.uid ?? null);
    expect(providers[0]?.extraOptions).toEqual([
      expect.objectContaining({ key: 'setCacheKey', value: 'true' }),
    ]);
  });

  it('honors initialProviderId when opening an existing multi-provider workspace', async () => {
    const plugin = createPlugin({
      modelConfigService: {
        readLocalModelConfig: jest.fn().mockResolvedValue({
          provider: {
            openai: {
              name: 'OpenAI',
              npm: '@ai-sdk/openai',
            },
            anthropic: {
              name: 'Anthropic',
              npm: '@ai-sdk/anthropic',
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never, {
      initialProviderId: 'anthropic',
    });

    await modal.onOpen();

    const state = modal as unknown as {
      providers: Array<{ uid: string; id: string }>;
      selectedProviderUid: string | null;
    };
    const selectedProvider = state.providers.find((provider) => provider.uid === state.selectedProviderUid);

    expect(selectedProvider?.id).toBe('anthropic');
  });

  it('routes add-provider identity edits through the provider editor owner', async () => {
    const plugin = createPlugin();
    const modal = new ModelConfigModal({} as App, plugin as never, {
      initialView: 'preset-selector',
    });

    await modal.onOpen();

    const providerIdInput = modal.contentEl.querySelector(
      '.opencodian-model-workspace-field input[type="text"]',
    ) as HTMLInputElement | null;
    expect(providerIdInput).not.toBeNull();

    providerIdInput!.value = 'My Provider_01!';
    providerIdInput!.dispatchEvent(new window.Event('input'));

    expect(getSelectedProviderState(modal)?.id).toBe('myprovider01');
  });

  it('routes model additions and removals through the model list editor owner', async () => {
    const plugin = createPlugin({
      modelConfigService: {
        readLocalModelConfig: jest.fn().mockResolvedValue({
          provider: {
            openai: {
              name: 'OpenAI',
              npm: '@ai-sdk/openai',
              models: {
                'gpt-4o': {},
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();

    getButtonByText(modal.contentEl, t('settings.model.visualEditor.addModel')).click();
    expect(getSelectedProviderState(modal)?.models).toHaveLength(2);

    getButtonByText(modal.contentEl, t('settings.model.visualEditor.deleteModel')).click();
    expect(getSelectedProviderState(modal)?.models).toHaveLength(1);
  });

  it('renders structured common model option controls in expanded model cards', async () => {
    const plugin = createPlugin({
      modelConfigService: {
        readLocalModelConfig: jest.fn().mockResolvedValue({
          provider: {
            openai: {
              name: 'OpenAI',
              npm: '@ai-sdk/openai',
              options: {
                baseURL: 'https://api.openai.com/v1',
              },
              models: {
                'gpt-4o': {
                  options: {
                    reasoningEffort: 'high',
                    textVerbosity: 'medium',
                    thinking: {
                      type: 'enabled',
                      budgetTokens: 4096,
                    },
                  },
                },
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
      },
    });
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-model-workspace-model-expand')?.click();

    expect(modal.contentEl.textContent).toContain(t('settings.model.visualEditor.structuredOptionsTitle'));
    expect(modal.contentEl.textContent).toContain(t('settings.model.visualEditor.reasoningEffort'));
    expect(modal.contentEl.textContent).toContain(t('settings.model.visualEditor.textVerbosity'));
    expect(modal.contentEl.textContent).toContain(t('settings.model.visualEditor.thinkingBudgetTokens'));
  });

  it('asks for confirmation before closing with unsaved changes', async () => {
    const plugin = createPlugin();
    const modal = new ModelConfigModal({} as App, plugin as never, {
      initialView: 'preset-selector',
    });
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const confirmSpy = jest.spyOn(window, 'confirm');

    await modal.onOpen();

    (modal as unknown as {
      providers: Array<{ name: string }>;
    }).providers[0]!.name = 'Changed provider';

    confirmSpy.mockReturnValueOnce(false);
    modal.close();
    expect(confirmSpy).toHaveBeenCalledWith(t('settings.model.config.unsavedConfirm'));
    expect(closeSpy).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    modal.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ModelConfigModal save plan', () => {
  it('persists workspace saves through the shared save plan', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const plugin = createPlugin({
      modelConfigService: {
        readLocalModelConfig: jest.fn().mockResolvedValue({
          provider: {
            openai: {
              name: 'OpenAI',
              npm: '@ai-sdk/openai',
              options: {
                baseURL: 'https://api.openai.com/v1',
              },
              models: {
                'gpt-4o': {},
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
        writeLocalModelConfig,
      },
    });
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const onSaved = jest.fn().mockResolvedValue(undefined);
    const modal = new ModelConfigModal({} as App, plugin as never, { onSaved });

    await modal.onOpen();

    const state = getModalState(modal);
    state.providers[0]!.models[0]!.enabled = false;

    await (modal as unknown as { save: () => Promise<void> }).save();

    expect(writeLocalModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      provider: expect.objectContaining({
        openai: expect.objectContaining({
          name: 'OpenAI',
        }),
      }),
    }));
    expect(plugin.saveSettings).toHaveBeenCalledWith({
      syncConfig: false,
      reloadModels: true,
      applyUi: true,
    });
    expect(plugin.settings.disabledModelRefs).toEqual(['openai/gpt-4o']);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.model.visualEditor.saveSuccess'));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('[data-model-config-save-pending-restart]')).not.toBeNull();
  });

  it('keeps add-provider persistence visible until application and runtime can be verified', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const plugin = createPlugin({
      modelConfigService: {
        readLocalModelConfig: jest.fn().mockResolvedValue({
          provider: {
            openai: {
              name: 'OpenAI',
              npm: '@ai-sdk/openai',
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
        writeLocalModelConfig,
      },
      settings: {
        modelSourceMode: 'local',
        disabledModelRefs: ['openai/legacy'],
        providerIconLibrary: 'lobehub',
        server: {
          mode: 'local',
        },
      },
    });
    const closeSpy = jest.spyOn(Modal.prototype, 'close');
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const onSaved = jest.fn().mockResolvedValue(undefined);
    const modal = new ModelConfigModal({} as App, plugin as never, {
      initialView: 'preset-selector',
      onSaved,
    });

    await modal.onOpen();

    const state = getModalState(modal);
    const selectedProvider = getSelectedProviderState(modal);
    expect(selectedProvider).not.toBeNull();
    selectedProvider!.id = 'anthropic';
    selectedProvider!.name = 'Anthropic';
    state.previewEl!.value = JSON.stringify({
      npm: '@ai-sdk/anthropic',
      options: {
        baseURL: 'https://api.anthropic.com',
      },
      models: {
        'claude-3-7-sonnet': {},
      },
    }, null, 2);

    await (modal as unknown as { save: () => Promise<void> }).save();

    expect(writeLocalModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      provider: expect.objectContaining({
        openai: expect.any(Object),
        anthropic: expect.objectContaining({
          name: 'Anthropic',
        }),
      }),
    }));
    expect(plugin.openCodeService.stop).not.toHaveBeenCalled();
    expect(plugin.settings.disabledModelRefs).toEqual(['openai/legacy']);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.model.visualEditor.saveSuccess'));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('[data-model-config-save-pending-restart]')).not.toBeNull();
    expect(modal.contentEl.textContent).toContain(t('settings.model.config.savePendingRestart'));
  });

  it('reports validation failures through the shared save error handler', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const plugin = createPlugin({
      modelConfigService: {
        readLocalModelConfig: jest.fn().mockResolvedValue({
          provider: {
            openai: {
              name: 'OpenAI',
              npm: '@ai-sdk/openai',
              options: {
                baseURL: 'https://api.openai.com/v1',
              },
            },
          },
        }),
        getCatalogs: jest.fn().mockResolvedValue(createEmptyCatalogBundle()),
        getConfigPath: jest.fn().mockReturnValue('.opencode/opencode.json'),
        writeLocalModelConfig,
      },
    });
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const modal = new ModelConfigModal({} as App, plugin as never);

    await modal.onOpen();

    const state = getModalState(modal);
    state.providers[0]!.id = '';

    await (modal as unknown as { save: () => Promise<void> }).save();

    expect(writeLocalModelConfig).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(
      `${t('settings.model.visualEditor.saveFailed')}: ${t('settings.model.visualEditor.errorProviderId')}`,
    );
  });
});
