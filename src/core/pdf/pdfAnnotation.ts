/**
 * Markdown sidecar annotation building for R-C4 phase 3 (design §3.3 / D2).
 *
 * The annotation target is `<pdf name>.annotations.md` next to the PDF
 * (design decision D2; the template is a constant, not a setting). Writes go
 * through the vault API only (`vault.process` / `vault.create`) and are
 * covered by the R-B3 revert system at the call site; this module is the
 * pure formatting core — unit tested for the timestamp, the selection
 * sub-path link, the ≤200-char excerpt and the Q/A escaping.
 */

import { PDF_SELECTION_EXCERPT_MAX_CHARS } from '../../shared';

/** Fixed file-name template for the sidecar (design D2 — no setting). */
export function annotationsSidecarPathFor(pdfPath: string): string {
  const normalized = pdfPath.replace(/\\/gu, '/');
  const dot = normalized.lastIndexOf('.');
  const stem = dot > normalized.lastIndexOf('/') ? normalized.slice(0, dot) : normalized;
  return `${stem}.annotations.md`;
}

/** Escape so a multi-line answer cannot break the list structure. */
function escapeBlockText(text: string): string {
  return text
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n  ');
}

/** Truncate the excerpt on a whole-line boundary at the cap when possible. */
function excerptOf(text: string): string {
  const single = text.replace(/\s+/gu, ' ').trim();
  if (single.length <= PDF_SELECTION_EXCERPT_MAX_CHARS) {
    return single;
  }
  const slice = single.slice(0, PDF_SELECTION_EXCERPT_MAX_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > PDF_SELECTION_EXCERPT_MAX_CHARS / 2 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

export interface PdfAnnotationPayload {
  /** Locale-independent ISO-ish local timestamp (`YYYY-MM-DD HH:mm`). */
  timestamp: Date;
  pdfPath: string;
  selection: {
    page: number;
    /** Selection excerpt (primary payload, always required). */
    text: string;
    rangeStr?: string;
  };
  question: string;
  answer: string;
}

/** The `[[file.pdf#page=3&selection=...]]` back link (range degrades to page). */
export function pdfSelectionLink(payload: PdfAnnotationPayload): string {
  const encodedPath = payload.pdfPath.split('/').map(encodeURIComponent).join('/');
  // The native serialization "s,s,e,e" only contains digits and commas —
  // keep them raw so the link matches Obsidian's own sub-path format.
  const selection = payload.selection.rangeStr
    ? `&selection=${payload.selection.rangeStr}`
    : '';
  return `[[${encodedPath}#page=${payload.selection.page}${selection}]]`;
}

/**
 * One annotation list entry, appended verbatim to the sidecar:
 * ```markdown
 * - 2026-09-18 12:00 · [[file.pdf#page=3&selection=0,12,45,88]]
 *   > 选区原文摘录（≤200 字）
 *   - **问**：…
 *   - **答**：…
 * ```
 */
export function buildAnnotationEntry(payload: PdfAnnotationPayload): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const timestamp = `${payload.timestamp.getFullYear()}-${pad(payload.timestamp.getMonth() + 1)}-${pad(payload.timestamp.getDate())} `
    + `${pad(payload.timestamp.getHours())}:${pad(payload.timestamp.getMinutes())}`;
  const lines = [
    `- ${timestamp} · ${pdfSelectionLink(payload)}`,
    `  > ${excerptOf(payload.selection.text)}`,
    `  - **问**：${escapeBlockText(payload.question) || '（无）'}`,
    `  - **答**：${escapeBlockText(payload.answer) || '（无）'}`,
  ];
  return `${lines.join('\n')}\n`;
}
