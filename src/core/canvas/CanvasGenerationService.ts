/**
 * CanvasGenerationService — build a new `.canvas` and land it atomically
 * (R-C5, flowtext-c5-design §3.3). Acceptance 4 ("generation must never leave
 * a half-written canvas") is enforced structurally:
 *
 * 1. the whole document is built in memory (deterministic layout, stable ids);
 * 2. before touching the disk the serialized text is re-parsed and passes the
 *    strict `assertWritableDocument` — a corrupt document cannot reach
 *    `vault.create`;
 * 3. the target path is pre-checked and suffixed (` 2`, ` 3`, …) so an
 *    existing canvas is never overwritten;
 * 4. exactly ONE `vault.create`; if the create itself throws, and the file
 *    nevertheless exists afterwards (theoretical vault boundary), the created
 *    file is moved to the trash before the error propagates.
 *
 * The vault is reached only through the `CanvasVaultPort`; the Obsidian
 * adapter lives in the feature layer, so this module stays pure and the
 * failure matrix is testable against the shared vault harness.
 */

import {
  assertWritableDocument,
  type CanvasDocument,
  type CanvasNodeData,
  serializeCanvasDocument,
} from './CanvasDocument';
import { layoutGrid, layoutGroupedColumns } from './CanvasLayout';
import type { CanvasSplitProposal } from './CanvasSplitProposal';

/** Vault slice the generation service needs (Obsidian adapter in the feature layer). */
export interface CanvasVaultPort {
  /** `vault.getAbstractFileByPath(path) !== null` on the real API. */
  pathExists(path: string): boolean | Promise<boolean>;
  /** Single-shot `vault.create(path, json)`. */
  create(path: string, data: string): Promise<unknown>;
  /** Trash a file the vault may have half-created when `create` threw. */
  trash(path: string): Promise<void>;
}

export type CanvasGenerationMode = 'file-references' | 'ai-split';

export interface CanvasGenerationRequest {
  /** Title for the filename and (split mode) group labels; sanitized for filenames. */
  readonly title: string;
  /** Target directory, vault-relative ('' = vault root). Never created implicitly. */
  readonly directory: string;
  /** File-reference mode: one node per note path. */
  readonly notes?: readonly string[];
  /** AI-split mode: excerpts grouped by topic. */
  readonly proposals?: readonly CanvasSplitProposal[];
}

export interface CanvasGenerationResult {
  readonly path: string;
  readonly mode: CanvasGenerationMode;
  readonly nodeCount: number;
  readonly groupCount: number;
}

/** Deterministic node ids (`canvas-node-1`, …) keep builds golden-testable. */
export function buildFileReferenceDocument(notes: readonly string[]): CanvasDocument {
  const rects = layoutGrid(notes.length);
  const nodes: CanvasNodeData[] = notes.map((path, index) => ({
    id: `canvas-node-${index + 1}`,
    type: 'file' as const,
    ...rects[index],
    file: path,
  }));
  return { nodes, edges: [] };
}

/** Group proposals by topic (input order preserved) and lay out one column per topic. */
export function buildSplitDocument(proposals: readonly CanvasSplitProposal[]): CanvasDocument {
  const topics: Array<{ topic: string; proposals: CanvasSplitProposal[] }> = [];
  const byTopic = new Map<string, { topic: string; proposals: CanvasSplitProposal[] }>();
  for (const proposal of proposals) {
    let bucket = byTopic.get(proposal.topic);
    if (!bucket) {
      bucket = { topic: proposal.topic, proposals: [] };
      byTopic.set(proposal.topic, bucket);
      topics.push(bucket);
    }
    bucket.proposals.push(proposal);
  }
  const layout = layoutGroupedColumns(topics.map((bucket) => bucket.proposals.length));
  const nodes: CanvasNodeData[] = [];
  const groups: CanvasNodeData[] = [];
  let nodeIndex = 0;
  topics.forEach((bucket, groupIndex) => {
    const groupRect = layout.groups[groupIndex];
    groups.push({
      id: `canvas-group-${groupIndex + 1}`,
      type: 'group',
      ...groupRect,
      label: bucket.topic,
    });
    bucket.proposals.forEach((proposal) => {
      const rect = layout.nodes[nodeIndex];
      nodeIndex += 1;
      nodes.push({
        id: `canvas-node-${nodeIndex}`,
        type: 'text',
        ...rect,
        text: proposal.excerpt,
      });
    });
  });
  // Groups render behind their members; listing them after keeps z-order right.
  return { nodes: [...nodes, ...groups], edges: [] };
}

