/**
 * OpenCodian Settings Tab
 * 
 * Settings UI for configuring the OpenCodian plugin.
 */

import * as fs from 'fs';
import { App, normalizePath, Notice, PluginSettingTab, setIcon, Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import {
  type ModelCatalogBundle,
  OpencodeConfigManager,
  PluginManagementService,
  type ProviderAvailabilityProbe,
} from '../../core/config';
import {
  collectConfiguredProviderIds,
  formatModelReference,
  isProviderEnabled,
  mergeCatalogs,
  type ModelCatalog,
  type ModelCatalogProvider,
  parseModelReference,
  resolveModelSelection,
  setProviderEnabled,
} from '../../core/config/modelConfig';
import type { PluginEntry, PluginEnvironmentSnapshot } from '../../core/config/PluginManagementService';
import { getBuiltinThemePresets, hasThemeAppearanceOverrides } from '../../core/theme';
import {
  type ChatAppearanceBackgroundFitMode,
  type ChatAppearanceSettings,
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  type InputPanelActionButtonStyleId,
  type InputPanelGlassRefractionSvgFilterPresetId,
  type InputPanelGlassRefractionVariantId,
  type InputPanelThemeId,
  isValidChatAppearanceCustomCssDeclarations,
  type LiquidGlassAdapterId,
  type ModelSourceMode,
  type OpencodeModelConfigSubset,
  type PluginIsolationMode,
  type QuestionCardPosition,
  type QuestionDisplayMode,
  type ThemePresetDefinition,
  type ThemeStyleId,
  type TitleMode,
} from '../../core/types';
import { setLocale, t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { getAllGlassAdapters } from '../../utils/glass';
import { ProviderIconService } from '../../utils/icons';
import { getChatAppearanceBackgroundSizeValue } from '../chat/chatAppearance';
import { LiquidGlassSettingHelpModal } from './LiquidGlassSettingHelpModal';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import { ModelConfigModal } from './ModelConfigModal';
import {
  buildModelPickerGroups,
  findModelPickerOption,
  findModelPickerOptionByRef,
  type ModelPickerGroup,
} from './modelPicker';
import { ModelPickerModal } from './ModelPickerModal';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';
import { enhanceSearchInput } from './searchInputEnhancer';
import { type ServerHelpTopic, ServerSettingHelpModal } from './ServerSettingHelpModal';

const logger = createLogger('OpenCodianSettings');

interface NumericStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: () => number;
  resetValue: () => number;
  setValue: (appearance: ChatAppearanceSettings, value: number) => void;
}

interface ColorStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string;
  desc: string;
  value: () => string;
  resetValue: () => string;
  setValue: (appearance: ChatAppearanceSettings, value: string) => void;
}

interface NumericControlConfig {
  name: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: () => number;
  resetValue: () => number;
  commitValue: (value: number) => void;
  helpButton?: SettingHelpButtonConfig;
  registerSync?: (syncFromSettings: () => void) => void;
}

interface SettingHelpButtonConfig {
  tooltip: string;
  onClick: () => void;
}

interface ProviderAvailabilityCheckState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  probe?: ProviderAvailabilityProbe;
  error?: string;
}

interface SettingsBlockOptions {
  title: string;
  description: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

type ChatAppearanceStyleGroup = 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced';

interface StyleControlBinding {
  group: ChatAppearanceStyleGroup;
  syncFromSettings: () => void;
}

interface ElectronDialogModule {
  showOpenDialog: (options: {
    properties: string[];
    defaultPath?: string;
    title?: string;
    buttonLabel?: string;
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

const SETTINGS_SCROLL_CONTAINER_SELECTORS = [
  '.vertical-tab-content-container',
  '.vertical-tab-content',
  '.modal-content',
] as const;
const SETTINGS_SCROLL_CONTAINER_SELECTOR = SETTINGS_SCROLL_CONTAINER_SELECTORS.join(', ');
const SETTINGS_SCROLL_RESTORE_RETRY_DELAYS = [24, 80, 160, 320] as const;
const SETTINGS_SCROLL_RESTORE_OBSERVER_WINDOW_MS = 1200;
const SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX = 1;
const SETTINGS_SCROLL_RESTORE_IDLE_SETTLE_MS = 96;
const SETTINGS_SCROLL_RESTORE_MIN_STABLE_MS = 180;

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
  private refreshServerStatusCallback?: () => Promise<void>;
  private refreshModelCatalogStatusCallback?: () => void;
  private serverStatusIntervalId: number | null = null;
  private modelRefreshFrameId: number | null = null;
  private lastKnownServerHealthy = false;
  private lastKnownServerStatus = 'stopped';
  private activeModelCatalogTab: 'local' | 'server' | 'effective' | 'disabled' = 'effective';
  private modelAvailabilitySectionOpen = true;
  private modelToolsSectionOpen = true;
  private expandedModelAvailabilityProviders = new Set<string>();
  private modelAvailabilityQuery = '';
  private modelAvailabilityOnlyDisabled = false;
  private modelAvailabilityOnlyEnabled = false;
  private settingsScrollHandler?: () => void;
  private settingsScrollContainerEl: HTMLElement | null = null;
  private lastObservedSettingsScrollTop = 0;
  private pendingOpenScrollTop: number | null = null;
  private pendingOpenSectionTitle: string | null = null;
  private settingsPanelPostRenderFrameId: number | null = null;
  private settingsPanelRestoreFrameId: number | null = null;
  private settingsPanelRestoreTimeoutIds: number[] = [];
  private settingsPanelRestoreObserver: MutationObserver | null = null;
  private settingsPanelRestoreScrollContainerEl: HTMLElement | null = null;
  private settingsPanelRestoreScrollListener?: () => void;
  private settingsPanelRestoreSettleTimeoutId: number | null = null;
  private settingsScrollPersistenceSuspended = false;
  private styleControlBindings: StyleControlBinding[] = [];
  private stylePresetUiRefresh?: () => void;
  private conversationHeadingEl: HTMLHeadingElement | null = null;
  private backgroundStyleGroupHostEl: HTMLElement | null = null;
  private backgroundPreviewRequestId = 0;
  private inputStyleGroupHostEl: HTMLElement | null = null;
  private providerAvailabilityChecks = new Map<string, ProviderAvailabilityCheckState>();

  constructor(app: App, plugin: OpenCodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.modelAvailabilitySectionOpen = plugin.settings.modelAvailabilitySectionOpen;
    this.modelToolsSectionOpen = plugin.settings.modelToolsSectionOpen;
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
    void this.refreshServerStatusCallback?.();
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

  private scrollToSectionByTitle(sectionTitle: string): void {
    const headingEl = this.containerEl.querySelector<HTMLHeadingElement>(
      `.opencodian-settings-section-heading[data-section-title="${sectionTitle}"]`,
    );
    headingEl?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  scrollToServerSection(): void {
    this.scrollToSectionByTitle(t('settings.server.title'));
  }

  scrollToModelSection(): void {
    this.scrollToSectionByTitle(t('settings.model.title'));
  }

  prepareRestoreScrollOnNextOpen(scrollTop = this.plugin.settings.settingsPanelScrollTop): void {
    this.pendingOpenScrollTop = scrollTop;
    this.pendingOpenSectionTitle = null;
  }

  prepareScrollToServerOnNextOpen(): void {
    this.pendingOpenSectionTitle = t('settings.server.title');
    this.pendingOpenScrollTop = null;
  }

  display(): void {
    const { containerEl } = this;
    const pendingOpenScrollTop = this.pendingOpenScrollTop;
    const pendingOpenSectionTitle = this.pendingOpenSectionTitle;
    this.modelAvailabilitySectionOpen = this.plugin.settings.modelAvailabilitySectionOpen;
    this.modelToolsSectionOpen = this.plugin.settings.modelToolsSectionOpen;

    this.clearSettingsPanelRestoreWork();
    if (this.serverStatusIntervalId) {
      window.clearInterval(this.serverStatusIntervalId);
      this.serverStatusIntervalId = null;
    }
    this.refreshServerStatusCallback = undefined;
    if (this.settingsPanelPostRenderFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelPostRenderFrameId);
      this.settingsPanelPostRenderFrameId = null;
    }
    this.styleControlBindings = [];
    this.stylePresetUiRefresh = undefined;
    this.conversationHeadingEl = null;
    this.backgroundStyleGroupHostEl = null;
    this.backgroundPreviewRequestId = 0;
    this.inputStyleGroupHostEl = null;
    containerEl.empty();
    containerEl.addClass('opencodian-settings');
    containerEl.style.setProperty('overflow-anchor', 'none');
    if (pendingOpenScrollTop !== null || pendingOpenSectionTitle !== null) {
      containerEl.style.visibility = 'hidden';
    } else {
      containerEl.style.removeProperty('visibility');
    }

    const quickNavEl = containerEl.createDiv({ cls: 'opencodian-settings-quick-nav' });
    containerEl.createEl('h2', { text: t('settings.title') });

    const languageHeadingEl = this.addLanguageSettings(containerEl);
    const serverHeadingEl = this.addServerSettings(containerEl);
    const modelHeadingEl = this.addModelSettings(containerEl);
    const conversationHeadingEl = this.addConversationSettings(containerEl);
    const pluginHeadingEl = this.addPluginSettings(containerEl);
    const securityHeadingEl = this.addSecuritySettings(containerEl);
    const uiHeadingEl = this.addUISettings(containerEl);
    const styleHeadingEl = this.addStyleSettings(containerEl);
    const debugHeadingEl = this.addDebugSettings(containerEl);
    const userHeadingEl = this.addUserSettings(containerEl);

    const sections = [
      {
        headingEl: languageHeadingEl,
        tooltip: t('settings.quickNav.languageDesc'),
      },
      {
        headingEl: serverHeadingEl,
        tooltip: t('settings.quickNav.serverDesc'),
      },
      {
        headingEl: modelHeadingEl,
        tooltip: t('settings.quickNav.modelDesc'),
      },
      {
        headingEl: conversationHeadingEl,
        tooltip: t('settings.quickNav.conversationDesc'),
      },
      {
        headingEl: pluginHeadingEl,
        tooltip: t('settings.quickNav.pluginsDesc'),
      },
      {
        headingEl: securityHeadingEl,
        tooltip: t('settings.quickNav.securityDesc'),
      },
      {
        headingEl: uiHeadingEl,
        tooltip: t('settings.quickNav.uiDesc'),
      },
      {
        headingEl: styleHeadingEl,
        tooltip: t('settings.quickNav.styleDesc'),
      },
      {
        headingEl: debugHeadingEl,
        tooltip: t('settings.quickNav.debugDesc'),
      },
      {
        headingEl: userHeadingEl,
        tooltip: t('settings.quickNav.userDesc'),
      },
    ];

    this.buildQuickNav(quickNavEl, sections);
    this.scheduleSettingsPanelPostRenderSetup(pendingOpenScrollTop, pendingOpenSectionTitle);
    this.clearInitialQuickNavFocus();
  }

  /** Language settings section */
  private addLanguageSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.language.title'));

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
    const headingEl = this.createSectionHeading(containerEl, t('settings.server.title'));
    const isLocalMode = this.plugin.settings.server.mode === 'local';

    const modeSetting = new Setting(containerEl)
      .setName(t('settings.server.mode.name'))
      .setDesc(t('settings.server.mode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('local', t('settings.server.mode.local'))
          .addOption('remote', t('settings.server.mode.remote'))
          .setValue(this.plugin.settings.server.mode)
          .onChange(async (value) => {
            this.plugin.settings.server.mode = value as 'local' | 'remote';
            if (value === 'local' && this.plugin.settings.server.auth.type === 'bearer') {
              this.plugin.settings.server.auth.type = 'none';
            }
            if (
              value === 'remote'
              && !this.plugin.settings.server.remote.baseUrl.trim()
            ) {
              this.plugin.settings.server.remote.baseUrl =
                `http://${this.plugin.settings.server.local.host}:${this.plugin.settings.server.local.port}`;
            }
            await this.plugin.saveSettings();
            this.display();
          })
      });
    this.addServerHelpButton(modeSetting, 'mode');

    if (isLocalMode) {
      const autoStartSetting = new Setting(containerEl)
        .setName(t('settings.server.autoStart.name'))
        .setDesc(t('settings.server.autoStart.desc'))
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.server.local.autoStart)
            .onChange(async (value) => {
              this.plugin.settings.server.local.autoStart = value;
              await this.plugin.saveSettings();
            })
        );
      this.addServerHelpButton(autoStartSetting, 'autoStart');

      const hostSetting = new Setting(containerEl)
        .setName(t('settings.server.host.name'))
        .setDesc(t('settings.server.host.desc'))
        .addText((text) => {
          const commitHostChange = async () => {
            const nextHost = text.inputEl.value.trim() || '127.0.0.1';
            if (nextHost === this.plugin.settings.server.local.host) {
              text.setValue(nextHost);
              return;
            }

            this.plugin.settings.server.local.host = nextHost;
            try {
              await this.plugin.saveSettings();
              text.setValue(this.plugin.settings.server.local.host);
            } catch (error) {
              text.setValue(this.plugin.settings.server.local.host);
              new Notice(error instanceof Error ? error.message : t('settings.server.startFailed'));
            }
          };

          text
            .setPlaceholder('127.0.0.1')
            .setValue(this.plugin.settings.server.local.host);
          text.inputEl.addEventListener('change', () => {
            void commitHostChange();
          });
          text.inputEl.addEventListener('blur', () => {
            void commitHostChange();
          });
          text.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              text.inputEl.blur();
            }
          });
        });
      this.addServerHelpButton(hostSetting, 'host');

