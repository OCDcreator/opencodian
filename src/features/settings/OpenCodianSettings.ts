/**
 * OpenCodian Settings Tab
 * 
 * Settings UI for configuring the OpenCodian plugin.
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import { OpencodeConfigManager } from '../../core/config';
import { getCurrentPlatformKey } from '../../core/types';
import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { OpencodeConfigModal } from './OpencodeConfigModal';

const logger = createLogger('OpenCodianSettings');

export class OpenCodianSettingTab extends PluginSettingTab {
  plugin: OpenCodianPlugin;
  private refreshModelsCallback?: () => void;

  constructor(app: App, plugin: OpenCodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Called when models are auto-loaded - refreshes the model dropdowns */
  onModelsLoaded(): void {
    // This will be set to the loadAvailableModels function in addModelSettings
    this.refreshModelsCallback?.();
  }

  async display(): Promise<void> {
    const { containerEl } = this;
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

    new Setting(containerEl)
      .setName(t('settings.server.autoStart.name'))
      .setDesc(t('settings.server.autoStart.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.server.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.server.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.server.host.name'))
      .setDesc(t('settings.server.host.desc'))
      .addText((text) =>
        text
          .setPlaceholder('127.0.0.1')
          .setValue(this.plugin.settings.server.host)
          .onChange(async (value) => {
            this.plugin.settings.server.host = value || '127.0.0.1';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.server.port.name'))
      .setDesc(t('settings.server.port.desc'))
      .addText((text) =>
        text
          .setPlaceholder('4096')
          .setValue(String(this.plugin.settings.server.port))
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.server.port = port;
              await this.plugin.saveSettings();
            }
          })
      );

    // Server status display with refresh
    const statusSetting = new Setting(containerEl)
      .setName(t('settings.server.status.name'))
      .setDesc(t('settings.server.status.desc'));
    
    let startBtn: import('obsidian').ButtonComponent;
    let stopBtn: import('obsidian').ButtonComponent;
    
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
      
      // Update description with status and external warning if applicable
      const healthIndicator = isHealthy ? '🟢' : '🔴';
      let descText = `${t('settings.server.status.desc')} - ${healthIndicator} ${statusText}`;
      if (isExternalServer) {
        descText += ` (${t('settings.server.external.title')})`;
      }
      statusSetting.setDesc(descText);
      
      // Left button: always shows "Start", disabled when running or starting
      if (startBtn) {
        startBtn.setButtonText(t('settings.server.status.start'));
        // Enable start button if server is not running OR if it's an external server
        startBtn.setDisabled(isHealthy && !isExternalServer || internalStatus === 'starting');
      }
      
      // Right button: always shows "Stop", disabled when not running or external
      if (stopBtn) {
        stopBtn.setButtonText(t('settings.server.status.stop'));
        // Disable stop button for external servers (plugin can't stop them)
        stopBtn.setDisabled(!isHealthy || isExternalServer);
      }
    };
    
    statusSetting
      .addButton((btn) => {
        startBtn = btn;
        btn
          .setButtonText(t('settings.server.status.start'))
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              await this.plugin.openCodeService.start();
              new Notice(t('settings.server.started'));
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
        btn
          .setButtonText(t('settings.server.status.refresh'))
          .onClick(async () => {
            btn.setDisabled(true);
            const isHealthy = await this.plugin.openCodeService.checkHealth();
            const internalStatus = this.plugin.openCodeService.getServerStatus();
            
            // Debug info

            
            await updateStatus();
            
            // Build status key and get translation
            const statusKey = `settings.server.status.${internalStatus}`;
            const statusText = (t as (key: string) => string)(statusKey) || internalStatus;
            new Notice(`Health: ${isHealthy ? 'OK' : 'FAIL'} | Status: ${statusText}`);
            btn.setDisabled(false);
          });
      });
    
    // Initial status update
    void updateStatus();
    
    // Set up interval to refresh status while settings tab is open
    const statusInterval = window.setInterval(() => void updateStatus(), 2000);
    
    // Clean up interval when settings tab is closed
    this.containerEl.addEventListener('unload', () => {
      window.clearInterval(statusInterval);
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
      .setName(t('settings.ui.debugLogging.name'))
      .setDesc(t('settings.ui.debugLogging.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableDebugLogging)
          .onChange(async (value) => {
            this.plugin.settings.enableDebugLogging = value;
            await this.plugin.saveSettings();
          })
      );

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
}
