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

describe('SettingsCodexAccountSurface — provider capabilities card', () => {
  beforeEach(() => {
    setLocale('en');
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
