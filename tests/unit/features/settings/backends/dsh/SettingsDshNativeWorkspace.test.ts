import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Setting } from 'obsidian';

import { backendRecoveryIdentity, createBackendConfigRecoveryStore } from '../../../../../../src/core/agents/backend/configuration/BackendConfigRecoveryStore';
import { DSH_NATIVE_CONFIGURATION_FIELDS, DSH_NATIVE_CONFIGURATION_GROUPS, dshNativeConfigurationRevision } from '../../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';
import { dshNativeControlCapabilities } from '../../../../../../src/core/agents/backend/dsh/DshNativeControls';
import type { DshJsonObject, DshJsonValue, DshNativeConfigurationFieldDescriptor } from '../../../../../../src/core/types/dshConfiguration';
import type { DshBackendSettings } from '../../../../../../src/core/types/settings';
import { SettingsDshNativeFields } from '../../../../../../src/features/settings/backends/dsh/SettingsDshNativeFields';
import { type DshNativeSettingsHost, type DshNativeSettingsPort, type DshNativeSettingsTask,SettingsDshNativeWorkspace } from '../../../../../../src/features/settings/backends/dsh/SettingsDshNativeWorkspace';
import { setLocale, t, type TranslationKey } from '../../../../../../src/i18n';

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
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function (this: Setting, callback) {
    const el = this.controlEl.createEl('input', { type: 'checkbox' });
    const api = { setValue: (value: boolean) => { el.checked = value; return api; }, setDisabled: (value: boolean) => { el.disabled = value; return api; }, onChange: (fn: (value: boolean) => void) => { el.addEventListener('change', () => fn(el.checked)); return api; } };
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
  expect(button).toBeDefined(); button!.click();
}
function group(container: Element, ns: string): HTMLElement { return container.querySelector(`[data-native-namespace="${ns}"]`)!; }
function field(container: Element, path: string): HTMLInputElement | HTMLSelectElement {
  return container.querySelector(`[data-native-path="${path}"] input, [data-native-path="${path}"] select`)!;
}
function change(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'change'): void {
  expect(input).not.toBeNull(); input.value = value; input.dispatchEvent(new Event(event, { bubbles: true }));
}
function fixture(task: DshNativeSettingsTask = 'tools', overrides: Partial<DshBackendSettings> = {}) {
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', profile: 'acp', transport: 'native', args: [], env: {}, ...overrides };
  const flags = dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1', configurationCapabilities: {
    describe: true, credentials: { describe: true, set: true, unset: true }, extensionSettings: { mutate: true }, extensions: { list: true, inspect: true, versions: true, enablePlugin: true, enableBundle: true, install: true, update: true, remove: true, cancel: true, exempt: true, managedProfile: true },
  } }, true);
  const adapter = {
    status: 'connected' as const,
    getNativeControlCapabilities: jest.fn(() => flags),
    getNativeConfiguration: jest.fn(async () => ({ forms: [], observations: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: null })),
    // Real public value shape: Native and ACP both encode model routes as the
    // opaque JSON tuple JSON.stringify([providerId, modelId]) (DshAdapter
    // readSessionConfiguration forwards it verbatim).
    readSessionConfiguration: jest.fn(async () => ({ sessionId: 'catalog', images: true, controls: [{ id: 'model', name: 'Model', value: JSON.stringify(['deepseek-official', 'deepseek-flash']), choices: [{ value: JSON.stringify(['deepseek-official', 'deepseek-flash']), name: 'deepseek-official: deepseek-flash' }] }] })),
    reconnectNativeConfiguration: jest.fn(async () => {}),
    getNativeCredentialDescriptors: jest.fn(async (refs: string[]) => ({ credentials: refs.map(ref => ({ ref, configured: false, writable: true })) })),
    setNativeCredential: jest.fn(async (ref: string) => ({ credentials: [{ ref, configured: true, writable: true }] })),
    unsetNativeCredential: jest.fn(async (ref: string) => ({ credentials: [{ ref, configured: false, writable: true }] })),
    listNativeExtensions: jest.fn(async () => ({ managed: true, plugins: [{ entryId: 'plugin-example', moduleName: 'example', enabled: true }], bundles: [{ name: 'example-bundle', version: '1.0.0', enabled: true, removable: true, updatable: true }] })),
    inspectNativeExtension: jest.fn(async () => ({ inspection: { name: 'example-bundle', version: '1.0.0' } })),
    getNativeExtensionVersions: jest.fn(async () => ({ versions: ['1.0.0', '2.0.0'] })),
    mutateNativeExtension: jest.fn(async () => ({ operationId: 'fixture', result: {} })),
    mutateNativeExtensionSettings: jest.fn(async () => ({ form: { revision: 2 }, persistence: { source: 'managed-profile', status: 'verified' }, application: { status: 'verified' }, readback: { status: 'verified' } })),
    subscribeToNativeControlUpdates: jest.fn(() => ({ dispose: jest.fn() })),
  };
  const saveSettings = jest.fn(async () => {});
  const navigateTask = jest.fn();
  const base = join(process.cwd(), 'node_modules', '.cache', `dsh-native-ui-${randomUUID()}`);
  const host: DshNativeSettingsHost = { getSettings: () => settings, getAdapter: () => adapter as unknown as DshNativeSettingsPort,
    saveSettings, vaultPath: join(base, 'vault'), recoveryBaseDir: join(base, 'recovery'), navigateTask };
  const workspace = new SettingsDshNativeWorkspace(host);
  const container = document.createElement('div'); document.body.append(container); workspace.render(container, task);
  return { settings, adapter, flags, host, saveSettings, workspace, container, navigateTask };
}

