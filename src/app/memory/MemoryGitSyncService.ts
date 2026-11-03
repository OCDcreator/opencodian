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
 * Safety rails (see docs/status/memory-sync-protocol.md):
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

/**
 * Normalize a remote URL for comparison while keeping the user's configured
 * spelling intact. A port, user, case, trailing slash, or `.git` suffix does
 * not identify a different repository for the shared-memory protocol.
 */
export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/u.exec(normalized);
  if (scp) normalized = `ssh://${scp[1]}/${scp[2]}`;
  normalized = normalized.replace(/^[a-z+]+:\/\/([^@/]+)@/iu, 'ssh://');
  normalized = normalized.replace(/:\d+(?=\/)/u, '');
  normalized = normalized.replace(/\/+$/u, '');
  normalized = normalized.replace(/\.git$/iu, '');
  return normalized.toLowerCase();
}

/**
 * Initialize the repository and validate/add its origin without touching
 * worktree metadata. The separate phase lets an unborn repository first
 * adopt existing remote history without creating an unrelated root commit.
 */
async function ensureMemorySyncRemote(
  treeRoot: string,
  remoteUrl: string,
  host = nodeOs.hostname(),
): Promise<string | null> {
  if (!nodeFs.existsSync(nodePath.join(treeRoot, '.git'))) {
    await git(treeRoot, ['init', '-b', 'main'], host);
  }
  const remotes = await git(treeRoot, ['remote'], host);
  if (!remotes.split(/\r?\n/).includes('origin')) {
    await git(treeRoot, ['remote', 'add', 'origin', remoteUrl], host);
    return null;
  }
  // Read the configured value, not `remote get-url`: the latter expands
  // `insteadOf` aliases and cannot prove we preserved the user's spelling.
  const current = (await git(treeRoot, ['config', '--get', 'remote.origin.url'], host)).trim();
  if (normalizeRemoteUrl(current) !== normalizeRemoteUrl(remoteUrl)) {
    return `origin points at ${current} but config says ${remoteUrl}; refusing to re-point. ` +
      `To migrate on purpose: git -C ${treeRoot} remote set-url origin ${remoteUrl}`;
  }
  return null;
}

/** Idempotent bootstrap: validate origin, then complete ignore/merge rules. */
export async function ensureMemorySyncRepo(
  treeRoot: string,
  remoteUrl: string,
  host = nodeOs.hostname(),
): Promise<string | null> {
  const remoteProblem = await ensureMemorySyncRemote(treeRoot, remoteUrl, host);
  if (remoteProblem) return remoteProblem;
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
  return null;
}

/** Return untracked paths that an unborn checkout would overwrite. */
async function getRemoteAdoptionConflicts(treeRoot: string, host: string): Promise<string[]> {
  const [untrackedRaw, remoteRaw] = await Promise.all([
    // Ignored local memories still belong to the user; checkout normally
    // permits overwriting ignored files, so they must be included here.
    git(treeRoot, ['ls-files', '--others', '-z'], host),
    git(treeRoot, ['ls-tree', '-r', '--name-only', '-z', 'origin/main'], host),
  ]);
  const untracked = new Set(untrackedRaw.split('\0').filter(Boolean));
  return remoteRaw.split('\0').filter((path) => untracked.has(path));
}

