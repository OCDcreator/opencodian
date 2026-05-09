import { getSlashCommandMenuQuery } from '../../../../src/features/chat/services/composerInputParsing';

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
