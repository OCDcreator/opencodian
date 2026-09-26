/** Official ZCode desktop task-index bridge. This is a version-checked, fail-closed
 * dependency on the installed desktop bundle, not a reimplementation of its DB. */
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

export interface ZCodeDesktopTaskMeta {
  taskId: string;
  traceId: string;
  title: string;
  titleOverridden: boolean;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
  mode: string;
  provider: 'glm';
  status: string;
}

export interface ZCodeDesktopTaskIndex {
  seedTaskMetaIfMissing(meta: ZCodeDesktopTaskMeta): Promise<{ taskId: string }>;
  updateTaskState(input: { workspacePath: string; taskId: string; patch: { deleted: true } }): Promise<{ taskId: string }>;
  listDeletedTaskIds(input: { workspacePath: string; provider: 'glm' }): Promise<string[]>;
  close(): void;
}

/** Find the official class by its exported runtime name, not by a hashed chunk filename. */
export function openZCodeDesktopTaskIndex(entryPath: string, dataRoot: string): ZCodeDesktopTaskIndex {
  if (path.basename(entryPath) !== 'zcode.cjs' || path.basename(path.dirname(entryPath)) !== 'glm') {
    throw new Error('ZCode desktop task index requires the official bundled runtime.');
  }
  const resources = path.dirname(path.dirname(entryPath));
  const archive = path.join(resources, 'app.asar');
  const manifest = JSON.parse(fs.readFileSync(path.join(archive, 'package.json'), 'utf8')) as { name?: string };
  if (manifest.name !== '@zcode/desktop') throw new Error('ZCode desktop package identity mismatch.');
  const hostDir = path.join(archive, 'out', 'host');
  const candidates = fs.readdirSync(hostDir)
    .filter((name) => /^chunk-[A-Z0-9]+\.js$/.test(name))
    .filter((name) => fs.readFileSync(path.join(hostDir, name), 'utf8').includes('TaskIndexRepo'));
  if (candidates.length !== 1) throw new Error('ZCode desktop task-index implementation is ambiguous or missing.');
  // Electron's own asar-aware require resolves official bundled ESM in Obsidian.
  // No source text is evaluated: the implementation is the installed app module.
  const officialRequire = createRequire(entryPath);
  const exports = officialRequire(path.join(hostDir, candidates[0])) as Record<string, unknown>;
  const Repo = Object.values(exports).find((value) => typeof value === 'function' && value.name === 'TaskIndexRepo') as
    | (new (dbPath: string) => ZCodeDesktopTaskIndex) | undefined;
  if (!Repo) throw new Error('ZCode desktop task-index class is unavailable.');
  const dbPath = path.join(dataRoot, 'v2', 'tasks-index.sqlite');
  if (!fs.existsSync(dbPath)) throw new Error('ZCode desktop task index is unavailable.');
  const repo = new Repo(dbPath);
  if (typeof repo.seedTaskMetaIfMissing !== 'function' || typeof repo.updateTaskState !== 'function'
    || typeof repo.listDeletedTaskIds !== 'function' || typeof repo.close !== 'function') {
    repo.close?.();
    throw new Error('ZCode desktop task-index API changed.');
  }
  return repo;
}
