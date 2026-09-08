import { Setting } from 'obsidian';

import type { PiAdapter } from '../../../../src/core/agents/backend/pi/PiAdapter';
import { getActiveSecondaryTabId,getPrimaryTabDefinition } from '../../../../src/features/settings/settingsLayoutRegistry';
import { SettingsPiConfigurationSection } from '../../../../src/features/settings/SettingsPiConfigurationSection';
import { SettingsPiSection } from '../../../../src/features/settings/SettingsPiSection';
import { setLocale } from '../../../../src/i18n';

describe('Pi native settings integration', () => {
  beforeEach(() => { setLocale('zh'); document.body.innerHTML = ''; });
  afterEach(() => jest.restoreAllMocks());
  it('owns a backend tab with dedicated secondary pages and remembers the selected page', () => {
    const pi = getPrimaryTabDefinition('pi');
    expect(pi?.backendRequired).toBe('pi');
    expect(pi?.secondaryTabs.map(tab => tab.id)).toEqual(['connection', 'providers', 'model', 'execution', 'resources', 'account', 'sessions', 'advanced']);
    expect(getActiveSecondaryTabId('pi', { pi: 'providers' })).toBe('providers');
    expect(getPrimaryTabDefinition('codex')?.defaultSecondaryTabId).toBe('connection');
    expect(getPrimaryTabDefinition('claude-code')?.defaultSecondaryTabId).toBe('runtime');
  });
  it('renders the connection surface using the same section shell contract as existing backends', () => {
    const container = document.body.createDiv();
    new SettingsPiSection({ settings: { backendSettings: {} }, saveSettings: async () => {} }).attachTabbed(container, 'connection');
    expect(container.querySelector('[data-pi-section="connection"][data-settings-surface="section"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-surface="section-body"]')).not.toBeNull();
    expect(container.textContent).toContain('连接');
    expect(container.textContent).not.toContain('settings.pi.');
  });
  it('saves an explicit project override with revision and preserves untouched settings', async () => {
    const buttonCallbacks: Array<() => Promise<void>> = [];
    const numberChanges: Array<(value: string) => void> = [];
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (callback) {
      const button = { setButtonText: () => button, setCta: () => button, setDisabled: () => button, onClick: (cb: () => Promise<void>) => { buttonCallbacks.push(cb); return button; } };
      callback(button as never); return this;
    });
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (callback) {
      const input = { inputEl: document.createElement('input'), setValue: () => input, setPlaceholder: () => input, setDisabled: () => input, onChange: (cb: (value: string) => void) => { numberChanges.push(cb); return input; } };
      callback(input as never); return this;
    });
    const snapshot = { scopes: { global: { path: '/global', revision: 'g', value: {} }, project: { path: '/project', revision: 'p', value: { compaction: { reserveTokens: 100 } } } }, fields: [{ path: 'compaction.reserveTokens', group: 'execution', kind: 'number', min: 0, label: { zh: '预留', en: 'Reserve' } }], sdkVersion: '0.73.1' };
    const command = jest.fn(async () => snapshot);
    const saved = jest.fn(async () => {});
    new SettingsPiConfigurationSection({ command } as unknown as PiAdapter, saved, async () => {}).attach(document.body.createDiv(), 'execution');
    await Promise.resolve(); await Promise.resolve();
    numberChanges[0]('456');
    await buttonCallbacks[1]();
    expect(command).toHaveBeenCalledWith(undefined, 'save_configuration', { scope: 'project', revision: 'p', changes: { 'compaction.reserveTokens': 456 } });
    expect(saved).toHaveBeenCalledWith(['compaction.reserveTokens']);
  });
});
