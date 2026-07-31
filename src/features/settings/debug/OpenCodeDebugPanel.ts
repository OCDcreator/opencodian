import { Notice, Setting } from 'obsidian';

import {
  OPEN_CODE_TRACE_CHANNEL_IDS,
  resolveDefaultOpenCodeTraceDirectory,
} from '../../../core/opencode/diagnostics';
import { getDefaultOpenCodeSessionTraceSettings } from '../../../core/types';
import { t } from '../../../i18n';
import type { DebugModuleKey } from '../../../shared/debugModules';
import type { OpenCodeDebugPanelOptions } from './types';

export const OPEN_CODE_DEBUG_MODULE_KEYS = ['server', 'models', 'streaming'] as const satisfies readonly DebugModuleKey[];

export interface OpenCodeDebugPanelRenderOptions {
  includeIntro: boolean;
}

export class OpenCodeDebugPanel {
  constructor(private readonly options: OpenCodeDebugPanelOptions) {}

  render(
    containerEl: HTMLElement,
    renderOptions: OpenCodeDebugPanelRenderOptions = { includeIntro: true },
  ): void {
    const workbenchEl = containerEl.createDiv({
      cls: 'opencodian-debug-workbench',
      attr: { 'data-debug-workbench': 'opencode' },
    });
    if (renderOptions.includeIntro) {
      workbenchEl.createEl('h4', {
        cls: 'opencodian-settings-subsection-heading',
        text: t('settings.debug.modules.opencode.title'),
      });
      workbenchEl.createDiv({
        cls: 'opencodian-settings-block-desc',
        text: t('settings.debug.modules.opencode.desc'),
      });
    }
    this.addTraceStatus(workbenchEl);
    this.addTraceControls(workbenchEl);
    this.options.renderDebugModules(workbenchEl, {
      moduleKeys: OPEN_CODE_DEBUG_MODULE_KEYS,
      titleKey: 'settings.debug.modules.opencode.title',
      descriptionKey: 'settings.debug.modules.opencode.desc',
      includeIntro: false,
    });
    this.addTraceActions(workbenchEl);
    this.addTraceCatalog(workbenchEl);
  }

  private addTraceStatus(containerEl: HTMLElement): void {
    const diagnostics = this.options.getDiagnostics();
    const status = diagnostics?.getStatus();
    const settings = this.getTraceSettings();
    const stripEl = containerEl.createDiv({
      cls: 'opencodian-opencode-trace-status',
      attr: { 'data-opencode-trace-status': 'true' },
    });
    const items = [
      [t('settings.debug.opencode.status.capture'), settings.enabled
        ? t('settings.debug.opencode.status.enabled')
        : t('settings.debug.opencode.status.disabled')],
      [t('settings.debug.opencode.status.storage'), status?.mode ?? 'disk'],
      [t('settings.debug.opencode.status.traces'), String(diagnostics?.listSummaries(100).length ?? 0)],
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

  private addTraceControls(containerEl: HTMLElement): void {
    const settings = this.getTraceSettings();
    const controlsEl = containerEl.createDiv({ cls: 'opencodian-settings-block opencodian-debug-channel-panel' });
    new Setting(controlsEl)
      .setName(t('settings.debug.opencode.enabled.name'))
      .setDesc(t('settings.debug.opencode.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.options.saveSettings();
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
          await this.options.saveSettings();
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
            await this.options.saveSettings();
          });
        text.inputEl.addEventListener('blur', () => {
          new Notice(t('settings.debug.opencode.storage.restart'));
        });
      })
      .addButton((button) => button
        .setButtonText(t('settings.debug.opencode.storage.choose'))
        .onClick(async () => {
          const selected = await this.options.pickDirectory(settings.storageDirectory);
          if (!selected) return;
          settings.storageDirectory = selected;
          await this.options.saveSettings();
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
            await this.options.saveSettings();
          }));
    }
  }

  private addTraceActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-debug-log-actions' });
    this.options.addActionButton(actionsEl, t('settings.debug.opencode.actions.copySmart'), async () => {
      const actual = window.prompt(t('chat.opencodeDiagnostics.actualPrompt')) ?? undefined;
      const expected = window.prompt(t('chat.opencodeDiagnostics.expectedPrompt')) ?? undefined;
      const reproduction = window.prompt(t('chat.opencodeDiagnostics.reproductionPrompt')) ?? undefined;
      const report = await this.options.getDiagnostics()!.buildSmartReport(undefined, {
        actual,
        expected,
        reproduction,
      });
      await navigator.clipboard.writeText(report);
      new Notice(t('settings.debug.opencode.actions.copySuccess'));
    });
    this.options.addActionButton(actionsEl, t('settings.debug.opencode.actions.flush'), async () => {
      await this.options.getDiagnostics()!.flush();
      new Notice(t('settings.debug.opencode.actions.flushSuccess'));
    }, false);
    this.options.addActionButton(actionsEl, t('settings.debug.opencode.actions.export'), async () => {
      const summary = this.options.getDiagnostics()!.listSummaries(1)[0];
      if (!summary) {
        new Notice(t('settings.debug.opencode.recent.empty'));
        return;
      }
      const targetDirectory = await this.options.pickDirectory('');
      if (!targetDirectory) return;
      const exportedDirectory = await this.options.getDiagnostics()!.exportTraceBundle(
        summary.traceId,
        targetDirectory,
      );
      new Notice(t('settings.debug.opencode.actions.exportSuccess', { path: exportedDirectory }));
    }, false);
    this.options.addActionButton(actionsEl, t('settings.debug.opencode.actions.clear'), async () => {
      if (!window.confirm(t('settings.debug.opencode.actions.clearConfirm'))) return;
      await this.options.getDiagnostics()!.clear();
      const workbenchEl = containerEl.closest('[data-debug-workbench="opencode"]');
      if (workbenchEl instanceof HTMLElement) {
        workbenchEl.querySelector('[data-opencode-trace-catalog]')?.replaceChildren();
      }
      new Notice(t('settings.debug.opencode.actions.clearSuccess'));
    }, false);
  }

  private addTraceCatalog(containerEl: HTMLElement): void {
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
      this.options.addActionButton(actionsEl, t('settings.debug.opencode.recent.copy'), async () => {
        const report = await this.options.getDiagnostics()!.buildSmartReport(summary.traceId);
        await navigator.clipboard.writeText(report);
      }, false);
      this.options.addActionButton(actionsEl, t('settings.debug.opencode.recent.delete'), async () => {
        await this.options.getDiagnostics()!.deleteTrace(summary.traceId);
        rowEl.remove();
      }, false);
    }
  }

  private getTraceSettings() {
    this.options.settings.backendSettings.opencode ??= {
      sessionTrace: getDefaultOpenCodeSessionTraceSettings(),
    };
    return this.options.settings.backendSettings.opencode.sessionTrace;
  }
}