/**
 * Sanitize a user/model-provided title into a legal Obsidian filename segment
 * (the vault rejects `\ / : * ? " < > |` and `#`/`^`/`[`/`]` break links).
 */
export function sanitizeCanvasTitle(title: string): string {
  const cleaned = title.replace(/[#^[\]|*?"<>:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80);
}

/** `${title} canvas` base filename (design §3.3: `<主题或 'Untitled'> canvas.canvas`). */
export function canvasBaseFileName(title: string): string {
  const safe = sanitizeCanvasTitle(title) || 'Untitled';
  return `${safe} canvas.canvas`;
}

/** Join a vault-relative directory ('' = root) with a filename. */
export function joinVaultPath(directory: string, fileName: string): string {
  const dir = directory.replace(/^\/+|\/+$/g, '');
  return dir ? `${dir}/${fileName}` : fileName;
}

/**
 * Name-collision suffixing (design §3.3): never overwrite — `name.canvas`,
 * `name 2.canvas`, `name 3.canvas` … until `exists` reports a free name.
 * Bounded (1000 attempts) so a pathological `exists` cannot loop forever.
 */
export async function nextAvailableCanvasPath(
  desiredPath: string,
  exists: (path: string) => boolean | Promise<boolean>,
): Promise<string> {
  if (!(await exists(desiredPath))) {
    return desiredPath;
  }
  const dot = desiredPath.lastIndexOf('.');
  const stem = dot > 0 ? desiredPath.slice(0, dot) : desiredPath;
  const extension = dot > 0 ? desiredPath.slice(dot) : '';
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem} ${n}${extension}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(`no free canvas path derived from ${desiredPath}`);
}

export class CanvasGenerationService {
  constructor(private readonly vault: CanvasVaultPort) {}

  /**
   * Build, double-validate, then create. Resolves with the created path;
   * rejects with the original error (plus reclaim attempt) when creation
   * fails. The document is never written partially: validation happens
   * entirely in memory, and a failed `create` that still left a file behind
   * is trashed before the error is rethrown.
   */
  async generate(request: CanvasGenerationRequest): Promise<CanvasGenerationResult> {
    const mode: CanvasGenerationMode = request.proposals ? 'ai-split' : 'file-references';
    const doc = mode === 'ai-split'
      ? buildSplitDocument(request.proposals ?? [])
      : buildFileReferenceDocument(request.notes ?? []);

    if (doc.nodes.length === 0) {
      throw new Error('canvas generation: refusing to create an empty canvas');
    }

    // Double validation BEFORE any disk contact: byte-level round trip plus
    // the strict structural gate (design §3.3 step 2).
    const serialized = serializeCanvasDocument(doc);
    assertWritableDocument(doc);
    const roundTrip = JSON.parse(serialized) as CanvasDocument;
    assertWritableDocument(roundTrip as CanvasDocument);

    const desiredPath = joinVaultPath(request.directory, canvasBaseFileName(request.title));
    const targetPath = await nextAvailableCanvasPath(desiredPath, (path) => this.vault.pathExists(path));

    try {
      await this.vault.create(targetPath, serialized);
    } catch (error) {
      // Theoretical boundary: a create that throws but still left the file.
      try {
        if (await this.vault.pathExists(targetPath)) {
          await this.vault.trash(targetPath);
        }
      } catch {
        // Reclaim is best-effort; the original error is the report.
      }
      throw error;
    }
    return {
      path: targetPath,
      mode,
      nodeCount: doc.nodes.filter((node) => node.type !== 'group').length,
      groupCount: doc.nodes.filter((node) => node.type === 'group').length,
    };
  }
}
