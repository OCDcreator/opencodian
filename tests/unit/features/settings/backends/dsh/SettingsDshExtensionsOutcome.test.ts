import { Setting } from 'obsidian';

import { dshNativeControlCapabilities, type DshNativeControlUpdate, type DshNativeExtensionMutation } from '../../../../../../src/core/agents/backend/dsh/DshNativeControls';
import type { DshJsonObject } from '../../../../../../src/core/types/dshConfiguration';
import type { DshBackendSettings } from '../../../../../../src/core/types/settings';
import { SettingsDshExtensionsWorkspace } from '../../../../../../src/features/settings/backends/dsh/SettingsDshExtensionsWorkspace';
import type { DshNativeSettingsHost } from '../../../../../../src/features/settings/backends/dsh/SettingsDshNativeWorkspace';
import { setLocale, t, type TranslationKey } from '../../../../../../src/i18n';

const text = (key: string) => t(`settings.dsh.native.${key}` as TranslationKey);
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function controls(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    this.settingEl.dataset.name = name; return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback) {
    const el = this.controlEl.createEl('button');
    const api = { setButtonText: (value: string) => { el.textContent = value; return api; }, setDisabled: (value: boolean) => { el.disabled = value; return api; }, onClick: (fn: () => void) => { el.addEventListener('click', () => { void fn(); }); return api; } };
    callback(api as never); return this;
  });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function (this: Setting, callback) {
    const el = this.controlEl.createEl('input', { type: 'checkbox' });
    const api = { setValue: (value: boolean) => { el.checked = value; return api; }, setDisabled: (value: boolean) => { el.disabled = value; return api; }, onChange: (fn: (value: boolean) => void) => { el.addEventListener('change', () => { void fn(el.checked); }); return api; } };
    callback(api as never); return this;
  });
  for (const method of ['addText', 'addTextArea'] as const) jest.spyOn(Setting.prototype, method).mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl(method === 'addText' ? 'input' : 'textarea');
    const api = { inputEl, setValue: (value: string) => { inputEl.value = value; return api; }, setPlaceholder: (value: string) => { inputEl.placeholder = value; return api; }, onChange: (fn: (value: string) => void) => { inputEl.addEventListener('input', () => fn(inputEl.value)); return api; } };
    callback(api as never); return this;
  });
}
function click(container: Element, key: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === text(key));
  expect(button).toBeDefined(); expect(button!.disabled).toBe(false); button!.click();
}
function toggle(container: Element, name: string): HTMLInputElement {
  return [...container.querySelectorAll<HTMLElement>('.setting-item')].find(row => row.dataset.name === name)!.querySelector('input[type=checkbox]')!;
}
function change(input: HTMLInputElement, checked: boolean): void { input.checked = checked; input.dispatchEvent(new Event('change')); }
function nativeChange(application: string, overrides: DshJsonObject = {}): DshJsonObject {
  return { application, changed: true, stage: 'enable', target: 'example', ...overrides };
}
function fixture() {
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', profile: 'acp', transport: 'native', args: [], env: {} };
  const capabilities = dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1', configurationCapabilities: { extensions: {
    list: true, enablePlugin: true, enableBundle: true, update: true, remove: true, install: true, cancel: true, managedProfile: true,
  } } }, true);
  let listener!: (event: DshNativeControlUpdate) => void;
  const subscription = { dispose: jest.fn() };
  const catalog: DshJsonObject = { managed: true, plugins: [{ entryId: 'plugin-example', moduleName: 'example', enabled: true }], bundles: [{ name: 'example-bundle', version: '1.0.0', enabled: true }] };
  const adapter = {
    status: 'connected' as const,
    getNativeControlCapabilities: jest.fn(async () => capabilities),
    listNativeExtensions: jest.fn(async () => catalog),
    mutateNativeExtension: jest.fn(async (input: DshNativeExtensionMutation): Promise<DshJsonObject> => ({ operationId: input.operationId!, result: nativeChange('applied') })),
    subscribeToNativeControlUpdates: jest.fn((callback: typeof listener) => { listener = callback; return subscription; }),
  };
  const host: DshNativeSettingsHost = { getSettings: () => settings, getAdapter: () => adapter, saveSettings: jest.fn(async () => {}) };
  const workspace = new SettingsDshExtensionsWorkspace(host);
  const container = document.createElement('div'); document.body.append(container); workspace.render(container);
  return { adapter, catalog, host, workspace, container, subscription, emit: (event: DshNativeControlUpdate) => listener(event) };
}
async function ready() { const f = fixture(); click(f.container, 'refresh'); await settle(); return f; }
function authorize(container: Element): void { change(toggle(container, text('extensions.acceptRisk')), true); }
function feedback(container: Element): string { return container.querySelector('[role=status]')!.textContent!; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function startUpdate(container: Element): void {
  authorize(container);
  container.querySelector<HTMLInputElement>('input[aria-label="Target version for example-bundle"]')!.value = '2.0.0';
  click(container, 'extensions.update');
}
function nativeUpdate(result: DshJsonObject, restore?: DshJsonObject): DshJsonObject {
  return { from: '1.0.0', to: '2.0.0', step: 'install', result, ...restore === undefined ? {} : { restore } };
}
function progress(operationId: string): DshNativeControlUpdate {
  return { kind: 'extension', update: { operationId, action: 'update', event: 'output', detail: { output: 'private-native-output' } } };
}

beforeEach(() => { setLocale('en'); controls(); });
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

it('does not report completion when a resolved native toggle failed', async () => {
  const f = await ready();
  f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result: nativeChange('failed') }));
  authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
  expect(feedback(f.container)).not.toBe(text('extensions.completed'));
  expect(feedback(f.container)).toBe(text('extensions.result.failed'));
  expect(toggle(f.container, 'example').checked).toBe(true);
  expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(2);
});

