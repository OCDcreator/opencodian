import { type App, Setting } from 'obsidian';

import type { PiAdapter } from '../../../../src/core/agents/backend/pi/PiAdapter';
import { DEFAULT_SETTINGS, getDefaultClaudeCodeBackendSettings } from '../../../../src/core/types';
import { PI_WORKBENCH_GROUPS } from '../../../../src/features/settings/PiWorkbenchActions';
import { PiWorkbenchModal } from '../../../../src/features/settings/PiWorkbenchModal';
import { SettingsClaudeCodeSection } from '../../../../src/features/settings/SettingsClaudeCodeSection';
import { SettingsPiConfigurationSection } from '../../../../src/features/settings/SettingsPiConfigurationSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type Control = {
  name: string; label?: string; options: Record<string, string>; disabled: boolean; value: string;
  inputEl: HTMLInputElement; settingEl: HTMLElement;
  change?: (value: string) => void | Promise<void>; click?: () => void | Promise<void>;
};
let controls: Control[] = [];
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function mockControls(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (name: string) {
    this.settingEl.dataset.testName = name; return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (value: string) {
    this.settingEl.dataset.testDescription = value; return this;
  });
  const add = function (this: Setting, callback: (value: never) => unknown): Setting {
    const record: Control = { name: this.settingEl.dataset.testName ?? '', options: {}, disabled: false, value: '', inputEl: document.createElement('input'), settingEl: this.settingEl };
    const component = {
      inputEl: record.inputEl,
      setValue: (value: string) => { record.value = value; return component; },
      setPlaceholder: () => component, setCta: () => component,
      setDisabled: (value: boolean) => { record.disabled = value; return component; },
      setButtonText: (value: string) => { record.label = value; return component; },
      addOption: (value: string, label: string) => { record.options[value] = label; return component; },
      onChange: (handler: Control['change']) => { record.change = handler; return component; },
      onClick: (handler: Control['click']) => { record.click = handler; return component; },
    };
    controls.push(record); callback(component as never); return this;
  };
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(add);
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(add);
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(add);
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(add);
}
function lastControl(name: string): Control {
  const result = [...controls].reverse().find(control => control.name === name && control.change) ?? [...controls].reverse().find(control => control.name === name);
  if (!result) throw new Error('Missing control: ' + name);
  return result;
}
function claudeFixture(adapter: unknown, kind: 'styles' | 'mcp') {
  const plugin = {
    settings: { ...DEFAULT_SETTINGS, backendSettings: { ...DEFAULT_SETTINGS.backendSettings, claudeCode: getDefaultClaudeCodeBackendSettings() } },
    saveSettings: jest.fn(async () => {}), agentServiceRegistry: { get: () => adapter },
  };
  const container = document.body.createDiv();
  const section = new SettingsClaudeCodeSection({ plugin: plugin as unknown as OpenCodianPlugin, createSectionHeading: (parent, title) => parent.createEl('h2', { text: title }) });
  section.renderTabContent(container, kind === 'mcp' ? 'mcp' : 'runtime');
  const area = container.querySelector<HTMLElement>('[data-claude-session-controls="' + kind + '"]') as HTMLElement;
  const button = controls.find(control => control.settingEl.closest('[data-claude-session-controls]') === area && control.click);
  if (!button) throw new Error('Missing session control button');
  return { plugin, area, button, output: area.querySelector<HTMLElement>('[role="status"]') as HTMLElement };
}
async function piFixture(adapter: object, actionId = 'set_thinking_level') {
  const modal = new PiWorkbenchModal({} as App, {
    listSessions: jest.fn(async () => [{ id: 'pi-local', title: 'Native fixture' }]), onEvent: () => ({ dispose: () => {} }),
    ...adapter,
  } as unknown as PiAdapter);
  modal.onOpen(); await flush();
  const group = Object.entries(PI_WORKBENCH_GROUPS).find(([, actions]) => actions.some(action => action.id === actionId))?.[0];
  await lastControl('功能 / Area').change?.(group as string);
  await lastControl('操作 / Action').change?.(actionId);
  await flush();
  return modal;
}
beforeEach(() => { controls = []; document.body.innerHTML = ''; setLocale('en'); mockControls(); });
afterEach(() => jest.restoreAllMocks());

