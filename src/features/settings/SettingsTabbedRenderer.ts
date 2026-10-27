/**
 * Settings Tabbed Renderer
 *
 * Renders tabbed layout content panels and handles primary/secondary tab navigation.
 * Extracted from OpenCodianSettings to keep that file under the max-lines limit.
 */
import { type App, setIcon, Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsStyleSection } from './appearance/SettingsStyleSection';
import { SettingsAcpSection } from './backends/acp/SettingsAcpSection';
import { SettingsClaudeCodeSection } from './backends/claude/SettingsClaudeCodeSection';
import { SettingsCodexSection } from './backends/codex/SettingsCodexSection';
import { createSettingsDshSection, SettingsBackendSection, SettingsOpenCode2Section } from './backends/opencode/SettingsBackendSection';
import { SettingsCommandsSection } from './backends/opencode/SettingsCommandsSection';
import { SettingsServerSection } from './backends/opencode/SettingsServerSection';
import { SettingsPiSection } from './backends/pi/SettingsPiSection';
import { SettingsZCodeSection } from './backends/zcode/SettingsZCodeSection';
import { SettingsCapabilityLabSection } from './capabilities/SettingsCapabilityLabSection';
import { SettingsDebugSection } from './debug/SettingsDebugSection';
import { createClaudeTraceDiagnosticsPort, createCodexTraceDiagnosticsPort, createOpenCodeTraceDiagnosticsPort } from './debug/types';
import { SettingsConversationSection } from './general/SettingsConversationSection';
import { SettingsFormatterSection } from './general/SettingsFormatterSection';
import { SettingsImageGenerationSection } from './general/SettingsImageGenerationSection';
import { SettingsInlineEditSection } from './general/SettingsInlineEditSection';
import { SettingsPluginSection } from './general/SettingsPluginSection';
import { SettingsRemoteControlSection } from './general/SettingsRemoteControlSection';
import { SettingsSecuritySection } from './general/SettingsSecuritySection';
import { SettingsUiSection } from './general/SettingsUiSection';
import { SettingsMcpSection } from './mcp/SettingsMcpSection';
import { SettingsModelSection } from './models/SettingsModelSection';
import { renderAgentSwitcherFloatingIcons } from './resources/AgentSwitcherFloatingIcons';
import { SettingsAgentsSection } from './resources/SettingsAgentsSection';
import { SettingsContextGroupsSection } from './resources/SettingsContextGroupsSection';
import { SettingsSkillSection } from './resources/SettingsSkillSection';
import { SettingsToolSection } from './resources/SettingsToolSection';
import {
  getActiveSecondaryTabId,
  getBackendWorkspaceTab,
  getVisibleBackendWorkspaces,
  resolvePrimaryTabId,
  resolveSecondaryTabId,
  SETTINGS_PRIMARY_TABS,
} from './settingsLayoutRegistry';
import { refreshSettingsTabbedHeader } from './SettingsTabbedHeader';

interface SettingHelpButtonConfig {
  tooltip: string;
  onClick: () => void;
}

interface SettingsBlockOptions {
  title: string;
  description: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  descriptionPlacement?: 'summary' | 'footer';
}

type ServerStatus = ReturnType<OpenCodianPlugin['openCodeService']['getServerStatus']>;

