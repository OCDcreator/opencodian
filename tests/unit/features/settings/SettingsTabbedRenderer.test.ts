/* eslint-disable max-lines, max-lines-per-function -- Tabbed settings coverage keeps active-backend filtering, content routing, and section-shell contracts with one renderer fixture. */

import type { App } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import { SettingsStyleSection } from '../../../../src/features/settings/appearance/SettingsStyleSection';
import { SettingsClaudeCodeSection } from '../../../../src/features/settings/backends/claude/SettingsClaudeCodeSection';
import { SettingsCodexSection } from '../../../../src/features/settings/backends/codex/SettingsCodexSection';
import { SettingsDshSection } from '../../../../src/features/settings/backends/dsh/SettingsDshSection';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { SettingsCommandsSection } from '../../../../src/features/settings/backends/opencode/SettingsCommandsSection';
import { SettingsServerSection } from '../../../../src/features/settings/backends/opencode/SettingsServerSection';
import { SettingsPiSection } from '../../../../src/features/settings/backends/pi/SettingsPiSection';
import { SettingsDebugSection } from '../../../../src/features/settings/debug/SettingsDebugSection';
import { SettingsConversationSection } from '../../../../src/features/settings/general/SettingsConversationSection';
import { SettingsFormatterSection } from '../../../../src/features/settings/general/SettingsFormatterSection';
import { SettingsPluginSection } from '../../../../src/features/settings/general/SettingsPluginSection';
import { SettingsSecuritySection } from '../../../../src/features/settings/general/SettingsSecuritySection';
import { SettingsUiSection } from '../../../../src/features/settings/general/SettingsUiSection';
import { SettingsMcpSection } from '../../../../src/features/settings/mcp/SettingsMcpSection';
import { SettingsModelSection } from '../../../../src/features/settings/models/SettingsModelSection';
import { SettingsAgentsSection } from '../../../../src/features/settings/resources/SettingsAgentsSection';
import { SettingsTabbedRenderer } from '../../../../src/features/settings/SettingsTabbedRenderer';
import { setLocale } from '../../../../src/i18n';

function createRendererState(options?: {
  primaryTabId?: string;
  secondaryTabs?: Record<string, string>;
  enabledBackends?: AgentBackendKind[];
  activeBackend?: AgentBackendKind;
}) {
  const setActive = jest.fn();
  const plugin = {
    settings: {
      ...DEFAULT_SETTINGS,
      settingsLayoutMode: 'tabbed' as const,
      settingsTabbedPrimaryTab: options?.primaryTabId ?? 'general',
      settingsTabbedSecondaryTabByPrimary: options?.secondaryTabs ?? { general: 'basic' },
      enabledBackends: options?.enabledBackends ?? DEFAULT_SETTINGS.enabledBackends,
      activeBackend: options?.activeBackend ?? DEFAULT_SETTINGS.activeBackend,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    onChatWarmSessionBackendChanged: jest.fn(),
    agentServiceRegistry: {
      setActive,
    },
  };

  const requestDisplayRefresh = jest.fn();
  const setRefreshTitleModelsCallback = jest.fn();
  const renderLayoutModeSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'layout-mode-marker', text: 'layout-mode-setting' });
  });
  const renderLanguageSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'language-marker', text: 'language-setting' });
  });
  const renderSettingsInEditorAreaSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'settings-editor-area-marker', text: 'settings-editor-area-setting' });
  });
  const renderSecretsKeychainSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'secrets-keychain-marker', text: 'secrets-keychain-setting' });
  });
  const renderEnvironmentVariablesSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'env-domains-marker', text: 'environment-variables-setting' });
  });
  const renderPluginUpdateSection = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'plugin-update-marker', text: 'plugin-update-section' });
  });
  const renderUserContent = jest.fn((containerEl: HTMLElement, secondaryTabId: string) => {
    containerEl.createDiv({ cls: 'user-marker', text: secondaryTabId });
  });

  const renderer = new SettingsTabbedRenderer({
    app: {} as App,
    plugin: plugin as never,
    createHeading: (containerEl, title) => containerEl.createEl('h3', { text: title }),
    createSettingsBlock: (containerEl, options) => {
      const hostEl = containerEl.createDiv({
        cls: 'opencodian-settings-block opencodian-settings-section',
        attr: { 'data-settings-surface': 'section' },
      });
      hostEl.createEl('h4', {
        text: options.title,
        cls: 'opencodian-settings-subsection-heading opencodian-settings-section-heading',
      });
      return hostEl.createDiv({
        cls: 'opencodian-settings-block-body opencodian-settings-section-body',
        attr: { 'data-settings-surface': 'section-body' },
      });
    },
    setSettingDescWithFormatting: () => undefined,
    applyInlineCodeText: () => undefined,
    setSettingNameWithFormatting: () => undefined,
    addSettingHelpButton: () => undefined,
    notifyModelCatalogStatus: () => undefined,
    setModelCatalogStatusCallback: () => undefined,
    setServerSection: () => undefined,
    setCodexSection: () => undefined,
    setMcpSection: () => undefined,
    setModelSection: () => undefined,
    setPluginSection: () => undefined,
    setSecuritySection: () => undefined,
    getRefreshModelsCallback: () => undefined,
    getRefreshTitleModelsCallback: () => undefined,
    setRefreshModelsCallback: () => undefined,
    setRefreshTitleModelsCallback: setRefreshTitleModelsCallback,
    getServerState: () => ({ healthy: false, status: 'stopped' as const }),
    setServerState: () => undefined,
    requestDisplayRefresh,
    renderUserContent,
    renderConversationTitleSettings: jest.fn(),
    setRefreshTitleModelsCallback,
    renderLayoutModeSetting,
    renderLanguageSetting,
    renderSettingsInEditorAreaSetting,
    renderSecretsKeychainSetting,
    renderEnvironmentVariablesSetting,
    renderPluginUpdateSection,
  });

  return {
    plugin,
    renderer,
    requestDisplayRefresh,
    renderLayoutModeSetting,
    renderLanguageSetting,
    renderSettingsInEditorAreaSetting,
    renderSecretsKeychainSetting,
    renderPluginUpdateSection,
    renderUserContent,
    setActive,
    setRefreshTitleModelsCallback,
  };
}

