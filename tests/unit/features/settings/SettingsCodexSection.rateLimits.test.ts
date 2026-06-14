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

describe('SettingsCodexAccountSurface — rate limits card', () => {
  beforeEach(() => {
    setLocale('en');
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders structured limit rows (not JSON) when real rate-limit data is returned', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockResolvedValue({
        rateLimits: {
          rateLimits: { requests_per_minute: 60, tokens_per_minute: 100000 },
          rateLimitsByLimitId: {
            default: { requests_per_minute: 60, tokens_per_minute: 100000 },
          },
        },
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(el.getAttribute('data-rate-limits-state')).toBe('data');
    expect(el.textContent).not.toContain('{');
    expect(el.textContent).toContain('Requests Per Minute');
    expect(el.textContent).toContain('60');
    expect(el.textContent).toContain('100,000');
    expect(el.querySelector('[data-tier-id="default"]')).toBeTruthy();
  });

  it('renders a product-grade ChatGPT-auth-required state under API-key auth', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockResolvedValue({
        rateLimits: null,
        errorReason: 'JSON-RPC error -32600: chatgpt authentication required to read rate limits',
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(el.getAttribute('data-rate-limits-state')).toBe('auth-required');
    expect(el.querySelector('[data-auth-required-notice]')).toBeTruthy();
    expect(el.textContent).toContain(t('settings.codex.accountSurface.rateLimits.authRequiredTitle'));
    expect(el.textContent).toContain('codex login');
    expect(el.textContent).not.toContain('JSON-RPC error');
  });

  it('renders the empty message when rate limits object is present but has no entries', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockResolvedValue({
        rateLimits: { rateLimits: {} },
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(el.textContent).toContain(t('settings.codex.accountSurface.rateLimits.empty'));
  });

  it('renders unavailable when rate limits are null without an auth reason', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockResolvedValue({ rateLimits: null }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(el.getAttribute('data-rate-limits-state')).toBe('unavailable');
    expect(el.textContent).toContain(t('settings.codex.accountSurface.rateLimits.unavailable'));
  });

  it('renders a failed state when getAccountRateLimits throws', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(el.textContent).toContain(t('settings.codex.accountSurface.rateLimits.failed'));
  });

  it('renders unavailable when the adapter has no getAccountRateLimits', async () => {
    const plugin = createPlugin({});
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const el = containerEl.querySelector('[data-codex-rate-limits-readback]')!;
    expect(el.textContent).toContain(t('settings.codex.accountSurface.rateLimits.unavailable'));
  });
});