describe('Claude native session controls UI', () => {
  it.each(['styles', 'mcp'] as const)('requires a native session and never calls %s or persists an effective state without one', async kind => {
    const adapter = { reloadOutputStyles: jest.fn(), setMcpPermissionModeOverride: jest.fn() };
    const { plugin, button, output } = claudeFixture(adapter, kind);
    await button.click?.();
    expect(output.textContent).toContain('No active native session');
    expect(adapter.reloadOutputStyles).not.toHaveBeenCalled();
    expect(adapter.setMcpPermissionModeOverride).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(output.dataset.runtimeEvidence).toBe('unavailable');
  });
  it('shows the returned style catalog without changing outputStyle or claiming current prompt application', async () => {
    const names = ['default', 'Proactive', 'Concise', 'Explanatory', 'Learning', 'Coding Vibes', 'Structural Thinking'];
    const reloadOutputStyles = jest.fn(async () => ({ status: 'acknowledged', nativeSessionId: 'sdk-native', response: { available_output_styles: names } }));
    const { plugin, button, output } = claudeFixture({ reloadOutputStyles }, 'styles');
    await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native');
    await button.click?.();
    expect(reloadOutputStyles).toHaveBeenCalledWith('sdk-native');
    expect([...output.querySelectorAll('li')].map(item => item.textContent)).toEqual(names);
    expect(output.textContent).toContain('current prompt application is unverified');
    expect(output.dataset.controlStatus).toBe('acknowledged');
    expect(output.dataset.runtimeEvidence).toBe('unavailable');
    expect(plugin.settings.backendSettings.claudeCode.outputStyle).toBe('');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });
  it.each([['missing-method', 'installed SDK'], ['no-active-session', 'No active native session']])('renders %s as unavailable', async (reason, text) => {
    const { button, output, plugin } = claudeFixture({ reloadOutputStyles: async () => ({ status: 'unavailable', nativeSessionId: 'sdk-native', reason }) }, 'styles');
    await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native'); await button.click?.();
    expect(output.textContent).toContain(text); expect(output.dataset.controlStatus).toBe('unavailable');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });
  it.each(['styles', 'mcp'] as const)('renders a missing %s adapter control honestly', async kind => {
    const { button, output } = claudeFixture({}, kind);
    await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native');
    if (kind === 'mcp') await lastControl(t('settings.claudeCode.sessionControls.server')).change?.('server');
    await button.click?.(); expect(output.textContent).toContain('installed SDK');
  });
  it.each(['default', 'auto', 'inherit'])('sends MCP override %s only to the entered native session and displays warning without saving', async mode => {
    const setMcpPermissionModeOverride = jest.fn(async () => ({ status: 'acknowledged', nativeSessionId: 'sdk-native', response: { warning: 'Tightening only; session permission still applies.' } }));
    const { plugin, button, output } = claudeFixture({ setMcpPermissionModeOverride }, 'mcp');
    await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native');
    await lastControl(t('settings.claudeCode.sessionControls.server')).change?.('fixture-mcp');
    await lastControl(t('settings.claudeCode.sessionControls.mode')).change?.(mode);
    await button.click?.();
    expect(setMcpPermissionModeOverride).toHaveBeenCalledWith('sdk-native', 'fixture-mcp', mode === 'inherit' ? null : mode);
    expect(output.textContent).toContain('Effective setting readback is unavailable');
    expect(output.textContent).toContain('Tightening only');
    expect(output.dataset.runtimeEvidence).toBe('unavailable');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });
  it('requires an MCP server instead of mutating a denyall session with no server', async () => {
    const setMcpPermissionModeOverride = jest.fn();
    const { button, output } = claudeFixture({ setMcpPermissionModeOverride }, 'mcp');
    await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native'); await button.click?.();
    expect(setMcpPermissionModeOverride).not.toHaveBeenCalled(); expect(output.textContent).toContain('exact MCP server');
  });
  it.each(['returned', 'thrown', 'wrong-session'])('reports %s failure without saving effective state', async failure => {
    const reloadOutputStyles = async () => {
      if (failure === 'thrown') throw new Error('fixture');
      return failure === 'wrong-session' ? { status: 'acknowledged', nativeSessionId: 'other', response: { available_output_styles: ['must-not-display'] } } : { status: 'failed', nativeSessionId: 'sdk-native', reason: 'request-failed' };
    };
    const { plugin, button, output } = claudeFixture({ reloadOutputStyles }, 'styles');
    await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native'); await button.click?.();
    expect(output.textContent).toContain('failed'); expect(output.dataset.runtimeEvidence).toBe('failed');
    expect(output.textContent).not.toContain('must-not-display'); expect(plugin.saveSettings).not.toHaveBeenCalled();
  });
  it('drops a late response after the target changes', async () => {
    let finish!: (value: unknown) => void;
    const { button, output } = claudeFixture({ reloadOutputStyles: () => new Promise(resolve => { finish = resolve; }) }, 'styles');
    const target = lastControl(t('settings.claudeCode.sessionControls.session'));
    await target.change?.('sdk-native'); const run = button.click?.();
    await target.change?.('new-native'); finish({ status: 'acknowledged', nativeSessionId: 'sdk-native', response: { available_output_styles: ['stale'] } });
    await run; expect(output.textContent).not.toContain('stale'); expect(output.dataset.runtimeEvidence).toBe('unavailable');
  });
});

