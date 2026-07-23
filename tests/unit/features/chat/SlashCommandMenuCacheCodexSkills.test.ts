import {
  SlashCommandMenuCatalogCache,
  type SlashCommandMenuCatalogCacheHost,
} from '../../../../src/features/chat/services/SlashCommandMenuCatalogCache';

function createCodexHost(
  overrides: Partial<SlashCommandMenuCatalogCacheHost> = {},
): SlashCommandMenuCatalogCacheHost {
  return {
    getHiddenCommandIds: () => [],
    loadProjectAgents: async () => ({}),
    loadProjectCommands: async () => ({}),
    loadRuntimeCommands: async () => [],
    loadRuntimeSkills: async () => [],
    loadCodexRuntimeSkills: async () => [
      { name: 'code-review', description: 'Review code', enabled: true, scope: 'project' },
      { name: 'git-flow', description: 'Git workflow', enabled: false },
    ],
    getBackendKey: () => 'codex',
    getVaultPath: () => '/vault',
    onWarmLoadFailed: () => undefined,
    ...overrides,
  };
}

describe('SlashCommandMenuCatalogCache — Codex runtime skills', () => {
  it('appends codex-skill items with $skill-name insert text when Codex backend is active', async () => {
    const cache = new SlashCommandMenuCatalogCache(createCodexHost());
    const items = await cache.load();

    const codexItems = items.filter((item) => item.source === 'codex-skill');
    expect(codexItems).toHaveLength(2);
    expect(codexItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'code-review',
          displayId: '$code-review',
          insertText: '$code-review ',
          runtimeAvailable: true,
          source: 'codex-skill',
        }),
        expect.objectContaining({
          id: 'git-flow',
          insertText: '$git-flow ',
          runtimeAvailable: false,
          source: 'codex-skill',
        }),
      ]),
    );
  });

  it('does not load OpenCode runtime commands/skills when Codex backend is active', async () => {
    const loadRuntimeCommands = jest.fn().mockResolvedValue([]);
    const loadRuntimeSkills = jest.fn().mockResolvedValue([]);
    const cache = new SlashCommandMenuCatalogCache(
      createCodexHost({ loadRuntimeCommands, loadRuntimeSkills }),
    );

    await cache.load();

    // OpenCode loaders must be bypassed for the Codex backend
    expect(loadRuntimeCommands).not.toHaveBeenCalled();
    expect(loadRuntimeSkills).not.toHaveBeenCalled();
  });

  it('produces no codex-skill items when the backend is not Codex', async () => {
    const cache = new SlashCommandMenuCatalogCache(
      createCodexHost({
        getBackendKey: () => 'opencode',
        loadCodexRuntimeSkills: async () => [{ name: 'should-not-appear' }],
      }),
    );

    const items = await cache.load();

    expect(items.filter((item) => item.source === 'codex-skill')).toHaveLength(0);
  });

  it('produces no codex-skill items when loadCodexRuntimeSkills returns null (app-server unavailable)', async () => {
    const cache = new SlashCommandMenuCatalogCache(
      createCodexHost({ loadCodexRuntimeSkills: async () => null }),
    );

    const items = await cache.load();

    expect(items.filter((item) => item.source === 'codex-skill')).toHaveLength(0);
  });

  it('survives a loadCodexRuntimeSkills rejection without breaking the menu', async () => {
    const cache = new SlashCommandMenuCatalogCache(
      createCodexHost({ loadCodexRuntimeSkills: async () => Promise.reject(new Error('boom')) }),
    );

    const items = await cache.load();

    expect(items.filter((item) => item.source === 'codex-skill')).toHaveLength(0);
  });
});
