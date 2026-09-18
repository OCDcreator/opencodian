/**
 * Unit tests for the R-C3 completion output contract
 * (docs/requirements/flowtext-parity.md §8.1 R-C3; design §3.5, §5 case 2):
 *
 * - request windows: whole-line-aligned prefix cap (4000), suffix cap (1000),
 *   empty document;
 * - `validateCompletion`: hard maxChars truncation, prefix-duplicate
 *   rejection with the overlap-threshold boundary, protocol-tag rejection,
 *   empty rejection;
 * - the system prompt stays separate from the inline-edit XML contract.
 */

import { describe, expect, it } from '@jest/globals';

import {
  INLINE_COMPLETION_PREFIX_WINDOW_CHARS,
  INLINE_COMPLETION_SUFFIX_WINDOW_CHARS,
} from '../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import {
  buildInlineCompletionSystemPrompt,
  buildInlineCompletionWindows,
  findProtocolTag,
  INLINE_COMPLETION_PREFIX_TAIL_CHARS,
  inlineCompletionPrefixTail,
  overlapsPrefixTail,
  validateCompletion,
} from '../../../../src/features/inline-edit/InlineCompletionPrompt';

describe('buildInlineCompletionWindows', () => {
  it('returns the whole text when both sides fit the caps', () => {
    const windows = buildInlineCompletionWindows('hello world', 5);
    expect(windows).toEqual({ prefix: 'hello', suffix: ' world' });
  });

  it('yields empty windows for an empty document (first-line trigger)', () => {
    expect(buildInlineCompletionWindows('', 0)).toEqual({ prefix: '', suffix: '' });
  });

  it('clamps the cursor into the document', () => {
    expect(buildInlineCompletionWindows('abc', 99)).toEqual({ prefix: 'abc', suffix: '' });
    expect(buildInlineCompletionWindows('abc', -5)).toEqual({ prefix: '', suffix: 'abc' });
  });

  it('cuts the prefix on a whole-line boundary when over the cap', () => {
    const lines = Array.from({ length: 400 }, (_, i) => `line-${i}-padding`);
    const doc = lines.join('\n');
    const cursor = doc.length;
    const windows = buildInlineCompletionWindows(doc, cursor);
    // The window respects the cap...
    expect(windows.prefix.length).toBeLessThanOrEqual(INLINE_COMPLETION_PREFIX_WINDOW_CHARS);
    // ...and starts at a whole-line boundary.
    const dropped = doc.slice(0, cursor - windows.prefix.length);
    expect(dropped.endsWith('\n')).toBe(true);
    expect(lines).toContain(windows.prefix.split('\n', 1)[0]);
    expect(windows.suffix).toBe('');
  });

  it('hard-cuts a window that is one single oversized line', () => {
    const hugeLine = 'x'.repeat(INLINE_COMPLETION_PREFIX_WINDOW_CHARS + 500);
    const windows = buildInlineCompletionWindows(`${hugeLine}\nend`, hugeLine.length + 1);
    // No line boundary inside the window: the cap is enforced with a hard
    // cut (≤ cap, acceptance 5 applies to the request too).
    expect(windows.prefix.length).toBe(INLINE_COMPLETION_PREFIX_WINDOW_CHARS);
  });

  it('caps the suffix window', () => {
    const doc = `start${'y'.repeat(INLINE_COMPLETION_SUFFIX_WINDOW_CHARS + 100)}`;
    const windows = buildInlineCompletionWindows(doc, 5);
    expect(windows.suffix.length).toBe(INLINE_COMPLETION_SUFFIX_WINDOW_CHARS);
  });
});

describe('inlineCompletionPrefixTail', () => {
  it('keeps short prefixes verbatim', () => {
    expect(inlineCompletionPrefixTail('short')).toBe('short');
  });

  it('truncates long prefixes to the tail cap', () => {
    const long = 'a'.repeat(INLINE_COMPLETION_PREFIX_TAIL_CHARS + 50);
    expect(inlineCompletionPrefixTail(long)).toHaveLength(INLINE_COMPLETION_PREFIX_TAIL_CHARS);
  });
});

describe('overlapsPrefixTail', () => {
  it('detects a repeater suggestion', () => {
    expect(overlapsPrefixTail('The quick brown fox', 'The quick brown fox jumps')).toBe(true);
  });

  it('accepts a genuine continuation', () => {
    expect(overlapsPrefixTail('The quick brown fox', ' jumps over the dog')).toBe(false);
  });

  it('is false when either side is empty', () => {
    expect(overlapsPrefixTail('', 'text')).toBe(false);
    expect(overlapsPrefixTail('text', '')).toBe(false);
  });
});

