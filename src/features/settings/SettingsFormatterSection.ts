/* eslint-disable max-lines, max-lines-per-function */
import { Notice, Setting } from 'obsidian';

import type {
  OpencodeFormatterConfig,
  OpencodeFormatterEntryConfig,
  OpencodeFormatterStatus,
  OpencodeLspConfig,
  OpencodeLspEntryConfig,
  OpencodeLspStatus,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { OpenCodeProjectConfigHelpModal } from './OpenCodeProjectConfigHelpModal';
import { isOpenCodeSettingsBackendActive } from './settingsBackendGuards';
import { SettingsPopoverController } from './SettingsPopoverController';
import { TextareaSizeMemory } from './TextareaSizeMemory';

type FormatterMode = 'default' | 'disabled' | 'custom';
type BuiltinEntryAction = 'default' | 'disable' | 'override';
type FormatterRuntimeSortDirection = 'asc' | 'desc';
type FormatterRuntimeSortKey = 'name' | 'extensions' | 'status';

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

interface LspRuntimeState {
  items: OpencodeLspStatus[];
  fetchFailed: boolean;
}

interface LspBuiltinDefinition {
  id: string;
  extensions: string[];
}

type BuiltinSearchScope = 'formatter' | 'lsp';
type BuiltinStatusFilter = 'all' | BuiltinEntryAction;

interface BuiltinSearchEntry {
  id: string;
  extensions: string[];
  status: BuiltinEntryAction;
}

interface BuiltinSearchController {
  emptyEl: HTMLElement;
  registerRow: (id: string, rowEl: HTMLElement) => void;
}

interface OverviewMetaCardOptions {
  label: string;
  value?: string;
  description?: string;
  monoValue?: boolean;
  valueAsPill?: boolean;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  pills?: Array<{
    text: string;
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  }>;
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

const LSP_BUILTIN_CATALOG: readonly LspBuiltinDefinition[] = [
  { id: 'deno', extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'] },
  { id: 'typescript', extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'] },
  { id: 'vue', extensions: ['.vue'] },
  { id: 'eslint', extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue'] },
  { id: 'oxlint', extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.astro', '.svelte'] },
  {
    id: 'biome',
    extensions: [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.jsonc', '.vue',
      '.astro', '.svelte', '.css', '.graphql', '.gql', '.html',
    ],
  },
  { id: 'gopls', extensions: ['.go'] },
  { id: 'ruby-lsp', extensions: ['.rb', '.rake', '.gemspec', '.ru'] },
  { id: 'ty', extensions: ['.py', '.pyi'] },
  { id: 'pyright', extensions: ['.py', '.pyi'] },
  { id: 'elixir-ls', extensions: ['.ex', '.exs'] },
  { id: 'zls', extensions: ['.zig', '.zon'] },
  { id: 'csharp', extensions: ['.cs', '.csx'] },
  { id: 'razor', extensions: ['.razor', '.cshtml'] },
  { id: 'fsharp', extensions: ['.fs', '.fsi', '.fsx', '.fsscript'] },
  { id: 'sourcekit-lsp', extensions: ['.swift', '.objc', '.objcpp'] },
  { id: 'rust', extensions: ['.rs'] },
  { id: 'clangd', extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++'] },
  { id: 'svelte', extensions: ['.svelte'] },
  { id: 'astro', extensions: ['.astro'] },
  { id: 'jdtls', extensions: ['.java'] },
  { id: 'kotlin-ls', extensions: ['.kt', '.kts'] },
  { id: 'yaml-ls', extensions: ['.yaml', '.yml'] },
  { id: 'lua-ls', extensions: ['.lua'] },
  { id: 'php intelephense', extensions: ['.php'] },
  { id: 'prisma', extensions: ['.prisma'] },
  { id: 'dart', extensions: ['.dart'] },
  { id: 'ocaml-lsp', extensions: ['.ml', '.mli'] },
  { id: 'bash', extensions: ['.sh', '.bash', '.zsh', '.ksh'] },
  { id: 'terraform', extensions: ['.tf', '.tfvars'] },
  { id: 'texlab', extensions: ['.tex', '.bib'] },
  { id: 'dockerfile', extensions: ['.dockerfile', 'Dockerfile'] },
  { id: 'gleam', extensions: ['.gleam'] },
  { id: 'clojure-lsp', extensions: ['.clj', '.cljs', '.cljc', '.edn'] },
  { id: 'nixd', extensions: ['.nix'] },
  { id: 'tinymist', extensions: ['.typ', '.typc'] },
  { id: 'haskell-language-server', extensions: ['.hs', '.lhs'] },
  { id: 'julials', extensions: ['.jl'] },
];

export class SettingsFormatterSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private readonly requestDisplayRefresh: () => void;
  private activeRenderContainerEl: HTMLElement | null = null;
  private activeRenderMode: 'classic' | 'tabbed' | null = null;
  private activeSecondaryTabId = 'overview';
  private contentRefreshRunId = 0;
  private bodyLevelPopovers: HTMLElement[] = [];
  private textareaSizeMemories: TextareaSizeMemory[] = [];

  constructor(options: SettingsFormatterSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
  }

  dispose(): void {
    this.contentRefreshRunId += 1;
    this.activeRenderContainerEl = null;
    this.activeRenderMode = null;
    this.destroyTextareaSizeMemories();
    this.removeBodyLevelPopovers();
  }

  private destroyTextareaSizeMemories(): void {
    for (const memory of this.textareaSizeMemories) {
      memory.destroy();
    }
    this.textareaSizeMemories = [];
  }

  private removeBodyLevelPopovers(): void {
    for (const popoverEl of this.bodyLevelPopovers) {
      popoverEl.remove();
    }
    this.bodyLevelPopovers = [];
  }

  private showSearchPopover(inputEl: HTMLInputElement, popoverEl: HTMLElement): void {
    if (!popoverEl.parentElement) {
      inputEl.ownerDocument.body.appendChild(popoverEl);
    }
    const boundaryEl = inputEl.closest<HTMLElement>(
      '.vertical-tab-content-container, .vertical-tab-content, .modal-content',
    );
    SettingsPopoverController.ensureForDocument(inputEl.ownerDocument).show({
      anchorEl: inputEl,
      popoverEl,
      matchAnchorWidth: true,
      preferredPlacement: 'bottom-start',
      boundaryEl: boundaryEl ?? undefined,
    });
  }

  private hideSearchPopover(inputEl: HTMLInputElement, popoverEl: HTMLElement): void {
    SettingsPopoverController.ensureForDocument(inputEl.ownerDocument).hide(popoverEl);
    inputEl.setAttribute('aria-expanded', 'false');
    inputEl.removeAttribute('aria-activedescendant');
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.formatter.title'),
      t('settings.quickNav.formatterDesc'),
    );

    const contentEl = containerEl.createDiv({ cls: 'opencodian-formatter-classic-stack' });
    this.activeRenderContainerEl = contentEl;
    this.activeRenderMode = 'classic';
    this.activeSecondaryTabId = 'overview';
    void this.renderClassicContent(contentEl);

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.activeRenderContainerEl = containerEl;
    this.activeRenderMode = 'tabbed';
    this.activeSecondaryTabId = secondaryTabId;
    void this.renderTabbedContent(containerEl, secondaryTabId);
  }

  private renderClassicContent(containerEl: HTMLElement): Promise<void> {
    return Promise.all([
      this.renderOverviewBlock(containerEl),
      this.renderFormatterConfigBlock(containerEl),
      this.renderLspConfigBlock(containerEl),
    ]).then(() => undefined);
  }

  private renderTabbedContent(containerEl: HTMLElement, secondaryTabId: string): Promise<void> {
    containerEl.addClass('opencodian-formatter-tab-stack');
    switch (secondaryTabId) {
      case 'overview':
        return this.renderOverviewTabbed(containerEl);
      case 'formatter':
      case 'config':
        return this.renderFormatterConfigTabbed(containerEl);
      case 'lsp':
        return this.renderLspConfigTabbed(containerEl);
      default:
        return this.renderOverviewTabbed(containerEl);
    }
  }

  private async requestContentRefresh(): Promise<void> {
    const containerEl = this.activeRenderContainerEl;
    const renderMode = this.activeRenderMode;
    if (!containerEl || !renderMode || !containerEl.isConnected) {
      this.requestDisplayRefresh();
      return;
    }

    const runId = ++this.contentRefreshRunId;
    // Remove body-level popovers from the previous render cycle before
    // re-rendering so they do not accumulate in document.body.
    this.removeBodyLevelPopovers();
    this.destroyTextareaSizeMemories();
    const previousMinHeight = containerEl.style.minHeight;
    const measuredHeight = containerEl.offsetHeight;
    const scrollContainerEl = this.getScrollContainer(containerEl);
    const scrollTop = scrollContainerEl?.scrollTop ?? 0;
    if (measuredHeight > 0) {
      containerEl.style.minHeight = `${measuredHeight}px`;
    }

    const stagingEl = document.createElement('div');
    stagingEl.className = containerEl.className;
    if (renderMode === 'classic') {
      await this.renderClassicContent(stagingEl);
    } else {
      await this.renderTabbedContent(stagingEl, this.activeSecondaryTabId);
    }

    if (runId !== this.contentRefreshRunId || !containerEl.isConnected) {
      return;
    }

    containerEl.className = stagingEl.className;
    containerEl.replaceChildren(...Array.from(stagingEl.childNodes));
    if (scrollContainerEl) {
      scrollContainerEl.scrollTop = scrollTop;
    }
    window.requestAnimationFrame(() => {
      if (!containerEl.isConnected) {
        return;
      }
      if (scrollContainerEl?.isConnected) {
        scrollContainerEl.scrollTop = scrollTop;
      }
      containerEl.style.minHeight = previousMinHeight;
    });
  }

  private getScrollContainer(containerEl: HTMLElement): HTMLElement | null {
    return containerEl.closest<HTMLElement>(
      '.vertical-tab-content-container, .vertical-tab-content, .modal-content',
    );
  }

  private async loadFormatterConfig(): Promise<OpencodeFormatterConfig | undefined> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return undefined;
    }
    return configManager.getFormatterConfig();
  }

  private async loadFormatterRuntimeStatus(): Promise<FormatterRuntimeState> {
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

  private async loadLspConfig(): Promise<OpencodeLspConfig | undefined> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager || typeof configManager.getLspConfig !== 'function') {
      return undefined;
    }
    return configManager.getLspConfig();
  }

  private async loadLspRuntimeStatus(): Promise<LspRuntimeState> {
    try {
      const result = await this.plugin.openCodeService.getLspStatus();
      if (Array.isArray(result)) {
        return {
          items: result as OpencodeLspStatus[],
          fetchFailed: false,
        };
      }
      return { items: [], fetchFailed: false };
    } catch {
      return { items: [], fetchFailed: true };
    }
  }

  private async updateFormatterConfigAndReload(
    formatter: OpencodeFormatterConfig | null | undefined,
  ): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;
    await configManager.updateFormatterConfig(formatter);
    await this.restartLocalServiceAfterProjectConfigWrite();
  }

  private async updateLspConfigAndReload(
    lsp: OpencodeLspConfig | null | undefined,
  ): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager || typeof configManager.updateLspConfig !== 'function') return;
    await configManager.updateLspConfig(lsp);
    await this.restartLocalServiceAfterProjectConfigWrite();
  }

  private async restartLocalServiceAfterProjectConfigWrite(): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.server.remoteManageUnavailable'));
      return;
    }

    try {
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (isRunning) {
        await this.plugin.openCodeService.stop();
      }
      await this.plugin.openCodeService.start();
    } catch {
      new Notice(t('settings.formatter.notice.restartFailed'));
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

private async renderOverviewBlock(containerEl: HTMLElement): Promise<void> {
const overviewEl = containerEl.createDiv({
cls: 'opencodian-settings-block opencodian-formatter-overview-shell',
});
    overviewEl.createEl('h4', {
      text: t('settings.formatter.tab.overview'),
      cls: 'opencodian-settings-subsection-heading',
    });
    const bodyEl = overviewEl.createDiv({ cls: 'opencodian-settings-block-body' });

    await this.renderOverviewContent(bodyEl);
  }

  private async renderOverviewContent(containerEl: HTMLElement): Promise<void> {
    const [formatterConfig, formatterRuntimeState, lspConfig, lspRuntimeState] = await Promise.all([
      this.loadFormatterConfig(),
      this.loadFormatterRuntimeStatus(),
      this.loadLspConfig(),
      this.loadLspRuntimeStatus(),
    ]);

    const mode = this.resolveFormatterMode(formatterConfig);
    const lspMode = this.resolveFormatterMode(lspConfig);
    const configManager = this.plugin.opencodeConfigManager;

    this.renderOverviewMetaGrid(containerEl, {
      formatterMode: this.getModeLabel(mode),
      formatterModeDescription: this.getModeDescription(mode),
      formatterModeTone: this.getModeTone(mode),
      lspMode: this.getModeLabel(lspMode),
      lspModeDescription: this.getLspModeDescription(lspMode),
      lspModeTone: this.getModeTone(lspMode),
      configPath: configManager?.getConfigPath() ?? '—',
      runtimeStatusPills: this.getCombinedRuntimeStatusPills(
        formatterRuntimeState.fetchFailed,
        lspRuntimeState.fetchFailed,
      ),
      runtimeTone: this.getCombinedRuntimeTone(
        formatterRuntimeState.fetchFailed,
        lspRuntimeState.fetchFailed,
      ),
    });
    this.renderSummaryCards(containerEl, formatterConfig, formatterRuntimeState.items);
    this.renderFormatterList(containerEl, formatterRuntimeState);
    this.renderLspOverview(containerEl, lspConfig, lspRuntimeState);
  }

  private renderOverviewMetaGrid(
    containerEl: HTMLElement,
    values: {
      formatterMode: string;
      formatterModeDescription: string;
      formatterModeTone: OverviewMetaCardOptions['tone'];
      lspMode: string;
      lspModeDescription: string;
      lspModeTone: OverviewMetaCardOptions['tone'];
      configPath: string;
      runtimeStatusPills: OverviewMetaCardOptions['pills'];
      runtimeTone: OverviewMetaCardOptions['tone'];
    },
  ): void {
const summaryBandEl = containerEl.createDiv({ cls: 'opencodian-formatter-overview-summary-band' });
const gridEl = summaryBandEl.createDiv({ cls: 'opencodian-formatter-overview-meta-grid' });
    this.addOverviewMetaCard(gridEl, {
      label: t('settings.formatter.overview.modeLabel'),
      value: values.formatterMode,
      description: values.formatterModeDescription,
      valueAsPill: true,
      tone: values.formatterModeTone,
    });
    this.addOverviewMetaCard(gridEl, {
      label: t('settings.formatter.lsp.overview.modeLabel'),
      value: values.lspMode,
      description: values.lspModeDescription,
      valueAsPill: true,
      tone: values.lspModeTone,
    });
    this.addOverviewMetaCard(gridEl, {
      label: t('settings.formatter.overview.configPath'),
      value: values.configPath,
      monoValue: true,
    });
    this.addOverviewMetaCard(gridEl, {
      label: t('settings.formatter.overview.runtimeStatus'),
      value: 'Formatter · LSP',
      pills: values.runtimeStatusPills,
      tone: values.runtimeTone,
    });
  }

  private addOverviewMetaCard(parentEl: HTMLElement, options: OverviewMetaCardOptions): void {
    const cardEl = parentEl.createDiv({ cls: 'opencodian-formatter-overview-meta-card' });
    if (options.tone) {
      cardEl.dataset.tone = options.tone;
    }
    cardEl.createDiv({
      cls: 'opencodian-formatter-overview-meta-label',
      text: options.label,
    });
    const bodyEl = cardEl.createDiv({ cls: 'opencodian-formatter-overview-meta-body' });
    if (options.value) {
      if (options.valueAsPill) {
        const pillEl = bodyEl.createSpan({
          cls: 'opencodian-formatter-overview-meta-value-pill',
          text: options.value,
        });
        if (options.tone) {
          pillEl.dataset.tone = options.tone;
        }
      } else {
        bodyEl.createDiv({
          cls: `opencodian-formatter-overview-meta-value${options.monoValue ? ' is-mono' : ''}`,
          text: options.value,
        });
      }
    }
    if (options.description) {
      bodyEl.createDiv({
        cls: 'opencodian-formatter-overview-meta-description',
        text: options.description,
      });
    }
    if (options.pills && options.pills.length > 0) {
      const pillsEl = bodyEl.createDiv({
        cls: 'opencodian-formatter-overview-meta-pills',
      });
      for (const pill of options.pills) {
        const pillEl = pillsEl.createSpan({
          cls: 'opencodian-formatter-overview-meta-pill',
          text: pill.text,
        });
        if (pill.tone) {
          pillEl.dataset.tone = pill.tone;
        }
      }
    }
  }

  private getCombinedRuntimeStatusPills(
    formatterFetchFailed: boolean,
    lspFetchFailed: boolean,
  ): OverviewMetaCardOptions['pills'] {
    return [
      {
        text: `Formatter ${t(formatterFetchFailed ? 'settings.formatter.overview.runtimeError' : 'settings.formatter.overview.runtimeOnline')}`,
        tone: formatterFetchFailed ? 'danger' : 'success',
      },
      {
        text: `LSP ${t(lspFetchFailed ? 'settings.formatter.lsp.overview.runtimeError' : 'settings.formatter.lsp.overview.runtimeOnline')}`,
        tone: lspFetchFailed ? 'danger' : 'success',
      },
    ];
  }

  private getCombinedRuntimeTone(
    formatterFetchFailed: boolean,
    lspFetchFailed: boolean,
  ): OverviewMetaCardOptions['tone'] {
    if (!formatterFetchFailed && !lspFetchFailed) {
      return 'success';
    }
    if (formatterFetchFailed && lspFetchFailed) {
      return 'danger';
    }
    return 'warning';
  }

  private getModeTone(mode: FormatterMode): OverviewMetaCardOptions['tone'] {
    switch (mode) {
      case 'custom':
        return 'accent';
      case 'disabled':
        return 'warning';
      case 'default':
      default:
        return 'neutral';
    }
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
    const cardEl = parentEl.createDiv({
      cls: 'opencodian-formatter-summary-card',
    });
    const [label, ...rest] = text.split(/[:：]\s*/);
    const value = rest.join(': ');
    cardEl.createDiv({
      cls: 'opencodian-formatter-summary-card-label',
      text: label ?? text,
    });
    if (value) {
      cardEl.createDiv({
        cls: 'opencodian-formatter-summary-card-value',
        text: value,
      });
    }
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

    const panelEl = containerEl.createDiv({
      cls: 'opencodian-formatter-runtime-panel opencodian-formatter-runtime-panel-collapsible',
    });
    panelEl.dataset.collapsed = 'false';
    const summaryEl = panelEl.createDiv({
      cls: 'opencodian-formatter-runtime-panel-summary',
      attr: {
        role: 'button',
        tabindex: '0',
        'aria-expanded': 'true',
      },
    });
    this.renderRuntimePanelHeader(summaryEl, {
      title: t('settings.formatter.overview.formatterList.title'),
      meta: String(runtimeState.items.length),
      metaTone: 'accent',
      collapsible: true,
    });

    const listEl = panelEl.createDiv({ cls: 'opencodian-formatter-runtime-list' });
    const toggleCollapsed = () => {
      const collapsed = panelEl.dataset.collapsed === 'true';
      const nextCollapsed = !collapsed;
      panelEl.dataset.collapsed = nextCollapsed ? 'true' : 'false';
      summaryEl.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
      listEl.hidden = nextCollapsed;
    };
    summaryEl.addEventListener('click', toggleCollapsed);
    summaryEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleCollapsed();
      }
    });

    const runtimeItems = [...runtimeState.items];
    let searchQuery = '';
    let sortKey: FormatterRuntimeSortKey | null = null;
    let sortDirection: FormatterRuntimeSortDirection = 'asc';
    const metaEl = summaryEl.querySelector('.opencodian-formatter-runtime-panel-meta');

    const toolbarEl = listEl.createDiv({
      cls: 'opencodian-formatter-runtime-toolbar opencodian-builtin-list-search',
    });
    toolbarEl.dataset.searchScope = 'runtime-formatter';
    const searchFieldEl = toolbarEl.createDiv({ cls: 'opencodian-builtin-list-search-field' });
    const searchLabelEl = searchFieldEl.createEl('label', {
      cls: 'opencodian-formatter-runtime-search-label opencodian-builtin-list-search-label',
    });
    searchLabelEl.createSpan({
      cls: 'opencodian-formatter-runtime-search-text',
      text: t('settings.formatter.overview.formatterList.searchLabel'),
    });
    const searchInputEl = searchLabelEl.createEl('input', {
      cls: 'opencodian-formatter-runtime-search-input opencodian-builtin-list-search-input',
      attr: {
        type: 'search',
        autocomplete: 'off',
        spellcheck: 'false',
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        placeholder: t('settings.formatter.overview.formatterList.searchPlaceholder'),
        'aria-label': t('settings.formatter.overview.formatterList.searchLabel'),
      },
    });
    searchInputEl.dataset.searchScope = 'runtime-formatter';
    const popoverEl = searchInputEl.ownerDocument.createElement('div');
    popoverEl.className = 'opencodian-builtin-list-search-popover';
    popoverEl.setAttribute('role', 'listbox');
    popoverEl.hidden = true;
    // Kept detached; showSearchPopover() appends it to document.body on demand.
    this.bodyLevelPopovers.push(popoverEl);
    const toolbarCountEl = toolbarEl.createSpan({ cls: 'opencodian-builtin-list-search-count' });
    const clearButtonEl = toolbarEl.createEl('button', {
      cls: 'opencodian-builtin-list-search-clear',
      text: t('settings.formatter.builtinSearch.clear'),
      attr: { type: 'button' },
    });

    const tableShellEl = listEl.createDiv({
      cls: 'opencodian-formatter-runtime-table-shell',
    });
    const tableEl = tableShellEl.createEl('table', { cls: 'opencodian-formatter-table' });
    const theadEl = tableEl.createEl('thead');
    const headerRowEl = theadEl.createEl('tr');
    const sortHeaders = new Map<FormatterRuntimeSortKey, HTMLTableCellElement>();
    this.addFormatterRuntimeSortHeader(
      headerRowEl,
      sortHeaders,
      'name',
      t('settings.formatter.overview.formatterList.name'),
    );
    this.addFormatterRuntimeSortHeader(
      headerRowEl,
      sortHeaders,
      'extensions',
      t('settings.formatter.overview.formatterList.extensions'),
    );
    this.addFormatterRuntimeSortHeader(
      headerRowEl,
      sortHeaders,
      'status',
      t('settings.formatter.overview.formatterList.status'),
    );

    const tbodyEl = tableEl.createEl('tbody');
    let activeSuggestionIndex = -1;
    let suggestionItems: OpencodeFormatterStatus[] = [];
    const hidePopover = () => {
      this.hideSearchPopover(searchInputEl, popoverEl);
    };
    const selectFormatterSuggestion = (formatter: OpencodeFormatterStatus) => {
      searchInputEl.value = formatter.name;
      searchQuery = formatter.name;
      activeSuggestionIndex = -1;
      renderRows();
      hidePopover();
      searchInputEl.focus();
    };
    const renderPopover = () => {
      popoverEl.empty();
      const query = searchInputEl.value.trim();
      if (!query || suggestionItems.length === 0) {
        hidePopover();
        return;
      }

      suggestionItems.forEach((formatter, index) => {
        const optionEl = popoverEl.createEl('button', {
          cls: 'opencodian-builtin-list-search-option',
          attr: {
            id: `opencodian-runtime-formatter-search-option-${index}`,
            type: 'button',
            role: 'option',
            'aria-selected': index === activeSuggestionIndex ? 'true' : 'false',
          },
        });
        optionEl.dataset.value = formatter.name;
        optionEl.createSpan({
          cls: 'opencodian-builtin-list-search-option-name',
          text: formatter.name,
        });
        optionEl.createSpan({
          cls: 'opencodian-builtin-list-search-option-detail',
          text: formatter.extensions.join(', '),
        });
        optionEl.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        optionEl.addEventListener('click', () => {
          selectFormatterSuggestion(formatter);
        });
      });

      this.showSearchPopover(searchInputEl, popoverEl);
      searchInputEl.setAttribute('aria-expanded', 'true');
      if (activeSuggestionIndex >= 0) {
        searchInputEl.setAttribute(
          'aria-activedescendant',
          `opencodian-runtime-formatter-search-option-${activeSuggestionIndex}`,
        );
      } else {
        searchInputEl.removeAttribute('aria-activedescendant');
      }
    };
    const renderRows = () => {
      const visibleItems = this.getVisibleFormatterRuntimeItems(
        runtimeItems,
        searchQuery,
        sortKey,
        sortDirection,
      );
      tbodyEl.empty();
      if (metaEl) {
        metaEl.textContent = visibleItems.length === runtimeItems.length
          ? String(runtimeItems.length)
          : `${visibleItems.length} / ${runtimeItems.length}`;
      }
      toolbarCountEl.textContent = t('settings.formatter.builtinSearch.count', {
        shown: visibleItems.length,
        total: runtimeItems.length,
      });
      clearButtonEl.hidden = !searchInputEl.value.trim();
      suggestionItems = searchInputEl.value.trim()
        ? this.getFormatterRuntimeSearchSuggestions(runtimeItems, searchInputEl.value).slice(0, 8)
        : [];
      if (activeSuggestionIndex >= suggestionItems.length) {
        activeSuggestionIndex = suggestionItems.length - 1;
      }
      for (const [key, headerEl] of sortHeaders) {
        const active = sortKey === key;
        headerEl.dataset.sortDirection = active ? sortDirection : 'none';
        headerEl.setAttribute(
          'aria-sort',
          active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none',
        );
      }
      if (visibleItems.length === 0) {
        const emptyRowEl = tbodyEl.createEl('tr');
        emptyRowEl.createEl('td', {
          cls: 'opencodian-formatter-table-empty',
          text: t('settings.formatter.overview.formatterList.noMatches'),
          attr: { colspan: '3' },
        });
        return;
      }
      for (const formatter of visibleItems) {
        const rowEl = tbodyEl.createEl('tr');
        rowEl.createEl('td', {
          cls: 'opencodian-formatter-table-name',
          text: formatter.name,
        });
        rowEl.createEl('td', {
          cls: 'opencodian-formatter-table-extensions',
          text: formatter.extensions.join(', '),
        });
        const statusCellEl = rowEl.createEl('td', {
          cls: 'opencodian-formatter-table-status',
        });
        statusCellEl.createSpan({
          cls: `opencodian-formatter-status-badge ${formatter.enabled ? 'is-enabled' : 'is-disabled'}`,
          text: formatter.enabled
            ? t('settings.formatter.overview.formatterList.enabled')
            : t('settings.formatter.overview.formatterList.notEnabled'),
        });
      }
      renderPopover();
    };
    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      activeSuggestionIndex = -1;
      renderRows();
    });
    searchInputEl.addEventListener('focus', () => {
      renderPopover();
    });
    searchInputEl.addEventListener('blur', () => {
      window.setTimeout(hidePopover, 120);
    });
    searchInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        hidePopover();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
        return;
      }
      if (suggestionItems.length === 0) {
        return;
      }
      event.preventDefault();
      if (event.key === 'ArrowDown') {
        activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestionItems.length - 1);
        renderPopover();
        return;
      }
      if (event.key === 'ArrowUp') {
        activeSuggestionIndex = activeSuggestionIndex <= 0 ? suggestionItems.length - 1 : activeSuggestionIndex - 1;
        renderPopover();
        return;
      }
      const selectedFormatter = suggestionItems[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0];
      if (selectedFormatter) {
        selectFormatterSuggestion(selectedFormatter);
      }
    });
    clearButtonEl.addEventListener('click', () => {
      searchInputEl.value = '';
      searchQuery = '';
      activeSuggestionIndex = -1;
      renderRows();
      searchInputEl.focus();
    });
    const toggleSort = (key: FormatterRuntimeSortKey) => {
      if (sortKey === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDirection = key === 'status' ? 'desc' : 'asc';
      }
      renderRows();
    };
    for (const [key, headerEl] of sortHeaders) {
      headerEl.addEventListener('click', () => {
        toggleSort(key);
      });
      headerEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSort(key);
        }
      });
    }
    renderRows();
  }

  private addFormatterRuntimeSortHeader(
    headerRowEl: HTMLTableRowElement,
    sortHeaders: Map<FormatterRuntimeSortKey, HTMLTableCellElement>,
    key: FormatterRuntimeSortKey,
    label: string,
  ): void {
    const headerEl = headerRowEl.createEl('th', {
      cls: `opencodian-formatter-sort-header opencodian-formatter-table-col-${key}`,
      text: label,
      attr: {
        tabindex: '0',
        'aria-sort': 'none',
        'data-sort-direction': 'none',
      },
    });
    sortHeaders.set(key, headerEl);
  }

  private getVisibleFormatterRuntimeItems(
    items: readonly OpencodeFormatterStatus[],
    searchQuery: string,
    sortKey: FormatterRuntimeSortKey | null,
    sortDirection: FormatterRuntimeSortDirection,
  ): OpencodeFormatterStatus[] {
    const query = searchQuery.trim();
    const filtered = query
      ? items.filter((item) => this.matchesFormatterRuntimeSearch(item, query))
      : [...items];
    if (!sortKey) {
      return filtered;
    }
    return [...filtered].sort((a, b) => this.compareFormatterRuntimeItems(a, b, sortKey, sortDirection));
  }

  private compareFormatterRuntimeItems(
    a: OpencodeFormatterStatus,
    b: OpencodeFormatterStatus,
    key: FormatterRuntimeSortKey,
    direction: FormatterRuntimeSortDirection,
  ): number {
    const directionFactor = direction === 'asc' ? 1 : -1;
    let comparison = 0;
    switch (key) {
      case 'extensions':
        comparison = a.extensions.join(', ').localeCompare(b.extensions.join(', '));
        break;
      case 'status':
        comparison = Number(a.enabled) - Number(b.enabled);
        break;
      case 'name':
      default:
        comparison = a.name.localeCompare(b.name);
        break;
    }
    if (comparison !== 0) {
      return comparison * directionFactor;
    }
    return a.name.localeCompare(b.name);
  }

  private matchesFormatterRuntimeSearch(
    item: OpencodeFormatterStatus,
    searchQuery: string,
  ): boolean {
    const normalizedQuery = this.normalizeFormatterRuntimeSearch(searchQuery);
    if (!normalizedQuery) {
      return true;
    }
    const target = this.normalizeFormatterRuntimeSearch(`${item.name} ${item.extensions.join(' ')}`);
    return target.includes(normalizedQuery) || this.isOrderedFuzzyMatch(normalizedQuery, target);
  }

  private getFormatterRuntimeSearchSuggestions(
    items: readonly OpencodeFormatterStatus[],
    searchQuery: string,
  ): OpencodeFormatterStatus[] {
    const query = searchQuery.trim();
    if (!query) {
      return [];
    }
    return items
      .filter((item) => this.matchesFormatterRuntimeSearch(item, query))
      .sort((left, right) => this.compareFormatterRuntimeSearchSuggestions(left, right, query));
  }

  private compareFormatterRuntimeSearchSuggestions(
    left: OpencodeFormatterStatus,
    right: OpencodeFormatterStatus,
    searchQuery: string,
  ): number {
    const normalizedQuery = this.normalizeFormatterRuntimeSearch(searchQuery);
    const score = (item: OpencodeFormatterStatus): number => {
      const name = this.normalizeFormatterRuntimeSearch(item.name);
      const extensions = this.normalizeFormatterRuntimeSearch(item.extensions.join(' '));
      if (name === normalizedQuery) return 0;
      if (name.startsWith(normalizedQuery)) return 1;
      if (name.includes(normalizedQuery)) return 2;
      if (extensions.includes(normalizedQuery)) return 3;
      return 4;
    };
    const scoreDelta = score(left) - score(right);
    if (scoreDelta !== 0) return scoreDelta;
    return left.name.localeCompare(right.name);
  }

  private normalizeFormatterRuntimeSearch(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private isOrderedFuzzyMatch(query: string, target: string): boolean {
    let queryIndex = 0;
    for (const char of target) {
      if (char === query[queryIndex]) {
        queryIndex += 1;
        if (queryIndex === query.length) {
          return true;
        }
      }
    }
    return false;
  }

  private async renderFormatterConfigBlock(containerEl: HTMLElement): Promise<void> {
    const configEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    configEl.createEl('h4', {
      text: t('settings.formatter.tab.formatter'),
      cls: 'opencodian-settings-subsection-heading opencodian-formatter-tab-heading',
    });
    const bodyEl = configEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-formatter-tab-config-shell',
    });

    await this.renderFormatterConfigContent(bodyEl);
  }

  private async renderOverviewTabbed(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h4', {
      text: t('settings.formatter.tab.overview'),
      cls: 'opencodian-settings-subsection-heading opencodian-formatter-tab-heading',
    });
    await this.renderOverviewContent(containerEl);
  }

  private async renderFormatterConfigTabbed(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h4', {
      text: t('settings.formatter.tab.formatter'),
      cls: 'opencodian-settings-subsection-heading opencodian-formatter-tab-heading',
    });
    const shellEl = containerEl.createDiv({ cls: 'opencodian-formatter-tab-config-shell' });
    await this.renderFormatterConfigContent(shellEl);
  }

  private async renderFormatterConfigContent(containerEl: HTMLElement): Promise<void> {
    const [formatterConfig, runtimeState] = await Promise.all([
      this.loadFormatterConfig(),
      this.loadFormatterRuntimeStatus(),
    ]);
    const mode = this.resolveFormatterMode(formatterConfig);

    const summaryBandEl = containerEl.createDiv({ cls: 'opencodian-formatter-tab-summary-band' });
    const contentEl = containerEl.createDiv({ cls: 'opencodian-formatter-tab-content-shell' });

    const modeSetting = new Setting(summaryBandEl)
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
    this.addFormatterLspHelpButton(modeSetting);

    if (runtimeState.fetchFailed) {
      new Setting(contentEl)
        .setDesc(t('settings.formatter.config.runtimeOfflineNote'));
    }

    if (mode !== 'custom') {
      return;
    }

    const configObj = typeof formatterConfig === 'object' ? formatterConfig : {};
    const builtinDefinitions = this.resolveBuiltinDefinitions(runtimeState.items);
    const builtinNames = new Set(builtinDefinitions.map((item) => item.name));

    this.renderBuiltinFormatterEditors(contentEl, builtinDefinitions, configObj, runtimeState);
    this.renderCustomFormatterList(contentEl, builtinNames, configObj);
    this.renderAdvancedJsonEditor(contentEl);
  }

  private renderBuiltinFormatterEditors(
    containerEl: HTMLElement,
    builtinDefinitions: readonly FormatterBuiltinDefinition[],
    configObj: Record<string, OpencodeFormatterEntryConfig>,
    runtimeState: FormatterRuntimeState,
  ): void {
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-formatter-builtin-list-shell',
    });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.config.builtinList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    if (builtinDefinitions.length === 0) {
      this.renderFormatterInlineEmpty(sectionEl, t('settings.formatter.config.builtinList.empty'));
      return;
    }

    const searchController = this.renderBuiltinSearchControl(
      sectionEl,
      'formatter',
      builtinDefinitions.map((definition) => {
        const entry = configObj[definition.name];
        return {
          id: definition.name,
          extensions: definition.extensions,
          status: this.resolveBuiltinEntryAction(entry),
        };
      }),
    );
    const scrollEl = sectionEl.createDiv({ cls: 'opencodian-formatter-builtin-scroll' });
    scrollEl.appendChild(searchController.emptyEl);
    const runtimeMap = new Map<string, OpencodeFormatterStatus>();
    for (const item of runtimeState.items) {
      runtimeMap.set(item.name, item);
    }

    for (const definition of builtinDefinitions) {
      const rowEl = this.renderBuiltinFormatterRow(scrollEl, definition, configObj, runtimeMap.get(definition.name));
      searchController.registerRow(definition.name, rowEl);
    }
  }

  private renderBuiltinFormatterRow(
    parentEl: HTMLElement,
    definition: FormatterBuiltinDefinition,
    configObj: Record<string, OpencodeFormatterEntryConfig>,
    runtimeStatus: OpencodeFormatterStatus | undefined,
  ): HTMLElement {
    const { name } = definition;
    const entry = configObj[name];
    const action = this.resolveBuiltinEntryAction(entry);

    const rowEl = parentEl.createDiv({ cls: 'opencodian-formatter-builtin-row' });
    rowEl.dataset.builtinId = name;

    const setting = new Setting(rowEl)
      .setName(name)
      .addDropdown((dropdown) => {
        dropdown.addOption('default', t('settings.formatter.config.builtin.useDefault'));
        dropdown.addOption('disable', t('settings.formatter.config.builtin.projectDisable'));
        dropdown.addOption('override', t('settings.formatter.config.builtin.projectOverride'));
        dropdown.setValue(action);
        dropdown.onChange(async (value) => {
          await this.handleBuiltinActionChange(name, value as BuiltinEntryAction);
        });
      });
    this.decorateFormatterRowSetting(setting);

    this.renderBuiltinRowStatusChip(setting, rowEl, name, action);
    this.renderBuiltinRowMeta(rowEl, runtimeStatus?.extensions ?? definition.extensions);
    if (action === 'override') {
      const fieldsEl = this.renderOverrideFields(rowEl, name, entry ?? {});
      this.attachBuiltinRowCollapse(rowEl, fieldsEl);
    }

    return rowEl;
  }

  private resolveBuiltinEntryAction(
    entry: OpencodeFormatterEntryConfig | undefined,
  ): BuiltinEntryAction {
    if (!entry) return 'default';
    if (entry.disabled) return 'disable';
    return 'override';
  }

  private renderBuiltinRowMeta(
    rowEl: HTMLElement,
    extensions: readonly string[],
  ): HTMLElement {
    const metaEl = rowEl.createDiv({ cls: 'opencodian-builtin-row-meta' });
    metaEl.createSpan({
      cls: 'opencodian-builtin-row-extensions',
      text: extensions.join(', '),
    });
    return metaEl;
  }

  private renderBuiltinRowStatusChip(
    setting: Setting,
    rowEl: HTMLElement,
    name: string,
    action: BuiltinEntryAction,
  ): HTMLElement {
    if (!setting.settingEl.parentElement) {
      rowEl.prepend(setting.settingEl);
    }

    let nameEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-name');
    if (!nameEl) {
      nameEl = setting.settingEl.createDiv({ cls: 'setting-item-name' });
    }
    if (!nameEl.textContent?.trim()) {
      nameEl.setText(name);
    }

    return this.createBuiltinRowStatusChip(nameEl, action);
  }

  private createBuiltinRowStatusChip(
    parentEl: HTMLElement,
    action: BuiltinEntryAction,
  ): HTMLElement {
    const statusChipEl = parentEl.createSpan({
      cls: 'opencodian-builtin-row-chip opencodian-builtin-row-status-chip',
      text: this.getBuiltinActionChipLabel(action),
    });
    statusChipEl.dataset.status = action;
    return statusChipEl;
  }

  private getBuiltinActionChipLabel(action: BuiltinEntryAction): string {
    switch (action) {
      case 'default':
        return t('settings.formatter.builtinSearch.status.default');
      case 'disable':
        return t('settings.formatter.builtinSearch.status.disable');
      case 'override':
        return t('settings.formatter.builtinSearch.status.override');
    }
  }

  private attachBuiltinRowCollapse(
    rowEl: HTMLElement,
    fieldsEl: HTMLElement,
  ): void {
    rowEl.addClass('is-collapsible');
    rowEl.tabIndex = 0;
    rowEl.setAttribute('aria-expanded', 'true');
    const setExpanded = (expanded: boolean) => {
      fieldsEl.hidden = !expanded;
      rowEl.toggleClass('is-collapsed', !expanded);
      rowEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };
    const toggleExpanded = () => {
      setExpanded(rowEl.getAttribute('aria-expanded') !== 'true');
    };
    rowEl.addEventListener('click', (event) => {
      if (this.shouldIgnoreBuiltinRowToggle(event.target)) return;
      toggleExpanded();
    }, { capture: true });
    rowEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (this.shouldIgnoreBuiltinRowToggle(event.target)) return;
      event.preventDefault();
      toggleExpanded();
    });
  }

  private shouldIgnoreBuiltinRowToggle(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true;
    return Boolean(target.closest('button, input, select, textarea, a, [contenteditable="true"]'));
  }

  private async handleBuiltinActionChange(
    name: string,
    action: BuiltinEntryAction,
  ): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
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

      await this.updateFormatterConfigAndReload(current);
      new Notice(t('settings.formatter.config.builtin.saved'));
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.builtin.saveFailed', { error: message }));
    }
  }

  private renderOverrideFields(
    rowEl: HTMLElement,
    name: string,
    entry: OpencodeFormatterEntryConfig,
  ): HTMLElement {
    const fieldsEl = rowEl.createDiv({
      cls:
        'opencodian-formatter-override-fields opencodian-formatter-builtin-editor-shell opencodian-formatter-field-group',
    });

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
    return fieldsEl;
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
    if (!this.ensureOpenCodeActive()) {
      return;
    }
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

      await this.updateFormatterConfigAndReload(current);
      new Notice(t('settings.formatter.config.builtin.saved'));
      await this.requestContentRefresh();
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
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-formatter-custom-list-shell',
    });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.config.customList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    const customEntries = Object.entries(configObj).filter(
      ([key, entry]) => !builtinNames.has(key) && !entry.disabled,
    );

    if (customEntries.length === 0) {
      this.renderFormatterInlineEmpty(sectionEl, t('settings.formatter.config.customList.empty'));
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

    const setting = new Setting(rowEl)
      .setName(name)
      .setDesc(`${commandStr}${extensionsStr ? ` · ${extensionsStr}` : ''}`);
    this.decorateFormatterRowSetting(setting);

    this.renderCustomEditorFields(rowEl, name, entry);
  }

  private decorateFormatterRowSetting(setting: Setting): void {
    setting.settingEl.addClass('opencodian-formatter-row-field');
    setting.controlEl.addClass('opencodian-formatter-row-control');
  }

  private renderCustomEditorFields(
    rowEl: HTMLElement,
    name: string,
    entry: OpencodeFormatterEntryConfig,
  ): void {
    const fieldsEl = rowEl.createDiv({
      cls: 'opencodian-formatter-custom-fields opencodian-formatter-field-group',
    });

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
    if (!this.ensureOpenCodeActive()) {
      return;
    }
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
      await this.updateFormatterConfigAndReload(current);
      new Notice(t('settings.formatter.config.custom.saved'));
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.custom.saveFailed', { error: message }));
    }
  }

  private async deleteCustomFormatter(name: string): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) return;

    try {
      const currentConfig = await this.loadFormatterConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      delete current[name];

      await this.updateFormatterConfigAndReload(current);
      new Notice(t('settings.formatter.config.custom.deleted'));
      await this.requestContentRefresh();
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

    const addSetting = new Setting(parentEl)
      .setName(t('settings.formatter.config.custom.addName'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.config.custom.addNamePlaceholder'));
        nameInput = text.inputEl;
      })
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.custom.addButton'))
          .setCta()
          .onClick(async () => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
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
              await this.updateFormatterConfigAndReload(current);
              new Notice(t('settings.formatter.config.custom.saved'));
              await this.requestContentRefresh();
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(t('settings.formatter.config.custom.saveFailed', { error: message }));
            }
          });
      });
    addSetting.settingEl.addClass('opencodian-formatter-add-custom-row');
  }

  private renderAdvancedJsonEditor(containerEl: HTMLElement): void {
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-formatter-advanced-editor-shell',
    });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.config.advanced.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    this.renderFormatterSectionDescription(sectionEl, t('settings.formatter.config.advanced.desc'));

    const textareaEl = this.createFormatterJsonTextarea(sectionEl, 'formatter-json-editor');

    void this.loadJsonEditorContent(textareaEl);

    const buttonBar = this.createFormatterJsonButtonBar(sectionEl);
    this.createFormatterJsonButton(
      buttonBar,
      t('settings.formatter.config.advanced.format'),
      () => {
        this.formatJsonEditor(textareaEl);
      },
    );
    this.createFormatterJsonButton(
      buttonBar,
      t('settings.formatter.config.advanced.reload'),
      async () => {
        await this.loadJsonEditorContent(textareaEl);
        new Notice(t('settings.formatter.config.advanced.reloaded'));
      },
    );
    this.createFormatterJsonButton(
      buttonBar,
      t('settings.formatter.config.advanced.save'),
      async () => {
        await this.saveJsonEditorContent(textareaEl);
      },
      { cta: true },
    );
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
    if (!this.ensureOpenCodeActive()) {
      return;
    }
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
        await this.updateFormatterConfigAndReload(false);
        new Notice(t('settings.formatter.config.advanced.saved'));
        await this.requestContentRefresh();
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
      await this.updateFormatterConfigAndReload(parsed as Record<string, OpencodeFormatterEntryConfig>);
      new Notice(t('settings.formatter.config.advanced.saved'));
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.config.advanced.saveFailed', { error: message }));
    }
  }

  private async handleModeSwitch(mode: FormatterMode): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      new Notice(t('settings.formatter.notice.modeChangeFailed', { error: 'Config manager unavailable' }));
      return;
    }

    try {
      switch (mode) {
        case 'default':
          await this.updateFormatterConfigAndReload(null);
          break;
        case 'disabled':
          await this.updateFormatterConfigAndReload(false);
          break;
        case 'custom': {
          const current = await this.loadFormatterConfig();
          const nextConfig = typeof current === 'object' ? current : {};
          await this.updateFormatterConfigAndReload(nextConfig);
          break;
        }
      }
      new Notice(t('settings.formatter.notice.modeChanged'));
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.notice.modeChangeFailed', { error: message }));
    }
  }

  private renderLspOverview(
    containerEl: HTMLElement,
    lspConfig: OpencodeLspConfig | undefined,
    runtimeState: LspRuntimeState,
  ): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-formatter-runtime-panel' });
    const headerEl = sectionEl.createDiv({
      cls: 'opencodian-formatter-runtime-panel-summary is-static',
    });
    this.renderRuntimePanelHeader(headerEl, {
      title: t('settings.formatter.tab.lsp'),
      meta: runtimeState.fetchFailed ? t('settings.formatter.lsp.overview.runtimeError') : String(runtimeState.items.length),
      metaTone: runtimeState.fetchFailed ? 'danger' : 'accent',
    });

    const bodyEl = sectionEl.createDiv({ cls: 'opencodian-formatter-runtime-list' });

    new Setting(bodyEl)
      .setName(t('settings.formatter.lsp.overview.runtimeStatus'))
      .setDesc(t(
        runtimeState.fetchFailed
          ? 'settings.formatter.lsp.overview.runtimeError'
          : 'settings.formatter.lsp.overview.runtimeOnline',
      ));

    const mode = this.resolveFormatterMode(lspConfig);
    new Setting(bodyEl)
      .setName(t('settings.formatter.lsp.overview.modeLabel'))
      .setDesc(`${this.getModeLabel(mode)} — ${this.getLspModeDescription(mode)}`);

    if (runtimeState.fetchFailed) {
      new Setting(bodyEl).setDesc(t('settings.formatter.lsp.overview.noRuntime'));
      return;
    }

    for (const item of runtimeState.items) {
      new Setting(bodyEl)
        .setName(item.id)
        .setDesc(`${item.status}${item.root ? ` · ${item.root}` : ''}`);
    }
  }

  private renderRuntimePanelHeader(
    containerEl: HTMLElement,
    options: {
      title: string;
      meta?: string;
      metaTone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
      collapsible?: boolean;
    },
  ): void {
    const shellEl = containerEl.createDiv({
      cls: 'opencodian-formatter-runtime-panel-header',
    });
    const titleGroupEl = shellEl.createDiv({
      cls: 'opencodian-formatter-runtime-panel-title-group',
    });
    titleGroupEl.createEl('div', {
      cls: 'opencodian-formatter-runtime-panel-title',
      text: options.title,
    });

    const rightEl = shellEl.createDiv({
      cls: 'opencodian-formatter-runtime-panel-header-meta',
    });
    if (options.meta) {
      const metaEl = rightEl.createSpan({
        cls: 'opencodian-formatter-runtime-panel-meta',
        text: options.meta,
      });
      if (options.metaTone) {
        metaEl.dataset.tone = options.metaTone;
      }
    }
  }

  private async renderLspConfigBlock(containerEl: HTMLElement): Promise<void> {
    const configEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    configEl.createEl('h4', {
      text: t('settings.formatter.tab.lsp'),
      cls: 'opencodian-settings-subsection-heading opencodian-formatter-tab-heading',
    });
    const bodyEl = configEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-formatter-tab-config-shell',
    });

    await this.renderLspConfigContent(bodyEl);
  }

  private async renderLspConfigTabbed(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h4', {
      text: t('settings.formatter.tab.lsp'),
      cls: 'opencodian-settings-subsection-heading opencodian-formatter-tab-heading',
    });
    const shellEl = containerEl.createDiv({ cls: 'opencodian-formatter-tab-config-shell' });
    await this.renderLspConfigContent(shellEl);
  }

  private async renderLspConfigContent(containerEl: HTMLElement): Promise<void> {
    const [lspConfig, runtimeState] = await Promise.all([
      this.loadLspConfig(),
      this.loadLspRuntimeStatus(),
    ]);
    const mode = this.resolveFormatterMode(lspConfig);

    const summaryBandEl = containerEl.createDiv({ cls: 'opencodian-formatter-tab-summary-band' });
    const contentEl = containerEl.createDiv({ cls: 'opencodian-formatter-tab-content-shell' });

    const modeSetting = new Setting(summaryBandEl)
      .setName(t('settings.formatter.lsp.modeSwitch'))
      .setDesc(t('settings.formatter.lsp.modeSwitchDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('default', t('settings.formatter.mode.default'));
        dropdown.addOption('disabled', t('settings.formatter.mode.disabled'));
        dropdown.addOption('custom', t('settings.formatter.mode.custom'));
        dropdown.setValue(mode);
        dropdown.onChange(async (value) => {
          await this.handleLspModeSwitch(value as FormatterMode);
        });
      });
    this.addFormatterLspHelpButton(modeSetting);

    if (runtimeState.fetchFailed) {
      new Setting(contentEl)
        .setDesc(t('settings.formatter.lsp.runtimeOfflineNote'));
    }

    if (mode !== 'custom') {
      return;
    }

    const configObj = typeof lspConfig === 'object' ? lspConfig : {};
    const builtinDefinitions = this.resolveLspBuiltinDefinitions(runtimeState.items);
    const builtinIds = new Set(builtinDefinitions.map((item) => item.id));

    this.renderBuiltinLspEditors(contentEl, builtinDefinitions, configObj);
    this.renderCustomLspList(contentEl, builtinIds, configObj);
    this.renderLspAdvancedJsonEditor(contentEl);
  }

  private renderBuiltinLspEditors(
    containerEl: HTMLElement,
    builtinDefinitions: readonly LspBuiltinDefinition[],
    configObj: Record<string, OpencodeLspEntryConfig>,
  ): void {
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-formatter-builtin-list-shell',
    });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.lsp.builtinList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    const searchController = this.renderBuiltinSearchControl(
      sectionEl,
      'lsp',
      builtinDefinitions.map((definition) => {
        const entry = configObj[definition.id];
        return {
          id: definition.id,
          extensions: definition.extensions,
          status: this.resolveBuiltinEntryAction(entry),
        };
      }),
    );
    const scrollEl = sectionEl.createDiv({ cls: 'opencodian-formatter-builtin-scroll' });
    scrollEl.appendChild(searchController.emptyEl);
    for (const definition of builtinDefinitions) {
      const entry = configObj[definition.id];
      const action = this.resolveBuiltinEntryAction(entry);
      const rowEl = scrollEl.createDiv({ cls: 'opencodian-formatter-builtin-row' });
      rowEl.dataset.builtinId = definition.id;

      const setting = new Setting(rowEl)
        .setName(definition.id)
        .addDropdown((dropdown) => {
          dropdown.addOption('default', t('settings.formatter.config.builtin.useDefault'));
          dropdown.addOption('disable', t('settings.formatter.config.builtin.projectDisable'));
          dropdown.addOption('override', t('settings.formatter.config.builtin.projectOverride'));
          dropdown.setValue(action);
          dropdown.onChange(async (value) => {
            await this.handleBuiltinLspActionChange(definition.id, value as BuiltinEntryAction);
          });
        });
      this.decorateFormatterRowSetting(setting);

      this.renderBuiltinRowStatusChip(setting, rowEl, definition.id, action);
      this.renderBuiltinRowMeta(rowEl, definition.extensions);
      if (action === 'override') {
        const fieldsEl = this.renderLspEditorFields(rowEl, definition.id, entry ?? {}, true);
        this.attachBuiltinRowCollapse(rowEl, fieldsEl);
      }
      searchController.registerRow(definition.id, rowEl);
    }
  }

  private renderBuiltinSearchControl(
    sectionEl: HTMLElement,
    scope: BuiltinSearchScope,
    entries: readonly BuiltinSearchEntry[],
  ): BuiltinSearchController {
    const rowMap = new Map<string, HTMLElement>();
    const searchEl = sectionEl.createDiv({ cls: 'opencodian-builtin-list-search' });
    searchEl.dataset.searchScope = scope;

    const fieldEl = searchEl.createDiv({ cls: 'opencodian-builtin-list-search-field' });
    const labelEl = fieldEl.createEl('label', {
      cls: 'opencodian-builtin-list-search-label',
      text: t('settings.formatter.builtinSearch.label'),
    });
    const inputEl = fieldEl.createEl('input', {
      cls: 'opencodian-builtin-list-search-input',
      attr: {
        type: 'search',
        autocomplete: 'off',
        spellcheck: 'false',
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-label': t(scope === 'formatter'
          ? 'settings.formatter.builtinSearch.formatterAria'
          : 'settings.formatter.builtinSearch.lspAria'),
        placeholder: t(scope === 'formatter'
          ? 'settings.formatter.builtinSearch.formatterPlaceholder'
          : 'settings.formatter.builtinSearch.lspPlaceholder'),
      },
    });
    inputEl.dataset.searchScope = scope;
    labelEl.appendChild(inputEl);

    const popoverEl = inputEl.ownerDocument.createElement('div');
    popoverEl.className = 'opencodian-builtin-list-search-popover';
    popoverEl.setAttribute('role', 'listbox');
    popoverEl.hidden = true;
    // Kept detached; showSearchPopover() appends it to document.body on demand.
    this.bodyLevelPopovers.push(popoverEl);

    const metaEl = searchEl.createSpan({ cls: 'opencodian-builtin-list-search-count' });
    const filterEl = searchEl.createEl('select', {
      cls: 'opencodian-builtin-list-status-filter',
      attr: {
        'aria-label': t(scope === 'formatter'
          ? 'settings.formatter.builtinSearch.formatterStatusAria'
          : 'settings.formatter.builtinSearch.lspStatusAria'),
      },
    });
    filterEl.dataset.searchScope = scope;
    this.addBuiltinStatusFilterOption(filterEl, 'all', t('settings.formatter.builtinSearch.status.all'));
    this.addBuiltinStatusFilterOption(filterEl, 'default', t('settings.formatter.builtinSearch.status.default'));
    this.addBuiltinStatusFilterOption(filterEl, 'override', t('settings.formatter.builtinSearch.status.override'));
    this.addBuiltinStatusFilterOption(filterEl, 'disable', t('settings.formatter.builtinSearch.status.disable'));
    const clearButtonEl = searchEl.createEl('button', {
      cls: 'opencodian-builtin-list-search-clear',
      text: t('settings.formatter.builtinSearch.clear'),
      attr: { type: 'button' },
    });
    const emptyEl = sectionEl.createDiv({
      cls: 'opencodian-builtin-list-search-empty',
      text: t('settings.formatter.builtinSearch.noMatches'),
    });
    emptyEl.hidden = true;

    let activeIndex = -1;
    let suggestionEntries: BuiltinSearchEntry[] = [];

    const selectEntry = (entry: BuiltinSearchEntry) => {
      inputEl.value = entry.id;
      activeIndex = -1;
      refresh();
      hidePopover();
      inputEl.focus();
    };

    const hidePopover = () => {
      this.hideSearchPopover(inputEl, popoverEl);
    };

    const renderPopover = () => {
      popoverEl.empty();
      const query = inputEl.value.trim();
      if (!query || suggestionEntries.length === 0) {
        hidePopover();
        return;
      }

      suggestionEntries.forEach((entry, index) => {
        const optionEl = popoverEl.createEl('button', {
          cls: 'opencodian-builtin-list-search-option',
          attr: {
            id: `opencodian-${scope}-builtin-search-option-${index}`,
            type: 'button',
            role: 'option',
            'aria-selected': index === activeIndex ? 'true' : 'false',
          },
        });
        optionEl.dataset.value = entry.id;
        optionEl.createSpan({ cls: 'opencodian-builtin-list-search-option-name', text: entry.id });
        optionEl.createSpan({
          cls: 'opencodian-builtin-list-search-option-detail',
          text: entry.extensions.join(', '),
        });
        optionEl.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        optionEl.addEventListener('click', () => {
          selectEntry(entry);
        });
      });

      this.showSearchPopover(inputEl, popoverEl);
      inputEl.setAttribute('aria-expanded', 'true');
      if (activeIndex >= 0) {
        inputEl.setAttribute('aria-activedescendant', `opencodian-${scope}-builtin-search-option-${activeIndex}`);
      } else {
        inputEl.removeAttribute('aria-activedescendant');
      }
    };

    const refresh = () => {
      const query = inputEl.value.trim();
      const statusFilter = filterEl.value as BuiltinStatusFilter;
      const filteredEntries = entries
        .filter((entry) => statusFilter === 'all' || entry.status === statusFilter)
        .filter((entry) => !query || this.matchesBuiltinSearch(entry, query))
        .sort((left, right) => query
          ? this.compareBuiltinSearchEntries(left, right, query)
          : left.id.localeCompare(right.id));
      const visibleIds = new Set(filteredEntries.map((entry) => entry.id));
      let firstVisibleRowEl: HTMLElement | null = null;
      let lastVisibleRowEl: HTMLElement | null = null;
      for (const [id, rowEl] of rowMap) {
        rowEl.removeClass('is-first-visible');
        rowEl.removeClass('is-last-visible');
        const isVisible = visibleIds.has(id);
        rowEl.hidden = !isVisible;
        if (isVisible) {
          if (!firstVisibleRowEl) {
            firstVisibleRowEl = rowEl;
          }
          lastVisibleRowEl = rowEl;
        }
      }
      firstVisibleRowEl?.addClass('is-first-visible');
      lastVisibleRowEl?.addClass('is-last-visible');

      suggestionEntries = query ? filteredEntries.slice(0, 8) : [];
      if (activeIndex >= suggestionEntries.length) {
        activeIndex = suggestionEntries.length - 1;
      }
      metaEl.textContent = t('settings.formatter.builtinSearch.count', {
        shown: filteredEntries.length,
        total: entries.length,
      });
      clearButtonEl.hidden = !query && statusFilter === 'all';
      emptyEl.hidden = (!query && statusFilter === 'all') || filteredEntries.length > 0;
      renderPopover();
    };

    inputEl.addEventListener('input', () => {
      activeIndex = -1;
      refresh();
    });
    inputEl.addEventListener('focus', () => {
      renderPopover();
    });
    inputEl.addEventListener('blur', () => {
      window.setTimeout(hidePopover, 120);
    });
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        hidePopover();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
        return;
      }
      if (suggestionEntries.length === 0) {
        return;
      }
      event.preventDefault();
      if (event.key === 'ArrowDown') {
        activeIndex = Math.min(activeIndex + 1, suggestionEntries.length - 1);
        renderPopover();
        return;
      }
      if (event.key === 'ArrowUp') {
        activeIndex = activeIndex <= 0 ? suggestionEntries.length - 1 : activeIndex - 1;
        renderPopover();
        return;
      }
      const selectedEntry = suggestionEntries[activeIndex >= 0 ? activeIndex : 0];
      if (selectedEntry) {
        selectEntry(selectedEntry);
      }
    });
    clearButtonEl.addEventListener('click', () => {
      inputEl.value = '';
      filterEl.value = 'all';
      activeIndex = -1;
      refresh();
      inputEl.focus();
    });
    filterEl.addEventListener('change', () => {
      activeIndex = -1;
      refresh();
    });

    refresh();
    return {
      emptyEl,
      registerRow: (id, rowEl) => {
        rowMap.set(id, rowEl);
        refresh();
      },
    };
  }

  private addBuiltinStatusFilterOption(
    selectEl: HTMLSelectElement,
    value: BuiltinStatusFilter,
    label: string,
  ): void {
    selectEl.createEl('option', {
      text: label,
      attr: { value },
    });
  }

  private matchesBuiltinSearch(entry: BuiltinSearchEntry, query: string): boolean {
    const searchableText = `${entry.id} ${entry.extensions.join(' ')}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).every((token) => {
      if (!token) return true;
      return searchableText.includes(token) || this.isSubsequence(token, searchableText);
    });
  }

  private compareBuiltinSearchEntries(
    left: BuiltinSearchEntry,
    right: BuiltinSearchEntry,
    query: string,
  ): number {
    const normalizedQuery = query.trim().toLowerCase();
    const score = (entry: BuiltinSearchEntry): number => {
      const id = entry.id.toLowerCase();
      const extensions = entry.extensions.join(' ').toLowerCase();
      if (id === normalizedQuery) return 0;
      if (id.startsWith(normalizedQuery)) return 1;
      if (id.includes(normalizedQuery)) return 2;
      if (extensions.includes(normalizedQuery)) return 3;
      return 4;
    };
    const scoreDelta = score(left) - score(right);
    if (scoreDelta !== 0) return scoreDelta;
    return left.id.localeCompare(right.id);
  }

  private isSubsequence(needle: string, haystack: string): boolean {
    let index = 0;
    for (const char of haystack) {
      if (char === needle[index]) {
        index++;
        if (index === needle.length) {
          return true;
        }
      }
    }
    return needle.length === 0;
  }

  private async handleBuiltinLspActionChange(name: string, action: BuiltinEntryAction): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager || typeof configManager.updateLspConfig !== 'function') return;

    try {
      const currentConfig = await this.loadLspConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      const existingEntry = current[name];

      switch (action) {
        case 'default':
          delete current[name];
          break;
        case 'disable':
          current[name] = { ...this.preserveUnknownLspFields(existingEntry), disabled: true };
          break;
        case 'override': {
          const preserved = this.preserveUnknownLspFields(existingEntry);
          delete preserved.disabled;
          current[name] = preserved;
          break;
        }
      }

      await this.updateLspConfigAndReload(current);
      new Notice(t('settings.formatter.lsp.builtin.saved'));
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.lsp.builtin.saveFailed', { error: message }));
    }
  }

  private renderCustomLspList(
    containerEl: HTMLElement,
    builtinIds: Set<string>,
    configObj: Record<string, OpencodeLspEntryConfig>,
  ): void {
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-formatter-custom-list-shell',
    });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.lsp.customList.title'),
      cls: 'opencodian-settings-subsection-heading',
    });

    const customEntries = Object.entries(configObj).filter(([key]) => !builtinIds.has(key));

    if (customEntries.length === 0) {
      this.renderFormatterInlineEmpty(sectionEl, t('settings.formatter.lsp.customList.empty'));
      return;
    }

    for (const [name, entry] of customEntries) {
      const rowEl = sectionEl.createDiv({ cls: 'opencodian-formatter-custom-row' });
      const setting = new Setting(rowEl)
        .setName(name)
        .setDesc((entry.command ?? []).join(' '));
      this.decorateFormatterRowSetting(setting);
      this.renderLspEditorFields(rowEl, name, entry, false);
    }
  }

  private renderLspEditorFields(
    rowEl: HTMLElement,
    name: string,
    entry: OpencodeLspEntryConfig,
    builtin: boolean,
  ): HTMLElement {
    const fieldsEl = rowEl.createDiv({
      cls: 'opencodian-formatter-custom-fields opencodian-formatter-field-group',
    });

    new Setting(fieldsEl)
      .setName(t('settings.formatter.lsp.command'))
      .setDesc(t('settings.formatter.lsp.commandDesc'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.lsp.commandPlaceholder'))
          .setValue((entry.command ?? []).join(' '));
        text.inputEl.addClass('opencodian-lsp-command-input');
      });

    this.renderLspEnvironmentEditor(fieldsEl, entry.env);

    new Setting(fieldsEl)
      .setName(t('settings.formatter.lsp.extensions'))
      .setDesc(t('settings.formatter.lsp.extensionsDesc'))
      .addText((text) => {
        text.setPlaceholder(t('settings.formatter.lsp.extensionsPlaceholder'))
          .setValue((entry.extensions ?? []).join(' '));
        text.inputEl.addClass('opencodian-lsp-extensions-input');
      });

    new Setting(fieldsEl)
      .setName(t('settings.formatter.lsp.initialization'))
      .setDesc(t('settings.formatter.lsp.initializationDesc'));
    const initText = fieldsEl.createEl('textarea', { cls: 'opencodian-lsp-initialization-input' });
    initText.value = JSON.stringify(entry.initialization ?? {}, null, 2);
    this.textareaSizeMemories.push(TextareaSizeMemory.attach(initText, 'lsp-initialization-editor'));

    new Setting(fieldsEl)
      .addButton((btn) => {
        btn.setButtonText(
          builtin
            ? t('settings.formatter.lsp.builtin.save')
            : t('settings.formatter.lsp.custom.save'),
        ).setCta()
          .onClick(async () => {
            await this.saveLspEntryFromFields(fieldsEl, name, builtin);
          });
      });
    return fieldsEl;
  }

  private renderLspEnvironmentEditor(
    fieldsEl: HTMLElement,
    env: Record<string, string> | undefined,
  ): void {
    const envContainer = fieldsEl.createDiv({ cls: 'opencodian-formatter-env-editor' });

    new Setting(envContainer)
      .setName(t('settings.formatter.lsp.environment'))
      .setDesc(t('settings.formatter.lsp.environmentDesc'));

    const rowsContainer = envContainer.createDiv({ cls: 'opencodian-formatter-env-rows' });
    for (const [key, value] of Object.entries(env ?? {})) {
      this.addEnvRow(rowsContainer, key, value);
    }

    new Setting(envContainer)
      .addButton((btn) => {
        btn.setButtonText(t('settings.formatter.config.builtin.envAdd'))
          .onClick(() => this.addEnvRow(rowsContainer, '', ''));
      });
  }

  private async saveLspEntryFromFields(
    fieldsEl: HTMLElement,
    name: string,
    builtin: boolean,
  ): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager || typeof configManager.updateLspConfig !== 'function') return;

    const commandInput = fieldsEl.querySelector('.opencodian-lsp-command-input') as HTMLInputElement | null;
    const extensionsInput = fieldsEl.querySelector('.opencodian-lsp-extensions-input') as HTMLInputElement | null;
    const initializationInput = fieldsEl.querySelector('.opencodian-lsp-initialization-input') as HTMLTextAreaElement | null;

    const command = (commandInput?.value?.trim() ?? '').split(/\s+/).filter(Boolean);
    const extensions = this.normalizeExtensions((extensionsInput?.value?.trim() ?? '').split(/\s+/).filter(Boolean));

    if (command.length === 0) {
      new Notice(t('settings.formatter.config.custom.commandRequired'));
      return;
    }
    if (!builtin && extensions.length === 0) {
      new Notice(t('settings.formatter.lsp.custom.extensionsRequired'));
      return;
    }

    let initialization: Record<string, unknown> | undefined;
    try {
      initialization = JSON.parse(initializationInput?.value?.trim() || '{}') as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.lsp.initializationInvalid', { error: message }));
      return;
    }

    try {
      const currentConfig = await this.loadLspConfig();
      const current = typeof currentConfig === 'object' ? { ...currentConfig } : {};
      const nextEntry: OpencodeLspEntryConfig = {
        ...this.preserveUnknownLspFields(current[name]),
        command,
      };
      if (extensions.length > 0) {
        nextEntry.extensions = extensions;
      } else {
        delete nextEntry.extensions;
      }
      const env = this.collectEnvironmentFromRows(fieldsEl);
      if (Object.keys(env).length > 0) {
        nextEntry.env = env;
      } else {
        delete nextEntry.env;
      }
      if (Object.keys(initialization).length > 0) {
        nextEntry.initialization = initialization;
      } else {
        delete nextEntry.initialization;
      }
      delete nextEntry.disabled;
      current[name] = nextEntry;
      await this.updateLspConfigAndReload(current);
      new Notice(
        builtin
          ? t('settings.formatter.lsp.builtin.saved')
          : t('settings.formatter.lsp.custom.saved'),
      );
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(
        builtin
          ? t('settings.formatter.lsp.builtin.saveFailed', { error: message })
          : t('settings.formatter.lsp.custom.saveFailed', { error: message }),
      );
    }
  }

  private renderLspAdvancedJsonEditor(containerEl: HTMLElement): void {
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-formatter-advanced-editor-shell',
    });
    sectionEl.createEl('h4', {
      text: t('settings.formatter.lsp.advanced.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    this.renderFormatterSectionDescription(sectionEl, t('settings.formatter.lsp.advanced.desc'));

    const textareaEl = this.createFormatterJsonTextarea(sectionEl, 'lsp-json-editor');
    void this.loadLspJsonEditorContent(textareaEl);

    const buttonBar = this.createFormatterJsonButtonBar(sectionEl);
    this.createFormatterJsonButton(
      buttonBar,
      t('settings.formatter.lsp.advanced.format'),
      () => this.formatJsonEditor(textareaEl),
    );
    this.createFormatterJsonButton(
      buttonBar,
      t('settings.formatter.lsp.advanced.reload'),
      async () => {
        await this.loadLspJsonEditorContent(textareaEl);
      },
    );
    this.createFormatterJsonButton(
      buttonBar,
      t('settings.formatter.lsp.advanced.save'),
      async () => {
        await this.saveLspJsonEditorContent(textareaEl);
      },
      { cta: true },
    );
  }

  private renderFormatterSectionDescription(parentEl: HTMLElement, text: string): HTMLElement {
    return parentEl.createDiv({
      cls: 'opencodian-formatter-section-description',
      text,
    });
  }

  private renderFormatterInlineEmpty(parentEl: HTMLElement, text: string): HTMLElement {
    return parentEl.createDiv({
      cls: 'opencodian-settings-inline-empty opencodian-formatter-inline-empty',
      text,
    });
  }

  private createFormatterJsonTextarea(
    parentEl: HTMLElement,
    memoryKey: string,
  ): HTMLTextAreaElement {
    const editorContainer = parentEl.createDiv({ cls: 'opencodian-formatter-json-editor' });
    const textareaEl = editorContainer.createEl('textarea', {
      cls: 'opencodian-formatter-json-textarea',
    });
    textareaEl.rows = 12;
    textareaEl.spellcheck = false;
    this.textareaSizeMemories.push(TextareaSizeMemory.attach(textareaEl, memoryKey));
    return textareaEl;
  }

  private createFormatterJsonButtonBar(parentEl: HTMLElement): HTMLElement {
    return parentEl.createDiv({
      cls: 'opencodian-formatter-json-buttons opencodian-settings-action-footer',
      attr: { role: 'group' },
    });
  }

  private createFormatterJsonButton(
    parentEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
    options: { cta?: boolean } = {},
  ): HTMLButtonElement {
    const buttonEl = parentEl.createEl('button', {
      text: label,
    });
    buttonEl.type = 'button';
    if (options.cta) {
      buttonEl.addClass('mod-cta');
    }
    buttonEl.addEventListener('click', () => {
      void onClick();
    });
    return buttonEl;
  }

  private async loadLspJsonEditorContent(textareaEl: HTMLTextAreaElement): Promise<void> {
    const lspConfig = await this.loadLspConfig();
    textareaEl.value = JSON.stringify(
      typeof lspConfig === 'object' ? lspConfig : typeof lspConfig === 'boolean' ? lspConfig : {},
      null,
      2,
    );
  }

  private async saveLspJsonEditorContent(textareaEl: HTMLTextAreaElement): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager || typeof configManager.updateLspConfig !== 'function') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(textareaEl.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.lsp.advanced.invalidJson', { error: message }));
      return;
    }

    if (parsed === false) {
      await this.updateLspConfigAndReload(false);
      await this.requestContentRefresh();
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      new Notice(t('settings.formatter.lsp.advanced.invalidJson', { error: 'Must be an object or false' }));
      return;
    }
    await this.updateLspConfigAndReload(parsed as Record<string, OpencodeLspEntryConfig>);
    await this.requestContentRefresh();
  }

  private async handleLspModeSwitch(mode: FormatterMode): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager || typeof configManager.updateLspConfig !== 'function') {
      new Notice(t('settings.formatter.notice.modeChangeFailed', { error: 'Config manager unavailable' }));
      return;
    }

    try {
      switch (mode) {
        case 'default':
          await this.updateLspConfigAndReload(null);
          break;
        case 'disabled':
          await this.updateLspConfigAndReload(false);
          break;
        case 'custom': {
          const current = await this.loadLspConfig();
          await this.updateLspConfigAndReload(typeof current === 'object' ? current : {});
          break;
        }
      }
      await this.requestContentRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.formatter.notice.modeChangeFailed', { error: message }));
    }
  }

  private addFormatterLspHelpButton(setting: Setting): void {
    setting.addExtraButton((button) => {
      button
        .setIcon('help-circle')
        .setTooltip(t('settings.formatter.help.tooltip'))
        .onClick(() => {
          new OpenCodeProjectConfigHelpModal(this.plugin.app, 'formatterLsp').open();
        });
    });
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

  private preserveUnknownLspFields(
    entry: OpencodeLspEntryConfig | undefined,
  ): Record<string, unknown> {
    if (!entry) return {};
    const known = new Set(['disabled', 'command', 'extensions', 'env', 'initialization']);
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

  private resolveLspBuiltinDefinitions(
    runtimeItems: readonly OpencodeLspStatus[],
  ): LspBuiltinDefinition[] {
    const definitions = new Map(
      LSP_BUILTIN_CATALOG.map((item) => [item.id, { ...item }]),
    );
    for (const item of runtimeItems) {
      if (!definitions.has(item.id)) {
        definitions.set(item.id, {
          id: item.id,
          extensions: [],
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

  private getLspModeDescription(mode: FormatterMode): string {
    switch (mode) {
      case 'default':
        return t('settings.formatter.lsp.mode.defaultDesc');
      case 'disabled':
        return t('settings.formatter.lsp.mode.disabledDesc');
      case 'custom':
        return t('settings.formatter.lsp.mode.customDesc');
    }
  }

  private isOpenCodeActive(): boolean {
    return isOpenCodeSettingsBackendActive(this.plugin.settings);
  }

  private ensureOpenCodeActive(): boolean {
    if (this.isOpenCodeActive()) {
      return true;
    }
    new Notice(t('settings.formatter.notice.openCodeOnly'));
    return false;
  }
}
