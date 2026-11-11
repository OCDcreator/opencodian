import { Setting } from 'obsidian';

import type { DshBackendSettings } from '../../../../../../src/core/types/settings';
import { type DshNativeSettingsHost, type DshNativeSettingsPort, SettingsDshNativeWorkspace } from '../../../../../../src/features/settings/backends/dsh/SettingsDshNativeWorkspace';
import { setLocale, t, type TranslationKey } from '../../../../../../src/i18n';

/** Real public value shape: Native and ACP both encode model routes as the
 * opaque JSON tuple JSON.stringify([providerId, modelId]) (DshAdapter
 * readSessionConfiguration forwards it verbatim). The dedicated workspace
 * suite's regression coverage for the default-model dropdown lives here so its
 * catalog fixtures exercise exactly that shape, including ids containing '/'. */
const text = (key: string) => t(`settings.dsh.native.${key}` as TranslationKey);
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function controls(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, value: string) {
    this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.infoEl.createDiv({ cls: 'setting-item-name', text: value }); return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, value: string) {
    this.infoEl.createDiv({ cls: 'setting-item-description', text: value }); return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback) {
    const el = this.controlEl.createEl('button', { attr: { type: 'button' } });
    const api = { setButtonText: (value: string) => { el.textContent = value; return api; }, setDisabled: (value: boolean) => { el.disabled = value; return api; }, onClick: (fn: () => void) => { el.addEventListener('click', () => { void fn(); }); return api; } };
    callback(api as never); return this;
  });
  for (const method of ['addText', 'addTextArea'] as const) jest.spyOn(Setting.prototype, method).mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl(method === 'addText' ? 'input' : 'textarea');
    const api = { inputEl, setValue: (value: string) => { inputEl.value = value; return api; }, setPlaceholder: (value: string) => { inputEl.placeholder = value; return api; }, onChange: (fn: (value: string) => void) => { inputEl.addEventListener('input', () => fn(inputEl.value)); return api; } };
    callback(api as never); return api as never;
  });
}
function group(container: Element, ns: string): HTMLElement { return container.querySelector(`[data-native-namespace="${ns}"]`)!; }
function field(container: Element, path: string): HTMLInputElement | HTMLSelectElement {
  return container.querySelector(`[data-native-path="${path}"] input, [data-native-path="${path}"] select`)!;
}
function change(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'change'): void {
  expect(input).not.toBeNull(); input.value = value; input.dispatchEvent(new Event(event, { bubbles: true }));
}
function click(container: Element, key: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === text(key));
  expect(button).toBeDefined(); button!.click();
}
function fixture(overrides: Partial<DshBackendSettings> = {}) {
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', profile: 'acp', transport: 'native', args: [], env: {}, ...overrides };
  const adapter = {
    status: 'connected' as const,
    getNativeConfiguration: jest.fn(async () => ({ forms: [], observations: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: null })),
    readSessionConfiguration: jest.fn(async () => ({ sessionId: 'catalog', images: true, controls: [] })),
  };
  const saveSettings = jest.fn(async () => {});
  const host: DshNativeSettingsHost = { getSettings: () => settings, getAdapter: () => adapter as unknown as DshNativeSettingsPort, saveSettings };
  const workspace = new SettingsDshNativeWorkspace(host);
  const container = document.createElement('div'); document.body.append(container); workspace.render(container, 'model');
  return { settings, adapter, saveSettings, workspace, container };
}
const modelSelect = (f: ReturnType<typeof fixture>): HTMLSelectElement =>
  group(f.container, 'agent-default-model').querySelector<HTMLSelectElement>('select[aria-label="Default conversation model"]')!;
const catalog = (choices: Array<{ value: string; name: string }>, current?: string) => ({
  sessionId: 'catalog', images: true,
  controls: [{ id: 'model', name: 'Model', value: current ?? choices[0]?.value ?? '', choices }],
});

beforeEach(() => { setLocale('en'); controls(); });
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; setLocale('en'); });

