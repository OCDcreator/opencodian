import { execFileSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import {
  checkMemorySyncTreeRoot,
  ensureMemorySyncRepo,
  MEMORY_SYNC_LOCK_FILENAME,
  MemoryGitSyncService,
  syncMemoryTree,
} from '../../../../src/app/memory';
import { normalizeRemoteUrl } from '../../../../src/app/memory/MemoryGitSyncService';

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** sh for commands expected to fail (merge conflicts exit non-zero). */
function shAllowFail(cwd: string, ...args: string[]): void {
  try {
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    // expected failure
  }
}

let work: string;
let tree: string;
let remote: string;

beforeEach(() => {
  work = nodeFs.mkdtempSync(nodePath.join(process.cwd(), '.memory-git-sync-test-'));
  tree = nodePath.join(work, 'tree');
  remote = nodePath.join(work, 'remote.git');
  nodeFs.mkdirSync(nodePath.join(tree, 'projects', 'demo', 'memory'), { recursive: true });
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
});

afterEach(() => {
  const resolved = nodeFs.realpathSync(work);
  if (!resolved.startsWith(`${nodeFs.realpathSync(process.cwd())}${nodePath.sep}.memory-git-sync-test-`)) {
    throw new Error(`Refusing to remove a fixture outside the worktree: ${resolved}`);
  }
  nodeFs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

// Real-git cycles are spawn-heavy on Windows; give them room.
jest.setTimeout(60_000);

describe('git memory sync (shared protocol with zmem)', () => {
  it('bootstraps repo, ignore rules and remote idempotently', async () => {
    await ensureMemorySyncRepo(tree, remote, 'test-host');
    expect(nodeFs.existsSync(nodePath.join(tree, '.git'))).toBe(true);
    expect(nodeFs.readFileSync(nodePath.join(tree, '.gitignore'), 'utf8')).toContain('.last-injection.json');
    expect(sh(tree, 'remote').trim()).toBe('origin');
    expect(sh(tree, 'remote', 'get-url', 'origin').trim()).toBe(remote);
    await ensureMemorySyncRepo(tree, remote, 'test-host');
    expect(sh(tree, 'remote').trim()).toBe('origin');
  });

  it('refuses a different existing origin before it can commit, push, or repoint it', async () => {
    const otherRemote = nodePath.join(work, 'other.git');
    execFileSync('git', ['init', '--bare', '-b', 'main', otherRemote], { encoding: 'utf8' });
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'seed.md'), 'seed');
    expect((await syncMemoryTree(tree, remote, { host: 'guard-host' })).ok).toBe(true);
    sh(tree, 'remote', 'set-url', 'origin', otherRemote);
    const headBefore = sh(tree, 'rev-parse', 'HEAD').trim();
    const remoteBefore = sh(tree, 'ls-remote', remote, 'refs/heads/main').trim();
    const ignoreBefore = nodeFs.readFileSync(nodePath.join(tree, '.gitignore'), 'utf8');
    const attributesBefore = nodeFs.readFileSync(nodePath.join(tree, '.gitattributes'), 'utf8');
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'not-pushed.md'), 'local only');

    const result = await syncMemoryTree(tree, remote, { host: 'guard-host' });

    expect(result).toMatchObject({ ok: false, committed: false, pulled: false, pushed: false });
    expect(result.detail).toContain(`origin points at ${otherRemote} (resolves to ${otherRemote})`);
    expect(result.detail).toContain('refusing to re-point');
    expect(result.detail).toContain(`remote set-url origin ${remote}`);
    expect(sh(tree, 'config', '--get', 'remote.origin.url').trim()).toBe(otherRemote);
    expect(sh(tree, 'rev-parse', 'HEAD').trim()).toBe(headBefore);
    expect(sh(tree, 'ls-remote', remote, 'refs/heads/main').trim()).toBe(remoteBefore);
    expect(nodeFs.readFileSync(nodePath.join(tree, '.gitignore'), 'utf8')).toBe(ignoreBefore);
    expect(nodeFs.readFileSync(nodePath.join(tree, '.gitattributes'), 'utf8')).toBe(attributesBefore);
    expect(sh(tree, 'status', '--porcelain')).toContain('not-pushed.md');
  });

  it('keeps the index intact and the refusal trace ignored without existing ignore rules', async () => {
    sh(tree, 'init', '-b', 'main');
    sh(tree, 'remote', 'add', 'origin', remote);
    const note = nodePath.join(tree, 'projects', 'demo', 'memory', 'staged.md');
    nodeFs.writeFileSync(note, 'staged local draft');
    sh(tree, 'add', '-A');
    const indexBefore = nodeFs.readFileSync(nodePath.join(tree, '.git', 'index'));
    const statusBefore = sh(tree, 'status', '--porcelain');
    const result = await syncMemoryTree(tree, `${remote}.different`, { host: 'guard-host' });

    expect(result).toMatchObject({ ok: false, committed: false, pulled: false, pushed: false });
    expect(sh(tree, 'config', '--get', 'remote.origin.url').trim()).toBe(remote);
    expect(nodeFs.readFileSync(nodePath.join(tree, '.git', 'index'))).toEqual(indexBefore);
    expect(sh(tree, 'status', '--porcelain')).toBe(statusBefore);
    expect(sh(tree, 'check-ignore', 'metrics.jsonl').trim()).toBe('metrics.jsonl');
    const trace = JSON.parse(nodeFs.readFileSync(nodePath.join(tree, 'metrics.jsonl'), 'utf8').trim());
    expect(trace).toEqual({
      t: expect.any(String), ok: false, committed: false, pulled: false, pushed: false,
      blockedSecrets: [], detail: result.detail,
    });
    expect(nodeFs.existsSync(nodePath.join(tree, '.gitignore'))).toBe(false);
    expect(nodeFs.existsSync(nodePath.join(tree, '.gitattributes'))).toBe(false);
  });

  it('keeps an equivalent SSH origin spelling and syncs through a local transport rewrite', async () => {
    const storedOrigin = 'git@MEM-SYNC.test:owner/zmem-memories.git/';
    const configuredOrigin = 'ssh://git@mem-sync.TEST:13022/owner/zmem-memories';
    const localTransport = `file://${remote}`;
    sh(tree, 'init', '-b', 'main');
    sh(tree, 'config', `url.${localTransport}.insteadOf`, storedOrigin);
    // The configured spelling must resolve to the same transport too: the
    // comparison is on expanded endpoints, not on the raw strings.
    sh(tree, 'config', '--add', `url.${localTransport}.insteadOf`, configuredOrigin);

    await ensureMemorySyncRepo(tree, storedOrigin, 'equivalence-host');
    await ensureMemorySyncRepo(tree, configuredOrigin, 'equivalence-host');
    expect(normalizeRemoteUrl(storedOrigin)).toBe(normalizeRemoteUrl(configuredOrigin));
    // `remote get-url` expands insteadOf, so inspect the stored config to
    // prove equivalent configurations never rewrite the user's spelling.
    expect(sh(tree, 'config', '--get', 'remote.origin.url').trim()).toBe(storedOrigin);

    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'equivalent.md'), 'synced');
    const result = await syncMemoryTree(tree, configuredOrigin, { host: 'equivalence-host' });
    expect(result).toMatchObject({ ok: true, committed: true, pushed: true });
    const clone = nodePath.join(work, 'equivalent-clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    expect(nodeFs.readFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'equivalent.md'), 'utf8'))
      .toBe('synced');
  });

  it('commits memory changes, pushes, and a clone sees them; ignore rules hold', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'MEMORY.md'), '# Memory Index\n');
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', '.last-injection.json'), '{}');
    const r1 = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r1.ok).toBe(true);
    expect(r1.committed).toBe(true);
    expect(r1.pushed).toBe(true);

    const clone = nodePath.join(work, 'clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    expect(nodeFs.existsSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'MEMORY.md'))).toBe(true);

    const files = sh(tree, 'ls-files').trim().split(/\r?\n/);
    expect(files).toContain('projects/demo/memory/MEMORY.md');
    expect(files.some((f) => f.includes('.last-injection.json'))).toBe(false);

    const r2 = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r2.ok).toBe(true);
    expect(r2.committed).toBe(false);
  });

  it('round-trips a cross-tree edit through the remote', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'MEMORY.md'), '# Memory Index\n');
    await syncMemoryTree(tree, remote, { host: 'host-a' });
    const clone = nodePath.join(work, 'cloneB');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });

    nodeFs.writeFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'from-b.md'), 'b body');
    sh(clone, 'add', '-A');
    sh(clone, '-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-m', 'from B');
    sh(clone, 'push', 'origin', 'main');

    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'from-a.md'), 'a body');
    const r = await syncMemoryTree(tree, remote, { host: 'host-a' });
    expect(r.ok).toBe(true);
    expect(r.pulled).toBe(true);
    expect(nodeFs.existsSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'from-b.md'))).toBe(true);
  });

});

