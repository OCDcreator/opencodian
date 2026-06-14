import { type App, Modal, Notice } from 'obsidian';

import type { AppServerMcpResource, AppServerMcpResourceReadResult, AppServerMcpServerStatus, McpOauthLoginResult } from '../../core/agents/backend/CodexAppServerClient';
import { t } from '../../i18n';

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

  constructor(app: App, host: CodexMcpServerDetailModalHost, focusServerName?: string) {
    super(app);
    this.host = host;
    this.focusServerName = focusServerName?.trim() || undefined;
  }

  onOpen(): void {
    this.titleEl.setText(t('settings.codex.mcpDetail.modalTitle'));
    this.modalEl.addClass('opencodian-codex-mcp-detail-modal');
    this.contentEl.empty();
    this.contentEl.createEl('p', { text: t('settings.codex.mcpDetail.loading') });
    void this.loadAndRender();
  }

  private async loadAndRender(): Promise<void> {
    this.busy = true;
    try {
      this.servers = (await this.host.getMcpServerStatus()) ?? [];
    } catch {
      this.servers = [];
    } finally {
      this.busy = false;
      this.renderServers();
    }
  }

  private renderServers(): void {
    this.contentEl.empty();

    if (this.servers.length === 0) {
      this.contentEl.createEl('p', { text: t('settings.codex.mcpDetail.noServers') });
      return;
    }

    const toolbarEl = this.contentEl.createDiv({ cls: 'opencodian-codex-mcp-detail-toolbar' });
    toolbarEl.createEl('button', {
      text: t('settings.codex.mcpDetail.reloadButton'),
      cls: 'mod-cta',
    }).addEventListener('click', () => { void this.handleReload(); });

    const summaryEl = this.contentEl.createDiv({
      cls: 'opencodian-codex-mcp-detail-summary',
      text: t('settings.codex.mcpDetail.summary', { count: this.servers.length }),
    });

    for (const server of this.servers) {
      this.renderServerCard(this.contentEl, server);
    }

    void summaryEl;
    this.applyFocusServer();
  }

  private applyFocusServer(): void {
    if (!this.focusServerName) {
      return;
    }
    const cards = this.contentEl.querySelectorAll<HTMLElement>('.opencodian-codex-mcp-server-card');
    for (const card of cards) {
      if (card.getAttribute('data-mcp-server-name') === this.focusServerName) {
        card.addClass('is-focused');
        if (typeof card.scrollIntoView === 'function') {
          card.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
        return;
      }
    }
  }

  private renderServerCard(parent: HTMLElement, server: AppServerMcpServerStatus): void {
    const cardEl = parent.createDiv({
      cls: 'opencodian-codex-mcp-server-card',
      attr: { 'data-mcp-server-name': server.name },
    });

    this.renderServerHeader(cardEl, server);
    this.renderServerDescription(cardEl, server);
    this.renderServerContent(cardEl, server);
  }

  private renderServerHeader(cardEl: HTMLElement, server: AppServerMcpServerStatus): void {
    const headerEl = cardEl.createDiv({ cls: 'opencodian-codex-mcp-server-card-header' });
    const displayName = server.serverInfo?.name ?? server.name;
    const version = server.serverInfo?.version;
    const titleParts = [displayName];
    if (version) titleParts.push(`v${version}`);
    headerEl.createEl('h4', { text: titleParts.join(' ') });

    if (server.authStatus) {
      headerEl.createSpan({
        cls: `opencodian-codex-mcp-auth-badge opencodian-codex-mcp-auth-${server.authStatus}`,
        text: this.authStatusLabel(server.authStatus),
      });

      if (server.authStatus === 'needs_auth' || server.authStatus === 'notLoggedIn') {
        const authBtn = headerEl.createEl('button', {
          text: t('settings.codex.mcpDetail.authenticateButton'),
          cls: 'mod-cta',
        });
        authBtn.addEventListener('click', () => { void this.handleAuthenticate(server.name); });
      }
    }
  }

  private renderServerDescription(cardEl: HTMLElement, server: AppServerMcpServerStatus): void {
    if (server.serverInfo?.description) {
      cardEl.createEl('p', {
        cls: 'opencodian-codex-mcp-server-card-desc',
        text: server.serverInfo.description,
      });
    }

    if (server.serverInfo?.websiteUrl) {
      cardEl.createEl('a', {
        cls: 'opencodian-codex-mcp-server-card-url',
        text: server.serverInfo.websiteUrl,
        attr: { href: server.serverInfo.websiteUrl, target: '_blank' },
      });
    }
  }

  private renderServerContent(cardEl: HTMLElement, server: AppServerMcpServerStatus): void {
    const tools = server.tools ? Object.entries(server.tools) : [];
    const resources = Array.isArray(server.resources) ? server.resources : [];
    const resourceTemplates = Array.isArray(server.resourceTemplates) ? server.resourceTemplates : [];
    const totalResources = resources.length + resourceTemplates.length;

    const metaEl = cardEl.createDiv({ cls: 'opencodian-codex-mcp-server-card-meta' });
    const metaParts: string[] = [
      tools.length > 0
        ? t('settings.codex.mcpDetail.toolCount', { count: tools.length })
        : t('settings.codex.mcpDetail.noTools'),
      totalResources > 0
        ? t('settings.codex.mcpDetail.resourceCount', { count: totalResources })
        : t('settings.codex.mcpDetail.noResources'),
    ];
    metaEl.createEl('span', { text: metaParts.join(' · ') });

    if (tools.length > 0) {
      cardEl.createEl('h5', { text: t('settings.codex.mcpDetail.toolsHeader') });
      const toolsEl = cardEl.createDiv({ cls: 'opencodian-codex-mcp-server-card-tools' });
      for (const [toolKey, tool] of tools) {
        this.renderToolEntry(toolsEl, toolKey, tool);
      }
    }

    if (totalResources > 0) {
      cardEl.createEl('h5', { text: t('settings.codex.mcpDetail.resourcesHeader') });
      const resEl = cardEl.createDiv({ cls: 'opencodian-codex-mcp-server-card-resources' });
      for (const res of resources) {
        this.renderResourceEntry(resEl, server.name, res);
      }
      for (const rt of resourceTemplates) {
        this.renderResourceTemplateEntry(resEl, server.name, rt);
      }
    }
  }

  private renderResourceEntry(parent: HTMLElement, serverName: string, resource: AppServerMcpResource): void {
    const entryEl = parent.createDiv({
      cls: 'opencodian-codex-mcp-resource-entry',
      attr: {
        'data-resource-uri': resource.uri,
        'data-mcp-server-name': serverName,
      },
    });

    const rowEl = entryEl.createDiv({ cls: 'opencodian-codex-mcp-resource-row' });
    const nameEl = rowEl.createDiv({ cls: 'opencodian-codex-mcp-resource-row-main' });
    nameEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-name',
      text: resource.name ?? resource.uri,
    });
    if (resource.description) {
      nameEl.createEl('p', {
        cls: 'opencodian-codex-mcp-resource-desc',
        text: resource.description,
      });
    }
    const metaParts: string[] = [];
    metaParts.push(resource.uri);
    if (resource.mimeType) metaParts.push(resource.mimeType);
    nameEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-uri',
      text: metaParts.join(' · '),
    });

    const viewBtn = rowEl.createEl('button', {
      text: t('settings.codex.mcpDetail.viewResource'),
      cls: 'opencodian-codex-mcp-resource-view-btn',
    });
    viewBtn.addEventListener('click', () => { void this.handleViewResource(entryEl, serverName, resource.uri, viewBtn); });
  }

  private renderResourceTemplateEntry(parent: HTMLElement, serverName: string, template: { uriTemplate?: string; name?: string; description?: string; mimeType?: string }): void {
    const entryEl = parent.createDiv({
      cls: 'opencodian-codex-mcp-resource-entry opencodian-codex-mcp-resource-template',
      attr: { 'data-mcp-server-name': serverName },
    });
    entryEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-name',
      text: template.name ?? template.uriTemplate ?? 'template',
    });
    if (template.description) {
      entryEl.createEl('p', {
        cls: 'opencodian-codex-mcp-resource-desc',
        text: template.description,
      });
    }
    const metaParts: string[] = [];
    if (template.uriTemplate) metaParts.push(template.uriTemplate);
    if (template.mimeType) metaParts.push(template.mimeType);
    if (metaParts.length > 0) {
      entryEl.createEl('p', {
        cls: 'opencodian-codex-mcp-resource-uri',
        text: metaParts.join(' · '),
      });
    }
    entryEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-template-hint',
      text: t('settings.codex.mcpDetail.resourceTemplateHint'),
    });
  }

  private async handleViewResource(
    entryEl: HTMLElement,
    serverName: string,
    uri: string,
    viewBtn: HTMLButtonElement,
  ): Promise<void> {
    if (this.busy) return;
    // Toggle: if a viewer is already open for this entry, collapse it.
    const existing = entryEl.querySelector(':scope > .opencodian-codex-mcp-resource-viewer');
    if (existing) {
      existing.remove();
      viewBtn.textContent = t('settings.codex.mcpDetail.viewResource');
      return;
    }

    this.busy = true;
    const originalLabel = viewBtn.textContent;
    viewBtn.textContent = t('settings.codex.mcpDetail.resourceLoading');
    viewBtn.disabled = true;
    try {
      const result = await this.host.readMcpServerResource(serverName, uri);
      const viewerEl = entryEl.createDiv({ cls: 'opencodian-codex-mcp-resource-viewer' });
      this.renderResourceContent(viewerEl, uri, result);
      viewBtn.textContent = t('settings.codex.mcpDetail.hideResource');
    } catch {
      new Notice(t('settings.codex.mcpDetail.resourceReadFailed'));
      viewBtn.textContent = originalLabel ?? t('settings.codex.mcpDetail.viewResource');
    } finally {
      viewBtn.disabled = false;
      this.busy = false;
    }
    void originalLabel;
  }

  private renderResourceContent(parent: HTMLElement, uri: string, result: AppServerMcpResourceReadResult | null): void {
    if (!result || result.contents.length === 0) {
      const reason = result?.errorReason;
      parent.createEl('p', {
        cls: 'opencodian-codex-mcp-resource-empty',
        text: reason
          ? t('settings.codex.mcpDetail.resourceUnavailable', { reason })
          : t('settings.codex.mcpDetail.resourceNoContent'),
      });
      return;
    }

    for (const content of result.contents) {
      const mimeType = content.mimeType ?? '';
      const isImage = mimeType.startsWith('image/');
      const isText = mimeType.startsWith('text/') || mimeType === 'application/json' || (!mimeType && typeof content.text === 'string');

      if (isImage && content.blob) {
        const wrapper = parent.createDiv({ cls: 'opencodian-codex-mcp-resource-image' });
        wrapper.createEl('img', {
          attr: {
            src: `data:${mimeType || 'image/png'};base64,${content.blob}`,
            alt: uri,
          },
        });
        continue;
      }

      if (isText && typeof content.text === 'string') {
        const bodyEl = parent.createDiv({ cls: 'opencodian-codex-mcp-resource-text' });
        bodyEl.setText(content.text);
        continue;
      }

      // Binary / unknown: show metadata only, never raw bytes.
      const metaEl = parent.createDiv({ cls: 'opencodian-codex-mcp-resource-binary' });
      const parts: string[] = [];
      if (mimeType) parts.push(mimeType);
      if (typeof content.blob === 'string') {
        const sizeBytes = Math.floor((content.blob.length * 3) / 4);
        parts.push(t('settings.codex.mcpDetail.resourceBytes', { count: sizeBytes }));
      }
      metaEl.createEl('p', {
        cls: 'opencodian-codex-mcp-resource-binary-meta',
        text: parts.length > 0
          ? t('settings.codex.mcpDetail.resourceBinaryMeta', { meta: parts.join(' · ') })
          : t('settings.codex.mcpDetail.resourceNoContent'),
      });
    }
  }

  private renderToolEntry(parent: HTMLElement, _key: string, tool: { name?: string; description?: string; inputSchema?: unknown }): void {
    const entryEl = parent.createDiv({ cls: 'opencodian-codex-mcp-tool-entry' });
    const toolName = tool.name ?? 'unknown';
    entryEl.createEl('p', {
      cls: 'opencodian-codex-mcp-tool-entry-name',
      text: toolName,
    });
    if (tool.description) {
      entryEl.createEl('p', {
        cls: 'opencodian-codex-mcp-tool-entry-desc',
        text: tool.description,
      });
    }
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      const schemaToggle = entryEl.createEl('button', {
        text: t('settings.codex.mcpDetail.showSchema'),
        cls: 'opencodian-codex-mcp-schema-toggle',
      });
      const schemaEl = entryEl.createDiv({
        cls: 'opencodian-codex-mcp-tool-schema',
        attr: { style: 'display:none' },
      });
      schemaEl.createEl('pre', { text: JSON.stringify(tool.inputSchema, null, 2) });
      schemaToggle.addEventListener('click', () => {
        const visible = schemaEl.style.display !== 'none';
        schemaEl.style.display = visible ? 'none' : 'block';
        schemaToggle.textContent = visible
          ? t('settings.codex.mcpDetail.showSchema')
          : t('settings.codex.mcpDetail.hideSchema');
      });
    }
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
    new Notice(t('settings.codex.mcpServers.loading'));
    try {
      const ok = await this.host.reloadMcpServers();
      if (ok) {
        await this.loadAndRender();
      } else {
        new Notice(t('settings.codex.mcpServers.reloadFailed'));
      }
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