describe('Pi existing workbench UI consumption', () => {
  it('uses only SDK session levels including max and sends the selected dynamic level', async () => {
    const command = jest.fn(async () => ({}));
    await piFixture({ getAvailableThinkingLevels: async () => ({ levels: ['off', 'low', 'high', 'max'] }), command });
    const level = lastControl('等级 / Level'); expect(Object.keys(level.options).filter(Boolean)).toEqual(['off', 'low', 'high', 'max']);
    expect(level.disabled).toBe(false); await level.change?.('max');
    await [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.();
    expect(command).toHaveBeenCalledWith('pi-local', 'set_thinking_level', { level: 'max' });
  });
  it.each(['unsupported', 'failed'])('does not enable a guessed list when thinking read is %s', async state => {
    const command = jest.fn();
    await piFixture({ command, getAvailableThinkingLevels: async () => { if (state === 'failed') throw new Error('fixture'); return { status: 'unavailable', reason: 'legacy' }; } });
    expect(lastControl('等级 / Level').disabled).toBe(true);
    await [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.(); expect(command).not.toHaveBeenCalled();
  });
  it('requires a session for entries and thinking selection', async () => {
    const getAvailableThinkingLevels = jest.fn();
    await piFixture({ listSessions: async () => [], getAvailableThinkingLevels }, 'set_thinking_level');
    expect(getAvailableThinkingLevels).not.toHaveBeenCalled(); expect(lastControl('等级 / Level').disabled).toBe(true);
  });
  it('uses native since IDs and retains the entries/leaf response', async () => {
    const native = { entries: [{ id: 'native-next', parentId: 'native-prev', type: 'custom', future: { untouched: true } }], leafId: 'native-next' };
    const getSessionEntries = jest.fn(async () => native);
    const modal = await piFixture({ getSessionEntries }, 'get_entries');
    await lastControl('原生节点 ID 之后（留空读取全部） / After native entry ID (blank for all)').change?.('native-prev');
    await [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.();
    expect(getSessionEntries).toHaveBeenCalledWith('pi-local', 'native-prev'); expect(JSON.parse(modal.contentEl.querySelector('[aria-live] pre')?.textContent ?? '{}')).toEqual(native);
  });
  it('labels legacy entries as full-history fallback and does not claim since filtering', async () => {
    const getSessionMessages = jest.fn(async () => [{ id: 'original-message', role: 'user', content: 'full transcript' }]);
    const modal = await piFixture({ getSessionEntries: async () => ({ status: 'unavailable', reason: 'legacy' }), getSessionMessages }, 'get_entries');
    await [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.();
    const result = JSON.parse(modal.contentEl.querySelector('[aria-live] pre')?.textContent ?? '{}');
    expect(result).toMatchObject({ status: 'unavailable', fallback: 'full-history', sinceApplied: false });
    expect(result.notice).toContain('full transcript fallback'); expect(result).not.toHaveProperty('leafId'); expect(getSessionMessages).toHaveBeenCalledWith('pi-local');
  });
  it('reports entries failures without silently falling back to history', async () => {
    const getSessionMessages = jest.fn();
    const modal = await piFixture({ getSessionEntries: async () => { throw new Error('Entry not found'); }, getSessionMessages }, 'get_entries');
    await [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.();
    expect(modal.contentEl.textContent).toContain('Entry not found'); expect(getSessionMessages).not.toHaveBeenCalled();
  });
});

it('keeps max stored outside a legacy schema choice and sends only the changed known field', async () => {
  const snapshot = { sdkVersion: 'legacy-schema', fields: [
    { path: 'defaultThinkingLevel', group: 'model', kind: 'choice', options: ['off', 'high'], label: { en: 'Thinking', zh: '思考' } },
    { path: 'defaultModel', group: 'model', kind: 'string', label: { en: 'Default model', zh: '默认模型' } },
  ], scopes: { global: { path: '/fixture/global', revision: 'g', value: {} }, project: { path: '/fixture/project', revision: 'p', value: { defaultThinkingLevel: 'max', future: { opaque: [1, 2, 3] } } } } };
  const command = jest.fn(async () => snapshot); const onSaved = jest.fn(async () => {});
  new SettingsPiConfigurationSection({ command } as unknown as PiAdapter, onSaved, async () => {}).attach(document.body.createDiv(), 'model'); await flush();
  expect(lastControl('Thinking').options).toHaveProperty('max'); expect(lastControl('Thinking').value).toBe('max');
  await lastControl('Default model').change?.('fixture-model');
  await controls.find(control => control.name === t('settings.pi.saveSettings') && control.label === t('settings.pi.save'))?.click?.();
  expect(command).toHaveBeenLastCalledWith(undefined, 'save_configuration', { scope: 'project', revision: 'p', changes: { defaultModel: 'fixture-model' } });
  expect(snapshot.scopes.project.value.future).toEqual({ opaque: [1, 2, 3] });
});

it.each(['returned', 'thrown', 'no-active-session'])('keeps MCP effective state unconfirmed on %s', async failure => {
  const setMcpPermissionModeOverride = async () => {
    if (failure === 'thrown') throw new Error('fixture');
    return { status: failure === 'no-active-session' ? 'unavailable' : 'failed', nativeSessionId: 'sdk-native', reason: failure === 'no-active-session' ? 'no-active-session' : 'request-failed' };
  };
  const { plugin, button, output } = claudeFixture({ setMcpPermissionModeOverride }, 'mcp');
  await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native');
  await lastControl(t('settings.claudeCode.sessionControls.server')).change?.('fixture-mcp');
  await button.click?.();
  expect(output.dataset.runtimeEvidence).toBe(failure === 'no-active-session' ? 'unavailable' : 'failed');
  expect(plugin.saveSettings).not.toHaveBeenCalled();
  expect(output.textContent).not.toContain('Request acknowledged');
});
it('does not read native entries from a catalog-only Pi workbench without a session', async () => {
  const getSessionEntries = jest.fn();
  const modal = await piFixture({ listSessions: async () => [], getSessionEntries }, 'get_entries');
  await [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.();
  expect(getSessionEntries).not.toHaveBeenCalled(); expect(modal.contentEl.textContent).toContain('Select a session first');
});
it('sends advanced JSON with unknown fields intact and rejects invalid JSON before saving', async () => {
  const value = { defaultThinkingLevel: 'max', future: { opaque: [1, { untouched: true }] } };
  const snapshot = { sdkVersion: 'fixture', fields: [], scopes: { global: { path: '/fixture/global', revision: 'g', value: {} }, project: { path: '/fixture/project', revision: 'p', value } } };
  const command = jest.fn(async () => snapshot); const onSaved = jest.fn(async () => {}); const container = document.body.createDiv();
  new SettingsPiConfigurationSection({ command } as unknown as PiAdapter, onSaved, async () => {}).attach(container, 'advanced'); await flush();
  const editor = container.querySelector<HTMLTextAreaElement>('.opencodian-pi-json-editor') as HTMLTextAreaElement;
  const button = controls.find(control => control.settingEl.closest('details') && control.click) as Control;
  editor.value = JSON.stringify({ ...value, futureAdded: { keep: true } }); await button.click?.();
  expect(command).toHaveBeenLastCalledWith(undefined, 'save_configuration', { scope: 'project', revision: 'p', value: { ...value, futureAdded: { keep: true } } });
  const count = command.mock.calls.length; const savedCount = onSaved.mock.calls.length;
  editor.value = '{invalid'; await button.click?.(); expect(command).toHaveBeenCalledTimes(count); expect(onSaved).toHaveBeenCalledTimes(savedCount); expect(editor.value).toBe('{invalid');
});

it('keeps an explicitly empty SDK thinking set disabled without calling it unsupported', async () => {
  await piFixture({ getAvailableThinkingLevels: async () => ({ levels: [] }) });
  const level = lastControl('等级 / Level'); expect(level.disabled).toBe(true);
  expect(level.settingEl.dataset.testDescription).toContain('[]');
  expect(level.settingEl.dataset.testDescription).not.toContain('unavailable');
});

it('drops late Pi entry results when the workbench session changes', async () => {
  let finish!: (value: unknown) => void;
  const modal = await piFixture({ getSessionEntries: () => new Promise(resolve => { finish = resolve; }) }, 'get_entries');
  const run = [...controls].reverse().find(control => control.label === '执行 / Run')?.click?.();
  await lastControl('当前会话 / Session').change?.('pi-local-other');
  finish({ entries: [{ id: 'must-not-display' }], leafId: 'must-not-display' }); await run;
  expect(modal.contentEl.textContent).not.toContain('must-not-display');
});
it('renders an older CLI reload_output_styles rejection as failed without effective state', async () => {
  const { plugin, button, output } = claudeFixture({ reloadOutputStyles: async () => { throw new Error('Unsupported control request subtype: reload_output_styles'); } }, 'styles');
  await lastControl(t('settings.claudeCode.sessionControls.session')).change?.('sdk-native'); await button.click?.();
  expect(output.dataset.controlStatus).toBe('failed'); expect(output.dataset.runtimeEvidence).toBe('failed'); expect(plugin.saveSettings).not.toHaveBeenCalled();
});
