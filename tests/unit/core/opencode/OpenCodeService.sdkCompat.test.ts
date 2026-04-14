import { TextDecoder, TextEncoder } from 'util';

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

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

const { createSdkClient: mockCreateSdkClient } = jest.requireMock('../../../../src/core/opencode/createSdkClient') as {
  createSdkClient: jest.Mock;
};

describe('OpenCodeService SDK compatibility', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes MCP, tool catalog, session, part, and provider oauth wrappers', async () => {
    const mockSdkClient = createMockSdkClient();
    mockCreateSdkClient.mockReturnValue(mockSdkClient);
    const service = new OpenCodeService(
      DEFAULT_SETTINGS,
      {},
      { sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS },
    );

    await expect(service.refreshToolIds()).resolves.toEqual(['read', 'bash', 'vault_tool']);
    await expect(service.listTools('openai', 'gpt-5')).resolves.toHaveLength(2);
    await expect(service.getMcpStatus()).resolves.toEqual({ exa: { status: 'connected' } });
    await expect(service.addMcpServer('exa', { type: 'remote', url: 'https://example.com/mcp' })).resolves.toEqual({
      exa: { status: 'connected' },
    });
    await expect(service.connectMcpServer('exa')).resolves.toBe(true);
    await expect(service.disconnectMcpServer('exa')).resolves.toBe(true);
    await expect(service.startMcpAuth('exa')).resolves.toEqual({
      authorizationUrl: 'https://example.com/auth',
    });
    await expect(service.completeMcpAuth('exa', 'code-1')).resolves.toEqual({ status: 'connected' });
    await expect(service.authenticateMcp('exa')).resolves.toEqual({ status: 'connected' });
    await expect(service.removeMcpAuth('exa')).resolves.toEqual({ success: true });

    await expect(service.initializeSession('session-1', 'openai', 'gpt-5', 'message-1')).resolves.toBe(true);
    await expect(service.shareSession('session-1')).resolves.toMatchObject({ id: 'session-1' });
    await expect(service.unshareSession('session-1')).resolves.toMatchObject({ id: 'session-1' });
    await expect(service.summarizeSession('session-1', 'openai', 'gpt-5')).resolves.toBe(true);
    await expect(service.getSessionMessage('session-1', 'message-1')).resolves.toMatchObject({
      info: { id: 'message-1' },
    });
    await expect(service.deleteSessionMessage('session-1', 'message-1')).resolves.toBe(true);
    await expect(service.getSessionChildren('session-1')).resolves.toHaveLength(1);
    await expect(service.runSessionCommand('session-1', {
      command: 'test',
      arguments: '--help',
    })).resolves.toMatchObject({ info: { id: 'message-2' } });
    await expect(service.runSessionShell('session-1', {
      agent: 'build',
      command: 'echo hi',
    })).resolves.toMatchObject({ info: { id: 'message-3' } });
    await expect(service.updateMessagePart('session-1', 'message-1', 'part-1', {
      id: 'part-1',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'text',
      text: 'updated',
    } as never)).resolves.toMatchObject({ id: 'part-1' });
    await expect(service.deleteMessagePart('session-1', 'message-1', 'part-1')).resolves.toBe(true);
    await expect(service.getProviderAuthMethods()).resolves.toEqual({ openai: ['oauth'] });
    await expect(service.authorizeProviderOAuth('openai')).resolves.toEqual({
      url: 'https://example.com/provider-auth',
    });
    await expect(service.completeProviderOAuth('openai', 'code-2')).resolves.toEqual({ success: true });
    await expect(service.getPendingPermissions()).resolves.toEqual([
      {
        id: 'permission-1',
        sessionID: 'session-1',
        permission: 'bash',
        patterns: ['npm test'],
        metadata: {},
        always: [],
      },
    ]);
    await expect(service.respondToPermission('permission-1', 'once', 'Allow once')).resolves.toBeUndefined();
    await expect(service.respondToSessionPermission('session-1', 'permission-1', 'always')).resolves.toBeUndefined();
  });

  it('hydrates registry tools as custom and observed external tools as MCP', async () => {
    const mockSdkClient = createMockSdkClient();
    mockCreateSdkClient.mockReturnValue(mockSdkClient);
    const service = new OpenCodeService(DEFAULT_SETTINGS);
    await service.refreshToolIds();
    (service as unknown as { observeRuntimeToolNames: (tools: string[]) => void }).observeRuntimeToolNames(['exa_search']);

    const customMessage = service.hydrateOpenCodeMessage(
      {
        id: 'message-custom',
        role: 'assistant',
        sessionID: 'session-1',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 1 },
      } as never,
      [{
        id: 'part-custom',
        sessionID: 'session-1',
        messageID: 'message-custom',
        type: 'tool',
        callID: 'call-custom',
        tool: 'vault_tool',
        state: {
          status: 'running',
          input: {},
          time: { start: 1 },
        },
      }] as never,
    );
    const mcpMessage = service.hydrateOpenCodeMessage(
      {
        id: 'message-mcp',
        role: 'assistant',
        sessionID: 'session-1',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 1 },
      } as never,
      [{
        id: 'part-mcp',
        sessionID: 'session-1',
        messageID: 'message-mcp',
        type: 'tool',
        callID: 'call-mcp',
        tool: 'exa_search',
        state: {
          status: 'running',
          input: {},
          time: { start: 1 },
        },
      }] as never,
    );

    expect(customMessage.contentBlocks?.[0]).toMatchObject({
      toolKind: 'custom',
      toolSourceKey: 'vault_tool',
    });
    expect(mcpMessage.contentBlocks?.[0]).toMatchObject({
      toolKind: 'mcp',
      toolSourceKey: 'exa_search',
    });
  });

  it('separates cached tool catalogs by scoped directory', async () => {
    const mockSdkClient = createMockSdkClient();
    mockSdkClient.tool.list
      .mockResolvedValueOnce([
        { id: 'vault_tool_a', description: 'Vault A tool', parameters: {} },
      ])
      .mockResolvedValueOnce([
        { id: 'vault_tool_b', description: 'Vault B tool', parameters: {} },
      ]);
    mockCreateSdkClient.mockReturnValue(mockSdkClient);
    const service = new OpenCodeService(DEFAULT_SETTINGS);

    service.setVaultPath('C:\\vault-a');
    await expect(service.listTools('openai', 'gpt-5')).resolves.toMatchObject([
      { id: 'vault_tool_a' },
    ]);

    service.setVaultPath('C:\\vault-b');
    await expect(service.listTools('openai', 'gpt-5')).resolves.toMatchObject([
      { id: 'vault_tool_b' },
    ]);

    expect(mockSdkClient.tool.list).toHaveBeenCalledTimes(2);
  });

  it('forwards SDK events and catalog updates', async () => {
    const mockSdkClient = createMockSdkClient();
    mockCreateSdkClient.mockReturnValue(mockSdkClient);
    const service = new OpenCodeService(DEFAULT_SETTINGS);
    const receivedEvents: string[] = [];
    const catalogSnapshots: string[][] = [];

    const disposeEvents = service.subscribeToOpenCodeEvents((event) => {
      const payload = event.payload as { type?: string; payload?: { type?: string } };
      const type = payload.type ?? payload.payload?.type ?? 'unknown';
      receivedEvents.push(type);
    });
    const disposeCatalog = service.subscribeToCatalogUpdates((snapshot) => {
      catalogSnapshots.push(snapshot.toolCatalog.observedExternalTools);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    disposeEvents();
    disposeCatalog();

    expect(receivedEvents).toContain('message.part.updated');
    expect(receivedEvents).toContain('mcp.tools.changed');
    expect(catalogSnapshots.some((tools) => tools.includes('exa_search'))).toBe(true);
  });
});
