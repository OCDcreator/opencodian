import type { Menu } from 'obsidian';

import type { Conversation } from '../../../../src/core/types';
import {
  ClaudeDiagnosticsHostAdapter,
  type ClaudeDiagnosticsHostAdapterHost,
} from '../../../../src/features/chat/services/ClaudeDiagnosticsHostAdapter';
import { t } from '../../../../src/i18n';

type DeferredCallback = () => void | Promise<void>;

interface FakeClaudeTraceService {
  getStorageStatus: jest.Mock;
  getCaptureState: jest.Mock;
  armDeepCapture: jest.Mock;
  cancelDeepCapture: jest.Mock;
  claimDeepCapture: jest.Mock;
  flushRingBuffer: jest.Mock;
  resolveTraceId: jest.Mock;
  buildSmartReport: jest.Mock;
  listRecentTraces: jest.Mock;
  store: {
    flush: jest.Mock;
  };
}

function createMenuHarness(): { menu: Menu; callbacks: DeferredCallback[] } {
  const callbacks: DeferredCallback[] = [];
  const menu = {
    addItem: jest.fn((configure: (item: {
      setTitle(title: string): unknown;
      setIcon(icon: string): unknown;
      onClick(callback: DeferredCallback): unknown;
    }) => unknown) => {
      const item = {
        setTitle: jest.fn().mockReturnThis(),
        setIcon: jest.fn().mockReturnThis(),
        onClick: jest.fn((callback: DeferredCallback) => {
          callbacks.push(callback);
          return item;
        }),
      };
      configure(item);
      return menu;
    }),
    showAtMouseEvent: jest.fn(),
  } as unknown as Menu;
  return { menu, callbacks };
}

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Claude Code',
    createdAt: 1,
    updatedAt: 1,
    backend: 'claude-code',
    backendSessionId: 'session-1',
    messages: [],
  } as Conversation;
}

