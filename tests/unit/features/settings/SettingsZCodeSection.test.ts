import { type ButtonComponent, type DropdownComponent, Setting, type TextAreaComponent, type TextComponent } from 'obsidian';

import { SettingsZCodeAccounts } from '../../../../src/features/settings/backends/zcode/SettingsZCodeAccounts';
import type { ZCodeSettingsModelCatalog } from '../../../../src/features/settings/backends/zcode/SettingsZCodeModelControls';
import { type SettingsZCodeHost, SettingsZCodeSection } from '../../../../src/features/settings/backends/zcode/SettingsZCodeSection';

const catalog: ZCodeSettingsModelCatalog = {
  models: [
    { providerId: 'native', modelId: 'one', label: 'One', providerLabel: 'Native', reasoningLevels: [] },
    { providerId: 'other', modelId: 'two', label: 'Two', providerLabel: 'Other', reasoningLevels: [] },
  ], defaultModel: { provider: 'native', model: 'one' },
  thoughtLevels: [{ value: 'high', label: 'High' }], thoughtLevelEnabled: true,
};

function installControls(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, text) {
    this.settingEl.createDiv({ cls: 'setting-item-name', text: String(text) }); return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, text) {
    let description = this.settingEl.querySelector<HTMLElement>('.setting-item-description');
    description ??= this.settingEl.createDiv({ cls: 'setting-item-description' });
    description.textContent = String(text); return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, configure) {
    const buttonEl = this.controlEl.createEl('button');
    const control = { buttonEl,
      setButtonText: (text: string) => { buttonEl.textContent = text; return control; },
      setDisabled: (disabled: boolean) => { buttonEl.disabled = disabled; return control; },
      onClick: (handler: () => void) => { buttonEl.addEventListener('click', handler); return control; },
    };
    configure(control as unknown as ButtonComponent); return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, configure) {
    const selectEl = this.controlEl.createEl('select');
    const control = { selectEl,
      addOption: (value: string, text: string) => { const option = selectEl.createEl('option', { text }); option.value = value; return control; },
      setValue: (value: string) => { selectEl.value = value; return control; },
      onChange: (handler: (value: string) => void) => { selectEl.addEventListener('change', () => handler(selectEl.value)); return control; },
    };
    configure(control as unknown as DropdownComponent); return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, configure) {
    const inputEl = this.controlEl.createEl('input');
    const control = { inputEl,
      setPlaceholder: (value: string) => { inputEl.placeholder = value; return control; },
      setValue: (value: string) => { inputEl.value = value; return control; },
      onChange: (handler: (value: string) => void) => { inputEl.addEventListener('input', () => handler(inputEl.value)); return control; },
    };
    configure(control as unknown as TextComponent); return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function (this: Setting, configure) {
    const inputEl = this.controlEl.createEl('textarea');
    const control = { inputEl, setValue: (value: string) => { inputEl.value = value; return control; },
      onChange: (handler: (value: string) => void) => { inputEl.addEventListener('input', () => handler(inputEl.value)); return control; } };
    configure(control as unknown as TextAreaComponent); return this;
  });
}

async function flush(): Promise<void> { for (let index = 0; index < 12; index++) await Promise.resolve(); }

function fixture() {
  const getCatalog = jest.fn().mockResolvedValue(catalog);
  const host: SettingsZCodeHost = {
    settings: { backendSettings: { zcode: { executablePath: '', model: '', thinkingLevel: '', mode: '' } } },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    agentServiceRegistry: { get: () => ({ start: jest.fn(), stop: jest.fn(), getWorkspaceModelCatalog: getCatalog }) },
  };
  const container = document.body.createDiv();
  return { host, container, getCatalog, section: new SettingsZCodeSection(host) };
}

function change(select: HTMLSelectElement, value: string): void { select.value = value; select.dispatchEvent(new Event('change')); }

beforeEach(() => { document.body.innerHTML = ''; installControls(); });
afterEach(() => { jest.restoreAllMocks(); });

it.each(['classic', 'tabbed'] as const)('saves native searchable models, thinking and mode against latest host state (%s)', async (layout) => {
  const { host, container, section } = fixture();
  if (layout === 'classic') section.attach(container); else section.attachTabbed(container, 'model');
  await flush();
  container.querySelector<HTMLButtonElement>('[data-zcode-field="model"] button')!.click();
  const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  search.value = 'two'; search.dispatchEvent(new Event('input'));
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
  expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Other');
  container.querySelector<HTMLButtonElement>('[role="option"]')!.click();
  await flush();
  expect(host.settings.backendSettings.zcode?.model).toBe('other/two');
  host.settings.backendSettings.zcode = { executablePath: '/external', model: 'other/two', thinkingLevel: '', mode: '' };
  const [thinking, mode] = Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
  change(thinking, 'high'); change(mode, 'build'); await flush();
  expect(host.settings.backendSettings.zcode).toEqual({ executablePath: '/external', model: 'other/two', thinkingLevel: 'high', mode: 'build' });
  expect(host.saveSettings).toHaveBeenCalledTimes(3);
});