describe('memory sync merge preservation', () => {
  it('fast-forwards a behind tree without rewriting or adding commits', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'seed.md'), 'seed');
    await syncMemoryTree(tree, remote, { host: 'host-a' });
    const clone = nodePath.join(work, 'behind-clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    nodeFs.writeFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'remote.md'), 'remote edit');
    sh(clone, 'add', '-A');
    sh(clone, '-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-m', 'remote');
    sh(clone, 'push', 'origin', 'main');
    const remoteTip = sh(clone, 'rev-parse', 'HEAD').trim();

    expect(await syncMemoryTree(tree, remote, { host: 'host-a' }))
      .toMatchObject({ ok: true, committed: false, pulled: true, pushed: true });
    expect(sh(tree, 'rev-parse', 'HEAD').trim()).toBe(remoteTip);
    expect(nodeFs.readFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'remote.md'), 'utf8'))
      .toBe('remote edit');
  });

  it('merges divergence while preserving both original commit IDs', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'seed.md'), 'seed');
    await syncMemoryTree(tree, remote, { host: 'host-a' });
    const clone = nodePath.join(work, 'diverged-clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    nodeFs.writeFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'remote.md'), 'remote');
    sh(clone, 'add', '-A');
    sh(clone, '-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-m', 'remote');
    sh(clone, 'push', 'origin', 'main');
    const remoteTip = sh(clone, 'rev-parse', 'HEAD').trim();
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'local.md'), 'local');
    sh(tree, 'add', '-A');
    sh(tree, '-c', 'user.name=a', '-c', 'user.email=a@a', 'commit', '-m', 'local');
    const localTip = sh(tree, 'rev-parse', 'HEAD').trim();

    expect(await syncMemoryTree(tree, remote, { host: 'host-a' }))
      .toMatchObject({ ok: true, committed: false, pulled: true, pushed: true });
    expect(sh(tree, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ').slice(1))
      .toEqual([localTip, remoteTip]);
  });

  it('aborts a real merge conflict and preserves local files, commits, and the remote', async () => {
    const note = nodePath.join(tree, 'projects', 'demo', 'memory', 'conflict.md');
    nodeFs.writeFileSync(note, 'base\n');
    await syncMemoryTree(tree, remote, { host: 'host-a' });
    // This fixture asserts exact LF bytes, independent of the runner's checkout policy.
    sh(tree, 'config', 'core.autocrlf', 'false');
    const clone = nodePath.join(work, 'conflict-clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    nodeFs.writeFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'conflict.md'), 'remote\n');
    sh(clone, 'add', '-A');
    sh(clone, '-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-m', 'remote');
    sh(clone, 'push', 'origin', 'main');
    const remoteTip = sh(clone, 'rev-parse', 'HEAD').trim();
    nodeFs.writeFileSync(note, 'local\n');
    sh(tree, 'add', '-A');
    sh(tree, '-c', 'user.name=a', '-c', 'user.email=a@a', 'commit', '-m', 'local');
    const localTip = sh(tree, 'rev-parse', 'HEAD').trim();

    const result = await syncMemoryTree(tree, remote, { host: 'host-a' });
    expect(result).toMatchObject({ ok: false, committed: false, pulled: false, pushed: false });
    expect(result.detail).toMatch(/^merge:/);
    expect(sh(tree, 'rev-parse', 'HEAD').trim()).toBe(localTip);
    expect(sh(tree, 'ls-remote', remote, 'refs/heads/main').trim().split(/\s/u)[0]).toBe(remoteTip);
    expect(nodeFs.readFileSync(note, 'utf8')).toBe('local\n');
    expect(sh(tree, 'status', '--porcelain').trim()).toBe('');
    expect(sh(tree, 'ls-files', '-u').trim()).toBe('');
    expect(nodeFs.existsSync(nodePath.join(tree, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(nodeFs.existsSync(nodePath.join(tree, '.git', 'rebase-merge'))).toBe(false);
  });

  it('refuses push and the next commit when a real autostash restoration conflicts', async () => {
    const note = nodePath.join(tree, 'projects', 'demo', 'memory', 'conflict.md');
    nodeFs.writeFileSync(note, 'base\n');
    await syncMemoryTree(tree, remote, { host: 'host-a' });
    const clone = nodePath.join(work, 'autostash-clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    nodeFs.writeFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'conflict.md'), 'remote\n');
    sh(clone, 'add', '-A');
    sh(clone, '-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-m', 'remote');
    sh(clone, 'push', 'origin', 'main');
    const remoteTip = sh(clone, 'rev-parse', 'HEAD').trim();
    // A real git hook deterministically simulates another memory writer
    // between this cycle's commit and merge. It runs only once.
    const hook = nodePath.join(tree, '.git', 'hooks', 'post-commit');
    nodeFs.writeFileSync(hook,
      '#!/bin/sh\n' +
      'if test -f .git/autostash-fixture-done; then exit 0; fi\n' +
      "printf 'local unstaged draft\\n' > projects/demo/memory/conflict.md\n" +
      ': > .git/autostash-fixture-done\n',
    );
    nodeFs.chmodSync(hook, 0o755);
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'trigger.md'), 'trigger commit');

    const result = await syncMemoryTree(tree, remote, { host: 'host-a' });
    expect(result).toMatchObject({ ok: false, committed: true, pulled: true, pushed: false });
    expect(result.detail).toMatch(/autostash/);
    expect(sh(tree, 'ls-files', '-u').trim().length).toBeGreaterThan(0);
    expect(nodeFs.readFileSync(note, 'utf8')).toContain('local unstaged draft');
    expect(sh(tree, 'show', 'stash:projects/demo/memory/conflict.md')).toBe('local unstaged draft\n');
    expect(sh(tree, 'ls-remote', remote, 'refs/heads/main').trim().split(/\s/u)[0]).toBe(remoteTip);
    const head = sh(tree, 'rev-parse', 'HEAD').trim();
    const next = await syncMemoryTree(tree, remote, { host: 'host-a' });
    expect(next).toMatchObject({ ok: false, committed: false, pulled: false, pushed: false });
    expect(next.detail).toMatch(/unresolved merge entries/);
    expect(sh(tree, 'rev-parse', 'HEAD').trim()).toBe(head);
  });

});

describe('memory sync bootstrap and lifecycle', () => {
  it('an unborn local tree adopts existing remote history', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'seed.md'), 'seed');
    await syncMemoryTree(tree, remote, { host: 'host-a' });

    const treeB = nodePath.join(work, 'treeB');
    nodeFs.mkdirSync(nodePath.join(treeB, 'projects', 'other', 'memory'), { recursive: true });
    const r = await syncMemoryTree(treeB, remote, { host: 'host-b' });
    expect(r.ok).toBe(true);
    expect(nodeFs.existsSync(nodePath.join(treeB, 'projects', 'demo', 'memory', 'seed.md'))).toBe(true);
  });

  it('refuses unborn adoption that would overwrite even an ignored local file', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'seed.md'), 'remote memory');
    await syncMemoryTree(tree, remote, { host: 'host-a' });
    const treeB = nodePath.join(work, 'treeB');
    const noteB = nodePath.join(treeB, 'projects', 'demo', 'memory', 'seed.md');
    nodeFs.mkdirSync(nodePath.dirname(noteB), { recursive: true });
    nodeFs.writeFileSync(noteB, 'local draft must survive');
    sh(treeB, 'init', '-b', 'main');
    nodeFs.appendFileSync(nodePath.join(treeB, '.git', 'info', 'exclude'), 'projects/\n');
    const remoteTip = sh(tree, 'rev-parse', 'HEAD').trim();

    const result = await syncMemoryTree(treeB, remote, { host: 'host-b' });
    expect(result).toMatchObject({ ok: false, committed: false, pulled: false, pushed: false });
    expect(result.detail).toMatch(/overwrite untracked/);
    expect(nodeFs.readFileSync(noteB, 'utf8')).toBe('local draft must survive');
    expect(sh(treeB, 'ls-files').trim()).toBe('');
    expect(sh(tree, 'ls-remote', remote, 'refs/heads/main').trim().split(/\s/u)[0]).toBe(remoteTip);
  });

  it('leaves no lock residue and the runtime wrapper gates on root/url', async () => {
    await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(nodeFs.existsSync(nodePath.join(tree, MEMORY_SYNC_LOCK_FILENAME))).toBe(false);

    const off = new MemoryGitSyncService(() => null, () => '');
    expect(off.isActive()).toBe(false);
    expect(await off.runCycle()).toBeNull();

    let currentRoot: string | null = null;
    let currentUrl = '';
    const svc = new MemoryGitSyncService(() => currentRoot, () => currentUrl, 'test-host');
    expect(svc.isActive()).toBe(false);
    currentRoot = tree;
    currentUrl = remote;
    expect(svc.isActive()).toBe(true);
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'via-svc.md'), 'x');
    const cycle = await svc.runCycle();
    expect(cycle?.ok).toBe(true);
    expect(cycle?.committed).toBe(true);
    svc.dispose();
  });

  it('contains notification errors and suppresses results after disposal', async () => {
    const observer = jest.fn(() => { throw new Error('notification unavailable'); });
    const svc = new MemoryGitSyncService(() => tree, () => remote, 'observer-host', observer);
    const result = await svc.runCycle();
    expect(result).toMatchObject({ ok: true, pushed: true });
    expect(observer).toHaveBeenCalledWith(result);
    const pending = svc.runCycle();
    svc.dispose();
    expect(await pending).toMatchObject({ ok: true });
    expect(observer).toHaveBeenCalledTimes(1);
  });
});

