/**
 * `MemoryGitSyncService`: git-backed whole-tree memory sync for the shared
 * external store (shared protocol with opencode-zmem's `src/sync.ts` — both
 * plugins may target the same physical tree, so the lock filename, branch,
 * ignore rules and commit-message shape must stay identical).
 *
 * The repo lives at the external root that contains `projects/`, so every
 * workspace bucket — including ZCode-authored files — travels together
 * across machines through the configured remote. Every entry point is
 * fail-soft by contract: a sync failure must never surface in or block a
 * chat turn; when git or the remote is unavailable the service no-ops.
 *
 * Safety rails (see docs/memory-sync-protocol.md):
 * - the tree root is validated before any `git init` / `add -A` so a
 *   mis-pointed setting cannot commit and push a whole home directory;
 * - staged memory files that trip the credential heuristic are unstaged
 *   before commit (the recall-side guard only keeps secrets out of the
 *   prompt; this gate keeps them out of the remote);
 * - unresolved merge entries block the commit so conflict markers never
 *   travel; append-only MEMORY.md indexes merge by union via .gitattributes.
 */

import { spawn } from 'node:child_process';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import { scanForSecrets } from '../../core/memory';

/** Cross-plugin advisory lock (open-exclusive create; stale takeover). */
export const MEMORY_SYNC_LOCK_FILENAME = '.memory-sync.lock';
const SYNC_LOCK_STALE_MS = 5 * 60_000;
const GIT_TIMEOUT_MS = 20_000;
/** index.lock left behind by a killed git is safe to remove after this age. */
const INDEX_LOCK_STALE_MS = 60_000;
const SYNC_DEBOUNCE_MS = 5_000;
const SYNC_INTERVAL_MS = 5 * 60_000;
const SYNC_AUTHOR = 'opencodian-memory';

const GITIGNORE_BANNER = '# per-machine diagnostics never travel';
const GITIGNORE_REQUIRED = [
  '.last-injection.json',
  'metrics.jsonl',
  '.DS_Store',
  'Thumbs.db',
  MEMORY_SYNC_LOCK_FILENAME,
];

const GITATTRIBUTES_BANNER = '# append-only memory indexes merge by union';
const GITATTRIBUTES_REQUIRED = ['MEMORY.md merge=union'];

export interface MemorySyncResult {
  readonly ok: boolean;
  readonly committed: boolean;
  readonly pulled: boolean;
  readonly pushed: boolean;
  /** Memory files withheld from the remote by the credential gate. */
  readonly blockedSecrets?: readonly string[];
  readonly detail?: string;
}

function git(
  root: string,
  args: string[],
  host: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [
      '-c', `user.name=${SYNC_AUTHOR}@${host}`,
      '-c', 'user.email=memory-sync@opencodian.local',
      ...args,
    ], { cwd: root, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('git timeout'));
    }, GIT_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`git ${args[0]} exit ${code}: ${err.trim().slice(0, 400)}`));
    });
  });
}

class SyncLock {
  constructor(private readonly lockPath: string) {}

  tryAcquire(): boolean {
    try {
      const fd = nodeFs.openSync(this.lockPath, 'wx');
      nodeFs.writeFileSync(fd, `${process.pid}@${Date.now()}`);
      nodeFs.closeSync(fd);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - nodeFs.statSync(this.lockPath).mtimeMs;
        if (age > SYNC_LOCK_STALE_MS) {
          nodeFs.unlinkSync(this.lockPath);
          return this.tryAcquire();
        }
      } catch {
        // raced away — treat as held
      }
      return false;
    }
  }

  release(): void {
    try {
      nodeFs.unlinkSync(this.lockPath);
    } catch {
      // already gone
    }
  }
}

/**
 * Guard against a mis-pointed root before any `git init` / `add -A`: the
 * user home, a filesystem root, a missing path, or a populated directory
 * that does not look like a memory tree (no `projects/` yet) would
 * otherwise get its entire content committed and pushed. Never throws —
 * returns the refusal reason or null when the root is safe to use.
 */
