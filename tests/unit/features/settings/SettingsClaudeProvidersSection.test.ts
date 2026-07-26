import { getDefaultClaudeCodeBackendSettings } from '../../../../src/core/types';
import { SettingsClaudeProvidersSection } from '../../../../src/features/settings/SettingsClaudeProvidersSection';
import { setLocale,t } from '../../../../src/i18n';

jest.mock('../../../../src/core/agents/backend', () => ({
  applyClaudeProviderPreset: jest.fn().mockResolvedValue({
    lastAppliedManagedEnvKeys: ['GATEWAY_REGION'],
    revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 1, size: 1, sha256: 'next' },
    evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
  }),
  maskClaudeProviderConfigSnapshot: jest.fn((snapshot) => snapshot),
  maskClaudeProviderValue: jest.fn((_key, value) => value),
  migrateClaudeProviderModels: jest.fn().mockResolvedValue({ migrated: false }),
  readClaudeProviderConfigSnapshot: jest.fn().mockResolvedValue({
    layers: [{
      id: 'local', filePath: '/vault/.claude/settings.local.json', exists: true, content: {},
      revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 1, size: 1, sha256: 'captured' },
    }],
    shellEnv: {},
  }),
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function localSnapshot(revision: string, parseError?: string) {
  return {
    layers: [{
      id: 'local' as const,
      filePath: '/vault/.claude/settings.local.json',
      exists: !parseError,
      content: {},
      revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: revision === 'captured' ? 1 : 2, size: 1, sha256: revision },
      ...(parseError ? { parseError } : {}),
    }],
    shellEnv: {},
  };
}

function resetBackendMocks(): void {
  setLocale('en');
  document.body.innerHTML = '';
  Object.values(backend).forEach((mock) => mock.mockClear());
  backend.applyClaudeProviderPreset.mockResolvedValue({
    lastAppliedManagedEnvKeys: ['GATEWAY_REGION'],
    revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 2, size: 2, sha256: 'next' },
    evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
  });
  backend.migrateClaudeProviderModels.mockResolvedValue({ migrated: false });
  backend.readClaudeProviderConfigSnapshot.mockResolvedValue({
    layers: [{
      id: 'local', filePath: '/vault/.claude/settings.local.json', exists: true, content: {},
      revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 1, size: 1, sha256: 'captured' },
    }],
    shellEnv: {},
  });
  backend.resolveClaudeProviderGlobalEffectiveValue.mockReturnValue(undefined);
  backend.validateClaudeProviderPreset.mockReturnValue({
    baseUrlEndsWithV1: false,
    authTokenHasBearerPrefix: false,
    fallbackMatchesModel: false,
    hasReservedExtraEnv: false,
  });
}