describe('sync safety rails', () => {
  it('refuses dangerous or non-memory roots before any git init / add -A', async () => {
    expect(checkMemorySyncTreeRoot(nodeOs.homedir())).toMatch(/home directory/);
    expect(checkMemorySyncTreeRoot(nodePath.parse(nodePath.resolve(tree)).root))
      .toMatch(/filesystem root/);
    expect(checkMemorySyncTreeRoot(nodePath.join(work, 'missing')))
      .toMatch(/does not exist/);
    const populated = nodePath.join(work, 'populated');
    nodeFs.mkdirSync(populated);
    nodeFs.writeFileSync(nodePath.join(populated, 'notes.txt'), 'not a memory tree');
    expect(checkMemorySyncTreeRoot(populated)).toMatch(/non-empty directory/);
    // The real tree (has projects/) and an empty dir both pass.
    expect(checkMemorySyncTreeRoot(tree)).toBeNull();
    const empty = nodePath.join(work, 'empty');
    nodeFs.mkdirSync(empty);
    expect(checkMemorySyncTreeRoot(empty)).toBeNull();

    // syncMemoryTree refuses without creating a repo.
    const refused = await syncMemoryTree(populated, remote, { host: 'test-host' });
    expect(refused.ok).toBe(false);
    expect(refused.detail).toMatch(/non-empty directory/);
    expect(nodeFs.existsSync(nodePath.join(populated, '.git'))).toBe(false);
    expect(nodeFs.readdirSync(populated)).toEqual(['notes.txt']);
  });

  it('a held lock no-ops the cycle; a stale lock is taken over', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'MEMORY.md'), '# Memory Index\n');
    const lockPath = nodePath.join(tree, MEMORY_SYNC_LOCK_FILENAME);

    nodeFs.writeFileSync(lockPath, '99999@now');
    const held = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(held.ok).toBe(true);
    expect(held.detail).toBe('locked');
    expect(held.committed).toBe(false);
    expect(nodeFs.existsSync(nodePath.join(tree, '.git'))).toBe(false);
    expect(nodeFs.existsSync(nodePath.join(tree, 'metrics.jsonl'))).toBe(false);

    // Wedged holder: older than the 5-minute stale age → takeover.
    const stale = new Date(Date.now() - 6 * 60_000);
    nodeFs.utimesSync(lockPath, stale, stale);
    const taken = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(taken.ok).toBe(true);
    expect(taken.committed).toBe(true);
    expect(nodeFs.existsSync(lockPath)).toBe(false);
  });

  it('a missing root is refused by the guard instead of throwing', async () => {
    const ghost = nodePath.join(work, 'ghost');
    const result = await syncMemoryTree(ghost, remote, { host: 'test-host' });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/does not exist/);
  });

  it('staged memory files with credentials never reach the remote', async () => {
    const memDir = nodePath.join(tree, 'projects', 'demo', 'memory');
    nodeFs.writeFileSync(
      nodePath.join(memDir, 'aws-note.md'),
      'key: AKIA1234567890ABCDEF — user pasted it in chat',
    );
    const r1 = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r1.ok).toBe(true);
    expect(r1.blockedSecrets).toEqual(['projects/demo/memory/aws-note.md']);
    // Only the git metadata files were committable; the secret stayed out.
    const tracked1 = sh(tree, 'ls-files').trim().split(/\r?\n/);
    expect(tracked1).toContain('.gitignore');
    expect(tracked1.some((f) => f.includes('aws-note.md'))).toBe(false);
    // The file stays on disk locally; it is only withheld from the remote.
    expect(nodeFs.existsSync(nodePath.join(memDir, 'aws-note.md'))).toBe(true);

    nodeFs.writeFileSync(nodePath.join(memDir, 'clean.md'), 'harmless note');
    const r2 = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r2.ok).toBe(true);
    expect(r2.committed).toBe(true);
    expect(r2.pushed).toBe(true);
    expect(r2.blockedSecrets).toEqual(['projects/demo/memory/aws-note.md']);
    const tracked = sh(tree, 'ls-files').trim().split(/\r?\n/);
    expect(tracked).toContain('projects/demo/memory/clean.md');
    expect(tracked.some((f) => f.includes('aws-note.md'))).toBe(false);
  });

  it('unresolved merge entries block the commit instead of pushing markers', async () => {
    const memDir = nodePath.join(tree, 'projects', 'demo', 'memory');
    nodeFs.writeFileSync(nodePath.join(memDir, 'conflict.md'), 'base\n');
    await syncMemoryTree(tree, remote, { host: 'host-a' });

    const cloneB = nodePath.join(work, 'cloneB');
    execFileSync('git', ['clone', remote, cloneB], { encoding: 'utf8' });
    nodeFs.writeFileSync(nodePath.join(cloneB, 'projects', 'demo', 'memory', 'conflict.md'), 'from B\n');
    sh(cloneB, 'add', '-A');
    sh(cloneB, '-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-m', 'B');
    sh(cloneB, 'push', 'origin', 'main');

    // Local diverging commit + merge → real unmerged entries.
    nodeFs.writeFileSync(nodePath.join(memDir, 'conflict.md'), 'from A\n');
    sh(tree, 'add', '-A');
    sh(tree, '-c', 'user.name=a', '-c', 'user.email=a@a', 'commit', '-m', 'A');
    // The conflict must leave unmerged entries behind. Git validates the
    // committer identity up front when a merge commit may be needed, so pass
    // it here too — otherwise a host without a global git identity (CI) fails
    // the pull with exit 128 before the index ever goes unmerged.
    shAllowFail(tree, '-c', 'user.name=a', '-c', 'user.email=a@a', 'pull', '--no-rebase', 'origin', 'main');
    expect(sh(tree, 'ls-files', '-u').trim().length).toBeGreaterThan(0);

    const r = await syncMemoryTree(tree, remote, { host: 'host-a' });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/unresolved merge entries/);
    // No new sync commit, nothing pushed, unmerged state untouched.
    expect(sh(tree, 'log', '--format=%s', '-1', 'HEAD').trim()).toBe('A');
    expect(sh(tree, 'ls-files', '-u').trim().length).toBeGreaterThan(0);
    sh(tree, 'merge', '--abort');
  });

  it('a stale index.lock from a killed git is recovered; a fresh one is not', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'MEMORY.md'), '# Memory Index\n');
    await syncMemoryTree(tree, remote, { host: 'test-host' });
    const indexLock = nodePath.join(tree, '.git', 'index.lock');

    // Fresh lock = a live git holds it → cycle fails, lock preserved.
    nodeFs.writeFileSync(indexLock, '');
    const fresh = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(fresh.ok).toBe(false);
    expect(fresh.detail).toMatch(/index\.lock/);
    expect(fresh.detail).not.toMatch(/removed/);
    expect(nodeFs.existsSync(indexLock)).toBe(true);

    // Stale lock = killed git residue → removed, next cycle proceeds.
    const stale = new Date(Date.now() - 5 * 60_000);
    nodeFs.utimesSync(indexLock, stale, stale);
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'after.md'), 'x');
    const recovered = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(recovered.ok).toBe(false); // this cycle still failed at add…
    expect(recovered.detail).toMatch(/stale index\.lock removed/);
    const next = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(next.ok).toBe(true); // …and the following cycle is healthy
    expect(next.committed).toBe(true);
    expect(next.pushed).toBe(true);
  });

  it('an unreachable remote surfaces in detail instead of a silent ok', async () => {
    const treeB = nodePath.join(work, 'treeB');
    nodeFs.mkdirSync(nodePath.join(treeB, 'projects', 'other', 'memory'), { recursive: true });
    const r = await syncMemoryTree(treeB, nodePath.join(work, 'no-such-remote.git'), { host: 'host-b' });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/does not appear to be a git repository/);
  });

  it('completes pre-existing .gitignore and writes union-merge attributes', async () => {
    nodeFs.writeFileSync(nodePath.join(tree, '.gitignore'), 'custom-scratch/\n');
    await ensureMemorySyncRepo(tree, remote, 'test-host');
    const ignore = nodeFs.readFileSync(nodePath.join(tree, '.gitignore'), 'utf8');
    expect(ignore).toContain('custom-scratch/');
    for (const line of ['.last-injection.json', 'metrics.jsonl', '.DS_Store', 'Thumbs.db', MEMORY_SYNC_LOCK_FILENAME]) {
      expect(ignore).toContain(line);
    }
    const attrs = nodeFs.readFileSync(nodePath.join(tree, '.gitattributes'), 'utf8');
    expect(attrs).toContain('MEMORY.md merge=union');
  });
});

