const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runnerPath = path.join(process.cwd(), 'scripts', 'run-verify.mjs');
const changeScopePath = path.join(process.cwd(), 'scripts', 'check-change-scope.mjs');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-runner-'));
  // Minimal empty repo (the runner only needs to resolve scope; full gates need
  // the real project, so these tests only cover scope resolution + plumbing,
  // not the full gate sequence which requires the real repo).
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  return dir;
}

function commit(dir, msg) {
  fs.writeFileSync(path.join(dir, 'a.txt'), `${msg}\n`);
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', msg], { cwd: dir });
}

describe('check-change-scope gate', () => {
  test('prints resolved SHAs and candidate digests and exits 0', () => {
    const dir = makeRepo();
    commit(dir, 'base');
    commit(dir, 'second');
    const out = execFileSync(process.execPath, [changeScopePath, '--base', 'HEAD~1'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(out).toContain('PASS change-scope');
    expect(out).toContain('base:');
    expect(out).toContain('merge-base:');
    expect(out).toContain('committed digest:');
  });

  test('writes a scope artifact when --artifact is given', () => {
    const dir = makeRepo();
    commit(dir, 'base');
    commit(dir, 'second');
    const artifact = path.join(dir, 'scope.json');
    execFileSync(process.execPath, [changeScopePath, '--base', 'HEAD~1', '--artifact', artifact], {
      cwd: dir,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(fs.readFileSync(artifact, 'utf8'));
    expect(parsed.baseSha).toBeDefined();
    expect(parsed.headSha).toBeDefined();
    expect(parsed.digests.committed).toMatch(/^[0-9a-f]{64}$/);
  });

  test('fails closed when base cannot be resolved', () => {
    const dir = makeRepo();
    commit(dir, 'only');
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [changeScopePath], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, VERIFY_BASE_REF: '' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (error) {
      exitCode = error.status ?? 1;
      stderr = error.stderr ?? '';
    }
    // A single-commit repo with no upstream and no explicit base: must not
    // silently succeed.
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('FAIL change-scope');
  });
});
