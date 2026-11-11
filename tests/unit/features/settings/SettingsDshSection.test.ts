import { Setting } from 'obsidian';

import { validateDshMcpServers } from '../../../../src/core/agents/backend/dsh/DshProtocolCodec';
import type { DshBackendSettings } from '../../../../src/core/types/settings';
import { type DshSettingsHost, SettingsDshSection } from '../../../../src/features/settings/backends/dsh/SettingsDshSection';
import { setLocale, t } from '../../../../src/i18n';

async function settle(): Promise<void> { for (let i = 0; i < 12; i++) await Promise.resolve(); }

/** Drives one native radio card from the shared backend choice control. */
function choose(container: HTMLElement, key: string, value: string): void {
  const radio = container.querySelector<HTMLInputElement>(
    `.opencodian-backend-choice-group[data-backend-key="${key}"] input[value="${value}"]`,
  );
  expect(radio).not.toBeNull();
  radio!.checked = true;
  radio!.dispatchEvent(new Event('change', { bubbles: true }));
}

const pathFields = [
  { field: 'executablePath', nameKey: 'settings.agent.dsh.executable', defaultKey: 'settings.agent.dsh.executable.auto', customKey: 'settings.agent.dsh.executable.custom', saved: '/usr/local/bin/dsh', next: '/opt/bin/dsh' },
  { field: 'workingDirectory', nameKey: 'settings.agent.dsh.workingDirectory', defaultKey: 'settings.agent.dsh.workingDirectory.vault', customKey: 'settings.agent.dsh.workingDirectory.custom', saved: '/tmp/project', next: '/tmp/next-project' },
] as const;

function pathControls(container: HTMLElement, field: 'executablePath' | 'workingDirectory') {
  const row = container.querySelector<HTMLElement>(`.opencodian-dsh-path-setting[data-backend-key="${field}"]`)!;
  expect(row).not.toBeNull();
  const select = row.querySelector<HTMLSelectElement>('select.dropdown')!;
  const holder = row.querySelector<HTMLElement>('.opencodian-dsh-custom-path')!;
  const input = holder.querySelector<HTMLInputElement>('input')!;
  const feedback = row.querySelector<HTMLElement>('[role="status"]')!;
  return { row, select, holder, input, feedback };
}

function changePathMode(select: HTMLSelectElement, value: 'default' | 'custom'): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function changePathValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const actions = new Map<string, () => Promise<void>>();
const textActions = new Map<string, (value: string) => Promise<void>>();
let changeMcpDraft: (value: string) => void = () => {};

function resetSectionHarness(): void {
  setLocale('en');
  actions.clear();
  textActions.clear();
  changeMcpDraft = () => {};
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    (this as Setting & { __name?: string }).__name = name;
    this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.infoEl.createDiv({ cls: 'setting-item-name', text: name });
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, description: string) {
    this.settingEl.createDiv({ cls: 'setting-item-description', text: description });
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl('input');
    const input = {
      inputEl,
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn((handler: (value: string) => Promise<void>) => {
        textActions.set((this as Setting & { __name?: string }).__name ?? '', handler);
        return input;
      }),
    };
    callback(input as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl('textarea');
    const input = {
      inputEl,
      setValue: jest.fn().mockReturnThis(), setPlaceholder: jest.fn().mockReturnThis(),
      onChange: jest.fn((handler: (value: string) => void) => {
        if (this.settingEl.closest('[data-settings-target="dsh-mcp"]')) changeMcpDraft = handler;
        return input;
      }),
    };
    callback(input as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback) {
    let name = '';
    const button = {
      setButtonText: jest.fn((text: string) => { name = text; return button; }),
      setDisabled: jest.fn().mockReturnThis(),
      onClick: jest.fn((handler: () => Promise<void>) => { actions.set(name, handler); return button; }),
    };
    callback(button as never);
    return this;
  });
}

function resetSectionDom(): void {
  jest.restoreAllMocks();
  setLocale('en');
  document.body.innerHTML = '';
}


