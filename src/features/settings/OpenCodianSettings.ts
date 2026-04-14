/**
 * OpenCodian Settings Tab
 *
 * Settings UI for configuring the OpenCodian plugin.
 */

import * as fs from 'fs';
import { App, normalizePath, Notice, PluginSettingTab, Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import { OpencodeConfigManager, PluginManagementService } from '../../core/config';
import {
  parseModelReference,
  resolveModelSelection,
} from '../../core/config/modelConfig';
import type { PluginEntry, PluginEnvironmentSnapshot } from '../../core/config/PluginManagementService';
import {
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  type PluginIsolationMode,
  type QuestionCardPosition,
  type QuestionDisplayMode,
  type TitleMode,
} from '../../core/types';
import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import {
  buildModelPickerGroups,
  findModelPickerOptionByRef,
  type ModelPickerGroup,
} from './modelPicker';
import { ModelPickerModal } from './ModelPickerModal';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import { SettingsModelSection } from './SettingsModelSection';
import { SettingsSectionCoordinator } from './SettingsSectionCoordinator';
import { SettingsSecuritySection } from './SettingsSecuritySection';
import { SettingsServerSection } from './SettingsServerSection';
import { SettingsStyleSection } from './SettingsStyleSection';

const logger = createLogger('OpenCodianSettings');

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

interface PluginEntryGroupRenderOptions {
  containerEl: HTMLElement;
  title: string;
  pathLabel: string;
  entries: PluginEntry[];
  emptyText: string;
}

interface ElectronDialogModule {
  showOpenDialog: (options: {
    properties: string[];
    defaultPath?: string;
    title?: string;
    buttonLabel?: string;
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

function getElectronDialog(): ElectronDialogModule | null {
  const globalWithRequire = globalThis as typeof globalThis & {
    require?: (module: string) => unknown;
  };
  const dynamicRequire = globalWithRequire.require;
  if (!dynamicRequire) {
    return null;
  }

  try {
    const remote = dynamicRequire('@electron/remote') as { dialog?: ElectronDialogModule };
    if (remote?.dialog) {
      return remote.dialog;
    }
  } catch {
    // ignore
  }

  try {
    const electron = dynamicRequire('electron') as { remote?: { dialog?: ElectronDialogModule } };
    if (electron?.remote?.dialog) {
      return electron.remote.dialog;
    }
  } catch {
    // ignore
  }

  return null;
}

export class OpenCodianSettingTab extends PluginSettingTab {
  plugin: OpenCodianPlugin;
  private refreshModelsCallback?: () => void;
  private refreshTitleModelsCallback?: () => void;
  private refreshModelCatalogStatusCallback?: () => void;
  private modelRefreshFrameId: number | null = null;
  private lastKnownServerHealthy = false;
  private lastKnownServerStatus = 'stopped';
  private readonly sectionCoordinator: SettingsSectionCoordinator;
  private modelSection: SettingsModelSection | null = null;
  private styleSection: SettingsStyleSection | null = null;
  private conversationHeadingEl: HTMLHeadingElement | null = null;
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
    this.modelSection?.dispose();
    this.styleSection?.dispose();
    this.serverSection?.dispose();
    this.serverSection = null;
    this.refreshModelCatalogStatusCallback = undefined;
    this.conversationHeadingEl = null;
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
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.conversation.title'),
      t('settings.quickNav.conversationDesc'),
    );
    this.conversationHeadingEl = headingEl;

    let titleModelSetting: Setting | null = null;
    let titleModelButton: import('obsidian').ButtonComponent | null = null;
    let titleModelWarningButton: import('obsidian').ExtraButtonComponent | null = null;
    let titleModelGroups: ModelPickerGroup[] = [];

    const updateTitleModelSettingVisibility = () => {
      if (!titleModelSetting) {
        return;
      }
      titleModelSetting.settingEl.style.display = this.plugin.settings.titleMode === 'ai' ? '' : 'none';
    };

    const loadTitleModels = async () => {
      const selectedValue = this.plugin.settings.aiTitleModel;
      const normalizedSelectedValue = selectedValue.trim();
      let selectedLabel = normalizedSelectedValue;
      let showUnavailableWarning = false;

      try {
        if (this.plugin.modelConfigService) {
          const catalogs = await this.plugin.modelConfigService.getCatalogs(
            this.plugin.settings.modelSourceMode,
            this.plugin.settings.disabledModelRefs,
          );
          titleModelGroups = buildModelPickerGroups(catalogs.effective);

          const selectedOption = findModelPickerOptionByRef(titleModelGroups, normalizedSelectedValue);
          if (selectedOption) {
            selectedLabel = `${selectedOption.providerName} / ${selectedOption.modelName}`;
          } else if (normalizedSelectedValue) {
            const parsedRef = parseModelReference(normalizedSelectedValue);
            if (parsedRef) {
              const resolution = resolveModelSelection(
                catalogs.baseEffective,
                catalogs.effective,
                parsedRef.provider,
                parsedRef.model,
              );
              selectedLabel = `${resolution.providerName || parsedRef.provider} / ${resolution.modelName || parsedRef.model}`;
              showUnavailableWarning = resolution.status === 'unavailable';
            } else {
              selectedLabel = normalizedSelectedValue;
            }
          }
        }
      } catch (error) {
        logger.error('Failed to load AI title models:', error);
        titleModelGroups = [];
        selectedLabel = normalizedSelectedValue;
      }

      if (titleModelButton) {
        titleModelButton.setButtonText(
          selectedLabel || t('settings.titleGeneration.model.followCurrent'),
        );
        titleModelButton.setDisabled(titleModelGroups.length === 0 && !normalizedSelectedValue);
      }

      if (titleModelWarningButton) {
        titleModelWarningButton.extraSettingsEl.style.display = showUnavailableWarning ? '' : 'none';
        titleModelWarningButton.setTooltip(t('settings.titleGeneration.model.unavailableNotice'));
      }

      updateTitleModelSettingVisibility();
    };
    this.refreshTitleModelsCallback = () => {
      void loadTitleModels();
    };

    new Setting(containerEl)
      .setName(t('settings.titleGeneration.mode.name'))
      .setDesc(t('settings.titleGeneration.mode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('default', t('settings.titleGeneration.mode.default'))
          .addOption('ai', t('settings.titleGeneration.mode.ai'))
          .setValue(this.plugin.settings.titleMode)
          .onChange(async (value) => {
            this.plugin.settings.titleMode = value as TitleMode;
            await this.plugin.saveSettings();
            updateTitleModelSettingVisibility();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.conversation.questionDisplayMode.name'))
      .setDesc(t('settings.conversation.questionDisplayMode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('all', t('settings.conversation.questionDisplayMode.all'))
          .addOption('single', t('settings.conversation.questionDisplayMode.single'))
          .setValue(this.plugin.settings.questionDisplayMode)
          .onChange(async (value) => {
            this.plugin.settings.questionDisplayMode = value as QuestionDisplayMode;
            await this.plugin.saveSettings();
            this.plugin.refreshQuestionUi();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.conversation.questionCardPosition.name'))
      .setDesc(t('settings.conversation.questionCardPosition.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('inline', t('settings.conversation.questionCardPosition.inline'))
          .addOption('above_input', t('settings.conversation.questionCardPosition.aboveInput'))
          .setValue(this.plugin.settings.questionCardPosition)
          .onChange(async (value) => {
            this.plugin.settings.questionCardPosition = value as QuestionCardPosition;
            await this.plugin.saveSettings();
            this.plugin.refreshConversationRendering();
            this.plugin.refreshQuestionUi();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.conversation.showAnsweredQuestionCards.name'))
      .setDesc(t('settings.conversation.showAnsweredQuestionCards.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showAnsweredQuestionCards)
          .onChange(async (value) => {
            this.plugin.settings.showAnsweredQuestionCards = value;
            await this.plugin.saveSettings();
            this.plugin.refreshConversationRendering();
            this.plugin.refreshQuestionUi();
          });
      });

    titleModelSetting = new Setting(containerEl)
      .setName(t('settings.titleGeneration.model.name'))
      .setDesc(t('settings.titleGeneration.model.desc'))
      .addButton((btn) => {
        titleModelButton = btn;
        btn.onClick(() => {
          new ModelPickerModal(this.app, {
            title: t('settings.titleGeneration.model.pickerTitle'),
            description: t('settings.titleGeneration.model.pickerDesc'),
            groups: titleModelGroups,
            selectedRef: this.plugin.settings.aiTitleModel,
            emptySelectionLabel: t('settings.titleGeneration.model.followCurrent'),
            onChoose: async (option) => {
              this.plugin.settings.aiTitleModel = option?.ref ?? '';
              await this.plugin.saveSettings();
              await loadTitleModels();
            },
          }).open();
        });
      })
      .addExtraButton((button) => {
        titleModelWarningButton = button;
        button
          .setIcon('alert-triangle')
          .setTooltip(t('settings.titleGeneration.model.unavailableNotice'))
          .onClick(() => {
            new Notice(t('settings.titleGeneration.model.unavailableNotice'));
          });
        titleModelWarningButton.extraSettingsEl.addClass('opencodian-title-model-warning-button');
        titleModelWarningButton.extraSettingsEl.style.display = 'none';
      });

    updateTitleModelSettingVisibility();
    void loadTitleModels();

    new Setting(containerEl)
      .setName(t('settings.conversation.userMarkupAsCodeBlocks.name'))
      .setDesc(t('settings.conversation.userMarkupAsCodeBlocks.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.renderUserMarkupAsCodeBlocks)
          .onChange(async (value) => {
            this.plugin.settings.renderUserMarkupAsCodeBlocks = value;
            await this.plugin.saveSettings();
            this.plugin.refreshConversationRendering();
          })
      );

    return headingEl;
  }

  private addPluginSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.plugins.title'),
      t('settings.quickNav.pluginsDesc'),
    );
    const vaultPath = getVaultBasePath(this.plugin.app);

    if (!vaultPath) {
      new Setting(containerEl)
        .setName(t('settings.plugins.unavailable.name'))
        .setDesc(t('settings.plugins.unavailable.desc'));
      return headingEl;
    }

    const pluginService = new PluginManagementService(vaultPath);
    let snapshot: PluginEnvironmentSnapshot | null = null;
    let projectPluginEditorEl: HTMLTextAreaElement | null = null;
    const overviewEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.overview.title'),
      t('settings.plugins.overview.desc'),
    );
    const globalSourcesEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.global.title'),
      t('settings.plugins.global.desc'),
    );
    const projectDirectoryEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.projectDirectory.title'),
      t('settings.plugins.projectDirectory.desc'),
    );
    const omoEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.omo.title'),
      t('settings.plugins.omo.desc'),
    );

    const refreshPluginSnapshot = async (showNotice = false) => {
      try {
        snapshot = await pluginService.inspect(
          this.plugin.settings.server.mode,
          this.plugin.settings.pluginIsolationMode,
        );

        if (projectPluginEditorEl) {
          projectPluginEditorEl.value = snapshot.projectConfigSpecs
            .map((pluginSpec) => pluginService.formatPluginSpec(pluginSpec))
            .join('\n');
        }

        this.renderPluginOverview(overviewEl, snapshot);
        this.renderPluginSources(globalSourcesEl, snapshot);
        this.renderPluginProjectDirectory(projectDirectoryEl, snapshot);
        this.renderPluginOmoSection(omoEl, snapshot);

        if (showNotice) {
          new Notice(t('settings.plugins.refresh.success'));
        }
      } catch (error) {
        logger.error('Failed to refresh plugin snapshot:', error);
        if (showNotice) {
          new Notice(t('settings.plugins.refresh.failed'));
        }
      }
    };

    const pluginActionsSetting = new Setting(containerEl)
      .setName(t('settings.plugins.actions.name'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.plugins.actions.refresh'))
          .onClick(async () => {
            btn.setDisabled(true);
            await refreshPluginSnapshot(true);
            btn.setDisabled(false);
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.plugins.actions.openRaw'))
          .onClick(() => {
            new OpencodeConfigModal(this.app, new OpencodeConfigManager(vaultPath)).open();
          });
      });
    this.setSettingDescWithFormatting(pluginActionsSetting, t('settings.plugins.actions.desc'));

    const projectPluginSetting = new Setting(containerEl)
      .setName(t('settings.plugins.projectConfig.name'))
      .addTextArea((text) => {
        projectPluginEditorEl = text.inputEl;
        text
          .setPlaceholder(t('settings.plugins.projectConfig.placeholder'));
        text.inputEl.rows = 6;
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.plugins.projectConfig.save'))
          .setCta()
          .onClick(async () => {
            if (!projectPluginEditorEl) {
              return;
            }

            try {
              const plugins = pluginService.parsePluginSpecLines(projectPluginEditorEl.value);
              await pluginService.updateProjectConfigPlugins(plugins);
              await refreshPluginSnapshot(false);
              new Notice(t('settings.plugins.projectConfig.saved'));
              new Notice(
                this.plugin.settings.server.mode === 'local'
                  ? t('settings.plugins.restart.local')
                  : t('settings.plugins.restart.remote'),
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : t('settings.plugins.projectConfig.invalid');
              new Notice(`${t('settings.plugins.projectConfig.invalid')}: ${message}`);
            }
          });
      });
    this.setSettingNameWithFormatting(projectPluginSetting, t('settings.plugins.projectConfig.name'));
    this.setSettingDescWithFormatting(projectPluginSetting, t('settings.plugins.projectConfig.desc'));

    const isolationSetting = new Setting(containerEl)
      .setName(t('settings.plugins.isolation.name'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('default', t('settings.plugins.isolation.default'))
          .addOption('pure', t('settings.plugins.isolation.pure'))
          .setValue(this.plugin.settings.pluginIsolationMode)
          .onChange(async (value) => {
            this.plugin.settings.pluginIsolationMode = value as PluginIsolationMode;
            await this.plugin.saveSettings();
            await refreshPluginSnapshot(false);
            new Notice(t('settings.plugins.isolation.updated'));
            new Notice(
              this.plugin.settings.server.mode === 'local'
                ? t('settings.plugins.restart.local')
                : t('settings.plugins.restart.remote'),
            );
          });
      });
    this.setSettingDescWithFormatting(isolationSetting, t('settings.plugins.isolation.desc'));

    const pluginDirectorySetting = new Setting(containerEl)
      .setName(t('settings.plugins.projectDirectory.manageName'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.plugins.projectDirectory.create'))
          .onClick(async () => {
            await pluginService.ensureProjectPluginDirectory();
            await refreshPluginSnapshot(false);
            new Notice(t('settings.plugins.projectDirectory.created'));
          });
      });
    this.setSettingDescWithFormatting(
      pluginDirectorySetting,
      t('settings.plugins.projectDirectory.manageDesc'),
    );

    const omoSetting = new Setting(containerEl)
      .setName(t('settings.plugins.omo.manageName'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.plugins.omo.open'))
          .setCta()
          .onClick(async () => {
            const relativePath = await this.ensureAndOpenProjectOmoConfig(pluginService);
            if (!relativePath) {
              new Notice(t('settings.plugins.omo.openFailed'));
              return;
            }
            await refreshPluginSnapshot(false);
          });
      });
    this.setSettingDescWithFormatting(omoSetting, t('settings.plugins.omo.manageDesc'));

    void refreshPluginSnapshot(false);
    return headingEl;
  }

  /** Clean up when settings tab is closed */
  hide(): void {
    this.sectionCoordinator.hide();
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
    this.styleSection?.dispose();
    this.modelSection?.dispose();
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
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.ui.title'),
      t('settings.quickNav.uiDesc'),
    );

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
            this.plugin.settings.tabBarPosition = value as 'input' | 'header' | 'below-header';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.ui.belowHeaderTabLayout.name'))
      .setDesc(t('settings.ui.belowHeaderTabLayout.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('grid', t('settings.ui.belowHeaderTabLayout.grid'));
        dropdown.addOption('vertical', t('settings.ui.belowHeaderTabLayout.vertical'));
        dropdown
          .setValue(this.plugin.settings.belowHeaderTabBarLayout)
          .onChange(async (value) => {
            this.plugin.settings.belowHeaderTabBarLayout = value as 'grid' | 'vertical';
            await this.plugin.saveSettings();
          });
      });

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
            this.plugin.settings.chatScrollMode = value as 'natural' | 'sticky-basic' | 'sticky-mask';
            await this.plugin.saveSettings();
          });
      });

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

    return headingEl;
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
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.debug.title'),
      t('settings.quickNav.debugDesc'),
    );
    const platformKey = getCurrentPlatformKey();
    const platformLabel = this.getDebugPathPlatformLabel(platformKey);
    let logPathText: import('obsidian').TextComponent;

    new Setting(containerEl)
      .setName(t('settings.debug.logging.name'))
      .setDesc(t('settings.debug.logging.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableDebugLogging)
          .onChange(async (value) => {
            this.plugin.settings.enableDebugLogging = value;
            await this.plugin.saveSettings();
            if (value) {
              await this.plugin.logServerStatusSnapshot('settings-toggle');
            }
          })
      );

    new Setting(containerEl)
      .setName(t('settings.debug.inlineSerializedArgs.name'))
      .setDesc(t('settings.debug.inlineSerializedArgs.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.inlineSerializedDebugLogArgs)
          .onChange(async (value) => {
            this.plugin.settings.inlineSerializedDebugLogArgs = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.debug.logPath.name'))
      .setDesc(t('settings.debug.logPath.desc', { platform: platformLabel }))
      .addText((text) => {
        logPathText = text;
        text
          .setPlaceholder(this.getDebugPathPlaceholder(platformKey))
          .setValue(getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths))
          .onChange(async (value) => {
            this.plugin.settings.debugLogPaths[platformKey] = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.debug.logPath.choose'))
          .onClick(async () => {
            const pickedPath = await this.pickDirectory(getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths));
            if (!pickedPath) {
              return;
            }
            this.plugin.settings.debugLogPaths[platformKey] = pickedPath;
            await this.plugin.saveSettings();
            logPathText.setValue(pickedPath);
          });
      });

    new Setting(containerEl)
      .setName(t('settings.debug.actions.name'))
      .setDesc(t('settings.debug.actions.desc'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.debug.actions.copy'))
          .onClick(async () => {
            try {
              const report = await this.plugin.buildDiagnosticReport('copy-diagnostics');
              await navigator.clipboard.writeText(report);
              new Notice(t('settings.debug.actions.copySuccess'));
            } catch (error) {
              logger.error('Failed to copy diagnostics:', error);
              new Notice(t('settings.debug.actions.copyFailed'));
            }
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.debug.actions.generate'))
          .setCta()
          .onClick(async () => {
            try {
              const outputPath = await this.generateDiagnosticLogFile((savedPath) => {
                logPathText.setValue(savedPath);
              });
              if (outputPath) {
                new Notice(t('settings.debug.actions.generateSuccess', { path: outputPath }));
              }
            } catch (error) {
              logger.error('Failed to generate diagnostics file:', error);
              const message = error instanceof Error ? error.message : t('settings.debug.actions.generateFailed');
              new Notice(message);
            }
          });
      });

    const helpEl = containerEl.createDiv({ cls: 'opencodian-debug-help' });
    helpEl.createDiv({
      cls: 'opencodian-debug-help-intro',
      text: t('settings.debug.console.output'),
    });
    helpEl.createDiv({
      cls: 'opencodian-debug-help-title',
      text: t('settings.debug.console.howToOpen'),
    });

    const windowsEl = helpEl.createDiv({ cls: 'opencodian-debug-help-item' });
    windowsEl.createDiv({
      cls: 'opencodian-debug-help-platform',
      text: t('settings.debug.console.windows.title'),
    });
    windowsEl.createDiv({
      cls: 'opencodian-debug-help-detail',
      text: t('settings.debug.console.windows.shortcut'),
    });
    windowsEl.createDiv({
      cls: 'opencodian-debug-help-detail',
      text: t('settings.debug.console.windows.menu'),
    });

    const macEl = helpEl.createDiv({ cls: 'opencodian-debug-help-item' });
    macEl.createDiv({
      cls: 'opencodian-debug-help-platform',
      text: t('settings.debug.console.mac.title'),
    });
    macEl.createDiv({
      cls: 'opencodian-debug-help-detail',
      text: t('settings.debug.console.mac.shortcut'),
    });
    macEl.createDiv({
      cls: 'opencodian-debug-help-detail',
      text: t('settings.debug.console.mac.menu'),
    });

    helpEl.createDiv({
      cls: 'opencodian-debug-help-footer',
      text: t('settings.debug.console.consoleTab'),
    });

    return headingEl;
  }

  private async pickDirectory(defaultPath?: string): Promise<string | null> {
    const dialog = getElectronDialog();
    if (!dialog) {
      new Notice(t('settings.debug.logPath.dialogUnavailable'));
      return null;
    }

    const result = await dialog.showOpenDialog({
      title: t('settings.debug.logPath.dialogTitle'),
      buttonLabel: t('settings.debug.logPath.dialogButton'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: this.getDirectoryPickerDefaultPath(defaultPath),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  private async generateDiagnosticLogFile(onDefaultPathSaved?: (path: string) => void): Promise<string | null> {
    const platformKey = getCurrentPlatformKey();
    let targetDirectory = getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths).trim();

    if (!targetDirectory || !fs.existsSync(targetDirectory)) {
      const pickedPath = await this.pickDirectory(targetDirectory);
      if (!pickedPath) {
        return null;
      }
      targetDirectory = pickedPath;
    }

    const outputPath = await this.plugin.writeDiagnosticLogFile(targetDirectory, 'settings-export');

    if (targetDirectory !== getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths)) {
      const shouldPersist = window.confirm(t('settings.debug.logPath.confirmUseDefault', { path: targetDirectory }));
      if (shouldPersist) {
        this.plugin.settings.debugLogPaths[platformKey] = targetDirectory;
        await this.plugin.saveSettings();
        onDefaultPathSaved?.(targetDirectory);
      }
    }
    return outputPath;
  }

  private getDebugPathPlatformLabel(platformKey: 'unix' | 'windows'): string {
    return platformKey === 'windows'
      ? t('settings.debug.logPath.platformWindows')
      : t('settings.debug.logPath.platformUnix');
  }

  private getDebugPathPlaceholder(platformKey: 'unix' | 'windows'): string {
    return platformKey === 'windows'
      ? t('settings.debug.logPath.placeholderWindows')
      : t('settings.debug.logPath.placeholderUnix');
  }

  private getDirectoryPickerDefaultPath(defaultPath?: string): string {
    const normalizedDefaultPath = (defaultPath ?? '').trim();
    if (normalizedDefaultPath) {
      return normalizedDefaultPath;
    }

    for (const allowedPath of this.plugin.settings.allowedExportPaths) {
      const expandedPath = this.expandHomePath(allowedPath);
      if (expandedPath && fs.existsSync(expandedPath)) {
        return expandedPath;
      }
    }

    const desktopPath = path.join(os.homedir(), 'Desktop');
    if (fs.existsSync(desktopPath)) {
      return desktopPath;
    }

    return os.homedir();
  }

  private expandHomePath(candidatePath: string): string {
    if (candidatePath === '~') {
      return os.homedir();
    }
    if (candidatePath.startsWith('~/') || candidatePath.startsWith('~\\')) {
      return path.join(os.homedir(), candidatePath.slice(2));
    }
    return candidatePath;
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

  private createPluginSubsection(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: title,
      cls: 'opencodian-settings-subsection-heading',
    });
    const descEl = blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
    });
    this.applyInlineCodeText(descEl, description);
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body' });
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

  private renderPluginOverview(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    const rows = [
      {
        label: t('settings.plugins.overview.serviceMode'),
        value: snapshot.serviceMode === 'local'
          ? t('settings.plugins.overview.serviceModeLocal')
          : t('settings.plugins.overview.serviceModeRemote'),
      },
      {
        label: t('settings.plugins.overview.isolationMode'),
        value: snapshot.isolationMode === 'pure'
          ? t('settings.plugins.isolation.pure')
          : t('settings.plugins.isolation.default'),
      },
      {
        label: t('settings.plugins.overview.vaultConfigDir'),
        value: snapshot.vaultConfigDir,
      },
      {
        label: t('settings.plugins.overview.globalInfluence'),
        value: snapshot.globalInfluenceDetected
          ? t('settings.plugins.overview.globalInfluenceYes')
          : t('settings.plugins.overview.globalInfluenceNo'),
      },
      {
        label: t('settings.plugins.overview.projectConfigCount'),
        value: String(snapshot.projectConfigPlugins.length),
      },
      {
        label: t('settings.plugins.overview.projectDirectoryCount'),
        value: String(snapshot.projectDirectoryPlugins.length),
      },
    ];

    this.renderPluginKeyValueRows(containerEl, rows);
  }

  private renderPluginSources(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    containerEl.empty();

    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.global.configTitle'),
      pathLabel: snapshot.globalConfigPath,
      entries: snapshot.globalConfigPlugins,
      emptyText: t('settings.plugins.none'),
    });
    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.global.directoryTitle'),
      pathLabel: this.describePluginDirectories(snapshot.globalDirectories),
      entries: snapshot.globalDirectoryPlugins,
      emptyText: t('settings.plugins.none'),
    });
    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.projectConfig.title'),
      pathLabel: snapshot.projectConfigPath,
      entries: snapshot.projectConfigPlugins,
      emptyText: t('settings.plugins.none'),
    });
  }

  private renderPluginProjectDirectory(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    containerEl.empty();
    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.projectDirectory.filesTitle'),
      pathLabel: this.describePluginDirectories(snapshot.projectDirectories),
      entries: snapshot.projectDirectoryPlugins,
      emptyText: t('settings.plugins.projectDirectory.empty'),
    });
  }

  private renderPluginOmoSection(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    const rows = [
      {
        label: t('settings.plugins.omo.pathLabel'),
        value: snapshot.omoConfigPath,
      },
      {
        label: t('settings.plugins.omo.statusLabel'),
        value: snapshot.omoConfigExists
          ? t('settings.plugins.omo.exists')
          : t('settings.plugins.omo.missing'),
      },
      {
        label: t('settings.plugins.omo.pureModeLabel'),
        value: snapshot.isolationMode === 'pure'
          ? t('settings.plugins.omo.pureWarning')
          : t('settings.plugins.omo.pureInactive'),
      },
    ];

    this.renderPluginKeyValueRows(containerEl, rows);
  }

  private renderPluginKeyValueRows(
    containerEl: HTMLElement,
    rows: Array<{ label: string; value: string }>,
  ): void {
    containerEl.empty();
    const listEl = containerEl.createDiv({ cls: 'opencodian-plugin-summary-list' });
    for (const row of rows) {
      const rowEl = listEl.createDiv({ cls: 'opencodian-plugin-summary-row' });
      const labelEl = rowEl.createSpan({ cls: 'opencodian-plugin-summary-label' });
      this.applyInlineCodeText(labelEl, `${row.label}:`);
      const valueEl = rowEl.createSpan({ cls: 'opencodian-plugin-summary-value' });
      this.applyInlineCodeText(valueEl, row.value);
    }
  }

  private renderPluginEntryGroup(options: PluginEntryGroupRenderOptions): void {
    const { containerEl, title, pathLabel, entries, emptyText } = options;
    const groupEl = containerEl.createDiv({ cls: 'opencodian-plugin-source-group' });
    const titleEl = groupEl.createDiv({
      cls: 'opencodian-plugin-source-title',
    });
    this.applyInlineCodeText(titleEl, title);
    const pathEl = groupEl.createDiv({
      cls: 'opencodian-plugin-source-path',
    });
    this.applyInlineCodeText(pathEl, pathLabel);

    if (entries.length === 0) {
      const emptyEl = groupEl.createDiv({
        cls: 'opencodian-plugin-source-empty',
      });
      this.applyInlineCodeText(emptyEl, emptyText);
      return;
    }

    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-list' });
    for (const entry of entries) {
      const itemEl = listEl.createDiv({
        cls: 'opencodian-plugin-source-item',
      });
      this.applyInlineCodeText(itemEl, this.describePluginEntry(entry));
    }
  }

  private describePluginDirectories(
    directories: Array<{ path: string; exists: boolean }>,
  ): string {
    if (directories.length === 0) {
      return '';
    }

    return directories
      .map((directory) => `${directory.path}${directory.exists ? '' : ` (${t('settings.plugins.missingPath')})`}`)
      .join(' · ');
  }

  private describePluginEntry(entry: PluginEntry): string {
    const kindLabel = entry.kind === 'npm'
      ? t('settings.plugins.kind.npm')
      : t('settings.plugins.kind.local');
    const optionsLabel = entry.options ? ` · ${JSON.stringify(entry.options)}` : '';
    const pathLabel = entry.fullPath ? ` · ${entry.fullPath}` : '';
    return `[${kindLabel}] ${entry.displayName}${optionsLabel}${pathLabel}`;
  }

  private async ensureAndOpenProjectOmoConfig(pluginService: PluginManagementService): Promise<string | null> {
    try {
      const absolutePath = await pluginService.ensureProjectOmoConfig();
      const vaultBasePath = getVaultBasePath(this.plugin.app);
      if (!vaultBasePath) {
        return null;
      }

      const relativePath = normalizePath(path.relative(vaultBasePath, absolutePath));
      const exists = await this.app.vault.adapter.exists(relativePath);
      if (!exists) {
        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        const parentDir = normalizePath(path.dirname(relativePath));
        if (!(await this.app.vault.adapter.exists(parentDir))) {
          await this.app.vault.adapter.mkdir(parentDir);
        }
        await this.app.vault.adapter.write(relativePath, content);
      }

      await this.app.workspace.openLinkText(relativePath, '', 'tab');
      return relativePath;
    } catch (error) {
      logger.error('Failed to open project OMO config:', error);
      return null;
    }
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