export function checkMemorySyncTreeRoot(treeRoot: string): string | null {
  try {
    const resolved = nodePath.resolve(treeRoot);
    if (resolved === nodePath.resolve(nodeOs.homedir())) {
      return 'refusing to sync the user home directory';
    }
    if (resolved === nodePath.parse(resolved).root) {
      return 'refusing to sync a filesystem root';
    }
    if (!nodeFs.existsSync(resolved)) {
      return `tree root does not exist: ${resolved}`;
    }
    if (!nodeFs.statSync(resolved).isDirectory()) {
      return `tree root is not a directory: ${resolved}`;
    }
    const hasGit = nodeFs.existsSync(nodePath.join(resolved, '.git'));
    const hasProjects = nodeFs.existsSync(nodePath.join(resolved, 'projects'));
    if (!hasGit && !hasProjects) {
      const stray = nodeFs.readdirSync(resolved)
        .filter((entry) => entry !== MEMORY_SYNC_LOCK_FILENAME);
      if (stray.length > 0) {
        return 'refusing to sync a non-empty directory without projects/ — point the root at a memory tree or an empty directory';
      }
    }
    return null;
  } catch (error) {
    return `tree root check failed: ${(error as Error).message.slice(0, 120)}`;
  }
}

/**
 * A git killed by the per-command timeout can leave `.git/index.lock`
 * behind, which would fail every later cycle forever. Remove it once it is
 * clearly stale (any live git operation holds it only briefly; the
 * cross-plugin lock already excludes the sibling plugin's git).
 */
