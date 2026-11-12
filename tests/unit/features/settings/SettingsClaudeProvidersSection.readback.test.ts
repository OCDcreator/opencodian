import { capturedNotices, clearCapturedNotices, Modal } from 'obsidian';

jest.mock('../../../../src/core/agents/backend', () => {
  const actual = jest.requireActual(
    '../../../../src/core/agents/backend/claude/ClaudeProjectProviderConfig',
  ) as typeof import('../../../../src/core/agents/backend/claude/ClaudeProjectProviderConfig');
  return {
    applyClaudeProviderPreset: jest.fn(),
    migrateClaudeProviderModels: jest.fn(),
    readClaudeProviderConfigSnapshot: jest.fn(),
    validateClaudeProviderPreset: actual.validateClaudeProviderPreset,
    maskClaudeProviderValue: actual.maskClaudeProviderValue,
    maskClaudeProviderConfigSnapshot: actual.maskClaudeProviderConfigSnapshot,
  };
});

import {
  applyClaudeProviderPreset, type ApplyClaudeProviderPresetResult, type ClaudeProviderConfigSnapshot, maskClaudeProviderValue,
  migrateClaudeProviderModels, readClaudeProviderConfigSnapshot,
} from '../../../../src/core/agents/backend';
import { type ClaudeProviderPreset,getDefaultClaudeCodeBackendSettings } from '../../../../src/core/types';
import { ClaudeProviderPresetModal } from '../../../../src/features/settings/backends/claude/SettingsClaudeProviderModals';
import { SettingsClaudeProvidersSection } from '../../../../src/features/settings/backends/claude/SettingsClaudeProvidersSection';
import { setLocale, t, type TranslationKey } from '../../../../src/i18n';
import { changeText, changeTextArea, clearRecordArrays, getButtonRecord, getTextRecord, mockSettingPrototype } from './helpers/mcpSectionTestHelpers';

const TOKEN = 'sk-1234567890token99';
const MASKED_TOKEN = String(maskClaudeProviderValue('ANTHROPIC_AUTH_TOKEN', TOKEN));
const LOCAL_REVISION = { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 1, size: 20, sha256: 'captured00' };
const NEXT_REVISION = { canonicalPath: '/vault/.claude/settings.local.json', mtimeMs: 2, size: 48, sha256: 'nextrevis' };
const EVIDENCE = { persistence: 'verified', application: 'pending', runtime: 'unavailable' };
const pk = (key: string) => t(`settings.claudeCode.providers.${key}` as TranslationKey);

const readMock = readClaudeProviderConfigSnapshot as unknown as jest.Mock;
const applyMock = applyClaudeProviderPreset as unknown as jest.Mock;
const migrateMock = migrateClaudeProviderModels as unknown as jest.Mock;

interface LayerInit { content?: Record<string, unknown>; parseError?: string }
type ProviderLayer = ClaudeProviderConfigSnapshot['layers'][number];
type ClaudeCodeSettings = ReturnType<typeof getDefaultClaudeCodeBackendSettings>;
interface PluginStub {
  app: { vault: { adapter: { basePath: string } } };
  settings: { backendSettings: { claudeCode: ClaudeCodeSettings } };
  saveSettings: jest.Mock;
}

function layer(id: ProviderLayer['id'], filePath: string, init: LayerInit = {}): ProviderLayer {
  return { id, filePath, exists: true, content: init.content ?? {}, ...(init.parseError ? { parseError: init.parseError } : {}) };
}

function localLayer(init: LayerInit = {}): ProviderLayer {
  return { ...layer('local', '/vault/.claude/settings.local.json', init), revision: init.parseError ? null : LOCAL_REVISION };
}

function snapshotOf(layers: ProviderLayer[], shellEnv: Record<string, string> = {}): ClaudeProviderConfigSnapshot {
  return { layers, shellEnv };
}

function readySnapshot(): ClaudeProviderConfigSnapshot {
  return snapshotOf([localLayer()]);
}

function createSettings(): ClaudeCodeSettings {
  const settings = getDefaultClaudeCodeBackendSettings();
  settings.settingSources = ['project', 'local'];
  settings.providers.modelMigrationDone = true;
  return settings;
}

