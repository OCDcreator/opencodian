/* eslint-disable max-lines -- Debug settings owns source-grouped diagnostics, Claude Code workbench, export actions, and platform path helpers. */
import * as fs from 'fs';
import { Notice, Setting, type TextComponent } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import {
  CLAUDE_TRACE_CHANNEL_IDS,
  CODEX_TRACE_CHANNEL_IDS,
} from '../../core/agents/backend/diagnostics';
import {
  OPEN_CODE_TRACE_CHANNEL_IDS,
  resolveDefaultOpenCodeTraceDirectory,
} from '../../core/opencode/diagnostics';
import {
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getDefaultBackendSettings,
  getDefaultOpenCodeSessionTraceSettings,
} from '../../core/types';
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
import { resolveDefaultTraceDirectory } from '../../shared/diagnostics';

const logger = createLogger('SettingsDebugSection');

type DebugPlatformKey = 'unix' | 'windows';
type DebugSectionBlockId = 'plugin' | 'opencode' | 'codex' | 'claude-code' | 'export';
interface ClaudeCodeStatusItem {
  label: string;
  value: string;
}

interface DebugTabShellConfig {
  id: DebugSectionBlockId;
  title: string;
  description: string;
  badges: readonly string[];
}

interface DebugRenderOptions {
  includeIntro: boolean;
}

