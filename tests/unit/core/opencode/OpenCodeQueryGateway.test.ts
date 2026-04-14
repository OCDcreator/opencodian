import {
  type OpenCodeFileSdk,
  type OpenCodeFindSdk,
  type OpenCodeFormatterSdk,
  type OpenCodeLspSdk,
  type OpenCodeMcpSdk,
  type OpenCodePathSdk,
  type OpenCodeProjectSdk,
  type OpenCodeProviderSdk,
  OpenCodeQueryGateway,
  type OpenCodeQueryGatewayHost,
  type OpenCodeVcsSdk,
} from '../../../../src/core/opencode/OpenCodeQueryGateway';
import type { McpServerStatus } from '../../../../src/core/opencode/types';

type MockHost = OpenCodeQueryGatewayHost & {
  getMcpSdk: jest.Mock<OpenCodeMcpSdk, []>;
  getProviderSdk: jest.Mock<OpenCodeProviderSdk, []>;
  getProjectSdk: jest.Mock<OpenCodeProjectSdk, []>;
  getFileSdk: jest.Mock<OpenCodeFileSdk, []>;
  getFindSdk: jest.Mock<OpenCodeFindSdk, []>;
  getPathSdk: jest.Mock<OpenCodePathSdk, []>;
  getVcsSdk: jest.Mock<OpenCodeVcsSdk, []>;
  getFormatterSdk: jest.Mock<OpenCodeFormatterSdk, []>;
  getLspSdk: jest.Mock<OpenCodeLspSdk, []>;
  normalizeMcpServerStatusMap: jest.Mock<Record<string, McpServerStatus>, [unknown]>;
  updateMcpServerStatus: jest.Mock<Record<string, McpServerStatus>, [Record<string, McpServerStatus>]>;
};

function createMcpSdk(
  overrides: Partial<jest.Mocked<OpenCodeMcpSdk>> = {},
): jest.Mocked<OpenCodeMcpSdk> {
  return {
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
    ...overrides,
  };
}

function createProviderSdk(
  overrides: Partial<jest.Mocked<OpenCodeProviderSdk>> = {},
): jest.Mocked<OpenCodeProviderSdk> {
  return {
    auth: jest.fn(),
    oauth: {
      authorize: jest.fn(),
      callback: jest.fn(),
    },
    ...overrides,
  };
}

function createProjectSdk(
  overrides: Partial<jest.Mocked<OpenCodeProjectSdk>> = {},
): jest.Mocked<OpenCodeProjectSdk> {
  return {
    list: jest.fn(),
    current: jest.fn(),
    initGit: jest.fn(),
    update: jest.fn(),
    ...overrides,
  };
}

function createFileSdk(
  overrides: Partial<jest.Mocked<OpenCodeFileSdk>> = {},
): jest.Mocked<OpenCodeFileSdk> {
  return {
    list: jest.fn(),
    read: jest.fn(),
    status: jest.fn(),
    ...overrides,
  };
}

function createFindSdk(
  overrides: Partial<jest.Mocked<OpenCodeFindSdk>> = {},
): jest.Mocked<OpenCodeFindSdk> {
  return {
    text: jest.fn(),
    files: jest.fn(),
    symbols: jest.fn(),
    ...overrides,
  };
}

function createVcsSdk(
  overrides: Partial<jest.Mocked<OpenCodeVcsSdk>> = {},
): jest.Mocked<OpenCodeVcsSdk> {
  return {
    get: jest.fn(),
    diff: jest.fn(),
    ...overrides,
  };
}

