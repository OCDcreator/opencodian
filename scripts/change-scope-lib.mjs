// Unified change-scope library.
//
// All diff-aware gates must consume the same scope: merge-base..HEAD plus index
// plus worktree plus untracked files. This module computes immutable
// base/head/merge-base SHAs, builds committed/index/workspace candidate
// snapshots, derives a unioned path/status record set, and produces a stable
// normalized digest over sorted (path, finalStatus, mode, contentSha256) so
// that the same logical final tree yields the same candidate digest whether it
// arrives via committed, staged, unstaged or untracked form.
//
// A non-empty branch diff reported as "no changes" is a gate bug; this module
// must surface every candidate view distinctly.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ZERO_SHA_PATTERN = /^0{40}$/;

export function toPosix(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

export function normalizeRepoPath(value) {
  return toPosix(value).replace(/^\/+/, '').replace(/\/$/, '');
}

export function repoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/**
 * List all tracked TypeScript source files under src/, at ANY depth (including
 * root-level src/main.ts). The pathspec 'src/' is used (then filtered by
 * extension) because a recursive glob with the double-star sequence misses
 * root-level files — the star-star segment requires at least one directory
 * level. Declaration files (.d.ts) are excluded to match module-docs and
 * owner-manifest managed scope.
 */
export function listManagedSourceFiles(root) {
  const out = execFileSync('git', ['ls-files', 'src/'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((p) => p && (p.endsWith('.ts') || p.endsWith('.tsx')) && !p.endsWith('.d.ts'))
    .map(normalizeRepoPath)
    .sort();
}

function git(args, { cwd, encoding = 'utf8' } = {}) {
  return execFileSync('git', args, { cwd, encoding });
}

function gitTry(args, { cwd } = {}) {
  try {
    return git(args, { cwd });
  } catch {
    return null;
  }
}

/**
 * Resolve the default base ref for the local verify runner, in priority order:
 * explicit CLI arg > env VERIFY_BASE_REF > configured upstream of HEAD > remote
 * default branch (origin/main, origin/master) > fail closed.
 *
 * It must NEVER silently degrade to HEAD or to the current local branch — that
 * would turn a non-empty branch diff into an empty "no changes" false pass.
 * Local-only `main`/`master` are intentionally NOT used as fallback because in
 * a single-branch repo they equal HEAD.
 */
export function resolveBaseRef(root, { explicit, env = process.env } = {}) {
  if (explicit && explicit.trim()) {
    return { ref: explicit.trim(), source: 'explicit' };
  }
  if (env.VERIFY_BASE_REF && env.VERIFY_BASE_REF.trim()) {
    return { ref: env.VERIFY_BASE_REF.trim(), source: 'env' };
  }
  // Configured upstream of the current branch (e.g. origin/main).
  const upstream = gitTry(['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd: root });
  if (upstream && upstream.trim() && !upstream.includes('HEAD')) {
    // Guard against upstream == current branch (degenerate).
    const currentBranch = gitTry(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
    if (currentBranch && upstream.trim() !== currentBranch.trim()) {
      return { ref: upstream.trim(), source: 'upstream' };
    }
  }
  // Remote default branches only. Never fall back to local main/master which may
  // be the current branch and thus equal HEAD.
  for (const candidate of ['origin/main', 'origin/master']) {
    const sha = gitTry(['rev-parse', '--verify', `${candidate}^{commit}`], { cwd: root });
    if (sha && sha.trim() && !ZERO_SHA_PATTERN.test(sha.trim())) {
      return { ref: candidate, source: 'fallback' };
    }
  }
  return { ref: null, source: 'none', error: 'Unable to resolve a base ref (no explicit arg, no VERIFY_BASE_REF, no upstream, no origin/main or origin/master). Pass --base <ref>.' };
}

/**
 * Compute the immutable scope: base/head/merge-base full SHAs. For a branch
 * diff this requires merge-base. For a new-branch push event (before SHA is
 * zero), the caller supplies base; this function resolves merge-base from it.
 */
export function computeScopeShas(root, { baseRef, headRef = 'HEAD' } = {}) {
  if (!baseRef) {
    throw new Error('computeScopeShas requires a baseRef');
  }
  const baseSha = git(['rev-parse', `${baseRef}^{commit}`], { cwd: root }).trim();
  const headSha = git(['rev-parse', `${headRef}^{commit}`], { cwd: root }).trim();
  let mergeBaseSha;
  try {
    mergeBaseSha = git(['merge-base', baseSha, headSha], { cwd: root }).trim();
  } catch {
    // No common ancestor: use base as merge-base (whole base tree is the diff
    // origin). This is the safest fail-closed behavior.
    mergeBaseSha = baseSha;
  }
  return { baseSha, headSha, mergeBaseSha };
}

/**
 * A "candidate view" is the final path/status snapshot of the tree as seen from
 * one source: committed (merge-base..HEAD), index (merge-base..staged), or
 * workspace (merge-base..worktree-including-untracked).
 *
 * Each record: { path, status, mode, contentSha256 } where:
 *   - path: repo-relative, normalized, POSIX
 *   - status: A/M/D/R/C/T/U (single-letter final status)
 *   - mode: file mode as git knows it (or '000000' for deletes)
 *   - contentSha256: sha256 of the FINAL content blob (HEAD blob for committed,
 *     staged blob for index, worktree file bytes for workspace). For deletes,
 *     the empty-string digest.
 */

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256String(str) {
  return sha256Bytes(Buffer.from(str, 'utf8'));
}

const EMPTY_DIGEST = sha256String('');

/**
 * Parse git diff --name-status output, normalizing renames to delete+add so
 * detection threshold cannot change the digest.
 */
function parseNameStatus(raw) {
  if (!raw || !raw.trim()) return [];
  const records = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (status.startsWith('R') || status.startsWith('C')) {
      records.push({ path: normalizeRepoPath(parts[1]), status: 'D' });
      records.push({ path: normalizeRepoPath(parts[2]), status: 'A' });
    } else {
      records.push({ path: normalizeRepoPath(parts[1]), status: status[0] });
    }
  }
  return records;
}

/**
 * The three candidate views. Each is computed independently from merge-base so
 * that a staged change cannot be hidden by a clean worktree (or vice versa).
 *
 *   committed  = git diff --name-status --find-renames <mergeBase>..<HEAD>
 *   index      = git diff --name-status --find-renames --cached <mergeBase>
 *   workspace  = (unstaged tracked vs mergeBase) ∪ (untracked files)
 */
export function buildCandidateViews(root, { mergeBaseSha, headSha } = {}) {
  if (!mergeBaseSha || !headSha) {
    throw new Error('buildCandidateViews requires mergeBaseSha and headSha');
  }
  const committedRaw = git(['diff', '--name-status', '--find-renames', `${mergeBaseSha}..${headSha}`], { cwd: root }).trim();
  const indexRaw = git(['diff', '--name-status', '--find-renames', '--cached', mergeBaseSha], { cwd: root }).trim();
  // `git diff <mergeBase>` (no --cached) compares mergeBase to the working tree
  // for tracked files, catching unstaged modifications/deletes. Untracked files
  // are never in any tree, so add them explicitly.
  const workspaceTrackedRaw = git(['diff', '--name-status', '--find-renames', mergeBaseSha], { cwd: root }).trim();
  const untrackedRaw = git(['ls-files', '--others', '--exclude-standard'], { cwd: root }).trim();

  return {
    committed: parseNameStatus(committedRaw),
    index: parseNameStatus(indexRaw),
    workspaceTracked: parseNameStatus(workspaceTrackedRaw),
    untracked: untrackedRaw
      ? untrackedRaw.split(/\r?\n/).map((p) => ({ path: normalizeRepoPath(p), status: 'A' }))
      : [],
  };
}

/**
 * Compute content sha256 for a record given its source. For committed, the blob
 * is read from headSha; for index, from the staged blob; for workspace, from
 * the worktree file bytes.
 */
export function contentDigestFor(root, record, { source, headSha } = {}) {
  if (record.status === 'D') {
    return EMPTY_DIGEST;
  }
  try {
    if (source === 'committed') {
      const blob = git(['show', `${headSha}:${record.path}`], { cwd: root });
      return sha256Bytes(Buffer.from(blob, 'utf8'));
    }
    if (source === 'index') {
      const blob = git(['show', `:${record.path}`], { cwd: root });
      return sha256Bytes(Buffer.from(blob, 'utf8'));
    }
    if (source === 'workspace' || source === 'untracked') {
      const abs = path.join(root, record.path);
      const bytes = fs.readFileSync(abs);
      return sha256Bytes(bytes);
    }
  } catch {
    // File absent (e.g. delete already applied): empty digest.
    return EMPTY_DIGEST;
  }
  return EMPTY_DIGEST;
}

/**
 * Resolve the file mode for a record (git-style octal, '100644' etc, '000000'
 * for deletes).
 */
export function modeFor(root, record, { source, headSha } = {}) {
  if (record.status === 'D') {
    return '000000';
  }
  try {
    if (source === 'committed') {
      return git(['ls-tree', headSha, '--', record.path], { cwd: root }).split(/\s+/)[0] || '100644';
    }
    if (source === 'index') {
      return git(['ls-files', '--stage', '--', record.path], { cwd: root }).split(/\s+/)[0] || '100644';
    }
    const stat = fs.statSync(path.join(root, record.path));
    return (stat.mode & 0o111) ? '100755' : '100644';
  } catch {
    return '100644';
  }
}

/**
 * Build a full candidate (records with content + mode) for one source.
 */
export function buildCandidate(root, { mergeBaseSha, headSha, source }) {
  const views = buildCandidateViews(root, { mergeBaseSha, headSha });
  let records;
  if (source === 'committed') records = views.committed;
  else if (source === 'index') records = views.index;
  else if (source === 'workspace') records = [...views.workspaceTracked, ...views.untracked];
  else throw new Error(`Unknown candidate source: ${source}`);

  return records.map((record) => ({
    path: record.path,
    status: record.status,
    mode: modeFor(root, record, { source, headSha }),
    contentSha256: contentDigestFor(root, record, { source, headSha }),
  }));
}

/**
 * Produce the unioned path/status record set across all three candidates. For
 * approval digest, each path's FINAL state (the candidate that would actually
 * merge) matters; we report per-source so a gate can detect a staged change
 * hidden by a clean worktree.
 */
export function unionCandidates(root, { mergeBaseSha, headSha } = {}) {
  const committed = buildCandidate(root, { mergeBaseSha, headSha, source: 'committed' });
  const index = buildCandidate(root, { mergeBaseSha, headSha, source: 'index' });
  const workspace = buildCandidate(root, { mergeBaseSha, headSha, source: 'workspace' });
  return { committed, index, workspace };
}

/**
 * Compute the normalized candidate digest: hash of sorted
 * (path, finalStatus, mode, contentSha256) records. The same logical final tree
 * in committed/staged/unstaged/untracked forms MUST yield the same digest.
 *
 * Approval request metadata (docs/architecture/approvals/**) is EXCLUDED from
 * the digest so an approval request does not create a self-referential binding
 * (the request would otherwise bind to a digest that includes itself). This
 * also means adding/removing an approval request file never changes the scope
 * digest of the actual code change.
 */
export const APPROVAL_REQUEST_EXCLUDE_PREFIX = 'docs/architecture/approvals/';

export function candidateDigest(records, { excludePrefixes = [APPROVAL_REQUEST_EXCLUDE_PREFIX] } = {}) {
  const filtered = excludePrefixes?.length
    ? records.filter((r) => !excludePrefixes.some((p) => r.path.startsWith(p)))
    : records;
  const normalized = filtered
    .map((r) => `${r.path}\0${r.status}\0${r.mode}\0${r.contentSha256}`)
    .sort();
  return sha256String(normalized.join('\n'));
}

/**
 * The full change scope artifact: immutable SHAs, the three candidate views,
 * their digests, and the unioned path set. This is what gates consume.
 */
export function computeChangeScope(root, { baseRef, headRef = 'HEAD' } = {}) {
  const { baseSha, headSha, mergeBaseSha } = computeScopeShas(root, { baseRef, headRef });
  const candidates = unionCandidates(root, { mergeBaseSha, headSha });
  const digests = {
    committed: candidateDigest(candidates.committed),
    index: candidateDigest(candidates.index),
    workspace: candidateDigest(candidates.workspace),
  };
  const allPaths = new Set([
    ...candidates.committed.map((r) => r.path),
    ...candidates.index.map((r) => r.path),
    ...candidates.workspace.map((r) => r.path),
  ]);
  return {
    baseRef,
    baseSha,
    headRef,
    headSha,
    mergeBaseSha,
    candidates,
    digests,
    paths: [...allPaths].sort(),
    isEmpty: allPaths.size === 0,
  };
}
