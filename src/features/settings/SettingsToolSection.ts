/* eslint-disable max-lines -- SettingsToolSection owns the built-in/custom tools settings surface and still carries UI, file authoring, and permission wiring together. */
import { Notice, Setting } from 'obsidian';

import { t } from '../../i18n';
import type { OpenCodianPlugin } from '../../main';
import { getToolIdentity, isBuiltinToolName } from '../../shared/toolIdentity';
import { isOpenCodeSettingsBackendActive } from './settingsBackendGuards';
import { ToolDetailModal, type ToolFileInfo, type ToolFileSource } from './SettingsToolDetailModal';
import { SettingsToolFileService } from './SettingsToolFileService';

type ToolPermissionAction = 'allow' | 'deny' | 'ask';
type ToolPermissionSelection = ToolPermissionAction | 'inherit' | 'custom';
type GlobalToolPermissionSelection = ToolPermissionAction | 'opencode-default';
type ToolPermissionMap = Record<string, unknown>;
type ToolPermissionSource = 'inherit' | 'override' | 'custom';

interface ToolCatalogStoreLike {
  classifyToolIds(toolIds: string[]): { builtin: string[]; custom: string[] };
  getToolCatalogSnapshot(): { registryToolIds: string[] };
}

interface ToolRowRenderOptions {
  containerEl: HTMLElement;
  toolId: string;
  displayName: string;
  currentPermissions: ToolPermissionMap;
  permissionKey?: string;
}

interface SettingsScrollArea {
  readonly rootEl: HTMLElement;
  readonly viewportEl: HTMLElement;
  readonly contentEl: HTMLElement;
}

const TOOL_GROUPS: Array<{ labelKey: string; descKey: string; toolNames: string[] }> = [
  {
    labelKey: 'settings.tools.group.fileOps',
    descKey: 'settings.tools.group.fileOps.desc',
    toolNames: ['read', 'write', 'edit', 'multiedit', 'apply_patch', 'patch'],
  },
  {
    labelKey: 'settings.tools.group.search',
    descKey: 'settings.tools.group.search.desc',
    toolNames: ['glob', 'grep', 'list', 'codesearch'],
  },
  {
    labelKey: 'settings.tools.group.execution',
    descKey: 'settings.tools.group.execution.desc',
    toolNames: ['bash', 'task'],
  },
  {
    labelKey: 'settings.tools.group.network',
    descKey: 'settings.tools.group.network.desc',
    toolNames: ['web_fetch', 'web_search'],
  },
  {
    labelKey: 'settings.tools.group.intelligence',
    descKey: 'settings.tools.group.intelligence.desc',
    toolNames: ['lsp'],
  },
  {
    labelKey: 'settings.tools.group.meta',
    descKey: 'settings.tools.group.meta.desc',
    toolNames: ['skill', 'todowrite', 'todoread', 'question'],
  },
  {
    labelKey: 'settings.tools.group.plan',
    descKey: 'settings.tools.group.plan.desc',
    toolNames: ['plan_enter', 'plan_exit'],
  },
];

const TOOL_DOC_URL = 'https://opencode.ai/docs/custom-tools';
const BUILTIN_TOOL_PERMISSION_KEY_ALIASES: Record<string, string> = {
  write: 'edit',
  multiedit: 'edit',
  apply_patch: 'edit',
  patch: 'edit',
  web_fetch: 'webfetch',
  web_search: 'websearch',
};

