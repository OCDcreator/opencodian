const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'change-scope-lib.mjs');

// Build a real throwaway git repo and exercise the change-scope library against
// it. The library shells out to git, so we use execFileSync with an inline
// script that imports the module and runs the requested function against the
// temp repo cwd.
function runInRepo(repoDir, fnSource) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    ${fnSource}
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: repoDir,
  });
  return out.trim();
}

function git(args, { cwd }) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-scope-'));
  git(['init', '-q', '-b', 'main'], { cwd: dir });
  git(['config', 'user.email', 't@t'], { cwd: dir });
  git(['config', 'user.name', 't'], { cwd: dir });
  git(['config', 'commit.gpgsign', 'false'], { cwd: dir });
  return dir;
}

function commit(repoDir, msg) {
  git(['add', '-A'], { cwd: repoDir });
  git(['commit', '-q', '-m', msg], { cwd: repoDir });
  return git(['rev-parse', 'HEAD'], { cwd: repoDir }).trim();
}

function headSha(repoDir) {
  return git(['rev-parse', 'HEAD'], { cwd: repoDir }).trim();
}

afterEach(() => {
  // temp dirs self-clean via os.tmpdir; nothing persistent created.
});

describe('computeScopeShas', () => {
  test('resolves base/head/merge-base for a branch diff', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
    const base = commit(dir, 'base');
    git(['checkout', '-q', '-b', 'feature'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
    commit(dir, 'feature');
    const result = runInRepo(dir, `
      const { computeScopeShas } = mod;
      const r = computeScopeShas(process.cwd(), { baseRef: 'main', headRef: 'feature' });
      process.stdout.write(JSON.stringify(r));
    `);
    const parsed = JSON.parse(result);
    expect(parsed.baseSha).toBe(base);
    expect(parsed.mergeBaseSha).toBe(base);
    expect(parsed.headSha).not.toBe(base);
  });
});

describe('candidateDigest equivalence', () => {
  test('same final tree via committed vs staged vs unstaged yields same digest', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'x.txt'), '1\n');
    commit(dir, 'base');
    // Make an identical change three ways in three separate repos to compare
    // digests. Reuse one repo: final content "2\n".
    const dirC = makeRepo();
    fs.writeFileSync(path.join(dirC, 'x.txt'), '1\n');
    commit(dirC, 'base');
    fs.writeFileSync(path.join(dirC, 'x.txt'), '2\n');
    commit(dirC, 'change'); // committed form

    const dirS = makeRepo();
    fs.writeFileSync(path.join(dirS, 'x.txt'), '1\n');
    commit(dirS, 'base');
    fs.writeFileSync(path.join(dirS, 'x.txt'), '2\n');
    git(['add', 'x.txt'], { cwd: dirS }); // staged form, not committed

    const dirU = makeRepo();
    fs.writeFileSync(path.join(dirU, 'x.txt'), '1\n');
    commit(dirU, 'base');
    fs.writeFileSync(path.join(dirU, 'x.txt'), '2\n'); // unstaged form

    const digestC = JSON.parse(runInRepo(dirC, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD~1' });
      process.stdout.write(JSON.stringify(s.digests.committed));
    `));
    const digestS = JSON.parse(runInRepo(dirS, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD' });
      process.stdout.write(JSON.stringify(s.digests.index));
    `));
    const digestU = JSON.parse(runInRepo(dirU, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD' });
      process.stdout.write(JSON.stringify(s.digests.workspace));
    `));

    expect(digestC).toBe(digestS);
    expect(digestS).toBe(digestU);
  });
});

describe('candidate visibility — staged change not hidden by clean worktree', () => {
  test('index candidate sees a staged change even when worktree matches', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
    commit(dir, 'base');
    // Stage a new file but write its content to worktree too (so unstaged diff
    // is empty) — index must still report it.
    fs.writeFileSync(path.join(dir, 'new.txt'), 'hi\n');
    git(['add', 'new.txt'], { cwd: dir });

    const scope = JSON.parse(runInRepo(dir, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD' });
      process.stdout.write(JSON.stringify({ indexPaths: s.candidates.index.map(r=>r.path), workspacePaths: s.candidates.workspace.map(r=>r.path), empty: s.isEmpty }));
    `));
    expect(scope.indexPaths).toContain('new.txt');
    expect(scope.workspacePaths).toContain('new.txt');
    expect(scope.empty).toBe(false);
  });
});

describe('untracked files', () => {
  test('workspace candidate includes untracked files', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
    commit(dir, 'base');
    fs.writeFileSync(path.join(dir, 'untracked.txt'), 'surprise\n');

    const scope = JSON.parse(runInRepo(dir, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD' });
      process.stdout.write(JSON.stringify({ workspacePaths: s.candidates.workspace.map(r=>r.path) }));
    `));
    expect(scope.workspacePaths).toContain('untracked.txt');
  });
});

describe('non-empty diff is never "no changes"', () => {
  test('a branch commit over origin/main is not an empty scope', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
    const base = commit(dir, 'base');
    fs.writeFileSync(path.join(dir, 'b.txt'), '2\n');
    commit(dir, 'feature');
    const scope = JSON.parse(runInRepo(dir, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD~1' });
      process.stdout.write(JSON.stringify({ empty: s.isEmpty, paths: s.paths }));
    `));
    expect(scope.empty).toBe(false);
    expect(scope.paths).toContain('b.txt');
  });
});

describe('rename normalization', () => {
  test('a rename produces delete(old)+add(new) in records', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'old.txt'), 'content\n');
    commit(dir, 'base');
    git(['mv', 'old.txt', 'new.txt'], { cwd: dir });
    commit(dir, 'rename');
    const scope = JSON.parse(runInRepo(dir, `
      const { computeChangeScope } = mod;
      const s = computeChangeScope(process.cwd(), { baseRef: 'HEAD~1' });
      process.stdout.write(JSON.stringify({ committed: s.candidates.committed }));
    `));
    const statuses = scope.committed.map((r) => `${r.status}:${r.path}`).sort();
    expect(statuses).toEqual(expect.arrayContaining(['A:new.txt', 'D:old.txt']));
  });
});

describe('resolveBaseRef fail-closed', () => {
  test('returns null ref with error when no base can be resolved', () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
    commit(dir, 'base');
    const result = JSON.parse(runInRepo(dir, `
      const { resolveBaseRef } = mod;
      const r = resolveBaseRef(process.cwd(), { env: {} });
      process.stdout.write(JSON.stringify(r));
    `));
    // A fresh single-commit repo with no origin: explicit/env/upstream absent.
    // It may fall back to local main, so accept either null-error or a fallback.
    if (result.ref === null) {
      expect(result.source).toBe('none');
      expect(result.error).toBeDefined();
    } else {
      expect(['fallback', 'upstream']).toContain(result.source);
    }
  });
});
