/**
 * OpenCodian Settings Tab
 *
 * Settings UI for configuring the OpenCodian plugin.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';

import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsConversationSection } from './SettingsConversationSection';
import { SettingsDebugSection } from './SettingsDebugSection';
import { SettingsModelSection } from './SettingsModelSection';
import { SettingsPluginSection } from './SettingsPluginSection';
import { SettingsSectionCoordinator } from './SettingsSectionCoordinator';
import { SettingsSecuritySection } from './SettingsSecuritySection';
import { SettingsServerSection } from './SettingsServerSection';
import { SettingsStyleSection } from './SettingsStyleSection';
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

export class OpenCodianSettingTab extends PluginSettingTab {
  plugin: OpenCodianPlugin;
  private refreshModelsCallback?: () => void;
  private refreshTitleModelsCallback?: () => void;
  private refreshModelCatalogStatusCallback?: () => void;
  private modelRefreshFrameId: number | null = null;
  private lastKnownServerHealthy = false;
  private lastKnownServerStatus: ReturnType<OpenCodianPlugin['openCodeService']['getServerStatus']> = 'stopped';
  private readonly sectionCoordinator: SettingsSectionCoordinator;
  private conversationSection: SettingsConversationSection | null = null;
  private modelSection: SettingsModelSection | null = null;
  private pluginSection: SettingsPluginSection | null = null;
  private styleSection: SettingsStyleSection | null = null;
  private uiSection: SettingsUiSection | null = null;
  private debugSection: SettingsDebugSection | null = null;
  private serverSection: SettingsServerSection | null = null;

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

  private buildInlineCodeFragment(text: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const segments = text.split(/(`[^`\n]+`)/g);

    for (const segment of segments) {
      if (!segment) {
        continue;
      }

      if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
        const codeEl = document.createElement('code');
        codeEl.setText(segment.slice(1, -1));
        fragment.appendChild(codeEl);
        continue;
      }

      const lines = segment.split('\n');
      lines.forEach((line, index) => {
        if (line.length > 0) {
          fragment.appendChild(document.createTextNode(line));
        }
        if (index < lines.length - 1) {
          fragment.appendChild(document.createElement('br'));
        }
      });
    }

    return fragment;
  }

  private applyInlineCodeText(targetEl: HTMLElement | null, text: string): void {
    if (!targetEl) {
      return;
    }

    targetEl.empty();
    targetEl.appendChild(this.buildInlineCodeFragment(text));
  }

  private setSettingNameWithFormatting(setting: Setting, text: string): void {
    setting.setName(text);
    const nameEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-name');
    this.applyInlineCodeText(nameEl, text);
  }

  private setSettingDescWithFormatting(setting: Setting, text: string): void {
    setting.setDesc(text);
    const descEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-description');
    this.applyInlineCodeText(descEl, text);
  }

  scrollToServerSection(): void {
    this.sectionCoordinator.scrollToSectionByTitle(t('settings.server.title'));
  }

  scrollToModelSection(): void {
    this.sectionCoordinator.scrollToSectionByTitle(t('settings.model.title'));
  }

  prepareRestoreScrollOnNextOpen(scrollTop = this.plugin.settings.settingsPanelScrollTop): void {
    this.sectionCoordinator.prepareRestoreScrollOnNextOpen(scrollTop);
  }

  prepareScrollToServerOnNextOpen(): void {
    this.sectionCoordinator.prepareScrollToSectionOnNextOpen(t('settings.server.title'));
  }

  display(): void {
    const { containerEl } = this;
    this.conversationSection?.dispose();
    this.modelSection?.dispose();
    this.pluginSection?.dispose();
    this.styleSection?.dispose();
    this.uiSection?.dispose();
    this.debugSection?.dispose();
    this.serverSection?.dispose();
    this.serverSection = null;
    this.refreshModelCatalogStatusCallback = undefined;
    this.sectionCoordinator.beginDisplay(t('settings.title'));

    this.addLanguageSettings(containerEl);
    this.addServerSettings(containerEl);
    this.addModelSettings(containerEl);
    this.addConversationSettings(containerEl);
    this.addPluginSettings(containerEl);
    this.addSecuritySettings(containerEl);
    this.addUISettings(containerEl);
    this.addStyleSettings(containerEl);
    this.addDebugSettings(containerEl);
    this.addUserSettings(containerEl);

    this.sectionCoordinator.finishDisplay();
  }

  /** Language settings section */
  private addLanguageSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.language.title'),
      t('settings.quickNav.languageDesc'),
    );

    new Setting(containerEl)
      .setName(t('settings.language.select.name'))
      .setDesc(t('settings.language.select.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('en', t('settings.language.en'));
        dropdown.addOption('zh', t('settings.language.zh'));
        dropdown
          .setValue(this.plugin.settings.locale)
          .onChange(async (value) => {
            this.plugin.settings.locale = value as 'en' | 'zh';
            setLocale(value as 'en' | 'zh');
            await this.plugin.saveSettings();
            // Refresh the settings UI to show new language
            this.display();
          });
      });

    return headingEl;
  }

  /** Server settings section */
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

  /** Model settings section */
  private addModelSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.modelSection ??= new SettingsModelSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      createSettingsBlock: (hostEl, options) => this.createSettingsBlock(hostEl, options),
      setSettingDescWithFormatting: (setting, text) => this.setSettingDescWithFormatting(setting, text),
      applyInlineCodeText: (targetEl, text) => this.applyInlineCodeText(targetEl, text),
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
      setRefreshTitleModelsCallback: (callback) => {
        this.refreshTitleModelsCallback = callback;
      },
    });
    return this.conversationSection.attach(containerEl);
  }

  private addPluginSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.pluginSection ??= new SettingsPluginSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      applyInlineCodeText: (targetEl, text) => {
        this.applyInlineCodeText(targetEl, text);
      },
      setSettingNameWithFormatting: (setting, text) => {
        this.setSettingNameWithFormatting(setting, text);
      },
      setSettingDescWithFormatting: (setting, text) => {
        this.setSettingDescWithFormatting(setting, text);
      },
    });
    return this.pluginSection.attach(containerEl);
  }

  /** Clean up when settings tab is closed */
  hide(): void {
    this.sectionCoordinator.hide();
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
    this.conversationSection?.dispose();
    this.styleSection?.dispose();
    this.modelSection?.dispose();
    this.pluginSection?.dispose();
    this.uiSection?.dispose();
    this.debugSection?.dispose();
    this.refreshModelsCallback = undefined;
    this.refreshTitleModelsCallback = undefined;
    super.hide();
  }

  /** Security settings section */
  private addSecuritySettings(containerEl: HTMLElement): HTMLHeadingElement {
    return new SettingsSecuritySection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: this.createSectionHeading.bind(this),
    }).attach(containerEl);
  }

  /** UI settings section */
  private addUISettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.uiSection ??= new SettingsUiSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.uiSection.attach(containerEl);
  }

  /** Style settings section */
  private addStyleSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.styleSection ??= new SettingsStyleSection({
      app: this.app,
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
      setSettingDescWithFormatting: (setting, text) => this.setSettingDescWithFormatting(setting, text),
      addSettingHelpButton: (setting, helpButton) => this.addSettingHelpButton(setting, helpButton),
    });
    return this.styleSection.attach(containerEl);
  }

  /** Debug settings section */
  private addDebugSettings(containerEl: HTMLElement): HTMLHeadingElement {
    this.debugSection ??= new SettingsDebugSection({
      plugin: this.plugin,
      createSectionHeading: (hostEl, title, tooltip) => this.createSectionHeading(hostEl, title, tooltip),
    });
    return this.debugSection.attach(containerEl);
  }

  /** User settings section */
  private addUserSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.user.title'),
      t('settings.quickNav.userDesc'),
    );

    new Setting(containerEl)
      .setName(t('settings.user.name.name'))
      .setDesc(t('settings.user.name.desc'))
      .addText((text) =>
        text
          .setPlaceholder('User')
          .setValue(this.plugin.settings.userName)
          .onChange(async (value) => {
            this.plugin.settings.userName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.user.systemPrompt.name'))
      .setDesc(t('settings.user.systemPrompt.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('You are a helpful assistant...')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
      });

    new Setting(containerEl)
      .setName(t('settings.user.excludedTags.name'))
      .setDesc(t('settings.user.excludedTags.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('system\nprivate')
          .setValue(this.plugin.settings.excludedTags.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedTags = value
              .split('\n')
              .map((s) => s.trim().replace(/^#/, ''))
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
      });

    return headingEl;
  }

  private createSettingsBlock(containerEl: HTMLElement, options: SettingsBlockOptions): HTMLElement {
    const {
      title,
      description,
      collapsible = false,
      defaultOpen = true,
      onToggle,
    } = options;

    const hostEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    if (!collapsible) {
      hostEl.createEl('h4', {
        text: title,
        cls: 'opencodian-settings-subsection-heading',
      });
      const descEl = hostEl.createDiv({ cls: 'opencodian-settings-block-desc' });
      this.applyInlineCodeText(descEl, description);
      return hostEl.createDiv({ cls: 'opencodian-settings-block-body' });
    }

    const detailsEl = hostEl.createEl('details', { cls: 'opencodian-settings-block-details' });
    detailsEl.open = defaultOpen;
    detailsEl.addEventListener('toggle', () => {
      onToggle?.(detailsEl.open);
    });

    const summaryEl = detailsEl.createEl('summary', { cls: 'opencodian-settings-block-summary' });
    summaryEl.createDiv({
      cls: 'opencodian-settings-subsection-heading',
      text: title,
    });
    const descEl = summaryEl.createDiv({ cls: 'opencodian-settings-block-desc' });
    this.applyInlineCodeText(descEl, description);

    return detailsEl.createDiv({ cls: 'opencodian-settings-block-body' });
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

  private addSettingHelpButton(setting: Setting, helpButton: SettingHelpButtonConfig): void {
    setting.addExtraButton((button) => {
      button
        .setIcon('help-circle')
        .setTooltip(helpButton.tooltip)
        .onClick(helpButton.onClick);
    });
  }
}
