/* eslint-disable max-lines */
import { Notice, Setting } from 'obsidian';

import type {
  OpencodeFormatterConfig,
  OpencodeFormatterEntryConfig,
  OpencodeFormatterStatus,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

type FormatterMode = 'default' | 'disabled' | 'custom';
type BuiltinEntryAction = 'default' | 'disable' | 'override';

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

interface FormatterBuiltinDefinition {
  name: string;
  extensions: string[];
}

const FORMATTER_BUILTIN_CATALOG: readonly FormatterBuiltinDefinition[] = [
  { name: 'gofmt', extensions: ['.go'] },
  { name: 'mix', extensions: ['.ex', '.exs', '.eex', '.heex', '.leex', '.neex', '.sface'] },
  {
    name: 'prettier',
    extensions: [
      '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.html', '.htm', '.css',
      '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.jsonc', '.yaml', '.yml', '.toml',
      '.xml', '.md', '.mdx', '.graphql', '.gql',
    ],
  },
  { name: 'oxfmt', extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'] },
  {
    name: 'biome',
    extensions: [
      '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.html', '.htm', '.css',
      '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.jsonc', '.yaml', '.yml', '.toml',
      '.xml', '.md', '.mdx', '.graphql', '.gql',
    ],
  },
  { name: 'zig', extensions: ['.zig', '.zon'] },
  { name: 'clang-format', extensions: ['.c', '.cc', '.cpp', '.cxx', '.c++', '.h', '.hh', '.hpp', '.hxx', '.h++', '.ino', '.C', '.H'] },
  { name: 'ktlint', extensions: ['.kt', '.kts'] },
  { name: 'ruff', extensions: ['.py', '.pyi'] },
  { name: 'air', extensions: ['.R'] },
  { name: 'uv', extensions: ['.py', '.pyi'] },
  { name: 'rubocop', extensions: ['.rb', '.rake', '.gemspec', '.ru'] },
  { name: 'standardrb', extensions: ['.rb', '.rake', '.gemspec', '.ru'] },
  { name: 'htmlbeautifier', extensions: ['.erb', '.html.erb'] },
  { name: 'dart', extensions: ['.dart'] },
  { name: 'ocamlformat', extensions: ['.ml', '.mli'] },
  { name: 'terraform', extensions: ['.tf', '.tfvars'] },
  { name: 'latexindent', extensions: ['.tex'] },
  { name: 'gleam', extensions: ['.gleam'] },
  { name: 'shfmt', extensions: ['.sh', '.bash'] },
  { name: 'nixfmt', extensions: ['.nix'] },
  { name: 'rustfmt', extensions: ['.rs'] },
  { name: 'pint', extensions: ['.php'] },
  { name: 'ormolu', extensions: ['.hs'] },
  { name: 'cljfmt', extensions: ['.clj', '.cljs', '.cljc', '.edn'] },
  { name: 'dfmt', extensions: ['.d'] },
];

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
    const [formatterConfig, runtimeState] = await Promise.all([
      this.loadFormatterConfig(),
      this.loadRuntimeStatus(),
    ]);
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

    if (runtimeState.fetchFailed) {
      new Setting(containerEl)
        .setDesc(t('settings.formatter.config.runtimeOfflineNote'));
    }

    if (mode !== 'custom') {
      return;
    }

    const configObj = typeof formatterConfig === 'object' ? formatterConfig : {};
    const builtinDefinitions = this.resolveBuiltinDefinitions(runtimeState.items);
    const builtinNames = new Set(builtinDefinitions.map((item) => item.name));

    this.renderBuiltinFormatterEditors(containerEl, builtinDefinitions, configObj, runtimeState);
    this.renderCustomFormatterList(containerEl, builtinNames, configObj);
    this.renderAdvancedJsonEditor(containerEl);
  }

  private renderBuiltinFormatterEditors(
    containerEl: HTMLElement,
    builtinDefinitions: readonly FormatterBuiltinDefinition[],
    configObj: Record<string, OpencodeFormatterEntryConfig>,
    runtimeState: FormatterRuntimeState,
  ): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.config.builtinList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    if (builtinDefinitions.length === 0) {
      new Setting(sectionEl).setDesc(t('settings.formatter.config.builtinList.empty'));
      return;
    }

    const runtimeMap = new Map<string, OpencodeFormatterStatus>();
    for (const item of runtimeState.items) {
      runtimeMap.set(item.name, item);
    }

    for (const definition of builtinDefinitions) {
      this.renderBuiltinFormatterRow(sectionEl, definition, configObj, runtimeMap.get(definition.name));
    }
  }

  private renderBuiltinFormatterRow(
    parentEl: HTMLElement,
    definition: FormatterBuiltinDefinition,
    configObj: Record<string, OpencodeFormatterEntryConfig>,
    runtimeStatus: OpencodeFormatterStatus | undefined,
  ): void {
    const { name } = definition;
    const entry = configObj[name];
    const action = this.resolveBuiltinEntryAction(entry);

    const rowEl = parentEl.createDiv({ cls: 'opencodian-formatter-builtin-row' });

    new Setting(rowEl)
      .setName(name)
      .setDesc(this.getBuiltinStatusDesc(action, definition, runtimeStatus))
      .addDropdown((dropdown) => {
        dropdown.addOption('default', t('settings.formatter.config.builtin.useDefault'));
        dropdown.addOption('disable', t('settings.formatter.config.builtin.projectDisable'));
        dropdown.addOption('override', t('settings.formatter.config.builtin.projectOverride'));
        dropdown.setValue(action);
        dropdown.onChange(async (value) => {
          await this.handleBuiltinActionChange(name, value as BuiltinEntryAction);
        });
      });

    if (action === 'override') {
      this.renderOverrideFields(rowEl, name, entry ?? {});
    }
  }

  private resolveBuiltinEntryAction(
    entry: OpencodeFormatterEntryConfig | undefined,
  ): BuiltinEntryAction {
    if (!entry) return 'default';
    if (entry.disabled) return 'disable';
    return 'override';
  }

  private getBuiltinStatusDesc(
    action: BuiltinEntryAction,
    definition: FormatterBuiltinDefinition,
    runtimeStatus: OpencodeFormatterStatus | undefined,
  ): string {
    const parts: string[] = [];
    const exts = (runtimeStatus?.extensions ?? definition.extensions).join(', ');
    parts.push(exts);
    switch (action) {
      case 'default':
        parts.push(t('settings.formatter.config.builtin.rowStatus.default'));
        break;
      case 'disable':
        parts.push(t('settings.formatter.config.builtin.rowStatus.disabled'));
        break;
      case 'override':
        parts.push(t('settings.formatter.config.builtin.rowStatus.overridden'));
        break;
    }
    return parts.join(' · ');
  }

  private async handleBuiltinActionChange(
    name: string,
    action: BuiltinEntryAction,
  ): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;

    try {
      const currentConfig = await this.loadFormatterConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      const existingEntry = current[name];

      switch (action) {
        case 'default':
          delete current[name];
          break;
        case 'disable':
          current[name] = { ...this.preserveUnknownFields(existingEntry), disabled: true };
          break;
        case 'override': {
          const preserved = this.preserveUnknownFields(existingEntry);
          delete preserved.disabled;
          current[name] = preserved;
          break;
        }
      }

      await configManager.updateFormatterConfig(current);
      new Notice(t('settings.formatter.config.builtin.saved'));
      this.requestDisplayRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.builtin.saveFailed', { error: message }));
    }
  }

  private renderOverrideFields(
    rowEl: HTMLElement,
    name: string,
    entry: OpencodeFormatterEntryConfig,
  ): void {
    const fieldsEl = rowEl.createDiv({ cls: 'opencodian-formatter-override-fields' });

    const commandStr = (entry.command ?? []).join(' ');
    new Setting(fieldsEl)
      .setName(t('settings.formatter.config.builtin.command'))
      .setDesc(t('settings.formatter.config.builtin.commandDesc'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.config.builtin.commandPlaceholder'))
          .setValue(commandStr)
          .onChange(() => {});
        text.inputEl.addClass('opencodian-formatter-command-input');
      });

    this.renderEnvironmentEditor(fieldsEl, entry.environment);

    const extensionsStr = (entry.extensions ?? []).join(' ');
    new Setting(fieldsEl)
      .setName(t('settings.formatter.config.builtin.extensions'))
      .setDesc(t('settings.formatter.config.builtin.extensionsDesc'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.config.builtin.extensionsPlaceholder'))
          .setValue(extensionsStr)
          .onChange(() => {});
        text.inputEl.addClass('opencodian-formatter-extensions-input');
      });

    new Setting(fieldsEl)
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.builtin.save'))
          .setCta()
          .onClick(async () => {
            await this.saveOverrideFromFields(fieldsEl, name);
          });
      });
  }

  private renderEnvironmentEditor(
    fieldsEl: HTMLElement,
    environment: Record<string, string> | undefined,
  ): void {
    const envContainer = fieldsEl.createDiv({ cls: 'opencodian-formatter-env-editor' });
    const env = environment ?? {};

    new Setting(envContainer)
      .setName(t('settings.formatter.config.builtin.environment'))
      .setDesc(t('settings.formatter.config.builtin.environmentDesc'));

    const rowsContainer = envContainer.createDiv({ cls: 'opencodian-formatter-env-rows' });

    for (const [key, value] of Object.entries(env)) {
      this.addEnvRow(rowsContainer, key, value);
    }

    new Setting(envContainer)
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.builtin.envAdd'))
          .onClick(() => {
            this.addEnvRow(rowsContainer, '', '');
          });
      });
  }

  private addEnvRow(container: HTMLElement, key: string, value: string): void {
    const rowEl = container.createDiv({ cls: 'opencodian-formatter-env-row' });
    const keyInput = rowEl.createEl('input', {
      type: 'text',
      attr: { placeholder: t('settings.formatter.config.builtin.envKey'), value: key },
    });
    const valueInput = rowEl.createEl('input', {
      type: 'text',
      attr: { placeholder: t('settings.formatter.config.builtin.envValue'), value },
    });
    const removeBtn = rowEl.createEl('button', {
      text: t('settings.formatter.config.builtin.envRemove'),
    });
    removeBtn.addEventListener('click', () => {
      rowEl.remove();
    });

    (rowEl as HTMLElement & { __keyInput?: HTMLInputElement }).__keyInput = keyInput;
    (rowEl as HTMLElement & { __valueInput?: HTMLInputElement }).__valueInput = valueInput;
  }

  private async saveOverrideFromFields(
    fieldsEl: HTMLElement,
    name: string,
  ): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;

    const commandInput = fieldsEl.querySelector('.opencodian-formatter-command-input') as HTMLInputElement | null;
    const extensionsInput = fieldsEl.querySelector('.opencodian-formatter-extensions-input') as HTMLInputElement | null;

    const commandStr = commandInput?.value?.trim() ?? '';
    const extensionsStr = extensionsInput?.value?.trim() ?? '';

    const command = commandStr ? commandStr.split(/\s+/) : undefined;
    const extensions = extensionsStr
      ? this.normalizeExtensions(extensionsStr.split(/\s+/))
      : undefined;

    const environment = this.collectEnvironmentFromRows(fieldsEl);

    try {
      const currentConfig = await this.loadFormatterConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      const existingEntry = current[name];

      const newEntry: OpencodeFormatterEntryConfig = {
        ...this.preserveUnknownFields(existingEntry),
      };

      if (command && command.length > 0) {
        newEntry.command = command;
      } else {
        delete newEntry.command;
      }

      if (extensions && extensions.length > 0) {
        newEntry.extensions = extensions;
      } else {
        delete newEntry.extensions;
      }

      if (Object.keys(environment).length > 0) {
        newEntry.environment = environment;
      } else {
        delete newEntry.environment;
      }

      delete newEntry.disabled;

      if (command || extensions || Object.keys(environment).length > 0) {
        current[name] = newEntry;
      } else {
        delete current[name];
      }

      await configManager.updateFormatterConfig(current);
      new Notice(t('settings.formatter.config.builtin.saved'));
      this.requestDisplayRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.builtin.saveFailed', { error: message }));
    }
  }

  private renderCustomFormatterList(
    containerEl: HTMLElement,
    builtinNames: Set<string>,
    configObj: Record<string, OpencodeFormatterEntryConfig>,
  ): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.config.customList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    const customEntries = Object.entries(configObj).filter(
      ([key, entry]) => !builtinNames.has(key) && !entry.disabled,
    );

    if (customEntries.length === 0) {
      new Setting(sectionEl).setDesc(t('settings.formatter.config.customList.empty'));
    } else {
      for (const [name, entry] of customEntries) {
        this.renderCustomFormatterRow(sectionEl, name, entry);
      }
    }

    this.renderAddCustomForm(sectionEl, builtinNames);
  }

  private renderCustomFormatterRow(
    parentEl: HTMLElement,
    name: string,
    entry: OpencodeFormatterEntryConfig,
  ): void {
    const rowEl = parentEl.createDiv({ cls: 'opencodian-formatter-custom-row' });

    const commandStr = (entry.command ?? []).join(' ');
    const extensionsStr = (entry.extensions ?? []).join(' ');

    new Setting(rowEl)
      .setName(name)
      .setDesc(`${commandStr}${extensionsStr ? ` · ${extensionsStr}` : ''}`);

    this.renderCustomEditorFields(rowEl, name, entry);
  }

  private renderCustomEditorFields(
    rowEl: HTMLElement,
    name: string,
    entry: OpencodeFormatterEntryConfig,
  ): void {
    const fieldsEl = rowEl.createDiv({ cls: 'opencodian-formatter-custom-fields' });

    const commandStr = (entry.command ?? []).join(' ');
    new Setting(fieldsEl)
      .setName(t('settings.formatter.config.custom.command'))
      .setDesc(t('settings.formatter.config.custom.commandDesc'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.config.custom.commandPlaceholder'))
          .setValue(commandStr);
        text.inputEl.addClass('opencodian-formatter-command-input');
      });

    this.renderEnvironmentEditor(fieldsEl, entry.environment);

    const extensionsStr = (entry.extensions ?? []).join(' ');
    new Setting(fieldsEl)
      .setName(t('settings.formatter.config.custom.extensions'))
      .setDesc(t('settings.formatter.config.custom.extensionsDesc'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.config.custom.extensionsPlaceholder'))
          .setValue(extensionsStr);
        text.inputEl.addClass('opencodian-formatter-extensions-input');
      });

    const btnSetting = new Setting(fieldsEl);
    btnSetting
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.custom.save'))
          .setCta()
          .onClick(async () => {
            await this.saveCustomFromFields(fieldsEl, name);
          });
      })
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.custom.delete'))
          .setWarning()
          .onClick(async () => {
            await this.deleteCustomFormatter(name);
          });
      });
  }

  private async saveCustomFromFields(
    fieldsEl: HTMLElement,
    name: string,
  ): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;

    const commandInput = fieldsEl.querySelector('.opencodian-formatter-command-input') as HTMLInputElement | null;
    const extensionsInput = fieldsEl.querySelector('.opencodian-formatter-extensions-input') as HTMLInputElement | null;

    const commandStr = commandInput?.value?.trim() ?? '';
    const extensionsStr = extensionsInput?.value?.trim() ?? '';

    const command = commandStr ? commandStr.split(/\s+/) : undefined;
    const extensions = extensionsStr
      ? this.normalizeExtensions(extensionsStr.split(/\s+/))
      : undefined;

    if (!command || command.length === 0) {
      new Notice(t('settings.formatter.config.custom.commandRequired'));
      return;
    }

    try {
      const currentConfig = await this.loadFormatterConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      const existingEntry = current[name];

      const newEntry: OpencodeFormatterEntryConfig = {
        ...this.preserveUnknownFields(existingEntry),
        command,
      };

      if (extensions && extensions.length > 0) {
        newEntry.extensions = extensions;
      } else {
        delete newEntry.extensions;
      }

      const environment = this.collectEnvironmentFromRows(fieldsEl);
      if (Object.keys(environment).length > 0) {
        newEntry.environment = environment;
      } else {
        delete newEntry.environment;
      }

      current[name] = newEntry;
      await configManager.updateFormatterConfig(current);
      new Notice(t('settings.formatter.config.custom.saved'));
      this.requestDisplayRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.custom.saveFailed', { error: message }));
    }
  }

  private async deleteCustomFormatter(name: string): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;

    try {
      const currentConfig = await this.loadFormatterConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      delete current[name];

      await configManager.updateFormatterConfig(current);
      new Notice(t('settings.formatter.config.custom.deleted'));
      this.requestDisplayRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.custom.deleteFailed', { error: message }));
    }
  }

  private renderAddCustomForm(
    parentEl: HTMLElement,
    builtinNames: Set<string>,
  ): void {
    let nameInput: HTMLInputElement | null = null;

    new Setting(parentEl)
      .setName(t('settings.formatter.config.custom.addName'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.config.custom.addNamePlaceholder'));
        nameInput = text.inputEl;
      })
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.custom.addButton'))
          .setCta()
          .onClick(async () => {
            if (!nameInput) return;
            const rawName = nameInput.value.trim();
            if (!rawName) {
              new Notice(t('settings.formatter.config.custom.invalidName'));
              return;
            }
            const normalizedName = this.normalizeFormatterName(rawName);
            const configManager = this.plugin.opencodeConfigManager;
            if (!configManager) return;

            try {
              const currentConfig = await this.loadFormatterConfig();
              const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};

              if (current[normalizedName] !== undefined || builtinNames.has(normalizedName)) {
                new Notice(t('settings.formatter.config.custom.nameConflict', { name: normalizedName }));
                return;
              }

              current[normalizedName] = { command: [] };
              await configManager.updateFormatterConfig(current);
              new Notice(t('settings.formatter.config.custom.saved'));
              this.requestDisplayRefresh();
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(t('settings.formatter.config.custom.saveFailed', { error: message }));
            }
          });
      });
  }

  private renderAdvancedJsonEditor(containerEl: HTMLElement): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.config.advanced.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    new Setting(sectionEl)
      .setDesc(t('settings.formatter.config.advanced.desc'));

    const editorContainer = sectionEl.createDiv({ cls: 'opencodian-formatter-json-editor' });
    const textareaEl = editorContainer.createEl('textarea', {
      cls: 'opencodian-formatter-json-textarea',
    });
    textareaEl.rows = 12;
    textareaEl.spellcheck = false;

    void this.loadJsonEditorContent(textareaEl);

    const buttonBar = sectionEl.createDiv({ cls: 'opencodian-formatter-json-buttons' });

    new Setting(buttonBar)
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.advanced.format'))
          .onClick(() => {
            this.formatJsonEditor(textareaEl);
          });
      })
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.advanced.reload'))
          .onClick(async () => {
            await this.loadJsonEditorContent(textareaEl);
            new Notice(t('settings.formatter.config.advanced.reloaded'));
          });
      })
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.advanced.save'))
          .setCta()
          .onClick(async () => {
            await this.saveJsonEditorContent(textareaEl);
          });
      });
  }

  private async loadJsonEditorContent(textareaEl: HTMLTextAreaElement): Promise<void> {
    const formatterConfig = await this.loadFormatterConfig();
    const content = typeof formatterConfig === 'object'
      ? formatterConfig
      : typeof formatterConfig === 'boolean'
        ? formatterConfig
        : {};
    textareaEl.value = JSON.stringify(content, null, 2);
  }

  private formatJsonEditor(textareaEl: HTMLTextAreaElement): void {
    try {
      const parsed = JSON.parse(textareaEl.value);
      textareaEl.value = JSON.stringify(parsed, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.advanced.invalidJson', { error: message }));
    }
  }

  private async saveJsonEditorContent(textareaEl: HTMLTextAreaElement): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(textareaEl.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.advanced.invalidJson', { error: message }));
      return;
    }

    if (parsed === false) {
      try {
        await configManager.updateFormatterConfig(false);
        new Notice(t('settings.formatter.config.advanced.saved'));
        this.requestDisplayRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(t('settings.formatter.config.advanced.saveFailed', { error: message }));
      }
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      new Notice(t('settings.formatter.config.advanced.invalidJson', { error: 'Must be an object or false' }));
      return;
    }

    try {
      await configManager.updateFormatterConfig(parsed as Record<string, OpencodeFormatterEntryConfig>);
      new Notice(t('settings.formatter.config.advanced.saved'));
      this.requestDisplayRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.advanced.saveFailed', { error: message }));
    }
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

  private normalizeFormatterName(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
  }

  private normalizeExtensions(extensions: string[]): string[] {
    const seen = new Set<string>();
    return extensions
      .map((ext) => {
        let normalized = ext.trim();
        if (!normalized) return '';
        if (!normalized.startsWith('.')) {
          normalized = '.' + normalized;
        }
        return normalized;
      })
      .filter((ext) => {
        if (!ext) return false;
        if (seen.has(ext)) return false;
        seen.add(ext);
        return true;
      });
  }

  private preserveUnknownFields(
    entry: OpencodeFormatterEntryConfig | undefined,
  ): Record<string, unknown> {
    if (!entry) return {};
    const known = new Set(['disabled', 'command', 'environment', 'extensions']);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!known.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }

  private collectEnvironmentFromRows(parentEl: HTMLElement): Record<string, string> {
    const environment: Record<string, string> = {};
    const envRows = parentEl.querySelectorAll('.opencodian-formatter-env-row');
    envRows.forEach((row) => {
      const keyed = row as HTMLElement & { __keyInput?: HTMLInputElement; __valueInput?: HTMLInputElement };
      const key = keyed.__keyInput?.value?.trim() ?? '';
      const value = keyed.__valueInput?.value ?? '';
      if (key) {
        environment[key] = value;
      }
    });
    return environment;
  }

  private resolveBuiltinDefinitions(
    runtimeItems: readonly OpencodeFormatterStatus[],
  ): FormatterBuiltinDefinition[] {
    const definitions = new Map(
      FORMATTER_BUILTIN_CATALOG.map((item) => [item.name, { ...item }]),
    );
    for (const item of runtimeItems) {
      if (!definitions.has(item.name)) {
        definitions.set(item.name, {
          name: item.name,
          extensions: [...item.extensions],
        });
      }
    }
    return Array.from(definitions.values());
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
