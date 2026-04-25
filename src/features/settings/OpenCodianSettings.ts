/**
 * OpenCodian Settings Tab
 *
 * Settings UI for configuring the OpenCodian plugin.
 * Supports two layout modes: classic flat and tabbed primary/secondary tabs.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsAgentsSection } from './SettingsAgentsSection';
import { SettingsCommandsSection } from './SettingsCommandsSection';
import { SettingsConversationSection } from './SettingsConversationSection';
import { SettingsDebugSection } from './SettingsDebugSection';
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
import { SettingsStyleSection } from './SettingsStyleSection';
import { SettingsTabbedRenderer } from './SettingsTabbedRenderer';
import { SettingsUiSection } from './SettingsUiSection';
import {
  renderUserExcludedTagsSetting,
  renderUserProfileSetting,
  renderUserPromptSetting,
} from './SettingsUserSection';

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
  private securitySection: SettingsSecuritySection | null = null;

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
        renderUserProfileSetting: (el) => { renderUserProfileSetting(el, this.plugin); },
        renderUserPromptSetting: (el) => { renderUserPromptSetting(el, this.plugin); },
        renderUserExcludedTagsSetting: (el) => { renderUserExcludedTagsSetting(el, this.plugin); },
        renderLayoutModeSetting: (el) => { this.renderLayoutModeSetting(el); },
        renderLanguageSetting: (el) => { this.renderLanguageSetting(el); },
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

  // ─── Main display ──────────────────────────────────────────────────

  display(): void {
    const { containerEl } = this;
    this.disposeSections();

    const mode = this.plugin.settings.settingsLayoutMode;
    if (mode === 'tabbed') {
      this.renderTabbedDisplay(containerEl);
    } else {
      this.renderClassicDisplay(containerEl);
    }
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
    this.securitySection?.dispose();
    this.serverSection = null;
    this.securitySection = null;
    this.refreshModelCatalogStatusCallback = undefined;
  }

  // ─── Classic layout ────────────────────────────────────────────────

  private renderClassicDisplay(containerEl: HTMLElement): void {
    this.sectionCoordinator.beginDisplay(t('settings.title'), {
      renderPanelTitle: (hostEl) => { this.renderPanelTitle(hostEl); },
    });
    containerEl.classList.remove('opencodian-settings--tabbed');
    containerEl.classList.add('opencodian-settings--classic');

    this.renderClassicGeneralSection(containerEl);
    this.addServerSettings(containerEl);
    this.addModelSettings(containerEl);
    this.addConversationSettings(containerEl);
    this.addAgentsSettings(containerEl);
    this.addCommandsSettings(containerEl);
    this.addPluginSettings(containerEl);
    this.addSecuritySettings(containerEl);
    this.addUISettings(containerEl);
    this.addStyleSettings(containerEl);
    this.addDebugSettings(containerEl);
    this.addUserSettings(containerEl);

    this.sectionCoordinator.finishDisplay();
  }

  // ─── Tabbed layout ─────────────────────────────────────────────────

  private renderTabbedDisplay(containerEl: HTMLElement): void {
    containerEl.empty();
    this.sectionCoordinator.beginDisplay(t('settings.title'), {
      showQuickNav: false,
      renderPanelTitle: (hostEl) => { this.renderPanelTitle(hostEl); },
    });
    containerEl.classList.remove('opencodian-settings--classic');
    containerEl.classList.add('opencodian-settings--tabbed');

    this.getOrCreateTabbedRenderer().renderDisplay(containerEl);

    this.sectionCoordinator.finishDisplay();
  }

  private renderPanelTitle(containerEl: HTMLElement): void {
    renderSettingsPanelTitle(containerEl, this.app, this.plugin);
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
      .createDiv({ cls: 'opencodian-settings-block' })
      .createDiv({ cls: 'opencodian-settings-block-body' });
    this.renderLayoutModeSetting(blockBodyEl);
    this.renderLanguageSetting(blockBodyEl);
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
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.user.title'),
      t('settings.quickNav.userDesc'),
    );

    renderUserProfileSetting(containerEl, this.plugin);
    renderUserPromptSetting(containerEl, this.plugin);
    renderUserExcludedTagsSetting(containerEl, this.plugin);

    return headingEl;
  }

  // ─── Shared helpers ────────────────────────────────────────────────

  hide(): void {
    this.sectionCoordinator.hide();
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
    this.securitySection?.dispose();
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
}
