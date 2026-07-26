/* eslint-disable max-lines-per-function -- G10b contract coverage keeps the five readback states and structured hook fields together. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Modal, Setting } from 'obsidian';

import type { AppServerHooksReadbackResult } from '../../../../src/core/agents/backend/CodexAppServerClientTypes';
import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import {
  SettingsCodexHooksReadbackModal,
} from '../../../../src/features/settings/SettingsCodexReadbackControls';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';
import { setLocale, t } from '../../../../src/i18n';
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

type ButtonRecord = {
  label?: string;
  buttonEl: HTMLButtonElement;
  onClick?: () => void;
};

const buttonRecords: ButtonRecord[] = [];

function createPlugin(adapter: Record<string, unknown> = {}): TestPlugin {
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
      get: jest.fn((backend: string) => backend === 'codex' ? adapter : null),
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

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setClass').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: { setButtonText: jest.Mock; setTooltip: jest.Mock; onClick: jest.Mock; buttonEl: HTMLButtonElement }) => unknown,
  ) {
    const record: ButtonRecord = { buttonEl: document.createElement('button') };
    const control = {
      buttonEl: record.buttonEl,
      setButtonText: jest.fn().mockImplementation((label: string) => {
        record.label = label;
        record.buttonEl.textContent = label;
        return control;
      }),
      setTooltip: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockImplementation((handler: () => void) => {
        record.onClick = handler;
        return control;
      }),
    };
    buttonRecords.push(record);
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addTextArea').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addDropdown').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addToggle').mockReturnThis();
  jest.spyOn(Setting.prototype, 'then').mockReturnThis();
}

function availableResult(): AppServerHooksReadbackResult {
  return {
    status: 'available',
    groups: [{
      cwd: '/vault/project',
      warnings: ['hook warning'],
      errors: [{ path: 'hooks/build', message: 'hook diagnostic' }],
      hooks: [{
        key: 'build-hook',
        eventName: 'AfterBuild',
        handlerType: 'command',
        matcher: 'src/**',
        command: 'node scripts/build.mjs',
        timeoutSec: 15,
        statusMessage: 'ready',
        sourcePath: '/vault/project/.codex/hooks.json',
        source: 'project',
        pluginId: 'plugin.example',
        displayOrder: 2,
        enabled: true,
        isManaged: false,
        currentHash: 'sha256:abc',
        trustStatus: 'trusted',
      }],
    }],
  };
}

async function openModal(result: AppServerHooksReadbackResult | (() => Promise<AppServerHooksReadbackResult>)) {
  const adapter = {
    getHooksReadback: typeof result === 'function' ? result : jest.fn().mockResolvedValue(result),
  };
  const modal = new SettingsCodexHooksReadbackModal({ app: {} as never, adapter });
  modal.onOpen();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  return { modal, adapter };
}

beforeEach(() => {
  setLocale('en');
  buttonRecords.length = 0;
  document.body.innerHTML = '';
  mockSettingPrototype();
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Codex Hooks readback (G10b)', () => {
  it('announces loading through a live status region until the adapter settles', async () => {
    let release: (value: AppServerHooksReadbackResult) => void = () => {};
    const adapter = {
      getHooksReadback: jest.fn(() => new Promise<AppServerHooksReadbackResult>((resolve) => { release = resolve; })),
    };
    const modal = new SettingsCodexHooksReadbackModal({ app: {} as never, adapter });
    modal.onOpen();

    const status = modal.contentEl.querySelector('[data-hooks-readback-status]');
    expect(status?.textContent).toBe(t('settings.codex.hooks.statusLoading'));
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-busy')).toBe('true');

    release({ status: 'failed', groups: [] });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(status?.getAttribute('aria-busy')).toBe('false');
    expect(status?.textContent).toBe(t('settings.codex.hooks.statusFailed'));
  });

  it('renders a Resume & Inspect trigger with an accessible, keyboard-capable button', () => {
    const plugin = createPlugin({ getHooksReadback: jest.fn() });
    const section = new SettingsCodexSection({ plugin: plugin as never, createSectionHeading });
    const container = document.createElement('div');
    section.attachTabbed(container, 'resume-inspect');

    const trigger = container.querySelector<HTMLButtonElement>('[data-codex-hooks-readback-button="true"]');
    expect(trigger).toBeDefined();
    expect(trigger?.getAttribute('type')).toBe('button');
    expect(trigger?.getAttribute('aria-label')).toBe(t('settings.codex.hooks.inspectButton'));
  });

  it('opens the dedicated readback modal from the trigger', () => {
    const getHooksReadback = jest.fn().mockResolvedValue({ status: 'empty', groups: [] });
    const plugin = createPlugin({ getHooksReadback });
    const section = new SettingsCodexSection({ plugin: plugin as never, createSectionHeading });
    const container = document.createElement('div');
    section.attachTabbed(container, 'resume-inspect');

    const trigger = container.querySelector<HTMLButtonElement>('[data-codex-hooks-readback-button="true"]');
    const openSpy = jest.spyOn(Modal.prototype, 'open');
    trigger?.click();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(getHooksReadback).not.toHaveBeenCalled();
  });

  it.each([
    ['available', 'settings.codex.hooks.statusAvailable'],
    ['empty', 'settings.codex.hooks.statusEmpty'],
    ['unavailable', 'settings.codex.hooks.statusUnavailable'],
    ['failed', 'settings.codex.hooks.statusFailed'],
    ['malformed', 'settings.codex.hooks.statusMalformed'],
  ] as const)('renders the %s state without exposing adapter error details', async (status, key) => {
    const { modal, adapter } = await openModal({ status, groups: [], errorReason: 'secret raw adapter detail' });
    expect(adapter.getHooksReadback).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.querySelector('[data-hooks-readback-status]')?.textContent).toBe(t(key));
    expect(modal.contentEl.textContent).not.toContain('secret raw adapter detail');
  });

  it('renders nonempty groups and hooks as structured fields, diagnostics, and selectable paths', async () => {
    const { modal } = await openModal(availableResult());
    const content = modal.contentEl;

    expect(content.querySelector('[data-hooks-readback-status="available"]')).toBeTruthy();
    expect(content.querySelector('[data-hooks-group-cwd="/vault/project"]')?.textContent).toContain('/vault/project');
    expect(content.querySelector('[data-hook-field="source"]')?.textContent).toContain('project');
    expect(content.querySelector('[data-hook-field="sourcePath"]')?.textContent).toContain('/vault/project/.codex/hooks.json');
    expect(content.querySelector('[data-hook-field="sourcePath"]')?.getAttribute('title')).toBe('/vault/project/.codex/hooks.json');
    expect(content.querySelector('[data-hook-field="enabled"]')?.textContent).toContain(t('settings.codex.hooks.booleanEnabled'));
    expect(content.querySelector('[data-hook-field="eventName"]')?.textContent).toContain('AfterBuild');
    expect(content.querySelector('[data-hook-field="handlerType"]')?.textContent).toContain('command');
    expect(content.querySelector('[data-hooks-warning]')?.textContent).toContain('hook warning');
    expect(content.querySelector('[data-hooks-error]')?.textContent).toContain('hooks/build');
    expect(content.querySelector('[data-hooks-error]')?.textContent).toContain('hook diagnostic');
    expect(content.querySelector('pre')).toBeNull();
    expect(content.querySelector('button')).toBeNull();
    expect(content.textContent).not.toMatch(/scope/i);
  });

  it('keeps long hook values shrinkable at narrow modal widths', async () => {
    const result = availableResult();
    const longPath = `/vault/project/.codex/hooks/${'deep/'.repeat(10)}${'p'.repeat(90)}.json`;
    const longHash = 'a'.repeat(64);
    result.groups[0].hooks[0].sourcePath = longPath;
    result.groups[0].hooks[0].currentHash = longHash;
    const { modal } = await openModal(result);
    const content = modal.contentEl;
    expect(content.querySelector('.opencodian-codex-hooks-group')).toBeTruthy();
    expect(content.querySelector('.opencodian-codex-hooks-entry')).toBeTruthy();
    const pathField = content.querySelector<HTMLElement>('[data-hook-field="sourcePath"]');
    const hashField = content.querySelector<HTMLElement>('[data-hook-field="currentHash"]');
    expect(pathField?.textContent).toContain(longPath);
    expect(hashField?.textContent).toContain(longHash);

    const css = readFileSync(join(process.cwd(), 'src/style/modals/config-editor-modal.css'), 'utf8');
    expect(css).toMatch(/\.opencodian-codex-hooks-group\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
    expect(css).toMatch(/\.opencodian-codex-hooks-entry\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/s);
    expect(css).toMatch(/\.opencodian-codex-hooks-field\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s);
    expect(css).toContain('.opencodian-codex-readback-modal .modal-content');
    expect(css).toMatch(/\.opencodian-codex-readback-modal \.modal-content\s*\{[^}]*overflow-x:\s*hidden;/s);

    const generatedCss = readFileSync(join(process.cwd(), 'styles.css'), 'utf8');
    expect(generatedCss).toContain('.opencodian-codex-hooks-field');
    expect(generatedCss).toContain('overflow-wrap: anywhere;');
  });

  it('sets a localized modal title and labels in both supported locales', async () => {
    const { modal } = await openModal({ status: 'empty', groups: [] });
    expect(modal.titleEl.textContent).toBe(t('settings.codex.hooks.modalTitle'));

    setLocale('zh');
    const zhModal = await openModal({ status: 'empty', groups: [] });
    expect(zhModal.modal.titleEl.textContent).toBe(t('settings.codex.hooks.modalTitle'));
    expect(zhModal.modal.contentEl.querySelector('[data-hooks-readback-status]')?.textContent)
      .toBe(t('settings.codex.hooks.statusEmpty'));
  });
});
