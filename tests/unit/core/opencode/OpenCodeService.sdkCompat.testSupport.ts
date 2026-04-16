import { TextDecoder, TextEncoder } from 'util';

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

export { OpenCodeService };

global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;

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

export const { createSdkClient: mockCreateSdkClient } = jest.requireMock('../../../../src/core/opencode/createSdkClient') as {
  createSdkClient: jest.Mock;
};

const createStream = <TValue>(...values: TValue[]) => ({
  stream: (async function* () {
    for (const value of values) {
      yield value;
    }
  })(),
});

const createMockSdkClient = () => ({
  global: {
    event: jest.fn().mockResolvedValue(createStream({
      payload: {
        type: 'mcp.tools.changed',
        properties: { server: 'exa' },
      },
    })),
    syncEvent: { subscribe: jest.fn().mockResolvedValue(createStream()) },
  },
  event: {
    subscribe: jest.fn().mockResolvedValue(createStream({
      type: 'message.part.updated',
      properties: {
        sessionID: 'session-1',
        time: Date.now(),
        part: {
          id: 'part-tool',
          sessionID: 'session-1',
          messageID: 'message-1',
          type: 'tool',
          callID: 'call-1',
          tool: 'exa_search',
          state: {
            status: 'running',
            input: { query: 'docs' },
            time: { start: Date.now() },
          },
        },
      },
    })),
  },
  tool: {
    ids: jest.fn().mockResolvedValue(['read', 'bash', 'vault_tool']),
    list: jest.fn().mockResolvedValue([
      { id: 'read', description: 'Read file', parameters: {} },
      { id: 'vault_tool', description: 'Vault custom tool', parameters: { type: 'object' } },
    ]),
  },
  mcp: {
    status: jest.fn().mockResolvedValue({
      exa: { status: 'connected' },
    }),
    add: jest.fn().mockResolvedValue({
      exa: { status: 'connected' },
    }),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    auth: {
      start: jest.fn().mockResolvedValue({ authorizationUrl: 'https://example.com/auth' }),
      callback: jest.fn().mockResolvedValue({ status: 'connected' }),
      authenticate: jest.fn().mockResolvedValue({ status: 'connected' }),
      remove: jest.fn().mockResolvedValue({ success: true }),
    },
  },
  session: {
    init: jest.fn().mockResolvedValue(true),
    share: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Shared', time: { created: 1, updated: 1 } }),
    unshare: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Shared', time: { created: 1, updated: 1 } }),
    summarize: jest.fn().mockResolvedValue(true),
    message: jest.fn().mockResolvedValue({ info: { id: 'message-1', role: 'assistant' }, parts: [] }),
    deleteMessage: jest.fn().mockResolvedValue(true),
    children: jest.fn().mockResolvedValue([{ id: 'child-1', title: 'Child', time: { created: 1, updated: 1 } }]),
    command: jest.fn().mockResolvedValue({ info: { id: 'message-2', role: 'assistant' }, parts: [] }),
    shell: jest.fn().mockResolvedValue({ info: { id: 'message-3', role: 'assistant' }, parts: [] }),
  },
  part: {
    update: jest.fn().mockResolvedValue({ id: 'part-1', type: 'text', text: 'updated' }),
    delete: jest.fn().mockResolvedValue(true),
  },
  provider: {
    auth: jest.fn().mockResolvedValue({ openai: ['oauth'] }),
    oauth: {
      authorize: jest.fn().mockResolvedValue({ url: 'https://example.com/provider-auth' }),
      callback: jest.fn().mockResolvedValue({ success: true }),
    },
  },
  project: {
    list: jest.fn().mockResolvedValue([{ id: 'project-1' }]),
    current: jest.fn().mockResolvedValue({ id: 'project-1' }),
    initGit: jest.fn().mockResolvedValue({ success: true }),
    update: jest.fn().mockResolvedValue({ id: 'project-1', name: 'Vault' }),
  },
  file: {
    list: jest.fn().mockResolvedValue([{ path: 'README.md' }]),
    read: jest.fn().mockResolvedValue({ path: 'README.md', content: '# docs' }),
    status: jest.fn().mockResolvedValue({ modified: [] }),
  },
  find: {
    text: jest.fn().mockResolvedValue([{ path: 'README.md' }]),
    files: jest.fn().mockResolvedValue([{ path: 'src/main.ts' }]),
    symbols: jest.fn().mockResolvedValue([{ name: 'OpenCodeService' }]),
  },
  path: {
    get: jest.fn().mockResolvedValue({ cwd: '/vault' }),
  },
  vcs: {
    get: jest.fn().mockResolvedValue({ branch: 'main' }),
    diff: jest.fn().mockResolvedValue({ patch: 'diff --git' }),
  },
  formatter: {
    status: jest.fn().mockResolvedValue({ prettier: 'ready' }),
  },
  lsp: {
    status: jest.fn().mockResolvedValue({ tsserver: 'ready' }),
  },
  permission: {
    list: jest.fn().mockResolvedValue([
      {
        id: 'permission-1',
        sessionID: 'session-1',
        permission: 'bash',
        patterns: ['npm test'],
        metadata: {},
        always: [],
      },
    ]),
    reply: jest.fn().mockResolvedValue(undefined),
    respond: jest.fn().mockResolvedValue(undefined),
  },
  question: {
    list: jest.fn().mockResolvedValue([]),
    reply: jest.fn().mockResolvedValue(undefined),
    reject: jest.fn().mockResolvedValue(undefined),
  },
});

export type MockOpenCodeServiceSdkCompatClient = ReturnType<typeof createMockSdkClient>;

export function createOpenCodeServiceSdkCompatContext(settings = DEFAULT_SETTINGS): {
  service: OpenCodeService;
  mockSdkClient: MockOpenCodeServiceSdkCompatClient;
} {
  const mockSdkClient = createMockSdkClient();

  jest.clearAllMocks();
  mockCreateSdkClient.mockReset();
  mockCreateSdkClient.mockReturnValue(mockSdkClient);

  return {
    service: new OpenCodeService(settings),
    mockSdkClient,
  };
}
