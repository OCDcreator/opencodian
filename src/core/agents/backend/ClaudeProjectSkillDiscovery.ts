/**
 * Discovers Claude project skills from the .claude/skills/ directory tree.
 *
 * This is a standalone filesystem-based scanner. It reads skill metadata
 * from the local vault directory and returns structured info for display
 * in settings and slash-command surfaces.
 *
 * Does NOT depend on the SDK or any runtime query — pure filesystem scan.
 */

import type { Dirent } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';

/** Metadata for a single discovered Claude skill (a SKILL.md file in .claude/skills/<name>/). */
export interface ClaudeProjectSkillInfo {
  /** Skill folder name (e.g. "my-skill" from .claude/skills/my-skill/). */
  name: string;
  /** First paragraph or heading content extracted from SKILL.md, or empty string. */
  description: string;
  /** Absolute path to the SKILL.md file. */
  skillMdPath: string;
  /** Relative path from vault root to the skill folder (e.g. .claude/skills/my-skill). */
  relativePath: string;
}

const SKILL_MD_FILENAME = 'SKILL.md';
const CLAUDE_SKILLS_DIR = path.join('.claude', 'skills');

const CODE_FENCE_MARKER = String.fromCharCode(96, 96, 96);

/**
 * Extract a short description from SKILL.md content.
 *
 * Strategy:
 * 1. First markdown heading if present.
 * 2. First non-empty, non-frontmatter paragraph otherwise.
 * 3. Empty string if nothing meaningful found.
 */
function extractDescription(content: string): string {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterEnded = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    // Skip YAML frontmatter
    if (!frontmatterEnded && line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      frontmatterEnded = true;
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) {
      continue;
    }

    // First heading
    const headingMatch = /^#{1,3}\s+(.+)$/.exec(line);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Skip code fences, blockquotes, tables, links
    if (line.startsWith(CODE_FENCE_MARKER) || line.startsWith('>') || line.startsWith('|') || line.startsWith('[')) {
      continue;
    }

    // First content paragraph
    return line.length > 200 ? line.slice(0, 197) + '...' : line;
  }

  return '';
}

/**
 * Discover all Claude project skills under the given vault root.
 * Scans the .claude/skills/ directory for folders containing SKILL.md files.
 *
 * Returns an empty array if the vault path is null/empty or the
 * skills directory does not exist. Never throws — errors are silently
 * caught and result in an empty list.
 */
export async function discoverClaudeProjectSkills(
  vaultPath: string | null | undefined,
): Promise<ClaudeProjectSkillInfo[]> {
  if (!vaultPath || !vaultPath.trim()) {
    return [];
  }

  const skillsDir = path.join(vaultPath, CLAUDE_SKILLS_DIR);

  let entries: Dirent[];
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    // Directory doesn't exist or isn't readable — no skills.
    return [];
  }

  const results: ClaudeProjectSkillInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillName = entry.name.trim();
    if (!skillName || skillName.startsWith('.')) {
      continue;
    }

    const skillMdPath = path.join(skillsDir, skillName, SKILL_MD_FILENAME);

    let content: string;
    try {
      content = await readFile(skillMdPath, 'utf-8');
    } catch {
      // SKILL.md doesn't exist in this skill folder — skip.
      continue;
    }

    results.push({
      name: skillName,
      description: extractDescription(content),
      skillMdPath,
      relativePath: path.join(CLAUDE_SKILLS_DIR, skillName),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a new Claude project skill at .claude/skills/<name>/SKILL.md.
 * Creates the directory structure if it doesn't exist.
 * Returns the absolute path of the created SKILL.md, or null on failure.
 */
export async function createClaudeProjectSkill(
  vaultPath: string | null | undefined,
  skillName: string,
  content?: string,
): Promise<string | null> {
  if (!vaultPath || !vaultPath.trim()) {
    return null;
  }

  const trimmed = skillName.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) {
    return null;
  }

  const skillDir = path.join(vaultPath, CLAUDE_SKILLS_DIR, trimmed);
  const skillMdPath = path.join(skillDir, SKILL_MD_FILENAME);

  try {
    await mkdir(skillDir, { recursive: true });
    const defaultContent = content ?? `# ${trimmed}\n\nDescription of the ${trimmed} skill.\n`;
    await writeFile(skillMdPath, defaultContent, 'utf-8');
    return skillMdPath;
  } catch {
    return null;
  }
}
