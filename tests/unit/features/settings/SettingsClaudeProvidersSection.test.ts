import { getDefaultClaudeCodeBackendSettings } from '../../../../src/core/types';
import { SettingsClaudeProvidersSection } from '../../../../src/features/settings/SettingsClaudeProvidersSection';
import { setLocale,t } from '../../../../src/i18n';

jest.mock('../../../../src/core/agents/backend', () => ({
  applyClaudeProviderPreset: jest.fn().mockResolvedValue({ lastAppliedManagedEnvKeys: ['GATEWAY_REGION'] }),
  maskClaudeProviderConfigSnapshot: jest.fn((snapshot) => snapshot),
  maskClaudeProviderValue: jest.fn((_key, value) => value),
  migrateClaudeProviderModels: jest.fn().mockResolvedValue({ migrated: false }),
  readClaudeProviderConfigSnapshot: jest.fn().mockResolvedValue({ layers: [], shellEnv: {} }),
  resolveClaudeProviderGlobalEffectiveValue: jest.fn().mockReturnValue(undefined),
  validateClaudeProviderPreset: jest.fn().mockReturnValue({
    baseUrlEndsWithV1: false,
    authTokenHasBearerPrefix: false,
    fallbackMatchesModel: false,
    hasReservedExtraEnv: false,
  }),
}));

const backend = jest.requireMock('../../../../src/core/agents/backend') as Record<string, jest.Mock>;

function createPlugin() {
  return {
    app: { vault: { adapter: { basePath: '/vault' } } },
    settings: {
      backendSettings: {
        claudeCode: getDefaultClaudeCodeBackendSettings(),
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };
}

function createSection(plugin: ReturnType<typeof createPlugin>, onAfterMutation = jest.fn()): SettingsClaudeProvidersSection {
  return new SettingsClaudeProvidersSection({
    plugin: plugin as never,
    createSectionHeading: (hostEl, title) => hostEl.createEl('h3', { text: title }),
    onAfterMutation,
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsClaudeProvidersSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    Object.values(backend).forEach((mock) => mock.mockClear());
    backend.applyClaudeProviderPreset.mockResolvedValue({ lastAppliedManagedEnvKeys: ['GATEWAY_REGION'] });
    backend.migrateClaudeProviderModels.mockResolvedValue({ migrated: false });
    backend.readClaudeProviderConfigSnapshot.mockResolvedValue({ layers: [], shellEnv: {} });
    backend.resolveClaudeProviderGlobalEffectiveValue.mockReturnValue(undefined);
    backend.validateClaudeProviderPreset.mockReturnValue({
      baseUrlEndsWithV1: false,
      authTokenHasBearerPrefix: false,
      fallbackMatchesModel: false,
      hasReservedExtraEnv: false,
    });
  });

  it('blocks all provider file operations until the local source is enabled', () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.model = 'legacy-model';
    const containerEl = document.createElement('div');

    createSection(plugin).render(containerEl);

    expect(containerEl.querySelector('[data-claude-provider-local-gate="true"]')).toBeTruthy();
    expect(backend.migrateClaudeProviderModels).not.toHaveBeenCalled();
    expect(backend.applyClaudeProviderPreset).not.toHaveBeenCalled();
    expect(containerEl.querySelector('[data-claude-provider-preset]')).toBeNull();
  });

  it('enables local without changing source order and only then runs the one-time migration', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.model = 'legacy-model';
    const containerEl = document.createElement('div');
    const section = createSection(plugin);
    section.render(containerEl);

    (containerEl.querySelector('button.mod-cta') as HTMLButtonElement).click();
    await flush();

    expect(plugin.settings.backendSettings.claudeCode.settingSources).toEqual(['project', 'local']);
    expect(backend.migrateClaudeProviderModels).toHaveBeenCalledWith('/vault', 'legacy-model', '');
    expect(plugin.settings.backendSettings.claudeCode.model).toBe('');
    expect(plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('keeps the official preset immutable in the rendered card', () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    const containerEl = document.createElement('div');

    createSection(plugin).render(containerEl);

    const official = containerEl.querySelector('[data-claude-provider-preset="official"]') as HTMLElement;
    expect(official).toBeTruthy();
    expect(official.textContent).not.toContain(t('settings.claudeCode.providers.edit'));
    expect(official.textContent).not.toContain(t('settings.claudeCode.providers.delete'));
    expect((official.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('activates a custom preset, records its owned env keys, and refreshes the active card', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers = {
      modelMigrationDone: true,
      activePresetId: 'official',
      lastAppliedManagedEnvKeys: [],
      presets: [
        ...plugin.settings.backendSettings.claudeCode.providers.presets,
        {
          id: 'gateway',
          name: 'Gateway',
          baseUrl: 'https://gateway.example.com',
          authToken: 'token-123456789',
          model: 'gateway-main',
          fallbackModel: 'gateway-fallback',
          haikuModel: 'gateway-haiku',
          extraEnv: { GATEWAY_REGION: 'cn' },
        },
      ],
    };
    const afterMutation = jest.fn();
    const containerEl = document.createElement('div');
    createSection(plugin, afterMutation).render(containerEl);

    const gateway = containerEl.querySelector('[data-claude-provider-preset="gateway"]') as HTMLElement;
    Array.from(gateway.querySelectorAll('button')).find((button) => button.textContent === t('settings.claudeCode.providers.activate'))!.click();
    await flush();

    expect(backend.applyClaudeProviderPreset).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ id: 'gateway' }),
      [],
    );
    expect(plugin.settings.backendSettings.claudeCode.providers.activePresetId).toBe('gateway');
    expect(plugin.settings.backendSettings.claudeCode.providers.lastAppliedManagedEnvKeys).toEqual(['GATEWAY_REGION']);
    expect(afterMutation).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-provider-preset="gateway"] .opencodian-claude-provider-active-badge')).toBeTruthy();
  });
});
