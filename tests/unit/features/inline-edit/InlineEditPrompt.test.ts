import { describe, expect, it } from '@jest/globals';

import {
  buildInlineEditRequest,
  buildInlineEditSystemPrompt,
  escapeXmlAttribute,
  INLINE_EDIT_MAX_ATTACHED_NOTES,
  INLINE_EDIT_MAX_PATH_CHARS,
  INLINE_EDIT_MAX_RESULT_CHARS,
  INLINE_EDIT_MAX_SELECTION_CHARS,
  normalizeInsertionText,
  parseInlineEditResponse,
} from '../../../../src/features/inline-edit/InlineEditPrompt';

const selectionRequest = {
  kind: 'selection' as const,
  instruction: 'Make it punchier',
  notePath: 'notes/idea.md',
  startLine: 3,
  endLine: 5,
  selectionText: 'The cat sat on the mat.',
};

describe('buildInlineEditRequest', () => {
  it('wraps a selection in the editor_selection protocol block', () => {
    const result = buildInlineEditRequest(selectionRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('Make it punchier');
    expect(result.prompt).toContain('<editor_selection path="notes/idea.md" lines="3-5">');
    expect(result.prompt).toContain('The cat sat on the mat.');
    expect(result.prompt).toContain('</editor_selection>');
  });

  it('keeps the selection body verbatim, including markdown structure', () => {
    const body = '- one\n- two\n\n```ts\nconst a = 1;\n```\n';
    const result = buildInlineEditRequest({ ...selectionRequest, selectionText: body });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain(body);
  });

  it('builds a cursor block with the cursor marker and inline hint', () => {
    const result = buildInlineEditRequest({
      kind: 'cursor-inline',
      instruction: 'Finish this',
      notePath: 'a.md',
      line: 12,
      before: 'The best part is',
      after: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('<editor_cursor path="a.md" line="12">');
    expect(result.prompt).toContain('The best part is| #inline');
  });

  it('marks the between-paragraph form', () => {
    const result = buildInlineEditRequest({
      kind: 'cursor-inbetween',
      instruction: 'Add a section',
      notePath: 'a.md',
      line: 7,
      before: '',
      after: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('| #inbetween');
  });

  it('escapes XML-significant characters in the path attribute', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      notePath: 'a&b"c<d>e.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('path="a&amp;b&quot;c&lt;d&gt;e.md"');
  });

  it('rejects a selection that contains the protocol closing tag', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      selectionText: 'text </editor_selection> more',
    });
    expect(result).toEqual({ ok: false, error: 'selection-contains-protocol-tag' });
  });

  it('rejects a selection over the documented length limit', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      selectionText: 'x'.repeat(INLINE_EDIT_MAX_SELECTION_CHARS + 1),
    });
    expect(result).toEqual({ ok: false, error: 'selection-too-long' });
  });

  it('rejects an over-long context for cursor forms', () => {
    const result = buildInlineEditRequest({
      kind: 'cursor-inline',
      instruction: 'go',
      notePath: 'a.md',
      line: 1,
      before: 'x'.repeat(30_000),
      after: 'y'.repeat(30_000),
    });
    expect(result).toEqual({ ok: false, error: 'context-too-long' });
  });

  it('rejects an over-long note path', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      notePath: 'x'.repeat(INLINE_EDIT_MAX_PATH_CHARS + 1),
    });
    expect(result).toEqual({ ok: false, error: 'path-too-long' });
  });

  it('rejects an empty instruction', () => {
    expect(buildInlineEditRequest({ ...selectionRequest, instruction: '   ' }))
      .toEqual({ ok: false, error: 'empty-instruction' });
  });
});