export interface TabRendererDependencies {
  app: App;
  plugin: OpenCodianPlugin;
  createHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  createSettingsBlock: (containerEl: HTMLElement, options: SettingsBlockOptions) => HTMLElement;
  setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;
  setSettingNameWithFormatting: (setting: Setting, text: string) => void;
  addSettingHelpButton: (setting: Setting, helpButton: SettingHelpButtonConfig) => void;
  notifyModelCatalogStatus: () => void;
  setModelCatalogStatusCallback: (cb: (() => void) | undefined) => void;
  setServerSection: (section: SettingsServerSection | null) => void;
  setCodexSection: (section: SettingsCodexSection | null) => void;
  setMcpSection: (section: SettingsMcpSection | null) => void;
  setModelSection: (section: SettingsModelSection | null) => void;
  setPluginSection: (section: SettingsPluginSection | null) => void;
  setSecuritySection: (section: SettingsSecuritySection | null) => void;
  getRefreshModelsCallback: () => (() => void) | undefined;
  getRefreshTitleModelsCallback: () => (() => void) | undefined;
  setRefreshModelsCallback: (cb: (() => void) | undefined) => void;
  setRefreshTitleModelsCallback: (cb: (() => void) | undefined) => void;
  getServerState: () => { healthy: boolean; status: ServerStatus };
  setServerState: (state: { healthy: boolean; status: ServerStatus }) => void;
  requestDisplayRefresh: () => void;
  renderUserContent: (containerEl: HTMLElement, secondaryTabId: string) => void;
  /** Renders the shared OpenCode 2 title controls through the host's conversation section. */
  renderConversationTitleSettings: (containerEl: HTMLElement) => void;
  renderLayoutModeSetting: (containerEl: HTMLElement) => void;
  renderLanguageSetting: (containerEl: HTMLElement) => void;
  renderSettingsInEditorAreaSetting: (containerEl: HTMLElement) => void;
  renderSecretsKeychainSetting: (containerEl: HTMLElement) => void;
  renderEnvironmentVariablesSetting: (containerEl: HTMLElement) => void;
  renderPluginUpdateSection: (containerEl: HTMLElement) => void;
}

export class SettingsTabbedRenderer {
  private readonly deps: TabRendererDependencies;
  private activeCodexSection: SettingsCodexSection | null = null;

  constructor(deps: TabRendererDependencies) { this.deps = deps; }

  renderDisplay(containerEl: HTMLElement): void {
    containerEl.classList.add('opencodian-settings-tabbed');
    const activeBackend = this.getActiveBackend();
    const visibleTabs = SETTINGS_PRIMARY_TABS.filter((tab) => {
      if (!tab.backendRequired) return true;
      return tab.backendRequired === activeBackend;
    });
    let activePrimaryId = resolvePrimaryTabId(
      this.deps.plugin.settings.settingsTabbedPrimaryTab,
    );
    if (!visibleTabs.some((tab) => tab.id === activePrimaryId)) {
      activePrimaryId = 'general';
    }

    const primaryDef = visibleTabs.find((pt) => pt.id === activePrimaryId);
    const visibleSecondaryTabs = (primaryDef?.secondaryTabs ?? []).filter((tab) => {
      if (!tab.backendRequired) return true;
      return tab.backendRequired === activeBackend;
    });
    let activeSecondaryId = getActiveSecondaryTabId(
      activePrimaryId,
      this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
    );
    if (!visibleSecondaryTabs.some((tab) => tab.id === activeSecondaryId)) {
      activeSecondaryId = visibleSecondaryTabs[0]?.id ?? primaryDef?.defaultSecondaryTabId ?? 'basic';
    }

    const enabledAgents = this.getEnabledAgents();
    const selectedAgent = this.getSelectedAgent(enabledAgents);
    refreshSettingsTabbedHeader(containerEl, {
      selectedAgent,
      enabledAgents,
      onSelectAgent: (agent) => { this.switchAgent(agent); },
    });
    renderAgentSwitcherFloatingIcons(containerEl, {
      selectedAgent,
      enabledAgents,
      onSelect: (agent) => { this.switchAgent(agent); },
    });

    // Primary tab bar
    const primaryBarEl = containerEl.createDiv({ cls: 'opencodian-settings-tabs-primary' });
    for (const primaryTab of visibleTabs) {
      const tabEl = primaryBarEl.createEl('button', {
        cls: `opencodian-settings-tab-primary${primaryTab.id === activePrimaryId ? ' opencodian-settings-tab-active' : ''}`,
      });
      tabEl.type = 'button';
      tabEl.dataset.tabId = primaryTab.id;
      const iconEl = tabEl.createSpan({ cls: 'opencodian-settings-tab-primary-icon' });
      setIcon(iconEl, primaryTab.icon);
      tabEl.createSpan({
        cls: 'opencodian-settings-tab-primary-label',
        text: t(primaryTab.labelKey),
      });
      tabEl.addEventListener('click', () => {
        this.switchToPrimaryTab(primaryTab.id, undefined);
      });
    }

    // Secondary tab bar
    if (primaryDef && visibleSecondaryTabs.length > 1) {
      const secondaryBarEl = containerEl.createDiv({ cls: 'opencodian-settings-tabs-secondary' });
      for (const secondaryTab of visibleSecondaryTabs) {
        const tabEl = secondaryBarEl.createEl('button', {
          cls: `opencodian-settings-tab-secondary${secondaryTab.id === activeSecondaryId ? ' opencodian-settings-tab-active' : ''}`,
          text: t(secondaryTab.labelKey),
        });
        tabEl.type = 'button';
        tabEl.dataset.tabId = secondaryTab.id;
        tabEl.addEventListener('click', () => {
          this.switchSecondaryTab(activePrimaryId, secondaryTab.id);
        });
      }
    }

    // Content shell
    const contentEl = containerEl.createDiv({
      cls: 'opencodian-settings-content-shell',
      attr: {
        'data-primary-tab': activePrimaryId,
        'data-secondary-tab': activeSecondaryId,
      },
    });
    if (activePrimaryId === 'pi') new SettingsPiSection(this.deps.plugin).attachTabbed(contentEl, activeSecondaryId);
    else if (activePrimaryId === 'zcode') new SettingsZCodeSection(this.deps.plugin).attachTabbed(contentEl, activeSecondaryId);
    else this.renderContent(contentEl, activePrimaryId, activeSecondaryId);
  }

