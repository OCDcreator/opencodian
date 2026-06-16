import { Notice } from 'obsidian';

import type { AppServerMcpResource, AppServerMcpResourceReadResult } from '../../core/agents/backend/CodexAppServerClient';
import { t } from '../../i18n';

export interface ExpandedState {
  sections: Set<string>;
  toolDetails: Set<string>;
  toolSchemas: Set<string>;
}

export interface RenderHost {
  readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null>;
}

export interface RenderBusyState {
  busy: boolean;
}

interface RenderToolEntryOptions {
  parent: HTMLElement;
  serverName: string;
  toolKey: string;
  tool: { name?: string; description?: string; inputSchema?: unknown };
  expanded: ExpandedState;
}

interface RenderResourceEntryOptions {
  parent: HTMLElement;
  serverName: string;
  resource: AppServerMcpResource;
  host: RenderHost;
  state: RenderBusyState;
}

interface HandleViewResourceOptions {
  entryEl: HTMLElement;
  serverName: string;
  uri: string;
  viewBtn: HTMLButtonElement;
  host: RenderHost;
  state: RenderBusyState;
}

export function renderToolEntry(options: RenderToolEntryOptions): void {
  const { parent, serverName, toolKey, tool, expanded } = options;
  const toolName = tool.name ?? toolKey;
  const detailKey = `${serverName}::${toolKey}`;
  const hasSchema = tool.inputSchema && typeof tool.inputSchema === 'object';

  const entryEl = parent.createDiv({
    cls: 'opencodian-codex-mcp-tool-entry opencodian-inspection-row',
    attr: { 'data-mcp-tool-key': detailKey },
  });

  const mainEl = entryEl.createDiv({ cls: 'opencodian-codex-mcp-tool-entry-main opencodian-inspection-row-main' });
  mainEl.createEl('p', {
    cls: 'opencodian-codex-mcp-tool-entry-name opencodian-inspection-row-title',
    text: toolName,
  });

  const sideEl = entryEl.createDiv({ cls: 'opencodian-inspection-row-side' });

  const detailBtn = sideEl.createEl('button', {
    text: t('settings.codex.mcpDetail.showToolDetails'),
    cls: 'opencodian-codex-mcp-tool-detail-btn opencodian-inspection-detail-toggle',
  });

  const detailsEl = entryEl.createDiv({
    cls: 'opencodian-codex-mcp-tool-details is-hidden opencodian-inspection-detail',
  });

  if (tool.description) {
    detailsEl.createEl('p', {
      cls: 'opencodian-codex-mcp-tool-entry-desc opencodian-inspection-row-subtitle',
      text: tool.description,
    });
  }

  if (hasSchema) {
    const schemaToggle = detailsEl.createEl('button', {
      text: t('settings.codex.mcpDetail.showSchema'),
      cls: 'opencodian-codex-mcp-schema-toggle opencodian-inspection-detail-toggle',
    });
    const schemaEl = detailsEl.createDiv({
      cls: 'opencodian-codex-mcp-tool-schema is-hidden opencodian-inspection-code',
    });
    schemaEl.createEl('pre', { text: JSON.stringify(tool.inputSchema, null, 2) });
    schemaToggle.addEventListener('click', () => {
      const visible = !schemaEl.hasClass('is-hidden');
      schemaEl.toggleClass('is-hidden', visible);
      schemaToggle.textContent = visible
        ? t('settings.codex.mcpDetail.showSchema')
        : t('settings.codex.mcpDetail.hideSchema');
    });
  }

  detailBtn.addEventListener('click', () => {
    const visible = !detailsEl.hasClass('is-hidden');
    detailsEl.toggleClass('is-hidden', visible);
    detailBtn.textContent = visible
      ? t('settings.codex.mcpDetail.showToolDetails')
      : t('settings.codex.mcpDetail.hideToolDetails');
    if (!visible) {
      expanded.toolDetails.add(detailKey);
    } else {
      expanded.toolDetails.delete(detailKey);
    }
  });

  if (expanded.toolDetails.has(detailKey)) {
    detailsEl.removeClass('is-hidden');
    detailBtn.textContent = t('settings.codex.mcpDetail.hideToolDetails');
  }
}

