import type {
  OpenCodeTraceContext,
  OpenCodeTracePort,
} from '../../../../src/core/opencode/diagnostics/types';
import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  type MockOpenCodeServiceSdkClient,
  mockRequestUrl,
  OpenCodeService,
} from './OpenCodeService.testSupport';

let mockSdkClient: MockOpenCodeServiceSdkClient;

const createTracePort = (context: OpenCodeTraceContext): jest.Mocked<OpenCodeTracePort> => ({
  beginBootstrap: jest.fn(),
  bindSession: jest.fn(),
  beginRun: jest.fn(() => context),
  recordIngress: jest.fn(),
  recordNormalized: jest.fn(),
  linkChildSession: jest.fn(),
  finishRun: jest.fn(),
  markAnomaly: jest.fn(),
});

const configureSdkRun = (service: OpenCodeService): void => {
  service.setSessionId('sdk-session');
  mockSdkClient.session.messages.mockResolvedValue([]);
  mockSdkClient.session.promptAsync.mockResolvedValue({});
  mockSdkClient.event.subscribe.mockResolvedValue({
    stream: (async function* () {
      yield {
        type: 'session.idle',
        properties: { sessionID: 'sdk-session' },
      };
    })(),
  });
  mockSdkClient.session.get.mockResolvedValue({
    id: 'sdk-session',
    title: 'SDK',
    time: { created: 1, updated: 1 },
  });
};

const consumeRun = async (
  service: OpenCodeService,
  options: Parameters<OpenCodeService['sendMessage']>[1],
): Promise<unknown[]> => {
  const chunks: unknown[] = [];
  for await (const chunk of service.sendMessage('Hello', options)) {
    chunks.push(chunk);
  }
  return chunks;
};

beforeEach(() => {
  ({ mockSdkClient } = createOpenCodeServiceTestContext());
});

describe('OpenCodeService deep trace SDK snapshot', () => {
  it('captures the authoritative session snapshot before the prompt', async () => {
    const traceContext: OpenCodeTraceContext = {
      traceId: 'trace-snapshot',
      runtimeSegmentId: 'runtime-snapshot',
      runId: 'run-snapshot',
      rootSessionId: 'sdk-session',
      sessionId: 'sdk-session',
      deepCapture: true,
    };
    const tracePort = createTracePort(traceContext);
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
      tracePort,
    });
    configureSdkRun(service);

    await consumeRun(service, {
      sessionId: 'sdk-session',
      diagnosticRunToken: {
        runId: 'run-snapshot',
        tabId: 'tab-snapshot',
        armedAt: 1,
        expiresAt: 2,
      },
    });

    expect(tracePort.recordNormalized).toHaveBeenCalledWith(
      traceContext,
      'capture.session_snapshot',
      { sessionId: 'sdk-session', messages: [] },
    );
    expect(tracePort.recordIngress).not.toHaveBeenCalledWith(
      traceContext,
      'capture.session_snapshot',
      expect.anything(),
    );
    expect(mockSdkClient.session.messages.mock.invocationCallOrder[0]).toBeLessThan(
      mockSdkClient.session.promptAsync.mock.invocationCallOrder[0],
    );
  });

  it('does not perform a pre-send snapshot read for a standard run', async () => {
    const traceContext: OpenCodeTraceContext = {
      traceId: 'trace-standard',
      runtimeSegmentId: 'runtime-standard',
      runId: 'run-standard',
      rootSessionId: 'sdk-session',
      sessionId: 'sdk-session',
    };
    const tracePort = createTracePort(traceContext);
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
      tracePort,
    });
    configureSdkRun(service);

    await consumeRun(service, { sessionId: 'sdk-session' });

    expect(tracePort.recordNormalized).not.toHaveBeenCalledWith(
      traceContext,
      'capture.session_snapshot',
      expect.anything(),
    );
    expect(mockSdkClient.session.promptAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockSdkClient.session.messages.mock.invocationCallOrder[0],
    );
  });

  it('continues the prompt when the snapshot read fails', async () => {
    const traceContext: OpenCodeTraceContext = {
      traceId: 'trace-snapshot-failure',
      runtimeSegmentId: 'runtime-snapshot-failure',
      runId: 'run-snapshot-failure',
      rootSessionId: 'sdk-session',
      sessionId: 'sdk-session',
      deepCapture: true,
    };
    const tracePort = createTracePort(traceContext);
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
      tracePort,
    });
    configureSdkRun(service);
    jest.spyOn(service, 'getSessionMessages')
      .mockRejectedValueOnce(new Error('snapshot unavailable'))
      .mockResolvedValue([]);

    const chunks = await consumeRun(service, {
      sessionId: 'sdk-session',
      diagnosticRunToken: {
        runId: 'run-snapshot-failure',
        tabId: 'tab-snapshot-failure',
        armedAt: 1,
        expiresAt: 2,
      },
    });

    expect(tracePort.markAnomaly).toHaveBeenCalledWith(
      traceContext,
      'capture.session_snapshot_failed',
      'warning',
      expect.objectContaining({ incomplete: true }),
    );
    expect(mockSdkClient.session.promptAsync).toHaveBeenCalledTimes(1);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });
});

describe('OpenCodeService deep trace legacy snapshot', () => {
  it('captures the authoritative session snapshot before the prompt', async () => {
    const traceContext: OpenCodeTraceContext = {
      traceId: 'trace-legacy-snapshot',
      runtimeSegmentId: 'runtime-legacy-snapshot',
      runId: 'run-legacy-snapshot',
      rootSessionId: 'test-session',
      sessionId: 'test-session',
      deepCapture: true,
    };
    const tracePort = createTracePort(traceContext);
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, { tracePort });
    service.setSessionId('test-session');
    mockRequestUrl
      .mockResolvedValueOnce({ status: 200, json: [], text: '[]' })
      .mockResolvedValueOnce({ status: 204, json: {}, text: '' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          cancel: jest.fn(),
          releaseLock: jest.fn(),
        }),
      },
    });

    await consumeRun(service, {
      sessionId: 'test-session',
      diagnosticRunToken: {
        runId: 'run-legacy-snapshot',
        tabId: 'tab-legacy-snapshot',
        armedAt: 1,
        expiresAt: 2,
      },
    });

    expect(tracePort.recordNormalized).toHaveBeenCalledWith(
      traceContext,
      'capture.session_snapshot',
      { sessionId: 'test-session', messages: [] },
    );
    expect(tracePort.recordIngress).not.toHaveBeenCalledWith(
      traceContext,
      'capture.session_snapshot',
      expect.anything(),
    );
    expect(mockRequestUrl).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-session/message',
      method: 'GET',
    }));
    expect(mockRequestUrl).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: 'http://127.0.0.1:4196/session/test-session/prompt_async',
      method: 'POST',
    }));
  });
});
