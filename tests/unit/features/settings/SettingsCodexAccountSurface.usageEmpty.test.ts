/**
 * The token-usage card hides summary tiles whose values are absent instead of
 * rendering "undefined" placeholders, and renders an honest empty state when
 * nothing is known at all.
 */

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
      get: jest.fn((backend: string) => (backend === 'codex' ? adapterOverrides : null)),
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 0));
}

function attachWithUsage(usage: unknown): HTMLElement {
  const plugin = createPlugin({
    getAccountUsage: jest.fn().mockResolvedValue({ usage }),
  });
  const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
  const containerEl = document.createElement('div');
  surface.attach(containerEl, 'plugin-api-key');
  return containerEl;
}

describe('SettingsCodexAccountSurface — usage card all-null handling', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders an empty state (no tiles, no undefined) when all summary fields are null', async () => {
    const containerEl = attachWithUsage({
      summary: {
        lifetimeTokens: null,
        currentStreakDays: null,
        longestStreakDays: null,
        peakDailyTokens: null,
        longestRunningTurnSec: null,
      },
    });
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('empty');
    expect(usageEl.querySelectorAll('.opencodian-codex-account-stat-tile').length).toBe(0);
    expect(usageEl.textContent).toContain(t('settings.codex.accountSurface.usage.empty'));
    expect(usageEl.textContent).not.toContain('undefined');
  });

  it('renders the empty state when the usage payload carries no summary at all', async () => {
    const containerEl = attachWithUsage({});
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('empty');
    expect(usageEl.textContent).toContain(t('settings.codex.accountSurface.usage.empty'));
    expect(usageEl.textContent).not.toContain('undefined');
  });

  it('hides only the absent tiles when some summary fields are present', async () => {
    const containerEl = attachWithUsage({
      summary: { lifetimeTokens: 4200 },
      dailyUsageBuckets: [{ startDate: '2026-09-29', tokens: 4200 }],
    });
    await flush();

    const usageEl = containerEl.querySelector('[data-codex-usage-readback]')!;
    expect(usageEl.getAttribute('data-usage-state')).toBe('data');
    const tiles = usageEl.querySelectorAll('.opencodian-codex-account-stat-tile');
    expect(tiles.length).toBe(1);
    expect(usageEl.textContent).toContain('4.2K');
    expect(usageEl.textContent).not.toContain('undefined');
    // Buckets still render alongside the single known tile.
    expect(usageEl.querySelector('[data-bucket-date="2026-09-29"]')).toBeTruthy();
  });
});