describe('DSH native default model opaque tuple persistence', () => {
  it('persists decoded provider/model routes from opaque catalog selections and stays stable across reopen', async () => {
    const f = fixture();
    const known = JSON.stringify(['deepseek-official', 'deepseek-flash']);
    const slashed = JSON.stringify(['org/deepseek', 'deepseek-chat/v1']);
    f.adapter.readSessionConfiguration.mockResolvedValue(catalog([
      { value: known, name: 'deepseek-official: deepseek-flash' },
      { value: slashed, name: 'org/deepseek: deepseek-chat/v1' },
    ]) as never);
    click(f.container, 'refresh'); await settle();
    expect([...modelSelect(f).options].map(option => option.value)).toContain(known);
    change(modelSelect(f), known); await settle();
    expect(f.saveSettings).toHaveBeenCalledTimes(1);
    expect(f.settings.nativeConfig?.overrides['agent-default-model']).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' });
    change(modelSelect(f), slashed); await settle();
    expect(f.settings.nativeConfig?.overrides['agent-default-model']).toEqual({ provider: 'org/deepseek', model: 'deepseek-chat/v1' });
    f.workspace.render(f.container, 'model');
    expect(modelSelect(f).value).toBe(slashed);
    expect(f.container.textContent).not.toContain('(not in the loaded catalog)');
  });
  it('selects the saved route by opaque tuple identity and keeps reasoningEffort untouched', async () => {
    const known = JSON.stringify(['deepseek-official', 'deepseek-flash']);
    const f = fixture({ nativeConfig: { version: 1, overrides: { 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low' } } } });
    f.adapter.readSessionConfiguration.mockResolvedValue(catalog([
      { value: JSON.stringify(['other-provider', 'other-model']), name: 'other-provider: other-model' },
      { value: known, name: 'deepseek-official: deepseek-flash' },
    ]) as never);
    click(f.container, 'refresh'); await settle();
    expect(modelSelect(f).value).toBe(known);
    expect(f.container.textContent).not.toContain('(not in the loaded catalog)');
    expect(f.saveSettings).not.toHaveBeenCalled();
    expect(f.settings.nativeConfig?.overrides['agent-default-model']?.reasoningEffort).toBe('low');
  });
  it.each([
    ['truncated tuple', '["deepseek-official"'],
    ['wrong arity with slash in id', '["a","b","c/"]'],
    ['empty provider with slashed model', '["", "x/y"]'],
    ['empty model id', '["provider",""]'],
    ['object instead of tuple', '{"provider":"p","model":"m"}'],
    ['plain string value', '"deepseek-flash"'],
  ] as const)('never persists a malformed catalog model value (%s)', async (_kind, value) => {
    const f = fixture();
    f.adapter.readSessionConfiguration.mockResolvedValue(catalog([{ value, name: 'Broken catalog entry' }]) as never);
    click(f.container, 'refresh'); await settle();
    expect([...modelSelect(f).options].map(option => option.value)).toContain(value);
    change(modelSelect(f), value); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled();
    expect(f.settings.nativeConfig).toBeUndefined();
    // The select falls back to the persisted state instead of keeping the
    // unusable entry, and the draft stays free of malformed route parts.
    expect(modelSelect(f).value).toBe('');
    expect(group(f.container, 'agent-default-model').querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('{}');
  });
  it('keeps a saved unknown route visible and editable through the guided custom group', async () => {
    const known = JSON.stringify(['deepseek-official', 'deepseek-flash']);
    const f = fixture({ nativeConfig: { version: 1, overrides: { 'agent-default-model': { provider: 'legacy/p', model: 'legacy/m' } } } });
    f.adapter.readSessionConfiguration.mockResolvedValue(catalog([{ value: known, name: 'deepseek-official: deepseek-flash' }]) as never);
    click(f.container, 'refresh'); await settle();
    const select = modelSelect(f);
    const unknown = [...select.options].find(option => option.value && option.value !== '__custom__' && option.value !== known)!;
    expect(unknown).toBeDefined();
    expect(unknown.textContent).toContain('legacy/p/legacy/m');
    expect(unknown.textContent).toContain('(not in the loaded catalog)');
    change(select, unknown.value); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled();
    expect(f.settings.nativeConfig?.overrides['agent-default-model']).toEqual({ provider: 'legacy/p', model: 'legacy/m' });
    change(select, '__custom__');
    const custom = group(f.container, 'agent-default-model').querySelector<HTMLElement>('.opencodian-dsh-native-model-custom')!;
    expect(custom.hidden).toBe(false);
    expect(field(custom, 'provider').value).toBe('legacy/p');
    expect(field(custom, 'model').value).toBe('legacy/m');
    change(field(custom, 'provider'), 'edited/p'); await settle();
    click(group(f.container, 'agent-default-model'), 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides['agent-default-model']).toEqual({ provider: 'edited/p', model: 'legacy/m' });
  });
  it('inherit removes only the saved route and keeps reasoningEffort', async () => {
    const f = fixture({ nativeConfig: { version: 1, overrides: { 'agent-default-model': { provider: 'p', model: 'm', reasoningEffort: 'high' } } } });
    change(modelSelect(f), ''); await settle();
    expect(f.saveSettings).toHaveBeenCalledTimes(1);
    expect(f.settings.nativeConfig?.overrides['agent-default-model']).toEqual({ reasoningEffort: 'high' });
  });
});
