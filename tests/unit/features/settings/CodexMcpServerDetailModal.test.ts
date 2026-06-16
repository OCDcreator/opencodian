import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  it('restores previous content after reload throws', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([serverStatus('initial-server')]),
      reloadMcpServers: jest.fn().mockRejectedValue(new Error('reload failed')),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const reloadButton = modal.contentEl.querySelector(
      '.opencodian-codex-mcp-detail-toolbar button',
    ) as HTMLButtonElement | null;
    reloadButton!.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-mcp-detail-status-value');
    expect(host.reloadMcpServers).toHaveBeenCalledTimes(1);
    expect(host.getMcpServerStatus).toHaveBeenCalledTimes(1);
    expect(statusValue?.getAttribute('data-mcp-state')).toBe('success');
    expect(modal.contentEl.textContent).toContain('initial-server');
    expect(modal.contentEl.textContent).not.toContain(t('settings.codex.mcpDetail.loading'));
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

describe('CodexMcpServerDetailModal — state handling', () => {
  it('shows loading state immediately on open', () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockImplementation(() => new Promise(() => {})),
    });
    const modal = createModal(host);

    modal.onOpen();

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-mcp-detail-status-value');
    expect(statusValue?.getAttribute('data-mcp-state')).toBe('loading');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusLoading'));
    expect(modal.contentEl.textContent).toContain(t('settings.codex.mcpDetail.loading'));
  });

  it('shows unavailable state when host returns null', async () => {
    const host = createHost({ getMcpServerStatus: jest.fn().mockResolvedValue(null) });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-mcp-detail-status-value');
    expect(statusValue?.getAttribute('data-mcp-state')).toBe('unavailable');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusUnavailable'));
    expect(modal.contentEl.textContent).toContain(t('settings.codex.mcpDetail.unavailable'));
  });

  it('shows failed state when host throws', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockRejectedValue(new Error('network')),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-mcp-detail-status-value');
    expect(statusValue?.getAttribute('data-mcp-state')).toBe('failed');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusFailed'));
    expect(modal.contentEl.textContent).toContain(t('settings.codex.mcpDetail.failed'));
  });

  it('shows empty state when host returns an empty array', async () => {
    const host = createHost({ getMcpServerStatus: jest.fn().mockResolvedValue([]) });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-mcp-detail-status-value');
    expect(statusValue?.getAttribute('data-mcp-state')).toBe('empty');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusEmpty'));
    expect(modal.contentEl.textContent).toContain(t('settings.codex.mcpDetail.empty'));
  });

  it('shows success state with server count', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([serverStatus('server-a'), serverStatus('server-b')]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-mcp-detail-status-value');
    expect(statusValue?.getAttribute('data-mcp-state')).toBe('success');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusCount', { count: 2 }));
    expect(modal.contentEl.textContent).toContain('server-a');
    expect(modal.contentEl.textContent).toContain('server-b');
  });
});

