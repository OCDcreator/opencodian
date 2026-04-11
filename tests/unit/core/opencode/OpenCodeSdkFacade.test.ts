jest.mock('../../../../src/core/opencode/createSdkClient', () => ({
  createSdkClient: jest.fn(),
}));

import {
  OpenCodeSdkFacade,
  SDK_FACADE_NAMESPACE_NAMES,
} from '../../../../src/core/opencode/OpenCodeSdkFacade';

describe('OpenCodeSdkFacade', () => {
  const createFacade = (clientOverrides: Record<string, unknown> = {}) => {
    const client = {
      app: { agents: jest.fn().mockResolvedValue({ data: ['agent'] }) },
      auth: { set: jest.fn().mockResolvedValue(true) },
      command: { list: jest.fn().mockResolvedValue(['command']) },
      config: { get: jest.fn().mockResolvedValue({ data: { model: 'x' } }) },
      event: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
      experimental: { resource: { list: jest.fn().mockResolvedValue({ data: {} }) } },
      file: { list: jest.fn().mockResolvedValue([]) },
      find: { text: jest.fn().mockResolvedValue([]) },
      formatter: { status: jest.fn().mockResolvedValue([]) },
      global: {
        event: jest.fn().mockResolvedValue({ stream: (async function* () {})() }),
        syncEvent: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
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
      project: { list: jest.fn().mockResolvedValue([]) },
      provider: { oauth: { authorize: jest.fn().mockResolvedValue({ data: { url: 'https://example.com' } }) } },
      pty: { list: jest.fn().mockResolvedValue([]) },
      question: { list: jest.fn().mockResolvedValue([]) },
      session: { list: jest.fn().mockResolvedValue([]) },
      tool: { ids: jest.fn().mockResolvedValue({ data: ['read', 'vault_tool'] }) },
      tui: { publish: jest.fn().mockResolvedValue(true) },
      vcs: { get: jest.fn().mockResolvedValue({ branch: 'main' }) },
      worktree: { list: jest.fn().mockResolvedValue([]) },
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
    await expect(facade.global.syncEvent.subscribe()).resolves.toEqual({
      stream: expect.any(Object),
    });
  });

  it('normalizes non-Error failures', async () => {
    const { facade } = createFacade({
      tool: {
        ids: jest.fn().mockRejectedValue({ data: { message: 'boom', statusCode: 500 } }),
      },
    });

    await expect(facade.tool.ids()).rejects.toThrow('boom');
  });
});
