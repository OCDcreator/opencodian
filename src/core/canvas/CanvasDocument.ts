/**
 * CanvasDocument — the `.canvas` JSON schema, lenient parse, deterministic
 * serialization and the strict write gate (R-C5, flowtext-c5-design §3.1).
 *
 * Division of labor, per the design:
 *
 * - `parseCanvasDocument` is LENIENT: it tolerates unknown fields (verified
 *   against real vault files that carry namespaced extras such as
 *   `x-nimbalyst` / `readingDesk`) and preserves them verbatim, so reading +
 *   writing back an existing canvas never loses data (round-trip fidelity).
 * - `serializeCanvasDocument` is DETERMINISTIC: known keys first in a fixed
 *   order, then extras in their original insertion order, 2-space indentation
 *   (matches Obsidian's own writer). Same input → byte-identical output, so
 *   golden tests are possible.
 * - `assertWritableDocument` is STRICT and fail-closed: anything the plugin is
 *   about to write must be structurally legal (unique ids, resolvable edge
 *   endpoints, finite coordinates, known node types, per-type required text).
 *   It throws rather than repairing.
 *
 * Pure module: no Obsidian imports, fully unit-testable.
 */

/** Plain-object guard (arrays are not canvas node/edge entries). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The node types Obsidian's canvas defines today. */
export const CANVAS_NODE_TYPES = ['text', 'file', 'link', 'group'] as const;
export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[number];

export const CANVAS_EDGE_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type CanvasEdgeSide = (typeof CANVAS_EDGE_SIDES)[number];

function isKnownNodeType(type: unknown): type is CanvasNodeType {
  return typeof type === 'string' && (CANVAS_NODE_TYPES as readonly string[]).includes(type);
}

/** Narrow a (possibly future) type value; assert uses the raw check instead. */
export function isKnownCanvasNodeType(type: string): type is CanvasNodeType {
  return isKnownNodeType(type);
}

export interface CanvasNodeData {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** `type: 'text'`. */
  text?: string;
  /** `type: 'file'`, vault-relative path. */
  file?: string;
  /** `type: 'link'`. */
  url?: string;
  /** Obsidian color bucket `"1"`..`"6"` (kept verbatim when present). */
  color?: string;
  /** `type: 'group'`. */
  label?: string;
  /**
   * Unknown fields preserved verbatim for round-trip fidelity. Typed as
   * `unknown` (never `never`) so extras survive parse → serialize untouched.
   */
  [extra: string]: unknown;
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasEdgeSide;
  toSide?: CanvasEdgeSide;
  label?: string;
  /** Unknown fields preserved verbatim (real files carry `toEnd`, extras). */
  [extra: string]: unknown;
}

export interface CanvasDocument {
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
  /** Unknown top-level fields preserved verbatim. */
  [extra: string]: unknown;
}

/** Fail-closed parse / assert failure carrying a stable machine reason. */
export class CanvasDocumentError extends Error {
  constructor(public readonly reason: string) {
    super(`canvas document: ${reason}`);
    this.name = 'CanvasDocumentError';
  }
}

/** Keys serialize in this fixed order before any preserved extras. */
const NODE_KEY_ORDER: readonly string[] = [
  'id', 'type', 'x', 'y', 'width', 'height', 'text', 'file', 'url', 'color', 'label',
];
const EDGE_KEY_ORDER: readonly string[] = [
  'id', 'fromNode', 'toNode', 'fromSide', 'toSide', 'label',
];
const NODE_KNOWN_KEYS = new Set(NODE_KEY_ORDER);
const EDGE_KNOWN_KEYS = new Set(EDGE_KEY_ORDER);
const EDGE_SIDES = new Set<string>(CANVAS_EDGE_SIDES);

/** Split a raw record into (known values in fixed order) + (extras in file order). */
function orderedEntries(
  raw: Record<string, unknown>,
  keyOrder: readonly string[],
  knownKeys: Set<string>,
): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  for (const key of keyOrder) {
    if (raw[key] !== undefined) {
      entries.push([key, raw[key]]);
    }
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!knownKeys.has(key) && value !== undefined) {
      entries.push([key, value]);
    }
  }
  return entries;
}

/**
 * Entries are copied verbatim — no coercion. Values that violate the write
 * contract (missing coordinates, unknown types) survive parse untouched and
 * are rejected by `assertWritableDocument` when the plugin tries to write.
 */
function toEntryData<T>(raw: Record<string, unknown>, keyOrder: readonly string[], knownKeys: Set<string>): T {
  const entry: Record<string, unknown> = {};
  for (const [key, value] of orderedEntries(raw, keyOrder, knownKeys)) {
    entry[key] = value;
  }
  return entry as T;
}

function toNodeData(raw: Record<string, unknown>): CanvasNodeData {
  return toEntryData<CanvasNodeData>(raw, NODE_KEY_ORDER, NODE_KNOWN_KEYS);
}

function toEdgeData(raw: Record<string, unknown>): CanvasEdgeData {
  return toEntryData<CanvasEdgeData>(raw, EDGE_KEY_ORDER, EDGE_KNOWN_KEYS);
}

/**
 * Lenient parse: only structurally impossible input throws (non-JSON text,
 * non-object root, non-array or non-object node/edge entries, entries without
 * ids). Unknown fields — including unknown node type strings — are preserved
 * verbatim; `assertWritableDocument` is the place that rejects them.
 */
