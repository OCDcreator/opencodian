/**
 * Maintenance flows over a memory bucket: read-only lint / status reports
 * and the confirm-first forget (zmem `/zmem` subcommand twins, D-O8).
 * Standalone functions over the filesystem port so the orchestrating
 * service stays under its size budget; every entry is fail-soft.
 */

import { buildTopicManifest, type TopicManifestEntry } from './memoryManifest';
import { modelMemoryRootDisplay } from './memoryPaths';
import { scanForSecrets } from './memorySecretScan';
import { removeIndexLines } from './memoryStore';
import type { MemoryFileSystem, MemoryMetricEvent } from './memoryTypes';
import { byteLength } from './memoryTypes';

export type MemoryLintReport = {
  projectDir: string;
  topicFiles: number;
  indexLines: number;
  indexBytes: number;
  secretHits: Array<{ file: string; kinds: string[] }>;
  missingImportance: string[];
  strayFiles: string[];
};

export interface MemoryStatusReport {
  projectDir: string;
  memoryRootDisplay: string;
  indexExists: boolean;
  indexLines: number;
  indexBytes: number;
  topicFiles: number;
  byType: Record<string, number>;
  lastInjection: MemoryMetricEvent | null;
}

/** Read-only lint report: secret hits, missing importance, stray files. */
export async function lintMemoryBucket(input: {
  fs: MemoryFileSystem;
  projectDir: string;
  indexPath: string;
  indexContent: string | null;
  manifest: TopicManifestEntry[];
}): Promise<MemoryLintReport> {
  const index = input.indexContent ?? '';
  const secretHits: Array<{ file: string; kinds: string[] }> = [];
  const missingImportance: string[] = [];

  for (const entry of input.manifest) {
    const raw = await input.fs.readFile(entry.filePath).catch(() => null);
    if (raw !== null) {
      const scan = scanForSecrets(raw);
      if (scan.hit) secretHits.push({ file: entry.filename, kinds: scan.kinds });
    }
    if (entry.importance === 3 && !/importance:/i.test(raw ?? '')) {
      missingImportance.push(entry.filename);
    }
  }

  const strayFiles: string[] = [];
  if (index.trim()) {
    const referenced = new Set<string>();
    for (const line of index.split('\n')) {
      const m = line.match(/^-\s+\[[^\]]*\]\(([^)\s]+)\)/u);
      if (m?.[1]) {
        const target = m[1].split('#')[0] ?? m[1];
        referenced.add(target.slice(target.lastIndexOf('/') + 1).toLowerCase());
      }
    }
    for (const entry of input.manifest) {
      if (!referenced.has(entry.filename.toLowerCase())) strayFiles.push(entry.filename);
    }
  }

  return {
    projectDir: input.projectDir,
    topicFiles: input.manifest.length,
    indexLines: index.trim() ? index.trim().split('\n').length : 0,
    indexBytes: byteLength(index),
    secretHits,
    missingImportance,
    strayFiles,
  };
}

/** Read-only status report for the maintenance command. */
export async function readMemoryStatus(input: {
  fs: MemoryFileSystem;
  projectDir: string;
  indexContent: string | null;
  manifest: TopicManifestEntry[];
}): Promise<MemoryStatusReport> {
  const index = input.indexContent ?? '';
  const byType: Record<string, number> = {};
  for (const entry of input.manifest) {
    const type = entry.type ?? 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
  }
  let lastInjection: MemoryMetricEvent | null = null;
  try {
    const raw = await input.fs.readFile(`${input.projectDir}/.last-injection.json`);
    if (raw) lastInjection = JSON.parse(raw) as MemoryMetricEvent;
  } catch {
    lastInjection = null;
  }
  return {
    projectDir: input.projectDir,
    memoryRootDisplay: modelMemoryRootDisplay(input.fs.nativeAbsolutePath(input.projectDir)),
    indexExists: index.trim().length > 0,
    indexLines: index.trim() ? index.trim().split('\n').length : 0,
    indexBytes: byteLength(index),
    topicFiles: input.manifest.length,
    byType,
    lastInjection,
  };
}

/** Forget flow: delete the matching topic file(s) and their index lines. */
export async function forgetMemory(input: {
  fs: MemoryFileSystem;
  projectDir: string;
  indexPath: string;
  name: string;
}): Promise<{ removed: string[] }> {
  const manifest: TopicManifestEntry[] = await buildTopicManifest(input.fs, input.projectDir)
    .catch((): TopicManifestEntry[] => []);
  const slug = input.name.toLowerCase().replace(/\.md$/u, '');
  const targets = manifest.filter(
    (e) => e.filename.toLowerCase() === `${slug}.md` || e.name.toLowerCase() === slug,
  );
  for (const target of targets) {
    await input.fs.remove(target.filePath).catch(() => undefined);
  }
  if (targets.length > 0) {
    const current = await input.fs.readFile(input.indexPath).catch(() => null);
    await input.fs.writeFile(
      input.indexPath,
      removeIndexLines(current, new Set(targets.map((t) => t.filename))),
    ).catch(() => undefined);
  }
  return { removed: targets.map((t) => t.filename) };
}
