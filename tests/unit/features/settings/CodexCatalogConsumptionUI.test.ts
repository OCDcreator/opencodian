import { type App, Modal, Setting } from 'obsidian';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../src/core/agents/backend/CodexAdapter';
import { CodexAppServerClient } from '../../../../src/core/agents/backend/CodexAppServerClient';
import { BackendSessionBrowserModal } from '../../../../src/features/chat/ui/BackendSessionBrowserModal';
import { CodexMcpServerDetailModal, createCodexMcpServerDetailHost } from '../../../../src/features/settings/CodexMcpServerDetailModal';
import { SettingsCodexReadbackControls } from '../../../../src/features/settings/SettingsCodexReadbackControls';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

async function flushUI(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function fixture() {
  const client = new CodexAppServerClient({ codexPathOverride: '/fixture/codex' });
  jest.spyOn(client, 'start').mockResolvedValue(undefined);
  const request = jest.spyOn(client as unknown as {
    request(method: string, params: Record<string, unknown>): Promise<unknown>;
  }, 'request');
  const adapter = new CodexAdapter({ workingDirectory: 'C:/vault' });
  (adapter as unknown as { appServerClient: CodexAppServerClient }).appServerClient = client;
  const registry = { get: () => adapter, getActive: () => adapter };
  const plugin = { app: {} as App, agentServiceRegistry: registry } as unknown as OpenCodianPlugin;
  return { client, request, adapter, registry, controls: new SettingsCodexReadbackControls({ plugin }) };
}

const catalogs = [
  { route: 'model/list', method: 'renderModelListReadbackControls', selector: '[data-model-id]', idAttribute: 'data-model-id', row: (id: string) => ({ id, model: 'same-slug', displayName: id }) },
  { route: 'permissionProfile/list', method: 'renderPermissionProfilesReadbackControls', selector: '[data-profile-id]', idAttribute: 'data-profile-id', row: (id: string) => ({ id, description: id }) },
  { route: 'thread/loaded/list', method: 'renderLoadedThreadsReadbackControls', selector: '[data-thread-id]', idAttribute: 'data-thread-id', row: (id: string) => id },
  { route: 'mcpServerStatus/list', method: 'renderMcpServerStatusReadbackControls', selector: '[data-mcp-server-name]', idAttribute: 'data-mcp-server-name', row: (id: string) => ({ name: id, tools: {}, resources: [] }) },
] as const;

function launch(controls: SettingsCodexReadbackControls, method: typeof catalogs[number]['method']): Modal {
  const actions: Array<() => unknown> = [];
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (callback) {
    const button = {
      setButtonText: () => button,
      onClick: (action: () => unknown) => { actions.push(action); return button; },
    };
    callback(button as never);
    return this;
  });
  const opened: Modal[] = [];
  jest.spyOn(Modal.prototype, 'open').mockImplementation(function () {
    opened.push(this);
    document.body.appendChild(this.modalEl);
    this.modalEl.appendChild(this.contentEl);
    this.onOpen();
  });
  controls[method](document.createElement('div'));
  expect(actions.length).toBeGreaterThan(0);
  actions[0]();
  return opened[0];
}

function state(modal: Modal): string | null | undefined {
  return modal.contentEl.querySelector('[data-readback-state], [data-mcp-state]')?.getAttribute(
    modal instanceof CodexMcpServerDetailModal ? 'data-mcp-state' : 'data-readback-state',
  );
}

beforeEach(() => { setLocale('en'); });
afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; setLocale('en'); });

