/**
 * Settings Tabbed Renderer
 *
 * Renders tabbed layout content panels and handles primary/secondary tab navigation.
 * Extracted from OpenCodianSettings to keep that file under the max-lines limit.
 */

import type { App } from 'obsidian';
import { setIcon, Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsAcpSection } from './SettingsAcpSection';
import { SettingsAgentsSection } from './SettingsAgentsSection';
import { SettingsCommandsSection } from './SettingsCommandsSection';
import { SettingsConversationSection } from './SettingsConversationSection';
import { SettingsDebugSection } from './SettingsDebugSection';
import { SettingsFormatterSection } from './SettingsFormatterSection';
import {
  getActiveSecondaryTabId,
  resolvePrimaryTabId,
  resolveSecondaryTabId,
  SETTINGS_PRIMARY_TABS,
} from './settingsLayoutRegistry';
import { SettingsMcpSection } from './SettingsMcpSection';
import { SettingsModelSection } from './SettingsModelSection';
import { SettingsPluginSection } from './SettingsPluginSection';
import { SettingsSecuritySection } from './SettingsSecuritySection';
import { SettingsServerSection } from './SettingsServerSection';
import { SettingsSkillSection } from './SettingsSkillSection';
import { SettingsStyleSection } from './SettingsStyleSection';
import { SettingsToolSection } from './SettingsToolSection';
import { SettingsUiSection } from './SettingsUiSection';

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
  setMcpSection: (section: SettingsMcpSection | null) => void;
  setModelSection: (section: SettingsModelSection | null) => void;
  setSecuritySection: (section: SettingsSecuritySection | null) => void;
  getRefreshModelsCallback: () => (() => void) | undefined;
  getRefreshTitleModelsCallback: () => (() => void) | undefined;
  setRefreshModelsCallback: (cb: (() => void) | undefined) => void;
  setRefreshTitleModelsCallback: (cb: (() => void) | undefined) => void;
  getServerState: () => { healthy: boolean; status: ServerStatus };
  setServerState: (state: { healthy: boolean; status: ServerStatus }) => void;
  requestDisplayRefresh: () => void;
  renderUserContent: (containerEl: HTMLElement, secondaryTabId: string) => void;
  renderLayoutModeSetting: (containerEl: HTMLElement) => void;
  renderLanguageSetting: (containerEl: HTMLElement) => void;
  renderSettingsInEditorAreaSetting: (containerEl: HTMLElement) => void;
}

export class SettingsTabbedRenderer {
  private readonly deps: TabRendererDependencies;

  constructor(deps: TabRendererDependencies) {
    this.deps = deps;
  }

  renderDisplay(containerEl: HTMLElement): void {
    const activePrimaryId = resolvePrimaryTabId(
      this.deps.plugin.settings.settingsTabbedPrimaryTab,
    );
    const activeSecondaryId = getActiveSecondaryTabId(
      activePrimaryId,
      this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
    );

    // Primary tab bar
    const primaryBarEl = containerEl.createDiv({ cls: 'opencodian-settings-tabs-primary' });
    for (const primaryTab of SETTINGS_PRIMARY_TABS) {
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
    const primaryDef = SETTINGS_PRIMARY_TABS.find((pt) => pt.id === activePrimaryId);
    if (primaryDef && primaryDef.secondaryTabs.length > 1) {
      const secondaryBarEl = containerEl.createDiv({ cls: 'opencodian-settings-tabs-secondary' });
      for (const secondaryTab of primaryDef.secondaryTabs) {
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
    this.renderContent(contentEl, activePrimaryId, activeSecondaryId);
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

  private switchSecondaryTab(primaryTabId: string, secondaryTabId: string): void {
    const resolvedSecondary = resolveSecondaryTabId(primaryTabId, secondaryTabId);
    this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary = {
      ...this.deps.plugin.settings.settingsTabbedSecondaryTabByPrimary,
      [primaryTabId]: resolvedSecondary,
    };
    void this.deps.plugin.saveSettings();
    this.deps.requestDisplayRefresh();
  }

  private renderContent(
    containerEl: HTMLElement,
    primaryTabId: string,
    secondaryTabId: string,
  ): void {
    switch (primaryTabId) {
      case 'general':
        this.renderGeneralContent(containerEl, secondaryTabId);
        break;
      case 'server':
        this.renderServerContent(containerEl, secondaryTabId);
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

  private renderGeneralContent(containerEl: HTMLElement, _secondaryTabId: string): void {
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
    const conversationSection = new SettingsConversationSection({
      app: this.deps.app,
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => this.deps.createSettingsBlock(hostEl, options),
      addSettingHelpButton: (setting, helpButton) => this.deps.addSettingHelpButton(setting, helpButton),
      setRefreshTitleModelsCallback: (callback) => { this.deps.setRefreshTitleModelsCallback(callback); },
    });
    conversationSection.attachTabbed(containerEl, secondaryTabId);
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
    pluginSection.attachTabbed(containerEl, secondaryTabId);
  }

  private renderSecurityContent(containerEl: HTMLElement, secondaryTabId: string): void {
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
    const debugSection = new SettingsDebugSection({
      plugin: this.deps.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.deps.createHeading(hostEl, title, tooltip),
    });
    debugSection.attachTabbed(containerEl, secondaryTabId);
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
