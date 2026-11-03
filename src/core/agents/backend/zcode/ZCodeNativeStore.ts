/** Native ZCode file transactions. The lock shape is compatible with ZCode's
 * atomicFileLock (a60ba6a7); only our own owner file is ever removed. */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { type FileRevision,readAllowlistedFileSnapshot } from '../configuration/ProjectResourceSecureWrite';

export function zcodeRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Canonicalize a permitted parent before creating a native sidecar lock. */
export async function withZCodeFileLock<T>(targetPath: string, operation: () => Promise<T>): Promise<T> {
  const parent = await realpath(path.dirname(targetPath));
  const lockPath = path.join(parent, `${path.basename(targetPath)}.lock`);
  const ownerPath = path.join(lockPath, `owner-${randomUUID()}.json`);
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if ((await lstat(lockPath)).isSymbolicLink()) throw new Error('zcode-lock-invalid');
      // Never remove another writer's lock, including a seemingly stale one.
      if (Date.now() >= deadline) throw new Error('zcode-lock-busy');
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    await writeFile(ownerPath, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: path.basename(ownerPath) }), { flag: 'wx', mode: 0o600 });
    return await operation();
  } finally {
    await unlink(ownerPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(lockPath);
  }
}

export interface ZCodeJsonSnapshot {
  readonly revision: FileRevision | null;
  readonly document: Record<string, unknown>;
}

/** Path-confinement and no-follow reads precede every provider/account mutation. */
export async function readZCodeJson(targetPath: string): Promise<ZCodeJsonSnapshot> {
  try { await lstat(targetPath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: null, document: {} };
    throw error;
  }
  const snapshot = await readAllowlistedFileSnapshot({ targetPath, allowlist: [{ scope: 'global', rootPath: path.dirname(targetPath) }] });
  if (snapshot.status === 'absent') return { revision: null, document: {} };
  if (snapshot.status !== 'success') throw new Error('zcode-config-unreadable');
  let parsed: unknown;
  try { parsed = JSON.parse(snapshot.content); } catch { throw new Error('zcode-config-invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('zcode-config-invalid');
  return { revision: snapshot.revision, document: parsed as Record<string, unknown> };
}

/** Missing credentials are a legitimate signed-out state; no fallback to Desktop. */
export async function readZCodeCredentialBytes(targetPath: string): Promise<string | null> {
  try {
    if ((await lstat(targetPath)).isSymbolicLink()) throw new Error('zcode-credentials-invalid');
    return await readFile(targetPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