/** Populate public structures so their real guided fields all render for copy coverage. */
function sampleFields(fields: readonly DshNativeConfigurationFieldDescriptor[], path = ''): DshJsonObject {
  const prefix = path ? `${path}.` : '';
  const children = fields.filter(field => field.path.startsWith(prefix) && !field.path.slice(prefix.length).includes('.') && !field.path.slice(prefix.length).includes('[]'));
  return Object.fromEntries(children.map(field => [field.path.slice(prefix.length), sampleField(field, fields)]));
}
function sampleField(field: DshNativeConfigurationFieldDescriptor, fields: readonly DshNativeConfigurationFieldDescriptor[]): DshJsonValue {
  if (field.type === 'array') {
    const item = fields.find(candidate => candidate.path === `${field.path}[]`)!;
    return [sampleField(item, fields)];
  }
  if (field.type === 'record') {
    const item = fields.find(candidate => candidate.path === `${field.path}.*`)!;
    return { fixture: sampleField(item, fields) };
  }
  if (field.type === 'object') return sampleFields(fields, field.path);
  if (field.type === 'union') {
    const alternative = field.alternatives?.find(candidate => candidate.type === 'object' || candidate.type === 'record') ?? field.alternatives?.[0];
    return alternative ? sampleField(alternative, fields) : null;
  }
  if (field.literalValue !== undefined) return field.literalValue;
  if (field.type === 'boolean') return true;
  if (field.type === 'number') return field.minimum ?? 1;
  if (field.type === 'null') return null;
  return field.enumValues?.[0] ?? 'fixture';
}

beforeEach(() => { setLocale('en'); controls(); });
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; setLocale('en'); });