export function parseCanvasDocument(json: string): CanvasDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CanvasDocumentError('invalid-json');
  }
  if (!isPlainObject(raw)) {
    throw new CanvasDocumentError('root-not-an-object');
  }
  const rawNodes = raw.nodes ?? [];
  const rawEdges = raw.edges ?? [];
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    throw new CanvasDocumentError('nodes-or-edges-not-arrays');
  }
  const nodes = rawNodes.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new CanvasDocumentError(`node-${index}-not-an-object`);
    }
    if (typeof entry.id !== 'string' || entry.id === '') {
      throw new CanvasDocumentError(`node-${index}-missing-id`);
    }
    return toNodeData(entry);
  });
  const edges = rawEdges.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new CanvasDocumentError(`edge-${index}-not-an-object`);
    }
    if (typeof entry.id !== 'string' || entry.id === '') {
      throw new CanvasDocumentError(`edge-${index}-missing-id`);
    }
    return toEdgeData(entry);
  });
  const doc: CanvasDocument = { nodes, edges };
  for (const [key, value] of Object.entries(raw)) {
    if (key !== 'nodes' && key !== 'edges' && value !== undefined) {
      doc[key] = value;
    }
  }
  return doc;
}

/**
 * Deterministic serialization: 2-space indentation (matches Obsidian's own
 * writer), known keys in fixed order, then preserved extras in insertion
 * order. Same document → byte-identical output.
 */
export function serializeCanvasDocument(doc: CanvasDocument): string {
  const raw = {
    nodes: doc.nodes.map((node) => Object.fromEntries(orderedEntries(node, NODE_KEY_ORDER, NODE_KNOWN_KEYS))),
    edges: doc.edges.map((edge) => Object.fromEntries(orderedEntries(edge, EDGE_KEY_ORDER, EDGE_KNOWN_KEYS))),
  };
  const docRaw: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(doc)) {
    if (key !== 'nodes' && key !== 'edges' && value !== undefined) {
      docRaw[key] = value;
    }
  }
  return JSON.stringify(docRaw, null, 2);
}

function requireFiniteRect(node: CanvasNodeData, label: string): string | null {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const value = node[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${label}-${key}-not-finite`;
    }
  }
  if (node.width <= 0 || node.height <= 0) {
    return `${label}-non-positive-size`;
  }
  return null;
}

/**
 * Strict write gate (fail-closed): every document the plugin is about to
 * persist must satisfy the structural contract. Throws `CanvasDocumentError`
 * with a stable reason; never repairs, never drops content.
 *
 * Unknown node types are rejected here (the plugin must not write nodes it
 * cannot model), while unknown FIELDS remain acceptable — they round-trip.
 */
export function assertWritableDocument(doc: CanvasDocument): void {
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    throw new CanvasDocumentError('nodes-or-edges-not-arrays');
  }
  const nodeIds = assertWritableNodes(doc.nodes);
  assertWritableEdges(doc.edges, nodeIds);
}

/** Per-node contract; returns the live id set for edge-endpoint validation. */
function assertWritableNodes(nodes: CanvasNodeData[]): Set<string> {
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (typeof node.id !== 'string' || node.id === '') {
      throw new CanvasDocumentError('node-missing-id');
    }
    if (nodeIds.has(node.id)) {
      throw new CanvasDocumentError(`duplicate-node-id:${node.id}`);
    }
    nodeIds.add(node.id);
    if (!isKnownNodeType(node.type)) {
      throw new CanvasDocumentError(`unknown-node-type:${String(node.type)}`);
    }
    const rectProblem = requireFiniteRect(node, `node:${node.id}`);
    if (rectProblem) {
      throw new CanvasDocumentError(rectProblem);
    }
    assertNodePayload(node);
  }
  return nodeIds;
}

/** Per-type required payload (`label` stays optional for group nodes). */
function assertNodePayload(node: CanvasNodeData): void {
  switch (node.type) {
    case 'text':
      if (typeof node.text !== 'string') {
        throw new CanvasDocumentError(`text-node-missing-text:${node.id}`);
      }
      break;
    case 'file':
      if (typeof node.file !== 'string' || node.file === '') {
        throw new CanvasDocumentError(`file-node-missing-file:${node.id}`);
      }
      break;
    case 'link':
      if (typeof node.url !== 'string' || node.url === '') {
        throw new CanvasDocumentError(`link-node-missing-url:${node.id}`);
      }
      break;
    case 'group':
      break;
  }
}

/** Per-edge contract: unique id, both endpoints resolvable, legal sides. */
function assertWritableEdges(edges: CanvasEdgeData[], nodeIds: Set<string>): void {
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (typeof edge.id !== 'string' || edge.id === '') {
      throw new CanvasDocumentError('edge-missing-id');
    }
    if (edgeIds.has(edge.id)) {
      throw new CanvasDocumentError(`duplicate-edge-id:${edge.id}`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.fromNode)) {
      throw new CanvasDocumentError(`edge-dangling-from:${edge.id}`);
    }
    if (!nodeIds.has(edge.toNode)) {
      throw new CanvasDocumentError(`edge-dangling-to:${edge.id}`);
    }
    for (const side of [edge.fromSide, edge.toSide]) {
      if (side !== undefined && !EDGE_SIDES.has(String(side))) {
        throw new CanvasDocumentError(`edge-invalid-side:${edge.id}`);
      }
    }
  }
}
