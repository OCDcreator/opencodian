import type { EditorView } from '@codemirror/view';
import { type Editor,MarkdownView } from 'obsidian';

import { createLogger } from '../../../shared';
import { hideSelectionHighlight, showSelectionHighlight } from '../../../utils/editorSelectionHighlight';
import type { FocusContextPreview } from '../composerContext';

const logger = createLogger('RetainedSelectionHighlightService');

const RETAINED_SELECTION_DOM_HIGHLIGHT_KEY = 'opencodian-selection';
const RETAINED_SELECTION_INPUT_HANDOFF_GRACE_MS = 1500;

interface RetainedSelectionHighlight {
  path: string;
  editorView: EditorView | null;
  from: number | null;
  to: number | null;
  domRanges: Range[];
  captureSource: 'offsets' | 'dom' | 'mixed';
}

export interface RetainedSelectionHighlightServiceHost {
  getFocusContextPreview(): FocusContextPreview | null;
  isComposerInteractionFocused(): boolean;
}

export class RetainedSelectionHighlightService {
  private retainedSelectionHighlight: RetainedSelectionHighlight | null = null;
  private retainedSelectionInputHandoffGraceUntil: number | null = null;

  constructor(private readonly host: RetainedSelectionHighlightServiceHost) {}

  markInputHandoff(): void {
    this.retainedSelectionInputHandoffGraceUntil = Date.now() + RETAINED_SELECTION_INPUT_HANDOFF_GRACE_MS;
  }

  clearInputHandoff(): void {
    this.retainedSelectionInputHandoffGraceUntil = null;
  }

  shouldRetainPreviewDuringTransition(): boolean {
    return this.host.isComposerInteractionFocused() || this.isInputHandoffActive();
  }

  refreshHighlight(): void {
    const retained = this.retainedSelectionHighlight;
    if (!retained) {
      return;
    }

    const focusPreview = this.host.getFocusContextPreview();
    const shouldShow = this.host.isComposerInteractionFocused()
      && focusPreview?.kind === 'selection'
      && focusPreview.path === retained.path;

    if (shouldShow) {
      if (
        retained.editorView
        && retained.from !== null
        && retained.to !== null
      ) {
        this.clearRetainedDomSelectionHighlight();
        showSelectionHighlight(retained.editorView, retained.from, retained.to);
        return;
      }

      const validDomRanges = retained.domRanges.filter(
        (range) => range.startContainer.isConnected && range.endContainer.isConnected,
      );
      const domHighlight = validDomRanges.length > 0
        ? this.createDomHighlight(validDomRanges)
        : null;
      if (domHighlight) {
        this.getCssHighlightRegistry()?.set(RETAINED_SELECTION_DOM_HIGHLIGHT_KEY, domHighlight);
      } else {
        this.clearRetainedDomSelectionHighlight();
      }
      return;
    }

    if (retained.editorView) {
      hideSelectionHighlight(retained.editorView);
    }
    this.clearRetainedDomSelectionHighlight();
  }

