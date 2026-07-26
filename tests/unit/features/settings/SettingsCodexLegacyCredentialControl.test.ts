import { Setting } from 'obsidian';

import { SettingsCodexLegacyCredentialControl } from '../../../../src/features/settings/SettingsCodexLegacyCredentialControl';
import { setLocale, t } from '../../../../src/i18n';

type TestPlugin = {
  settings: {
    backendSettings: {
      codex: {
        apiKey: string;
      };
    };
  };
  saveSettings: jest.Mock;
};

type ButtonRecord = {
  buttonEl: HTMLButtonElement;
  setDisabled: jest.Mock;
  onClick?: () => void | Promise<void>;
};

function mockSettingPrototype(buttonRecords: ButtonRecord[]): void {
  jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: {
      buttonEl: HTMLButtonElement;
      setButtonText: jest.Mock;
      setDisabled: jest.Mock;
      onClick: jest.Mock;
    }) => unknown,
  ) {
    const buttonEl = document.createElement('button');
    const record: ButtonRecord = {
      buttonEl,
      setDisabled: jest.fn().mockImplementation((disabled: boolean) => {
        buttonEl.disabled = disabled;
        return record;
      }),
    };
    const control = {
      buttonEl,
      setButtonText: jest.fn().mockReturnThis(),
      setDisabled: record.setDisabled,
      onClick: jest.fn().mockImplementation((handler: () => void | Promise<void>) => {
        record.onClick = handler;
        return control;
      }),
    };
    callback(control);
    this.controlEl?.appendChild(buttonEl);
    buttonRecords.push(record);
    return this;
  });
}

function createPlugin(secret: string): TestPlugin {
  return {
    settings: {
      backendSettings: {
        codex: { apiKey: secret },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SettingsCodexLegacyCredentialControl', () => {
  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rolls back the in-memory secret and keeps the post-success callback untouched when persistence rejects', async () => {
    const secret = 'legacy-codex-secret-rollback-test';
    const plugin = createPlugin(secret);
    plugin.saveSettings.mockRejectedValueOnce(new Error('persistence failure must stay hidden'));
    const onAfterClear = jest.fn();
    const buttonRecords: ButtonRecord[] = [];
    mockSettingPrototype(buttonRecords);
    const hostEl = document.createElement('div');
    const control = new SettingsCodexLegacyCredentialControl({
      plugin: plugin as never,
      onAfterClear,
    });
    control.render(hostEl);

    expect(buttonRecords[0].buttonEl.type).toBe('button');
    expect(buttonRecords[0].buttonEl.getAttribute('aria-label')).toBe(t('settings.codex.apiKey.clearButton'));
    expect(buttonRecords[0].buttonEl.getAttribute('aria-disabled')).toBe('false');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await buttonRecords[0].onClick!();

    expect(plugin.settings.backendSettings.codex.apiKey).toBe(secret);
    expect(onAfterClear).not.toHaveBeenCalled();
    const credentialEl = hostEl.querySelector('[data-codex-legacy-credential]');
    expect(credentialEl?.getAttribute('data-credential-state')).toBe('configured');
    expect(hostEl.textContent).toContain(t('settings.codex.apiKey.clearFailed'));
    expect(hostEl.textContent).not.toContain(secret);
    expect(hostEl.querySelector('[role="alert"]')?.textContent).toContain(
      t('settings.codex.apiKey.clearFailed'),
    );
    expect(buttonRecords[0].setDisabled).toHaveBeenNthCalledWith(1, true);
    expect(buttonRecords[0].setDisabled).toHaveBeenLastCalledWith(false);
    expect(buttonRecords[0].buttonEl.disabled).toBe(false);
  });

  it('restores focus to the newly rendered clear button after a rejected save', async () => {
    const secret = 'legacy-codex-secret-focus-test';
    const plugin = createPlugin(secret);
    plugin.saveSettings.mockRejectedValueOnce(new Error('persistence failure must stay hidden'));
    const buttonRecords: ButtonRecord[] = [];
    mockSettingPrototype(buttonRecords);
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    const control = new SettingsCodexLegacyCredentialControl({
      plugin: plugin as never,
      onAfterClear: jest.fn(),
    });
    control.render(hostEl);

    const originalButton = buttonRecords[0].buttonEl;
    originalButton.focus();
    expect(document.activeElement).toBe(originalButton);
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    await buttonRecords[0].onClick!();

    const restoredButton = hostEl.querySelector('button');
    expect(restoredButton).toBeInstanceOf(HTMLButtonElement);
    expect(restoredButton).not.toBe(originalButton);
    expect(document.activeElement).toBe(restoredButton);
    expect(hostEl.querySelector('[role="alert"]')?.textContent).toContain(
      t('settings.codex.apiKey.clearFailed'),
    );
    expect(hostEl.textContent).not.toContain(secret);
    expect(hostEl.innerHTML).not.toContain(secret);
  });

  it('clears only after confirmation, restores the status, and invokes the post-success callback once', async () => {
    const secret = 'legacy-codex-secret-success-test';
    const plugin = createPlugin(secret);
    const onAfterClear = jest.fn();
    const buttonRecords: ButtonRecord[] = [];
    mockSettingPrototype(buttonRecords);
    const hostEl = document.createElement('div');
    const control = new SettingsCodexLegacyCredentialControl({
      plugin: plugin as never,
      onAfterClear,
    });
    control.render(hostEl);

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await buttonRecords[0].onClick!();
    expect(plugin.settings.backendSettings.codex.apiKey).toBe(secret);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(onAfterClear).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await buttonRecords[0].onClick!();
    expect(plugin.settings.backendSettings.codex.apiKey).toBe('');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(onAfterClear).toHaveBeenCalledTimes(1);
    const credentialEl = hostEl.querySelector('[data-codex-legacy-credential]');
    expect(credentialEl?.getAttribute('data-credential-state')).toBe('empty');
    expect(credentialEl?.querySelectorAll('button')).toHaveLength(0);
    expect(hostEl.textContent).not.toContain(secret);
  });
});
