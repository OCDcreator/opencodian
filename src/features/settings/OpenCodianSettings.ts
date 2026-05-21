/**
 * OpenCodian Settings Tab
 *
 * Settings UI for configuring the OpenCodian plugin.
 * Supports two layout modes: classic flat and tabbed primary/secondary tabs.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsAcpSection } from './SettingsAcpSection';
import { SettingsAgentsSection } from './SettingsAgentsSection';
import { SettingsClaudeCodeSection } from './SettingsClaudeCodeSection';
import { SettingsCommandsSection } from './SettingsCommandsSection';
import { SettingsConversationSection } from './SettingsConversationSection';
import { SettingsDebugSection } from './SettingsDebugSection';
import {
  enhanceSettingsDropdowns,
  type SettingsDropdownsEnhancerHandle,
} from './SettingsDropdownControl';
import { SettingsFormatterSection } from './SettingsFormatterSection';
import { SettingsMcpSection } from './SettingsMcpSection';
import { SettingsModelSection } from './SettingsModelSection';
import {
  addSettingHelpButton,
  applyInlineCodeText,
  createSettingsBlock,
  renderLanguageSetting,
  renderSettingsPanelTitle,
  setSettingDescWithFormatting,
  setSettingNameWithFormatting,
} from './SettingsPanelChrome';
import { SettingsPluginSection } from './SettingsPluginSection';
import { SettingsSectionCoordinator } from './SettingsSectionCoordinator';
import { SettingsSecuritySection } from './SettingsSecuritySection';
import { SettingsServerSection } from './SettingsServerSection';
import { SettingsSkillSection } from './SettingsSkillSection';
import { SettingsStyleSection } from './SettingsStyleSection';
import { SettingsTabbedRenderer } from './SettingsTabbedRenderer';
import { SettingsToolSection } from './SettingsToolSection';
import { SettingsUiSection } from './SettingsUiSection';
import { SettingsUserSection } from './SettingsUserSection';

export class OpenCodianSettingTab extends PluginSettingTab {
  plugin: OpenCodianPlugin;
  private refreshModelsCallback?: () => void;
  private refreshTitleModelsCallback?: () => void;
  private refreshModelCatalogStatusCallback?: () => void;
  private modelRefreshFrameId: number | null = null;
  private lastKnownServerHealthy = false;
  private lastKnownServerStatus: ReturnType<OpenCodianPlugin['openCodeService']['getServerStatus']> = 'stopped';
  private readonly sectionCoordinator: SettingsSectionCoordinator;
  private tabbedRenderer: SettingsTabbedRenderer | null = null;
  private agentsSection: SettingsAgentsSection | null = null;
  private commandsSection: SettingsCommandsSection | null = null;
  private conversationSection: SettingsConversationSection | null = null;
  private modelSection: SettingsModelSection | null = null;
  private pluginSection: SettingsPluginSection | null = null;
  private styleSection: SettingsStyleSection | null = null;
  private uiSection: SettingsUiSection | null = null;
  private debugSection: SettingsDebugSection | null = null;
  private serverSection: SettingsServerSection | null = null;
  private claudeCodeSection: SettingsClaudeCodeSection | null = null;
  private mcpSection: SettingsMcpSection | null = null;
  private securitySection: SettingsSecuritySection | null = null;
  private formatterSection: SettingsFormatterSection | null = null;
  private userSection: SettingsUserSection | null = null;
  private dropdownsEnhancer: SettingsDropdownsEnhancerHandle | null = null;

  constructor(app: App, plugin: OpenCodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.sectionCoordinator = new SettingsSectionCoordinator({
      containerEl: this.containerEl,
      getSavedScrollTop: () => this.plugin.settings.settingsPanelScrollTop,
      setSavedScrollTop: (scrollTop) => {
        this.plugin.settings.settingsPanelScrollTop = scrollTop;
      },
      scheduleScrollStateSave: () => this.plugin.scheduleSettingsUiStateSave(),
    });
  }

  private getOrCreateTabbedRenderer(): SettingsTabbedRenderer {
    if (!this.tabbedRenderer) {
      this.tabbedRenderer = new SettingsTabbedRenderer({
        app: this.app,
        plugin: this.plugin,
        createHeading: (containerEl, title, tooltip) => this.createSectionHeading(containerEl, title, tooltip),
        createSettingsBlock: (containerEl, options) => createSettingsBlock(containerEl, options, applyInlineCodeText),
        setSettingDescWithFormatting: (setting, text) => setSettingDescWithFormatting(setting, text, applyInlineCodeText),
        applyInlineCodeText,
        setSettingNameWithFormatting: (setting, text) => setSettingNameWithFormatting(setting, text, applyInlineCodeText),
        addSettingHelpButton,
        notifyModelCatalogStatus: () => { this.refreshModelCatalogStatusCallback?.(); },
        setModelCatalogStatusCallback: (cb) => { this.refreshModelCatalogStatusCallback = cb; },
        setServerSection: (section) => { this.serverSection = section; },
        setMcpSection: (section) => { this.mcpSection = section; },
        setModelSection: (section) => { this.modelSection = section; },
        setSecuritySection: (section) => { this.securitySection = section; },
        getRefreshModelsCallback: () => this.refreshModelsCallback,
        getRefreshTitleModelsCallback: () => this.refreshTitleModelsCallback,
        setRefreshModelsCallback: (cb) => { this.refreshModelsCallback = cb; },
        setRefreshTitleModelsCallback: (cb) => { this.refreshTitleModelsCallback = cb; },
        getServerState: () => ({ healthy: this.lastKnownServerHealthy, status: this.lastKnownServerStatus }),
        setServerState: ({ healthy, status }) => {
          this.lastKnownServerHealthy = healthy;
          this.lastKnownServerStatus = status;
        },
        requestDisplayRefresh: () => { this.display(); },
        renderUserContent: (el, secondaryTabId) => {
          this.createUserSection().attachTabbed(el, secondaryTabId);
        },
        renderLayoutModeSetting: (el) => { this.renderLayoutModeSetting(el); },
        renderLanguageSetting: (el) => { this.renderLanguageSetting(el); },
        renderSettingsInEditorAreaSetting: (el) => { this.renderSettingsInEditorAreaSetting(el); },
      });
    }
    return this.tabbedRenderer;
  }

  /** Called when models are auto-loaded - refreshes the model dropdowns */
  onModelsLoaded(): void {
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
    }

    this.modelRefreshFrameId = window.requestAnimationFrame(() => {
      this.modelRefreshFrameId = null;
      this.refreshModelsCallback?.();
      this.refreshTitleModelsCallback?.();
    });
  }

  refreshServerStatusDisplay(): void {
    void this.serverSection?.refreshStatus();
    this.refreshModelCatalogStatusCallback?.();
  }

  renderLanguageSetting(containerEl: HTMLElement): void {
    renderLanguageSetting(containerEl, this.plugin, () => { this.display(); });
  }

  private renderSettingsInEditorAreaSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.settingsInEditorArea.name'))
      .setDesc(t('settings.ui.settingsInEditorArea.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.settingsInEditorArea)
          .onChange(async (value) => {
            this.plugin.settings.settingsInEditorArea = value;
            await this.plugin.saveSettings();
          })
      );
  }

  // ─── Navigation ────────────────────────────────────────────────────

  scrollToServerSection(): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      this.getOrCreateTabbedRenderer().switchToPrimaryTab('server', 'connection');
      return;
    }

    this.sectionCoordinator.scrollToSectionByTitle(t('settings.server.title'));
  }

  scrollToModelSection(): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      this.getOrCreateTabbedRenderer().switchToPrimaryTab('model', 'common');
      return;
    }

    this.sectionCoordinator.scrollToSectionByTitle(t('settings.model.title'));
  }

  prepareRestoreScrollOnNextOpen(scrollTop = this.plugin.settings.settingsPanelScrollTop): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      return;
    }

    this.sectionCoordinator.prepareRestoreScrollOnNextOpen(scrollTop);
  }

  prepareScrollToServerOnNextOpen(): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      this.getOrCreateTabbedRenderer().switchToPrimaryTab('server', 'connection');
      return;
    }

    this.sectionCoordinator.prepareScrollToSectionOnNextOpen(t('settings.server.title'));
  }

  prepareScrollToClaudeCodeOnNextOpen(): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      this.getOrCreateTabbedRenderer().switchToPrimaryTab('claude-code', 'runtime');
      return;
    }

    this.sectionCoordinator.prepareScrollToSectionOnNextOpen(t('settings.claudeCode.title'));
  }

  prepareScrollToLspOnNextOpen(): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      this.getOrCreateTabbedRenderer().switchToPrimaryTab('formatter', 'lsp');
      return;
    }

    this.sectionCoordinator.prepareScrollToSectionOnNextOpen(t('settings.formatter.tab.lsp'));
  }

  prepareScrollToConversationOnNextOpen(secondaryTab?: string): void {
    if (this.plugin.settings.settingsLayoutMode === 'tabbed') {
      const resolvedSecondaryTab = secondaryTab === 'rendering' ? 'display' : secondaryTab;
      this.getOrCreateTabbedRenderer().switchToPrimaryTab('conversation', resolvedSecondaryTab ?? 'display');
      return;
    }

    this.sectionCoordinator.prepareScrollToSectionOnNextOpen(
      this.resolveConversationSettingsScrollTitle(secondaryTab),
    );
  }

  private resolveConversationSettingsScrollTitle(secondaryTab?: string): string {
    switch (secondaryTab) {
      case 'title':
        return t('settings.titleGeneration.title');
      case 'compaction':
        return t('settings.conversation.compaction.projectNote');
      case 'questions':
        return t('settings.conversation.questions.title');
      case 'rendering':
      case 'display':
        return t('settings.conversation.display.title');
      default:
        return t('settings.conversation.title');
    }
  }

  // ─── Main display ──────────────────────────────────────────────────

  display(): void {
    const { containerEl } = this;
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.disposeSections();

    const mode = this.plugin.settings.settingsLayoutMode;
    if (mode === 'tabbed') {
      this.renderTabbedDisplay(containerEl);
    } else {
      this.renderClassicDisplay(containerEl);
    }
    this.dropdownsEnhancer = enhanceSettingsDropdowns(containerEl);
  }

  private disposeSections(): void {
    this.conversationSection?.dispose();
    this.agentsSection?.dispose();
    this.commandsSection?.dispose();
    this.modelSection?.dispose();
    this.pluginSection?.dispose();
    this.styleSection?.dispose();
    this.uiSection?.dispose();
    this.debugSection?.dispose();
    this.serverSection?.dispose();
    this.mcpSection?.dispose();
    this.securitySection?.dispose();
    this.formatterSection?.dispose();
    this.userSection = null;
    this.serverSection = null;
    this.mcpSection = null;
    this.securitySection = null;
    this.formatterSection = null;
    this.claudeCodeSection = null;
    this.refreshModelCatalogStatusCallback = undefined;
  }

  // ─── Classic layout ────────────────────────────────────────────────

  private renderClassicDisplay(containerEl: HTMLElement): void {
    this.sectionCoordinator.beginDisplay(t('settings.title'), {
      renderPanelTitle: (hostEl) => { this.renderPanelTitle(hostEl); },
    });
    containerEl.classList.remove('opencodian-settings--tabbed');
    containerEl.classList.add('opencodian-settings--classic');
    containerEl.dataset.settingsSurface = 'page';
    containerEl.dataset.settingsLayoutMode = 'classic';

    this.renderClassicGeneralSection(containerEl);
    if (this.isActiveBackend('claude-code')) {
      this.addClaudeCodeSettings(containerEl);
    }
    if (this.isActiveBackend('opencode')) {
      this.addServerSettings(containerEl);
      this.addModelSettings(containerEl);
    }
    this.addConversationSettings(containerEl);
    if (this.isActiveBackend('opencode')) {
      this.addAgentsSettings(containerEl);
      this.addCommandsSettings(containerEl);
      this.addMcpSettings(containerEl);
      this.addFormatterSettings(containerEl);
      this.addPluginSettings(containerEl);
      this.addSecuritySettings(containerEl);
    }
    this.addUISettings(containerEl);
    this.addStyleSettings(containerEl);
    this.addDebugSettings(containerEl);
    this.addUserSettings(containerEl);
    if (this.isActiveBackend('opencode')) {
      this.addSkillsSettings(containerEl);
      this.addToolsSettings(containerEl);
      this.addAcpSettings(containerEl);
    }

    this.sectionCoordinator.finishDisplay();
  }

  // ─── Tabbed layout ─────────────────────────────────────────────────

  private renderTabbedDisplay(containerEl: HTMLElement): void {
    this.sectionCoordinator.beginDisplay(t('settings.title'), {
      showQuickNav: false,
      renderPanelTitle: (hostEl) => { this.renderPanelTitle(hostEl); },
    });
    containerEl.classList.remove('opencodian-settings--classic');
    containerEl.classList.add('opencodian-settings--tabbed');
    containerEl.dataset.settingsSurface = 'page';
    containerEl.dataset.settingsLayoutMode = 'tabbed';

    this.getOrCreateTabbedRenderer().renderDisplay(containerEl);

    this.sectionCoordinator.finishDisplay();
  }

  private renderPanelTitle(containerEl: HTMLElement): void {
    renderSettingsPanelTitle(containerEl, this.app, this.plugin);
  }

  private getActiveBackend(): AgentBackendKind | undefined {
    const activeBackend = this.plugin.settings.activeBackend;
    return activeBackend && this.plugin.settings.enabledBackends.includes(activeBackend)
      ? activeBackend
      : this.plugin.settings.enabledBackends[0];
  }

  private isActiveBackend(backend: AgentBackendKind): boolean {
    return this.getActiveBackend() === backend;
  }

  // ─── Layout mode control ───────────────────────────────────────────

  renderLayoutModeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.layoutMode.name'))
      .setDesc(t('settings.layoutMode.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('classic', t('settings.layoutMode.classic'));
        dropdown.addOption('tabbed', t('settings.layoutMode.tabbed'));
        dropdown
          .setValue(this.plugin.settings.settingsLayoutMode)
          .onChange(async (value) => {
            this.plugin.settings.settingsLayoutMode = value as 'classic' | 'tabbed';
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  // ─── Classic section rendering ─────────────────────────────────────

  private renderClassicGeneralSection(containerEl: HTMLElement): void {
    this.createSectionHeading(
      containerEl,
      t('settings.general.title'),
      t('settings.quickNav.generalDesc'),
    );

    const blockBodyEl = containerEl
      .createDiv({
        cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-general-merged-block',
        attr: { 'data-settings-surface': 'section' },
      })
      .createDiv({
        cls: 'opencodian-settings-block-body opencodian-settings-section-body',
        attr: { 'data-settings-surface': 'section-body' },
      });
    this.renderLayoutModeSetting(blockBodyEl);
    this.renderLanguageSetting(blockBodyEl);
    this.renderSettingsInEditorAreaSetting(blockBodyEl);
  }

  private addServerSettings(containerEl: HTMLElement): HTMLHeadingElement {
    let serverSection: SettingsServerSection | null = null;
    serverSection = new SettingsServerSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      notifyModelCatalogStatus: () => {
        this.refreshModelCatalogStatusCallback?.();
      },
      onDispose: () => {
        if (this.serverSection === serverSection) {
          this.serverSection = null;
        }
        this.refreshModelCatalogStatusCallback = undefined;
      },
      onServerStateChange: ({ healthy, status }) => {
        this.lastKnownServerHealthy = healthy;
        this.lastKnownServerStatus = status;
      },
      requestDisplayRefresh: () => {
        this.display();
      },
    });
    this.serverSection = serverSection;
    return serverSection.attach(containerEl);
  }

  private addClaudeCodeSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.claudeCodeSection ??= new SettingsClaudeCodeSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.claudeCodeSection.attach(containerEl);
  }

  private addMcpSettings(containerEl: HTMLElement): void {
    this.mcpSection = new SettingsMcpSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      requestDisplayRefresh: () => { this.display(); },
    });
    this.mcpSection.attach(containerEl);
  }

  private addModelSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.modelSection ??= new SettingsModelSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => createSettingsBlock(hostEl, options, applyInlineCodeText),
      setSettingDescWithFormatting: (setting, text) => setSettingDescWithFormatting(setting, text, applyInlineCodeText),
      applyInlineCodeText,
      refreshTitleModels: () => {
        this.refreshTitleModelsCallback?.();
      },
      setRefreshModelsCallback: (callback) => {
        this.refreshModelsCallback = callback;
      },
      setRefreshModelCatalogStatusCallback: (callback) => {
        this.refreshModelCatalogStatusCallback = callback;
      },
      getServerState: () => ({
        healthy: this.lastKnownServerHealthy,
        status: this.lastKnownServerStatus,
      }),
      setServerState: ({ healthy, status }) => {
        this.lastKnownServerHealthy = healthy;
        this.lastKnownServerStatus = status;
      },
    });
    return this.modelSection.attach(containerEl);
  }

  private addConversationSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.conversationSection ??= new SettingsConversationSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => createSettingsBlock(hostEl, options, applyInlineCodeText),
      addSettingHelpButton,
      setRefreshTitleModelsCallback: (callback) => {
        this.refreshTitleModelsCallback = callback;
      },
    });
    return this.conversationSection.attach(containerEl);
  }

  private addAgentsSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.agentsSection ??= new SettingsAgentsSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.agentsSection.attach(containerEl);
  }

  private addCommandsSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.commandsSection ??= new SettingsCommandsSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.commandsSection.attach(containerEl);
  }

  private addPluginSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.pluginSection ??= new SettingsPluginSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      applyInlineCodeText,
      setSettingNameWithFormatting: (setting, text) => setSettingNameWithFormatting(setting, text, applyInlineCodeText),
      setSettingDescWithFormatting: (setting, text) => setSettingDescWithFormatting(setting, text, applyInlineCodeText),
    });
    return this.pluginSection.attach(containerEl);
  }

  private addSecuritySettings(containerEl: HTMLElement): HTMLHeadingElement {
    return new SettingsSecuritySection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: this.createSectionHeading.bind(this),
    }).attach(containerEl);
  }

  private addFormatterSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.formatterSection ??= new SettingsFormatterSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      requestDisplayRefresh: () => { this.display(); },
    });
    return this.formatterSection.attach(containerEl);
  }

  private addUISettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.uiSection ??= new SettingsUiSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.uiSection.attach(containerEl);
  }

  private addStyleSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.styleSection ??= new SettingsStyleSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      setSettingDescWithFormatting: (setting, text) => setSettingDescWithFormatting(setting, text, applyInlineCodeText),
      addSettingHelpButton,
    });
    return this.styleSection.attach(containerEl);
  }

  private addDebugSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.debugSection ??= new SettingsDebugSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.debugSection.attach(containerEl);
  }

  private addUserSettings(containerEl: HTMLElement): HTMLHeadingElement {
    return this.createUserSection().attach(containerEl);
  }

  private addSkillsSettings(containerEl: HTMLElement): void {
    new SettingsSkillSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    }).attach(containerEl);
  }

  private addToolsSettings(containerEl: HTMLElement): void {
    this.createSectionHeading(containerEl, t('settings.tools.title'));

    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section',
      attr: { 'data-settings-surface': 'section' },
    });
    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    bodyEl.createEl('h3', { text: t('settings.tools.tab.builtin') });
    const builtinSection = new SettingsToolSection(bodyEl, this.plugin, 'builtin');
    void builtinSection.render();

    bodyEl.createEl('h3', { text: t('settings.tools.tab.custom') });
    const customSection = new SettingsToolSection(bodyEl, this.plugin, 'custom');
    void customSection.render();
  }

  private addAcpSettings(containerEl: HTMLElement): void {
    new SettingsAcpSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    }).attach(containerEl);
  }

  // ─── Shared helpers ────────────────────────────────────────────────

  hide(): void {
    this.sectionCoordinator.hide();
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
    this.conversationSection?.dispose();
    this.agentsSection?.dispose();
    this.commandsSection?.dispose();
    this.styleSection?.dispose();
    this.modelSection?.dispose();
    this.pluginSection?.dispose();
    this.uiSection?.dispose();
    this.debugSection?.dispose();
    this.mcpSection?.dispose();
    this.securitySection?.dispose();
    this.formatterSection?.dispose();
    this.claudeCodeSection = null;
    this.refreshModelsCallback = undefined;
    this.refreshTitleModelsCallback = undefined;
    super.hide();
  }

  private createSectionHeading(
    containerEl: HTMLElement,
    title: string,
    tooltip = title,
  ): HTMLHeadingElement {
    return this.sectionCoordinator.createSectionHeading(containerEl, {
      title,
      tooltip,
    });
  }

  private createUserSection(): SettingsUserSection {
    this.userSection ??= new SettingsUserSection(this.plugin, {
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.userSection;
  }
}
