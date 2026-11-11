import { Setting } from 'obsidian';

import { validateDshMcpServers } from '../../../../src/core/agents/backend/dsh/DshProtocolCodec';
import type { DshBackendSettings } from '../../../../src/core/types/settings';
import { type DshSettingsHost, SettingsDshSection } from '../../../../src/features/settings/backends/dsh/SettingsDshSection';
import { enhanceSettingsDropdowns } from '../../../../src/features/settings/controls/SettingsDropdownControl';
import { setLocale, t } from '../../../../src/i18n';

const pathFields = [
  { field: 'executablePath', nameKey: 'settings.agent.dsh.executable', defaultKey: 'settings.agent.dsh.executable.auto', customKey: 'settings.agent.dsh.executable.custom', saved: '/usr/local/bin/dsh', next: '/opt/bin/dsh' },
  { field: 'workingDirectory', nameKey: 'settings.agent.dsh.workingDirectory', defaultKey: 'settings.agent.dsh.workingDirectory.vault', customKey: 'settings.agent.dsh.workingDirectory.custom', saved: '/tmp/project', next: '/tmp/next-project' },
] as const;

async function settlePathChanges(): Promise<void> { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function mountPathSettings() {
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native' };
  const host: DshSettingsHost = {
    getSettings: () => settings,
    isEnabled: () => true,
    getAdapter: () => undefined,
    validateMcpServers: validateDshMcpServers,
    saveSettings: jest.fn(async () => {}),
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  new SettingsDshSection(host).attachTabbed(container, 'connection');
  return { container, settings, host };
}

function getPathSetting(container: HTMLElement, field: 'executablePath' | 'workingDirectory') {
  const row = container.querySelector<HTMLElement>(`.opencodian-dsh-path-setting[data-backend-key="${field}"]`)!;
  expect(row).not.toBeNull();
  const select = row.querySelector<HTMLSelectElement>('select.dropdown')!;
  const holder = row.querySelector<HTMLElement>('.opencodian-dsh-custom-path')!;
  const input = holder.querySelector<HTMLInputElement>('input')!;
  const feedback = row.querySelector<HTMLElement>('[role="status"]')!;
  return { row, select, holder, input, feedback };
}

function selectPathMode(select: HTMLSelectElement, value: 'default' | 'custom'): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function editCustomPath(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  setLocale('en');
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.infoEl.createDiv({ cls: 'setting-item-name', text: name });
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, description: string) {
    this.settingEl.createDiv({ cls: 'setting-item-description', text: description });
    return this;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  setLocale('en');
  document.body.innerHTML = '';
});

describe('SettingsDshSection path persistence', () => {
  it.each(pathFields)('reveals $field in the same row without saving the custom selection', async ({ field }) => {
    const { container, settings, host } = mountPathSettings();
    const { row, select, holder, input, feedback } = getPathSetting(container, field);
    selectPathMode(select, 'custom');
    await settlePathChanges();

    expect(holder.hidden).toBe(false);
    expect(input.closest('.setting-item')).toBe(row);
    expect(input.closest('.setting-item-control')).toBe(select.parentElement);
    expect(document.activeElement).toBe(input);
    expect(settings[field]).toBe('');
    expect(feedback.textContent).toBe('');
    expect(host.saveSettings).not.toHaveBeenCalled();
  });

  it.each(pathFields)('commits trimmed $field on change and disables the row until saving finishes', async ({ field, saved }) => {
    const { container, settings, host } = mountPathSettings();
    const { select, input, feedback } = getPathSetting(container, field);
    let finishSave!: () => void;
    jest.mocked(host.saveSettings).mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
    selectPathMode(select, 'custom');
    input.value = ` ${saved} `;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(settings[field]).toBe('');

    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(input.value).toBe(saved);
    expect(select.disabled).toBe(true);
    expect(input.disabled).toBe(true);
    finishSave();
    await settlePathChanges();

    expect(settings[field]).toBe(saved);
    expect(select.disabled).toBe(false);
    expect(input.disabled).toBe(false);
    expect(feedback.textContent).toBe(t('settings.agent.dsh.connection.saved'));
    expect(feedback.getAttribute('aria-live')).toBe('polite');
  });

  it.each(pathFields.flatMap((field) => [{ ...field, previous: '' }, { ...field, previous: field.saved }]))(
    'restores $field after a failed input save (previous: "$previous")', async ({ field, previous, next }) => {
      const { container, settings, host } = mountPathSettings();
      const { select, holder, input, feedback } = getPathSetting(container, field);
      selectPathMode(select, 'custom');
      if (previous) {
        editCustomPath(input, previous);
        await settlePathChanges();
      }
      jest.mocked(host.saveSettings).mockClear().mockRejectedValueOnce(new Error('private write failure'));
      editCustomPath(input, next);
      await settlePathChanges();

      expect(host.saveSettings).toHaveBeenCalledTimes(1);
      expect(settings[field]).toBe(previous);
      expect(input.value).toBe(previous);
      expect(select.value).toBe(previous ? 'custom' : 'default');
      expect(holder.hidden).toBe(!previous);
      expect(select.disabled).toBe(false);
      expect(input.disabled).toBe(false);
      expect(feedback.textContent).toBe(t('settings.backend.recovery.failed'));
      expect(container.textContent).not.toContain('private write failure');
    },
  );

  it.each(pathFields)('keeps the saved $field when the custom input becomes blank', async ({ field, saved }) => {
    setLocale('zh');
    const { container, settings, host } = mountPathSettings();
    const { select, holder, input, feedback } = getPathSetting(container, field);
    selectPathMode(select, 'custom');
    editCustomPath(input, saved);
    await settlePathChanges();
    jest.mocked(host.saveSettings).mockClear();
    editCustomPath(input, '   ');
    await settlePathChanges();

    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(settings[field]).toBe(saved);
    expect(input.value).toBe('');
    expect(select.value).toBe('custom');
    expect(holder.hidden).toBe(false);
    expect(feedback.textContent).toBe(t('settings.agent.dsh.path.required'));
    expect(feedback.textContent).not.toBe('settings.agent.dsh.path.required');
  });

  it.each(pathFields)('restores $field after a failed default reset and allows retrying it', async ({ field, saved }) => {
    const { container, settings, host } = mountPathSettings();
    const { select, holder, input, feedback } = getPathSetting(container, field);
    selectPathMode(select, 'custom');
    editCustomPath(input, saved);
    await settlePathChanges();
    jest.mocked(host.saveSettings).mockClear().mockRejectedValueOnce(new Error('default reset failed'));
    selectPathMode(select, 'default');
    await settlePathChanges();

    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(settings[field]).toBe(saved);
    expect(select.value).toBe('custom');
    expect(input.value).toBe(saved);
    expect(holder.hidden).toBe(false);
    expect(select.disabled).toBe(false);
    expect(input.disabled).toBe(false);
    expect(feedback.textContent).toBe(t('settings.backend.recovery.failed'));
    selectPathMode(select, 'default');
    await settlePathChanges();

    expect(host.saveSettings).toHaveBeenCalledTimes(2);
    expect(settings[field]).toBe('');
    expect(select.value).toBe('default');
    expect(input.value).toBe('');
    expect(holder.hidden).toBe(true);
    expect(feedback.textContent).toBe(t('settings.agent.dsh.connection.saved'));
  });

  it.each(pathFields)('reuses the single $field input across repeated mode toggles', async ({ field }) => {
    const { container, host } = mountPathSettings();
    const { row, select, holder, input } = getPathSetting(container, field);
    for (let index = 0; index < 3; index++) {
      selectPathMode(select, 'custom');
      expect(holder.hidden).toBe(false);
      expect(row.querySelectorAll('.opencodian-dsh-custom-path input')).toHaveLength(1);
      expect(row.querySelector('.opencodian-dsh-custom-path input')).toBe(input);
      expect(host.saveSettings).toHaveBeenCalledTimes(index);
      selectPathMode(select, 'default');
      await settlePathChanges();
      expect(holder.hidden).toBe(true);
    }
    expect(container.querySelectorAll('.opencodian-dsh-custom-path input')).toHaveLength(2);
    expect(host.saveSettings).toHaveBeenCalledTimes(3);
  });
});

describe('SettingsDshSection custom dropdown integration', () => {
  it.each(pathFields)('drives $field through the root enhancer trigger and portal menu', async ({ field, nameKey, defaultKey, customKey, saved }) => {
    const { container, settings, host } = mountPathSettings();
    const enhancer = enhanceSettingsDropdowns(container);
    try {
      const { row, select, holder, input, feedback } = getPathSetting(container, field);
      const trigger = row.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;
      expect(trigger).not.toBeNull();
      expect(trigger.getAttribute('role')).toBe('combobox');
      expect(trigger.getAttribute('aria-label')).toBe(t(nameKey));
      expect(trigger.textContent).toBe(t(defaultKey));
      expect(select.classList.contains('opencodian-settings-native-select')).toBe(true);
      expect(select.getAttribute('aria-hidden')).toBe('true');
      expect(select.tabIndex).toBe(-1);
      expect(holder.hidden).toBe(true);
      expect(container.querySelectorAll('.opencodian-settings-dropdown-trigger')).toHaveLength(2);

      trigger.click();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      const menu = document.getElementById(trigger.getAttribute('aria-controls')!)!;
      expect(menu.parentElement).toBe(document.body);
      expect(menu.getAttribute('role')).toBe('listbox');
      expect(Array.from(menu.querySelectorAll('[role="option"]'), (option) => option.getAttribute('data-value'))).toEqual(['default', 'custom']);
      menu.querySelector<HTMLButtonElement>('[data-value="custom"]')!.click();
      await settlePathChanges();
      expect(select.value).toBe('custom');
      expect(trigger.textContent).toBe(t(customKey));
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(holder.hidden).toBe(false);
      expect(document.activeElement).toBe(input);
      expect(host.saveSettings).not.toHaveBeenCalled();

      editCustomPath(input, saved);
      await settlePathChanges();
      jest.mocked(host.saveSettings).mockRejectedValueOnce(new Error('dropdown reset failed'));
      trigger.click();
      menu.querySelector<HTMLButtonElement>('[data-value="default"]')!.click();
      await settlePathChanges();
      expect(settings[field]).toBe(saved);
      expect(select.value).toBe('custom');
      expect(trigger.textContent).toBe(t(customKey));
      expect(trigger.disabled).toBe(false);
      expect(input.value).toBe(saved);
      expect(holder.hidden).toBe(false);
      expect(feedback.textContent).toBe(t('settings.backend.recovery.failed'));

      trigger.click();
      menu.querySelector<HTMLButtonElement>('[data-value="default"]')!.click();
      await settlePathChanges();
      expect(settings[field]).toBe('');
      expect(select.value).toBe('default');
      expect(trigger.textContent).toBe(t(defaultKey));
      expect(holder.hidden).toBe(true);
      expect(host.saveSettings).toHaveBeenCalledTimes(3);
      enhancer.refresh();
      expect(row.querySelectorAll('.opencodian-settings-dropdown-trigger')).toHaveLength(1);
      expect(row.querySelectorAll('.opencodian-dsh-custom-path input')).toHaveLength(1);
      // Destroy with a live portal so lifecycle cleanup is exercised too.
      trigger.click();
      expect(menu.parentElement).toBe(document.body);
    } finally {
      enhancer.destroy();
    }
    expect(container.querySelector('.opencodian-settings-dropdown-trigger')).toBeNull();
    expect(document.body.querySelector('.opencodian-settings-dropdown-menu')).toBeNull();
  });
});

describe('DSH connection backup placement', () => {
  it.each(['connection', 'model', 'mcp', 'configuration'])('only keeps the backup on connection when opening %s', (tab) => {
    const { host } = mountPathSettings();
    const container = document.body.createDiv();
    container.dataset.backendWorkspace = 'dsh';
    const bar = container.createDiv({ cls: 'opencodian-backend-workspace-bar' });
    const missingProgram = container.createDiv({ attr: { 'data-backend-installation': 'missing' } });

    new SettingsDshSection(host).attachTabbed(container, tab);

    expect(container.dataset.backendWorkspace).toBe('dsh');
    expect(missingProgram.parentElement).toBe(container);
    const onConnection = tab === 'connection';
    expect(bar.parentElement).toBe(onConnection ? container : null);
    expect(container.querySelector('.opencodian-backend-workspace-bar')).toBe(onConnection ? bar : null);
    expect(container.lastElementChild === bar).toBe(onConnection);
    expect(host.saveSettings).not.toHaveBeenCalled();
  });
});
