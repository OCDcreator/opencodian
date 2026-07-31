import {
  ChatDiagnosticsCoordinator,
  type ChatDiagnosticsCoordinatorHost,
  type OpenCodeDiagnosticsMenu,
  type OpenCodeDiagnosticsMenuItem,
  type OpenCodeTraceServicePort,
} from '../../../../src/features/chat/services/ChatDiagnosticsCoordinator';
import { t } from '../../../../src/i18n';

interface CapturedMenuItem {
  title: string;
  onClick: () => void | Promise<void>;
}

interface CapturingMenu {
  menu: OpenCodeDiagnosticsMenu;
  items: CapturedMenuItem[];
  showAtMouseEvent: jest.Mock;
}

interface TraceServiceStub {
  port: OpenCodeTraceServicePort;
  getStatus: jest.Mock;
  resolveTraceId: jest.Mock;
  listSummaries: jest.Mock;
  getCaptureState: jest.Mock;
  armDeepCapture: jest.Mock;
  cancelDeepCapture: jest.Mock;
  claimDeepCapture: jest.Mock;
  buildSmartReport: jest.Mock;
}

interface HarnessOptions {
  enabled?: boolean;
  service?: OpenCodeTraceServicePort | null;
  activeTabId?: string | null;
  sessionId?: string | null;
  hostOverrides?: Partial<ChatDiagnosticsCoordinatorHost>;
}

interface Harness {
  coordinator: ChatDiagnosticsCoordinator;
  service: TraceServiceStub;
  menu: CapturingMenu;
  events: string[];
  host: ChatDiagnosticsCoordinatorHost;
}

function createCapturingMenu(): CapturingMenu {
  const items: CapturedMenuItem[] = [];
  const showAtMouseEvent = jest.fn();
  const menu: OpenCodeDiagnosticsMenu = {
    addItem: jest.fn().mockImplementation((callback: (item: OpenCodeDiagnosticsMenuItem) => unknown) => {
      const item = {
        title: '',
        setTitle(title: string) {
          this.title = title;
          return this;
        },
        setIcon() {
          return this;
        },
        onClick(onClick: () => void | Promise<void>) {
          items.push({ title: this.title, onClick });
          return this;
        },
      } as OpenCodeDiagnosticsMenuItem & { title: string };
      callback(item);
      return menu;
    }),
    showAtMouseEvent,
  };
  return { menu, items, showAtMouseEvent };
}

function createTraceService(events: string[]): TraceServiceStub {
  const getStatus = jest.fn().mockReturnValue({
    mode: 'disk',
    rootDirectory: '/tmp/open-code-diagnostics',
    queuedEvents: 0,
    approximateBytes: 0,
    droppedEvents: 0,
    lastError: undefined,
  });
  const resolveTraceId = jest.fn().mockImplementation(() => {
    events.push('resolve');
    return 'trace-1';
  });
  const listSummaries = jest.fn().mockReturnValue([]);
  const getCaptureState = jest.fn().mockReturnValue('off');
  const armDeepCapture = jest.fn().mockImplementation(() => {
    events.push('arm');
    return { runId: 'run-1', tabId: 'tab-1', armedAt: 1, expiresAt: 2 };
  });
  const cancelDeepCapture = jest.fn().mockImplementation(() => {
    events.push('cancel');
    return true;
  });
  const claimDeepCapture = jest.fn().mockReturnValue({
    runId: 'run-1', tabId: 'tab-1', armedAt: 1, expiresAt: 2,
  });
  const buildSmartReport = jest.fn().mockImplementation(async () => {
    events.push('report');
    return 'redacted report';
  });
  return {
    port: {
      store: { getStatus, resolveTraceId, listSummaries },
      reportBuilder: { buildSmartReport },
      getCaptureState,
      armDeepCapture,
      cancelDeepCapture,
      claimDeepCapture,
    },
    getStatus,
    resolveTraceId,
    listSummaries,
    getCaptureState,
    armDeepCapture,
    cancelDeepCapture,
    claimDeepCapture,
    buildSmartReport,
  };
}

function createHarness(options: HarnessOptions = {}): Harness {
  const events: string[] = [];
  const service = createTraceService(events);
  const menu = createCapturingMenu();
  const host: ChatDiagnosticsCoordinatorHost = {
    getOpenCodeSessionTraceSettings: () => ({ enabled: options.enabled ?? true }),
    getOpenCodeTraceService: () => options.service === null ? undefined : options.service ?? service.port,
    getActiveTabId: () => options.activeTabId === undefined ? 'tab-1' : options.activeTabId,
    getSessionIdForTab: () => options.sessionId === undefined ? 'session-1' : options.sessionId,
    refreshHeaderChrome: () => { events.push('refresh'); },
    createMenu: () => menu.menu,
    promptDiagnosticsUserContext: async () => {
      events.push('prompt');
      return { actual: 'actual' };
    },
    writeTextToClipboard: async () => { events.push('clipboard'); },
    showNotice: (message) => { events.push(`notice:${message}`); },
    ...options.hostOverrides,
  };
  return {
    coordinator: new ChatDiagnosticsCoordinator(host),
    service,
    menu,
    events,
    host,
  };
}