function createHost(
  overrides: Partial<MockHost> = {},
): {
  gateway: OpenCodeQueryGateway;
  host: MockHost;
  mcpSdk: jest.Mocked<OpenCodeMcpSdk>;
  providerSdk: jest.Mocked<OpenCodeProviderSdk>;
  projectSdk: jest.Mocked<OpenCodeProjectSdk>;
  fileSdk: jest.Mocked<OpenCodeFileSdk>;
  findSdk: jest.Mocked<OpenCodeFindSdk>;
  pathSdk: jest.Mocked<OpenCodePathSdk>;
  vcsSdk: jest.Mocked<OpenCodeVcsSdk>;
  formatterSdk: jest.Mocked<OpenCodeFormatterSdk>;
  lspSdk: jest.Mocked<OpenCodeLspSdk>;
} {
  const mcpSdk = createMcpSdk();
  const providerSdk = createProviderSdk();
  const projectSdk = createProjectSdk();
  const fileSdk = createFileSdk();
  const findSdk = createFindSdk();
  const pathSdk = { get: jest.fn() };
  const vcsSdk = createVcsSdk();
  const formatterSdk = { status: jest.fn() };
  const lspSdk = { status: jest.fn() };
  const normalizeMcpServerStatusMap = jest.fn((input: unknown) => input as Record<string, McpServerStatus>);
  const updateMcpServerStatus = jest.fn((statusMap: Record<string, McpServerStatus>) => statusMap);

  const host: MockHost = {
    getMcpSdk: jest.fn(() => mcpSdk),
    getProviderSdk: jest.fn(() => providerSdk),
    getProjectSdk: jest.fn(() => projectSdk),
    getFileSdk: jest.fn(() => fileSdk),
    getFindSdk: jest.fn(() => findSdk),
    getPathSdk: jest.fn(() => pathSdk),
    getVcsSdk: jest.fn(() => vcsSdk),
    getFormatterSdk: jest.fn(() => formatterSdk),
    getLspSdk: jest.fn(() => lspSdk),
    normalizeMcpServerStatusMap,
    updateMcpServerStatus,
    ...overrides,
  };

  return {
    gateway: new OpenCodeQueryGateway(host),
    host,
    mcpSdk,
    providerSdk,
    projectSdk,
    fileSdk,
    findSdk,
    pathSdk,
    vcsSdk,
    formatterSdk,
    lspSdk,
  };
}

