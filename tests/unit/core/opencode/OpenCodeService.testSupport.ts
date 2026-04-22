import { TextDecoder, TextEncoder } from 'util';

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

export { OpenCodeService };

global.fetch = jest.fn() as unknown as typeof fetch;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn();
  addEventListener = jest.fn();

  constructor() {
    setTimeout(() => {
      this.onerror?.();
    }, 100);
  }
}

global.EventSource = MockEventSource as unknown as typeof EventSource;

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  requestUrl: jest.fn(),
}));

jest.mock('../../../../src/core/opencode/createSdkClient', () => ({
  createSdkClient: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn(), removeListener: jest.fn() },
    stderr: { on: jest.fn(), removeListener: jest.fn() },
    killed: false,
  }),
  spawnSync: jest.fn().mockReturnValue({ status: 0, error: null }),
}));

jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

export const { requestUrl: mockRequestUrl } = jest.requireMock('obsidian') as {
  requestUrl: jest.Mock;
};

export const { createSdkClient: mockCreateSdkClient } = jest.requireMock('../../../../src/core/opencode/createSdkClient') as {
  createSdkClient: jest.Mock;
};

export const REMOTE_CONTEXT_LIMIT_BYTES = 64 * 1024;

function createMockSdkClient() {
  return {
    global: { health: jest.fn(), event: jest.fn() },
    session: {
      create: jest.fn(),
      diff: jest.fn(),
      list: jest.fn(),
      status: jest.fn(),
      messages: jest.fn(),
      todo: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      prompt: jest.fn(),
      promptAsync: jest.fn(),
      abort: jest.fn(),
      get: jest.fn(),
      fork: jest.fn(),
      revert: jest.fn(),
      unrevert: jest.fn(),
    },
    config: { providers: jest.fn(), get: jest.fn(), update: jest.fn() },
    provider: { list: jest.fn() },
    permission: { list: jest.fn(), reply: jest.fn() },
    question: { list: jest.fn(), reply: jest.fn(), reject: jest.fn() },
    event: { subscribe: jest.fn() },
  };
}

export type MockOpenCodeServiceSdkClient = ReturnType<typeof createMockSdkClient>;

export function createOpenCodeServiceTestContext(settings = DEFAULT_SETTINGS): {
  service: OpenCodeService;
  mockSdkClient: MockOpenCodeServiceSdkClient;
} {
  const mockSdkClient = createMockSdkClient();

  (global.fetch as jest.Mock).mockReset();
  mockRequestUrl.mockReset();
  mockCreateSdkClient.mockReset();
  mockCreateSdkClient.mockReturnValue(mockSdkClient);

  return {
    service: new OpenCodeService(settings),
    mockSdkClient,
  };
}
