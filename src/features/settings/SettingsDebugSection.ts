/* eslint-disable max-lines -- Debug settings owns source-grouped diagnostics, Claude Code workbench, export actions, and platform path helpers. */
import * as fs from 'fs';
import { Notice, Setting, type TextComponent } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import { CODEX_TRACE_CHANNEL_IDS } from '../../core/agents/backend/diagnostics';
import { getCurrentPlatformDebugLogPath, getCurrentPlatformKey } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  clearRecentLogs,
  createLogger,
  getRecentLogEntries,
  getRecentLogTextForEntries,
  type LogEntry,
  sanitizeDiagnosticReport,
} from '../../shared';
import {
  CLAUDE_CODE_DEBUG_CHANNEL_IDS,
  type ClaudeCodeDebugChannelId,
  DEBUG_MODULE_REGISTRY,
  type DebugModuleKey,
  normalizeDebugRefreshIntervalMs,
} from '../../shared/debugModules';
import { ClaudeCodeDebugPanel } from './debug/ClaudeCodeDebugPanel';
import { CodexDebugPanel } from './debug/CodexDebugPanel';
import { OPEN_CODE_DEBUG_MODULE_KEYS, OpenCodeDebugPanel } from './debug/OpenCodeDebugPanel';
import type {
  ClaudeTraceDiagnosticsPort,
  CodexTraceDiagnosticsPort,
  DebugModuleGroupConfig,
  OpenCodeTraceDiagnosticsPort,
} from './debug/types';

const logger = createLogger('SettingsDebugSection');

type DebugPlatformKey = 'unix' | 'windows';
type DebugSectionBlockId = 'plugin' | 'opencode' | 'codex' | 'claude-code' | 'export';

interface DebugTabShellConfig {
  id: DebugSectionBlockId;
  title: string;
  description: string;
  badges: readonly string[];
}

interface DebugRenderOptions {
  includeIntro: boolean;
}

const DEBUG_MODULE_GROUPS: Record<'plugin', readonly DebugModuleKey[]> = {
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
};

interface SettingsDebugSectionOptions {
  plugin: OpenCodianPlugin;
  getOpenCodeDiagnostics?: () => OpenCodeTraceDiagnosticsPort | undefined;
  getCodexDiagnostics?: () => CodexTraceDiagnosticsPort | undefined;
  getClaudeDiagnostics?: () => ClaudeTraceDiagnosticsPort | undefined;
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
  private readonly claudeCodeDebugPanel: ClaudeCodeDebugPanel;
  private readonly codexDebugPanel: CodexDebugPanel;
  private readonly openCodeDebugPanel: OpenCodeDebugPanel;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;

  constructor(options: SettingsDebugSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.openCodeDebugPanel = new OpenCodeDebugPanel({
      settings: this.plugin.settings,
      getDiagnostics: options.getOpenCodeDiagnostics ?? (() => undefined),
      saveSettings: () => this.plugin.saveSettings(),
      pickDirectory: (defaultPath) => this.pickDirectory(defaultPath),
      addActionButton: (containerEl, label, onClick, cta) =>
        this.addActionButton(containerEl, label, onClick, cta),
      renderDebugModules: (containerEl, config) => this.addDebugModuleSettings(containerEl, config),
    });
    this.codexDebugPanel = new CodexDebugPanel({
      settings: this.plugin.settings,
      getDiagnostics: options.getCodexDiagnostics ?? (() => undefined),
      saveSettings: () => this.plugin.saveSettings(),
      pickDirectory: (defaultPath) => this.pickDirectory(defaultPath),
      addActionButton: (containerEl, label, onClick, cta) =>
        this.addActionButton(containerEl, label, onClick, cta),
    });
    this.claudeCodeDebugPanel = new ClaudeCodeDebugPanel({
      settings: this.plugin.settings,
      getDiagnostics: options.getClaudeDiagnostics ?? (() => undefined),
      saveSettings: () => this.plugin.saveSettings(),
      pickDirectory: (defaultPath) => this.pickDirectory(defaultPath),
      getValidatedExportDirectory: () => this.getValidatedClaudeTraceExportDirectory(),
      addActionButton: (containerEl, label, onClick, cta) =>
        this.addActionButton(containerEl, label, onClick, cta),
      renderDebugModules: (containerEl, config) => this.addDebugModuleSettings(containerEl, config),
      getVisibleLogEntryCount: () => this.getClaudeCodeLogEntries().length,
      getVisibleLogText: () => this.getVisibleClaudeCodeLogText(),
      buildDiagnosticReport: () => this.buildClaudeCodeDiagnosticReport(),
      clearVisibleLogs: () => clearRecentLogs(),
      reportVisibleLogCopyFailure: (error) => logger.error('Failed to copy Claude Code logs:', error),
      reportDiagnosticCopyFailure: (error) => logger.error('Failed to copy Claude Code diagnostics:', error),
    });
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
    this.openCodeDebugPanel.render(containerEl);
    this.claudeCodeDebugPanel.render(containerEl);
    this.addExportDebugSettings(containerEl, platformKey);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const platformKey = getCurrentPlatformKey();

    const pluginBlockEl = this.createDebugTabShell(containerEl, {
      id: 'plugin',
      title: t('settings.debug.modules.plugin.title'),
      description: t('settings.debug.modules.plugin.desc'),
      badges: [t('settings.debug.logging.name'), String(DEBUG_MODULE_GROUPS.plugin.length)],
    });
    this.addPluginDebugSettings(pluginBlockEl, { includeIntro: false });

    const opencodeBlockEl = this.createDebugTabShell(containerEl, {
      id: 'opencode',
      title: t('settings.debug.modules.opencode.title'),
      description: t('settings.debug.modules.opencode.desc'),
      badges: ['OpenCode', String(OPEN_CODE_DEBUG_MODULE_KEYS.length)],
    });
    this.openCodeDebugPanel.render(opencodeBlockEl, { includeIntro: false });

    const codexBlockEl = this.createDebugTabShell(containerEl, {
      id: 'codex',
      title: t('settings.debug.modules.codex.title'),
      description: t('settings.debug.modules.codex.desc'),
      badges: ['Codex', String(CODEX_TRACE_CHANNEL_IDS.length)],
    });
    this.codexDebugPanel.render(codexBlockEl, { includeIntro: false });

    const claudeCodeBlockEl = this.createDebugTabShell(containerEl, {
      id: 'claude-code',
      title: t('settings.debug.modules.claudeCode.title'),
      description: t('settings.debug.modules.claudeCode.groupDesc'),
      badges: ['Claude Code', String(CLAUDE_CODE_DEBUG_CHANNEL_IDS.length)],
    });
    this.claudeCodeDebugPanel.render(claudeCodeBlockEl, { includeIntro: false });

    const exportBlockEl = this.createDebugTabShell(containerEl, {
      id: 'export',
      title: t('settings.debug.export.title'),
      description: t('settings.debug.export.desc'),
      badges: [this.getDebugPathPlatformLabel(platformKey), 'BUILD_ID'],
    });
    this.addExportDebugSettings(exportBlockEl, platformKey, { includeIntro: false });

    this.showActiveBlock(containerEl, secondaryTabId);
  }

