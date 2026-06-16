import type { App } from 'obsidian';

import type { AppServerMcpResourceReadResult, AppServerMcpServerStatus } from '../../../../src/core/agents/backend/CodexAppServerClient';
import {
  CodexMcpServerDetailModal,
  type CodexMcpServerDetailModalHost,
} from '../../../../src/features/settings/CodexMcpServerDetailModal';
import { setLocale } from '../../../../src/i18n';

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

describe('CodexMcpServerDetailModal — resource viewer', () => {
  it('renders resource entries as clickable rows with view buttons', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('docs-server', {
          resources: [
            { uri: 'docs://guide', name: 'Guide', description: 'A guide', mimeType: 'text/markdown' },
            { uri: 'docs://notes', name: 'Notes', mimeType: 'text/plain' },
          ],
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expandServer(modal, 'docs-server');

    const resourceEntries = modal.contentEl.querySelectorAll('.opencodian-codex-mcp-resource-entry');
    expect(resourceEntries).toHaveLength(2);

    const first = resourceEntries[0];
    expect(first.getAttribute('data-resource-uri')).toBe('docs://guide');
    expect(first.querySelector('.opencodian-codex-mcp-resource-name')?.textContent).toBe('Guide');
    expect(first.querySelector('.opencodian-codex-mcp-resource-desc')?.textContent).toBe('A guide');

    const viewBtns = modal.contentEl.querySelectorAll('.opencodian-codex-mcp-resource-view-btn');
    expect(viewBtns).toHaveLength(2);
  });

  it('fetches and renders text resource content when view is clicked', async () => {
    const resourceResult: AppServerMcpResourceReadResult = {
      contents: [{ uri: 'docs://guide', mimeType: 'text/plain', text: '# Title\n\nBody text here.' }],
    };
    const readMock = jest.fn().mockResolvedValue(resourceResult);
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('docs-server', {
          resources: [{ uri: 'docs://guide', name: 'Guide', mimeType: 'text/plain' }],
        }),
      ]),
      readMcpServerResource: readMock,
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expandServer(modal, 'docs-server');

    const viewBtn = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-view-btn') as HTMLButtonElement;
    viewBtn.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(readMock).toHaveBeenCalledWith('docs-server', 'docs://guide');
    const textEl = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-text');
    expect(textEl).not.toBeNull();
    expect(textEl?.textContent).toContain('Body text here.');
  });

  it('collapses viewer on second view-button click', async () => {
    const resourceResult: AppServerMcpResourceReadResult = {
      contents: [{ uri: 'docs://guide', mimeType: 'text/plain', text: 'hello' }],
    };
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('docs-server', {
          resources: [{ uri: 'docs://guide', name: 'Guide', mimeType: 'text/plain' }],
        }),
      ]),
      readMcpServerResource: jest.fn().mockResolvedValue(resourceResult),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expandServer(modal, 'docs-server');

    const viewBtn = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-view-btn') as HTMLButtonElement;
    viewBtn.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(modal.contentEl.querySelector('.opencodian-codex-mcp-resource-viewer')).not.toBeNull();

    viewBtn.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(modal.contentEl.querySelector('.opencodian-codex-mcp-resource-viewer')).toBeNull();
  });

  it('shows empty message when resource read returns no contents', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('docs-server', {
          resources: [{ uri: 'docs://empty', name: 'Empty', mimeType: 'text/plain' }],
        }),
      ]),
      readMcpServerResource: jest.fn().mockResolvedValue({ contents: [], errorReason: 'not found' }),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expandServer(modal, 'docs-server');

    const viewBtn = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-view-btn') as HTMLButtonElement;
    viewBtn.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const emptyEl = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.textContent).toContain('not found');
  });
});