/** Fetch main, tolerating only an empty remote; report whether it exists. */
async function fetchMemorySyncRemote(treeRoot: string, host: string): Promise<boolean> {
  try {
    await git(treeRoot, ['fetch', 'origin', 'main'], host);
  } catch (error) {
    const message = (error as Error).message;
    if (/couldn't find remote ref/i.test(message)) return false;
    throw new Error(`fetch: ${message}`);
  }
  return git(treeRoot, ['rev-parse', '--verify', 'origin/main'], host)
    .then(() => true).catch(() => false);
}

/** Merge remote history without rewriting local commits or pushing conflicts. */
async function mergeMemorySyncRemote(
  treeRoot: string, host: string,
): Promise<{ pulled: boolean; detail?: string }> {
  if (!await fetchMemorySyncRemote(treeRoot, host)) return { pulled: false };
  const behind = await git(treeRoot, ['rev-list', '--count', 'HEAD..origin/main'], host);
  if (Number.parseInt(behind.trim(), 10) === 0) return { pulled: false };
  let mergeOut: string;
  try {
    mergeOut = await git(treeRoot, ['merge', '--autostash', '--no-edit', 'origin/main'], host);
  } catch (error) {
    await git(treeRoot, ['merge', '--abort'], host).catch(() => undefined);
    throw new Error(`merge: ${(error as Error).message}`);
  }
  const pulled = !/Already up to date|up to date/i.test(mergeOut);
  // Autostash restoration can conflict despite a successful merge exit.
  if ((await git(treeRoot, ['ls-files', '-u'], host)).trim()) {
    await git(treeRoot, ['merge', '--abort'], host).catch(() => undefined);
    return { pulled, detail: 'merge left unresolved entries after autostash; refusing to push conflict markers' };
  }
  return { pulled };
}

/** Append one gitignored, local-only result for post-mortem visibility. */
async function appendSyncTrace(treeRoot: string, result: MemorySyncResult, host: string): Promise<void> {
  try {
    // Origin refusal happens before worktree metadata may be completed. Keep
    // its trace local even when .gitignore does not exist, without staging or
    // changing that file (or the user's index) on a refused cycle.
    const excludePath = (await git(treeRoot, ['rev-parse', '--git-path', 'info/exclude'], host)).trim();
    ensureGitFileLines(
      nodePath.resolve(treeRoot, excludePath),
      GITIGNORE_BANNER,
      ['/metrics.jsonl'],
    );
    nodeFs.appendFileSync(
      nodePath.join(treeRoot, 'metrics.jsonl'),
      `${JSON.stringify({
        t: new Date().toISOString(),
        ok: result.ok,
        committed: result.committed,
        pulled: result.pulled,
        pushed: result.pushed,
        blockedSecrets: result.blockedSecrets ?? [],
        detail: result.detail ?? null,
      })}\n`,
      'utf8',
    );
  } catch {
    // Metrics are diagnostic-only and must not break a fail-soft sync.
  }
}

/**
 * One full sync cycle: validate remote → stage → commit → fetch/merge → push.
 * Merges preserve local history and files; neither rebase nor reset is used.
 */
async function runMemorySyncCycle(
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
  let committed = false;
  let pulled = false;
  let pushed = false;
  let blockedSecrets: string[] = [];
  const failure = (detail: string): MemorySyncResult => ({
    ok: false, committed, pulled, pushed,
    ...(blockedSecrets.length > 0 ? { blockedSecrets } : {}),
    detail,
  });
  try {
    // Refuse before metadata writes or staging: another plugin must never
    // silently redirect this shared tree to its own configured remote.
    const remoteProblem = await ensureMemorySyncRemote(treeRoot, remoteUrl, host);
    if (remoteProblem) return failure(remoteProblem);

    // An unborn tree must adopt an existing remote before bootstrap metadata
    // creates a local root commit. Merging two unrelated roots would either
    // fail or require unsafe history rewriting, neither of which is allowed.
    let headExists = await git(treeRoot, ['rev-parse', '--verify', 'HEAD'], host)
      .then(() => true)
      .catch(() => false);
    if (!headExists && await fetchMemorySyncRemote(treeRoot, host)) {
      const conflicts = await getRemoteAdoptionConflicts(treeRoot, host);
      if (conflicts.length > 0) {
        return failure(`bootstrap: remote history would overwrite untracked file(s): ${conflicts.join(', ')}`);
      }
      try {
        await git(treeRoot, ['checkout', '--no-overwrite-ignore', '-b', 'main', 'origin/main'], host);
        pulled = true;
      } catch (error) {
        return failure(`bootstrap: ${(error as Error).message.slice(0, 200)}`);
      }
    }

    const ensureProblem = await ensureMemorySyncRepo(treeRoot, remoteUrl, host);
    if (ensureProblem) return failure(ensureProblem);
    // An autostash-pop conflict (or a user merge in progress) leaves
    // unmerged entries; `add -A` would stage the conflict markers and clear
    // the evidence, so this check must run before staging.
    const unmerged = await git(treeRoot, ['ls-files', '-u'], host);
    if (unmerged.trim().length > 0) {
      return failure('unresolved merge entries present; refusing to commit conflict markers');
    }
    await git(treeRoot, ['add', '-A'], host);
    blockedSecrets = await unstageSecretFiles(treeRoot, host);
    // Worktree status includes secret files that were deliberately unstaged;
    // commit only what remains staged so a withheld secret cannot wedge sync.
    const staged = await git(treeRoot, ['diff', '--cached', '--name-only'], host);
    if (staged.trim().length > 0) {
      await git(
        treeRoot,
        ['commit', '-m', `memory(${host}): ${staged.trim().split(/\r?\n/).length} change(s)`],
        host,
      );
      committed = true;
    }
    headExists = await git(treeRoot, ['rev-parse', '--verify', 'HEAD'], host)
      .then(() => true)
      .catch(() => false);
    if (headExists) {
      const merged = await mergeMemorySyncRemote(treeRoot, host);
      pulled = merged.pulled || pulled;
      if (merged.detail) return failure(merged.detail);
      try {
        await git(treeRoot, ['push', '-u', 'origin', 'main'], host);
        pushed = true;
      } catch (error) {
        return failure(`push: ${(error as Error).message.slice(0, 200)}`);
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
    return failure(`${message.slice(0, 200)}${recovered ? ' (stale index.lock removed)' : ''}`);
  } finally {
    lock.release();
  }
}

/** Public fail-soft entry with a local trace for each safe, owned cycle. */
export async function syncMemoryTree(
  treeRoot: string,
  remoteUrl: string,
  opts: { host?: string } = {},
): Promise<MemorySyncResult> {
  const result = await runMemorySyncCycle(treeRoot, remoteUrl, opts);
  if (result.detail !== 'locked' && checkMemorySyncTreeRoot(treeRoot) === null) {
    await appendSyncTrace(treeRoot, result, opts.host ?? nodeOs.hostname());
  }
  return result;
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
    private readonly onResult?: (result: MemorySyncResult) => void,
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
      if (!this.disposed) {
        try {
          this.onResult?.(this.lastResult);
        } catch {
          // A host notification failure must not escape into the timer/chat.
        }
      }
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
