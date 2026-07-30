const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'architecture-owner-lib.mjs');

function callExport(exportName, ...args) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const modulePath = ${JSON.stringify(modulePath)};
    const mod = await import(pathToFileURL(modulePath).href);
    const result = mod[${JSON.stringify(exportName)}](...${JSON.stringify(args)});
    process.stdout.write(JSON.stringify(result, (key, value) =>
      value instanceof RegExp ? { __regex: value.source } : value));
  `;

  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });

  return JSON.parse(output);
}

function makeValidConfig(overrides = {}) {
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
        id: 'app.composition',
        layer: 'app',
        include: ['src/main.ts'],
        delegatesTo: [],
        responsibilities: ['plugin composition'],
        canonicalState: ['plugin instance'],
        entrypoints: ['OpenCodianPlugin'],
        allowedOwnerDependencies: ['core.storage'],
        forbiddenDependencies: ['feature.chat-shell'],
        adjacentOwners: [],
        tests: ['tests/unit/main.test.ts'],
        overviewDoc: 'docs/architecture/owners/app-composition.md',
        requiredGates: ['typecheck'],
        risk: 'high',
      },
      {
        id: 'core.storage',
        layer: 'core',
        include: ['src/core/storage/**'],
        delegatesTo: [],
        responsibilities: ['conversation persistence'],
        canonicalState: ['conversation store'],
        entrypoints: ['StorageService'],
        overviewDoc: 'docs/architecture/owners/core-storage.md',
        risk: 'medium',
      },
    ],
    legacy: {
      unassigned: {
        explicitPaths: [],
        mustReachZeroBeforePhase: 1,
      },
    },
    dependencyExceptions: [],
    ...overrides,
  };
}

describe('validateConfig — strict schema', () => {
  test('accepts a well-formed config', () => {
    expect(callExport('validateConfig', makeValidConfig())).toEqual({ ok: true, errors: [] });
  });

  test('rejects unknown top-level key', () => {
    const cfg = makeValidConfig({ randomKey: true });
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown top-level key'))).toBe(true);
  });

  test('rejects unknown owner key', () => {
    const cfg = makeValidConfig();
    cfg.owners[0].surprise = true;
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /unknown key/.test(e))).toBe(true);
  });

  test('rejects unknown layer key', () => {
    const cfg = makeValidConfig();
    cfg.layers[0].extra = true;
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /layers\[0\] unknown key/.test(e))).toBe(true);
  });

  test('rejects schemaVersion other than 1', () => {
    const cfg = makeValidConfig({ schemaVersion: 2 });
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('schemaVersion must be 1'))).toBe(true);
  });

  test('rejects invalid risk level', () => {
    const cfg = makeValidConfig();
    cfg.owners[0].risk = 'critical';
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('risk must be one of'))).toBe(true);
  });

  test('rejects missing required layer', () => {
    const cfg = makeValidConfig({
      layers: [{ id: 'shared', mayImportLayers: ['shared'] }],
    });
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing required layer'))).toBe(true);
  });
});

describe('validateConfig — zero-owner / ambiguous-owner', () => {
  test('classifies a zero-owner path via classifyPath', () => {
    const cfg = makeValidConfig();
    expect(callExport('classifyPath', cfg, 'src/core/opencode/OpenCodeService.ts')).toEqual({
      unassigned: true,
      explicit: false,
    });
  });

  test('classifies an ambiguous-owner path when two includes match', () => {
    const cfg = makeValidConfig();
    cfg.owners[0].include.push('src/core/storage/StorageService.ts');
    const result = callExport('classifyPath', cfg, 'src/core/storage/StorageService.ts');
    expect(result.ambiguous).toBeDefined();
    expect(result.ambiguous.sort()).toEqual(['app.composition', 'core.storage']);
  });
});

describe('validateConfig — delegation', () => {
  test('rejects delegation to unknown owner', () => {
    const cfg = makeValidConfig();
    cfg.owners[0].delegatesTo = ['core.nonexistent'];
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('delegatesTo references unknown owner'))).toBe(true);
  });

  test('structured delegation reduces ambiguity', () => {
    const cfg = makeValidConfig();
    cfg.owners.push({
      id: 'core.storage.vault',
      layer: 'core',
      include: ['src/core/storage/vault.ts'],
      delegatesTo: [],
      responsibilities: ['vault path resolution'],
      canonicalState: [],
      entrypoints: [],
      overviewDoc: 'docs/architecture/owners/core-storage-vault.md',
    });
    cfg.owners[1].delegatesTo = ['core.storage.vault'];
    cfg.owners[1].include = ['src/core/storage/**'];
    const classification = callExport('classifyPath', cfg, 'src/core/storage/vault.ts');
    expect(classification.assigned).toBe('core.storage.vault');
  });

  test('rejects delegation cycle', () => {
    const cfg = makeValidConfig();
    cfg.owners.push(
      {
        id: 'a.b',
        layer: 'core',
        include: ['src/a/**'],
        delegatesTo: ['a.c'],
        responsibilities: ['x'],
        overviewDoc: 'docs/a.md',
      },
      {
        id: 'a.c',
        layer: 'core',
        include: ['src/c/**'],
        delegatesTo: ['a.b'],
        responsibilities: ['y'],
        overviewDoc: 'docs/c.md',
      },
    );
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid delegation cycle'))).toBe(true);
  });
});

describe('validateConfig — canonical state uniqueness', () => {
  test('rejects duplicate canonical state across owners', () => {
    const cfg = makeValidConfig();
    cfg.owners[1].canonicalState = ['plugin instance'];
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate canonical state'))).toBe(true);
  });
});

describe('validateConfig — legacy unassigned', () => {
  test('rejects glob in explicitPaths', () => {
    const cfg = makeValidConfig();
    cfg.legacy.unassigned.explicitPaths = ['src/**'];
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('must be an exact path, not a glob'))).toBe(true);
  });

  test('accepts exact paths only', () => {
    const cfg = makeValidConfig();
    cfg.legacy.unassigned.explicitPaths = ['src/legacy/orphan.ts'];
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(true);
  });
});

describe('validateConfig — dependency exceptions', () => {
  test('rejects expired/invalid date exception', () => {
    const cfg = makeValidConfig({
      dependencyExceptions: [
        {
          id: 'debt-1',
          baselineEdgeId: 'edge-1',
          ruleId: 'TYPE_COUPLING',
          reason: 'historical debt',
          characterizationTests: [],
          retirementPhase: 'Phase 5',
          expiresAt: 'not-a-date',
        },
      ],
    });
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('expiresAt is not a valid date'))).toBe(true);
  });

  test('rejects unknown exception key', () => {
    const cfg = makeValidConfig({
      dependencyExceptions: [
        {
          id: 'debt-1',
          baselineEdgeId: 'edge-1',
          ruleId: 'TYPE_COUPLING',
          reason: 'historical debt',
          characterizationTests: [],
          retirementPhase: 'Phase 5',
          expiresAt: '2026-12-31T00:00:00Z',
          approvedBy: 'agent',
        },
      ],
    });
    const result = callExport('validateConfig', cfg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /unknown key/.test(e))).toBe(true);
  });
});

describe('checkCoverage', () => {
  test('reports covered, unassigned, and ambiguous', () => {
    const cfg = makeValidConfig();
    const paths = [
      'src/main.ts', // covered
      'src/core/storage/StorageService.ts', // covered
      'src/orphan.ts', // unassigned not explicit
      'src/shared/disputed.ts', // ambiguous
    ];
    cfg.owners[0].include.push('src/shared/disputed.ts');
    cfg.owners[1].include.push('src/shared/disputed.ts');
    const result = callExport('checkCoverage', cfg, paths);
    expect(result.covered).toBe(2);
    expect(result.unassigned).toEqual([
      { path: 'src/orphan.ts', explicit: false },
    ]);
    expect(result.ambiguous).toEqual([
      { path: 'src/shared/disputed.ts', owners: expect.arrayContaining(['app.composition', 'core.storage']) },
    ]);
  });
});

describe('findMissingOverviewDocs and auditPathReferences', () => {
  let tmpRoot;
  let tmpConfig;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-lib-'));
    fs.mkdirSync(path.join(tmpRoot, 'docs/architecture/owners'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'docs/architecture/owners/app-composition.md'), '# x');
    fs.writeFileSync(path.join(tmpRoot, 'docs/architecture/owners/core-storage.md'), '# y');
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'src/main.ts'), 'export {}');
    tmpConfig = makeValidConfig();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('findMissingOverviewDocs reports missing docs', () => {
    tmpConfig.owners.push({
      id: 'feature.chat',
      layer: 'feature',
      include: ['src/features/chat/**'],
      responsibilities: ['chat'],
      overviewDoc: 'docs/architecture/owners/feature-chat.md',
    });
    const missing = callExport('findMissingOverviewDocs', tmpRoot, tmpConfig);
    expect(missing).toEqual([
      { ownerId: 'feature.chat', overviewDoc: 'docs/architecture/owners/feature-chat.md' },
    ]);
  });

  test('auditPathReferences reports missing entrypoints and empty tests', () => {
    tmpConfig.owners[0].entrypoints = ['src/main.ts', 'src/missing-file.ts'];
    tmpConfig.owners[0].tests = ['tests/unit/orphan/**'];
    const result = callExport('auditPathReferences', tmpRoot, tmpConfig);
    expect(result.missingEntrypoints).toEqual([
      { ownerId: 'app.composition', entrypoint: 'src/missing-file.ts' },
    ]);
    expect(result.emptyTests).toEqual([{ ownerId: 'app.composition', tests: 'tests/unit/orphan/**' }]);
  });
});

describe('resolveOwner', () => {
  test('resolves by id', () => {
    const cfg = makeValidConfig();
    const owner = callExport('resolveOwner', cfg, 'core.storage');
    expect(owner.id).toBe('core.storage');
  });

  test('resolves by source path', () => {
    const cfg = makeValidConfig();
    const owner = callExport('resolveOwner', cfg, 'src/core/storage/StorageService.ts');
    expect(owner.id).toBe('core.storage');
  });

  test('resolves by entrypoint symbol', () => {
    const cfg = makeValidConfig();
    const owner = callExport('resolveOwner', cfg, 'OpenCodianPlugin');
    expect(owner.id).toBe('app.composition');
  });

  test('returns null for unknown query', () => {
    const cfg = makeValidConfig();
    expect(callExport('resolveOwner', cfg, 'nope')).toBeNull();
  });
});
