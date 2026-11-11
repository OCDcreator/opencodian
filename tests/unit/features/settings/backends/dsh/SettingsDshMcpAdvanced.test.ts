import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Setting } from 'obsidian';

import { validateDshMcpServers } from '../../../../../../src/core/agents/backend/dsh/DshProtocolCodec';
import type { DshBackendSettings } from '../../../../../../src/core/types/settings';
import {
  type DshMcpWorkspaceConnectionPort,
  SettingsDshMcpWorkspace,
} from '../../../../../../src/features/settings/backends/dsh/SettingsDshMcpWorkspace';
import { setLocale, t } from '../../../../../../src/i18n';

async function settle(): Promise<void> { for (let index = 0; index < 15; index++) await Promise.resolve(); }

function installControls(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.infoEl.createDiv({ cls: 'setting-item-name', text: name });
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setClass').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl('input');
    const control = {
      inputEl,
      setValue: (value: string) => { inputEl.value = value; return control; },
      setPlaceholder: (value: string) => { inputEl.placeholder = value; return control; },
      onChange: (handler: (value: string) => unknown) => { inputEl.addEventListener('input', () => { handler(inputEl.value); }); return control; },
    };
    callback(control as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl('textarea');
    const control = {
      inputEl,
      setValue: (value: string) => { inputEl.value = value; return control; },
      setPlaceholder: () => control,
      onChange: (handler: (value: string) => unknown) => { inputEl.addEventListener('input', () => { handler(inputEl.value); }); return control; },
    };
    callback(control as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, callback) {
    const selectEl = this.controlEl.createEl('select');
    const control = {
      selectEl,
      addOption: (value: string, text: string) => { selectEl.createEl('option', { text, value }); return control; },
      setValue: (value: string) => { selectEl.value = value; return control; },
      onChange: (handler: (value: string) => unknown) => { selectEl.addEventListener('change', () => { handler(selectEl.value); }); return control; },
    };
    callback(control as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback) {
    const element = this.controlEl.createEl('button');
    const control = {
      setButtonText: (value: string) => { element.textContent = value; return control; },
      setDisabled: (value: boolean) => { element.disabled = value; return control; },
      setCta: () => control,
      onClick: (handler: () => unknown) => { element.addEventListener('click', () => { handler(); }); return control; },
    };
    callback(control as never);
    return this;
  });
}

function mount(options: { adapter?: DshMcpWorkspaceConnectionPort; save?: () => Promise<void> } = {}) {
  const settings: DshBackendSettings = {
    executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native',
    mcpServers: [{ name: 'server-one', command: '/bin/server', args: [], env: [] }],
  };
  const save = options.save ?? jest.fn(async () => {});
  const group = document.createElement('div');
  document.body.append(group);
  new SettingsDshMcpWorkspace({
    getSettings: () => settings,
    getAdapter: () => options.adapter,
    validateMcpServers: validateDshMcpServers,
    saveSettings: save,
  }).render(group);
  return { group, settings, save };
}

function button(group: HTMLElement, name: string): HTMLButtonElement {
  const element = [...group.querySelectorAll('button')].find((item) => item.textContent === name);
  expect(element).toBeDefined();
  return element!;
}

function numberInput(group: HTMLElement, field: string, value: string): void {
  const input = group.querySelector<HTMLInputElement>(`[data-dsh-mcp-advanced="${field}"]`)!;
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => { setLocale('en'); installControls(); });
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

it('keeps advanced options in the MCP draft and saves them with the declaration', async () => {
  const { group, settings, save } = mount();
  numberInput(group, 'toolCallTimeoutMs', '120000');
  numberInput(group, 'maxAttempts', '4');
  expect(settings.mcpServers?.[0]).not.toHaveProperty('toolCallTimeoutMs');
  button(group, t('settings.agent.dsh.save')).click();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(settings.mcpServers?.[0]).toMatchObject({ toolCallTimeoutMs: 120000, reconnect: { maxAttempts: 4 } });
});

it('uses blank fields as inheritance and does not persist default numbers', async () => {
  const { group, settings } = mount();
  numberInput(group, 'toolCallTimeoutMs', '5000');
  numberInput(group, 'toolCallTimeoutMs', '');
  numberInput(group, 'maxAttempts', '2');
  numberInput(group, 'maxAttempts', '');
  button(group, t('settings.agent.dsh.save')).click();
  await settle();
  expect(settings.mcpServers?.[0]).not.toHaveProperty('toolCallTimeoutMs');
  expect(settings.mcpServers?.[0]).not.toHaveProperty('reconnect');
});

it('rejects invalid limits without changing the previous saved declaration', async () => {
  const { group, settings, save } = mount();
  numberInput(group, 'toolCallTimeoutMs', '-5');
  button(group, t('settings.agent.dsh.save')).click();
  await settle();
  expect(save).not.toHaveBeenCalled();
  expect(settings.mcpServers?.[0]).not.toHaveProperty('toolCallTimeoutMs');
  expect(group.textContent).toContain(t('settings.agent.dsh.mcp.validationFailed'));
});

it('rolls back advanced settings if vault persistence fails', async () => {
  const { group, settings } = mount({ save: jest.fn(async () => { throw new Error('private value'); }) });
  numberInput(group, 'maxInstructionBytes', '4096');
  button(group, t('settings.agent.dsh.save')).click();
  await settle();
  expect(settings.mcpServers?.[0]).not.toHaveProperty('maxInstructionBytes');
  expect(group.textContent).not.toContain('private value');
});

it('reports an unknown remote connection without presenting a mounted plugin as connected', async () => {
  const getSessionMcpStatus = jest.fn(async () => ({ servers: [{ name: 'server-one', connected: null }] }));
  const { group } = mount({ adapter: {
    status: 'connected', start: jest.fn(async () => {}),
    readSessionConfiguration: jest.fn(async () => ({ sessionId: 'session', images: false, controls: [] })),
    getSessionMcpStatus,
  } });
  button(group, t('settings.dsh.mcpAdvanced.refresh')).click();
  await settle();
  expect(getSessionMcpStatus).toHaveBeenCalledTimes(1);
  expect(group.textContent).toContain(`server-one · ${t('settings.dsh.mcpAdvanced.connectionUnknown')}`);
});

it('disables status readback with an explanation if the transport has no method', () => {
  const { group } = mount();
  expect(button(group, t('settings.dsh.mcpAdvanced.refresh')).disabled).toBe(true);
  expect(group.textContent).toContain(t('settings.dsh.mcpAdvanced.unavailable'));
});

function installMcpAdvancedChoiceControls(): void {
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, callback) {
    const selectEl = this.controlEl.createEl('select');
    const control = {
      selectEl,
      addOption: (value: string, text: string) => { selectEl.createEl('option', { text }).value = value; return control; },
      setValue: (value: string) => { selectEl.value = value; return control; },
      onChange: (handler: (value: string) => unknown) => { selectEl.addEventListener('change', () => { handler(selectEl.value); }); return control; },
    };
    callback(control as never); return this;
  });
}
function advancedFixture(transport: 'native' | 'acp' = 'acp', http = false) {
  installMcpAdvancedChoiceControls();
  const advanced = { toolCallTimeoutMs: 120000, maxInstructionBytes: 4096, failOnStartupError: false,
    reconnect: { enabled: false, initialDelayMs: 700, maxDelayMs: 4000, maxAttempts: 4 } };
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport,
    mcpServers: [http ? { type: 'http', name: 'remote', url: 'https://example.invalid/mcp', headers: [{ name: 'X-MCP', value: 'initial' }], ...advanced }
      : { name: 'local', command: '/bin/server', args: ['initial'], env: [{ name: 'MCP_ENV', value: 'initial' }], cwd: '/srv/mcp', ...advanced }] };
  const save = jest.fn(async () => {});
  const adapter = { status: 'connected' as const, start: jest.fn(async () => {}), applyMcpConfiguration: jest.fn(async () => 2),
    readSessionConfiguration: jest.fn(async () => ({ sessionId: 'session', images: false, controls: [] })) };
  const workspace = new SettingsDshMcpWorkspace({ getSettings: () => settings, getAdapter: () => adapter,
    validateMcpServers: validateDshMcpServers, saveSettings: save });
  const group = document.createElement('div'); document.body.append(group); workspace.render(group);
  return { settings, save, adapter, workspace, group };
}
function advancedControls(group: HTMLElement): Array<HTMLInputElement | HTMLSelectElement> {
  return [...group.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.opencodian-dsh-mcp-editor .opencodian-dsh-native-disclosure input, .opencodian-dsh-mcp-editor .opencodian-dsh-native-disclosure select')];
}

it.each([false, true])('disables every advanced override in ACP (HTTP: %s) without disabling basic fields', http => {
  const { group } = advancedFixture('acp', http);
  const advanced = advancedControls(group);
  expect(advanced).toHaveLength(http ? 7 : 8);
  expect(advanced.every(control => control.disabled)).toBe(true);
  const label = t(http ? 'settings.agent.dsh.mcp.url' : 'settings.agent.dsh.mcp.command');
  expect(group.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!.disabled).toBe(false);
});

function inputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  input.value = value; input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function labelledInput(group: HTMLElement, label: string): HTMLInputElement {
  return group.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}

it.each([false, true])('preserves Native overrides through ACP basic edits and switching back (HTTP: %s)', async http => {
  const f = advancedFixture('native', http);
  numberInput(f.group, 'toolCallTimeoutMs', '150000');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  const saved = validateDshMcpServers(f.settings.mcpServers)[0];
  f.settings.transport = 'acp'; f.workspace.render(f.group);
  expect(advancedControls(f.group).every(control => control.disabled)).toBe(true);
  expect(f.group.querySelector<HTMLInputElement>('[data-dsh-mcp-advanced="toolCallTimeoutMs"]')!.value).toBe('150000');
  if (http) inputValue(labelledInput(f.group, t('settings.agent.dsh.mcp.url')), 'https://example.invalid/edited');
  else {
    inputValue(labelledInput(f.group, t('settings.agent.dsh.mcp.command')), '/bin/edited');
    const args = f.group.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t('settings.agent.dsh.mcp.args')}"]`)!;
    inputValue(args, 'updated\nargument');
  }
  const pair = f.group.querySelector<HTMLInputElement>('.opencodian-dsh-mcp-pairs input[type=password]')!;
  expect(pair.disabled).toBe(false); inputValue(pair, 'updated-value');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  const expected = http ? { ...saved, url: 'https://example.invalid/edited', headers: [{ name: 'X-MCP', value: 'updated-value' }] }
    : { ...saved, command: '/bin/edited', args: ['updated', 'argument'], env: [{ name: 'MCP_ENV', value: 'updated-value' }] };
  expect(f.settings.mcpServers![0]).toEqual(expected);
  expect(f.group.querySelector('[role=status]')!.textContent).toBe(t('settings.dsh.mcpAdvanced.acpSaved'));
  f.settings.transport = 'native'; f.workspace.render(f.group);
  expect(advancedControls(f.group).every(control => !control.disabled)).toBe(true);
  expect(f.group.querySelector<HTMLInputElement>('[data-dsh-mcp-advanced="toolCallTimeoutMs"]')!.value).toBe('150000');
  expect(f.group.querySelector<HTMLSelectElement>(`select[aria-label="${t('settings.dsh.mcpAdvanced.failOnStartup')}"]`)!.value).toBe('false');
  numberInput(f.group, 'maxAttempts', '6'); button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.settings.mcpServers![0]).toMatchObject({ reconnect: { enabled: false, initialDelayMs: 700, maxDelayMs: 4000, maxAttempts: 6 } });
});

