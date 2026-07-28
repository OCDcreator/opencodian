/**
 * OpenCodian Settings View (Editor Area)
 *
 * Renders the full plugin settings UI inside an editor-area Leaf,
 * allowing split-screen settings viewing alongside the chat view.
 *
 * Reuses all existing section classes from OpenCodianSettingTab —
 * no rendering logic is duplicated.
 */

import type { App } from 'obsidian';
import { ItemView, Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsAcpSection } from './SettingsAcpSection';
import { SettingsAgentsSection } from './SettingsAgentsSection';
import { SettingsClaudeCodeSection } from './SettingsClaudeCodeSection';
import { SettingsCodexSection } from './SettingsCodexSection';
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
import { SettingsPluginUpdateSection } from './SettingsPluginUpdateSection';
import { SettingsSectionCoordinator } from './SettingsSectionCoordinator';
import { SettingsSecuritySection } from './SettingsSecuritySection';
import { SettingsServerSection } from './SettingsServerSection';
import { SettingsSkillSection } from './SettingsSkillSection';
import { SettingsStyleSection } from './SettingsStyleSection';
import { SettingsTabbedRenderer, type TabRendererDependencies } from './SettingsTabbedRenderer';
import { SettingsToolSection } from './SettingsToolSection';
import { SettingsUiSection } from './SettingsUiSection';
import { SettingsUserSection } from './SettingsUserSection';

export class OpenCodianSettingsView extends ItemView {
  private readonly plugin: OpenCodianPlugin;
  private readonly settingsRootEl: HTMLElement;
  private settingsScrollTop = 0;
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
  private codexSection: SettingsCodexSection | null = null;
  private claudeCodeSection: SettingsClaudeCodeSection | null = null;
  private mcpSection: SettingsMcpSection | null = null;
  private securitySection: SettingsSecuritySection | null = null;
  private formatterSection: SettingsFormatterSection | null = null;
  private userSection: SettingsUserSection | null = null;
  private dropdownsEnhancer: SettingsDropdownsEnhancerHandle | null = null;

  constructor(leaf: import('obsidian').WorkspaceLeaf, plugin: OpenCodianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.settingsRootEl = this.contentEl;

    // Keep editor-area scroll local so it does not collide with the standard settings tab.
    this.sectionCoordinator = new SettingsSectionCoordinator({
      containerEl: this.settingsRootEl,
      getSavedScrollTop: () => this.settingsScrollTop,
      setSavedScrollTop: (scrollTop) => {
        this.settingsScrollTop = scrollTop;
      },
      scheduleScrollStateSave: () => {},
      getScrollContainer: () => this.settingsRootEl,
    });
  }

  getViewType(): string {
    return 'opencodian-settings-view';
  }

  getDisplayText(): string {
    return t('settings.ui.settingsInEditorArea.tabTitle');
  }

  getIcon(): string {
    return 'settings';
  }

  async onOpen(): Promise<void> {
    this.renderSettings();
  }

  async onClose(): Promise<void> {
    this.disposeSections();
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.sectionCoordinator.hide();
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
  }

  /** Called from main.ts when models are auto-loaded */
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

  /** Called from main.ts when server status changes */
  refreshServerStatusDisplay(): void {
    void this.serverSection?.refreshStatus();
    this.refreshModelCatalogStatusCallback?.();
  }

  /** Called when the active backend changes while this editor-area settings view is open. */
  handleActiveBackendChange(backend: AgentBackendKind): void {
    if (this.plugin.settings.settingsLayoutMode !== 'tabbed') {
      return;
    }

    this.getOrCreateTabbedRenderer().syncToActiveBackend(backend);
    this.renderSettings();
  }

  /** Full re-render — mirrors OpenCodianSettingTab.display() */
  private renderSettings(): void {
    const containerEl = this.settingsRootEl;
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
    this.addClaudeCodeSettings(containerEl);
    this.addServerSettings(containerEl);
    this.addModelSettings(containerEl);
    this.addConversationSettings(containerEl);
    this.addAgentsSettings(containerEl);
    this.addCommandsSettings(containerEl);
    this.addMcpSettings(containerEl);
    this.addFormatterSettings(containerEl);
    this.addPluginSettings(containerEl);
    this.addSecuritySettings(containerEl);
    this.addUISettings(containerEl);
    this.addStyleSettings(containerEl);
    this.addDebugSettings(containerEl);
    this.addUserSettings(containerEl);
    this.addSkillsSettings(containerEl);
    this.addToolsSettings(containerEl);
    this.addAcpSettings(containerEl);

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
    renderSettingsPanelTitle(containerEl, this.app as App, this.plugin);
  }

  // ─── Tabbed renderer ───────────────────────────────────────────────

  private getOrCreateTabbedRenderer(): SettingsTabbedRenderer {
    if (!this.tabbedRenderer) {
      this.tabbedRenderer = new SettingsTabbedRenderer(this.buildTabRendererDeps());
    }
    return this.tabbedRenderer;
  }