function mount() {
  const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native' };
  const adapter = {
    status: 'connected' as const,
    start: jest.fn(async () => {}),
    applyMcpConfiguration: jest.fn(async () => 2),
    readSessionConfiguration: jest.fn(async () => ({
      sessionId: 'owned-config', images: true,
      controls: [
        { id: 'model', name: 'Model', value: 'opaque', choices: [{ value: 'opaque', name: 'DeepSeek: DeepSeek-V4.1-Flash' }] },
        { id: 'reasoning_effort', name: 'Reasoning effort', value: 'high', choices: [{ value: 'high', name: 'High: High' }] },
      ],
    })),
  };
  const inlineSettings = {
    inlineEditModelOverrides: {} as Record<string, string>,
    inlineCompletionModelOverrides: {} as Record<string, string>,
  };
  const inlineSave = jest.fn(async () => {});
  const host: DshSettingsHost = {
    getSettings: () => settings, isEnabled: () => true, getAdapter: () => adapter,
    validateMcpServers: validateDshMcpServers, saveSettings: jest.fn(async () => {}),
    modelOverridesHost: { settings: inlineSettings, saveSettings: inlineSave },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  new SettingsDshSection(host).attach(container);
  return { container, adapter, settings, host };
}

function mcpBlock(container: HTMLElement): HTMLElement {
  const block = container.querySelector<HTMLElement>('[data-settings-target="dsh-mcp"]');
  expect(block).not.toBeNull();
  return block!;
}

function mcpFeedback(container: HTMLElement): HTMLElement {
  const feedback = mcpBlock(container).querySelector<HTMLElement>('[role="status"]');
  expect(feedback).not.toBeNull();
  return feedback!;
}

function mcpRawTextarea(container: HTMLElement): HTMLTextAreaElement {
  const textarea = mcpBlock(container).querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${t('settings.agent.dsh.mcp.declarations')}"]`,
  );
  expect(textarea).not.toBeNull();
  return textarea!;
}

function editMcpDraft(container: HTMLElement, value: string): void {
  // The mock textarea wires no DOM events; drive the captured onChange
  // handler exactly like the component would.
  expect(mcpRawTextarea(container)).not.toBeNull();
  changeMcpDraft(value);
}


describe('SettingsDshSection accessible connection controls', () => {
  beforeEach(resetSectionHarness);
  afterEach(resetSectionDom);

  it('names connection fields independently and keeps high-risk launch controls separate', () => {
    const { container } = mount();
    const transportGroup = container.querySelector('.opencodian-backend-choice-group[data-backend-key="transport"]');
    expect(transportGroup?.getAttribute('role')).toBe('radiogroup');
    expect(container.querySelector<HTMLInputElement>('.opencodian-backend-choice-group[data-backend-key="transport"] input[value="native"]')!.checked).toBe(true);
    // Automatic discovery keeps each custom input hidden inside its own row.
    for (const { field, nameKey } of pathFields) {
      const { select, holder, input } = pathControls(container, field);
      expect(select.getAttribute('aria-label')).toBe(t(nameKey));
      expect(select.value).toBe('default');
      expect(Array.from(select.options, (option) => option.value)).toEqual(['default', 'custom']);
      expect(input.getAttribute('aria-label')).toBe(t(nameKey));
      expect(holder.hidden).toBe(true);
    }
    // High-risk launch surface stays inside its own disclosure.
    const launch = container.querySelector('details.opencodian-dsh-launch-advanced');
    expect(launch).not.toBeNull();
    expect(launch!.textContent).toContain(t('settings.agent.dsh.launch.advanced.warn'));
    expect(launch!.querySelector(`textarea[aria-label="${t('settings.agent.dsh.launch.args')}"]`)).not.toBeNull();
    const status = container.querySelector('[role="status"][aria-atomic="true"]')!;
    expect(status.parentElement?.classList.contains('setting-item-info')).toBe(true);
    expect(status.closest('.opencodian-dsh-connection-status')).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(t('settings.agent.dsh.status.connected'));
  });

  it('announces connection changes from the test action', async () => {
    const { container, adapter } = mount();
    await actions.get(t('settings.agent.dsh.testConnection'))?.();
    expect(adapter.start).toHaveBeenCalledTimes(1);
    const status = container.querySelector('[role="status"][aria-atomic="true"]')!;
    expect(status.textContent).toBe(t('settings.agent.dsh.status.connected'));
  });

  it('saves transport through radios and custom paths through select and input changes', async () => {
    const { container, settings, host } = mount();
    choose(container, 'transport', 'acp');
    await settle();
    expect(settings.transport).toBe('acp');
    expect(host.saveSettings).toHaveBeenCalledTimes(1);

    for (const { field, saved } of pathFields) {
      const { select, input } = pathControls(container, field);
      changePathMode(select, 'custom');
      changePathValue(input, ` ${saved} `);
      await settle();
      expect(settings[field]).toBe(saved);
      expect(input.value).toBe(saved);
    }
    expect(host.saveSettings).toHaveBeenCalledTimes(3);
  });

  it('localizes readback field names and removes duplicated effort group labels', async () => {
    setLocale('zh');
    const { container } = mount();
    await actions.get(t('settings.agent.dsh.configuration.read'))?.();
    expect(container.textContent).toContain('模型');
    expect(container.textContent).toContain('推理强度');
    expect(container.textContent).toContain('DeepSeek: DeepSeek-V4.1-Flash');
    expect(container.textContent).not.toContain('Reasoning effort');
    expect(container.textContent).not.toContain('High: High');
    expect(container.textContent).toContain('只读');
  });

});

