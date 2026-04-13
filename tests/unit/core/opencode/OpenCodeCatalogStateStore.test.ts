import { OpenCodeCatalogStateStore } from '../../../../src/core/opencode/OpenCodeCatalogStateStore';

function createStore() {
  const host = {
    syncOpenCodeEventSubscriptions: jest.fn(),
  };

  return {
    host,
    store: new OpenCodeCatalogStateStore(host),
  };
}

describe('OpenCodeCatalogStateStore', () => {
  it('syncs open-code event subscriptions for catalog listeners and broadcasts manual catalog updates', () => {
    const { host, store } = createStore();
    const snapshots = [];

    const dispose = store.subscribeToCatalogUpdates((snapshot) => {
      snapshots.push(snapshot);
    });

    expect(host.syncOpenCodeEventSubscriptions).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.toolCatalog).toMatchObject({
      registryToolIds: [],
      observedExternalTools: [],
      toolSchemasByModel: {},
      updatedAt: null,
    });

    expect(store.observeRuntimeToolNames(['read', 'exa_search', 'exa_search'])).toBe(true);
    expect(store.observeRuntimeToolNames(['exa_search'])).toBe(false);

    store.emitCatalogUpdate();

    expect(snapshots.at(-1)?.toolCatalog.observedExternalTools).toEqual(['exa_search']);

    dispose();

    expect(host.syncOpenCodeEventSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('tracks registry ids, tool schema cache, and tool identity context together', () => {
    const { store } = createStore();

    expect(store.buildToolIdentityContext().knownMcpTools).toBeUndefined();

    store.observeRuntimeToolNames(['vault_search']);
    store.updateRegistryToolIds([' bash ', 'vault_tool', '', 'bash']);
    store.updateToolSchemaCache('scope::openai::gpt-5', [
      { id: 'read', description: 'Read file', parameters: {} },
      { id: 'vault_tool', description: 'Vault tool', parameters: { type: 'object' } },
    ]);

    const context = store.buildToolIdentityContext();
    const snapshot = store.getToolCatalogSnapshot();

    expect([...context.registryTools ?? []]).toEqual(['bash', 'vault_tool']);
    expect([...context.knownMcpTools ?? []]).toEqual(['vault_search']);
    expect(snapshot).toMatchObject({
      registryToolIds: ['bash', 'vault_tool'],
      observedExternalTools: ['vault_search'],
      toolSchemasByModel: {
        'scope::openai::gpt-5': [
          { id: 'read', description: 'Read file', parameters: {} },
          { id: 'vault_tool', description: 'Vault tool', parameters: { type: 'object' } },
        ],
      },
    });
    expect(typeof snapshot.updatedAt).toBe('number');
    expect(store.getToolSchemaCache('scope::openai::gpt-5')).toHaveLength(2);

    store.clearToolSchemaCache();

    expect(store.getToolCatalogSnapshot().toolSchemasByModel).toEqual({});
  });

  it('normalizes MCP status payloads and stores sorted MCP snapshots', () => {
    const { store } = createStore();

    const normalized = store.normalizeMcpServerStatusMap({
      zebra: { status: 'failed', error: 'boom' },
      alpha: { status: 'connected' },
      bravo: { status: 'needs_client_registration', error: 'register first' },
      ignored: { status: 'failed' },
      skipped: null,
    });

    expect(normalized).toEqual({
      zebra: { status: 'failed', error: 'boom' },
      alpha: { status: 'connected' },
      bravo: { status: 'needs_client_registration', error: 'register first' },
    });

    const stored = store.updateMcpServerStatus(normalized);
    const snapshot = store.getMcpServerSnapshot();

    expect(stored).toEqual({
      zebra: { status: 'failed', error: 'boom' },
      alpha: { status: 'connected' },
      bravo: { status: 'needs_client_registration', error: 'register first' },
    });
    expect(snapshot.servers).toEqual({
      alpha: { status: 'connected' },
      bravo: { status: 'needs_client_registration', error: 'register first' },
      zebra: { status: 'failed', error: 'boom' },
    });
    expect(typeof snapshot.updatedAt).toBe('number');
  });
});
