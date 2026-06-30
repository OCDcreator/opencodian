/* eslint-disable max-lines -- MCP settings owns runtime actions, project ownership rendering, and stable local refresh behavior together. */
/**
 * MCP settings section owner for the dedicated MCP settings category.
 * Renders runtime MCP status from OpenCodeService seams.
 */

import { type App, type ButtonComponent, Notice, Setting } from 'obsidian';

import { McpConfigService } from '../../core/config/McpConfigService';
import type { McpServerSnapshot, McpServerStatus } from '../../core/opencode/types';
import type { OpencodeMcpConfigRecord, OpencodeMcpEntryConfig } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { McpServerEditorModal } from './McpServerEditorModal';
import {
  McpServerStatusModal,
  redactMcpSensitiveText,
  summarizeCommand,
} from './McpServerStatusModal';
import { isOpenCodeSettingsBackendActive } from './settingsBackendGuards';

const logger = createLogger('SettingsMcpSection');

interface SettingsMcpSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  requestDisplayRefresh: () => void;
}

type McpStatusString = McpServerStatus['status'];

interface McpOverviewCounts {
  total: number;
  connected: number;
  needsAuth: number;
  failed: number;
}

type McpOverviewTone = 'neutral' | 'success' | 'accent' | 'danger';

interface McpServerActionContext {
  snapshot: McpServerSnapshot;
  name: string;
  status: McpServerStatus;
  projectOwned: boolean;
  projectEntry?: OpencodeMcpEntryConfig;
  projectEntryEditable: boolean;
}

interface SettingsScrollArea {
  readonly rootEl: HTMLElement;
  readonly viewportEl: HTMLElement;
  readonly contentEl: HTMLElement;
}

function countByStatus(servers: Record<string, McpServerStatus>): McpOverviewCounts {
  let connected = 0;
  let needsAuth = 0;
  let failed = 0;
  const entries = Object.values(servers);
  for (const s of entries) {
    switch (s.status) {
      case 'connected':
        connected += 1;
        break;
      case 'needs_auth':
        needsAuth += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      default:
        break;
    }
  }
  return { total: entries.length, connected, needsAuth, failed };
}

function statusLabel(status: McpStatusString): string {
  switch (status) {
    case 'connected':
      return t('settings.server.mcp.status.connected');
    case 'disabled':
      return t('settings.server.mcp.status.disabled');
    case 'failed':
      return t('settings.server.mcp.status.failed');
    case 'needs_auth':
      return t('settings.server.mcp.status.needsAuth');
    case 'needs_client_registration':
      return t('settings.server.mcp.status.needsClientRegistration');
    default:
      return status;
  }
}

function statusBadgeClass(status: McpStatusString): string {
  switch (status) {
    case 'connected':
      return 'opencodian-mcp-badge--connected';
    case 'disabled':
      return 'opencodian-mcp-badge--disabled';
    case 'failed':
      return 'opencodian-mcp-badge--failed';
    case 'needs_auth':
      return 'opencodian-mcp-badge--needs-auth';
    case 'needs_client_registration':
      return 'opencodian-mcp-badge--needs-client-registration';
    default:
      return '';
  }
}

