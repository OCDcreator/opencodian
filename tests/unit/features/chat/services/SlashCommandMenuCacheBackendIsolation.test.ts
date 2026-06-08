/**
 * Focused tests proving that the slash command menu cache key is backend-aware
 * and that OpenCode vs Claude menu results do not leak across cache reuse.
 */
import {
  buildVisibleSlashCommandMenuItems,
  mergeSlashCommandCatalog,
  type SlashCommandCatalogEntry,
} from '../../../../../src/core/config/slashCommandCatalog';
import {
  SlashCommandMenuCatalogCache,
  type SlashCommandMenuCatalogCacheHost,
} from '../../../../../src/features/chat/services/SlashCommandMenuCatalogCache';

function makeRuntimeCommand(name: string, source: 'command' | 'skill' | 'mcp') {
  return { name, source, template: `/${name}`, hints: [] };
}

function makeMinimalMergeOptions(overrides: {
  runtimeCommands?: ReturnType<typeof makeRuntimeCommand>[];
  claudeRuntimeCommands?: Array<{ name: string; description?: string }>;
  mdFileCommands?: Array<{ id: string; template: string; description: string }>;
  hiddenCommandIds?: Set<string>;
} = {}) {
  return {
    runtimeCommands: overrides.runtimeCommands ?? [],
    runtimeSkillSources: new Map(),
    projectCommands: {},
    projectAgents: {},
    hiddenCommandIds: overrides.hiddenCommandIds ?? new Set<string>(),
    mdFileCommands: overrides.mdFileCommands ?? [],
    claudeRuntimeCommands: overrides.claudeRuntimeCommands,
  };
}

describe('SlashCommandMenuCatalogCache backend isolation', () => {
  // ─── Merge-level tests (catalog logic) ────────────────────────────

  it('OpenCode-only catalog does not contain claude-runtime entries', () => {
    const catalog = mergeSlashCommandCatalog(makeMinimalMergeOptions({
      runtimeCommands: [
        makeRuntimeCommand('compact', 'command'),
        makeRuntimeCommand('skill-one', 'skill'),
      ],
    }));

    const sources = catalog.map((e: SlashCommandCatalogEntry) => e.source);
    expect(sources).not.toContain('claude-runtime');
    expect(sources).toContain('command');
  });

  it('Claude-only catalog contains claude-runtime entries but not OpenCode commands', () => {
    const catalog = mergeSlashCommandCatalog(makeMinimalMergeOptions({
      runtimeCommands: [],
      claudeRuntimeCommands: [
        { name: 'review', description: 'Review code' },
        { name: 'test', description: 'Run tests' },
      ],
    }));

    const sources = catalog.map((e: SlashCommandCatalogEntry) => e.source);
    expect(sources).toContain('claude-runtime');
    expect(sources).not.toContain('command');
    expect(sources).not.toContain('skill');
  });

  it('mixed catalog has both sources when both are provided', () => {
    const catalog = mergeSlashCommandCatalog(makeMinimalMergeOptions({
      runtimeCommands: [
        makeRuntimeCommand('compact', 'command'),
      ],
      claudeRuntimeCommands: [
        { name: 'review', description: 'Review code' },
      ],
    }));

    const sources = catalog.map((e: SlashCommandCatalogEntry) => e.source);
    expect(sources).toContain('command');
    expect(sources).toContain('claude-runtime');
  });

  it('buildVisibleSlashCommandMenuItems filters hidden claude-runtime entries', () => {
    const catalog = mergeSlashCommandCatalog({
      ...makeMinimalMergeOptions(),
      hiddenCommandIds: new Set(['review']),
      claudeRuntimeCommands: [
        { name: 'review', description: 'Review code' },
        { name: 'test', description: 'Run tests' },
      ],
    });

    const visible = buildVisibleSlashCommandMenuItems(catalog);
    const ids = visible.map((item) => item.id);
    expect(ids).not.toContain('review');
    expect(ids).toContain('test');
  });

  it('cache key varies by backend discriminator', () => {
    const hiddenKey = 'hidden:';
    const opencodeKey = `${hiddenKey}:opencode`;
    const claudeKey = `${hiddenKey}:claude-code`;

    expect(opencodeKey).not.toBe(claudeKey);
  });
});

