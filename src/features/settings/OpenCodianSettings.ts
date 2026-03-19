/**
 * OpenCodian Settings Tab
 * 
 * Settings UI for configuring the OpenCodian plugin.
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import type { OpenCodianSettings } from '../../core/types';
import type OpenCodianPlugin from '../../main';

export class OpenCodianSettingTab extends PluginSettingTab {
  plugin: OpenCodianPlugin;

  constructor(app: App, plugin: OpenCodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('opencodian-settings');

    containerEl.createEl('h2', { text: 'OpenCodian Settings' });

    // Server Settings
    this.addServerSettings(containerEl);

    // Model Settings
    this.addModelSettings(containerEl);

    // Security Settings
    this.addSecuritySettings(containerEl);

    // UI Settings
    this.addUISettings(containerEl);

    // User Settings
    this.addUserSettings(containerEl);
  }

  /** Server settings section */
  private addServerSettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'Server' });

    new Setting(containerEl)
      .setName('Auto-start server')
      .setDesc('Automatically start the OpenCode server when Obsidian loads')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.server.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.server.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Server host')
      .setDesc('Host address for the OpenCode server (default: 127.0.0.1)')
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
      .setName('Server port')
      .setDesc('Port for the OpenCode server (default: 4096)')
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

    new Setting(containerEl)
      .setName('Server status')
      .setDesc('Current status of the OpenCode server')
      .addButton((btn) => {
        const updateStatus = () => {
          const status = this.plugin.openCodeService.getServerStatus();
          btn.setButtonText(status.charAt(0).toUpperCase() + status.slice(1));
          btn.setDisabled(false);
        };

        updateStatus();

        btn.setButtonText('Start')
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('Starting...');
            try {
              await this.plugin.openCodeService.start();
              new Notice('OpenCode server started');
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Failed to start';
              new Notice(msg);
            }
            updateStatus();
          });
      })
      .addButton((btn) => {
        btn.setButtonText('Stop')
          .onClick(async () => {
            btn.setDisabled(true);
            await this.plugin.openCodeService.stop();
            new Notice('OpenCode server stopped');
            btn.setDisabled(false);
          });
      });
  }

  /** Model settings section */
  private addModelSettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'Model' });

    new Setting(containerEl)
      .setName('Default provider')
      .setDesc('Default model provider to use')
      .addDropdown((dropdown) => {
        dropdown.addOption('anthropic', 'Anthropic');
        dropdown.addOption('openai', 'OpenAI');
        dropdown.addOption('local', 'Local');
        dropdown
          .setValue(this.plugin.settings.defaultProvider)
          .onChange(async (value) => {
            this.plugin.settings.defaultProvider = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default model')
      .setDesc('Default model ID to use (e.g., claude-3-5-sonnet-20241022)')
      .addText((text) =>
        text
          .setPlaceholder('claude-3-5-sonnet-20241022')
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async (value) => {
            this.plugin.settings.defaultModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Refresh models')
      .setDesc('Fetch available models from OpenCode server')
      .addButton((btn) =>
        btn
          .setButtonText('Refresh')
          .onClick(async () => {
            try {
              const models = await this.plugin.openCodeService.getAvailableModels();
              console.log('Available models:', models);
              new Notice(`Found ${models.providers.length} providers`);
            } catch (error) {
              new Notice('Failed to fetch models');
            }
          })
      );
  }

  /** Security settings section */
  private addSecuritySettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'Security' });

    new Setting(containerEl)
      .setName('Permission mode')
      .setDesc('How to handle tool execution permissions')
      .addDropdown((dropdown) => {
        dropdown.addOption('yolo', 'YOLO - Auto-approve all');
        dropdown.addOption('normal', 'Normal - Prompt for approval');
        dropdown.addOption('plan', 'Plan - Plan mode');
        dropdown
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value) => {
            this.plugin.settings.permissionMode = value as 'yolo' | 'normal' | 'plan';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Enable command blocklist')
      .setDesc('Block dangerous bash commands')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableBlocklist)
          .onChange(async (value) => {
            this.plugin.settings.enableBlocklist = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Allow external access')
      .setDesc('Allow AI to access files outside the vault')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.allowExternalAccess)
          .onChange(async (value) => {
            this.plugin.settings.allowExternalAccess = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Allowed export paths')
      .setDesc('Paths where AI can write files (one per line)')
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
  }

  /** UI settings section */
  private addUISettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'User Interface' });

    new Setting(containerEl)
      .setName('Maximum tabs')
      .setDesc('Maximum number of conversation tabs (3-10)')
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
      .setName('Tab bar position')
      .setDesc('Where to display the tab bar')
      .addDropdown((dropdown) => {
        dropdown.addOption('input', 'Near input');
        dropdown.addOption('header', 'In header');
        dropdown
          .setValue(this.plugin.settings.tabBarPosition)
          .onChange(async (value) => {
            this.plugin.settings.tabBarPosition = value as 'input' | 'header';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Auto-scroll')
      .setDesc('Automatically scroll to new messages')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoScroll)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoScroll = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Open in main tab')
      .setDesc('Open chat in main editor area instead of sidebar')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openInMainTab)
          .onChange(async (value) => {
            this.plugin.settings.openInMainTab = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /** User settings section */
  private addUserSettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'User' });

    new Setting(containerEl)
      .setName('Your name')
      .setDesc('How the AI should address you')
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
      .setName('System prompt')
      .setDesc('Custom instructions for the AI')
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
      .setName('Excluded tags')
      .setDesc('Tags to exclude from context (one per line)')
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
  }
}
