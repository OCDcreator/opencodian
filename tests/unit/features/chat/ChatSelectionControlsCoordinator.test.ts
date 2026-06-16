import type { ModelCatalogBundle } from '../../../../src/core/config';
import type { ModelCatalogProvider } from '../../../../src/core/config/modelConfig';
import type { ClaudeCodePermissionMode, ModelSourceMode, PermissionMode } from '../../../../src/core/types/settings';
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

  describe('sandbox badge gating', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let savedApp: any;

    beforeAll(() => {
      savedApp = (globalThis as any).app;
    });

    afterAll(() => {
      (globalThis as any).app = savedApp;
    });

    function mockOpencodeBackend(): void {
      (globalThis as any).app = {
        plugins: {
          plugins: {
            opencodian: {
              settings: {
                activeBackend: 'opencode',
                backendSettings: {
                  claudeCode: {
                    sandbox: {
                      enabled: true,
                      failIfUnavailable: false,
                      autoAllowBashIfSandboxed: false,
                      excludedCommands: [],
                      allowUnsandboxedCommands: true,
                      filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
                      network: { allowedDomains: [], deniedDomains: [] },
                      enableWeakerNestedSandbox: false,
                      enableWeakerNetworkIsolation: false,
                      ripgrep: { command: '', args: [] },
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    function mockClaudeCodeBackendWithSandbox(): void {
      (globalThis as any).app = {
        plugins: {
          plugins: {
            opencodian: {
              settings: {
                activeBackend: 'claude-code',
                backendSettings: {
                  claudeCode: {
                    sandbox: {
                      enabled: true,
                      failIfUnavailable: false,
                      autoAllowBashIfSandboxed: false,
                      excludedCommands: [],
                      allowUnsandboxedCommands: true,
                      filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
                      network: { allowedDomains: [], deniedDomains: [] },
                      enableWeakerNestedSandbox: false,
                      enableWeakerNetworkIsolation: false,
                      ripgrep: { command: '', args: [] },
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    function mockClaudeCodeBackendWithAdditionalDirectories(additionalDirectories: string[]): void {
      (globalThis as any).app = {
        plugins: {
          plugins: {
            opencodian: {
              settings: {
                activeBackend: 'claude-code',
                backendSettings: {
                  claudeCode: {
                    additionalDirectories,
                    sandbox: {
                      enabled: false,
                      failIfUnavailable: false,
                      autoAllowBashIfSandboxed: false,
                      excludedCommands: [],
                      allowUnsandboxedCommands: true,
                      filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
                      network: { allowedDomains: [], deniedDomains: [] },
                      enableWeakerNestedSandbox: false,
                      enableWeakerNetworkIsolation: false,
                      ripgrep: { command: '', args: [] },
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    function createMinimalHost(): ChatSelectionControlsCoordinatorHost {
      return {
        registerEscapeHandler: jest.fn(),
        loadModelCatalogData: jest.fn(async () => ({
          catalogBundle: null,
          providers: [],
        })),
        getActiveTabModelOverride: jest.fn(() => null),
        setActiveTabModelOverride: jest.fn(() => true),
        getDefaultModelSelection: jest.fn(() => null),
        syncActiveTabContextUsageIdentity: jest.fn(),
        getModelSourceMode: jest.fn(() => 'merge'),
        isModelAvailableOnServer: jest.fn(async () => true),
        resolveProviderIconUrl: jest.fn(async () => null),
        updateEffortSelectorDisplay: jest.fn(),
        getPermissionMode: jest.fn(() => 'normal'),
        switchPermissionMode: jest.fn(async () => {}),
      };
    }

    function mockCodexBackendWithDefaults(defaults: {
      networkAccessEnabled?: boolean;
      webSearchMode?: string;
      additionalDirectories?: string;
    }): void {
      (globalThis as any).app = {
        plugins: {
          plugins: {
            opencodian: {
              settings: {
                activeBackend: 'codex',
                backendSettings: {
                  codex: {
                    networkAccessEnabled: defaults.networkAccessEnabled ?? false,
                    webSearchMode: defaults.webSearchMode ?? 'cached',
                    additionalDirectories: defaults.additionalDirectories ?? '',
                  },
                },
              },
            },
          },
        },
      };
    }

    it('does not mount a visible Codex runtime defaults badge when all Codex defaults are quiet', async () => {
      mockCodexBackendWithDefaults({});

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const container = toolbarEl.querySelector<HTMLElement>('.opencodian-codex-runtime-defaults-badge-container');
      // Quiet defaults should not leave an empty toolbar child behind; the
      // container is recreated later if a non-default setting appears.
      expect(container).toBeNull();
      expect(toolbarEl.querySelector('.opencodian-codex-runtime-defaults-badge')).toBeNull();
    });

    it('mounts Codex runtime defaults badges for non-default network/web/directory settings', async () => {
      mockCodexBackendWithDefaults({
        networkAccessEnabled: true,
        webSearchMode: 'live',
        additionalDirectories: '/tmp/extra\n~/notes',
      });

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const container = toolbarEl.querySelector<HTMLElement>('.opencodian-codex-runtime-defaults-badge-container');
      expect(container).not.toBeNull();
      expect(container?.style.display).not.toBe('none');

      const badges = toolbarEl.querySelectorAll('.opencodian-codex-runtime-defaults-badge');
      expect(badges.length).toBe(3);
      expect(toolbarEl.querySelector('[data-badge-kind="network"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-badge-kind="webSearch"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-badge-kind="additionalDirectories"]')).not.toBeNull();
    });

    it('removes the Codex runtime defaults badge container when backend hot-switches away from Codex', async () => {
      mockCodexBackendWithDefaults({ networkAccessEnabled: true });

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      expect(toolbarEl.querySelector('.opencodian-codex-runtime-defaults-badge-container')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-badge-kind="network"]')).not.toBeNull();

      mockOpencodeBackend();
      coordinator.updatePermissionTriggerDisplay();

      expect(toolbarEl.querySelector('.opencodian-codex-runtime-defaults-badge-container')).toBeNull();
    });

    it('re-mounts the Codex runtime defaults badge container when backend hot-switches back to Codex', async () => {
      mockOpencodeBackend();

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      expect(toolbarEl.querySelector('.opencodian-codex-runtime-defaults-badge-container')).toBeNull();

      mockCodexBackendWithDefaults({ networkAccessEnabled: true });
      coordinator.updatePermissionTriggerDisplay();

      expect(toolbarEl.querySelector('.opencodian-codex-runtime-defaults-badge-container')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-badge-kind="network"]')).not.toBeNull();
    });

    it('mounts sandbox badge container when active backend is claude-code', async () => {
      mockClaudeCodeBackendWithSandbox();

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const badgeContainer = toolbarEl.querySelector('.opencodian-sandbox-badge-container');
      expect(badgeContainer).not.toBeNull();

      // Badge should be rendered since sandbox is enabled
      const badge = badgeContainer!.querySelector('.opencodian-sandbox-config-badge');
      expect(badge).not.toBeNull();
    });

    it('does not mount sandbox badge even with sandbox settings enabled when active backend is opencode', async () => {
      mockOpencodeBackend();

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const badgeContainer = toolbarEl.querySelector('.opencodian-sandbox-badge-container');
      expect(badgeContainer).toBeNull();
    });

    it('removes badge when backend hot-switches from claude-code to opencode via updatePermissionTriggerDisplay', async () => {
      mockClaudeCodeBackendWithSandbox();

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      expect(toolbarEl.querySelector('.opencodian-sandbox-badge-container')).not.toBeNull();
      expect(toolbarEl.querySelector('.opencodian-sandbox-config-badge')).not.toBeNull();

      mockOpencodeBackend();
      coordinator.updatePermissionTriggerDisplay();

      expect(toolbarEl.querySelector('.opencodian-sandbox-badge-container')).toBeNull();
      expect(toolbarEl.querySelector('.opencodian-sandbox-config-badge')).toBeNull();
    });

    it('removes badge when backend hot-switches from claude-code to opencode via applyLocaleTexts', async () => {
      mockClaudeCodeBackendWithSandbox();

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      expect(toolbarEl.querySelector('.opencodian-sandbox-badge-container')).not.toBeNull();

      mockOpencodeBackend();
      coordinator.applyLocaleTexts();

      expect(toolbarEl.querySelector('.opencodian-sandbox-badge-container')).toBeNull();
    });

    it('re-mounts badge when backend hot-switches back from opencode to claude-code', async () => {
      mockOpencodeBackend();

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      expect(toolbarEl.querySelector('.opencodian-sandbox-badge-container')).toBeNull();

      mockClaudeCodeBackendWithSandbox();
      coordinator.updatePermissionTriggerDisplay();

      expect(toolbarEl.querySelector('.opencodian-sandbox-badge-container')).not.toBeNull();
      expect(toolbarEl.querySelector('.opencodian-sandbox-config-badge')).not.toBeNull();
    });

    it('mounts additional directories badge for Claude Code configured scope and keeps readback copy honest', async () => {
      mockClaudeCodeBackendWithAdditionalDirectories([
        '/Volumes/workspace/shared',
        '  ',
        '~/Documents/references',
      ]);

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const badge = toolbarEl.querySelector<HTMLElement>('.opencodian-additional-directories-config-badge');
      expect(badge).not.toBeNull();
      expect(badge?.dataset.additionalDirectoryCount).toBe('2');
      expect(
        badge?.querySelector<HTMLElement>('.opencodian-additional-directories-config-badge-text')?.textContent,
      ).toBe('2 extra dirs');
      expect(badge?.getAttribute('title')).toContain('requested extra directory scope');
      expect(badge?.getAttribute('title')).toContain('/Volumes/workspace/shared');
      expect(badge?.getAttribute('title')).toContain('~/Documents/references');
      expect(badge?.getAttribute('title')).toContain('next query');
      expect(badge?.getAttribute('title')).toContain('not independently verified');
    });

    it('does not mount additional directories badge for OpenCode or empty Claude Code configuration', async () => {
      mockClaudeCodeBackendWithAdditionalDirectories([' ', '\n']);

      const host = createMinimalHost();
      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      expect(toolbarEl.querySelector('.opencodian-additional-directories-badge-container')).toBeNull();

      mockClaudeCodeBackendWithAdditionalDirectories(['/tmp/extra-context']);
      coordinator.updatePermissionTriggerDisplay();
      expect(toolbarEl.querySelector('.opencodian-additional-directories-config-badge')).not.toBeNull();

      mockOpencodeBackend();
      coordinator.updatePermissionTriggerDisplay();
      expect(toolbarEl.querySelector('.opencodian-additional-directories-badge-container')).toBeNull();
      expect(toolbarEl.querySelector('.opencodian-additional-directories-config-badge')).toBeNull();
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  describe('backend-aware permission routing', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let savedApp: any;

    beforeAll(() => {
      savedApp = (globalThis as any).app;
    });

    afterAll(() => {
      (globalThis as any).app = savedApp;
    });

    it('renders OpenCode permission modes when backend is opencode', async () => {
      (globalThis as any).app = {
        plugins: { plugins: { opencodian: { settings: { activeBackend: 'opencode' } } } },
      };

      const host = {
        registerEscapeHandler: jest.fn(),
        loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [] })),
        getActiveTabModelOverride: jest.fn(() => null),
        setActiveTabModelOverride: jest.fn(() => true),
        getDefaultModelSelection: jest.fn(() => null),
        syncActiveTabContextUsageIdentity: jest.fn(),
        getModelSourceMode: jest.fn(() => 'merge'),
        isModelAvailableOnServer: jest.fn(async () => true),
        resolveProviderIconUrl: jest.fn(async () => null),
        updateEffortSelectorDisplay: jest.fn(),
        getPermissionMode: jest.fn(() => 'yolo' as PermissionMode),
        switchPermissionMode: jest.fn(async () => {}),
      } as unknown as ChatSelectionControlsCoordinatorHost;

      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const trigger = toolbarEl.querySelector<HTMLElement>('.opencodian-permission-trigger');
      expect(trigger?.getAttribute('data-permission-backend')).toBe('opencode');
      expect(trigger?.querySelector('.opencodian-permission-trigger-text')?.textContent).toBe('YOLO');

      // OpenCode modes should be available
      trigger?.click();
      expect(toolbarEl.querySelector('[data-mode="yolo"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-mode="normal"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-mode="plan"]')).not.toBeNull();
      // Claude modes should NOT be available
      expect(toolbarEl.querySelector('[data-mode="acceptEdits"]')).toBeNull();
      expect(toolbarEl.querySelector('[data-mode="bypassPermissions"]')).toBeNull();
    });

    it('renders Claude Code permission modes when backend is claude-code', async () => {
      (globalThis as any).app = {
        plugins: {
          plugins: {
            opencodian: {
              settings: {
                activeBackend: 'claude-code',
                backendSettings: {
                  claudeCode: {
                    permissionMode: 'acceptEdits' as ClaudeCodePermissionMode,
                  },
                },
              },
            },
          },
        },
      };

      const host = {
        registerEscapeHandler: jest.fn(),
        loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [] })),
        getActiveTabModelOverride: jest.fn(() => null),
        setActiveTabModelOverride: jest.fn(() => true),
        getDefaultModelSelection: jest.fn(() => null),
        syncActiveTabContextUsageIdentity: jest.fn(),
        getModelSourceMode: jest.fn(() => 'merge'),
        isModelAvailableOnServer: jest.fn(async () => true),
        resolveProviderIconUrl: jest.fn(async () => null),
        updateEffortSelectorDisplay: jest.fn(),
        getPermissionMode: jest.fn(() => 'normal' as PermissionMode),
        switchPermissionMode: jest.fn(async () => {}),
      } as unknown as ChatSelectionControlsCoordinatorHost;

      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const trigger = toolbarEl.querySelector<HTMLElement>('.opencodian-permission-trigger');
      expect(trigger?.getAttribute('data-permission-backend')).toBe('claude-code');
      expect(trigger?.querySelector('.opencodian-permission-trigger-text')?.textContent).toBe('EDIT');

      // Claude Code modes should be available
      trigger?.click();
      expect(toolbarEl.querySelector('[data-mode="default"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-mode="acceptEdits"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-mode="bypassPermissions"]')).not.toBeNull();
      expect(toolbarEl.querySelector('[data-mode="plan"]')).not.toBeNull();
      // OpenCode modes should NOT be available
      expect(toolbarEl.querySelector('[data-mode="yolo"]')).toBeNull();
    });

    it('routes Claude mode selection through the live plugin permission seam', async () => {
      const saveSettings = jest.fn(async () => {});
      const setPermissionMode = jest.fn(async () => {});
      (globalThis as any).app = {
        plugins: {
          plugins: {
            opencodian: {
              settings: {
                activeBackend: 'claude-code',
                backendSettings: {
                  claudeCode: {
                    permissionMode: 'default' as ClaudeCodePermissionMode,
                  },
                },
              },
              saveSettings,
              agentServiceRegistry: {
                get: jest.fn(() => ({ setPermissionMode })),
              },
            },
          },
        },
      };

      const host = {
        registerEscapeHandler: jest.fn(),
        loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [] })),
        getActiveTabModelOverride: jest.fn(() => null),
        setActiveTabModelOverride: jest.fn(() => true),
        getDefaultModelSelection: jest.fn(() => null),
        syncActiveTabContextUsageIdentity: jest.fn(),
        getModelSourceMode: jest.fn(() => 'merge'),
        isModelAvailableOnServer: jest.fn(async () => true),
        resolveProviderIconUrl: jest.fn(async () => null),
        updateEffortSelectorDisplay: jest.fn(),
        getPermissionMode: jest.fn(() => 'normal' as PermissionMode),
        switchPermissionMode: jest.fn(async () => {}),
      } as unknown as ChatSelectionControlsCoordinatorHost;

      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const trigger = toolbarEl.querySelector<HTMLElement>('.opencodian-permission-trigger');
      trigger?.click();

      const planOption = toolbarEl.querySelector<HTMLElement>('[data-mode="plan"]');
      planOption?.click();
      await settleAsyncWork();

      // Claude Code mode changes are owned by the selector's live plugin seam,
      // not by a new OpenCodianView host method.
      expect((globalThis as any).app.plugins.plugins.opencodian.settings.backendSettings.claudeCode.permissionMode).toBe('plan');
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(setPermissionMode).toHaveBeenCalledWith('plan');
      expect(host.switchPermissionMode).not.toHaveBeenCalled();
    });

    it('routes OpenCode mode selection through switchPermissionMode', async () => {
      (globalThis as any).app = {
        plugins: { plugins: { opencodian: { settings: { activeBackend: 'opencode' } } } },
      };

      const host = {
        registerEscapeHandler: jest.fn(),
        loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [] })),
        getActiveTabModelOverride: jest.fn(() => null),
        setActiveTabModelOverride: jest.fn(() => true),
        getDefaultModelSelection: jest.fn(() => null),
        syncActiveTabContextUsageIdentity: jest.fn(),
        getModelSourceMode: jest.fn(() => 'merge'),
        isModelAvailableOnServer: jest.fn(async () => true),
        resolveProviderIconUrl: jest.fn(async () => null),
        updateEffortSelectorDisplay: jest.fn(),
        getPermissionMode: jest.fn(() => 'normal' as PermissionMode),
        switchPermissionMode: jest.fn(async () => {}),
      } as unknown as ChatSelectionControlsCoordinatorHost;

      const toolbarEl = document.createElement('div');
      document.body.appendChild(toolbarEl);

      const coordinator = new ChatSelectionControlsCoordinator(host);
      coordinator.build(toolbarEl);
      await settleAsyncWork();

      const trigger = toolbarEl.querySelector<HTMLElement>('.opencodian-permission-trigger');
      trigger?.click();

      const yoloOption = toolbarEl.querySelector<HTMLElement>('[data-mode="yolo"]');
      yoloOption?.click();
      await settleAsyncWork();

      // Should call the OpenCode-specific switch, not the Claude switch
      expect(host.switchPermissionMode).toHaveBeenCalledWith('yolo');
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

});
