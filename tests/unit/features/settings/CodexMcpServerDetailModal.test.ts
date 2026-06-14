import type { App } from 'obsidian';

import type { AppServerMcpResourceReadResult, AppServerMcpServerStatus } from '../../../../src/core/agents/backend/CodexAppServerClient';
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

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CodexMcpServerDetailModal — server list and reload', () => {
  it('loads and renders server list on open', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a'),
        serverStatus('server-b'),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(host.getMcpServerStatus).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.textContent).toContain('server-a');
    expect(modal.contentEl.textContent).toContain('server-b');
  });

  it('re-fetches and re-renders after successful reload', async () => {
    const host = createHost({
      getMcpServerStatus: jest
        .fn()
        .mockResolvedValueOnce([serverStatus('initial-server')])
        .mockResolvedValueOnce([serverStatus('reloaded-server')]),
      reloadMcpServers: jest.fn().mockResolvedValue(true),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(modal.contentEl.textContent).toContain('initial-server');

    const reloadButton = modal.contentEl.querySelector(
      '.opencodian-codex-mcp-detail-toolbar button',
    ) as HTMLButtonElement | null;
    expect(reloadButton).not.toBeNull();
    reloadButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(host.reloadMcpServers).toHaveBeenCalledTimes(1);
    expect(host.getMcpServerStatus).toHaveBeenCalledTimes(2);
    expect(modal.contentEl.textContent).toContain('reloaded-server');
    expect(modal.contentEl.textContent).not.toContain('initial-server');
  });

  it('does not re-render after failed reload', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([serverStatus('initial-server')]),
      reloadMcpServers: jest.fn().mockResolvedValue(false),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const reloadButton = modal.contentEl.querySelector(
      '.opencodian-codex-mcp-detail-toolbar button',
    ) as HTMLButtonElement | null;
    reloadButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(host.reloadMcpServers).toHaveBeenCalledTimes(1);
    expect(host.getMcpServerStatus).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.textContent).toContain('initial-server');
  });

  it('ignores reload clicks while busy', async () => {
    let releaseReload: (value: boolean) => void = () => {};
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([serverStatus('initial-server')]),
      reloadMcpServers: jest.fn().mockImplementation(
        () => new Promise((resolve) => { releaseReload = resolve; }),
      ),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const reloadButton = modal.contentEl.querySelector(
      '.opencodian-codex-mcp-detail-toolbar button',
    ) as HTMLButtonElement | null;
    expect(reloadButton).not.toBeNull();

    // Start reload but do not let it complete yet.
    reloadButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(host.reloadMcpServers).toHaveBeenCalledTimes(1);

    // Second click while reload is in-flight must be ignored.
    reloadButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(host.reloadMcpServers).toHaveBeenCalledTimes(1);

    releaseReload(true);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
});