function recoverStaleIndexLock(treeRoot: string, gitError: string): boolean {
  if (!/index\.lock/i.test(gitError)) return false;
  try {
    const lockPath = nodePath.join(treeRoot, '.git', 'index.lock');
    const age = Date.now() - nodeFs.statSync(lockPath).mtimeMs;
    if (age <= INDEX_LOCK_STALE_MS) return false;
    nodeFs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unstage staged memory files whose content trips the credential heuristic
 * and report them. Files stay on disk locally; they just never travel.
 */
async function unstageSecretFiles(treeRoot: string, host: string): Promise<string[]> {
  const stagedRaw = await git(
    treeRoot,
    ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
    host,
  );
  const staged = stagedRaw
    .split('\0')
    .filter((p) => p.length > 0 && p.toLowerCase().endsWith('.md'));
  if (staged.length === 0) return [];
  const headExists = await git(treeRoot, ['rev-parse', '--verify', 'HEAD'], host)
    .then(() => true)
    .catch(() => false);
  const blocked: string[] = [];
  for (const rel of staged) {
    let content: string;
    try {
      content = nodeFs.readFileSync(nodePath.join(treeRoot, rel), 'utf8');
    } catch {
      continue;
    }
    if (!scanForSecrets(content).hit) continue;
    // Fail-closed: if the unstage itself fails the cycle aborts (outer
    // catch) rather than committing a credential. `restore --staged` needs
    // a HEAD to restore into the index; on an unborn branch only
    // `rm --cached` can drop the new entry.
    if (headExists) {
      await git(treeRoot, ['restore', '--staged', '--', rel], host);
    } else {
      await git(treeRoot, ['rm', '--cached', '-q', '--', rel], host);
    }
    blocked.push(rel);
  }
  return blocked;
}

/** Write or complete one git metadata file with the required lines. */
function ensureGitFileLines(
  filePath: string,
  banner: string,
  requiredLines: readonly string[],
): void {
  if (!nodeFs.existsSync(filePath)) {
    nodeFs.writeFileSync(filePath, `${banner}\n${requiredLines.join('\n')}\n`, 'utf8');
    return;
  }
  const current = nodeFs.readFileSync(filePath, 'utf8');
  const present = current.split(/\r?\n/);
  const missing = requiredLines.filter((line) => !present.includes(line));
  if (missing.length === 0) return;
  const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
  nodeFs.appendFileSync(filePath, `${separator}${banner}\n${missing.join('\n')}\n`, 'utf8');
}

/** Idempotent bootstrap: init repo, ignore/merge rules, and the origin remote. */
export async function ensureMemorySyncRepo(
  treeRoot: string,
  remoteUrl: string,
  host = nodeOs.hostname(),
): Promise<void> {
  if (!nodeFs.existsSync(nodePath.join(treeRoot, '.git'))) {
    await git(treeRoot, ['init', '-b', 'main'], host);
  }
  ensureGitFileLines(
    nodePath.join(treeRoot, '.gitignore'),
    GITIGNORE_BANNER,
    GITIGNORE_REQUIRED,
  );
  ensureGitFileLines(
    nodePath.join(treeRoot, '.gitattributes'),
    GITATTRIBUTES_BANNER,
    GITATTRIBUTES_REQUIRED,
  );
  const remotes = await git(treeRoot, ['remote'], host);
  if (remotes.split(/\r?\n/).includes('origin')) {
    await git(treeRoot, ['remote', 'set-url', 'origin', remoteUrl], host);
  } else {
    await git(treeRoot, ['remote', 'add', 'origin', remoteUrl], host);
  }
}

/**
 * One full sync cycle: stage → commit-if-changed → pull --rebase → push.
 * Empty remotes are tolerated; rebase conflicts abort and keep the local
 * tree; a held cross-plugin lock is a no-op, not an error.
 */
export async function syncMemoryTree(
  treeRoot: string,
  remoteUrl: string,
  opts: { host?: string } = {},
): Promise<MemorySyncResult> {
  const host = opts.host ?? nodeOs.hostname();
  const refusal = checkMemorySyncTreeRoot(treeRoot);
  if (refusal) {
    return { ok: false, committed: false, pulled: false, pushed: false, detail: refusal };
  }
  const lock = new SyncLock(nodePath.join(treeRoot, MEMORY_SYNC_LOCK_FILENAME));
  let acquired = false;
  try {
    acquired = lock.tryAcquire();
  } catch (error) {
    // The lock file itself is unreachable (root vanished, permissions) —
    // report instead of letting a non-EEXIST fs error escape fail-soft.
    return {
      ok: false,
      committed: false,
      pulled: false,
      pushed: false,
      detail: `lock: ${(error as Error).message.slice(0, 200)}`,
    };
  }
  if (!acquired) {
    return { ok: true, committed: false, pulled: false, pushed: false, detail: 'locked' };
  }
  try {
    await ensureMemorySyncRepo(treeRoot, remoteUrl, host);
    // An autostash-pop conflict (or a user merge in progress) leaves
    // unmerged entries; `add -A` would stage the conflict markers and clear
    // the evidence, so this check must run before staging.
    const unmerged = await git(treeRoot, ['ls-files', '-u'], host);
    if (unmerged.trim().length > 0) {
      return {
        ok: false,
        committed: false,
        pulled: false,
        pushed: false,
        detail: 'unresolved merge entries present; refusing to commit conflict markers',
      };
    }
    await git(treeRoot, ['add', '-A'], host);
    const blockedSecrets = await unstageSecretFiles(treeRoot, host);
    const status = await git(treeRoot, ['status', '--porcelain'], host);
    let committed = false;
    if (status.trim().length > 0) {
      await git(
        treeRoot,
        ['commit', '-m', `memory(${host}): ${status.trim().split(/\r?\n/).length} change(s)`],
        host,
      );
      committed = true;
    }
    let pulled = false;
    let pushed = false;
    const headExists = await git(treeRoot, ['rev-parse', '--verify', 'HEAD'], host)
      .then(() => true)
      .catch(() => false);
    if (headExists) {
      try {
        const pullOut = await git(
          treeRoot,
          ['pull', '--rebase', '--autostash', 'origin', 'main'],
          host,
        );
        pulled = !/Already up to date|up to date/i.test(pullOut);
      } catch (error) {
        const message = (error as Error).message;
        if (!/couldn't find remote ref/i.test(message)) {
          // A rebase conflict wedges the tree — abort and keep local state.
          await git(treeRoot, ['rebase', '--abort'], host).catch(() => undefined);
          const recovered = recoverStaleIndexLock(treeRoot, message);
          return {
            ok: false,
            committed,
            pulled: false,
            pushed: false,
            blockedSecrets,
            detail: `pull: ${message.slice(0, 200)}${recovered ? ' (stale index.lock removed)' : ''}`,
          };
        }
      }
    } else {
      // Unborn branch: adopt remote history instead of trying to push nothing.
      const fetchError = await git(treeRoot, ['fetch', 'origin'], host)
        .then(() => null)
        .catch((error: unknown) => (error as Error).message);
      if (fetchError) {
        // A bad/unreachable remote must be visible, not a silent ok.
        return {
          ok: false,
          committed,
          pulled: false,
          pushed: false,
          blockedSecrets,
          detail: `fetch: ${fetchError.slice(0, 200)}`,
        };
      }
      await git(treeRoot, ['checkout', '-B', 'main', 'origin/main'], host)
        .then(() => {
          pulled = true;
        })
        .catch(() => undefined); // empty remote: nothing to adopt yet
    }
    if (headExists || committed) {
      try {
        await git(treeRoot, ['push', '-u', 'origin', 'main'], host);
        pushed = true;
      } catch (error) {
        return {
          ok: false,
          committed,
          pulled,
          pushed: false,
          blockedSecrets,
          detail: `push: ${(error as Error).message.slice(0, 200)}`,
        };
      }
    }
    return {
      ok: true,
      committed,
      pulled,
      pushed,
      ...(blockedSecrets.length > 0 ? { blockedSecrets } : {}),
    };
  } catch (error) {
    const message = (error as Error).message;
    const recovered = recoverStaleIndexLock(treeRoot, message);
    return {
      ok: false,
      committed: false,
      pulled: false,
      pushed: false,
      detail: `${message.slice(0, 200)}${recovered ? ' (stale index.lock removed)' : ''}`,
    };
  } finally {
    lock.release();
  }
}

/** Runtime wrapper: debounce, interval and in-flight gating around cycles. */
export class MemoryGitSyncService {
  private inFlight = false;
  private disposed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private lastResult: MemorySyncResult | null = null;
  private readonly host: string;

  constructor(
    private readonly getTreeRoot: () => string | null,
    private readonly getRemoteUrl: () => string,
    host?: string,
  ) {
    this.host = host ?? nodeOs.hostname();
  }

  /** Start periodic sync + an initial pull. Idempotent. */
  start(): void {
    if (this.disposed || this.intervalTimer) return;
    this.schedule(SYNC_DEBOUNCE_MS);
    this.intervalTimer = setInterval(() => {
      void this.runCycle();
    }, SYNC_INTERVAL_MS);
  }

  /** Request a debounced cycle (after a memory write). */
  scheduleSync(): void {
    if (this.disposed) return;
    this.schedule(SYNC_DEBOUNCE_MS);
  }

  /** Last cycle outcome for the status surface. */
  getStatus(): { active: boolean; last: MemorySyncResult | null } {
    return { active: this.isActive(), last: this.lastResult };
  }

  isActive(): boolean {
    return !this.disposed && this.getRemoteUrl().trim().length > 0 && this.getTreeRoot() !== null;
  }

  /** Run one cycle now (manual / test entry). */
  async runCycle(): Promise<MemorySyncResult | null> {
    if (this.disposed || this.inFlight) return null;
    const root = this.getTreeRoot();
    const remoteUrl = this.getRemoteUrl().trim();
    if (!root || !remoteUrl) return null;
    this.inFlight = true;
    try {
      this.lastResult = await syncMemoryTree(root, remoteUrl, { host: this.host });
    } finally {
      this.inFlight = false;
    }
    return this.lastResult;
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.debounceTimer = null;
    this.intervalTimer = null;
  }

  private schedule(delayMs: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runCycle();
    }, delayMs);
  }
}
