/**
 * Attached-context UI: the filter rule and the picker body rendering.
 *
 * The picker is plain DOM, so it can be exercised with jsdom the way
 * `renderDiffInto` is: rows, check marks, the empty state, the truncation hint
 * and the keyboard walk all render without an editor.
 */

import {
  filterContextFiles,
  PICKER_MAX_ROWS,
  renderContextChips,
  renderContextPickerInto,
} from '../../../../src/features/inline-edit/InlineEditContextUi';

const FILES = [
  { path: 'notes/alpha.md', name: 'alpha' },
  { path: 'notes/beta.md', name: 'beta' },
  { path: 'archive/gamma.md', name: 'gamma' },
];

function renderPicker(files = FILES, attached: string[] = [], onToggle: (path: string) => void = () => {}) {
  const container = document.createElement('div');
  const refresh = renderContextPickerInto(container, { files, onToggle });
  refresh(new Set(attached));
  return { container, refresh };
}

function rowLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.opencodian-inline-edit-menu-item-label')].map((el) => el.textContent ?? '');
}

describe('filterContextFiles', () => {
  it('returns everything (capped) for an empty query', () => {
    expect(filterContextFiles(FILES, '')).toEqual(FILES);
    expect(filterContextFiles(FILES, '   ')).toEqual(FILES);
  });

  it('matches a case-insensitive substring of the path', () => {
    expect(filterContextFiles(FILES, 'GAMMA').map((file) => file.name)).toEqual(['gamma']);
    expect(filterContextFiles(FILES, 'notes/').map((file) => file.name)).toEqual(['alpha', 'beta']);
  });

  it('caps the rendered rows', () => {
    const many = Array.from({ length: PICKER_MAX_ROWS + 10 }, (_value, index) => ({
      path: `n/${index}.md`,
      name: `${index}`,
    }));
    expect(filterContextFiles(many, '')).toHaveLength(PICKER_MAX_ROWS);
  });
});

describe('renderContextPickerInto', () => {
  it('renders one row per candidate with its folder', () => {
    const { container } = renderPicker();
    expect(rowLabels(container)).toEqual(['alpha', 'beta', 'gamma']);
    expect([...container.querySelectorAll('.opencodian-inline-edit-picker-folder')].map((el) => el.textContent))
      .toEqual(['notes', 'notes', 'archive']);
  });

  it('marks attached notes and toggles them on click', () => {
    const toggled: string[] = [];
    const { container } = renderPicker(FILES, ['notes/beta.md'], (path) => toggled.push(path));
    const rows = [...container.querySelectorAll('.opencodian-inline-edit-menu-item')];
    expect(rows[1].classList.contains('is-checked')).toBe(true);
    expect(rows[0].classList.contains('is-checked')).toBe(false);
    (rows[0] as HTMLElement).click();
    expect(toggled).toEqual(['notes/alpha.md']);
  });

  it('filters as the query changes', () => {
    const { container } = renderPicker();
    const search = container.querySelector<HTMLInputElement>('.opencodian-inline-edit-picker-search');
    if (!search) throw new Error('search field missing');
    search.value = 'beta';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rowLabels(container)).toEqual(['beta']);
  });

  it('shows the empty state when nothing matches', () => {
    const { container } = renderPicker();
    const search = container.querySelector<HTMLInputElement>('.opencodian-inline-edit-picker-search');
    if (!search) throw new Error('search field missing');
    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelectorAll('.opencodian-inline-edit-menu-item')).toHaveLength(0);
    expect(container.querySelector('.opencodian-inline-edit-picker-empty')?.textContent).toBeTruthy();
  });

  it('hints when the list is truncated', () => {
    const many = Array.from({ length: PICKER_MAX_ROWS + 1 }, (_value, index) => ({
      path: `n/${index}.md`,
      name: `${index}`,
    }));
    const { container } = renderPicker(many);
    expect(container.querySelector('.opencodian-inline-edit-picker-hint')).not.toBeNull();
  });

  it('walks the list with the keyboard and picks on Enter', () => {
    const toggled: string[] = [];
    const { container } = renderPicker(FILES, [], (path) => toggled.push(path));
    const search = container.querySelector<HTMLInputElement>('.opencodian-inline-edit-picker-search');
    if (!search) throw new Error('search field missing');
    const press = (key: string) => search.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    press('ArrowDown');
    press('Enter');
    expect(toggled).toEqual(['notes/beta.md']);
  });

  it('highlights the first row by default and wraps with ArrowUp', () => {
    const { container } = renderPicker();
    const rows = () => [...container.querySelectorAll('.opencodian-inline-edit-menu-item')];
    expect(rows()[0].classList.contains('is-highlighted')).toBe(true);
    const search = container.querySelector<HTMLInputElement>('.opencodian-inline-edit-picker-search');
    search?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(rows()[2].classList.contains('is-highlighted')).toBe(true);
  });

  it('renders folder entries with a folder glyph and the full path (R-A7)', () => {
    const { container } = renderPicker([
      { path: 'notes/a.md', name: 'a', kind: 'file' },
      { path: 'projects/alpha', name: 'alpha', kind: 'folder' },
    ]);
    const rows = [...container.querySelectorAll('.opencodian-inline-edit-menu-item')];
    expect(rows).toHaveLength(2);
    const fileGlyph = rows[0].querySelector('.opencodian-inline-edit-menu-item-glyph svg');
    const folderGlyph = rows[1].querySelector('.opencodian-inline-edit-menu-item-glyph svg');
    expect(fileGlyph?.getAttribute('data-icon')).not.toBe('folder');
    expect(folderGlyph?.getAttribute('data-icon')).toBe('folder');
    // Files show the parent-folder suffix; folders show the full path.
    expect(rows[0].querySelector('.opencodian-inline-edit-picker-folder')?.textContent).toBe('notes');
    expect(rows[1].querySelector('.opencodian-inline-edit-picker-folder')?.textContent).toBe('projects/alpha');
  });

  it('renders folder context chips with a folder glyph (R-A7)', () => {
    const row = document.createElement('div');
    renderContextChips(row, [
      { path: 'notes/a.md', label: 'a', kind: 'file' },
      { path: 'projects/alpha', label: 'alpha', kind: 'folder' },
    ], () => {});
    const chips = [...row.querySelectorAll('.opencodian-inline-edit-context-chip')];
    expect(chips).toHaveLength(2);
    const glyphs = chips.map((chip) => chip.querySelector('.opencodian-inline-edit-chip-prefix svg')?.getAttribute('data-icon'));
    expect(glyphs[0]).not.toBe('folder');
    expect(glyphs[1]).toBe('folder');
  });

  it('refreshes check marks from a new attached set without rebuilding the rows', () => {
    const { container, refresh } = renderPicker(FILES, []);
    expect(container.querySelectorAll('.is-checked')).toHaveLength(0);
    refresh(new Set(['archive/gamma.md']));
    const checked = container.querySelectorAll('.is-checked');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain('gamma');
  });
});
