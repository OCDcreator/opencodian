/**
 * InlineEditKeyboard — the shared document-level keydown dispatcher for
 * inline-edit previews (docs/requirements/flowtext-parity.md R-A5).
 *
 * One capture-phase listener per document, shared by every edit in it. A
 * single listener is load-bearing for multi-edit: with per-edit listeners,
 * accepting edit A inside its handler re-points focus at edit B, and B's
 * listener would then fire for the *same* keydown — one Enter would accept
 * both.
 *
 * Dispatch is focus-owned: only the edit the controller registers as current
 * (panel focus / latest preview) answers Enter (accept) and Escape (reject)
 * while it is in the preview phase. Every branch checks `isComposing` so an
 * IME candidate window cannot trigger accept or reject.
 */

interface KeyboardEditLike {
  readonly editId: string;
  readonly phase: 'input' | 'generating' | 'preview';
  readonly ownerDocument: Document;
}

export interface InlineEditKeyboardDispatcherDeps {
  /** The edit keyboard dispatch treats as current, if any. */
  getFocusedEdit(): KeyboardEditLike | null;
  accept(editId: string): Promise<void>;
  reject(editId?: string): void;
}

/**
 * Bind/unbind lifecycle: the controller calls `bind` when the first edit in
 * a document opens and `unbind` when the last one closes.
 */
export class InlineEditKeyboardDispatcher {
  private readonly documentKeydownCounts = new WeakMap<Document, number>();

  private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
    const edit = this.deps.getFocusedEdit();
    if (!edit || edit.phase !== 'preview') return;
    if (edit.ownerDocument !== event.currentTarget) return;
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.deps.accept(edit.editId);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.deps.reject(edit.editId);
    }
  };

  constructor(private readonly deps: InlineEditKeyboardDispatcherDeps) {}

  bind(documentRef: Document): void {
    const count = this.documentKeydownCounts.get(documentRef) ?? 0;
    if (count === 0) {
      documentRef.addEventListener('keydown', this.handleDocumentKeydown, true);
    }
    this.documentKeydownCounts.set(documentRef, count + 1);
  }

  unbind(documentRef: Document): void {
    const count = this.documentKeydownCounts.get(documentRef) ?? 0;
    if (count <= 1) {
      documentRef.removeEventListener('keydown', this.handleDocumentKeydown, true);
      this.documentKeydownCounts.delete(documentRef);
      return;
    }
    this.documentKeydownCounts.set(documentRef, count - 1);
  }
}

/** Deps bridge types exported for the controller's wiring. */
export type InlineEditKeyboardEdit = KeyboardEditLike;
export type InlineEditKeyboardDeps = InlineEditKeyboardDispatcherDeps;
