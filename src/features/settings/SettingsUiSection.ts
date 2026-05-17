import { setIcon, Setting } from 'obsidian';

import type { BelowHeaderTabBarLayout, ChatScrollMode, TabBarPosition } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

interface SettingsUiSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

export class SettingsUiSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;

  constructor(options: SettingsUiSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void {}

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.ui.title'),
      t('settings.quickNav.uiDesc'),
    );

    const contentEl = containerEl.createDiv({ cls: 'opencodian-settings-ui-content' });
    this.renderAllContent(contentEl);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.renderAllContent(containerEl);
  }

  private renderAllContent(containerEl: HTMLElement): void {
    this.addEnableTabsSetting(containerEl, () => {
      this.renderTabOptionControls(tabOptionsEl);
    });
    const tabOptionsEl = containerEl.createDiv({ cls: 'opencodian-settings-ui-tab-options' });
    this.renderTabOptionControls(tabOptionsEl);
    this.addAutoScrollSetting(containerEl);
    this.addModifiedFilesSidebarSetting(containerEl);
    this.addChatScrollModeSetting(containerEl);
    this.addOpenInMainTabSetting(containerEl);
  }

  private addEnableTabsSetting(containerEl: HTMLElement, refreshTabOptions: () => void): void {
    new Setting(containerEl)
      .setName(t('settings.ui.enableTabs.name'))
      .setDesc(t('settings.ui.enableTabs.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTabs)
          .onChange(async (value) => {
            this.plugin.settings.enableTabs = value;
            await this.plugin.saveSettings();
            refreshTabOptions();
          })
      );
  }

  private renderTabOptionControls(containerEl: HTMLElement): void {
    containerEl.empty();
    if (!this.plugin.settings.enableTabs) {
      return;
    }
    this.addMaxTabsSetting(containerEl);
    this.addTabPositionSetting(containerEl);
    this.addBelowHeaderTabLayoutSetting(containerEl);
  }

  private addMaxTabsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.maxTabs.name'))
      .setDesc(t('settings.ui.maxTabs.desc'))
      .addSlider((slider) =>
        slider
          .setLimits(3, 10, 1)
          .setValue(this.plugin.settings.maxTabs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxTabs = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private addTabPositionSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.tabPosition.name'))
      .setDesc(t('settings.ui.tabPosition.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('input', t('settings.ui.tabPosition.input'));
        dropdown.addOption('header', t('settings.ui.tabPosition.header'));
        dropdown.addOption('below-header', t('settings.ui.tabPosition.belowHeader'));
        dropdown
          .setValue(this.plugin.settings.tabBarPosition)
          .onChange(async (value) => {
            this.plugin.settings.tabBarPosition = value as TabBarPosition;
            await this.plugin.saveSettings();
          });
      });
  }

  private addBelowHeaderTabLayoutSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.belowHeaderTabLayout.name'))
      .setDesc(t('settings.ui.belowHeaderTabLayout.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('grid', t('settings.ui.belowHeaderTabLayout.grid'));
        dropdown.addOption('vertical', t('settings.ui.belowHeaderTabLayout.vertical'));
        dropdown
          .setValue(this.plugin.settings.belowHeaderTabBarLayout)
          .onChange(async (value) => {
            this.plugin.settings.belowHeaderTabBarLayout = value as BelowHeaderTabBarLayout;
            await this.plugin.saveSettings();
          });
      });
  }

  private addAutoScrollSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.autoScroll.name'))
      .setDesc(t('settings.ui.autoScroll.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoScroll)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoScroll = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private addModifiedFilesSidebarSetting(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setDesc(t('settings.ui.modifiedFilesSidebar.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showModifiedFilesSidebar)
          .onChange(async (value) => {
            this.plugin.settings.showModifiedFilesSidebar = value;
            await this.plugin.saveSettings();
          })
      );

    const nameEl = setting.nameEl;
    nameEl.empty();
    nameEl.createSpan({ text: t('settings.ui.modifiedFilesSidebar.name') });
    const helpButton = nameEl.createEl('span', {
      cls: 'opencodian-setting-help-button',
      attr: {
        'aria-label': t('settings.ui.modifiedFilesSidebar.helpBody'),
        'data-tooltip': t('settings.ui.modifiedFilesSidebar.helpBody'),
        'data-tooltip-position': 'bottom',
      },
    });
    setIcon(helpButton, 'info');
  }

  private addChatScrollModeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.chatScrollMode.name'))
      .setDesc(t('settings.ui.chatScrollMode.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('natural', t('settings.ui.chatScrollMode.natural'));
        dropdown.addOption('sticky-basic', t('settings.ui.chatScrollMode.stickyBasic'));
        dropdown.addOption('sticky-mask', t('settings.ui.chatScrollMode.stickyMask'));
        dropdown
          .setValue(this.plugin.settings.chatScrollMode)
          .onChange(async (value) => {
            this.plugin.settings.chatScrollMode = value as ChatScrollMode;
            await this.plugin.saveSettings();
          });
      });
  }

  private addOpenInMainTabSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.ui.openInMainTab.name'))
      .setDesc(t('settings.ui.openInMainTab.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openInMainTab)
          .onChange(async (value) => {
            this.plugin.settings.openInMainTab = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
