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
import type { ModelCatalog, ModelCatalogProvider } from '../../core/config/modelConfig';
import type { PluginEntry, PluginEnvironmentSnapshot } from '../../core/config/PluginManagementService';
import {
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getDefaultChatAppearanceSettings,
  isValidChatAppearanceCustomCssDeclarations,
  type ModelSourceMode,
  type PluginIsolationMode,
  type TitleMode,
} from '../../core/types';
import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { ProviderIconService } from '../../utils/icons';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import { ModelConfigModal } from './ModelConfigModal';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';
import { type ServerHelpTopic,ServerSettingHelpModal } from './ServerSettingHelpModal';

const logger = createLogger('OpenCodianSettings');

interface NumericStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  value: () => number;
  setValue: (value: number) => void;
}

type ChatAppearanceStyleGroup = 'layout' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced';

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
  private refreshServerStatusCallback?: () => Promise<void>;
  private serverStatusIntervalId: number | null = null;
  private modelRefreshFrameId: number | null = null;
  private activeModelCatalogTab: 'local' | 'server' | 'effective' = 'effective';
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
  private conversationHeadingEl: HTMLHeadingElement | null = null;

  constructor(app: App, plugin: OpenCodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Called when models are auto-loaded - refreshes the model dropdowns */
  onModelsLoaded(): void {
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
    }

    this.modelRefreshFrameId = window.requestAnimationFrame(() => {
      this.modelRefreshFrameId = null;
      this.refreshModelsCallback?.();
    });
  }

  refreshServerStatusDisplay(): void {
    void this.refreshServerStatusCallback?.();
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
    this.conversationHeadingEl = null;
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
            .setPlaceholder('4096')
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
      
      // Get internal status
      const internalStatus = this.plugin.openCodeService.getServerStatus();
      
      // Check if server is external (running but plugin has no process)
      isExternalServer = isHealthy && (internalStatus === 'stopped' || !this.plugin.openCodeService.isServerProcessRunning());
      
      const statusText = (() => {
        if (isLocalMode) {
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
      }
      statusSetting.setDesc(descText);
      
      if (actionBtn) {
        actionBtn.setButtonText(
          isLocalMode ? t('settings.server.status.start') : t('settings.server.status.test')
        );
        actionBtn.setDisabled(
          isLocalMode
            ? (isHealthy && !isExternalServer) || internalStatus === 'starting'
            : internalStatus === 'starting'
        );
      }
      
      if (stopBtn) {
        stopBtn.buttonEl.style.display = isLocalMode ? '' : 'none';
        stopBtn.setButtonText(t('settings.server.status.stop'));
        stopBtn.setDisabled(!isHealthy || isExternalServer);
      }

      if (refreshBtn) {
        refreshBtn.setButtonText(t('settings.server.status.refresh'));
      }
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
            const isExternal = isHealthy && (internalStatus === 'stopped' || !this.plugin.openCodeService.isServerProcessRunning());

            await updateStatus();

            const statusText = isLocalMode
              ? (isHealthy
                  ? (isExternal ? t('settings.server.status.localExternal') : t('settings.server.status.localManaged'))
                  : (internalStatus === 'starting' || internalStatus === 'restarting'
                      ? t('settings.server.status.starting')
                      : t('settings.server.status.stopped')))
              : (isHealthy ? t('settings.server.status.remoteConnected') : t('settings.server.status.stopped'));
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

    let providerDropdown: import('obsidian').DropdownComponent;
    let modelDropdown: import('obsidian').DropdownComponent;
    let catalogs: { local: ModelCatalog; server: ModelCatalog; effective: ModelCatalog } | null = null;
    const sourceCatalogEl = containerEl.createDiv({ cls: 'opencodian-model-catalog' });

    const loadAvailableModels = async (showNotice = false) => {
      try {
        catalogs = await modelConfigService.getCatalogs(this.plugin.settings.modelSourceMode);
        const availableProviders = catalogs.effective.providers;
        let dirty = false;

        providerDropdown.selectEl.empty();
        for (const provider of availableProviders) {
          providerDropdown.addOption(provider.id, provider.name || provider.id);
        }

        this.renderModelCatalogPanel(sourceCatalogEl, catalogs);

        if (availableProviders.find((provider) => provider.id === this.plugin.settings.defaultProvider)) {
          providerDropdown.setValue(this.plugin.settings.defaultProvider);
        } else if (availableProviders.length > 0) {
          providerDropdown.setValue(availableProviders[0].id);
          if (this.plugin.settings.defaultProvider !== availableProviders[0].id) {
            this.plugin.settings.defaultProvider = availableProviders[0].id;
            dirty = true;
          }
        } else {
          providerDropdown.addOption('', t('settings.model.noModels'));
          providerDropdown.setValue('');
          if (this.plugin.settings.defaultProvider !== '') {
            this.plugin.settings.defaultProvider = '';
            dirty = true;
          }
        }

        await updateModelDropdown();
        if (dirty) {
          await this.plugin.saveSettings();
        }

        if (showNotice) {
          new Notice(t('settings.model.refresh.success', { count: availableProviders.length }));
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
      void loadAvailableModels(false);
    };

    const updateModelDropdown = async () => {
      if (!modelDropdown) return;
      const availableProviders = catalogs?.effective.providers ?? [];
      const currentProviderId = providerDropdown.getValue();
      const provider = availableProviders.find((item) => item.id === currentProviderId);

      modelDropdown.selectEl.empty();

      if (provider && provider.models.length > 0) {
        for (const model of provider.models) {
          modelDropdown.addOption(model.id, model.name || model.id);
        }
        const currentModel = this.plugin.settings.defaultModel;
        if (provider.models.find((model) => model.id === currentModel)) {
          modelDropdown.setValue(currentModel);
        } else {
          const firstModel = provider.models[0].id;
          modelDropdown.setValue(firstModel);
          this.plugin.settings.defaultModel = firstModel;
          if (this.plugin.settings.defaultProvider !== currentProviderId) {
            this.plugin.settings.defaultProvider = currentProviderId;
          }
          await this.plugin.saveSettings();
        }
      } else {
        modelDropdown.addOption('', t('settings.model.noModels'));
        modelDropdown.setValue('');
        if (this.plugin.settings.defaultModel !== '') {
          this.plugin.settings.defaultModel = '';
          await this.plugin.saveSettings();
        }
      }
    };

    const modelSourceSetting = new Setting(containerEl)
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
            await this.plugin.saveSettings();
            new Notice(t('settings.model.source.updated'));
            window.setTimeout(() => {
              void loadAvailableModels(false);
            }, 1200);
          });
      });
    this.setSettingDescWithFormatting(modelSourceSetting, t('settings.model.source.desc'));

    new Setting(containerEl)
      .setName(t('settings.model.provider.name'))
      .setDesc(t('settings.model.provider.desc'))
      .addDropdown((dropdown) => {
        providerDropdown = dropdown;
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultProvider = value;
          await this.plugin.saveSettings();
          await updateModelDropdown();
        });
      });

    new Setting(containerEl)
      .setName(t('settings.model.model.name'))
      .setDesc(t('settings.model.model.desc'))
      .addDropdown((dropdown) => {
        modelDropdown = dropdown;
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultModel = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('settings.model.refresh.name'))
      .setDesc(t('settings.model.refresh.desc'))
      .addButton((btn) =>
        btn
          .setButtonText(t('settings.model.refresh.button'))
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText(t('settings.model.refresh.loading'));
            await loadAvailableModels(true);
            btn.setDisabled(false);
            btn.setButtonText(t('settings.model.refresh.button'));
          })
      );

    const modelConfigSetting = new Setting(containerEl)
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
    const iconCacheOverviewSetting = new Setting(containerEl)
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

    new Setting(containerEl)
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

    void refreshIconCacheOverview();

    void (async () => {
      await loadAvailableModels(false);
      await refreshIconCacheOverview();
    })();

    return headingEl;
  }

  private addConversationSettings(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(containerEl, t('settings.conversation.title'));
    this.conversationHeadingEl = headingEl;

    let titleModelDropdown: import('obsidian').DropdownComponent;
    let titleModelSetting: Setting | null = null;

    const updateTitleModelSettingVisibility = () => {
      if (!titleModelSetting) {
        return;
      }
      titleModelSetting.settingEl.style.display = this.plugin.settings.titleMode === 'ai' ? '' : 'none';
    };

    const loadTitleModels = async () => {
      const selectedValue = this.plugin.settings.aiTitleModel;
      let hasSelectedValue = !selectedValue;
      const options: Array<{ value: string; label: string }> = [];

      try {
        if (this.plugin.modelConfigService) {
          const catalogs = await this.plugin.modelConfigService.getCatalogs(this.plugin.settings.modelSourceMode);
          for (const provider of catalogs.effective.providers) {
            for (const model of provider.models) {
              const value = `${provider.id}/${model.id}`;
              options.push({
                value,
                label: `${provider.name || provider.id} / ${model.name || model.id}`,
              });
              if (value === selectedValue) {
                hasSelectedValue = true;
              }
            }
          }
        }

        titleModelDropdown.selectEl.empty();
        titleModelDropdown.addOption('', t('settings.titleGeneration.model.followCurrent'));

        for (const option of options) {
          titleModelDropdown.addOption(option.value, option.label);
        }

        if (!hasSelectedValue && selectedValue) {
          this.plugin.settings.aiTitleModel = '';
          await this.plugin.saveSettings();
        }

        titleModelDropdown.setValue(hasSelectedValue ? selectedValue : '');
      } catch (error) {
        logger.error('Failed to load AI title models:', error);
        titleModelDropdown.selectEl.empty();
        titleModelDropdown.addOption('', t('settings.titleGeneration.model.followCurrent'));
        titleModelDropdown.setValue('');
      }

      updateTitleModelSettingVisibility();
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

    titleModelSetting = new Setting(containerEl)
      .setName(t('settings.titleGeneration.model.name'))
      .setDesc(t('settings.titleGeneration.model.desc'))
      .addDropdown((dropdown) => {
        titleModelDropdown = dropdown;
        dropdown.onChange(async (value) => {
          this.plugin.settings.aiTitleModel = value;
          await this.plugin.saveSettings();
        });
      });

    updateTitleModelSettingVisibility();
    void loadTitleModels();

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
    const defaultAppearance = getDefaultChatAppearanceSettings();

    new Setting(containerEl)
      .setName(t('settings.style.resetAll.name'))
      .setDesc(t('settings.style.resetAll.desc'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.style.resetAll.button'))
          .onClick(() => {
            this.plugin.settings.chatAppearance = getDefaultChatAppearanceSettings();
            this.applyAndScheduleStyleUpdate();
            this.refreshStyleControlValues();
          });
      });

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
      defaultValue: defaultAppearance.layout.messagesPaddingTop,
      value: () => this.plugin.settings.chatAppearance.layout.messagesPaddingTop,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.layout.messagesPaddingTop = value;
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
      defaultValue: defaultAppearance.layout.messagesPaddingX,
      value: () => this.plugin.settings.chatAppearance.layout.messagesPaddingX,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.layout.messagesPaddingX = value;
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
      defaultValue: defaultAppearance.sticky.headerGap,
      value: () => this.plugin.settings.chatAppearance.sticky.headerGap,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.sticky.headerGap = value;
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
      defaultValue: defaultAppearance.sticky.maskHeight,
      value: () => this.plugin.settings.chatAppearance.sticky.maskHeight,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.sticky.maskHeight = value;
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
      defaultValue: defaultAppearance.sticky.maskBlur,
      value: () => this.plugin.settings.chatAppearance.sticky.maskBlur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.sticky.maskBlur = value;
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
      defaultValue: defaultAppearance.user.radius,
      value: () => this.plugin.settings.chatAppearance.user.radius,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.user.radius = value;
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
      defaultValue: defaultAppearance.user.tailRadius,
      value: () => this.plugin.settings.chatAppearance.user.tailRadius,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.user.tailRadius = value;
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
      defaultValue: defaultAppearance.user.blur,
      value: () => this.plugin.settings.chatAppearance.user.blur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.user.blur = value;
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
      defaultValue: defaultAppearance.user.shadowBlur,
      value: () => this.plugin.settings.chatAppearance.user.shadowBlur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.user.shadowBlur = value;
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
      defaultValue: defaultAppearance.assistant.radius,
      value: () => this.plugin.settings.chatAppearance.assistant.radius,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.assistant.radius = value;
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
      defaultValue: defaultAppearance.assistant.backgroundOpacity,
      value: () => this.plugin.settings.chatAppearance.assistant.backgroundOpacity,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.assistant.backgroundOpacity = value;
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
      defaultValue: defaultAppearance.assistant.blur,
      value: () => this.plugin.settings.chatAppearance.assistant.blur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.assistant.blur = value;
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
      defaultValue: defaultAppearance.assistant.shadowBlur,
      value: () => this.plugin.settings.chatAppearance.assistant.shadowBlur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.assistant.shadowBlur = value;
      },
    });
    this.createStyleResetSetting(assistantGroupEl, 'assistant');

    const inputGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.input.title'),
      t('settings.style.groups.input.desc'),
    );
    this.addNumericStyleControl(inputGroupEl, {
      group: 'input',
      name: t('settings.style.input.radius.name'),
      desc: t('settings.style.input.radius.desc'),
      min: 8,
      max: 24,
      step: 1,
      unit: 'px',
      defaultValue: defaultAppearance.input.radius,
      value: () => this.plugin.settings.chatAppearance.input.radius,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.input.radius = value;
      },
    });
    this.addNumericStyleControl(inputGroupEl, {
      group: 'input',
      name: t('settings.style.input.blur.name'),
      desc: t('settings.style.input.blur.desc'),
      min: 0,
      max: 24,
      step: 1,
      unit: 'px',
      defaultValue: defaultAppearance.input.blur,
      value: () => this.plugin.settings.chatAppearance.input.blur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.input.blur = value;
      },
    });
    this.addNumericStyleControl(inputGroupEl, {
      group: 'input',
      name: t('settings.style.input.shadowBlur.name'),
      desc: t('settings.style.input.shadowBlur.desc'),
      min: 0,
      max: 36,
      step: 1,
      unit: 'px',
      defaultValue: defaultAppearance.input.shadowBlur,
      value: () => this.plugin.settings.chatAppearance.input.shadowBlur,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.input.shadowBlur = value;
      },
    });
    this.createStyleResetSetting(inputGroupEl, 'input');

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
      defaultValue: defaultAppearance.scrollbar.width,
      value: () => this.plugin.settings.chatAppearance.scrollbar.width,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.width = value;
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
      defaultValue: defaultAppearance.scrollbar.radius,
      value: () => this.plugin.settings.chatAppearance.scrollbar.radius,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.radius = value;
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
      defaultValue: defaultAppearance.scrollbar.trackOpacity,
      value: () => this.plugin.settings.chatAppearance.scrollbar.trackOpacity,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.trackOpacity = value;
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
      defaultValue: defaultAppearance.scrollbar.thumbOpacity,
      value: () => this.plugin.settings.chatAppearance.scrollbar.thumbOpacity,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.thumbOpacity = value;
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
      defaultValue: defaultAppearance.scrollbar.thumbHoverOpacity,
      value: () => this.plugin.settings.chatAppearance.scrollbar.thumbHoverOpacity,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.thumbHoverOpacity = value;
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
      defaultValue: defaultAppearance.scrollbar.edgePadding,
      value: () => this.plugin.settings.chatAppearance.scrollbar.edgePadding,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.edgePadding = value;
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
      defaultValue: defaultAppearance.scrollbar.shadowOpacity,
      value: () => this.plugin.settings.chatAppearance.scrollbar.shadowOpacity,
      setValue: (value) => {
        this.plugin.settings.chatAppearance.scrollbar.shadowOpacity = value;
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
          this.plugin.settings.chatAppearance.advanced.customCssDeclarations = value;
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

  private createStyleGroupSection(containerEl: HTMLElement, title: string, desc: string): HTMLElement {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-style-section' });
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-style-group' });
    headerEl.createEl('h4', { cls: 'opencodian-style-group-title', text: title });
    headerEl.createEl('p', { cls: 'opencodian-style-group-desc', text: desc });

    return sectionEl.createDiv({ cls: 'opencodian-style-group-body' });
  }

  private addNumericStyleControl(containerEl: HTMLElement, config: NumericStyleControlConfig): void {
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

    const numberWrapEl = setting.controlEl.createDiv({ cls: 'opencodian-style-number-wrap' });
    const numberEl = numberWrapEl.createEl('input', {
      cls: 'opencodian-style-number',
      type: 'number',
    });
    numberEl.min = String(config.min);
    numberEl.max = String(config.max);
    numberEl.step = String(config.step);
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

    const renderValue = (value: number) => {
      sliderEl.value = String(value);
      numberEl.value = String(value);
      unitEl.setText(config.unit);
    };

    const commitValue = (value: number) => {
      const nextValue = this.clampStyleNumber(value, config.min, config.max, config.step);
      config.setValue(nextValue);
      renderValue(nextValue);
      this.applyAndScheduleStyleUpdate();
    };

    decrementBtn.addEventListener('click', () => {
      commitValue(config.value() - config.step);
    });
    incrementBtn.addEventListener('click', () => {
      commitValue(config.value() + config.step);
    });
    resetBtn.addEventListener('click', () => {
      commitValue(config.defaultValue);
    });
    sliderEl.addEventListener('input', () => {
      commitValue(Number(sliderEl.value));
    });
    numberEl.addEventListener('input', () => {
      const nextValue = Number(numberEl.value);
      if (!Number.isNaN(nextValue)) {
        commitValue(nextValue);
      }
    });
    numberEl.addEventListener('blur', () => {
      renderValue(config.value());
    });

    renderValue(config.value());
    this.registerStyleControlBinding(config.group, () => {
      renderValue(config.value());
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
            this.resetChatAppearanceGroup(group);
            this.applyAndScheduleStyleUpdate();
            this.refreshStyleControlValues(group);
          });
      });
  }

  private resetChatAppearanceGroup(group: ChatAppearanceStyleGroup): void {
    const defaults = getDefaultChatAppearanceSettings();
    if (group === 'layout') {
      this.plugin.settings.chatAppearance.layout = { ...defaults.layout };
      this.plugin.settings.chatAppearance.sticky = { ...defaults.sticky };
      return;
    }

    if (group === 'user') {
      this.plugin.settings.chatAppearance.user = { ...defaults.user };
      return;
    }

    if (group === 'assistant') {
      this.plugin.settings.chatAppearance.assistant = { ...defaults.assistant };
      return;
    }

    if (group === 'input') {
      this.plugin.settings.chatAppearance.input = { ...defaults.input };
      return;
    }

    if (group === 'scrollbar') {
      this.plugin.settings.chatAppearance.scrollbar = { ...defaults.scrollbar };
      return;
    }

    this.plugin.settings.chatAppearance.advanced = { ...defaults.advanced };
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
    const clampedValue = Math.min(max, Math.max(min, value));
    const steppedValue = Math.round(clampedValue / step) * step;
    return Math.min(max, Math.max(min, steppedValue));
  }

  private applyAndScheduleStyleUpdate(): void {
    this.plugin.applyChatAppearanceSettings();
    this.plugin.scheduleChatAppearanceSave();
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

      this.restoreSettingsPanelScrollPosition(
        pendingOpenScrollTop ?? this.plugin.settings.settingsPanelScrollTop,
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
      if (alreadyAtTarget && reason.startsWith('timeout-')) {
        return;
      }

      restoreAttempts += 1;
      resolvedScrollContainer.scrollTop = normalizedScrollTop;
      const restoredScrollTop = resolvedScrollContainer.scrollTop;
      if (Math.abs(restoredScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        scheduleRestoreSettle(reason);
      }
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
      const catalogs = await this.plugin.modelConfigService.getCatalogs(this.plugin.settings.modelSourceMode);
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

  private renderModelCatalogPanel(
    containerEl: HTMLElement,
    catalogs: { local: ModelCatalog; server: ModelCatalog; effective: ModelCatalog },
  ): void {
    containerEl.empty();
    const tabs: Array<{
      mode: 'local' | 'server' | 'effective';
      title: string;
      description: string;
      catalog: ModelCatalog;
    }> = [
      {
        mode: 'local',
        title: t('settings.model.catalog.localTitle'),
        description: t('settings.model.catalog.localDesc'),
        catalog: catalogs.local,
      },
      {
        mode: 'server',
        title: t('settings.model.catalog.serverTitle'),
        description: t('settings.model.catalog.serverDesc'),
        catalog: catalogs.server,
      },
      {
        mode: 'effective',
        title: t('settings.model.catalog.effectiveTitle'),
        description: t('settings.model.catalog.effectiveDesc'),
        catalog: catalogs.effective,
      },
    ];

    const activeTab = tabs.find((tab) => tab.mode === this.activeModelCatalogTab) ?? tabs[0];
    const panelEl = containerEl.createDiv({ cls: 'opencodian-model-catalog-panel' });
    const tabsEl = panelEl.createDiv({ cls: 'opencodian-model-catalog-tabs' });

    for (const tab of tabs) {
      const buttonEl = tabsEl.createEl('button', {
        cls: 'opencodian-model-catalog-tab',
        text: tab.title,
      });
      buttonEl.type = 'button';
      if (tab.mode === activeTab.mode) {
        buttonEl.addClass('is-active');
      }

      const countEl = buttonEl.createSpan({ cls: 'opencodian-model-catalog-tab-count' });
      countEl.setText(String(this.getCatalogModelCount(tab.catalog)));

      buttonEl.addEventListener('click', () => {
        if (this.activeModelCatalogTab === tab.mode) {
          return;
        }
        this.activeModelCatalogTab = tab.mode;
        this.renderModelCatalogPanel(containerEl, catalogs);
      });
    }

    const headerEl = panelEl.createDiv({ cls: 'opencodian-model-catalog-header' });
    headerEl.createDiv({ cls: 'opencodian-model-catalog-title', text: activeTab.title });
    const descEl = headerEl.createDiv({ cls: 'opencodian-model-catalog-desc' });
    this.applyInlineCodeText(descEl, activeTab.description);
    headerEl.createDiv({
      cls: 'opencodian-model-catalog-summary',
      text: t('settings.model.catalog.summary', {
        providers: activeTab.catalog.providers.length,
        models: this.getCatalogModelCount(activeTab.catalog),
      }),
    });

    const bodyEl = panelEl.createDiv({ cls: 'opencodian-model-catalog-body' });

    if (activeTab.catalog.providers.length === 0) {
      bodyEl.createDiv({
        cls: 'opencodian-model-catalog-empty',
        text: t('settings.model.catalog.empty'),
      });
      return;
    }

    for (const provider of activeTab.catalog.providers) {
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
        text: this.describeProviderModels(provider),
      });
    }
  }

  private getPreferredModelCatalogTab(): 'local' | 'server' | 'effective' {
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

  private describeProviderModels(provider: ModelCatalogProvider): string {
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
}
