import { Setting } from 'obsidian';

import { SettingsCodexAccountSurface } from '../../../../src/features/settings/SettingsCodexAccountSurface';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type TestPlugin = {
  settings: OpenCodianPlugin['settings'];
  agentServiceRegistry: { get: jest.Mock };
};

const buttonRecords: Array<{ label?: string; onClick?: () => void }> = [];

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
    const record: { label?: string; onClick?: () => void } = {};
    const control = {
      setButtonText: jest.fn().mockImplementation((value: string) => { record.label = value; return control; }),
      setDisabled: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockImplementation((handler: () => void) => { record.onClick = handler; return control; }),
    };
    buttonRecords.push(record);
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'then').mockReturnThis();
}

describe('SettingsCodexAccountSurface — token usage card', () => {
  beforeEach(() => {
    setLocale('en');
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders structured stat tiles (not JSON) when real usage data is returned', async () => {
    const plugin = createPlugin({
      getAccountUsage: jest.fn().mockResolvedValue({
        usage: {
          summary: {
            lifetimeTokens: 132010,
            peakDailyTokens: 132010,
            longestRunningTurnSec: 6964,
            currentStreakDays: 1,
            longestStreakDays: 1,
          },
          dailyUsageBuckets: [{ startDate: '2026-06-12', tokens: 132010 }],
        },
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('data');
    // Stat tiles are rendered as product cards, not a raw JSON dump.
    const tiles = usageEl.querySelectorAll('.opencodian-codex-account-stat-tile');
    expect(tiles.length).toBe(5);
    expect(usageEl.textContent).toContain('132.0K');
    expect(usageEl.textContent).not.toContain('{');
    // Daily usage bar chart is rendered.
    expect(usageEl.querySelector('.opencodian-codex-account-usage-bar')).toBeTruthy();
    expect(usageEl.querySelector('[data-bucket-date="2026-06-12"]')).toBeTruthy();
  });

  it('renders a product-grade ChatGPT-auth-required state (not a raw error) under API-key auth', async () => {
    const plugin = createPlugin({
      getAccountUsage: jest.fn().mockResolvedValue({
        usage: null,
        errorReason: 'JSON-RPC error -32600: chatgpt authentication required to read token usage',
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('auth-required');
    const notice = usageEl.querySelector('[data-auth-required-notice]');
    expect(notice).toBeTruthy();
    // Product-grade title and a codex login hint, not the raw JSON-RPC string.
    expect(usageEl.textContent).toContain(t('settings.codex.accountSurface.usage.authRequiredTitle'));
    expect(usageEl.textContent).toContain('codex login');
    expect(usageEl.textContent).not.toContain('JSON-RPC error');
  });

  it('renders a generic unavailable state when usage is null without an auth reason', async () => {
    const plugin = createPlugin({
      getAccountUsage: jest.fn().mockResolvedValue({ usage: null }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('unavailable');
    expect(usageEl.textContent).toContain(t('settings.codex.accountSurface.usage.unavailable'));
  });

  it('renders a failed state when getAccountUsage throws', async () => {
    const plugin = createPlugin({
      getAccountUsage: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('unavailable');
    expect(usageEl.textContent).toContain(t('settings.codex.accountSurface.usage.failed'));
  });

  it('renders unavailable when the adapter has no getAccountUsage', async () => {
    const plugin = createPlugin({});
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.textContent).toContain(t('settings.codex.accountSurface.usage.unavailable'));
  });
});