it('preserves unsaved Native advanced drafts when switching to ACP and back', async () => {
  const f = advancedFixture('native');
  numberInput(f.group, 'maxInstructionBytes', '8192');
  inputValue(labelledInput(f.group, t('settings.dsh.mcpAdvanced.cwd')), '/srv/unsaved-native');
  f.settings.transport = 'acp'; f.workspace.render(f.group);
  expect(labelledInput(f.group, t('settings.dsh.mcpAdvanced.cwd')).value).toBe('/srv/unsaved-native');
  expect(f.settings.mcpServers![0]).toMatchObject({ cwd: '/srv/mcp', maxInstructionBytes: 4096 });
  expect(f.save).not.toHaveBeenCalled();
  f.settings.transport = 'native'; f.workspace.render(f.group);
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.settings.mcpServers![0]).toMatchObject({ cwd: '/srv/unsaved-native', maxInstructionBytes: 8192 });
});

it.each([false, true])('guards disabled advanced callbacks even if events are dispatched (HTTP: %s)', async http => {
  const f = advancedFixture('acp', http); const previous = validateDshMcpServers(f.settings.mcpServers);
  for (const control of advancedControls(f.group)) inputValue(control, control.tagName === 'SELECT' ? 'true'
    : (control as HTMLInputElement).type === 'number' ? '1700' : '/srv/blocked');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.settings.mcpServers).toEqual(previous);
});