export class SettingsToolSection {
  private bodyEl: HTMLElement | null = null;
  private readonly toolFileService: SettingsToolFileService;

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly plugin: OpenCodianPlugin,
    private readonly mode: 'builtin' | 'custom',
  ) {
    this.toolFileService = new SettingsToolFileService(plugin);
  }

  async render(): Promise<void> {
    this.containerEl.empty();
    this.bodyEl = this.containerEl;
    const currentPermissions = await this.readCurrentPermissions();

    if (this.mode === 'builtin') {
      this.renderToolControlPanel(currentPermissions);
      await this.renderBuiltinTools(currentPermissions);
      return;
    }

    await this.renderCustomTools(currentPermissions);
  }

  private async renderBuiltinTools(currentPermissions: ToolPermissionMap): Promise<void> {
    for (const group of TOOL_GROUPS) {
      const groupEl = this.containerEl.createDiv({ cls: 'opencodian-tool-group-panel' });
      const headerEl = groupEl.createDiv({ cls: 'opencodian-tool-group-header' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerEl.createEl('h3', { text: t(group.labelKey as any) });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerEl.createDiv({ cls: 'opencodian-tool-group-desc', text: t(group.descKey as any) });
      const rowsEl = this.createScrollArea(groupEl, {
        rootClass: 'opencodian-tool-group-rows',
        contentClass: 'opencodian-settings-scrollarea-content--tools',
      }).contentEl;

      for (const toolName of group.toolNames) {
        if (!isBuiltinToolName(toolName)) {
          continue;
        }

        const identity = getToolIdentity(toolName);
        this.renderToolRow({
          containerEl: rowsEl,
          toolId: identity.normalizedName,
          displayName: identity.displayName,
          currentPermissions,
          permissionKey: this.getBuiltinPermissionKey(identity.normalizedName),
        });
      }
    }
  }

  private renderToolControlPanel(currentPermissions: ToolPermissionMap): void {
    const selection = this.getGlobalPermissionSelection(currentPermissions);
    const panelEl = this.containerEl.createDiv({
      cls: 'opencodian-tool-control-panel opencodian-skill-control-panel opencodian-settings-section',
      attr: { 'data-settings-surface': 'section' },
    });
    const clusterEl = panelEl.createDiv({
      cls: 'opencodian-tool-default-cluster opencodian-skill-permission-cluster',
    });
    const copyEl = clusterEl.createDiv({
      cls: 'opencodian-tool-default-copy opencodian-skill-permission-copy',
    });
    copyEl.createDiv({
      cls: 'opencodian-tool-default-title opencodian-skill-permission-title',
      text: t('settings.tools.default.title'),
    });
    copyEl.createDiv({
      cls: 'opencodian-tool-default-desc opencodian-skill-permission-summary',
      text: t('settings.tools.default.desc'),
    });
    copyEl.createDiv({
      cls: 'opencodian-tool-default-status opencodian-skill-permission-global-status',
      text: this.formatDefaultPermissionStatus(selection),
    });

    const actionEl = clusterEl.createDiv({
      cls: 'opencodian-tool-default-action opencodian-skill-permission-actions',
    });
    const dropdownEl = actionEl.createEl('select', {
      cls: 'dropdown opencodian-tool-default-select opencodian-skill-permission-select',
      attr: { 'aria-label': t('settings.tools.default.label') },
    });
    this.addPermissionOption(dropdownEl, 'opencode-default', t('settings.tools.default.opencodeDefault'));
    this.addPermissionOption(dropdownEl, 'allow', t('settings.tools.permission.allow'));
    this.addPermissionOption(dropdownEl, 'ask', t('settings.tools.permission.ask'));
    this.addPermissionOption(dropdownEl, 'deny', t('settings.tools.permission.deny'));
    dropdownEl.value = selection;
    dropdownEl.addEventListener('change', () => {
      void this.setGlobalToolPermission(this.normalizeGlobalPermissionSelection(dropdownEl.value));
    });
  }

  private addPermissionOption(selectEl: HTMLSelectElement, value: string, label: string): void {
    const optionEl = selectEl.createEl('option', { text: label });
    optionEl.value = value;
  }

  private async renderCustomTools(currentPermissions: ToolPermissionMap): Promise<void> {
    this.renderToolControlPanel(currentPermissions);
    await this.renderToolFiles(currentPermissions);
    await this.renderRuntimeCustomTools(currentPermissions);
  }

  private async renderToolFiles(currentPermissions: ToolPermissionMap): Promise<void> {
    const files = await this.toolFileService.getCustomToolFiles();
    const panelEl = this.containerEl.createDiv({
      cls: 'opencodian-tool-group-panel opencodian-tool-file-panel',
    });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-tool-group-header opencodian-tool-files-header' });
    const copyEl = headerEl.createDiv({ cls: 'opencodian-tool-files-copy' });
    const titleRowEl = copyEl.createDiv({ cls: 'opencodian-tool-files-title-row' });
    titleRowEl.createEl('h3', { text: t('settings.tools.custom.files.title') });
    titleRowEl.createEl('span', {
      cls: 'opencodian-tool-files-count-badge',
      text: t('settings.tools.custom.files.desc').replace('{count}', String(files.length)),
    });
    copyEl.createDiv({
      cls: 'opencodian-tool-group-desc',
      text: t('settings.tools.custom.create.desc'),
    });
    this.renderCustomToolFileActions(headerEl);
    const rowsEl = this.createScrollArea(panelEl, {
      rootClass: 'opencodian-tool-group-rows',
      contentClass: 'opencodian-settings-scrollarea-content--tools',
    }).contentEl;

    if (files.length === 0) {
      rowsEl.createDiv({
        cls: 'opencodian-settings-inline-empty opencodian-tool-empty',
        text: t('settings.tools.custom.files.empty'),
      });
      return;
    }

    for (const file of files) {
      this.renderToolFileCard(rowsEl, file, currentPermissions);
    }
  }

  private renderCustomToolFileActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-tool-files-actions' });
    const createSetting = new Setting(actionsEl)
      .setClass('opencodian-tool-files-action')
      .setName(t('settings.tools.custom.create.label'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.tools.custom.create.button'))
          .onClick(async () => {
            await this.createProjectTool();
          });
      });
    createSetting.settingEl.addClass('opencodian-tool-files-action--primary');
    new Setting(actionsEl)
      .setClass('opencodian-tool-files-action')
      .setName(t('settings.tools.refresh'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.tools.refresh'))
          .onClick(async () => {
            await this.refresh({ restartLocalService: true });
          });
      });
    const docsSetting = new Setting(actionsEl)
      .setClass('opencodian-tool-files-action')
      .setName(t('settings.tools.custom.docs'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.tools.custom.docs'))
          .onClick(() => {
            window.open(TOOL_DOC_URL);
          });
      });
    docsSetting.settingEl.addClass('opencodian-tool-files-action--link');
  }

  private renderToolFileCard(containerEl: HTMLElement, file: ToolFileInfo, currentPermissions: ToolPermissionMap): void {
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-tool-file-card',
      attr: {
        'data-tool-file-source': file.source,
      },
    });
    const contentEl = cardEl.createDiv({ cls: 'opencodian-tool-file-card-content' });
    const titleRowEl = contentEl.createDiv({ cls: 'opencodian-tool-file-title-row' });
    titleRowEl.createEl('strong', { text: file.name });
    titleRowEl.createEl('small', {
      cls: 'opencodian-tool-source-chip',
      text: this.formatToolSource(file.source),
    });
    titleRowEl.createEl('small', {
      cls: [
        'opencodian-tool-status-badge',
        file.source === 'project' ? 'opencodian-tool-status-badge-editable' : 'opencodian-tool-status-badge-readonly',
      ].join(' '),
      text: file.source === 'project'
        ? t('settings.tools.custom.status.editable')
        : t('settings.tools.custom.status.readOnly'),
    });
    contentEl.createEl('small', { cls: 'opencodian-tool-file-path', text: file.path });
    contentEl.createDiv({ cls: 'opencodian-tool-file-hint', text: t('settings.tools.custom.fileHint') });

    const actionsEl = cardEl.createDiv({ cls: 'opencodian-tool-row-actions' });
    this.renderToolFilePermissionDropdown(actionsEl, file.name, currentPermissions);
    const openButtonEl = actionsEl.createEl('button', {
      cls: 'opencodian-tool-row-action',
      text: t('settings.tools.custom.open'),
      attr: { type: 'button' },
    });
    openButtonEl.addEventListener('click', () => {
      void this.openToolFile(file);
    });
    if (file.source === 'project') {
      const deleteButtonEl = actionsEl.createEl('button', {
        cls: 'mod-warning opencodian-tool-row-action opencodian-tool-row-delete-action',
        text: t('settings.tools.custom.delete'),
        attr: { type: 'button' },
      });
      deleteButtonEl.addEventListener('click', () => {
        void this.deleteProjectTool(file);
      });
    }
  }

  private renderToolFilePermissionDropdown(
    containerEl: HTMLElement,
    toolName: string,
    currentPermissions: ToolPermissionMap,
  ): void {
    const selection = this.getExplicitPermissionSelection(currentPermissions, toolName);
    new Setting(containerEl)
      .setClass('opencodian-tool-row-action')
      .setName(t('settings.tools.permission.label'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('inherit', t('settings.tools.permission.inherit'))
          .addOption('allow', t('settings.tools.permission.allow'))
          .addOption('ask', t('settings.tools.permission.ask'))
          .addOption('deny', t('settings.tools.permission.deny'))
          .addOption('custom', t('settings.tools.permission.custom'))
          .setValue(selection)
          .onChange(async (value) => {
            await this.setToolPermissionSelection(toolName, this.normalizePermissionSelection(value));
          });
      });
  }

  private async renderRuntimeCustomTools(currentPermissions: ToolPermissionMap): Promise<void> {
    const catalogStore = this.getCatalogStore();
    if (!catalogStore) {
      return;
    }

    const allToolIds = catalogStore.getToolCatalogSnapshot().registryToolIds;
    const { custom } = catalogStore.classifyToolIds(allToolIds);
    if (custom.length === 0) {
      return;
    }

    const identityContext = { registryTools: allToolIds };
    const panelEl = this.containerEl.createDiv({ cls: 'opencodian-tool-group-panel opencodian-tool-custom-panel' });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-tool-group-header' });
    headerEl.createEl('h3', { text: t('settings.tools.tab.custom') });
    headerEl.createDiv({
      cls: 'opencodian-tool-group-desc',
      text: t('settings.tools.custom.desc').replace('{count}', String(custom.length)),
    });
    const rowsEl = this.createScrollArea(panelEl, {
      rootClass: 'opencodian-tool-group-rows',
      contentClass: 'opencodian-settings-scrollarea-content--tools',
    }).contentEl;

    for (const toolId of custom.sort((left, right) => left.localeCompare(right))) {
      const identity = getToolIdentity(toolId, identityContext);
      this.renderToolRow({
        containerEl: rowsEl,
        toolId,
        displayName: identity.displayName,
        currentPermissions,
      });
    }
  }

  private renderToolRow(options: ToolRowRenderOptions): void {
    const { containerEl, toolId, displayName, currentPermissions } = options;
    const permissionKey = options.permissionKey ?? toolId;
    const permission = this.getEffectivePermissionForTool(currentPermissions, permissionKey);
    const selection = this.getExplicitPermissionSelection(currentPermissions, permissionKey);
    const permissionSource: ToolPermissionSource = selection === 'inherit'
      ? 'inherit'
      : selection === 'custom'
        ? 'custom'
        : 'override';
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-tool-permission-row',
      attr: {
        'data-tool-id': toolId,
        'data-tool-permission-key': permissionKey,
        'data-tool-permission': permission,
        'data-tool-permission-source': permissionSource,
      },
    });

    const setting = new Setting(rowEl)
      .setName(displayName)
      .setDesc(toolId)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('inherit', t('settings.tools.permission.inherit'))
          .addOption('allow', t('settings.tools.permission.allow'))
          .addOption('ask', t('settings.tools.permission.ask'))
          .addOption('deny', t('settings.tools.permission.deny'))
          .addOption('custom', t('settings.tools.permission.custom'))
          .setValue(selection)
          .onChange(async (value) => {
            await this.setToolPermissionSelection(permissionKey, this.normalizePermissionSelection(value));
          });
      });
    this.decorateToolPermissionRow(setting.settingEl, permission, permissionSource);
  }

  private renderEmptyState(): void {
    this.containerEl.createDiv({
      cls: 'opencodian-settings-inline-empty opencodian-tool-empty',
      text: t('settings.tools.empty'),
    });
  }

  private createScrollArea(
    containerEl: HTMLElement,
    options: { readonly rootClass: string; readonly contentClass: string },
  ): SettingsScrollArea {
    const rootEl = containerEl.createDiv({
      cls: `opencodian-settings-scrollarea ${options.rootClass}`,
    });
    const viewportEl = rootEl.createDiv({
      cls: 'opencodian-settings-scrollarea-viewport',
    });
    const contentEl = viewportEl.createDiv({
      cls: `opencodian-settings-scrollarea-content ${options.contentClass}`,
    });
    rootEl.createDiv({
      cls: 'opencodian-settings-scrollarea-gutter',
      attr: { 'aria-hidden': 'true' },
    });
    this.syncScrollAreaGutter(rootEl, viewportEl);
    return { rootEl, viewportEl, contentEl };
  }

  private syncScrollAreaGutter(rootEl: HTMLElement, viewportEl: HTMLElement): void {
    window.requestAnimationFrame(() => {
      if (!rootEl.isConnected || !viewportEl.isConnected) {
        return;
      }

      const gutterWidth = Math.max(0, viewportEl.offsetWidth - viewportEl.clientWidth);
      rootEl.style.setProperty('--opencodian-settings-scrollbar-track-width', `${gutterWidth}px`);
    });
  }

  private async createProjectTool(): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const targetPath = await this.toolFileService.createProjectTool();
    new Notice(t('settings.tools.custom.notice.saved').replace('{path}', targetPath));
    await this.refresh({ restartLocalService: true });
  }

  private async openToolFile(file: ToolFileInfo): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const content = file.content ?? await this.toolFileService.readToolFileContent(file);
    new ToolDetailModal({
      file: { ...file, content },
      plugin: this.plugin,
      onSaved: async () => {
        await this.refresh({ restartLocalService: true });
      },
    }).open();
  }

  private async deleteProjectTool(file: ToolFileInfo): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (file.source !== 'project') {
      new Notice(t('settings.tools.custom.notice.readOnly'));
      return;
    }
    if (!window.confirm(t('settings.tools.custom.delete.confirm').replace('{name}', file.name))) {
      return;
    }
    await this.toolFileService.deleteProjectTool(file);
    new Notice(t('settings.tools.custom.notice.deleted').replace('{path}', file.path));
    await this.refresh({ restartLocalService: true });
  }

  private async refresh(options: { restartLocalService?: boolean } = {}): Promise<void> {
    if (!this.bodyEl) {
      return;
    }
    if (options.restartLocalService) {
      await this.restartLocalServiceAfterToolCatalogWrite();
    }
    await this.render();
  }

  private formatToolSource(source: ToolFileSource): string {
    return source === 'project'
      ? t('settings.tools.custom.source.project')
      : t('settings.tools.custom.source.global');
  }

  private async setGlobalToolPermission(selection: GlobalToolPermissionSelection): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    if (selection === 'opencode-default') {
      await configManager.clearToolPermission('*');
    } else {
      await configManager.setToolPermission('*', selection);
    }
    await this.afterPermissionWrite();
  }

  private async setToolPermissionSelection(toolId: string, selection: ToolPermissionSelection): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    if (selection === 'custom') {
      return;
    }

    if (selection === 'inherit') {
      await configManager.clearToolPermission(toolId);
    } else {
      await configManager.setToolPermission(toolId, selection);
    }
    await this.afterPermissionWrite();
  }

  private async afterPermissionWrite(): Promise<void> {
    await this.plugin.saveSettings({
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });
    await this.restartLocalServiceAfterPermissionWrite();
    await this.refresh();
  }

  private async restartLocalServiceAfterToolCatalogWrite(): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (this.plugin.settings.server.mode !== 'local') {
      return;
    }

    try {
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (isRunning) {
        await this.plugin.openCodeService.stop();
      }
      await this.plugin.openCodeService.start();
    } catch {
      new Notice(t('settings.tools.custom.notice.restartFailed'));
    }
  }

  private async restartLocalServiceAfterPermissionWrite(): Promise<void> {
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
      new Notice(t('settings.tools.permission.restartSuccess'));
    } catch {
      new Notice(t('settings.tools.permission.restartFailed'));
    }
  }

  private async readCurrentPermissions(): Promise<ToolPermissionMap> {
    try {
      const configManager = this.plugin.opencodeConfigManager;
      if (!configManager) {
        return {};
      }

      const config = await configManager.read();
      const permission = config.permission;
      if (typeof permission === 'string') {
        return { '*': permission };
      }

      if (permission && typeof permission === 'object') {
        return permission as ToolPermissionMap;
      }
    } catch {
      return {};
    }

    return {};
  }

  private getExplicitPermissionSelection(permissions: ToolPermissionMap, toolId: string): ToolPermissionSelection {
    const value = permissions[toolId];
    if (value === 'allow' || value === 'ask' || value === 'deny') {
      return value;
    }
    if (value && typeof value === 'object') {
      return 'custom';
    }
    return 'inherit';
  }

  private getGlobalPermissionSelection(permissions: ToolPermissionMap): GlobalToolPermissionSelection {
    const value = permissions['*'];
    if (value === 'allow' || value === 'ask' || value === 'deny') {
      return value;
    }
    return 'opencode-default';
  }

  private getEffectivePermissionForTool(permissions: ToolPermissionMap, toolId: string): ToolPermissionAction | 'custom' {
    if (permissions[toolId] && typeof permissions[toolId] === 'object') {
      return 'custom';
    }
    return this.normalizePermissionAction(permissions[toolId] ?? permissions['*'] ?? 'allow');
  }

  private formatDefaultPermissionStatus(selection: GlobalToolPermissionSelection): string {
    if (selection === 'opencode-default') {
      return t('settings.tools.default.status.opencodeDefault');
    }
    return t('settings.tools.default.status.value').replace(
      '{permission}',
      this.formatPermissionAction(selection),
    );
  }

  private formatPermissionAction(action: ToolPermissionAction): string {
    if (action === 'ask') {
      return t('settings.tools.permission.ask');
    }
    if (action === 'deny') {
      return t('settings.tools.permission.deny');
    }
    return t('settings.tools.permission.allow');
  }

  private normalizeGlobalPermissionSelection(value: string): GlobalToolPermissionSelection {
    if (value === 'opencode-default') {
      return value;
    }
    return this.normalizePermissionAction(value);
  }

  private normalizePermissionSelection(value: string): ToolPermissionSelection {
    if (value === 'inherit') {
      return value;
    }
    if (value === 'custom') {
      return value;
    }
    return this.normalizePermissionAction(value);
  }

  private normalizePermissionAction(value: unknown): ToolPermissionAction {
    if (value === 'deny' || value === 'ask') {
      return value;
    }

    return 'allow';
  }

  private decorateToolPermissionRow(
    settingEl: HTMLElement,
    permission: ToolPermissionAction | 'custom',
    source: ToolPermissionSource,
  ): void {
    const nameEl = settingEl.querySelector<HTMLElement>('.setting-item-name');
    if (!nameEl) {
      return;
    }

    const badgesEl = nameEl.createSpan({ cls: 'opencodian-tool-row-badges' });
    badgesEl.createSpan({
      cls: `opencodian-tool-badge opencodian-tool-badge-permission opencodian-tool-badge-${permission}`,
      text: this.formatToolPermissionBadge(permission),
    });
    badgesEl.createSpan({
      cls: `opencodian-tool-badge opencodian-tool-badge-source opencodian-tool-badge-source-${source}`,
      text: this.formatToolPermissionSource(source),
    });
  }

  private formatToolPermissionBadge(permission: ToolPermissionAction | 'custom'): string {
    if (permission === 'custom') {
      return t('settings.tools.permission.custom');
    }
    return this.formatPermissionAction(permission);
  }

  private formatToolPermissionSource(source: ToolPermissionSource): string {
    if (source === 'custom') {
      return t('settings.tools.permission.source.custom');
    }
    if (source === 'override') {
      return t('settings.tools.permission.source.override');
    }
    return t('settings.tools.permission.source.inherit');
  }

  private getBuiltinPermissionKey(toolId: string): string {
    return BUILTIN_TOOL_PERMISSION_KEY_ALIASES[toolId] ?? toolId;
  }

  private getCatalogStore(): ToolCatalogStoreLike | null {
    const pluginWithCatalogStore = this.plugin as OpenCodianPlugin & {
      openCodeCatalogStateStore?: ToolCatalogStoreLike | null;
    };
    return pluginWithCatalogStore.openCodeCatalogStateStore ?? null;
  }

  private isOpenCodeActive(): boolean {
    return isOpenCodeSettingsBackendActive(this.plugin.settings);
  }

  private ensureOpenCodeActive(): boolean {
    if (this.isOpenCodeActive()) {
      return true;
    }
    new Notice(t('settings.tools.notice.openCodeOnly'));
    return false;
  }
}
