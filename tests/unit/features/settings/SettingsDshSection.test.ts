import { Setting } from 'obsidian';

import { validateDshMcpServers } from '../../../../src/core/agents/backend/dsh/DshProtocolCodec';
import type { DshBackendSettings } from '../../../../src/core/types/settings';
import { type DshSettingsHost,SettingsDshSection } from '../../../../src/features/settings/backends/dsh/SettingsDshSection';
import { setLocale, t } from '../../../../src/i18n';

describe('SettingsDshSection accessible connection and readback', () => {
  const actions = new Map<string, () => Promise<void>>();
  let changeMcpDraft: (value: string) => void;

  beforeEach(() => {
    setLocale('en');
    actions.clear();
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
      this.settingEl.createDiv({ cls: 'setting-item-name', text: name });
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, description: string) {
      this.settingEl.createDiv({ cls: 'setting-item-description', text: description });
      return this;
    });
    jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, callback) {
      const selectEl = this.controlEl.createEl('select');
      const dropdown = {
        selectEl,
        addOption: jest.fn().mockReturnThis(), setValue: jest.fn().mockReturnThis(), onChange: jest.fn().mockReturnThis(),
      };
      callback(dropdown as never);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback) {
      const inputEl = this.controlEl.createEl('input');
      const input = {
        inputEl,
        setPlaceholder: jest.fn().mockReturnThis(), setValue: jest.fn().mockReturnThis(), onChange: jest.fn().mockReturnThis(),
      };
      callback(input as never);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function (this: Setting, callback) {
      const inputEl = this.controlEl.createEl('textarea');
      const input = {
        inputEl,
        setValue: jest.fn().mockReturnThis(), setPlaceholder: jest.fn().mockReturnThis(),
        onChange: jest.fn((handler: (value: string) => void) => { changeMcpDraft = handler; return input; }),
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setLocale('en');
  });

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
    const host: DshSettingsHost = {
      getSettings: () => settings, isEnabled: () => true, getAdapter: () => adapter,
      validateMcpServers: validateDshMcpServers, saveSettings: jest.fn(async () => {}),
    };
    const container = document.createElement('div');
    new SettingsDshSection(host).attach(container);
    return { container, adapter, settings, host };
  }

  it('names connection fields independently from placeholders and announces connection changes', async () => {
    const { container, adapter } = mount();
    expect(container.querySelector('select')?.getAttribute('aria-label')).toBe(t('settings.agent.dsh.transport'));
    expect(Array.from(container.querySelectorAll('input')).map((input) => input.getAttribute('aria-label')))
      .toEqual([t('settings.agent.dsh.executable'), t('settings.agent.dsh.workingDirectory')]);
    const status = container.querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(t('settings.agent.dsh.status.connected'));
    await actions.get(t('settings.agent.dsh.testConnection'))?.();
    expect(adapter.start).toHaveBeenCalledTimes(1);
    expect(status.textContent).toBe(t('settings.agent.dsh.status.connected'));
  });

  it('uses the visible MCP declaration label as the editor accessible name', () => {
    const { container } = mount();

    expect(container.querySelector('textarea')?.getAttribute('aria-label')).toBe(t('settings.agent.dsh.mcp.declarations'));
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
  });

  it('keeps an unsaved MCP draft separate from the declarations applied to sessions', async () => {
    const { container, adapter, settings, host } = mount();
    const saved = [{ type: 'http' as const, name: 'saved', url: 'https://saved.invalid/mcp', headers: [] }];
    settings.mcpServers = saved;
    changeMcpDraft('[{"type":"http","name":"draft","url":"https://draft.invalid/mcp","headers":[]}]');
    const feedback = container.querySelector('details [role="status"]')!;
    expect(feedback.textContent).toBe(t('settings.agent.dsh.mcp.unsaved'));
    await actions.get(t('settings.agent.dsh.mcp.apply'))?.();
    expect(adapter.applyMcpConfiguration).toHaveBeenCalledTimes(1);
    expect(settings.mcpServers).toBe(saved);
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(feedback.textContent).toContain(t('settings.agent.dsh.mcp.draftNotApplied'));
  });

  it('compares saved and applied MCP declarations semantically instead of by JSON formatting', async () => {
    const { container, settings } = mount();
    const command = JSON.stringify(process.execPath);
    changeMcpDraft(`[{"type":"stdio","name":"local","command":${command},"args":[],"env":[]}]`);
    await actions.get(t('settings.agent.dsh.save'))?.();
    expect(settings.mcpServers).toEqual([{ name: 'local', command: process.execPath, args: [], env: [] }]);
    await actions.get(t('settings.agent.dsh.mcp.apply'))?.();
    const feedback = container.querySelector('details [role="status"]')!;

    expect(feedback.textContent).toBe(t('settings.agent.dsh.mcp.applied', { count: 2 }));
    expect(feedback.textContent).not.toContain(t('settings.agent.dsh.mcp.draftNotApplied'));
  });

  it('retains saved declarations and offers recovery after invalid MCP JSON', async () => {
    const { container, settings, host } = mount();
    const saved = [{ type: 'http' as const, name: 'saved', url: 'https://saved.invalid/mcp', headers: [] }];
    settings.mcpServers = saved;
    changeMcpDraft('{');
    await actions.get(t('settings.agent.dsh.save'))?.();
    const feedback = container.querySelector('details [role="status"]')!;
    expect(settings.mcpServers).toBe(saved);
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(feedback.textContent).not.toBe('');
    changeMcpDraft('[]');
    await actions.get(t('settings.agent.dsh.save'))?.();
    expect(settings.mcpServers).toEqual([]);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(feedback.textContent).toBe(t('settings.agent.dsh.mcp.saved'));
  });
});
