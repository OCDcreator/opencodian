import { Setting } from 'obsidian';

import type { CodexModelSummary } from '../../../../src/core/agents/backend/CodexAdapter';
import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';
import { setLocale } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type TestPlugin = {
  settings: OpenCodianPlugin['settings'];
  saveSettings: jest.Mock;
  app: { workspace: Record<string, unknown> };
  agentServiceRegistry: { get: jest.Mock };
  activateView: jest.Mock;
  createConversationFromBackendSession: jest.Mock;
  loadBackendSessionConversation: jest.Mock;
};

function createPlugin(adapterOverrides: Record<string, unknown> = {}): TestPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        codex: {
          ...getDefaultCodexBackendSettings(),
          apiKey: 'test-key',
          model: 'codex-mini-latest',
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    app: { workspace: {} },
    agentServiceRegistry: {
      get: jest.fn((backend: string) => backend === 'codex' ? adapterOverrides : null),
    },
    activateView: jest.fn().mockResolvedValue(undefined),
    createConversationFromBackendSession: jest.fn().mockResolvedValue('conv-resumed-123'),
    loadBackendSessionConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function ensureControlEl(setting: Setting): HTMLElement {
  const withControl = setting as Setting & { controlEl?: HTMLElement };
  if (!withControl.controlEl) {
    withControl.controlEl = document.createElement('div');
  }
  return withControl.controlEl;
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setClass').mockReturnThis();
  jest.spyOn(Setting.prototype, 'then').mockReturnThis();

  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: {
      setPlaceholder: jest.Mock;
      setValue: jest.Mock;
      onChange: jest.Mock;
    }) => unknown,
  ) {
    const controlEl = ensureControlEl(this);
    const inputEl = document.createElement('input');
    controlEl.appendChild(inputEl);
    const control = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockImplementation((value: string) => {
        inputEl.value = value;
        return control;
      }),
      onChange: jest.fn().mockImplementation((handler: (value: string) => void) => {
        inputEl.addEventListener('change', () => handler(inputEl.value));
        return control;
      }),
    };
    callback(control);
    return this;
  });

  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
    this: Setting,
    callback: (control: {
      selectEl: HTMLSelectElement;
      addOption: jest.Mock;
      setValue: jest.Mock;
      onChange: jest.Mock;
    }) => unknown,
  ) {
    const controlEl = ensureControlEl(this);
    const selectEl = document.createElement('select');
    controlEl.appendChild(selectEl);
    const control = {
      selectEl,
      addOption: jest.fn().mockImplementation((value: string, text: string) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        selectEl.appendChild(option);
        return control;
      }),
      setValue: jest.fn().mockImplementation((value: string) => {
        selectEl.value = value;
        return control;
      }),
      onChange: jest.fn().mockImplementation((handler: (value: string) => void) => {
        selectEl.addEventListener('change', () => handler(selectEl.value));
        return control;
      }),
    };
    callback(control);
    return this;
  });

  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: { setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    ensureControlEl(this);
    const control = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    callback(control);
    return this;
  });

  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
    this: Setting,
    callback: (control: {
      setPlaceholder: jest.Mock;
      setValue: jest.Mock;
      onChange: jest.Mock;
    }) => unknown,
  ) {
    ensureControlEl(this);
    const control = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    callback(control);
    return this;
  });

  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: {
      setButtonText: jest.Mock;
      setDisabled: jest.Mock;
      onClick: jest.Mock;
    }) => unknown,
  ) {
    ensureControlEl(this);
    const control = {
      setButtonText: jest.fn().mockReturnThis(),
      setDisabled: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
    };
    callback(control);
    return this;
  });
}

function modelSummary(slug: string, displayName: string): CodexModelSummary {
  return {
    slug,
    display_name: displayName,
    visibility: 'list',
    supported_in_api: true,
    default_reasoning_level: null,
    description: null,
  };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => { window.setTimeout(resolve, 0); });
}