describe.each(['example', 'example-bundle'])('%s enablement outcomes', name => {
  it.each([
    { application: 'applied', changed: true, message: 'applied', accepted: true, enabled: false },
    { application: 'applied', changed: false, message: 'unchanged', accepted: true, enabled: false },
    { application: 'restart-required', changed: true, message: 'restartRequired', accepted: true, enabled: true },
    { application: 'overridden', changed: true, message: 'overridden', accepted: false, enabled: true },
    { application: 'failed', changed: false, message: 'failed', accepted: false, enabled: true },
    { application: 'cancelled', changed: false, message: 'cancelled', accepted: false, enabled: true },
  ])('reports $message and displays authoritative enablement', async outcome => {
    const f = await ready();
    const originalToggle = toggle(f.container, name);
    const pending = deferred<DshJsonObject>();
    f.adapter.mutateNativeExtension.mockReturnValueOnce(pending.promise);
    authorize(f.container); change(originalToggle, false);
    const id = f.adapter.mutateNativeExtension.mock.calls[0][0].operationId!;
    expect(toggle(f.container, text('extensions.acceptRisk')).checked).toBe(false);
    expect(toggle(f.container, name).disabled).toBe(true);
    f.adapter.listNativeExtensions.mockResolvedValueOnce({ managed: true,
      plugins: [{ entryId: 'plugin-example', moduleName: 'example', enabled: outcome.enabled }],
      bundles: [{ name: 'example-bundle', version: '1.0.0', enabled: outcome.enabled }] });
    pending.resolve({ operationId: id, result: nativeChange(outcome.application, { changed: outcome.changed }) }); await settle();
    expect(feedback(f.container)).toBe(text(`extensions.result.${outcome.message}`));
    expect(originalToggle.checked).toBe(!outcome.accepted);
    expect(toggle(f.container, name).checked).toBe(outcome.enabled);
    expect(toggle(f.container, name).disabled).toBe(false);
    expect(toggle(f.container, text('extensions.acceptRisk')).checked).toBe(false);
    expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(2);
  });
});

