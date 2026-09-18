/**
 * InlineEditDiff — word-level diff for the inline preview.
 *
 * Self-contained LCS diff with CJK-aware tokenisation, per
 * docs/requirements/inline-edit.md §7.7:
 *
 * - Latin text aligns per word, CJK aligns per character, whitespace and line
 *   breaks are tokens of their own so markdown structure (list markers, code
 *   fences) cannot be reordered by the diff;
 * - the LCS is O(n×m), so the preview falls back to a plain before/after view
 *   when the inputs are large.
 *
 * The tokeniser and the diff are pure; `renderDiffInto` only writes DOM and is
 * exercised with jsdom in unit tests.
 */

/** One aligned run of the diff. */
export interface InlineEditDiffOp {
  readonly type: 'equal' | 'insert' | 'delete';
  readonly text: string;
}

/** Ops are only computed when the token product stays under this bound. */
export const INLINE_EDIT_DIFF_MAX_TOKEN_PRODUCT = 4_000_000;
/** Above either of these sizes the preview shows whole before/after instead. */
export const INLINE_EDIT_DIFF_MAX_INPUT_CHARS = 40_000;

const CJK_RANGES = '\\u2e80-\\u2eff\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const TOKEN_PATTERN = new RegExp(
  `[ \\t]+|\\r?\\n|[${CJK_RANGES}]|[!-/:-@\\[-\\\`{-~\\u3001\\u3002\\uff01\\uff0c\\uff1a\\uff1b\\uff1f\\uff08\\uff09]|[^\\s${CJK_RANGES}]+`,
  'g',
);

/**
 * Split text into diff tokens.
 *
 * Order matters: whitespace runs and line breaks are matched before CJK and
 * before generic runs, so a newline can never be absorbed into a word.
 */
export function tokenizeForDiff(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

/** True when the inputs are small enough for a word-level LCS. */
export function canComputeWordDiff(before: string, after: string): boolean {
  if (before.length > INLINE_EDIT_DIFF_MAX_INPUT_CHARS) return false;
  if (after.length > INLINE_EDIT_DIFF_MAX_INPUT_CHARS) return false;
  const beforeTokens = tokenizeForDiff(before).length;
  const afterTokens = tokenizeForDiff(after).length;
  if (beforeTokens === 0 || afterTokens === 0) return false;
  return beforeTokens * afterTokens <= INLINE_EDIT_DIFF_MAX_TOKEN_PRODUCT;
}

/**
 * Compute a word-level diff with a longest-common-subsequence core.
 *
 * Returns `null` when the inputs exceed the documented bounds, so callers can
 * fall back to a whole-text comparison instead of freezing the editor.
 */
export function computeWordDiff(before: string, after: string): InlineEditDiffOp[] | null {
  if (!canComputeWordDiff(before, after)) return null;
  const left = tokenizeForDiff(before);
  const right = tokenizeForDiff(after);

  // LCS length table.
  const rows = left.length;
  const cols = right.length;
  const table: Uint32Array = new Uint32Array((rows + 1) * (cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i * (cols + 1) + j] = left[i] === right[j]
        ? table[(i + 1) * (cols + 1) + (j + 1)] + 1
        : Math.max(table[(i + 1) * (cols + 1) + j], table[i * (cols + 1) + (j + 1)]);
    }
  }

  const ops: InlineEditDiffOp[] = [];
  const push = (type: InlineEditDiffOp['type'], text: string): void => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) {
      ops[ops.length - 1] = { type, text: last.text + text };
      return;
    }
    ops.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (left[i] === right[j]) {
      push('equal', left[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * (cols + 1) + j] >= table[i * (cols + 1) + (j + 1)]) {
      push('delete', left[i]);
      i += 1;
    } else {
      push('insert', right[j]);
      j += 1;
    }
  }
  while (i < rows) { push('delete', left[i]); i += 1; }
  while (j < cols) { push('insert', right[j]); j += 1; }
  return ops;
}

/** True when the two texts are already identical. */
export function isDiffEmpty(ops: readonly InlineEditDiffOp[]): boolean {
  return ops.every((op) => op.type === 'equal');
}

/**
 * Render the preview body into `container`.
 *
 * Falls back to a whole-text before/after view when a word diff is too large to
 * compute; both branches render the same accept/reject affordances in the
 * controller. `fallbackLabel` (e.g. an i18n string) is rendered as a header
 * above the before/after blocks so the degradation is explicit rather than
 * looking like a regular diff (docs/requirements/flowtext-parity.md R-A6).
 */
export function renderDiffInto(
  container: HTMLElement,
  before: string,
  after: string,
  options: {
    insert: string;
    delete: string;
    /** Header rendered above the degraded before/after blocks (R-A6). */
    fallbackLabel?: string;
  },
): boolean {
  container.empty();
  const ops = computeWordDiff(before, after);
  if (!ops) {
    container.addClass('opencodian-inline-edit-fallback');
    if (options.fallbackLabel) {
      container.createDiv({
        cls: 'opencodian-inline-edit-fallback-label',
        text: options.fallbackLabel,
      });
    }
    container.createDiv({ cls: options.delete, text: before });
    container.createDiv({ cls: options.insert, text: after });
    return false;
  }
  for (const op of ops) {
    if (op.type === 'equal') {
      container.appendChild((container.ownerDocument ?? document).createTextNode(op.text));
      continue;
    }
    container.createSpan({
      cls: op.type === 'insert' ? options.insert : options.delete,
      text: op.text,
    });
  }
  return true;
}
