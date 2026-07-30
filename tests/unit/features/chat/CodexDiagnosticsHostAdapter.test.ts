import type { Menu } from 'obsidian';

import type { Conversation } from '../../../../src/core/types';
import {
  CodexDiagnosticsHostAdapter,
  type CodexDiagnosticsHostAdapterHost,
} from '../../../../src/features/chat/services/CodexDiagnosticsHostAdapter';
import { t } from '../../../../src/i18n';

type DeferredCallback = () => void | Promise<void>;

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
    title: 'Codex',
    createdAt: 1,
    updatedAt: 1,
    backend: 'codex',
    backendSessionId: 'thread-1',
    messages: [],
  } as Conversation;
}

function createHost(overrides: Partial<CodexDiagnosticsHostAdapterHost> = {}): {
  host: CodexDiagnosticsHostAdapterHost;
  callbacks: DeferredCallback[];
} {
  const harness = createMenuHarness();
  const service = {
    getCaptureState: jest.fn().mockReturnValue('off'),
    armDeepCapture: jest.fn(),
    cancelDeepCapture: jest.fn(),
    flushRingBuffer: jest.fn(),
    store: {
      getStatus: jest.fn().mockReturnValue({ mode: 'disk', lastError: null }),
      flush: jest.fn().mockResolvedValue(undefined),
      resolveTraceId: jest.fn().mockReturnValue('trace-1'),
      listSummaries: jest.fn().mockReturnValue([]),
    },
    reportBuilder: {
      buildSmartReport: jest.fn().mockResolvedValue('report'),
    },
  };
  return {
    host: {
      getCodexTraceService: jest.fn(() => service) as never,
      getCodexSessionTraceSettings: jest.fn(() => ({ enabled: true })),
      getCurrentConversation: jest.fn(() => createConversation()),
      refreshHeaderChrome: jest.fn(),
      createMenu: jest.fn(() => harness.menu),
      showNotice: jest.fn(),
      ...overrides,
    },
    callbacks: harness.callbacks,
  };
}

describe('CodexDiagnosticsHostAdapter deferred menu callbacks', () => {
  beforeEach(() => {
    jest.spyOn(window, 'prompt').mockReturnValue('');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('degrades state reads when host callbacks throw', () => {
    const { host } = createHost({
      getCodexTraceService: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
      getCodexSessionTraceSettings: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(new CodexDiagnosticsHostAdapter(host).getDiagnosticsState('tab-1')).toBe('disabled');
    const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
    expect(logged).not.toContain('sk-canary');
    expect(logged).not.toContain('/vault/');
  });

  it('does not open a diagnostics menu when Codex trace capture is disabled', () => {
    const { host } = createHost({
      getCodexSessionTraceSettings: jest.fn(() => ({ enabled: false })),
    });
    const adapter = new CodexDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');

    expect(host.createMenu).not.toHaveBeenCalled();
    expect(host.getCodexTraceService()?.getCaptureState).not.toHaveBeenCalled();
  });

  it('does not cancel or export traces when capture is disabled', async () => {
    const { host } = createHost({
      getCodexSessionTraceSettings: jest.fn(() => ({ enabled: false })),
    });
    const service = host.getCodexTraceService()! as unknown as {
      cancelDeepCapture: jest.Mock;
      flushRingBuffer: jest.Mock;
      store: { flush: jest.Mock };
    };
    const adapter = new CodexDiagnosticsHostAdapter(host);

    adapter.cancelDiagnosticCapture('tab-1');
    await adapter.exportConversationDiagnostics(createConversation());

    expect(service.cancelDeepCapture).not.toHaveBeenCalled();
    expect(service.flushRingBuffer).not.toHaveBeenCalled();
    expect(service.store.flush).not.toHaveBeenCalled();
  });

  it('does not report capture armed when armDeepCapture returns an expired token', async () => {
    const { host, callbacks } = createHost();
    const service = host.getCodexTraceService()! as unknown as {
      armDeepCapture: jest.Mock;
      getCaptureState: jest.Mock;
    };
    service.armDeepCapture.mockReturnValue({
      runId: 'expired-run',
      tabId: 'tab-1',
      armedAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1,
    });
    const adapter = new CodexDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');
    await expect(callbacks[0]!()).resolves.toBeUndefined();

    expect(host.showNotice).not.toHaveBeenCalledWith(t('chat.opencodeDiagnostics.captureArmed'));
    expect(host.refreshHeaderChrome).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['off', 'armDeepCapture'],
    ['armed', 'cancelDeepCapture'],
  ] as const)('contains a throwing %s menu callback after the menu has been shown', async (captureState, method) => {
    const { host, callbacks } = createHost();
    const service = host.getCodexTraceService()! as unknown as {
      getCaptureState: jest.Mock;
      armDeepCapture: jest.Mock;
      cancelDeepCapture: jest.Mock;
    };
    service.getCaptureState.mockReturnValue(captureState);
    service[method].mockImplementation(() => { throw new Error('trace unavailable'); });
    const adapter = new CodexDiagnosticsHostAdapter(host);

    adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');

    await expect(callbacks[0]!()).resolves.toBeUndefined();
    expect(host.refreshHeaderChrome).not.toHaveBeenCalled();
    expect(host.showNotice).not.toHaveBeenCalled();
  });

  it.each(['flush', 'store', 'report', 'clipboard'] as const)(
    'contains a rejecting %s step in deferred export',
    async (failure) => {
      const { host, callbacks } = createHost();
      const service = host.getCodexTraceService()! as unknown as {
        flushRingBuffer: jest.Mock;
        store: { flush: jest.Mock };
        reportBuilder: { buildSmartReport: jest.Mock };
      };
      if (failure === 'flush') service.flushRingBuffer.mockImplementation(() => { throw new Error('sk-canary /vault/secret'); });
      if (failure === 'store') service.store.flush.mockRejectedValue(new Error('sk-canary /vault/secret'));
      if (failure === 'report') service.reportBuilder.buildSmartReport.mockRejectedValue(new Error('sk-canary /vault/secret'));
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      if (failure === 'clipboard') writeText.mockRejectedValue(new Error('sk-canary /vault/secret'));
      const adapter = new CodexDiagnosticsHostAdapter(host);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      adapter.showDiagnostics(new MouseEvent('click'), 'tab-1');

      await expect(callbacks[1]!()).resolves.toBeUndefined();
      const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
      expect(logged).not.toContain('sk-canary');
      expect(logged).not.toContain('/vault/');
    },
  );
});
