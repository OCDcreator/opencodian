import type { App, ButtonComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import { OpencodeConfigManager } from '../../core/config';
import { getCurrentPlatformKey, type PermissionMode } from '../../core/types';
import type { PermissionAction, PermissionConfig } from '../../core/types/permission';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { OpencodeConfigModal } from './OpencodeConfigModal';

const logger = createLogger('SettingsSecuritySection');

const CONFIG_STATUS_CLASSES = [
  'opencodian-status-warning',
  'opencodian-status-yolo',
  'opencodian-status-normal',
  'opencodian-status-plan',
  'opencodian-status-custom',
] as const;

type ConfigStatusClass = (typeof CONFIG_STATUS_CLASSES)[number];

interface SettingsSecuritySectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

interface ConfigStatusView {
  statusText: string;
  statusClass: ConfigStatusClass;
}

export class SettingsSecuritySection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;

  constructor(options: SettingsSecuritySectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.security.title'),
      t('settings.quickNav.securityDesc'),
    );

    const vaultPath = getVaultBasePath(this.plugin.app);
    if (!vaultPath) {
      this.renderUnavailableConfigStatus(containerEl);
      return headingEl;
    }

    const configManager = new OpencodeConfigManager(vaultPath);
    const configStatusSetting = this.renderConfigStatusSetting(containerEl);

    this.renderPermissionModeSetting(containerEl, () =>
      this.updateConfigStatus(configStatusSetting, configManager)
    );

    void this.updateConfigStatus(configStatusSetting, configManager).catch(() => {
      // Ignore errors if settings tab was closed during update.
    });

    this.renderAutoRestartSetting(containerEl);
    this.renderConfigFileSetting(containerEl, configManager);
    this.renderBlocklistSettings(containerEl);

    return headingEl;
  }

  private renderUnavailableConfigStatus(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.security.configStatus.name'))
      .setDesc(t('settings.security.configStatus.unavailable'));
  }

  private renderConfigStatusSetting(containerEl: HTMLElement): Setting {
    return new Setting(containerEl)
      .setName(t('settings.security.configStatus.name'))
      .setDesc(t('settings.security.configStatus.checking'));
  }

  private async updateConfigStatus(
    configStatusSetting: Setting,
    configManager: OpencodeConfigManager,
  ): Promise<void> {
    try {
      const exists = await configManager.exists();
      const config = exists ? await configManager.read() : null;
      const statusView = this.resolveConfigStatus(exists, config?.permission);

      configStatusSetting.settingEl.removeClass(...CONFIG_STATUS_CLASSES);
      configStatusSetting.setDesc(statusView.statusText);
      configStatusSetting.settingEl.addClass(statusView.statusClass);
    } catch {
      configStatusSetting.setDesc(t('settings.security.configStatus.error'));
    }
  }

  private resolveConfigStatus(
    exists: boolean,
    permission: PermissionConfig | PermissionAction | undefined,
  ): ConfigStatusView {
    if (!exists) {
      return {
        statusText: t('settings.security.configStatus.notCreated'),
        statusClass: 'opencodian-status-warning',
      };
    }

    const summary = OpencodeConfigManager.summarizePermissionConfig(permission);

    if (summary.templateMode === 'yolo') {
      return {
        statusText: t('settings.security.configStatus.yolo'),
        statusClass: 'opencodian-status-yolo',
      };
    }

    if (summary.templateMode === 'normal') {
      return {
        statusText: t('settings.security.configStatus.normal'),
        statusClass: 'opencodian-status-normal',
      };
    }

    if (summary.templateMode === 'plan') {
      return {
        statusText: t('settings.security.configStatus.plan'),
        statusClass: 'opencodian-status-plan',
      };
    }

    const customDetails = summary.customFeatures
      .map((feature) => this.getCustomConfigStatusDetail(feature))
      .filter((detail): detail is string => detail.length > 0);

    return {
      statusText: customDetails.length > 0
        ? t('settings.security.configStatus.customWithDetails', {
            details: customDetails.join(', '),
          })
        : t('settings.security.configStatus.custom'),
      statusClass: 'opencodian-status-custom',
    };
  }

  private renderPermissionModeSetting(
    containerEl: HTMLElement,
    refreshConfigStatus: () => Promise<void>,
  ): void {
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
            await this.updatePermissionMode(value as PermissionMode, refreshConfigStatus);
          });
      });
  }

  private async updatePermissionMode(
    permissionMode: PermissionMode,
    refreshConfigStatus: () => Promise<void>,
  ): Promise<void> {
    this.plugin.settings.permissionMode = permissionMode;
    await this.plugin.saveSettings();

    new Notice(t('settings.security.permissionMode.updated', {
      mode: this.getPermissionModeLabel(permissionMode),
    }));
    await refreshConfigStatus();
    await this.handlePermissionModeRestart();
  }

  private async handlePermissionModeRestart(): Promise<void> {
    if (!this.plugin.settings.autoRestartOnPermissionChange) {
      new Notice(t('settings.security.autoRestart.manual'));
      return;
    }

    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.server.remoteManageUnavailable'));
      return;
    }

    try {
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (isRunning) {
        await this.restartRunningService();
        new Notice(t('settings.security.autoRestart.success'));
      }
    } catch (error) {
      logger.error('Auto restart failed:', error);
      new Notice(t('settings.security.autoRestart.failed'));
    }
  }

  private renderAutoRestartSetting(containerEl: HTMLElement): void {
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
  }

  private renderConfigFileSetting(
    containerEl: HTMLElement,
    configManager: OpencodeConfigManager,
  ): void {
    new Setting(containerEl)
      .setName(t('settings.security.configFile.name'))
      .setDesc(`${t('settings.security.configFile.desc')}${configManager.getConfigPath()}`)
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.security.configFile.editBtn'))
          .setTooltip(t('settings.security.configFile.editTooltip'))
          .onClick(() => {
            new OpencodeConfigModal(this.app, configManager).open();
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.security.configFile.applyBtn'))
          .setCta()
          .onClick(async () => {
            await this.applyConfigRestart(btn);
          });
      });
  }

  private async applyConfigRestart(btn: ButtonComponent): Promise<void> {
    btn.setDisabled(true);
    btn.setButtonText(t('settings.security.configFile.restarting'));

    try {
      if (this.plugin.settings.server.mode !== 'local') {
        new Notice(t('settings.server.remoteManageUnavailable'));
        return;
      }

      const isRunning = await this.plugin.openCodeService.checkHealth();

      if (isRunning) {
        await this.restartRunningService();
        new Notice(t('settings.security.configFile.restarted'));
      } else {
        await this.plugin.openCodeService.start();
        new Notice(t('settings.security.configFile.started'));
      }
    } catch (error) {
      logger.error('Failed to restart OpenCode:', error);
      new Notice(t('settings.security.configFile.restartFailed'));
    } finally {
      btn.setDisabled(false);
      btn.setButtonText(t('settings.security.configFile.applyBtn'));
    }
  }

  private async restartRunningService(): Promise<void> {
    await this.plugin.openCodeService.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.plugin.openCodeService.start();
  }

  private renderBlocklistSettings(containerEl: HTMLElement): void {
    this.renderBlocklistToggle(containerEl);
    this.renderExternalAccessToggle(containerEl);
    this.renderAllowedExportPathsSetting(containerEl);
    this.renderPlatformBlockedCommandsSetting(containerEl);
  }

  private renderBlocklistToggle(containerEl: HTMLElement): void {
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
  }

  private renderExternalAccessToggle(containerEl: HTMLElement): void {
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
  }

  private renderAllowedExportPathsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.security.exportPaths.name'))
      .setDesc(t('settings.security.exportPaths.desc'))
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.allowedExportPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.allowedExportPaths = this.parseNonEmptyLines(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
      });
  }

  private renderPlatformBlockedCommandsSetting(containerEl: HTMLElement): void {
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
            this.plugin.settings.blockedCommands[platformKey] = this.parseNonEmptyLines(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 40;
      });

    if (isWindows) {
      this.renderUnixBlockedCommandsSetting(containerEl);
    }
  }

  private renderUnixBlockedCommandsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.security.blockedCommands.unixName'))
      .setDesc(t('settings.security.blockedCommands.unixDesc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('rm -rf\nchmod 777\nmkfs')
          .setValue(this.plugin.settings.blockedCommands.unix.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.blockedCommands.unix = this.parseNonEmptyLines(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
      });
  }

  private parseNonEmptyLines(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private getPermissionModeLabel(permissionMode: PermissionMode): string {
    switch (permissionMode) {
      case 'yolo':
        return t('settings.security.permissionMode.yolo');
      case 'plan':
        return t('settings.security.permissionMode.plan');
      case 'normal':
      default:
        return t('settings.security.permissionMode.normal');
    }
  }

  private getCustomConfigStatusDetail(
    feature: ReturnType<typeof OpencodeConfigManager.summarizePermissionConfig>['customFeatures'][number],
  ): string {
    switch (feature) {
      case 'external-directory':
        return t('settings.security.configStatus.detail.externalDirectory');
      case 'task-allowlist':
        return t('settings.security.configStatus.detail.taskAllowlist');
      case 'patterned-rules':
        return t('settings.security.configStatus.detail.patternedRules');
      default:
        return '';
    }
  }
}