describe.each(catalogs.flatMap((catalog) => (['en', 'zh'] as const).map((locale) => ({ ...catalog, locale }))))('$route settings button consumes complete catalog evidence ($locale)', (catalog) => {
  beforeEach(() => { setLocale(catalog.locale); });
  it('renders two pages, deduplicates native IDs, and never performs a write', async () => {
    const { controls, request } = fixture();
    request.mockImplementation(async (method, params) => {
      expect(method).toBe(catalog.route);
      return params.cursor
        ? { data: [catalog.row('native-A'), catalog.row('native-B')], nextCursor: null }
        : { data: [catalog.row('native-A')], nextCursor: 'page-2' };
    });
    const modal = launch(controls, catalog.method);
    expect(state(modal)).toBe('loading');
    await flushUI();
    expect(state(modal)).toBe('success');
    expect(Array.from(modal.contentEl.querySelectorAll(catalog.selector)).map((el) => el.getAttribute(catalog.idAttribute)))
      .toEqual(['native-A', 'native-B']);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].cursor).toBe('page-2');
    expect(request.mock.calls.every(([, params]) => catalog.route !== 'permissionProfile/list' || params.cwd === 'C:/vault')).toBe(true);
  });

  it('retains first-page rows and shows partial when page two fails', async () => {
    const { controls, request } = fixture();
    request.mockResolvedValueOnce({ data: [catalog.row('native-A')], nextCursor: 'page-2' });
    request.mockRejectedValueOnce(new Error('second page disconnected'));
    const modal = launch(controls, catalog.method);
    await flushUI();
    expect(state(modal)).toBe('partial');
    expect(modal.contentEl.querySelector(catalog.selector)?.getAttribute(catalog.idAttribute)).toBe('native-A');
    expect(modal.contentEl.textContent).toContain(t('settings.codex.readback.statusPartial', { count: 1 }));
    expect(modal.contentEl.textContent).toContain(modal instanceof CodexMcpServerDetailModal
      ? t('settings.codex.readback.messagePartialReload')
      : t('settings.codex.readback.messagePartial'));
  });

  it.each([
    ['failed', new Error('connection failed')],
    ['unavailable', { code: -32601, message: 'Method not found' }],
  ])('distinguishes %s from an empty result', async (expected, error) => {
    const { controls, request } = fixture();
    request.mockRejectedValue(error);
    const modal = launch(controls, catalog.method);
    await flushUI();
    expect(state(modal)).toBe(expected);
    expect(modal.contentEl.querySelector(catalog.selector)).toBeNull();
  });

  it('reports an empty complete catalog as empty', async () => {
    const { controls, request } = fixture();
    request.mockResolvedValue({ data: [], nextCursor: null });
    const modal = launch(controls, catalog.method);
    await flushUI();
    expect(state(modal)).toBe('empty');
  });
});

