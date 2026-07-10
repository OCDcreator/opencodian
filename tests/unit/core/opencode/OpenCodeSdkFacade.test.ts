jest.mock('../../../../src/core/opencode/createSdkClient', () => ({
  createSdkClient: jest.fn(),
}));

import { getAttachedOpenCodeAppAgents } from '../../../../src/core/opencode/OpenCodeAppCatalogSidecar';
import {
  describeSdkError,
  extractSdkErrorMessage,
  OpenCodeSdkFacade,
  SDK_FACADE_NAMESPACE_NAMES,
} from '../../../../src/core/opencode/OpenCodeSdkFacade';

describe('OpenCodeSdkFacade', () => {
  const createFacade = (clientOverrides: Record<string, unknown> = {}) => {
    const client = {
      app: {
        agents: jest.fn().mockResolvedValue({ data: ['agent'] }),
        skills: jest.fn().mockResolvedValue({ data: [{ name: 'review', location: '/vault/.opencode/skills/review' }] }),
      },
      auth: { set: jest.fn().mockResolvedValue(true) },
      command: { list: jest.fn().mockResolvedValue(['command']) },
      config: { get: jest.fn().mockResolvedValue({ data: { model: 'x' } }) },
      event: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
      experimental: { resource: { list: jest.fn().mockResolvedValue({ data: {} }) }, capabilities: { get: jest.fn().mockResolvedValue({ data: {} }) } },
      file: { list: jest.fn().mockResolvedValue([]) },
      find: { text: jest.fn().mockResolvedValue([]) },
      formatter: { status: jest.fn().mockResolvedValue([]) },
      global: {
        event: jest.fn().mockResolvedValue({ stream: (async function* () {})() }),
      },
      instance: { dispose: jest.fn().mockResolvedValue(true) },
      lsp: { status: jest.fn().mockResolvedValue([]) },
      mcp: {
        status: jest.fn().mockResolvedValue({ data: { exa: { status: 'connected' } } }),
        auth: { start: jest.fn().mockResolvedValue({ data: { authorizationUrl: 'https://example.com' } }) },
      },
      part: { update: jest.fn().mockResolvedValue({ id: 'part-1' }) },
      path: { get: jest.fn().mockResolvedValue({ home: '/tmp' }) },
      permission: { list: jest.fn().mockResolvedValue([]) },
      project: { list: jest.fn().mockResolvedValue([]), directories: jest.fn().mockResolvedValue({ data: [] }) },
      provider: { oauth: { authorize: jest.fn().mockResolvedValue({ data: { url: 'https://example.com' } }) } },
      pty: { list: jest.fn().mockResolvedValue([]) },
      question: { list: jest.fn().mockResolvedValue([]) },
      session: { list: jest.fn().mockResolvedValue([]) },
      tool: { ids: jest.fn().mockResolvedValue({ data: ['read', 'vault_tool'] }) },
      tui: { publish: jest.fn().mockResolvedValue(true) },
      vcs: { get: jest.fn().mockResolvedValue({ branch: 'main' }) },
      worktree: { list: jest.fn().mockResolvedValue([]) },
      v2: {
        health: { get: jest.fn().mockResolvedValue({ data: { status: 'ok' } }) },
        location: { get: jest.fn().mockResolvedValue({ data: { id: 'loc-1' } }) },
        agent: { list: jest.fn().mockResolvedValue({ data: [{ name: 'build' }] }) },
        session: {
          list: jest.fn().mockResolvedValue({ data: [{ id: 's1' }] }),
          active: jest.fn().mockResolvedValue({ data: { id: 's1' } }),
          get: jest.fn().mockResolvedValue({ data: { id: 's1' } }),
          message: jest.fn().mockResolvedValue({ data: { id: 'm1' } }),
          history: jest.fn().mockResolvedValue({ data: [] }),
          events: jest.fn().mockResolvedValue({ data: [] }),
          create: jest.fn().mockResolvedValue({ data: { id: 's2' } }),
          interrupt: jest.fn().mockResolvedValue({ data: { id: 's1' } }),
          switchAgent: jest.fn().mockResolvedValue({ data: { id: 's1' } }),
          switchModel: jest.fn().mockResolvedValue({ data: { id: 's1' } }),
        },
        model: { list: jest.fn().mockResolvedValue({ data: [{ id: 'm1' }] }) },
        provider: {
          list: jest.fn().mockResolvedValue({ data: [{ id: 'openai' }] }),
          get: jest.fn().mockResolvedValue({ data: { id: 'openai' } }),
        },
        integration: {
          list: jest.fn().mockResolvedValue({ data: [] }),
          get: jest.fn().mockResolvedValue({ data: { id: 'github' } }),
          attempt: { status: jest.fn().mockResolvedValue({ data: { id: 'a1' } }) },
          connect: { key: jest.fn().mockResolvedValue({ data: true }), oauth: jest.fn().mockResolvedValue({ data: true }) },
        },
        credential: {
          remove: jest.fn().mockResolvedValue({ data: true }),
          update: jest.fn().mockResolvedValue({ data: true }),
        },
        permission: {
          request: { list: jest.fn().mockResolvedValue({ data: [] }) },
          saved: { list: jest.fn().mockResolvedValue({ data: [] }), remove: jest.fn().mockResolvedValue({ data: true }) },
        },
        fs: {
          list: jest.fn().mockResolvedValue({ data: [] }),
          read: jest.fn().mockResolvedValue({ data: { path: '/x' } }),
          find: jest.fn().mockResolvedValue({ data: [] }),
        },
        command: { list: jest.fn().mockResolvedValue({ data: [] }) },
        skill: { list: jest.fn().mockResolvedValue({ data: [] }) },
        event: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
        pty: {
          list: jest.fn().mockResolvedValue({ data: [] }),
          get: jest.fn().mockResolvedValue({ data: { id: 'p1' } }),
          create: jest.fn().mockResolvedValue({ data: { id: 'p1' } }),
          remove: jest.fn().mockResolvedValue({ data: true }),
          update: jest.fn().mockResolvedValue({ data: true }),
          connect: jest.fn().mockResolvedValue({ data: {} }),
          connectToken: jest.fn().mockResolvedValue({ data: { token: 't' } }),
        },
        question: { request: { list: jest.fn().mockResolvedValue({ data: [] }) } },
        reference: { list: jest.fn().mockResolvedValue({ data: [] }) },
        projectCopy: {
          create: jest.fn().mockResolvedValue({ data: { id: 'pc1' } }),
          refresh: jest.fn().mockResolvedValue({ data: { id: 'pc1' } }),
          remove: jest.fn().mockResolvedValue({ data: true }),
        },
      },
      ...clientOverrides,
    };

    return {
      client,
      facade: new OpenCodeSdkFacade(
        () => ({ baseUrl: 'http://127.0.0.1:4096' }),
        () => client as never,
      ),
    };
  };

  it('exposes all expected SDK namespaces', () => {
    const { facade } = createFacade();
    expect(SDK_FACADE_NAMESPACE_NAMES.every((name) => name in facade)).toBe(true);
  });

  it('unwraps { data } responses for top-level namespaces', async () => {
    const { facade } = createFacade();
    await expect(facade.tool.ids()).resolves.toEqual(['read', 'vault_tool']);
  });

  it('unwraps nested namespace responses', async () => {
    const { facade } = createFacade();
    await expect(facade.mcp.auth.start({ name: 'exa' })).resolves.toEqual({
      authorizationUrl: 'https://example.com',
    });
    await expect(facade.provider.oauth.authorize({ providerID: 'openai' })).resolves.toEqual({
      url: 'https://example.com',
    });
    await expect(facade.global.event()).resolves.toEqual({
      stream: expect.any(Object),
    });
  });

  it('attaches app agents to app skills results for shared app catalog consumers', async () => {
    const { client, facade } = createFacade();

    const skills = await facade.app.skills();

    expect(skills).toEqual([{ name: 'review', location: '/vault/.opencode/skills/review' }]);
    expect(client.app.skills).toHaveBeenCalledTimes(1);
    await expect(getAttachedOpenCodeAppAgents(skills)).resolves.toEqual(['agent']);
    expect(client.app.agents).toHaveBeenCalledTimes(1);
  });

  it('normalizes non-Error failures', async () => {
    const { facade } = createFacade({
      tool: {
        ids: jest.fn().mockRejectedValue({ data: { message: 'boom', statusCode: 500 } }),
      },
    });

    await expect(facade.tool.ids()).rejects.toThrow('boom');
  });

  it('exports shared structured error helpers for service follow-up paths', () => {
    expect(extractSdkErrorMessage({
      message: 'fallback',
      name: 'APIError',
      data: {
        message: ' Incorrect API key provided. ',
        statusCode: 401,
      },
      status: 503,
    }, {
      fallbackMessage: null,
      includeName: true,
      includeTopLevelError: false,
      includeTopLevelStatus: false,
      trimMessage: true,
    })).toBe('Incorrect API key provided. (HTTP 401)');
    expect(describeSdkError({ message: 'Service unavailable', status: 503 })).toBe('Service unavailable (HTTP 503)');
  });

  // ---------------------------------------------------------------------------
  // SDK 1.17.18 capability inventory coverage.
  // These paths come from docs/status/opencode-sdk-1.17.18-capability-inventory.md.
  // Each v2 subnamespace path must resolve through the facade proxy or throw a
  // normalized error — never a raw TypeError from an undefined property access.
  // ---------------------------------------------------------------------------
  const inventoryReadPaths: ReadonlyArray<readonly string[]> = [
    ['v2', 'health', 'get'],
    ['v2', 'location', 'get'],
    ['v2', 'agent', 'list'],
    ['v2', 'session', 'active'],
    ['v2', 'session', 'get'],
    ['v2', 'session', 'message'],
    ['v2', 'session', 'history'],
    ['v2', 'session', 'events'],
    ['v2', 'model', 'list'],
    ['v2', 'provider', 'list'],
    ['v2', 'provider', 'get'],
    ['v2', 'integration', 'list'],
    ['v2', 'integration', 'get'],
    ['v2', 'integration', 'attempt', 'status'],
    ['v2', 'permission', 'request', 'list'],
    ['v2', 'permission', 'saved', 'list'],
    ['v2', 'fs', 'list'],
    ['v2', 'fs', 'read'],
    ['v2', 'fs', 'find'],
    ['v2', 'command', 'list'],
    ['v2', 'skill', 'list'],
    ['v2', 'event', 'subscribe'],
    ['v2', 'pty', 'list'],
    ['v2', 'pty', 'get'],
    ['v2', 'question', 'request', 'list'],
    ['v2', 'reference', 'list'],
    ['experimental', 'capabilities', 'get'],
    ['project', 'directories'],
  ];

  it.each(inventoryReadPaths.map((path) => [path]))(
    'resolves inventory read path %s through the v2 facade proxy',
    async (path: readonly string[]) => {
      const { facade } = createFacade();
      let cursor: unknown = facade;
      for (const segment of path.slice(0, -1)) {
        cursor = (cursor as Record<string, unknown>)[segment];
        expect(cursor).toBeDefined();
      }
      const method = (cursor as Record<string, unknown>)[path[path.length - 1]];
      expect(typeof method).toBe('function');
      // Invocation must resolve (mocks are in place) — proving no raw TypeError.
      await expect((method as (...args: unknown[]) => Promise<unknown>)()).resolves.toBeDefined();
    },
  );

  it('throws a normalized error (not raw TypeError) when an inventory path is absent', async () => {
    const { facade } = createFacade({
      v2: {
        health: { get: jest.fn() },
        location: {},
        agent: {},
        session: {},
        model: {},
        provider: {},
        integration: {},
        credential: {},
        permission: {},
        fs: {},
        command: {},
        skill: {},
        event: {},
        pty: {},
        question: {},
        reference: {},
        projectCopy: {},
      },
    });
    // v2.location.get is now missing — invoking it must throw a clean Error.
    await expect(facade.v2.location.get()).rejects.toThrow(/unavailable/i);
  });
});