function createPlugin(settings: ClaudeCodeSettings): PluginStub {
  return { app: { vault: { adapter: { basePath: '/vault' } } }, settings: { backendSettings: { claudeCode: settings } }, saveSettings: jest.fn().mockResolvedValue(undefined) };
}

function createSection(plugin: PluginStub): SettingsClaudeProvidersSection {
  return new SettingsClaudeProvidersSection({
    plugin: plugin as never,
    createSectionHeading: (hostEl, title) => hostEl.createEl('h3', { text: title }),
  });
}

function gatewayPreset(): ClaudeProviderPreset {
  return {
    id: 'gateway', name: 'Gateway', baseUrl: 'https://gateway.example.com', authToken: TOKEN, model: 'gateway-main',
    fallbackModel: 'gateway-fallback', haikuModel: 'gateway-haiku', extraEnv: { GATEWAY_REGION: 'cn' },
  };
}

async function flushDom(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function valueText(host: HTMLElement, field: string): string {
  return host.querySelector(`[data-claude-provider-value="${field}"] dd .opencodian-claude-provider-exact`)?.textContent ?? '';
}

function sourceText(host: HTMLElement, field: string): string {
  return host.querySelector(`[data-claude-provider-value="${field}"] dd .opencodian-claude-provider-source`)?.textContent ?? '';
}

function buttonByLabel(host: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

function spyModalOpen(): jest.SpyInstance {
  return jest.spyOn(Modal.prototype, 'open').mockImplementation(function mockOpen(this: Modal) { this.onOpen(); });
}

function lastModal(openSpy: jest.SpyInstance): { contentEl: HTMLElement } {
  const instances = openSpy.mock.instances;
  return instances[instances.length - 1] as { contentEl: HTMLElement };
}

async function fillGatewayPreset(): Promise<void> {
  await changeText(pk('field.name.name'), 'Gateway'); await changeText(pk('field.baseUrl.name'), 'https://gateway.example.com');
  await changeText(pk('field.authToken.name'), TOKEN); await changeText(pk('field.model.name'), 'gateway-main');
  await changeText(pk('field.fallbackModel.name'), 'gateway-fallback'); await changeText(pk('field.haikuModel.name'), 'gateway-haiku');
  await changeTextArea(pk('field.extraEnv'), 'GATEWAY_REGION=cn\nCLAUDE_CODE_DEBUG=1');
}

async function renderProviders(
  settings: ClaudeCodeSettings,
): Promise<{ containerEl: HTMLDivElement; plugin: PluginStub; section: SettingsClaudeProvidersSection }> {
  const plugin = createPlugin(settings);
  const section = createSection(plugin);
  const containerEl = document.createElement('div');
  section.render(containerEl);
  await flushDom();
  return { containerEl, plugin, section };
}

function resetUnit(snapshot: ClaudeProviderConfigSnapshot = readySnapshot()): void {
  setLocale('en'); document.body.innerHTML = ''; clearRecordArrays(); clearCapturedNotices();
  mockSettingPrototype();
  readMock.mockReset(); applyMock.mockReset(); migrateMock.mockReset();
  readMock.mockResolvedValue(snapshot);
  applyMock.mockResolvedValue({ lastAppliedManagedEnvKeys: [], revision: NEXT_REVISION, evidence: EVIDENCE });
  migrateMock.mockResolvedValue({ migrated: false });
}

describe('SettingsClaudeProvidersSection readback rendering', () => {
  beforeEach(() => { resetUnit(); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('renders the built-in inherited preset with localized copy instead of Anthropic Official', async () => {
    const { containerEl } = await renderProviders(createSettings());
    const official = containerEl.querySelector('[data-claude-provider-preset="official"]') as HTMLElement;
    const heading = official.querySelector('strong');
    expect(heading?.textContent).toBe(pk('inherit')); expect(heading?.textContent).not.toBe('Anthropic Official');
    expect(official.querySelector('p')?.textContent).toBe(pk('inheritDesc'));
    expect(official.querySelector('.opencodian-claude-provider-active-badge')?.textContent).toBe(pk('active'));
    expect(official.querySelector('button')?.textContent).toBe(pk('useInherited'));
  });

  it('reads enabled local file values ahead of shell, shared sources, and the selected preset record', async () => {
    const settings = createSettings();
    settings.settingSources = ['user', 'project', 'local'];
    settings.providers.presets.push(gatewayPreset());
    settings.providers.activePresetId = 'gateway';
    readMock.mockResolvedValue(snapshotOf([
      layer('user', '/home/u/.claude/settings.json', {
        content: { env: { ANTHROPIC_BASE_URL: 'https://user.example.com', ANTHROPIC_AUTH_TOKEN: 'user-env-secret-token' } },
      }),
      layer('project', '/vault/.claude/settings.json', {
        content: { model: 'project-model', env: { ANTHROPIC_BASE_URL: 'https://project.example.com' } },
      }),
      localLayer({
        content: {
          model: 'local-file-model', fallbackModel: ['local-fallback-model'],
          env: { ANTHROPIC_BASE_URL: 'https://local-file.example.com', ANTHROPIC_AUTH_TOKEN: TOKEN },
        },
      }),
    ], { ANTHROPIC_AUTH_TOKEN: 'shell-secret-token-1' }));
    const { containerEl } = await renderProviders(settings);

    expect(valueText(containerEl, 'baseUrl')).toBe('https://local-file.example.com');
    expect(sourceText(containerEl, 'baseUrl')).toBe(pk('source.local'));
    expect(valueText(containerEl, 'model')).toBe('local-file-model'); expect(valueText(containerEl, 'fallbackModel')).toBe('local-fallback-model');
    const tokenRow = containerEl.querySelector('[data-claude-provider-value="authToken"]');
    expect(tokenRow?.textContent).toContain(pk('readback.tokenPresent'));
    expect(tokenRow?.textContent).toContain(pk('source.local')); expect(tokenRow?.textContent).not.toContain(pk('source.shell'));
    for (const secret of [TOKEN, 'user-env-secret-token', 'shell-secret-token-1']) {
      expect(containerEl.textContent).not.toContain(secret);
    }
    const current = containerEl.querySelector('[data-claude-provider-current]');
    expect(current?.getAttribute('data-claude-provider-mode')).toBe('local');
    expect(current?.querySelector('.opencodian-claude-provider-mode')?.textContent).toBe(pk('localConfig'));
    expect(containerEl.querySelector('[data-claude-provider-preset="gateway"] .opencodian-claude-provider-active-badge')).toBeTruthy();
  });

  it('falls back across enabled sources in project then user order when the local file is silent', async () => {
    const settings = createSettings();
    settings.settingSources = ['user', 'project', 'local'];
    readMock.mockResolvedValue(snapshotOf([
      layer('user', '/home/u/.claude/settings.json', {
        content: { env: { ANTHROPIC_BASE_URL: 'https://user.example.com', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'user-haiku-model' } },
      }),
      layer('project', '/vault/.claude/settings.json', {
        content: { model: 'project-model', env: { ANTHROPIC_BASE_URL: 'https://project.example.com' } },
      }),
      localLayer(),
    ]));
    const { containerEl } = await renderProviders(settings);

    expect(valueText(containerEl, 'baseUrl')).toBe('https://project.example.com');
    expect(sourceText(containerEl, 'baseUrl')).toBe(pk('source.project'));
    expect(valueText(containerEl, 'haikuModel')).toBe('user-haiku-model');
    expect(sourceText(containerEl, 'haikuModel')).toBe(pk('source.user'));
    expect(valueText(containerEl, 'model')).toBe('project-model');
    const current = containerEl.querySelector('[data-claude-provider-current]');
    expect(current?.getAttribute('data-claude-provider-mode')).toBe('inherit');
    expect(current?.querySelector('.opencodian-claude-provider-mode')?.textContent).toBe(pk('inherit'));
  });

  it('ignores a disabled user source and adopts its values once enabled', async () => {
    const settings = createSettings();
    const snapshot = snapshotOf([
      layer('user', '/home/u/.claude/settings.json', {
        content: { env: { ANTHROPIC_BASE_URL: 'https://user-only.example.com', ANTHROPIC_AUTH_TOKEN: 'user-only-secret' } },
      }),
      localLayer(),
    ], { ANTHROPIC_AUTH_TOKEN: 'shell-token-0000001' });
    readMock.mockResolvedValue(snapshot);
    const { containerEl, section } = await renderProviders(settings);

    expect(valueText(containerEl, 'baseUrl')).toBe(pk('readback.notSet'));
    expect(sourceText(containerEl, 'baseUrl')).toBe(pk('source.none'));
    expect(containerEl.textContent).not.toContain('user-only.example.com');
    const tokenRow = containerEl.querySelector('[data-claude-provider-value="authToken"]');
    expect(tokenRow?.textContent).toContain(pk('readback.tokenPresent'));
    expect(tokenRow?.textContent).toContain(pk('source.shell'));

    settings.settingSources = ['user', 'project', 'local'];
    containerEl.empty(); section.render(containerEl); await flushDom();

    expect(valueText(containerEl, 'baseUrl')).toBe('https://user-only.example.com');
    expect(sourceText(containerEl, 'baseUrl')).toBe(pk('source.user'));
    expect(sourceText(containerEl, 'authToken')).toBe(pk('source.user'));
  });

  it('warns about partial readback only for enabled sources and never renders token values', async () => {
    const settings = createSettings();
    settings.settingSources = ['user', 'project', 'local'];
    const snapshot = snapshotOf([
      layer('user', '/home/u/.claude/settings.json', {
        content: { env: { ANTHROPIC_AUTH_TOKEN: 'user-raw-secret-token' } }, parseError: 'RAW_USER_PARSE_ERROR',
      }),
      localLayer(),
    ], { ANTHROPIC_AUTH_TOKEN: TOKEN });
    readMock.mockResolvedValue(snapshot);
    const { containerEl, section } = await renderProviders(settings);

    expect(containerEl.textContent).toContain(pk('readback.partial'));
    const tokenRow = containerEl.querySelector('[data-claude-provider-value="authToken"]');
    expect(tokenRow?.textContent).toContain(pk('readback.tokenPresent'));
    expect(tokenRow?.textContent).toContain(pk('source.shell'));
    for (const secret of [TOKEN, 'user-raw-secret-token', 'RAW_USER_PARSE_ERROR']) {
      expect(containerEl.textContent).not.toContain(secret);
    }

    settings.settingSources = ['project', 'local'];
    containerEl.empty(); section.render(containerEl); await flushDom();
    expect(containerEl.textContent).not.toContain(pk('readback.partial'));
  });

  it('hides endpoint credentials, query strings, and fragments from rendered addresses', async () => {
    const { containerEl, section } = await renderProviders(createSettings());
    const renderWithBaseUrl = async (baseUrl: string): Promise<void> => {
      readMock.mockResolvedValue(snapshotOf([localLayer({ content: { env: { ANTHROPIC_BASE_URL: baseUrl } } })]));
      containerEl.empty(); section.render(containerEl); await flushDom();
    };

    await renderWithBaseUrl('https://user:pass@relay.example.com/v1?debug=s3cret#frag');
    expect(valueText(containerEl, 'baseUrl')).toBe('https://relay.example.com/v1');
    expect(sourceText(containerEl, 'baseUrl')).toBe(pk('source.local'));
    expect(containerEl.textContent).toContain(pk('route.custom'));
    for (const secret of ['user:pass', 'debug=s3cret', '#frag']) expect(containerEl.textContent).not.toContain(secret);

    await renderWithBaseUrl('http://127.0.0.1:8080/proxy?key=s3cret');
    expect(valueText(containerEl, 'baseUrl')).toBe('http://127.0.0.1:8080/proxy');
    expect(containerEl.textContent).toContain(pk('route.proxy')); expect(containerEl.textContent).not.toContain('key=s3cret');

    await renderWithBaseUrl('ftp://weird');
    expect(valueText(containerEl, 'baseUrl')).toBe(pk('readback.invalidAddress'));
    expect(containerEl.textContent).toContain(pk('route.unspecified'));
  });
});

describe('SettingsClaudeProvidersSection read-only snapshot inspection', () => {
  beforeEach(() => {
    resetUnit(snapshotOf([
      layer('user', '/home/u/.claude/settings.json', { content: { env: { ANTHROPIC_AUTH_TOKEN: 'user-env-secret-token' } } }),
      layer('project', '/vault/.claude/settings.json'),
      localLayer({ content: { model: 'local-file-model', env: { ANTHROPIC_AUTH_TOKEN: TOKEN } } }),
    ], { ANTHROPIC_AUTH_TOKEN: 'shell-secret-token-1' }));
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('renders and inspects snapshots without writing configuration or plugin settings', async () => {
    const { containerEl, plugin } = await renderProviders(createSettings());
    expect(applyMock).not.toHaveBeenCalled(); expect(migrateMock).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    const openSpy = spyModalOpen();
    getButtonRecord(pk('configModal.button'))!.onClick!();
    await flushDom();

    expect(openSpy).toHaveBeenCalledTimes(1);
    const modalText = lastModal(openSpy).contentEl.textContent ?? '';
    expect(modalText).toContain(pk('configModal.title'));
    expect(modalText).toContain(pk('layer.user')); expect(modalText).toContain(pk('layer.local')); expect(modalText).toContain(pk('layer.shell'));
    expect(modalText).toContain('"ANTHROPIC_AUTH_TOKEN"'); expect(modalText).toContain(MASKED_TOKEN);
    for (const secret of [TOKEN, 'user-env-secret-token', 'shell-secret-token-1']) expect(modalText).not.toContain(secret);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled(); expect(migrateMock).not.toHaveBeenCalled();
    expect(containerEl.textContent).not.toContain(TOKEN);
  });
});

describe('SettingsClaudeProvidersSection preset editor save modes', () => {
  beforeEach(() => {
    resetUnit();
    applyMock.mockResolvedValue({
      lastAppliedManagedEnvKeys: ['GATEWAY_REGION', 'CLAUDE_CODE_DEBUG'], revision: NEXT_REVISION, evidence: EVIDENCE,
    } satisfies ApplyClaudeProviderPresetResult);
  });
  afterEach(() => { jest.restoreAllMocks(); });

  async function openGatewayEditor(containerEl: HTMLElement): Promise<{ contentEl: HTMLElement }> {
    const openSpy = spyModalOpen();
    buttonByLabel(containerEl, pk('add.button')).click();
    await flushDom();
    const modal = lastModal(openSpy);
    expect(buttonByLabel(modal.contentEl, pk('editor.save'))).toBeTruthy();
    expect(buttonByLabel(modal.contentEl, pk('editor.saveApply'))).toBeTruthy();
    return modal;
  }

  it('saves a preset without applying while preserving fallback and extra env values', async () => {
    const settings = createSettings();
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => {});
    const { containerEl, plugin } = await renderProviders(settings);
    const modal = await openGatewayEditor(containerEl);
    expect(getTextRecord(pk('field.authToken.name'))!.control.inputEl.type).toBe('password');
    await fillGatewayPreset();
    buttonByLabel(modal.contentEl, pk('editor.save')).click();
    await flushDom();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1); expect(applyMock).not.toHaveBeenCalled();
    expect(settings.providers.activePresetId).toBe('official');
    const saved = settings.providers.presets.find((preset) => preset.name === 'Gateway');
    expect(saved?.fallbackModel).toBe('gateway-fallback');
    expect(saved?.extraEnv).toEqual({ GATEWAY_REGION: 'cn', CLAUDE_CODE_DEBUG: '1' });
    expect(closeSpy).toHaveBeenCalled();
    expect(containerEl.querySelectorAll('[data-claude-provider-preset]')).toHaveLength(2);
    expect(containerEl.textContent).not.toContain(TOKEN);
  });

  it('saves and applies through the activation path and records managed keys', async () => {
    const settings = createSettings();
    const { containerEl, plugin } = await renderProviders(settings);
    const modal = await openGatewayEditor(containerEl);
    await fillGatewayPreset();
    buttonByLabel(modal.contentEl, pk('editor.saveApply')).click();
    await flushDom(); await flushDom();

    const saved = settings.providers.presets.find((preset) => preset.name === 'Gateway');
    expect(saved).toBeDefined();
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledWith('/vault', expect.objectContaining({
      baseUrl: 'https://gateway.example.com', authToken: TOKEN, fallbackModel: 'gateway-fallback',
      extraEnv: { GATEWAY_REGION: 'cn', CLAUDE_CODE_DEBUG: '1' },
    }), [], { expectedRevision: LOCAL_REVISION });
    expect(settings.providers.activePresetId).toBe(saved!.id);
    expect(settings.providers.lastAppliedManagedEnvKeys).toEqual(['GATEWAY_REGION', 'CLAUDE_CODE_DEBUG']);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(capturedNotices).toContain(pk('applied'));
    expect(containerEl.querySelector('[data-claude-provider-preset] .opencodian-claude-provider-active-badge')).toBeTruthy();
    expect(containerEl.textContent).not.toContain(TOKEN);
  });

  it('refuses save-and-apply until the local snapshot is ready', async () => {
    const settings = createSettings();
    const plugin = createPlugin(settings);
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => {});
    const pending = deferred<ClaudeProviderConfigSnapshot>();
    readMock.mockReturnValue(pending.promise);
    const containerEl = document.createElement('div');
    createSection(plugin).render(containerEl);
    const modal = await openGatewayEditor(containerEl);
    await fillGatewayPreset();
    buttonByLabel(modal.contentEl, pk('editor.saveApply')).click();
    await flushDom();

    expect(plugin.saveSettings).not.toHaveBeenCalled(); expect(applyMock).not.toHaveBeenCalled();
    expect(settings.providers.presets.some((preset) => preset.name === 'Gateway')).toBe(false);
    expect(modal.contentEl.querySelector('.opencodian-claude-provider-editor-status')?.textContent).toContain(pk('editor.saveFailed'));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(buttonByLabel(modal.contentEl, pk('editor.saveApply')).disabled).toBe(false);
  });

  it('rolls back the preset record and never writes configuration when the save fails', async () => {
    const settings = createSettings();
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => {});
    const { containerEl, plugin } = await renderProviders(settings);
    plugin.saveSettings.mockRejectedValueOnce(new Error('plugin settings unavailable'));
    const modal = await openGatewayEditor(containerEl);
    await fillGatewayPreset();
    const saveButton = buttonByLabel(modal.contentEl, pk('editor.save'));
    saveButton.click();
    await flushDom();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1); expect(applyMock).not.toHaveBeenCalled();
    expect(settings.providers.presets.some((preset) => preset.name === 'Gateway')).toBe(false);
    expect(modal.contentEl.querySelector('.opencodian-claude-provider-editor-status')?.textContent).toContain(pk('editor.saveFailed'));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(saveButton.disabled).toBe(false);

    saveButton.click();
    await flushDom();

    expect(settings.providers.presets.some((preset) => preset.name === 'Gateway')).toBe(true);
    expect(closeSpy).toHaveBeenCalled(); expect(applyMock).not.toHaveBeenCalled();
  });
});

describe('SettingsClaudeProvidersSection apply gating and failure isolation', () => {
  beforeEach(() => {
    resetUnit();
    applyMock.mockResolvedValue({ lastAppliedManagedEnvKeys: ['GATEWAY_REGION'], revision: NEXT_REVISION, evidence: EVIDENCE } satisfies ApplyClaudeProviderPresetResult);
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('gates duplicate apply clicks while an activation is in flight', async () => {
    const settings = createSettings();
    settings.providers.presets.push(gatewayPreset());
    const gatewayApply = deferred<ApplyClaudeProviderPresetResult>();
    applyMock.mockReturnValueOnce(gatewayApply.promise);
    const { containerEl, plugin } = await renderProviders(settings);

    const applyButton = containerEl.querySelector('[data-claude-provider-apply="gateway"]') as HTMLButtonElement;
    expect(applyButton.disabled).toBe(false);
    applyButton.click();
    const officialButton = containerEl.querySelector('[data-claude-provider-apply="official"]') as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true); expect(officialButton.disabled).toBe(true);
    applyButton.click(); officialButton.click();
    gatewayApply.resolve({ lastAppliedManagedEnvKeys: ['GATEWAY_REGION'], revision: NEXT_REVISION, evidence: EVIDENCE });
    await flushDom(); await flushDom();

    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(settings.providers.activePresetId).toBe('gateway');
    expect(settings.providers.lastAppliedManagedEnvKeys).toEqual(['GATEWAY_REGION']);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect((containerEl.querySelector('[data-claude-provider-apply="gateway"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps plugin metadata and configuration untouched when the source write fails', async () => {
    const settings = createSettings();
    settings.providers.presets.push(gatewayPreset());
    applyMock.mockRejectedValueOnce(new Error('disk full'));
    const { containerEl, plugin } = await renderProviders(settings);
    (containerEl.querySelector('[data-claude-provider-apply="gateway"]') as HTMLButtonElement).click();
    await flushDom(); await flushDom();

    expect(settings.providers.activePresetId).toBe('official');
    expect(settings.providers.lastAppliedManagedEnvKeys).toEqual([]);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(capturedNotices).toContain(pk('applyFailed'));
    expect((containerEl.querySelector('[data-claude-provider-apply="gateway"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables snapshot-gated buttons while the local configuration fails to parse', async () => {
    const settings = getDefaultClaudeCodeBackendSettings();
    settings.settingSources = ['project', 'local'];
    settings.providers.presets.push(gatewayPreset());
    readMock.mockResolvedValue(snapshotOf([localLayer({ parseError: 'LOCAL_RAW_PARSE_ERROR' })]));
    const { containerEl, section } = await renderProviders(settings);
    const migrationLabel = t('settings.claudeCode.providers.migrationAction.button');

    const status = containerEl.querySelector('[data-claude-provider-local-status="true"]');
    expect(status?.getAttribute('data-claude-provider-local-status-state')).toBe('failed');
    expect(status?.textContent).toContain(t('settings.claudeCode.providers.localStatus.failed', {
      reason: t('settings.claudeCode.providers.localStatus.reason.parse'),
    }));
    expect(status?.textContent).not.toContain('LOCAL_RAW_PARSE_ERROR');
    for (const button of Array.from(containerEl.querySelectorAll<HTMLButtonElement>('[data-claude-provider-apply]'))) {
      expect(button.disabled).toBe(true);
    }
    expect(buttonByLabel(containerEl, migrationLabel).disabled).toBe(true);
    expect(containerEl.textContent).toContain(pk('globalUnavailable'));

    readMock.mockResolvedValue(readySnapshot());
    containerEl.empty(); section.render(containerEl); await flushDom();

    expect(buttonByLabel(containerEl, migrationLabel).disabled).toBe(false);
    for (const button of Array.from(containerEl.querySelectorAll<HTMLButtonElement>('[data-claude-provider-apply]'))) {
      expect(button.disabled).toBe(false);
    }
  });

  it('blocks stale apply buttons after the local source is disabled', async () => {
    const settings = createSettings();
    settings.providers.presets.push(gatewayPreset());
    const { containerEl, plugin, section } = await renderProviders(settings);
    const staleButton = containerEl.querySelector('[data-claude-provider-apply="gateway"]') as HTMLButtonElement;
    expect(staleButton.disabled).toBe(false);

    settings.settingSources = ['project'];
    containerEl.empty(); section.render(containerEl); await flushDom();
    expect(containerEl.querySelector('[data-claude-provider-local-gate="true"]')).toBeTruthy();

    staleButton.click();
    await flushDom();

    expect(applyMock).not.toHaveBeenCalled(); expect(migrateMock).not.toHaveBeenCalled();
    expect(settings.providers.activePresetId).toBe('official');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('gates duplicate modal save clicks and recovers after a failed save', async () => {
    const onSave = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined);
    const modal = new ClaudeProviderPresetModal({} as Modal['app'], null, onSave);
    modal.onOpen();
    await changeText(pk('field.name.name'), 'Gateway'); await changeText(pk('field.baseUrl.name'), 'https://gateway.example.com');
    const saveButton = buttonByLabel(modal.contentEl, pk('editor.save'));

    saveButton.click(); saveButton.click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saveButton.disabled).toBe(true);
    await flushDom();

    expect(modal.contentEl.querySelector('.opencodian-claude-provider-editor-status')?.textContent).toContain(pk('editor.saveFailed'));
    expect(saveButton.disabled).toBe(false);

    saveButton.click();
    await flushDom();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Gateway', baseUrl: 'https://gateway.example.com' }), false);
  });
});
