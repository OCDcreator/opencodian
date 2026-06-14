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

describe('SettingsCodexAccountSurface — account identity card', () => {
  beforeEach(() => {
    setLocale('en');
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mounts the identity card and auto-loads from app-server account/read', async () => {
    const getAccountInfo = jest.fn().mockResolvedValue({
      account: { type: 'apiKey' },
      requiresOpenaiAuth: true,
    });
    const plugin = createPlugin({ getAccountInfo });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]');
    expect(identityEl).toBeTruthy();
    expect(getAccountInfo).toHaveBeenCalled();
    expect(identityEl!.getAttribute('data-auth-mode')).toBe('apikey');
    expect(identityEl!.getAttribute('data-auth-source')).toBe('plugin-api-key');
  });

  it('renders a ChatGPT badge, email and plan under ChatGPT auth', async () => {
    const plugin = createPlugin({
      getAccountInfo: jest.fn().mockResolvedValue({
        account: { type: 'chatgpt', email: 'user@example.com', planType: 'pro' },
        requiresOpenaiAuth: false,
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'env-or-chatgpt');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    expect(identityEl.getAttribute('data-auth-mode')).toBe('chatgpt');
    expect(identityEl.querySelector('.is-chatgpt')).toBeTruthy();
    expect(identityEl.textContent).toContain('user@example.com');
    expect(identityEl.textContent).toContain('Pro');
  });

  it('shows an honest ChatGPT-auth-required note and codex login hint under API-key auth', async () => {
    const plugin = createPlugin({
      getAccountInfo: jest.fn().mockResolvedValue({ account: { type: 'apiKey' }, requiresOpenaiAuth: true }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    const notice = identityEl.querySelector('[data-auth-required-notice]');
    expect(notice).toBeTruthy();
    expect(identityEl.textContent).toContain('codex login');
  });

  it('falls back to CLI doctor shape and detects chatgpt mode', async () => {
    const plugin = createPlugin({
      getAccountInfo: jest.fn().mockResolvedValue({
        'stored auth mode': 'chatgpt',
        'stored API key': 'false',
        'stored ChatGPT tokens': 'true',
      }),
    });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'env-or-chatgpt');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    expect(identityEl.getAttribute('data-auth-mode')).toBe('chatgpt');
    expect(identityEl.querySelector('.is-chatgpt')).toBeTruthy();
  });

  it('shows an unavailable product state when getAccountInfo returns null', async () => {
    const plugin = createPlugin({ getAccountInfo: jest.fn().mockResolvedValue(null) });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    expect(identityEl.textContent).toContain(t('settings.codex.accountSurface.identity.unavailable'));
  });

  it('shows a failed product state when getAccountInfo throws', async () => {
    const plugin = createPlugin({ getAccountInfo: jest.fn().mockRejectedValue(new Error('boom')) });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    expect(identityEl.textContent).toContain(t('settings.codex.accountSurface.identity.failed'));
  });

  it('shows unavailable when the adapter has no getAccountInfo', async () => {
    const plugin = createPlugin({});
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const identityEl = containerEl.querySelector('[data-codex-identity-readback]')!;
    expect(identityEl.textContent).toContain(t('settings.codex.accountSurface.identity.unavailable'));
  });

  it('re-reads identity when the card refresh button is clicked', async () => {
    const getAccountInfo = jest.fn()
      .mockResolvedValueOnce({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })
      .mockResolvedValueOnce({ account: { type: 'chatgpt', email: 'a@b.com' } });
    const plugin = createPlugin({ getAccountInfo });
    const surface = new SettingsCodexAccountSurface({ plugin: plugin as never });
    const containerEl = document.createElement('div');
    surface.attach(containerEl, 'plugin-api-key');
    await flush();

    const refresh = buttonRecords.find((r) => r.label === t('settings.codex.accountSurface.refresh'));
    expect(refresh?.onClick).toBeDefined();
    refresh!.onClick!();
    await flush();

    expect(getAccountInfo).toHaveBeenCalledTimes(2);
  });
});