it('preserves invalid saved choices and exposes explicit reset when the catalog fails', async () => {
  const { host, getCatalog, container, section } = fixture();
  host.settings.backendSettings.zcode = { executablePath: '', model: 'legacy/missing', thinkingLevel: 'legacy', mode: 'auto' };
  getCatalog.mockRejectedValue(new Error('offline'));
  section.attachTabbed(container, 'chat'); await flush();
  expect(host.saveSettings).not.toHaveBeenCalled();
  expect(container.textContent).toContain('legacy/missing');
  expect(container.querySelector<HTMLDetailsElement>('[data-zcode-group="accounts-models"]')?.open).toBe(true);
  expect(container.querySelector<HTMLOptionElement>('option[value="auto"]')?.disabled).toBe(true);
  const buttons = container.querySelectorAll<HTMLButtonElement>('[data-zcode-field="model"] button');
  expect(buttons[0].disabled).toBe(true);
  buttons[1].click(); await flush();
  expect(host.settings.backendSettings.zcode?.model).toBe('');
});

it('discards late catalog responses and recovers through an explicit retry', async () => {
  const { getCatalog, container, section } = fixture();
  let resolveFirst!: (value: ZCodeSettingsModelCatalog) => void;
  getCatalog.mockReturnValueOnce(new Promise<ZCodeSettingsModelCatalog>((resolve) => { resolveFirst = resolve; }));
  section.attachTabbed(container, 'chat');
  container.querySelector<HTMLButtonElement>('[data-zcode-group="chat-defaults"] > .opencodian-zcode-actions button')!.click();
  await flush();
  resolveFirst({ ...catalog, models: [] }); await flush();
  expect(container.querySelector<HTMLButtonElement>('[data-zcode-field="model"] button')!.disabled).toBe(false);
  expect(getCatalog).toHaveBeenLastCalledWith({ forceRefresh: true });
});

it('keeps the completion enable switch separate, and stores only its model override', async () => {
  const { host, container } = fixture();
  const open = jest.fn();
  new SettingsZCodeSection(host, open).attachTabbed(container, 'chat'); await flush();
  container.querySelector<HTMLButtonElement>('[data-zcode-field="completion-model"] button')!.click();
  container.querySelector<HTMLButtonElement>('[role="option"]')!.click(); await flush();
  expect(host.settings.inlineCompletionModelOverrides).toEqual({ zcode: 'native/one' });
  expect(host.settings.inlineCompletionEnabled).toBeUndefined();
  expect(host.settings.backendSettings.zcode?.model).toBe('');
  container.querySelector<HTMLButtonElement>('.opencodian-zcode-completion-status button')!.click();
  expect(open).toHaveBeenCalledTimes(1);
});