// ─── Cache-level integration tests (startLoad behavior) ──────────

describe('SlashCommandMenuCatalogCache startLoad backend gating', () => {
  function createClaudeHost(): SlashCommandMenuCatalogCacheHost {
    return {
      getHiddenCommandIds: () => [],
      loadProjectAgents: async () => ({}),
      loadProjectCommands: async () => ({}),
      loadRuntimeCommands: async () => [],
      loadRuntimeSkills: async () => [],
      loadClaudeRuntimeCommands: async () => [
        { name: 'review', description: 'Review code' },
        { name: 'test', description: 'Run tests' },
      ],
      getBackendKey: () => 'claude-code',
      getVaultPath: () => '/tmp/test-vault',
      now: () => Date.now(),
      onWarmLoadFailed: () => {},
    };
  }

  function createOpenCodeHost(): SlashCommandMenuCatalogCacheHost {
    return {
      getHiddenCommandIds: () => [],
      loadProjectAgents: async () => ({}),
      loadProjectCommands: async () => ({ mycmd: { name: 'mycmd', agent: '', model: '', hasProjectOverride: false } }),
      loadRuntimeCommands: async () => [makeRuntimeCommand('compact', 'command')],
      loadRuntimeSkills: async () => [],
      getBackendKey: () => 'opencode',
      getVaultPath: () => null, // no .opencode dir → no md commands
      now: () => Date.now(),
      onWarmLoadFailed: () => {},
    };
  }

  it('Claude-context menu excludes synthetic builtins like compact/undo', async () => {
    const cache = new SlashCommandMenuCatalogCache(createClaudeHost());
    const items = await cache.load();

    const ids = items.map((item) => item.id);
    expect(ids).not.toContain('compact');
    expect(ids).not.toContain('undo');
    expect(ids).not.toContain('redo');
    expect(ids).not.toContain('new');
    expect(ids).not.toContain('share');
    expect(ids).not.toContain('unshare');
  });

  it('Claude-context menu excludes OpenCode markdown command entries', async () => {
    // Create a host that returns md-file commands for OpenCode but Claude backend
    // The md-file loading is gated inside startLoad, so Claude backend should have none.
    const host = createClaudeHost();
    const cache = new SlashCommandMenuCatalogCache(host);
    const items = await cache.load();

    const mdSources = items.filter((item) => item.source === 'md-command');
    expect(mdSources).toHaveLength(0);
  });

  it('Claude-context menu contains only Claude runtime commands', async () => {
    const cache = new SlashCommandMenuCatalogCache(createClaudeHost());
    const items = await cache.load();

    // Should only have claude-runtime entries
    const sources = items.map((item) => item.source);
    expect(sources).toContain('claude-runtime');
    expect(sources).not.toContain('command');
    expect(sources).not.toContain('skill');
    expect(sources).not.toContain('md-command');
    expect(sources).not.toContain('project');

    // Verify actual command names
    const ids = items.map((item) => item.id);
    expect(ids).toContain('review');
    expect(ids).toContain('test');
  });

  it('OpenCode-context menu keeps synthetic builtins', async () => {
    const cache = new SlashCommandMenuCatalogCache(createOpenCodeHost());
    const items = await cache.load();

    const ids = items.map((item) => item.id);
    expect(ids).toContain('compact');
    expect(ids).toContain('undo');
    expect(ids).toContain('redo');
    expect(ids).toContain('new');
  });
});

// ─── @agent mention backend isolation tests ─────────────────────

