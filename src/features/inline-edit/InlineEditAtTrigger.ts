/**
 * InlineEditAtTrigger — the `@` in-note trigger for inline edit (R-A1).
 *
 * FlowText opens its floating window by typing `@` anywhere in a note; this
 * module is OpenCodian's optional equivalent. A CM6 `EditorView.inputHandler`
 * intercepts a typed `@` when it lands at the start of a line or directly
 * after whitespace, and opens the inline-edit panel anchored at the cursor
 * instead of letting the character reach the document.
 *
 * Why `inputHandler` and not `keymap` (docs/requirements/flowtext-parity.md
 * R-A1): `@` is produced by a compose sequence on many layouts, so a keydown
 * keymap sees unreliable keys/codes; `inputHandler` receives the resolved
 * text insertion. Returning `true` consumes the input, which is also what
 * keeps the `@` out of the document.
 *
 * IME composition is never intercepted — the same `view.composing` /
 * `event.isComposing` discipline as `InlineEditController`'s document key
 * handler. Reading mode never sees this extension at all (it has no CM6
 * editor); editors without a file-associated note are gated per keystroke in
 * `openForView`, which declines (letting `@` type normally) instead of
 * opening a panel that could not be anchored to a note.
 */

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Inputs the pure trigger predicate needs, split out for unit testing. */
export interface AtTriggerDecisionInput {
  /** Text about to be inserted (a single typed `@` is the only trigger). */
  readonly text: string;
  /** True when the insertion would replace a non-collapsed selection. */
  readonly replacesSelection: boolean;
  /** True when the cursor sits at the very start of a line (or the document). */
  readonly atLineStart: boolean;
  /** Character immediately before the cursor; meaningless when `atLineStart`. */
  readonly previousChar: string;
}

/**
 * Decide whether a typed `@` should open inline edit.
 *
 * Trigger positions: line start, or anywhere the previous character is
 * whitespace (space, tab, full-width space, …). Everything else — in
 * particular `user@example.com`, where the previous character is a letter —
 * types through untouched.
 */
export function shouldTriggerAtInput(input: AtTriggerDecisionInput): boolean {
  if (input.text !== '@') return false;
  if (input.replacesSelection) return false;
  if (input.atLineStart) return true;
  return input.previousChar.length > 0 && /\s/.test(input.previousChar);
}

export interface InlineEditAtTriggerDeps {
  /**
   * Feature gate evaluated per keystroke: the `inlineEditTriggerAt` setting
   * AND the usual inline-edit availability (master switch + a backend able to
   * run a verified read-only session). When false every input falls through,
   * which keeps the off-state behaviour byte-identical to not registering.
   */
  readonly canTrigger: () => boolean;
  /**
   * Open inline edit anchored at the view's cursor. Returns true when the
   * panel actually opened (the `@` is consumed); false declines the trigger —
   * no file-associated note, editor view unusable — and the `@` types through.
   */
  readonly openForView: (view: EditorView) => boolean;
}

/**
 * The CM6 extension; register once with `registerEditorExtension`. Cheap
 * guards run first so ordinary typing pays almost nothing; the markdown-view
 * resolution inside `openForView` only happens for actual `@` presses.
 */
export function inlineEditAtTriggerExtension(deps: InlineEditAtTriggerDeps): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '@') return false;
    if (view.composing) return false;
    if (view.state.readOnly) return false;
    if (!deps.canTrigger()) return false;
    const state = view.state;
    const line = state.doc.lineAt(from);
    const atLineStart = line.from === from;
    const previousChar = atLineStart ? '' : state.doc.sliceString(from - 1, from);
    if (!shouldTriggerAtInput({
      text,
      replacesSelection: from !== to,
      atLineStart,
      previousChar,
    })) {
      return false;
    }
    return deps.openForView(view);
  });
}
