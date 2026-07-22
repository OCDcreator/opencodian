import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import type { PluginEnvironmentSnapshot } from '../../../../src/core/config/PluginManagementService';
import { PluginManagementService } from '../../../../src/core/config/PluginManagementService';
import type { PluginEvidenceSnapshot } from '../../../../src/core/opencode/OpenCodeEventSubscriptionCoordinator';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsPluginSection } from '../../../../src/features/settings/SettingsPluginSection';
import type OpenCodianPlugin from '../../../../src/main';

export interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

export interface MockTextAreaControl {
  inputEl: HTMLTextAreaElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
}

export const buttonRecords: Array<{
  control: MockButtonControl;
  label?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}> = [];

export function createButtonRecord(name: string) {
  const record = {
    name,
    control: {
      buttonEl: document.createElement('button'),
      onClick: jest.fn(),
      setButtonText: jest.fn(),
      setCta: jest.fn(),
      setDisabled: jest.fn(),
    } as unknown as MockButtonControl,
  };
  record.control.onClick.mockImplementation((callback) => {
    (record as unknown as { onClick?: () => void | Promise<void> }).onClick = callback;
    return record.control;
  });
  record.control.setButtonText.mockImplementation((value) => {
    (record as unknown as { label?: string }).label = value;
    return record.control;
  });
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  buttonRecords.push(record as unknown as typeof buttonRecords[0]);
  return record;
}

export function findButton(label: string): typeof buttonRecords[0] | undefined {
  return buttonRecords.find((record) => record.label === label);
}

export function createEvidenceSnapshot(
  overrides: Partial<PluginEvidenceSnapshot> = {},
): PluginEvidenceSnapshot {
  return {
    connectionGeneration: 'gen-1',
    effective: {
      plugin: ['@scope/runtime-plugin', ['local', { path: './p' }]],
      fetchedAt: 1_700_000_000_000,
      generation: 'gen-1',
      stale: false,
    },
    previousEffective: null,
    fetch: {
      status: 'ready',
      attemptedAt: 1_700_000_000_000,
      generation: 'gen-1',
      error: null,
    },
    runtime: [
      {
        runtimeId: 'runtime-plugin-a',
        firstObservedAt: 1_700_000_000_100,
        lastObservedAt: 1_700_000_000_200,
        generation: 'gen-1',
        stale: false,
        sources: ['event'],
      },
    ],
    staleRuntime: [
      {
        runtimeId: 'runtime-plugin-b',
        firstObservedAt: 1_700_000_000_000,
        lastObservedAt: 1_700_000_000_000,
        generation: 'gen-0',
        stale: true,
        sources: ['global'],
      },
    ],
    transport: {
      wanted: true,
      activeSources: ['event', 'global'],
      captureGeneration: 'gen-1',
      captureStartedAt: 1_700_000_000_000,
    },
    ...overrides,
  };
}

