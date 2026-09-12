/**
 * Topic File manifest: parse frontmatter of every memory file under a
 * project bucket (zmem twin). The manifest feeds index partitioning, recall
 * selection and hygiene assessment.
 */

import { DEFAULT_IMPORTANCE, parseImportanceValue } from './memoryStore';
import type { MemoryFileSystem } from './memoryTypes';

export interface TopicManifestEntry {
  /** Vault-relative path (`.opencodian/memory/projects/<bucket>/<file>.md`). */
  filePath: string;
  filename: string;
  name: string;
  description: string;
  /** Self-scored 1-5; missing/invalid frontmatter defaults to 3. */
  importance: number;
  /** Frontmatter `metadata.type` (user | feedback | project | reference). */
  type?: string;
  /** Frontmatter `metadata.reflection: true` — written by post-compaction reflection. */
  reflection?: boolean;
  /** Frontmatter `metadata.source` provenance tag (`extracted|compacted <session>`). */
  source?: string;
  mtimeMs: number;
}

export { DEFAULT_IMPORTANCE };

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u;
const METADATA_BLOCK_RE = /^metadata:[^\S\n]*\r?\n((?:[ \t]+[^\n]*\r?\n?)+)/m;

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(raw: string): {
  name?: string;
  description?: string;
  type?: string;
  importance?: string;
  reflection?: boolean;
  source?: string;
} {
  const m = raw.match(FRONTMATTER_RE);
  if (!m?.[1]) return {};
  const block = m[1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const metadataBlock = block.match(METADATA_BLOCK_RE)?.[1] ?? '';
  const type = metadataBlock.match(/^[ \t]+type:\s*(.+)$/m)?.[1]?.trim();
  const importance = metadataBlock.match(
    /^[ \t]+importance:\s*(.+)$/m,
  )?.[1]?.trim();
  const reflection = metadataBlock.match(
    /^[ \t]+reflection:\s*(.+)$/m,
  )?.[1]?.trim();
  const source = metadataBlock.match(
    /^[ \t]+source:\s*(.+)$/m,
  )?.[1]?.trim();
  return {
    ...(name ? { name: unquote(name) } : {}),
    ...(description ? { description: unquote(description) } : {}),
    ...(type ? { type: unquote(type).toLowerCase() } : {}),
    ...(importance ? { importance } : {}),
    ...(reflection ? { reflection: unquote(reflection).toLowerCase() === 'true' } : {}),
    ...(source ? { source: unquote(source) } : {}),
  };
}

function filenameStem(filename: string): string {
  return filename.toLowerCase().endsWith('.md')
    ? filename.slice(0, -3)
    : filename;
}

/**
 * Build the manifest for a project bucket through the filesystem port.
 * Missing dir → []. Unreadable entries are skipped (fail-soft, never block
 * injection on one bad file).
 */
export async function buildTopicManifest(
  fs: MemoryFileSystem,
  projectDir: string,
): Promise<TopicManifestEntry[]> {
  let names: string[];
  try {
    names = await fs.listFiles(projectDir);
  } catch {
    return [];
  }

  const out: TopicManifestEntry[] = [];
  for (const filename of names) {
    if (!filename.toLowerCase().endsWith('.md')) continue;
    if (filename.toLowerCase() === 'memory.md') continue;
    const filePath = `${projectDir}/${filename}`;
    let raw: string | null;
    let mtimeMs: number | null;
    try {
      raw = await fs.readFile(filePath);
      mtimeMs = await fs.mtimeMs(filePath);
    } catch {
      continue;
    }
    if (raw === null) continue;
    const fm = parseFrontmatter(raw);
    const stem = filenameStem(filename);
    out.push({
      filePath,
      filename,
      name: fm.name ?? stem,
      description: fm.description ?? '',
      importance: parseImportanceValue(fm.importance),
      ...(fm.type ? { type: fm.type } : {}),
      ...(fm.reflection ? { reflection: true } : {}),
      ...(fm.source ? { source: fm.source } : {}),
      mtimeMs: mtimeMs ?? 0,
    });
  }
  return out.sort((a, b) => a.filename.localeCompare(b.filename));
}