export function renderResourceEntry(options: RenderResourceEntryOptions): void {
  const { parent, serverName, resource, host, state } = options;
  const entryEl = parent.createDiv({
    cls: 'opencodian-codex-mcp-resource-entry opencodian-inspection-row',
    attr: {
      'data-resource-uri': resource.uri,
      'data-mcp-server-name': serverName,
    },
  });

  const mainEl = entryEl.createDiv({ cls: 'opencodian-codex-mcp-resource-row-main opencodian-inspection-row-main' });
  mainEl.createEl('p', {
    cls: 'opencodian-codex-mcp-resource-name opencodian-inspection-row-title',
    text: resource.name ?? resource.uri,
  });
  if (resource.description) {
    mainEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-desc opencodian-inspection-row-subtitle',
      text: resource.description,
    });
  }
  const metaParts: string[] = [];
  metaParts.push(resource.uri);
  if (resource.mimeType) metaParts.push(resource.mimeType);
  mainEl.createEl('p', {
    cls: 'opencodian-codex-mcp-resource-uri opencodian-inspection-row-meta',
    text: metaParts.join(' · '),
  });

  const sideEl = entryEl.createDiv({ cls: 'opencodian-inspection-row-side' });

  const viewBtn = sideEl.createEl('button', {
    text: t('settings.codex.mcpDetail.viewResource'),
    cls: 'opencodian-codex-mcp-resource-view-btn opencodian-inspection-detail-toggle',
  });
  viewBtn.addEventListener('click', () => { void handleViewResource({ entryEl, serverName, uri: resource.uri, viewBtn, host, state }); });
}

export function renderResourceTemplateEntry(
  parent: HTMLElement,
  serverName: string,
  template: { uriTemplate?: string; name?: string; description?: string; mimeType?: string },
): void {
  const entryEl = parent.createDiv({
    cls: 'opencodian-codex-mcp-resource-entry opencodian-codex-mcp-resource-template opencodian-inspection-row',
    attr: { 'data-mcp-server-name': serverName },
  });
  const mainEl = entryEl.createDiv({ cls: 'opencodian-inspection-row-main' });
  mainEl.createEl('p', {
    cls: 'opencodian-codex-mcp-resource-name opencodian-inspection-row-title',
    text: template.name ?? template.uriTemplate ?? 'template',
  });
  if (template.description) {
    mainEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-desc opencodian-inspection-row-subtitle',
      text: template.description,
    });
  }
  const metaParts: string[] = [];
  if (template.uriTemplate) metaParts.push(template.uriTemplate);
  if (template.mimeType) metaParts.push(template.mimeType);
  if (metaParts.length > 0) {
    mainEl.createEl('p', {
      cls: 'opencodian-codex-mcp-resource-uri opencodian-inspection-row-meta',
      text: metaParts.join(' · '),
    });
  }
  mainEl.createEl('p', {
    cls: 'opencodian-codex-mcp-resource-template-hint opencodian-inspection-row-note',
    text: t('settings.codex.mcpDetail.resourceTemplateHint'),
  });
}

async function handleViewResource(options: HandleViewResourceOptions): Promise<void> {
  const { entryEl, serverName, uri, viewBtn, host, state } = options;
  if (state.busy) return;

  const existing = entryEl.querySelector(':scope > .opencodian-codex-mcp-resource-viewer');
  if (existing) {
    existing.remove();
    viewBtn.textContent = t('settings.codex.mcpDetail.viewResource');
    return;
  }

  state.busy = true;
  const originalLabel = viewBtn.textContent;
  viewBtn.textContent = t('settings.codex.mcpDetail.resourceLoading');
  viewBtn.disabled = true;
  try {
    const result = await host.readMcpServerResource(serverName, uri);
    const viewerEl = entryEl.createDiv({ cls: 'opencodian-codex-mcp-resource-viewer opencodian-inspection-detail' });
    renderResourceContent(viewerEl, uri, result);
    viewBtn.textContent = t('settings.codex.mcpDetail.hideResource');
  } catch {
    new Notice(t('settings.codex.mcpDetail.resourceReadFailed'));
    viewBtn.textContent = originalLabel ?? t('settings.codex.mcpDetail.viewResource');
  } finally {
    viewBtn.disabled = false;
    state.busy = false;
  }
}

function renderResourceContent(parent: HTMLElement, uri: string, result: AppServerMcpResourceReadResult | null): void {
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
      const bodyEl = parent.createDiv({ cls: 'opencodian-codex-mcp-resource-text opencodian-inspection-code' });
      bodyEl.setText(content.text);
      continue;
    }

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