  switchToPrimaryTab(primaryTabId: string, secondaryTabId?: string): void {
    const resolvedPrimary = resolvePrimaryTabId(primaryTabId);
    const resolvedSecondary = secondaryTabId
      ? resolveSecondaryTabId(resolvedPrimary, secondaryTabId)
      : getActiveSecondaryTabId(
          resolvedPrimary,
          this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
        );

    this.deps.plugin.settings.settingsTabbedPrimaryTab = resolvedPrimary;
    this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary = {
      ...this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
      [resolvedPrimary]: resolvedSecondary,
    };
    void this.deps.plugin.saveSettings();
    this.deps.requestDisplayRefresh();
  }

  /** Align the tabbed settings route with the active backend without refreshing or persisting it. */
  syncToActiveBackend(activeBackend: AgentBackendKind): void {
    const backendPrimaryTab = getBackendWorkspaceTab(activeBackend);
    const resolvedPrimary = backendPrimaryTab?.id ?? 'general';
    const resolvedSecondary = getActiveSecondaryTabId(
      resolvedPrimary,
      this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
    );

    this.deps.plugin.settings.settingsTabbedPrimaryTab = resolvedPrimary;
    this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary = {
      ...this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
      [resolvedPrimary]: resolvedSecondary,
    };
  }

  private switchAgent(agent: AgentBackendKind): void {
    this.syncToActiveBackend(agent);
    this.deps.plugin.settings.activeBackend = agent;
    this.deps.plugin.agentServiceRegistry?.setActive(agent);
    void this.deps.plugin.saveSettings();
    this.deps.plugin.onChatWarmSessionBackendChanged?.();

    // Other enabled adapters may still serve background tabs. Disable/unload owns their teardown.
    try {
      const newAdapter = this.deps.plugin.agentServiceRegistry?.get(agent);
      if (newAdapter) {
        newAdapter.start().catch(() => { /* best effort */ });
      }
    } catch {
      // Best effort: adapter lifecycle should not block the settings switch.
    }

    this.deps.requestDisplayRefresh();
  }

  private getEnabledAgents(): AgentBackendKind[] {
    return this.deps.plugin.settings.enabledBackends;
  }

  private getSelectedAgent(enabledAgents: AgentBackendKind[]): AgentBackendKind | undefined {
    const activeBackend = this.getActiveBackend();
    if (activeBackend && enabledAgents.includes(activeBackend)) {
      return activeBackend;
    }

    return enabledAgents[0];
  }