  syncFromPreview(
    actualPreview: FocusContextPreview | null,
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void {
    const composerFocused = this.host.isComposerInteractionFocused();
    if (actualPreview?.kind === 'selection') {
      const activeEditor = editor ?? view?.editor ?? null;
      const editorView = this.getEditorView(activeEditor);
      const offsets = this.getEditorSelectionOffsets(activeEditor, editorView);
      const domRanges = this.cloneDocumentSelectionRanges();
      if (offsets || domRanges.length > 0) {
        const captureSource: RetainedSelectionHighlight['captureSource'] = offsets && domRanges.length > 0
          ? 'mixed'
          : offsets
            ? 'offsets'
            : 'dom';
        this.setRetainedSelectionHighlight({
          path: actualPreview.path,
          editorView: editorView ?? null,
          from: offsets?.from ?? null,
          to: offsets?.to ?? null,
          domRanges,
          captureSource,
        });
      } else if (!composerFocused) {
        this.clearRetainedSelectionHighlight();
      }
    } else if (
      !this.shouldRetainPreviewDuringTransition()
      || !actualPreview
      || actualPreview.path !== this.retainedSelectionHighlight?.path
    ) {
      this.clearRetainedSelectionHighlight();
    }

    this.refreshHighlight();
  }

  dispose(): void {
    this.clearInputHandoff();
    this.clearRetainedSelectionHighlight();
  }

  private isInputHandoffActive(): boolean {
    return this.retainedSelectionInputHandoffGraceUntil !== null
      && Date.now() <= this.retainedSelectionInputHandoffGraceUntil;
  }

  private getRetainedSelectionCaptureQuality(retained: RetainedSelectionHighlight | null): number {
    if (!retained) {
      return 0;
    }

    if (retained.editorView && retained.from !== null && retained.to !== null) {
      return 2;
    }

    if (retained.domRanges.length > 0) {
      return 1;
    }

    return 0;
  }

  private shouldPreserveExistingRetainedSelection(
    existing: RetainedSelectionHighlight | null,
    next: RetainedSelectionHighlight,
  ): boolean {
    if (!this.host.isComposerInteractionFocused()) {
      return false;
    }

    if (!existing || existing.path !== next.path) {
      return false;
    }

    return this.getRetainedSelectionCaptureQuality(existing) > this.getRetainedSelectionCaptureQuality(next);
  }

  private getCssHighlightRegistry():
    | { set: (name: string, highlight: unknown) => void; delete: (name: string) => void }
    | null {
    if (typeof CSS === 'undefined') {
      return null;
    }

    const cssWithHighlights = CSS as typeof CSS & {
      highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void };
    };
    return cssWithHighlights.highlights ?? null;
  }

  private createDomHighlight(ranges: Range[]): unknown | null {
    const HighlightCtor = (window as Window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }).Highlight;
    if (!HighlightCtor) {
      return null;
    }

    return new HighlightCtor(...ranges);
  }

  private cloneDocumentSelectionRanges(): Range[] {
    const selection = document.getSelection();
    if (!selection) {
      return [];
    }

    const ranges: Range[] = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index).cloneRange());
    }

    return ranges;
  }

  private clearRetainedDomSelectionHighlight(): void {
    this.getCssHighlightRegistry()?.delete(RETAINED_SELECTION_DOM_HIGHLIGHT_KEY);
  }

  private getEditorView(editor: Editor | null): EditorView | null {
    return (editor as unknown as { cm?: EditorView | null })?.cm ?? null;
  }

  private getEditorSelectionOffsets(
    editor: Editor | null,
    editorView: EditorView | null,
  ): { from: number; to: number } | null {
    if (editor) {
      const editorWithOffsets = editor as Editor & {
        posToOffset?: (position: { line: number; ch: number }) => number;
      };
      if (typeof editorWithOffsets.posToOffset === 'function') {
        try {
          return {
            from: editorWithOffsets.posToOffset(editor.getCursor('from')),
            to: editorWithOffsets.posToOffset(editor.getCursor('to')),
          };
        } catch (error) {
          logger.debug('Failed to resolve editor offsets for retained selection highlight', error);
        }
      }
    }

    const selection = editorView?.state.selection.main;
    if (!selection || selection.empty) {
      return null;
    }

    return {
      from: selection.from,
      to: selection.to,
    };
  }

  private setRetainedSelectionHighlight(next: RetainedSelectionHighlight | null): void {
    const current = this.retainedSelectionHighlight;
    if (next && this.shouldPreserveExistingRetainedSelection(current, next)) {
      return;
    }

    if (current && (!next
      || current.editorView !== next.editorView
      || current.from !== next.from
      || current.to !== next.to)) {
      if (current.editorView) {
        hideSelectionHighlight(current.editorView);
      }
    }

    this.retainedSelectionHighlight = next;
  }

  private clearRetainedSelectionHighlight(): void {
    if (!this.retainedSelectionHighlight) {
      return;
    }

    if (this.retainedSelectionHighlight.editorView) {
      hideSelectionHighlight(this.retainedSelectionHighlight.editorView);
    }
    this.clearRetainedDomSelectionHighlight();
    this.retainedSelectionHighlight = null;
  }
}
