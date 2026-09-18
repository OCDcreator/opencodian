/**
 * core.pdf (R-C4): lazy PDF text extraction, the local page-anchored index,
 * and the viewer-integration probe/degradation core.
 *
 * Extracted text feeds the `pdf_document` / `pdf_selection` context entry
 * types (core.types); the index reuses the R-C1 retrieval primitives from
 * `core.memory`. The heavy pdf.js dependency lives in the separately built
 * `pdf-engine.js` artifact and is required lazily — never at plugin startup.
 */

export {
  annotationsSidecarPathFor,
  buildAnnotationEntry,
  type PdfAnnotationPayload,
  pdfSelectionLink,
} from './pdfAnnotation';
export {
  mergePageTextsIntoChunks,
  parsePdfIndexFile,
  PDF_CHUNK_TARGET_MAX_CHARS,
  PDF_CHUNK_TARGET_MIN_CHARS,
  PDF_INDEX_ROOT,
  type PdfIndexChunk,
  type PdfIndexFile,
  pdfIndexFileName,
  pdfIndexFingerprint,
} from './pdfIndexFormat';
export {
  pdfTitleOf,
  scorePdfChunk,
  type SelectedPdfSnippet,
  selectPdfSnippets,
} from './pdfIndexScoring';
export { type PdfFileMeta, type PdfIndexFs, type PdfIndexProgress, PdfIndexService, type PdfIndexSettingsSlice } from './PdfIndexService';
export {
  isPasswordFailure,
  PdfEngineError,
  PdfEngineLoader,
  type PdfEngineLoaderHost,
  type PdfEngineLoadError,
  type PdfTextEngine,
} from './pdfTextEngine';
export {
  assessTextLayer,
  checkAttachLimits,
  pageTextFromLines,
  PDF_ATTACH_MAX_CHARS,
  PDF_ATTACH_MAX_PAGES,
  type PdfAttachRejection,
  type PdfTextItem,
  rebuildPageLines,
  TEXT_LAYER_MIN_CHARS,
  TEXT_LAYER_MIN_PAGE_RATIO,
} from './pdfTextLayout';
export {
  isValidRangeStr,
  pageNumberOfSelectionNode,
  type PdfIntegrationDecision,
  type PdfIntegrationLevel,
  type PdfViewProbeResult,
  resolvePdfIntegrationLevel,
} from './pdfViewProbe';
