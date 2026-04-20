import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';

interface FuzzyMatchResult {
  item: SlashCommandMenuItem;
  score: number;
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

export function filterSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  query: string,
  maxCount: number,
): SlashCommandMenuItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items.slice(0, maxCount);
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
  return scoredItems.slice(0, maxCount).map((result) => result.item);
}
