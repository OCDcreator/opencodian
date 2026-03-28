import {
  buildTitleGenerationPrompt,
  buildTitleGenerationSystemPrompt,
  normalizeTitleGenerationLocale,
} from '../../../../src/core/prompts/titleGeneration';

describe('title generation prompts', () => {
  it('normalizes unsupported locales to English', () => {
    expect(normalizeTitleGenerationLocale('en')).toBe('en');
    expect(normalizeTitleGenerationLocale('zh')).toBe('zh');
    expect(normalizeTitleGenerationLocale('fr')).toBe('en');
  });

  it('requests Simplified Chinese titles for zh locale', () => {
    expect(buildTitleGenerationSystemPrompt('zh')).toContain('Output the title in Simplified Chinese.');
    expect(buildTitleGenerationPrompt('帮我重构这个插件', 'zh')).toContain(
      'Generate the best short conversation title in Simplified Chinese.',
    );
  });

  it('requests English titles for en locale', () => {
    expect(buildTitleGenerationSystemPrompt('en')).toContain('Output the title in English.');
    expect(buildTitleGenerationPrompt('Help me refactor this plugin', 'en')).toContain(
      'Generate the best short conversation title in English.',
    );
  });
});
