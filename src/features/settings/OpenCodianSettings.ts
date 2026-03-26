/**
 * OpenCodian Settings Tab
 * 
 * Settings UI for configuring the OpenCodian plugin.
 */

import * as fs from 'fs';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import { OpencodeConfigManager } from '../../core/config';
import {
  type ModelCatalog,
  type ModelCatalogProvider,
  setModelEnabled,
  setProviderEnabled,
} from '../../core/config/modelConfig';
import {
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getDefaultChatAppearanceSettings,
  isValidChatAppearanceCustomCssDeclarations,
  type ModelSourceMode,
} from '../../core/types';
import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import { ModelConfigModal } from './ModelConfigModal';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import { type ServerHelpTopic,ServerSettingHelpModal } from './ServerSettingHelpModal';

const logger = createLogger('OpenCodianSettings');

interface NumericStyleControlConfig {
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
  private refreshServerStatusCallback?: () => Promise<void>;
  private serverStatusIntervalId: number | null = null;
  private activeModelCatalogTab: 'local' | 'server' | 'effective' = 'effective';
  private settingsScrollHandler?: () => void;
  private settingsScrollContainerEl: HTMLElement | null = null;
  private lastObservedSettingsScrollTop = 0;
  private pendingOpenScrollTop: number | null = null;
  private pendingOpenSectionTitle: string | null = null;