      const portSetting = new Setting(containerEl)
        .setName(t('settings.server.port.name'))
        .setDesc(t('settings.server.port.desc'))
        .addText((text) => {
          const commitPortChange = async () => {
            const value = text.inputEl.value.trim();
            const port = parseInt(value, 10);
            if (Number.isNaN(port) || port <= 0 || port >= 65536) {
              text.setValue(String(this.plugin.settings.server.local.port));
              new Notice(t('settings.server.port.invalid'));
              return;
            }

            if (port === this.plugin.settings.server.local.port) {
              text.setValue(String(port));
              return;
            }

            this.plugin.settings.server.local.port = port;
            try {
              await this.plugin.saveSettings();
              text.setValue(String(this.plugin.settings.server.local.port));
              new Notice(t('settings.server.port.updated', { port: String(port) }));
            } catch (error) {
              text.setValue(String(this.plugin.settings.server.local.port));
              new Notice(error instanceof Error ? error.message : t('settings.server.startFailed'));
            }
          };

          text
            .setPlaceholder('4196')
            .setValue(String(this.plugin.settings.server.local.port));
          text.inputEl.addEventListener('change', () => {
            void commitPortChange();
          });
          text.inputEl.addEventListener('blur', () => {
            void commitPortChange();
          });
          text.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              text.inputEl.blur();
            }
          });
        });
      this.addServerHelpButton(portSetting, 'port');
    } else {
      const remoteUrlSetting = new Setting(containerEl)
        .setName(t('settings.server.remoteUrl.name'))
        .setDesc(t('settings.server.remoteUrl.desc'))
        .addText((text) =>
          text
            .setPlaceholder('https://ai.example.com')
            .setValue(this.plugin.settings.server.remote.baseUrl)
            .onChange(async (value) => {
              this.plugin.settings.server.remote.baseUrl = value.trim();
              await this.plugin.saveSettings();
            })
        );
      this.addServerHelpButton(remoteUrlSetting, 'remoteUrl');
    }

    const authSetting = new Setting(containerEl)
      .setName(t('settings.server.auth.name'))
      .setDesc(t('settings.server.auth.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('none', t('settings.server.auth.none'));
        dropdown.addOption('basic', t('settings.server.auth.basic'));
        if (!isLocalMode) {
          dropdown.addOption('bearer', t('settings.server.auth.bearer'));
        }

        const authType = isLocalMode && this.plugin.settings.server.auth.type === 'bearer'
          ? 'none'
          : this.plugin.settings.server.auth.type;

        dropdown
          .setValue(authType)
          .onChange(async (value) => {
            this.plugin.settings.server.auth.type = value as 'none' | 'basic' | 'bearer';
            await this.plugin.saveSettings();
            this.display();
          });
      });
    this.addServerHelpButton(authSetting, 'auth');

    if (this.plugin.settings.server.auth.type === 'basic') {
      const usernameSetting = new Setting(containerEl)
        .setName(t('settings.server.auth.username.name'))
        .setDesc(t('settings.server.auth.username.desc'))
        .addText((text) =>
          text
            .setPlaceholder('opencode')
            .setValue(this.plugin.settings.server.auth.username)
            .onChange(async (value) => {
              this.plugin.settings.server.auth.username = value.trim() || 'opencode';
              await this.plugin.saveSettings();
            })
        );
      this.addServerHelpButton(usernameSetting, 'username');

      const passwordSetting = new Setting(containerEl)
        .setName(t('settings.server.auth.password.name'))
        .setDesc(t('settings.server.auth.password.desc'))
        .addText((text) => {
          text
            .setPlaceholder('••••••••')
            .setValue(this.plugin.settings.server.auth.password)
            .onChange(async (value) => {
              this.plugin.settings.server.auth.password = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.type = 'password';
        });
      this.addServerHelpButton(passwordSetting, 'password');
    }

    if (!isLocalMode && this.plugin.settings.server.auth.type === 'bearer') {
      const tokenSetting = new Setting(containerEl)
        .setName(t('settings.server.auth.token.name'))
        .setDesc(t('settings.server.auth.token.desc'))
        .addText((text) => {
          text
            .setPlaceholder('Bearer token')
            .setValue(this.plugin.settings.server.auth.token)
            .onChange(async (value) => {
              this.plugin.settings.server.auth.token = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = 'password';
        });
      this.addServerHelpButton(tokenSetting, 'token');
    }

    // Server status display with refresh
    const statusSetting = new Setting(containerEl)
      .setName(t('settings.server.status.name'))
      .setDesc(t('settings.server.status.desc'));
    this.addServerHelpButton(statusSetting, 'status');
    
    let actionBtn: import('obsidian').ButtonComponent;
    let stopBtn: import('obsidian').ButtonComponent;
    let refreshBtn: import('obsidian').ButtonComponent;
    
    // Track server state
    let isExternalServer = false;
    
    const updateStatus = async () => {
      // Check actual server health
      const isHealthy = await this.plugin.openCodeService.checkHealth();
      const diagnostics = this.plugin.openCodeService.getServerDiagnostics();

      // Get internal status
      const internalStatus = this.plugin.openCodeService.getServerStatus();
      this.lastKnownServerHealthy = isHealthy;
      this.lastKnownServerStatus = internalStatus;

      isExternalServer = isHealthy
        && internalStatus !== 'conflict'
        && (internalStatus === 'stopped' || !this.plugin.openCodeService.isServerProcessRunning());

      const statusText = (() => {
        if (isLocalMode) {
          if (internalStatus === 'conflict') {
            return t('settings.server.status.localConflict');
          }
          if (isHealthy && diagnostics.reason === 'local-orphan-restarted') {
            return t('settings.server.status.localRecovered');
          }
          if (isHealthy && isExternalServer) {
            return t('settings.server.status.localExternal');
          }
          if (isHealthy) {
            return t('settings.server.status.localManaged');
          }
          if (internalStatus === 'starting' || internalStatus === 'restarting') {
            return t('settings.server.status.starting');
          }
          return t('settings.server.status.stopped');
        }

        if (isHealthy) {
          return t('settings.server.status.remoteConnected');
        }

        if (internalStatus === 'starting' || internalStatus === 'restarting') {
          return t('settings.server.status.starting');
        }

        return t('settings.server.status.stopped');
      })();
      
      // Update description with status and external warning if applicable
      const healthIndicator = isHealthy ? '🟢' : '🔴';
      let descText = `${t('settings.server.status.desc')} - ${healthIndicator} ${statusText}`;
      if (isLocalMode && isExternalServer) {
        descText += ` (${t('settings.server.external.title')})`;
      } else if (isLocalMode && diagnostics.reason === 'local-orphan-restarted') {
        descText += ` (${t('settings.server.orphanRestarted.title')})`;
      } else if (isLocalMode && internalStatus === 'conflict') {
        descText += ` (${t('settings.server.conflict.title')})`;
      }
      if (diagnostics.message) {
        descText += ` — ${diagnostics.message}`;
      }
      statusSetting.setDesc(descText);
      
      if (actionBtn) {
        actionBtn.setButtonText(
          isLocalMode ? t('settings.server.status.start') : t('settings.server.status.test')
        );
        actionBtn.setDisabled(
          isLocalMode
            ? (isHealthy && !isExternalServer) || internalStatus === 'starting' || internalStatus === 'restarting'
            : internalStatus === 'starting'
        );
      }
      
      if (stopBtn) {
        stopBtn.buttonEl.style.display = isLocalMode ? '' : 'none';
        stopBtn.setButtonText(t('settings.server.status.stop'));
        stopBtn.setDisabled(!isHealthy || isExternalServer || internalStatus === 'conflict');
      }

      if (refreshBtn) {
        refreshBtn.setButtonText(t('settings.server.status.refresh'));
      }

      this.refreshModelCatalogStatusCallback?.();
    };

    this.refreshServerStatusCallback = updateStatus;
    
    statusSetting
      .addButton((btn) => {
        actionBtn = btn;
        btn
          .setButtonText(isLocalMode ? t('settings.server.status.start') : t('settings.server.status.test'))
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              if (isLocalMode) {
                await this.plugin.openCodeService.start();
                new Notice(t('settings.server.started'));
              } else {
                const isHealthy = await this.plugin.openCodeService.checkHealth();
                new Notice(
                  isHealthy ? t('settings.server.testSuccess') : t('settings.server.testFailed')
                );
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : t('settings.server.startFailed');
              new Notice(msg);
            }
            await updateStatus();
          });
      })
      .addButton((btn) => {
        stopBtn = btn;
        btn
          .setButtonText(t('settings.server.status.stop'))
          .onClick(async () => {
            btn.setDisabled(true);
            await this.plugin.openCodeService.stop();
            new Notice(t('settings.server.stopped'));
            await updateStatus();
          });
      })
      .addButton((btn) => {
        refreshBtn = btn;
        btn
          .setButtonText(t('settings.server.status.refresh'))
          .onClick(async () => {
            btn.setDisabled(true);
            const isHealthy = await this.plugin.openCodeService.checkHealth();
            const internalStatus = this.plugin.openCodeService.getServerStatus();
            const diagnostics = this.plugin.openCodeService.getServerDiagnostics();
            const isExternal = isHealthy
              && internalStatus !== 'conflict'
              && (internalStatus === 'stopped' || !this.plugin.openCodeService.isServerProcessRunning());

            await updateStatus();

            const statusText = (() => {
              if (!isLocalMode) {
                return isHealthy ? t('settings.server.status.remoteConnected') : t('settings.server.status.stopped');
              }

              if (internalStatus === 'conflict') {
                return t('settings.server.status.localConflict');
              }

              if (isHealthy) {
                if (diagnostics.reason === 'local-orphan-restarted') {
                  return t('settings.server.status.localRecovered');
                }
                return isExternal ? t('settings.server.status.localExternal') : t('settings.server.status.localManaged');
              }

              if (internalStatus === 'starting' || internalStatus === 'restarting') {
                return t('settings.server.status.starting');
              }

              return t('settings.server.status.stopped');
            })();
            new Notice(`Health: ${isHealthy ? 'OK' : 'FAIL'} | Status: ${statusText}`);
            btn.setDisabled(false);
          });
      });
    
    // Initial status update
    void updateStatus();
    
    // Set up interval to refresh status while settings tab is open
    this.serverStatusIntervalId = window.setInterval(() => void updateStatus(), 2000);
    
    // Clean up interval when settings tab is closed
    this.containerEl.addEventListener('unload', () => {
      if (this.serverStatusIntervalId) {
        window.clearInterval(this.serverStatusIntervalId);
        this.serverStatusIntervalId = null;
      }
      this.refreshServerStatusCallback = undefined;
      this.refreshModelCatalogStatusCallback = undefined;
    }, { once: true });

    return headingEl;
  }

  /** Model settings section */
  private addModelSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.model.title'));
    const modelConfigService = this.plugin.modelConfigService;

    if (!modelConfigService) {
      new Setting(containerEl)
        .setName(t('settings.model.config.unavailableTitle'))
        .setDesc(t('settings.model.config.unavailable'));
      return headingEl;
    }

    this.activeModelCatalogTab = this.getPreferredModelCatalogTab();

    let catalogs: ModelCatalogBundle | null = null;
    let localModelConfig: OpencodeModelConfigSubset | null = null;
    let modelPickerGroups: ModelPickerGroup[] = [];
    let defaultModelButton: import('obsidian').ButtonComponent | null = null;
    const commonBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.common.title'),
      description: t('settings.model.common.desc'),
    });
    const availabilityBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.availability.title'),
      description: t('settings.model.availability.desc'),
      collapsible: true,
      defaultOpen: this.modelAvailabilitySectionOpen,
      onToggle: (isOpen) => {
        this.modelAvailabilitySectionOpen = isOpen;
        this.plugin.settings.modelAvailabilitySectionOpen = isOpen;
        this.plugin.scheduleSettingsUiStateSave();
      },
    });
    const toolsBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.tools.title'),
      description: t('settings.model.tools.desc'),
      collapsible: true,
      defaultOpen: this.modelToolsSectionOpen,
      onToggle: (isOpen) => {
        this.modelToolsSectionOpen = isOpen;
        this.plugin.settings.modelToolsSectionOpen = isOpen;
        this.plugin.scheduleSettingsUiStateSave();
      },
    });
    const commonSummaryEl = commonBodyEl.createDiv({ cls: 'opencodian-model-common-summary' });
    const availabilityManagementEl = availabilityBodyEl.createDiv({ cls: 'opencodian-model-toggle-management' });

    const syncSettingsWithCatalogs = (nextCatalogs: ModelCatalogBundle): boolean => {
      const effectiveProviders = nextCatalogs.effective.providers;
      const effectiveProvider = effectiveProviders.find(
        (provider) => provider.id === this.plugin.settings.defaultProvider,
      ) ?? null;
      let dirty = false;

      if (!effectiveProvider && this.plugin.settings.defaultProvider !== '') {
        this.plugin.settings.defaultProvider = '';
        dirty = true;
      }

      const effectiveModel = effectiveProvider?.models.find(
        (model) => model.id === this.plugin.settings.defaultModel,
      ) ?? null;
      if (!effectiveProvider || !effectiveModel) {
        if (this.plugin.settings.defaultModel !== '') {
          this.plugin.settings.defaultModel = '';
          dirty = true;
        }
      }

      return dirty;
    };

    const updateCommonSummary = (): void => {
      if (!catalogs) {
        commonSummaryEl.setText(t('settings.model.common.summaryLoading'));
        return;
      }

      commonSummaryEl.setText(t('settings.model.common.summary', {
        providers: String(catalogs.effective.providers.length),
        models: String(this.getCatalogModelCount(catalogs.effective)),
      }));
    };

    const updateDefaultModelButton = (): void => {
      if (!defaultModelButton) {
        return;
      }

      const selected = findModelPickerOption(
        modelPickerGroups,
        this.plugin.settings.defaultProvider,
        this.plugin.settings.defaultModel,
      );
      defaultModelButton.setButtonText(
        selected
          ? `${selected.providerName} / ${selected.modelName}`
          : t('settings.model.unconfigured'),
      );
      defaultModelButton.setDisabled(modelPickerGroups.length === 0);
    };

    const applyProviderAvailabilityChange = async (
      providerIds: Iterable<string>,
      enabled: boolean,
    ): Promise<void> => {
      const normalizedProviderIds = Array.from(new Set(
        Array.from(providerIds)
          .map((providerId) => providerId.trim())
          .filter((providerId) => providerId.length > 0),
      ));
      if (normalizedProviderIds.length === 0) {
        return;
      }

      try {
        const currentConfig = await modelConfigService.readLocalModelConfig();
        const knownProviderIds = Array.from(new Set([
          ...(catalogs?.server.providers.map((entry) => entry.id) ?? []),
          ...(catalogs?.local.providers.map((entry) => entry.id) ?? []),
          ...collectConfiguredProviderIds(catalogs?.serverConfig ?? {}),
          ...collectConfiguredProviderIds(currentConfig),
          ...normalizedProviderIds,
        ]));
        let nextConfig = currentConfig;
        for (const providerId of normalizedProviderIds) {
          nextConfig = setProviderEnabled(
            nextConfig,
            providerId,
            enabled,
            knownProviderIds,
            catalogs?.serverConfig,
          );
        }
        await modelConfigService.writeLocalModelConfig(nextConfig);
        await refreshModelSettings({ forceViewReload: true });
        await refreshIconCacheOverview();
      } catch (error) {
        logger.error('Failed to update provider availability in bulk:', error);
        new Notice(t('settings.model.toggle.saveFailed'));
      }
    };

    const applyModelAvailabilityChange = async (
      modelRefs: Iterable<string>,
      enabled: boolean,
    ): Promise<void> => {
      const normalizedModelRefs = Array.from(new Set(
        Array.from(modelRefs)
          .map((modelRef) => {
            const parsedRef = parseModelReference(modelRef);
            return parsedRef
              ? formatModelReference(parsedRef.provider, parsedRef.model)
              : '';
          })
          .filter((modelRef) => modelRef.length > 0),
      ));
      if (normalizedModelRefs.length === 0) {
        return;
      }

      const previousDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
      const nextDisabledModelRefs = new Set(previousDisabledModelRefs);
      for (const modelRef of normalizedModelRefs) {
        if (enabled) {
          nextDisabledModelRefs.delete(modelRef);
        } else {
          nextDisabledModelRefs.add(modelRef);
        }
      }
      this.plugin.settings.disabledModelRefs = [...nextDisabledModelRefs]
        .sort((left, right) => left.localeCompare(right));

      try {
        await refreshModelSettings({ forceViewReload: true });
        await refreshIconCacheOverview();
      } catch (error) {
        logger.error('Failed to update model availability in bulk:', error);
        this.plugin.settings.disabledModelRefs = previousDisabledModelRefs;
        new Notice(t('settings.model.toggle.saveFailed'));
      }
    };

    const openDefaultModelPicker = (): void => {
      new ModelPickerModal(this.app, {
        title: t('settings.model.defaultChatModel.pickerTitle'),
        description: t('settings.model.defaultChatModel.pickerDesc'),
        groups: modelPickerGroups,
        selectedRef: this.plugin.settings.defaultProvider && this.plugin.settings.defaultModel
          ? formatModelReference(this.plugin.settings.defaultProvider, this.plugin.settings.defaultModel)
          : '',
        emptySelectionLabel: t('settings.model.unconfigured'),
        onChoose: async (option) => {
          this.plugin.settings.defaultProvider = option?.providerId ?? '';
          this.plugin.settings.defaultModel = option?.modelId ?? '';
          updateDefaultModelButton();
          await this.plugin.saveSettings({
            syncConfig: false,
            reloadModels: true,
            applyUi: true,
          });
        },
      }).open();
    };

    let modelAvailabilityProviderListScrollTop = 0;

    const renderAvailabilityManagement = (
      options: {
        restoreSearchSelection?: {
          start: number | null;
          end: number | null;
          direction?: 'forward' | 'backward' | 'none' | null;
        };
      } = {},
    ): void => {
      const existingProviderListEl = availabilityManagementEl.querySelector(
        '.opencodian-model-toggle-provider-list',
      );
      if (existingProviderListEl instanceof HTMLElement) {
        modelAvailabilityProviderListScrollTop = existingProviderListEl.scrollTop;
      }

      availabilityManagementEl.empty();

      const blockEl = availabilityManagementEl.createDiv({ cls: 'opencodian-model-toggle-block' });
      const descEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-desc' });
      this.applyInlineCodeText(descEl, t('settings.model.toggle.desc'));

      const controlsEl = blockEl.createDiv({ cls: 'opencodian-model-availability-controls' });
      const searchWrapperEl = controlsEl.createDiv({ cls: 'opencodian-model-availability-search' });
      const searchContainerEl = searchWrapperEl.createDiv({ cls: 'opencodian-model-availability-search-container' });
      const searchIconEl = searchContainerEl.createSpan({ cls: 'opencodian-model-availability-search-icon' });
      setIcon(searchIconEl, 'search');
      const searchInputEl = searchContainerEl.createEl('input', {
        cls: 'opencodian-model-availability-search-input',
        attr: {
          type: 'text',
          placeholder: t('settings.model.availability.searchPlaceholder'),
        },
      });
      searchInputEl.value = this.modelAvailabilityQuery;
      enhanceSearchInput({
        historyKey: 'model-availability',
        inputEl: searchInputEl,
        containerEl: searchContainerEl,
      });
      searchInputEl.addEventListener('input', () => {
        const restoreSearchSelection = {
          start: searchInputEl.selectionStart,
          end: searchInputEl.selectionEnd,
          direction: searchInputEl.selectionDirection,
        };
        this.modelAvailabilityQuery = searchInputEl.value;
        renderAvailabilityManagement({ restoreSearchSelection });
      });

      const restoreSearchSelection = options.restoreSearchSelection;
      if (restoreSearchSelection) {
        window.requestAnimationFrame(() => {
          if (!searchInputEl.isConnected) {
            return;
          }
          searchInputEl.focus();
          const { start, end, direction } = restoreSearchSelection;
          if (start !== null && end !== null) {
            searchInputEl.setSelectionRange(start, end, direction ?? 'none');
          }
        });
      }

      const disabledToggleLabel = controlsEl.createEl('label', {
        cls: 'opencodian-model-availability-filter-toggle',
      });
      const disabledToggleEl = disabledToggleLabel.createEl('input', {
        attr: { type: 'checkbox' },
      });
      disabledToggleEl.checked = this.modelAvailabilityOnlyDisabled;
      disabledToggleEl.addEventListener('change', () => {
        this.modelAvailabilityOnlyDisabled = disabledToggleEl.checked;
        if (disabledToggleEl.checked) {
          this.modelAvailabilityOnlyEnabled = false;
        }
        renderAvailabilityManagement();
      });
      disabledToggleLabel.createSpan({ text: t('settings.model.availability.onlyDisabled') });

      const enabledToggleLabel = controlsEl.createEl('label', {
        cls: 'opencodian-model-availability-filter-toggle',
      });
      const enabledToggleEl = enabledToggleLabel.createEl('input', {
        attr: { type: 'checkbox' },
      });
      enabledToggleEl.checked = this.modelAvailabilityOnlyEnabled;
      enabledToggleEl.addEventListener('change', () => {
        this.modelAvailabilityOnlyEnabled = enabledToggleEl.checked;
        if (enabledToggleEl.checked) {
          this.modelAvailabilityOnlyDisabled = false;
        }
        renderAvailabilityManagement();
      });
      enabledToggleLabel.createSpan({ text: t('settings.model.availability.onlyEnabled') });

      let catalogSectionEl: HTMLElement | null = null;
      if (catalogs) {
        catalogSectionEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-catalogs' });
        const summaryEl = catalogSectionEl.createDiv({ cls: 'opencodian-model-catalog-summary-grid' });
        this.renderModelCatalogSummaryCards(summaryEl, catalogs, localModelConfig, () => {
          renderAvailabilityManagement();
        });
      }

      const selectedCatalog = catalogs
        ? (() => {
          switch (this.activeModelCatalogTab) {
            case 'local':
              return this.getDisplayCatalogForMode('local', catalogs, localModelConfig);
            case 'server':
              return this.getDisplayCatalogForMode('server', catalogs, localModelConfig);
            case 'disabled':
              return this.getDisplayCatalogForMode('disabled', catalogs, localModelConfig);
            case 'effective':
            default:
              return this.getDisplayCatalogForMode('effective', catalogs, localModelConfig);
          }
        })()
        : null;
      const providerStatusCatalog = catalogs
        ? this.getProviderStatusCatalogForMode(this.activeModelCatalogTab, catalogs, localModelConfig)
        : null;
      const providerStatusById = new Map(
        providerStatusCatalog?.providers.map((provider) => [provider.id, provider]) ?? [],
      );
      const selectedCatalogTitle = (() => {
        switch (this.activeModelCatalogTab) {
          case 'local':
            return t('settings.model.catalog.localTitle');
          case 'server':
            return t('settings.model.catalog.serverTitle');
          case 'disabled':
            return t('settings.model.catalog.disabledTitle');
          case 'effective':
          default:
            return t('settings.model.catalog.effectiveTitle');
        }
      })();
      const selectedCatalogProviderIds = Array.from(new Set(
        selectedCatalog?.providers.map((provider) => provider.id) ?? [],
      ));
      const catalogScopedProviderIds = selectedCatalogProviderIds.filter((providerId) => {
        const provider = providerStatusById.get(providerId);
        return provider ? !this.isProviderDisabledByScope(provider, 'global') : true;
      });
      if (catalogSectionEl && catalogs && this.activeModelCatalogTab !== 'disabled' && selectedCatalogProviderIds.length > 0) {
        const catalogActionsEl = catalogSectionEl.createDiv({ cls: 'opencodian-model-catalog-actions' });
        const catalogActionsInfoEl = catalogActionsEl.createDiv({ cls: 'opencodian-model-catalog-actions-info' });
        catalogActionsInfoEl.createDiv({
          cls: 'opencodian-model-catalog-actions-title',
          text: selectedCatalogTitle,
        });
        catalogActionsInfoEl.createDiv({
          cls: 'opencodian-model-catalog-actions-meta',
          text: t('settings.model.catalog.summary', {
            providers: String(selectedCatalog.providers.length),
            models: String(this.getCatalogModelCount(selectedCatalog)),
          }),
        });

        const catalogActionsButtonsEl = catalogActionsEl.createDiv({
          cls: 'opencodian-model-catalog-actions-buttons',
        });
        const enableCatalogProvidersButton = catalogActionsButtonsEl.createEl('button', {
          cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
          text: t('settings.model.availability.enableAllProviders'),
        });
        enableCatalogProvidersButton.type = 'button';
        enableCatalogProvidersButton.disabled = catalogScopedProviderIds.length === 0
          || catalogScopedProviderIds.every((providerId) => this.isProviderCurrentlyEnabled(providerId, catalogs));
        const disableCatalogProvidersButton = catalogActionsButtonsEl.createEl('button', {
          cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
          text: t('settings.model.availability.disableAllProviders'),
        });
        disableCatalogProvidersButton.type = 'button';
        disableCatalogProvidersButton.disabled = catalogScopedProviderIds.length === 0
          || catalogScopedProviderIds.every((providerId) => !this.isProviderCurrentlyEnabled(providerId, catalogs));

        enableCatalogProvidersButton.addEventListener('click', async () => {
          enableCatalogProvidersButton.disabled = true;
          disableCatalogProvidersButton.disabled = true;
          try {
            await applyProviderAvailabilityChange(catalogScopedProviderIds, true);
          } finally {
            if (enableCatalogProvidersButton.isConnected) {
              enableCatalogProvidersButton.disabled = false;
            }
            if (disableCatalogProvidersButton.isConnected) {
              disableCatalogProvidersButton.disabled = false;
            }
          }
        });
        disableCatalogProvidersButton.addEventListener('click', async () => {
          enableCatalogProvidersButton.disabled = true;
          disableCatalogProvidersButton.disabled = true;
          try {
            await applyProviderAvailabilityChange(catalogScopedProviderIds, false);
          } finally {
            if (enableCatalogProvidersButton.isConnected) {
              enableCatalogProvidersButton.disabled = false;
            }
            if (disableCatalogProvidersButton.isConnected) {
              disableCatalogProvidersButton.disabled = false;
            }
          }
        });
      }

      const providers = selectedCatalog?.providers ?? [];
      if (providers.length === 0) {
        blockEl.createDiv({
          cls: 'opencodian-model-toggle-empty',
          text: t('settings.model.toggle.empty'),
        });
        return;
      }

      const disabledModelRefs = new Set(this.plugin.settings.disabledModelRefs);
      const normalizedQuery = this.modelAvailabilityQuery.trim().toLowerCase();
      const providerListEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-provider-list' });
      providerListEl.scrollTop = modelAvailabilityProviderListScrollTop;
      providerListEl.addEventListener('scroll', () => {
        modelAvailabilityProviderListScrollTop = providerListEl.scrollTop;
      });

      for (const provider of providers) {
        const providerStatusSource = providerStatusById.get(provider.id) ?? provider;
        const providerEnabled = catalogs
          ? this.isProviderCurrentlyEnabled(provider.id, catalogs)
          : isProviderEnabled(localModelConfig ?? {}, provider.id);
        const primaryDisabledReason = this.getProviderPrimaryDisabledReason(
          providerStatusSource,
          localModelConfig,
          providerEnabled,
        );
        const providerServerDisabled = primaryDisabledReason === 'server';
        const providerProjectDisabled = primaryDisabledReason === 'project';
        const providerCheckState = this.providerAvailabilityChecks.get(provider.id) ?? { status: 'idle' };
        const providerSearchText = `${provider.name || provider.id} ${provider.id}`.toLowerCase();
        const providerMatchesQuery = normalizedQuery.length > 0 && providerSearchText.includes(normalizedQuery);
        const disabledCount = providerEnabled
          ? providerStatusSource.models.filter((model) => disabledModelRefs.has(formatModelReference(provider.id, model.id))).length
          : providerStatusSource.models.length;
        const hasDisabledState = !providerEnabled || disabledCount > 0;
        const hasEnabledState = providerEnabled && disabledCount < providerStatusSource.models.length;
        if (this.modelAvailabilityOnlyDisabled && !hasDisabledState) {
          continue;
        }
        if (this.modelAvailabilityOnlyEnabled && !hasEnabledState) {
          continue;
        }

        const visibleModels = provider.models.filter((model) => {
          const modelRef = formatModelReference(provider.id, model.id);
          const modelSearchText = `${provider.name || provider.id} ${provider.id} ${model.name || model.id} ${model.id}`.toLowerCase();
          const matchesQuery = normalizedQuery.length === 0
            ? true
            : providerMatchesQuery || modelSearchText.includes(normalizedQuery);
          if (!matchesQuery) {
            return false;
          }

          if (this.modelAvailabilityOnlyDisabled && providerEnabled && !disabledModelRefs.has(modelRef)) {
            return false;
          }
          if (this.modelAvailabilityOnlyEnabled && (!providerEnabled || disabledModelRefs.has(modelRef))) {
            return false;
          }

          return true;
        });

        if (normalizedQuery.length > 0 && !providerMatchesQuery && visibleModels.length === 0) {
          continue;
        }

        const isAutoExpanded = normalizedQuery.length > 0 && (providerMatchesQuery || visibleModels.length > 0);
        const isExpanded = isAutoExpanded || this.expandedModelAvailabilityProviders.has(provider.id);
        const providerEl = providerListEl.createDiv({
          cls: `opencodian-model-toggle-provider${providerEnabled ? '' : ' is-provider-disabled'}`,
        });

        const providerHeaderEl = providerEl.createDiv({ cls: 'opencodian-model-toggle-provider-header' });
        const expandButtonEl = providerHeaderEl.createEl('button', {
          cls: 'opencodian-model-toggle-provider-expand',
        });
        expandButtonEl.type = 'button';
        expandButtonEl.addEventListener('click', () => {
          if (this.expandedModelAvailabilityProviders.has(provider.id)) {
            this.expandedModelAvailabilityProviders.delete(provider.id);
          } else {
            this.expandedModelAvailabilityProviders.add(provider.id);
          }
          renderAvailabilityManagement();
        });

        const chevronEl = expandButtonEl.createSpan({ cls: 'opencodian-model-toggle-provider-chevron' });
        setIcon(chevronEl, isExpanded ? 'chevron-down' : 'chevron-right');
        const iconEl = expandButtonEl.createSpan({ cls: 'opencodian-model-toggle-provider-icon' });
        setIcon(iconEl, 'bot');
        void this.applyProviderIcon(iconEl, provider.id, provider.name || provider.id);

        const providerInfoEl = expandButtonEl.createDiv({ cls: 'opencodian-model-toggle-provider-info' });
        providerInfoEl.createDiv({
          cls: 'opencodian-model-toggle-provider-name',
          text: provider.name || provider.id,
        });
        providerInfoEl.createDiv({
          cls: 'opencodian-model-toggle-provider-meta',
          text: this.describeModelAvailabilitySummary(
            providerStatusSource,
            providerEnabled,
            disabledCount,
            primaryDisabledReason,
            this.activeModelCatalogTab,
          ),
        });
        const badgesEl = providerInfoEl.createDiv({ cls: 'opencodian-model-toggle-provider-badges' });
        badgesEl.createSpan({
          cls: `opencodian-model-source-badge is-${provider.source}`,
          text: t(`settings.model.sourceBadge.${provider.source}` as const),
        });
        badgesEl.createSpan({
          cls: `opencodian-model-status-badge ${this.getProviderAvailabilityStatusClass(
            providerStatusSource,
            providerEnabled,
            disabledCount,
            this.activeModelCatalogTab,
          )}`,
          text: this.getProviderAvailabilityStatusLabel(
            providerStatusSource,
            providerEnabled,
            disabledCount,
            primaryDisabledReason,
            this.activeModelCatalogTab,
          ),
        });
        const serverDisabledBadge = this.getProviderServerConstraintBadge(
          providerStatusSource,
          providerEnabled,
          primaryDisabledReason,
          this.activeModelCatalogTab,
        );
        if (serverDisabledBadge) {
          badgesEl.createSpan({
            cls: `opencodian-model-status-badge ${serverDisabledBadge.className}`,
            text: serverDisabledBadge.text,
          });
        }
        const probeBadge = this.getProviderAvailabilityProbeBadge(providerCheckState);
        if (probeBadge) {
          badgesEl.createSpan({
            cls: `opencodian-model-status-badge ${probeBadge.className}`,
            text: probeBadge.text,
          });
        }
        const probeDetail = this.describeProviderAvailabilityProbe(providerCheckState);
        if (probeDetail) {
          providerInfoEl.createDiv({
            cls: `opencodian-model-toggle-provider-probe ${probeDetail.className}`,
            text: probeDetail.text,
          });
        }

        const providerActionsEl = providerHeaderEl.createDiv({ cls: 'opencodian-model-toggle-provider-actions' });
        const providerTestButton = providerActionsEl.createEl('button', {
          cls: 'opencodian-model-toggle-provider-test-button',
          text: providerCheckState.status === 'loading'
            ? t('settings.model.availability.check.loading')
            : t('settings.model.availability.check.button'),
        });
        providerTestButton.type = 'button';
        providerTestButton.disabled = providerCheckState.status === 'loading' || providerServerDisabled;
        providerTestButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.runProviderAvailabilityCheck(provider.id, modelConfigService, renderAvailabilityManagement);
        });

        const providerToggleLabel = providerActionsEl.createEl('label', {
          cls: 'opencodian-model-toggle-switch',
        });
        const providerToggle = providerToggleLabel.createEl('input', {
          attr: { type: 'checkbox' },
        });
        providerToggle.checked = providerEnabled;
        providerToggle.disabled = providerServerDisabled;
        providerToggleLabel.createSpan({
          cls: 'opencodian-model-toggle-switch-label',
          text: providerProjectDisabled
              ? t('settings.model.toggle.providerProjectDisabled')
              : providerServerDisabled
                ? t('settings.model.toggle.providerServerDisabled')
              : t('settings.model.toggle.providerEnabled'),
        });
        providerToggle.addEventListener('change', () => {
          if (providerServerDisabled) {
            providerToggle.checked = false;
            return;
          }
          const requestedEnabled = providerToggle.checked;
          providerToggle.disabled = true;
          void (async () => {
            try {
              const currentConfig = await modelConfigService.readLocalModelConfig();
              const knownProviderIds = Array.from(new Set([
                ...(catalogs?.server.providers.map((entry) => entry.id) ?? []),
                ...(catalogs?.local.providers.map((entry) => entry.id) ?? []),
                ...collectConfiguredProviderIds(catalogs?.serverConfig ?? {}),
                ...collectConfiguredProviderIds(currentConfig),
                provider.id,
              ]));
              const nextConfig = setProviderEnabled(
                currentConfig,
                provider.id,
                requestedEnabled,
                knownProviderIds,
                catalogs?.serverConfig,
              );
              await modelConfigService.writeLocalModelConfig(nextConfig);
              await refreshModelSettings({ forceViewReload: true });
              await refreshIconCacheOverview();
            } catch (error) {
              logger.error('Failed to update provider availability toggle:', error);
              new Notice(t('settings.model.toggle.saveFailed'));
              providerToggle.checked = !requestedEnabled;
            } finally {
              providerToggle.disabled = false;
            }
          })();
        });

        if (provider.models.length === 0) {
          providerEl.createDiv({
            cls: 'opencodian-model-toggle-empty',
            text: this.describeProviderModels(
              provider,
              (this.activeModelCatalogTab === 'server' || this.activeModelCatalogTab === 'disabled') && !providerEnabled
                ? this.getCatalogPlaceholderReason(provider, this.activeModelCatalogTab, localModelConfig)
                : null,
            ) || t('settings.model.toggle.emptyModels'),
          });
          continue;
        }

        if (!isExpanded) {
          continue;
        }

        const modelsEl = providerEl.createDiv({ cls: 'opencodian-model-toggle-models' });
        const providerModelRefs = providerStatusSource.models.map((model) => formatModelReference(provider.id, model.id));
        if (providerModelRefs.length > 0) {
          const modelToolbarEl = modelsEl.createDiv({ cls: 'opencodian-model-toggle-model-toolbar' });
          modelToolbarEl.createDiv({
            cls: 'opencodian-model-toggle-model-toolbar-summary',
            text: t('settings.model.toggle.allModelsSummary', {
              count: String(providerModelRefs.length),
            }),
          });
          const modelBulkActionsEl = modelToolbarEl.createDiv({ cls: 'opencodian-model-toggle-model-bulk-actions' });
          const enableAllModelsButton = modelBulkActionsEl.createEl('button', {
            cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
            text: t('settings.model.toggle.enableAllModels'),
          });
          enableAllModelsButton.type = 'button';
          const disableAllModelsButton = modelBulkActionsEl.createEl('button', {
            cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
            text: t('settings.model.toggle.disableAllModels'),
          });
          disableAllModelsButton.type = 'button';
          enableAllModelsButton.addEventListener('click', async () => {
            enableAllModelsButton.disabled = true;
            disableAllModelsButton.disabled = true;
            try {
              await applyModelAvailabilityChange(providerModelRefs, true);
            } finally {
              if (enableAllModelsButton.isConnected) {
                enableAllModelsButton.disabled = false;
              }
              if (disableAllModelsButton.isConnected) {
                disableAllModelsButton.disabled = false;
              }
            }
          });
          disableAllModelsButton.addEventListener('click', async () => {
            enableAllModelsButton.disabled = true;
            disableAllModelsButton.disabled = true;
            try {
              await applyModelAvailabilityChange(providerModelRefs, false);
            } finally {
              if (enableAllModelsButton.isConnected) {
                enableAllModelsButton.disabled = false;
              }
              if (disableAllModelsButton.isConnected) {
                disableAllModelsButton.disabled = false;
              }
            }
          });
        }
        const modelsToRender = normalizedQuery.length > 0 || this.modelAvailabilityOnlyDisabled || this.modelAvailabilityOnlyEnabled
          ? visibleModels
          : provider.models;
        if (modelsToRender.length === 0) {
          modelsEl.createDiv({
            cls: 'opencodian-model-toggle-empty',
            text: t('settings.model.availability.noMatchingModels'),
          });
          continue;
        }

        for (const model of modelsToRender) {
          const modelRef = formatModelReference(provider.id, model.id);
          const modelEnabled = !disabledModelRefs.has(modelRef);
          const modelEl = modelsEl.createDiv({
            cls: `opencodian-model-toggle-model${modelEnabled ? '' : ' is-model-disabled'}${providerEnabled ? '' : ' is-provider-disabled'}`,
          });
          const modelInfoEl = modelEl.createDiv({ cls: 'opencodian-model-toggle-model-info' });
          modelInfoEl.createDiv({
            cls: 'opencodian-model-toggle-model-name',
            text: model.name || model.id,
          });
          modelInfoEl.createDiv({
            cls: 'opencodian-model-toggle-model-meta',
            text: model.id,
          });

          const modelToggleLabel = modelEl.createEl('label', {
            cls: 'opencodian-model-toggle-switch',
          });
          const modelToggle = modelToggleLabel.createEl('input', {
            attr: { type: 'checkbox' },
          });
          modelToggle.checked = modelEnabled;
          modelToggleLabel.createSpan({
            cls: 'opencodian-model-toggle-switch-label',
            text: !providerEnabled
              ? t('settings.model.toggle.providerDisabledPriority')
              : modelEnabled
                ? t('settings.model.toggle.modelEnabled')
                : t('settings.model.toggle.modelDisabled'),
          });
          modelToggle.addEventListener('change', () => {
            const requestedEnabled = modelToggle.checked;
            const previousDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
            modelToggle.disabled = true;
            if (requestedEnabled) {
              this.plugin.settings.disabledModelRefs = this.plugin.settings.disabledModelRefs.filter((ref) => ref !== modelRef);
            } else if (!disabledModelRefs.has(modelRef)) {
              this.plugin.settings.disabledModelRefs = [...this.plugin.settings.disabledModelRefs, modelRef]
                .sort((left, right) => left.localeCompare(right));
            }

            void (async () => {
              try {
                await refreshModelSettings({ forceViewReload: true });
                await refreshIconCacheOverview();
              } catch (error) {
                logger.error('Failed to update model availability toggle:', error);
                this.plugin.settings.disabledModelRefs = previousDisabledModelRefs;
                new Notice(t('settings.model.toggle.saveFailed'));
                modelToggle.checked = !requestedEnabled;
              } finally {
                modelToggle.disabled = false;
              }
            })();
          });
        }
      }

      window.requestAnimationFrame(() => {
        if (!providerListEl.isConnected) {
          return;
        }
        providerListEl.scrollTop = modelAvailabilityProviderListScrollTop;
      });
    };

    const refreshModelSettings = async (
      options: { showNotice?: boolean; forceViewReload?: boolean } = {},
    ): Promise<ModelCatalogBundle | null> => {
      const {
        showNotice = false,
        forceViewReload = false,
      } = options;

      try {
        localModelConfig = await modelConfigService.readLocalModelConfig();
        catalogs = await modelConfigService.getCatalogs(
          this.plugin.settings.modelSourceMode,
          this.plugin.settings.disabledModelRefs,
        );
        modelPickerGroups = buildModelPickerGroups(catalogs.effective);
        const dirty = syncSettingsWithCatalogs(catalogs);

        const serializeCatalog = (catalog: ModelCatalog) => ({
          defaults: { ...catalog.defaults },
          providerCount: catalog.providers.length,
          modelCount: this.getCatalogModelCount(catalog),
          providers: catalog.providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            source: provider.source,
            existsInLocal: provider.existsInLocal,
            existsInServer: provider.existsInServer,
            modelCount: provider.models.length,
            models: provider.models.map((model) => ({
              id: model.id,
              name: model.name,
              source: model.source,
              existsInLocal: model.existsInLocal,
              existsInServer: model.existsInServer,
              contextWindow: model.contextWindow,
            })),
          })),
        });

        updateCommonSummary();
        updateDefaultModelButton();
        renderAvailabilityManagement();
        this.refreshTitleModelsCallback?.();

        if (dirty || forceViewReload) {
          await this.plugin.saveSettings({
            syncConfig: false,
            reloadModels: true,
            applyUi: true,
          });
        }

        if (showNotice) {
          const serverDisplayCatalog = this.getDisplayCatalogForMode('server', catalogs, localModelConfig);
          logger.debug('Manual model refresh snapshot', {
            modelSourceMode: this.plugin.settings.modelSourceMode,
            vaultPath: getVaultBasePath(this.app) ?? null,
            disabledProviders: [...(localModelConfig.disabled_providers ?? [])],
            enabledProviders: [...(localModelConfig.enabled_providers ?? [])],
            disabledModelRefs: [...this.plugin.settings.disabledModelRefs],
            selectedDefaultProvider: this.plugin.settings.defaultProvider,
            selectedDefaultModel: this.plugin.settings.defaultModel,
            selectedSmallModel: localModelConfig.small_model ?? null,
            local: serializeCatalog(catalogs.local),
            server: serializeCatalog(catalogs.server),
            baseEffective: serializeCatalog(catalogs.baseEffective),
            effective: serializeCatalog(catalogs.effective),
            disabled: serializeCatalog(this.getDisplayCatalogForMode('disabled', catalogs, localModelConfig)),
          });
          new Notice(t('settings.model.refresh.success', {
            serverCount: String(serverDisplayCatalog.providers.length),
            effectiveCount: String(catalogs.effective.providers.length),
          }));
        }

        return catalogs;
      } catch (error) {
        logger.error('Failed to load models:', error);
        if (showNotice) {
          new Notice(t('settings.model.refresh.failed'));
        }
        return null;
      }
    };
    
    this.refreshModelsCallback = () => {
      void refreshModelSettings();
    };

    new Setting(commonBodyEl)
      .setName(t('settings.model.defaultChatModel.name'))
      .setDesc(t('settings.model.defaultChatModel.desc'))
      .addButton((btn) => {
        defaultModelButton = btn;
        btn
          .setButtonText(t('settings.model.common.summaryLoading'))
          .setCta()
          .onClick(() => {
            openDefaultModelPicker();
          });
      });

    const modelSourceSetting = new Setting(commonBodyEl)
      .setName(t('settings.model.source.name'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('merge', t('settings.model.source.merge'))
          .addOption('local', t('settings.model.source.local'))
          .addOption('server', t('settings.model.source.server'))
          .setValue(this.plugin.settings.modelSourceMode)
          .onChange(async (value) => {
            this.plugin.settings.modelSourceMode = value as ModelSourceMode;
            this.activeModelCatalogTab = this.getPreferredModelCatalogTab();
            await this.plugin.saveSettings({
              syncConfig: false,
              reloadModels: true,
              applyUi: true,
            });
            new Notice(t('settings.model.source.updated'));
            await refreshModelSettings();
            await refreshIconCacheOverview();
          });
      });
    this.setSettingDescWithFormatting(modelSourceSetting, t('settings.model.source.desc'));

    let refreshModelsButton: import('obsidian').ButtonComponent | undefined;
    let isRefreshingModelCatalog = false;
    const updateModelRefreshButtonState = () => {
      if (!refreshModelsButton) {
        return;
      }

      const serverBusy = this.lastKnownServerStatus === 'starting' || this.lastKnownServerStatus === 'restarting';
      refreshModelsButton.setButtonText(
        isRefreshingModelCatalog
          ? t('settings.model.refresh.loading')
          : t('settings.model.refresh.button'),
      );
      refreshModelsButton.setDisabled(isRefreshingModelCatalog || !this.lastKnownServerHealthy || serverBusy);
    };
    this.refreshModelCatalogStatusCallback = updateModelRefreshButtonState;
    updateModelRefreshButtonState();

    new Setting(commonBodyEl)
      .setName(t('settings.model.refresh.name'))
      .setDesc(t('settings.model.refresh.desc'))
      .addButton((btn) => {
        refreshModelsButton = btn;
        updateModelRefreshButtonState();
        btn
          .setButtonText(t('settings.model.refresh.button'))
          .onClick(async () => {
            isRefreshingModelCatalog = true;
            updateModelRefreshButtonState();
            const isHealthy = this.lastKnownServerHealthy || await this.plugin.openCodeService.checkHealth();
            if (!isHealthy) {
              this.lastKnownServerHealthy = false;
              this.lastKnownServerStatus = this.plugin.openCodeService.getServerStatus();
              isRefreshingModelCatalog = false;
              updateModelRefreshButtonState();
              new Notice(t('settings.model.refresh.unavailable'));
              return;
            }
            await refreshModelSettings({ showNotice: true, forceViewReload: true });
            await refreshIconCacheOverview();
            isRefreshingModelCatalog = false;
            updateModelRefreshButtonState();
          });
      });

    const modelConfigSetting = new Setting(toolsBodyEl)
      .setName(t('settings.model.config.name'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.model.config.visualButton'))
          .setCta()
          .onClick(() => {
            new ModelConfigModal(this.app, this.plugin).open();
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.model.config.jsonButton'))
          .onClick(() => {
            new ModelConfigJsonModal(this.app, this.plugin).open();
          });
      });
    this.setSettingDescWithFormatting(
      modelConfigSetting,
      `${t('settings.model.config.desc')}\n${modelConfigService.getConfigPath()}`,
    );

    let refreshIconCacheButton: import('obsidian').ButtonComponent;
    let warmIconCacheButton: import('obsidian').ButtonComponent;
    let viewIconCacheButton: import('obsidian').ButtonComponent;
    const iconCacheOverviewSetting = new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.currentName'))
      .setDesc(t('settings.model.iconCache.currentLoading'))
      .addButton((btn) => {
        viewIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.view'))
          .onClick(async () => {
            const providerIds = await this.getCurrentProviderIdsForIconCache();
            new ProviderIconCacheModal(this.app, this.plugin, providerIds, () => {
              void refreshIconCacheOverview();
            }).open();
          });
      });

    const setIconCacheButtonsDisabled = (disabled: boolean) => {
      refreshIconCacheButton?.setDisabled(disabled);
      warmIconCacheButton?.setDisabled(disabled);
      viewIconCacheButton?.setDisabled(disabled);
    };

    const refreshIconCacheOverview = async () => {
      try {
        const providerIds = await this.getCurrentProviderIdsForIconCache();
        const { summary } = await ProviderIconService.getProviderCacheState(
          this.app,
          providerIds,
          this.plugin.settings.providerIconLibrary,
        );
        iconCacheOverviewSetting.setDesc(t('settings.model.iconCache.currentStatus', {
          cachedProviders: String(summary.cachedProviders),
          totalProviders: String(summary.totalProviders),
          cachedIcons: String(summary.cachedIcons),
          totalIcons: String(summary.totalIcons),
          currentProviders: String(summary.currentProviders),
        }));
        viewIconCacheButton?.setDisabled(summary.totalProviders === 0);
      } catch (error) {
        logger.error('Failed to load provider icon cache overview:', error);
        iconCacheOverviewSetting.setDesc(t('settings.model.iconCache.currentFailed'));
        viewIconCacheButton?.setDisabled(true);
      }
    };

    new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.name'))
      .setDesc(t('settings.model.iconCache.desc'))
      .addButton((btn) => {
        refreshIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.refresh'))
          .onClick(async () => {
            setIconCacheButtonsDisabled(true);
            try {
              const providerIds = await this.getCurrentProviderIdsForIconCache();
              this.plugin.settings.providerIconLibrary = ProviderIconService.persistDefaultEntries(
                providerIds,
                this.plugin.settings.providerIconLibrary,
              );
              const removed = await ProviderIconService.clearCache(this.app);
              const summary = await ProviderIconService.warmProviderIcons(
                this.app,
                providerIds,
                this.plugin.settings.providerIconLibrary,
              );
              await this.plugin.saveSettings({
                syncService: false,
                reloadModels: true,
                syncConfig: false,
                applyUi: true,
              });
              new Notice(t('settings.model.iconCache.refreshSuccess', {
                cached: String(summary.cached),
                supported: String(summary.supported),
                removed: String(removed),
              }));
              await refreshIconCacheOverview();
            } catch (error) {
              logger.error('Failed to refresh provider icon cache:', error);
              new Notice(t('settings.model.iconCache.refreshFailed'));
            } finally {
              setIconCacheButtonsDisabled(false);
            }
          });
      })
      .addButton((btn) => {
        warmIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.warm'))
          .setCta()
          .onClick(async () => {
            setIconCacheButtonsDisabled(true);
            try {
              const providerIds = await this.getCurrentProviderIdsForIconCache();
              this.plugin.settings.providerIconLibrary = ProviderIconService.persistDefaultEntries(
                providerIds,
                this.plugin.settings.providerIconLibrary,
              );
              const summary = await ProviderIconService.warmProviderIcons(
                this.app,
                providerIds,
                this.plugin.settings.providerIconLibrary,
              );
              await this.plugin.saveSettings({
                syncService: false,
                reloadModels: true,
                syncConfig: false,
                applyUi: true,
              });
              if (summary.total === 0) {
                new Notice(t('settings.model.iconCache.noProviders'));
                return;
              }
              new Notice(t('settings.model.iconCache.warmSuccess', {
                cached: String(summary.cached),
                supported: String(summary.supported),
              }));
              await refreshIconCacheOverview();
            } catch (error) {
              logger.error('Failed to warm provider icon cache:', error);
              new Notice(t('settings.model.iconCache.warmFailed'));
            } finally {
              setIconCacheButtonsDisabled(false);
            }
          });
      });

    updateCommonSummary();
    updateDefaultModelButton();
    void refreshIconCacheOverview();

    void (async () => {
      await refreshModelSettings();
      await refreshIconCacheOverview();
    })();

    return headingEl;
  }

  private addConversationSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.conversation.title'));
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
    const headingEl = this.createSectionHeading(containerEl, t('settings.plugins.title'));
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
    this.clearSettingsPanelRestoreWork();
    this.captureSettingsPanelScrollPosition();
    if (this.settingsScrollHandler) {
      this.settingsScrollContainerEl?.removeEventListener('scroll', this.settingsScrollHandler);
      this.settingsScrollHandler = undefined;
    }
    this.settingsScrollContainerEl = null;
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
    if (this.settingsPanelPostRenderFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelPostRenderFrameId);
      this.settingsPanelPostRenderFrameId = null;
    }
    this.styleControlBindings = [];
    this.refreshModelsCallback = undefined;
    this.refreshTitleModelsCallback = undefined;
    super.hide();
  }

  /** Security settings section */
  private addSecuritySettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.security.title'));

    // Initialize config manager
    const vaultPath = getVaultBasePath(this.plugin.app);
    if (!vaultPath) {
      new Setting(containerEl)
        .setName(t('settings.security.configStatus.name'))
        .setDesc('Vault path unavailable');
      return headingEl;
    }
    const configManager = new OpencodeConfigManager(vaultPath);

    // Config file status indicator (created first so we can update it)
    const configStatusSetting = new Setting(containerEl)
      .setName(t('settings.security.configStatus.name'))
      .setDesc(t('settings.security.configStatus.checking'));
    
    // Update config status function - async but called independently
    const updateConfigStatus = async () => {
      try {
        const exists = await configManager.exists();
        const config = exists ? await configManager.read() : null;
        const permission = config?.permission;
        
        // Remove old status classes
        configStatusSetting.settingEl.removeClass(
          'opencodian-status-warning',
          'opencodian-status-yolo',
          'opencodian-status-normal',
          'opencodian-status-plan',
          'opencodian-status-custom'
        );
        
        let statusText: string;
        let statusClass: string;
        
        if (!exists) {
          statusText = t('settings.security.configStatus.notCreated');
          statusClass = 'opencodian-status-warning';
        } else if (typeof permission === 'string' && permission === 'allow') {
          // YOLO mode: "allow" string
          statusText = t('settings.security.configStatus.yolo');
          statusClass = 'opencodian-status-yolo';
        } else if (typeof permission === 'object' && permission?.['*'] === 'ask') {
          // Check if any tool has 'deny' - that's plan mode
          const hasDeny = Object.values(permission).some(v => v === 'deny');
          if (hasDeny) {
            statusText = t('settings.security.configStatus.plan');
            statusClass = 'opencodian-status-plan';
          } else {
            // Normal mode: all 'ask'
            statusText = t('settings.security.configStatus.normal');
            statusClass = 'opencodian-status-normal';
          }
        } else {
          statusText = t('settings.security.configStatus.custom');
          statusClass = 'opencodian-status-custom';
        }
        
        configStatusSetting.setDesc(statusText);
        configStatusSetting.settingEl.addClass(statusClass);
      } catch {
        configStatusSetting.setDesc(t('settings.security.configStatus.error'));
      }
    };

    new Setting(containerEl)
      .setName(t('settings.security.permissionMode.name'))
      .setDesc(t('settings.security.permissionMode.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('yolo', t('settings.security.permissionMode.yolo'));
        dropdown.addOption('normal', t('settings.security.permissionMode.normal'));
        dropdown.addOption('plan', t('settings.security.permissionMode.plan'));
        dropdown
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value) => {
            this.plugin.settings.permissionMode = value as 'yolo' | 'normal' | 'plan';
            await this.plugin.saveSettings();
            
            // Config file is automatically updated in saveSettings()
            new Notice(t('settings.security.permissionMode.updated', { mode: value }));
            
            // Refresh status display
            await updateConfigStatus();
            
            // Auto restart if enabled
            if (this.plugin.settings.autoRestartOnPermissionChange) {
              if (this.plugin.settings.server.mode !== 'local') {
                new Notice(t('settings.server.remoteManageUnavailable'));
                return;
              }

              try {
                const isRunning = await this.plugin.openCodeService.checkHealth();
                if (isRunning) {
                  await this.plugin.openCodeService.stop();
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  await this.plugin.openCodeService.start();
                  new Notice(t('settings.security.autoRestart.success'));
                }
              } catch (error) {
                logger.error('Auto restart failed:', error);
                new Notice(t('settings.security.autoRestart.failed'));
              }
            } else {
              new Notice(t('settings.security.autoRestart.manual'));
            }
          });
      });

    // Initial status check - run asynchronously without blocking
    void updateConfigStatus().catch(() => {
      // Ignore errors if settings tab was closed during update
    });

    // Auto restart option
    new Setting(containerEl)
      .setName(t('settings.security.autoRestart.name'))
      .setDesc(t('settings.security.autoRestart.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRestartOnPermissionChange)
          .onChange(async (value) => {
            this.plugin.settings.autoRestartOnPermissionChange = value;
            await this.plugin.saveSettings();
          })
      );

    // Show current config file path and restart button
    new Setting(containerEl)
      .setName(t('settings.security.configFile.name'))
      .setDesc(`${t('settings.security.configFile.desc')}${configManager.getConfigPath()}`)
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.security.configFile.editBtn'))
          .setTooltip('Open configuration editor')
          .onClick(() => {
            new OpencodeConfigModal(this.app, configManager).open();
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.security.configFile.applyBtn'))
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('Restarting...');
            
            try {
              if (this.plugin.settings.server.mode !== 'local') {
                new Notice(t('settings.server.remoteManageUnavailable'));
                return;
              }

              // Check if service is running
              const isRunning = await this.plugin.openCodeService.checkHealth();
              
              if (isRunning) {
                // Stop and restart
                await this.plugin.openCodeService.stop();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.plugin.openCodeService.start();
                new Notice('OpenCode service restarted. New permission settings are now active.');
              } else {
                // Just start
                await this.plugin.openCodeService.start();
                new Notice('OpenCode service started with new permission settings.');
              }
            } catch (error) {
              logger.error('Failed to restart OpenCode:', error);
              new Notice('Failed to restart OpenCode service. Please restart manually.');
            } finally {
              btn.setDisabled(false);
              btn.setButtonText('Apply & Restart');
            }
          });
      });

    new Setting(containerEl)
      .setName(t('settings.security.blocklist.name'))
      .setDesc(t('settings.security.blocklist.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableBlocklist)
          .onChange(async (value) => {
            this.plugin.settings.enableBlocklist = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.security.externalAccess.name'))
      .setDesc(t('settings.security.externalAccess.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.allowExternalAccess)
          .onChange(async (value) => {
            this.plugin.settings.allowExternalAccess = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.security.exportPaths.name'))
      .setDesc(t('settings.security.exportPaths.desc'))
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.allowedExportPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.allowedExportPaths = value
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
      });

    // Blocked commands configuration
    const platformKey = getCurrentPlatformKey();
    const isWindows = platformKey === 'windows';
    const platformLabel = isWindows ? 'Windows' : 'Unix';

    new Setting(containerEl)
      .setName(t('settings.security.blockedCommands.name', { platform: platformLabel }))
      .setDesc(t('settings.security.blockedCommands.desc'))
      .addTextArea((text) => {
        const placeholder = isWindows
          ? 'del /s /q\nrd /s /q\nRemove-Item -Recurse -Force'
          : 'rm -rf\nchmod 777\nmkfs';
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings.blockedCommands[platformKey].join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.blockedCommands[platformKey] = value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 40;
      });

    // On Windows, show Unix blocklist too since Git Bash can run Unix commands
    if (isWindows) {
      new Setting(containerEl)
        .setName(t('settings.security.blockedCommands.unixName'))
        .setDesc(t('settings.security.blockedCommands.unixDesc'))
        .addTextArea((text) => {
          text
            .setPlaceholder('rm -rf\nchmod 777\nmkfs')
            .setValue(this.plugin.settings.blockedCommands.unix.join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.blockedCommands.unix = value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
          text.inputEl.cols = 40;
        });
    }

    return headingEl;
  }

  /** UI settings section */
  private addUISettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.ui.title'));

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
    const headingEl = this.createSectionHeading(containerEl, t('settings.style.title'));
    this.addThemePresetSection(containerEl);

    new Setting(containerEl)
      .setName(t('settings.style.resetAll.name'))
      .setDesc(t('settings.style.resetAll.desc'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.resetAll.button'))
          .onClick(() => {
            void this.resetAllChatStyles();
          });
      });

    const backgroundGroupHostEl = containerEl.createDiv({ cls: 'opencodian-style-background-group-host' });
    this.renderBackgroundStyleGroup(backgroundGroupHostEl);

    const layoutGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.layout.title'),
      t('settings.style.groups.layout.desc'),
    );
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.messagesPaddingTop.name'),
      desc: t('settings.style.layout.messagesPaddingTop.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.messagesPaddingTop,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.messagesPaddingTop,
      setValue: (appearance, value) => {
        appearance.layout.messagesPaddingTop = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.layout.messagesPaddingX.name'),
      desc: t('settings.style.layout.messagesPaddingX.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.layout.messagesPaddingX,
      resetValue: () => this.plugin.getChatAppearanceBaseline().layout.messagesPaddingX,
      setValue: (appearance, value) => {
        appearance.layout.messagesPaddingX = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.sticky.headerGap.name'),
      desc: t('settings.style.sticky.headerGap.desc'),
      min: 0,
      max: 16,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.sticky.headerGap,
      resetValue: () => this.plugin.getChatAppearanceBaseline().sticky.headerGap,
      setValue: (appearance, value) => {
        appearance.sticky.headerGap = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.sticky.maskHeight.name'),
      desc: t('settings.style.sticky.maskHeight.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.sticky.maskHeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().sticky.maskHeight,
      setValue: (appearance, value) => {
        appearance.sticky.maskHeight = value;
      },
    });
    this.addNumericStyleControl(layoutGroupEl, {
      group: 'layout',
      name: t('settings.style.sticky.maskBlur.name'),
      desc: t('settings.style.sticky.maskBlur.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.sticky.maskBlur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().sticky.maskBlur,
      setValue: (appearance, value) => {
        appearance.sticky.maskBlur = value;
      },
    });
    this.createStyleResetSetting(layoutGroupEl, 'layout');

    const userGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.user.title'),
      t('settings.style.groups.user.desc'),
    );
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.radius.name'),
      desc: t('settings.style.user.radius.desc'),
      min: 8,
      max: 28,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.radius,
      setValue: (appearance, value) => {
        appearance.user.radius = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.tailRadius.name'),
      desc: t('settings.style.user.tailRadius.desc'),
      min: 0,
      max: 12,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.tailRadius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.tailRadius,
      setValue: (appearance, value) => {
        appearance.user.tailRadius = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.blur.name'),
      desc: t('settings.style.user.blur.desc'),
      min: 0,
      max: 24,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.blur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.blur,
      setValue: (appearance, value) => {
        appearance.user.blur = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.shadowBlur.name'),
      desc: t('settings.style.user.shadowBlur.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.shadowBlur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.shadowBlur,
      setValue: (appearance, value) => {
        appearance.user.shadowBlur = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.timeFontSize.name'),
      desc: t('settings.style.user.timeFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.user.timeFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.timeFontSize,
      setValue: (appearance, value) => {
        appearance.user.timeFontSize = value;
      },
    });
    this.addNumericStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.timeFontWeight.name'),
      desc: t('settings.style.user.timeFontWeight.desc'),
      min: 100,
      max: 900,
      step: 1,
      unit: '',
      value: () => this.plugin.settings.chatAppearance.user.timeFontWeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.timeFontWeight,
      setValue: (appearance, value) => {
        appearance.user.timeFontWeight = value;
      },
    });
    this.addColorStyleControl(userGroupEl, {
      group: 'user',
      name: t('settings.style.user.timeColor.name'),
      desc: t('settings.style.user.timeColor.desc'),
      value: () => this.plugin.settings.chatAppearance.user.timeColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().user.timeColor,
      setValue: (appearance, value) => {
        appearance.user.timeColor = value;
      },
    });
    this.createStyleResetSetting(userGroupEl, 'user');

    const assistantGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.assistant.title'),
      t('settings.style.groups.assistant.desc'),
    );
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.radius.name'),
      desc: t('settings.style.assistant.radius.desc'),
      min: 8,
      max: 24,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.radius,
      setValue: (appearance, value) => {
        appearance.assistant.radius = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.backgroundOpacity.name'),
      desc: t('settings.style.assistant.backgroundOpacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.assistant.backgroundOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.backgroundOpacity,
      setValue: (appearance, value) => {
        appearance.assistant.backgroundOpacity = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.blur.name'),
      desc: t('settings.style.assistant.blur.desc'),
      min: 0,
      max: 20,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.blur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.blur,
      setValue: (appearance, value) => {
        appearance.assistant.blur = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.shadowBlur.name'),
      desc: t('settings.style.assistant.shadowBlur.desc'),
      min: 0,
      max: 32,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.shadowBlur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.shadowBlur,
      setValue: (appearance, value) => {
        appearance.assistant.shadowBlur = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.metaFontSize.name'),
      desc: t('settings.style.assistant.metaFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.metaFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.metaFontSize,
      setValue: (appearance, value) => {
        appearance.assistant.metaFontSize = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.timeFontSize.name'),
      desc: t('settings.style.assistant.timeFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.timeFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.timeFontSize,
      setValue: (appearance, value) => {
        appearance.assistant.timeFontSize = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.timeFontWeight.name'),
      desc: t('settings.style.assistant.timeFontWeight.desc'),
      min: 100,
      max: 900,
      step: 1,
      unit: '',
      value: () => this.plugin.settings.chatAppearance.assistant.timeFontWeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.timeFontWeight,
      setValue: (appearance, value) => {
        appearance.assistant.timeFontWeight = value;
      },
    });
    this.addColorStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.metaColor.name'),
      desc: t('settings.style.assistant.metaColor.desc'),
      value: () => this.plugin.settings.chatAppearance.assistant.metaColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.metaColor,
      setValue: (appearance, value) => {
        appearance.assistant.metaColor = value;
      },
    });
    this.addColorStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.timeColor.name'),
      desc: t('settings.style.assistant.timeColor.desc'),
      value: () => this.plugin.settings.chatAppearance.assistant.timeColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.timeColor,
      setValue: (appearance, value) => {
        appearance.assistant.timeColor = value;
      },
    });
    this.addColorStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.modelIdColor.name'),
      desc: t('settings.style.assistant.modelIdColor.desc'),
      value: () => this.plugin.settings.chatAppearance.assistant.modelIdColor,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.modelIdColor,
      setValue: (appearance, value) => {
        appearance.assistant.modelIdColor = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.modelIdFontSize.name'),
      desc: t('settings.style.assistant.modelIdFontSize.desc'),
      min: 6,
      max: 36,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.assistant.modelIdFontSize,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.modelIdFontSize,
      setValue: (appearance, value) => {
        appearance.assistant.modelIdFontSize = value;
      },
    });
    this.addNumericStyleControl(assistantGroupEl, {
      group: 'assistant',
      name: t('settings.style.assistant.modelIdFontWeight.name'),
      desc: t('settings.style.assistant.modelIdFontWeight.desc'),
      min: 100,
      max: 900,
      step: 1,
      unit: '',
      value: () => this.plugin.settings.chatAppearance.assistant.modelIdFontWeight,
      resetValue: () => this.plugin.getChatAppearanceBaseline().assistant.modelIdFontWeight,
      setValue: (appearance, value) => {
        appearance.assistant.modelIdFontWeight = value;
      },
    });
    this.createStyleResetSetting(assistantGroupEl, 'assistant');

    const inputGroupHostEl = containerEl.createDiv({ cls: 'opencodian-style-input-group-host' });
    this.renderInputStyleGroup(inputGroupHostEl);

    const scrollbarGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.scrollbar.title'),
      t('settings.style.groups.scrollbar.desc'),
    );
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.width.name'),
      desc: t('settings.style.scrollbar.width.desc'),
      min: 6,
      max: 12,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.scrollbar.width,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.width,
      setValue: (appearance, value) => {
        appearance.scrollbar.width = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.radius.name'),
      desc: t('settings.style.scrollbar.radius.desc'),
      min: 2,
      max: 999,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.scrollbar.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.radius,
      setValue: (appearance, value) => {
        appearance.scrollbar.radius = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.trackOpacity.name'),
      desc: t('settings.style.scrollbar.trackOpacity.desc'),
      min: 0,
      max: 60,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.trackOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.trackOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.trackOpacity = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.thumbOpacity.name'),
      desc: t('settings.style.scrollbar.thumbOpacity.desc'),
      min: 20,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.thumbOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.thumbOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.thumbOpacity = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.thumbHoverOpacity.name'),
      desc: t('settings.style.scrollbar.thumbHoverOpacity.desc'),
      min: 30,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.thumbHoverOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.thumbHoverOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.thumbHoverOpacity = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.edgePadding.name'),
      desc: t('settings.style.scrollbar.edgePadding.desc'),
      min: 0,
      max: 4,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.scrollbar.edgePadding,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.edgePadding,
      setValue: (appearance, value) => {
        appearance.scrollbar.edgePadding = value;
      },
    });
    this.addNumericStyleControl(scrollbarGroupEl, {
      group: 'scrollbar',
      name: t('settings.style.scrollbar.shadowOpacity.name'),
      desc: t('settings.style.scrollbar.shadowOpacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.scrollbar.shadowOpacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().scrollbar.shadowOpacity,
      setValue: (appearance, value) => {
        appearance.scrollbar.shadowOpacity = value;
      },
    });
    this.createStyleResetSetting(scrollbarGroupEl, 'scrollbar');

    const advancedGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.advanced.title'),
      t('settings.style.groups.advanced.desc'),
    );

    const advancedSetting = new Setting(advancedGroupEl)
      .setName(t('settings.style.advanced.customCssDeclarations.name'))
      .setClass('opencodian-style-setting');
    this.setSettingDescWithFormatting(
      advancedSetting,
      t('settings.style.advanced.customCssDeclarations.desc'),
    );

    const validationEl = advancedSetting.settingEl.createDiv({
      cls: 'opencodian-style-validation',
    });

    advancedSetting.addTextArea((text) => {
      const syncFromSettings = () => {
        const currentValue = this.plugin.settings.chatAppearance.advanced.customCssDeclarations;
        text.setValue(currentValue);
        if (isValidChatAppearanceCustomCssDeclarations(currentValue)) {
          text.inputEl.removeClass('is-invalid');
          validationEl.empty();
          return;
        }

        text.inputEl.addClass('is-invalid');
        validationEl.setText(t('settings.style.advanced.customCssDeclarations.invalid'));
      };

      text
        .setPlaceholder(t('settings.style.advanced.customCssDeclarations.placeholder'))
        .setValue(this.plugin.settings.chatAppearance.advanced.customCssDeclarations)
        .onChange((value) => {
          if (!isValidChatAppearanceCustomCssDeclarations(value)) {
            text.inputEl.addClass('is-invalid');
            validationEl.setText(t('settings.style.advanced.customCssDeclarations.invalid'));
            return;
          }

          text.inputEl.removeClass('is-invalid');
          validationEl.empty();
          this.plugin.updateChatAppearance((appearance) => {
            appearance.advanced.customCssDeclarations = value;
          });
          this.applyAndScheduleStyleUpdate();
        });

      text.inputEl.rows = 6;
      text.inputEl.cols = 44;
      text.inputEl.addClass('opencodian-style-textarea');

      this.registerStyleControlBinding('advanced', syncFromSettings);
    });

    this.createStyleResetSetting(advancedGroupEl, 'advanced');

    return headingEl;
  }

  private addThemePresetSection(containerEl: HTMLElement): void {
    const presetGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.presets.title'),
      t('settings.style.presets.desc'),
    );
    presetGroupEl.addClass('opencodian-theme-presets');

    const presets = getBuiltinThemePresets();
    const styleOrder: ThemeStyleId[] = ['glass', 'flat', 'soft', 'sharp'];
    const presetsByStyle = new Map<ThemeStyleId, ThemePresetDefinition[]>(
      styleOrder.map((styleId) => [styleId, presets.filter((preset) => preset.styleId === styleId)]),
    );
    const styleGridEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-style-grid' });
    const statusRowEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-status-row' });
    const statusEl = statusRowEl.createDiv({ cls: 'opencodian-theme-status-copy' });
    const schemeSectionEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-scheme-section' });
    const schemeLabelEl = schemeSectionEl.createDiv({
      cls: 'opencodian-theme-scheme-label',
      text: t('settings.style.presets.schemes.label'),
    });
    const schemeChipsEl = schemeSectionEl.createDiv({ cls: 'opencodian-theme-scheme-chips' });
    const actionsEl = presetGroupEl.createDiv({ cls: 'opencodian-theme-actions' });
    const styleButtons = new Map<ThemeStyleId, HTMLButtonElement>();

    let selectedStyleId: ThemeStyleId = this.plugin.getActiveThemePresetDefinition()?.styleId ?? 'glass';

    const renderPresetUi = () => {
      const activePreset = this.plugin.getActiveThemePresetDefinition();
      if (activePreset) {
        selectedStyleId = activePreset.styleId;
      }

      const hasOverrides = activePreset ? hasThemeAppearanceOverrides(this.plugin.settings.theme) : false;
      statusEl.setText(
        activePreset
          ? (
            hasOverrides
              ? t('settings.style.presets.statusCustomized', { preset: activePreset.name })
              : t('settings.style.presets.statusPreset', { preset: activePreset.name })
          )
          : t('settings.style.presets.statusCustom'),
      );
      statusRowEl.toggleClass('is-customized', hasOverrides);

      for (const [styleId, buttonEl] of styleButtons) {
        buttonEl.toggleClass('is-active', activePreset?.styleId === styleId);
      }

      schemeChipsEl.empty();
      for (const preset of presetsByStyle.get(selectedStyleId) ?? []) {
        const schemeButtonEl = schemeChipsEl.createEl('button', {
          cls: 'opencodian-theme-scheme-chip',
          text: this.getThemeSchemeLabel(preset.id),
        });
        schemeButtonEl.type = 'button';
        schemeButtonEl.toggleClass('is-active', activePreset?.id === preset.id);
        schemeButtonEl.addEventListener('click', () => {
          void this.applyThemePresetSelection(preset.id, renderPresetUi);
        });
      }
      schemeSectionEl.toggleClass('is-empty', schemeChipsEl.childElementCount === 0);
      schemeLabelEl.setText(t('settings.style.presets.schemes.label'));

      actionsEl.empty();
      if (activePreset) {
        const resetBtn = actionsEl.createEl('button', {
          cls: 'mod-cta opencodian-theme-reset-btn',
          text: t('settings.style.presets.reset.button'),
        });
        resetBtn.type = 'button';
        resetBtn.disabled = !hasOverrides;
        resetBtn.addEventListener('click', () => {
          void this.resetThemePresetAppearance(renderPresetUi);
        });
      }
    };

    for (const styleId of styleOrder) {
      const buttonEl = styleGridEl.createEl('button', {
        cls: 'opencodian-theme-style-card',
      });
      buttonEl.type = 'button';
      buttonEl.createDiv({
        cls: 'opencodian-theme-style-card-title',
        text: this.getThemeStyleTitle(styleId),
      });
      buttonEl.createDiv({
        cls: 'opencodian-theme-style-card-desc',
        text: this.getThemeStyleDescription(styleId),
      });
      buttonEl.addEventListener('click', () => {
        void this.applyThemeStyleSelection(styleId, presetsByStyle, renderPresetUi, (nextStyleId) => {
          selectedStyleId = nextStyleId;
        });
      });
      styleButtons.set(styleId, buttonEl);
    }

    this.stylePresetUiRefresh = renderPresetUi;
    renderPresetUi();
  }

  private async applyThemePresetSelection(
    presetId: ThemePresetDefinition['id'],
    renderPresetUi: () => void,
  ): Promise<void> {
    try {
      await this.plugin.selectThemePresetAndSave(presetId);
      this.refreshStyleControlValues();
      this.renderBackgroundStyleGroup();
      renderPresetUi();
    } catch (error) {
      logger.warn('Failed to apply theme preset selection', error);
      new Notice(t('settings.style.presets.applyFailed'));
    }
  }

  private async resetThemePresetAppearance(renderPresetUi: () => void): Promise<void> {
    try {
      await this.plugin.resetThemePresetAppearanceAndSave();
      this.refreshStyleControlValues();
      this.renderBackgroundStyleGroup();
      renderPresetUi();
    } catch (error) {
      logger.warn('Failed to reset preset appearance', error);
      new Notice(t('settings.style.presets.reset.failed'));
    }
  }

  private async applyThemeStyleSelection(
    styleId: ThemeStyleId,
    presetsByStyle: Map<ThemeStyleId, ThemePresetDefinition[]>,
    renderPresetUi: () => void,
    updateSelectedStyleId: (styleId: ThemeStyleId) => void,
  ): Promise<void> {
    updateSelectedStyleId(styleId);
    const nextPreset = presetsByStyle.get(styleId)?.[0];
    if (!nextPreset) {
      renderPresetUi();
      return;
    }

    await this.applyThemePresetSelection(nextPreset.id, renderPresetUi);
  }

  private getThemeStyleTitle(styleId: ThemeStyleId): string {
    return t(`settings.style.presets.styles.${styleId}.title` as TranslationKey);
  }

  private getThemeStyleDescription(styleId: ThemeStyleId): string {
    return t(`settings.style.presets.styles.${styleId}.desc` as TranslationKey);
  }

  private getThemeSchemeLabel(presetId: ThemePresetDefinition['id']): string {
    return t(`settings.style.presets.scheme.${presetId}` as TranslationKey);
  }

  private createStyleGroupSection(containerEl: HTMLElement, title: string, desc: string): HTMLElement {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-style-section' });
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-style-group' });
    headerEl.createEl('h4', { cls: 'opencodian-style-group-title', text: title });
    headerEl.createEl('p', { cls: 'opencodian-style-group-desc', text: desc });

    return sectionEl.createDiv({ cls: 'opencodian-style-group-body' });
  }

  private addNumericControl(containerEl: HTMLElement, config: NumericControlConfig): void {
    const setting = new Setting(containerEl)
      .setName(config.name)
      .setDesc(config.desc)
      .setClass('opencodian-style-setting');

    setting.controlEl.empty();
    setting.controlEl.addClass('opencodian-style-setting-control');

    const decrementBtn = setting.controlEl.createEl('button', {
      cls: 'opencodian-style-step-btn',
      text: '−',
    });
    decrementBtn.type = 'button';
    decrementBtn.setAttribute('aria-label', `${config.name} -`);

    const sliderEl = setting.controlEl.createEl('input', {
      cls: 'opencodian-style-slider',
      type: 'range',
    });
    sliderEl.min = String(config.min);
    sliderEl.max = String(config.max);
    sliderEl.step = String(config.step);

    const numberInputChars = this.getNumericControlInputChars(config);
    const numberWrapEl = setting.controlEl.createDiv({ cls: 'opencodian-style-number-wrap' });
    numberWrapEl.style.setProperty(
      '--opencodian-style-number-width',
      `calc(${numberInputChars}ch + 1.8em)`,
    );
    const numberEl = numberWrapEl.createEl('input', {
      cls: 'opencodian-style-number',
      type: 'number',
    });
    numberEl.size = numberInputChars;
    numberEl.min = String(config.min);
    numberEl.max = String(config.max);
    numberEl.step = 'any';
    const unitEl = numberWrapEl.createSpan({ cls: 'opencodian-style-unit', text: config.unit });

    const incrementBtn = setting.controlEl.createEl('button', {
      cls: 'opencodian-style-step-btn',
      text: '+',
    });
    incrementBtn.type = 'button';
    incrementBtn.setAttribute('aria-label', `${config.name} +`);

    const resetBtn = setting.controlEl.createEl('button', {
      cls: 'opencodian-style-reset-btn',
      text: '⟲',
    });
    resetBtn.type = 'button';
    resetBtn.setAttribute('aria-label', t('settings.style.resetSingle.tooltip'));
    resetBtn.setAttribute('title', t('settings.style.resetSingle.tooltip'));

    let isEditingNumberInput = false;
    let isDraggingSlider = false;

    const renderValue = (value: number, options: { preserveNumberDraft?: boolean } = {}) => {
      sliderEl.value = String(value);
      if (!(options.preserveNumberDraft && isEditingNumberInput)) {
        numberEl.value = String(value);
      }
      unitEl.setText(config.unit);
    };

    const commitValue = (
      value: number,
      options: { preserveNumberDraft?: boolean; snapToStep?: boolean } = {},
    ) => {
      const nextValue = options.snapToStep === false
        ? this.clampNumericControlValue(value, config.min, config.max)
        : this.clampStyleNumber(value, config.min, config.max, config.step);
      config.commitValue(nextValue);
      renderValue(nextValue, { preserveNumberDraft: options.preserveNumberDraft });
    };

    const commitNumberInputDraft = () => {
      isEditingNumberInput = false;
      const rawValue = numberEl.value.trim();
      if (!this.isStableNumericControlDraft(rawValue)) {
        renderValue(config.value());
        return;
      }

      const nextValue = Number(rawValue);
      if (Number.isNaN(nextValue)) {
        renderValue(config.value());
        return;
      }

      commitValue(nextValue, { snapToStep: false });
    };

    decrementBtn.addEventListener('click', () => {
      commitValue(config.value() - config.step);
    });
    incrementBtn.addEventListener('click', () => {
      commitValue(config.value() + config.step);
    });
    resetBtn.addEventListener('click', () => {
      isDraggingSlider = false;
      commitValue(config.resetValue());
    });
    sliderEl.addEventListener('pointerdown', () => {
      isDraggingSlider = true;
    });
    sliderEl.addEventListener('input', () => {
      const nextValue = Number(sliderEl.value);
      if (Number.isNaN(nextValue)) {
        return;
      }

      if (isDraggingSlider) {
        renderValue(nextValue, { preserveNumberDraft: true });
        return;
      }

      commitValue(nextValue);
    });
    sliderEl.addEventListener('change', () => {
      isDraggingSlider = false;
      const nextValue = Number(sliderEl.value);
      if (!Number.isNaN(nextValue)) {
        commitValue(nextValue);
      }
    });
    sliderEl.addEventListener('blur', () => {
      isDraggingSlider = false;
    });
    numberEl.addEventListener('focus', () => {
      isEditingNumberInput = true;
    });
    numberEl.addEventListener('input', () => {
      const rawValue = numberEl.value.trim();
      if (!this.isStableNumericControlDraft(rawValue)) {
        return;
      }

      const nextValue = Number(rawValue);
      if (!Number.isNaN(nextValue)) {
        commitValue(nextValue, {
          preserveNumberDraft: true,
          snapToStep: false,
        });
      }
    });
    numberEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        numberEl.blur();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        isEditingNumberInput = false;
        renderValue(config.value());
        numberEl.blur();
      }
    });
    numberEl.addEventListener('blur', () => {
      commitNumberInputDraft();
    });

    renderValue(config.value());
    config.registerSync?.(() => {
      renderValue(config.value());
    });

    if (config.helpButton) {
      this.addSettingHelpButton(setting, config.helpButton);
    }
  }

  private getNumericControlInputChars(config: Pick<NumericControlConfig, 'min' | 'max' | 'step'>): number {
    const precision = this.getNumericControlPrecision(config.step);
    const minChars = this.formatNumericControlValue(config.min, precision).length;
    const maxChars = this.formatNumericControlValue(config.max, precision).length;

    return Math.max(4, minChars, maxChars);
  }

  private getNumericControlPrecision(step: number): number {
    const stepText = String(step);
    const decimalIndex = stepText.indexOf('.');

    return decimalIndex >= 0 ? stepText.length - decimalIndex - 1 : 0;
  }

  private formatNumericControlValue(value: number, precision: number): string {
    if (precision <= 0) {
      return String(value);
    }

    return value.toFixed(precision).replace(/\.?0+$/, '');
  }

  private isStableNumericControlDraft(rawValue: string): boolean {
    const normalized = rawValue.trim();
    if (
      normalized.length === 0
      || normalized === '-'
      || normalized === '+'
      || normalized === '.'
      || normalized === '-.'
      || normalized === '+.'
      || normalized.endsWith('.')
      || /[eE][+-]?$/.test(normalized)
    ) {
      return false;
    }

    return Number.isFinite(Number(normalized));
  }

  private clampNumericControlValue(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private addNumericStyleControl(containerEl: HTMLElement, config: NumericStyleControlConfig): void {
    this.addNumericControl(containerEl, {
      name: config.name,
      desc: config.desc,
      min: config.min,
      max: config.max,
      step: config.step,
      unit: config.unit,
      value: config.value,
      resetValue: config.resetValue,
      commitValue: (nextValue) => {
        this.plugin.updateChatAppearance((appearance) => {
          config.setValue(appearance, nextValue);
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync: (syncFromSettings) => {
        this.registerStyleControlBinding(config.group, syncFromSettings);
      },
    });
  }

  private addColorStyleControl(containerEl: HTMLElement, config: ColorStyleControlConfig): void {
    const setting = new Setting(containerEl)
      .setName(config.name)
      .setDesc(config.desc)
      .setClass('opencodian-style-setting');

    const controlEl = (setting as Setting & { controlEl?: HTMLElement }).controlEl instanceof HTMLElement
      ? (setting as Setting & { controlEl: HTMLElement }).controlEl
      : setting.settingEl.createDiv({ cls: 'setting-item-control' });
    controlEl.empty();
    controlEl.addClass('opencodian-style-setting-control');

    controlEl.addClass('opencodian-style-color-control');

    const previewBtn = controlEl.createEl('button', {
      cls: 'opencodian-style-color-preview',
    });
    previewBtn.type = 'button';
    previewBtn.setAttribute('aria-label', t('settings.style.colorPicker.pick'));

    const valueEl = controlEl.createSpan({ cls: 'opencodian-style-color-value' });

    const pickBtn = controlEl.createEl('button', {
      cls: 'opencodian-style-secondary-btn',
      text: t('settings.style.colorPicker.pick'),
    });
    pickBtn.type = 'button';

    const followThemeBtn = controlEl.createEl('button', {
      cls: 'opencodian-style-secondary-btn',
      text: t('settings.style.colorPicker.followTheme'),
    });
    followThemeBtn.type = 'button';

    const colorInput = controlEl.createEl('input', {
      cls: 'opencodian-style-color-input',
      type: 'color',
    });
    colorInput.tabIndex = -1;
    colorInput.setAttribute('aria-hidden', 'true');

    const renderValue = (value: string) => {
      const normalizedValue = value.trim();
      const resetValue = config.resetValue().trim();
      const pickerHex = this.resolveStyleColorPickerHex(normalizedValue || resetValue, resetValue, setting.settingEl);
      const followsTheme = normalizedValue === resetValue;

      colorInput.value = pickerHex;
      previewBtn.style.background = normalizedValue || resetValue;
      previewBtn.setAttribute('title', followsTheme ? t('settings.style.colorPicker.followThemeValue') : normalizedValue);
      valueEl.setText(followsTheme ? t('settings.style.colorPicker.followThemeValue') : pickerHex.toUpperCase());
      valueEl.setAttribute('title', normalizedValue || resetValue);
      followThemeBtn.disabled = followsTheme;
    };

    const commitValue = (value: string) => {
      this.plugin.updateChatAppearance((appearance) => {
        config.setValue(appearance, value.trim());
      });
      this.applyAndScheduleStyleUpdate();
      renderValue(config.value());
    };

    const openColorPicker = () => {
      const inputWithPicker = colorInput as HTMLInputElement & { showPicker?: () => void };
      if (typeof inputWithPicker.showPicker === 'function') {
        inputWithPicker.showPicker();
        return;
      }

      colorInput.click();
    };

    previewBtn.addEventListener('click', openColorPicker);
    pickBtn.addEventListener('click', openColorPicker);
    followThemeBtn.addEventListener('click', () => {
      commitValue(config.resetValue());
    });
    colorInput.addEventListener('change', () => {
      commitValue(colorInput.value);
    });

    renderValue(config.value());
    this.registerStyleControlBinding(config.group, () => {
      renderValue(config.value());
    });
  }

  private resolveStyleColorPickerHex(
    value: string,
    fallback: string,
    hostEl?: HTMLElement | null,
  ): string {
    return this.resolveCssColorToHex(value, hostEl)
      ?? this.resolveCssColorToHex(fallback, hostEl)
      ?? '#808080';
  }

  private resolveCssColorToHex(value: string, hostEl?: HTMLElement | null): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const probeEl = document.createElement('span');
    probeEl.style.color = normalized;
    probeEl.style.position = 'absolute';
    probeEl.style.opacity = '0';
    probeEl.style.pointerEvents = 'none';

    const mountTarget = hostEl?.isConnected ? hostEl : document.body;
    mountTarget.appendChild(probeEl);
    const computedColor = window.getComputedStyle(probeEl).color;
    probeEl.remove();

    return this.parseCssColorToHex(computedColor);
  }

  private parseCssColorToHex(color: string): string | null {
    const match = color.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/iu);
    if (!match) {
      return null;
    }

    const toHex = (value: string) => Number.parseInt(value, 10).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  private addGlassRefractionInputControls(containerEl: HTMLElement): void {
    const variantId = this.getCurrentGlassRefractionVariantId(this.plugin.settings.inputPanelTheme);
    const defaults = getDefaultInputPanelGlassRefractionSettings()[variantId];
    const svgFilterDefaults = getDefaultInputPanelGlassRefractionSvgFilterSettings();
    const syncHandlers: Array<() => void> = [];
    const registerSync = (syncFromSettings: () => void) => {
      syncHandlers.push(syncFromSettings);
    };

    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.backgroundOpacity.name'),
      desc: t('settings.style.input.glassRefraction.backgroundOpacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].backgroundOpacity,
      resetValue: () => defaults.backgroundOpacity,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.backgroundOpacity = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });
    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.blur.name'),
      desc: t('settings.style.input.glassRefraction.blur.desc'),
      min: 0,
      max: 40,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].blur,
      resetValue: () => defaults.blur,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.blur = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });
    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.saturation.name'),
      desc: t('settings.style.input.glassRefraction.saturation.desc'),
      min: 50,
      max: 250,
      step: 5,
      unit: '%',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].saturation,
      resetValue: () => defaults.saturation,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.saturation = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });
    this.addNumericControl(containerEl, {
      name: t('settings.style.input.glassRefraction.brightness.name'),
      desc: t('settings.style.input.glassRefraction.brightness.desc'),
      min: 50,
      max: 150,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.inputPanelGlassRefraction[variantId].brightness,
      resetValue: () => defaults.brightness,
      commitValue: (value) => {
        this.updateInputPanelGlassRefractionVariant(variantId, (settings) => {
          settings.brightness = value;
        });
        this.applyAndScheduleStyleUpdate();
      },
      registerSync,
    });

    new Setting(containerEl)
      .setName(t('settings.style.input.glassRefraction.svgFilter.name'))
      .setDesc(t('settings.style.input.glassRefraction.svgFilter.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('none', t('settings.style.input.glassRefraction.svgFilter.option.none'))
          .addOption('subtle', t('settings.style.input.glassRefraction.svgFilter.option.subtle'))
          .addOption('strong', t('settings.style.input.glassRefraction.svgFilter.option.strong'))
          .setValue(this.plugin.settings.inputPanelGlassRefractionSvgFilter.preset)
          .onChange((value) => {
            this.plugin.settings.inputPanelGlassRefractionSvgFilter = {
              ...this.plugin.settings.inputPanelGlassRefractionSvgFilter,
              preset: value as InputPanelGlassRefractionSvgFilterPresetId,
            };
            this.applyAndScheduleStyleUpdate();
            this.renderInputStyleGroup();
          });
      });

    const activeSvgFilterPreset = this.plugin.settings.inputPanelGlassRefractionSvgFilter.preset;
    if (activeSvgFilterPreset !== 'none') {
      const scaleKey = this.getInputPanelGlassRefractionSvgFilterScaleKey(activeSvgFilterPreset);
      const scaleDefault = svgFilterDefaults[scaleKey];

      this.addNumericControl(containerEl, {
        name: t('settings.style.input.glassRefraction.svgFilter.scale.name'),
        desc: t('settings.style.input.glassRefraction.svgFilter.scale.desc'),
        min: 0,
        max: 32,
        step: 1,
        unit: '',
        value: () => this.plugin.settings.inputPanelGlassRefractionSvgFilter[scaleKey],
        resetValue: () => scaleDefault,
        commitValue: (value) => {
          this.plugin.settings.inputPanelGlassRefractionSvgFilter = {
            ...this.plugin.settings.inputPanelGlassRefractionSvgFilter,
            [scaleKey]: value,
          };
          this.applyAndScheduleStyleUpdate();
        },
        registerSync,
      });

      new Setting(containerEl)
        .setName(t('settings.style.input.glassRefraction.svgFilter.reset.name'))
        .setDesc(t('settings.style.input.glassRefraction.svgFilter.reset.desc'))
        .setClass('opencodian-style-reset-setting')
        .addButton((btn) => {
          btn
            .setButtonText(t('settings.style.input.glassRefraction.svgFilter.reset.button'))
            .onClick(() => {
              this.plugin.settings.inputPanelGlassRefractionSvgFilter = {
                ...this.plugin.settings.inputPanelGlassRefractionSvgFilter,
                [scaleKey]: scaleDefault,
              };
              this.applyAndScheduleStyleUpdate();
              syncHandlers.forEach((syncFromSettings) => syncFromSettings());
            });
        });
    }

    new Setting(containerEl)
      .setName(t('settings.style.input.glassRefraction.reset.name'))
      .setDesc(t('settings.style.input.glassRefraction.reset.desc'))
      .setClass('opencodian-style-reset-setting')
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.input.glassRefraction.reset.button'))
          .onClick(() => {
            this.plugin.settings.inputPanelGlassRefraction = {
              ...this.plugin.settings.inputPanelGlassRefraction,
              [variantId]: { ...defaults },
            };
            this.applyAndScheduleStyleUpdate();
            syncHandlers.forEach((syncFromSettings) => syncFromSettings());
          });
      });
  }

  private createStyleResetSetting(
    containerEl: HTMLElement,
    group: ChatAppearanceStyleGroup,
  ): void {
    new Setting(containerEl)
      .setName(t('settings.style.groupReset.name'))
      .setDesc(t('settings.style.groupReset.desc'))
      .setClass('opencodian-style-reset-setting')
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.groupReset.button'))
          .onClick(() => {
            if (group === 'background') {
              void this.resetBackgroundStyleGroup();
              return;
            }

            this.plugin.resetChatAppearanceGroup(group);
            this.applyAndScheduleStyleUpdate();
            this.refreshStyleControlValues(group);
          });
      });
  }

  private async resetBackgroundStyleGroup(): Promise<void> {
    try {
      await this.plugin.resetChatAppearanceGroupAndSave('background');
      this.refreshStyleControlValues('background');
      this.renderBackgroundStyleGroup();
      new Notice(t('settings.style.groupReset.success'));
    } catch (error) {
      logger.warn('Failed to reset background style group', error);
      new Notice(t('settings.style.groupReset.failed'));
    }
  }

  private registerStyleControlBinding(
    group: ChatAppearanceStyleGroup,
    syncFromSettings: () => void,
  ): void {
    this.styleControlBindings.push({
      group,
      syncFromSettings,
    });
  }

  private refreshStyleControlValues(group?: ChatAppearanceStyleGroup): void {
    for (const binding of this.styleControlBindings) {
      if (group && binding.group !== group) {
        continue;
      }
      binding.syncFromSettings();
    }
  }

  private clampStyleNumber(value: number, min: number, max: number, step: number): number {
    const clampedValue = this.clampNumericControlValue(value, min, max);
    const precision = Math.max(
      this.getNumericControlPrecision(step),
      this.getNumericControlPrecision(min),
      this.getNumericControlPrecision(max),
    );
    const steppedValue = (Math.round(((clampedValue - min) / step) + Number.EPSILON) * step) + min;
    const normalizedValue = precision > 0 ? Number(steppedValue.toFixed(precision)) : steppedValue;
    return this.clampNumericControlValue(normalizedValue, min, max);
  }

  private applyAndScheduleStyleUpdate(): void {
    this.plugin.applyChatAppearanceSettings();
    this.plugin.scheduleChatAppearanceSave();
  }

  private getInputPanelThemeFamily(themeId: InputPanelThemeId): 'preset' | 'glass-refraction' | 'liquid-glass' {
    if (themeId === 'preset') {
      return 'preset';
    }

    if (
      themeId === 'liquid-glass-shuding'
      || themeId === 'liquid-glass-nikdelvin'
    ) {
      return 'liquid-glass';
    }

    return 'glass-refraction';
  }

  private getGlassRefractionInputPanelTheme(
    themeId: InputPanelThemeId,
  ): 'glass-refraction-glass' | 'glass-refraction-card' | 'glass-refraction-pill' {
    switch (themeId) {
      case 'glass-refraction-card':
      case 'glass-refraction-pill':
      case 'glass-refraction-glass':
        return themeId;
      default:
        return 'glass-refraction-glass';
    }
  }

  private getLiquidGlassInputPanelTheme(
    themeId: InputPanelThemeId,
  ): 'liquid-glass-shuding' | 'liquid-glass-nikdelvin' {
    switch (themeId) {
      case 'liquid-glass-shuding':
      case 'liquid-glass-nikdelvin':
        return themeId;
      default:
        return 'liquid-glass-shuding';
    }
  }

  private getLiquidGlassAdapterId(themeId: InputPanelThemeId): LiquidGlassAdapterId | null {
    switch (themeId) {
      case 'liquid-glass-shuding':
        return 'shuding';
      case 'liquid-glass-nikdelvin':
        return 'nikdelvin';
      default:
        return null;
    }
  }

  private getLiquidGlassThemeId(adapterId: LiquidGlassAdapterId): InputPanelThemeId {
    switch (adapterId) {
      case 'shuding':
        return 'liquid-glass-shuding';
      case 'nikdelvin':
        return 'liquid-glass-nikdelvin';
      default:
        return 'preset';
    }
  }

  private getInputPanelGlassRefractionSvgFilterScaleKey(
    preset: Exclude<InputPanelGlassRefractionSvgFilterPresetId, 'none'>,
  ): 'subtleScale' | 'strongScale' {
    return preset === 'subtle' ? 'subtleScale' : 'strongScale';
  }

  private getCurrentGlassRefractionVariantId(themeId: InputPanelThemeId): InputPanelGlassRefractionVariantId {
    switch (themeId) {
      case 'glass-refraction-card':
        return 'card';
      case 'glass-refraction-pill':
        return 'pill';
      default:
        return 'glass';
    }
  }

  private updateInputPanelGlassRefractionVariant(
    variantId: InputPanelGlassRefractionVariantId,
    mutator: (settings: OpenCodianPlugin['settings']['inputPanelGlassRefraction'][InputPanelGlassRefractionVariantId]) => void,
  ): void {
    const nextVariantSettings = {
      ...this.plugin.settings.inputPanelGlassRefraction[variantId],
    };
    mutator(nextVariantSettings);
    this.plugin.settings.inputPanelGlassRefraction = {
      ...this.plugin.settings.inputPanelGlassRefraction,
      [variantId]: nextVariantSettings,
    };
  }

  private renderBackgroundStyleGroup(containerEl?: HTMLElement): void {
    const hostEl = containerEl ?? this.backgroundStyleGroupHostEl;
    if (!hostEl) {
      return;
    }

    this.backgroundStyleGroupHostEl = hostEl;
    this.styleControlBindings = this.styleControlBindings.filter((binding) => binding.group !== 'background');
    hostEl.empty();

    const backgroundGroupEl = this.createStyleGroupSection(
      hostEl,
      t('settings.style.groups.background.title'),
      t('settings.style.groups.background.desc'),
    );
    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    const hasBackgroundImage = Boolean(backgroundSettings.imagePath);
    const displayName = backgroundSettings.imageDisplayName
      || (backgroundSettings.imagePath ? path.basename(backgroundSettings.imagePath) : '');

    const cardEl = backgroundGroupEl.createDiv({ cls: 'opencodian-theme-background-card' });
    const previewEl = cardEl.createDiv({
      cls: `opencodian-theme-background-preview ${hasBackgroundImage ? 'is-loading' : 'is-empty'}`,
    });
    previewEl.createDiv({
      cls: 'opencodian-theme-background-preview-placeholder',
      text: hasBackgroundImage
        ? t('settings.style.background.preview.loading')
        : t('settings.style.background.preview.empty'),
    });

    const metaEl = cardEl.createDiv({ cls: 'opencodian-theme-background-meta' });
    metaEl.createDiv({
      cls: 'opencodian-theme-background-label',
      text: t('settings.style.background.card.title'),
    });
    metaEl.createDiv({
      cls: 'opencodian-theme-background-copy',
      text: hasBackgroundImage
        ? t('settings.style.background.card.descLoaded', { name: displayName || t('settings.style.background.card.defaultName') })
        : t('settings.style.background.card.descEmpty'),
    });
    const detailEl = metaEl.createDiv({
      cls: 'opencodian-theme-background-note',
      text: t('settings.style.background.card.scope'),
    });

    const actionsEl = metaEl.createDiv({ cls: 'opencodian-theme-background-actions' });
    const fileInputEl = document.createElement('input');
    fileInputEl.type = 'file';
    fileInputEl.accept = '.svg,.png,.jpg,.jpeg,.webp,.gif,image/*';
    fileInputEl.style.display = 'none';
    fileInputEl.addEventListener('change', () => {
      const selectedFile = fileInputEl.files?.[0];
      if (!selectedFile) {
        return;
      }

      fileInputEl.value = '';
      void this.handleThemeBackgroundFileSelected(selectedFile);
    });
    actionsEl.appendChild(fileInputEl);

    const uploadBtn = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: hasBackgroundImage
        ? t('settings.style.background.actions.replace')
        : t('settings.style.background.actions.upload'),
    });
    uploadBtn.type = 'button';
    uploadBtn.addEventListener('click', () => {
      fileInputEl.click();
    });

    const clearBtn = actionsEl.createEl('button', {
      text: t('settings.style.background.actions.remove'),
    });
    clearBtn.type = 'button';
    clearBtn.disabled = !hasBackgroundImage;
    clearBtn.addEventListener('click', () => {
      void this.clearThemeBackgroundSelection();
    });

    if (hasBackgroundImage) {
      const requestId = ++this.backgroundPreviewRequestId;
      void this.populateThemeBackgroundPreview(previewEl, detailEl, requestId);
    } else {
      this.backgroundPreviewRequestId += 1;
    }

    new Setting(backgroundGroupEl)
      .setName(t('settings.style.background.fitMode.name'))
      .setDesc(t('settings.style.background.fitMode.desc'))
      .setClass('opencodian-style-setting')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('cover', t('settings.style.background.fitMode.option.cover'))
          .addOption('contain', t('settings.style.background.fitMode.option.contain'))
          .addOption('fit-width', t('settings.style.background.fitMode.option.fitWidth'))
          .addOption('fit-height', t('settings.style.background.fitMode.option.fitHeight'))
          .setValue(this.plugin.settings.chatAppearance.background.fitMode)
          .onChange((value) => {
            this.plugin.updateChatAppearance((appearance) => {
              appearance.background.fitMode = value as ChatAppearanceBackgroundFitMode;
            });
            this.applyAndScheduleStyleUpdate();
            this.renderBackgroundStyleGroup();
          });
      });

    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.opacity.name'),
      desc: t('settings.style.background.opacity.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.opacity,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.opacity,
      setValue: (appearance, value) => {
        appearance.background.opacity = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.blur.name'),
      desc: t('settings.style.background.blur.desc'),
      min: 0,
      max: 48,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.background.blur,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.blur,
      setValue: (appearance, value) => {
        appearance.background.blur = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.depth.name'),
      desc: t('settings.style.background.depth.desc'),
      min: 0,
      max: 36,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.depth,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.depth,
      setValue: (appearance, value) => {
        appearance.background.depth = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.dim.name'),
      desc: t('settings.style.background.dim.desc'),
      min: 0,
      max: 88,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.dim,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.dim,
      setValue: (appearance, value) => {
        appearance.background.dim = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.edgeFade.name'),
      desc: t('settings.style.background.edgeFade.desc'),
      min: 0,
      max: 80,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.background.edgeFade,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.edgeFade,
      setValue: (appearance, value) => {
        appearance.background.edgeFade = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.saturation.name'),
      desc: t('settings.style.background.saturation.desc'),
      min: 50,
      max: 200,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.saturation,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.saturation,
      setValue: (appearance, value) => {
        appearance.background.saturation = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.brightness.name'),
      desc: t('settings.style.background.brightness.desc'),
      min: 40,
      max: 140,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.brightness,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.brightness,
      setValue: (appearance, value) => {
        appearance.background.brightness = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.focusX.name'),
      desc: t('settings.style.background.focusX.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.focusX,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.focusX,
      setValue: (appearance, value) => {
        appearance.background.focusX = value;
      },
    });
    this.addNumericStyleControl(backgroundGroupEl, {
      group: 'background',
      name: t('settings.style.background.focusY.name'),
      desc: t('settings.style.background.focusY.desc'),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      value: () => this.plugin.settings.chatAppearance.background.focusY,
      resetValue: () => this.plugin.getChatAppearanceBaseline().background.focusY,
      setValue: (appearance, value) => {
        appearance.background.focusY = value;
      },
    });
    this.createStyleResetSetting(backgroundGroupEl, 'background');
  }

  private updateThemeBackgroundPreviewPresentation(
    previewEl: HTMLElement,
    imageEl: HTMLElement,
    overlayEl: HTMLElement,
  ): void {
    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    previewEl.style.setProperty('--opencodian-theme-background-preview-edge-fade', `${backgroundSettings.edgeFade}px`);
    imageEl.style.opacity = String(backgroundSettings.opacity / 100);
    imageEl.style.backgroundSize = getChatAppearanceBackgroundSizeValue(backgroundSettings.fitMode);
    imageEl.style.backgroundPosition = `${backgroundSettings.focusX}% ${backgroundSettings.focusY}%`;
    imageEl.style.transform = `scale(${(100 + backgroundSettings.depth) / 100})`;
    imageEl.style.filter = `blur(${backgroundSettings.blur}px) saturate(${backgroundSettings.saturation}%) brightness(${backgroundSettings.brightness}%)`;
    overlayEl.style.opacity = String(Math.min(0.88, backgroundSettings.dim / 100));
  }

  private bindThemeBackgroundPreviewFocusDrag(
    previewEl: HTMLElement,
    applyPreviewPresentation: () => void,
  ): void {
    let activePointerId: number | null = null;

    const updateFocusFromPointer = (clientX: number, clientY: number) => {
      const rect = previewEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const nextFocusX = this.clampStyleNumber(((clientX - rect.left) / rect.width) * 100, 0, 100, 1);
      const nextFocusY = this.clampStyleNumber(((clientY - rect.top) / rect.height) * 100, 0, 100, 1);

      this.plugin.updateChatAppearance((appearance) => {
        appearance.background.focusX = nextFocusX;
        appearance.background.focusY = nextFocusY;
      });
      applyPreviewPresentation();
      this.refreshStyleControlValues('background');
      this.plugin.applyChatAppearanceSettings();
      this.plugin.scheduleChatAppearanceSave();
    };

    previewEl.addClass('is-draggable');
    previewEl.setAttribute('title', t('settings.style.background.preview.dragHint'));
    previewEl.style.touchAction = 'none';

    previewEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }

      activePointerId = event.pointerId;
      previewEl.addClass('is-dragging');
      previewEl.setPointerCapture(event.pointerId);
      updateFocusFromPointer(event.clientX, event.clientY);
      event.preventDefault();
    });

    previewEl.addEventListener('pointermove', (event) => {
      if (activePointerId !== event.pointerId) {
        return;
      }

      updateFocusFromPointer(event.clientX, event.clientY);
    });

    const releasePointer = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) {
        return;
      }

      activePointerId = null;
      previewEl.removeClass('is-dragging');
      if (previewEl.hasPointerCapture(event.pointerId)) {
        previewEl.releasePointerCapture(event.pointerId);
      }
    };

    previewEl.addEventListener('pointerup', releasePointer);
    previewEl.addEventListener('pointercancel', releasePointer);
  }

  private async populateThemeBackgroundPreview(
    previewEl: HTMLElement,
    detailEl: HTMLElement,
    requestId: number,
  ): Promise<void> {
    const backgroundSettings = this.plugin.settings.chatAppearance.background;
    const displayName = backgroundSettings.imageDisplayName
      || (backgroundSettings.imagePath ? path.basename(backgroundSettings.imagePath) : t('settings.style.background.card.defaultName'));
    const dataUrl = await this.plugin.resolveChatThemeBackgroundDataUrl();

    if (requestId !== this.backgroundPreviewRequestId || !previewEl.isConnected) {
      return;
    }

    previewEl.empty();
    previewEl.removeClass('is-loading');
    if (!dataUrl) {
      previewEl.addClass('is-empty');
      previewEl.createDiv({
        cls: 'opencodian-theme-background-preview-placeholder',
        text: t('settings.style.background.preview.missing'),
      });
      detailEl.setText(t('settings.style.background.card.descMissing'));
      return;
    }

    previewEl.removeClass('is-empty');
    const imageEl = previewEl.createDiv({ cls: 'opencodian-theme-background-preview-image' });
    imageEl.setAttribute('aria-label', displayName);
    imageEl.style.backgroundImage = `url(${JSON.stringify(dataUrl)})`;
    const overlayEl = previewEl.createDiv({ cls: 'opencodian-theme-background-preview-overlay' });
    const applyPreviewPresentation = () => {
      this.updateThemeBackgroundPreviewPresentation(previewEl, imageEl, overlayEl);
    };
    applyPreviewPresentation();
    this.bindThemeBackgroundPreviewFocusDrag(previewEl, applyPreviewPresentation);
    detailEl.setText(
      `${t('settings.style.background.card.scopeWithName', { name: displayName })} ${t('settings.style.background.preview.dragHint')}`,
    );
  }

  private async handleThemeBackgroundFileSelected(file: File): Promise<void> {
    try {
      await this.plugin.importChatThemeBackgroundFile(file);
      this.renderBackgroundStyleGroup();
      new Notice(t('settings.style.background.upload.success', { name: file.name }));
    } catch (error) {
      logger.warn('Failed to import theme background image', error);
      new Notice(
        error instanceof Error
          ? error.message
          : t('settings.style.background.upload.failed'),
      );
    }
  }

  private async clearThemeBackgroundSelection(): Promise<void> {
    try {
      await this.plugin.clearChatThemeBackground();
      this.renderBackgroundStyleGroup();
      new Notice(t('settings.style.background.remove.success'));
    } catch (error) {
      logger.warn('Failed to clear theme background image', error);
      new Notice(t('settings.style.background.remove.failed'));
    }
  }

  private async resetAllChatStyles(): Promise<void> {
    try {
      await this.plugin.resetChatAppearanceToBaselineAndSave();
      this.refreshStyleControlValues();
      this.renderBackgroundStyleGroup();
      this.stylePresetUiRefresh?.();
      new Notice(t('settings.style.resetAll.success'));
    } catch (error) {
      logger.warn('Failed to reset chat styles', error);
      new Notice(t('settings.style.resetAll.failed'));
    }
  }

  private renderInputStyleGroup(containerEl?: HTMLElement): void {
    const hostEl = containerEl ?? this.inputStyleGroupHostEl;
    if (!hostEl) {
      return;
    }

    this.inputStyleGroupHostEl = hostEl;
    this.styleControlBindings = this.styleControlBindings.filter((binding) => binding.group !== 'input');
    hostEl.empty();

    const inputGroupEl = this.createStyleGroupSection(
      hostEl,
      t('settings.style.groups.input.title'),
      t('settings.style.groups.input.desc'),
    );
    const themeFamily = this.getInputPanelThemeFamily(this.plugin.settings.inputPanelTheme);
    const isPresetInputPanelTheme = themeFamily === 'preset';
    new Setting(inputGroupEl)
      .setName(t('settings.style.input.theme.name'))
      .setDesc(t('settings.style.input.theme.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('preset', t('settings.style.input.theme.option.preset'))
          .addOption('glass-refraction', t('settings.style.input.theme.option.glassRefraction'))
          .addOption('liquid-glass', t('settings.style.input.theme.option.liquidGlass'))
          .setValue(themeFamily)
          .onChange(async (value) => {
            const nextTheme: InputPanelThemeId =
              value === 'preset'
                ? 'preset'
                : value === 'glass-refraction'
                  ? (
                    themeFamily === 'glass-refraction'
                      ? this.getGlassRefractionInputPanelTheme(this.plugin.settings.inputPanelTheme)
                      : 'glass-refraction-glass'
                  )
                  : (
                    themeFamily === 'liquid-glass'
                      ? this.getLiquidGlassInputPanelTheme(this.plugin.settings.inputPanelTheme)
                      : 'liquid-glass-shuding'
                  );
            await this.applyInputPanelThemeChange(nextTheme);
          });
      });

    new Setting(inputGroupEl)
      .setName(t('settings.style.input.actionButtons.name'))
      .setDesc(t('settings.style.input.actionButtons.desc'))
      .addDropdown((dropdown) => {
        const syncFromSettings = () => {
          dropdown.setValue(this.plugin.settings.chatAppearance.input.actionButtonStyle);
        };
        this.registerStyleControlBinding('input', syncFromSettings);
        dropdown
          .addOption('default', t('settings.style.input.actionButtons.option.default'))
          .addOption('etched', t('settings.style.input.actionButtons.option.etched'))
          .setValue(this.plugin.settings.chatAppearance.input.actionButtonStyle)
          .onChange((value) => {
            this.plugin.updateChatAppearance((appearance) => {
              appearance.input.actionButtonStyle = value as InputPanelActionButtonStyleId;
            });
            this.applyAndScheduleStyleUpdate();
          });
      });

    if (themeFamily === 'glass-refraction') {
      new Setting(inputGroupEl)
        .setName(t('settings.style.input.variant.name'))
        .setDesc(t('settings.style.input.variant.desc'))
        .addDropdown((dropdown) => {
          dropdown
            .addOption('glass-refraction-glass', t('settings.style.input.variant.option.glass'))
            .addOption('glass-refraction-card', t('settings.style.input.variant.option.card'))
            .addOption('glass-refraction-pill', t('settings.style.input.variant.option.pill'))
            .setValue(this.getGlassRefractionInputPanelTheme(this.plugin.settings.inputPanelTheme))
            .onChange(async (value) => {
              await this.applyInputPanelThemeChange(value as InputPanelThemeId);
            });
        });
    }

    if (themeFamily === 'liquid-glass') {
      new Setting(inputGroupEl)
        .setName(t('settings.style.input.liquidGlass.variant.name'))
        .setDesc(t('settings.style.input.liquidGlass.variant.desc'))
        .addDropdown((dropdown) => {
          for (const adapter of getAllGlassAdapters()) {
            dropdown.addOption(this.getLiquidGlassThemeId(adapter.id), adapter.displayName);
          }

          dropdown
            .setValue(this.getLiquidGlassInputPanelTheme(this.plugin.settings.inputPanelTheme))
            .onChange(async (value) => {
              await this.applyInputPanelThemeChange(value as InputPanelThemeId);
            });
        });
    }

    const inputControlsEl = inputGroupEl.createDiv({ cls: 'opencodian-style-input-controls' });
    this.addNumericStyleControl(inputControlsEl, {
      group: 'input',
      name: t('settings.style.input.radius.name'),
      desc: t('settings.style.input.radius.desc'),
      min: 8,
      max: 24,
      step: 1,
      unit: 'px',
      value: () => this.plugin.settings.chatAppearance.input.radius,
      resetValue: () => this.plugin.getChatAppearanceBaseline().input.radius,
      setValue: (appearance, value) => {
        appearance.input.radius = value;
      },
    });

    if (isPresetInputPanelTheme) {
      this.addNumericStyleControl(inputControlsEl, {
        group: 'input',
        name: t('settings.style.input.backgroundOpacity.name'),
        desc: t('settings.style.input.backgroundOpacity.desc'),
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        value: () => this.plugin.settings.chatAppearance.input.backgroundOpacity,
        resetValue: () => this.plugin.getChatAppearanceBaseline().input.backgroundOpacity,
        setValue: (appearance, value) => {
          appearance.input.backgroundOpacity = value;
        },
      });
      this.addNumericStyleControl(inputControlsEl, {
        group: 'input',
        name: t('settings.style.input.blur.name'),
        desc: t('settings.style.input.blur.desc'),
        min: 0,
        max: 24,
        step: 1,
        unit: 'px',
        value: () => this.plugin.settings.chatAppearance.input.blur,
        resetValue: () => this.plugin.getChatAppearanceBaseline().input.blur,
        setValue: (appearance, value) => {
          appearance.input.blur = value;
        },
      });
      this.addNumericStyleControl(inputControlsEl, {
        group: 'input',
        name: t('settings.style.input.shadowBlur.name'),
        desc: t('settings.style.input.shadowBlur.desc'),
        min: 0,
        max: 36,
        step: 1,
        unit: 'px',
        value: () => this.plugin.settings.chatAppearance.input.shadowBlur,
        resetValue: () => this.plugin.getChatAppearanceBaseline().input.shadowBlur,
        setValue: (appearance, value) => {
          appearance.input.shadowBlur = value;
        },
      });
      this.createStyleResetSetting(inputControlsEl, 'input');
      return;
    }

    if (themeFamily === 'liquid-glass') {
      this.addLiquidGlassInputControls(inputControlsEl);
      return;
    }

    inputControlsEl.createDiv({
      cls: 'opencodian-style-input-lock-note',
      text: t('settings.style.input.glassRefractionNotice'),
    });
    this.addGlassRefractionInputControls(inputControlsEl);
  }

  private addLiquidGlassInputControls(containerEl: HTMLElement): void {
    const adapterId = this.getLiquidGlassAdapterId(this.plugin.settings.inputPanelTheme);
    if (!adapterId) {
      return;
    }

    const adapter = getAllGlassAdapters().find((item) => item.id === adapterId);
    if (!adapter) {
      return;
    }

    const adapterSettings = this.plugin.settings.inputPanelLiquidGlass[adapterId];
    let activeSectionLabelKey: TranslationKey | null = null;
    for (const paramDef of adapter.paramDefs) {
      if (paramDef.sectionLabelKey && paramDef.sectionLabelKey !== activeSectionLabelKey) {
        activeSectionLabelKey = paramDef.sectionLabelKey as TranslationKey;
        containerEl.createEl('h5', {
          cls: 'opencodian-style-subgroup-title',
          text: t(activeSectionLabelKey),
        });
      }

      const label = t(paramDef.labelKey as TranslationKey);
      const desc = paramDef.descKey ? t(paramDef.descKey as TranslationKey) : '';
      const helpButton = this.getLiquidGlassSettingHelpButtonConfig(adapterId, paramDef.key, label);

      if (paramDef.type === 'toggle') {
        const setting = new Setting(containerEl)
          .setName(label)
          .setDesc(desc)
          .setClass('opencodian-style-setting');
        setting.addToggle((toggle) => {
          toggle
            .setValue(Boolean(adapterSettings[paramDef.key] ?? paramDef.defaultValue))
            .onChange((value) => {
              this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value);
              void this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            });
        });
        if (helpButton) {
          this.addSettingHelpButton(setting, helpButton);
        }
        continue;
      }

      if (paramDef.type === 'select') {
        const setting = new Setting(containerEl)
          .setName(label)
          .setDesc(desc);
        setting.addDropdown((dropdown) => {
          for (const option of paramDef.options ?? []) {
            dropdown.addOption(
              option.value,
              option.labelKey ? t(option.labelKey as TranslationKey) : (option.label ?? option.value),
            );
          }

          dropdown
            .setValue(String(adapterSettings[paramDef.key] ?? paramDef.defaultValue))
            .onChange((value) => {
              this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value);
              void this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            });
        });
        if (helpButton) {
          this.addSettingHelpButton(setting, helpButton);
        }
        continue;
      }

      if (paramDef.type === 'text') {
        const setting = new Setting(containerEl)
          .setName(label)
          .setDesc(desc);
        setting.addText((text) => {
          text
            .setValue(String(adapterSettings[paramDef.key] ?? paramDef.defaultValue ?? ''))
            .onChange((value) => {
              this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value.trim());
              void this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            });
        });
        if (helpButton) {
          this.addSettingHelpButton(setting, helpButton);
        }
        continue;
      }

      this.addNumericControl(containerEl, {
        name: label,
        desc,
        min: paramDef.min ?? 0,
        max: paramDef.max ?? 100,
        step: paramDef.step ?? 1,
        unit: paramDef.unit ?? '',
        value: () => Number(this.plugin.settings.inputPanelLiquidGlass[adapterId][paramDef.key] ?? paramDef.defaultValue),
        resetValue: () => Number(paramDef.defaultValue),
        commitValue: (value) => {
          this.updateLiquidGlassAdapterSetting(adapterId, paramDef.key, value);
          void this.plugin.saveSettings({
            syncService: false,
            reloadModels: false,
            syncConfig: false,
            applyUi: true,
          });
        },
        helpButton,
      });
    }
  }

  private getLiquidGlassSettingHelpButtonConfig(
    adapterId: LiquidGlassAdapterId,
    paramKey: string,
    title: string,
  ): SettingHelpButtonConfig | undefined {
    const helpText = this.getLiquidGlassSettingHelpText(adapterId, paramKey);
    if (!helpText) {
      return undefined;
    }

    return {
      tooltip: t('settings.style.input.help.buttonTooltip'),
      onClick: () => {
        new LiquidGlassSettingHelpModal(this.app, title, helpText).open();
      },
    };
  }

  private getLiquidGlassSettingHelpText(
    adapterId: LiquidGlassAdapterId,
    paramKey: string,
  ): string | null {
    if (adapterId !== 'shuding') {
      return null;
    }

    const helpKey = `settings.style.input.liquidGlass.shuding.help.${paramKey}` as TranslationKey;
    const helpText = t(helpKey);

    return helpText === helpKey ? null : helpText;
  }

  private updateLiquidGlassAdapterSetting(
    adapterId: LiquidGlassAdapterId,
    key: string,
    value: number | string | boolean,
  ): void {
    this.plugin.settings.inputPanelLiquidGlass = {
      ...this.plugin.settings.inputPanelLiquidGlass,
      [adapterId]: {
        ...this.plugin.settings.inputPanelLiquidGlass[adapterId],
        [key]: value,
      },
    };
  }

  private async applyInputPanelThemeChange(themeId: InputPanelThemeId): Promise<void> {
    if (this.plugin.settings.inputPanelTheme === themeId) {
      return;
    }

    this.plugin.settings.inputPanelTheme = themeId;
    await this.plugin.saveSettings({
      syncService: false,
      reloadModels: false,
      syncConfig: false,
      applyUi: true,
    });
    this.renderInputStyleGroup();
  }

  private setStyleControlsDisabled(containerEl: HTMLElement, disabled: boolean): void {
    containerEl.toggleClass('is-disabled', disabled);
    const controls = containerEl.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, button, select, textarea',
    );

    for (const control of controls) {
      control.disabled = disabled;
    }
  }

  private scheduleSettingsPanelPostRenderSetup(
    pendingOpenScrollTop: number | null,
    pendingOpenSectionTitle: string | null,
  ): void {
    this.settingsPanelPostRenderFrameId = window.requestAnimationFrame(() => {
      this.settingsPanelPostRenderFrameId = null;
      const scrollContainer = this.getSettingsScrollContainer();
      this.bindSettingsPanelScrollPersistence(scrollContainer);

      if (pendingOpenSectionTitle) {
        this.scrollToSectionByTitle(pendingOpenSectionTitle);
        this.finishPendingOpenVisibility();
        return;
      }

      const targetScrollTop = pendingOpenScrollTop ?? this.plugin.settings.settingsPanelScrollTop;
      if (Math.abs(targetScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        if (Math.abs(scrollContainer.scrollTop) > SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
          scrollContainer.scrollTop = 0;
        }
        this.plugin.settings.settingsPanelScrollTop = 0;
        this.lastObservedSettingsScrollTop = 0;
        if (pendingOpenScrollTop !== null) {
          this.finishPendingOpenVisibility();
        }
        return;
      }

      this.restoreSettingsPanelScrollPosition(
        targetScrollTop,
        scrollContainer,
        pendingOpenScrollTop !== null ? () => this.finishPendingOpenVisibility() : undefined,
      );
    });
  }

  private bindSettingsPanelScrollPersistence(scrollContainer?: HTMLElement): void {
    if (this.settingsScrollHandler) {
      this.settingsScrollContainerEl?.removeEventListener('scroll', this.settingsScrollHandler);
    }

    const resolvedScrollContainer = scrollContainer ?? this.getSettingsScrollContainer();
    this.settingsScrollContainerEl = resolvedScrollContainer;

    this.settingsScrollHandler = () => {
      if (this.settingsScrollPersistenceSuspended) {
        return;
      }

      if (!this.containerEl.isConnected || !resolvedScrollContainer.contains(this.containerEl)) {
        return;
      }

      this.plugin.settings.settingsPanelScrollTop = resolvedScrollContainer.scrollTop;
      this.lastObservedSettingsScrollTop = resolvedScrollContainer.scrollTop;
      this.plugin.scheduleSettingsUiStateSave();
    };

    resolvedScrollContainer.addEventListener('scroll', this.settingsScrollHandler, { passive: true });
  }

  private restoreSettingsPanelScrollPosition(
    scrollTop = this.plugin.settings.settingsPanelScrollTop,
    scrollContainer?: HTMLElement,
    onSettled?: () => void,
  ): void {
    const resolvedScrollContainer = scrollContainer ?? this.settingsScrollContainerEl ?? this.getSettingsScrollContainer();
    this.settingsScrollContainerEl = resolvedScrollContainer;
    this.clearSettingsPanelRestoreWork();
    this.settingsScrollPersistenceSuspended = true;
    this.settingsPanelRestoreScrollContainerEl = resolvedScrollContainer;

    const normalizedScrollTop = Math.max(0, scrollTop);
    const restoreStartedAt = Date.now();
    const minimumSettleAt = restoreStartedAt + SETTINGS_SCROLL_RESTORE_MIN_STABLE_MS;
    let restoreAttempts = 0;
    let restoreSettled = false;
    let restoreQueued = false;
    let deferredRestoreTrackingStarted = false;

    const finishRestore = (reason: string, restoredScrollTop: number): void => {
      if (restoreSettled) {
        return;
      }

      restoreSettled = true;
      this.plugin.settings.settingsPanelScrollTop = restoredScrollTop;
      this.lastObservedSettingsScrollTop = restoredScrollTop;
      this.clearSettingsPanelRestoreWork();
      logger.debug('Settings scroll restored', {
        reason,
        attempts: restoreAttempts,
        elapsedMs: Date.now() - restoreStartedAt,
        targetScrollTop: normalizedScrollTop,
        restoredScrollTop,
      });
      onSettled?.();
    };

    if (Math.abs(normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
      if (Math.abs(resolvedScrollContainer.scrollTop) > SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        resolvedScrollContainer.scrollTop = 0;
      }
      finishRestore('already-at-top', resolvedScrollContainer.scrollTop);
      return;
    }

    const scheduleRestoreSettle = (reason: string): void => {
      if (restoreSettled) {
        return;
      }

      if (this.settingsPanelRestoreSettleTimeoutId !== null) {
        window.clearTimeout(this.settingsPanelRestoreSettleTimeoutId);
      }

      const settleDelay = Math.max(
        SETTINGS_SCROLL_RESTORE_IDLE_SETTLE_MS,
        minimumSettleAt - Date.now(),
        0,
      );
      this.settingsPanelRestoreSettleTimeoutId = window.setTimeout(() => {
        this.settingsPanelRestoreSettleTimeoutId = null;
        finishRestore(reason, resolvedScrollContainer.scrollTop);
      }, settleDelay);
    };

    const startDeferredRestoreTracking = (): void => {
      if (restoreSettled || deferredRestoreTrackingStarted) {
        return;
      }

      deferredRestoreTrackingStarted = true;

      for (const delay of SETTINGS_SCROLL_RESTORE_RETRY_DELAYS) {
        const timeoutId = window.setTimeout(() => {
          this.settingsPanelRestoreTimeoutIds = this.settingsPanelRestoreTimeoutIds.filter(
            (id) => id !== timeoutId,
          );
          applyRestore(`timeout-${delay}`);
        }, delay);
        this.settingsPanelRestoreTimeoutIds.push(timeoutId);
      }

      if (typeof MutationObserver !== 'undefined') {
        this.settingsPanelRestoreObserver = new MutationObserver(() => {
          queueRestore('mutation');
        });
        this.settingsPanelRestoreObserver.observe(this.containerEl, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        const observerTimeoutId = window.setTimeout(() => {
          this.settingsPanelRestoreTimeoutIds = this.settingsPanelRestoreTimeoutIds.filter(
            (id) => id !== observerTimeoutId,
          );
          if (restoreSettled) {
            return;
          }
          this.settingsPanelRestoreObserver?.disconnect();
          this.settingsPanelRestoreObserver = null;
          applyRestore('observer-timeout');
          scheduleRestoreSettle('observer-timeout');
        }, SETTINGS_SCROLL_RESTORE_OBSERVER_WINDOW_MS);
        this.settingsPanelRestoreTimeoutIds.push(observerTimeoutId);
      }
    };

    const applyRestore = (reason: string): void => {
      if (restoreSettled) {
        return;
      }

      if (!resolvedScrollContainer.isConnected) {
        finishRestore('disconnected', this.lastObservedSettingsScrollTop || normalizedScrollTop);
        return;
      }

      const currentScrollTop = resolvedScrollContainer.scrollTop;
      const alreadyAtTarget =
        Math.abs(currentScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX;
      if (alreadyAtTarget) {
        if (!reason.startsWith('timeout-')) {
          scheduleRestoreSettle(reason);
        }
        return;
      }

      restoreAttempts += 1;
      resolvedScrollContainer.scrollTop = normalizedScrollTop;
      const restoredScrollTop = resolvedScrollContainer.scrollTop;
      if (Math.abs(restoredScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        scheduleRestoreSettle(reason);
        return;
      }

      startDeferredRestoreTracking();
    };

    const queueRestore = (reason: string): void => {
      if (restoreSettled || restoreQueued || !resolvedScrollContainer.isConnected) {
        return;
      }

      restoreQueued = true;
      const frameId = window.requestAnimationFrame(() => {
        restoreQueued = false;
        if (this.settingsPanelRestoreFrameId === frameId) {
          this.settingsPanelRestoreFrameId = null;
        }
        applyRestore(reason);
      });
      this.settingsPanelRestoreFrameId = frameId;
    };

    this.settingsPanelRestoreScrollListener = () => {
      if (restoreSettled) {
        return;
      }

      const currentScrollTop = resolvedScrollContainer.scrollTop;
      if (Math.abs(currentScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        scheduleRestoreSettle('scroll');
        return;
      }

      queueRestore('scroll');
    };
    resolvedScrollContainer.addEventListener('scroll', this.settingsPanelRestoreScrollListener, { passive: true });

    this.settingsPanelRestoreFrameId = window.requestAnimationFrame(() => {
      this.settingsPanelRestoreFrameId = null;
      applyRestore('animation-frame');
    });
  }

  private captureSettingsPanelScrollPosition(): void {
    const scrollContainer = this.settingsScrollContainerEl ?? this.getSettingsScrollContainer();
    const nextScrollTop =
      scrollContainer.isConnected
        ? scrollContainer.scrollTop
        : this.lastObservedSettingsScrollTop;

    this.plugin.settings.settingsPanelScrollTop = nextScrollTop;
    this.plugin.scheduleSettingsUiStateSave();
  }

  private finishPendingOpenVisibility(): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.pendingOpenScrollTop = null;
        this.pendingOpenSectionTitle = null;
        this.containerEl.style.removeProperty('visibility');
      });
    });
  }

  private clearInitialQuickNavFocus(): void {
    window.requestAnimationFrame(() => {
      const activeEl = document.activeElement;
      if (!(activeEl instanceof HTMLElement)) {
        return;
      }

      if (!activeEl.hasClass('opencodian-settings-quick-nav-btn')) {
        return;
      }

      activeEl.blur();
    });
  }

  private getSettingsScrollContainer(): HTMLElement {
    if (
      this.settingsScrollContainerEl
      && this.settingsScrollContainerEl.isConnected
      && this.settingsScrollContainerEl.contains(this.containerEl)
    ) {
      return this.settingsScrollContainerEl;
    }

    const containerEl = this.containerEl;

    const matchedContainer = containerEl.closest<HTMLElement>(SETTINGS_SCROLL_CONTAINER_SELECTOR);
    if (matchedContainer) {
      this.settingsScrollContainerEl = matchedContainer;
      return matchedContainer;
    }

    let currentEl: HTMLElement | null = containerEl.parentElement;
    while (currentEl) {
      if (this.looksLikeSettingsScrollContainer(currentEl)) {
        this.settingsScrollContainerEl = currentEl;
        return currentEl;
      }
      currentEl = currentEl.parentElement;
    }

    this.settingsScrollContainerEl = containerEl;
    return containerEl;
  }

  private looksLikeSettingsScrollContainer(element: HTMLElement): boolean {
    if (
      SETTINGS_SCROLL_CONTAINER_SELECTORS.some((selector) => element.matches(selector))
    ) {
      return true;
    }

    const classNames = Array.from(element.classList);
    return classNames.some((className) =>
      className.includes('vertical-tab-content')
      || className.includes('modal-content'),
    );
  }

  private clearSettingsPanelRestoreWork(): void {
    if (this.settingsPanelRestoreFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelRestoreFrameId);
      this.settingsPanelRestoreFrameId = null;
    }

    for (const timeoutId of this.settingsPanelRestoreTimeoutIds) {
      window.clearTimeout(timeoutId);
    }
    this.settingsPanelRestoreTimeoutIds = [];

    if (this.settingsPanelRestoreSettleTimeoutId !== null) {
      window.clearTimeout(this.settingsPanelRestoreSettleTimeoutId);
      this.settingsPanelRestoreSettleTimeoutId = null;
    }

    this.settingsPanelRestoreObserver?.disconnect();
    this.settingsPanelRestoreObserver = null;

    if (this.settingsPanelRestoreScrollListener && this.settingsPanelRestoreScrollContainerEl) {
      this.settingsPanelRestoreScrollContainerEl.removeEventListener('scroll', this.settingsPanelRestoreScrollListener);
    }
    this.settingsPanelRestoreScrollListener = undefined;
    this.settingsPanelRestoreScrollContainerEl = null;
    this.settingsScrollPersistenceSuspended = false;
  }

  /** Debug settings section */
  private addDebugSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.debug.title'));
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

  private async getCurrentProviderIdsForIconCache(): Promise<string[]> {
    if (this.plugin.modelConfigService) {
      const catalogs = await this.plugin.modelConfigService.getCatalogs(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      return catalogs.effective.providers.map((provider) => provider.id);
    }

    const availableModels = await this.plugin.openCodeService.getAvailableModels();
    return availableModels.providers.map((provider) => provider.id);
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
    const headingEl = this.createSectionHeading(containerEl, t('settings.user.title'));

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

    this.renderPluginEntryGroup(
      containerEl,
      t('settings.plugins.global.configTitle'),
      snapshot.globalConfigPath,
      snapshot.globalConfigPlugins,
      t('settings.plugins.none'),
    );
    this.renderPluginEntryGroup(
      containerEl,
      t('settings.plugins.global.directoryTitle'),
      this.describePluginDirectories(snapshot.globalDirectories),
      snapshot.globalDirectoryPlugins,
      t('settings.plugins.none'),
    );
    this.renderPluginEntryGroup(
      containerEl,
      t('settings.plugins.projectConfig.title'),
      snapshot.projectConfigPath,
      snapshot.projectConfigPlugins,
      t('settings.plugins.none'),
    );
  }

  private renderPluginProjectDirectory(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    containerEl.empty();
    this.renderPluginEntryGroup(
      containerEl,
      t('settings.plugins.projectDirectory.filesTitle'),
      this.describePluginDirectories(snapshot.projectDirectories),
      snapshot.projectDirectoryPlugins,
      t('settings.plugins.projectDirectory.empty'),
    );
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

  private renderPluginEntryGroup(
    containerEl: HTMLElement,
    title: string,
    pathLabel: string,
    entries: PluginEntry[],
    emptyText: string,
  ): void {
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

  private createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
    const headingEl = containerEl.createEl('h3', {
      text: title,
      cls: 'opencodian-settings-section-heading',
    });
    headingEl.dataset.sectionTitle = title;
    return headingEl;
  }

  private buildQuickNav(
    quickNavEl: HTMLElement,
    sections: Array<{ headingEl: HTMLHeadingElement; tooltip: string }>
  ): void {
    quickNavEl.empty();
    quickNavEl.createDiv({
      cls: 'opencodian-settings-quick-nav-label',
      text: t('settings.quickNav.title'),
    });

    const chipsEl = quickNavEl.createDiv({ cls: 'opencodian-settings-quick-nav-chips' });

    for (const [index, { headingEl: sectionEl, tooltip }] of sections.entries()) {
      const title = sectionEl.dataset.sectionTitle ?? sectionEl.textContent ?? '';
      const buttonEl = chipsEl.createEl('button', {
        cls: 'opencodian-settings-quick-nav-btn',
        text: title,
      });
      buttonEl.type = 'button';
      buttonEl.dataset.tooltip = tooltip;
      if (sections.length > 1) {
        if (index <= 1) {
          buttonEl.dataset.tooltipAlign = 'left';
        } else if (index >= sections.length - 2) {
          buttonEl.dataset.tooltipAlign = 'right';
        }
      }
      buttonEl.addEventListener('click', () => {
        sectionEl.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }

  private async applyProviderIcon(targetEl: HTMLElement, providerId: string, label: string): Promise<void> {
    const iconUrl = await ProviderIconService.resolveIconUrl(
      this.app,
      providerId,
      this.plugin.settings.providerIconLibrary,
    );
    if (!targetEl.isConnected) {
      return;
    }

    targetEl.empty();
    if (iconUrl) {
      const imgEl = document.createElement('img');
      imgEl.src = iconUrl;
      imgEl.alt = label;
      imgEl.title = label;
      targetEl.appendChild(imgEl);
      return;
    }

    setIcon(targetEl, 'bot');
  }

  private describeModelAvailabilitySummary(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    disabledCount: number,
    primaryDisabledReason: 'project' | 'server' | null,
    mode: 'local' | 'server' | 'effective' | 'disabled',
  ): string {
    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return t('settings.model.availability.summary.serverDisabled', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    if (!providerEnabled) {
      if (primaryDisabledReason === 'project') {
        return t('settings.model.availability.summary.projectDisabled', {
          id: provider.id,
          count: String(provider.models.length),
        });
      }

      if (primaryDisabledReason === 'server') {
        return t('settings.model.availability.summary.serverDisabled', {
          id: provider.id,
          count: String(provider.models.length),
        });
      }

      return t('settings.model.availability.summary.providerDisabled', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    if (disabledCount > 0) {
      return t('settings.model.availability.summary.partial', {
        id: provider.id,
        count: String(provider.models.length),
        disabled: String(disabledCount),
      });
    }

    if (this.isProviderDisabledByScope(provider, 'global')) {
      return t('settings.model.availability.summary.serverDisabledOverridden', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    return t('settings.model.availability.summary.available', {
      id: provider.id,
      count: String(provider.models.length),
    });
  }

  private getProviderPrimaryDisabledReason(
    provider: ModelCatalogProvider,
    localModelConfig: OpencodeModelConfigSubset | null,
    providerEnabled: boolean,
  ): 'project' | 'server' | null {
    if (providerEnabled) {
      return null;
    }

    if (this.isProviderProjectDisabled(localModelConfig, provider.id)) {
      return 'project';
    }

    if (this.isProviderDisabledByScope(provider, 'global')) {
      return 'server';
    }

    return null;
  }

  private getProviderAvailabilityStatusClass(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    disabledCount: number,
    mode: 'local' | 'server' | 'effective' | 'disabled',
  ): 'is-disabled' | 'is-partial' | 'is-available' {
    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return 'is-disabled';
    }

    if (!providerEnabled) {
      return 'is-disabled';
    }

    if (disabledCount > 0) {
      return 'is-partial';
    }

    return 'is-available';
  }

  private getProviderAvailabilityStatusLabel(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    disabledCount: number,
    primaryDisabledReason: 'project' | 'server' | null,
    mode: 'local' | 'server' | 'effective' | 'disabled',
  ): string {
    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return t('settings.model.availability.status.serverDisabled');
    }

    if (!providerEnabled) {
      if (primaryDisabledReason === 'project') {
        return t('settings.model.availability.status.projectDisabled');
      }

      if (primaryDisabledReason === 'server') {
        return t('settings.model.availability.status.serverDisabled');
      }

      return t('settings.model.availability.status.providerDisabled');
    }

    return disabledCount > 0
      ? t('settings.model.availability.status.partial')
      : t('settings.model.availability.status.available');
  }

  private getProviderServerConstraintBadge(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    primaryDisabledReason: 'project' | 'server' | null,
    mode: 'local' | 'server' | 'effective' | 'disabled',
  ): { text: string; className: 'is-disabled' | 'is-partial' } | null {
    if (!this.isProviderDisabledByScope(provider, 'global')) {
      return null;
    }

    if (mode === 'server' || primaryDisabledReason === 'server') {
      return null;
    }

    return {
      text: providerEnabled
        ? t('settings.model.availability.status.serverDisabledInherited')
        : t('settings.model.availability.status.serverDisabled'),
      className: providerEnabled ? 'is-partial' : 'is-disabled',
    };
  }

  private getProviderAvailabilityProbeBadge(
    state: ProviderAvailabilityCheckState,
  ): { text: string; className: 'is-available' | 'is-partial' | 'is-disabled' } | null {
    switch (state.status) {
      case 'loading':
        return {
          text: t('settings.model.availability.check.loading'),
          className: 'is-partial',
        };
      case 'error':
        return {
          text: t('settings.model.availability.check.failedBadge'),
          className: 'is-disabled',
        };
      case 'ready':
        if (!state.probe) {
          return null;
        }

        switch (state.probe.status) {
          case 'available':
            return {
              text: t('settings.model.availability.check.availableBadge'),
              className: 'is-available',
            };
          case 'send_failed':
            return {
              text: t('settings.model.availability.check.failedBadge'),
              className: 'is-disabled',
            };
          case 'catalog_only':
            return {
              text: t('settings.model.availability.check.catalogOnlyBadge'),
              className: 'is-partial',
            };
          case 'project_disabled':
            return {
              text: t('settings.model.availability.check.projectDisabledBadge'),
              className: 'is-disabled',
            };
          case 'server_disabled':
            return {
              text: t('settings.model.availability.check.serverDisabledBadge'),
              className: 'is-disabled',
            };
          case 'missing':
          default:
            return {
              text: t('settings.model.availability.check.missingBadge'),
              className: 'is-disabled',
            };
        }
      case 'idle':
      default:
        return null;
    }
  }

  private describeProviderAvailabilityProbe(
    state: ProviderAvailabilityCheckState,
  ): { text: string; className: string } | null {
    if (state.status === 'loading') {
      return {
        text: t('settings.model.availability.check.loadingDetail'),
        className: 'is-loading',
      };
    }

    if (state.status === 'error') {
      return {
        text: t('settings.model.availability.check.failedDetail', {
          message: state.error ?? t('settings.model.availability.check.unknownError'),
        }),
        className: 'is-error',
      };
    }

    if (state.status !== 'ready' || !state.probe) {
      return null;
    }

    const runtimeCount = String(state.probe.runtimeModelCount);
    const catalogCount = String(state.probe.catalogModelCount);
    const testedModelId = state.probe.testedModelId ?? t('settings.model.availability.check.unknownModel');
    switch (state.probe.status) {
      case 'available':
        return {
          text: state.probe.overridesServerDisabled
            ? t('settings.model.availability.check.availableOverrideDetail', { model: testedModelId })
            : t('settings.model.availability.check.availableDetail', { model: testedModelId }),
          className: 'is-success',
        };
      case 'send_failed':
        return {
          text: t('settings.model.availability.check.sendFailedDetail', {
            model: testedModelId,
            message: state.probe.sendTestError ?? t('settings.model.availability.check.unknownError'),
          }),
          className: 'is-error',
        };
      case 'project_disabled':
        return {
          text: state.probe.runtimeModelCount > 0
            ? t('settings.model.availability.check.projectDisabledWithRuntimeDetail', { count: runtimeCount })
            : t('settings.model.availability.check.projectDisabledDetail'),
          className: 'is-error',
        };
      case 'server_disabled':
        return {
          text: t('settings.model.availability.check.serverDisabledDetail'),
          className: 'is-error',
        };
      case 'catalog_only':
        return {
          text: state.probe.serverDisabled && state.probe.overridesServerDisabled
            ? t('settings.model.availability.check.catalogOnlyOverrideDetail', { count: catalogCount })
            : t('settings.model.availability.check.catalogOnlyDetail', { count: catalogCount }),
          className: 'is-warning',
        };
      case 'missing':
      default:
        return {
          text: t('settings.model.availability.check.missingDetail'),
          className: 'is-warning',
        };
    }
  }

  private renderModelCatalogSummaryCards(
    containerEl: HTMLElement,
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
    onSelect?: () => void,
  ): void {
    containerEl.empty();

    const cards: Array<{
      mode: 'local' | 'server' | 'effective' | 'disabled';
      title: string;
      catalog: ModelCatalog;
    }> = [
      {
        mode: 'local',
        title: t('settings.model.catalog.localTitle'),
        catalog: this.getDisplayCatalogForMode('local', catalogs, localModelConfig),
      },
      {
        mode: 'server',
        title: t('settings.model.catalog.serverTitle'),
        catalog: this.getDisplayCatalogForMode('server', catalogs, localModelConfig),
      },
      {
        mode: 'effective',
        title: t('settings.model.catalog.effectiveTitle'),
        catalog: this.getDisplayCatalogForMode('effective', catalogs, localModelConfig),
      },
      {
        mode: 'disabled',
        title: t('settings.model.catalog.disabledTitle'),
        catalog: this.getDisplayCatalogForMode('disabled', catalogs, localModelConfig),
      },
    ];

    for (const card of cards) {
      const cardEl = containerEl.createEl('button', { cls: 'opencodian-model-catalog-summary-card' });
      cardEl.type = 'button';
      if (card.mode === this.activeModelCatalogTab) {
        cardEl.addClass('is-active');
      }

      cardEl.createDiv({
        cls: 'opencodian-model-catalog-summary-card-title',
        text: card.title,
      });
      cardEl.createDiv({
        cls: 'opencodian-model-catalog-summary-card-meta',
        text: t('settings.model.catalog.summary', {
          providers: String(card.catalog.providers.length),
          models: String(this.getCatalogModelCount(card.catalog)),
        }),
      });

      cardEl.addEventListener('click', () => {
        if (this.activeModelCatalogTab === card.mode) {
          return;
        }
        this.activeModelCatalogTab = card.mode;
        onSelect?.();
      });
    }
  }

  private renderModelCatalogPanel(
    containerEl: HTMLElement,
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
  ): void {
    containerEl.empty();
    const sections: Array<{
      mode: 'local' | 'server' | 'effective' | 'disabled';
      title: string;
      description: string;
      catalog: ModelCatalog;
    }> = [
      {
        mode: 'local',
        title: t('settings.model.catalog.localTitle'),
        description: t('settings.model.catalog.localDesc'),
        catalog: this.getDisplayCatalogForMode('local', catalogs, localModelConfig),
      },
      {
        mode: 'server',
        title: t('settings.model.catalog.serverTitle'),
        description: t('settings.model.catalog.serverDesc'),
        catalog: this.getDisplayCatalogForMode('server', catalogs, localModelConfig),
      },
      {
        mode: 'effective',
        title: t('settings.model.catalog.effectiveTitle'),
        description: t('settings.model.catalog.effectiveDesc'),
        catalog: this.getDisplayCatalogForMode('effective', catalogs, localModelConfig),
      },
      {
        mode: 'disabled',
        title: t('settings.model.catalog.disabledTitle'),
        description: t('settings.model.catalog.disabledDesc'),
        catalog: this.getDisplayCatalogForMode('disabled', catalogs, localModelConfig),
      },
    ];

    const activeSection = sections.find((section) => section.mode === this.activeModelCatalogTab) ?? sections[0];
    const panelEl = containerEl.createDiv({ cls: 'opencodian-model-catalog-panel' });
    const bodyEl = panelEl.createDiv({ cls: 'opencodian-model-catalog-body' });

    if (activeSection.catalog.providers.length === 0) {
      bodyEl.createDiv({
        cls: 'opencodian-model-catalog-empty',
        text: t('settings.model.catalog.empty'),
      });
      return;
    }

    for (const provider of activeSection.catalog.providers) {
      const providerEl = bodyEl.createDiv({ cls: 'opencodian-model-catalog-provider' });
      const providerHeaderEl = providerEl.createDiv({ cls: 'opencodian-model-catalog-provider-header' });
      providerHeaderEl.createDiv({
        cls: 'opencodian-model-catalog-provider-name',
        text: provider.name,
      });
      providerHeaderEl.createDiv({
        cls: 'opencodian-model-catalog-provider-count',
        text: String(provider.models.length),
      });
      providerEl.createDiv({
        cls: 'opencodian-model-catalog-provider-models',
        text: this.describeProviderModels(
          provider,
          this.getCatalogPlaceholderReason(provider, activeSection.mode, localModelConfig),
        ),
      });
    }
  }

  private async runProviderAvailabilityCheck(
    providerId: string,
    modelConfigService: NonNullable<OpenCodianPlugin['modelConfigService']>,
    rerender: () => void,
  ): Promise<void> {
    const existing = this.providerAvailabilityChecks.get(providerId);
    if (existing?.status === 'loading') {
      return;
    }

    this.providerAvailabilityChecks.set(providerId, { status: 'loading' });
    rerender();

    try {
      const probe = await modelConfigService.testProviderAvailability(providerId);
      this.providerAvailabilityChecks.set(providerId, {
        status: 'ready',
        probe,
      });
    } catch (error) {
      logger.error('Failed to test provider availability:', error);
      this.providerAvailabilityChecks.set(providerId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    rerender();
  }

  private getDisplayCatalogForMode(
    mode: 'local' | 'server' | 'effective' | 'disabled',
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
  ): ModelCatalog {
    switch (mode) {
      case 'local':
        return catalogs.local;
      case 'server':
        return this.buildServerDisplayCatalog(catalogs.server);
      case 'disabled':
        return this.buildDisabledCatalog(catalogs, localModelConfig);
      case 'effective':
      default:
        return catalogs.effective;
    }
  }

  private getProviderStatusCatalogForMode(
    mode: 'local' | 'server' | 'effective' | 'disabled',
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
  ): ModelCatalog {
    switch (mode) {
      case 'local':
        return this.decorateCatalogWithCurrentDisabledScopes(catalogs.local, catalogs, localModelConfig);
      case 'server':
        return this.decorateCatalogWithCurrentDisabledScopes(catalogs.server, catalogs, localModelConfig);
      case 'disabled':
        return this.withConfiguredDisabledProviderPlaceholders(
          this.decorateCatalogWithCurrentDisabledScopes(
            mergeCatalogs(catalogs.server, catalogs.local),
            catalogs,
            localModelConfig,
          ),
          catalogs,
          localModelConfig,
          'merge',
        );
      case 'effective':
      default:
        return this.decorateCatalogWithCurrentDisabledScopes(catalogs.baseEffective, catalogs, localModelConfig);
    }
  }

  private buildDisabledCatalog(
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
  ): ModelCatalog {
    const baseCatalog = this.withConfiguredDisabledProviderPlaceholders(
      this.decorateCatalogWithCurrentDisabledScopes(
        mergeCatalogs(catalogs.server, catalogs.local),
        catalogs,
        localModelConfig,
      ),
      catalogs,
      localModelConfig,
      'merge',
    );
    const disabledModelRefs = new Set(this.plugin.settings.disabledModelRefs);
    const providers: ModelCatalogProvider[] = [];

    for (const provider of baseCatalog.providers) {
      const providerProjectDisabled = this.isProviderProjectDisabled(localModelConfig, provider.id);
      const providerEnabled = this.isProviderCurrentlyEnabled(provider.id, catalogs);
      if (!providerEnabled) {
        providers.push({
          ...provider,
          disabledScopes: this.mergeDisabledScopes(
            provider.disabledScopes,
            providerProjectDisabled ? ['project'] : undefined,
          ),
          models: provider.models.map((model) => ({ ...model })),
        });
        continue;
      }

      const disabledModels = provider.models
        .filter((model) => disabledModelRefs.has(formatModelReference(provider.id, model.id)))
        .map((model) => ({ ...model }));
      if (disabledModels.length === 0) {
        continue;
      }

      providers.push({
        ...provider,
        models: disabledModels,
      });
    }

    return {
      providers: providers.sort((left, right) => left.name.localeCompare(right.name)),
      defaults: {},
    };
  }

  private buildServerDisplayCatalog(catalog: ModelCatalog): ModelCatalog {
    const providers = catalog.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    }));

    return {
      providers,
      defaults: Object.fromEntries(
        Object.entries(catalog.defaults).filter(([providerId]) => providers.some((provider) => provider.id === providerId)),
      ),
    };
  }

  private decorateCatalogWithCurrentDisabledScopes(
    catalog: ModelCatalog,
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
  ): ModelCatalog {
    const providers = catalog.providers.map((provider) => {
      const providerEnabled = this.isProviderCurrentlyEnabled(provider.id, catalogs);
      const projectDisabled = this.isProviderProjectDisabled(localModelConfig, provider.id);
      const disabledScopes = this.mergeDisabledScopes(
        provider.disabledScopes,
        !providerEnabled
          ? [
            ...(projectDisabled ? ['project' as const] : []),
            ...(!projectDisabled ? ['global' as const] : []),
          ]
          : undefined,
      );

      return {
        ...provider,
        disabledScopes,
        models: provider.models.map((model) => ({
          ...model,
          disabledScopes,
        })),
      };
    });

    return {
      ...catalog,
      providers,
    };
  }

  private withConfiguredDisabledProviderPlaceholders(
    catalog: ModelCatalog,
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset | null,
    source: 'server' | 'merge',
  ): ModelCatalog {
    const existingProviderIds = new Set(catalog.providers.map((provider) => provider.id));
    const configuredProviderIds = new Set<string>([
      ...collectConfiguredProviderIds(catalogs.serverConfig),
      ...collectConfiguredProviderIds(localModelConfig ?? {}),
      ...(catalogs.effectiveProviderConfig.enabled_providers ?? []),
      ...(catalogs.effectiveProviderConfig.disabled_providers ?? []),
    ]);
    const placeholderProviders = [...configuredProviderIds]
      .filter((providerId) => !this.isProviderEnabledInEffectiveAvailability(providerId, catalogs))
      .filter((providerId) => !existingProviderIds.has(providerId))
      .map<ModelCatalogProvider>((providerId) => ({
        id: providerId,
        name: providerId,
        models: [],
        source,
        existsInLocal: false,
        existsInServer: false,
        disabledScopes: this.isProviderProjectDisabled(localModelConfig, providerId)
          ? ['project']
          : ['global'],
      }));

    if (placeholderProviders.length === 0) {
      return catalog;
    }

    return {
      ...catalog,
      providers: [...catalog.providers, ...placeholderProviders]
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  private isProviderEnabledInEffectiveAvailability(providerId: string, catalogs: ModelCatalogBundle): boolean {
    return isProviderEnabled(catalogs.effectiveProviderConfig, providerId);
  }

  private getPreferredModelCatalogTab(): 'local' | 'server' | 'effective' | 'disabled' {
    switch (this.plugin.settings.modelSourceMode) {
      case 'local':
        return 'local';
      case 'server':
        return 'server';
      default:
        return 'effective';
    }
  }

  private getCatalogModelCount(catalog: ModelCatalog): number {
    return catalog.providers.reduce((total, provider) => total + provider.models.length, 0);
  }

  private isProviderDisabledByScope(provider: ModelCatalogProvider, scope: 'global' | 'project'): boolean {
    return provider.disabledScopes?.includes(scope) ?? false;
  }

  private isProviderProjectDisabled(
    localModelConfig: OpencodeModelConfigSubset | null,
    providerId: string,
  ): boolean {
    if (!localModelConfig || !this.hasProviderAvailabilityConfig(localModelConfig)) {
      return false;
    }

    return !isProviderEnabled(localModelConfig, providerId);
  }

  private isProviderCurrentlyEnabled(providerId: string, catalogs: ModelCatalogBundle): boolean {
    return catalogs.currentEnabledProviderIds.includes(providerId);
  }

  private describeProviderModels(
    provider: ModelCatalogProvider,
    placeholderReason: 'project' | 'server' | null = null,
  ): string {
    if (provider.models.length === 0 && placeholderReason === 'project') {
      return t('settings.model.catalog.hiddenByProjectDisable');
    }

    if (provider.models.length === 0 && placeholderReason === 'server') {
      return t('settings.model.catalog.hiddenByServerDisable');
    }

    const modelNames = provider.models.map((model) => model.name);
    if (modelNames.length <= 6) {
      return modelNames.join(' · ');
    }

    const preview = modelNames.slice(0, 6).join(' · ');
    return `${preview} · +${modelNames.length - 6}`;
  }

  private addServerHelpButton(setting: Setting, topic: ServerHelpTopic): void {
    setting.addExtraButton((button) => {
      button
        .setIcon('help-circle')
        .setTooltip(t('settings.server.help.openDoc'))
        .onClick(() => {
          new ServerSettingHelpModal(this.app, topic).open();
      });
    });
  }

  private hasProviderAvailabilityConfig(
    config: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'> | null | undefined,
  ): boolean {
    return Array.isArray(config?.enabled_providers) || Array.isArray(config?.disabled_providers);
  }

  private getCatalogPlaceholderReason(
    provider: ModelCatalogProvider,
    mode: 'local' | 'server' | 'effective' | 'disabled',
    localModelConfig: OpencodeModelConfigSubset | null,
  ): 'project' | 'server' | null {
    if (provider.models.length > 0) {
      return null;
    }

    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return 'server';
    }

    if (mode === 'disabled') {
      if (this.isProviderProjectDisabled(localModelConfig, provider.id)) {
        return 'project';
      }
      if (this.isProviderDisabledByScope(provider, 'global')) {
        return 'server';
      }
    }

    return null;
  }

  private mergeDisabledScopes(
    left: Array<'global' | 'project'> | undefined,
    right: Array<'global' | 'project'> | undefined,
  ): Array<'global' | 'project'> | undefined {
    const merged = Array.from(new Set([...(left ?? []), ...(right ?? [])]));
    return merged.length > 0 ? merged : undefined;
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
