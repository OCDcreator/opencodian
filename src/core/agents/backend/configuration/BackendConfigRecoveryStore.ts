import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

import { isENOENTError } from './PathConfinement';

/** Machine-local history for secret-bearing saved backend configurations.
 * Listings expose metadata only. Callers pin the archived revision and compare
 * the current saved revision before restoring through the validated save path. */
export interface BackendConfigRecoveryEntry { index: number; savedAt: number; revision: string; bytes: number }
export interface BackendConfigRecoveryRead { raw: string; revision: string; savedAt: number }

const RECOVERY_LIMIT = 5;
const RECOVERY_DIRECTORY_MODE = 0o700;
const RECOVERY_FILE_MODE = 0o600;

export function recoveryRevision(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function validateNamespace(identity: string, key: string): void {
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(key)) {
    throw new Error('Invalid backend recovery namespace');
  }
}

/** Walk before resolving: resolving a symlink first would bless its destination,
 * including a vault directory. Only the dedicated final directory is hardened;
 * existing home/worktree ancestors keep their own permissions. */
function privateDirectory(path: string, create: boolean): string | null {
  const target = resolve(path);
  const root = parse(target).root;
  let cursor = root;
  for (const component of relative(root, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    let stats;
    try { stats = lstatSync(cursor); } catch (error) {
      if (!isENOENTError(error)) throw error;
      if (!create) return null;
      mkdirSync(cursor, { mode: RECOVERY_DIRECTORY_MODE });
      stats = lstatSync(cursor);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('Unsafe backend recovery directory');
  }
  const canonical = realpathSync(target);
  // A path swapped to a symlink during the walk must not become a new anchor.
  if (process.platform !== 'win32' && canonical !== target) throw new Error('Unsafe backend recovery directory');
  if (process.platform !== 'win32') {
    if (create) chmodSync(target, RECOVERY_DIRECTORY_MODE);
    else if ((lstatSync(target).mode & 0o077) !== 0) throw new Error('Backend recovery directory is not private');
  }
  return canonical;
}

function recoveryDirectory(base: string, identity: string, create: boolean): string | null {
  const anchor = privateDirectory(base, create);
  if (!anchor) return null;
  return privateDirectory(join(anchor, identity), create);
}

function readSlotAt(directory: string, key: string, index: number): (BackendConfigRecoveryRead & { index: number; bytes: number }) | null {
  if (!Number.isInteger(index) || index < 1 || index > RECOVERY_LIMIT) return null;
  const file = join(directory, `${key}-${index}.json`);
  try {
    const stats = lstatSync(file);
    if (!stats.isFile() || stats.isSymbolicLink() || (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)) return null;
    if (realpathSync(file) !== file) return null;
    const raw = readFileSync(file, 'utf8');
    return { index, raw, revision: recoveryRevision(raw), bytes: Buffer.byteLength(raw), savedAt: stats.mtimeMs };
  } catch { return null; }
}

function writeSlot(directory: string, key: string, raw: string, beforeCommit: () => void): void {
  const temporary = join(directory, `${key}-${randomUUID()}.tmp`);
  // Exclusive creation cannot follow a pre-existing file or symlink. A failed
  // write/rename leaves its private temporary for inspection; no cleanup command
  // or recursive removal runs here. Successful rename leaves no temporary.
  writeFileSync(temporary, raw, { flag: 'wx', mode: RECOVERY_FILE_MODE });
  beforeCommit();
  renameSync(temporary, join(directory, `${key}-1.json`));
}

export interface BackendConfigRecoveryStore {
  list(identity: string, key: string): BackendConfigRecoveryEntry[];
  read(identity: string, key: string, index: number): BackendConfigRecoveryRead | null;
  /** Archive the pre-save value; an empty overlay is a valid working state. */
  archive(identity: string, key: string, raw: string): void;
}

export function createBackendConfigRecoveryStore(options: { baseDir?: string } = {}): BackendConfigRecoveryStore {
  const base = options.baseDir ?? join(homedir(), '.opencodian', 'backend-config-recovery');
  if (!isAbsolute(base)) throw new Error('Backend recovery root must be absolute');
  return {
    list(identity, key) {
      validateNamespace(identity, key);
      const directory = recoveryDirectory(base, identity, false);
      if (!directory) return [];
      const entries: BackendConfigRecoveryEntry[] = [];
      for (let index = 1; index <= RECOVERY_LIMIT; index += 1) {
        const entry = readSlotAt(directory, key, index);
        if (entry) entries.push({ index: entry.index, savedAt: entry.savedAt, revision: entry.revision, bytes: entry.bytes });
      }
      return entries;
    },
    read(identity, key, index) {
      validateNamespace(identity, key);
      const directory = recoveryDirectory(base, identity, false);
      if (!directory) return null;
      const entry = readSlotAt(directory, key, index);
      return entry ? { raw: entry.raw, revision: entry.revision, savedAt: entry.savedAt } : null;
    },
    archive(identity, key, raw) {
      validateNamespace(identity, key);
      const directory = recoveryDirectory(base, identity, true);
      if (!directory) throw new Error('Backend recovery directory is unavailable');
      writeSlot(directory, key, raw, () => {
        for (let index = RECOVERY_LIMIT; index >= 2; index -= 1) {
          try { renameSync(join(directory, `${key}-${index - 1}.json`), join(directory, `${key}-${index}.json`)); }
          catch (error) { if (!isENOENTError(error)) throw error; }
        }
      });
    },
  };
}

/** Without an absolute vault identity recovery stays unavailable. */
export function backendRecoveryIdentity(vaultPath: string | undefined, kind: string): string | null {
  const vault = vaultPath?.trim();
  if (!vault || !isAbsolute(vault) || !kind.trim()) return null;
  return createHash('sha256').update(`${resolve(vault)}\n${kind}`).digest('hex');
}
