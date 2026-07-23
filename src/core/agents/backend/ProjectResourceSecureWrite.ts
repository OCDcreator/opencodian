/**
 * Shared secure project-resource write helpers.
 *
 * Isolates the high-risk security boundary for writing user-editable resource
 * files (Claude commands/skills/agents, Codex skills/agents) inside the vault:
 *   - name safety
 *   - path-traversal / outside-root protection (single chokepoint)
 *   - atomic write (temp file + rename) so a half-written file never remains
 *
 * Reused across the Claude and Codex project-resource discovery owners so the
 * security invariants live in exactly one place. Global resources
 * (~/.claude, ~/.agents, ~/.codex) never pass through here — they are
 * strictly read-only.
 */

import { existsSync } from 'fs';
import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'fs/promises';
import * as path from 'path';

export type ProjectResourceWriteError =
  | 'empty-vault'
  | 'invalid-name'
  | 'duplicate'
  | 'path-traversal'
  | 'outside-project-root'
  | 'not-found'
  | 'write-failed';

export class ProjectResourceError extends Error {
  constructor(public readonly code: ProjectResourceWriteError) {
    super(code);
    this.name = 'ProjectResourceError';
  }
}

/** A safe resource name: non-empty, no path separators, no leading dot, no control chars. */
export function isSafeResourceName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith('.')) {
    return false;
  }
  if (/[\\/:]/.test(trimmed)) {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- rejecting ASCII control chars is intentional for path safety
  if (/[\x00-\x1f]/.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Secure within-root assertion via a real-path parent-walk. This is the single
 * chokepoint that prevents create/update/delete from following a symlink out of
 * the vault into ~/.claude / ~/.agents / ~/.codex.
 *
 * Unlike a purely lexical `path.resolve` check, this resolves symlinks on the
 * root and on every existing component between the real root and the target:
 *   - The root is resolved with `realpath` (so a symlinked vault root is
 *     anchored to its real target).
 *   - Each existing path component is `lstat`-ed; if it is a symlink, its real
 *     target is resolved and must stay within the real root, otherwise the
 *     operation is rejected as `path-traversal`.
 *   - For a non-existent target (create), the walk stops at the first missing
 *     component and trusts the already-verified parent (the new file/dir is
 *     created fresh under a safe ancestor).
 *
 * Must be `await`-ed at every create/update/delete site before any write or
 * delete. Callers are already async.
 */
export async function assertWithinRoot(rootPath: string, targetPath: string): Promise<void> {
  const lexicalRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);

  // Compute the relative path from the lexical root to the target. This keeps
  // both bases consistent (important on platforms where the root itself lives
  // behind a symlink, e.g. macOS /var -> /private/var); the relative
  // components are then walked from the REAL root below.
  const rel = path.relative(lexicalRoot, normalizedTarget);
  if (rel === '' ) {
    // target is the root itself.
  } else if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ProjectResourceError('path-traversal');
  }

  let realRoot: string;
  try {
    realRoot = await realpath(rootPath);
  } catch {
    throw new ProjectResourceError('outside-project-root');
  }

  // Parent-walk: descend each component from the real root. For each existing
  // component, lstat it; if it is a symlink, resolve its real target and
  // verify it stays within the real root. Stop at the first non-existent
  // component (it will be created under a verified-safe parent).
  const components = rel.split(path.sep).filter((component) => component.length > 0);
  let current = realRoot;
  for (const component of components) {
    current = path.join(current, component);
    let stat;
    try {
      stat = await lstat(current);
    } catch {
      // Component does not exist yet — everything below is freshly created
      // under a parent we have already verified. Safe to stop.
      break;
    }
    if (stat.isSymbolicLink()) {
      let resolved: string;
      try {
        resolved = await realpath(current);
      } catch {
        throw new ProjectResourceError('path-traversal');
      }
      if (resolved !== realRoot && !resolved.startsWith(realRoot + path.sep)) {
        throw new ProjectResourceError('path-traversal');
      }
      // Continue descent from the symlink's real target.
      current = resolved;
    }
  }
}

/**
 * Atomic write: write to a temp file in the same directory, then rename. If
 * the rename fails, the temp file is removed so no half-written file remains.
 */
export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.opencodian-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, targetPath);
  } catch (err) {
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch {
      // Ignore temp cleanup failures.
    }
    throw err;
  }
}

/** Convert a thrown error (or ProjectResourceError) into a write-error code. */
export function toWriteErrorCode(err: unknown): ProjectResourceWriteError {
  if (err instanceof ProjectResourceError) {
    return err.code;
  }
  return 'write-failed';
}
