import type { PermissionMode } from '../../../../src/core/types/settings';
import {
  ChatSelectionControlsCoordinator,
  type ChatSelectionControlsCoordinatorHost,
} from '../../../../src/features/chat/services/ChatSelectionControlsCoordinator';
import type {
  ModelSelectorDisplayResolution,
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../../../../src/features/chat/ui/modelSelector/types';

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function createFixture() {
  let escapeHandler: (() => boolean) | null = null;
  let hasLoadedModelCatalog = false;
  let currentModel: ModelSelectorSelection | null = {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet',
  };
  let currentModelResolution: ModelSelectorDisplayResolution = {
    status: 'available',
    providerName: 'Anthropic',
    modelName: 'Claude 3.7 Sonnet',
  };
  let permissionMode: PermissionMode = 'normal';

  const availableProviders: ModelSelectorProvider[] = [
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' }],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      models: [{ id: 'o4-mini', name: 'o4-mini' }],
    },
  ];

  const knownModels = new Map<string, { providerName: string; modelName: string }>([
    ['anthropic/claude-3-7-sonnet', { providerName: 'Anthropic', modelName: 'Claude 3.7 Sonnet' }],
    ['openai/o4-mini', { providerName: 'OpenAI', modelName: 'o4-mini' }],
  ]);

  const host: jest.Mocked<ChatSelectionControlsCoordinatorHost> = {
    registerEscapeHandler: jest.fn((handler) => {
      escapeHandler = handler;
    }),
    loadModelCatalog: jest.fn(async () => {
      hasLoadedModelCatalog = true;
    }),
    getAvailableProviders: jest.fn(() => availableProviders),
    hasLoadedModelCatalog: jest.fn(() => hasLoadedModelCatalog),
    getCurrentSessionModel: jest.fn(() => currentModel),
    getCurrentSessionModelResolution: jest.fn(() => currentModelResolution),
    findKnownModelInfo: jest.fn((selection) => {
      if (!selection) {
        return null;
      }
      return knownModels.get(`${selection.provider}/${selection.model}`) ?? null;
    }),
    getModelUnavailableTitle: jest.fn(() => 'Configured model unavailable'),
    resolveProviderIconUrl: jest.fn(async (providerId) =>
      providerId === 'anthropic' ? 'app://vault/provider-icons/anthropic.svg' : null,
    ),
    switchModel: jest.fn((provider, model) => {
      currentModel = { provider, model };
      const modelInfo = knownModels.get(`${provider}/${model}`);
      currentModelResolution = {
        status: 'available',
        providerName: modelInfo?.providerName,
        modelName: modelInfo?.modelName,
      };
    }),
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
  };
}

describe('ChatSelectionControlsCoordinator', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('loads model selector state and routes model selection through the host', async () => {
    const fixture = await createFixture();
    const modelTrigger = fixture.toolbarEl.querySelector<HTMLElement>('.opencodian-model-trigger');

    expect(fixture.host.registerEscapeHandler).toHaveBeenCalledTimes(1);
    expect(fixture.host.loadModelCatalog).toHaveBeenCalledTimes(1);
    expect(
      modelTrigger?.querySelector<HTMLElement>('.opencodian-model-trigger-text')?.textContent,
    ).toBe('Claude 3.7 Sonnet');
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

    expect(fixture.host.switchModel).toHaveBeenCalledWith('openai', 'o4-mini');
    expect(
      modelTrigger?.querySelector<HTMLElement>('.opencodian-model-trigger-text')?.textContent,
    ).toBe('o4-mini');
    expect(fixture.host.updateEffortSelectorDisplay).toHaveBeenCalled();
    expect(modelTrigger?.hasClass('is-open')).toBe(false);
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
