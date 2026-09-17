/**
 * The `#` preset menu mechanics (R-A2): token detection at the cursor, the
 * "just typed a standalone hash" opener, the filter, the token replacement
 * applied on selection, the selection walk, and the row renderer.
 */

import {
  didTypeStandaloneHash,
  filterInlineEditPresets,
  findPresetTokenAtCursor,
  movePresetSelection,
  renderPresetMenuInto,
  replacePresetTokenAtCursor,
} from '../../../../src/features/inline-edit/InlineEditPresetMenu';
import { setLocale } from '../../../../src/i18n';

const PRESETS = [
  { id: 'expand', label: '扩展内容与例子', prompt: '扩写这段内容，保持语气。' },
  { id: 'table', label: '总结为表格', prompt: '总结为 Markdown 表格。' },
  { id: 'polish', label: '润色语气', prompt: '润色这段文字。' },
];

describe('findPresetTokenAtCursor', () => {
  it('finds a # at the very start of the input', () => {
    expect(findPresetTokenAtCursor('#', 1)).toEqual({ tokenStart: 0, query: '' });
  });

  it('finds a # after whitespace with its query text', () => {
    // "please #扩展 now": '#' at offset 7, cursor after the query is 10.
    expect(findPresetTokenAtCursor('please #扩展 now', 10)).toEqual({ tokenStart: 7, query: '扩展' });
  });

  it('returns null when # is glued to the previous word', () => {
    // Obsidian tag compat: "文本#标签" is not a trigger position.
    expect(findPresetTokenAtCursor('文本#标签', 5)).toBeNull();
  });

  it('returns null once the query contains whitespace', () => {
    expect(findPresetTokenAtCursor('#扩展 更多', 6)).toBeNull();
  });

  it('returns null when no # exists before the cursor', () => {
    expect(findPresetTokenAtCursor('扩展', 2)).toBeNull();
  });

  it('uses the closest # to the cursor', () => {
    expect(findPresetTokenAtCursor('#a #b', 5)).toEqual({ tokenStart: 3, query: 'b' });
  });

  it('returns null for out-of-range cursors', () => {
    expect(findPresetTokenAtCursor('#', -1)).toBeNull();
    expect(findPresetTokenAtCursor('#', 5)).toBeNull();
  });
});

describe('didTypeStandaloneHash', () => {
  it('is true when the previous value differs only by the inserted #', () => {
    expect(didTypeStandaloneHash('', '#', 1)).toBe(true);
    expect(didTypeStandaloneHash('please ', 'please #', 8)).toBe(true);
  });

  it('is false when a non-empty character immediately follows (#标签 stays a tag)', () => {
    expect(didTypeStandaloneHash('标签', '#标签', 1)).toBe(false);
  });

  it('is true when the following character is whitespace', () => {
    expect(didTypeStandaloneHash(' x', '# x', 1)).toBe(true);
  });

  it('is false when the cursor is not right after a #', () => {
    expect(didTypeStandaloneHash('', '#x', 2)).toBe(false);
    expect(didTypeStandaloneHash('', 'x', 1)).toBe(false);
  });

  it('is false when the edit changed anything beyond inserting one #', () => {
    expect(didTypeStandaloneHash('abc', '#abcd', 1)).toBe(false);
    expect(didTypeStandaloneHash('#x', '#x', 2)).toBe(false);
  });
});

describe('filterInlineEditPresets', () => {
  it('returns everything for an empty query', () => {
    expect(filterInlineEditPresets(PRESETS, '')).toEqual(PRESETS);
    expect(filterInlineEditPresets(PRESETS, '   ')).toEqual(PRESETS);
  });

  it('matches the label case-insensitively', () => {
    expect(filterInlineEditPresets(PRESETS, '扩展').map((p) => p.id)).toEqual(['expand']);
  });

  it('matches the prompt body too (#表格 finds the table preset via its body)', () => {
    expect(filterInlineEditPresets(PRESETS, 'markdown').map((p) => p.id)).toEqual(['table']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterInlineEditPresets(PRESETS, 'zzz')).toEqual([]);
  });
});

describe('replacePresetTokenAtCursor', () => {
  it('replaces the whole token with the preset body', () => {
    expect(replacePresetTokenAtCursor('#', 1, 'BODY')).toEqual({ value: 'BODY', cursorPos: 4 });
  });

  it('replaces token and query, keeping surrounding text', () => {
    expect(replacePresetTokenAtCursor('please #扩展 now', 8, 'BODY'))
      .toEqual({ value: 'please BODY now', cursorPos: 11 });
  });

  it('also replaces token text after the cursor', () => {
    // Cursor right after "#"; the rest of the token ("扩展x") is dropped.
    expect(replacePresetTokenAtCursor('#扩展x tail', 1, 'BODY'))
      .toEqual({ value: 'BODY tail', cursorPos: 4 });
  });

  it('falls back to replacing the whole input when no token exists', () => {
    expect(replacePresetTokenAtCursor('plain', 5, 'BODY')).toEqual({ value: 'BODY', cursorPos: 4 });
  });
});

describe('movePresetSelection', () => {
  it('wraps around both ends', () => {
    expect(movePresetSelection(0, 3, -1)).toBe(2);
    expect(movePresetSelection(2, 3, 1)).toBe(0);
    expect(movePresetSelection(1, 3, 1)).toBe(2);
  });

  it('returns -1 for an empty list', () => {
    expect(movePresetSelection(0, 0, 1)).toBe(-1);
  });
});

describe('renderPresetMenuInto', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  function render(items = PRESETS, selectedIndex = 0) {
    const container = document.createElement('div');
    const hover: number[] = [];
    const select: number[] = [];
    renderPresetMenuInto(container, {
      items,
      selectedIndex,
      onHoverItem: (index) => hover.push(index),
      onSelectItem: (index) => select.push(index),
    });
    return { container, hover, select };
  }

  it('renders one row per preset with the label and prompt on the title', () => {
    const { container } = render();
    const rows = [...container.querySelectorAll<HTMLElement>('.opencodian-inline-edit-menu-item')];
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('扩展内容与例子');
    expect(rows[0].title).toBe('扩写这段内容，保持语气。');
    expect(rows[0].classList.contains('is-highlighted')).toBe(true);
    expect(rows[1].classList.contains('is-highlighted')).toBe(false);
  });

  it('renders the empty state when nothing matches', () => {
    const { container } = render([]);
    expect(container.querySelector('.opencodian-inline-edit-picker-empty')).not.toBeNull();
    expect(container.querySelectorAll('.opencodian-inline-edit-menu-item')).toHaveLength(0);
  });

  it('selects on click and hovers on pointerenter', () => {
    const { container, hover, select } = render();
    const rows = [...container.querySelectorAll<HTMLElement>('.opencodian-inline-edit-menu-item')];
    rows[1].dispatchEvent(new Event('pointerenter'));
    rows[1].click();
    expect(hover).toEqual([1]);
    expect(select).toEqual([1]);
  });
});
