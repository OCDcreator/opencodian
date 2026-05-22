/* eslint-disable max-lines -- Debug settings owns source-grouped diagnostics, Claude Code workbench, export actions, and platform path helpers. */
import * as fs from 'fs';
import { Notice, Setting, type TextComponent } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import { getCurrentPlatformDebugLogPath, getCurrentPlatformKey } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  clearRecentLogs,
  createLogger,
  getRecentLogEntries,
  getRecentLogTextForEntries,
  type LogEntry,
} from '../../shared';
import {
  CLAUDE_CODE_DEBUG_CHANNEL_IDS,
  type ClaudeCodeDebugChannelId,
  DEBUG_MODULE_REGISTRY,
  type DebugModuleKey,
  normalizeDebugRefreshIntervalMs,
} from '../../shared/debugModules';

const logger = createLogger('SettingsDebugSection');

type DebugPlatformKey = 'unix' | 'windows';
type DebugSectionBlockId = 'plugin' | 'opencode' | 'claude-code' | 'export';
interface ClaudeCodeStatusItem {
  label: string;
  value: string;
}

const DEBUG_MODULE_GROUPS: Record<Exclude<DebugSectionBlockId, 'export'>, readonly DebugModuleKey[]> = {
  plugin: [
    'app',
    'settings',
    'chat',
    'contextUsage',
    'tasks',
    'storage',
    'providerIcons',
    'visuals',
  ],
  opencode: ['server', 'models', 'streaming'],
  'claude-code': ['claudeCode'],
};

interface SettingsDebugSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
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