function expectSingleContentShell(
  containerEl: HTMLElement,
  primaryTabId: string,
  secondaryTabId: string,
): HTMLElement {
  const shellEls = containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-content-shell');
  expect(shellEls).toHaveLength(1);
  expect(shellEls[0]?.dataset.primaryTab).toBe(primaryTabId);
  expect(shellEls[0]?.dataset.secondaryTab).toBe(secondaryTabId);
  expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
  return shellEls[0]!;
}

describe('SettingsTabbedRenderer', () => {
  it('notifies the R-F4 warm pool when the tabbed agent switcher changes backend', () => {
    const { plugin, renderer } = createRendererState({
      enabledBackends: ['opencode', 'codex'],
      activeBackend: 'opencode',
    });

    (renderer as unknown as { switchAgent: (agent: AgentBackendKind) => void }).switchAgent('codex');

    expect(plugin.onChatWarmSessionBackendChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps another enabled backend alive when switching the default for new chats', () => {
    const { plugin, renderer } = createRendererState({
      enabledBackends: ['zcode', 'pi'],
      activeBackend: 'zcode',
    });
    const previous = { start: jest.fn(), stop: jest.fn().mockResolvedValue(undefined) };
    const next = { start: jest.fn().mockResolvedValue(undefined), stop: jest.fn() };
    Object.assign(plugin.agentServiceRegistry, {
      get: jest.fn((kind) => kind === 'zcode' ? previous : next),
    });

    (renderer as unknown as { switchAgent: (agent: AgentBackendKind) => void }).switchAgent('pi');

    expect(plugin.settings.activeBackend).toBe('pi');
    expect(plugin.agentServiceRegistry.setActive).toHaveBeenCalledWith('pi');
    expect(next.start).toHaveBeenCalledTimes(1);
    expect(previous.stop).not.toHaveBeenCalled();
  });

  it('shows and routes the Pi backend tab with the same backend visibility rules', () => {
    const renderPi = jest.spyOn(SettingsPiSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({ primaryTabId: 'pi', secondaryTabs: { pi: 'providers' }, enabledBackends: ['opencode', 'pi'], activeBackend: 'pi' });
    const container = document.body.createDiv();
    renderer.renderDisplay(container);
    expect(container.querySelector('.opencodian-settings-tabs-primary [data-tab-id="pi"]')).not.toBeNull();
    expect(container.querySelector('.opencodian-settings-tabs-primary [data-tab-id="codex"]')).toBeNull();
    expect(container.querySelector('.opencodian-settings-tabs-secondary')?.children).toHaveLength(9);
    expect(renderPi).toHaveBeenCalledWith(expect.any(HTMLElement), 'providers');
  });
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the general primary tab with basic and agents secondary tabs', () => {
    const { renderer, renderLayoutModeSetting, renderLanguageSetting, renderSettingsInEditorAreaSetting } =
      createRendererState();
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toContain('General');
    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).not.toContain('Claude Code');
    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual(['Basic', 'Agent Management']);
    expect(renderLayoutModeSetting).toHaveBeenCalledTimes(1);
    expect(renderLanguageSetting).toHaveBeenCalledTimes(1);
    expect(renderSettingsInEditorAreaSetting).toHaveBeenCalledTimes(1);
    const shellEl = expectSingleContentShell(containerEl, 'general', 'basic');
    expect(containerEl.querySelector('.layout-mode-marker')?.textContent).toBe('layout-mode-setting');
    expect(containerEl.querySelector('.language-marker')?.textContent).toBe('language-setting');
    expect(containerEl.querySelector('.settings-editor-area-marker')?.textContent).toBe(
      'settings-editor-area-setting',
    );
    expect(shellEl.querySelectorAll('.opencodian-settings-block')).toHaveLength(1);
    const generalBlockEl = containerEl.querySelector<HTMLElement>('.opencodian-settings-general-merged-block');
    expect(generalBlockEl).not.toBeNull();
    expect(generalBlockEl?.classList.contains('opencodian-settings-section')).toBe(true);
    expect(generalBlockEl?.dataset.settingsSurface).toBe('section');
    expect(generalBlockEl?.querySelector('.opencodian-settings-section-body')).not.toBeNull();
    expect(generalBlockEl?.querySelector('.plugin-update-marker')).toBeNull();
    const updateSectionEl = containerEl.querySelector<HTMLElement>('.plugin-update-marker');
    expect(updateSectionEl).not.toBeNull();
    expect(updateSectionEl?.parentElement).toBe(shellEl);
    expect(updateSectionEl?.previousElementSibling).toBe(generalBlockEl);
  });

  it('shows MCP as a top-level tab before formatter and language servers', () => {
    // OpenCode 1 is retired: its backend-gated tabs only render under an
    // explicit legacy v1-active state, so pin that state for ordering coverage.
    const { renderer } = createRendererState({ enabledBackends: ['opencode'], activeBackend: 'opencode' });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const primaryLabels = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'),
    ).map((element) => element.textContent?.trim());
    expect(primaryLabels).toContain('MCP');
    expect(primaryLabels.indexOf('Commands')).toBeLessThan(primaryLabels.indexOf('MCP'));
    expect(primaryLabels.indexOf('MCP')).toBeLessThan(
      primaryLabels.indexOf('Formatter & Language Servers'),
    );
  });

  it('keeps general secondary tabs structural without switching during initial render', () => {
    const { plugin, renderer, requestDisplayRefresh } = createRendererState();
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const secondaryTabs = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary'),
    );
    expect(secondaryTabs).toHaveLength(2);

    expect(plugin.settings.settingsTabbedSecondaryTabByPrimary).toEqual({
      general: 'basic',
    });
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(requestDisplayRefresh).not.toHaveBeenCalled();
  });

  it('falls back to general and hides OpenCode-only tabs when OpenCode is disabled', () => {
    const { renderer } = createRendererState({
      primaryTabId: 'server',
      enabledBackends: ['codex'],
      activeBackend: 'codex',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const primaryLabels = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'),
    ).map((element) => element.textContent?.trim());
    expect(primaryLabels).not.toContain('Server');
    expect(primaryLabels).not.toContain('Models');
    expect(primaryLabels).toContain('General');
    expect(primaryLabels).not.toContain('Claude Code');
    expectSingleContentShell(containerEl, 'general', 'basic');
  });

  it('filters OpenCode-only conversation secondary tabs when OpenCode is disabled', () => {
    const { renderer } = createRendererState({
      primaryTabId: 'conversation',
      secondaryTabs: { conversation: 'compaction' },
      enabledBackends: ['codex'],
      activeBackend: 'codex',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    // Every remaining conversation tab is backend-agnostic and stays reachable.
    const secondaryTabs = containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary');
    expect(secondaryTabs).toHaveLength(10);
    expect(Array.from(secondaryTabs).map((tab) => tab.dataset.tabId)).toEqual([
      'display',
      'questions',
      'obsidian-tooling',
      'pdf-index',
      'memory',
      'vault-retrieval',
      'export',
      'inline-edit',
      'context-groups',
      'image-generation',
    ]);
    // compaction is OpenCode-only and filtered out; falls back to display.
    expectSingleContentShell(containerEl, 'conversation', 'display');
  });

  it('shows only the active backend\'s owned tabs when OpenCode is the active backend', () => {
    const { renderer } = createRendererState({
      enabledBackends: ['opencode', 'claude-code'],
      activeBackend: 'opencode',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const primaryLabels = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'),
    ).map((element) => element.textContent?.trim());
    expect(primaryLabels).toContain('Server');
    expect(primaryLabels).toContain('Model');
    // Claude Code is enabled but not active — its tab should NOT show
    expect(primaryLabels).not.toContain('Claude Code');
  });

  it('shows only the active backend\'s owned tabs when Claude Code is the active backend', () => {
    const { renderer } = createRendererState({
      primaryTabId: 'server',
      enabledBackends: ['opencode', 'claude-code'],
      activeBackend: 'claude-code',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const primaryLabels = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'),
    ).map((element) => element.textContent?.trim());
    expect(primaryLabels).toContain('Claude Code');
    // OpenCode is enabled but not active — its tabs should NOT show
    expect(primaryLabels).not.toContain('Server');
    expect(primaryLabels).not.toContain('Model');
  });

  it('keeps the branded title row and switches backend from header icon buttons', () => {
    const { renderer, plugin, setActive, requestDisplayRefresh } = createRendererState({
      enabledBackends: ['opencode2', 'claude-code'],
      activeBackend: 'opencode2',
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    const titleEl = containerEl.createEl('h2', { cls: 'opencodian-settings-panel-title' });
    titleEl.createSpan({ cls: 'opencodian-title', text: 'OpenCodian' });

    renderer.renderDisplay(containerEl);
    const preservedTitleEl = containerEl.querySelector<HTMLElement>('.opencodian-settings-panel-title');
    const headerActionsEl = preservedTitleEl?.querySelector<HTMLElement>(
      '.opencodian-settings-panel-title-actions',
    );
    const headerButtons = Array.from(
      preservedTitleEl?.querySelectorAll<HTMLButtonElement>('.opencodian-agent-switcher-header-icon') ?? [],
    );
    const claudeButton = headerButtons.find((element) => element.getAttribute('aria-label') === 'Claude Code');

    expect(preservedTitleEl).toBe(titleEl);
    expect(preservedTitleEl?.querySelector('.opencodian-title')).not.toBeNull();
    expect(headerActionsEl).not.toBeNull();
    expect(headerButtons).toHaveLength(2);
    expect(containerEl.querySelector('.opencodian-agent-chip')).toBeNull();
    expect(containerEl.querySelector('.opencodian-agent-switcher-hover-zone')).not.toBeNull();
    expect(document.body.querySelectorAll('.opencodian-agent-switcher-floating')).toHaveLength(1);
    expect(claudeButton).toBeTruthy();

    claudeButton?.click();

    expect(plugin.settings.activeBackend).toBe('claude-code');
    expect(setActive).toHaveBeenCalledWith('claude-code');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(requestDisplayRefresh).toHaveBeenCalledTimes(1);
  });

  it('focuses the newly active backend tab while retaining its saved secondary tab', () => {
    const { renderer, plugin, requestDisplayRefresh } = createRendererState({
      primaryTabId: 'claude-code',
      secondaryTabs: {
        'claude-code': 'tools',
        codex: 'account',
      },
      enabledBackends: ['claude-code', 'codex'],
      activeBackend: 'claude-code',
    });

    renderer.syncToActiveBackend('codex');

    expect(plugin.settings.settingsTabbedPrimaryTab).toBe('codex');
    expect(plugin.settings.settingsTabbedSecondaryTabByPrimary).toEqual({
      'claude-code': 'tools',
      codex: 'account',
    });
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(requestDisplayRefresh).not.toHaveBeenCalled();
  });

  it('does not accumulate duplicate floating backend rails across rerenders', () => {
    const { renderer } = createRendererState({
      enabledBackends: ['opencode2', 'claude-code'],
      activeBackend: 'opencode2',
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    const titleEl = containerEl.createEl('h2', { cls: 'opencodian-settings-panel-title' });
    titleEl.createSpan({ cls: 'opencodian-title', text: 'OpenCodian' });

    renderer.renderDisplay(containerEl);
    renderer.renderDisplay(containerEl);

    expect(containerEl.querySelectorAll('.opencodian-agent-switcher-hover-zone')).toHaveLength(1);
    expect(document.body.querySelectorAll('.opencodian-agent-switcher-floating')).toHaveLength(1);
    expect(document.body.querySelectorAll('.opencodian-agent-switcher-icon')).toHaveLength(2);
  });

  it('renders every primary tab inside one structural content shell', () => {
    const secondaryByPrimary = {
      general: 'basic',
      server: 'connection',
      model: 'common',
      conversation: 'display',
      agents: 'default',
      commands: 'mode',
      mcp: 'overview',
      formatter: 'overview',
      plugins: 'overview',
      security: 'config',
      ui: 'general',
      style: 'presets',
      debug: 'plugin',
      user: 'profile',
    };
    let renderedShellCount = 0;

    jest.spyOn(SettingsServerSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'server-tab-marker' });
    });
    jest.spyOn(SettingsClaudeCodeSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'claude-code-tab-marker' });
    });
    jest.spyOn(SettingsModelSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'model-tab-marker' });
    });
    jest.spyOn(SettingsConversationSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'conversation-tab-marker' });
    });
    jest.spyOn(SettingsAgentsSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'agents-tab-marker' });
    });
    jest.spyOn(SettingsCommandsSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'commands-tab-marker' });
    });
    jest.spyOn(SettingsMcpSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'mcp-tab-marker' });
    });
    jest.spyOn(SettingsFormatterSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'formatter-tab-marker' });
    });
    jest.spyOn(SettingsPluginSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'plugin-tab-marker' });
    });
    jest.spyOn(SettingsSecuritySection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'security-tab-marker' });
    });
    jest.spyOn(SettingsUiSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'ui-tab-marker' });
    });
    jest.spyOn(SettingsStyleSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'style-tab-marker' });
    });
    jest.spyOn(SettingsDebugSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'debug-tab-marker' });
    });

    for (const [primaryTabId, secondaryTabId] of Object.entries(secondaryByPrimary)) {
      // The map includes retired OpenCode 1 tabs, so pin the legacy v1-active
      // state to keep iterating every registered primary tab.
      const { renderer } = createRendererState({
        primaryTabId,
        secondaryTabs: secondaryByPrimary,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      });
      const containerEl = document.createElement('div');

      renderer.renderDisplay(containerEl);

      expectSingleContentShell(containerEl, primaryTabId, secondaryTabId);
      renderedShellCount += containerEl.querySelectorAll('.opencodian-settings-content-shell').length;
    }

    expect(renderedShellCount).toBe(Object.keys(secondaryByPrimary).length);
  });

  it('renders the active Claude Code primary tab inside one structural content shell', () => {
    jest.spyOn(SettingsClaudeCodeSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'claude-code-tab-marker' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'claude-code',
      secondaryTabs: { 'claude-code': 'runtime' },
      enabledBackends: ['opencode', 'claude-code'],
      activeBackend: 'claude-code',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expectSingleContentShell(containerEl, 'claude-code', 'runtime');
    expect(containerEl.querySelector('.claude-code-tab-marker')).not.toBeNull();
  });
});

