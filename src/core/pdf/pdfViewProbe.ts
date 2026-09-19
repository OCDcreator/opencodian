/**
 * PDF view integration probe and degradation ladder (R-C4 phase 3,
 * flowtext-c4-design §3.3/§7).
 *
 * The design's ladder:
 *  - A: toolbar button + native selection serialization (`rangeStr`) +
 *    `#page&selection` back links + highlight feedback;
 *  - B: command entry + DOM selection text + `#page=N` only (no rangeStr);
 *  - C: command opens the chat with a paste hint — zero viewer internals,
 *    always available.
 *
 * Every capability is feature-detected at runtime; the pure
 * `resolvePdfIntegrationLevel` here turns a structural probe result into the
 * level so the selection logic is unit-testable and the settings debug area
 * can honestly report which level is active (§6.7 — never fake A).
 */

/** Feature-detect results gathered from one pdf view (host-side, impure). */
export interface PdfViewProbeResult {
  /** `view.viewer.child.pdfViewer` present (extractable document). */
  hasPdfViewer: boolean;
  /** Toolbar left/right containers are mountable elements. */
  hasToolbar: boolean;
  /** `child.getTextSelectionRangeStr` is callable. */
  hasNativeRangeSerializer: boolean;
  /** Calling the native serializer with a working ctx did not throw. */
  nativeRangeStrWorks: boolean;
  /**
   * The serializer has serialized a REAL selection end to end (valid
   * "s,s,e,e" rangeStr + non-empty text + resolved page). This is the ONLY
   * evidence that can claim level A: a bare "function is callable" probe
   * (usually run with NO selection on screen) proved nothing — the deployed
   * build reported A while every real capture threw inside the host and
   * silently fell back to the DOM path (R-C4-D4 class: reported capability
   * ≠ real capability).
   */
  nativeRangeStrProvenOnSelection: boolean;
  /** `document.getSelection()` inside the viewer is readable. */
  hasDomSelection: boolean;
}

export type PdfIntegrationLevel = 'A' | 'B' | 'C';

export interface PdfIntegrationDecision {
  level: PdfIntegrationLevel;
  /** Reasons for the chosen level — surfaced verbatim in the debug area. */
  reasons: string[];
}

/** Ladder selection (pure): A → B → C, honestly degraded.
 *
 * A is claimed ONLY on proof: the serializer must have serialized a real
 * selection (`nativeRangeStrProvenOnSelection`). "Callable" or "did not
 * throw without a selection" earns B with an explicit unproven reason —
 * never A.
 */
export function resolvePdfIntegrationLevel(probe: PdfViewProbeResult): PdfIntegrationDecision {
  const reasons: string[] = [];
  if (!probe.hasPdfViewer) {
    reasons.push('pdfViewer missing');
  }
  if (!probe.hasToolbar) {
    reasons.push('toolbar containers missing');
  }
  if (!probe.hasDomSelection) {
    reasons.push('DOM selection unreadable');
  }
  if (reasons.length > 0) {
    return { level: 'C', reasons };
  }
  if (!probe.hasNativeRangeSerializer) {
    reasons.push('native range serializer absent — #page links only');
    return { level: 'B', reasons };
  }
  if (!probe.nativeRangeStrWorks) {
    reasons.push('native range serializer failed — #page links only');
    return { level: 'B', reasons };
  }
  if (!probe.nativeRangeStrProvenOnSelection) {
    reasons.push('native range serializer unproven on a live selection — #page links only');
    return { level: 'B', reasons };
  }
  return { level: 'A', reasons };
}

/** Validate Obsidian's native "startIdx,startOffset,endIdx,endOffset" shape. */
export function isValidRangeStr(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d+,\d+,\d+,\d+$/u.test(value);
}

/**
 * Find the page number for a DOM selection by walking up from the anchor
 * node to the viewer's `.page[data-page-number]` container (design §7 probe 1).
 */
export function pageNumberOfSelectionNode(node: Node | null): number | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof Element) {
      const attr = current.getAttribute('data-page-number');
      if (attr !== null) {
        const page = Number(attr);
        if (Number.isInteger(page) && page >= 1) {
          return page;
        }
      }
    }
    current = current.parentNode;
  }
  return null;
}