interface DebugModuleGroupConfig extends DebugRenderOptions {
  moduleKeys: readonly DebugModuleKey[];
  titleKey: Parameters<typeof t>[0];
  descriptionKey: Parameters<typeof t>[0];
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
  // Codex trace workbench owns its own channel toggles and has no debug-log modules.
  codex: [] as DebugModuleKey[],
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
      badges: ['OpenCode', String(DEBUG_MODULE_GROUPS.opencode.length)],
    });
    this.addOpenCodeDebugSettings(opencodeBlockEl, { includeIntro: false });

    const codexBlockEl = this.createDebugTabShell(containerEl, {
      id: 'codex',
      title: t('settings.debug.modules.codex.title'),
      description: t('settings.debug.modules.codex.desc'),
      badges: ['Codex', String(CODEX_TRACE_CHANNEL_IDS.length)],
    });
    this.addCodexDebugSettings(codexBlockEl, { includeIntro: false });

    const claudeCodeBlockEl = this.createDebugTabShell(containerEl, {
      id: 'claude-code',
      title: t('settings.debug.modules.claudeCode.title'),
      description: t('settings.debug.modules.claudeCode.groupDesc'),
      badges: ['Claude Code', String(CLAUDE_CODE_DEBUG_CHANNEL_IDS.length)],
    });
    this.addClaudeCodeDebugSettings(claudeCodeBlockEl, { includeIntro: false });

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

  private addOpenCodeDebugSettings(
    containerEl: HTMLElement,
    options: DebugRenderOptions = { includeIntro: true },
  ): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'opencode' },
    });
    if (options.includeIntro) {
      workbenchEl.createEl('h4', {
        cls: 'opencodian-settings-subsection-heading',
        text: t('settings.debug.modules.opencode.title'),
      });
      workbenchEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: t('settings.debug.modules.opencode.desc'),
      });
    }
    this.addOpenCodeTraceStatus(workbenchEl);
    this.addOpenCodeTraceControls(workbenchEl);
    this.addDebugModuleSettings(
      workbenchEl,
      {
        moduleKeys: DEBUG_MODULE_GROUPS.opencode,
        titleKey: 'settings.debug.modules.opencode.title',
        descriptionKey: 'settings.debug.modules.opencode.desc',
        includeIntro: false,
      },
    );
    this.addOpenCodeTraceActions(workbenchEl);
    this.addOpenCodeTraceCatalog(workbenchEl);
  }

  private addOpenCodeTraceStatus(containerEl: HTMLElement): void {
    const status = this.plugin.openCodeTraceService?.store.getStatus();
    const settings = this.getOpenCodeTraceSettings();
    const stripEl = containerEl.createDiv({
      cls: 'opencodian-opencode-trace-status',
      attr: { 'data-opencode-trace-status': 'true' },
    });
    const items = [
      [t('settings.debug.opencode.status.capture'), settings.enabled
        ? t('settings.debug.opencode.status.enabled')
        : t('settings.debug.opencode.status.disabled')],
      [t('settings.debug.opencode.status.storage'), status?.mode ?? 'disk'],
      [t('settings.debug.opencode.status.traces'), String(this.plugin.openCodeTraceService?.store.listSummaries(100).length ?? 0)],
      [t('settings.debug.opencode.status.size'), `${Math.round((status?.approximateBytes ?? 0) / 1024)} KiB`],
    ];
    for (const [label, value] of items) {
      const itemEl = stripEl.createDiv({ cls: 'opencodian-debug-status-item' });
      itemEl.createDiv({ cls: 'opencodian-debug-status-label', text: label });
      itemEl.createDiv({ cls: 'opencodian-debug-status-value', text: value });
    }
    if (status?.lastError) {
      stripEl.createDiv({
        cls: 'opencodian-debug-status-error',
        text: t('settings.debug.opencode.status.error', { error: status.lastError }),
      });
    }
  }

  private addOpenCodeTraceControls(containerEl: HTMLElement): void {
    const settings = this.getOpenCodeTraceSettings();
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    new Setting(controlsEl)
      .setName(t('settings.debug.opencode.enabled.name'))
      .setDesc(t('settings.debug.opencode.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.saveSettings();
        }));
    new Setting(controlsEl)
      .setName(t('settings.debug.opencode.preset.name'))
      .setDesc(t('settings.debug.opencode.preset.desc'))
      .addDropdown((dropdown) => dropdown
        .addOption('standard', t('settings.debug.opencode.preset.standard'))
        .addOption('full', t('settings.debug.opencode.preset.full'))
        .setValue(settings.consolePreset)
        .onChange(async (value) => {
          settings.consolePreset = value === 'full' ? 'full' : 'standard';
          await this.plugin.saveSettings();
        }));
    new Setting(controlsEl)
      .setName(t('settings.debug.opencode.storage.name'))
      .setDesc(t('settings.debug.opencode.storage.desc'))
      .setClass('opencodian-wide-text-setting')
      .addText((text) => {
        text
          .setPlaceholder(resolveDefaultOpenCodeTraceDirectory())
          .setValue(settings.storageDirectory)
          .onChange(async (value) => {
          settings.storageDirectory = value.trim();
          await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener('blur', () => {
          new Notice(t('settings.debug.opencode.storage.restart'));
        });
      })
      .addButton((button) => button
        .setButtonText(t('settings.debug.opencode.storage.choose'))
        .onClick(async () => {
          const selected = await this.pickDirectory(settings.storageDirectory);
          if (!selected) return;
          settings.storageDirectory = selected;
          await this.plugin.saveSettings();
          new Notice(t('settings.debug.opencode.storage.restart'));
        }));
    const channelsEl = controlsEl.createDiv({ cls: 'opencodian-debug-channel-list' });
    for (const channelId of OPEN_CODE_TRACE_CHANNEL_IDS) {
      new Setting(channelsEl)
        .setName(t(`settings.debug.opencode.channel.${channelId}.name` as never))
        .setDesc(t(`settings.debug.opencode.channel.${channelId}.desc` as never))
        .addToggle((toggle) => toggle
          .setValue(settings.consoleChannels[channelId] !== false)
          .onChange(async (value) => {
            settings.consoleChannels = { ...settings.consoleChannels, [channelId]: value };
            await this.plugin.saveSettings();
          }));
    }
  }

  private addOpenCodeTraceActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.addActionButton(actionsEl, t('settings.debug.opencode.actions.copySmart'), async () => {
      const actual = window.prompt(t('chat.opencodeDiagnostics.actualPrompt')) ?? undefined;
      const expected = window.prompt(t('chat.opencodeDiagnostics.expectedPrompt')) ?? undefined;
      const reproduction = window.prompt(t('chat.opencodeDiagnostics.reproductionPrompt')) ?? undefined;
      const report = await this.plugin.openCodeTraceService.reportBuilder.buildSmartReport(undefined, {
        actual,
        expected,
        reproduction,
      });
      await navigator.clipboard.writeText(report);
      new Notice(t('settings.debug.opencode.actions.copySuccess'));
    });
    this.addActionButton(actionsEl, t('settings.debug.opencode.actions.flush'), async () => {
      await this.plugin.openCodeTraceService.store.flush();
      new Notice(t('settings.debug.opencode.actions.flushSuccess'));
    }, false);
    this.addActionButton(actionsEl, t('settings.debug.opencode.actions.export'), async () => {
      const summary = this.plugin.openCodeTraceService.store.listSummaries(1)[0];
      if (!summary) {
        new Notice(t('settings.debug.opencode.recent.empty'));
        return;
      }
      const targetDirectory = await this.pickDirectory('');
      if (!targetDirectory) return;
      const exportedDirectory = await this.plugin.openCodeTraceService.store.exportTraceBundle(
        summary.traceId,
        targetDirectory,
      );
      new Notice(t('settings.debug.opencode.actions.exportSuccess', { path: exportedDirectory }));
    }, false);
    this.addActionButton(actionsEl, t('settings.debug.opencode.actions.clear'), async () => {
      if (!window.confirm(t('settings.debug.opencode.actions.clearConfirm'))) return;
      await this.plugin.openCodeTraceService.store.clear();
      const workbenchEl = containerEl.closest('[data-debug-workbench="opencode"]');
      if (workbenchEl instanceof HTMLElement) {
        workbenchEl.querySelector('[data-opencode-trace-catalog]')?.replaceChildren();
      }
      new Notice(t('settings.debug.opencode.actions.clearSuccess'));
    }, false);
  }

  private addOpenCodeTraceCatalog(containerEl: HTMLElement): void {
    const catalogEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-debug-log-panel',
      attr: { 'data-opencode-trace-catalog': 'true' },
    });
    catalogEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.opencode.recent.title'),
    });
    const filterSetting = new Setting(catalogEl)
      .setName(t('settings.debug.opencode.recent.anomaliesOnly'))
      .setDesc(t('settings.debug.opencode.recent.anomaliesOnlyDesc'));
    const rowsEl = catalogEl.createDiv({ cls: 'opencodian-debug-trace-rows' });
    const summaries = this.plugin.openCodeTraceService?.store.listSummaries(20) ?? [];
    const applyFilter = (anomaliesOnly: boolean) => {
      for (const row of rowsEl.querySelectorAll<HTMLElement>('.opencodian-debug-trace-row')) {
        row.toggleClass('is-hidden', anomaliesOnly && row.dataset.hasAnomaly !== 'true');
      }
    };
    filterSetting.addToggle((toggle) => toggle
      .setValue(false)
      .onChange((value) => applyFilter(value)));
    if (summaries.length === 0) {
      rowsEl.createDiv({ cls: 'opencodian-settings-block-desc', text: t('settings.debug.opencode.recent.empty') });
      return;
    }
    for (const summary of summaries) {
      const rowEl = rowsEl.createDiv({
        cls: 'opencodian-debug-trace-row',
        attr: {
          'data-has-anomaly': String(
            summary.highestSeverity === 'warning'
            || summary.highestSeverity === 'critical'
            || summary.highestSeverity === 'error',
          ),
        },
      });
      const copyEl = rowEl.createDiv({ cls: 'opencodian-debug-trace-copy' });
      copyEl.createDiv({ cls: 'opencodian-debug-trace-id', text: summary.sessionId ?? summary.traceId });
      copyEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: `${summary.lastUpdatedAt} · ${summary.eventCount} events · ${summary.highestSeverity}`,
      });
      const actionsEl = rowEl.createDiv({ cls: 'opencodian-debug-log-actions' });
      this.addActionButton(actionsEl, t('settings.debug.opencode.recent.copy'), async () => {
        const report = await this.plugin.openCodeTraceService.reportBuilder.buildSmartReport(summary.traceId);
        await navigator.clipboard.writeText(report);
      }, false);
      this.addActionButton(actionsEl, t('settings.debug.opencode.recent.delete'), async () => {
        await this.plugin.openCodeTraceService.store.deleteTrace(summary.traceId);
        rowEl.remove();
      }, false);
    }
  }

  private getOpenCodeTraceSettings() {
    this.plugin.settings.backendSettings.opencode ??= {
      sessionTrace: getDefaultOpenCodeSessionTraceSettings(),
    };
    return this.plugin.settings.backendSettings.opencode.sessionTrace;
  }

  private addCodexDebugSettings(
    containerEl: HTMLElement,
    options: DebugRenderOptions = { includeIntro: true },
  ): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'codex' },
    });
    if (options.includeIntro) {
      workbenchEl.createEl('h4', {
        cls: 'opencodian-settings-subsection-heading',
        text: t('settings.debug.modules.codex.title'),
      });
      workbenchEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: t('settings.debug.modules.codex.desc'),
      });
    }
    this.addCodexTraceStatus(workbenchEl);
    this.addCodexTraceControls(workbenchEl);
    this.addCodexTraceActions(workbenchEl);
    this.addCodexTraceCatalog(workbenchEl);
  }

  private addCodexTraceStatus(containerEl: HTMLElement): void {
    const status = this.plugin.codexTraceService?.store.getStatus();
    const settings = this.getCodexTraceSettings();
    const stripEl = containerEl.createDiv({
      cls: 'opencodian-codex-trace-status',
      attr: { 'data-codex-trace-status': 'true' },
    });
    const items = [
      [t('settings.debug.codex.status.capture'), settings.enabled
        ? t('settings.debug.codex.status.enabled')
        : t('settings.debug.codex.status.disabled')],
      [t('settings.debug.codex.status.storage'), status?.mode ?? 'disk'],
      [t('settings.debug.codex.status.traces'), String(this.plugin.codexTraceService?.store.listSummaries(100).length ?? 0)],
      [t('settings.debug.codex.status.size'), `${Math.round((status?.approximateBytes ?? 0) / 1024)} KiB`],
    ];
    for (const [label, value] of items) {
      const itemEl = stripEl.createDiv({ cls: 'opencodian-debug-status-item' });
      itemEl.createDiv({ cls: 'opencodian-debug-status-label', text: label });
      itemEl.createDiv({ cls: 'opencodian-debug-status-value', text: value });
    }
    if (status?.lastError) {
      stripEl.createDiv({
        cls: 'opencodian-debug-status-error',
        text: t('settings.debug.codex.status.error', { error: status.lastError }),
      });
    }
  }

  private addCodexTraceControls(containerEl: HTMLElement): void {
    const settings = this.getCodexTraceSettings();
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    new Setting(controlsEl)
      .setName(t('settings.debug.codex.enabled.name'))
      .setDesc(t('settings.debug.codex.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.saveSettings();
        }));
    new Setting(controlsEl)
      .setName(t('settings.debug.codex.preset.name'))
      .setDesc(t('settings.debug.codex.preset.desc'))
      .addDropdown((dropdown) => dropdown
        .addOption('standard', t('settings.debug.codex.preset.standard'))
        .addOption('full', t('settings.debug.codex.preset.full'))
        .setValue(settings.consolePreset)
        .onChange(async (value) => {
          settings.consolePreset = value === 'full' ? 'full' : 'standard';
          await this.plugin.saveSettings();
        }));
    new Setting(controlsEl)
      .setName(t('settings.debug.codex.storage.name'))
      .setDesc(t('settings.debug.codex.storage.desc'))
      .setClass('opencodian-wide-text-setting')
      .addText((text) => {
        text
          .setPlaceholder(resolveDefaultTraceDirectory('codex'))
          .setValue(settings.storageDirectory)
          .onChange(async (value) => {
            settings.storageDirectory = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener('blur', () => {
          new Notice(t('settings.debug.codex.storage.restart'));
        });
      })
      .addButton((button) => button
        .setButtonText(t('settings.debug.codex.storage.choose'))
        .onClick(async () => {
          const selected = await this.pickDirectory(settings.storageDirectory);
          if (!selected) return;
          settings.storageDirectory = selected;
          await this.plugin.saveSettings();
          new Notice(t('settings.debug.codex.storage.restart'));
        }));
    const channelsEl = controlsEl.createDiv({ cls: 'opencodian-debug-channel-list' });
    for (const channelId of CODEX_TRACE_CHANNEL_IDS) {
      new Setting(channelsEl)
        .setName(t(`settings.debug.codex.channel.${channelId}.name` as never))
        .setDesc(t(`settings.debug.codex.channel.${channelId}.desc` as never))
        .addToggle((toggle) => toggle
          .setValue(settings.consoleChannels[channelId] !== false)
          .onChange(async (value) => {
            settings.consoleChannels = { ...settings.consoleChannels, [channelId]: value };
            await this.plugin.saveSettings();
          }));
    }
    new Setting(controlsEl)
      .setName(t('settings.debug.codex.captureContent.name'))
      .setDesc(t('settings.debug.codex.captureContent.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.captureContent)
        .onChange(async (value) => {
          settings.captureContent = value;
          await this.plugin.saveSettings();
        }));
  }

  private addCodexTraceActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.addActionButton(actionsEl, t('settings.debug.codex.actions.copyReport'), async () => {
      const report = await this.plugin.codexTraceService.reportBuilder.buildSmartReport();
      await navigator.clipboard.writeText(report);
      new Notice(t('settings.debug.codex.actions.copySuccess'));
    });
    this.addActionButton(actionsEl, t('settings.debug.codex.actions.flush'), async () => {
      await this.plugin.codexTraceService.store.flush();
      new Notice(t('settings.debug.codex.actions.flushSuccess'));
    }, false);
    this.addActionButton(actionsEl, t('settings.debug.codex.actions.export'), async () => {
      const summary = this.plugin.codexTraceService.store.listSummaries(1)[0];
      if (!summary) {
        new Notice(t('settings.debug.codex.recent.empty'));
        return;
      }
      const targetDirectory = await this.pickDirectory('');
      if (!targetDirectory) return;
      const exportedDirectory = await this.plugin.codexTraceService.store.exportTraceBundle(
        summary.traceId,
        targetDirectory,
      );
      new Notice(t('settings.debug.codex.actions.exportSuccess', { path: exportedDirectory }));
    }, false);
    this.addActionButton(actionsEl, t('settings.debug.codex.actions.clear'), async () => {
      if (!window.confirm(t('settings.debug.codex.actions.clearConfirm'))) return;
      await this.plugin.codexTraceService.store.clear();
      const workbenchEl = containerEl.closest('[data-debug-workbench="codex"]');
      if (workbenchEl instanceof HTMLElement) {
        workbenchEl.querySelector('[data-codex-trace-catalog]')?.replaceChildren();
      }
      new Notice(t('settings.debug.codex.actions.clearSuccess'));
    }, false);
  }

  private addCodexTraceCatalog(containerEl: HTMLElement): void {
    const catalogEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-debug-log-panel',
      attr: { 'data-codex-trace-catalog': 'true' },
    });
    catalogEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.codex.recent.title'),
    });
    const filterSetting = new Setting(catalogEl)
      .setName(t('settings.debug.codex.recent.anomaliesOnly'))
      .setDesc(t('settings.debug.codex.recent.anomaliesOnlyDesc'));
    const rowsEl = catalogEl.createDiv({ cls: 'opencodian-debug-trace-rows' });
    const summaries = this.plugin.codexTraceService?.store.listSummaries(20) ?? [];
    const applyFilter = (anomaliesOnly: boolean) => {
      for (const row of rowsEl.querySelectorAll<HTMLElement>('.opencodian-debug-trace-row')) {
        row.toggleClass('is-hidden', anomaliesOnly && row.dataset.hasAnomaly !== 'true');
      }
    };
    filterSetting.addToggle((toggle) => toggle
      .setValue(false)
      .onChange((value) => applyFilter(value)));
    if (summaries.length === 0) {
      rowsEl.createDiv({ cls: 'opencodian-settings-block-desc', text: t('settings.debug.codex.recent.empty') });
      return;
    }
    for (const summary of summaries) {
      const rowEl = rowsEl.createDiv({
        cls: 'opencodian-debug-trace-row',
        attr: {
          'data-has-anomaly': String(
            summary.highestSeverity === 'warning'
            || summary.highestSeverity === 'critical'
            || summary.highestSeverity === 'error',
          ),
        },
      });
      const copyEl = rowEl.createDiv({ cls: 'opencodian-debug-trace-copy' });
      copyEl.createDiv({ cls: 'opencodian-debug-trace-id', text: summary.sessionId ?? summary.traceId });
      copyEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: `${summary.lastUpdatedAt} · ${summary.eventCount} events · ${summary.highestSeverity}`,
      });
      const rowActionsEl = rowEl.createDiv({ cls: 'opencodian-debug-log-actions' });
      this.addActionButton(rowActionsEl, t('settings.debug.codex.recent.copy'), async () => {
        const report = await this.plugin.codexTraceService.reportBuilder.buildSmartReport(summary.traceId);
        await navigator.clipboard.writeText(report);
      }, false);
      this.addActionButton(rowActionsEl, t('settings.debug.codex.recent.delete'), async () => {
        await this.plugin.codexTraceService.store.deleteTrace(summary.traceId);
        rowEl.remove();
      }, false);
    }
  }

  private getCodexTraceSettings() {
    this.plugin.settings.backendSettings.codex ??= getDefaultBackendSettings().codex;
    this.plugin.settings.backendSettings.codex.sessionTrace ??= getDefaultBackendSettings().codex.sessionTrace;
    return this.plugin.settings.backendSettings.codex.sessionTrace;
  }

  private addClaudeCodeDebugSettings(
    containerEl: HTMLElement,
    options: DebugRenderOptions = { includeIntro: true },
  ): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'claude-code' },
    });

    const statusContainerEl = options.includeIntro
      ? this.createClaudeCodeWorkbenchHeader(workbenchEl)
      : workbenchEl;

    this.addClaudeCodeStatusStrip(statusContainerEl);
    this.addClaudeCodePrivacyNote(workbenchEl);
    this.addDebugModuleSettings(
      workbenchEl,
      {
        moduleKeys: DEBUG_MODULE_GROUPS['claude-code'],
        titleKey: 'settings.debug.claude.module.title',
        descriptionKey: 'settings.debug.claude.module.desc',
        includeIntro: true,
      },
    );
    this.addClaudeCodeChannelSettings(workbenchEl);
    this.addClaudeTraceStatus(workbenchEl);
    this.addClaudeTraceControls(workbenchEl);
    this.addClaudeTraceActions(workbenchEl);
    this.addClaudeTraceCatalog(workbenchEl);
    this.addClaudeCodeLogPreview(workbenchEl);
  }

  private createClaudeCodeWorkbenchHeader(containerEl: HTMLElement): HTMLElement {
    const headerEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench-header opencodian-settings-block',
    });
    headerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.modules.claudeCode.title'),
    });
    headerEl.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t('settings.debug.modules.claudeCode.groupDesc'),
    });
    return headerEl;
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

  private addClaudeTraceStatus(containerEl: HTMLElement): void {
    const status = this.plugin.claudeTraceService?.getStorageStatus();
    const settings = this.getClaudeTraceSettings();
    const stripEl = containerEl.createDiv({
      cls: 'opencodian-debug-status-strip',
      attr: { 'data-claude-trace-status': 'true' },
    });
    const items = [
      [t('settings.debug.claude.status.capture'), settings.enabled
        ? t('settings.debug.codex.status.enabled')
        : t('settings.debug.codex.status.disabled')],
      [t('settings.debug.claude.status.mode'), status?.mode ?? 'disk'],
      [t('settings.debug.claude.status.directory'), status?.rootDirectory || settings.storageDirectory || resolveDefaultTraceDirectory('claude')],
      [t('settings.debug.claude.status.queued'), String(status?.queuedEvents ?? 0)],
      [t('settings.debug.claude.status.size'), `${Math.round((status?.approximateBytes ?? 0) / 1024)} KiB`],
      [t('settings.debug.claude.status.dropped'), String(status?.droppedEvents ?? 0)],
    ];
    for (const [label, value] of items) {
      const itemEl = stripEl.createDiv({ cls: 'opencodian-debug-status-item' });
      itemEl.createDiv({ cls: 'opencodian-debug-status-label', text: label });
      itemEl.createDiv({ cls: 'opencodian-debug-status-value', text: value });
    }
    if (status?.lastError) {
      stripEl.createDiv({
        cls: 'opencodian-debug-status-error',
        text: t('settings.debug.claude.status.error', { error: status.lastError }),
      });
    }
  }

  private addClaudeTraceControls(containerEl: HTMLElement): void {
    const settings = this.getClaudeTraceSettings();
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    new Setting(controlsEl)
      .setName(t('settings.debug.claude.enabled.name'))
      .setDesc(t('settings.debug.claude.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.saveSettings();
        }));
    new Setting(controlsEl)
      .setName(t('settings.debug.claude.preset.name'))
      .setDesc(t('settings.debug.claude.preset.desc'))
      .addDropdown((dropdown) => dropdown
        .addOption('off', t('settings.debug.claude.preset.off'))
        .addOption('standard', t('settings.debug.claude.preset.standard'))
        .addOption('full', t('settings.debug.claude.preset.full'))
        .setValue(settings.consolePreset)
        .onChange(async (value) => {
          settings.consolePreset = value === 'full' || value === 'standard' ? value : 'off';
          await this.plugin.saveSettings();
        }));
    new Setting(controlsEl)
      .setName(t('settings.debug.claude.storage.name'))
      .setDesc(t('settings.debug.claude.storage.desc'))
      .setClass('opencodian-wide-text-setting')
      .addText((text) => {
        text
          .setPlaceholder(resolveDefaultTraceDirectory('claude'))
          .setValue(settings.storageDirectory)
          .onChange(async (value) => {
            settings.storageDirectory = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener('blur', () => {
          new Notice(t('settings.debug.claude.storage.restart'));
        });
      })
      .addButton((button) => button
        .setButtonText(t('settings.debug.claude.storage.choose'))
        .onClick(async () => {
          const selected = await this.pickDirectory(settings.storageDirectory);
          if (!selected) return;
          settings.storageDirectory = selected;
          await this.plugin.saveSettings();
          new Notice(t('settings.debug.claude.storage.restart'));
        }));
    const channelsEl = controlsEl.createDiv({ cls: 'opencodian-debug-channel-list' });
    for (const channelId of CLAUDE_TRACE_CHANNEL_IDS) {
      new Setting(channelsEl)
        .setName(t(`settings.debug.claude.channel.${channelId}.name` as never))
        .setDesc(t(`settings.debug.claude.channel.${channelId}.desc` as never))
        .addToggle((toggle) => toggle
          .setValue(settings.consoleChannels[channelId] !== false)
          .onChange(async (value) => {
            settings.consoleChannels = { ...settings.consoleChannels, [channelId]: value };
            await this.plugin.saveSettings();
          }));
    }
  }

  private addClaudeTraceActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.addActionButton(actionsEl, t('settings.debug.claude.actions.copyReport'), async () => {
      const report = await this.plugin.claudeTraceService?.buildSmartReport();
      if (!report) return;
      await navigator.clipboard.writeText(report);
      new Notice(t('settings.debug.claude.actions.copySuccess'));
    });
    this.addActionButton(actionsEl, t('settings.debug.claude.actions.export'), async () => {
      const summary = this.plugin.claudeTraceService?.listRecentTraces(1)[0];
      if (!summary) {
        new Notice(t('settings.debug.claude.recent.empty'));
        return;
      }
      const targetDirectory = getCurrentPlatformDebugLogPath(this.plugin.settings.debugLogPaths).trim();
      if (!targetDirectory || !fs.existsSync(targetDirectory)) {
        new Notice(t('settings.debug.claude.actions.exportDirectoryUnavailable'));
        return;
      }
      const exportedDirectory = await this.plugin.claudeTraceService?.exportTrace(summary.traceId, targetDirectory);
      if (exportedDirectory) {
        new Notice(t('settings.debug.claude.actions.exportSuccess', { path: exportedDirectory }));
      }
    }, false);
    this.addActionButton(actionsEl, t('settings.debug.claude.actions.clear'), async () => {
      if (!window.confirm(t('settings.debug.claude.actions.clearConfirm'))) return;
      await this.plugin.claudeTraceService?.clearAll();
      const workbenchEl = containerEl.closest('[data-debug-workbench="claude-code"]');
      if (workbenchEl instanceof HTMLElement) {
        this.refreshClaudeTraceCatalog(workbenchEl);
      }
      new Notice(t('settings.debug.claude.actions.clearSuccess'));
    }, false);
  }

  private addClaudeTraceCatalog(containerEl: HTMLElement): void {
    const catalogEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-debug-log-panel',
      attr: { 'data-claude-trace-catalog': 'true' },
    });
    this.renderClaudeTraceCatalog(catalogEl);
  }

  private refreshClaudeTraceCatalog(containerEl: HTMLElement): void {
    const catalogEl = containerEl.querySelector('[data-claude-trace-catalog="true"]');
    if (catalogEl instanceof HTMLElement) this.renderClaudeTraceCatalog(catalogEl);
  }

  private renderClaudeTraceCatalog(catalogEl: HTMLElement): void {
    catalogEl.replaceChildren();
    catalogEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.claude.recent.title'),
    });
    const filterSetting = new Setting(catalogEl)
      .setName(t('settings.debug.claude.recent.anomaliesOnly'))
      .setDesc(t('settings.debug.claude.recent.anomaliesOnlyDesc'));
    const rowsEl = catalogEl.createDiv({ cls: 'opencodian-debug-trace-rows' });
    const summaries = this.plugin.claudeTraceService?.listRecentTraces(20) ?? [];
    const applyFilter = (anomaliesOnly: boolean) => {
      for (const row of rowsEl.querySelectorAll<HTMLElement>('.opencodian-debug-trace-row')) {
        row.toggleClass('is-hidden', anomaliesOnly && row.dataset.hasAnomaly !== 'true');
      }
    };
    filterSetting.addToggle((toggle) => toggle
      .setValue(false)
      .onChange((value) => applyFilter(value)));
    if (summaries.length === 0) {
      rowsEl.createDiv({ cls: 'opencodian-settings-block-desc', text: t('settings.debug.claude.recent.empty') });
      return;
    }
    for (const summary of summaries) {
      const rowEl = rowsEl.createDiv({
        cls: 'opencodian-debug-trace-row',
        attr: {
          'data-has-anomaly': String(
            summary.highestSeverity === 'warning'
            || summary.highestSeverity === 'critical'
            || summary.highestSeverity === 'error',
          ),
        },
      });
      const copyEl = rowEl.createDiv({ cls: 'opencodian-debug-trace-copy' });
      copyEl.createDiv({ cls: 'opencodian-debug-trace-id', text: summary.sessionId ?? summary.traceId });
      copyEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: `${summary.lastUpdatedAt} · ${summary.eventCount} events · ${summary.highestSeverity}`,
      });
      const rowActionsEl = rowEl.createDiv({ cls: 'opencodian-debug-log-actions' });
      this.addActionButton(rowActionsEl, t('settings.debug.claude.recent.copy'), async () => {
        const report = await this.plugin.claudeTraceService?.buildSmartReport(summary.traceId);
        if (report) await navigator.clipboard.writeText(report);
      }, false);
      this.addActionButton(rowActionsEl, t('settings.debug.claude.recent.delete'), async () => {
        await this.plugin.claudeTraceService?.store.deleteTrace(summary.traceId);
        rowEl.remove();
      }, false);
    }
  }

  private getClaudeTraceSettings() {
    this.plugin.settings.backendSettings.claudeCode.sessionTrace ??= getDefaultBackendSettings().claudeCode.sessionTrace;
    return this.plugin.settings.backendSettings.claudeCode.sessionTrace;
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
