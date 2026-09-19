/**
 * CanvasNodeWriteService — the write side of node-level AI editing (R-C5,
 * flowtext-c5-design §3.4). Two explicit, bounded write paths, nothing else:
 *
 * - TEXT node: `canvas.getData()` → replace the one node's `text` in memory →
 *   `assertWritableDocument` → `canvas.setData(doc)` → `canvas.requestSave(false)`.
 *   The save itself stays in Canvas's own pipeline — the plugin never writes
 *   the `.canvas` file directly here.
 * - FILE node: the underlying markdown note is rewritten through a single
 *   `vault.process` closure that reads first, compares against the snapshot
 *   taken when the rewrite session started (dirty check, §6.3) and throws —
 *   aborting with zero changes — on divergence.
 *
 * The RUNTIME CONFIRMATION GATE is the design's first hard requirement: the
 * Canvas API surface was verified only statically against the shipped bundle,
 * so every structural assumption is probed at runtime and turned into an
 * explicit go/no-go decision. When the gate fails the node-editing feature
 * must NOT register itself, and the UI reports the gap honestly (§6.7) — no
 * silent no-op, no fake success.
 *
 * Ctrl+Z honesty (design §3.4 / E2, R-C5 acceptance 3): the write-back rides
 * the canvas view's OWN data + history pipeline, verified statically against
 * the shipped Obsidian 1.13.7 renderer bundle (`app.js`, canvas class):
 *
 * - `canvas.setData(doc)` applies the document AND pushes it onto the host
 *   history stack (`history.push(e)` inside `setData`);
 * - `canvas.requestSave()` with no argument pushes the SAME post-write
 *   snapshot a second time (its `pushHistory` flag defaults to true), so the
 *   history stack ends up `[pre, post, post]` — the first Ctrl+Z re-applies
 *   the identical post state and the undo looks dead (measured live:
 *   "file unchanged after Cmd+Z");
 * - `canvas.requestSave(false)` keeps the view save (dirty flag + debounced
 *   `view.save` → `vault.modify`) while skipping the duplicate push, leaving
 *   `[pre, post]` — one Ctrl+Z applies `pre` through `applyHistory`, which
 *   itself calls `view.requestSave()` so the file reverts on disk too.
 *
 * The guaranteed second undo channel is the R-B3 revert system, which is
 * view-independent (see CanvasIntegrationController's coverage round).
 *
 * Pure module: everything is expressed over structural interfaces, so the
 * whole contract is unit-testable without Obsidian.
 */

import {
  assertWritableDocument,
  type CanvasDocument,
  type CanvasNodeData,
} from './CanvasDocument';

/** Structural shape of one node handle inside `canvas.selection` (unexported API). */
export interface CanvasNodeHandleLike {
  id?: unknown;
  getData?(): unknown;
}

/** Structural shape of the (unexported) live canvas instance on a canvas view. */
export interface CanvasRuntimeLike {
  selection?: unknown;
  getData?: () => unknown;
  setData?: (data: unknown) => unknown;
  /**
   * Host signature `requestSave(pushHistory?: boolean)` (Obsidian 1.13.7
   * bundle): the flag defaults to true and pushes a history snapshot. The
   * text write passes `false` — `setData` already pushed — so the stack does
   * not end up with two identical post-write entries that eat the first
   * Ctrl+Z. A host that ignores the argument only degrades to the old
   * "undo twice" behaviour, never to data loss.
   */
  requestSave?: (pushHistory?: boolean) => unknown;
}

/** Structural shape of Obsidian's canvas view (`view.canvas` carries the rest). */
export interface CanvasViewLike {
  canvas?: CanvasRuntimeLike;
  /**
   * Host view save (Obsidian's canvas FileView): persists immediately when
   * the view is dirty instead of waiting out the ~2s debounced save.
   * Optional — when absent the debounced save remains the fallback.
   */
  saveImmediately?: () => unknown;
}

/** Feature-detect results gathered from one canvas view (host-side, impure). */
export interface CanvasRuntimeProbe {
  /** `view.canvas` exists. */
  hasCanvas: boolean;
  /** `canvas.selection` is a `Set` (informational — ladder C covers its absence). */
  selectionIsSet: boolean;
  /** `canvas.getData` is callable. */
  hasGetData: boolean;
  /** `canvas.setData` is callable. */
  hasSetData: boolean;
  /** `canvas.requestSave` is callable. */
  hasRequestSave: boolean;
  /** A `getData()` call returned a `{nodes, edges}` shape. */
  getDataShapeValid: boolean;
}