describe('SettingsDshSection MCP draft lifecycle', () => {
  beforeEach(resetSectionHarness);
  afterEach(resetSectionDom);

  it('keeps an unsaved MCP draft separate from the declarations applied to sessions', async () => {
    const { container, adapter, settings, host } = mount();
    const saved = [{ type: 'http' as const, name: 'saved', url: 'https://saved.invalid/mcp', headers: [] }];
    settings.mcpServers = saved;
    // The saved value arrived after mount, so resync it through the raw draft
    // the same way an external edit would: adopt happens because the draft is
    // not dirty; here we simply edit the draft afterwards.
    editMcpDraft(container, '[{"type":"http","name":"draft","url":"https://draft.invalid/mcp","headers":[]}]');
    expect(mcpFeedback(container).textContent).toBe(t('settings.agent.dsh.mcp.unsaved'));
    await actions.get(t('settings.agent.dsh.mcp.apply'))?.();
    expect(adapter.applyMcpConfiguration).toHaveBeenCalledTimes(1);
    expect(settings.mcpServers).toBe(saved);
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(mcpFeedback(container).textContent).toContain(t('settings.agent.dsh.mcp.draftNotApplied'));
  });

  it('compares saved and applied MCP declarations semantically instead of by JSON formatting', async () => {
    const { container, settings } = mount();
    const command = JSON.stringify(process.execPath);
    settings.mcpServers = [{ name: 'local', command: process.execPath, args: [], env: [] }];
    editMcpDraft(container, `[{"type":"stdio","name":"local","command":${command},"args":[],"env":[]}]`);
    await actions.get(t('settings.agent.dsh.mcp.apply'))?.();
    const feedback = mcpFeedback(container);

    expect(feedback.textContent).toBe(t('settings.agent.dsh.mcp.applied', { count: 2 }));
    expect(feedback.textContent).not.toContain(t('settings.agent.dsh.mcp.draftNotApplied'));
    expect(settings.mcpServers).toEqual([{ name: 'local', command: process.execPath, args: [], env: [] }]);
  });

  it('retains saved declarations and offers recovery after invalid MCP JSON', async () => {
    const { container, settings, host } = mount();
    const saved = [{ type: 'http' as const, name: 'saved', url: 'https://saved.invalid/mcp', headers: [] }];
    settings.mcpServers = saved;
    editMcpDraft(container, '[');
    await actions.get(t('settings.agent.dsh.save'))?.();
    expect(settings.mcpServers).toBe(saved);
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(mcpFeedback(container).textContent).not.toBe('');
    editMcpDraft(container, '[]');
    expect(actions.has(t('settings.agent.dsh.save'))).toBe(true);
    await actions.get(t('settings.agent.dsh.save'))!();
    expect(settings.mcpServers).toEqual([]);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(mcpFeedback(container).textContent).toBe(t('settings.agent.dsh.mcp.saved'));
  });

  it('offers the empty no-tools default and adds a guided stdio server through the form', async () => {
    const { container, settings, host } = mount();
    expect(mcpBlock(container).textContent).toContain(t('settings.agent.dsh.mcp.empty'));
    expect(mcpBlock(container).textContent).toContain(t('settings.agent.dsh.mcp.emptyDesc'));

    await actions.get(t('settings.agent.dsh.mcp.kind.stdio'))?.();
    expect(mcpBlock(container).querySelector('[data-dsh-mcp-server="0"]')).not.toBeNull();
    await textActions.get(t('settings.agent.dsh.mcp.name'))!('tools ');
    await textActions.get(t('settings.agent.dsh.mcp.command'))!('/bin/ls');
    expect(mcpFeedback(container).textContent).toBe(t('settings.agent.dsh.mcp.unsaved'));

    await actions.get(t('settings.agent.dsh.save'))?.();
    expect(settings.mcpServers).toEqual([{ name: 'tools', command: '/bin/ls', args: [], env: [] }]);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(mcpFeedback(container).textContent).toBe(t('settings.agent.dsh.mcp.saved'));
  });

  it('reverts the guided draft back to the saved declarations', async () => {
    const { container, settings } = mount();
    const saved = [{ type: 'http' as const, name: 'saved', url: 'https://saved.invalid/mcp', headers: [] }];
    settings.mcpServers = saved;
    editMcpDraft(container, '[{"type":"http","name":"draft","url":"https://draft.invalid/mcp","headers":[]}]');
    expect(mcpFeedback(container).textContent).toBe(t('settings.agent.dsh.mcp.unsaved'));
    await actions.get(t('settings.agent.dsh.mcp.revert'))?.();
    await settle();
    expect(settings.mcpServers).toBe(saved);
    expect(mcpFeedback(container).textContent).toBe('');
  });
});

