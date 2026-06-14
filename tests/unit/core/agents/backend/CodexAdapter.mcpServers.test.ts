import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

const mockListMcpServerStatus = jest.fn();
const mockReloadMcpServers = jest.fn();
const mockMcpServerOauthLogin = jest.fn();
const mockReadMcpServerResource = jest.fn();
const mockMcpServerToolCall = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
    listMcpServerStatus: mockListMcpServerStatus,
    reloadMcpServers: mockReloadMcpServers,
    mcpServerOauthLogin: mockMcpServerOauthLogin,
    readMcpServerResource: mockReadMcpServerResource,
    mcpServerToolCall: mockMcpServerToolCall,
  })),
}));

function createMockCodex() {
  const mockThread = {
    id: 'mock-thread-1',
    runStreamed: jest.fn(),
    run: jest.fn(),
  };

  return {
    startThread: jest.fn().mockReturnValue(mockThread),
    resumeThread: jest.fn().mockReturnValue(mockThread),
    _mockThread: mockThread,
  };
}

beforeEach(() => {
  mockExecFile.mockReset();
  mockListMcpServerStatus.mockReset();
  mockReloadMcpServers.mockReset();
  mockMcpServerOauthLogin.mockReset();
  mockReadMcpServerResource.mockReset();
  mockMcpServerToolCall.mockReset();
  mockAppServerClientStart.mockClear();
});

describe('CodexAdapter MCP server readback — getMcpServerStatus', () => {
  it('returns MCP server statuses from app-server client when available', async () => {
    const mockStatuses = [
      {
        name: 'codex_apps',
        serverInfo: { name: 'codex-connectors-mcp', version: '0.1.0' },
        tools: {},
        resources: [],
        resourceTemplates: [],
        authStatus: 'bearerToken',
      },
      {
        name: 'computer-use',
        serverInfo: { name: 'Computer Use' },
        tools: { click: { name: 'click' } },
        authStatus: 'none',
      },
    ];
    mockListMcpServerStatus.mockResolvedValue(mockStatuses);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getMcpServerStatus();

    expect(result).toEqual(mockStatuses);
    expect(mockListMcpServerStatus).toHaveBeenCalled();
  });

  it('returns null when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.getMcpServerStatus();

    expect(result).toBeNull();
  });

  it('returns null when app-server client fails', async () => {
    mockListMcpServerStatus.mockRejectedValue(new Error('App-server error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getMcpServerStatus();

    expect(result).toBeNull();
  });

  it('returns null when app-server returns empty array', async () => {
    mockListMcpServerStatus.mockResolvedValue([]);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getMcpServerStatus();

    expect(result).toBeNull();
  });
});

describe('CodexAdapter MCP server readback — reloadMcpServers', () => {
  it('reloads MCP servers through app-server client', async () => {
    mockReloadMcpServers.mockResolvedValue(true);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.reloadMcpServers();

    expect(result).toBe(true);
    expect(mockReloadMcpServers).toHaveBeenCalled();
  });

  it('returns false for reload when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.reloadMcpServers();

    expect(result).toBe(false);
  });

  it('returns false for reload when app-server client fails', async () => {
    mockReloadMcpServers.mockRejectedValue(new Error('Reload error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.reloadMcpServers();

    expect(result).toBe(false);
  });
});

describe('CodexAdapter MCP server readback — triggerMcpServerOAuth', () => {
  it('triggers MCP server OAuth through app-server client', async () => {
    mockMcpServerOauthLogin.mockResolvedValue({ outcome: 'completed', browserOpened: true });

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.triggerMcpServerOAuth('test-server');

    expect(result).toEqual({ outcome: 'completed', browserOpened: true });
    expect(mockMcpServerOauthLogin).toHaveBeenCalledWith('test-server', undefined);
  });

  it('passes OAuth options to app-server client', async () => {
    mockMcpServerOauthLogin.mockResolvedValue({ outcome: 'completed', browserOpened: true });

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    await adapter.triggerMcpServerOAuth('test-server', { scopes: ['read'], timeoutSecs: 60 });

    expect(mockMcpServerOauthLogin).toHaveBeenCalledWith('test-server', { scopes: ['read'], timeoutSecs: 60 });
  });

  it('returns null for OAuth when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.triggerMcpServerOAuth('test-server');

    expect(result).toBeNull();
  });

  it('returns failed result when app-server client throws', async () => {
    mockMcpServerOauthLogin.mockRejectedValue(new Error('OAuth error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.triggerMcpServerOAuth('test-server');

    expect(result).toEqual({ outcome: 'failed', browserOpened: false, errorReason: 'OAuth error' });
  });
});

describe('CodexAdapter MCP server readback — readMcpServerResource', () => {
  it('returns resource contents from readMcpServerResource when available', async () => {
    const mockResult = {
      contents: [{ uri: 'docs://guide', mimeType: 'text/plain', text: 'hello' }],
    };
    mockReadMcpServerResource.mockResolvedValue(mockResult);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.readMcpServerResource('docs-server', 'docs://guide');

    expect(mockReadMcpServerResource).toHaveBeenCalledWith('docs-server', 'docs://guide');
    expect(result).toEqual(mockResult);
  });

  it('returns null for readMcpServerResource when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.readMcpServerResource('srv', 'uri://x');

    expect(result).toBeNull();
  });

  it('returns null for readMcpServerResource when app-server client throws', async () => {
    mockReadMcpServerResource.mockRejectedValue(new Error('resource read error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.readMcpServerResource('srv', 'uri://x');

    expect(result).toBeNull();
  });
});

describe('CodexAdapter MCP server readback — retryMcpToolCall', () => {
  it('delegates retryMcpToolCall to app-server client with threadId/server/tool/arguments', async () => {
    const mockResult = {
      content: [{ type: 'text', text: 'secure-data' }],
      isError: false,
    };
    mockMcpServerToolCall.mockResolvedValue(mockResult);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.retryMcpToolCall('thread-1', 'auth_test', 'fetch_secure_data', { query: 'hello' });

    expect(mockMcpServerToolCall).toHaveBeenCalledWith('thread-1', 'auth_test', 'fetch_secure_data', { query: 'hello' });
    expect(result).toEqual(mockResult);
  });

  it('returns null for retryMcpToolCall when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.retryMcpToolCall('thread-1', 'srv', 'tool', {});

    expect(result).toBeNull();
  });

  it('returns null for retryMcpToolCall when app-server client throws', async () => {
    mockMcpServerToolCall.mockRejectedValue(new Error('tool call error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const result = await adapter.retryMcpToolCall('thread-1', 'srv', 'tool', {});

    expect(result).toBeNull();
  });
});