describe('SettingsClaudeProvidersSection gates and preset activation', () => {
  beforeEach(resetBackendMocks);

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

  it('does not migrate or write during render; legacy migration remains an explicit user action', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.model = 'legacy-model';
    const containerEl = document.createElement('div');
    const section = createSection(plugin);
    section.render(containerEl);

    (containerEl.querySelector('button.mod-cta') as HTMLButtonElement).click();
    await flush();

    expect(plugin.settings.backendSettings.claudeCode.settingSources).toEqual(['project', 'local']);
    expect(backend.migrateClaudeProviderModels).not.toHaveBeenCalled();
    expect(plugin.settings.backendSettings.claudeCode.model).toBe('legacy-model');
    expect(plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone).toBe(false);
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
    await flush();

    const gateway = containerEl.querySelector('[data-claude-provider-preset="gateway"]') as HTMLElement;
    Array.from(gateway.querySelectorAll('button')).find((button) => button.textContent === t('settings.claudeCode.providers.activate'))!.click();
    await flush();

    expect(backend.applyClaudeProviderPreset).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ id: 'gateway' }),
      [],
      { expectedRevision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 1, size: 1, sha256: 'captured' } },
    );
    expect(plugin.settings.backendSettings.claudeCode.providers.activePresetId).toBe('gateway');
    expect(plugin.settings.backendSettings.claudeCode.providers.lastAppliedManagedEnvKeys).toEqual(['GATEWAY_REGION']);
    expect(afterMutation).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-provider-preset="gateway"] .opencodian-claude-provider-active-badge')).toBeTruthy();
  });

  it('keeps a verified source write visible when plugin settings persistence fails, then retries metadata only', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    plugin.settings.backendSettings.claudeCode.providers.presets.push({
      id: 'gateway',
      name: 'Gateway',
      baseUrl: 'https://gateway.example.com',
      authToken: 'token-123456789',
      model: 'gateway-main',
      fallbackModel: 'gateway-fallback',
      haikuModel: 'gateway-haiku',
      extraEnv: { GATEWAY_REGION: 'cn' },
    });
    plugin.saveSettings
      .mockRejectedValueOnce(new Error('plugin settings unavailable'))
      .mockRejectedValueOnce(new Error('plugin settings still unavailable'))
      .mockResolvedValueOnce(undefined);
    const afterMutation = jest.fn();
    const containerEl = document.createElement('div');
    createSection(plugin, afterMutation).render(containerEl);
    await flush();

    const gateway = containerEl.querySelector('[data-claude-provider-preset="gateway"]') as HTMLElement;
    Array.from(gateway.querySelectorAll('button')).find((button) => button.textContent === t('settings.claudeCode.providers.activate'))!.click();
    await flush();

    const partial = containerEl.querySelector('[data-claude-provider-partial-persistence="true"]') as HTMLElement;
    expect(partial).toBeTruthy();
    expect(partial.getAttribute('role')).toBe('alert');
    expect(partial.textContent).toContain('/vault/.claude/settings.local.json');
    expect(partial.textContent).toContain('next');
    expect(partial.textContent).toContain(t('settings.claudeCode.providers.partialPersistence.presetDesc', {
      path: '/vault/.claude/settings.local.json',
      revision: 'next',
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    }));
    expect(partial.textContent).not.toContain('token-123456789');
    expect(plugin.settings.backendSettings.claudeCode.providers.activePresetId).toBe('gateway');
    expect(plugin.settings.backendSettings.claudeCode.providers.lastAppliedManagedEnvKeys).toEqual(['GATEWAY_REGION']);
    expect(afterMutation).not.toHaveBeenCalled();

    const retry = partial.querySelector('button') as HTMLButtonElement;
    retry.click();
    retry.click();
    await flush();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(containerEl.querySelector('[data-claude-provider-partial-persistence="true"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-claude-provider-partial-retry-failed="true"]')).toBeTruthy();
    retry.click();
    await flush();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(3);
    expect(backend.applyClaudeProviderPreset).toHaveBeenCalledTimes(1);
    expect(afterMutation).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-provider-partial-persistence="true"]')).toBeNull();
    expect(containerEl.querySelector('[data-claude-provider-preset="gateway"] .opencodian-claude-provider-active-badge')).toBeTruthy();
  });

  it('completes an activation metadata retry on the latest render after an in-flight rerender', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    plugin.settings.backendSettings.claudeCode.providers.presets.push({
      id: 'gateway', name: 'Gateway', baseUrl: 'https://gateway.example.com', authToken: 'token-123456789',
      model: 'gateway-main', fallbackModel: '', haikuModel: '', extraEnv: { GATEWAY_REGION: 'cn' },
    });
    const retrySave = deferred<void>();
    plugin.saveSettings.mockRejectedValueOnce(new Error('plugin settings unavailable')).mockReturnValueOnce(retrySave.promise);
    const afterMutation = jest.fn();
    const containerEl = document.createElement('div');
    const section = createSection(plugin, afterMutation);
    section.render(containerEl);
    await flush();

    const gateway = containerEl.querySelector('[data-claude-provider-preset="gateway"]') as HTMLElement;
    gateway.querySelector<HTMLButtonElement>('button')!.click();
    await flush();
    containerEl.empty();
    section.render(containerEl);
    const currentPartial = containerEl.querySelector('[data-claude-provider-partial-persistence="true"]') as HTMLElement;
    currentPartial.querySelector<HTMLButtonElement>('button')!.click();
    containerEl.empty();
    section.render(containerEl);
    retrySave.resolve(undefined);
    await flush();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(backend.applyClaudeProviderPreset).toHaveBeenCalledTimes(1);
    expect(afterMutation).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-provider-partial-persistence="true"]')).toBeNull();
    expect(containerEl.querySelector('[data-claude-provider-preset="gateway"] .opencodian-claude-provider-active-badge')).toBeTruthy();
    expect(containerEl.textContent).not.toContain('token-123456789');
  });

  it('blocks a stale revision conflict, retains the selected preset, and offers read-only reload and compare actions', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    const gateway = {
      id: 'gateway', name: 'Gateway', baseUrl: 'https://gateway.example.com', authToken: 'token-123456789',
      model: 'gateway-main', fallbackModel: 'gateway-fallback', haikuModel: '', extraEnv: {},
    };
    plugin.settings.backendSettings.claudeCode.providers.presets.push(gateway);
    backend.applyClaudeProviderPreset.mockRejectedValueOnce({
      name: 'ClaudeProviderConfigMutationError',
      result: { status: 'conflict', expected: null, current: null },
    });
    const containerEl = document.createElement('div');
    createSection(plugin).render(containerEl);
    await flush();

    const card = containerEl.querySelector('[data-claude-provider-preset="gateway"]') as HTMLElement;
    Array.from(card.querySelectorAll('button')).find((button) => button.textContent === t('settings.claudeCode.providers.activate'))!.click();
    await flush();

    expect(plugin.settings.backendSettings.claudeCode.providers.activePresetId).toBe('official');
    expect(containerEl.querySelector('[data-claude-provider-conflict="true"]')).toBeTruthy();
    expect(containerEl.textContent).toContain(t('settings.claudeCode.providers.conflict.reload'));
    expect(containerEl.textContent).toContain(t('settings.claudeCode.providers.conflict.inspect'));
    expect(containerEl.textContent).not.toContain('token-123456789');

    Array.from(containerEl.querySelectorAll('button')).find((button) => button.textContent === t('settings.claudeCode.providers.conflict.reload'))!.click();
    await flush();
    expect(containerEl.querySelector('[data-claude-provider-conflict="true"]')).toBeNull();
  });
});