  private createDebugTabShell(containerEl: HTMLElement, config: DebugTabShellConfig): HTMLElement {
    const shellEl = containerEl.createDiv({
      cls: `opencodian-debug-tab-shell opencodian-debug-tab-shell-${config.id}`,
      attr: {
        'data-section-block': config.id,
        'data-debug-tab-shell': 'true',
      },
    });
    const headerEl = shellEl.createDiv({ cls: 'opencodian-debug-tab-header' });
    const copyEl = headerEl.createDiv({ cls: 'opencodian-debug-tab-copy' });
    copyEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: config.title,
    });
    copyEl.createDiv({
      cls: 'opencodian-settings-block-desc opencodian-debug-tab-desc',
      text: config.description,
    });

    const badgesEl = headerEl.createDiv({ cls: 'opencodian-debug-tab-badges' });
    for (const badge of config.badges) {
      badgesEl.createSpan({ cls: 'opencodian-debug-tab-badge', text: badge });
    }

    return shellEl.createDiv({ cls: 'opencodian-debug-tab-body' });
  }

  private addPluginDebugSettings(
    containerEl: HTMLElement,
    options: DebugRenderOptions = { includeIntro: true },
  ): void {
    this.addDebugLoggingSetting(containerEl);
    this.addDebugModuleSettings(
      containerEl,
      {
        moduleKeys: DEBUG_MODULE_GROUPS.plugin,
        titleKey: 'settings.debug.modules.plugin.title',
        descriptionKey: 'settings.debug.modules.plugin.desc',
        includeIntro: options.includeIntro,
      },
    );
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
    options: DebugRenderOptions = { includeIntro: true },
  ): void {
    const exportEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-export' });
    if (options.includeIntro) {
      exportEl.createEl('h4', {
        cls: 'opencodian-settings-subsection-heading',
        text: t('settings.debug.export.title'),
      });
      exportEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: t('settings.debug.export.desc'),
      });
    }

    this.addDebugRefreshIntervalSetting(exportEl);
    this.addInlineSerializedArgsSetting(exportEl);
    const logPathText = this.addLogPathSetting(exportEl, platformKey);
    this.addDiagnosticActionsSetting(exportEl, logPathText);
    this.addConsoleHelpBlock(exportEl);
  }

  private addDebugLoggingSetting(containerEl: HTMLElement): void {
    const loggingEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-debug-global-panel',
    });
    new Setting(loggingEl)
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
    config: DebugModuleGroupConfig,
  ): void {
    const modulesEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-modules' });
    if (config.includeIntro) {
      modulesEl.createEl('h4', {
        cls: 'opencodian-settings-subsection-heading',
        text: t(config.titleKey),
      });
      modulesEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: t(config.descriptionKey),
      });
    }

    const visibleModuleKeys = new Set<DebugModuleKey>(config.moduleKeys);
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
    const raw = [
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

    return sanitizeDiagnosticReport(raw);
  }

  private isClaudeCodeDebugChannelId(value: unknown): value is ClaudeCodeDebugChannelId {
    return typeof value === 'string'
      && (CLAUDE_CODE_DEBUG_CHANNEL_IDS as readonly string[]).includes(value);
  }

  private getValidatedClaudeTraceExportDirectory(): string | null {
    const targetDirectory = getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths).trim();
    return targetDirectory && fs.existsSync(targetDirectory) ? targetDirectory : null;
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