describe('OpenCodeQueryGateway', () => {
  it('normalizes MCP status mutations and auth responses through the catalog store', async () => {
    const { gateway, host, mcpSdk } = createHost();
    mcpSdk.status.mockResolvedValue({ exa: { status: 'connected' } });
    mcpSdk.add.mockResolvedValue({ exa: { status: 'needs_auth' } });
    mcpSdk.connect.mockResolvedValue(true);
    mcpSdk.disconnect.mockResolvedValue(true);
    mcpSdk.auth.start.mockResolvedValue({ authorizationUrl: 'https://example.com/auth' });
    mcpSdk.auth.callback.mockResolvedValue({ status: 'needs_client_registration', error: 'register client' });
    mcpSdk.auth.authenticate.mockResolvedValue({ status: 'connected' });
    mcpSdk.auth.remove.mockResolvedValue({});

    await expect(gateway.refreshMcpServerStatus()).resolves.toEqual({ exa: { status: 'connected' } });
    await expect(gateway.addMcpServer('exa', { type: 'remote' })).resolves.toEqual({ exa: { status: 'needs_auth' } });
    await expect(gateway.connectMcpServer('exa')).resolves.toBe(true);
    await expect(gateway.disconnectMcpServer('exa')).resolves.toBe(true);
    await expect(gateway.startMcpAuth('exa')).resolves.toEqual({ authorizationUrl: 'https://example.com/auth' });
    await expect(gateway.completeMcpAuth('exa', 'code-1')).resolves.toEqual({
      status: 'needs_client_registration',
      error: 'register client',
    });
    await expect(gateway.authenticateMcp('exa')).resolves.toEqual({ status: 'connected' });
    await expect(gateway.removeMcpAuth('exa')).resolves.toEqual({ success: true });

    expect(mcpSdk.add).toHaveBeenCalledWith({ name: 'exa', config: { type: 'remote' } });
    expect(mcpSdk.connect).toHaveBeenCalledWith({ name: 'exa' });
    expect(mcpSdk.disconnect).toHaveBeenCalledWith({ name: 'exa' });
    expect(host.updateMcpServerStatus).toHaveBeenCalledWith({ exa: { status: 'connected' } });
    expect(host.normalizeMcpServerStatusMap).toHaveBeenCalledWith({
      exa: { status: 'needs_client_registration', error: 'register client' },
    });
  });

  it('routes provider, project, file, find, path, vcs, formatter, and lsp queries', async () => {
    const { gateway, providerSdk, projectSdk, fileSdk, findSdk, pathSdk, vcsSdk, formatterSdk, lspSdk } = createHost();
    providerSdk.auth.mockResolvedValue({ openai: ['oauth'] });
    providerSdk.oauth.authorize.mockResolvedValue({ url: 'https://example.com/provider-auth' });
    providerSdk.oauth.callback.mockResolvedValue({ success: true });
    projectSdk.list.mockResolvedValue([{ id: 'project-1' }]);
    projectSdk.current.mockResolvedValue({ id: 'project-1' });
    projectSdk.initGit.mockResolvedValue({ success: true });
    projectSdk.update.mockResolvedValue({ id: 'project-1', name: 'Vault' });
    fileSdk.list.mockResolvedValue([{ path: 'README.md' }]);
    fileSdk.read.mockResolvedValue({ path: 'README.md', content: '# docs' });
    fileSdk.status.mockResolvedValue({ modified: [] });
    findSdk.text.mockResolvedValue([{ path: 'README.md' }]);
    findSdk.files.mockResolvedValue([{ path: 'src/main.ts' }]);
    findSdk.symbols.mockResolvedValue([{ name: 'OpenCodeService' }]);
    pathSdk.get.mockResolvedValue({ cwd: '/vault' });
    vcsSdk.get.mockResolvedValue({ branch: 'main' });
    vcsSdk.diff.mockResolvedValue({ patch: 'diff --git' });
    formatterSdk.status.mockResolvedValue({ prettier: 'ready' });
    lspSdk.status.mockResolvedValue({ tsserver: 'ready' });

    await expect(gateway.getProviderAuthMethods()).resolves.toEqual({ openai: ['oauth'] });
    await expect(gateway.authorizeProviderOAuth('openai')).resolves.toEqual({
      url: 'https://example.com/provider-auth',
    });
    await expect(gateway.completeProviderOAuth('openai', 'code-2', 7)).resolves.toEqual({ success: true });
    await expect(gateway.listProjects()).resolves.toEqual([{ id: 'project-1' }]);
    await expect(gateway.getCurrentProject()).resolves.toEqual({ id: 'project-1' });
    await expect(gateway.initializeProjectGit()).resolves.toEqual({ success: true });
    await expect(gateway.updateProject('project-1', { name: 'Vault' })).resolves.toEqual({
      id: 'project-1',
      name: 'Vault',
    });
    await expect(gateway.listFiles({ recursive: true })).resolves.toEqual([{ path: 'README.md' }]);
    await expect(gateway.readFile({ path: 'README.md' })).resolves.toEqual({ path: 'README.md', content: '# docs' });
    await expect(gateway.getFileStatus({ path: 'README.md' })).resolves.toEqual({ modified: [] });
    await expect(gateway.findText({ query: 'docs' })).resolves.toEqual([{ path: 'README.md' }]);
    await expect(gateway.findFiles({ query: 'main' })).resolves.toEqual([{ path: 'src/main.ts' }]);
    await expect(gateway.findSymbols({ query: 'OpenCode' })).resolves.toEqual([{ name: 'OpenCodeService' }]);
    await expect(gateway.getPaths()).resolves.toEqual({ cwd: '/vault' });
    await expect(gateway.getVcsInfo({ cwd: '/vault' })).resolves.toEqual({ branch: 'main' });
    await expect(gateway.getVcsDiff({ staged: true })).resolves.toEqual({ patch: 'diff --git' });
    await expect(gateway.getFormatterStatus()).resolves.toEqual({ prettier: 'ready' });
    await expect(gateway.getLspStatus()).resolves.toEqual({ tsserver: 'ready' });

    expect(providerSdk.oauth.callback).toHaveBeenCalledWith({
      providerID: 'openai',
      code: 'code-2',
      method: 7,
    });
    expect(projectSdk.update).toHaveBeenCalledWith({ projectID: 'project-1', name: 'Vault' });
    expect(fileSdk.list).toHaveBeenCalledWith({ recursive: true });
    expect(findSdk.symbols).toHaveBeenCalledWith({ query: 'OpenCode' });
    expect(vcsSdk.diff).toHaveBeenCalledWith({ staged: true });
  });
});
