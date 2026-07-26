import { Setting } from 'obsidian';

import { SettingsCodexAccountSurface } from '../../../../src/features/settings/SettingsCodexAccountSurface';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type TestPlugin = {
  settings: OpenCodianPlugin['settings'];
  agentServiceRegistry: { get: jest.Mock };
};

function createPlugin(adapterOverrides: Record<string, unknown> = {}): TestPlugin {
  return {
    settings: {} as OpenCodianPlugin['settings'],
    agentServiceRegistry: {
      get: jest.fn((backend: string) => backend === 'codex' ? adapterOverrides : null),
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 0));
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setTooltip').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: { setButtonText: jest.Mock; setDisabled: jest.Mock; onClick: jest.Mock; setTooltip: jest.Mock }) => unknown,
  ) {
    const control = {
      setButtonText: jest.fn().mockReturnThis(),
      setDisabled: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockImplementation((handler: () => void) => { control.__onClick = handler; return control; }) as jest.Mock,
    } as Record<string, unknown> & { __onClick?: () => void };
    callback(control as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'then').mockReturnThis();
}

describe('SettingsCodexAccountSurface — provider capabilities card', () => {
  beforeEach(() => {
    setLocale('en');
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('classifies native Codex Provider configuration as external-managed and read-only', async () => {
    const plugin = createPlugin({
      getModelProviderCapabilities: jest.fn().mockResolvedValue({ webSearch: true }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'env-or-chatgpt');
    await flush();

    const statusEl = containerEl.querySelector('[data-codex-provider-configuration-status]');
    expect(statusEl).toBeTruthy();
    expect(statusEl?.getAttribute('data-provider-config-state')).toBe('external-managed');
    expect(statusEl?.textContent).toContain(t('settings.codex.accountSurface.providerConfiguration.externalManaged'));
    expect(statusEl?.textContent).toContain(t('settings.codex.accountSurface.providerConfiguration.authSourceEnv'));
    expect(statusEl?.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders capability chips (not JSON) with explanatory copy and status', async () => {
    const plugin = createPlugin({
      getModelProviderCapabilities: jest.fn().mockResolvedValue({
        namespaceTools: true,
        imageGeneration: false,
        webSearch: true,
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(el.getAttribute('data-capabilities-state')).toBe('data');
    // Chips, not a raw JSON dump.
    expect(el.textContent).not.toContain('{');
    expect(el.querySelector('[data-capability-webSearch="true"]')).toBeTruthy();
    expect(el.querySelector('[data-capability-imageGeneration="false"]')).toBeTruthy();
    expect(el.querySelector('[data-capability-namespaceTools="true"]')).toBeTruthy();
    // Each chip carries a product-grade label and explanatory description.
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.webSearch'));
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.imageGenDesc'));
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.enabled'));
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.disabled'));
  });

  it('marks enabled chips with the enabled class', async () => {
    const plugin = createPlugin({
      getModelProviderCapabilities: jest.fn().mockResolvedValue({
        namespaceTools: true,
        imageGeneration: true,
        webSearch: true,
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(el.querySelectorAll('.is-enabled').length).toBe(3);
    expect(el.querySelectorAll('.is-disabled').length).toBe(0);
  });

  it('renders unavailable when getModelProviderCapabilities returns null', async () => {
    const plugin = createPlugin({
      getModelProviderCapabilities: jest.fn().mockResolvedValue(null),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(el.getAttribute('data-capabilities-state')).toBe('unavailable');
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.unavailable'));
  });

  it('renders a failed state when getModelProviderCapabilities throws', async () => {
    const plugin = createPlugin({
      getModelProviderCapabilities: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(el.getAttribute('data-capabilities-state')).toBe('failed');
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.failed'));
  });

  it('renders unavailable when the adapter has no getModelProviderCapabilities', async () => {
    const plugin = createPlugin({});
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(el.textContent).toContain(t('settings.codex.accountSurface.capabilities.unavailable'));
  });
});

describe('SettingsCodexAccountSurface — provider capability refresh isolation', () => {
  beforeEach(() => {
    setLocale('en');
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fences stale Refresh All capability callbacks', async () => {
    const first = deferred<{ webSearch: boolean; imageGeneration: boolean; namespaceTools: boolean }>();
    const second = deferred<{ webSearch: boolean; imageGeneration: boolean; namespaceTools: boolean }>();
    const getModelProviderCapabilities = jest.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const plugin = createPlugin({ getModelProviderCapabilities });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'env-or-chatgpt');
    await Promise.resolve();
    surface.refreshAllNow();

    second.resolve({ webSearch: false, imageGeneration: false, namespaceTools: false });
    await flush();
    const el = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(el.getAttribute('data-capabilities-state')).toBe('data');
    expect(el.querySelector('[data-capability-webSearch="false"]')).toBeTruthy();

    first.resolve({ webSearch: true, imageGeneration: true, namespaceTools: true });
    await flush();
    expect(el.querySelector('[data-capability-webSearch="false"]')).toBeTruthy();
    expect(el.querySelector('[data-capability-webSearch="true"]')).toBeNull();
  });

  it('keeps other cards live when a single capability refresh starts during initial and Refresh All reads', async () => {
    const initialIdentity = deferred<unknown>();
    const refreshAllIdentity = deferred<unknown>();
    const initialUsage = deferred<unknown>();
    const refreshAllUsage = deferred<unknown>();
    const initialRateLimits = deferred<unknown>();
    const refreshAllRateLimits = deferred<unknown>();
    const initialCapabilities = deferred<{ webSearch: boolean; imageGeneration: boolean; namespaceTools: boolean }>();
    const refreshAllCapabilities = deferred<{ webSearch: boolean; imageGeneration: boolean; namespaceTools: boolean }>();
    const singleCapabilities = deferred<{ webSearch: boolean; imageGeneration: boolean; namespaceTools: boolean }>();
    const plugin = createPlugin({
      getAccountInfo: jest.fn()
        .mockReturnValueOnce(initialIdentity.promise)
        .mockReturnValueOnce(refreshAllIdentity.promise),
      getAccountUsage: jest.fn()
        .mockReturnValueOnce(initialUsage.promise)
        .mockReturnValueOnce(refreshAllUsage.promise),
      getAccountRateLimits: jest.fn()
        .mockReturnValueOnce(initialRateLimits.promise)
        .mockReturnValueOnce(refreshAllRateLimits.promise),
      getModelProviderCapabilities: jest.fn()
        .mockReturnValueOnce(initialCapabilities.promise)
        .mockReturnValueOnce(refreshAllCapabilities.promise)
        .mockReturnValueOnce(singleCapabilities.promise),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'env-or-chatgpt');
    await Promise.resolve();
    surface.refreshAllNow();
    await Promise.resolve();

    const capabilityRefresh = containerEl
      .querySelector<HTMLButtonElement>('[data-codex-account-card="capabilities"] .opencodian-codex-account-card-refresh');
    expect(capabilityRefresh).toBeTruthy();
    capabilityRefresh!.click();
    await Promise.resolve();

    refreshAllIdentity.resolve({ account: { type: 'chatgpt', email: 'latest@example.com' } });
    refreshAllUsage.resolve({ usage: { summary: { lifetimeTokens: 3 }, dailyUsageBuckets: [] } });
    refreshAllRateLimits.resolve({ rateLimits: { rateLimits: { requests_per_minute: 3 } } });
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    const rateLimitsEl = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(identityEl.textContent).toContain('latest@example.com');
    expect(usageEl.getAttribute('data-usage-state')).toBe('data');
    expect(rateLimitsEl.getAttribute('data-rate-limits-state')).toBe('data');

    singleCapabilities.resolve({ webSearch: false, imageGeneration: false, namespaceTools: false });
    await flush();
    const capabilitiesEl = containerEl.querySelector('[data-codex-capabilities-readback]')!;
    expect(capabilitiesEl.querySelector('[data-capability-webSearch="false"]')).toBeTruthy();

    initialCapabilities.resolve({ webSearch: true, imageGeneration: true, namespaceTools: true });
    refreshAllCapabilities.resolve({ webSearch: true, imageGeneration: true, namespaceTools: true });
    initialIdentity.resolve({ account: { type: 'chatgpt', email: 'stale@example.com' } });
    initialUsage.resolve({ usage: { summary: { lifetimeTokens: 1 }, dailyUsageBuckets: [] } });
    initialRateLimits.resolve({ rateLimits: { rateLimits: { requests_per_minute: 1 } } });
    await flush();
    expect(capabilitiesEl.querySelector('[data-capability-webSearch="false"]')).toBeTruthy();
    expect(capabilitiesEl.querySelector('[data-capability-webSearch="true"]')).toBeNull();
    expect(identityEl.textContent).not.toContain('stale@example.com');
  });

  it('fences every pending read when the surface is disposed', async () => {
    const account = deferred<unknown>();
    const usage = deferred<unknown>();
    const rateLimits = deferred<unknown>();
    const capabilities = deferred<{ webSearch: boolean; imageGeneration: boolean; namespaceTools: boolean }>();
    const plugin = createPlugin({
      getAccountInfo: jest.fn().mockReturnValue(account.promise),
      getAccountUsage: jest.fn().mockReturnValue(usage.promise),
      getAccountRateLimits: jest.fn().mockReturnValue(rateLimits.promise),
      getModelProviderCapabilities: jest.fn().mockReturnValue(capabilities.promise),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'env-or-chatgpt');
    await Promise.resolve();
    surface.dispose();

    account.resolve({ account: { type: 'chatgpt', email: 'disposed@example.com' } });
    usage.resolve({ usage: { summary: { lifetimeTokens: 9 }, dailyUsageBuckets: [] } });
    rateLimits.resolve({ rateLimits: { rateLimits: { requests_per_minute: 9 } } });
    capabilities.resolve({ webSearch: true, imageGeneration: true, namespaceTools: true });
    await flush();

    expect(containerEl.querySelector('[data-codex-identity-readback]')?.textContent).not.toContain('disposed@example.com');
    expect(containerEl.querySelector('[data-codex-capabilities-readback] [data-capability-webSearch="true"]')).toBeNull();
    expect(containerEl.querySelector('[data-codex-usage-readback]')?.getAttribute('data-usage-state')).toBeNull();
    expect(containerEl.querySelector('[data-codex-rate-limits-readback]')?.getAttribute('data-rate-limits-state')).toBeNull();
  });
});
