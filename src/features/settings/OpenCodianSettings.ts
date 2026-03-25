/**
 * OpenCodian Settings Tab
 * 
 * Settings UI for configuring the OpenCodian plugin.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import { OpencodeConfigManager } from '../../core/config';
import { getCurrentPlatformDebugLogPath, getCurrentPlatformKey } from '../../core/types';
import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import { ServerSettingHelpModal, type ServerHelpTopic } from './ServerSettingHelpModal';

const logger = createLogger('OpenCodianSettings');

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

  async display(): Promise<void> {
    const { containerEl } = this;
    if (this.serverStatusIntervalId) {
      window.clearInterval(this.serverStatusIntervalId);
      this.serverStatusIntervalId = null;
    }
    this.refreshServerStatusCallback = undefined;
    containerEl.empty();
    containerEl.addClass('opencodian-settings');

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
        headingEl: await this.addSecuritySettings(containerEl),
        tooltip: t('settings.quickNav.securityDesc'),
      },
      {
        headingEl: this.addUISettings(containerEl),
        tooltip: t('settings.quickNav.uiDesc'),
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

    // Provider dropdown - will be populated dynamically
    let providerDropdown: import('obsidian').DropdownComponent;
    let modelDropdown: import('obsidian').DropdownComponent;
    
    // Store available providers and models
    let availableProviders: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> = [];
    
    const loadAvailableModels = async (showNotice = false) => {
      try {
        const result = await this.plugin.openCodeService.getAvailableModels();
        availableProviders = result.providers;
        
        // Clear and repopulate provider dropdown
        providerDropdown.selectEl.empty();
        for (const provider of availableProviders) {
          providerDropdown.addOption(provider.id, provider.name || provider.id);
        }
        
        // Set current provider if available
        if (availableProviders.find(p => p.id === this.plugin.settings.defaultProvider)) {
          providerDropdown.setValue(this.plugin.settings.defaultProvider);
        } else if (availableProviders.length > 0) {
          // Default to first provider
          providerDropdown.setValue(availableProviders[0].id);
        }
        
        // Update model dropdown for current provider
        updateModelDropdown();
        
        if (showNotice) {
          new Notice(t('settings.model.refresh.success', { count: result.providers.length }));
        }
        
        return result;
      } catch (error) {
        logger.error('Failed to load models:', error);
        if (showNotice) {
          new Notice(t('settings.model.refresh.failed'));
        }
        return null;
      }
    };
    
    // Register this function so it can be called when models are auto-loaded
    this.refreshModelsCallback = () => {
      void loadAvailableModels(false);
    };
    
    const updateModelDropdown = () => {
      if (!modelDropdown) return;
      
      const currentProviderId = providerDropdown.getValue();
      const provider = availableProviders.find(p => p.id === currentProviderId);
      
      // Clear and repopulate model dropdown
      modelDropdown.selectEl.empty();
      
      if (provider && provider.models.length > 0) {
        for (const model of provider.models) {
          modelDropdown.addOption(model.id, model.name || model.id);
        }
        
        // Set current model if available for this provider
        const currentModel = this.plugin.settings.defaultModel;

        
        if (provider.models.find(m => m.id === currentModel)) {
          modelDropdown.setValue(currentModel);

        } else {
          // Default to first model and update settings
          const firstModel = provider.models[0].id;
          modelDropdown.setValue(firstModel);
          this.plugin.settings.defaultModel = firstModel;

        }
      } else {
        modelDropdown.addOption('', 'No models available');
      }
    };

    new Setting(containerEl)
      .setName(t('settings.model.provider.name'))
      .setDesc(t('settings.model.provider.desc'))
      .addDropdown((dropdown) => {
        providerDropdown = dropdown;
        // Will be populated by loadAvailableModels()
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultProvider = value;
          await this.plugin.saveSettings();
          updateModelDropdown();
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
            btn.setButtonText('Loading...');
            
            await loadAvailableModels(true);
            
            btn.setDisabled(false);
            btn.setButtonText(t('settings.model.refresh.button'));
          })
      );
    
    // Load models on initial display (if server is running)
    void (async () => {
      const isHealthy = await this.plugin.openCodeService.checkHealth();
      if (isHealthy) {
        await loadAvailableModels(false);
      }
    })();

    return headingEl;
  }

  /** Clean up when settings tab is closed */
  hide(): void {
    this.refreshModelsCallback = undefined;
  }

  /** Security settings section */
  private async addSecuritySettings(containerEl: HTMLElement): Promise<HTMLHeadingElement> {
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
    
    // Update config status function
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

    // Initial status check
    await updateConfigStatus();

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