it('guards a Native control callback after switching transport before the next render', async () => {
  const f = advancedFixture('native'); const previous = validateDshMcpServers(f.settings.mcpServers);
  f.settings.transport = 'acp';
  numberInput(f.group, 'toolCallTimeoutMs', '1700');
  inputValue(labelledInput(f.group, t('settings.dsh.mcpAdvanced.cwd')), '/srv/blocked');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.settings.mcpServers).toEqual(previous);
});

it.each([false, true])('retains raw advanced ACP values as Native-only without claiming application (HTTP: %s)', async http => {
  const f = advancedFixture('acp', http);
  const raw = f.group.querySelector<HTMLTextAreaElement>('.opencodian-dsh-mcp-raw textarea')!;
  expect(raw.disabled).toBe(false);
  expect(f.group.querySelector('.opencodian-dsh-mcp-raw')!.textContent).toContain(t('settings.dsh.mcpAdvanced.acpUnavailable'));
  const requested = { ...f.settings.mcpServers![0], toolCallTimeoutMs: 75000, reconnect: { enabled: false, initialDelayMs: 900, maxDelayMs: 9000, maxAttempts: 5 } };
  inputValue(raw, JSON.stringify([requested]));
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.settings.mcpServers).toEqual([requested]);
  expect(f.group.querySelector('[role=status]')!.textContent).toBe(t('settings.dsh.mcpAdvanced.acpSaved'));
  button(f.group, t('settings.agent.dsh.mcp.apply')).click(); await settle();
  expect(f.adapter.applyMcpConfiguration).toHaveBeenCalledTimes(1);
  expect(f.group.querySelector('[role=status]')!.textContent).toBe(t('settings.dsh.mcpAdvanced.acpApplied', { count: 2 }));
  expect(f.group.querySelector('[role=status]')!.textContent).not.toContain(t('settings.agent.dsh.mcp.applied', { count: 2 }));
  expect(f.settings.mcpServers).toEqual([requested]);
  f.settings.transport = 'native'; f.workspace.render(f.group);
  expect(advancedControls(f.group).every(control => !control.disabled)).toBe(true);
  expect(f.group.querySelector<HTMLInputElement>('[data-dsh-mcp-advanced="toolCallTimeoutMs"]')!.value).toBe('75000');
});