describe('native update outcomes', () => {
  it.each([
    ['applied', 'applied'], ['restart-required', 'restartRequired'], ['overridden', 'overridden'],
  ])('unwraps the target installation result: %s', async (application, message) => {
    const f = await ready();
    f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result: nativeUpdate(nativeChange(application)) }));
    startUpdate(f.container); await settle();
    expect(feedback(f.container)).toBe(text(`extensions.result.${message}`));
    expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(2);
  });
  describe.each(['failed', 'cancelled'])('%s target installation', application => {
    it.each([
      { restore: nativeChange('applied'), suffix: 'Restored' },
      { restore: nativeChange('restart-required'), suffix: 'RestoreRestartRequired' },
      { restore: nativeChange('failed'), suffix: 'RestoreUnconfirmed' },
      { restore: nativeChange('cancelled'), suffix: 'RestoreUnconfirmed' },
      { restore: nativeChange('overridden'), suffix: 'RestoreUnconfirmed' },
      { restore: nativeChange('future-result'), suffix: 'RestoreUnconfirmed' },
      { restore: {}, suffix: 'RestoreUnconfirmed' },
      { restore: undefined, suffix: 'RestoreUnconfirmed' },
    ])('reports restoration as $suffix', async ({ restore, suffix }) => {
      const f = await ready();
      f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result: nativeUpdate(nativeChange(application), restore) }));
      startUpdate(f.container); await settle();
      const prefix = application === 'failed' ? 'updateFailed' : 'updateCancelled';
      expect(feedback(f.container)).toBe(text(`extensions.result.${prefix}${suffix}`));
      expect(feedback(f.container)).not.toBe(text('extensions.completed'));
      expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(2);
      expect(toggle(f.container, 'example-bundle').disabled).toBe(false);
    });
  });
  it.each([
    ['check', 'failed', 'failed'], ['remove', 'failed', 'failed'], ['check', 'cancelled', 'cancelled'],
    ['check', 'applied', 'unknown'], ['remove', 'applied', 'unknown'], ['remove', 'restart-required', 'unknown'],
  ])('does not claim an update from the %s step returning %s', async (step, application, message) => {
    const f = await ready();
    f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result: { ...nativeUpdate(nativeChange(application)), step } }));
    startUpdate(f.container); await settle();
    expect(feedback(f.container)).toBe(text(`extensions.result.${message}`));
  });
  it.each([
    nativeChange('applied'),
    { result: nativeChange('applied') },
    { ...nativeUpdate(nativeChange('applied')), step: 'other' },
    { ...nativeUpdate(nativeChange('applied')), from: false },
    nativeUpdate({ application: 'applied' }),
    nativeUpdate(nativeChange('applied'), nativeChange('applied')),
  ])('does not accept malformed or contradictory update envelopes', async result => {
    const f = await ready();
    f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result }));
    startUpdate(f.container); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.unknown'));
  });
});

describe('unconfirmed responses and private diagnostics', () => {
  it.each([
    null, [], {}, { application: 'applied' }, nativeChange('future-application'),
    nativeChange('applied', { changed: 'true' }), nativeChange('applied', { target: null }),
    nativeChange('applied', { target: '' }), nativeChange('applied', { stage: 'unknown' }),
    { result: nativeChange('applied') },
  ])('never treats malformed results as completion', async result => {
    const f = await ready();
    f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result }));
    authorize(f.container); const original = toggle(f.container, 'example'); change(original, false); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.unknown'));
    expect(original.checked).toBe(true);
    expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(2);
  });
  it.each([{}, nativeChange('applied'), { operationId: 'other', result: nativeChange('applied') }])('requires the matching service envelope', async response => {
    const f = await ready();
    f.adapter.mutateNativeExtension.mockResolvedValueOnce(response);
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.unknown'));
  });
  it('withholds native errors, paths, build metadata and restore diagnostics', async () => {
    const f = await ready();
    const secret = 'fixture-private-diagnostic';
    const metadata = { target: secret, error: { code: secret, message: secret }, pendingBuilds: [secret], warnings: [secret],
      restartReason: secret, registries: [secret], packageResult: { output: secret, logPath: secret, exitCode: 1 } };
    f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result: {
      ...nativeUpdate(nativeChange('failed', metadata), nativeChange('failed', metadata)), from: secret, to: secret,
    } }));
    startUpdate(f.container); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.updateFailedRestoreUnconfirmed'));
    expect(f.container.textContent).not.toContain(secret);
  });
  it('reloads after a rejected RPC without exposing its error or claiming no change', async () => {
    const f = await ready();
    f.adapter.mutateNativeExtension.mockRejectedValueOnce(new Error('private-native-error'));
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.unconfirmed'));
    expect(f.container.textContent).not.toContain('private-native-error');
    expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(2);
    expect(toggle(f.container, 'example').disabled).toBe(false);
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenCalledTimes(2);
  });
  it('keeps readback failure distinct from the native result and permits refresh retry', async () => {
    const f = await ready();
    f.adapter.listNativeExtensions.mockRejectedValueOnce(new Error('private-catalog-error'));
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    expect(feedback(f.container)).toBe(`${text('extensions.result.applied')} ${text('extensions.result.catalogUnconfirmed')}`);
    expect(f.container.textContent).not.toContain('private-catalog-error');
    expect(toggle(f.container, 'example').disabled).toBe(true);
    click(f.container, 'refresh'); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.applied'));
    expect(toggle(f.container, 'example').disabled).toBe(false);
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenCalledTimes(2);
  });
});

