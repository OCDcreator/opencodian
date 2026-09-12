/**
 * Workspace identity and memory store path resolution.
 *
 * zmem twin (D7/D16): `<slug>-<hash16>` bucket keyed by the normalized
 * absolute workspace path. D-O1 adaptation: opencodian anchors every backend
 * cwd to the vault, so the workspace key IS the vault path and the store
 * lives inside the vault under `.opencodian/memory/` — which also keeps
 * model-authored file writes permission-free for every backend.
 */

import { createHash } from 'node:crypto';
import * as nodePath from 'node:path';

/** Vault-relative root that contains all per-workspace memory buckets. */
export const MEMORY_STORE_ROOT = '.opencodian/memory';

export function sanitizeProjectSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug.length > 0 ? slug : 'project';
}

/**
 * Case-fold on Windows the same way the canonical-path hasher in
 * `ConfigurationArchiveService` does, so the same vault resolves to the same
 * bucket regardless of drive-letter casing.
 */
export function hashWorkspacePath(workspacePath: string): string {
  const resolved = nodePath.resolve(workspacePath);
  const identity = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 16);
}

/** Vault-relative project bucket dir: `.opencodian/memory/projects/<slug>-<hash16>`. */
export function memoryProjectDir(workspacePath: string): string {
  const resolved = nodePath.resolve(workspacePath);
  const slug = sanitizeProjectSlug(nodePath.basename(resolved) || 'project');
  return `${MEMORY_STORE_ROOT}/projects/${slug}-${hashWorkspacePath(workspacePath)}`;
}

/** Vault-relative path of a file directly inside the project bucket. */
export function memoryProjectFile(workspacePath: string, filename: string): string {
  return `${memoryProjectDir(workspacePath)}/${filename}`;
}

/** Vault-relative MEMORY.md index path for a workspace. */
export function memoryIndexPath(workspacePath: string): string {
  return memoryProjectFile(workspacePath, 'MEMORY.md');
}

/**
 * Model-facing native absolute memory dir (with trailing separator, the
 * protocol's canonical spelling). `nativeAbsolute` comes from the filesystem
 * port so Windows vaults render backslashes.
 */
export function modelMemoryRootDisplay(nativeAbsoluteDir: string): string {
  return nativeAbsoluteDir.endsWith('/') || nativeAbsoluteDir.endsWith('\\')
    ? nativeAbsoluteDir
    : `${nativeAbsoluteDir}/`;
}
