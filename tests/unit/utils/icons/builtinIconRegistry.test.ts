import {
  formatBuiltinSource,
  getBuiltinIcon,
  parseBuiltinSource,
  resolveBuiltinIconMatch,
  searchBuiltinIcons,
} from '../../../../src/utils/icons/builtinIconRegistry';

describe('builtinIconRegistry', () => {
  it('formats and parses builtin sources', () => {
    const source = formatBuiltinSource('opencode', 'requesty');

    expect(source).toBe('opencode:requesty');
    expect(parseBuiltinSource(source)).toEqual({
      libraryId: 'opencode',
      iconId: 'requesty',
    });
  });

  it('prefers the LobeHub match when both libraries score equally', () => {
    const results = searchBuiltinIcons('deepseek', { limit: 2 });

    expect(results[0]).toMatchObject({
      libraryId: 'lobehub',
      iconId: 'deepseek',
    });
    expect(results[1]).toMatchObject({
      libraryId: 'opencode',
      iconId: 'deepseek',
    });
  });

  it('resolves OpenCode-only providers through the builtin matcher', () => {
    expect(resolveBuiltinIconMatch('requesty')).toMatchObject({
      libraryId: 'opencode',
      iconId: 'requesty',
    });
  });

  it('uses generated LobeHub manifest metadata for definitions', () => {
    expect(getBuiltinIcon('lobehub', 'adobe')).toMatchObject({
      libraryId: 'lobehub',
      iconId: 'adobe',
      lobehub: expect.objectContaining({
        componentId: 'Adobe',
        staticVariants: expect.arrayContaining(['mono', 'color']),
        supportedVariants: expect.arrayContaining(['auto', 'mono', 'color', 'combine']),
      }),
    });
  });
});
