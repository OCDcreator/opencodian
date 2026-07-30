const { execFileSync } = require('node:child_process');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'architecture-owner-lib.mjs');

function callExport(exportName, ...args) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    const result = mod[${JSON.stringify(exportName)}](...${JSON.stringify(args)});
    process.stdout.write(JSON.stringify(result));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  return JSON.parse(out);
}

function makeConfig() {
  return {
    schemaVersion: 1,
    sourceScopes: ['src/**/*.ts'],
    layers: [
      { id: 'shared', mayImportLayers: ['shared'] },
      { id: 'core', mayImportLayers: ['shared', 'core'] },
      { id: 'feature', mayImportLayers: ['shared', 'core', 'feature'] },
      { id: 'app', mayImportLayers: ['shared', 'core', 'feature', 'app'] },
    ],
    owners: [
      {
        id: 'core.storage',
        layer: 'core',
        include: ['src/core/storage/**'],
        delegatesTo: [],
        responsibilities: ['conversation persistence'],
        canonicalState: ['conversation store'],
        entrypoints: ['src/core/storage/StorageService.ts'],
        overviewDoc: 'docs/architecture/owners/core-storage.md',
      },
      {
        id: 'feature.chat',
        layer: 'feature',
        include: ['src/features/chat/**'],
        delegatesTo: [],
        responsibilities: ['chat ui'],
        canonicalState: [],
        entrypoints: ['src/features/chat/Chat.ts'],
        overviewDoc: 'docs/architecture/owners/feature-chat.md',
      },
    ],
    legacy: { unassigned: { explicitPaths: [], mustReachZeroBeforePhase: 1 } },
    dependencyExceptions: [],
  };
}

describe('evaluateOwnerBoundaries — line growth inside declared composition can pass', () => {
  test('a shell that grows LOC for owned responsibility passes', () => {
    const cfg = makeConfig();
    const result = callExport('evaluateOwnerBoundaries', cfg, [
      {
        path: 'src/core/storage/StorageService.ts',
        status: 'M',
        added: [
          '    // additional composition wiring inside the storage owner',
          '    this.persistConversation(conv);',
          '  }',
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.touchedOwners).toEqual(['core.storage']);
  });
});

describe('evaluateOwnerBoundaries — line deletion with duplicated state fails/hints', () => {
  test('a new Map added to an owner with existing canonical state is flagged', () => {
    const cfg = makeConfig();
    const result = callExport('evaluateOwnerBoundaries', cfg, [
      {
        path: 'src/core/storage/StorageService.ts',
        status: 'M',
        added: ['  private extraCache = new Map<string, unknown>();'],
      },
    ]);
    // The schema enforces uniqueness at load; here the heuristic flags an
    // *unregistered* second truth in code as a review hint (not a hard block,
    // since real duplication is a runtime/type concern for Task 5).
    expect(result.ok).toBe(true);
    expect(result.hints.length).toBeGreaterThan(0);
    expect(result.hints[0]).toContain('duplicate second truth');
  });
});

describe('evaluateOwnerBoundaries — ambiguous and unowned paths block', () => {
  test('an ambiguous path is a blocker', () => {
    const cfg = makeConfig();
    cfg.owners[0].include.push('src/disputed.ts');
    cfg.owners[1].include.push('src/disputed.ts');
    const result = callExport('evaluateOwnerBoundaries', cfg, [
      { path: 'src/disputed.ts', status: 'A', added: [] },
    ]);
    expect(result.ok).toBe(false);
    expect(result.blockers[0]).toContain('matches multiple owners');
  });

  test('an unowned non-legacy path is a blocker', () => {
    const cfg = makeConfig();
    const result = callExport('evaluateOwnerBoundaries', cfg, [
      { path: 'src/orphan/random.ts', status: 'A', added: [] },
    ]);
    expect(result.ok).toBe(false);
    expect(result.blockers[0]).toContain('not owned by any manifest owner');
  });
});

describe('collectThinLayerHints — review hint, not blocker', () => {
  test('a Facade/Adapter filename is flagged as a hint', () => {
    const diffs = [{ path: 'src/features/chat/ChatAdapter.ts', added: [] }];
    const hints = callExport('collectThinLayerHints', diffs);
    expect(hints.length).toBe(1);
    expect(hints[0].path).toBe('src/features/chat/ChatAdapter.ts');
  });

  test('a consumer-owned type-only port is not flagged', () => {
    const diffs = [{ path: 'src/core/storage/StoragePluginPort.ts', added: [] }];
    const hints = callExport('collectThinLayerHints', diffs, {
      typeOnlyPortPaths: ['src/core/storage/StoragePluginPort.ts'],
    });
    expect(hints).toEqual([]);
  });

  test('a normal filename is not flagged', () => {
    const diffs = [{ path: 'src/core/storage/StorageService.ts', added: [] }];
    const hints = callExport('collectThinLayerHints', diffs);
    expect(hints).toEqual([]);
  });
});