export class SettingsDebugSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;

  constructor(options: SettingsDebugSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void {}

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.debug.title'),
      t('settings.quickNav.debugDesc'),
    );
    const platformKey = getCurrentPlatformKey();

    this.addPluginDebugSettings(containerEl);
    this.addOpenCodeDebugSettings(containerEl);
    this.addClaudeCodeDebugSettings(containerEl);
    this.addExportDebugSettings(containerEl, platformKey);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const platformKey = getCurrentPlatformKey();

    const pluginBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'plugin' } });
    this.addPluginDebugSettings(pluginBlockEl);

    const opencodeBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'opencode' } });
    this.addOpenCodeDebugSettings(opencodeBlockEl);

    const claudeCodeBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'claude-code' } });
    this.addClaudeCodeDebugSettings(claudeCodeBlockEl);

    const exportBlockEl = containerEl.createDiv({
      cls: 'opencodian-debug-actions',
      attr: { 'data-section-block': 'export' },
    });
    this.addExportDebugSettings(exportBlockEl, platformKey);

    this.showActiveBlock(containerEl, secondaryTabId);
  }

  private addPluginDebugSettings(containerEl: HTMLElement): void {
    this.addDebugLoggingSetting(containerEl);
    this.addDebugModuleSettings(
      containerEl,
      DEBUG_MODULE_GROUPS.plugin,
      'settings.debug.modules.plugin.title',
      'settings.debug.modules.plugin.desc',
    );
  }

  private addOpenCodeDebugSettings(containerEl: HTMLElement): void {
    this.addDebugModuleSettings(
      containerEl,
      DEBUG_MODULE_GROUPS.opencode,
      'settings.debug.modules.opencode.title',
      'settings.debug.modules.opencode.desc',
    );
  }

  private addClaudeCodeDebugSettings(containerEl: HTMLElement): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'claude-code' },
    });

    const headerEl = workbenchEl.createDiv({ cls: 'opencodian-debug-workbench-header' });
    headerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.modules.claudeCode.title'),
    });
    headerEl.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t('settings.debug.modules.claudeCode.groupDesc'),
    });

    this.addClaudeCodeStatusStrip(workbenchEl);
    this.addClaudeCodePrivacyNote(workbenchEl);
    this.addDebugModuleSettings(
      workbenchEl,
      DEBUG_MODULE_GROUPS['claude-code'],
      'settings.debug.claude.module.title',
      'settings.debug.claude.module.desc',
    );
    this.addClaudeCodeChannelSettings(workbenchEl);
    this.addClaudeCodeLogPreview(workbenchEl);
  }

  private addClaudeCodeStatusStrip(containerEl: HTMLElement): void {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-debug-status-strip',
      attr: { 'data-claude-code-status-strip': 'true' },
    });
    this.renderClaudeCodeStatusStrip(statusEl);
  }

  private getClaudeCodeStatusItems(): ClaudeCodeStatusItem[] {
    const settings = this.plugin.settings;
    const claudeSettings = settings.backendSettings.claudeCode;
    const claudeLogs = this.getClaudeCodeLogEntries();
    const enabledChannelCount = CLAUDE_CODE_DEBUG_CHANNEL_IDS
      .filter((channelId) => claudeSettings.debugChannels[channelId] !== false)
      .length;
    return [
      {
        label: t('settings.debug.claude.status.backend'),
        value: settings.activeBackend === 'claude-code'
          ? t('settings.debug.claude.status.backendActive')
          : t('settings.debug.claude.status.backendInactive'),
      },
      {
        label: t('settings.debug.claude.status.logging'),
        value: settings.enableDebugLogging && settings.debugModuleSettings.claudeCode !== false
          ? t('settings.debug.claude.status.loggingOn')
          : t('settings.debug.claude.status.loggingOff'),
      },
      {
        label: t('settings.debug.claude.status.channels'),
        value: t('settings.debug.claude.status.channelsValue', {
          enabled: String(enabledChannelCount),
          total: String(CLAUDE_CODE_DEBUG_CHANNEL_IDS.length),
        }),
      },
      {
        label: t('settings.debug.claude.status.recent'),
        value: t('settings.debug.claude.status.recentValue', { count: String(claudeLogs.length) }),
      },
    ];
  }

  private renderClaudeCodeStatusStrip(statusEl: HTMLElement): void {
    statusEl.replaceChildren();
    for (const item of this.getClaudeCodeStatusItems()) {
      const itemEl = statusEl.createDiv({ cls: 'opencodian-debug-status-item' });
      itemEl.createDiv({ cls: 'opencodian-debug-status-label', text: item.label });
      itemEl.createDiv({ cls: 'opencodian-debug-status-value', text: item.value });
    }
  }

  private addClaudeCodePrivacyNote(containerEl: HTMLElement): void {
    const noteEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-privacy-note' });
    noteEl.createDiv({
      cls: 'opencodian-debug-privacy-title',
      text: t('settings.debug.claude.privacy.title'),
    });
    noteEl.createDiv({
      cls: 'opencodian-debug-privacy-copy',
      text: t('settings.debug.claude.privacy.desc'),
    });
  }

  private addClaudeCodeChannelSettings(containerEl: HTMLElement): void {
    const channelsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    channelsEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.claude.channels.title'),
    });
    channelsEl.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t('settings.debug.claude.channels.desc'),
    });

    const listEl = channelsEl.createDiv({ cls: 'opencodian-debug-channel-list' });
    for (const channelId of CLAUDE_CODE_DEBUG_CHANNEL_IDS) {
      new Setting(listEl)
        .setName(t(`settings.debug.claude.channel.${channelId}.name` as never))
        .setDesc(t(`settings.debug.claude.channel.${channelId}.desc` as never))
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.backendSettings.claudeCode.debugChannels[channelId] !== false)
            .onChange(async (value) => {
              this.plugin.settings.backendSettings.claudeCode.debugChannels = {
                ...this.plugin.settings.backendSettings.claudeCode.debugChannels,
                [channelId]: value,
              };
              await this.plugin.saveSettings();
              this.refreshClaudeCodeWorkbench(containerEl);
            })
        );
    }
  }

  private addClaudeCodeLogPreview(containerEl: HTMLElement): void {
    const logsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-log-panel' });
    logsEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.claude.logs.title'),
    });
    logsEl.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t('settings.debug.claude.logs.desc'),
    });

    const actionsEl = logsEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.addActionButton(actionsEl, t('settings.debug.claude.logs.copyVisible'), async () => {
      try {
        await navigator.clipboard.writeText(this.getVisibleClaudeCodeLogText());
        new Notice(t('settings.debug.claude.logs.copyVisibleSuccess'));
      } catch (error) {
        logger.error('Failed to copy Claude Code logs:', error);
        new Notice(t('settings.debug.claude.logs.copyVisibleFailed'));
      }
    });
    this.addActionButton(actionsEl, t('settings.debug.claude.logs.copyDiagnostics'), async () => {
      try {
        await navigator.clipboard.writeText(this.buildClaudeCodeDiagnosticReport());
        new Notice(t('settings.debug.actions.copySuccess'));
      } catch (error) {
        logger.error('Failed to copy Claude Code diagnostics:', error);
        new Notice(t('settings.debug.actions.copyFailed'));
      }
    });
    this.addActionButton(actionsEl, t('settings.debug.actions.clearLogs'), () => {
      clearRecentLogs();
      this.refreshClaudeCodeWorkbench(containerEl);
      new Notice(t('settings.debug.actions.clearLogsSuccess'));
    }, false);

    const previewEl = logsEl.createEl('pre', {
      cls: 'opencodian-debug-log-preview',
      attr: { 'data-claude-code-log-preview': 'true' },
    });
    previewEl.textContent = this.getVisibleClaudeCodeLogText();
  }

  private addActionButton(
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
    cta = true,
  ): HTMLButtonElement {
    const buttonEl = containerEl.createEl('button', {
      cls: cta ? 'mod-cta opencodian-debug-action-button' : 'opencodian-debug-action-button',
      text: label,
      attr: { type: 'button' },
    });
    buttonEl.addEventListener('click', () => {
      void onClick();
    });
    return buttonEl;
  }

  private addExportDebugSettings(
    containerEl: HTMLElement,
    platformKey: DebugPlatformKey,
  ): void {
    const exportEl = containerEl.createDiv({ cls: 'opencodian-debug-export' });
    exportEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.export.title'),
    });
    exportEl.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t('settings.debug.export.desc'),
    });

    this.addDebugRefreshIntervalSetting(exportEl);
    this.addInlineSerializedArgsSetting(exportEl);
    const logPathText = this.addLogPathSetting(exportEl, platformKey);
    this.addDiagnosticActionsSetting(exportEl, logPathText);
    this.addConsoleHelpBlock(exportEl);
  }

  private addDebugLoggingSetting(containerEl: HTMLElement): void {
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
  }

  private addInlineSerializedArgsSetting(containerEl: HTMLElement): void {
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
  }

  private addDebugModuleSettings(
    containerEl: HTMLElement,
    moduleKeys: readonly DebugModuleKey[],
    titleKey: Parameters<typeof t>[0],
    descriptionKey: Parameters<typeof t>[0],
  ): void {
    const modulesEl = containerEl.createDiv({ cls: 'opencodian-debug-modules' });
    modulesEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t(titleKey),
    });
    modulesEl.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t(descriptionKey),
    });

    const visibleModuleKeys = new Set<DebugModuleKey>(moduleKeys);
    for (const debugModule of DEBUG_MODULE_REGISTRY) {
      if (!visibleModuleKeys.has(debugModule.key)) {
        continue;
      }
      new Setting(modulesEl)
        .setName(t(debugModule.labelKey as never))
        .setDesc(t(debugModule.descriptionKey as never))
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.debugModuleSettings[debugModule.key])
            .onChange(async (value) => {
              this.plugin.settings.debugModuleSettings = {
                ...this.plugin.settings.debugModuleSettings,
                [debugModule.key]: value,
              };
              await this.plugin.saveSettings();
            })
        );
    }
  }

  private addDebugRefreshIntervalSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.debug.refreshInterval.name'))
      .setDesc(t('settings.debug.refreshInterval.desc'))
      .addText((text) => {
        text
          .setPlaceholder(String(normalizeDebugRefreshIntervalMs(undefined)))
          .setValue(String(this.plugin.settings.debugRefreshIntervalMs))
          .onChange(async (value) => {
            this.plugin.settings.debugRefreshIntervalMs = normalizeDebugRefreshIntervalMs(value);
            await this.plugin.saveSettings();
          });
      });
  }

  private getClaudeCodeLogEntries(): LogEntry[] {
    return getRecentLogEntries()
      .filter((entry) => entry.moduleKey === 'claudeCode')
      .filter((entry) => {
        const channel = entry.channel;
        if (!this.isClaudeCodeDebugChannelId(channel)) {
          return true;
        }
        return this.plugin.settings.backendSettings.claudeCode.debugChannels[channel] !== false;
      });
  }

  private getVisibleClaudeCodeLogText(): string {
    const entries = this.getClaudeCodeLogEntries().slice(-20);
    return getRecentLogTextForEntries(entries) || t('settings.debug.claude.logs.empty');
  }

  private buildClaudeCodeDiagnosticReport(): string {
    const settings = this.plugin.settings;
    const claudeSettings = settings.backendSettings.claudeCode;
    const enabledChannels = CLAUDE_CODE_DEBUG_CHANNEL_IDS
      .filter((channelId) => claudeSettings.debugChannels[channelId] !== false)
      .join(', ');
    return [
      '# OpenCodian Claude Code Diagnostic Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      this.plugin.getDebugBuildIdentityText(),
      '',
      '## Claude Code',
      `Enabled: ${settings.enabledBackends.includes('claude-code')}`,
      `Active: ${settings.activeBackend === 'claude-code'}`,
      `Debug logging: ${settings.enableDebugLogging}`,
      `Debug module enabled: ${settings.debugModuleSettings.claudeCode}`,
      `Enabled debug channels: ${enabledChannels || '(none)'}`,
      `Model: ${claudeSettings.model || '(default)'}`,
      `Effort: ${claudeSettings.effort}`,
      `Permission mode: ${claudeSettings.permissionMode}`,
      `Setting sources: ${claudeSettings.settingSources.join(', ') || '(none)'}`,
      `Additional directories: ${claudeSettings.additionalDirectories.length}`,
      `Allowed tools configured: ${claudeSettings.allowedTools.length}`,
      `Disallowed tools configured: ${claudeSettings.disallowedTools.length}`,
      `Environment variables configured: ${Object.keys(claudeSettings.env).length}`,
      `File checkpoint: ${claudeSettings.enableFileCheckpointing}`,
      `Hook event stream: ${claudeSettings.includeHookEvents}`,
      `Forward subagent text: ${claudeSettings.forwardSubagentText}`,
      `Subagent progress summaries: ${claudeSettings.agentProgressSummaries}`,
      '',
      '## Recent Claude Code Logs',
      this.getVisibleClaudeCodeLogText(),
      '',
    ].join('\n');
  }

  private refreshClaudeCodeWorkbench(containerEl: HTMLElement): void {
    const statusEl = containerEl.querySelector('[data-claude-code-status-strip="true"]');
    if (statusEl instanceof HTMLElement) {
      this.renderClaudeCodeStatusStrip(statusEl);
    }
    const previewEl = containerEl.querySelector('[data-claude-code-log-preview="true"]');
    if (previewEl) {
      previewEl.textContent = this.getVisibleClaudeCodeLogText();
    }
  }

  private isClaudeCodeDebugChannelId(value: unknown): value is ClaudeCodeDebugChannelId {
    return typeof value === 'string'
      && (CLAUDE_CODE_DEBUG_CHANNEL_IDS as readonly string[]).includes(value);
  }

  private addLogPathSetting(
    containerEl: HTMLElement,
    platformKey: DebugPlatformKey,
  ): TextComponent | null {
    let logPathText: TextComponent | null = null;
    const platformLabel = this.getDebugPathPlatformLabel(platformKey);

    new Setting(containerEl)
      .setName(t('settings.debug.logPath.name'))
      .setDesc(t('settings.debug.logPath.desc', { platform: platformLabel }))
      .setClass('opencodian-wide-text-setting')
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
      .addButton((button) => {
        button
          .setButtonText(t('settings.debug.logPath.choose'))
          .onClick(async () => {
            const pickedPath = await this.pickDirectory(
              getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths),
            );
            if (!pickedPath) {
              return;
            }
            this.plugin.settings.debugLogPaths[platformKey] = pickedPath;
            await this.plugin.saveSettings();
            logPathText?.setValue(pickedPath);
          });
      });

    return logPathText;
  }

  private addDiagnosticActionsSetting(
    containerEl: HTMLElement,
    logPathText: TextComponent | null,
  ): void {
    new Setting(containerEl)
      .setName(t('settings.debug.actions.name'))
      .setDesc(t('settings.debug.actions.desc'))
      .addButton((button) => {
        button
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
      .addButton((button) => {
        button
          .setButtonText(t('settings.debug.actions.generate'))
          .setCta()
          .onClick(async () => {
            try {
              const outputPath = await this.generateDiagnosticLogFile((savedPath) => {
                logPathText?.setValue(savedPath);
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
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.debug.actions.clearLogs'))
          .onClick(() => {
            clearRecentLogs();
            new Notice(t('settings.debug.actions.clearLogsSuccess'));
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.debug.actions.copyVersion'))
          .onClick(async () => {
            try {
              await navigator.clipboard.writeText(this.plugin.getDebugBuildIdentityText());
              new Notice(t('settings.debug.actions.copyVersionSuccess'));
            } catch (error) {
              logger.error('Failed to copy version/build identity:', error);
              new Notice(t('settings.debug.actions.copyVersionFailed'));
            }
          });
      });
  }

  private addConsoleHelpBlock(containerEl: HTMLElement): void {
    const helpEl = containerEl.createDiv({ cls: 'opencodian-debug-help' });
    helpEl.createDiv({
      cls: 'opencodian-debug-help-intro',
      text: t('settings.debug.console.output'),
    });
    helpEl.createDiv({
      cls: 'opencodian-debug-help-title',
      text: t('settings.debug.console.howToOpen'),
    });

    this.addConsoleHelpItem(helpEl, 'windows', [
      t('settings.debug.console.windows.shortcut'),
      t('settings.debug.console.windows.menu'),
    ]);
    this.addConsoleHelpItem(helpEl, 'mac', [
      t('settings.debug.console.mac.shortcut'),
      t('settings.debug.console.mac.menu'),
    ]);

    helpEl.createDiv({
      cls: 'opencodian-debug-help-footer',
      text: t('settings.debug.console.consoleTab'),
    });
  }

  private addConsoleHelpItem(
    helpEl: HTMLElement,
    platform: 'windows' | 'mac',
    details: string[],
  ): void {
    const itemEl = helpEl.createDiv({ cls: 'opencodian-debug-help-item' });
    itemEl.createDiv({
      cls: 'opencodian-debug-help-platform',
      text: t(`settings.debug.console.${platform}.title`),
    });

    for (const detail of details) {
      itemEl.createDiv({
        cls: 'opencodian-debug-help-detail',
        text: detail,
      });
    }
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

  private getDebugPathPlatformLabel(platformKey: DebugPlatformKey): string {
    return platformKey === 'windows'
      ? t('settings.debug.logPath.platformWindows')
      : t('settings.debug.logPath.platformUnix');
  }

  private getDebugPathPlaceholder(platformKey: DebugPlatformKey): string {
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

  private showActiveBlock(containerEl: HTMLElement, activeTabId: string): void {
    containerEl.querySelectorAll('[data-section-block]').forEach((el) => {
      const blockEl = el as HTMLElement;
      blockEl.style.display = blockEl.dataset.sectionBlock === activeTabId ? '' : 'none';
    });
  }

}
