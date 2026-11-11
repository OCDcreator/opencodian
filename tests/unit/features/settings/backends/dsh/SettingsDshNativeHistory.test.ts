import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { Setting } from 'obsidian';

import { backendRecoveryIdentity, createBackendConfigRecoveryStore } from '../../../../../../src/core/agents/backend/configuration/BackendConfigRecoveryStore';
import type { DshBackendSettings } from '../../../../../../src/core/types/settings';
import { type DshNativeSettingsHost, type DshNativeSettingsTask,SettingsDshNativeWorkspace } from '../../../../../../src/features/settings/backends/dsh/SettingsDshNativeWorkspace';
import { setLocale, t, type TranslationKey } from '../../../../../../src/i18n';

const text = (key: string) => t(`settings.dsh.native.${key}` as TranslationKey);
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function button(container: Element, key: string): HTMLButtonElement {
  const result = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text(key));
  expect(result).toBeDefined(); return result!;
}
function change(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'change'): void {
  input.value = value; input.dispatchEvent(new Event(event, { bubbles: true }));
}
function group(container: Element, ns = 'tool-web'): HTMLElement { return container.querySelector(`[data-native-namespace="${ns}"]`)!; }
function scalar(container: Element, path: string): HTMLInputElement | HTMLSelectElement { return container.querySelector(`[data-native-path="${path}"] input, [data-native-path="${path}"] select`)!; }
function fixture(task: DshNativeSettingsTask = 'tools', overrides: Partial<DshBackendSettings> = {}) {
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native', nativeConfig: { version: 1, overrides: { 'tool-web': { search: false } } }, ...overrides };
  const root = join(process.cwd(), 'node_modules', '.cache', `dsh-history-preview-${randomUUID()}`);
  const saveSettings = jest.fn(async () => {});
  const reconnect = jest.fn(async () => {});
  const host: DshNativeSettingsHost = { getSettings: () => settings, getAdapter: () => ({ status: 'connected', reconnectNativeConfiguration: reconnect }), saveSettings, vaultPath: join(root, 'vault'), recoveryBaseDir: join(root, 'recovery') };
  const store = createBackendConfigRecoveryStore({ baseDir: host.recoveryBaseDir });
  const identity = backendRecoveryIdentity(host.vaultPath, 'dsh:native:tool-web')!;
  store.archive(identity, 'dsh-native-tool-web', JSON.stringify({ version: 1, overrides: { 'tool-web': { search: true } } }));
  const workspace = new SettingsDshNativeWorkspace(host);
  const container = document.createElement('div'); document.body.append(container); workspace.render(container, task);
  return { settings, store, identity, workspace, container, host, saveSettings, reconnect };
}
function preview(container: Element): HTMLElement {
  button(group(container), 'restore').click();
  const result = group(container).querySelector<HTMLElement>('[data-native-history-preview="1"]')!;
  return result;
}

beforeEach(() => {
  setLocale('en');
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, value: string) {
    this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' }); this.infoEl.createDiv({ cls: 'setting-item-name', text: value }); return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, value: string) { this.infoEl.createDiv({ cls: 'setting-item-description', text: value }); return this; });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback) {
    const el = this.controlEl.createEl('button');
    const api = { setButtonText: (value: string) => { el.textContent = value; return api; }, setDisabled: (value: boolean) => { el.disabled = value; return api; }, onClick: (fn: () => void) => { el.addEventListener('click', () => { void fn(); }); return api; } };
    callback(api as never); return this;
  });
});
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

