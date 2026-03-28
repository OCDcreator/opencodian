/**
 * OpenCodian - Title Generation System Prompt
 */

export type TitleGenerationLocale = 'en' | 'zh';

const TITLE_LANGUAGE_LABELS: Record<TitleGenerationLocale, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
};

export function normalizeTitleGenerationLocale(locale: string): TitleGenerationLocale {
  return locale === 'zh' ? 'zh' : 'en';
}

export function buildTitleGenerationSystemPrompt(locale: string): string {
  const normalizedLocale = normalizeTitleGenerationLocale(locale);

  return `You generate concise conversation titles.

Rules:
1. Return only the raw title text.
2. Use sentence case and start with a strong verb when natural.
3. Keep it at or below 50 characters.
4. Include the primary technical context when relevant.
5. Do not use quotes, markdown, prefixes, or trailing punctuation.
6. Avoid generic phrases like "Help with", "Question about", or "Conversation about".
7. Output the title in ${TITLE_LANGUAGE_LABELS[normalizedLocale]}.`;
}

export function buildTitleGenerationPrompt(userMessage: string, locale: string): string {
  const normalizedLocale = normalizeTitleGenerationLocale(locale);

  return `First user message:
"""
${userMessage}
"""

Generate the best short conversation title in ${TITLE_LANGUAGE_LABELS[normalizedLocale]}.`;
}

export const TITLE_GENERATION_SYSTEM_PROMPT = buildTitleGenerationSystemPrompt('en');
