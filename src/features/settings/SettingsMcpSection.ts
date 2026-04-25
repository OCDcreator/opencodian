/**
 * MCP settings section owner for the Server > MCP secondary tab.
 * Renders runtime MCP status from OpenCodeService seams.
 */

import { type ButtonComponent, Notice, Setting } from 'obsidian';

import type { McpServerSnapshot, McpServerStatus } from '../../core/opencode/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { SettingsMcpAddForm } from './SettingsMcpAddForm';

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
  private readonly actionButtons: ButtonComponent[] = [];
  private addForm: SettingsMcpAddForm | null = null;

  constructor(options: SettingsMcpSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.renderMcpContent(containerEl);
    this.subscribeToCatalog();
    void this.triggerRefresh();
  }

  attach(containerEl: HTMLElement): void {
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
    this.addForm?.dispose();
    this.addForm = null;
  }

  async triggerRefresh(): Promise<void> {
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
    const overviewBlock = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    overviewBlock.createEl('h4', {
      text: t('settings.server.mcp.overview.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    overviewBlock.createDiv({
      cls: 'opencodian-settings-block-desc',
      text: t('settings.server.mcp.overview.desc'),
    });

    const overviewBody = overviewBlock.createDiv({ cls: 'opencodian-settings-block-body' });
    this.overviewContainerEl = overviewBody.createDiv({ cls: 'opencodian-mcp-overview' });

    new Setting(overviewBody)
      .addButton((button) => {
        this.refreshButton = button;
        button
          .setButtonText(t('settings.server.mcp.refresh'))
          .setCta()
          .onClick(() => {
            void this.triggerRefresh();
          });
      })
      .settingEl.classList.add('opencodian-mcp-refresh-setting');

    const serverBlock = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    const serverBody = serverBlock.createDiv({ cls: 'opencodian-settings-block-body' });
    this.serverListContainerEl = serverBody.createDiv({ cls: 'opencodian-mcp-server-list' });

    const addBlock = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    addBlock.createEl('h4', {
      text: t('settings.server.mcp.add.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    const addBody = addBlock.createDiv({ cls: 'opencodian-settings-block-body' });
    this.addForm = new SettingsMcpAddForm(this.plugin);
    this.addForm.render(addBody);

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
  }

  private renderOverviewCards(snapshot: McpServerSnapshot): void {
    if (!this.overviewContainerEl) {
      return;
    }
    this.overviewContainerEl.empty();

    const counts = countByStatus(snapshot.servers);

    const cardsRow = this.overviewContainerEl.createDiv({ cls: 'opencodian-mcp-overview-cards' });

    this.renderCountCard(cardsRow, t('settings.server.mcp.overview.total'), counts.total);
    this.renderCountCard(cardsRow, t('settings.server.mcp.overview.connected'), counts.connected);
    this.renderCountCard(cardsRow, t('settings.server.mcp.overview.needsAuth'), counts.needsAuth);
    this.renderCountCard(cardsRow, t('settings.server.mcp.overview.failed'), counts.failed);

    const refreshInfo = this.overviewContainerEl.createDiv({ cls: 'opencodian-mcp-overview-refresh-info' });
    const timeLabel = snapshot.updatedAt
      ? new Date(snapshot.updatedAt).toLocaleTimeString()
      : t('settings.server.mcp.overview.never');
    refreshInfo.createSpan({
      text: `${t('settings.server.mcp.overview.lastRefresh')}: ${timeLabel}`,
    });
  }

  private renderCountCard(parent: HTMLElement, label: string, value: number): void {
    const card = parent.createDiv({ cls: 'opencodian-mcp-overview-card' });
    card.createDiv({ cls: 'opencodian-mcp-overview-card-value', text: String(value) });
    card.createDiv({ cls: 'opencodian-mcp-overview-card-label', text: label });
  }

  private renderServerRows(snapshot: McpServerSnapshot): void {
    if (!this.serverListContainerEl) {
      return;
    }
    this.serverListContainerEl.empty();
    this.actionButtons.length = 0;

    const servers = snapshot.servers;
    const names = Object.keys(servers);

    if (names.length === 0) {
      this.serverListContainerEl.createDiv({
        cls: 'opencodian-mcp-empty',
        text: t('settings.server.mcp.empty'),
      });
      return;
    }

    const header = this.serverListContainerEl.createDiv({ cls: 'opencodian-mcp-server-header' });
    header.createDiv({ cls: 'opencodian-mcp-server-header-name', text: t('settings.server.mcp.server.name') });
    header.createDiv({ cls: 'opencodian-mcp-server-header-status', text: t('settings.server.mcp.server.status') });
    header.createDiv({ text: '' });

    for (const name of names) {
      const status = servers[name];
      this.renderServerRow(this.serverListContainerEl!, name, status);
    }
  }

  private renderServerRow(parent: HTMLElement, name: string, status: McpServerStatus): void {
    const row = parent.createDiv({ cls: 'opencodian-mcp-server-row' });

    row.createDiv({ cls: 'opencodian-mcp-server-row-name', text: name });

    const statusCell = row.createDiv({ cls: 'opencodian-mcp-server-row-status' });
    statusCell.createSpan({
      cls: `opencodian-mcp-badge ${statusBadgeClass(status.status)}`,
      text: statusLabel(status.status),
    });

    const actionsCell = row.createDiv();
    actionsCell.style.display = 'flex';
    actionsCell.style.gap = '8px';
    actionsCell.style.flexWrap = 'wrap';
    this.renderServerActions(actionsCell, name, status);

    if ((status.status === 'failed' || status.status === 'needs_client_registration') && 'error' in status && status.error) {
      row.createDiv({
        cls: 'opencodian-mcp-server-row-error',
        text: `${t('settings.server.mcp.server.error')}: ${status.error}`,
      });
    }
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

  private renderServerActions(parent: HTMLElement, name: string, status: McpServerStatus): void {
    const addActionButton = (label: string, onClick: () => Promise<void>) => {
      new Setting(parent).addButton((button) => {
        this.actionButtons.push(button);
        button
          .setButtonText(label)
          .setDisabled(this.isActionPending)
          .onClick(async () => {
            this.isActionPending = true;
            this.updateActionButtons();
            try {
              await onClick();
              void this.triggerRefresh();
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(t('settings.server.mcp.notice.actionFailed', { error: message }));
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
  }

  private updateActionButtons(): void {
    for (const button of this.actionButtons) {
      button.setDisabled(this.isActionPending);
    }
  }
}
