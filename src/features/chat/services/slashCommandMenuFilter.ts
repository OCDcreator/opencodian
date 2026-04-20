import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';
import type { SlashCommandSkillMode } from '../../../core/types';

interface FuzzyMatchResult {
  item: SlashCommandMenuItem;
  score: number;
}

export interface SlashCommandMenuFilterOptions {
  skillMode: SlashCommandSkillMode;
  skillsCommandDescription: string;
}

function fuzzyScore(text: string, query: string): number {
  if (!query) {
    return 1;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText.startsWith(lowerQuery)) {
    return 1000 + lowerQuery.length;
  }

  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -2;
  for (let textIndex = 0; textIndex < lowerText.length && queryIndex < lowerQuery.length; textIndex++) {
    if (lowerText[textIndex] === lowerQuery[queryIndex]) {
      score += textIndex === lastMatchIndex + 1 ? 15 : 5;
      score += textIndex === 0 ? 10 : 0;
      lastMatchIndex = textIndex;
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length ? score : 0;
}

function filterFuzzySlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  query: string,
): SlashCommandMenuItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  const scoredItems: FuzzyMatchResult[] = [];
  for (const item of items) {
    const idScore = fuzzyScore(item.id, normalizedQuery);
    const descriptionScore = item.description
      ? fuzzyScore(item.description, normalizedQuery)
      : 0;
    const bestScore = Math.max(idScore, descriptionScore);
    if (bestScore > 0) {
      scoredItems.push({ item, score: bestScore });
    }
  }

  scoredItems.sort((left, right) => right.score - left.score);
  return scoredItems.map((result) => result.item);
}

function buildSkillsCommandMenuItem(description: string): SlashCommandMenuItem {
  return {
    id: 'skills',
    description,
    hasProjectOverride: false,
    insertText: '/skills ',
    runtimeAvailable: false,
    source: 'skills-command',
    subtask: false,
  };
}

function isSkillsPrefixQuery(query: string): boolean {
  return /^skills\s+/i.test(query.trimStart());
}

function extractSkillsQuery(query: string): string {
  const match = /^skills\s+([\s\S]*)$/i.exec(query.trimStart());
  return match?.[1] ?? '';
}

function buildPrefixedSkillMenuItem(item: SlashCommandMenuItem): SlashCommandMenuItem {
  return {
    ...item,
    displayId: `skills ${item.id}`,
    insertText: `/skills ${item.id} `,
  };
}

export function filterSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  query: string,
  options?: SlashCommandMenuFilterOptions,
): SlashCommandMenuItem[] {
  if (options?.skillMode !== 'skills-command') {
    return filterFuzzySlashCommandMenuItems(items, query);
  }

  if (isSkillsPrefixQuery(query)) {
    return filterFuzzySlashCommandMenuItems(
      items.filter((item) => item.source === 'skill'),
      extractSkillsQuery(query),
    ).map(buildPrefixedSkillMenuItem);
  }

  return filterFuzzySlashCommandMenuItems(
    [
      ...items.filter((item) => item.source !== 'skill'),
      buildSkillsCommandMenuItem(options.skillsCommandDescription),
    ],
    query,
  );
}