function getMenuAction(menu: CapturingMenu, title: string): () => void | Promise<void> {
  const action = menu.items.find((item) => item.title === title)?.onClick;
  expect(action).toBeDefined();
  return action!;
}

let consoleError: jest.SpyInstance;
let consoleInfo: jest.SpyInstance;
let consoleLog: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function expectCanariesNotLogged(): void {
  const output = [consoleError, consoleInfo, consoleLog, consoleWarn]
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .join(' ');
  expect(output).not.toContain('sk-open-code-canary');
  expect(output).not.toContain('/vault/private-path');
}

describe('ChatDiagnosticsCoordinator state matrix', () => {
    it.each([
      ['disabled', { enabled: false }, 'disabled'],
      ['missing service', { service: null }, 'degraded'],
      ['memory store', { setup: (service: TraceServiceStub) => service.getStatus.mockReturnValue({ mode: 'memory' }) }, 'degraded'],
      ['store error', { setup: (service: TraceServiceStub) => service.getStatus.mockReturnValue({ mode: 'disk', lastError: 'unavailable' }) }, 'degraded'],
      ['no active tab', { activeTabId: null }, 'normal'],
      ['armed capture', { setup: (service: TraceServiceStub) => service.getCaptureState.mockReturnValue('armed') }, 'armed'],
      ['capturing run', { setup: (service: TraceServiceStub) => service.getCaptureState.mockReturnValue('capturing') }, 'capturing'],
      ['unread warning', {
        setup: (service: TraceServiceStub) => service.listSummaries.mockReturnValue([
          { traceId: 'trace-1', unreadAnomalyCount: 1, highestUnreadSeverity: 'warning' },
        ]),
      }, 'warning'],
      ['unread critical', {
        setup: (service: TraceServiceStub) => service.listSummaries.mockReturnValue([
          { traceId: 'trace-1', unreadAnomalyCount: 1, highestUnreadSeverity: 'critical' },
        ]),
      }, 'critical'],
      ['unread error', {
        setup: (service: TraceServiceStub) => service.listSummaries.mockReturnValue([
          { traceId: 'trace-1', unreadAnomalyCount: 1, highestUnreadSeverity: 'error' },
        ]),
      }, 'critical'],
      ['no unread anomaly', {}, 'normal'],
    ] as const)(`returns %s`, (_label, options, expected) => {
      const { setup, ...harnessOptions } = options;
      const harness = createHarness(harnessOptions);
      setup?.(harness.service);
      expect(harness.coordinator.getOpenCodeDiagnosticsState()).toBe(expected);
    });

    it.each([
      ['settings', (harness: Harness, canary: Error) => {
        harness.host.getOpenCodeSessionTraceSettings = () => { throw canary; };
      }],
      ['service', (harness: Harness, canary: Error) => {
        harness.host.getOpenCodeTraceService = () => { throw canary; };
      }],
      ['store status', (harness: Harness, canary: Error) => {
        harness.service.getStatus.mockImplementation(() => { throw canary; });
      }],
      ['active tab', (harness: Harness, canary: Error) => {
        harness.host.getActiveTabId = () => { throw canary; };
      }],
      ['capture', (harness: Harness, canary: Error) => {
        harness.service.getCaptureState.mockImplementation(() => { throw canary; });
      }],
      ['session', (harness: Harness, canary: Error) => {
        harness.host.getSessionIdForTab = () => { throw canary; };
      }],
      ['trace resolve', (harness: Harness, canary: Error) => {
        harness.service.resolveTraceId.mockImplementation(() => { throw canary; });
      }],
      ['summary list', (harness: Harness, canary: Error) => {
        harness.service.listSummaries.mockImplementation(() => { throw canary; });
      }],
    ])('returns degraded when the %s dependency throws without logging canaries', (_label, configure) => {
      const canary = new Error('sk-open-code-canary /vault/private-path');
      const harness = createHarness();
      configure(harness, canary);

      expect(harness.coordinator.getOpenCodeDiagnosticsState()).toBe('degraded');
      expectCanariesNotLogged();
    });
});