describe('operation settlement and view lifetimes', () => {
  it('ignores queued progress during authoritative reload and after final feedback', async () => {
    const f = await ready();
    const readback = deferred<DshJsonObject>();
    f.adapter.listNativeExtensions.mockReturnValueOnce(readback.promise);
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    const id = f.adapter.mutateNativeExtension.mock.calls[0][0].operationId!;
    const waiting = feedback(f.container);
    f.emit(progress(id));
    expect(feedback(f.container)).toBe(waiting);
    expect(toggle(f.container, 'example').disabled).toBe(true);
    readback.resolve(f.catalog); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.applied'));
    f.emit(progress(id));
    f.emit({ kind: 'extension', update: { operationId: id, action: 'enable-plugin', event: 'settled', detail: {} } });
    expect(feedback(f.container)).toBe(text('extensions.result.applied'));
    expect(f.container.textContent).not.toContain('private-native-output');
  });
  it('does not let a late cancellation acknowledgement overwrite the real update outcome', async () => {
    const f = await ready();
    const mutation = deferred<DshJsonObject>(); const cancellation = deferred<DshJsonObject>();
    f.adapter.mutateNativeExtension.mockImplementation(input => input.action === 'cancel' ? cancellation.promise : mutation.promise);
    startUpdate(f.container);
    const id = f.adapter.mutateNativeExtension.mock.calls[0][0].operationId!;
    click(f.container, 'extensions.cancel');
    mutation.resolve({ operationId: id, result: nativeUpdate(nativeChange('cancelled'), nativeChange('applied')) }); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.updateCancelledRestored'));
    cancellation.resolve({ operationId: id, status: 'cancelled' }); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.updateCancelledRestored'));
    expect(toggle(f.container, 'example-bundle').disabled).toBe(false);
  });
  it.each(['too-late', 'not-running', 'unknown'])('does not claim cancellation for %s', async status => {
    const f = await ready(); const mutation = deferred<DshJsonObject>();
    f.adapter.mutateNativeExtension.mockImplementation(input => input.action === 'cancel'
      ? Promise.resolve({ operationId: input.operationId, status }) : mutation.promise);
    startUpdate(f.container); click(f.container, 'extensions.cancel'); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.cancelUnconfirmed'));
    const id = f.adapter.mutateNativeExtension.mock.calls[0][0].operationId!;
    mutation.resolve({ operationId: id, result: nativeUpdate(nativeChange('applied')) }); await settle();
    expect(feedback(f.container)).toBe(text('extensions.result.applied'));
  });
  it.each(['rpc', 'readback'])('fences disposed DOM while %s is pending and releases the shared operation', async phase => {
    const f = await ready(); const pending = deferred<DshJsonObject>();
    if (phase === 'rpc') f.adapter.mutateNativeExtension.mockReturnValueOnce(pending.promise);
    else f.adapter.listNativeExtensions.mockReturnValueOnce(pending.promise);
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    const id = f.adapter.mutateNativeExtension.mock.calls[0][0].operationId!;
    f.workspace.dispose(); const frozen = f.container.innerHTML;
    f.emit(progress(id)); pending.resolve(phase === 'rpc' ? { operationId: id, result: nativeChange('failed') } : f.catalog); await settle();
    expect(f.container.innerHTML).toBe(frozen);
    expect(f.subscription.dispose).toHaveBeenCalledTimes(1);
    const reopened = new SettingsDshExtensionsWorkspace(f.host);
    const container = document.createElement('div'); reopened.render(container); click(container, 'refresh'); await settle();
    expect(toggle(container, 'example').disabled).toBe(false);
    authorize(container); change(toggle(container, 'example'), false); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenCalledTimes(2);
    reopened.dispose();
  });
  it.each(['rpc', 'readback'])('lets the new generation reload after remount during %s', async phase => {
    const f = await ready(); const pending = deferred<DshJsonObject>();
    if (phase === 'rpc') f.adapter.mutateNativeExtension.mockReturnValueOnce(pending.promise);
    else f.adapter.listNativeExtensions.mockReturnValueOnce(pending.promise);
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    const id = f.adapter.mutateNativeExtension.mock.calls[0][0].operationId!;
    const oldListener = f.adapter.subscribeToNativeControlUpdates.mock.calls[0][0];
    const current = document.createElement('div'); document.body.append(current); f.workspace.render(current);
    const frozen = f.container.innerHTML;
    expect(toggle(current, 'example').disabled).toBe(true);
    oldListener(progress(id));
    pending.resolve(phase === 'rpc' ? { operationId: id, result: nativeChange('applied') } : f.catalog); await settle();
    expect(f.container.innerHTML).toBe(frozen);
    expect(feedback(current)).toBe(text('extensions.result.applied'));
    expect(toggle(current, 'example').disabled).toBe(false);
    expect(f.adapter.listNativeExtensions).toHaveBeenCalledTimes(phase === 'rpc' ? 2 : 3);
    authorize(current); change(toggle(current, 'example'), false); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenCalledTimes(2);
  });
  it('ignores a pre-mutation catalog response that arrives after final readback', async () => {
    const f = await ready(); const oldCatalog = deferred<DshJsonObject>();
    f.adapter.listNativeExtensions.mockReturnValueOnce(oldCatalog.promise);
    click(f.container, 'refresh');
    f.adapter.listNativeExtensions.mockResolvedValueOnce({ ...f.catalog, plugins: [{ entryId: 'plugin-example', moduleName: 'example', enabled: false }] });
    authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
    expect(toggle(f.container, 'example').checked).toBe(false);
    oldCatalog.resolve(f.catalog); await settle();
    expect(toggle(f.container, 'example').checked).toBe(false);
    expect(feedback(f.container)).toBe(text('extensions.result.applied'));
  });
});

