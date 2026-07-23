import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';
import type { SlashCommandSkillMode } from '../../../core/types';

interface FuzzyMatchResult {
  item: SlashCommandMenuItem;
  score: number;
}

export interface SlashCommandMenuFilterOptions {
  skillMode: SlashCommandSkillMode;
  skillsCommandDescription: string;
  isMidText?: boolean;
  /**
   * Runtime-only Codex skill mode. When true, `codex-skill` items are exposed
   * through a `/skills` prefix (selecting one inserts the raw `$skill-name `
   * text). This is never persisted and never affects `skillMode` for the
   * OpenCode/Claude paths.
   */
  codexSkillMode?: boolean;
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
    isBuiltin: false,
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

/**
 * Build a Codex `/skills`-prefixed skill item. Selecting it inserts the raw
 * `$skill-name ` text that the Codex app-server interprets natively. The
 * displayId mirrors the OpenCode `/skills name` shape for visual consistency,
 * but the inserted text uses the Codex `$` invocation.
 */
function buildCodexPrefixedSkillMenuItem(item: SlashCommandMenuItem): SlashCommandMenuItem {
  return {
    ...item,
    displayId: `skills ${item.id}`,
    insertText: `$${item.id} `,
  };
}

export function filterSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  query: string,
  options?: SlashCommandMenuFilterOptions,
): SlashCommandMenuItem[] {
  const isMidText = options?.isMidText === true;
  const isCodex = options?.codexSkillMode === true;
  const skillItems = items.filter((item) => item.source === 'skill');
  const codexSkillItems = isCodex ? items.filter((item) => item.source === 'codex-skill') : [];
  const prefixBuilder = isCodex ? buildCodexPrefixedSkillMenuItem : buildPrefixedSkillMenuItem;
  const activeSkillItems = isCodex ? codexSkillItems : skillItems;

  if (isMidText) {
    const filteredSkillItems = filterFuzzySlashCommandMenuItems(
      activeSkillItems,
      isSkillsPrefixQuery(query) ? extractSkillsQuery(query) : query,
    );

    if (options?.skillMode === 'skills-command') {
      const mapped = filteredSkillItems.map(prefixBuilder);
      // Codex mid-text (`$x` or `/skills x`) with no matches: keep the
      // capability entry so the menu is never blank.
      return isCodex && mapped.length === 0
        ? [buildSkillsCommandMenuItem(options.skillsCommandDescription)]
        : mapped;
    }
    // Codex direct mid-text with no matches: still show the capability entry.
    if (isCodex && filteredSkillItems.length === 0) {
      return [buildSkillsCommandMenuItem(options.skillsCommandDescription)];
    }
    return filteredSkillItems;
  }

  // Codex backend: the `/skills` capability entry is ALWAYS offered (even with
  // zero runtime skills) so the menu is never blank. Selecting it expands
  // matching skills (inserting raw `$skill-name`), or — when no skills exist —
  // the coordinator surfaces an actionable empty state. The `$name` trigger
  // filters codex skills directly AND keeps the `/skills` entry visible.
  if (isCodex) {
    const skillsEntry = buildSkillsCommandMenuItem(options.skillsCommandDescription);
    if (isSkillsPrefixQuery(query)) {
      const matched = filterFuzzySlashCommandMenuItems(codexSkillItems, extractSkillsQuery(query)).map(prefixBuilder);
      // Under `/skills <x>` with no matches, keep the capability entry so the
      // user reaches the empty state rather than a blank menu.
      return matched.length > 0 ? matched : [skillsEntry];
    }
    // Empty query or `$name` trigger: matching codex skills first, then the
    // always-present `/skills` entry.
    const matchingSkills = filterFuzzySlashCommandMenuItems(codexSkillItems, query);
    return [...matchingSkills, skillsEntry];
  }

  if (options?.skillMode !== 'skills-command') {
    return filterFuzzySlashCommandMenuItems(items, query);
  }

  if (isSkillsPrefixQuery(query)) {
    return filterFuzzySlashCommandMenuItems(
      items.filter((item) => item.source === 'skill'),
      extractSkillsQuery(query),
    ).map(prefixBuilder);
  }

  return filterFuzzySlashCommandMenuItems(
    [
      ...items.filter((item) => item.source !== 'skill'),
      buildSkillsCommandMenuItem(options.skillsCommandDescription),
    ],
    query,
  );
}