  private buildTabRendererDeps(): TabRendererDependencies {
    return {
      app: this.app as App,
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
      setCodexSection: (section) => { this.codexSection = section; },
      setMcpSection: (section) => { this.mcpSection = section; },
      setModelSection: (section) => { this.modelSection = section; },
      setPluginSection: (section) => { this.pluginSection = section; },
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
      requestDisplayRefresh: () => { this.renderSettings(); },
      renderUserContent: (el, secondaryTabId) => {
        this.createUserSection().attachTabbed(el, secondaryTabId);
      },
      renderLayoutModeSetting: (el) => { this.renderLayoutModeSetting(el); },
      renderLanguageSetting: (el) => { this.renderLanguageSetting(el); },
      renderSettingsInEditorAreaSetting: (el) => { this.renderSettingsInEditorAreaSetting(el); },
      renderPluginUpdateSection: (el) => { this.renderPluginUpdateSection(el); },
    };
  }

  // ─── Layout mode control ───────────────────────────────────────────

  private renderLayoutModeSetting(containerEl: HTMLElement): void {
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
            this.renderSettings();
          });
      });
  }

  private renderLanguageSetting(containerEl: HTMLElement): void {
    renderLanguageSetting(containerEl, this.plugin, () => { this.renderSettings(); });
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
  private renderPluginUpdateSection(containerEl: HTMLElement): void {
    new SettingsPluginUpdateSection({ plugin: this.plugin, requestDisplayRefresh: () => { this.renderSettings(); } }).render(containerEl);
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
    this.renderPluginUpdateSection(containerEl);
  }

  private addServerSettings(containerEl: HTMLElement): void {
    let serverSection: SettingsServerSection | null = null;
    serverSection = new SettingsServerSection({
      app: this.app as App,
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
        this.renderSettings();
      },
    });
    this.serverSection = serverSection;
    serverSection.attach(containerEl);
  }

  private addClaudeCodeSettings(containerEl: HTMLElement): void {
    this.claudeCodeSection ??= new SettingsClaudeCodeSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    this.claudeCodeSection.attach(containerEl);
  }

  private addMcpSettings(containerEl: HTMLElement): void {
    this.mcpSection = new SettingsMcpSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      requestDisplayRefresh: () => { this.renderSettings(); },
    });
    this.mcpSection.attach(containerEl);
  }

  private addModelSettings(containerEl: HTMLElement): void {
    this.modelSection ??= new SettingsModelSection({
      app: this.app as App,
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
    this.modelSection.attach(containerEl);
  }

  private addConversationSettings(containerEl: HTMLElement): void {
    this.conversationSection ??= new SettingsConversationSection({
      app: this.app as App,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => createSettingsBlock(hostEl, options, applyInlineCodeText),
      addSettingHelpButton,
      setRefreshTitleModelsCallback: (callback) => {
        this.refreshTitleModelsCallback = callback;
      },
    });
    this.conversationSection.attach(containerEl);
  }

  private addAgentsSettings(containerEl: HTMLElement): void {
    this.agentsSection ??= new SettingsAgentsSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    this.agentsSection.attach(containerEl);
  }

  private addCommandsSettings(containerEl: HTMLElement): void {
    this.commandsSection ??= new SettingsCommandsSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    this.commandsSection.attach(containerEl);
  }

  private addPluginSettings(containerEl: HTMLElement): void {
    this.pluginSection ??= new SettingsPluginSection({
      app: this.app as App,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      applyInlineCodeText,
      setSettingNameWithFormatting: (setting, text) => setSettingNameWithFormatting(setting, text, applyInlineCodeText),
      setSettingDescWithFormatting: (setting, text) => setSettingDescWithFormatting(setting, text, applyInlineCodeText),
    });
    this.pluginSection.attach(containerEl);
  }

  private addSecuritySettings(containerEl: HTMLElement): void {
    this.securitySection ??= new SettingsSecuritySection({
      app: this.app as App,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    this.securitySection.attach(containerEl);
  }

  private addFormatterSettings(containerEl: HTMLElement): void {
    this.formatterSection ??= new SettingsFormatterSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      requestDisplayRefresh: () => { this.renderSettings(); },
    });
    this.formatterSection.attach(containerEl);
  }

  private addUISettings(containerEl: HTMLElement): void {
    this.uiSection ??= new SettingsUiSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    this.uiSection.attach(containerEl);
  }

  private addStyleSettings(containerEl: HTMLElement): void {
    this.styleSection ??= new SettingsStyleSection({
      app: this.app as App,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      setSettingDescWithFormatting: (setting, text) => setSettingDescWithFormatting(setting, text, applyInlineCodeText),
      addSettingHelpButton,
    });
    this.styleSection.attach(containerEl);
  }

  private addDebugSettings(containerEl: HTMLElement): void {
    this.debugSection ??= new SettingsDebugSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    this.debugSection.attach(containerEl);
  }

  private addUserSettings(containerEl: HTMLElement): void {
    this.createUserSection().attach(containerEl);
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
    this.codexSection?.dispose();
    this.mcpSection?.dispose();
    this.securitySection?.dispose();
    this.formatterSection?.dispose();
    this.userSection?.dispose();
    this.userSection = null;
    this.serverSection = null;
    this.codexSection = null;
    this.mcpSection = null;
    this.securitySection = null;
    this.formatterSection = null;
    this.claudeCodeSection = null;
    this.refreshModelCatalogStatusCallback = undefined;
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
