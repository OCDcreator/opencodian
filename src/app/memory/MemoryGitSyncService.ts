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
 * Paths the memory tree must never commit: per-machine diagnostics and
 * editor scratch files. They are gitignored for new checkouts, but an old
 * tree may already track them, where ordinary ignores no longer apply.
 */
function isNeverCommitPath(rel: string): boolean {
  const base = rel.split('/').pop() ?? rel;
  return (
    base === 'metrics.jsonl' ||
    base === '.last-injection.json' ||
    base === '.memory-sync.lock' ||
    base === '.DS_Store' ||
    base === 'Thumbs.db' ||
    base.startsWith('~$') ||
    base.endsWith('.tmp') ||
    rel.includes('.tmpdir/')
  );
}

/** Remove one path from the index without touching the working tree. */
async function unstagePath(
  treeRoot: string,
  rel: string,
  headExists: boolean,
  host: string,
): Promise<void> {
  if (headExists) {
    await git(treeRoot, ['restore', '--staged', '--', rel], host);
  } else {
    // -f: the worktree may differ from the index (that is exactly the race
    // this gate defends against), and plain `rm --cached` refuses then.
    await git(treeRoot, ['rm', '--cached', '-q', '-f', '--', rel], host);
  }
}

/**
 * Unstage staged files whose content trips the credential heuristic and
 * report them. The staged blob (not the working-tree file) is scanned: a
 * concurrent memory writer can rewrite the worktree after `add -A`, and
 * scanning that would let the still-staged secret through. Every staged
 * file is scanned — a `.txt`/`.tmp` rename must not bypass the gate — and
 * an unreadable staged blob aborts the cycle instead of being skipped.
 *
 * Exported for the focused tests; not part of the plugin API.
 */
