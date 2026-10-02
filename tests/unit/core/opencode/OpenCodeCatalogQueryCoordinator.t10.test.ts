import { OpenCodeCatalogQueryCoordinator, type OpenCodeCatalogQueryCoordinatorHost } from '../../../../src/core/opencode/OpenCodeCatalogQueryCoordinator';
import { OpenCodeCatalogStateStore } from '../../../../src/core/opencode/OpenCodeCatalogStateStore';

function catalogFixture(defaults: unknown, useSdk = true) {
  const response = { providers: [{ id: 'test-provider', name: 'Test', models: {
    'test-model': { id: 'test-model', name: 'Model', limit: { context: 65536 } },
  } }], default: defaults };
  const providers = jest.fn().mockRejectedValue(new Error('SDK method absent'));
  const host: OpenCodeCatalogQueryCoordinatorHost = {
    shouldUseSdkCrud: () => useSdk,
    getSdkFacade: jest.fn(() => ({ config: { providers } })) as unknown as OpenCodeCatalogQueryCoordinatorHost['getSdkFacade'],
    getLegacy: jest.fn().mockResolvedValue(response), logServiceWarning: jest.fn(), logServiceError: jest.fn(),
    getDebugMetadata: () => ({ baseUrl: 'http://fixture', vaultPath: 'C:/Test Vault', serverStatus: 'running', isManagedServerRunning: true, managedServerState: null }),
    getToolCatalogScopeKey: () => 'catalog-fixture',
  };
  const state = new OpenCodeCatalogStateStore({ syncOpenCodeEventSubscriptions: () => undefined });
  return { coordinator: new OpenCodeCatalogQueryCoordinator(state, host), host, providers };
}

describe('T10 OpenCode 1 SDK v2 versus legacy catalog defaults', () => {
  it.each([true, false])('retains native provider-model defaults with SDK primary=%s', async (useSdk) => {
    const { coordinator, host } = catalogFixture({ 'test-provider': 'test-model' }, useSdk);
    const result = await coordinator.getAvailableModels({ includeDirectory: false });
    expect(result.defaults).toEqual({ 'test-provider': 'test-model' });
    expect(result.providers[0].models[0].contextWindow).toBe(65536);
    expect(host.getLegacy).toHaveBeenCalledWith('/config/providers', { includeDirectory: false });
  });

  it('continues to accept the older provider/model default shape', async () => {
    const { coordinator } = catalogFixture({ provider: 'test-provider', model: 'test-model' });
    expect((await coordinator.getAvailableModels()).defaults).toEqual({ 'test-provider': 'test-model' });
  });
});