describe('catalog runtime state display', () => {
  const state = (suffix: string): string => text(`extensions.catalogState.${suffix}`);
  function descriptions(container: Element): string[] {
    return [...container.querySelectorAll<HTMLElement>('.opencodian-dsh-extension-list .setting-item-description')].map(el => el.textContent ?? '');
  }
  function joined(f: ReturnType<typeof fixture>): string { return descriptions(f.container).join(' | '); }
  function catalogWith(plugins: DshJsonObject[], bundles: DshJsonObject[] = []): DshJsonObject {
    return { managed: true, plugins, bundles };
  }
  async function reloadWith(f: ReturnType<typeof fixture>, catalog: DshJsonObject): Promise<void> {
    f.adapter.listNativeExtensions.mockResolvedValueOnce(catalog);
    click(f.container, 'refresh'); await settle();
  }
  beforeEach(() => {
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, value: string) {
      this.settingEl.createDiv({ cls: 'setting-item-description', text: value }); return this;
    });
  });

  it.each([
    ['pending', 'pending'], ['loading', 'loading'], ['active', 'active'], ['failed', 'failed'], ['unloading', 'unloading'],
  ])('reports plugin selection and fiber phase %s as separate localized parts', async (fiberPhase, suffix) => {
    const f = await ready();
    await reloadWith(f, catalogWith([{ entryId: 'plugin-example', moduleName: 'example', enabled: true, fiberPhase }]));
    expect(joined(f)).toBe(`${text('extensions.enabled')} · ${state(suffix)}`);
    expect(toggle(f.container, 'example').disabled).toBe(false);
  });

  it.each([
    [null, 'notLoaded'], ['hatched', 'unknown'],
  ])('does not infer a running plugin from enabled alone (fiberPhase %s)', async (fiberPhase, suffix) => {
    const f = await ready();
    await reloadWith(f, catalogWith([{ entryId: 'plugin-example', moduleName: 'example', enabled: true, fiberPhase }]));
    expect(joined(f)).toBe(`${text('extensions.enabled')} · ${state(suffix)}`);
    expect(joined(f)).not.toContain(state('active'));
  });

  it('reports an absent fiber phase explicitly and masks a raw failed diagnostic', async () => {
    const f = await ready();
    const diagnostic = 'private-stack-at-/secret/path';
    await reloadWith(f, catalogWith([{ entryId: 'plugin-example', moduleName: 'example', enabled: true, diagnostic }]));
    expect(joined(f)).toBe(`${text('extensions.enabled')} · ${state('unknown')}`);
    expect(f.container.textContent).not.toContain(diagnostic);
  });

  it.each([
    ['installation', 'installation'], ['profile', 'profile'], ['missing', 'missing'],
  ])('reports bundle availability %s separately from profile selection', async (availability, suffix) => {
    const f = await ready();
    await reloadWith(f, catalogWith([], [{ name: 'example-bundle', version: '1.0.0', enabled: false, availability }]));
    expect(descriptions(f.container)).toEqual([`1.0.0 · ${text('extensions.disabled')} · ${state(suffix)}`]);
  });

  it('reports absent bundle availability as unknown and a bundle error as a generic masked state', async () => {
    const f = await ready();
    const diagnostic = 'private-bundle-diagnostic';
    await reloadWith(f, catalogWith([], [{ name: 'example-bundle', version: '1.0.0', enabled: true, error: { code: 'operation-error', diagnostic } }]));
    expect(descriptions(f.container)).toEqual([`1.0.0 · ${text('extensions.enabled')} · ${state('availabilityUnknown')} · ${state('bundleError')}`]);
    expect(f.container.textContent).not.toContain(diagnostic);
    expect(f.container.textContent).not.toContain('operation-error');
  });

  it('shows plugin protection alongside selection and fiber phase', async () => {
    const f = await ready();
    await reloadWith(f, catalogWith([{ entryId: 'plugin-example', moduleName: 'example', enabled: true, fiberPhase: 'active', readOnlyReason: 'management-required' }]));
    expect(joined(f)).toBe(`${text('extensions.enabled')} · ${state('active')} · ${text('extensions.protected')}`);
    expect(toggle(f.container, 'example').disabled).toBe(true);
  });

  it('shows bundle protection alongside selection and availability', async () => {
    const f = await ready();
    await reloadWith(f, catalogWith([], [{ name: 'example-bundle', version: '1.0.0', enabled: true, availability: 'profile', readOnlyReason: 'unaddressable' }]));
    expect(descriptions(f.container)).toEqual([`1.0.0 · ${text('extensions.enabled')} · ${state('profile')} · ${text('extensions.protected')}`]);
    expect(toggle(f.container, 'example-bundle').disabled).toBe(true);
  });
});

it.each(['en', 'zh'] as const)('renders localized outcome copy in %s', async locale => {
  setLocale(locale);
  const f = await ready();
  f.adapter.mutateNativeExtension.mockImplementationOnce(async input => ({ operationId: input.operationId!, result: nativeChange('restart-required') }));
  authorize(f.container); change(toggle(f.container, 'example'), false); await settle();
  expect(feedback(f.container)).toBe(text('extensions.result.restartRequired'));
  expect(feedback(f.container)).not.toContain('settings.dsh.native.');
  setLocale('en');
});