describe.each(['en', 'zh'] as const)('Codex session browser native catalogs (%s)', (locale) => {
  beforeEach(() => { setLocale(locale); });
  function browser(f: ReturnType<typeof fixture>): BackendSessionBrowserModal {
    return new BackendSessionBrowserModal({} as App, {
      getAgentServiceRegistry: () => f.registry as never,
      getActiveBackendKind: () => 'codex',
      forcedBackendKind: 'codex',
      createConversationFromBackendSession: jest.fn().mockResolvedValue('local-conversation'),
      loadConversation: jest.fn(), showNotice: jest.fn(), isStreaming: () => false,
    });
  }

  it('merges active/archived pages, retains native selection through refresh, and resumes by native ID', async () => {
    const f = fixture();
    const threads = (id: string) => ({ id, name: id, preview: id, updatedAt: 1 });
    f.request.mockImplementation(async (method, params) => {
      if (method === 'thread/read') return { thread: { id: params.threadId, turns: [] } };
      if (params.archived) return { data: [threads('native-A'), threads('archived-C')], nextCursor: null };
      return params.cursor ? { data: [threads('native-A'), threads('native-B')], nextCursor: null }
        : { data: [threads('native-A')], nextCursor: 'page-2' };
    });
    const modal = browser(f);
    modal.onOpen();
    expect(modal.contentEl.querySelector('[data-session-catalog-state]')?.getAttribute('data-session-catalog-state')).toBe('loading');
    await flushUI();
    expect(Array.from(modal.contentEl.querySelectorAll('[data-session-id]')).map((el) => el.getAttribute('data-session-id')))
      .toEqual(['native-A', 'native-B', 'archived-C']);
    expect(modal.contentEl.querySelector('[data-session-id="native-A"]')?.classList.contains('is-archived')).toBe(false);
    (modal.contentEl.querySelector('[data-session-id="native-B"]') as HTMLElement).click();
    await flushUI();
    const refresh = Array.from(modal.contentEl.querySelectorAll('button')).find((button) => button.textContent === t('chat.backendSessions.refreshButton'));
    expect(refresh).toBeDefined();
    refresh!.click();
    await flushUI();
    expect(modal.contentEl.querySelector('[data-session-id="native-B"]')?.classList.contains('is-selected')).toBe(true);
    (modal.contentEl.querySelector('.opencodian-backend-session-browser-resume-btn') as HTMLButtonElement).click();
    await flushUI();
    expect(f.request.mock.calls.some(([, params]) => params.threadId === 'native-B')).toBe(true);
    expect(f.request.mock.calls.every(([method]) => method === 'thread/list' || method === 'thread/read')).toBe(true);
  });

  it('preserves partial native rows and refresh retries the failed second page', async () => {
    const f = fixture();
    let fail = true;
    f.request.mockImplementation(async (_method, params) => {
      if (params.archived) return { data: [], nextCursor: null };
      if (params.cursor && fail) throw new Error('page two failed');
      return { data: [{ id: params.cursor ? 'native-B' : 'native-A', name: 'Title', updatedAt: 1 }], nextCursor: params.cursor ? null : 'page-2' };
    });
    const modal = browser(f);
    modal.onOpen(); await flushUI();
    expect(modal.contentEl.querySelector('[data-session-catalog-state="partial"]')).toBeTruthy();
    expect(modal.contentEl.textContent).toContain(t('chat.backendSessions.catalogPartial'));
    expect(modal.contentEl.querySelector('[data-session-id="native-A"]')).toBeTruthy();
    fail = false;
    Array.from(modal.contentEl.querySelectorAll('button')).find((button) => button.textContent === t('chat.backendSessions.refreshButton'))!.click();
    await flushUI();
    expect(modal.contentEl.querySelector('[data-session-catalog-state="complete"]')).toBeTruthy();
    expect(modal.contentEl.querySelectorAll('[data-session-id]')).toHaveLength(2);
  });

  it.each([
    ['failed', new Error('offline')],
    ['unavailable', { code: -32601, message: 'Method not found' }],
  ])('shows %s rather than successful empty history', async (expected, error) => {
    const f = fixture(); f.request.mockRejectedValue(error);
    const modal = browser(f); modal.onOpen(); await flushUI();
    expect(modal.contentEl.querySelector(`[data-session-catalog-state="${expected}"]`)).toBeTruthy();
    expect(modal.contentEl.textContent).toContain(expected === 'failed'
      ? t('chat.backendSessions.catalogFailed')
      : t('chat.backendSessions.catalogUnavailable'));
    expect(modal.contentEl.querySelector('.opencodian-backend-session-browser-empty')).toBeNull();
  });

  it('missing app-server leaves unavailable evidence on every catalog', async () => {
    const adapter = new CodexAdapter();
    const reads = await Promise.all([adapter.getSessionCatalog(), adapter.getModelsCatalog(), adapter.getPermissionProfilesCatalog(), adapter.getMcpServerStatusCatalog(), adapter.getLoadedThreadsCatalog()]);
    expect(reads.every((read) => read.status === 'unavailable')).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Sessions)).toBe(true);
  });

  it('chat MCP host forwards the structured catalog and preserves partial server names', async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce({ data: [{ name: 'native-mcp', tools: {} }], nextCursor: 'page-2' }).mockRejectedValueOnce(new Error('offline'));
    const modal = new CodexMcpServerDetailModal({} as App, createCodexMcpServerDetailHost(f.adapter));
    modal.onOpen(); await flushUI();
    expect(state(modal)).toBe('partial');
    expect(modal.contentEl.querySelector('[data-mcp-server-name="native-mcp"]')).toBeTruthy();
    expect(modal.contentEl.textContent).toContain(t('settings.codex.readback.statusPartial', { count: 1 }));
    expect(modal.contentEl.textContent).toContain(t('settings.codex.readback.messagePartialReload'));
  });
});
