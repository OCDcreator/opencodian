import { OpenCodeCatalogStateStore } from '../../../../src/core/opencode/OpenCodeCatalogStateStore';
import {
  OpenCodeCatalogQueryCoordinator,
  type OpenCodeCatalogQueryCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeCatalogQueryCoordinator';

type MockHost = OpenCodeCatalogQueryCoordinatorHost & {
  shouldUseSdkCrud: jest.Mock<boolean, []>;
  getSdkFacade: jest.MockedFunction<OpenCodeCatalogQueryCoordinatorHost['getSdkFacade']>;
  getLegacy: jest.MockedFunction<OpenCodeCatalogQueryCoordinatorHost['getLegacy']>;
  logServiceWarning: jest.Mock<void, [string, string, unknown]>;
  logServiceError: jest.Mock<void, [string, string, unknown]>;
  getDebugMetadata: jest.Mock<ReturnType<OpenCodeCatalogQueryCoordinatorHost['getDebugMetadata']>, []>;
  getToolCatalogScopeKey: jest.Mock<string, []>;
};

function createHost(
  overrides: Partial<MockHost> = {},
): {
  coordinator: OpenCodeCatalogQueryCoordinator;
  host: MockHost;
  catalogState: OpenCodeCatalogStateStore;
  sdkFacade: ReturnType<MockHost['getSdkFacade']>;
} {
  const sdkFacade = {
    config: {
      providers: jest.fn(),
      get: jest.fn(),
    },
    file: {
      list: jest.fn(),
      read: jest.fn(),
      status: jest.fn(),
    },
    find: {
      text: jest.fn(),
      files: jest.fn(),
      symbols: jest.fn(),
    },
    formatter: {
      status: jest.fn(),
    },
    lsp: {
      status: jest.fn(),
    },
    mcp: {
      status: jest.fn(),
      add: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      auth: {
        start: jest.fn(),
        callback: jest.fn(),
        authenticate: jest.fn(),
        remove: jest.fn(),
      },
    },
    path: {
      get: jest.fn(),
    },
    project: {
      list: jest.fn(),
      current: jest.fn(),
      initGit: jest.fn(),
      update: jest.fn(),
    },
    provider: {
      list: jest.fn(),
      auth: jest.fn(),
      oauth: {
        authorize: jest.fn(),
        callback: jest.fn(),
      },
    },
    tool: {
      ids: jest.fn(),
      list: jest.fn(),
    },
    vcs: {
      get: jest.fn(),
      diff: jest.fn(),
    },
  } as ReturnType<MockHost['getSdkFacade']>;
  const catalogState = new OpenCodeCatalogStateStore({
    syncOpenCodeEventSubscriptions: jest.fn(),
  });

  const host: MockHost = {
    shouldUseSdkCrud: jest.fn(() => true),
    getSdkFacade: jest.fn(() => sdkFacade),
    getLegacy: jest.fn(),
    logServiceWarning: jest.fn(),
    logServiceError: jest.fn(),
    getDebugMetadata: jest.fn(() => ({
      baseUrl: 'http://127.0.0.1:4096',
      vaultPath: '/vault',
      serverStatus: 'running',
      isManagedServerRunning: true,
      managedServerState: null,
    })),
    getToolCatalogScopeKey: jest.fn(() => 'http://127.0.0.1:4096::/vault'),
    ...overrides,
  };

  return {
    coordinator: new OpenCodeCatalogQueryCoordinator(catalogState, host),
    host,
    catalogState,
    sdkFacade,
  };
}

describe('OpenCodeCatalogQueryCoordinator', () => {
  it('keeps MCP status mutations and auth normalization inside the catalog owner', async () => {
    const { coordinator, catalogState, sdkFacade } = createHost();
    const normalizeSpy = jest.spyOn(catalogState, 'normalizeMcpServerStatusMap');
    const updateSpy = jest.spyOn(catalogState, 'updateMcpServerStatus');
    sdkFacade.mcp.status.mockResolvedValue({ exa: { status: 'connected' } });
    sdkFacade.mcp.add.mockResolvedValue({ exa: { status: 'needs_auth' } });
    sdkFacade.mcp.connect.mockResolvedValue(true);
    sdkFacade.mcp.disconnect.mockResolvedValue(true);
    sdkFacade.mcp.auth.start.mockResolvedValue({ authorizationUrl: 'https://example.com/auth' });
    sdkFacade.mcp.auth.callback.mockResolvedValue({ status: 'needs_client_registration', error: 'register client' });
    sdkFacade.mcp.auth.authenticate.mockResolvedValue({ status: 'connected' });
    sdkFacade.mcp.auth.remove.mockResolvedValue({});

    await expect(coordinator.refreshMcpServerStatus()).resolves.toEqual({ exa: { status: 'connected' } });
    await expect(coordinator.addMcpServer('exa', { type: 'remote' })).resolves.toEqual({
      exa: { status: 'needs_auth' },
    });
    await expect(coordinator.connectMcpServer('exa')).resolves.toBe(true);
    await expect(coordinator.disconnectMcpServer('exa')).resolves.toBe(true);
    await expect(coordinator.startMcpAuth('exa')).resolves.toEqual({ authorizationUrl: 'https://example.com/auth' });
    await expect(coordinator.completeMcpAuth('exa', 'code-1')).resolves.toEqual({
      status: 'needs_client_registration',
      error: 'register client',
    });
    await expect(coordinator.authenticateMcp('exa')).resolves.toEqual({ status: 'connected' });
    await expect(coordinator.removeMcpAuth('exa')).resolves.toEqual({ success: true });

    expect(sdkFacade.mcp.add).toHaveBeenCalledWith({ name: 'exa', config: { type: 'remote' } });
    expect(sdkFacade.mcp.connect).toHaveBeenCalledWith({ name: 'exa' });
    expect(sdkFacade.mcp.disconnect).toHaveBeenCalledWith({ name: 'exa' });
    expect(updateSpy).toHaveBeenCalledWith({ exa: { status: 'connected' } });
    expect(normalizeSpy).toHaveBeenCalledWith({
      exa: { status: 'needs_client_registration', error: 'register client' },
    });
  });

  it('routes provider and broad query/admin SDK namespaces through the merged coordinator', async () => {
    const { coordinator, sdkFacade } = createHost();
    sdkFacade.provider.auth.mockResolvedValue({ openai: ['oauth'] });
    sdkFacade.provider.oauth.authorize.mockResolvedValue({ url: 'https://example.com/provider-auth' });
    sdkFacade.provider.oauth.callback.mockResolvedValue({ success: true });
    sdkFacade.project.list.mockResolvedValue([{ id: 'project-1' }]);
    sdkFacade.project.current.mockResolvedValue({ id: 'project-1' });
    sdkFacade.project.initGit.mockResolvedValue({ success: true });
    sdkFacade.project.update.mockResolvedValue({ id: 'project-1', name: 'Vault' });
    sdkFacade.file.list.mockResolvedValue([{ path: 'README.md' }]);
    sdkFacade.file.read.mockResolvedValue({ path: 'README.md', content: '# docs' });
    sdkFacade.file.status.mockResolvedValue({ modified: [] });
    sdkFacade.find.text.mockResolvedValue([{ path: 'README.md' }]);
    sdkFacade.find.files.mockResolvedValue([{ path: 'src/main.ts' }]);
    sdkFacade.find.symbols.mockResolvedValue([{ name: 'OpenCodeService' }]);
    sdkFacade.path.get.mockResolvedValue({ cwd: '/vault' });
    sdkFacade.vcs.get.mockResolvedValue({ branch: 'main' });
    sdkFacade.vcs.diff.mockResolvedValue({ patch: 'diff --git' });
    sdkFacade.formatter.status.mockResolvedValue({ prettier: 'ready' });
    sdkFacade.lsp.status.mockResolvedValue({ tsserver: 'ready' });

    await expect(coordinator.getProviderAuthMethods()).resolves.toEqual({ openai: ['oauth'] });
    await expect(coordinator.authorizeProviderOAuth('openai')).resolves.toEqual({
      url: 'https://example.com/provider-auth',
    });
    await expect(coordinator.completeProviderOAuth('openai', 'code-2', 7)).resolves.toEqual({ success: true });
    await expect(coordinator.listProjects()).resolves.toEqual([{ id: 'project-1' }]);
    await expect(coordinator.getCurrentProject()).resolves.toEqual({ id: 'project-1' });
    await expect(coordinator.initializeProjectGit()).resolves.toEqual({ success: true });
    await expect(coordinator.updateProject('project-1', { name: 'Vault' })).resolves.toEqual({
      id: 'project-1',
      name: 'Vault',
    });
    await expect(coordinator.listFiles({ recursive: true })).resolves.toEqual([{ path: 'README.md' }]);
    await expect(coordinator.readFile({ path: 'README.md' })).resolves.toEqual({
      path: 'README.md',
      content: '# docs',
    });
    await expect(coordinator.getFileStatus({ path: 'README.md' })).resolves.toEqual({ modified: [] });
    await expect(coordinator.findText({ query: 'docs' })).resolves.toEqual([{ path: 'README.md' }]);
    await expect(coordinator.findFiles({ query: 'main' })).resolves.toEqual([{ path: 'src/main.ts' }]);
    await expect(coordinator.findSymbols({ query: 'OpenCode' })).resolves.toEqual([{ name: 'OpenCodeService' }]);
    await expect(coordinator.getPaths()).resolves.toEqual({ cwd: '/vault' });
    await expect(coordinator.getVcsInfo({ cwd: '/vault' })).resolves.toEqual({ branch: 'main' });
    await expect(coordinator.getVcsDiff({ staged: true })).resolves.toEqual({ patch: 'diff --git' });
    await expect(coordinator.getFormatterStatus()).resolves.toEqual({ prettier: 'ready' });
    await expect(coordinator.getLspStatus()).resolves.toEqual({ tsserver: 'ready' });

    expect(sdkFacade.provider.oauth.callback).toHaveBeenCalledWith({
      providerID: 'openai',
      code: 'code-2',
      method: 7,
    });
    expect(sdkFacade.project.update).toHaveBeenCalledWith({ projectID: 'project-1', name: 'Vault' });
    expect(sdkFacade.file.list).toHaveBeenCalledWith({ recursive: true });
    expect(sdkFacade.find.symbols).toHaveBeenCalledWith({ query: 'OpenCode' });
    expect(sdkFacade.vcs.diff).toHaveBeenCalledWith({ staged: true });
  });
});