describe('validateCompletion', () => {
  it('accepts a plain continuation', () => {
    expect(validateCompletion({ prefixTail: 'Hello', text: ' world', maxChars: 300 }))
      .toEqual({ ok: true, text: ' world' });
  });

  it('truncates to maxChars before anything else (hard cap, acceptance 5)', () => {
    const result = validateCompletion({ prefixTail: 'Hi', text: 'x'.repeat(500), maxChars: 300 });
    expect(result).toEqual({ ok: true, text: 'x'.repeat(300) });
  });

  it('rejects whitespace-only suggestions as empty', () => {
    expect(validateCompletion({ prefixTail: 'a', text: '   \n \n', maxChars: 300 }))
      .toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a suggestion that repeats the prefix tail (prefix-duplicate)', () => {
    const tail = 'already written text';
    expect(validateCompletion({ prefixTail: tail, text: `${tail} and more`, maxChars: 300 }))
      .toEqual({ ok: false, reason: 'prefix-duplicate' });
  });

  it('rejects when the overlap exceeds half of the shorter side', () => {
    // The tail ends with '…1234' and the suggestion restarts with '1234'.
    // Shorter side = 7 ('1234abc'); half = 3.5; overlap of 4 > 3.5 → reject.
    expect(overlapsPrefixTail('abcd1234', '1234abc')).toBe(true);
    expect(validateCompletion({ prefixTail: 'abcd1234', text: '1234abc', maxChars: 300 }))
      .toEqual({ ok: false, reason: 'prefix-duplicate' });
    // Overlap of exactly half (4 of 8) is still a genuine continuation.
    expect(overlapsPrefixTail('wxyz1234', '1234abcd')).toBe(false);
    expect(validateCompletion({ prefixTail: 'wxyz1234', text: '1234abcd', maxChars: 300 }).ok)
      .toBe(true);
  });

  it('rejects inline-edit protocol tags (protocol-tag)', () => {
    for (const text of [
      '<replacement>new text</replacement>',
      'begin <insertion> insert',
      '<im x=1>body</im>',
      '<clarify>which tone?</clarify>',
      '<editor_selection path="a.md">',
      'plain </insertion> leak',
    ]) {
      expect(validateCompletion({ prefixTail: 'existing sentence', text, maxChars: 300 }))
        .toEqual({ ok: false, reason: 'protocol-tag' });
    }
  });

  it('accepts angle brackets that are not protocol tags', () => {
    const result = validateCompletion({
      prefixTail: 'The comparison reads',
      text: ' a < b and c > d as written.',
      maxChars: 300,
    });
    expect(result.ok).toBe(true);
  });

  it('applies the cap before the duplicate check (truncated repeater still caught)', () => {
    const tail = 'repeat repeat repeat';
    const text = `${tail}${'x'.repeat(400)}`;
    const result = validateCompletion({ prefixTail: tail, text, maxChars: 300 });
    expect(result).toEqual({ ok: false, reason: 'prefix-duplicate' });
  });
});

describe('findProtocolTag', () => {
  it('flags every inline-edit tag family', () => {
    expect(findProtocolTag('<editor_document>')).toBe(true);
    expect(findProtocolTag('<attached_context>')).toBe(true);
    expect(findProtocolTag('<IM>')).toBe(true);
  });

  it('passes ordinary text', () => {
    expect(findProtocolTag('use <angle> brackets freely')).toBe(false);
  });
});

describe('buildInlineCompletionSystemPrompt', () => {
  it('states the output contract with the character cap', () => {
    const en = buildInlineCompletionSystemPrompt('en', 300);
    expect(en).toContain('300');
    expect(en).toContain('continuation ONLY');
    expect(en).toContain('Never repeat');
    expect(en).toContain('plain text only');
  });

  it('localizes to Chinese for the zh locale', () => {
    const zh = buildInlineCompletionSystemPrompt('zh', 300);
    expect(zh).toContain('续写');
    expect(zh).toContain('300');
  });

  it('never mentions the inline-edit XML protocol tags', () => {
    for (const prompt of [
      buildInlineCompletionSystemPrompt('en', 300),
      buildInlineCompletionSystemPrompt('zh', 300),
    ]) {
      expect(findProtocolTag(prompt)).toBe(false);
      expect(prompt).not.toContain('<replacement');
      expect(prompt).not.toContain('<insertion');
    }
  });
});