describe('shared protocol shape (drift guard — must match zmem)', () => {
  it('pins the lock filename, ignore rules and commit message shape', async () => {
    expect(MEMORY_SYNC_LOCK_FILENAME).toBe('.memory-sync.lock');
    nodeFs.writeFileSync(nodePath.join(tree, 'projects', 'demo', 'memory', 'MEMORY.md'), '# Memory Index\n');
    const r = await syncMemoryTree(tree, remote, { host: 'proto-host' });
    expect(r.ok).toBe(true);

    // Exact .gitignore layout written on a fresh repo.
    const ignore = nodeFs.readFileSync(nodePath.join(tree, '.gitignore'), 'utf8');
    expect(ignore).toBe(
      '# per-machine diagnostics never travel\n' +
      '.last-injection.json\nmetrics.jsonl\n.DS_Store\nThumbs.db\n.memory-sync.lock\n',
    );

    // Commit identity + message shape both plugins must produce.
    const message = sh(tree, 'log', '-1', '--format=%s').trim();
    expect(message).toMatch(/^memory\(proto-host\): \d+ change\(s\)$/);
    const author = sh(tree, 'log', '-1', '--format=%an').trim();
    expect(author).toMatch(/-memory@proto-host$/);

    // Current branch is main.
    expect(sh(tree, 'branch', '--show-current').trim()).toBe('main');
  });
});