export function createConfigSnapshot(
  serverMode: 'local' | 'remote' = 'local',
  projectSpecs: string[] = ['demo-plugin'],
): PluginEnvironmentSnapshot {
  return {
    serviceMode: serverMode,
    isolationMode: 'default',
    vaultConfigDir: '/vault/.opencode',
    globalConfigPath: '/Users/test/.config/opencode/opencode.json',
    projectConfigPath: '/vault/.opencode/opencode.json',
    globalConfigSpecs: [],
    projectConfigSpecs: projectSpecs,
    globalConfigPlugins: [],
    globalDirectoryPlugins: [],
    projectConfigPlugins: projectSpecs.map((spec) => ({
      kind: 'npm' as const,
      scope: 'project' as const,
      source: 'config' as const,
      specifier: spec,
      displayName: spec,
      disabled: false,
    })),
    projectDirectoryPlugins: [],
    disabledProjectConfigPlugins: [],
    disabledProjectDirectoryPlugins: [],
    globalDirectories: [],
    projectDirectories: [],
    globalInfluenceDetected: false,
    omoConfigPath: '/vault/.opencode/oh-my-opencode.jsonc',
    omoConfigExists: false,
    configSources: [
      {
        scope: 'global',
        path: '/Users/test/.config/opencode/config.json',
        exists: false,
        editable: false,
        specs: [],
        plugins: [],
      },
      {
        scope: 'global',
        path: '/Users/test/.config/opencode/opencode.json',
        exists: true,
        editable: false,
        specs: [],
        plugins: [],
      },
      {
        scope: 'global',
        path: '/Users/test/.config/opencode/opencode.jsonc',
        exists: false,
        editable: false,
        specs: [],
        plugins: [],
      },
      {
        scope: 'project',
        path: '/vault/opencode.json',
        exists: false,
        editable: false,
        specs: [],
        plugins: [],
      },
      {
        scope: 'project',
        path: '/vault/opencode.jsonc',
        exists: true,
        editable: false,
        specs: ['jsonc-plugin'],
        plugins: [
          {
            kind: 'npm',
            scope: 'project',
            source: 'config',
            specifier: 'jsonc-plugin',
            displayName: 'jsonc-plugin',
            disabled: false,
          },
        ],
      },
      {
        scope: 'project',
        path: '/vault/.opencode/opencode.json',
        exists: true,
        editable: true,
        specs: projectSpecs,
        plugins: projectSpecs.map((spec) => ({
          kind: 'npm' as const,
          scope: 'project' as const,
          source: 'config' as const,
          specifier: spec,
          displayName: spec,
          disabled: false,
        })),
      },
      {
        scope: 'project',
        path: '/vault/.opencode/opencode.jsonc',
        exists: false,
        editable: false,
        specs: [],
        plugins: [],
        error: 'malformed JSONC',
      },
    ],
  };
}

export function createSection(options: {
  serverMode?: 'local' | 'remote';
  evidence?: PluginEvidenceSnapshot | null;
  inspectSnapshot?: PluginEnvironmentSnapshot;
} = {}) {
  const app = {
    vault: {
      adapter: {
        basePath: '/vault',
      },
    },
  };
  const evidenceListeners: Array<(snapshot: PluginEvidenceSnapshot) => void> = [];
  const unsubscribe = jest.fn();
  const refreshPluginConfigEvidence = jest.fn().mockResolvedValue(options.evidence ?? createEvidenceSnapshot());
  const getPluginEvidenceSnapshot = jest.fn().mockReturnValue(options.evidence ?? createEvidenceSnapshot());
  const subscribeToOpenCodeEvents = jest.fn().mockImplementation((input) => {
    if (typeof input === 'object' && input !== null && 'onPluginEvidence' in input) {
      evidenceListeners.push((input as { onPluginEvidence: (snapshot: PluginEvidenceSnapshot) => void }).onPluginEvidence);
    }
    const dispose = unsubscribe;
    (dispose as unknown as { getPluginEvidenceSnapshot: jest.Mock }).getPluginEvidenceSnapshot = getPluginEvidenceSnapshot;
    (dispose as unknown as { refreshPluginConfigEvidence: jest.Mock }).refreshPluginConfigEvidence = refreshPluginConfigEvidence;
    return dispose;
  });

  const plugin = {
    app,
    settings: {
      ...DEFAULT_SETTINGS,
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: options.serverMode ?? 'local',
      },
    },
    saveSettings: jest.fn(),
    openCodeService: {
      subscribeToOpenCodeEvents,
    },
  };

  const section = new SettingsPluginSection({
    app: app as unknown as App,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading: (containerEl, title) => containerEl.createEl('h2', { text: title }),
    applyInlineCodeText: (targetEl, text) => {
      if (targetEl) targetEl.textContent = text;
    },
    setSettingNameWithFormatting: (setting, text) => {
      setting.setName(text);
    },
    setSettingDescWithFormatting: (setting, text) => {
      setting.setDesc(text);
    },
  });

  jest.spyOn(PluginManagementService.prototype, 'inspect').mockImplementation(async (serverMode) =>
    options.inspectSnapshot ?? createConfigSnapshot(serverMode ?? 'local'),
  );

  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attach(containerEl);

  return {
    containerEl,
    section,
    plugin,
    evidenceListeners,
    unsubscribe,
    refreshPluginConfigEvidence,
    getPluginEvidenceSnapshot,
    subscribeToOpenCodeEvents,
  };
}