describe('SettingsCodexSection model selector', () => {
  beforeEach(() => {
    setLocale('en');
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders model dropdown and custom input', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    expect(selectEl).toBeTruthy();
    expect(customInputEl).toBeTruthy();
    expect(selectEl!.value).toBe('__custom__');
    expect(customInputEl!.value).toBe('codex-mini-latest');
  });

  it('populates dropdown from adapter getModelList and selects current known model', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue([
        modelSummary('codex-mini-latest', 'Codex Mini Latest'),
        modelSummary('gpt-5.5', 'GPT-5.5'),
      ]),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    expect(selectEl).toBeTruthy();
    expect(selectEl!.querySelector('option[value="codex-mini-latest"]')).toBeTruthy();
    expect(selectEl!.querySelector('option[value="gpt-5.5"]')).toBeTruthy();
    expect(selectEl!.querySelector('option[value="__custom__"]')).toBeTruthy();
    expect(selectEl!.value).toBe('codex-mini-latest');
    expect(customInputEl!.style.display).toBe('none');
  });

  it('falls back to custom input when current model is not in returned catalog', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue([
        modelSummary('gpt-5.5', 'GPT-5.5'),
      ]),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    expect(selectEl!.value).toBe('__custom__');
    expect(customInputEl!.value).toBe('codex-mini-latest');
    expect(customInputEl!.style.display).not.toBe('none');
  });

  it('falls back to custom input when adapter has no getModelList', async () => {
    const plugin = createPlugin({});
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    expect(selectEl!.value).toBe('__custom__');
    expect(selectEl!.querySelector('option[value="__custom__"]')).toBeTruthy();
    expect(customInputEl!.value).toBe('codex-mini-latest');
  });

  it('persists known model selection and calls updateModel on adapter', async () => {
    const updateModel = jest.fn();
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue([
        modelSummary('codex-mini-latest', 'Codex Mini Latest'),
        modelSummary('gpt-5.5', 'GPT-5.5'),
      ]),
      updateModel,
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    selectEl!.value = 'gpt-5.5';
    selectEl!.dispatchEvent(new Event('change', { bubbles: true }));

    await flushPromises();

    expect(plugin.settings.backendSettings.codex.model).toBe('gpt-5.5');
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(updateModel).toHaveBeenCalledWith('gpt-5.5');
  });

  it('persists custom model input and calls updateModel on adapter', async () => {
    const updateModel = jest.fn();
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue([
        modelSummary('gpt-5.5', 'GPT-5.5'),
      ]),
      updateModel,
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');
    customInputEl!.value = 'my-custom-model';
    customInputEl!.dispatchEvent(new Event('change', { bubbles: true }));

    await flushPromises();

    expect(plugin.settings.backendSettings.codex.model).toBe('my-custom-model');
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(updateModel).toHaveBeenCalledWith('my-custom-model');
  });

  it('clears custom input when switching from custom to known model', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue([
        modelSummary('codex-mini-latest', 'Codex Mini Latest'),
        modelSummary('gpt-5.5', 'GPT-5.5'),
      ]),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    selectEl!.value = '__custom__';
    selectEl!.dispatchEvent(new Event('change', { bubbles: true }));
    customInputEl!.value = 'temp-custom';

    selectEl!.value = 'gpt-5.5';
    selectEl!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(customInputEl!.value).toBe('');
    expect(customInputEl!.style.display).toBe('none');
  });

  it('falls back to custom input when getModelList returns null', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue(null),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    expect(selectEl!.value).toBe('__custom__');
    expect(selectEl!.querySelector('option[value="__custom__"]')).toBeTruthy();
    expect(customInputEl!.value).toBe('codex-mini-latest');
  });

  it('falls back to custom input when getModelList throws', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockRejectedValue(new Error('CLI not found')),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    await flushPromises();

    const selectEl = containerEl.querySelector<HTMLSelectElement>('[data-setting="codex-model"]');
    const customInputEl = containerEl.querySelector<HTMLInputElement>('[data-setting="codex-model-custom"]');

    expect(selectEl!.value).toBe('__custom__');
    expect(customInputEl!.value).toBe('codex-mini-latest');
  });
});
