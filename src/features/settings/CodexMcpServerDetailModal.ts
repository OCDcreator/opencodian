import { type App, Modal, Notice } from 'obsidian';

import type { AppServerMcpResourceReadResult, AppServerMcpServerStatus, McpOauthLoginResult } from '../../core/agents/backend/CodexAppServerClient';
import { t } from '../../i18n';
import { type ExpandedState, renderResourceEntry, renderResourceTemplateEntry, renderToolEntry } from './CodexMcpServerDetailRenderers';

type McpModalState = 'loading' | 'unavailable' | 'failed' | 'empty' | 'success';

export interface CodexMcpServerDetailModalHost {
  getMcpServerStatus(): Promise<AppServerMcpServerStatus[] | null>;
  reloadMcpServers(): Promise<boolean>;
  triggerMcpServerOAuth(
    name: string,
    options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void },
  ): Promise<McpOauthLoginResult | null>;
  readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null>;
}

export class CodexMcpServerDetailModal extends Modal {
  private readonly host: CodexMcpServerDetailModalHost;
  private readonly focusServerName?: string;
  private servers: AppServerMcpServerStatus[] = [];
  private busy = false;
  private state: McpModalState = 'loading';
  private shellEl: HTMLElement | null = null;
  private statusValueEl: HTMLElement | null = null;
  private contentAreaEl: HTMLElement | null = null;
  private expanded: ExpandedState = { sections: new Set(), toolDetails: new Set(), toolSchemas: new Set() };

  constructor(app: App, host: CodexMcpServerDetailModalHost, focusServerName?: string) {
    super(app);
    this.host = host;
    this.focusServerName = focusServerName?.trim() || undefined;
  }

  onOpen(): void {
    this.titleEl.setText(t('settings.codex.mcpDetail.modalTitle'));
    this.modalEl.addClass('opencodian-codex-mcp-detail-modal');
    this.contentEl.empty();
    this.renderShell();
    this.setState('loading');
    void this.loadAndRender();
  }

  private renderShell(): void {
    this.shellEl = this.contentEl.createDiv({ cls: 'opencodian-modal-shell opencodian-inspection-panel' });

    const summaryEl = this.shellEl.createDiv({ cls: 'opencodian-modal-section opencodian-inspection-summary' });
    summaryEl.createEl('p', {
      cls: 'opencodian-inspection-summary-intro',
      text: t('settings.codex.mcpDetail.intro'),
    });

    const metaEl = summaryEl.createDiv({ cls: 'opencodian-inspection-summary-meta' });
    this.statusValueEl = metaEl.createEl('span', {
      cls: 'opencodian-codex-mcp-detail-status-value opencodian-inspection-badge',
      attr: { 'data-mcp-state': 'loading' },
    });
    metaEl.createEl('span', {
      cls: 'opencodian-inspection-summary-meta-item',
      text: t('settings.codex.mcpDetail.readonlyNote'),
    });

    const toolbarEl = summaryEl.createDiv({ cls: 'opencodian-codex-mcp-detail-toolbar opencodian-inspection-summary-actions' });
    toolbarEl.createEl('button', {
      text: t('settings.codex.mcpDetail.reloadButton'),
      cls: 'mod-cta',
    }).addEventListener('click', () => { void this.handleReload(); });

    this.contentAreaEl = this.shellEl.createDiv({
      cls: 'opencodian-codex-mcp-detail-content opencodian-modal-section opencodian-inspection-content',
      attr: { 'data-mcp-content': 'true' },
    });
  }

  private async loadAndRender(): Promise<void> {
    this.busy = true;
    let nextState: McpModalState = 'failed';
    try {
      const result = await this.host.getMcpServerStatus();
      if (result === null) {
        nextState = 'unavailable';
        this.servers = [];
      } else if (result.length === 0) {
        nextState = 'empty';
        this.servers = [];
      } else {
        nextState = 'success';
        this.servers = result;
      }
    } catch {
      nextState = 'failed';
      this.servers = [];
    } finally {
      this.busy = false;
      this.setState(nextState);
    }
  }

