/* eslint-disable max-lines -- Server settings owns OpenCode connection, auth, status actions, and stale backend guards together. */
import type { App, ButtonComponent, TextComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { type ServerHelpTopic, ServerSettingHelpModal } from './ServerSettingHelpModal';
import { isOpenCodeSettingsBackendActive } from './settingsBackendGuards';

type OpenCodeServerDiagnostics = ReturnType<OpenCodianPlugin['openCodeService']['getServerDiagnostics']>;
type OpenCodeServerStatus = ReturnType<OpenCodianPlugin['openCodeService']['getServerStatus']>;

interface SettingsServerSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  notifyModelCatalogStatus: () => void;
  onDispose?: () => void;
  onServerStateChange: (state: {
    healthy: boolean;
    status: OpenCodeServerStatus;
  }) => void;
  requestDisplayRefresh: () => void;
}

interface ServerStatusSnapshot {
  diagnostics: OpenCodeServerDiagnostics;
  internalStatus: OpenCodeServerStatus;
  isExternalServer: boolean;
  isHealthy: boolean;
  statusText: string;
}

export class SettingsServerSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  private readonly notifyModelCatalogStatus: () => void;
  private readonly onDispose?: () => void;
  private readonly onServerStateChange: (state: {
    healthy: boolean;
    status: OpenCodeServerStatus;
  }) => void;
  private readonly requestDisplayRefresh: () => void;
  private statusSetting: Setting | null = null;
  private actionButton: ButtonComponent | null = null;
  private stopButton: ButtonComponent | null = null;
  private refreshButton: ButtonComponent | null = null;
  private statusIntervalId: number | null = null;
  private statusRefreshToken = 0;
  private cleanupContainerEl: HTMLElement | null = null;
  private cleanupHandler: (() => void) | null = null;

  constructor(options: SettingsServerSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.notifyModelCatalogStatus = options.notifyModelCatalogStatus;
    this.onDispose = options.onDispose;
    this.onServerStateChange = options.onServerStateChange;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.server.title'),
      t('settings.quickNav.serverDesc'),
    );

    this.renderModeSetting(containerEl);
    if (this.isLocalMode()) this.renderLocalSettings(containerEl);
    else this.renderRemoteSettings(containerEl);
    this.renderAuthSettings(containerEl);
    this.renderStatusSetting(containerEl);
    this.registerContainerCleanup(containerEl);

    void this.refreshStatus();
    this.statusIntervalId = window.setInterval(() => void this.refreshStatus(), 2000);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    switch (secondaryTabId) {
      case 'connection':
        this.renderModeSetting(containerEl);
        if (this.isLocalMode()) this.renderLocalSettings(containerEl);
        else this.renderRemoteSettings(containerEl);
        break;
      case 'auth':
        this.renderAuthSettings(containerEl);
        break;
      case 'status':
        this.renderStatusSetting(containerEl);
        this.registerContainerCleanup(containerEl);
        void this.refreshStatus();
        this.statusIntervalId = window.setInterval(() => void this.refreshStatus(), 2000);
    }
  }

  dispose(): void {
    this.statusRefreshToken += 1;
    this.statusSetting = null;
    this.actionButton = null;
    this.stopButton = null;
    this.refreshButton = null;

    if (this.statusIntervalId !== null) {
      window.clearInterval(this.statusIntervalId);
      this.statusIntervalId = null;
    }

    if (this.cleanupContainerEl && this.cleanupHandler) {
      this.cleanupContainerEl.removeEventListener('unload', this.cleanupHandler);
    }
    this.cleanupContainerEl = null;
    this.cleanupHandler = null;
    this.onDispose?.();
  }

  async refreshStatus(): Promise<void> {
    if (!this.statusSetting) {
      return;
    }
    if (!this.isOpenCodeActive()) {
      return;
    }

    const refreshToken = ++this.statusRefreshToken;
    const isLocalMode = this.isLocalMode();
    const snapshot = await this.collectStatusSnapshot(isLocalMode);
    if (refreshToken !== this.statusRefreshToken || !this.statusSetting) {
      return;
    }

    this.statusSetting.setDesc(this.buildStatusDescription(snapshot));
    this.updateStatusButtons(snapshot, isLocalMode);
    this.notifyModelCatalogStatus();
  }

  private renderModeSetting(containerEl: HTMLElement): void {
    const modeSetting = new Setting(containerEl)
      .setName(t('settings.server.mode.name'))
      .setDesc(t('settings.server.mode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('local', t('settings.server.mode.local'))
          .addOption('remote', t('settings.server.mode.remote'))
          .setValue(this.plugin.settings.server.mode)
          .onChange(async (value) => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            this.plugin.settings.server.mode = value as 'local' | 'remote';
            if (value === 'local' && this.plugin.settings.server.auth.type === 'bearer') {
              this.plugin.settings.server.auth.type = 'none';
            }
            if (value === 'remote' && !this.plugin.settings.server.remote.baseUrl.trim()) {
              this.plugin.settings.server.remote.baseUrl = `http://${this.plugin.settings.server.local.host}:${this.plugin.settings.server.local.port}`;
            }
            await this.plugin.saveSettings();
            this.requestDisplayRefresh();
          });
      });
    this.addHelpButton(modeSetting, 'mode');
  }

  private renderLocalSettings(containerEl: HTMLElement): void {
    const autoStartSetting = new Setting(containerEl)
      .setName(t('settings.server.autoStart.name'))
      .setDesc(t('settings.server.autoStart.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.server.local.autoStart)
          .onChange(async (value) => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            this.plugin.settings.server.local.autoStart = value;
            await this.plugin.saveSettings();
          })
      );
    this.addHelpButton(autoStartSetting, 'autoStart');

    const executablePathSetting = new Setting(containerEl)
      .setName(t('settings.server.executablePath.name'))
      .setDesc(t('settings.server.executablePath.desc')).setClass('opencodian-wide-text-setting')
      .addText((text) => {
        const commitExecutablePathChange = async () => {
          if (!this.ensureOpenCodeActive()) {
            text.setValue(this.plugin.settings.server.local.executablePath);
            return;
          }
          const nextPath = text.inputEl.value.trim();
          if (nextPath !== this.plugin.settings.server.local.executablePath) {
            this.plugin.settings.server.local.executablePath = nextPath;
            await this.plugin.saveSettings();
          }
          text.setValue(this.plugin.settings.server.local.executablePath);
        };

        const placeholder = process.platform === 'win32'
          ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\opencode.cmd'
          : `${process.env.HOME ?? '/Users/you'}/.opencode/bin/opencode`;
        text.setPlaceholder(placeholder).setValue(this.plugin.settings.server.local.executablePath);
        this.bindCommitOnNativeTextEvents(text, commitExecutablePathChange);
      });
    this.addHelpButton(executablePathSetting, 'executablePath');

    const hostSetting = new Setting(containerEl)
      .setName(t('settings.server.host.name'))
      .setDesc(t('settings.server.host.desc'))
      .addText((text) => {
        const commitHostChange = async () => {
          if (!this.ensureOpenCodeActive()) {
            text.setValue(this.plugin.settings.server.local.host);
            return;
          }
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

        text.setPlaceholder('127.0.0.1').setValue(this.plugin.settings.server.local.host);
        this.bindCommitOnNativeTextEvents(text, commitHostChange);
      });
    this.addHelpButton(hostSetting, 'host');

    const portSetting = new Setting(containerEl)
      .setName(t('settings.server.port.name'))
      .setDesc(t('settings.server.port.desc'))
      .addText((text) => {
        const commitPortChange = async () => {
          if (!this.ensureOpenCodeActive()) {
            text.setValue(String(this.plugin.settings.server.local.port));
            return;
          }
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

        text.setPlaceholder('4196').setValue(String(this.plugin.settings.server.local.port));
        this.bindCommitOnNativeTextEvents(text, commitPortChange);
      });
    this.addHelpButton(portSetting, 'port');
  }

  private bindCommitOnNativeTextEvents(text: TextComponent, commit: () => Promise<void>): void {
    text.inputEl.addEventListener('change', () => void commit());
    text.inputEl.addEventListener('blur', () => void commit());
    text.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        text.inputEl.blur();
      }
    });
  }

  private renderRemoteSettings(containerEl: HTMLElement): void {
    const remoteUrlSetting = new Setting(containerEl)
      .setName(t('settings.server.remoteUrl.name'))
      .setDesc(t('settings.server.remoteUrl.desc')).setClass('opencodian-wide-text-setting')
      .addText((text) =>
        text
          .setPlaceholder('https://ai.example.com')
          .setValue(this.plugin.settings.server.remote.baseUrl)
          .onChange(async (value) => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            this.plugin.settings.server.remote.baseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );
    this.addHelpButton(remoteUrlSetting, 'remoteUrl');
  }

  private renderAuthSettings(containerEl: HTMLElement): void {
    const isLocalMode = this.isLocalMode();
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
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            this.plugin.settings.server.auth.type = value as 'none' | 'basic' | 'bearer';
            await this.plugin.saveSettings();
            this.requestDisplayRefresh();
          });
      });
    this.addHelpButton(authSetting, 'auth');

    if (this.plugin.settings.server.auth.type === 'basic') {
      const usernameSetting = new Setting(containerEl)
        .setName(t('settings.server.auth.username.name'))
        .setDesc(t('settings.server.auth.username.desc'))
        .addText((text) =>
          text
            .setPlaceholder('opencode')
            .setValue(this.plugin.settings.server.auth.username)
            .onChange(async (value) => {
              if (!this.ensureOpenCodeActive()) {
                return;
              }
              this.plugin.settings.server.auth.username = value.trim() || 'opencode';
              await this.plugin.saveSettings();
            })
        );
      this.addHelpButton(usernameSetting, 'username');

      const passwordSetting = new Setting(containerEl)
        .setName(t('settings.server.auth.password.name'))
        .setDesc(t('settings.server.auth.password.desc'))
        .addText((text) => {
          text
            .setPlaceholder('••••••••')
            .setValue(this.plugin.settings.server.auth.password)
            .onChange(async (value) => {
              if (!this.ensureOpenCodeActive()) {
                return;
              }
              this.plugin.settings.server.auth.password = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.type = 'password';
        });
      this.addHelpButton(passwordSetting, 'password');
    }

    if (!isLocalMode && this.plugin.settings.server.auth.type === 'bearer') {
      const tokenSetting = new Setting(containerEl)
        .setName(t('settings.server.auth.token.name'))
        .setDesc(t('settings.server.auth.token.desc')).setClass('opencodian-wide-text-setting')
        .addText((text) => {
          text
            .setPlaceholder('Bearer token')
            .setValue(this.plugin.settings.server.auth.token)
            .onChange(async (value) => {
              if (!this.ensureOpenCodeActive()) {
                return;
              }
              this.plugin.settings.server.auth.token = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = 'password';
        });
      this.addHelpButton(tokenSetting, 'token');
    }
  }

  private renderStatusSetting(containerEl: HTMLElement): void {
    const isLocalMode = this.isLocalMode();
    const statusSetting = new Setting(containerEl)
      .setName(t('settings.server.status.name'))
      .setDesc(t('settings.server.status.desc'));
    this.addHelpButton(statusSetting, 'status');

    statusSetting
      .addButton((button) => {
        this.actionButton = button;
        button
          .setButtonText(isLocalMode ? t('settings.server.status.start') : t('settings.server.status.test'))
          .setCta()
          .onClick(async () => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            button.setDisabled(true);
            try {
              if (isLocalMode) {
                await this.plugin.openCodeService.start();
                new Notice(t('settings.server.started'));
              } else {
                const isHealthy = await this.plugin.openCodeService.checkHealth();
                new Notice(
                  isHealthy ? t('settings.server.testSuccess') : t('settings.server.testFailed'),
                );
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : t('settings.server.startFailed');
              new Notice(message);
            }
            await this.refreshStatus();
          });
      })
      .addButton((button) => {
        this.stopButton = button;
        button
          .setButtonText(t('settings.server.status.stop'))
          .onClick(async () => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            button.setDisabled(true);
            await this.plugin.openCodeService.stop();
            new Notice(t('settings.server.stopped'));
            await this.refreshStatus();
          });
      })
      .addButton((button) => {
        this.refreshButton = button;
        button
          .setButtonText(t('settings.server.status.refresh'))
          .onClick(async () => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            button.setDisabled(true);
            const isLocalModeNow = this.isLocalMode();
            const snapshot = await this.collectStatusSnapshot(isLocalModeNow);

            if (this.refreshButton !== button) {
              return;
            }

            await this.refreshStatus();
            new Notice(snapshot.isHealthy
              ? t('settings.server.status.refreshHealthy')
              : t('settings.server.status.refreshUnhealthy'));
            button.setDisabled(false);
          });
      });

    this.statusSetting = statusSetting;
  }

  private async collectStatusSnapshot(isLocalMode: boolean): Promise<ServerStatusSnapshot> {
    const isHealthy = await this.plugin.openCodeService.checkHealth();
    const diagnostics = this.plugin.openCodeService.getServerDiagnostics();
    const internalStatus = this.plugin.openCodeService.getServerStatus();
    const isExternalServer = isHealthy
      && internalStatus !== 'conflict'
      && (internalStatus === 'stopped' || !this.plugin.openCodeService.isServerProcessRunning());

    this.onServerStateChange({
      healthy: isHealthy,
      status: internalStatus,
    });

    return {
      diagnostics,
      internalStatus,
      isExternalServer,
      isHealthy,
      statusText: this.getStatusText({
        diagnostics,
        internalStatus,
        isExternalServer,
        isHealthy,
        isLocalMode,
      }),
    };
  }

  private getStatusText(state: {
    diagnostics: OpenCodeServerDiagnostics;
    internalStatus: OpenCodeServerStatus;
    isExternalServer: boolean;
    isHealthy: boolean;
    isLocalMode: boolean;
  }): string {
    if (state.isLocalMode) {
      if (state.internalStatus === 'conflict') {
        return t('settings.server.status.localConflict');
      }
      if (state.isHealthy && state.diagnostics.reason === 'local-orphan-restarted') {
        return t('settings.server.status.localRecovered');
      }
      if (state.isHealthy && state.isExternalServer) {
        return t('settings.server.status.localExternal');
      }
      if (state.isHealthy) {
        return t('settings.server.status.localManaged');
      }
      if (this.isBusyStatus(state.internalStatus)) {
        return t('settings.server.status.starting');
      }
      return t('settings.server.status.stopped');
    }

    if (state.isHealthy) {
      return t('settings.server.status.remoteConnected');
    }

    if (this.isBusyStatus(state.internalStatus)) {
      return t('settings.server.status.starting');
    }

    return t('settings.server.status.stopped');
  }

  private buildStatusDescription(snapshot: ServerStatusSnapshot): string {
    const healthIndicator = snapshot.isHealthy ? '🟢' : '🔴';
    return `${healthIndicator} ${snapshot.statusText}`;
  }

  private updateStatusButtons(snapshot: ServerStatusSnapshot, isLocalMode: boolean): void {
    if (this.actionButton) {
      this.actionButton.setButtonText(
        isLocalMode ? t('settings.server.status.start') : t('settings.server.status.test'),
      );
      this.actionButton.setDisabled(
        isLocalMode
          ? (snapshot.isHealthy && !snapshot.isExternalServer) || this.isBusyStatus(snapshot.internalStatus)
          : snapshot.internalStatus === 'starting',
      );
    }

    if (this.stopButton) {
      this.stopButton.buttonEl.style.display = isLocalMode ? '' : 'none';
      this.stopButton.setButtonText(t('settings.server.status.stop'));
      this.stopButton.setDisabled(
        !snapshot.isHealthy || snapshot.isExternalServer || snapshot.internalStatus === 'conflict',
      );
    }

    if (this.refreshButton) {
      this.refreshButton.setButtonText(t('settings.server.status.refresh'));
    }
  }

  private isLocalMode(): boolean {
    return this.plugin.settings.server.mode === 'local';
  }

  private isOpenCodeActive(): boolean {
    return isOpenCodeSettingsBackendActive(this.plugin.settings);
  }

  private ensureOpenCodeActive(): boolean {
    if (this.isOpenCodeActive()) {
      return true;
    }
    new Notice(t('settings.server.notice.openCodeOnly'));
    return false;
  }

  private isBusyStatus(status: OpenCodeServerStatus): boolean {
    return status === 'starting' || status === 'restarting';
  }

  private addHelpButton(setting: Setting, topic: ServerHelpTopic): void {
    setting.addExtraButton((button) => {
      button
        .setIcon('help-circle')
        .setTooltip(t('settings.server.help.openDoc'))
        .onClick(() => {
          new ServerSettingHelpModal(this.app, topic).open();
        });
    });
  }

  private registerContainerCleanup(containerEl: HTMLElement): void {
    this.cleanupContainerEl = containerEl;
    this.cleanupHandler = () => {
      this.dispose();
    };
    containerEl.addEventListener('unload', this.cleanupHandler, { once: true });
  }
}
