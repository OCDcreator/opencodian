/**
 * core/canvas — the R-C5 canvas subsystem barrel.
 *
 * Consumers (feature.canvas-integration, app.composition) import from here so
 * the owner's internal file layout stays an implementation detail.
 */

export type {
  CanvasDocument,
  CanvasEdgeData,
  CanvasEdgeSide,
  CanvasNodeData,
  CanvasNodeType,
} from './CanvasDocument';
export {
  assertWritableDocument,
  CANVAS_EDGE_SIDES,
  CANVAS_NODE_TYPES,
  CanvasDocumentError,
  isKnownCanvasNodeType,
  parseCanvasDocument,
  serializeCanvasDocument,
} from './CanvasDocument';
export type {
  CanvasGenerationMode,
  CanvasGenerationRequest,
  CanvasGenerationResult,
  CanvasVaultPort,
} from './CanvasGenerationService';
export {
  buildFileReferenceDocument,
  buildSplitDocument,
  canvasBaseFileName,
  CanvasGenerationService,
  joinVaultPath,
  nextAvailableCanvasPath,
  sanitizeCanvasTitle,
} from './CanvasGenerationService';
export type { CanvasGroupedLayout, CanvasRect } from './CanvasLayout';
export {
  CANVAS_GRID_COLUMNS,
  CANVAS_GROUP_PADDING,
  CANVAS_NODE_GAP,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CANVAS_SINGLE_ROW_LIMIT,
  layoutGrid,
  layoutGroupedColumns,
  rectsOverlap,
} from './CanvasLayout';
export type {
  CanvasFileWritePort,
  CanvasFileWriteResult,
  CanvasGateDecision,
  CanvasNodeContent,
  CanvasNodeHandleLike,
  CanvasRuntimeLike,
  CanvasRuntimeProbe,
  CanvasTextWriteResult,
  CanvasViewLike,
} from './CanvasNodeWriteService';
export {
  probeCanvasView,
  readNodeData,
  resolveCanvasGateDecision,
  resolveSelectedNode,
  writeFileNodeContent,
  writeTextNode,
} from './CanvasNodeWriteService';
export type {
  CanvasSplitNoteInput,
  CanvasSplitParseResult,
  CanvasSplitProposal,
} from './CanvasSplitProposal';
export {
  buildCanvasSplitPrompt,
  buildCanvasSplitSystemPrompt,
  CANVAS_SPLIT_MAX_CHARS_PER_NOTE,
  CANVAS_SPLIT_MAX_EXCERPT_CHARS,
  CANVAS_SPLIT_MAX_NOTES,
  CANVAS_SPLIT_MAX_PROPOSALS,
  oversizeSplitNotes,
  parseCanvasSplitProposal,
} from './CanvasSplitProposal';