describe('CodexMcpServerDetailModal — OAuth authentication', () => {
  it('calls triggerMcpServerOAuth when authenticate button is clicked', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('auth-server', { authStatus: 'needs_auth' }),
      ]),
      triggerMcpServerOAuth: jest.fn().mockResolvedValue(true),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const authButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (button) => button.textContent === t('settings.codex.mcpDetail.authenticateButton'),
    );
    expect(authButton).toBeDefined();
    authButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(host.triggerMcpServerOAuth).toHaveBeenCalledWith(
      'auth-server',
      expect.objectContaining({ onAuthorizationUrl: expect.any(Function) }),
    );
  });

  it('shows authenticate button for notLoggedIn auth status', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('remote-server', { authStatus: 'notLoggedIn' }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const authButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (button) => button.textContent === t('settings.codex.mcpDetail.authenticateButton'),
    );
    expect(authButton).toBeDefined();
    expect(modal.contentEl.textContent).toContain(t('settings.codex.mcpDetail.authNotLoggedIn'));
  });

  it('opens browser via onAuthorizationUrl callback during authenticate', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const authUrl = 'https://mcp.notion.com/authorize?code=abc';
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('remote-server', { authStatus: 'notLoggedIn' }),
      ]),
      triggerMcpServerOAuth: jest.fn().mockImplementation(
        (_name: string, opts?: { onAuthorizationUrl?: (url: string) => void }) => {
          opts?.onAuthorizationUrl?.(authUrl);
          return Promise.resolve({ outcome: 'completed' as const, browserOpened: true });
        },
      ),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const authButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (button) => button.textContent === t('settings.codex.mcpDetail.authenticateButton'),
    );
    authButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(openSpy).toHaveBeenCalledWith(authUrl, '_blank');
    openSpy.mockRestore();
  });

  it('shows authFailed notice when OAuth outcome is failed', async () => {
    const noticeMessages: string[] = [];
    const Obsidian = jest.requireActual('obsidian') as typeof import('obsidian');
    const OriginalNotice = Obsidian.Notice;
    (Obsidian as unknown as { Notice: unknown }).Notice = class extends OriginalNotice {
      constructor(message: string) { super(message); noticeMessages.push(message); }
    };

    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('remote-server', { authStatus: 'notLoggedIn' }),
      ]),
      triggerMcpServerOAuth: jest.fn().mockResolvedValue({
        outcome: 'failed' as const,
        browserOpened: false,
        errorReason: 'WebSocket not open',
      }),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const authButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (button) => button.textContent === t('settings.codex.mcpDetail.authenticateButton'),
    );
    authButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 10); });

    expect(noticeMessages).toContain(t('settings.codex.mcpDetail.authFailed'));
    expect(noticeMessages).not.toContain(t('settings.codex.mcpDetail.authPending'));
    (Obsidian as unknown as { Notice: unknown }).Notice = OriginalNotice;
  });

  it('shows authPending notice when OAuth outcome is pending after browser opened', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const noticeMessages: string[] = [];
    const Obsidian = jest.requireActual('obsidian') as typeof import('obsidian');
    const OriginalNotice = Obsidian.Notice;
    (Obsidian as unknown as { Notice: unknown }).Notice = class extends OriginalNotice {
      constructor(message: string) { super(message); noticeMessages.push(message); }
    };

    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('remote-server', { authStatus: 'notLoggedIn' }),
      ]),
      triggerMcpServerOAuth: jest.fn().mockImplementation(
        (_name: string, opts?: { onAuthorizationUrl?: (url: string) => void }) => {
          opts?.onAuthorizationUrl?.('https://example.com/oauth');
          return Promise.resolve({ outcome: 'pending' as const, browserOpened: true });
        },
      ),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const authButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (button) => button.textContent === t('settings.codex.mcpDetail.authenticateButton'),
    );
    authButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 10); });

    expect(noticeMessages).toContain(t('settings.codex.mcpDetail.authPending'));
    expect(noticeMessages).not.toContain(t('settings.codex.mcpDetail.authFailed'));
    (Obsidian as unknown as { Notice: unknown }).Notice = OriginalNotice;
    openSpy.mockRestore();
  });

  it('shows authFailed notice when triggerMcpServerOAuth returns null', async () => {
    const noticeMessages: string[] = [];
    const Obsidian = jest.requireActual('obsidian') as typeof import('obsidian');
    const OriginalNotice = Obsidian.Notice;
    (Obsidian as unknown as { Notice: unknown }).Notice = class extends OriginalNotice {
      constructor(message: string) { super(message); noticeMessages.push(message); }
    };

    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('remote-server', { authStatus: 'notLoggedIn' }),
      ]),
      triggerMcpServerOAuth: jest.fn().mockResolvedValue(null),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const authButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (button) => button.textContent === t('settings.codex.mcpDetail.authenticateButton'),
    );
    authButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 10); });

    expect(noticeMessages).toContain(t('settings.codex.mcpDetail.authFailed'));
    (Obsidian as unknown as { Notice: unknown }).Notice = OriginalNotice;
  });
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

    const viewBtn = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-view-btn') as HTMLButtonElement;
    viewBtn.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const emptyEl = modal.contentEl.querySelector('.opencodian-codex-mcp-resource-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.textContent).toContain('not found');
  });
});