function createTraceService(overrides: Partial<FakeClaudeTraceService> = {}): FakeClaudeTraceService {
  return {
    getStorageStatus: jest.fn().mockReturnValue({
      mode: 'disk',
      rootDirectory: '/tmp/claude-trace',
      queuedEvents: 0,
      approximateBytes: 0,
      droppedEvents: 0,
      lastError: null,
    }),
    getCaptureState: jest.fn().mockReturnValue('off'),
    armDeepCapture: jest.fn(),
    cancelDeepCapture: jest.fn().mockReturnValue(true),
    claimDeepCapture: jest.fn(),
    flushRingBuffer: jest.fn(),
    resolveTraceId: jest.fn().mockReturnValue('trace-1'),
    buildSmartReport: jest.fn().mockResolvedValue('report'),
    listRecentTraces: jest.fn().mockReturnValue([]),
    store: {
      flush: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function createHost(options: {
  service?: Partial<FakeClaudeTraceService>;
  host?: Partial<ClaudeDiagnosticsHostAdapterHost>;
} = {}): {
  host: ClaudeDiagnosticsHostAdapterHost;
  service: FakeClaudeTraceService;
  callbacks: DeferredCallback[];
} {
  const harness = createMenuHarness();
  const service = createTraceService(options.service);
  return {
    service,
    host: {
      getClaudeTraceService: jest.fn(() => service) as never,
      getClaudeSessionTraceSettings: jest.fn(() => ({ enabled: true })),
      getCurrentConversation: jest.fn(() => createConversation()),
      refreshHeaderChrome: jest.fn(),
      createMenu: jest.fn(() => harness.menu),
      showNotice: jest.fn(),
      ...options.host,
    },
    callbacks: harness.callbacks,
  };
}

// eslint-disable-next-line max-lines-per-function -- host contract tests share one lifecycle harness.
describe('ClaudeDiagnosticsHostAdapter', () => {
  beforeEach(() => {
    jest.spyOn(window, 'prompt').mockReturnValue('');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // eslint-disable-next-line max-lines-per-function -- the state matrix keeps all badge contracts together.
  it.each([
    ['disabled', 'disabled', { enabled: false }],
    ['degraded', 'degraded', { enabled: true, status: { mode: 'memory', lastError: null } }],
    ['armed', 'armed', { enabled: true, captureState: 'armed' }],
    ['capturing', 'capturing', { enabled: true, captureState: 'capturing' }],
    ['normal', 'normal', { enabled: true }],
    ['warning', 'warning', {
      enabled: true,
      summary: { traceId: 'trace-1', unreadAnomalyCount: 1, highestUnreadSeverity: 'warning' },
    }],
    ['critical', 'critical', {
      enabled: true,
      summary: { traceId: 'trace-1', unreadAnomalyCount: 1, highestUnreadSeverity: 'critical' },
    }],
  ] as const)('reports the %s diagnostics state', (_label, expected, options) => {
    const { host, service } = createHost({
      service: {
        getStorageStatus: jest.fn().mockReturnValue({
          mode: options.status?.mode ?? 'disk',
          rootDirectory: '/tmp/claude-trace',
          queuedEvents: 0,
          approximateBytes: 0,
          droppedEvents: 0,
          lastError: options.status?.lastError ?? null,
        }),
        getCaptureState: jest.fn().mockReturnValue(options.captureState ?? 'off'),
        listRecentTraces: jest.fn().mockReturnValue(options.summary ? [options.summary] : []),
      },
      host: {
        getClaudeSessionTraceSettings: jest.fn(() => ({ enabled: options.enabled })),
      },
    });

    expect(new ClaudeDiagnosticsHostAdapter(host).getDiagnosticsState('tab-1')).toBe(expected);
    const readsSummary = expected === 'normal' || expected === 'warning' || expected === 'critical';
    expect(service.resolveTraceId).toHaveBeenCalledTimes(readsSummary ? 1 : 0);
    expect(service.listRecentTraces).toHaveBeenCalledTimes(readsSummary ? 1 : 0);
  });

  it('degrades state reads when host callbacks throw without logging secrets', () => {
    const { host } = createHost({
      host: {
        getClaudeTraceService: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }) as never,
        getClaudeSessionTraceSettings: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
      },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(new ClaudeDiagnosticsHostAdapter(host).getDiagnosticsState('tab-1')).toBe('disabled');
    const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
    expect(logged).not.toContain('sk-canary');
    expect(logged).not.toContain('/vault/');
  });

  it('shows arm, cancel, and copy actions and arms a valid token', async () => {
    const { host, service, callbacks } = createHost();
    service.armDeepCapture.mockReturnValue({
      runId: 'run-1',
      tabId: 'tab-1',
      armedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
    });
    const adapter = new ClaudeDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');

    expect(host.createMenu).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(2);
    expect(callbacks[0]!()).toBeUndefined();
    expect(service.armDeepCapture).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshHeaderChrome).toHaveBeenCalledTimes(1);
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.claudeDiagnostics.captureArmed'));
  });

  it('cancels armed capture from the menu and copies the session from the second action', async () => {
    const { host, service, callbacks } = createHost({
      service: { getCaptureState: jest.fn().mockReturnValue('armed') },
    });
    const adapter = new ClaudeDiagnosticsHostAdapter(host);
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');
    expect(callbacks[0]!()).toBeUndefined();
    expect(service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');
    expect(host.refreshHeaderChrome).toHaveBeenCalledTimes(1);

    await expect(callbacks[1]!()).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith('report');
    expect(host.showNotice).toHaveBeenCalledWith(t('settings.debug.claude.actions.copySuccess'));
  });

  it('does not open a menu or mutate capture when diagnostics are disabled', async () => {
    const { host, service } = createHost({
      host: { getClaudeSessionTraceSettings: jest.fn(() => ({ enabled: false })) },
    });
    const adapter = new ClaudeDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');
    adapter.cancelDiagnosticCapture('tab-1');
    await adapter.exportConversationDiagnostics(createConversation());

    expect(host.createMenu).not.toHaveBeenCalled();
    expect(service.getCaptureState).not.toHaveBeenCalled();
    expect(service.cancelDeepCapture).not.toHaveBeenCalled();
    expect(service.flushRingBuffer).not.toHaveBeenCalled();
    expect(service.store.flush).not.toHaveBeenCalled();
  });

  it('does not report an expired arm token as armed', async () => {
    const { host, service, callbacks } = createHost();
    service.armDeepCapture.mockReturnValue({
      runId: 'expired-run',
      tabId: 'tab-1',
      armedAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1,
    });
    const adapter = new ClaudeDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');
    expect(callbacks[0]!()).toBeUndefined();

    expect(host.showNotice).not.toHaveBeenCalledWith(t('chat.claudeDiagnostics.captureArmed'));
    expect(host.refreshHeaderChrome).toHaveBeenCalledTimes(1);
  });

  it('claims and cancels a diagnostic run token safely', () => {
    const { host, service } = createHost();
    const token = { runId: 'run-1', tabId: 'tab-1', armedAt: 1, expiresAt: 2 };
    service.claimDeepCapture.mockReturnValue(token);
    const adapter = new ClaudeDiagnosticsHostAdapter(host);

    expect(adapter.claimDiagnosticRunToken(null, 'session-1')).toBeUndefined();
    expect(adapter.claimDiagnosticRunToken('tab-1', 'session-1')).toBe(token);
    expect(service.claimDeepCapture).toHaveBeenCalledWith('tab-1', 'session-1');

    adapter.cancelDiagnosticCapture('tab-1');
    expect(service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');
  });

  it('exports in the required flush, resolve, prompts, report, clipboard order', async () => {
    const order: string[] = [];
    const { host, service } = createHost({
      service: {
        flushRingBuffer: jest.fn(() => order.push('flushRingBuffer')),
        resolveTraceId: jest.fn(() => {
          order.push('resolveTraceId');
          return 'trace-1';
        }),
        buildSmartReport: jest.fn(async () => {
          order.push('buildSmartReport');
          return 'report';
        }),
        store: { flush: jest.fn(async () => { order.push('store.flush'); }) },
      },
    });
    const prompt = window.prompt as jest.Mock;
    prompt.mockImplementation(() => {
      order.push('prompt');
      return '';
    });
    const writeText = jest.fn(async () => { order.push('clipboard'); });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await new ClaudeDiagnosticsHostAdapter(host).exportConversationDiagnostics(createConversation());

    expect(order).toEqual([
      'flushRingBuffer',
      'store.flush',
      'resolveTraceId',
      'prompt',
      'prompt',
      'prompt',
      'buildSmartReport',
      'clipboard',
    ]);
    expect(service.buildSmartReport).toHaveBeenCalledWith(
      'trace-1',
      { actual: '', expected: '', reproduction: '' },
      { selection: 'current-session' },
    );
  });

  it.each(['flush', 'store', 'resolve', 'report', 'clipboard'] as const)(
    'contains a throwing %s hook inside the safe export boundary',
    async (failure) => {
      const { host, service } = createHost();
      const canary = new Error('sk-canary /vault/secret');
      if (failure === 'flush') service.flushRingBuffer.mockImplementation(() => { throw canary; });
      if (failure === 'store') service.store.flush.mockRejectedValue(canary);
      if (failure === 'resolve') service.resolveTraceId.mockImplementation(() => { throw canary; });
      if (failure === 'report') service.buildSmartReport.mockRejectedValue(canary);
      const writeText = jest.fn();
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      if (failure === 'clipboard') writeText.mockRejectedValue(canary);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(new ClaudeDiagnosticsHostAdapter(host).exportConversationDiagnostics(createConversation()))
        .resolves.toBeUndefined();
      const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
      expect(logged).not.toContain('sk-canary');
      expect(logged).not.toContain('/vault/');
    },
  );

  it('swallows every deferred menu hook failure without rejecting the callback', async () => {
    const { host, service, callbacks } = createHost({
      service: {
        armDeepCapture: jest.fn().mockReturnValue({
          runId: 'run-1',
          tabId: 'tab-1',
          armedAt: Date.now(),
          expiresAt: Date.now() + 30_000,
        }),
        getCaptureState: jest.fn().mockReturnValue('off'),
      },
      host: {
        refreshHeaderChrome: jest.fn(() => { throw new Error('header unavailable'); }),
        showNotice: jest.fn(() => { throw new Error('notice unavailable'); }),
      },
    });
    const adapter = new ClaudeDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');
    expect(callbacks[0]!()).toBeUndefined();
    expect(service.armDeepCapture).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshHeaderChrome).toHaveBeenCalledTimes(1);
    expect(host.showNotice).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['off', 'armDeepCapture'],
    ['armed', 'cancelDeepCapture'],
  ] as const)('swallows a throwing %s service menu callback', (captureState, method) => {
    const { host, service, callbacks } = createHost({
      service: {
        getCaptureState: jest.fn().mockReturnValue(captureState),
        [method]: jest.fn(() => { throw new Error('trace unavailable'); }),
      },
    });
    const adapter = new ClaudeDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');
    expect(callbacks[0]!()).toBeUndefined();
    expect(service[method]).toHaveBeenCalledWith('tab-1', ...(captureState === 'off' ? ['session-1'] : []));
  });

  it('swallows a throwing menu factory and service getter', () => {
    const { host: menuHost } = createHost({
      host: { createMenu: jest.fn(() => { throw new Error('menu unavailable'); }) },
    });
    expect(() => new ClaudeDiagnosticsHostAdapter(menuHost).showDiagnostics(new MouseEvent('click'), 'tab-1')).not.toThrow();

    const { host: serviceHost } = createHost({
      host: { getClaudeTraceService: jest.fn(() => { throw new Error('trace unavailable'); }) as never },
    });
    expect(new ClaudeDiagnosticsHostAdapter(serviceHost).claimDiagnosticRunToken('tab-1', 'session-1')).toBeUndefined();
  });
});