  constructor(app: App, plugin: OpenCodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Called when models are auto-loaded - refreshes the model dropdowns */
  onModelsLoaded(): void {
    // This will be set to the loadAvailableModels function in addModelSettings
    this.refreshModelsCallback?.();
  }

  refreshServerStatusDisplay(): void {
    void this.refreshServerStatusCallback?.();
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

    if (this.serverStatusIntervalId) {
      window.clearInterval(this.serverStatusIntervalId);
      this.serverStatusIntervalId = null;
    }
    this.refreshServerStatusCallback = undefined;
    containerEl.empty();
    containerEl.addClass('opencodian-settings');
    if (pendingOpenScrollTop !== null || pendingOpenSectionTitle !== null) {
      containerEl.style.visibility = 'hidden';
    } else {
      containerEl.style.removeProperty('visibility');
    }

    const quickNavEl = containerEl.createDiv({ cls: 'opencodian-settings-quick-nav' });
    containerEl.createEl('h2', { text: t('settings.title') });

    const sections = [
      {
        headingEl: this.addLanguageSettings(containerEl),
        tooltip: t('settings.quickNav.languageDesc'),
      },
      {
        headingEl: this.addServerSettings(containerEl),
        tooltip: t('settings.quickNav.serverDesc'),
      },
      {
        headingEl: this.addModelSettings(containerEl),
        tooltip: t('settings.quickNav.modelDesc'),
      },
      {
        headingEl: this.addSecuritySettings(containerEl),
        tooltip: t('settings.quickNav.securityDesc'),
      },
      {
        headingEl: this.addUISettings(containerEl),
        tooltip: t('settings.quickNav.uiDesc'),
      },
      {
        headingEl: this.addStyleSettings(containerEl),
        tooltip: t('settings.quickNav.styleDesc'),
      },
      {
        headingEl: this.addDebugSettings(containerEl),
        tooltip: t('settings.quickNav.debugDesc'),
      },
      {
        headingEl: this.addUserSettings(containerEl),
        tooltip: t('settings.quickNav.userDesc'),
      },
    ];

    this.buildQuickNav(quickNavEl, sections);
    this.bindSettingsPanelScrollPersistence();
    if (pendingOpenSectionTitle) {
      this.scrollToSectionByTitle(pendingOpenSectionTitle);
      this.finishPendingOpenVisibility();
    } else {
      this.restoreSettingsPanelScrollPosition(pendingOpenScrollTop ?? this.plugin.settings.settingsPanelScrollTop);
      this.finishPendingOpenVisibility();
    }
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
        .addText((text) =>
          text
            .setPlaceholder('127.0.0.1')
            .setValue(this.plugin.settings.server.local.host)
            .onChange(async (value) => {
              this.plugin.settings.server.local.host = value || '127.0.0.1';
              await this.plugin.saveSettings();
            })
        );
      this.addServerHelpButton(hostSetting, 'host');

      const portSetting = new Setting(containerEl)
        .setName(t('settings.server.port.name'))
        .setDesc(t('settings.server.port.desc'))
        .addText((text) =>
          text
            .setPlaceholder('4096')
            .setValue(String(this.plugin.settings.server.local.port))
            .onChange(async (value) => {
              const port = parseInt(value, 10);
              if (!isNaN(port) && port > 0 && port < 65536) {
                this.plugin.settings.server.local.port = port;
                await this.plugin.saveSettings();
              }
            })
        );
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
      
      // Determine display status
      const displayStatus = isHealthy ? 'running' : 
                           (internalStatus === 'starting' ? 'starting' : 'stopped');
      
      const statusKey = `settings.server.status.${displayStatus}` as const;
      const statusText = t(statusKey) || displayStatus;
      const serverScopeText = isLocalMode
        ? t('settings.server.status.scope.local')
        : t('settings.server.status.scope.remote');
      
      // Update description with status and external warning if applicable
      const healthIndicator = isHealthy ? '🟢' : '🔴';
      let descText = `${t('settings.server.status.desc')} - ${healthIndicator} ${statusText} ${serverScopeText}`;
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
            const displayStatus = isHealthy
              ? 'running'
              : (internalStatus === 'starting' ? 'starting' : 'stopped');
            
            // Debug info

            
            await updateStatus();
            
            // Build status key and get translation
            const statusKey = `settings.server.status.${displayStatus}`;
            const statusText = (t as (key: string) => string)(statusKey) || internalStatus;
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
        const availableProviders = catalogs.effective.providers
          .filter((provider) => provider.enabled)
          .map((provider) => ({
            ...provider,
            models: provider.models.filter((model) => model.enabled),
          }))
          .filter((provider) => provider.models.length > 0);
        let dirty = false;

        providerDropdown.selectEl.empty();
        providerDropdown.addOption('', t('settings.model.unconfigured'));
        for (const provider of availableProviders) {
          providerDropdown.addOption(provider.id, provider.name || provider.id);
        }

        this.renderModelCatalogPanel(sourceCatalogEl, catalogs);

        if (this.plugin.settings.defaultProvider === '') {
          providerDropdown.setValue('');
        } else if (availableProviders.find((provider) => provider.id === this.plugin.settings.defaultProvider)) {
          providerDropdown.setValue(this.plugin.settings.defaultProvider);
        } else if (availableProviders.length > 0) {
          providerDropdown.setValue(availableProviders[0].id);
          if (this.plugin.settings.defaultProvider !== availableProviders[0].id) {
            this.plugin.settings.defaultProvider = availableProviders[0].id;
            dirty = true;
          }
        } else {
          providerDropdown.setValue('');
          if (this.plugin.settings.defaultProvider !== '') {
            this.plugin.settings.defaultProvider = '';
            dirty = true;
          }
          if (this.plugin.settings.defaultModel !== '') {
            this.plugin.settings.defaultModel = '';
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
      const availableProviders = (catalogs?.effective.providers ?? [])
        .filter((provider) => provider.enabled)
        .map((provider) => ({
          ...provider,
          models: provider.models.filter((model) => model.enabled),
        }))
        .filter((provider) => provider.models.length > 0);
      const currentProviderId = providerDropdown.getValue();
      const provider = availableProviders.find((item) => item.id === currentProviderId);

      modelDropdown.selectEl.empty();

      if (!currentProviderId) {
        modelDropdown.addOption('', t('settings.model.unconfigured'));
        modelDropdown.setValue('');
        if (this.plugin.settings.defaultModel !== '') {
          this.plugin.settings.defaultModel = '';
          await this.plugin.saveSettings();
        }
        return;
      }

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
        modelDropdown.addOption('', t('settings.model.unconfigured'));
        modelDropdown.setValue('');
        if (this.plugin.settings.defaultModel !== '') {
          this.plugin.settings.defaultModel = '';
          await this.plugin.saveSettings();
        }
      }
    };

    new Setting(containerEl)
      .setName(t('settings.model.source.name'))
      .setDesc(t('settings.model.source.desc'))
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

    new Setting(containerEl)
      .setName(t('settings.model.provider.name'))
      .setDesc(t('settings.model.provider.desc'))
      .addDropdown((dropdown) => {
        providerDropdown = dropdown;
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultProvider = value;
          if (!value) {
            this.plugin.settings.defaultModel = '';
          }
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

    new Setting(containerEl)
      .setName(t('settings.model.config.name'))
      .setDesc(`${t('settings.model.config.desc')} ${modelConfigService.getConfigPath()}`)
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

    void (async () => {
      await loadAvailableModels(false);
    })();

    return headingEl;
  }

  /** Clean up when settings tab is closed */
  hide(): void {
    this.captureSettingsPanelScrollPosition();
    if (this.settingsScrollHandler) {
      this.settingsScrollContainerEl?.removeEventListener('scroll', this.settingsScrollHandler);
      this.settingsScrollHandler = undefined;
    }
    this.settingsScrollContainerEl = null;
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
        dropdown
          .setValue(this.plugin.settings.tabBarPosition)
          .onChange(async (value) => {
            this.plugin.settings.tabBarPosition = value as 'input' | 'header';
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
            this.display();
          });
      });

    const layoutGroupEl = this.createStyleGroupSection(
      containerEl,
      t('settings.style.groups.layout.title'),
      t('settings.style.groups.layout.desc'),
    );
    this.addNumericStyleControl(layoutGroupEl, {
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
      .setDesc(t('settings.style.advanced.customCssDeclarations.desc'))
      .setClass('opencodian-style-setting');

    const validationEl = advancedSetting.settingEl.createDiv({
      cls: 'opencodian-style-validation',
    });

    advancedSetting.addTextArea((text) => {
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
  }

  private createStyleResetSetting(
    containerEl: HTMLElement,
    group: 'layout' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
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
            this.display();
          });
      });
  }

  private resetChatAppearanceGroup(
    group: 'layout' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): void {
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

  private clampStyleNumber(value: number, min: number, max: number, step: number): number {
    const clampedValue = Math.min(max, Math.max(min, value));
    const steppedValue = Math.round(clampedValue / step) * step;
    return Math.min(max, Math.max(min, steppedValue));
  }

  private applyAndScheduleStyleUpdate(): void {
    this.plugin.applyChatAppearanceSettings();
    this.plugin.scheduleChatAppearanceSave();
  }

  private bindSettingsPanelScrollPersistence(): void {
    if (this.settingsScrollHandler) {
      this.settingsScrollContainerEl?.removeEventListener('scroll', this.settingsScrollHandler);
    }

    const scrollContainer = this.getSettingsScrollContainer();
    this.settingsScrollContainerEl = scrollContainer;
    this.lastObservedSettingsScrollTop = scrollContainer.scrollTop;

    this.settingsScrollHandler = () => {
      this.plugin.settings.settingsPanelScrollTop = scrollContainer.scrollTop;
      this.lastObservedSettingsScrollTop = scrollContainer.scrollTop;
      this.plugin.scheduleSettingsUiStateSave();
    };

    scrollContainer.addEventListener('scroll', this.settingsScrollHandler, { passive: true });
  }

  private restoreSettingsPanelScrollPosition(scrollTop = this.plugin.settings.settingsPanelScrollTop): void {
    const applyRestore = () => {
      const scrollContainer = this.getSettingsScrollContainer();
      scrollContainer.scrollTop = scrollTop;
    };

    window.requestAnimationFrame(() => {
      applyRestore();
      window.requestAnimationFrame(() => {
        applyRestore();
        window.setTimeout(applyRestore, 32);
      });
    });
  }

  private captureSettingsPanelScrollPosition(): void {
    const scrollContainer = this.settingsScrollContainerEl ?? this.getSettingsScrollContainer();
    const nextScrollTop =
      scrollContainer.isConnected && scrollContainer.clientHeight > 0
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
    const containerEl = this.containerEl;

    let currentEl: HTMLElement | null = containerEl;
    while (currentEl) {
      const computedStyle = window.getComputedStyle(currentEl);
      const overflowY = computedStyle.overflowY;
      const canScrollY =
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && currentEl.scrollHeight > currentEl.clientHeight + 1;

      if (canScrollY) {
        return currentEl;
      }
      currentEl = currentEl.parentElement;
    }

    return containerEl;
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
    const displayProviders = this.getDisplayCatalogProviders(activeTab.mode, activeTab.catalog);
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
      countEl.setText(String(this.getCatalogModelCount(this.getDisplayCatalogProviders(tab.mode, tab.catalog))));

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
    headerEl.createDiv({ cls: 'opencodian-model-catalog-desc', text: activeTab.description });
    headerEl.createDiv({
      cls: 'opencodian-model-catalog-summary',
      text: t('settings.model.catalog.summary', {
        providers: displayProviders.length,
        models: this.getCatalogModelCount(displayProviders),
      }),
    });

    const bodyEl = panelEl.createDiv({ cls: 'opencodian-model-catalog-body' });

    if (displayProviders.length === 0) {
      bodyEl.createDiv({
        cls: 'opencodian-model-catalog-empty',
        text: t('settings.model.catalog.empty'),
      });
      return;
    }

    for (const provider of displayProviders) {
      const providerToggleState = this.getProviderToggleState(catalogs.local, provider.id);
      const providerEl = bodyEl.createDiv({ cls: 'opencodian-model-catalog-provider' });
      if (!providerToggleState) {
        providerEl.addClass('is-disabled');
      }
      const providerHeaderEl = providerEl.createDiv({ cls: 'opencodian-model-catalog-provider-header' });
      providerHeaderEl.createDiv({
        cls: 'opencodian-model-catalog-provider-name',
        text: provider.name,
      });
      const providerActionsEl = providerHeaderEl.createDiv({ cls: 'opencodian-model-catalog-provider-actions' });
      const providerCountEl = providerActionsEl.createDiv({
        cls: 'opencodian-model-catalog-provider-count',
        text: String(provider.models.length),
      });
      providerCountEl.title = t('settings.model.toggle.modelCount', { count: String(provider.models.length) });
      const providerToggleLabel = providerActionsEl.createEl('label', { cls: 'opencodian-model-catalog-toggle' });
      const providerToggleEl = providerToggleLabel.createEl('input', { attr: { type: 'checkbox' } });
      providerToggleEl.checked = providerToggleState;
      providerToggleEl.disabled = this.plugin.settings.defaultProvider === provider.id && this.plugin.settings.defaultProvider !== '';
      providerToggleEl.addEventListener('change', () => {
        void this.handleProviderToggle(provider.id, providerToggleEl.checked, providerToggleEl);
      });
      providerToggleLabel.createSpan({ text: providerToggleState ? t('settings.model.toggle.on') : t('settings.model.toggle.off') });

      const modelsEl = providerEl.createDiv({ cls: 'opencodian-model-catalog-provider-model-list' });
      for (const model of provider.models) {
        const modelEnabled = this.getModelToggleState(catalogs.local, provider.id, model.id);
        const modelRowEl = modelsEl.createDiv({ cls: 'opencodian-model-catalog-model-row' });
        if (!modelEnabled) {
          modelRowEl.addClass('is-disabled');
        }
        const modelInfoEl = modelRowEl.createDiv({ cls: 'opencodian-model-catalog-model-info' });
        modelInfoEl.createDiv({
          cls: 'opencodian-model-catalog-model-name',
          text: model.name,
        });
        modelInfoEl.createDiv({
          cls: 'opencodian-model-catalog-model-id',
          text: model.id,
        });

        const modelToggleLabel = modelRowEl.createEl('label', { cls: 'opencodian-model-catalog-toggle' });
        const modelToggleEl = modelToggleLabel.createEl('input', { attr: { type: 'checkbox' } });
        modelToggleEl.checked = modelEnabled;
        modelToggleEl.disabled = !providerToggleState;
        modelToggleEl.addEventListener('change', () => {
          void this.handleModelToggle(provider.id, model.id, modelToggleEl.checked, modelToggleEl);
        });
        modelToggleLabel.createSpan({ text: modelEnabled ? t('settings.model.toggle.on') : t('settings.model.toggle.off') });
      }
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

  private getDisplayCatalogProviders(
    mode: 'local' | 'server' | 'effective',
    catalog: ModelCatalog,
  ): ModelCatalogProvider[] {
    if (mode !== 'effective') {
      return catalog.providers;
    }

    return catalog.providers
      .filter((provider) => provider.enabled)
      .map((provider) => ({
        ...provider,
        whitelist: [...provider.whitelist],
        blacklist: [...provider.blacklist],
        models: provider.models.filter((model) => model.enabled),
      }))
      .filter((provider) => provider.models.length > 0);
  }

  private getCatalogModelCount(catalog: ModelCatalog | ModelCatalogProvider[]): number {
    const providers = Array.isArray(catalog) ? catalog : catalog.providers;
    return providers.reduce((total, provider) => total + provider.models.length, 0);
  }

  private describeProviderModels(provider: ModelCatalogProvider): string {
    const modelNames = provider.models.map((model) => model.name);
    if (modelNames.length <= 6) {
      return modelNames.join(' · ');
    }

    const preview = modelNames.slice(0, 6).join(' · ');
    return `${preview} · +${modelNames.length - 6}`;
  }

  private getProviderToggleState(localCatalog: ModelCatalog, providerId: string): boolean {
    return localCatalog.providers.find((provider) => provider.id === providerId)?.enabled ?? true;
  }

  private getModelToggleState(localCatalog: ModelCatalog, providerId: string, modelId: string): boolean {
    const provider = localCatalog.providers.find((item) => item.id === providerId);
    if (!provider) {
      return true;
    }

    if (!provider.enabled) {
      return false;
    }

    const localModel = provider.models.find((model) => model.id === modelId);
    if (localModel) {
      return localModel.enabled;
    }

    if (provider.whitelist.length > 0) {
      return provider.whitelist.includes(modelId) && !provider.blacklist.includes(modelId);
    }

    return !provider.blacklist.includes(modelId);
  }

  private async handleProviderToggle(
    providerId: string,
    enabled: boolean,
    toggleEl: HTMLInputElement,
  ): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    if (!enabled && this.plugin.settings.defaultProvider === providerId && this.plugin.settings.defaultProvider !== '') {
      toggleEl.checked = true;
      new Notice(t('settings.model.toggle.defaultProviderLocked'));
      return;
    }

    try {
      const subset = await this.plugin.modelConfigService.readLocalModelConfig();
      const next = setProviderEnabled(subset, providerId, enabled);
      await this.plugin.modelConfigService.writeLocalModelConfig(next);
      await this.restartLocalModelServerIfNeeded();
      await this.plugin.saveSettings();
      this.refreshModelsCallback?.();
    } catch (error) {
      logger.error('Failed to toggle provider availability:', error);
      toggleEl.checked = !enabled;
      new Notice(t('settings.model.toggle.updateFailed'));
    }
  }

  private async handleModelToggle(
    providerId: string,
    modelId: string,
    enabled: boolean,
    toggleEl: HTMLInputElement,
  ): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    try {
      const subset = await this.plugin.modelConfigService.readLocalModelConfig();
      const next = setModelEnabled(subset, providerId, modelId, enabled);
      await this.plugin.modelConfigService.writeLocalModelConfig(next);
      await this.restartLocalModelServerIfNeeded();
      await this.plugin.saveSettings();
      this.refreshModelsCallback?.();
    } catch (error) {
      logger.error('Failed to toggle model availability:', error);
      toggleEl.checked = !enabled;
      new Notice(t('settings.model.toggle.updateFailed'));
    }
  }

  private async restartLocalModelServerIfNeeded(): Promise<void> {
    if (this.plugin.settings.server.mode !== 'local') {
      return;
    }

    const running = await this.plugin.openCodeService.checkHealth();
    if (!running) {
      return;
    }

    await this.plugin.openCodeService.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.plugin.openCodeService.start();
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