  private getActiveBackend(): AgentBackendKind | undefined {
    const activeBackend = this.deps.plugin.settings.activeBackend;
    return activeBackend && this.deps.plugin.settings.enabledBackends.includes(activeBackend)
      ? activeBackend
      : this.deps.plugin.settings.enabledBackends[0];
  }

  private switchSecondaryTab(primaryTabId: string, secondaryTabId: string): void {
    const resolvedSecondary = resolveSecondaryTabId(primaryTabId, secondaryTabId);
    this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary = {
      ...this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
      [primaryTabId]: resolvedSecondary,
    };
    void this.deps.plugin.saveSettings();
    this.deps.requestDisplayRefresh();
  }

  // eslint-disable-next-line complexity -- Flat registry dispatch; each case delegates to a focused renderer.
  private renderContent(
    containerEl: HTMLElement, primaryTabId: string,
    secondaryTabId: string,
  ): void {
    switch (primaryTabId) {
      case 'general':
        this.renderGeneralContent(containerEl, secondaryTabId);
        break;
      case 'server':
        this.renderServerContent(containerEl, secondaryTabId);
        break;
      case 'claude-code':
        this.renderBackendWorkspaceTab(containerEl, 'claude-code', secondaryTabId);
        break;
      case 'codex':
        this.renderBackendWorkspaceTab(containerEl, 'codex', secondaryTabId);
        break;
      case 'pi':
        this.renderBackendWorkspaceTab(containerEl, 'pi', secondaryTabId);
        break;
      case 'zcode':
        this.renderBackendWorkspaceTab(containerEl, 'zcode', secondaryTabId);
        break;
      case 'opencode2':
        this.renderBackendWorkspaceTab(containerEl, 'opencode2', secondaryTabId);
        break;
      case 'dsh':
        this.renderBackendWorkspaceTab(containerEl, 'dsh', secondaryTabId);
        break;
      case 'model':
        this.renderModelContent(containerEl, secondaryTabId);
        break;
      case 'conversation':
        this.renderConversationContent(containerEl, secondaryTabId);
        break;
      case 'agents':
        this.renderAgentsContent(containerEl, secondaryTabId);
        break;
      case 'commands':
        this.renderCommandsContent(containerEl, secondaryTabId);
        break;
      case 'formatter':
        this.renderFormatterContent(containerEl, secondaryTabId);
        break;
      case 'mcp':
        this.renderMcpContent(containerEl, secondaryTabId);
        break;
      case 'plugins':
        this.renderPluginsContent(containerEl, secondaryTabId);
        break;
      case 'security':
        this.renderSecurityContent(containerEl, secondaryTabId);
        break;
      case 'ui':
        this.renderUiContent(containerEl, secondaryTabId);
        break;
      case 'style':
        this.renderStyleContent(containerEl, secondaryTabId);
        break;
      case 'debug':
        this.renderDebugContent(containerEl, secondaryTabId);
        break;
      case 'user':
        this.renderUserContent(containerEl, secondaryTabId);
        break;
      case 'skills':
        this.renderSkillsContent(containerEl, secondaryTabId);
        break;
      case 'tools':
        this.renderToolsContent(containerEl, secondaryTabId);
        break;
      case 'acp':
        this.renderAcpContent(containerEl, secondaryTabId);
        break;
    }
  }

  // ─── Per-section tabbed content ────────────────────────────────────

  private renderGeneralContent(containerEl: HTMLElement, secondaryTabId: string): void {
    if (secondaryTabId === 'agents') {
      this.renderBackendManagement(containerEl);
      return;
    }

    const blockBodyEl = containerEl
      .createDiv({
        cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-general-merged-block',
        attr: { 'data-settings-surface': 'section' },
      })
      .createDiv({
        cls: 'opencodian-settings-block-body opencodian-settings-section-body',
        attr: { 'data-settings-surface': 'section-body' },
      });
    this.deps.renderLayoutModeSetting(blockBodyEl);
    this.deps.renderLanguageSetting(blockBodyEl);
    this.deps.renderSettingsInEditorAreaSetting(blockBodyEl);
    this.deps.renderSecretsKeychainSetting(blockBodyEl);
    this.deps.renderEnvironmentVariablesSetting(blockBodyEl);
    this.deps.renderPluginUpdateSection(containerEl);
  }

