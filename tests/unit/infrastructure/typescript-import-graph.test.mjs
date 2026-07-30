const { execFileSync } = require('node:child_process');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'typescript-import-graph.mjs');

// The classifier functions need a live TS module. We run them in a child
// process that imports both TS and the lib. The helper exposes `ts` and `mod`
// to the body; bodies must not redeclare them.
async function runAsync(fnSource) {
  const code = `
    import { pathToFileURL } from 'node:url';
    import tsDefault from 'typescript';
    const ts = tsDefault;
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    ${fnSource}
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  return JSON.parse(out.trim());
}

function extractEdges(sourceText, filePath = 'src/x.ts', knownFiles = new Set()) {
  return runAsync(`
    const edges = mod.extractEdges({ filePath: ${JSON.stringify(filePath)}, sourceText: ${JSON.stringify(sourceText)}, tsModule: ts, knownFiles: new Set(${JSON.stringify([...knownFiles])}) });
    process.stdout.write(JSON.stringify(edges));
  `);
}

describe('classifyImportKind — edge classification', () => {
  test('runtime-static value import', async () => {
    const edges = await extractEdges(
      `import { foo } from './bar';\n`,
      'src/x.ts',
      new Set(['src/bar.ts']),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe('runtime-static');
    expect(edges[0].to).toBe('src/bar.ts');
    expect(edges[0].external).toBe(false);
  });

  test('type-only import', async () => {
    const edges = await extractEdges(
      `import type { Foo } from './bar';\n`,
      'src/x.ts',
      new Set(['src/bar.ts']),
    );
    expect(edges[0].kind).toBe('type-only');
  });

  test('runtime-dynamic import()', async () => {
    const edges = await extractEdges(
      `const m = import('./bar');\n`,
      'src/x.ts',
      new Set(['src/bar.ts']),
    );
    expect(edges[0].kind).toBe('runtime-dynamic');
    expect(edges[0].to).toBe('src/bar.ts');
  });

  test('require() string literal', async () => {
    const edges = await extractEdges(
      `const m = require('./bar');\n`,
      'src/x.ts',
      new Set(['src/bar.ts']),
    );
    expect(edges[0].kind).toBe('require');
  });

  test('require() variable specifier is unresolved (fail closed)', async () => {
    const edges = await extractEdges(
      `const m = require(someVar);\n`,
      'src/x.ts',
      new Set(),
    );
    expect(edges[0].kind).toBe('require');
    expect(edges[0].unresolved).toBe(true);
    expect(edges[0].external).toBe(true);
  });

  test('re-export export ... from', async () => {
    const edges = await extractEdges(
      `export { foo } from './bar';\n`,
      'src/x.ts',
      new Set(['src/bar.ts']),
    );
    expect(edges[0].kind).toBe('re-export');
  });

  test('export type ... from is type-only', async () => {
    const edges = await extractEdges(
      `export type { Foo } from './bar';\n`,
      'src/x.ts',
      new Set(['src/bar.ts']),
    );
    expect(edges[0].kind).toBe('type-only');
  });
});

describe('resolveSpecifier — path alias and barrels', () => {
  test('resolves @/ alias to src/', async () => {
    const result = await runAsync(`
      process.stdout.write(JSON.stringify(mod.resolveSpecifier('@/core/foo', 'src/main.ts', { knownFiles: new Set(['src/core/foo.ts']), aliasPrefix: 'src', aliasTarget: '@' })));
    `);
    expect(result).toBe('src/core/foo.ts');
  });

  test('resolves barrel index.ts', async () => {
    const result = await runAsync(`
      process.stdout.write(JSON.stringify(mod.resolveSpecifier('./sub', 'src/main.ts', { knownFiles: new Set(['src/sub/index.ts']) })));
    `);
    expect(result).toBe('src/sub/index.ts');
  });

  test('returns null for external npm package', async () => {
    const result = await runAsync(`
      process.stdout.write(JSON.stringify(mod.resolveSpecifier('obsidian', 'src/main.ts', { knownFiles: new Set() })));
    `);
    expect(result).toBeNull();
  });
});

describe('edgeId — content-addressed stability', () => {
  test('stable across the same edge, no line numbers', async () => {
    const id1 = await runAsync(`process.stdout.write(JSON.stringify(mod.edgeId({ from:'src/a.ts', to:'src/b.ts', kind:'runtime-static', specifier:'./b' })));`);
    const id2 = await runAsync(`process.stdout.write(JSON.stringify(mod.edgeId({ from:'src/a.ts', to:'src/b.ts', kind:'runtime-static', specifier:'./b' })));`);
    expect(id1).toBe(id2);
    expect(id1).toBe('src/a.ts|src/b.ts|runtime-static|./b');
  });
});

describe('classifySccs — runtime vs type-only vs mixed cycles', () => {
  test('a pure runtime cycle is a runtime SCC', async () => {
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'runtime-static', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'runtime-static', specifier: './a', external: false },
    ];
    const result = await runAsync(`process.stdout.write(JSON.stringify(mod.classifySccs(${JSON.stringify(edges)})));`);
    expect(result.runtimeSccs.length).toBe(1);
    expect(result.typeOnlySccs.length).toBe(0);
    expect(result.mixedSccs.length).toBe(0);
  });

  test('a pure type-only cycle is NOT a runtime SCC', async () => {
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'type-only', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
    ];
    const result = await runAsync(`process.stdout.write(JSON.stringify(mod.classifySccs(${JSON.stringify(edges)})));`);
    expect(result.runtimeSccs.length).toBe(0);
    expect(result.typeOnlySccs.length).toBe(1);
    expect(result.mixedSccs.length).toBe(0);
  });

  test('a cycle with both runtime and type-only edges is mixed, not runtime', async () => {
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'runtime-static', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
    ];
    const result = await runAsync(`process.stdout.write(JSON.stringify(mod.classifySccs(${JSON.stringify(edges)})));`);
    expect(result.runtimeSccs.length).toBe(0);
    expect(result.mixedSccs.length).toBe(1);
  });
});

describe('generateBaseline + diffAgainstBaseline', () => {
  test('baseline is content-addressed and stable', async () => {
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'type-only', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
    ];
    const b1 = await runAsync(`process.stdout.write(JSON.stringify(mod.generateBaseline(${JSON.stringify(edges)})));`);
    const b2 = await runAsync(`process.stdout.write(JSON.stringify(mod.generateBaseline(${JSON.stringify(edges)})));`);
    // generatedAt legitimately varies; the content-addressed part must be stable.
    const strip = (b) => { const { generatedAt, ...rest } = b; return rest; };
    expect(strip(b1)).toEqual(strip(b2));
    expect(b1.typeOnlySccs.length).toBe(1);
    expect(b1.runtimeSccs.length).toBe(0);
  });

  test('a new runtime SCC is a blocker', async () => {
    const baseline = await runAsync(`process.stdout.write(JSON.stringify(mod.generateBaseline(${JSON.stringify([
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'type-only', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
    ]) })));`);
    const current = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'type-only', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
      { from: 'src/c.ts', to: 'src/d.ts', kind: 'runtime-static', specifier: './d', external: false },
      { from: 'src/d.ts', to: 'src/c.ts', kind: 'runtime-static', specifier: './c', external: false },
    ];
    const diff = await runAsync(`process.stdout.write(JSON.stringify(mod.diffAgainstBaseline(${JSON.stringify(current)}, ${JSON.stringify(baseline)})));`);
    expect(diff.newRuntimeSccs.length).toBe(1);
    expect(diff.newTypeCouplingMembers.length).toBe(0);
  });

  test('a new member in a baseline type-coupling SCC is a blocker', async () => {
    const baseline = await runAsync(`process.stdout.write(JSON.stringify(mod.generateBaseline(${JSON.stringify([
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'type-only', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
    ]) })));`);
    // Now add c into the cycle (grows the type-only SCC).
    const current = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'type-only', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/c.ts', kind: 'type-only', specifier: './c', external: false },
      { from: 'src/c.ts', to: 'src/a.ts', kind: 'type-only', specifier: './a', external: false },
    ];
    const diff = await runAsync(`process.stdout.write(JSON.stringify(mod.diffAgainstBaseline(${JSON.stringify(current)}, ${JSON.stringify(baseline)})));`);
    expect(diff.newTypeCouplingMembers.length).toBeGreaterThan(0);
  });

  test('a new reverse-layer edge is a blocker', async () => {
    const baseline = await runAsync(`process.stdout.write(JSON.stringify(mod.generateBaseline([])));`);
    const current = [
      { from: 'src/core/x.ts', to: 'src/features/y.ts', kind: 'runtime-static', specifier: '@/features/y', external: false },
    ];
    const isReverse = (from, to) => from.startsWith('src/core/') && to.startsWith('src/features/');
    const diff = await runAsync(`process.stdout.write(JSON.stringify(mod.diffAgainstBaseline(${JSON.stringify(current)}, ${JSON.stringify(baseline)}, { isReverseEdge: ${isReverse.toString()} })));`);
    expect(diff.newReverseEdges.length).toBe(1);
  });
});

describe('re-export edges are runtime-carrying (Codex Phase 1 review fix)', () => {
  test('a pure value re-export cycle IS a runtime SCC', async () => {
    const edges = [
      { from: 'src/a.ts', to: 'src/b.ts', kind: 're-export', specifier: './b', external: false },
      { from: 'src/b.ts', to: 'src/a.ts', kind: 're-export', specifier: './a', external: false },
    ];
    const result = await runAsync(`process.stdout.write(JSON.stringify(mod.classifySccs(${JSON.stringify(edges)})));`);
    expect(result.runtimeSccs.length).toBe(1);
    expect(result.typeOnlySccs.length).toBe(0);
    expect(result.mixedSccs.length).toBe(0);
  });

  test('isRuntimeEdge returns true for re-export', async () => {
    const result = await runAsync(`process.stdout.write(JSON.stringify(mod.isRuntimeEdge({ kind: 're-export' })));`);
    expect(result).toBe(true);
  });
});
