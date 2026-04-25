import { Notice, Setting } from 'obsidian';

import type { OpencodeFormatterConfig, OpencodeFormatterStatus } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

type FormatterMode = 'default' | 'disabled' | 'custom';

interface SettingsFormatterSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  requestDisplayRefresh: () => void;
}

interface FormatterRuntimeState {
  items: OpencodeFormatterStatus[];
  fetchFailed: boolean;
}

export class SettingsFormatterSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private readonly requestDisplayRefresh: () => void;

  constructor(options: SettingsFormatterSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
  }

  dispose(): void {}

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.formatter.title'),
      t('settings.quickNav.formatterDesc'),
    );

    this.renderOverviewBlock(containerEl);
    this.renderConfigBlock(containerEl);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    switch (secondaryTabId) {
      case 'overview':
        this.renderOverviewBlock(containerEl);
        break;
      case 'config':
        this.renderConfigBlock(containerEl);
        break;
      default:
        this.renderOverviewBlock(containerEl);
    }
  }

  private async loadFormatterConfig(): Promise<OpencodeFormatterConfig | undefined> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return undefined;
    }
    return configManager.getFormatterConfig();
  }

  private async loadRuntimeStatus(): Promise<FormatterRuntimeState> {
    try {
      const result = await this.plugin.openCodeService.getFormatterStatus();
      if (Array.isArray(result)) {
        return {
          items: result as OpencodeFormatterStatus[],
          fetchFailed: false,
        };
      }
      return { items: [], fetchFailed: false };
    } catch {
      return { items: [], fetchFailed: true };
    }
  }

  private resolveFormatterMode(config: OpencodeFormatterConfig | undefined): FormatterMode {
    if (config === undefined || config === null) {
      return 'default';
    }
    if (config === false) {
      return 'disabled';
    }
    if (typeof config === 'object') {
      return 'custom';
    }
    return 'default';
  }

  private renderOverviewBlock(containerEl: HTMLElement): void {
    const overviewEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    overviewEl.createEl('h4', {
      text: t('settings.formatter.tab.overview'),
      cls: 'opencodian-settings-subsection-heading',
    });
    const bodyEl = overviewEl.createDiv({ cls: 'opencodian-settings-block-body' });

    void this.renderOverviewContent(bodyEl);
  }

  private async renderOverviewContent(containerEl: HTMLElement): Promise<void> {
    const [formatterConfig, runtimeState] = await Promise.all([
      this.loadFormatterConfig(),
      this.loadRuntimeStatus(),
    ]);

    const mode = this.resolveFormatterMode(formatterConfig);
    const configManager = this.plugin.opencodeConfigManager;

    new Setting(containerEl)
      .setName(t('settings.formatter.overview.modeLabel'))
      .setDesc(`${this.getModeLabel(mode)} — ${this.getModeDescription(mode)}`);

    if (configManager) {
      new Setting(containerEl)
        .setName(t('settings.formatter.overview.configPath'))
        .setDesc(configManager.getConfigPath());
    }

    this.renderRuntimeStatusSetting(containerEl, runtimeState.fetchFailed);
    this.renderSummaryCards(containerEl, formatterConfig, runtimeState.items);
    this.renderFormatterList(containerEl, runtimeState);
  }

  private renderRuntimeStatusSetting(
    containerEl: HTMLElement,
    fetchFailed: boolean,
  ): void {
    const statusKey = fetchFailed
      ? 'settings.formatter.overview.runtimeError'
      : 'settings.formatter.overview.runtimeOnline';

    new Setting(containerEl)
      .setName(t('settings.formatter.overview.runtimeStatus'))
      .setDesc(t(statusKey));
  }

  private renderSummaryCards(
    containerEl: HTMLElement,
    formatterConfig: OpencodeFormatterConfig | undefined,
    runtimeStatus: OpencodeFormatterStatus[],
  ): void {
    const summaryEl = containerEl.createDiv({
      cls: 'opencodian-formatter-summary-cards',
    });

    const detected = runtimeStatus.length;
    const enabled = runtimeStatus.filter((s) => s.enabled).length;
    const projectDisabled = typeof formatterConfig === 'object'
      ? Object.values(formatterConfig).filter((e) => e.disabled).length
      : 0;
    const customCount = typeof formatterConfig === 'object'
      ? Object.keys(formatterConfig).length - projectDisabled
      : 0;

    this.addSummaryCard(summaryEl, t('settings.formatter.overview.summary.detected', { count: String(detected) }));
    this.addSummaryCard(summaryEl, t('settings.formatter.overview.summary.enabled', { count: String(enabled) }));
    if (projectDisabled > 0) {
      this.addSummaryCard(summaryEl, t('settings.formatter.overview.summary.disabled', { count: String(projectDisabled) }));
    }
    if (customCount > 0) {
      this.addSummaryCard(summaryEl, t('settings.formatter.overview.summary.custom', { count: String(customCount) }));
    }
  }

  private addSummaryCard(parentEl: HTMLElement, text: string): void {
    parentEl.createDiv({
      cls: 'opencodian-formatter-summary-card',
      text,
    });
  }

  private renderFormatterList(
    containerEl: HTMLElement,
    runtimeState: FormatterRuntimeState,
  ): void {
    if (runtimeState.fetchFailed) {
      new Setting(containerEl)
        .setDesc(t('settings.formatter.overview.noRuntime'));
      return;
    }

    if (runtimeState.items.length === 0) {
      return;
    }

    const listEl = containerEl.createDiv({ cls: 'opencodian-formatter-runtime-list' });
    listEl.createEl('h4', {
      text: t('settings.formatter.overview.formatterList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    const tableEl = listEl.createEl('table', { cls: 'opencodian-formatter-table' });
    const theadEl = tableEl.createEl('thead');
    const headerRowEl = theadEl.createEl('tr');
    headerRowEl.createEl('th', { text: t('settings.formatter.overview.formatterList.name') });
    headerRowEl.createEl('th', { text: t('settings.formatter.overview.formatterList.extensions') });
    headerRowEl.createEl('th', { text: t('settings.formatter.overview.formatterList.status') });

    const tbodyEl = tableEl.createEl('tbody');
    for (const formatter of runtimeState.items) {
      const rowEl = tbodyEl.createEl('tr');
      rowEl.createEl('td', { text: formatter.name });
      rowEl.createEl('td', { text: formatter.extensions.join(', ') });
      const statusCellEl = rowEl.createEl('td');
      statusCellEl.createSpan({
        cls: `opencodian-formatter-status-badge ${formatter.enabled ? 'is-enabled' : 'is-disabled'}`,
        text: formatter.enabled
          ? t('settings.formatter.overview.formatterList.enabled')
          : t('settings.formatter.overview.formatterList.notEnabled'),
      });
    }
  }

  private renderConfigBlock(containerEl: HTMLElement): void {
    const configEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    configEl.createEl('h4', {
      text: t('settings.formatter.tab.config'),
      cls: 'opencodian-settings-subsection-heading',
    });
    const bodyEl = configEl.createDiv({ cls: 'opencodian-settings-block-body' });

    void this.renderConfigContent(bodyEl);
  }

  private async renderConfigContent(containerEl: HTMLElement): Promise<void> {
    const formatterConfig = await this.loadFormatterConfig();
    const mode = this.resolveFormatterMode(formatterConfig);

    new Setting(containerEl)
      .setName(t('settings.formatter.config.modeSwitch'))
      .setDesc(t('settings.formatter.config.modeSwitchDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('default', t('settings.formatter.mode.default'));
        dropdown.addOption('disabled', t('settings.formatter.mode.disabled'));
        dropdown.addOption('custom', t('settings.formatter.mode.custom'));
        dropdown.setValue(mode);
        dropdown.onChange(async (value) => {
          await this.handleModeSwitch(value as FormatterMode);
        });
      });
  }

  private async handleModeSwitch(mode: FormatterMode): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      new Notice(t('settings.formatter.notice.modeChangeFailed', { error: 'Config manager unavailable' }));
      return;
    }

    try {
      switch (mode) {
        case 'default':
          await configManager.updateFormatterConfig(null);
          break;
        case 'disabled':
          await configManager.updateFormatterConfig(false);
          break;
        case 'custom': {
          const current = await this.loadFormatterConfig();
          const nextConfig = typeof current === 'object' ? current : {};
          await configManager.updateFormatterConfig(nextConfig);
          break;
        }
      }
      new Notice(t('settings.formatter.notice.modeChanged'));
      this.requestDisplayRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.notice.modeChangeFailed', { error: message }));
    }
  }

  private getModeLabel(mode: FormatterMode): string {
    switch (mode) {
      case 'default':
        return t('settings.formatter.mode.default');
      case 'disabled':
        return t('settings.formatter.mode.disabled');
      case 'custom':
        return t('settings.formatter.mode.custom');
    }
  }

  private getModeDescription(mode: FormatterMode): string {
    switch (mode) {
      case 'default':
        return t('settings.formatter.mode.defaultDesc');
      case 'disabled':
        return t('settings.formatter.mode.disabledDesc');
      case 'custom':
        return t('settings.formatter.mode.customDesc');
    }
  }
}
