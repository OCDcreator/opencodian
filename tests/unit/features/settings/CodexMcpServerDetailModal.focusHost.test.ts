import type { App } from 'obsidian';

import type { AppServerMcpServerStatus } from '../../../../src/core/agents/backend/CodexAppServerClient';
import {
  CodexMcpServerDetailModal,
  type CodexMcpServerDetailModalHost,
  createCodexMcpServerDetailHost,
} from '../../../../src/features/settings/CodexMcpServerDetailModal';
import { setLocale } from '../../../../src/i18n';

function createHost(overrides: Partial<CodexMcpServerDetailModalHost> = {}): CodexMcpServerDetailModalHost {
  return {
    getMcpServerStatus: jest.fn().mockResolvedValue([]),
    reloadMcpServers: jest.fn().mockResolvedValue(true),
    triggerMcpServerOAuth: jest.fn().mockResolvedValue(true),
    readMcpServerResource: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
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

describe('CodexMcpServerDetailModal focusServerName', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('highlights the focused server card after render', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([
        serverStatus('server-a'),
        serverStatus('server-b'),
        serverStatus('server-c'),
      ]),
    });
    const modal = new CodexMcpServerDetailModal({} as App, host, 'server-b');

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const focusedCard = modal.contentEl.querySelector('.opencodian-codex-mcp-server-card.is-focused');
    expect(focusedCard).not.toBeNull();
    expect(focusedCard?.getAttribute('data-mcp-server-name')).toBe('server-b');
  });

  it('does not highlight any card when focusServerName does not match', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([serverStatus('server-a')]),
    });
    const modal = new CodexMcpServerDetailModal({} as App, host, 'nonexistent');

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(modal.contentEl.querySelector('.opencodian-codex-mcp-server-card.is-focused')).toBeNull();
  });

  it('does not highlight any card when focusServerName is not provided', async () => {
    const host = createHost({
      getMcpServerStatus: jest.fn().mockResolvedValue([serverStatus('server-a')]),
    });
    const modal = new CodexMcpServerDetailModal({} as App, host);

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(modal.contentEl.querySelector('.opencodian-codex-mcp-server-card.is-focused')).toBeNull();
  });
});

describe('createCodexMcpServerDetailHost', () => {
  it('creates a host that delegates to the adapter', async () => {
    const adapter = {
      getMcpServerStatus: jest.fn().mockResolvedValue([{ name: 'x' }]),
      reloadMcpServers: jest.fn().mockResolvedValue(true),
      triggerMcpServerOAuth: jest.fn().mockResolvedValue(false),
      readMcpServerResource: jest.fn().mockResolvedValue(null),
    };
    const host = createCodexMcpServerDetailHost(adapter);

    expect(await host.getMcpServerStatus()).toEqual([{ name: 'x' }]);
    expect(await host.reloadMcpServers()).toBe(true);
    expect(await host.triggerMcpServerOAuth('srv')).toBe(false);
    expect(await host.readMcpServerResource('srv', 'uri')).toBeNull();
  });

  it('returns safe defaults when adapter methods are missing', async () => {
    const host = createCodexMcpServerDetailHost({});

    expect(await host.getMcpServerStatus()).toBeNull();
    expect(await host.reloadMcpServers()).toBe(false);
    expect(await host.triggerMcpServerOAuth('srv')).toBeNull();
    expect(await host.readMcpServerResource('srv', 'uri')).toBeNull();
  });
});