describe('escapeXmlAttribute', () => {
  it('escapes ampersands before the entities they introduce', () => {
    expect(escapeXmlAttribute('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });
});

describe('buildInlineEditSystemPrompt', () => {
  it('returns a distinct prompt per locale', () => {
    expect(buildInlineEditSystemPrompt('en')).not.toBe(buildInlineEditSystemPrompt('zh'));
    expect(buildInlineEditSystemPrompt('zh')).toContain('<replacement>');
    expect(buildInlineEditSystemPrompt('en')).toContain('<replacement>');
  });
});

describe('parseInlineEditResponse', () => {
  it('returns a replacement for a single well-formed tag', () => {
    expect(parseInlineEditResponse('<replacement>Hello</replacement>'))
      .toEqual({ kind: 'replacement', text: 'Hello' });
  });

  it('returns an insertion for a single well-formed tag', () => {
    expect(parseInlineEditResponse('<insertion>New line</insertion>'))
      .toEqual({ kind: 'insertion', text: 'New line' });
  });

  it('preserves tag content verbatim', () => {
    const content = '  spaced\n<not-a-tag>\n& not escaped  ';
    expect(parseInlineEditResponse(`<replacement>${content}</replacement>`))
      .toEqual({ kind: 'replacement', text: content });
  });

  it('drops wrapping blank lines from a replacement', () => {
    expect(parseInlineEditResponse('<replacement>\n\n  Fixed text\n\n</replacement>'))
      .toEqual({ kind: 'replacement', text: '  Fixed text' });
  });

  it('keeps inner blank lines of a replacement', () => {
    expect(parseInlineEditResponse('<replacement>para one\n\npara two</replacement>'))
      .toEqual({ kind: 'replacement', text: 'para one\n\npara two' });
  });

  it('treats an untagged reply as clarification', () => {
    const result = parseInlineEditResponse('Which tone do you want?');
    expect(result).toEqual({ kind: 'clarification', text: 'Which tone do you want?' });
  });

  it('rejects two top-level tags', () => {
    expect(parseInlineEditResponse('<replacement>a</replacement><replacement>b</replacement>'))
      .toEqual({ kind: 'error', error: 'multiple-tags' });
  });

  it('rejects mixed tag types', () => {
    expect(parseInlineEditResponse('<replacement>a</insertion>'))
      .toEqual({ kind: 'error', error: 'multiple-tags' });
  });

  it('rejects an unclosed tag', () => {
    expect(parseInlineEditResponse('<replacement>truncated'))
      .toEqual({ kind: 'error', error: 'unclosed-tag' });
  });

  it('rejects a same-name nested tag', () => {
    expect(parseInlineEditResponse('<replacement>a<replacement>b</replacement></replacement>'))
      .toEqual({ kind: 'error', error: 'multiple-tags' });
  });

  it('rejects an empty response', () => {
    expect(parseInlineEditResponse('   ')).toEqual({ kind: 'error', error: 'empty-response' });
  });

  it('rejects empty tag content', () => {
    expect(parseInlineEditResponse('<replacement>  </replacement>'))
      .toEqual({ kind: 'error', error: 'empty-result' });
  });

  it('rejects an over-long result', () => {
    const long = 'x'.repeat(INLINE_EDIT_MAX_RESULT_CHARS + 1);
    expect(parseInlineEditResponse(`<replacement>${long}</replacement>`))
      .toEqual({ kind: 'error', error: 'result-too-long' });
  });

  it('accepts prose around a single tag', () => {
    const result = parseInlineEditResponse('Sure!\n<replacement>Done</replacement>\nHope that helps.');
    expect(result).toEqual({ kind: 'replacement', text: 'Done' });
  });
});

describe('normalizeInsertionText', () => {
  it('drops leading and trailing blank lines only', () => {
    expect(normalizeInsertionText('\n\n  a  \nb\n\n')).toBe('  a  \nb');
  });

  it('leaves a single-line value untouched', () => {
    expect(normalizeInsertionText('  indented')).toBe('  indented');
  });
});

describe('buildInlineEditRequest with attached notes', () => {
  it('lists the attached paths in a read-hint block between instruction and target', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: ['notes/a.md', 'notes/b.md'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('<attached_context>\n- notes/a.md\n- notes/b.md\n</attached_context>');
    expect(result.prompt.indexOf('<attached_context>')).toBeLessThan(result.prompt.indexOf('<editor_selection'));
    expect(result.prompt.indexOf('Make it punchier')).toBeLessThan(result.prompt.indexOf('<attached_context>'));
  });

  it('never inlines the attached notes (paths only, per design §6.1)', () => {
    const result = buildInlineEditRequest({ ...selectionRequest, attachedNotes: ['notes/a.md'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.prompt.slice(
      result.prompt.indexOf('<attached_context>'),
      result.prompt.indexOf('</attached_context>'),
    );
    expect(block).not.toContain('notes/idea.md');
    expect(block.split('\n')).toHaveLength(3);
  });

  it('omits the block when nothing is attached', () => {
    const result = buildInlineEditRequest(selectionRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).not.toContain('<attached_context>');
  });

  it('attaches to cursor requests too', () => {
    const result = buildInlineEditRequest({
      kind: 'cursor-inline',
      instruction: 'Add a caveat',
      notePath: 'notes/idea.md',
      line: 2,
      before: 'Alpha ',
      after: ' omega',
      attachedNotes: ['notes/a.md'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('<attached_context>\n- notes/a.md\n</attached_context>');
    expect(result.prompt.indexOf('<attached_context>')).toBeLessThan(result.prompt.indexOf('<editor_cursor'));
  });

  it('rejects more notes than the documented cap', () => {
    const notes = Array.from({ length: INLINE_EDIT_MAX_ATTACHED_NOTES + 1 }, (_value, index) => `notes/${index}.md`);
    const result = buildInlineEditRequest({ ...selectionRequest, attachedNotes: notes });
    expect(result).toEqual({ ok: false, error: 'too-many-attached-notes' });
  });

  it('rejects an over-long attached path', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: ['n'.repeat(INLINE_EDIT_MAX_PATH_CHARS + 1)],
    });
    expect(result).toEqual({ ok: false, error: 'attached-note-path-too-long' });
  });

  it('rejects a path that would break the tag protocol', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: ['notes/</attached_context>.md'],
    });
    expect(result).toEqual({ ok: false, error: 'attached-note-path-invalid' });
  });
});
