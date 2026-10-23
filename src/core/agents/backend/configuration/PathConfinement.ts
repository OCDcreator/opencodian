/**
 * PathConfinement — the single shared symlink-aware parent-walk confinement
 * owner for the configuration-completeness work (see docs/adr/0001).
 *
 * Three call sites previously each implemented their own parent-walk
 * (assertWithinRoot, resolveCanonicalTargetWithinRoot, ConfigurationArchiveService
 * .confinedPath) and had begun to drift — especially in their lstat/realpath
 * catch-all behavior. This module owns the walk algorithm; each wrapper keeps
 * its own domain-error mapping, lexical-escape check, and root-resolution
 * policy (e.g. allow-missing-root for the archive).
 *
 * Security contract (uniform across all callers):
 *   - a missing component (ENOENT) anchors the remainder under the last
 *     verified ancestor (safe for create)
 *   - any OTHER lstat/realpath error (EACCES/EIO/...) FAILS CLOSED
 *     (PathConfinementError) — it is never silently treated as "missing"
 *   - a symlink that resolves outside the anchor root FAILS CLOSED
 *   - an unresolved symlink FAILS CLOSED
 */
import { lstat, realpath } from 'node:fs/promises';
import * as path from 'node:path';

/** Raised when a path escapes confinement or the filesystem cannot be safely traversed. */
export class PathConfinementError extends Error {}

/** True only for a "no such entry" error; all other errors fail closed. */
export function isENOENTError(err: unknown): boolean {
  return err !== null && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT';
}

/** True when `candidate` equals or lives lexically inside `root` (both resolved). */
export function isWithinRoot(root: string, candidate: string): boolean {
  const r = path.resolve(root);
  const c = path.resolve(candidate);
  return c === r || c.startsWith(r + path.sep);
}

/**
 * Resolve the anchor root's canonical realpath. ENOENT (the root does not exist
 * yet — nothing can have been planted inside it) falls back to the lexical
 * resolved path; any other error (the root exists but is unreadable) FAILS
 * CLOSED. Used by the archive owner where the archive root may not yet exist.
 */
export async function resolveAnchorRealpath(rootPath: string): Promise<string> {
  try {
    return await realpath(rootPath);
  } catch (err) {
    if (isENOENTError(err)) {
      return path.resolve(rootPath);
    }
    throw new PathConfinementError(`anchor root unreadable: ${(err as { code?: string }).code ?? 'unknown'}`);
  }
}

/**
 * Walk `components` from `realRoot`, returning the resolved confined path.
 * Each existing component is lstat-checked; a symlink resolving outside
 * realRoot, an unresolved symlink, or any non-ENOENT lstat/realpath error
 * throws PathConfinementError. A missing component (ENOENT) anchors the
 * remaining components under the last verified ancestor (and proves that
 * anchored path stays inside root).
 */
export async function confinedComponentWalk(
  realRoot: string,
  components: readonly string[],
): Promise<string> {
  let current = realRoot;
  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    const candidate = path.join(current, component);
    let st;
    try {
      st = await lstat(candidate);
    } catch (err) {
      if (isENOENTError(err)) {
        const anchored = path.join(current, component, ...components.slice(i + 1));
        if (!isWithinRoot(realRoot, anchored)) {
          throw new PathConfinementError('missing-anchor escapes root');
        }
        return anchored;
      }
      throw new PathConfinementError(`component unreadable: ${(err as { code?: string }).code ?? 'unknown'}`);
    }
    if (st.isSymbolicLink()) {
      let resolved: string;
      try {
        resolved = await realpath(candidate);
      } catch {
        throw new PathConfinementError('symlink unresolved');
      }
      if (!isWithinRoot(realRoot, resolved)) {
        throw new PathConfinementError('symlink escapes root');
      }
      current = resolved;
    } else {
      current = candidate;
    }
  }
  if (!isWithinRoot(realRoot, current)) {
    throw new PathConfinementError('target escapes root');
  }
  return current;
}