describe('SettingsDshSection model overrides', () => {
  const setLocaleForEach = () => setLocale('en');
  beforeAll(setLocaleForEach);

  function mountModel(layout: 'classic' | 'tabbed') {
    const settingNames: string[] = [];
    const textChanges = new Map<string, (value: string) => Promise<void>>();
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
      settingNames.push(name);
      (this as Setting & { __name?: string }).__name = name;
      this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' });
      this.infoEl.createDiv({ cls: 'setting-item-name', text: name });
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
    jest.spyOn(Setting.prototype, 'setClass').mockReturnThis();
    jest.spyOn(Setting.prototype, 'addButton').mockReturnThis();
    jest.spyOn(Setting.prototype, 'addToggle').mockReturnThis();
    jest.spyOn(Setting.prototype, 'addDropdown').mockReturnThis();
    jest.spyOn(Setting.prototype, 'addTextArea').mockReturnThis();
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback) {
      const input = {
        inputEl: document.createElement('input'),
        setPlaceholder: () => input,
        setValue: () => input,
        onChange: (handler: (value: string) => Promise<void>) => {
          textChanges.set((this as Setting & { __name?: string }).__name ?? '', handler);
          return input;
        },
      };
      callback(input as never);
      return this;
    });
    const settings: DshBackendSettings = {
      executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native',
    };
    const inlineSettings = {
      inlineEditModelOverrides: {} as Record<string, string>,
      inlineCompletionModelOverrides: {} as Record<string, string>,
    };
    const inlineSave = jest.fn(async () => {});
    const host: DshSettingsHost = {
      getSettings: () => settings,
      isEnabled: () => true,
      getAdapter: () => undefined,
      validateMcpServers: validateDshMcpServers,
      saveSettings: jest.fn(async () => {}),
      modelOverridesHost: { settings: inlineSettings, saveSettings: inlineSave },
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const section = new SettingsDshSection(host);
    if (layout === 'classic') section.attach(container);
    else section.attachTabbed(container, 'model');
    return { container, inlineSettings, inlineSave, textChanges, settingNames };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it.each(['classic', 'tabbed'] as const)(
    'renders and saves both DSH model overrides in the %s layout',
    async (layout) => {
      const { container, inlineSettings, inlineSave, textChanges } = mountModel(layout);
      const editName = t('settings.inlineEdit.override.name', { backend: 'dsh' });
      const completionName = t('settings.inlineCompletion.modelOverride.name', { backend: 'dsh' });
      expect(textChanges.has(editName)).toBe(true);
      expect(textChanges.has(completionName)).toBe(true);
      const blockEl = container.querySelector<HTMLElement>('[data-settings-target="dsh-model"]');
      expect(blockEl).not.toBeNull();
      const bodyEl = blockEl!.querySelector<HTMLElement>(':scope > .opencodian-settings-block-body');
      expect(bodyEl).not.toBeNull();
      expect(bodyEl?.dataset.settingsSurface).toBe('section-body');
      expect(bodyEl?.querySelector('.opencodian-dsh-settings')).not.toBeNull();

      await textChanges.get(editName)!('deepseek/edit');
      await textChanges.get(completionName)!('deepseek/fast');
      expect(inlineSettings.inlineEditModelOverrides.dsh).toBe('deepseek/edit');
      expect(inlineSettings.inlineCompletionModelOverrides.dsh).toBe('deepseek/fast');
      expect(inlineSave).toHaveBeenCalledTimes(2);
    },
  );

  it('does not show DSH overrides on the connection tab', () => {
    const { container } = mountModel('tabbed');
    // mountModel('tabbed') renders model; render connection explicitly instead.
    const connectionContainer = document.createElement('div');
    const host: DshSettingsHost = {
      getSettings: () => ({ executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native' }),
      isEnabled: () => true,
      getAdapter: () => undefined,
      validateMcpServers: validateDshMcpServers,
      saveSettings: jest.fn(async () => {}),
      modelOverridesHost: {
        settings: { inlineEditModelOverrides: {}, inlineCompletionModelOverrides: {} },
        saveSettings: jest.fn(async () => {}),
      },
    };
    new SettingsDshSection(host).attachTabbed(connectionContainer, 'connection');
    expect(connectionContainer.querySelector('[data-settings-target="dsh-connection"]')).not.toBeNull();
    expect(connectionContainer.textContent).not.toContain(t('settings.inlineEdit.override.name', { backend: 'dsh' }));
    expect(container.querySelector('[data-settings-target="dsh-model"]')).not.toBeNull();
  });
});

describe('SettingsDshSection native task navigation seam', () => {
  beforeEach(resetSectionHarness);
  afterEach(resetSectionDom);

  function mountTabbed(tabId: string, navigate?: (task: 'model' | 'configuration') => void) {
    const settings: DshBackendSettings = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native' };
    const host: DshSettingsHost = {
      getSettings: () => settings, isEnabled: () => true, getAdapter: () => undefined,
      validateMcpServers: validateDshMcpServers, saveSettings: jest.fn(async () => {}),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const section = new SettingsDshSection(host);
    if (navigate) section.attachTabbed(container, tabId, navigate);
    else section.attach(container);
    return { container };
  }

  it('renders advanced cross-task links only through the tabbed navigation callback', () => {
    const navigate = jest.fn();
    const { container } = mountTabbed('advanced', navigate);
    const links = container.querySelector('[data-native-task-links="advanced"]');
    expect(links).not.toBeNull();
    const anchors = [...links!.querySelectorAll('a')];
    expect(anchors).toHaveLength(2);
    (anchors[0] as HTMLAnchorElement).click();
    expect(navigate).toHaveBeenCalledWith('model');
    (anchors[1] as HTMLAnchorElement).click();
    expect(navigate).toHaveBeenCalledWith('configuration');
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('keeps the stacked section surface free of dead navigation links', () => {
    const { container } = mountTabbed('advanced');
    expect(container.querySelector('[data-native-task-links="advanced"]')).toBeNull();
    // Extension management moved to the configuration block, also when stacked.
    expect(container.querySelector('[data-settings-target="dsh-advanced"] .opencodian-dsh-extensions-workspace')).toBeNull();
    expect(container.querySelector('[data-settings-target="dsh-configuration"] .opencodian-dsh-extensions-workspace')).not.toBeNull();
    expect(container.querySelector('[data-settings-target="dsh-advanced"]')).not.toBeNull();
  });
});
