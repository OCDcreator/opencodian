import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import { ModelConfigModal } from '../../../../src/features/settings/ModelConfigModal';
import { t } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
    modelConfigService: {
      readLocalModelConfig: jest.fn().mockResolvedValue({}),
      getCatalogs: jest.fn().mockResolvedValue({ serverConfig: {} }),
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

describe('ModelConfigModal', () => {
  beforeEach(() => {
    jest.spyOn(ProviderIconService, 'resolveIconUrl').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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
        getCatalogs: jest.fn().mockResolvedValue({ serverConfig: {} }),
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