describe('CodexMcpServerDetailModal — layout and structure', () => {
  it('renders servers as sections, not nested cards', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a'),
        serverStatus('server-b'),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const sections = modal.contentEl.querySelectorAll('.opencodian-codex-mcp-server-section');
    expect(sections).toHaveLength(2);

    const cards = modal.contentEl.querySelectorAll('.opencodian-codex-mcp-server-card');
    expect(cards).toHaveLength(0);

    for (const section of sections) {
      expect(section.querySelectorAll('.opencodian-modal-card').length).toBe(0);
    }
  });

  it('renders section headers with h4 and no left padding', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('long-name-server'),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const header = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section-header');
    expect(header).not.toBeNull();

    const heading = header!.querySelector('h4');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toContain('long-name-server');
  });

  it('groups collapsed summary metadata and actions in the right header column', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('computer-use', {
          serverInfo: {
            name: 'Computer Use',
            version: '1.0a51766bb4d162ef1eed308e86a0f8f381fbb600896cb92c18ebde998142af',
          },
          tools: {
            click: { name: 'click' },
            screenshot: { name: 'screenshot' },
          },
          authStatus: 'unsupported',
        }),
      ]),
    });
    const modal = createModal(host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const header = modal.contentEl.querySelector('.opencodian-codex-mcp-server-section-header');
    expect(header).not.toBeNull();

    const identity = header!.querySelector(':scope > .opencodian-codex-mcp-server-section-identity');
    expect(identity).not.toBeNull();
    expect(identity?.querySelector('h4')?.textContent).toContain('Computer Use');
    expect(identity?.querySelector('.opencodian-codex-mcp-server-section-short-id')?.textContent).toBe('computer-use');

    const meta = header!.querySelector(':scope > .opencodian-codex-mcp-server-section-meta');
    expect(meta).not.toBeNull();
    expect(meta?.querySelector('.opencodian-codex-mcp-server-section-counts')?.textContent).toContain(
      t('settings.codex.mcpDetail.toolCount', { count: 2 }),
    );
    expect(meta?.querySelector('.opencodian-inspection-section-actions .opencodian-codex-mcp-auth-badge')?.textContent).toBe(
      t('settings.codex.mcpDetail.authUnsupported'),
    );
    expect(meta?.querySelector('.opencodian-inspection-section-actions .opencodian-codex-mcp-server-expand-btn')).not.toBeNull();
  });
});

describe('CodexMcpServerDetailModal CSS contract', () => {
  it('keeps the server card shell on the header instead of the whole section', () => {
    const css = readFileSync(join(process.cwd(), 'src/style/modals/config-editor-modal.css'), 'utf8');

    const findRule = (selector: string): string => {
      const pattern = new RegExp(`${selector}\\s*\\{[\\s\\S]*?\\}`, 'g');
      return Array.from(css.matchAll(pattern)).map((match) => match[0]).find(Boolean) ?? '';
    };

    const sectionRule = findRule('\\.opencodian-codex-mcp-server-section');
    const focusedRule = findRule('\\.opencodian-codex-mcp-server-section\\.is-focused::before');
    const headerRule = findRule('\\.opencodian-codex-mcp-server-section-header');
    const collapsedHeaderRule = findRule(
      '\\.opencodian-codex-mcp-server-section:not\\(\\.is-expanded\\) \\.opencodian-codex-mcp-server-section-header',
    );
    const collapsedTitleRule = findRule(
      '\\.opencodian-codex-mcp-server-section:not\\(\\.is-expanded\\) \\.opencodian-codex-mcp-server-section-header h4',
    );
    const collapsedShortIdRule = findRule(
      '\\.opencodian-codex-mcp-server-section:not\\(\\.is-expanded\\) \\.opencodian-codex-mcp-server-section-short-id',
    );
    const focusedHeaderRule = findRule(
      '\\.opencodian-codex-mcp-server-section\\.is-focused \\.opencodian-codex-mcp-server-section-header',
    );

    expect(sectionRule).toContain('background: transparent');
    expect(sectionRule).toContain('border: none');
    expect(sectionRule).toContain('border-radius: 0');
    expect(focusedRule).toBe('');
    expect(headerRule).toContain('background: var(--background-secondary');
    expect(headerRule).toContain('border: 1px solid var(--background-modifier-border)');
    expect(headerRule).toContain('border-radius: 8px');
    expect(collapsedHeaderRule).toContain('height: var(--opencodian-mcp-server-collapsed-height)');
    expect(collapsedHeaderRule).toContain('max-height: var(--opencodian-mcp-server-collapsed-height)');
    expect(collapsedHeaderRule).toContain('overflow: hidden');
    expect(collapsedTitleRule).toContain('white-space: nowrap');
    expect(collapsedTitleRule).toContain('text-overflow: ellipsis');
    expect(collapsedShortIdRule).toContain('white-space: nowrap');
    expect(collapsedShortIdRule).toContain('text-overflow: ellipsis');
    expect(focusedHeaderRule).toBe('');
  });
});
