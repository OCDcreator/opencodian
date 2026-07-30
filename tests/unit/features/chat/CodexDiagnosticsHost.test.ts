import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import type { Conversation } from '../../../../src/core/types';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ChatHeaderPresenter, type ChatHeaderPresenterHost } from '../../../../src/features/chat/services/ChatHeaderPresenter';
import {
  createAsyncStream,
  createFinalizationPort,
  createHost,
  createPreparationPort,
  createPreparedSend,
  createStreamController,
  createTabRuntime,
  SendPipelineRuntime,
} from './SendPipelineRuntime.testSupport';

/**
 * Minimal structural fake of `CodexSessionTraceService` exposing only the
 * surface the chat-side host callbacks read. Field names match the real
 * service so the production code paths exercise the same properties.
 */
interface FakeCodexStore {
  getStatus(): { mode: string; lastError: string | null };
  flush(): Promise<void>;
  resolveTraceId(sessionId: string): string | undefined;
  listSummaries(limit: number): Array<{
    traceId: string;
    unreadAnomalyCount: number;
    highestUnreadSeverity?: 'warning' | 'critical' | 'error';
  }>;
}

interface FakeCodexReportBuilder {
  buildSmartReport: jest.Mock;
}

interface FakeCodexTraceService {
  store: FakeCodexStore;
  reportBuilder: FakeCodexReportBuilder;
  getCaptureState: jest.Mock<ReturnType<never>, [string]>;
  armDeepCapture: jest.Mock;
  cancelDeepCapture: jest.Mock;
  claimDeepCapture: jest.Mock;
  flushRingBuffer: jest.Mock;
}

function createFakeCodexTraceService(
  overrides: Partial<FakeCodexTraceService> = {},
): FakeCodexTraceService {
  return {
    store: {
      getStatus: jest.fn().mockReturnValue({ mode: 'disk', lastError: null }),
      flush: jest.fn().mockResolvedValue(undefined),
      resolveTraceId: jest.fn(),
      listSummaries: jest.fn().mockReturnValue([]),
      ...(overrides.store ?? {}),
    },
    reportBuilder: {
      buildSmartReport: jest.fn().mockResolvedValue('codex-report-body'),
      ...(overrides.reportBuilder ?? {}),
    },
    getCaptureState: jest.fn().mockReturnValue('off'),
    armDeepCapture: jest.fn(),
    cancelDeepCapture: jest.fn(),
    claimDeepCapture: jest.fn(),
    flushRingBuffer: jest.fn(),
    ...overrides,
  };
}

function createView(codexTraceService: FakeCodexTraceService): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['codex'],
      activeBackend: 'codex',
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        codex: {
          ...DEFAULT_SETTINGS.backendSettings.codex,
          sessionTrace: {
            ...DEFAULT_SETTINGS.backendSettings.codex.sessionTrace,
            enabled: true,
          },
        },
      },
    },
    codexTraceService,
    openCodeService: {},
    openCodeTraceService: {},
    storage: {},
  } as never);
}

function getChatHeaderHost(view: OpenCodianView): ChatHeaderPresenterHost {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (view as unknown as { createChatHeaderPresenterHost(): ChatHeaderPresenterHost }).createChatHeaderPresenterHost();
}

function setActiveConversation(view: OpenCodianView, conversation: Conversation | null): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (view as unknown as { currentConversation: Conversation | null }).currentConversation = conversation;
}

function setActiveTabId(view: OpenCodianView, tabId: string | null): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(view as unknown as { getActiveTabId(): string | null }, 'getActiveTabId').mockReturnValue(tabId);
}

describe('codex diagnostics host wiring', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('reports capture state from the codex trace service', () => {
    const service = createFakeCodexTraceService({
      getCaptureState: jest.fn().mockReturnValue('armed'),
    });
    const view = createView(service);
    const conversation: Conversation = {
      id: 'conv-1',
      title: 'Codex',
      createdAt: 1,
      updatedAt: 1,
      backend: 'codex',
      backendSessionId: 'thread-1',
      messages: [],
    } as Conversation;
    setActiveConversation(view, conversation);
    setActiveTabId(view, 'tab-1');
    const host = getChatHeaderHost(view);

    const state = host.getCodexDiagnosticsState?.('tab-1');

    expect(state).toBe('armed');
    expect(service.getCaptureState).toHaveBeenCalledWith('tab-1');
  });

  it('claims a codex diagnostic token during send preparation for codex conversations', async () => {
    const token = { runId: 'run-codex', tabId: 'tab-1', armedAt: 1, expiresAt: 2 };
    const preparedSend = createPreparedSend({
      conversation: {
        id: 'conversation-1',
        title: 'Codex',
        createdAt: 1,
        updatedAt: 1,
        backend: 'codex',
        backendSessionId: 'thread-codex',
        messages: [],
      } as Conversation,
    });
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const claimCodex = jest.fn().mockReturnValue(token);
    const host = createHost(runtimeState, streamController, [], {
      claimCodexDiagnosticRunToken: claimCodex,
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(claimCodex).toHaveBeenCalledWith(preparedSend.tabId, 'thread-codex');
    expect(host.sendStreamMessage).toHaveBeenCalledWith(
      preparedSend.conversation,
      'Hello',
      expect.objectContaining({ diagnosticRunToken: token }),
    );
  });

  it('resolves the current conversation trace id via backendSessionId for export', async () => {
    const service = createFakeCodexTraceService({
      store: {
        getStatus: jest.fn().mockReturnValue({ mode: 'disk', lastError: null }),
        flush: jest.fn().mockResolvedValue(undefined),
        resolveTraceId: jest.fn().mockReturnValue('trace-x'),
        listSummaries: jest.fn().mockReturnValue([]),
      },
      reportBuilder: {
        buildSmartReport: jest.fn().mockResolvedValue('codex-session-report'),
      },
    });
    const view = createView(service);
    const conversation: Conversation = {
      id: 'conv-1',
      title: 'Codex',
      createdAt: 1,
      updatedAt: 1,
      backend: 'codex',
      backendSessionId: 'thread-1',
      messages: [],
    } as Conversation;
    setActiveConversation(view, conversation);

    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    window.prompt = jest.fn().mockReturnValue('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exportFn = (view as unknown as {
      exportCodexConversationDiagnostics: (conversation: Conversation) => Promise<void>;
    }).exportCodexConversationDiagnostics;

    await exportFn.call(view, conversation);

    expect(service.flushRingBuffer).toHaveBeenCalledWith('thread-1', 'manual-export');
    expect(service.store.resolveTraceId).toHaveBeenCalledWith('thread-1');
    expect(service.reportBuilder.buildSmartReport).toHaveBeenCalledWith(
      'trace-x',
      expect.objectContaining({ actual: '', expected: '', reproduction: '' }),
      { selection: 'current-session' },
    );
  });
});

// Silence the unused-import when ChatHeaderPresenter is referenced only for types.
void ChatHeaderPresenter;