  private setState(state: McpModalState): void {
    if (!this.contentAreaEl || !this.statusValueEl) {
      return;
    }

    this.state = state;
    this.contentAreaEl.empty();
    this.statusValueEl.setAttribute('data-mcp-state', state);

    switch (state) {
      case 'loading':
        this.statusValueEl.setText(t('settings.codex.readback.statusLoading'));
        this.renderStateMessage(t('settings.codex.mcpDetail.loading'));
        return;
      case 'unavailable':
        this.statusValueEl.setText(t('settings.codex.readback.statusUnavailable'));
        this.renderStateMessage(t('settings.codex.mcpDetail.unavailable'));
        return;
      case 'failed':
        this.statusValueEl.setText(t('settings.codex.readback.statusFailed'));
        this.renderStateMessage(t('settings.codex.mcpDetail.failed'));
        return;
      case 'empty':
        this.statusValueEl.setText(t('settings.codex.readback.statusEmpty'));
        this.renderStateMessage(t('settings.codex.mcpDetail.empty'));
        return;
      case 'success':
        this.statusValueEl.setText(t('settings.codex.readback.statusCount', { count: this.servers.length }));
        this.renderSuccessContent(this.contentAreaEl);
        this.applyFocusServer();
        return;
      default:
        return;
    }
  }

  private renderStateMessage(message: string): void {
    const stateEl = this.contentAreaEl!.createDiv({ cls: 'opencodian-inspection-state' });
    stateEl.createEl('p', {
      cls: 'opencodian-codex-mcp-detail-state-message',
      text: message,
    });
  }

  private renderSuccessContent(container: HTMLElement): void {
    for (const server of this.servers) {
      this.renderServerSection(container, server);
    }
  }