it('retains the unsaved warning when applying only saved ACP basic declarations', async () => {
  const f = advancedFixture();
  inputValue(labelledInput(f.group, t('settings.agent.dsh.mcp.command')), '/bin/unsaved');
  button(f.group, t('settings.agent.dsh.mcp.apply')).click(); await settle();
  const feedback = f.group.querySelector('[role=status]')!.textContent;
  expect(feedback).toContain(t('settings.dsh.mcpAdvanced.acpApplied', { count: 2 }));
  expect(feedback).toContain(t('settings.agent.dsh.mcp.draftNotApplied'));
  expect(f.settings.mcpServers![0]).toMatchObject({ command: '/bin/server' });
});

it('keeps raw invalid advanced input rejected in ACP without dropping it from the draft', async () => {
  const f = advancedFixture(); const previous = validateDshMcpServers(f.settings.mcpServers);
  const raw = f.group.querySelector<HTMLTextAreaElement>('.opencodian-dsh-mcp-raw textarea')!;
  const draft = JSON.stringify([{ ...previous![0], toolCallTimeoutMs: -1 }]);
  inputValue(raw, draft); button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.save).not.toHaveBeenCalled(); expect(f.settings.mcpServers).toEqual(previous);
  expect(raw.value).toBe(draft);
  expect(f.group.textContent).toContain(t('settings.agent.dsh.mcp.validationFailed'));
});

