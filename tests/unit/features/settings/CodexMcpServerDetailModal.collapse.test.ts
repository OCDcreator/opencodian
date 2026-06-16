import type { App } from 'obsidian';

import type { AppServerMcpServerStatus } from '../../../../src/core/agents/backend/CodexAppServerClient';
import {
  CodexMcpServerDetailModal,
  type CodexMcpServerDetailModalHost,
} from '../../../../src/features/settings/CodexMcpServerDetailModal';
import { setLocale, t } from '../../../../src/i18n';

function createHost(overrides: Partial<CodexMcpServerDetailModalHost> = {}): CodexMcpServerDetailModalHost {
  return {
    getMcpServerStatus: jest.fn().mockResolvedValue([]),
    reloadMcpServers: jest.fn().mockResolvedValue(true),
    triggerMcpServerOAuth: jest.fn().mockResolvedValue({ outcome: 'completed' as const, browserOpened: true }),
    readMcpServerResource: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createModal(host: CodexMcpServerDetailModalHost): CodexMcpServerDetailModal {
  return new CodexMcpServerDetailModal({} as App, host);
}

function serverStatus(name: string, extras: Partial<AppServerMcpServerStatus> = {}): AppServerMcpServerStatus {
  return {
    name,
    serverInfo: { name, version: '1.0.0' },
    tools: {},
    resources: [],
    resourceTemplates: [],
    authStatus: 'none',
    ...extras,
  };
}

function expandServer(modal: CodexMcpServerDetailModal, serverName: string): void {
  const section = modal.contentEl.querySelector(
    `.opencodian-codex-mcp-server-section[data-mcp-server-name="${serverName}"]`,
  );
  const expandBtn = section?.querySelector('.opencodian-codex-mcp-server-expand-btn') as HTMLButtonElement | null;
  expect(expandBtn).not.toBeNull();
  expandBtn!.click();
}

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CodexMcpServerDetailModal — collapse and expand', () => {
  it('renders server sections collapsed by default', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a', {
          tools: { tool1: { name: 'tool-one', description: 'First tool', inputSchema: { type: 'object' } } },
          resources: [{ uri: 'docs://guide', name: 'Guide', description: 'A guide', mimeType: 'text/markdown' }],
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const section = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section');
    expect(section).not.toBeNull();
    expect(section?.hasClass('is-expanded')).toBe(false);

    const expandBtn = section?.querySelector('.opencodian-codex-mcp-server-expand-btn') as HTMLButtonElement | null;
    expect(expandBtn).not.toBeNull();
    expect(expandBtn?.getAttribute('aria-expanded')).toBe('false');

    const body = section?.querySelector('.opencodian-codex-mcp-server-section-body');
    expect(body).not.toBeNull();
    expect(body?.hasClass('is-hidden')).toBe(true);

    // Tool and resource details are hidden inside the collapsed body.
    expect(body?.querySelector('.opencodian-codex-mcp-tool-entry-desc')).not.toBeNull();
    expect(body?.querySelector('.opencodian-codex-mcp-resource-entry')).not.toBeNull();
  });

  it('expands a server when its expand button is clicked', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a', {
          tools: { tool1: { name: 'tool-one', description: 'First tool', inputSchema: { type: 'object' } } },
          resources: [{ uri: 'docs://guide', name: 'Guide', mimeType: 'text/plain' }],
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expandServer(modal, 'server-a');

    const section = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section[data-mcp-server-name="server-a"]');
    expect(section?.hasClass('is-expanded')).toBe(true);

    const expandBtn = section?.querySelector('.opencodian-codex-mcp-server-expand-btn') as HTMLButtonElement | null;
    expect(expandBtn?.getAttribute('aria-expanded')).toBe('true');
    expect(expandBtn?.textContent).toBe(t('settings.codex.mcpDetail.collapseServer'));

    const body = section?.querySelector('.opencodian-codex-mcp-server-section-body');
    expect(body?.hasClass('is-hidden')).toBe(false);
    expect(section?.querySelectorAll('.opencodian-codex-mcp-tool-entry')).toHaveLength(1);
    expect(section?.querySelectorAll('.opencodian-codex-mcp-resource-entry')).toHaveLength(1);
  });

  it('collapses an expanded server when its expand button is clicked again', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a', {
          tools: { tool1: { name: 'tool-one', description: 'First tool', inputSchema: { type: 'object' } } },
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expandServer(modal, 'server-a');
    expandServer(modal, 'server-a');

    const section = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section[data-mcp-server-name="server-a"]');
    expect(section?.hasClass('is-expanded')).toBe(false);

    const body = section?.querySelector('.opencodian-codex-mcp-server-section-body');
    expect(body?.hasClass('is-hidden')).toBe(true);
  });

  it('renders tools collapsed by default and reveals details on click', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a', {
          tools: {
            tool1: { name: 'tool-one', description: 'First tool', inputSchema: { type: 'object' } },
          },
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expandServer(modal, 'server-a');

    const section = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section[data-mcp-server-name="server-a"]');
    const toolEntry = section?.querySelector('.opencodian-codex-mcp-tool-entry');
    expect(toolEntry).not.toBeNull();

    // Description and schema hidden by default.
    const details = toolEntry?.querySelector('.opencodian-codex-mcp-tool-details');
    expect(details).not.toBeNull();
    expect(details?.hasClass('is-hidden')).toBe(true);

    const detailBtn = toolEntry?.querySelector('.opencodian-codex-mcp-tool-detail-btn') as HTMLButtonElement | null;
    expect(detailBtn).not.toBeNull();
    expect(detailBtn?.textContent).toBe(t('settings.codex.mcpDetail.showToolDetails'));

    detailBtn!.click();

    expect(details?.hasClass('is-hidden')).toBe(false);
    expect(detailBtn?.textContent).toBe(t('settings.codex.mcpDetail.hideToolDetails'));
    expect(toolEntry?.querySelector('.opencodian-codex-mcp-tool-entry-desc')?.textContent).toBe('First tool');

    // Schema still requires a separate toggle.
    const schema = toolEntry?.querySelector('.opencodian-codex-mcp-tool-schema');
    expect(schema).not.toBeNull();
    expect(schema?.hasClass('is-hidden')).toBe(true);
  });

  it('toggles tool schema independently after tool details are visible', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a', {
          tools: {
            tool1: { name: 'tool-one', description: 'First tool', inputSchema: { type: 'object', properties: {} } },
          },
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expandServer(modal, 'server-a');

    const toolEntry = modal.contentEl.querySelector('.opencodian-codex-mcp-tool-entry');
    const detailBtn = toolEntry?.querySelector('.opencodian-codex-mcp-tool-detail-btn') as HTMLButtonElement | null;
    detailBtn!.click();

    const schemaToggle = toolEntry?.querySelector('.opencodian-codex-mcp-schema-toggle') as HTMLButtonElement | null;
    expect(schemaToggle).not.toBeNull();
    expect(schemaToggle?.textContent).toBe(t('settings.codex.mcpDetail.showSchema'));

    const schema = toolEntry?.querySelector('.opencodian-codex-mcp-tool-schema');
    expect(schema?.hasClass('is-hidden')).toBe(true);

    schemaToggle!.click();
    expect(schema?.hasClass('is-hidden')).toBe(false);
    expect(schemaToggle?.textContent).toBe(t('settings.codex.mcpDetail.hideSchema'));
    expect(schema?.textContent).toContain('"type": "object"');

    schemaToggle!.click();
    expect(schema?.hasClass('is-hidden')).toBe(true);
    expect(schemaToggle?.textContent).toBe(t('settings.codex.mcpDetail.showSchema'));
  });

  it('renders long server names inside the collapsed summary header', async () => {
    const longName = 'computer-use-very-long-server-identifier-that-should-wrap';
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus(longName),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const heading = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section-header h4');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toContain(longName);
  });
});