  private applyFocusServer(): void {
    if (!this.focusServerName) {
      return;
    }
    const sections = this.contentAreaEl?.querySelectorAll<HTMLElement>('.opencodian-codex-mcp-server-section');
    if (!sections) {
      return;
    }
    for (const section of sections) {
      if (section.getAttribute('data-mcp-server-name') === this.focusServerName) {
        section.addClass('is-focused');
        if (typeof section.scrollIntoView === 'function') {
          section.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
        return;
      }
    }
  }

  private isSectionExpanded(serverName: string): boolean {
    return this.expanded.sections.has(serverName);
  }

  private toggleSection(serverName: string, sectionEl: HTMLElement, bodyEl: HTMLElement, button: HTMLButtonElement): void {
    const expanded = this.isSectionExpanded(serverName);
    if (expanded) {
      this.expanded.sections.delete(serverName);
      sectionEl.removeClass('is-expanded');
      bodyEl.addClass('is-hidden');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = t('settings.codex.mcpDetail.expandServer');
    } else {
      this.expanded.sections.add(serverName);
      sectionEl.addClass('is-expanded');
      bodyEl.removeClass('is-hidden');
      button.setAttribute('aria-expanded', 'true');
      button.textContent = t('settings.codex.mcpDetail.collapseServer');
    }
  }

  private renderServerSection(parent: HTMLElement, server: AppServerMcpServerStatus): void {
    const isExpanded = this.focusServerName === server.name || this.isSectionExpanded(server.name);
    if (isExpanded) {
      this.expanded.sections.add(server.name);
    }

    const sectionEl = parent.createDiv({
      cls: `opencodian-modal-section opencodian-inspection-section opencodian-codex-mcp-server-section${isExpanded ? ' is-expanded' : ''}`,
      attr: { 'data-mcp-server-name': server.name },
    });

    const headerEl = this.renderServerHeader(sectionEl, server, isExpanded);
    const bodyEl = sectionEl.createDiv({
      cls: `opencodian-codex-mcp-server-section-body${isExpanded ? '' : ' is-hidden'}`,
      attr: { id: `mcp-server-body-${this.sanitizeId(server.name)}` },
    });

    this.renderServerDescription(bodyEl, server);
    this.renderServerContent(bodyEl, server);

    const expandButton = headerEl.querySelector<HTMLButtonElement>('.opencodian-codex-mcp-server-expand-btn');
    if (expandButton) {
      expandButton.addEventListener('click', () => {
        this.toggleSection(server.name, sectionEl, bodyEl, expandButton);
      });
    }
  }

  private renderServerHeader(sectionEl: HTMLElement, server: AppServerMcpServerStatus, isExpanded: boolean): HTMLElement {
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-codex-mcp-server-section-header opencodian-inspection-section-header' });

    const titleEl = headerEl.createDiv({
      cls: 'opencodian-codex-mcp-server-section-identity opencodian-inspection-section-title',
    });
    const displayName = server.serverInfo?.name ?? server.name;
    const version = server.serverInfo?.version;
    const titleParts = [displayName];
    if (version) titleParts.push(`v${version}`);
    titleEl.createEl('h4', { text: titleParts.join(' ') });

    const shortId = server.name !== displayName ? server.name : undefined;
    if (shortId) {
      titleEl.createEl('p', {
        cls: 'opencodian-codex-mcp-server-section-short-id',
        text: shortId,
      });
    }

    const metaEl = headerEl.createDiv({ cls: 'opencodian-codex-mcp-server-section-meta' });
    const countsEl = metaEl.createDiv({ cls: 'opencodian-codex-mcp-server-section-counts' });
    const tools = server.tools ? Object.entries(server.tools) : [];
    const resources = Array.isArray(server.resources) ? server.resources : [];
    const resourceTemplates = Array.isArray(server.resourceTemplates) ? server.resourceTemplates : [];
    countsEl.createSpan({
      text: tools.length > 0
        ? t('settings.codex.mcpDetail.toolCount', { count: tools.length })
        : t('settings.codex.mcpDetail.noTools'),
    });
    countsEl.createSpan({
      text: (resources.length + resourceTemplates.length) > 0
        ? t('settings.codex.mcpDetail.resourceCount', { count: resources.length + resourceTemplates.length })
        : t('settings.codex.mcpDetail.noResources'),
    });

    const actionsEl = metaEl.createDiv({ cls: 'opencodian-inspection-section-actions' });

    if (server.authStatus) {
      actionsEl.createSpan({
        cls: `opencodian-codex-mcp-auth-badge opencodian-codex-mcp-auth-${server.authStatus} opencodian-inspection-badge`,
        text: this.authStatusLabel(server.authStatus),
      });

      if (server.authStatus === 'needs_auth' || server.authStatus === 'notLoggedIn') {
        const authBtn = actionsEl.createEl('button', {
          text: t('settings.codex.mcpDetail.authenticateButton'),
          cls: 'mod-cta',
        });
        authBtn.addEventListener('click', () => { void this.handleAuthenticate(server.name); });
      }
    }

    actionsEl.createEl('button', {
      text: isExpanded ? t('settings.codex.mcpDetail.collapseServer') : t('settings.codex.mcpDetail.expandServer'),
      cls: 'opencodian-codex-mcp-server-expand-btn',
      attr: {
        'aria-expanded': isExpanded ? 'true' : 'false',
        'aria-controls': `mcp-server-body-${this.sanitizeId(server.name)}`,
      },
    });

    return headerEl;
  }

  private renderServerDescription(sectionEl: HTMLElement, server: AppServerMcpServerStatus): void {
    if (server.serverInfo?.description) {
      sectionEl.createEl('p', {
        cls: 'opencodian-codex-mcp-server-section-desc opencodian-inspection-section-desc',
        text: server.serverInfo.description,
      });
    }

    if (server.serverInfo?.websiteUrl) {
      sectionEl.createEl('a', {
        cls: 'opencodian-codex-mcp-server-section-url',
        text: server.serverInfo.websiteUrl,
        attr: { href: server.serverInfo.websiteUrl, target: '_blank' },
      });
    }
  }

  private renderServerContent(sectionEl: HTMLElement, server: AppServerMcpServerStatus): void {
    const tools = server.tools ? Object.entries(server.tools) : [];
    const resources = Array.isArray(server.resources) ? server.resources : [];
    const resourceTemplates = Array.isArray(server.resourceTemplates) ? server.resourceTemplates : [];
    const totalResources = resources.length + resourceTemplates.length;

    if (tools.length > 0) {
      const subsectionEl = sectionEl.createDiv({ cls: 'opencodian-inspection-subsection' });
      subsectionEl.createEl('h5', { cls: 'opencodian-inspection-subsection-header', text: t('settings.codex.mcpDetail.toolsHeader') });
      const toolsEl = subsectionEl.createDiv({ cls: 'opencodian-codex-mcp-server-section-tools opencodian-inspection-list' });
      for (const [toolKey, tool] of tools) {
        renderToolEntry({ parent: toolsEl, serverName: server.name, toolKey, tool, expanded: this.expanded });
      }
    }

    if (totalResources > 0) {
      const subsectionEl = sectionEl.createDiv({ cls: 'opencodian-inspection-subsection' });
      subsectionEl.createEl('h5', { cls: 'opencodian-inspection-subsection-header', text: t('settings.codex.mcpDetail.resourcesHeader') });
      const resEl = subsectionEl.createDiv({ cls: 'opencodian-codex-mcp-server-section-resources opencodian-inspection-list' });
      const state = { busy: this.busy };
      for (const res of resources) {
        renderResourceEntry({ parent: resEl, serverName: server.name, resource: res, host: this.host, state });
      }
      for (const rt of resourceTemplates) {
        renderResourceTemplateEntry(resEl, server.name, rt);
      }
    }
  }

  private sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  private authStatusLabel(status: string): string {
    switch (status) {
      case 'bearerToken': return t('settings.codex.mcpDetail.authBearerToken');
      case 'none': return t('settings.codex.mcpDetail.authNone');
      case 'needs_auth': return t('settings.codex.mcpDetail.authNeedsAuth');
      case 'notLoggedIn': return t('settings.codex.mcpDetail.authNotLoggedIn');
      case 'unsupported': return t('settings.codex.mcpDetail.authUnsupported');
      default: return status;
    }
  }

  private async handleReload(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const previousState = this.state;
    this.setState('loading');
    try {
      const ok = await this.host.reloadMcpServers();
      if (ok) {
        await this.loadAndRender();
      } else {
        new Notice(t('settings.codex.mcpServers.reloadFailed'));
        this.setState(previousState);
      }
    } catch {
      new Notice(t('settings.codex.mcpServers.reloadFailed'));
      this.setState(previousState);
    } finally {
      this.busy = false;
    }
  }

  private async handleAuthenticate(serverName: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    new Notice(t('settings.codex.mcpDetail.authenticating'));
    try {
      const result = await this.host.triggerMcpServerOAuth(serverName, {
        onAuthorizationUrl: (url: string) => {
          new Notice(t('settings.codex.mcpDetail.authBrowserOpened'));
          window.open(url, '_blank');
        },
      });
      if (!result) {
        new Notice(t('settings.codex.mcpDetail.authFailed'));
        return;
      }
      if (result.outcome === 'completed') {
        new Notice(t('settings.codex.mcpDetail.authSucceeded'));
        await this.loadAndRender();
      } else if (result.outcome === 'pending') {
        new Notice(t('settings.codex.mcpDetail.authPending'));
      } else {
        new Notice(t('settings.codex.mcpDetail.authFailed'));
      }
    } finally {
      this.busy = false;
    }
  }
}

export interface CodexMcpServerDetailAdapterLike {
  getMcpServerStatus?(): Promise<unknown[] | null>;
  reloadMcpServers?(): Promise<boolean>;
  triggerMcpServerOAuth?(
    name: string,
    options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void },
  ): Promise<McpOauthLoginResult | null>;
  readMcpServerResource?(server: string, uri: string): Promise<unknown>;
}

export function createCodexMcpServerDetailHost(
  adapter: CodexMcpServerDetailAdapterLike,
): CodexMcpServerDetailModalHost {
  return {
    getMcpServerStatus: async (): Promise<AppServerMcpServerStatus[] | null> => {
      if (typeof adapter.getMcpServerStatus !== 'function') return null;
      const result = await adapter.getMcpServerStatus();
      return result as AppServerMcpServerStatus[] | null;
    },
    reloadMcpServers: () => (typeof adapter.reloadMcpServers === 'function'
      ? adapter.reloadMcpServers()
      : Promise.resolve(false)),
    triggerMcpServerOAuth: (
      name: string,
      options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void },
    ) =>
      (typeof adapter.triggerMcpServerOAuth === 'function'
        ? adapter.triggerMcpServerOAuth(name, options)
        : Promise.resolve(null)),
    readMcpServerResource: (server: string, uri: string): Promise<AppServerMcpResourceReadResult | null> =>
      (typeof adapter.readMcpServerResource === 'function'
        ? adapter.readMcpServerResource(server, uri) as Promise<AppServerMcpResourceReadResult | null>
        : Promise.resolve(null)),
  };
}