/**
 * The runtime confirmation gate's decision (design §3.4 / §7).
 *
 * - `supported` — the READ side (`canvas`, `getData`, document shape) works;
 *   the node-editing feature registers itself. Reading is what every ladder
 *   rung A–D needs.
 * - `canWriteBack` — the write side (`setData` + `requestSave`) also works;
 *   true → ladder A/B/C with real write-back, false → ladder D (rewrite
 *   result is shown and copied, the user pastes manually — never a fake
 *   write).
 * - `reasons` — every missing piece, verbatim for the settings debug surface.
 *
 * When neither side works the feature does NOT register and says so honestly
 * (§6.7): the compose-time check refuses to create bridges or commands.
 */
export interface CanvasGateDecision {
  supported: boolean;
  canWriteBack: boolean;
  reasons: string[];
}

/** Pure gate decision (fail closed: unproven capabilities are treated as absent). */
export function resolveCanvasGateDecision(probe: CanvasRuntimeProbe): CanvasGateDecision {
  const reasons: string[] = [];
  const readSideWorks = probe.hasCanvas && probe.hasGetData && probe.getDataShapeValid;
  if (!probe.hasCanvas) reasons.push('view.canvas missing');
  if (!probe.hasGetData) reasons.push('canvas.getData missing');
  if (!probe.getDataShapeValid) reasons.push('canvas.getData shape not {nodes, edges}');
  const writeSideWorks = probe.hasSetData && probe.hasRequestSave;
  if (readSideWorks && !probe.hasSetData) reasons.push('canvas.setData missing — ladder D (copy only)');
  if (readSideWorks && !probe.hasRequestSave) reasons.push('canvas.requestSave missing — ladder D (copy only)');
  if (!readSideWorks) {
    reasons.push('canvas node editing not supported by this Obsidian version');
  }
  return { supported: readSideWorks, canWriteBack: readSideWorks && writeSideWorks, reasons };
}

/** Probe one canvas view's runtime surface (never throws). */
export function probeCanvasView(view: CanvasViewLike): CanvasGateDecision {
  const canvas = view.canvas as CanvasRuntimeLike | undefined;
  let dataShape = false;
  if (canvas && typeof canvas.getData === 'function') {
    try {
      dataShape = isDocumentShape(canvas.getData());
    } catch {
      dataShape = false;
    }
  }
  return resolveCanvasGateDecision({
    hasCanvas: Boolean(canvas),
    selectionIsSet: canvas?.selection instanceof Set,
    hasGetData: typeof canvas?.getData === 'function',
    hasSetData: typeof canvas?.setData === 'function',
    hasRequestSave: typeof canvas?.requestSave === 'function',
    getDataShapeValid: dataShape,
  });
}

function isDocumentShape(value: unknown): value is CanvasDocument {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const doc = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(doc.nodes) && Array.isArray(doc.edges);
}

/** Read a node handle's live data (never throws). */
export function readNodeData(handle: CanvasNodeHandleLike): CanvasNodeData | null {
  if (!handle || typeof handle.getData !== 'function') {
    return null;
  }
  try {
    const data = handle.getData();
    if (typeof data !== 'object' || data === null) {
      return null;
    }
    return data as CanvasNodeData;
  } catch {
    return null;
  }
}

/** The node content a rewrite session works on, read-only. */
export interface CanvasNodeContent {
  readonly nodeId: string;
  readonly kind: 'text' | 'file';
  /** Text-node body, or the file node's vault-relative path in `filePath`. */
  readonly text?: string;
  readonly filePath?: string;
}

/**
 * Resolve the rewrite target from the canvas selection (design §3.4: the user
 * action reads `selection` synchronously — no push events, see §7-U4). With
 * multiple nodes selected the FIRST one wins (minimum viable, §6.2); the
 * caller is told so it can say "only the first node was processed".
 */
export function resolveSelectedNode(
  canvas: CanvasRuntimeLike,
): { ok: true; content: CanvasNodeContent; extraSelectionCount: number } | { ok: false; reason: string } {
  const selection = canvas.selection;
  if (!(selection instanceof Set)) {
    return { ok: false, reason: 'selection-unreadable' };
  }
  if (selection.size === 0) {
    return { ok: false, reason: 'no-selection' };
  }
  const [first] = [...selection] as CanvasNodeHandleLike[];
  const data = readNodeData(first);
  if (!data || typeof data.id !== 'string') {
    return { ok: false, reason: 'node-data-unreadable' };
  }
  if (data.type === 'text' && typeof data.text === 'string') {
    return {
      ok: true,
      content: { nodeId: data.id, kind: 'text', text: data.text },
      extraSelectionCount: Math.max(selection.size - 1, 0),
    };
  }
  if (data.type === 'file' && typeof data.file === 'string' && data.file !== '') {
    return {
      ok: true,
      content: { nodeId: data.id, kind: 'file', filePath: data.file },
      extraSelectionCount: Math.max(selection.size - 1, 0),
    };
  }
  return { ok: false, reason: 'node-type-unsupported' };
}