describe('SettingsClaudeProvidersSection migration and snapshot status', () => {
  beforeEach(resetBackendMocks);

  it('passes the captured revision to legacy migration, preserves settings on conflict, and retries with a fresh revision', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.model = 'legacy-model';
    plugin.settings.backendSettings.claudeCode.fallbackModel = 'legacy-fallback';
    backend.readClaudeProviderConfigSnapshot.mockResolvedValue(localSnapshot('captured'));
    backend.migrateClaudeProviderModels
      .mockRejectedValueOnce({ result: { status: 'conflict' } })
      .mockResolvedValueOnce({
        migrated: true,
        revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 3, size: 2, sha256: 'migrated' },
      });
    const containerEl = document.createElement('div');
    createSection(plugin).render(containerEl);
    await flush();

    (Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === t('settings.claudeCode.providers.migrationAction.button')) as HTMLButtonElement)
      .click();
    await flush();

    expect(backend.migrateClaudeProviderModels).toHaveBeenNthCalledWith(
      1,
      '/vault',
      'legacy-model',
      'legacy-fallback',
      { expectedRevision: expect.objectContaining({ sha256: 'captured' }) },
    );
    expect(plugin.settings.backendSettings.claudeCode.model).toBe('legacy-model');
    expect(plugin.settings.backendSettings.claudeCode.fallbackModel).toBe('legacy-fallback');
    expect(plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone).toBe(false);
    expect(containerEl.querySelector('[data-claude-provider-conflict="true"]')).toBeTruthy();

    backend.readClaudeProviderConfigSnapshot.mockResolvedValue(localSnapshot('fresh'));
    (Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === t('settings.claudeCode.providers.conflict.retry')) as HTMLButtonElement)
      .click();
    await flush();

    expect(backend.migrateClaudeProviderModels).toHaveBeenNthCalledWith(
      2,
      '/vault',
      'legacy-model',
      'legacy-fallback',
      { expectedRevision: expect.objectContaining({ sha256: 'fresh' }) },
    );
    expect(plugin.settings.backendSettings.claudeCode.model).toBe('');
    expect(plugin.settings.backendSettings.claudeCode.fallbackModel).toBe('');
    expect(plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone).toBe(true);
    expect(containerEl.querySelector('[data-claude-provider-conflict="true"]')).toBeNull();
  });

  it('keeps a verified migration source write visible when plugin settings persistence fails, then retries metadata only', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.model = 'legacy-model';
    plugin.settings.backendSettings.claudeCode.fallbackModel = 'legacy-fallback';
    backend.migrateClaudeProviderModels.mockResolvedValueOnce({
      migrated: true,
      revision: { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 3, size: 2, sha256: 'migrated' },
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
    });
    plugin.saveSettings
      .mockRejectedValueOnce(new Error('plugin settings unavailable'))
      .mockResolvedValueOnce(undefined);
    const afterMutation = jest.fn();
    const containerEl = document.createElement('div');
    createSection(plugin, afterMutation).render(containerEl);
    await flush();

    (Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === t('settings.claudeCode.providers.migrationAction.button')) as HTMLButtonElement)
      .click();
    await flush();

    const partial = containerEl.querySelector('[data-claude-provider-partial-persistence="true"]') as HTMLElement;
    expect(partial).toBeTruthy();
    expect(partial.textContent).toContain('/vault/.claude/settings.local.json');
    expect(partial.textContent).toContain('migrated');
    expect(partial.textContent).toContain(t('settings.claudeCode.providers.partialPersistence.migrationDesc', {
      path: '/vault/.claude/settings.local.json',
      revision: 'migrated',
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    }));
    expect(plugin.settings.backendSettings.claudeCode.model).toBe('');
    expect(plugin.settings.backendSettings.claudeCode.fallbackModel).toBe('');
    expect(plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone).toBe(true);
    expect(afterMutation).not.toHaveBeenCalled();

    const retry = partial.querySelector('button') as HTMLButtonElement;
    retry.click();
    retry.click();
    await flush();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(backend.migrateClaudeProviderModels).toHaveBeenCalledTimes(1);
    expect(afterMutation).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-provider-partial-persistence="true"]')).toBeNull();
  });

  it('keeps migration partial state retryable when an in-flight retry fails after rerender', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.model = 'legacy-model';
    const retrySave = deferred<void>();
    plugin.saveSettings.mockRejectedValueOnce(new Error('plugin settings unavailable')).mockReturnValueOnce(retrySave.promise);
    const afterMutation = jest.fn();
    const containerEl = document.createElement('div');
    const section = createSection(plugin, afterMutation);
    section.render(containerEl);
    await flush();

    containerEl.querySelector<HTMLButtonElement>(`button`)!.click();
    await flush();
    const partial = containerEl.querySelector('[data-claude-provider-partial-persistence="true"]') as HTMLElement;
    partial.querySelector<HTMLButtonElement>('button')!.click();
    containerEl.empty();
    section.render(containerEl);
    retrySave.reject(new Error('plugin settings still unavailable'));
    await flush();

    const currentPartial = containerEl.querySelector('[data-claude-provider-partial-persistence="true"]') as HTMLElement;
    expect(currentPartial).toBeTruthy();
    expect(currentPartial.querySelector('[data-claude-provider-partial-retry-failed="true"]')).toBeTruthy();
    expect(currentPartial.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(backend.migrateClaudeProviderModels).toHaveBeenCalledTimes(1);
    expect(afterMutation).not.toHaveBeenCalled();
    expect(containerEl.textContent).not.toContain('legacy-model');
  });

  it('uses one generation-fenced snapshot for local status and the active summary', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    const containerEl = document.createElement('div');
    createSection(plugin).render(containerEl);
    await flush();

    expect(backend.readClaudeProviderConfigSnapshot).toHaveBeenCalledTimes(1);
  });

  it('renders a localized failed status for parse errors without raw reason or secret content', async () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    backend.readClaudeProviderConfigSnapshot.mockResolvedValue(localSnapshot('captured', 'RAW_SECRET_JSON_PARSE_ERROR'));
    const containerEl = document.createElement('div');
    createSection(plugin).render(containerEl);
    await flush();

    const status = containerEl.querySelector('[data-claude-provider-local-status="true"]') as HTMLElement;
    expect(status.dataset.claudeProviderLocalStatusState).toBe('failed');
    expect(status.textContent).toContain(t('settings.claudeCode.providers.localStatus.failed', {
      reason: t('settings.claudeCode.providers.localStatus.reason.parse'),
    }));
    expect(status.textContent).not.toContain('RAW_SECRET_JSON_PARSE_ERROR');
    expect(status.textContent).not.toContain('Persistence: verified');
  });

  it('does not let a stale parse-error snapshot overwrite a newer ready generation', async () => {
    const first = deferred<ReturnType<typeof localSnapshot>>();
    const second = deferred<ReturnType<typeof localSnapshot>>();
    backend.readClaudeProviderConfigSnapshot
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const plugin = createPlugin();
    plugin.settings.backendSettings.claudeCode.settingSources = ['project', 'local'];
    plugin.settings.backendSettings.claudeCode.providers.modelMigrationDone = true;
    const containerEl = document.createElement('div');
    const section = createSection(plugin);
    section.render(containerEl);
    containerEl.empty();
    section.render(containerEl);

    first.resolve(localSnapshot('old', 'STALE_RAW_PARSE_ERROR'));
    second.resolve(localSnapshot('fresh'));
    await flush();

    const status = containerEl.querySelector('[data-claude-provider-local-status="true"]') as HTMLElement;
    expect(status.dataset.claudeProviderLocalStatusState).toBe('ready');
    expect(status.textContent).not.toContain('STALE_RAW_PARSE_ERROR');
    expect(status.textContent).toContain(t('settings.claudeCode.providers.localStatus.ready', {
      path: '/vault/.claude/settings.local.json',
      revision: 'fresh',
    }));
  });

  it('localizes Claude evidence status words in Chinese', () => {
    setLocale('zh');
    const ready = t('settings.claudeCode.providers.localStatus.ready', {
      path: '/vault/.claude/settings.local.json',
      revision: 'abc12345',
    });
    expect(ready).toContain('持久化');
    expect(ready).toContain('应用');
    expect(ready).toContain('运行时');
    expect(ready).not.toMatch(/\b(persistence|application|runtime|verified|pending|unavailable)\b/i);
  });
});
