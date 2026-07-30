const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'graph-input-digest.mjs');

function callExport(exportName, ...args) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    const result = mod[${JSON.stringify(exportName)}](...${JSON.stringify(args)});
    process.stdout.write(JSON.stringify(result, (k,v) => v instanceof Map ? [...v] : v));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  return JSON.parse(out);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Build a fake repo dir with controlled file contents, then call
// collectGraphInputRecords with a readFile that reads from it.
function makeFakeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-digest-'));
  // init git so ls-files works
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function collectInRepo(dir, opts = {}) {
  const code = `
    import { pathToFileURL } from 'node:url';
    import fs from 'node:fs';
    import path from 'node:path';
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    const records = mod.collectGraphInputRecords(${JSON.stringify(dir)}, {
      readFile: (p) => fs.readFileSync(p),
      graphifyVersion: ${JSON.stringify(opts.graphifyVersion ?? '')} || undefined,
    });
    process.stdout.write(JSON.stringify(records));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', code], { encoding: 'utf8' }));
}

describe('computeGraphInputDigest — determinism', () => {
  test('same records in different order yield the same digest', () => {
    const recsA = [
      { kind: 'src', key: 'src/b.ts', sha256: 'b' },
      { kind: 'src', key: 'src/a.ts', sha256: 'a' },
    ];
    const recsB = [
      { kind: 'src', key: 'src/a.ts', sha256: 'a' },
      { kind: 'src', key: 'src/b.ts', sha256: 'b' },
    ];
    expect(callExport('computeGraphInputDigest', recsA)).toBe(callExport('computeGraphInputDigest', recsB));
  });

  test('a byte change in a source file changes the digest', () => {
    const dir1 = makeFakeRepo({ 'src/a.ts': 'export const x = 1;\n', 'package.json': '{}' });
    const dir2 = makeFakeRepo({ 'src/a.ts': 'export const x = 2;\n', 'package.json': '{}' });
    const r1 = collectInRepo(dir1);
    const r2 = collectInRepo(dir2);
    const d1 = callExport('computeGraphInputDigest', r1);
    const d2 = callExport('computeGraphInputDigest', r2);
    expect(d1).not.toBe(d2);
    fs.rmSync(dir1, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  test('comment-only source change changes the digest (conservative by design)', () => {
    const dir1 = makeFakeRepo({ 'src/a.ts': 'export const x = 1;\n', 'package.json': '{}' });
    const dir2 = makeFakeRepo({ 'src/a.ts': '// a comment\nexport const x = 1;\n', 'package.json': '{}' });
    const d1 = callExport('computeGraphInputDigest', collectInRepo(dir1));
    const d2 = callExport('computeGraphInputDigest', collectInRepo(dir2));
    expect(d1).not.toBe(d2);
    fs.rmSync(dir1, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});

describe('collectGraphInputRecords — envelope coverage', () => {
  test('includes src files, package.json, tsconfig, wrapper, ignore', () => {
    const dir = makeFakeRepo({
      'src/a.ts': 'a',
      'src/sub/b.ts': 'b',
      'package.json': '{}',
      'package-lock.json': '{}',
      'tsconfig.json': '{}',
      '.gitignore': 'node_modules',
      'scripts/update-graphify-src.mjs': '// w',
      'scripts/run-graphify-update.py': '# w',
    });
    const records = collectInRepo(dir, { graphifyVersion: '1.0.0' });
    const keys = records.map((r) => `${r.kind}:${r.key}`);
    expect(keys).toContain('src:src/a.ts');
    expect(keys).toContain('src:src/sub/b.ts');
    expect(keys).toContain('package:package.json');
    expect(keys).toContain('package:package-lock.json');
    expect(keys).toContain('tsconfig:tsconfig.json');
    expect(keys).toContain('ignore:.gitignore');
    expect(keys).toContain('wrapper:scripts/update-graphify-src.mjs');
    expect(keys).toContain('wrapper:scripts/run-graphify-update.py');
    expect(keys).toContain('tool:graphify-version');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('excludes transient src/graphify-out', () => {
    const dir = makeFakeRepo({
      'src/a.ts': 'a',
      'package.json': '{}',
      'src/graphify-out/GRAPH_REPORT.md': 'transient',
    });
    const records = collectInRepo(dir);
    const keys = records.map((r) => r.key);
    expect(keys).toContain('src/a.ts');
    expect(keys.some((k) => k.startsWith('src/graphify-out/'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('checkFreshness', () => {
  test('fresh=true when digests match', () => {
    const dir = makeFakeRepo({ 'src/a.ts': 'a', 'package.json': '{}' });
    const manifest = callExport('buildInputManifest', dir, {});
    // recompute with same content
    const code = `
      import { pathToFileURL } from 'node:url';
      import fs from 'node:fs';
      const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
      const m = mod.buildInputManifest(${JSON.stringify(dir)}, {});
      const r = mod.checkFreshness(${JSON.stringify(dir)}, m, {});
      process.stdout.write(JSON.stringify(r));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', code], { encoding: 'utf8' }));
    expect(result.fresh).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('fresh=false with changedRecords when content changes', () => {
    const dir1 = makeFakeRepo({ 'src/a.ts': 'a', 'package.json': '{}' });
    const manifest1 = callExport('buildInputManifest', dir1, {});
    // change content in same dir
    fs.writeFileSync(path.join(dir1, 'src/a.ts'), 'changed');
    const code = `
      import { pathToFileURL } from 'node:url';
      const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
      const r = mod.checkFreshness(${JSON.stringify(dir1)}, ${JSON.stringify(manifest1)}, {});
      process.stdout.write(JSON.stringify(r));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', code], { encoding: 'utf8' }));
    expect(result.fresh).toBe(false);
    expect(result.changedRecords.some((c) => c.key === 'src/a.ts')).toBe(true);
    fs.rmSync(dir1, { recursive: true, force: true });
  });
});