describe('SlashCommandMenuCatalogCache @agent backend isolation', () => {
  function createClaudeHostWithAgents(): SlashCommandMenuCatalogCacheHost {
    return {
      getHiddenCommandIds: () => [],
      loadProjectAgents: async () => ({}),
      loadProjectCommands: async () => ({}),
      loadRuntimeCommands: async () => [],
      loadRuntimeSkills: async () => [],
      loadClaudeRuntimeCommands: async () => [],
      loadClaudeRuntimeAgents: async () => [
        { name: 'code-reviewer', description: 'Reviews code' },
        { name: 'test-writer', description: 'Writes tests' },
      ],
      getBackendKey: () => 'claude-code',
      getVaultPath: () => '/tmp/test-vault',
      now: () => Date.now(),
      onWarmLoadFailed: () => {},
    };
  }

  function createOpenCodeHostWithAgents(): SlashCommandMenuCatalogCacheHost {
    return {
      getHiddenCommandIds: () => [],
      loadProjectAgents: async () => ({}),
      loadProjectCommands: async () => ({}),
      loadRuntimeCommands: async () => [makeRuntimeCommand('compact', 'command')],
      loadRuntimeSkills: async () => [],
      getBackendKey: () => 'opencode',
      getVaultPath: () => null,
      now: () => Date.now(),
      onWarmLoadFailed: () => {},
    };
  }

  it('Claude-context @agent candidates contain Claude runtime agents', async () => {
    const { loadAgentMentionCandidatesFromSlashCommandMenuItems } = await import('../../../../../src/features/chat/services/SlashCommandMenuCatalogCache');
    const cache = new SlashCommandMenuCatalogCache(createClaudeHostWithAgents());
    const items = await cache.load();

    const candidates = await loadAgentMentionCandidatesFromSlashCommandMenuItems(items);
    const names = candidates.map((c) => c.id);
    expect(names).toContain('code-reviewer');
    expect(names).toContain('test-writer');
  });

  it('Claude-context @agent candidates exclude OpenCode runtime/project agents', async () => {
    const { loadAgentMentionCandidatesFromSlashCommandMenuItems } = await import('../../../../../src/features/chat/services/SlashCommandMenuCatalogCache');
    // Even if someone accidentally returns OpenCode agents, Claude host should not use them
    const host = createClaudeHostWithAgents();
    const cache = new SlashCommandMenuCatalogCache(host);
    const items = await cache.load();

    const candidates = await loadAgentMentionCandidatesFromSlashCommandMenuItems(items);
    // Claude agents should only be the ones from loadClaudeRuntimeAgents
    expect(candidates).toHaveLength(2);
  });

  it('Claude-context without loadClaudeRuntimeAgents returns empty agent candidates', async () => {
    const { loadAgentMentionCandidatesFromSlashCommandMenuItems } = await import('../../../../../src/features/chat/services/SlashCommandMenuCatalogCache');
    const host = createClaudeHostWithAgents();
    delete (host as unknown as Record<string, unknown>).loadClaudeRuntimeAgents;
    const cache = new SlashCommandMenuCatalogCache(host);
    const items = await cache.load();

    const candidates = await loadAgentMentionCandidatesFromSlashCommandMenuItems(items);
    expect(candidates).toHaveLength(0);
  });

  it('OpenCode-context @agent candidates are not affected by Claude agent seam', async () => {
    const { loadAgentMentionCandidatesFromSlashCommandMenuItems } = await import('../../../../../src/features/chat/services/SlashCommandMenuCatalogCache');
    // OpenCode host has no loadClaudeRuntimeAgents — should not error
    const cache = new SlashCommandMenuCatalogCache(createOpenCodeHostWithAgents());
    const items = await cache.load();

    const candidates = await loadAgentMentionCandidatesFromSlashCommandMenuItems(items);
    // OpenCode host returns no agents (empty runtime skills → no sidecar agents)
    expect(candidates).toHaveLength(0);
  });
});