it('keeps the picker open on save failure and supports Escape focus recovery', async () => {
  const { host, container, section } = fixture();
  host.saveSettings = jest.fn().mockRejectedValue(new Error('disk full'));
  section.attachTabbed(container, 'chat'); await flush();
  const open = container.querySelector<HTMLButtonElement>('[data-zcode-field="model"] button')!;
  open.click(); container.querySelector<HTMLButtonElement>('[role="option"]')!.click(); await flush();
  expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  expect(host.settings.backendSettings.zcode?.model).toBe('');
  expect(container.querySelector('.opencodian-zcode-feedback')?.textContent).toContain('save');
  container.querySelector<HTMLInputElement>('input[type="search"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(open);
  expect(open.getAttribute('aria-expanded')).toBe('false');
  expect(open.hasAttribute('aria-controls')).toBe(false);
});

it('retains current settings when only the executable override changes', async () => {
  const { host, container, section } = fixture();
  section.attachTabbed(container, 'connection');
  host.settings.backendSettings.zcode = { executablePath: '', model: 'native/one', thinkingLevel: 'high', mode: 'plan' };
  const input = container.querySelector<HTMLInputElement>('input')!;
  input.value = ' /new/zcode.cjs '; input.dispatchEvent(new Event('input')); await flush();
  expect(host.settings.backendSettings.zcode).toEqual({ executablePath: '/new/zcode.cjs', model: 'native/one', thinkingLevel: 'high', mode: 'plan' });
});

it('recovers a provider conflict next to the draft and prevents duplicate creates after successful save', async () => {
  const read = jest.fn().mockResolvedValue({ path: '/fixture/provider_config.json', revision: null, providers: [] });
  const save = jest.fn().mockResolvedValueOnce({ status: 'conflict', expected: null, current: null })
    .mockResolvedValue({ status: 'success', revision: null });
  const container = document.body.createDiv();
  new SettingsZCodeAccounts({
    accounts: { read: jest.fn().mockResolvedValue({ state: 'signed-out', accounts: [] }), login: jest.fn(), logout: jest.fn(), cancelLogin: jest.fn(), openDesktop: jest.fn() },
    getPersonalConfigService: () => ({ read, save, remove: jest.fn() }), refreshConfiguration: jest.fn().mockResolvedValue({ needsReconnect: false }),
  }, jest.fn().mockResolvedValue(undefined)).attach(container);
  await flush();
  container.querySelector<HTMLDetailsElement>('details')!.open = true;
  const click = (text: RegExp) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => text.test(button.textContent ?? ''))!.click();
  click(/Add API service here/);
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('.opencodian-zcode-provider-form input'));
  ['Draft name', 'https://example.invalid/v1', 'fixture-secret'].forEach((value, index) => { inputs[index].value = value; inputs[index].dispatchEvent(new Event('input')); });
  const models = container.querySelector<HTMLTextAreaElement>('textarea')!;
  models.value = 'test-model'; models.dispatchEvent(new Event('input'));
  click(/Save shared configuration/); await flush();
  expect(save).toHaveBeenCalledTimes(1);
  const reload = container.querySelector<HTMLButtonElement>('.opencodian-zcode-provider-form .opencodian-zcode-feedback button')!;
  expect(reload).not.toBeNull(); reload.click(); await flush();
  expect(read).toHaveBeenCalledTimes(2);
  expect(inputs[0].value).toBe('Draft name');
  expect(models.value).toBe('test-model');
  click(/Save my draft to the latest configuration/); await flush();
  const saved = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Saved')!;
  expect(saved.disabled).toBe(true); saved.click();
  expect(save).toHaveBeenCalledTimes(2);
  expect(inputs[2].value).toBe('');
  const close = Array.from(container.querySelectorAll<HTMLButtonElement>('.opencodian-zcode-provider-form button')).find((button) => button.textContent === 'Close')!;
  expect(close.disabled).toBe(false);
  expect(document.activeElement).toBe(close);
});

it('keeps a large provider catalog collapsed without truncating the model IDs passed to editing', async () => {
  const models = Array.from({ length: 180 }, (_, index) => `provider-model-${index}`);
  const read = jest.fn().mockResolvedValue({ path: '/fixture/provider_config.json', revision: null, providers: [
    { id: 'large', name: 'Large service', protocol: 'openai-chat-completions', baseUrl: 'https://example.invalid/v1', hasApiKey: true, models, editable: true },
    { id: 'next', name: 'Next service', protocol: 'openai-chat-completions', baseUrl: 'https://next.invalid/v1', hasApiKey: true, models: ['next-model'], editable: true },
  ] });
  const container = document.body.createDiv();
  new SettingsZCodeAccounts({
    accounts: { read: jest.fn().mockResolvedValue({ state: 'signed-out', accounts: [] }), login: jest.fn(), logout: jest.fn(), cancelLogin: jest.fn(), openDesktop: jest.fn() },
    getPersonalConfigService: () => ({ read, save: jest.fn(), remove: jest.fn() }), refreshConfiguration: jest.fn(),
  }, jest.fn()).attach(container);
  await flush();
  const list = container.querySelector<HTMLElement>('.opencodian-zcode-provider-list')!;
  const disclosure = list.querySelector<HTMLDetailsElement>('details')!;
  expect(disclosure.open).toBe(false);
  expect(disclosure.querySelector('summary')?.getAttribute('aria-label')).toBe('Models for Large service');
  const description = list.querySelector('.setting-item-description')!.cloneNode(true) as HTMLElement;
  description.querySelector('details')!.remove();
  expect(description.textContent).toBe('https://example.invalid/v1 · Models: 180');
  expect(Array.from(disclosure.querySelectorAll('li'), (item) => item.textContent)).toEqual(models);
  expect(list.textContent).toContain('Next service');
  list.querySelector<HTMLButtonElement>('button[aria-label="Edit service: Large service"]')!.click();
  expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value.split('\n')).toEqual(models);
});
