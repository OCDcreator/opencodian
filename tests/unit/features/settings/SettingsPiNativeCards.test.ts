import { Setting } from 'obsidian';

import type { PiAdapter } from '../../../../src/core/agents/backend/pi/PiAdapter';
import { SettingsPiConfigurationSection } from '../../../../src/features/settings/backends/pi/SettingsPiConfigurationSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Focused native-card behavior for the Pi settings form: selectable inherit,
 * clear-through-null, unknown-value retention, and human locale copy. Copy is
 * read through the runtime i18n table (merged locale keys) and asserted
 * against the rendered DOM after mount — label/description lookups use the
 * rendered `[data-pi-setting]` card, never spy capture timing.
 */
const translate = t as unknown as (key: string, params?: Record<string, string | number>) => string;

function mockDomPopulation(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (value: string) {
    let nameEl = this.settingEl.querySelector<HTMLElement>('.setting-item-name');
    if (!nameEl) { nameEl = this.settingEl.ownerDocument.createElement('div'); nameEl.className = 'setting-item-name'; this.settingEl.prepend(nameEl); }
    nameEl.textContent = String(value);
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (value: string) {
    let descEl = this.settingEl.querySelector<HTMLElement>('.setting-item-description');
    if (!descEl) { descEl = this.settingEl.ownerDocument.createElement('div'); descEl.className = 'setting-item-description'; this.settingEl.appendChild(descEl); }
    descEl.textContent = String(value);
    return this;
  });
}

function cardName(container: HTMLElement, fieldPath: string): string {
  return container.querySelector<HTMLElement>(`[data-pi-setting="${fieldPath}"] .setting-item-name`)?.textContent ?? '';
}

function cardDescription(container: HTMLElement, fieldPath: string): string {
  return container.querySelector<HTMLElement>(`[data-pi-setting="${fieldPath}"] .setting-item-description`)?.textContent ?? '';
}