describe('Native group history preview', () => {
  it('previews validated differences and cancel leaves settings draft history and runtime unchanged', async () => {
    const f = fixture(); const before = JSON.stringify(f.settings);
    const draft = group(f.container).querySelector<HTMLTextAreaElement>('textarea')!.value;
    const history = f.store.list(f.identity, 'dsh-native-tool-web');
    const view = preview(f.container);
    expect(view.textContent).toContain(text('history.previewTitle'));
    expect(view.textContent).toContain(`${text('history.currentValue')}: false`);
    expect(view.textContent).toContain(`${text('history.restoredValue')}: true`);
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(f.reconnect).not.toHaveBeenCalled();
    button(view, 'history.cancel').click(); await settle();
    expect(view.childElementCount).toBe(0);
    expect(JSON.stringify(f.settings)).toBe(before);
    expect(group(f.container).querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(draft);
    expect(f.store.list(f.identity, 'dsh-native-tool-web')).toEqual(history);
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('previews over an in-progress invalid guided draft and cancel preserves the unsaved edit', async () => {
    const f = fixture();
    change(scalar(group(f.container), 'searchMaxResults'), '0'); await settle();
    const view = preview(f.container);
    expect(view.textContent).toContain(text('history.previewTitle'));
    expect(view.textContent).toContain(text('history.draftWarning'));
    expect(f.container.textContent).not.toContain(text('history.previewInvalid'));
    expect(f.saveSettings).not.toHaveBeenCalled();
    button(view, 'history.cancel').click();
    expect(scalar(group(f.container), 'searchMaxResults').value).toBe('0');
    change(scalar(group(f.container), 'searchMaxResults'), '2');
    const revised = preview(f.container);
    expect(revised.textContent).toContain(text('history.draftWarning'));
    button(revised, 'history.cancel').click();
    expect(scalar(group(f.container), 'searchMaxResults').value).toBe('2');
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual({ search: false });
    expect(f.saveSettings).not.toHaveBeenCalled();
  });
  it('previews compaction history while a guided draft holds an in-progress invalid value', async () => {
    const f = fixture('context', { nativeConfig: { version: 1, overrides: { 'compaction-basic': { auto: false } } } });
    const compactionIdentity = backendRecoveryIdentity(f.host.vaultPath!, 'dsh:native:compaction-basic')!;
    f.store.archive(compactionIdentity, 'dsh-native-compaction-basic', JSON.stringify({ version: 1, overrides: { 'compaction-basic': { auto: true, thresholdRatio: 0.85 } } }));
    f.workspace.render(f.container, 'context');
    const compaction = () => group(f.container, 'compaction-basic');
    const history = f.store.list(compactionIdentity, 'dsh-native-compaction-basic');
    const before = JSON.stringify(f.settings.nativeConfig);
    // The audited 2358 state: an out-of-range guided edit is still in the draft
    // when history opens. The preview is read-only, so it must render with the
    // draft warning instead of refusing every entry.
    change(scalar(compaction(), 'thresholdRatio'), '2'); await settle();
    button(compaction(), 'restore').click();
    const view = compaction().querySelector<HTMLElement>('[data-native-history-preview="1"]')!;
    expect(view.textContent).toContain(text('history.previewTitle'));
    expect(view.textContent).toContain(text('history.draftWarning'));
    expect(view.textContent).toContain(`${text('history.restoredValue')}: 0.85`);
    expect(f.container.textContent).not.toContain(text('history.previewInvalid'));
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(f.reconnect).not.toHaveBeenCalled();
    expect(f.store.list(compactionIdentity, 'dsh-native-compaction-basic')).toEqual(history);
    expect(JSON.stringify(f.settings.nativeConfig)).toBe(before);
    // Cancel keeps the unsaved invalid edit untouched.
    button(view, 'history.cancel').click();
    expect(scalar(compaction(), 'thresholdRatio').value).toBe('2');
    // After the edit is resolved, the same entry applies the validated backup
    // value; the draft is replaced by the restored snapshot, never the draft.
    change(scalar(compaction(), 'thresholdRatio'), ''); await settle();
    button(compaction(), 'restore').click();
    const fresh = compaction().querySelector<HTMLElement>('[data-native-history-preview="1"]')!;
    button(fresh, 'history.apply').click(); await settle();
    expect(f.settings.nativeConfig?.overrides['compaction-basic']).toEqual({ auto: true, thresholdRatio: 0.85 });
    expect(scalar(compaction(), 'thresholdRatio').value).toBe('0.85');
    expect(f.saveSettings).toHaveBeenCalledTimes(1); expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('only explicit apply persists a restore and keeps runtime application separate', async () => {
    const f = fixture(); const view = preview(f.container);
    button(view, 'history.apply').click(); await settle();
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual({ search: true });
    expect(f.saveSettings).toHaveBeenCalledTimes(1); expect(f.reconnect).not.toHaveBeenCalled();
    expect(JSON.parse(f.store.read(f.identity, 'dsh-native-tool-web', 1)!.raw).overrides['tool-web']).toEqual({ search: false });
  });
  it('rejects saved-state drift after preview and disables applying the stale preview', async () => {
    const f = fixture(); const view = preview(f.container);
    f.settings.nativeConfig!.overrides['tool-web'] = { search: false, fetch: false };
    const apply = button(view, 'history.apply'); apply.click(); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(apply.disabled).toBe(true);
    expect(view.textContent).toContain(text('history.conflict'));
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual({ search: false, fetch: false });
  });
  it('rejects history rotation and guided-draft drift after preview', async () => {
    const f = fixture(); let view = preview(f.container);
    f.store.archive(f.identity, 'dsh-native-tool-web', JSON.stringify({ version: 1, overrides: { 'tool-web': { fetch: true } } }));
    button(view, 'history.apply').click(); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(view.textContent).toContain(text('history.conflict'));
    f.workspace.render(f.container, 'tools'); view = preview(f.container);
    // A previously dirtied valid guided draft changes without an auto-save.
    const raw = group(f.container).querySelector<HTMLTextAreaElement>('textarea')!;
    change(raw, '{"search":false}', 'input');
    button(view, 'history.apply').dispatchEvent(new Event('click', { bubbles: true })); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(raw.value).toBe('{"search":false}');
  });
  it('rechecks CAS inside the serialized final write after a queued save', async () => {
    const f = fixture(); const view = preview(f.container);
    let release!: () => void;
    f.saveSettings.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    // Tool policies moved: the file-tool group is the second group mounted on
    // the tools task alongside the previewed tool-web group.
    change(group(f.container, 'tool-fs').querySelector<HTMLTextAreaElement>('textarea')!, '{"readLimit":10}', 'input');
    const firstSave = f.workspace.saveGroup('tool-fs'); await settle();
    button(view, 'history.apply').click();
    f.settings.nativeConfig!.overrides['tool-web'] = { search: false, fetch: false };
    release(); await firstSave; await settle();
    expect(f.saveSettings).toHaveBeenCalledTimes(1);
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual({ search: false, fetch: false });
    expect(f.container.textContent).toContain(text('history.conflict'));
  });
  it('rejects a queued restore when its originating page is disposed before writing', async () => {
    const f = fixture(); const view = preview(f.container);
    let release!: () => void;
    f.saveSettings.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    change(group(f.container, 'tool-fs').querySelector<HTMLTextAreaElement>('textarea')!, '{"readLimit":10}', 'input');
    const firstSave = f.workspace.saveGroup('tool-fs'); await settle();
    button(view, 'history.apply').click(); f.workspace.dispose();
    release(); await firstSave; await settle();
    expect(f.saveSettings).toHaveBeenCalledTimes(1);
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual({ search: false });
    expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('cannot preview or apply over dirty raw JSON, including synthetic events', async () => {
    const f = fixture(); const restore = button(group(f.container), 'restore');
    const raw = group(f.container).querySelector<HTMLTextAreaElement>('textarea')!;
    change(raw, '{"search":', 'input');
    expect(restore.disabled).toBe(true); restore.dispatchEvent(new Event('click', { bubbles: true })); await settle();
    expect(group(f.container).querySelector('[data-native-history-preview]')!.childElementCount).toBe(0);
    expect(raw.value).toBe('{"search":'); expect(f.saveSettings).not.toHaveBeenCalled();
  });
  it('ignores old preview actions after cancel, tab changes and disposal', async () => {
    const f = fixture(); let view = preview(f.container); let apply = button(view, 'history.apply');
    button(view, 'history.cancel').click(); apply.click(); await settle(); expect(f.saveSettings).not.toHaveBeenCalled();
    view = preview(f.container); apply = button(view, 'history.apply');
    f.workspace.render(f.container, 'context'); apply.click(); await settle(); expect(f.saveSettings).not.toHaveBeenCalled();
    f.workspace.render(f.container, 'tools'); view = preview(f.container); apply = button(view, 'history.apply');
    f.workspace.dispose(); apply.click(); await settle(); expect(f.saveSettings).not.toHaveBeenCalled();
  });
  it('rejects invalid or secret-bearing archived values before rendering them', () => {
    const f = fixture();
    f.store.archive(f.identity, 'dsh-native-tool-web', JSON.stringify({ version: 1, overrides: { 'tool-web': { apiKey: 'fixture-secret-never-display' } } }));
    f.workspace.render(f.container, 'tools'); preview(f.container);
    expect(f.container.textContent).toContain(text('history.previewInvalid'));
    expect(f.container.textContent).not.toContain('fixture-secret-never-display');
    expect(f.container.querySelector('[data-native-history-preview="1"]')!.childElementCount).toBe(0);
    expect(f.saveSettings).not.toHaveBeenCalled();
  });
  it('rolls back persistence failure without changing the current guided draft', async () => {
    const f = fixture(); const view = preview(f.container);
    f.saveSettings.mockRejectedValueOnce(new Error('fixture-write-failure'));
    button(view, 'history.apply').click(); await settle();
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual({ search: false });
    expect(view.textContent).toContain(text('saveFailed'));
    button(view, 'history.cancel').click();
    expect(scalar(group(f.container), 'search').value).toBe('false');
    expect(f.store.list(f.identity, 'dsh-native-tool-web')).toHaveLength(1);
  });
});

describe('Native fresh-session Plan default', () => {
  it('persists inherit on and off separately without native overrides or reconnect', async () => {
    const f = fixture('permissions'); const nativeConfig = JSON.stringify(f.settings.nativeConfig);
    const select = f.container.querySelector<HTMLSelectElement>('[data-native-plan-default] select')!;
    expect(select.value).toBe('');
    change(select, 'true'); await settle(); expect(f.settings.defaultPlanMode).toBe(true);
    change(select, 'false'); await settle(); expect(f.settings.defaultPlanMode).toBe(false);
    change(select, ''); await settle(); expect(Object.prototype.hasOwnProperty.call(f.settings, 'defaultPlanMode')).toBe(false);
    expect(f.saveSettings).toHaveBeenCalledTimes(3); expect(f.reconnect).not.toHaveBeenCalled();
    expect(JSON.stringify(f.settings.nativeConfig)).toBe(nativeConfig);
    expect(f.container.textContent).toContain(text('planDefault.saved'));
  });
  it('rolls back a failed save and restores the selected value', async () => {
    const f = fixture('permissions', { defaultPlanMode: true });
    f.saveSettings.mockRejectedValueOnce(new Error('fixture-save-failure'));
    const select = f.container.querySelector<HTMLSelectElement>('[data-native-plan-default] select')!;
    change(select, 'false'); await settle();
    expect(f.settings.defaultPlanMode).toBe(true); expect(select.value).toBe('true'); expect(select.disabled).toBe(false);
    expect(f.container.textContent).toContain(text('planDefault.failed')); expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('keeps saved choice but disables Plan defaults in ACP including synthetic changes', async () => {
    const f = fixture('permissions', { transport: 'acp', defaultPlanMode: true });
    const select = f.container.querySelector<HTMLSelectElement>('[data-native-plan-default] select')!;
    expect(select.disabled).toBe(true); change(select, 'false'); await settle();
    expect(select.value).toBe('true'); expect(f.settings.defaultPlanMode).toBe(true); expect(f.saveSettings).not.toHaveBeenCalled();
    expect(f.container.textContent).toContain(text('planDefault.acp'));
  });
});
