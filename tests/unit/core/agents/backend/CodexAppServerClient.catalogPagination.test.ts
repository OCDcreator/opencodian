import { AppServerCatalogReadError, CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

function createClient() {
  const client = new CodexAppServerClient({ codexPathOverride: '/fixture/codex' });
  jest.spyOn(client, 'start').mockResolvedValue(undefined);
  const request = jest.spyOn(client as unknown as {
    request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  }, 'request');
  return { client, request };
}

const catalogs = [
  {
    route: 'thread/list',
    read: (client: CodexAppServerClient) => client.listAllThreads({ archived: true, limit: 50 }),
    page: (client: CodexAppServerClient) => client.listThreadsPage({ archived: true, limit: 50, cursor: 'page-2' }),
    row: (id: string) => ({ id, preview: id, name: id }),
    filters: { archived: true, limit: 50 },
  },
  {
    route: 'model/list',
    read: (client: CodexAppServerClient) => client.listModels({ limit: 50 }),
    page: (client: CodexAppServerClient) => client.listModelsPage({ limit: 50, cursor: 'page-2' }),
    row: (id: string) => ({ id, model: id, displayName: id }),
    filters: { limit: 50 },
  },
  {
    route: 'permissionProfile/list',
    read: (client: CodexAppServerClient) => client.listPermissionProfiles({ cwd: 'C:/vault', limit: 50 }),
    page: (client: CodexAppServerClient) => client.listPermissionProfilesPage({ cwd: 'C:/vault', limit: 50, cursor: 'page-2' }),
    row: (id: string) => ({ id, description: id }),
    filters: { cwd: 'C:/vault', limit: 50 },
  },
  {
    route: 'mcpServerStatus/list',
    read: (client: CodexAppServerClient) => client.listMcpServerStatus(),
    page: (client: CodexAppServerClient) => client.listMcpServerStatusPage({ cursor: 'page-2' }),
    row: (id: string) => ({ name: id, tools: {}, resources: [] }),
    filters: {},
  },
  {
    route: 'thread/loaded/list',
    read: (client: CodexAppServerClient) => client.listLoadedThreads(),
    page: (client: CodexAppServerClient) => client.listLoadedThreadsPage({ cursor: 'page-2' }),
    row: (id: string) => id,
    filters: {},
  },
];

function nativeId(row: unknown): string {
  if (typeof row === 'string') return row;
  const record = row as { id?: string; name?: string };
  return record.id ?? record.name ?? '';
}

describe.each(catalogs)('$route catalog pagination', (catalog) => {
  it('reads more than two pages, deduplicates boundary IDs, and retains filters', async () => {
    const { client, request } = createClient();
    const ids = Array.from({ length: 121 }, (_, index) => `native-${index}`);
    request.mockImplementation(async (_method, params) => {
      if (!params.cursor) return { data: ids.slice(0, 50).map(catalog.row), nextCursor: 'page-2' };
      if (params.cursor === 'page-2') return { data: ids.slice(49, 99).map(catalog.row), nextCursor: 'page-3' };
      return { data: ids.slice(98).map(catalog.row), nextCursor: null };
    });

    const rows = await catalog.read(client);

    expect(rows.map(nativeId)).toEqual(ids);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([method, params]) => ({ method, params }))).toEqual([
      { method: catalog.route, params: catalog.filters },
      { method: catalog.route, params: { ...catalog.filters, cursor: 'page-2' } },
      { method: catalog.route, params: { ...catalog.filters, cursor: 'page-3' } },
    ]);
    expect(request.mock.calls.every(([, , timeoutMs]) => timeoutMs === 30000)).toBe(true);
  });

  it('exposes a single page with its nextCursor without traversing it', async () => {
    const { client, request } = createClient();
    request.mockResolvedValue({ data: [catalog.row('one')], nextCursor: 'page-3' });

    const page = await catalog.page(client);

    expect(page?.data.map(nativeId)).toEqual(['one']);
    expect(page?.nextCursor).toBe('page-3');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({ ...catalog.filters, cursor: 'page-2' });
  });

  it('rejects on page two and preserves partial data and the failed cursor', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce({ data: [catalog.row('one')], nextCursor: 'page-2' });
    request.mockRejectedValueOnce(new Error('second page failed'));

    await expect(catalog.read(client)).rejects.toMatchObject({
      name: 'AppServerCatalogReadError',
      result: { status: 'partial', nextCursor: 'page-2', errorReason: 'second page failed' },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not hang when a server repeats its cursor', async () => {
    const { client, request } = createClient();
    request.mockResolvedValue({ data: [catalog.row('one')], nextCursor: 'page-2' });

    const failure = await catalog.read(client).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppServerCatalogReadError);
    expect((failure as AppServerCatalogReadError).result).toMatchObject({
      status: 'partial', nextCursor: 'page-2', errorReason: expect.stringContaining('repeated pagination cursor'),
    });
    expect((failure as AppServerCatalogReadError).result.data.map(nativeId)).toEqual(['one']);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('continues through an empty page while its cursor advances', async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce({ data: [], nextCursor: 'page-2' });
    request.mockResolvedValueOnce({ data: [catalog.row('late')], nextCursor: null });
    await expect(catalog.read(client).then((rows) => rows.map(nativeId))).resolves.toEqual(['late']);
  });

  it('returns null from the page API for an unsupported or malformed page', async () => {
    const { client, request } = createClient();
    request.mockRejectedValueOnce({ code: -32601, message: 'Method not found' });
    await expect(catalog.page(client)).resolves.toBeNull();
    request.mockResolvedValueOnce({ data: [], nextCursor: 123 });
    await expect(catalog.page(client)).resolves.toBeNull();
  });
});

it('retains the legacy single-page listThreads contract', async () => {
  const { client, request } = createClient();
  request.mockResolvedValue({ data: [{ id: 'one' }], nextCursor: 'page-2' });
  await expect(client.listThreads({ archived: false })).resolves.toEqual([{ id: 'one' }]);
  expect(request).toHaveBeenCalledTimes(1);
});

it('classifies full-thread first-page failure separately from unavailable', async () => {
  const { client, request } = createClient();
  request.mockRejectedValueOnce(new Error('offline'));
  await expect(client.listAllThreads()).rejects.toMatchObject({ result: { status: 'failed', data: [], nextCursor: null } });
  request.mockRejectedValueOnce({ code: -32601, message: 'Method not found' });
  await expect(client.listAllThreads()).rejects.toMatchObject({ result: { status: 'unavailable', data: [], nextCursor: null } });
});