  private renderServerContent(containerEl: HTMLElement, secondaryTabId: string): void {
    if (secondaryTabId === 'mcp') {
      const mcpSection = new SettingsMcpSection({
        plugin: this.deps.plugin,
        createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
        requestDisplayRefresh: () => { this.deps.requestDisplayRefresh(); },
      });
      this.deps.setMcpSection(mcpSection);
      mcpSection.attachTabbed(containerEl, secondaryTabId);
      return;
    }

    let serverSection: SettingsServerSection | null = null;
    serverSection = new SettingsServerSection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      notifyModelCatalogStatus: () => { this.deps.notifyModelCatalogStatus(); },
      onDispose: () => {
        this.deps.setServerSection(null);
        this.deps.setModelCatalogStatusCallback(undefined);
      },
      onServerStateChange: ({ healthy, status }) => {
        this.deps.setServerState({ healthy, status });
      },
      requestDisplayRefresh: () => { this.deps.requestDisplayRefresh(); },
    });
    this.deps.setServerSection(serverSection);
    serverSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderClaudeCodeContent(containerEl: HTMLElement, secondaryTabId: string): void {
    this.renderBackendWorkspaceTab(containerEl, 'claude-code', secondaryTabId);
  }

  private renderCodexContent(containerEl: HTMLElement, secondaryTabId: string): void {
    this.renderBackendWorkspaceTab(containerEl, 'codex', secondaryTabId);
  }

  /**
   * Single backend-workspace mount used by both tabbed navigation and the
   * classic layout. Hosts supply the shared title-controls callback so the
   * OpenCode 2 title widget always uses their live conversation section.
   */
  renderBackendWorkspaceTab(
    containerEl: HTMLElement,
    backend: AgentBackendKind,
    secondaryTabId: string,
  ): void {
    // Any backend subpage switch (including Codex account -> debug) must release
    // the previous Codex section before the old DOM is discarded.
    this.disposeActiveCodexSection();
    if ((backend === 'claude-code' || backend === 'codex') && secondaryTabId === 'debug') {
      this.createDebugSection().attachBackendTabbed(containerEl, backend);
      return;
    }
    switch (backend) {
      case 'opencode2': {
        new SettingsOpenCode2Section({
          plugin: this.deps.plugin,
          requestDisplayRefresh: () => { this.deps.requestDisplayRefresh(); },
          renderTitleSettings: (hostEl) => { this.deps.renderConversationTitleSettings(hostEl); },
        }).attachTabbed(containerEl, secondaryTabId);
        return;
      }
      case 'claude-code':
        new SettingsClaudeCodeSection({
          plugin: this.deps.plugin,
          createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
        }).attachTabbed(containerEl, secondaryTabId);
        return;
      case 'codex': {
        const codexSection = new SettingsCodexSection({
          plugin: this.deps.plugin,
          createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
        });
        this.activeCodexSection = codexSection;
        this.deps.setCodexSection(codexSection);
        codexSection.attachTabbed(containerEl, secondaryTabId);
        return;
      }
      case 'pi':
        new SettingsPiSection(this.deps.plugin).attachTabbed(containerEl, secondaryTabId);
        return;
      case 'zcode':
        new SettingsZCodeSection(this.deps.plugin).attachTabbed(containerEl, secondaryTabId);
        return;
      case 'dsh':
        createSettingsDshSection(this.deps.plugin).attachTabbed(containerEl, secondaryTabId);
        return;
      default:
        return;
    }
  }

  /** Backend management surface shared by the tabbed general tab and classic hosts. */
  renderBackendManagement(containerEl: HTMLElement): void {
    this.deps.createHeading(containerEl, t('settings.general.tab.agents'));
    new SettingsBackendSection({
      plugin: this.deps.plugin,
      requestDisplayRefresh: () => { this.deps.requestDisplayRefresh(); },
    }).attach(containerEl);
  }

  private disposeActiveCodexSection(): void {
    const previous = this.activeCodexSection;
    this.activeCodexSection = null;
    this.deps.setCodexSection(null);
    previous?.dispose();
  }

  /**
   * Mount the active backend's workspace for the classic layout using the same
   * registry visibility facts as the tabbed layout. Non-active enabled backends
   * never mount here.
   */
  renderClassicBackendWorkspaces(containerEl: HTMLElement): void {
    const activeBackend = this.getActiveBackend();
    for (const backend of getVisibleBackendWorkspaces(activeBackend)) {
      const definition = getBackendWorkspaceTab(backend);
      if (!definition) continue;
      this.deps.createHeading(containerEl, t(definition.labelKey));

      const navEl = containerEl.createDiv({
        cls: 'opencodian-settings-tabs-secondary opencodian-settings-classic-backend-tabs',
      });
      const bodyEl = containerEl.createDiv({
        cls: 'opencodian-settings-classic-backend-body',
      });
      const saved = this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary[definition.id];
      let activeSecondary = resolveSecondaryTabId(definition.id, saved ?? definition.defaultSecondaryTabId);
      if (!definition.secondaryTabs.some((tab) => tab.id === activeSecondary)) {
        activeSecondary = definition.defaultSecondaryTabId;
      }

      let previousTitleTab = false;
      const renderSelected = (): void => {
        if (previousTitleTab) {
          this.deps.setRefreshTitleModelsCallback(undefined);
        }
        this.disposeActiveCodexSection();
        bodyEl.empty();
        this.renderBackendWorkspaceTab(bodyEl, backend, activeSecondary);
        previousTitleTab = backend === 'opencode2' && activeSecondary === 'model';
        for (const button of Array.from(navEl.querySelectorAll<HTMLButtonElement>('button'))) {
          button.classList.toggle(
            'opencodian-settings-tab-active',
            button.dataset.tabId === activeSecondary,
          );
        }
      };

      for (const secondaryTab of definition.secondaryTabs) {
        const button = navEl.createEl('button', {
          cls: 'opencodian-settings-tab-secondary',
          text: t(secondaryTab.labelKey),
          attr: { type: 'button', 'data-tab-id': secondaryTab.id },
        });
        button.addEventListener('click', () => {
          activeSecondary = secondaryTab.id;
          this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary = {
            ...this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
            [definition.id]: secondaryTab.id,
          };
          void this.deps.plugin.saveSettings();
          renderSelected();
        });
      }
      renderSelected();
    }
  }

  private renderModelContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const modelSection = new SettingsModelSection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => this.deps.createSettingsBlock(hostEl, options),
      setSettingDescWithFormatting: (setting, text) => this.deps.setSettingDescWithFormatting(setting, text),
      applyInlineCodeText: (targetEl, text) => this.deps.applyInlineCodeText(targetEl, text),
      refreshTitleModels: () => { this.deps.getRefreshTitleModelsCallback()?.(); },
      setRefreshModelsCallback: (callback) => { this.deps.setRefreshModelsCallback(callback); },
      setRefreshModelCatalogStatusCallback: (callback) => { this.deps.setModelCatalogStatusCallback(callback); },
      getServerState: () => this.deps.getServerState(),
      setServerState: ({ healthy, status }) => { this.deps.setServerState({ healthy, status }); },
    });
    this.deps.setModelSection(modelSection);
    modelSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderConversationContent(containerEl: HTMLElement, secondaryTabId: string): void {
    this.createConversationSection().attachTabbed(containerEl, secondaryTabId);
    new SettingsInlineEditSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    }).attachTabbed(containerEl, secondaryTabId);
    new SettingsContextGroupsSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    }).attachTabbed(containerEl, secondaryTabId);
    new SettingsImageGenerationSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    }).attachTabbed(containerEl, secondaryTabId);
  }

  private createConversationSection(): SettingsConversationSection {
    return new SettingsConversationSection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => this.deps.createSettingsBlock(hostEl, options),
      addSettingHelpButton: (setting, helpButton) => this.deps.addSettingHelpButton(setting, helpButton),
      setRefreshTitleModelsCallback: (callback) => { this.deps.setRefreshTitleModelsCallback(callback); },
    });
  }

  private renderAgentsContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const agentsSection = new SettingsAgentsSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
    agentsSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderCommandsContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const commandsSection = new SettingsCommandsSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
    commandsSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderFormatterContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const formatterSection = new SettingsFormatterSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      requestDisplayRefresh: () => { this.deps.requestDisplayRefresh(); },
    });
    formatterSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderMcpContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const mcpSection = new SettingsMcpSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      requestDisplayRefresh: () => { this.deps.requestDisplayRefresh(); },
    });
    this.deps.setMcpSection(mcpSection);
    mcpSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderPluginsContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const pluginSection = new SettingsPluginSection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      applyInlineCodeText: (targetEl, text) => { this.deps.applyInlineCodeText(targetEl, text); },
      setSettingNameWithFormatting: (setting, text) => { this.deps.setSettingNameWithFormatting(setting, text); },
      setSettingDescWithFormatting: (setting, text) => { this.deps.setSettingDescWithFormatting(setting, text); },
    });
    this.deps.setPluginSection(pluginSection);
    pluginSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderSecurityContent(containerEl: HTMLElement, secondaryTabId: string): void {
    if (secondaryTabId === 'remote') {
      // R-C6 remote control gets its own security secondary tab; the
      // permission/config blocks below stay untouched on the other tabs.
      const remoteControlSection = new SettingsRemoteControlSection({
        app: this.deps.app,
        plugin: this.deps.plugin,
        createSectionHeading: this.deps.createHeading.bind(this.deps),
      });
      remoteControlSection.attachTabbed(containerEl, secondaryTabId);
      return;
    }
    const securitySection = new SettingsSecuritySection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: this.deps.createHeading.bind(this.deps),
    });
    this.deps.setSecuritySection(securitySection);
    securitySection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderUiContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const uiSection = new SettingsUiSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
    uiSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderStyleContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const styleSection = new SettingsStyleSection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      setSettingDescWithFormatting: (setting, text) => this.deps.setSettingDescWithFormatting(setting, text),
      addSettingHelpButton: (setting, helpButton) => this.deps.addSettingHelpButton(setting, helpButton),
    });
    styleSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderDebugContent(containerEl: HTMLElement, secondaryTabId: string): void {
    if (secondaryTabId === 'capability-lab') {
      const capabilityLabSection = new SettingsCapabilityLabSection({
        plugin: this.deps.plugin,
        createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      });
      capabilityLabSection.attachTabbed(containerEl, secondaryTabId);
      return;
    }
    this.createDebugSection().attachTabbed(containerEl, secondaryTabId);
  }

  private createDebugSection(): SettingsDebugSection {
    return new SettingsDebugSection({
      plugin: this.deps.plugin,
      getOpenCodeDiagnostics: () => createOpenCodeTraceDiagnosticsPort(this.deps.plugin.openCodeTraceService),
      getCodexDiagnostics: () => createCodexTraceDiagnosticsPort(this.deps.plugin.codexTraceService),
      getClaudeDiagnostics: () => createClaudeTraceDiagnosticsPort(this.deps.plugin.claudeTraceService),
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
  }

  private renderUserContent(containerEl: HTMLElement, secondaryTabId: string): void {
    this.deps.renderUserContent(containerEl, secondaryTabId);
  }

  private renderSkillsContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const skillSection = new SettingsSkillSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
    skillSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderToolsContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const mode = secondaryTabId === 'custom' ? 'custom' : 'builtin';
    const section = new SettingsToolSection(containerEl, this.deps.plugin, mode);
    void section.render();
  }

  private renderAcpContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const acpSection = new SettingsAcpSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
    acpSection.attachTabbed(containerEl, secondaryTabId);
  }
}
