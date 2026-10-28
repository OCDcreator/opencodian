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
import { homedir } from 'node:os';
import * as nodePath from 'node:path';

export interface MemoryWorkspaceIdentity {
  workspaceIdentity?: string;
  workspacePathAliases?: Readonly<Record<string, string>>;
}

function expandIdentityPath(value: string): string {
  const text = value.trim();
  if (text === '~') return homedir();
  return /^~[/\\]/u.test(text) ? nodePath.join(homedir(), ...text.slice(2).split(/[/\\]+/u)) : text;
}

export function memoryWorkspaceBucket(workspacePath: string, options: MemoryWorkspaceIdentity = {}): string {
  const identity = options.workspaceIdentity?.trim();
  if (identity) return `project-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
  const resolved = nodePath.resolve(expandIdentityPath(workspacePath));
  const compare = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  for (const [from, to] of Object.entries(options.workspacePathAliases ?? {})) {
    if (!to.trim() || compare(nodePath.resolve(expandIdentityPath(from))) !== compare(resolved)) continue;
    const canonical = to.trim();
    const name = canonical.split(/[/\\]+/u).filter(Boolean).pop() ?? 'project';
    return `${sanitizeProjectSlug(name)}-${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
  }
  return `${sanitizeProjectSlug(nodePath.basename(resolved) || 'project')}-${hashWorkspacePath(resolved)}`;
}

export function memoryAgentKey(agent: string): string | null {
  const key = agent.replace(/[^a-zA-Z0-9_-]/g, '-');
  return key || null;
}

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
export function memoryProjectDir(workspacePath: string, options: MemoryWorkspaceIdentity = {}): string {
  return `${MEMORY_STORE_ROOT}/projects/${memoryWorkspaceBucket(workspacePath, options)}`;
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
 * Absolute project bucket dir under a shared external root:
 * `<root>/projects/<slug>-<hash16>/memory`. The bucket name uses the same
 * `hashWorkspacePath` as the vault-local layout, and the trailing `memory`
 * segment matches the opencode-zmem / ZCode workspace-memory tree exactly —
 * pointing the external root at either system's store base makes all three
 * operate on one physical tree.
 */
export function externalMemoryProjectDir(externalRoot: string, workspacePath: string, options: MemoryWorkspaceIdentity = {}): string {
  const resolvedRoot = nodePath.resolve(externalRoot);
  return nodePath.join(resolvedRoot, 'projects', memoryWorkspaceBucket(workspacePath, options), 'memory');
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