describe('DSH native configuration persistence and evidence', () => {
  it('auto-saves a sparse scalar override and resets to omitted inheritance', async () => {
    const f = fixture();
    change(field(group(f.container, 'tool-web'), 'search'), 'false'); await settle();
    expect(f.settings.nativeConfig).toEqual({ version: 1, overrides: { 'tool-web': { search: false } } });
    expect(f.saveSettings).toHaveBeenCalledTimes(1);
    change(field(group(f.container, 'tool-web'), 'search'), ''); await settle();
    expect(f.settings.nativeConfig).toEqual({ version: 1, overrides: {} });
  });
  it('rolls back failed persistence and retains draft for retry', async () => {
    const f = fixture(); f.saveSettings.mockRejectedValueOnce(new Error('fixture-save-failed'));
    change(field(group(f.container, 'tool-web'), 'search'), 'false'); await settle();
    expect(f.settings.nativeConfig).toBeUndefined();
    expect(f.container.textContent).toContain(text('saveFailed'));
    click(group(f.container, 'tool-web'), 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides['tool-web']?.search).toBe(false);
  });
  it('rejects a stale group draft without overwriting other settings', async () => {
    const f = fixture();
    const raw = group(f.container, 'tool-web').querySelector('textarea')!;
    change(raw, '{"search":false}', 'input');
    f.settings.nativeConfig = { version: 1, overrides: { 'tool-web': { search: true }, jobs: { retainBytes: 10 } } };
    click(group(f.container, 'tool-web'), 'saveGroup'); await settle();
    expect(f.settings.nativeConfig.overrides['tool-web']?.search).toBe(true);
    expect(f.saveSettings).not.toHaveBeenCalled();
    expect(f.container.textContent).toContain(text('conflict'));
  });
  it('keeps unrelated group drafts through tab switches and merges another saved group', async () => {
    const f = fixture();
    change(group(f.container, 'tool-web').querySelector('textarea')!, '{"search":false}', 'input');
    // Todo policy moved to the advanced task; the draft must survive reaching it.
    f.workspace.render(f.container, 'advanced');
    change(field(group(f.container, 'tool-todo'), 'allowParallelInProgress'), 'true'); await settle();
    f.workspace.render(f.container, 'context'); f.workspace.render(f.container, 'tools');
    expect(group(f.container, 'tool-web').querySelector('textarea')!.value).toBe('{"search":false}');
    click(group(f.container, 'tool-web'), 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides).toEqual({ 'tool-todo': { allowParallelInProgress: true }, 'tool-web': { search: false } });
  });
  it.each([
    ['valid', '{"search":true,"fetch":false}', true],
    ['invalid', '{"search":', false],
  ] as const)('preserves %s JSON against guided edits, reset and restore through remount', async (_kind, rawDraft, valid) => {
    const f = fixture('tools', { nativeConfig: { version: 1, overrides: { 'tool-web': { search: true } } } });
    change(field(group(f.container, 'tool-web'), 'search'), 'false'); await settle();
    const currentGroup = () => group(f.container, 'tool-web');
    const staleGuided = field(currentGroup(), 'search');
    const raw = currentGroup().querySelector<HTMLTextAreaElement>('textarea')!;
    change(raw, rawDraft, 'input');
    expect(staleGuided.disabled).toBe(true);
    expect(currentGroup().textContent).toContain(text('raw.locked'));
    for (const key of ['resetGroup', 'restore']) {
      const button = [...currentGroup().querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === text(key))!;
      expect(button.disabled).toBe(true);
      button.dispatchEvent(new Event('click', { bubbles: true }));
    }
    // Enhanced dropdowns or stale handlers can dispatch even while disabled.
    // Capturing guards must protect both the raw text and persisted state.
    change(staleGuided, 'true'); await settle();
    expect(raw.value).toBe(rawDraft);
    expect(f.saveSettings).toHaveBeenCalledTimes(1);
    expect(f.settings.nativeConfig?.overrides['tool-web']?.search).toBe(false);
    f.workspace.render(f.container, 'context'); f.workspace.render(f.container, 'tools');
    expect(currentGroup().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(rawDraft);
    expect(field(currentGroup(), 'search').disabled).toBe(true);
    f.workspace.dispose();
    const reopened = new SettingsDshNativeWorkspace(f.host);
    reopened.render(f.container, 'tools');
    expect(currentGroup().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(rawDraft);
    expect(field(currentGroup(), 'search').disabled).toBe(true);
    click(currentGroup(), 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides['tool-web']).toEqual(valid ? { search: true, fetch: false } : { search: false });
    expect(f.saveSettings).toHaveBeenCalledTimes(valid ? 2 : 1);
    expect(field(currentGroup(), 'search').disabled).toBe(!valid);
    expect(currentGroup().textContent?.includes(text('raw.locked'))).toBe(!valid);
    expect(currentGroup().textContent?.includes(text('invalid'))).toBe(!valid);
    expect(currentGroup().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(valid ? JSON.stringify({ fetch: false, search: true }, null, 2) : rawDraft);
    click(currentGroup(), 'discard');
    expect(field(currentGroup(), 'search').disabled).toBe(false);
    expect(field(currentGroup(), 'search').value).toBe(valid ? 'true' : 'false');
    reopened.dispose();
  });
  it('validates enums and numeric ranges without persisting invalid JSON', async () => {
    const f = fixture('permissions');
    change(group(f.container, 'approval').querySelector('textarea')!, '{"policy":"always"}', 'input');
    click(group(f.container, 'approval'), 'saveGroup'); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(f.container.textContent).toContain(text('invalid'));
    f.workspace.render(f.container, 'advanced'); change(field(group(f.container, 'subagent'), 'maxDepth'), '-1'); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled();
  });
  it('creates and restores machine-local nonsecret history with revision checks', async () => {
    const f = fixture('tools', { nativeConfig: { version: 1, overrides: { 'tool-web': { search: true } } } });
    change(field(group(f.container, 'tool-web'), 'search'), 'false'); await settle();
    const store = createBackendConfigRecoveryStore({ baseDir: f.host.recoveryBaseDir });
    const identity = backendRecoveryIdentity(f.host.vaultPath, 'dsh:native:tool-web')!;
    const history = store.list(identity, 'dsh-native-tool-web'); expect(history).toHaveLength(1);
    expect(JSON.parse(store.read(identity, 'dsh-native-tool-web', 1)!.raw)).toEqual({ version: 1, overrides: { 'tool-web': { search: true } } });
    click(group(f.container, 'tool-web'), 'restore'); click(group(f.container, 'tool-web'), 'history.apply'); await settle();
    expect(f.settings.nativeConfig?.overrides['tool-web']?.search).toBe(true);
    expect(readFileSync(join(f.host.recoveryBaseDir!, identity, 'dsh-native-tool-web-1.json'), 'utf8')).not.toContain('env');
  });
  it('keeps saved unknown models pending until an authoritative catalog loads', async () => {
    const f = fixture('model', { nativeConfig: { version: 1, overrides: { 'agent-default-model': { provider: 'old', model: 'model' } } } });
    expect(f.container.textContent).toContain('old/model (saved; catalog pending)');
    click(f.container, 'refresh'); await settle();
    expect(f.container.textContent).toContain('old/model (not in the loaded catalog)');
    expect(f.settings.nativeConfig?.overrides['agent-default-model']?.model).toBe('model');
  });
  it('reports ACP startup persistence without inventing runtime confirmation', async () => {
    const f = fixture('tools', { transport: 'acp' });
    change(field(group(f.container, 'tool-web'), 'search'), 'true'); await settle();
    expect(f.saveSettings).toHaveBeenCalled(); expect(f.adapter.getNativeConfiguration).not.toHaveBeenCalled();
    expect(f.container.textContent).toContain(text('readback.acp'));
    expect(f.container.textContent).not.toContain(text('readback.applied'));
    // Native-only evidence RPCs are visibly disabled under ACP and stay honest
    // about startup application plus the standard next steps.
    const evidenceButton = (label: string): HTMLButtonElement =>
      [...f.container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text(label))!;
    expect(evidenceButton('refresh').disabled).toBe(true);
    expect(evidenceButton('reconnect').disabled).toBe(true);
    expect(f.container.textContent).toContain(text('application.acp'));
    expect(f.adapter.reconnectNativeConfiguration).not.toHaveBeenCalled();
  });
  it('guards native-only evidence actions against transport changes and disposal', async () => {
    const f = fixture('tools');
    const reconnect = () => [...f.container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text('reconnect'))!;
    expect(reconnect().disabled).toBe(false);
    // Transport changed without a re-render: a stale enabled click must stay a
    // no-op instead of reporting a false native failure.
    f.settings.transport = 'acp';
    reconnect().disabled = false; reconnect().click(); await settle();
    expect(f.adapter.reconnectNativeConfiguration).not.toHaveBeenCalled();
    expect(f.container.textContent).not.toContain(text('reconnectFailed'));
    f.settings.transport = 'native';
    f.workspace.dispose();
    reconnect().click(); await settle();
    expect(f.adapter.reconnectNativeConfiguration).not.toHaveBeenCalled();
  });
  it('separates process revision from actual observed field values', async () => {
    const f = fixture('tools', { nativeConfig: { version: 1, overrides: { 'tool-web': { search: false } } } });
    f.adapter.getNativeConfiguration.mockResolvedValue({ forms: [], observations: [{ ns: 'tool-web', status: 'verified', valueSource: 'effective', value: { search: true } }], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: dshNativeConfigurationRevision(f.settings.nativeConfig) } as never);
    click(f.container, 'refresh'); await settle();
    expect(f.container.textContent).toContain(text('readback.applied'));
    expect(f.container.textContent).toContain(text('observation.mismatch'));
  });
  it('provides guided provider entries with model arrays and credential references', async () => {
    const f = fixture('model');
    const providers = group(f.container, 'llm-pi-ai');
    change(providers.querySelector('input[aria-label="Entry name or ID"]')!, 'test');
    click(providers, 'addEntry');
    change(field(providers, 'providers.*.api'), 'openai-completions');
    change(field(providers, 'providers.*.baseURL'), 'https://example.invalid/v1');
    const models = providers.querySelector('[data-native-path="providers.*.models"]')!;
    click(models, 'addEntry'); change(field(models, 'providers.*.models.[].id'), 'fixture-model');
    expect(f.saveSettings).not.toHaveBeenCalled();
    click(providers, 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides['llm-pi-ai']?.providers?.test).toEqual({ api: 'openai-completions', baseURL: 'https://example.invalid/v1', models: [{ id: 'fixture-model' }] });
  });
  it('renders exact number-or-low union choices and saves the selected value', async () => {
    const f = fixture('model', { nativeConfig: { version: 1, overrides: { 'llm-deepseek': { models: [{ id: 'fixture', inputModalities: ['image'], imagePixelBudget: 'low' }] } } } });
    const holder = group(f.container, 'llm-deepseek');
    const selects = [...holder.querySelectorAll<HTMLSelectElement>('select[aria-label="Image pixel budget"]')];
    expect(selects.some(select => [...select.options].some(option => option.textContent === 'low'))).toBe(true);
    expect(holder.querySelector('input[aria-label="Image pixel budget"]')).toBeNull();
    click(holder, 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides['llm-deepseek']?.models?.[0].imagePixelBudget).toBe('low');
  });
  it('shows audited no-config policies without editable fake controls', () => {
    const f = fixture('advanced');
    for (const ns of ['fs-observation-policy', 'timeout-policy', 'llm-retry', 'image-offload']) {
      expect(group(f.container, ns).querySelector('input,select,textarea')).toBeNull();
      expect(group(f.container, ns).textContent).toContain(text('noFields'));
    }
  });
});

describe('DSH native credential administration', () => {
  const writeButton = (credential: Element, label: string): HTMLButtonElement =>
    [...credential.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text(label))!;
  it('keeps credential values out of vault drafts and recovery while clearing input immediately', async () => {
    const f = fixture('model', { nativeConfig: { version: 1, overrides: { 'llm-deepseek': { apiKeyEnv: 'DSH_TEST_KEY' } } } });
    const credential = f.container.querySelector('.opencodian-dsh-native-credential')!;
    // Writes stay disabled until the native service observed a writable reference.
    expect(writeButton(credential, 'credential.set').disabled).toBe(true);
    expect(writeButton(credential, 'credential.unset').disabled).toBe(true);
    expect(credential.textContent).toContain(text('credential.shared'));
    click(credential, 'credential.check'); await settle();
    expect(credential.textContent).toContain(text('credential.missing'));
    expect(credential.textContent).toContain(text('credential.source.unknown'));
    expect(credential.textContent).toContain(text('credential.writable'));
    expect(writeButton(credential, 'credential.set').disabled).toBe(false);
    const password = credential.querySelector<HTMLInputElement>('input[type=password]')!;
    password.value = 'fixture-secret-never-persist'; click(credential, 'credential.set');
    expect(password.value).toBe(''); await settle();
    expect(f.adapter.setNativeCredential).toHaveBeenCalledWith('DSH_TEST_KEY', 'fixture-secret-never-persist');
    expect(JSON.stringify(f.settings)).not.toContain('fixture-secret'); expect(f.saveSettings).not.toHaveBeenCalled();
    click(credential, 'credential.unset'); await settle(); expect(f.adapter.unsetNativeCredential).toHaveBeenCalledWith('DSH_TEST_KEY');
  });
  it('shows credential metadata with source and keeps write actions disabled while read-only', async () => {
    const f = fixture('model', { nativeConfig: { version: 1, overrides: { 'llm-deepseek': { apiKeyEnv: 'DSH_TEST_RO' } } } });
    const credential = f.container.querySelector('.opencodian-dsh-native-credential')!;
    f.adapter.getNativeCredentialDescriptors.mockResolvedValue({ credentials: [{ ref: 'DSH_TEST_RO', configured: false, writable: false }] });
    click(credential, 'credential.check'); await settle();
    expect(credential.textContent).toContain(text('credential.readOnly'));
    expect(credential.querySelector<HTMLInputElement>('input[type=password]')!.disabled).toBe(true);
    expect(writeButton(credential, 'credential.set').disabled).toBe(true);
    expect(writeButton(credential, 'credential.unset').disabled).toBe(true);
    // Stale handlers can dispatch while disabled: the callback guard blocks RPC.
    writeButton(credential, 'credential.set').disabled = false; writeButton(credential, 'credential.set').click(); await settle();
    expect(f.adapter.setNativeCredential).not.toHaveBeenCalled();
    f.adapter.getNativeCredentialDescriptors.mockResolvedValue({ credentials: [{ ref: 'DSH_TEST_RO', configured: true, source: 'managed-store', writable: true }] });
    click(credential, 'credential.check'); await settle();
    expect(credential.textContent).toContain('Source: managed-store');
    expect(credential.textContent).toContain(text('credential.configured'));
    expect(writeButton(credential, 'credential.set').disabled).toBe(false);
    expect(writeButton(credential, 'credential.unset').disabled).toBe(false);
  });
  it('drops stale credential reads after transport changes and disposal', async () => {
    const f = fixture('model', { nativeConfig: { version: 1, overrides: { 'llm-deepseek': { apiKeyEnv: 'DSH_STALE_KEY' } } } });
    const credential = f.container.querySelector('.opencodian-dsh-native-credential')!;
    f.settings.transport = 'acp';
    click(credential, 'credential.check'); await settle();
    expect(f.adapter.getNativeCredentialDescriptors).not.toHaveBeenCalled();
    f.settings.transport = 'native';
    f.workspace.dispose();
    click(credential, 'credential.check'); await settle();
    expect(f.adapter.getNativeCredentialDescriptors).not.toHaveBeenCalled();
    expect(credential.textContent).not.toContain('fixture');
  });
  it('rejects inline secrets and reports header credentials as reconnect-required', async () => {
    const f = fixture('model', { nativeConfig: { version: 1, overrides: { 'llm-pi-ai': { providers: { test: { headerCredentialRefs: { Authorization: 'HEADER_TEST' } } } } } } });
    expect(f.container.textContent).toContain(text('credential.header'));
    change(group(f.container, 'llm-pi-ai').querySelector('textarea')!, '{"providers":{"bad":{"headers":{"Authorization":"fixture-secret"}}}}', 'input');
    click(group(f.container, 'llm-pi-ai'), 'saveGroup'); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled(); expect(JSON.stringify(f.settings)).not.toContain('fixture-secret');
  });
});

describe('DSH native configuration consequence copy', () => {
  it.each(['en', 'zh'] as const)('renders reviewed consequences for every public group in %s without fallback copy', locale => {
    setLocale(locale);
    for (const descriptor of DSH_NATIVE_CONFIGURATION_GROUPS.filter(group => group.configuration === 'fields')) {
      const container = document.createElement('div');
      new SettingsDshNativeFields({ fields: descriptor.fields, value: sampleFields(descriptor.fields), base: {}, change: () => {}, credential: () => {} }).render(container);
      const descriptions = [...container.querySelectorAll<HTMLElement>('.setting-item-description')].map(element => element.textContent ?? '');
      expect({ namespace: descriptor.namespace, missing: descriptions.filter(value => !value.trim() || value.includes('settings.dsh.native.') || value === text('help.structured')) }).toEqual({ namespace: descriptor.namespace, missing: [] });
      expect(descriptions.length).toBeGreaterThan(0);
      expect(container.textContent).not.toContain('settings.dsh.native.help.');
    }
  });
  it('labels custom provider/model defaults as a transaction while retaining their draft behavior', async () => {
    const f = fixture('model');
    const defaults = group(f.container, 'agent-default-model');
    change(defaults.querySelector('select[aria-label="Default conversation model"]')!, '__custom__');
    const custom = defaults.querySelector<HTMLElement>('.opencodian-dsh-native-model-custom')!;
    expect(custom.hidden).toBe(false);
    expect(custom.querySelector('[data-native-metadata="provider"]')!.textContent).toContain(text('help.saveTogether'));
    expect(custom.querySelector('[data-native-metadata="model"]')!.textContent).toContain(text('help.saveTogether'));
    change(field(custom, 'provider'), 'fixture-provider');
    change(field(custom, 'model'), 'fixture-model'); await settle();
    expect(f.saveSettings).not.toHaveBeenCalled();
    click(defaults, 'saveGroup'); await settle();
    expect(f.settings.nativeConfig?.overrides['agent-default-model']).toEqual({ provider: 'fixture-provider', model: 'fixture-model' });
  });
  it.each(['en', 'zh'] as const)('shows domain consequences before secondary metadata in %s', locale => {
    setLocale(locale);
    const f = fixture('context');
    const description = (container: HTMLElement, path: string) => container.querySelector<HTMLElement>(`[data-native-path="${path}"] .setting-item-description`)!;
    const compaction = group(f.container, 'compaction-basic');
    expect(description(compaction, 'thresholdRatio').textContent).toBe(text('help.thresholdRatio'));
    expect(description(compaction, 'headroomTokens').textContent).toBe(text('help.headroomTokens'));
    expect(description(compaction, 'retainTokens').textContent).toBe(text('help.retainTokens'));
    expect(description(compaction, 'maxTokens').textContent).toBe(text('help.compaction-basic.maxTokens'));
    const metadata = compaction.querySelector('[data-native-metadata="thresholdRatio"]')!;
    expect(metadata.textContent).toContain(text('unit.ratio'));
    expect(metadata.textContent).toContain(text('help.saveScalar'));
    expect(description(compaction, 'thresholdRatio').compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    f.workspace.render(f.container, 'tools');
    expect(description(group(f.container, 'tool-fs'), 'write').textContent).toBe(text('help.write'));
    expect(description(group(f.container, 'tool-web'), 'searchMaxResults').textContent).toBe(text('help.searchMaxResults'));
    f.workspace.render(f.container, 'advanced');
    expect(description(group(f.container, 'subagent'), 'maxActiveSubagents').textContent).toBe(text('help.maxActiveSubagents'));
    f.settings.nativeConfig = { version: 1, overrides: { 'llm-pi-ai': { providers: { test: { defaultMaxTokens: 4096, defaultContextWindow: 32000 } } } } };
    f.workspace.render(f.container, 'model');
    const providers = group(f.container, 'llm-pi-ai');
    expect(description(providers, 'providers.*.defaultMaxTokens').textContent).toBe(text('help.defaultMaxTokens'));
    expect(description(providers, 'providers.*.defaultContextWindow').textContent).toBe(text('help.defaultContextWindow'));
    expect(providers.querySelector('[data-native-metadata="providers.*.defaultMaxTokens"]')!.textContent).toContain(text('help.saveTogether'));
    expect(f.container.textContent).not.toContain('settings.dsh.native.help.');
  });
  it('has translated public field names in both locales', () => {
    const leaves = new Set(DSH_NATIVE_CONFIGURATION_FIELDS.map(field => field.path.replace(/\[\]/g, '').split('.').at(-1)!).filter(name => name !== '*'));
    for (const locale of ['en', 'zh'] as const) {
      setLocale(locale);
      for (const name of leaves) expect(text(`field.${name}`)).not.toBe(`settings.dsh.native.field.${name}`);
    }
  });
});

describe('DSH native extensions', () => {
  it('mounts extension management on the configuration task only', () => {
    const advanced = fixture('advanced');
    expect(advanced.container.querySelector('.opencodian-dsh-extensions-workspace')).toBeNull();
    const links = advanced.container.querySelector('[data-native-task-links="advanced"]');
    expect(links).not.toBeNull();
    const anchors = [...links!.querySelectorAll('a')];
    expect(anchors).toHaveLength(2);
    anchors[0].click(); expect(advanced.navigateTask).toHaveBeenCalledWith('model');
    anchors[1].click(); expect(advanced.navigateTask).toHaveBeenCalledWith('configuration');
    const configuration = fixture('configuration');
    expect(configuration.container.querySelector('.opencodian-dsh-extensions-workspace')).not.toBeNull();
  });
  it('dispatches exact managed package actions only after explicit risk acceptance', async () => {
    const f = fixture('configuration');
    const extensions = () => f.container.querySelector('.opencodian-dsh-extensions-workspace')!;
    click(extensions(), 'refresh'); await settle();
    click(extensions(), 'extensions.remove'); await settle(); expect(f.adapter.mutateNativeExtension).not.toHaveBeenCalled();
    expect(extensions().textContent).toContain(text('extensions.riskRequired'));
    const risk = extensions().querySelector<HTMLInputElement>('input[type=checkbox]')!;
    risk.checked = true; risk.dispatchEvent(new Event('change'));
    click(extensions(), 'extensions.remove'); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenCalledWith(expect.objectContaining({ action: 'remove', name: 'example-bundle', operationId: expect.any(String) }));
    click(extensions(), 'extensions.inspect'); await settle(); expect(f.adapter.inspectNativeExtension).toHaveBeenCalledWith({ spec: 'example-bundle' });
    click(extensions(), 'extensions.versions'); await settle(); expect(f.adapter.getNativeExtensionVersions).toHaveBeenCalledWith({ name: 'example-bundle' });
  });
  it('installs with exact version/build arguments and supports cancellation while pending', async () => {
    const f = fixture('configuration'); const ext = () => f.container.querySelector('.opencodian-dsh-extensions-workspace')!;
    click(ext(), 'refresh'); await settle();
    change(ext().querySelector('input[aria-label="Package specification"]')!, 'fixture-package@1.0.0', 'input');
    change(ext().querySelector('textarea[aria-label="Approved package build scripts"]')!, 'fixture-build', 'input');
    const risk = ext().querySelector<HTMLInputElement>('input[type=checkbox]')!; risk.checked = true; risk.dispatchEvent(new Event('change'));
    let finish!: () => void; f.adapter.mutateNativeExtension.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ operationId: 'fixture', result: {} }); }));
    click(ext(), 'extensions.install'); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenCalledWith(expect.objectContaining({ action: 'install', spec: 'fixture-package@1.0.0', saveExact: true, approvedBuilds: ['fixture-build'] }));
    click(ext(), 'extensions.cancel'); await settle(); expect(f.adapter.mutateNativeExtension).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'cancel', operationId: expect.any(String) }));
    finish(); await settle();
  });
  it('edits actual loaded extension scalar schema with native revision CAS and excludes secrets', async () => {
    const f = fixture('configuration');
    f.adapter.getNativeConfiguration.mockResolvedValue({ forms: [{ ns: 'fixture-hook', revision: 1, writable: true, persistenceSource: 'managed-profile', value: { enabled: true, delay: 1 }, schema: { uid: 10, refs: { '2': { type: 'boolean', meta: {} }, '7': { type: 'number', meta: { min: 1, max: 100 } }, '9': { type: 'string', meta: {} }, '10': { type: 'object', dict: { enabled: 2, delay: 7, apiKey: 9 } } } } }], observations: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: null } as never);
    click(f.container, 'refresh'); await settle();
    expect(f.container.querySelector('[data-extension-path="apiKey"]')).toBeNull();
    change(f.container.querySelector('[data-extension-path="delay"] input')!, '25');
    click(f.container, 'saveGroup'); await settle();
    expect(f.adapter.mutateNativeExtensionSettings).toHaveBeenCalledWith({ ns: 'fixture-hook', expectedRevision: 1, ops: [{ op: 'set', path: ['delay'], value: 25 }] });
    expect(f.saveSettings).not.toHaveBeenCalled();
  });
  it('dispatches enable, update and exact exemption actions with native keys', async () => {
    const f = fixture('configuration'); const ext = () => f.container.querySelector('.opencodian-dsh-extensions-workspace')!;
    const authorize = () => { const risk = ext().querySelector<HTMLInputElement>('input[type=checkbox]')!; risk.checked = true; risk.dispatchEvent(new Event('change')); };
    click(ext(), 'refresh'); await settle();
    authorize();
    const plugin = ext().querySelector<HTMLInputElement>('.opencodian-dsh-extension-list input[type=checkbox]')!;
    plugin.checked = false; plugin.dispatchEvent(new Event('change')); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'enable-plugin', id: 'plugin-example', enabled: false }));
    authorize();
    const bundle = ext().querySelectorAll<HTMLInputElement>('.opencodian-dsh-extension-list input[type=checkbox]')[1];
    bundle.checked = false; bundle.dispatchEvent(new Event('change')); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'enable-bundle', name: 'example-bundle', enabled: false }));
    authorize(); change(ext().querySelector('input[aria-label="Target version for example-bundle"]')!, '2.0.0');
    click(ext(), 'extensions.update'); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'update', name: 'example-bundle', version: '2.0.0' }));
    authorize(); change(ext().querySelector('input[aria-label="Package version"]')!, 'example@2.0.0', 'input');
    change(ext().querySelector('input[aria-label="Runtime version"]')!, '0.2.2', 'input');
    click(ext(), 'extensions.exempt'); await settle();
    expect(f.adapter.mutateNativeExtension).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'exempt', packageVersion: 'example@2.0.0', runtimeVersion: '0.2.2', enabled: true, acceptRisk: true }));
  });
  it('retains a loaded extension draft on native CAS rejection and supports unset', async () => {
    const f = fixture('configuration');
    f.adapter.getNativeConfiguration.mockResolvedValue({ forms: [{ ns: 'fixture-hook', revision: 4, writable: true, persistenceSource: 'managed-profile', value: { enabled: true }, schema: { uid: 2, refs: { '1': { type: 'boolean', meta: {} }, '2': { type: 'object', dict: { enabled: 1 } } } } }], observations: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: null } as never);
    click(f.container, 'refresh'); await settle();
    const row = f.container.querySelector('[data-extension-path="enabled"]')!;
    click(row, 'reset');
    f.adapter.mutateNativeExtensionSettings.mockRejectedValueOnce(new Error('[SETTINGS_CONFLICT] fixture'));
    click(f.container, 'saveGroup'); await settle();
    expect(f.adapter.mutateNativeExtensionSettings).toHaveBeenCalledWith({ ns: 'fixture-hook', expectedRevision: 4, ops: [{ op: 'unset', path: ['enabled'] }] });
    expect(f.container.textContent).toContain(text('conflict'));
    click(f.container, 'saveGroup'); await settle(); expect(f.adapter.mutateNativeExtensionSettings).toHaveBeenCalledTimes(2);
  });
  it('does not claim complete extension configuration when apply/readback is unavailable', async () => {
    const f = fixture('configuration');
    f.adapter.getNativeConfiguration.mockResolvedValue({ forms: [{ ns: 'fixture-hook', revision: 1, writable: true, persistenceSource: 'managed-profile', value: { enabled: true }, schema: { uid: 2, refs: { '1': { type: 'boolean', meta: {} }, '2': { type: 'object', dict: { enabled: 1 } } } } }], observations: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: null } as never);
    f.adapter.mutateNativeExtensionSettings.mockResolvedValue({ form: null, persistence: { source: 'managed-profile', status: 'verified' }, application: { status: 'unavailable' }, readback: { status: 'unavailable' } } as never);
    click(f.container, 'refresh'); await settle();
    change(f.container.querySelector('[data-extension-path="enabled"] select')!, '1');
    click(f.container, 'saveGroup'); await settle();
    expect(f.container.textContent).toContain(text('extensionSettings.pending'));
    expect(f.container.textContent).not.toContain(text('extensionSettings.saved'));
  });
  it('blocks extension mutations without managed ownership and rejects unsupported schemas honestly', async () => {
    const f = fixture('configuration'); f.adapter.listNativeExtensions.mockResolvedValue({ managed: false, plugins: [], bundles: [] });
    click(f.container.querySelector('.opencodian-dsh-extensions-workspace')!, 'refresh'); await settle();
    const install = [...f.container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text('extensions.install'))!;
    expect(install.disabled).toBe(true);
    f.workspace.render(f.container, 'configuration');
    f.adapter.getNativeConfiguration.mockResolvedValue({ forms: [{ ns: 'fixture-hook', revision: 1, writable: true, persistenceSource: 'managed-profile', schema: { uid: 1, refs: { '1': { type: 'array' } } } }], observations: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: null } as never);
    click(f.container, 'refresh'); await settle();
    expect(f.container.textContent).toContain('schema branches have no supported scalar editor');
    expect(f.container.querySelector('[data-extension-path]')).toBeNull();
  });
  it('disposes native subscriptions when leaving the workspace', () => {
    const f = fixture('advanced');
    const handles = f.adapter.subscribeToNativeControlUpdates.mock.results.map(result => result.value);
    f.workspace.dispose();
    for (const handle of handles) expect(handle.dispose).toHaveBeenCalled();
  });
});
