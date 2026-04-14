import type { McpServerStatus } from './types';

export interface OpenCodeMcpSdk {
  status(): Promise<unknown>;
  add(request: { name: string; config: Record<string, unknown> }): Promise<unknown>;
  connect(request: { name: string }): Promise<unknown>;
  disconnect(request: { name: string }): Promise<unknown>;
  auth: {
    start(request: { name: string }): Promise<unknown>;
    callback(request: { name: string; code: string }): Promise<unknown>;
    authenticate(request: { name: string }): Promise<unknown>;
    remove(request: { name: string }): Promise<unknown>;
  };
}

export interface OpenCodeProviderSdk {
  auth(): Promise<unknown>;
  oauth: {
    authorize(request: { providerID: string }): Promise<unknown>;
    callback(request: { providerID: string; code: string; method?: number }): Promise<unknown>;
  };
}

export interface OpenCodeProjectSdk {
  list(): Promise<unknown>;
  current(): Promise<unknown>;
  initGit(): Promise<unknown>;
  update(request: { projectID: string } & Record<string, unknown>): Promise<unknown>;
}

export interface OpenCodeFileSdk {
  list(request: Record<string, unknown>): Promise<unknown>;
  read(request: Record<string, unknown>): Promise<unknown>;
  status(request: Record<string, unknown>): Promise<unknown>;
}

export interface OpenCodeFindSdk {
  text(request: Record<string, unknown>): Promise<unknown>;
  files(request: Record<string, unknown>): Promise<unknown>;
  symbols(request: Record<string, unknown>): Promise<unknown>;
}

export interface OpenCodePathSdk {
  get(): Promise<unknown>;
}

export interface OpenCodeVcsSdk {
  get(request: Record<string, unknown>): Promise<unknown>;
  diff(request: Record<string, unknown>): Promise<unknown>;
}

export interface OpenCodeFormatterSdk {
  status(): Promise<unknown>;
}

export interface OpenCodeLspSdk {
  status(): Promise<unknown>;
}

export interface OpenCodeQueryGatewayHost {
  getMcpSdk(): OpenCodeMcpSdk;
  getProviderSdk(): OpenCodeProviderSdk;
  getProjectSdk(): OpenCodeProjectSdk;
  getFileSdk(): OpenCodeFileSdk;
  getFindSdk(): OpenCodeFindSdk;
  getPathSdk(): OpenCodePathSdk;
  getVcsSdk(): OpenCodeVcsSdk;
  getFormatterSdk(): OpenCodeFormatterSdk;
  getLspSdk(): OpenCodeLspSdk;
  normalizeMcpServerStatusMap(input: unknown): Record<string, McpServerStatus>;
  updateMcpServerStatus(statusMap: Record<string, McpServerStatus>): Record<string, McpServerStatus>;
}

export class OpenCodeQueryGateway {
  constructor(private readonly host: OpenCodeQueryGatewayHost) {}

  async refreshMcpServerStatus(): Promise<Record<string, McpServerStatus>> {
    return this.storeMcpServerStatus(await this.host.getMcpSdk().status());
  }

  async addMcpServer(name: string, config: Record<string, unknown>): Promise<Record<string, McpServerStatus>> {
    return this.storeMcpServerStatus(await this.host.getMcpSdk().add({ name, config }));
  }

  async connectMcpServer(name: string): Promise<boolean> {
    const response = await this.host.getMcpSdk().connect({ name });
    await this.refreshMcpServerStatus();
    return response === true;
  }

  async disconnectMcpServer(name: string): Promise<boolean> {
    const response = await this.host.getMcpSdk().disconnect({ name });
    await this.refreshMcpServerStatus();
    return response === true;
  }

  async startMcpAuth(name: string): Promise<unknown> {
    return this.host.getMcpSdk().auth.start({ name });
  }

  async completeMcpAuth(name: string, code: string): Promise<McpServerStatus> {
    const response = await this.host.getMcpSdk().auth.callback({ name, code });
    await this.refreshMcpServerStatus();
    return this.normalizeSingleMcpServerStatus(name, response);
  }

  async authenticateMcp(name: string): Promise<McpServerStatus> {
    const response = await this.host.getMcpSdk().auth.authenticate({ name });
    await this.refreshMcpServerStatus();
    return this.normalizeSingleMcpServerStatus(name, response);
  }

  async removeMcpAuth(name: string): Promise<{ success: true }> {
    const response = await this.host.getMcpSdk().auth.remove({ name });
    return response && typeof response === 'object' && 'success' in (response as Record<string, unknown>)
      ? response as { success: true }
      : { success: true };
  }

  async getProviderAuthMethods(): Promise<unknown> {
    return this.host.getProviderSdk().auth();
  }

  async authorizeProviderOAuth(providerID: string): Promise<unknown> {
    return this.host.getProviderSdk().oauth.authorize({ providerID });
  }

  async completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown> {
    return this.host.getProviderSdk().oauth.callback({ providerID, code, method });
  }

  async listProjects(): Promise<unknown> {
    return this.host.getProjectSdk().list();
  }

  async getCurrentProject(): Promise<unknown> {
    return this.host.getProjectSdk().current();
  }

  async initializeProjectGit(): Promise<unknown> {
    return this.host.getProjectSdk().initGit();
  }

  async updateProject(projectID: string, input: Record<string, unknown>): Promise<unknown> {
    return this.host.getProjectSdk().update({ projectID, ...input });
  }

  async listFiles(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getFileSdk().list(input);
  }

  async readFile(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getFileSdk().read(input);
  }

  async getFileStatus(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getFileSdk().status(input);
  }

  async findText(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getFindSdk().text(input);
  }

  async findFiles(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getFindSdk().files(input);
  }

  async findSymbols(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getFindSdk().symbols(input);
  }

  async getPaths(): Promise<unknown> {
    return this.host.getPathSdk().get();
  }

  async getVcsInfo(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getVcsSdk().get(input);
  }

  async getVcsDiff(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getVcsSdk().diff(input);
  }

  async getFormatterStatus(): Promise<unknown> {
    return this.host.getFormatterSdk().status();
  }

  async getLspStatus(): Promise<unknown> {
    return this.host.getLspSdk().status();
  }

  private storeMcpServerStatus(input: unknown): Record<string, McpServerStatus> {
    return this.host.updateMcpServerStatus(this.host.normalizeMcpServerStatusMap(input));
  }

  private normalizeSingleMcpServerStatus(name: string, input: unknown): McpServerStatus {
    return this.host.normalizeMcpServerStatusMap({ [name]: input })[name]
      ?? { status: 'failed', error: 'Unknown MCP auth result' };
  }
}
