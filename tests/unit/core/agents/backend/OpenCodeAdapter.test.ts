import { describe, expect, it, jest } from '@jest/globals';

import { AgentCapability, OPENCODE_FULL_CAPABILITIES } from '../../../../../src/core/agents/AgentCapability';
import { OpenCodeAdapter } from '../../../../../src/core/agents/backend/OpenCodeAdapter';

// ---------------------------------------------------------------------------
// Mock OpenCodeService
// ---------------------------------------------------------------------------

function createMockOpenCodeService() {
  return {
    getServerStatus: jest.fn(() => 'running'),
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    dispose: jest.fn(),
    createSession: jest.fn(() => Promise.resolve('session-1')),
    deleteSession: jest.fn(() => Promise.resolve()),
    updateSessionTitle: jest.fn(() => Promise.resolve()),
    sendMessage: jest.fn(async function* () {
      yield { type: 'text', content: 'hello' };
    }),
    cancelStream: jest.fn(),
    forkSession: jest.fn(() => Promise.resolve({ id: 'fork-1', title: 'Forked' })),
    revertSession: jest.fn(() => Promise.resolve(true)),
    unrevertSession: jest.fn(() => Promise.resolve(true)),
    getSessionRevertState: jest.fn(() => Promise.resolve(null)),
    getSessionDiff: jest.fn(() => Promise.resolve([])),
    getSessionChildren: jest.fn(() => Promise.resolve([])),
    getSessionTodos: jest.fn(() => Promise.resolve([])),
    subscribeToSessionTodoUpdates: jest.fn(() => jest.fn()),
    getPendingQuestions: jest.fn(() => Promise.resolve([])),
    replyToQuestion: jest.fn(() => Promise.resolve()),
    rejectQuestion: jest.fn(() => Promise.resolve()),
    getPendingPermissions: jest.fn(() => Promise.resolve([])),
    respondToPermission: jest.fn(() => Promise.resolve()),
    respondToSessionPermission: jest.fn(() => Promise.resolve()),
    getAvailableModels: jest.fn(() => Promise.resolve({})),
    getProviderDirectory: jest.fn(() => Promise.resolve({})),
    getResolvedModelConfig: jest.fn(() => Promise.resolve({})),
    getMcpServerSnapshot: jest.fn(() => ({})),
    getMcpStatus: jest.fn(() => Promise.resolve({})),
    addMcpServer: jest.fn(() => Promise.resolve({})),
    connectMcpServer: jest.fn(() => Promise.resolve(true)),
    disconnectMcpServer: jest.fn(() => Promise.resolve(true)),
    refreshMcpServerStatus: jest.fn(() => Promise.resolve({})),
    removeMcpAuth: jest.fn(() => Promise.resolve({ success: true })),
    authenticateMcp: jest.fn(() => Promise.resolve({})),
    subscribeToCatalogUpdates: jest.fn(() => jest.fn()),
    getSettingsSnapshot: jest.fn(() => ({})),
    updateSettings: jest.fn(() => Promise.resolve()),
    setVaultPath: jest.fn(),
    reapplyCompactionConfigFromProjectConfig: jest.fn(() => Promise.resolve({})),
    listTools: jest.fn(() => Promise.resolve([])),
    getToolCatalogSnapshot: jest.fn(() => ({})),
    getCapabilitySnapshot: jest.fn(() => ({})),
    refreshToolIds: jest.fn(() => Promise.resolve([])),
    getProviderAuthMethods: jest.fn(() => Promise.resolve({})),
    authorizeProviderOAuth: jest.fn(() => Promise.resolve({})),
    completeProviderOAuth: jest.fn(() => Promise.resolve({})),
  } as unknown as import('../../../../../src/core/opencode/OpenCodeService').OpenCodeService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenCodeAdapter', () => {
  it('declares kind as opencode', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    expect(adapter.kind).toBe('opencode');
  });

  it('has display name and description', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    expect(adapter.displayName).toBe('OpenCode');
    expect(adapter.description).toBeTruthy();
  });

  it('has full OpenCode capabilities', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    expect(adapter.capabilities).toEqual(OPENCODE_FULL_CAPABILITIES);
  });

  it('hasCapability returns true for all known capabilities', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    for (const cap of Object.values(AgentCapability)) {
      expect(adapter.hasCapability(cap)).toBe(true);
    }
  });

  it('delegates start() to OpenCodeService', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    await adapter.start();
    expect(service.start).toHaveBeenCalled();
  });

  it('delegates stop() to OpenCodeService', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    await adapter.stop();
    expect(service.stop).toHaveBeenCalled();
  });

  it('delegates createSession to OpenCodeService', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    const sessionId = await adapter.createSession('New chat', { setCurrent: false });
    expect(service.createSession).toHaveBeenCalledWith('New chat', { setCurrent: false });
    expect(sessionId).toBe('session-1');
  });

  it('delegates deleteSession to OpenCodeService', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    await adapter.deleteSession('session-1');
    expect(service.deleteSession).toHaveBeenCalledWith('session-1');
  });

  it('delegates updateSessionTitle to OpenCodeService', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    await adapter.updateSessionTitle('session-1', 'Renamed');
    expect(service.updateSessionTitle).toHaveBeenCalledWith('session-1', 'Renamed');
  });

  it('delegates sendMessage to OpenCodeService with a backend-neutral request object', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      sessionId: 'session-1',
      content: 'hello',
      options: { model: 'model-a' },
    })) {
      chunks.push(chunk);
    }
    expect(service.sendMessage).toHaveBeenCalledWith('hello', {
      sessionId: 'session-1',
      model: 'model-a',
    });
    expect(chunks).toEqual([{ type: 'text', content: 'hello' }]);
  });

  it('delegates cancelStream to OpenCodeService', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    adapter.cancelStream('session-1');
    expect(service.cancelStream).toHaveBeenCalledWith('session-1');
  });

  it('dispose clears adapter state without disposing underlying service', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    const handler = jest.fn();
    adapter.onStatusChange(handler);
    adapter.dispose();
    // Adapter clears its own state
    expect(handler).not.toHaveBeenCalled(); // handlers cleared
    // But does NOT dispose the underlying service (that's onunload's job)
    expect(service.dispose).not.toHaveBeenCalled();
  });

  it('exposes underlying OpenCodeService', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    expect(adapter.underlying).toBe(service);
  });

  it('maps server status to connection status', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);

    (service.getServerStatus as jest.Mock).mockReturnValue('running');
    expect(adapter.status).toBe('connected');

    (service.getServerStatus as jest.Mock).mockReturnValue('stopped');
    expect(adapter.status).toBe('disconnected');

    (service.getServerStatus as jest.Mock).mockReturnValue('starting');
    expect(adapter.status).toBe('connecting');

    (service.getServerStatus as jest.Mock).mockReturnValue('error');
    expect(adapter.status).toBe('error');
  });

  // -- Branching capability ---------------------------------------------------

  it('delegates forkSession', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    const result = await adapter.forkSession('session-1', 'msg-1');
    expect(service.forkSession).toHaveBeenCalledWith('session-1', 'msg-1');
    expect(result).toEqual({ id: 'fork-1', title: 'Forked' });
  });

  it('delegates revertSession', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    await adapter.revertSession('session-1', 'msg-1');
    expect(service.revertSession).toHaveBeenCalledWith('session-1', 'msg-1', undefined);
  });

  it('delegates unrevertSession', async () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    await adapter.unrevertSession('session-1');
    expect(service.unrevertSession).toHaveBeenCalledWith('session-1');
  });

  // -- Info -------------------------------------------------------------------

  it('getInfo returns complete AgentServiceInfo', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    const info = adapter.getInfo();
    expect(info.kind).toBe('opencode');
    expect(info.displayName).toBe('OpenCode');
    expect(info.capabilities).toEqual(OPENCODE_FULL_CAPABILITIES);
    expect(info.status).toBe('connected');
  });

  // -- Status change notifications --------------------------------------------

  it('onStatusChange returns disposable', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    const handler = jest.fn();
    const sub = adapter.onStatusChange(handler);
    expect(sub).toHaveProperty('dispose');
    expect(typeof sub.dispose).toBe('function');
  });

  it('notifyStatusChange calls registered handlers', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    const handler = jest.fn();
    adapter.onStatusChange(handler);
    adapter.notifyStatusChange('running');
    expect(handler).toHaveBeenCalledWith('connected');
  });

  it('stops calling disposed handlers', () => {
    const adapter = new OpenCodeAdapter(createMockOpenCodeService());
    const handler = jest.fn();
    const sub = adapter.onStatusChange(handler);
    sub.dispose();
    adapter.notifyStatusChange('running');
    expect(handler).not.toHaveBeenCalled();
  });

  // -- MCP capability ---------------------------------------------------------

  it('delegates getMcpServerSnapshot', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    adapter.getMcpServerSnapshot();
    expect(service.getMcpServerSnapshot).toHaveBeenCalled();
  });

  // -- Config capability ------------------------------------------------------

  it('delegates setVaultPath', () => {
    const service = createMockOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    adapter.setVaultPath('/vault');
    expect(service.setVaultPath).toHaveBeenCalledWith('/vault');
  });
});
