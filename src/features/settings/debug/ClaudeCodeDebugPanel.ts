import { Notice, Setting } from 'obsidian';

import { CLAUDE_TRACE_CHANNEL_IDS } from '../../../core/agents/backend/diagnostics';
import { getDefaultBackendSettings } from '../../../core/types';
import { t } from '../../../i18n';
import { CLAUDE_CODE_DEBUG_CHANNEL_IDS } from '../../../shared/debugModules';
import { resolveDefaultTraceDirectory } from '../../../shared/diagnostics';
import type { ClaudeCodeDebugPanelOptions } from './types';

export interface ClaudeCodeDebugPanelRenderOptions {
  includeIntro: boolean;
}

/** Complete Claude Code debug workbench, composed through narrow settings and diagnostics ports. */
export class ClaudeCodeDebugPanel {
  constructor(private readonly options: ClaudeCodeDebugPanelOptions) {}

  render(
    containerEl: HTMLElement,
    renderOptions: ClaudeCodeDebugPanelRenderOptions = { includeIntro: true },
  ): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'claude-code' },
    });
    const statusContainerEl = renderOptions.includeIntro
      ? this.createWorkbenchHeader(workbenchEl)
      : workbenchEl;

    this.addCodeStatusStrip(statusContainerEl);
    this.addPrivacyNote(workbenchEl);
    this.options.renderDebugModules(workbenchEl, {
      moduleKeys: ['claudeCode'],
      titleKey: 'settings.debug.claude.module.title',
      descriptionKey: 'settings.debug.claude.module.desc',
      includeIntro: true,
    });
    this.addCodeChannelSettings(workbenchEl);
    this.addTraceStatus(workbenchEl);
    this.addTraceControls(workbenchEl);
    this.addTraceActions(workbenchEl);
    this.addTraceCatalog(workbenchEl);
    this.addCodeLogPreview(workbenchEl);
  }

  private createWorkbenchHeader(containerEl: HTMLElement): HTMLElement {
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

  private addCodeStatusStrip(containerEl: HTMLElement): void {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-debug-status-strip',
      attr: { 'data-claude-code-status-strip': 'true' },
    });
    this.renderCodeStatusStrip(statusEl);
  }

  private renderCodeStatusStrip(statusEl: HTMLElement): void {
    statusEl.replaceChildren();
    for (const item of this.getCodeStatusItems()) {
      const itemEl = statusEl.createDiv({ cls: 'opencodian-debug-status-item' });
      itemEl.createDiv({ cls: 'opencodian-debug-status-label', text: item.label });
      itemEl.createDiv({ cls: 'opencodian-debug-status-value', text: item.value });
    }
  }

  private getCodeStatusItems(): { label: string; value: string }[] {
    const settings = this.options.settings;
    const claudeSettings = settings.backendSettings.claudeCode;
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
        value: t('settings.debug.claude.status.recentValue', {
          count: String(this.options.getVisibleLogEntryCount()),
        }),
      },
    ];
  }

  private addPrivacyNote(containerEl: HTMLElement): void {
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

  private addCodeChannelSettings(containerEl: HTMLElement): void {
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
            .setValue(this.options.settings.backendSettings.claudeCode.debugChannels[channelId] !== false)
            .onChange(async (value) => {
              this.options.settings.backendSettings.claudeCode.debugChannels = {
                ...this.options.settings.backendSettings.claudeCode.debugChannels,
                [channelId]: value,
              };
              await this.options.saveSettings();
              this.refreshCodeWorkbench(containerEl);
            })
        );
    }
  }

  private addTraceStatus(containerEl: HTMLElement): void {
    const status = this.options.getDiagnostics()?.getStorageStatus();
    const settings = this.getTraceSettings();
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

  private addTraceControls(containerEl: HTMLElement): void {
    const settings = this.getTraceSettings();
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    new Setting(controlsEl)
      .setName(t('settings.debug.claude.enabled.name'))
      .setDesc(t('settings.debug.claude.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.options.saveSettings();
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
          await this.options.saveSettings();
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
            await this.options.saveSettings();
          });
        text.inputEl.addEventListener('blur', () => {
          new Notice(t('settings.debug.claude.storage.restart'));
        });
      })
      .addButton((button) => button
        .setButtonText(t('settings.debug.claude.storage.choose'))
        .onClick(async () => {
          const selected = await this.options.pickDirectory(settings.storageDirectory);
          if (!selected) return;
          settings.storageDirectory = selected;
          await this.options.saveSettings();
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
            await this.options.saveSettings();
          }));
    }
  }

  private addTraceActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.options.addActionButton(actionsEl, t('settings.debug.claude.actions.copyReport'), async () => {
      const report = await this.options.getDiagnostics()?.buildSmartReport();
      if (!report) return;
      await navigator.clipboard.writeText(report);
      new Notice(t('settings.debug.claude.actions.copySuccess'));
    });
    this.options.addActionButton(actionsEl, t('settings.debug.claude.actions.export'), async () => {
      const summary = this.options.getDiagnostics()?.listRecentTraces(1)[0];
      if (!summary) {
        new Notice(t('settings.debug.claude.recent.empty'));
        return;
      }
      const targetDirectory = this.options.getValidatedExportDirectory();
      if (!targetDirectory) {
        new Notice(t('settings.debug.claude.actions.exportDirectoryUnavailable'));
        return;
      }
      const exportedDirectory = await this.options.getDiagnostics()?.exportTrace(summary.traceId, targetDirectory);
      if (exportedDirectory) {
        new Notice(t('settings.debug.claude.actions.exportSuccess', { path: exportedDirectory }));
      }
    }, false);
    this.options.addActionButton(actionsEl, t('settings.debug.claude.actions.clear'), async () => {
      if (!window.confirm(t('settings.debug.claude.actions.clearConfirm'))) return;
      await this.options.getDiagnostics()?.clearAll();
      const workbenchEl = containerEl.closest('[data-debug-workbench="claude-code"]');
      if (workbenchEl instanceof HTMLElement) {
        this.refreshTraceCatalog(workbenchEl);
      }
      new Notice(t('settings.debug.claude.actions.clearSuccess'));
    }, false);
  }

  private addTraceCatalog(containerEl: HTMLElement): void {
    const catalogEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-debug-log-panel',
      attr: { 'data-claude-trace-catalog': 'true' },
    });
    this.renderTraceCatalog(catalogEl);
  }

  private refreshTraceCatalog(containerEl: HTMLElement): void {
    const catalogEl = containerEl.querySelector('[data-claude-trace-catalog="true"]');
    if (catalogEl instanceof HTMLElement) this.renderTraceCatalog(catalogEl);
  }

  private renderTraceCatalog(catalogEl: HTMLElement): void {
    catalogEl.replaceChildren();
    catalogEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.debug.claude.recent.title'),
    });
    const filterSetting = new Setting(catalogEl)
      .setName(t('settings.debug.claude.recent.anomaliesOnly'))
      .setDesc(t('settings.debug.claude.recent.anomaliesOnlyDesc'));
    const rowsEl = catalogEl.createDiv({ cls: 'opencodian-debug-trace-rows' });
    const summaries = this.options.getDiagnostics()?.listRecentTraces(20) ?? [];
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
      this.options.addActionButton(rowActionsEl, t('settings.debug.claude.recent.copy'), async () => {
        const report = await this.options.getDiagnostics()?.buildSmartReport(summary.traceId);
        if (report) await navigator.clipboard.writeText(report);
      }, false);
      this.options.addActionButton(rowActionsEl, t('settings.debug.claude.recent.delete'), async () => {
        await this.options.getDiagnostics()?.deleteTrace(summary.traceId);
        rowEl.remove();
      }, false);
    }
  }

  private getTraceSettings() {
    this.options.settings.backendSettings.claudeCode.sessionTrace ??= getDefaultBackendSettings().claudeCode.sessionTrace;
    return this.options.settings.backendSettings.claudeCode.sessionTrace;
  }

  private addCodeLogPreview(containerEl: HTMLElement): void {
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
    this.options.addActionButton(actionsEl, t('settings.debug.claude.logs.copyVisible'), async () => {
      try {
        await navigator.clipboard.writeText(this.options.getVisibleLogText());
        new Notice(t('settings.debug.claude.logs.copyVisibleSuccess'));
      } catch (error) {
        this.options.reportVisibleLogCopyFailure(error);
        new Notice(t('settings.debug.claude.logs.copyVisibleFailed'));
      }
    });
    this.options.addActionButton(actionsEl, t('settings.debug.claude.logs.copyDiagnostics'), async () => {
      try {
        await navigator.clipboard.writeText(this.options.buildDiagnosticReport());
        new Notice(t('settings.debug.actions.copySuccess'));
      } catch (error) {
        this.options.reportDiagnosticCopyFailure(error);
        new Notice(t('settings.debug.actions.copyFailed'));
      }
    });
    this.options.addActionButton(actionsEl, t('settings.debug.actions.clearLogs'), () => {
      this.options.clearVisibleLogs();
      this.refreshCodeWorkbench(containerEl);
      new Notice(t('settings.debug.actions.clearLogsSuccess'));
    }, false);

    const previewEl = logsEl.createEl('pre', {
      cls: 'opencodian-debug-log-preview',
      attr: { 'data-claude-code-log-preview': 'true' },
    });
    previewEl.textContent = this.options.getVisibleLogText();
  }

  private refreshCodeWorkbench(containerEl: HTMLElement): void {
    const statusEl = containerEl.querySelector('[data-claude-code-status-strip="true"]');
    if (statusEl instanceof HTMLElement) {
      this.renderCodeStatusStrip(statusEl);
    }
    const previewEl = containerEl.querySelector('[data-claude-code-log-preview="true"]');
    if (previewEl) {
      previewEl.textContent = this.options.getVisibleLogText();
    }
  }
}
