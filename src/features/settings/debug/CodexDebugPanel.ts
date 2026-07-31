import { Notice, Setting } from 'obsidian';

import { CODEX_TRACE_CHANNEL_IDS } from '../../../core/agents/backend/diagnostics';
import { getDefaultBackendSettings } from '../../../core/types';
import { t } from '../../../i18n';
import { resolveDefaultTraceDirectory } from '../../../shared/diagnostics';
import type { CodexDebugPanelOptions } from './types';

export interface CodexDebugPanelRenderOptions {
  includeIntro: boolean;
}

/** Complete Codex session-trace workbench, composed through narrow settings and diagnostics ports. */
export class CodexDebugPanel {
  constructor(private readonly options: CodexDebugPanelOptions) {}

  render(
    containerEl: HTMLElement,
    renderOptions: CodexDebugPanelRenderOptions = { includeIntro: true },
  ): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'codex' },
    });
    if (renderOptions.includeIntro) {
      workbenchEl.createEl('h4', {
        cls: 'opencodian-settings-subsection-heading',
        text: t('settings.debug.modules.codex.title'),
      });
      workbenchEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: t('settings.debug.modules.codex.desc'),
      });
    }
    this.addTraceStatus(workbenchEl);
    this.addTraceControls(workbenchEl);
    this.addTraceActions(workbenchEl);
    this.addTraceCatalog(workbenchEl);
  }

  private addTraceStatus(containerEl: HTMLElement): void {
    const diagnostics = this.options.getDiagnostics();
    const status = diagnostics?.getStatus();
    const settings = this.getTraceSettings();
    const stripEl = containerEl.createDiv({
      cls: 'opencodian-codex-trace-status',
      attr: { 'data-codex-trace-status': 'true' },
    });
    const items = [
      [t('settings.debug.codex.status.capture'), settings.enabled
        ? t('settings.debug.codex.status.enabled')
        : t('settings.debug.codex.status.disabled')],
      [t('settings.debug.codex.status.storage'), status?.mode ?? 'disk'],
      [t('settings.debug.codex.status.traces'), String(diagnostics?.listSummaries(100).length ?? 0)],
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

  private addTraceControls(containerEl: HTMLElement): void {
    const settings = this.getTraceSettings();
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    new Setting(controlsEl)
      .setName(t('settings.debug.codex.enabled.name'))
      .setDesc(t('settings.debug.codex.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.options.saveSettings();
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
          await this.options.saveSettings();
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
            await this.options.saveSettings();
          });
        text.inputEl.addEventListener('blur', () => {
          new Notice(t('settings.debug.codex.storage.restart'));
        });
      })
      .addButton((button) => button
        .setButtonText(t('settings.debug.codex.storage.choose'))
        .onClick(async () => {
          const selected = await this.options.pickDirectory(settings.storageDirectory);
          if (!selected) return;
          settings.storageDirectory = selected;
          await this.options.saveSettings();
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
            await this.options.saveSettings();
          }));
    }
    new Setting(controlsEl)
      .setName(t('settings.debug.codex.captureContent.name'))
      .setDesc(t('settings.debug.codex.captureContent.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.captureContent)
        .onChange(async (value) => {
          settings.captureContent = value;
          await this.options.saveSettings();
        }));
  }

  private addTraceActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.options.addActionButton(actionsEl, t('settings.debug.codex.actions.copyReport'), async () => {
      const report = await this.options.getDiagnostics()!.buildSmartReport();
      await navigator.clipboard.writeText(report);
      new Notice(t('settings.debug.codex.actions.copySuccess'));
    });
    this.options.addActionButton(actionsEl, t('settings.debug.codex.actions.flush'), async () => {
      await this.options.getDiagnostics()!.flush();
      new Notice(t('settings.debug.codex.actions.flushSuccess'));
    }, false);
    this.options.addActionButton(actionsEl, t('settings.debug.codex.actions.export'), async () => {
      const summary = this.options.getDiagnostics()!.listSummaries(1)[0];
      if (!summary) {
        new Notice(t('settings.debug.codex.recent.empty'));
        return;
      }
      const targetDirectory = await this.options.pickDirectory('');
      if (!targetDirectory) return;
      const exportedDirectory = await this.options.getDiagnostics()!.exportTraceBundle(
        summary.traceId,
        targetDirectory,
      );
      new Notice(t('settings.debug.codex.actions.exportSuccess', { path: exportedDirectory }));
    }, false);
    this.options.addActionButton(actionsEl, t('settings.debug.codex.actions.clear'), async () => {
      if (!window.confirm(t('settings.debug.codex.actions.clearConfirm'))) return;
      await this.options.getDiagnostics()!.clear();
      const workbenchEl = containerEl.closest('[data-debug-workbench="codex"]');
      if (workbenchEl instanceof HTMLElement) {
        workbenchEl.querySelector('[data-codex-trace-catalog]')?.replaceChildren();
      }
      new Notice(t('settings.debug.codex.actions.clearSuccess'));
    }, false);
  }

  private addTraceCatalog(containerEl: HTMLElement): void {
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
    const summaries = this.options.getDiagnostics()?.listSummaries(20) ?? [];
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
      this.options.addActionButton(rowActionsEl, t('settings.debug.codex.recent.copy'), async () => {
        const report = await this.options.getDiagnostics()!.buildSmartReport(summary.traceId);
        await navigator.clipboard.writeText(report);
      }, false);
      this.options.addActionButton(rowActionsEl, t('settings.debug.codex.recent.delete'), async () => {
        await this.options.getDiagnostics()!.deleteTrace(summary.traceId);
        rowEl.remove();
      }, false);
    }
  }

  private getTraceSettings() {
    this.options.settings.backendSettings.codex ??= getDefaultBackendSettings().codex;
    this.options.settings.backendSettings.codex.sessionTrace ??= getDefaultBackendSettings().codex.sessionTrace;
    return this.options.settings.backendSettings.codex.sessionTrace;
  }
}
