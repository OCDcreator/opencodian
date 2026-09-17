/**
 * The preset catalog (R-A2): the six localized builtins and the composition
 * rule that layers user presets on top of them.
 */

import {
  INLINE_EDIT_BUILTIN_PRESET_IDS,
  listBuiltinInlineEditPresets,
  listEffectiveInlineEditPresets,
} from '../../../../src/features/inline-edit/InlineEditPresets';
import { getLocale, setLocale, t } from '../../../../src/i18n';

const LOCALES = ['en', 'zh'] as const;
const ORIGINAL_LOCALE = getLocale();

afterAll(() => {
  setLocale(ORIGINAL_LOCALE);
});

describe('listBuiltinInlineEditPresets', () => {
  it.each(LOCALES)('returns six unique, fully populated presets in %s', (locale) => {
    setLocale(locale);
    const presets = listBuiltinInlineEditPresets();
    expect(presets).toHaveLength(6);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(6);
    for (const preset of presets) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses the suggested catalog ids', () => {
    expect([...INLINE_EDIT_BUILTIN_PRESET_IDS]).toEqual([
      'expand',
      'condense',
      'translate',
      'summarize-table',
      'polish-tone',
      'fix-typos',
    ]);
  });

  it('follows the active locale', () => {
    setLocale('zh');
    const zhLabels = listBuiltinInlineEditPresets().map((preset) => preset.label);
    setLocale('en');
    const enLabels = listBuiltinInlineEditPresets().map((preset) => preset.label);
    expect(zhLabels).not.toEqual(enLabels);
    expect(listBuiltinInlineEditPresets()[0].label).toBe(t('inlineEdit.presets.expand.label'));
  });
});

describe('listEffectiveInlineEditPresets', () => {
  beforeEach(() => setLocale('en'));

  it('shows only builtins when the user list is empty', () => {
    expect(listEffectiveInlineEditPresets([])).toEqual(listBuiltinInlineEditPresets());
  });

  it('appends user presets after the builtins in settings order', () => {
    const user = [
      { id: 'mine-1', label: 'Mine one', prompt: 'Do one thing.' },
      { id: 'mine-2', label: 'Mine two', prompt: 'Do another.' },
    ];
    const effective = listEffectiveInlineEditPresets(user);
    expect(effective).toHaveLength(8);
    expect(effective.slice(0, 6)).toEqual(listBuiltinInlineEditPresets());
    expect(effective.slice(6)).toEqual(user);
  });

  it('skips user entries whose id collides with a builtin', () => {
    const effective = listEffectiveInlineEditPresets([
      { id: 'expand', label: 'Shadowed', prompt: 'Never shown.' },
      { id: 'mine', label: 'Mine', prompt: 'Shown.' },
    ]);
    expect(effective.filter((preset) => preset.label === 'Shadowed')).toHaveLength(0);
    expect(effective.some((preset) => preset.id === 'mine')).toBe(true);
  });

  it('filters half-edited entries with an empty label or prompt', () => {
    const effective = listEffectiveInlineEditPresets([
      { id: 'empty-label', label: '  ', prompt: 'Body.' },
      { id: 'empty-prompt', label: 'Label', prompt: '' },
      { id: 'ok', label: 'Label', prompt: 'Body.' },
    ]);
    expect(effective.map((preset) => preset.id)).not.toContain('empty-label');
    expect(effective.map((preset) => preset.id)).not.toContain('empty-prompt');
    expect(effective.map((preset) => preset.id)).toContain('ok');
  });
});
