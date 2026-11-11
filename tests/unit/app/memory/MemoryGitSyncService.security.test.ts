import { execFileSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import { syncMemoryTree } from '../../../../src/app/memory';
import {
  sameRemoteEndpoint,
  unstageSecretFiles,
} from '../../../../src/app/memory/MemoryGitSyncService';

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

let work: string;
let tree: string;
let remote: string;

beforeEach(() => {
  work = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'opencodian-memsync-security-'));
  tree = nodePath.join(work, 'tree');
  remote = nodePath.join(work, 'remote.git');
  nodeFs.mkdirSync(nodePath.join(tree, 'projects', 'demo', 'memory'), { recursive: true });
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
});

afterEach(() => {
  nodeFs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

jest.setTimeout(60_000);

describe('memory sync security and endpoint hardening', () => {
  it('scans non-Markdown staged files for credentials', async () => {
    const memDir = nodePath.join(tree, 'projects', 'demo', 'memory');
    nodeFs.writeFileSync(nodePath.join(memDir, 'leak.txt'), 'key: AKIA1234567890ABCDEF');
    const r = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r.ok).toBe(true);
    expect(r.blockedSecrets).toEqual(['projects/demo/memory/leak.txt']);
    expect(sh(tree, 'ls-files').split(/\r?\n/)).not.toContain('projects/demo/memory/leak.txt');
  });

  it('scans the staged blob, not the mutable working-tree file', async () => {
    sh(tree, 'init', '-b', 'main');
    const rel = 'projects/demo/memory/index-only.md';
    const file = nodePath.join(tree, rel);
    nodeFs.writeFileSync(file, 'key: AKIA1234567890ABCDEF');
    sh(tree, 'add', rel);
    nodeFs.writeFileSync(file, 'clean after staging');
    const blocked = await unstageSecretFiles(tree, 'test-host');
    expect(blocked).toEqual([rel]);
    expect(sh(tree, 'diff', '--cached', '--name-only').trim()).toBe('');
    expect(nodeFs.readFileSync(file, 'utf8')).toBe('clean after staging');
  });

  it('never commits editor temp artifacts', async () => {
    const memDir = nodePath.join(tree, 'projects', 'demo', 'memory');
    nodeFs.writeFileSync(nodePath.join(memDir, 'scratch.tmp'), 'scratch');
    const r = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r.ok).toBe(true);
    expect(sh(tree, 'ls-files').split(/\r?\n/)).not.toContain('projects/demo/memory/scratch.tmp');
  });

  it('refuses a normal merge that would overwrite an ignored local file', async () => {
    const memDir = nodePath.join(tree, 'projects', 'demo', 'memory');
    nodeFs.appendFileSync(nodePath.join(tree, '.gitignore'), 'ignored-draft.md\n');
    nodeFs.writeFileSync(nodePath.join(memDir, 'seed.md'), 'seed');
    await syncMemoryTree(tree, remote, { host: 'host-a' });

    const clone = nodePath.join(work, 'ignored-clone');
    execFileSync('git', ['clone', remote, clone], { encoding: 'utf8' });
    sh(clone, 'config', 'user.name', 'OpenCodian Test');
    sh(clone, 'config', 'user.email', 'opencodian-test@example.invalid');
    nodeFs.writeFileSync(nodePath.join(clone, 'projects', 'demo', 'memory', 'ignored-draft.md'), 'remote draft');
    sh(clone, 'add', '-f', 'projects/demo/memory/ignored-draft.md');
    sh(clone, 'commit', '-m', 'remote adds ignored path');
    sh(clone, 'push', 'origin', 'main');

    const localDraft = nodePath.join(memDir, 'ignored-draft.md');
    nodeFs.writeFileSync(localDraft, 'local draft');
    const r = await syncMemoryTree(tree, remote, { host: 'host-a' });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/merge:/);
    expect(nodeFs.readFileSync(localDraft, 'utf8')).toBe('local draft');
  });

  it('treats a missing port as spelling but different explicit ports as different services', () => {
    expect(sameRemoteEndpoint('git@host:owner/repo.git', 'ssh://git@host:13022/owner/repo')).toBe(true);
    expect(sameRemoteEndpoint('ssh://git@host:13022/owner/repo', 'ssh://git@host:2222/owner/repo')).toBe(false);
  });

  it('refuses an origin with a pushurl that points elsewhere', async () => {
    const other = nodePath.join(work, 'push-only.git');
    execFileSync('git', ['init', '--bare', '-b', 'main', other], { encoding: 'utf8' });
    sh(tree, 'init', '-b', 'main');
    sh(tree, 'remote', 'add', 'origin', remote);
    sh(tree, 'config', 'remote.origin.pushurl', other);
    const r = await syncMemoryTree(tree, remote, { host: 'test-host' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('additional endpoint');
  });

  it('redacts credentials from refusal details and traces', async () => {
    sh(tree, 'init', '-b', 'main');
    sh(tree, 'remote', 'add', 'origin', 'https://user:supersecret@example.com/owner/actual.git');
    const r = await syncMemoryTree(tree, 'https://example.com/owner/different.git', { host: 'test-host' });
    expect(r.ok).toBe(false);
    expect(r.detail).not.toContain('supersecret');
    expect(r.detail).toContain('***@');
    const trace = nodeFs.readFileSync(nodePath.join(tree, 'metrics.jsonl'), 'utf8');
    expect(trace).not.toContain('supersecret');
  });
});