export async function unstageSecretFiles(treeRoot: string, host: string): Promise<string[]> {
  const stagedRaw = await git(
    treeRoot,
    ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
    host,
  );
  const staged = stagedRaw.split('\0').filter((p) => p.length > 0);
  if (staged.length === 0) return [];
  const headExists = await git(treeRoot, ['rev-parse', '--verify', 'HEAD'], host)
    .then(() => true)
    .catch(() => false);
  const blocked: string[] = [];
  for (const rel of staged) {
    if (isNeverCommitPath(rel)) {
      await unstagePath(treeRoot, rel, headExists, host);
      continue;
    }
    let content: string;
    try {
      content = await git(treeRoot, ['show', `:${rel}`], host);
    } catch (error) {
      // Fail-closed: an unreadable staged blob must not be committed blind.
      throw new Error(
        `secret scan failed for ${rel}: ${(error as Error).message.slice(0, 120)}`,
      );
    }
    if (!scanForSecrets(content).hit) continue;
    // Fail-closed: if the unstage itself fails the cycle aborts (outer
    // catch) rather than committing a credential. `restore --staged` needs
    // a HEAD to restore into the index; on an unborn branch only
    // `rm --cached` can drop the new entry.
    await unstagePath(treeRoot, rel, headExists, host);
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
 * spelling intact. User, case, trailing slash, and `.git` do not identify a
 * different repository. Ports are stripped here on purpose (the scp form has
 * none); `sameRemoteEndpoint` checks two explicit ports separately.
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

/** Explicit port in an ssh-style URL, or null when the spelling omits it. */
function explicitPort(url: string): string | null {
  const match = /^[a-z+]+:\/\/[^/]+:(\d+)\//iu.exec(url.trim());
  return match?.[1] ?? null;
}

/**
 * Compare two remote spellings as ENDPOINTS. The scp form carries no port,
 * so a missing port is a wildcard; two different explicit ports are
 * different services and must never compare equal.
 */
export function sameRemoteEndpoint(a: string, b: string): boolean {
  if (normalizeRemoteUrl(a) !== normalizeRemoteUrl(b)) return false;
  const portA = explicitPort(a);
  const portB = explicitPort(b);
  return portA === null || portB === null || portA === portB;
}

/** Hide userinfo so a credential-bearing URL never reaches logs or notices. */
export function redactRemoteUrl(url: string): string {
  const trimmed = url.trim();
  const scp = /^([^@/]+)@([^:]+):(.+)$/u.exec(trimmed);
  if (scp) return `***@${scp[2]}:${scp[3]}`;
  return trimmed.replace(/^([a-z+]+:\/\/)[^@/]+@/iu, '$1***@');
}

/** Redact URL credentials anywhere in a free-form sync detail. */
export function redactSyncDetail(detail: string): string {
  return detail
    .replace(/([a-z+]+:\/\/)[^@/\s]+@/giu, '$1***@')
    .replace(/(^|[\s(])([^@\s/:]+)@([\w.-]+):/gu, '$1***@$3:');
}

/** Resolve `insteadOf` aliases the way git will actually connect. */
async function expandRemoteUrl(
  treeRoot: string,
  url: string,
  host: string,
): Promise<string> {
  try {
    const expanded = (await git(treeRoot, ['ls-remote', '--get-url', url], host)).trim();
    return expanded || url;
  } catch {
    return url;
  }
}

/**
 * Initialize the repository and validate/add its origin without touching
 * worktree metadata. The separate phase lets an unborn repository first
 * adopt existing remote history without creating an unrelated root commit.
 *
 * The comparison is on the EXPANDED endpoint (insteadOf aliases applied) so
 * this side and zmem cannot disagree about what the URL actually means.
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
  // Keep the stored spelling; compare what git will actually connect to.
  const current = (await git(treeRoot, ['config', '--get', 'remote.origin.url'], host)).trim();
  const expandedCurrent = await expandRemoteUrl(treeRoot, current, host);
  const expandedConfigured = await expandRemoteUrl(treeRoot, remoteUrl, host);
  if (!sameRemoteEndpoint(expandedCurrent, expandedConfigured)) {
    return `origin points at ${redactRemoteUrl(current)} (resolves to ${redactRemoteUrl(expandedCurrent)}) ` +
      `but config says ${redactRemoteUrl(remoteUrl)} (resolves to ${redactRemoteUrl(expandedConfigured)}); ` +
      `refusing to re-point. To migrate on purpose: git -C ${treeRoot} remote set-url origin ${redactRemoteUrl(remoteUrl)}`;
  }
  // A matching fetch URL must not hide a different push destination.
  const allUrls = await git(treeRoot, ['config', '--get-all', 'remote.origin.url'], host)
    .catch(() => '');
  const pushUrls = await git(treeRoot, ['config', '--get-all', 'remote.origin.pushurl'], host)
    .catch(() => '');
  const endpoints = [...allUrls.split(/\r?\n/), ...pushUrls.split(/\r?\n/)]
    .map((value) => value.trim())
    .filter(Boolean);
  for (const endpoint of endpoints) {
    const expanded = await expandRemoteUrl(treeRoot, endpoint, host);
    if (!sameRemoteEndpoint(expanded, expandedConfigured)) {
      return `origin has an additional endpoint ${redactRemoteUrl(endpoint)} ` +
        `(resolves to ${redactRemoteUrl(expanded)}) that differs from config ` +
        `${redactRemoteUrl(remoteUrl)}; refusing to sync through an unexpected destination`;
    }
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
    mergeOut = await git(
      treeRoot,
      ['merge', '--autostash', '--no-edit', '--no-overwrite-ignore', 'origin/main'],
      host,
    );
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
    // Never mutate a diagnostic file that is already tracked: `.gitignore`
    // does not protect tracked paths, and `add -A` would carry it to the
    // remote on the next cycle.
    const tracked = await git(treeRoot, ['ls-files', '--error-unmatch', '--', 'metrics.jsonl'], host)
      .then(() => true)
      .catch(() => false);
    if (tracked) return;
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
        detail: result.detail ? redactSyncDetail(result.detail) : null,
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
    detail: redactSyncDetail(detail),
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
