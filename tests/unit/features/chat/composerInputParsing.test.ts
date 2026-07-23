import {
  getCodexSkillMenuQuery,
  getSlashCommandMenuQuery,
  replaceSlashTokenAtCursor,
} from '../../../../src/features/chat/services/composerInputParsing';

function createTextarea(value: string, cursorPos: number): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.selectionStart = cursorPos;
  textarea.selectionEnd = cursorPos;
  return textarea;
}

describe('composerInputParsing slash menu query', () => {
  it('marks slash queries that appear after earlier text as mid-text so the menu can stay skill-only', () => {
    const textarea = createTextarea('hello /ana', 'hello /ana'.length);

    expect(getSlashCommandMenuQuery(textarea)).toEqual({
      query: 'ana',
      isMidText: true,
    });
  });

  it('keeps a prefixed skills query available for the skills-command menu even after earlier text', () => {
    const textarea = createTextarea('hello /skills ana', 'hello /skills ana'.length);

    expect(getSlashCommandMenuQuery(textarea)).toEqual({
      query: 'skills ana',
      isMidText: true,
    });
  });
});

describe('composerInputParsing Codex $ skill query', () => {
  it('detects a $ trigger at the start of the input', () => {
    const textarea = createTextarea('$cod', '$cod'.length);

    expect(getCodexSkillMenuQuery(textarea)).toEqual({
      query: 'cod',
      isMidText: false,
    });
  });

  it('detects a $ trigger after preceding text as mid-text', () => {
    const textarea = createTextarea('hello $git', 'hello $git'.length);

    expect(getCodexSkillMenuQuery(textarea)).toEqual({
      query: 'git',
      isMidText: true,
    });
  });

  it('returns null when there is no $ token at the cursor', () => {
    const textarea = createTextarea('hello world', 'hello world'.length);

    expect(getCodexSkillMenuQuery(textarea)).toBeNull();
  });

  it('returns null when the $ token is followed by a space', () => {
    const textarea = createTextarea('$code review', '$code '.length);

    expect(getCodexSkillMenuQuery(textarea)).toBeNull();
  });
});

describe('replaceSlashTokenAtCursor with $ trigger', () => {
  it('replaces a $ token at the start with the skill insert text', () => {
    const result = replaceSlashTokenAtCursor('$cod', '$cod'.length, '$code-review ');

    expect(result).toEqual({ value: '$code-review ', cursorPos: '$code-review '.length });
  });

  it('replaces a $ token after preceding text, preserving surroundings', () => {
    const result = replaceSlashTokenAtCursor('hello $git flow', 'hello $git'.length, '$git-flow ');

    // The trailing space in the insert text is preserved; the following
    // ' flow' text is kept intact (consistent with the / token behavior).
    expect(result).toEqual({ value: 'hello $git-flow  flow', cursorPos: 'hello $git-flow '.length });
  });

  it('still replaces / tokens for the OpenCode/Claude paths', () => {
    const result = replaceSlashTokenAtCursor('/ana', '/ana'.length, '/analyze ');

    expect(result).toEqual({ value: '/analyze ', cursorPos: '/analyze '.length });
  });
});