export function createTabbedSection(
  secondaryTabId: string,
  options: {
    serverMode?: 'local' | 'remote';
    evidence?: PluginEvidenceSnapshot | null;
    inspectSnapshot?: PluginEnvironmentSnapshot;
  } = {},
) {
  const app = {
    vault: {
      adapter: {
        basePath: '/vault',
      },
    },
  };
  const evidenceListeners: Array<(snapshot: PluginEvidenceSnapshot) => void> = [];
  const unsubscribe = jest.fn();
  const refreshPluginConfigEvidence = jest.fn().mockResolvedValue(options.evidence ?? createEvidenceSnapshot());
  const getPluginEvidenceSnapshot = jest.fn().mockReturnValue(options.evidence ?? createEvidenceSnapshot());
  const subscribeToOpenCodeEvents = jest.fn().mockImplementation((input) => {
    if (typeof input === 'object' && input !== null && 'onPluginEvidence' in input) {
      evidenceListeners.push((input as { onPluginEvidence: (snapshot: PluginEvidenceSnapshot) => void }).onPluginEvidence);
    }
    const dispose = unsubscribe;
    (dispose as unknown as { getPluginEvidenceSnapshot: jest.Mock }).getPluginEvidenceSnapshot = getPluginEvidenceSnapshot;
    (dispose as unknown as { refreshPluginConfigEvidence: jest.Mock }).refreshPluginConfigEvidence = refreshPluginConfigEvidence;
    return dispose;
  });

  const plugin = {
    app,
    settings: {
      ...DEFAULT_SETTINGS,
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: options.serverMode ?? 'local',
      },
    },
    saveSettings: jest.fn(),
    openCodeService: {
      subscribeToOpenCodeEvents,
    },
  };

  const section = new SettingsPluginSection({
    app: app as unknown as App,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading: (containerEl, title) => containerEl.createEl('h2', { text: title }),
    applyInlineCodeText: (targetEl, text) => {
      if (targetEl) targetEl.textContent = text;
    },
    setSettingNameWithFormatting: (setting, text) => {
      setting.setName(text);
    },
    setSettingDescWithFormatting: (setting, text) => {
      setting.setDesc(text);
    },
  });

  jest.spyOn(PluginManagementService.prototype, 'inspect').mockImplementation(async (serverMode) =>
    options.inspectSnapshot ?? createConfigSnapshot(serverMode ?? 'local'),
  );

  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attachTabbed(containerEl, secondaryTabId);

  return {
    containerEl,
    section,
    plugin,
    evidenceListeners,
    unsubscribe,
    refreshPluginConfigEvidence,
    getPluginEvidenceSnapshot,
    subscribeToOpenCodeEvents,
  };
}

export async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

export function setupSettingMocks(): void {
  jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: { inputEl: HTMLInputElement; setPlaceholder: () => unknown }) => unknown,
  ) {
    callback({ inputEl: document.createElement('input'), setPlaceholder: jest.fn().mockReturnThis() });
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
    this: Setting,
    callback: (control: MockTextAreaControl) => unknown,
  ) {
    callback({
      inputEl: document.createElement('textarea'),
      setPlaceholder: jest.fn().mockReturnThis(),
    } as unknown as MockTextAreaControl);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const record = createButtonRecord(name);
    callback(record.control);
    return this;
  });
}