export class SettingsMcpSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsMcpSectionOptions['createSectionHeading'];
  private readonly requestDisplayRefresh: () => void;

  private refreshButton: ButtonComponent | null = null;
  private unsubscribeCatalog: (() => void) | null = null;
  private overviewContainerEl: HTMLElement | null = null;
  private serverListContainerEl: HTMLElement | null = null;
  private isRefreshing = false;
  private isActionPending = false;
  private lastRefreshTime: number | null = null;
  private readonly actionButtons: Array<{ button: ButtonComponent; stickyDisabled: boolean }> = [];
  private readonly configService: McpConfigService | null;
  private projectServers: OpencodeMcpConfigRecord = {};

  constructor(options: SettingsMcpSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
    this.configService = this.plugin.opencodeConfigManager
      ? new McpConfigService(this.plugin.opencodeConfigManager)
      : null;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.renderMcpContent(containerEl);
    this.subscribeToCatalog();
    void this.triggerRefresh();
  }

  attach(containerEl: HTMLElement): void {
    this.createSectionHeading(
      containerEl,
      t('settings.mcp.title'),
      t('settings.quickNav.mcpDesc'),
    );
    this.renderMcpContent(containerEl);
    this.subscribeToCatalog();
    void this.triggerRefresh();
  }

  dispose(): void {
    if (this.unsubscribeCatalog) {
      this.unsubscribeCatalog();
      this.unsubscribeCatalog = null;
    }
    this.refreshButton = null;
    this.overviewContainerEl = null;
    this.serverListContainerEl = null;
    this.actionButtons.length = 0;
  }

  async triggerRefresh(): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    this.updateRefreshButton();

    try {
      await this.plugin.openCodeService.refreshMcpServerStatus();
      this.lastRefreshTime = Date.now();
    } catch (error) {
      logger.error('MCP status refresh failed', error);
    } finally {
      this.isRefreshing = false;
      this.updateRefreshButton();
    }
  }

  private renderMcpContent(containerEl: HTMLElement): void {
    const shellEl = containerEl.createDiv({ cls: 'opencodian-mcp-settings-shell' });
    const overviewSection = shellEl.createDiv({ cls: 'opencodian-mcp-overview-section' });
    const overviewCard = overviewSection.createDiv({ cls: 'opencodian-mcp-overview-shell' });
    const overviewHeader = overviewCard.createDiv({ cls: 'opencodian-mcp-overview-toolbar' });
    const overviewCopy = overviewHeader.createDiv({ cls: 'opencodian-mcp-overview-toolbar-copy' });
    const overviewTitleRow = overviewCopy.createDiv({ cls: 'opencodian-mcp-overview-title-row' });
    overviewTitleRow.createEl('h4', {
      text: t('settings.server.mcp.overview.title'),
      cls: 'opencodian-settings-subsection-heading opencodian-mcp-overview-title',
    });
    this.overviewContainerEl = overviewTitleRow.createDiv({
      cls: 'opencodian-mcp-overview opencodian-mcp-overview--title-rail',
    });
    overviewCopy.createDiv({
      cls: 'opencodian-mcp-overview-description',
      text: t('settings.server.mcp.overview.desc'),
    });
    const overviewActions = overviewHeader.createDiv({ cls: 'opencodian-mcp-overview-actions' });
    new Setting(overviewActions)
      .addButton((button) => {
        this.refreshButton = button;
        button
          .setButtonText(t('settings.server.mcp.refresh'))
          .onClick(() => {
            void this.triggerRefresh();
          });
      })
      .settingEl.classList.add('opencodian-mcp-refresh-setting');
    const addActionEl = overviewActions.createDiv({ cls: 'opencodian-mcp-toolbar-add' });
    new Setting(addActionEl)
      .addButton((button) => {
        this.actionButtons.push({ button, stickyDisabled: false });
        button
          .setButtonText(t('settings.server.mcp.add.submit'))
          .onClick(() => {
            this.openAddModal();
          });
      })
      .settingEl.classList.add('opencodian-mcp-toolbar-add-setting');

    const serverListShell = shellEl.createDiv({ cls: 'opencodian-mcp-server-list-shell' });
    const serverListHeader = serverListShell.createDiv({ cls: 'opencodian-mcp-server-list-header' });
    const serverListCopy = serverListHeader.createDiv({ cls: 'opencodian-mcp-server-list-copy' });
    serverListCopy.createDiv({
      cls: 'opencodian-mcp-server-list-title',
      text: t('settings.mcp.title'),
    });
    serverListCopy.createDiv({
      cls: 'opencodian-mcp-server-list-description',
      text: t('settings.quickNav.mcpDesc'),
    });
    const scrollArea = this.createScrollArea(serverListShell, {
      rootClass: 'opencodian-mcp-server-list',
      contentClass: 'opencodian-settings-scrollarea-content--mcp',
    });
    this.serverListContainerEl = scrollArea.contentEl;

    this.renderFromSnapshot(this.plugin.openCodeService.getMcpServerSnapshot());
  }

  private subscribeToCatalog(): void {
    if (this.unsubscribeCatalog) {
      this.unsubscribeCatalog();
    }

    this.unsubscribeCatalog = this.plugin.openCodeService.subscribeToCatalogUpdates(
      (snapshot) => {
        this.renderFromSnapshot(snapshot.mcp);
      },
    );
  }

  private renderFromSnapshot(snapshot: McpServerSnapshot): void {
    this.renderOverviewCards(snapshot);
    this.renderServerRows(snapshot);
    void this.refreshProjectOwnership(snapshot);
  }

  private async refreshProjectOwnership(snapshot: McpServerSnapshot): Promise<void> {
    if (!this.configService) {
      return;
    }
    try {
      this.projectServers = await this.configService.readProjectServers();
      this.renderServerRows(snapshot);
    } catch (error) {
      logger.warn('Failed to read project MCP config ownership', error);
    }
  }

  private renderOverviewCards(snapshot: McpServerSnapshot): void {
    if (!this.overviewContainerEl) {
      return;
    }

    this.renderWithStableLocalRefresh(this.overviewContainerEl, () => {
      this.overviewContainerEl?.empty();

      const counts = countByStatus(snapshot.servers);

      const cardsRow = this.overviewContainerEl!.createDiv({ cls: 'opencodian-mcp-overview-cards' });

      this.renderCountCard(
        cardsRow,
        t('settings.server.mcp.overview.total'),
        counts.total,
        'neutral',
      );
      this.renderCountCard(
        cardsRow,
        t('settings.server.mcp.overview.connected'),
        counts.connected,
        'success',
      );
      this.renderCountCard(
        cardsRow,
        t('settings.server.mcp.overview.needsAuth'),
        counts.needsAuth,
        'accent',
      );
      this.renderCountCard(
        cardsRow,
        t('settings.server.mcp.overview.failed'),
        counts.failed,
        'danger',
      );

      const refreshInfo = cardsRow.createDiv({ cls: 'opencodian-mcp-overview-refresh-info' });
      const timeLabel = snapshot.updatedAt
        ? new Date(snapshot.updatedAt).toLocaleTimeString()
        : t('settings.server.mcp.overview.never');
      refreshInfo.createSpan({
        text: `${t('settings.server.mcp.overview.lastRefresh')}: ${timeLabel}`,
      });
    });
  }

  private renderCountCard(
    parent: HTMLElement,
    label: string,
    value: number,
    tone: McpOverviewTone,
  ): void {
    const card = parent.createDiv({
      cls: `opencodian-mcp-overview-card opencodian-mcp-overview-card--${tone}`,
    });
    card.createSpan({ cls: 'opencodian-mcp-overview-card-dot' });
    card.createDiv({ cls: 'opencodian-mcp-overview-card-label', text: label });
    card.createDiv({ cls: 'opencodian-mcp-overview-card-value', text: String(value) });
  }

  private renderServerRows(snapshot: McpServerSnapshot): void {
    if (!this.serverListContainerEl) {
      return;
    }
    this.renderWithStableLocalRefresh(this.serverListContainerEl, () => {
      this.serverListContainerEl?.empty();
      this.actionButtons.length = 0;

      const servers = snapshot.servers;
      const names = Object.keys(servers);

      if (names.length === 0) {
        this.serverListContainerEl!.createDiv({
          cls: 'opencodian-mcp-empty',
          text: t('settings.server.mcp.empty'),
        });
        return;
      }

      for (const name of names) {
        const status = servers[name];
        this.renderServerCard(this.serverListContainerEl!, snapshot, name, status);
      }
    });
  }

  private renderWithStableLocalRefresh(containerEl: HTMLElement, render: () => void): void {
    const previousScrollTop = containerEl.scrollTop;
    const previousMinHeight = containerEl.style.minHeight;
    const measuredHeight = containerEl.offsetHeight;
    if (measuredHeight > 0) {
      containerEl.style.minHeight = `${measuredHeight}px`;
    }

    render();

    if (previousScrollTop > 0) {
      containerEl.scrollTop = previousScrollTop;
    }
    window.requestAnimationFrame(() => {
      if (!containerEl.isConnected) {
        return;
      }
      if (previousScrollTop > 0) {
        containerEl.scrollTop = previousScrollTop;
      }
      containerEl.style.minHeight = previousMinHeight;
    });
  }

  private renderServerCard(
    parent: HTMLElement,
    snapshot: McpServerSnapshot,
    name: string,
    status: McpServerStatus,
  ): void {
    const projectEntry = this.projectServers[name];
    const projectOwned = Boolean(projectEntry);
    const row = parent.createDiv({ cls: 'opencodian-mcp-server-card', attr: { 'data-mcp-server-status': status.status } });
    const rowMain = row.createDiv({ cls: 'opencodian-mcp-server-card-main' });
    const identity = rowMain.createDiv({ cls: 'opencodian-mcp-server-card-identity' });

    const nameRow = identity.createDiv({ cls: 'opencodian-mcp-server-card-title-row' });
    nameRow.createDiv({ cls: 'opencodian-mcp-server-card-name', text: name });
    const chipRail = nameRow.createDiv({ cls: 'opencodian-mcp-server-card-chip-rail' });
    chipRail.createSpan({
      cls: 'opencodian-mcp-server-card-ownership-badge',
      text: projectOwned ? t('settings.server.mcp.ownership.project') : t('settings.server.mcp.ownership.runtimeOnly'),
    });
    chipRail.createSpan({
      cls: `opencodian-mcp-badge ${statusBadgeClass(status.status)}`,
      text: statusLabel(status.status),
    });
    chipRail.createSpan({
      cls: 'opencodian-mcp-transport-badge',
      text: projectEntry ? projectEntry.type === 'remote' ? 'HTTP' : 'STDIO' : t('settings.server.mcp.transportUnknown'),
    });
    identity.createDiv({ cls: 'opencodian-mcp-server-card-endpoint', text: this.getEndpointSummary(projectEntry) });

    const statusCell = rowMain.createDiv({ cls: 'opencodian-mcp-server-card-status' });
    statusCell.createDiv({
      cls: 'opencodian-mcp-server-card-status-summary',
      text: projectOwned
        ? t('settings.server.mcp.card.projectHint')
        : t('settings.server.mcp.card.runtimeOnlyHint'),
    });

    const actionsCell = rowMain.createDiv({ cls: 'opencodian-mcp-server-card-actions' });
    this.renderServerActions(actionsCell, {
      snapshot,
      name,
      status,
      projectOwned,
      projectEntry,
      projectEntryEditable: this.isEditableProjectEntry(projectEntry),
    });

    if ((status.status === 'failed' || status.status === 'needs_client_registration') && 'error' in status && status.error) {
      row.createDiv({
        cls: 'opencodian-mcp-server-card-helper is-error',
        text: `${t('settings.server.mcp.server.error')}: ${redactMcpSensitiveText(status.error)}`,
      });
    }
  }

  private getEndpointSummary(entry: OpencodeMcpEntryConfig | undefined): string {
    if (!entry) {
      return t('settings.server.mcp.details.runtimeOnly');
    }
    if (entry.type === 'remote') {
      return typeof entry.url === 'string' && entry.url.trim()
        ? redactMcpSensitiveText(entry.url.trim())
        : 'remote';
    }
    return Array.isArray(entry.command) && entry.command.length > 0
      ? summarizeCommand(entry.command)
      : 'local';
  }

  private updateRefreshButton(): void {
    if (!this.refreshButton) {
      return;
    }
    this.refreshButton.setButtonText(
      this.isRefreshing
        ? t('settings.server.mcp.refreshing')
        : t('settings.server.mcp.refresh'),
    );
    this.refreshButton.setDisabled(this.isRefreshing);
  }

  private renderServerActions(parent: HTMLElement, context: McpServerActionContext): void {
    const {
      snapshot,
      name,
      status,
      projectOwned,
      projectEntry,
      projectEntryEditable,
    } = context;
    const buttonGrid = parent.createDiv({ cls: 'opencodian-mcp-server-action-grid' });
    const addActionButton = (
      label: string,
      onClick: () => Promise<void>,
      options: { disabled?: boolean } = {},
    ) => {
      new Setting(buttonGrid).addButton((button) => {
        this.actionButtons.push({ button, stickyDisabled: options.disabled === true });
        button
          .setButtonText(label)
          .setDisabled(this.isActionPending || options.disabled === true)
          .onClick(async () => {
            if (!this.ensureOpenCodeActive()) {
              return;
            }
            if (options.disabled) {
              return;
            }
            this.isActionPending = true;
            this.updateActionButtons();
            try {
              await onClick();
              void this.triggerRefresh();
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(t('settings.server.mcp.notice.actionFailed', { error: redactMcpSensitiveText(message) }));
            } finally {
              this.isActionPending = false;
              this.updateActionButtons();
            }
          });
      });
    };

    switch (status.status) {
      case 'connected':
        addActionButton(t('settings.server.mcp.action.disconnect'), async () => {
          await this.plugin.openCodeService.disconnectMcpServer(name);
        });
        break;
      case 'disabled':
      case 'failed':
        addActionButton(t('settings.server.mcp.action.connect'), async () => {
          await this.plugin.openCodeService.connectMcpServer(name);
        });
        break;
      case 'needs_auth':
        addActionButton(t('settings.server.mcp.action.authenticate'), async () => {
          await this.plugin.openCodeService.authenticateMcp(name);
        });
        addActionButton(t('settings.server.mcp.action.clearAuth'), async () => {
          await this.plugin.openCodeService.removeMcpAuth(name);
        });
        break;
      default:
        break;
    }

    addActionButton(t('settings.server.mcp.action.monitor'), async () => {
      new McpServerStatusModal(this.getApp(), {
        name,
        status,
        updatedAt: snapshot.updatedAt ?? this.lastRefreshTime,
        projectOwned,
        entry: projectEntry,
      }).open();
    });

    addActionButton(t('settings.server.mcp.action.edit'), async () => {
      if (!projectOwned || !projectEntry) {
        new Notice(t('settings.server.mcp.notice.readOnly'));
        return;
      }
      this.openEditModal(name, projectEntry);
    }, { disabled: !projectOwned || !projectEntry || !projectEntryEditable });

    addActionButton(t('settings.server.mcp.action.delete'), async () => {
      await this.deleteProjectServer(name, status, projectOwned);
    }, { disabled: !projectOwned });
  }

  private updateActionButtons(): void {
    for (const { button, stickyDisabled } of this.actionButtons) {
      button.setDisabled(this.isActionPending || stickyDisabled);
    }
  }

  private openAddModal(): void {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (!this.configService) {
      new Notice(t('settings.server.mcp.notice.configUnavailable'));
      return;
    }
    new McpServerEditorModal(this.getApp(), {
      mode: 'add',
      existingNames: Object.keys({ ...this.plugin.openCodeService.getMcpServerSnapshot().servers, ...this.projectServers }),
      configService: this.configService,
      onSaved: async ({ name, config }) => {
        if (!this.ensureOpenCodeActive()) {
          return;
        }
        try {
          await this.plugin.openCodeService.addMcpServer(name, config);
        } finally {
          await this.triggerRefresh();
        }
      },
    }).open();
  }

  private openEditModal(name: string, entry: OpencodeMcpEntryConfig): void {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (!this.configService) {
      new Notice(t('settings.server.mcp.notice.configUnavailable'));
      return;
    }
    new McpServerEditorModal(this.getApp(), {
      mode: 'edit',
      serverName: name,
      existingEntry: entry,
      existingNames: Object.keys(this.projectServers),
      configService: this.configService,
      onSaved: async ({ name: nextName, config }) => {
        if (!this.ensureOpenCodeActive()) {
          return;
        }
        try {
          await this.plugin.openCodeService.addMcpServer(nextName, config);
        } finally {
          await this.triggerRefresh();
        }
      },
    }).open();
  }

  private async deleteProjectServer(
    name: string,
    status: McpServerStatus,
    projectOwned: boolean,
  ): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (!this.configService || !projectOwned) {
      new Notice(t('settings.server.mcp.notice.readOnly'));
      return;
    }
    if (!window.confirm(t('settings.server.mcp.delete.confirm', { name }))) {
      return;
    }
    if (status.status === 'connected') {
      try {
        await this.plugin.openCodeService.disconnectMcpServer(name);
      } catch (error) {
        logger.warn('Best-effort MCP disconnect before delete failed', error);
      }
    }
    await this.configService.deleteServer(name);
    delete this.projectServers[name];
    await this.triggerRefresh();
    if (this.plugin.openCodeService.getMcpServerSnapshot().servers[name]) {
      new Notice(t('settings.server.mcp.notice.deletedRuntimeMayPersist', { name }));
      return;
    }
    new Notice(t('settings.server.mcp.notice.deleted', { name }));
  }

  private isEditableProjectEntry(entry: OpencodeMcpEntryConfig | undefined): boolean {
    return entry?.type === 'local' || entry?.type === 'remote';
  }

  private getApp(): App {
    return (this.plugin as OpenCodianPlugin & { app?: App }).app ?? ({} as App);
  }

  private isOpenCodeActive(): boolean {
    return isOpenCodeSettingsBackendActive(this.plugin.settings);
  }

  private ensureOpenCodeActive(): boolean {
    if (this.isOpenCodeActive()) {
      return true;
    }
    new Notice(t('settings.server.mcp.notice.openCodeOnly'));
    return false;
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
    return { rootEl, viewportEl, contentEl };
  }
}