export type CanvasTextWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'node-changed' | 'node-not-found' | 'invalid-document' | 'write-refused'; readonly detail?: string };

/**
 * Text-node write-back (the ONLY `.canvas` mutating path). The dirty check
 * re-reads the node's CURRENT text from a fresh `canvas.getData()` — the same
 * authoritative source the write-back itself uses — and refuses on divergence
 * from the snapshot taken when the rewrite session started. The rewritten node
 * is replaced inside the full document, validated, and handed back through
 * `setData` + `requestSave(false)`; any validation failure returns BEFORE
 * `setData` is ever reached, so the canvas never sees a broken document.
 *
 * `setData` applies the document and records the host history entry;
 * `requestSave(false)` persists through the view's own save pipeline WITHOUT
 * a second identical history push (see the module header for the bundle
 * evidence) — so the host's own Ctrl+Z restores the pre-write state and
 * re-saves it.
 */
export function writeTextNode(input: {
  canvas: CanvasRuntimeLike;
  /** Id of the node being rewritten. */
  nodeId: string;
  /** The rewritten content. */
  nextText: string;
  /** Node text captured when the rewrite session started (dirty check). */
  snapshotAtRequest: string;
}): CanvasTextWriteResult {
  const { canvas, nodeId, nextText, snapshotAtRequest } = input;
  if (typeof canvas.setData !== 'function' || typeof canvas.requestSave !== 'function'
    || typeof canvas.getData !== 'function') {
    return { ok: false, reason: 'write-refused', detail: 'canvas runtime methods missing' };
  }
  let rawDocument: unknown;
  try {
    rawDocument = canvas.getData();
  } catch (error) {
    return { ok: false, reason: 'invalid-document', detail: error instanceof Error ? error.message : String(error) };
  }
  if (!isDocumentShape(rawDocument)) {
    return { ok: false, reason: 'invalid-document', detail: 'getData shape not {nodes, edges}' };
  }
  const doc = rawDocument as CanvasDocument;
  const target = doc.nodes.find((node) => node.id === nodeId);
  if (!target || target.type !== 'text' || typeof target.text !== 'string') {
    return { ok: false, reason: 'node-not-found' };
  }
  if (target.text !== snapshotAtRequest) {
    return { ok: false, reason: 'node-changed' };
  }

  const nextNodes: CanvasNodeData[] = doc.nodes.map((node) => (
    node.id === nodeId && node.type === 'text' ? { ...node, text: nextText } : node
  ));
  const nextDoc: CanvasDocument = { ...doc, nodes: nextNodes };
  try {
    assertWritableDocument(nextDoc);
  } catch (error) {
    return { ok: false, reason: 'invalid-document', detail: error instanceof Error ? error.message : String(error) };
  }
  try {
    canvas.setData(nextDoc);
    // `false`: setData already pushed the post-write history entry; a default
    // requestSave() would push the same snapshot again and swallow the first
    // Ctrl+Z (it would re-apply the identical state). The view-level save
    // (dirty + debounced vault.modify) still runs — that is what persists.
    canvas.requestSave(false);
  } catch (error) {
    return { ok: false, reason: 'write-refused', detail: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true };
}

/** Vault slice the file-node write needs (single `process`, read-only otherwise). */
export interface CanvasFileWritePort {
  /** `vault.process(file, fn)` — the closure throw is Obsidian's own abort. */
  process(path: string, transform: (content: string) => string): Promise<void>;
}

export type CanvasFileWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'node-changed' | 'write-failed'; readonly detail?: string };

/**
 * File-node write-back: the note behind the node is rewritten through ONE
 * `vault.process` whose closure first reads the live content and compares it
 * with the session-start snapshot; on divergence it throws inside the
 * closure, which aborts the write with zero changes (design §3.4).
 */
export async function writeFileNodeContent(input: {
  port: CanvasFileWritePort;
  filePath: string;
  nextContent: string;
  snapshotAtRequest: string;
}): Promise<CanvasFileWriteResult> {
  const { port, filePath, nextContent, snapshotAtRequest } = input;
  try {
    await port.process(filePath, (current) => {
      if (current !== snapshotAtRequest) {
        throw new Error('node-changed');
      }
      return nextContent;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message === 'node-changed'
      ? { ok: false, reason: 'node-changed' }
      : { ok: false, reason: 'write-failed', detail: message };
  }
  return { ok: true };
}