describe('SettingsTabbedRenderer tab content routing', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not wrap style tabs with the extra tab-panel shell', () => {
    jest.spyOn(SettingsStyleSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'style-tab-marker', text: 'style-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'style',
      secondaryTabs: { style: 'presets' },
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const shellEl = expectSingleContentShell(containerEl, 'style', 'presets');
    expect(shellEl.querySelector('.style-tab-marker')?.textContent).toBe('style-tab-rendered');
    expect(containerEl.querySelector('.style-tab-marker')?.textContent).toBe('style-tab-rendered');
  });

  it('does not wrap plugin tabs with the extra tab-panel shell', () => {
    const { SettingsPluginSection } = jest.requireActual('../../../../src/features/settings/general/SettingsPluginSection') as {
      SettingsPluginSection: typeof import('../../../../src/features/settings/general/SettingsPluginSection').SettingsPluginSection;
    };
    jest.spyOn(SettingsPluginSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'plugin-tab-marker', text: 'plugin-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'plugins',
      secondaryTabs: { plugins: 'overview' },
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const shellEl = expectSingleContentShell(containerEl, 'plugins', 'overview');
    expect(shellEl.querySelector('.plugin-tab-marker')?.textContent).toBe('plugin-tab-rendered');
    expect(containerEl.querySelector('.plugin-tab-marker')?.textContent).toBe('plugin-tab-rendered');
  });

  it('does not wrap model tabs with the extra tab-panel shell', () => {
    jest.spyOn(SettingsModelSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'model-tab-marker', text: 'model-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'model',
      secondaryTabs: { model: 'common' },
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const shellEl = expectSingleContentShell(containerEl, 'model', 'common');
    expect(shellEl.querySelector('.model-tab-marker')?.textContent).toBe('model-tab-rendered');
    expect(containerEl.querySelector('.model-tab-marker')?.textContent).toBe('model-tab-rendered');
  });

  it('renders formatter tabs without the extra tab-panel shell', () => {
    jest.spyOn(SettingsFormatterSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'formatter-tab-marker', text: 'formatter-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'formatter',
      secondaryTabs: { formatter: 'overview' },
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const shellEl = expectSingleContentShell(containerEl, 'formatter', 'overview');
    expect(shellEl.querySelector('.formatter-tab-marker')?.textContent).toBe('formatter-tab-rendered');
    expect(containerEl.querySelector('.formatter-tab-marker')?.textContent).toBe('formatter-tab-rendered');
    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual(['Overview', 'Formatters', 'Language servers']);
  });

  it('delegates user secondary panels through one user content seam', () => {
    const { renderer, renderUserContent } = createRendererState({
      primaryTabId: 'user',
      secondaryTabs: { user: 'prompt' },
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(renderUserContent).toHaveBeenCalledWith(expect.any(HTMLElement), 'prompt');
    expect(containerEl.querySelector('.user-marker')?.textContent).toBe('prompt');
  });

  it('renders MCP as its own primary tab instead of a server secondary tab', () => {
    const { renderer } = createRendererState({
      primaryTabId: 'server',
      secondaryTabs: { server: 'connection', mcp: 'overview' },
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual(['Connection', 'Authentication', 'Status']);
  });

  it('hides the Claude Code configuration tab until Claude is the active backend', () => {
    jest.spyOn(SettingsClaudeCodeSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'claude-code-tab-marker', text: 'claude-settings' });
    });
    const { renderer, plugin } = createRendererState({
      primaryTabId: 'claude-code',
      secondaryTabs: { 'claude-code': 'runtime' },
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expectSingleContentShell(containerEl, 'general', 'basic');
    expect(containerEl.querySelector('.claude-code-tab-marker')).toBeNull();
    expect(plugin.settings.enabledBackends).toEqual(['opencode']);
  });

  it('regression: shows only codex-owned tabs when codex is active even if opencode+claude-code are enabled', () => {
    const { renderer } = createRendererState({
      enabledBackends: ['opencode', 'claude-code', 'codex'],
      activeBackend: 'codex',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const primaryLabels = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'),
    ).map((element) => element.textContent?.trim());

    // Host-level tabs (always visible regardless of active backend)
    expect(primaryLabels).toContain('General');
    expect(primaryLabels).toContain('Conversation');
    expect(primaryLabels).toContain('User Interface');
    expect(primaryLabels).toContain('Style');
    expect(primaryLabels).toContain('Debug');
    expect(primaryLabels).toContain('User');

    // Codex tab — visible because codex IS the active backend
    expect(primaryLabels).toContain('Codex');

    // OpenCode-owned tabs — NOT visible because opencode is not the active backend
    expect(primaryLabels).not.toContain('Server');
    expect(primaryLabels).not.toContain('Model');
    expect(primaryLabels).not.toContain('Security');
    expect(primaryLabels).not.toContain('MCP');

    // Claude Code tab — NOT visible because claude-code is not the active backend
    expect(primaryLabels).not.toContain('Claude Code');
  });

  it('regression: filters OpenCode-owned secondary tabs when Codex is active', () => {
    const { renderer } = createRendererState({
      primaryTabId: 'conversation',
      secondaryTabs: { conversation: 'compaction' },
      enabledBackends: ['opencode', 'codex'],
      activeBackend: 'codex',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    // title, display and memory are backend-agnostic, so they remain visible
    const secondaryTabs = containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary');
    const secondaryIds = Array.from(secondaryTabs).map((tab) => tab.dataset.tabId);
    expect(secondaryIds).toContain('display');
    expect(secondaryIds).toContain('questions');
    // compaction/sharing stay OpenCode 1-owned; title is an OpenCode 2 workspace tab.
    expect(secondaryIds).not.toContain('compaction');
    expect(secondaryIds).not.toContain('sharing');
    expect(secondaryIds).not.toContain('title');
  });
});

describe('SettingsModelSection tabbed block visibility', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides the whole inactive model blocks instead of leaving empty block shells', () => {
    const createSectionHeading = jest.fn((containerEl: HTMLElement, title: string) => containerEl.createEl('h3', { text: title }));
    const createSettingsBlock = jest.fn((containerEl: HTMLElement, options: { title: string; description: string; collapsible?: boolean }) => {
      const hostEl = containerEl.createDiv({
        cls: 'opencodian-settings-block opencodian-settings-section',
        attr: { 'data-settings-surface': 'section' },
      });
      if (!options.collapsible) {
        hostEl.createEl('h4', {
          text: options.title,
          cls: 'opencodian-settings-subsection-heading opencodian-settings-section-heading',
        });
        hostEl.createDiv({ cls: 'opencodian-settings-block-desc', text: options.description });
        return hostEl.createDiv({
          cls: 'opencodian-settings-block-body opencodian-settings-section-body',
          attr: { 'data-settings-surface': 'section-body' },
        });
      }

      const detailsEl = hostEl.createEl('details', { cls: 'opencodian-settings-block-details' });
      detailsEl
        .createEl('summary', { cls: 'opencodian-settings-block-summary' })
        .createDiv({
          cls: 'opencodian-settings-subsection-heading opencodian-settings-section-heading',
          text: options.title,
        });
      return detailsEl.createDiv({
        cls: 'opencodian-settings-block-body opencodian-settings-section-body',
        attr: { 'data-settings-surface': 'section-body' },
      });
    });
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        modelAvailabilitySectionOpen: true,
        modelToolsSectionOpen: true,
      },
      scheduleSettingsUiStateSave: jest.fn(),
      modelConfigService: {},
    };
    const section = new SettingsModelSection({
      app: {} as App,
      plugin: plugin as never,
      createSectionHeading,
      createSettingsBlock,
      setSettingDescWithFormatting: () => undefined,
      applyInlineCodeText: () => undefined,
      refreshTitleModels: () => undefined,
      setRefreshModelsCallback: () => undefined,
      setRefreshModelCatalogStatusCallback: () => undefined,
      getServerState: () => ({ healthy: false, status: 'stopped' as const }),
      setServerState: () => undefined,
    });
    const containerEl = document.createElement('div');

    jest.spyOn(section as never, 'attachCommonSettings').mockImplementation(() => undefined);
    jest.spyOn(section as never, 'bootstrapModelSection').mockResolvedValue(undefined);
    jest.spyOn(
      (section as never).iconCacheManager,
      'attachTools',
    ).mockImplementation(() => undefined);
    jest.spyOn(
      (section as never).iconCacheManager,
      'refreshIconCacheOverview',
    ).mockResolvedValue(undefined);
    jest.spyOn(
      (section as never).catalogCoordinator,
      'updateCommonSummary',
    ).mockImplementation(() => undefined);
    jest.spyOn(
      (section as never).catalogCoordinator,
      'updateDefaultModelButton',
    ).mockImplementation(() => undefined);

    section.attachTabbed(containerEl, 'common');

    const blockEls = Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-block'));
    expect(blockEls).toHaveLength(4);
    expect(blockEls[0]?.style.display).toBe('');
    expect(blockEls[1]?.style.display).toBe('none');
    expect(blockEls[2]?.style.display).toBe('none');
    expect(blockEls[3]?.style.display).toBe('none');
  });
});


describe('backend workspace reachability', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows only the active OpenCode 2 workspace and mounts it once', () => {
    const mount = jest.spyOn(SettingsOpenCode2Section.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      primaryTabId: 'opencode2',
      secondaryTabs: { opencode2: 'connection' },
      enabledBackends: ['opencode2', 'claude-code', 'dsh'],
      activeBackend: 'opencode2',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const labels = Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'))
      .map((element) => element.textContent?.trim());
    expect(labels).toContain('OpenCode 2');
    expect(labels).not.toContain('DeepSeek Harness');
    expect(labels).not.toContain('Claude Code');
    expect(labels).not.toContain('Codex');
    expect(mount).toHaveBeenCalledWith(expect.any(HTMLElement), 'connection');
  });

  it('shows only the active DSH workspace and mounts its split tabs', () => {
    const mount = jest.spyOn(SettingsDshSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      primaryTabId: 'dsh',
      secondaryTabs: { dsh: 'mcp' },
      enabledBackends: ['opencode2', 'dsh'],
      activeBackend: 'dsh',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const labels = Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary-label'))
      .map((element) => element.textContent?.trim());
    expect(labels).toContain('DeepSeek Harness');
    expect(labels).not.toContain('OpenCode 2');
    expect(mount).toHaveBeenCalledWith(expect.any(HTMLElement), 'mcp');
  });

  it('classic layout consumes the same registry visibility and mounts only the active workspace', () => {
    const claudeAttach = jest.spyOn(SettingsClaudeCodeSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const codexAttach = jest.spyOn(SettingsCodexSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const openCode2Attach = jest.spyOn(SettingsOpenCode2Section.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      enabledBackends: ['opencode2', 'claude-code', 'codex'],
      activeBackend: 'claude-code',
    });
    const containerEl = document.createElement('div');

    renderer.renderClassicBackendWorkspaces(containerEl);

    expect(claudeAttach).toHaveBeenCalledTimes(1);
    expect(codexAttach).not.toHaveBeenCalled();
    expect(openCode2Attach).not.toHaveBeenCalled();
  });

  it('renders Claude backend debug only inside the Claude workspace tab', () => {
    const debug = jest.spyOn(SettingsDebugSection.prototype, 'attachBackendTabbed').mockImplementation(() => {});
    const claudeMount = jest.spyOn(SettingsClaudeCodeSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      primaryTabId: 'claude-code',
      secondaryTabs: { 'claude-code': 'debug' },
      enabledBackends: ['claude-code'],
      activeBackend: 'claude-code',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(debug).toHaveBeenCalledWith(expect.any(HTMLElement), 'claude-code');
    expect(claudeMount).not.toHaveBeenCalled();
  });

  it('keeps backend debug panels out of the generic debug tab', () => {
    const backendDebug = jest.spyOn(SettingsDebugSection.prototype, 'attachBackendTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      primaryTabId: 'debug',
      secondaryTabs: { debug: 'plugin' },
      enabledBackends: ['claude-code'],
      activeBackend: 'claude-code',
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(backendDebug).not.toHaveBeenCalled();
  });
});


describe('classic backend workspace navigation', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes the Claude debug subpage to the backend debug mount, not the runtime default', () => {
    const debug = jest.spyOn(SettingsDebugSection.prototype, 'attachBackendTabbed').mockImplementation(() => {});
    const claudeMount = jest.spyOn(SettingsClaudeCodeSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      enabledBackends: ['claude-code'],
      activeBackend: 'claude-code',
    });
    const containerEl = document.createElement('div');

    renderer.renderClassicBackendWorkspaces(containerEl);
    const debugButton = containerEl.querySelector<HTMLButtonElement>('button[data-tab-id="debug"]');
    expect(debugButton).not.toBeNull();
    debugButton!.click();

    expect(debug).toHaveBeenCalledWith(expect.any(HTMLElement), 'claude-code');
    expect(claudeMount).toHaveBeenCalledWith(expect.any(HTMLElement), 'runtime');
    expect(claudeMount).not.toHaveBeenCalledWith(expect.any(HTMLElement), 'debug');
  });

  it('mounts the DSH model subpage through the classic local navigation', () => {
    const mount = jest.spyOn(SettingsDshSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      enabledBackends: ['dsh'],
      activeBackend: 'dsh',
    });
    const containerEl = document.createElement('div');

    renderer.renderClassicBackendWorkspaces(containerEl);
    const modelButton = containerEl.querySelector<HTMLButtonElement>('button[data-tab-id="model"]');
    expect(modelButton).not.toBeNull();
    modelButton!.click();

    expect(mount).toHaveBeenCalledWith(expect.any(HTMLElement), 'model');
  });

  it('disposes the Codex account section before switching to the debug subpage', () => {
    const dispose = jest.spyOn(SettingsCodexSection.prototype, 'dispose').mockImplementation(() => {});
    const attachTabbed = jest.spyOn(SettingsCodexSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const debug = jest.spyOn(SettingsDebugSection.prototype, 'attachBackendTabbed').mockImplementation(() => {});
    const { renderer } = createRendererState({
      enabledBackends: ['codex'],
      activeBackend: 'codex',
    });
    const containerEl = document.createElement('div');

    renderer.renderClassicBackendWorkspaces(containerEl);
    containerEl.querySelector<HTMLButtonElement>('button[data-tab-id="account"]')!.click();
    const disposeAfterAccount = dispose.mock.calls.length;
    containerEl.querySelector<HTMLButtonElement>('button[data-tab-id="debug"]')!.click();

    expect(disposeAfterAccount).toBeGreaterThan(0);
    expect(dispose.mock.calls.length).toBeGreaterThan(disposeAfterAccount);
    expect(debug).toHaveBeenCalledWith(expect.any(HTMLElement), 'codex');
    expect(attachTabbed).not.toHaveBeenCalledWith(expect.any(HTMLElement), 'debug');
  });

  it('disposes the previous Codex section and clears the title refresh callback when subpages change', () => {
    const dispose = jest.spyOn(SettingsCodexSection.prototype, 'dispose').mockImplementation(() => {});
    jest.spyOn(SettingsCodexSection.prototype, 'attachTabbed').mockImplementation(() => {});
    const { renderer, setRefreshTitleModelsCallback } = createRendererState({
      enabledBackends: ['opencode2', 'codex'],
      activeBackend: 'opencode2',
    });
    const containerEl = document.createElement('div');

    renderer.renderClassicBackendWorkspaces(containerEl);
    const modelButton = containerEl.querySelector<HTMLButtonElement>('button[data-tab-id="model"]');
    modelButton!.click();
    const connectionButton = containerEl.querySelector<HTMLButtonElement>('button[data-tab-id="connection"]');
    connectionButton!.click();
    expect(setRefreshTitleModelsCallback).toHaveBeenCalledWith(undefined);

    // Switch the active backend to Codex and exercise its own subpages.
    renderer['deps'].plugin.settings.activeBackend = 'codex';
    renderer['deps'].plugin.settings.enabledBackends = ['opencode2', 'codex'];
    const codexContainer = document.createElement('div');
    renderer.renderClassicBackendWorkspaces(codexContainer);
    const modelTab = codexContainer.querySelector<HTMLButtonElement>('button[data-tab-id="model"]');
    const connectionTab = codexContainer.querySelector<HTMLButtonElement>('button[data-tab-id="connection"]');
    modelTab!.click();
    connectionTab!.click();
    expect(dispose).toHaveBeenCalled();
  });
});