describe('ChatDiagnosticsCoordinator healthy operations', () => {
  it('uses exact menu labels and preserves arm/cancel/copy action order', async () => {
    const harness = createHarness();
    harness.coordinator.showOpenCodeDiagnostics({} as MouseEvent);
    expect(harness.menu.items.map((item) => item.title)).toEqual([
      t('chat.opencodeDiagnostics.captureNext'),
      t('chat.opencodeDiagnostics.copySession'),
    ]);

    harness.events.length = 0;
    await getMenuAction(harness.menu, t('chat.opencodeDiagnostics.captureNext'))();
    expect(harness.events).toEqual([
      'arm',
      'refresh',
      `notice:${t('chat.opencodeDiagnostics.captureArmed')}`,
    ]);

    harness.events.length = 0;
    await getMenuAction(harness.menu, t('chat.opencodeDiagnostics.copySession'))();
    expect(harness.events).toEqual([
      'resolve',
      'prompt',
      'report',
      'clipboard',
      'refresh',
      `notice:${t('chat.opencodeDiagnostics.copySuccess')}`,
    ]);

    harness.service.getCaptureState.mockReturnValue('armed');
    harness.coordinator.showOpenCodeDiagnostics({} as MouseEvent);
    expect(harness.menu.items.slice(-2).map((item) => item.title)).toEqual([
      t('chat.opencodeDiagnostics.cancelCapture'),
      t('chat.opencodeDiagnostics.copySession'),
    ]);
    harness.events.length = 0;
    await getMenuAction(harness.menu, t('chat.opencodeDiagnostics.cancelCapture'))();
    expect(harness.events).toEqual(['cancel', 'refresh']);
  });

  it('preserves disabled-but-healthy menu, claim, and cancel behavior', async () => {
    const harness = createHarness({ enabled: false });
    harness.coordinator.showOpenCodeDiagnostics({} as MouseEvent);
    expect(harness.menu.items.map((item) => item.title)).toEqual([
      t('chat.opencodeDiagnostics.captureNext'),
      t('chat.opencodeDiagnostics.copySession'),
    ]);
    expect(harness.menu.showAtMouseEvent).toHaveBeenCalledWith({});

    harness.events.length = 0;
    await getMenuAction(harness.menu, t('chat.opencodeDiagnostics.captureNext'))();
    expect(harness.events).toEqual([
      'arm',
      'refresh',
      `notice:${t('chat.opencodeDiagnostics.captureArmed')}`,
    ]);

    const token = harness.coordinator.claimOpenCodeDiagnosticRunToken('tab-1', 'session-1');
    expect(token).toMatchObject({ runId: 'run-1', tabId: 'tab-1' });
    expect(harness.service.claimDeepCapture).toHaveBeenCalledWith('tab-1', 'session-1');

    harness.coordinator.cancelOpenCodeDiagnosticCapture('tab-1');
    expect(harness.service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');
  });

  it('does not create a menu when the service is absent or no tab is active', () => {
    for (const options of [{ service: null }, { activeTabId: null }]) {
      const harness = createHarness(options);
      expect(() => harness.coordinator.showOpenCodeDiagnostics({} as MouseEvent)).not.toThrow();
      expect(harness.menu.items).toHaveLength(0);
      expect(harness.menu.showAtMouseEvent).not.toHaveBeenCalled();
    }
  });

  it('claims and cancels for a present OpenCode tab without consulting settings', () => {
    const harness = createHarness();
    const token = harness.coordinator.claimOpenCodeDiagnosticRunToken('tab-1', 'session-1');
    expect(token).toMatchObject({ runId: 'run-1', tabId: 'tab-1' });
    expect(harness.service.claimDeepCapture).toHaveBeenCalledWith('tab-1', 'session-1');
    harness.coordinator.cancelOpenCodeDiagnosticCapture('tab-1');
    expect(harness.service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');

    const unavailable = createHarness({ service: null });
    expect(unavailable.coordinator.claimOpenCodeDiagnosticRunToken('tab-1', 'session-1')).toBeUndefined();
    expect(() => unavailable.coordinator.cancelOpenCodeDiagnosticCapture('tab-1')).not.toThrow();

    const noTab = createHarness();
    expect(noTab.coordinator.claimOpenCodeDiagnosticRunToken(null, 'session-1')).toBeUndefined();
    noTab.coordinator.cancelOpenCodeDiagnosticCapture(null);
    expect(noTab.service.claimDeepCapture).not.toHaveBeenCalled();
    expect(noTab.service.cancelDeepCapture).not.toHaveBeenCalled();
  });

});

describe('ChatDiagnosticsCoordinator fail-closed boundary', () => {
  it('fails closed when menu construction dependencies throw without logging canaries', () => {
    const canary = new Error('sk-open-code-canary /vault/private-path');
    const dependencyFailures: Array<(harness: Harness) => void> = [
      (harness) => { harness.host.getOpenCodeTraceService = () => { throw canary; }; },
      (harness) => { harness.host.getSessionIdForTab = () => { throw canary; }; },
      (harness) => { harness.host.createMenu = () => { throw canary; }; },
      (harness) => { harness.service.getCaptureState.mockImplementation(() => { throw canary; }); },
    ];

    for (const configure of dependencyFailures) {
      const harness = createHarness();
      configure(harness);
      expect(() => harness.coordinator.showOpenCodeDiagnostics({} as MouseEvent)).not.toThrow();
      expect(harness.menu.items).toHaveLength(0);
      expect(harness.menu.showAtMouseEvent).not.toHaveBeenCalled();
    }
    expectCanariesNotLogged();
  });

  it('stops arm and cancel callbacks at the failed service step without logging canaries', async () => {
    const canary = new Error('sk-open-code-canary /vault/private-path');
    const arm = createHarness();
    arm.service.armDeepCapture.mockImplementation(() => {
      arm.events.push('arm');
      throw canary;
    });
    arm.coordinator.showOpenCodeDiagnostics({} as MouseEvent);
    await getMenuAction(arm.menu, t('chat.opencodeDiagnostics.captureNext'))();
    expect(arm.events).toEqual(['arm']);

    const cancel = createHarness();
    cancel.service.getCaptureState.mockReturnValue('armed');
    cancel.service.cancelDeepCapture.mockImplementation(() => {
      cancel.events.push('cancel');
      throw canary;
    });
    cancel.coordinator.showOpenCodeDiagnostics({} as MouseEvent);
    await getMenuAction(cancel.menu, t('chat.opencodeDiagnostics.cancelCapture'))();
    expect(cancel.events).toEqual(['cancel']);
    expectCanariesNotLogged();
  });

  it.each([
    ['resolve', (harness: Harness, canary: Error) => {
      harness.service.resolveTraceId.mockImplementation(() => {
        harness.events.push('resolve');
        throw canary;
      });
    }, ['resolve']],
    ['prompt', (harness: Harness, canary: Error) => {
      harness.host.promptDiagnosticsUserContext = async () => {
        harness.events.push('prompt');
        throw canary;
      };
    }, ['resolve', 'prompt']],
    ['report', (harness: Harness, canary: Error) => {
      harness.service.buildSmartReport.mockImplementation(async () => {
        harness.events.push('report');
        throw canary;
      });
    }, ['resolve', 'prompt', 'report']],
    ['clipboard', (harness: Harness, canary: Error) => {
      harness.host.writeTextToClipboard = async () => {
        harness.events.push('clipboard');
        throw canary;
      };
    }, ['resolve', 'prompt', 'report', 'clipboard']],
    ['refresh', (harness: Harness, canary: Error) => {
      harness.host.refreshHeaderChrome = () => {
        harness.events.push('refresh');
        throw canary;
      };
    }, ['resolve', 'prompt', 'report', 'clipboard', 'refresh']],
    ['notice', (harness: Harness, canary: Error) => {
      harness.host.showNotice = (message) => {
        harness.events.push(`notice:${message}`);
        throw canary;
      };
    }, [
      'resolve',
      'prompt',
      'report',
      'clipboard',
      'refresh',
      `notice:${t('chat.opencodeDiagnostics.copySuccess')}`,
    ]],
  ])('stops copy callback after a failed %s step without logging canaries', async (_label, configure, expectedEvents) => {
    const canary = new Error('sk-open-code-canary /vault/private-path');
    const harness = createHarness();
    configure(harness, canary);
    harness.coordinator.showOpenCodeDiagnostics({} as MouseEvent);
    await expect(getMenuAction(harness.menu, t('chat.opencodeDiagnostics.copySession'))()).resolves.toBeUndefined();
    expect(harness.events).toEqual(expectedEvents);
    expectCanariesNotLogged();
  });

  it('absorbs claim and cancel failures without logging canaries', () => {
    const canary = new Error('sk-open-code-canary /vault/private-path');
    const harness = createHarness();
    harness.service.claimDeepCapture.mockImplementation(() => { throw canary; });
    harness.service.cancelDeepCapture.mockImplementation(() => { throw canary; });

    expect(harness.coordinator.claimOpenCodeDiagnosticRunToken('tab-1', 'session-1')).toBeUndefined();
    expect(() => harness.coordinator.cancelOpenCodeDiagnosticCapture('tab-1')).not.toThrow();
    expectCanariesNotLogged();
  });
});
