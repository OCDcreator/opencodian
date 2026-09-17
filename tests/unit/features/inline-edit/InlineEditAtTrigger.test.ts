/**
 * The `@` in-note trigger (R-A1): the pure position predicate, plus the CM6
 * `inputHandler` wiring built on top of it.
 *
 * The extension test reads the handler back out of an `EditorState` facet, so
 * no live `EditorView` (or foreground window) is needed: a CM6 state carries
 * the facet values, and the handler only touches `view.composing` / `view.state`
 * beyond its coordinates.
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  type InlineEditAtTriggerDeps,
  inlineEditAtTriggerExtension,
  shouldTriggerAtInput,
} from '../../../../src/features/inline-edit/InlineEditAtTrigger';

describe('shouldTriggerAtInput', () => {
  it('triggers at the very start of a line', () => {
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: true,
      previousChar: '',
    })).toBe(true);
  });

  it('triggers right after a plain space', () => {
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: false,
      previousChar: ' ',
    })).toBe(true);
  });

  it('triggers after a tab and after a full-width space', () => {
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: false,
      previousChar: '\t',
    })).toBe(true);
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: false,
      previousChar: '　',
    })).toBe(true);
  });

  it('does not trigger in the middle of an email address', () => {
    // user@example.com — previous character is a letter.
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: false,
      previousChar: 'r',
    })).toBe(false);
  });

  it('does not trigger after CJK or punctuation characters', () => {
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: false,
      previousChar: '文',
    })).toBe(false);
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: false,
      atLineStart: false,
      previousChar: '(',
    })).toBe(false);
  });

  it('ignores pasted text and selection replacements even at line start', () => {
    expect(shouldTriggerAtInput({
      text: 'abc@',
      replacesSelection: false,
      atLineStart: true,
      previousChar: '',
    })).toBe(false);
    expect(shouldTriggerAtInput({
      text: '@',
      replacesSelection: true,
      atLineStart: true,
      previousChar: '',
    })).toBe(false);
  });
});

interface HarnessOptions {
  readonly canTrigger?: boolean;
  readonly composing?: boolean;
  readonly openResult?: boolean;
}

/**
 * Build an `EditorState` carrying the trigger extension and return the
 * registered input handler together with the deps' call record.
 */
function harness(docText: string, options: HarnessOptions = {}) {
  const calls = { open: 0 };
  const deps: InlineEditAtTriggerDeps = {
    canTrigger: () => options.canTrigger ?? true,
    openForView: () => {
      calls.open += 1;
      return options.openResult ?? true;
    },
  };
  const state = EditorState.create({
    doc: docText,
    extensions: [inlineEditAtTriggerExtension(deps)],
  });
  const handlers = state.facet(EditorView.inputHandler);
  const handler = handlers[handlers.length - 1];
  const view = { composing: options.composing ?? false, state } as unknown as EditorView;
  return {
    calls,
    /** Run the handler as if `text` were typed at `pos` (collapsed). */
    typeAt: (pos: number, text = '@'): boolean => handler(view, pos, pos, text),
    /** Run the handler as if `text` replaced the range from..to. */
    replaceRange: (from: number, to: number, text: string): boolean => handler(view, from, to, text),
  };
}

describe('inlineEditAtTriggerExtension', () => {
  it('consumes a line-start @ and opens the panel', () => {
    const h = harness('');
    expect(h.typeAt(0)).toBe(true);
    expect(h.calls.open).toBe(1);
  });

  it('consumes an @ after whitespace mid-line', () => {
    const h = harness('hello ');
    expect(h.typeAt(6)).toBe(true);
    expect(h.calls.open).toBe(1);
  });

  it('lets an @ inside an email type through untouched', () => {
    const h = harness('user@example.com');
    // Cursor sits right before the existing "@", previous char is "r".
    expect(h.typeAt(4)).toBe(false);
    expect(h.calls.open).toBe(0);
  });

  it('never fires while an IME composition is active', () => {
    const h = harness('', { composing: true });
    expect(h.typeAt(0)).toBe(false);
    expect(h.calls.open).toBe(0);
  });

  it('does not register while the setting gate is closed', () => {
    const h = harness('', { canTrigger: false });
    expect(h.typeAt(0)).toBe(false);
    expect(h.calls.open).toBe(0);
  });

  it('lets the @ through when no file-associated editor opens (declined open)', () => {
    const h = harness('', { openResult: false });
    expect(h.typeAt(0)).toBe(false);
    expect(h.calls.open).toBe(1);
  });

  it('does not trigger when the @ would replace a selection', () => {
    const h = harness('abc');
    expect(h.replaceRange(0, 3, '@')).toBe(false);
    expect(h.calls.open).toBe(0);
  });

  it('ignores non-@ insertions entirely', () => {
    const h = harness('');
    expect(h.typeAt(0, 'a')).toBe(false);
    expect(h.typeAt(0, '@@')).toBe(false);
    expect(h.calls.open).toBe(0);
  });
});
