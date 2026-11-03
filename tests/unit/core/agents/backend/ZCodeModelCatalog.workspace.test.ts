import { ZCodeModelSurface } from '../../../../../src/core/agents/backend/zcode/ZCodeModelCatalog';

const settings = { model: {
  available: [{ ref: { providerId: 'native', modelId: 'one' }, label: 'One', providerLabel: 'Native' }],
  current: { providerId: 'native', modelId: 'one' },
} };

function fixture() {
  const surface = new ZCodeModelSurface();
  const request = jest.fn(async (method: string, params?: Record<string, unknown>): Promise<unknown> =>
    method === 'session/create' ? { session: { sessionId: params?.sessionId }, settings } : { closed: true });
  const transport = { request: request as unknown as <T>(method: string, params?: Record<string, unknown>) => Promise<T> };
  return { surface, request, transport };
}

describe('ZCode workspace catalog before the first conversation', () => {
  it('deduplicates bootstrap, closes its deferred draft and keeps the native default', async () => {
    const { surface, request, transport } = fixture();
    const [workspace] = await Promise.all([
      surface.getWorkspaceModelCatalog(transport, '/vault', () => true),
      surface.getWorkspaceModelCatalog(transport, '/vault', () => true),
    ]);
    expect(request.mock.calls.map(([method]) => method)).toEqual(['session/create', 'session/close']);
    expect(request.mock.calls[0][1]).toMatchObject({
      workspace: { workspaceKey: '/vault', workspacePath: '/vault' }, persistence: 'deferred',
      titleGenerationEnabled: false, mcpServers: [], toolAllowlist: [], dynamicWorkflowEnabled: false,
    });
    expect(request.mock.calls[1][1]).toEqual({ sessionId: request.mock.calls[0][1]?.sessionId, expectedPersistence: 'deferred' });
    expect(workspace.models.map((model) => model.modelId)).toEqual(['one']);
    expect(surface.getAvailableModelCatalog()).toBeNull();
    expect(workspace.currentModel).toMatchObject({ providerId: 'native', modelId: 'one' });
    await surface.getWorkspaceModelCatalog(transport, '/vault', () => true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('cleans an invalid snapshot and permits a later retry without caching an empty catalog', async () => {
    const { surface, request, transport } = fixture();
    request.mockResolvedValueOnce({ session: { sessionId: 'broken' }, settings: {} });
    await expect(surface.getWorkspaceModelCatalog(transport, '/vault', () => true)).rejects.toThrow();
    expect(request.mock.calls[1][0]).toBe('session/close');
    expect(surface.getAvailableModelCatalog()).toBeNull();
    expect((await surface.getWorkspaceModelCatalog(transport, '/vault', () => true)).models).toHaveLength(1);
  });

  it('discards a late response from a stopped or replaced transport', async () => {
    const { surface, request, transport } = fixture();
    await expect(surface.getWorkspaceModelCatalog(transport, '/vault', () => false)).rejects.toThrow();
    expect(request.mock.calls.some(([method]) => method === 'session/close')).toBe(true);
    expect(surface.getAvailableModelCatalog()).toBeNull();
  });

  it('does not publish a catalog when deferred cleanup is not confirmed', async () => {
    const { surface, request, transport } = fixture();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (method, params) => method === 'session/close' ? { closed: false } : original(method, params));
    await expect(surface.getWorkspaceModelCatalog(transport, '/vault', () => true)).rejects.toThrow('did not close');
    expect(surface.getAvailableModelCatalog()).toBeNull();
    request.mockImplementation(original);
    expect((await surface.getWorkspaceModelCatalog(transport, '/vault', () => true)).models).toHaveLength(1);
  });

  it('reloads the workspace catalog for a replacement process', async () => {
    const { surface, transport } = fixture();
    await surface.getWorkspaceModelCatalog(transport, '/vault', () => true);
    const second = fixture();
    await surface.getWorkspaceModelCatalog(second.transport, '/vault', () => true);
    expect(second.request.mock.calls.map(([method]) => method)).toEqual(['session/create', 'session/close']);
  });

  it('clears authenticated session and workspace caches when the process is stopped', async () => {
    const { surface, request, transport } = fixture();
    surface.captureCatalogSnapshot({ settings }, true);
    await surface.getWorkspaceModelCatalog(transport, '/vault', () => true);
    surface.reset();
    expect(surface.getAvailableModelCatalog()).toBeNull();
    await surface.getWorkspaceModelCatalog(transport, '/vault', () => true);
    expect(request.mock.calls.filter(([method]) => method === 'session/create')).toHaveLength(2);
  });

  it('retains a real session snapshot that arrives during workspace bootstrap', async () => {
    const { surface, request, transport } = fixture();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (method, params) => {
      if (method === 'session/close') surface.captureCatalogSnapshot({ settings: {
        model: { available: [{ ref: { providerId: 'session', modelId: 'chosen' } }], current: { providerId: 'session', modelId: 'chosen' } },
      } }, true);
      return original(method, params);
    });
    const workspace = await surface.getWorkspaceModelCatalog(transport, '/vault', () => true);
    expect(surface.getAvailableModelCatalog()?.currentModel?.providerId).toBe('session');
    expect(workspace.currentModel).toMatchObject({ providerId: 'native', modelId: 'one' });
  });

  it('rejects an older in-flight catalog after an explicit refresh', async () => {
    const { surface, request, transport } = fixture();
    let first!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise((resolve) => { first = resolve; }));
    const old = surface.getWorkspaceModelCatalog(transport, '/vault', () => true);
    const rejected = old.then(() => null, (error: unknown) => error);
    const refreshed = await surface.getWorkspaceModelCatalog(transport, '/vault', () => true, { forceRefresh: true });
    first({ session: { sessionId: request.mock.calls[0][1]?.sessionId }, settings }); expect(await rejected).toMatchObject({ message: expect.stringContaining('superseded') });
    expect(await surface.getWorkspaceModelCatalog(transport, '/vault', () => true)).toBe(refreshed);
    expect(request.mock.calls.filter(([method]) => method === 'session/close')).toHaveLength(2);
  });

  it('inspects a selected model in a closed draft while preserving the default and real session state', async () => {
    const { surface, request, transport } = fixture();
    const original = request.getMockImplementation()!;
    const expanded = { model: { ...settings.model, available: [...settings.model.available, { ref: { providerId: 'native', modelId: 'two' }, label: 'Two', providerLabel: 'Native' }] } };
    request.mockImplementation(async (method, params) => {
      if (method === 'session/create') return { session: { sessionId: params?.sessionId }, settings: expanded };
      if (method === 'session/setModel') return { settings: { model: { current: { providerId: 'native', modelId: 'two' } }, thoughtLevel: { enabled: true, available: [{ value: 'high', label: 'High' }], current: 'high' } } };
      return original(method, params);
    });
    const selected = await surface.getWorkspaceModelCatalog(transport, '/vault', () => true, { model: { providerId: 'native', modelId: 'two' } });
    expect(selected.currentModel?.modelId).toBe('two');
    expect(selected.defaultModel?.modelId).toBe('one');
    expect(surface.getAvailableModelCatalog()).toBeNull();
    expect(request.mock.calls.map(([method]) => method)).toEqual(['session/create', 'session/setModel', 'session/close']);
    expect(request.mock.calls.some(([method]) => method === 'session/send')).toBe(false);
  });
});