describe('Pi native settings cards (review repair)', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); mockDomPopulation(); });
  afterEach(() => jest.restoreAllMocks());

  it('renders an explicit selectable inherit on unset native choices instead of the disabled unknown fallback', async () => {
    expect(translate('settings.pi.consequence.retry.enabled')).not.toBe('settings.pi.consequence.retry.enabled');
    expect(translate('settings.pi.label.retry.enabled')).not.toBe('settings.pi.label.retry.enabled');
    const snapshot = { scopes: { global: { path: '/global', revision: 'g', value: {} }, project: { path: '/project', revision: 'p', value: {} } }, fields: [{ path: 'retry.enabled', group: 'execution', kind: 'boolean', label: { en: 'Automatic retry', zh: '自动重试' } }], sdkVersion: '0.73.1' };
    const container = document.body.createDiv();
    new SettingsPiConfigurationSection({ command: jest.fn(async () => snapshot) } as unknown as PiAdapter, async () => {}, async () => {}).attach(container, ['execution']);
    await Promise.resolve(); await Promise.resolve();
    const card = container.querySelector('[data-pi-setting="retry.enabled"]');
    expect(card).not.toBeNull();
    const inherit = card!.querySelector<HTMLInputElement>('input[type="radio"][value=""]');
    expect(inherit).not.toBeNull();
    expect(inherit!.checked).toBe(true);
    expect(inherit!.disabled).toBe(false);
    expect(inherit!.closest('label')?.textContent).toContain(t('settings.pi.inherit'));
    expect(card!.querySelector<HTMLInputElement>('input[type="radio"][value="true"]')?.checked).toBe(false);
    expect(card!.querySelector<HTMLInputElement>('input[type="radio"][value="false"]')?.checked).toBe(false);
    const name = cardName(container, 'retry.enabled');
    expect(name).toBe(translate('settings.pi.label.retry.enabled'));
    expect(name).not.toBe('retry.enabled');
    const description = cardDescription(container, 'retry.enabled');
    // The consequence sentence leads the description; badges and the secondary
    // key follow it inside the same element.
    expect(description.startsWith(translate('settings.pi.consequence.retry.enabled'))).toBe(true);
    expect(description).not.toBe('retry.enabled');
    expect(card!.querySelector('.opencodian-pi-field-key')?.textContent).toBe('retry.enabled');
  });

  it('routes an explicit choice back to inherit and saves null through the revision-guarded mutation', async () => {
    const snapshot = { scopes: { global: { path: '/global', revision: 'g', value: {} }, project: { path: '/project', revision: 'p', value: { 'retry.enabled': true } } }, fields: [{ path: 'retry.enabled', group: 'execution', kind: 'boolean', label: { en: 'Automatic retry', zh: '自动重试' } }], sdkVersion: '0.73.1' };
    const command = jest.fn(async () => snapshot);
    const buttonCallbacks: Array<() => Promise<void>> = [];
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (callback) {
      const button = { setButtonText: () => button, setCta: () => button, setDisabled: () => button, onClick: (cb: () => Promise<void>) => { buttonCallbacks.push(cb); return button; } };
      callback(button as never); return this;
    });
    const container = document.body.createDiv();
    new SettingsPiConfigurationSection({ command } as unknown as PiAdapter, async () => {}, async () => {}).attach(container, ['execution']);
    await Promise.resolve(); await Promise.resolve();
    const card = container.querySelector('[data-pi-setting="retry.enabled"]')!;
    // Pick an explicit value, then return to inherit — both selectable.
    card.querySelector<HTMLInputElement>('input[type="radio"][value="false"]')!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(card.querySelector<HTMLInputElement>('input[type="radio"][value="false"]')!.checked).toBe(true);
    card.querySelector<HTMLInputElement>('input[type="radio"][value=""]')!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(card.querySelector<HTMLInputElement>('input[type="radio"][value=""]')!.checked).toBe(true);
    // addButton order in attach+render: [0] refresh, [1] save, [2] reconnect.
    await buttonCallbacks[1]();
    expect(command).toHaveBeenLastCalledWith(undefined, 'save_configuration', { scope: 'project', revision: 'p', changes: { 'retry.enabled': null } });
  });

  it('retains unknown non-empty saved values as disabled unlisted choices without saving them', async () => {
    const snapshot = { scopes: { global: { path: '/global', revision: 'g', value: {} }, project: { path: '/project', revision: 'p', value: { defaultThinkingLevel: 'max' } } }, fields: [{ path: 'defaultThinkingLevel', group: 'model', kind: 'choice', options: ['off', 'high'], label: { en: 'Default thinking level', zh: '默认思考等级' } }], sdkVersion: '0.73.1' };
    const command = jest.fn(async () => snapshot);
    const buttonCallbacks: Array<() => Promise<void>> = [];
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (callback) {
      const button = { setButtonText: () => button, setCta: () => button, setDisabled: () => button, onClick: (cb: () => Promise<void>) => { buttonCallbacks.push(cb); return button; } };
      callback(button as never); return this;
    });
    const container = document.body.createDiv();
    new SettingsPiConfigurationSection({ command } as unknown as PiAdapter, async () => {}, async () => {}).attach(container, ['model']);
    await Promise.resolve(); await Promise.resolve();
    const card = container.querySelector('[data-pi-setting="defaultThinkingLevel"]')!;
    const unlisted = card.querySelector<HTMLInputElement>('input[type="radio"][value="max"]');
    expect(unlisted).not.toBeNull();
    expect(unlisted!.checked).toBe(true);
    expect(unlisted!.disabled).toBe(true);
    expect(card.querySelector<HTMLInputElement>('input[type="radio"][value=""]')?.disabled).toBe(false);
    // Save runs with an empty draft set: the unlisted value is never written.
    await buttonCallbacks[1]();
    expect(command).not.toHaveBeenCalledWith(undefined, 'save_configuration', expect.objectContaining({ changes: expect.objectContaining({ defaultThinkingLevel: expect.anything() }) }));
  });

  it.each(['en', 'zh'] as const)('labels native cards with human %s copy, never field-key-only text', async (locale) => {
    setLocale(locale);
    expect(translate('settings.pi.label.steeringMode')).not.toBe('settings.pi.label.steeringMode');
    expect(translate('settings.pi.consequence.steeringMode')).not.toBe('settings.pi.consequence.steeringMode');
    expect(translate('settings.pi.consequence.unknown')).not.toBe('settings.pi.consequence.unknown');
    const snapshot = { scopes: { global: { path: '/global', revision: 'g', value: {} }, project: { path: '/project', revision: 'p', value: {} } }, fields: [
      { path: 'steeringMode', group: 'execution', kind: 'choice', options: ['all', 'one-at-a-time'], label: { en: 'Steering delivery', zh: '纠偏消息投递' } },
      { path: 'future.custom', group: 'execution', kind: 'string', label: { en: 'Future field', zh: '未来字段' } },
    ], sdkVersion: '0.73.1' };
    const container = document.body.createDiv();
    new SettingsPiConfigurationSection({ command: jest.fn(async () => snapshot) } as unknown as PiAdapter, async () => {}, async () => {}).attach(container, ['execution']);
    await Promise.resolve(); await Promise.resolve();
    // Known field: locale-mapped human label + consequence sentence.
    const steeringName = cardName(container, 'steeringMode');
    expect(steeringName).toBe(translate('settings.pi.label.steeringMode'));
    expect(steeringName).not.toBe('steeringMode');
    const steeringDescription = cardDescription(container, 'steeringMode');
    expect(steeringDescription.startsWith(translate('settings.pi.consequence.steeringMode'))).toBe(true);
    expect(steeringDescription).not.toBe('steeringMode');
    // Unknown fields keep the honest unclaimed fallback and the fixture label.
    const unknownDescription = cardDescription(container, 'future.custom');
    expect(unknownDescription.startsWith(translate('settings.pi.consequence.unknown', { path: 'future.custom' }))).toBe(true);
    expect(unknownDescription).not.toBe('future.custom');
    const unknownName = cardName(container, 'future.custom');
    expect(unknownName).toBe(locale === 'zh' ? '未来字段' : 'Future field');
  });
});