it.each(['en', 'zh'] as const)('explains the actual ACP fixed behavior and Native-only save boundary in %s', async locale => {
  setLocale(locale);
  const f = advancedFixture();
  const copy = t('settings.dsh.mcpAdvanced.acpUnavailable');
  const advanced = f.group.querySelector('.opencodian-dsh-mcp-editor .opencodian-dsh-native-disclosure')!;
  expect(advanced.textContent).toContain(copy);
  expect(copy).toContain('Native'); expect(copy).toContain('ACP');
  expect(copy).toContain(locale === 'en' ? 'session working directory' : '会话工作目录');
  expect(copy).toContain(locale === 'en' ? 'blocks session setup' : '阻止会话启动');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.group.querySelector('[role=status]')!.textContent).toBe(t('settings.dsh.mcpAdvanced.acpSaved'));
  expect(f.group.textContent).not.toContain('settings.dsh.mcpAdvanced.');
  setLocale('en');
});

function bridgeStartupFailureDefaults(server: unknown): boolean {
  const bridge = pathToFileURL(join(process.cwd(), 'assets/dsh/control.mjs')).href;
  const script = 'const { mcpClientConfig } = await import(process.argv[1]); const config = await mcpClientConfig({ get: () => undefined }, JSON.parse(process.argv[2]), "/srv/session"); process.stdout.write(JSON.stringify(config.failOnStartupError));';
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script, bridge, JSON.stringify(server)], { encoding: 'utf8' })) as boolean;
}

it.each([false, true])('matches Native bridge startup-failure defaults and preserves explicit false (HTTP: %s)', async http => {
  const f = advancedFixture('native', http);
  const startup = () => f.group.querySelector<HTMLSelectElement>(`select[aria-label="${t('settings.dsh.mcpAdvanced.failOnStartup')}"]`)!;
  expect(startup().value).toBe('false');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle();
  expect(f.settings.mcpServers![0].failOnStartupError).toBe(false);
  expect(bridgeStartupFailureDefaults(f.settings.mcpServers![0])).toBe(false);
  inputValue(startup(), 'inherit');
  button(f.group, t('settings.agent.dsh.save')).click(); await settle(); f.workspace.render(f.group);
  expect(f.settings.mcpServers![0]).not.toHaveProperty('failOnStartupError');
  expect(startup().value).toBe('inherit');
  expect(startup().selectedOptions[0].textContent).toBe(t('settings.dsh.mcpAdvanced.inheritBoolean', { value: t('settings.dsh.mcpAdvanced.enabled') }));
  expect(bridgeStartupFailureDefaults(f.settings.mcpServers![0])).toBe(true);
});
