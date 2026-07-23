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
import { readdir, readFile, rm } from 'fs/promises';
import * as path from 'path';

import {
  assertWithinRoot,
  atomicWriteFile,
  isSafeResourceName,
  type ProjectResourceWriteError,
  toWriteErrorCode,
} from './ProjectResourceSecureWrite';

/** Metadata for a single discovered Claude skill (a SKILL.md file in .claude/skills/<name>/). */
export interface ClaudeProjectSkillInfo {
  /** Skill folder name (e.g. "my-skill" from .claude/skills/my-skill/). */
  name: string;
  /** First paragraph or heading content extracted from SKILL.md, or empty string. */
  description: string;
  /** Absolute path to the SKILL.md file. */
  skillMdPath: string;
  /** Relative path from scan root to the skill folder (e.g. .claude/skills/my-skill). */
  relativePath: string;
  /** Whether this resource is editable (project) or read-only (global). */
  readonly: boolean;
  /** 'project' | 'global'. */
  scope: 'project' | 'global';
}

export type ClaudeSkillWriteResult =
  | { ok: true; path: string }
  | { ok: false; reason: ProjectResourceWriteError; path?: string };

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
  return scanSkills(vaultPath, CLAUDE_SKILLS_DIR, 'project');
}

/** Discover global (~/.claude/skills) skills — read-only. */
export async function discoverClaudeGlobalSkills(
  homePath: string | null | undefined,
): Promise<ClaudeProjectSkillInfo[]> {
  return scanSkills(homePath, CLAUDE_SKILLS_DIR, 'global');
}

async function scanSkills(
  scanRoot: string | null | undefined,
  skillsDir: string,
  scope: 'project' | 'global',
): Promise<ClaudeProjectSkillInfo[]> {
  if (!scanRoot || !scanRoot.trim()) {
    return [];
  }
  const absoluteSkillsDir = path.join(scanRoot, skillsDir);
  let entries: Dirent[];
  try {
    entries = await readdir(absoluteSkillsDir, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
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
    const skillMdPath = path.join(absoluteSkillsDir, skillName, SKILL_MD_FILENAME);
    let content: string;
    try {
      content = await readFile(skillMdPath, 'utf-8');
    } catch {
      continue;
    }
    results.push({
      name: skillName,
      description: extractDescription(content),
      skillMdPath,
      relativePath: path.join(skillsDir, skillName),
      readonly: scope === 'global',
      scope,
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readClaudeSkillContent(skillMdPath: string): Promise<string | null> {
  try {
    return await readFile(skillMdPath, 'utf-8');
  } catch {
    return null;
  }
}

export function defaultClaudeSkillContent(name: string): string {
  return `---\nname: ${name}\ndescription: Describe when this skill should be used.\n---\n\n# ${name}\n\nWrite the workflow, constraints, and examples for this skill.\n`;
}

/** Validate SKILL.md frontmatter: require a YAML block with non-empty name + description. */
export function validateClaudeSkillContent(content: string): string | null {
  const fmMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!fmMatch) {
    return 'Missing YAML frontmatter (--- ... ---) at the top of SKILL.md.';
  }
  const fm = fmMatch[1];
  if (!/^name:\s*\S/m.test(fm)) {
    return 'Frontmatter is missing a non-empty "name" field.';
  }
  if (!/^description:\s*\S/m.test(fm)) {
    return 'Frontmatter is missing a non-empty "description" field.';
  }
  return null;
}

function skillMdPathFor(vaultPath: string, name: string): string {
  return path.join(vaultPath, CLAUDE_SKILLS_DIR, name, SKILL_MD_FILENAME);
}

/**
 * Create a new Claude project skill at .claude/skills/<name>/SKILL.md.
 * Validates name + path safety and writes atomically. Returns the absolute
 * path, or null on failure (backward compatible with existing callers).
 */
export async function createClaudeProjectSkill(
  vaultPath: string | null | undefined,
  skillName: string,
  content?: string,
): Promise<string | null> {
  const result = await createClaudeProjectSkillTyped(vaultPath, skillName, content);
  return result.ok ? result.path : null;
}

async function createClaudeProjectSkillTyped(
  vaultPath: string | null | undefined,
  skillName: string,
  content?: string,
): Promise<ClaudeSkillWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = skillName.trim();
  if (!isSafeResourceName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const body = content ?? defaultClaudeSkillContent(trimmed);
  const skillMdPath = skillMdPathFor(vaultPath, trimmed);
  try {
    await assertWithinRoot(vaultPath, skillMdPath);
    const { existsSync } = await import('fs');
    if (existsSync(skillMdPath)) {
      return { ok: false, reason: 'duplicate', path: skillMdPath };
    }
    await atomicWriteFile(skillMdPath, body);
    return { ok: true, path: skillMdPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function updateClaudeProjectSkill(
  vaultPath: string | null | undefined,
  skillName: string,
  content: string,
): Promise<ClaudeSkillWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = skillName.trim();
  if (!isSafeResourceName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  if (validateClaudeSkillContent(content)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const skillMdPath = skillMdPathFor(vaultPath, trimmed);
  try {
    await assertWithinRoot(vaultPath, skillMdPath);
    const { existsSync } = await import('fs');
    if (!existsSync(skillMdPath)) {
      return { ok: false, reason: 'not-found' };
    }
    await atomicWriteFile(skillMdPath, content);
    return { ok: true, path: skillMdPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function deleteClaudeProjectSkill(
  vaultPath: string | null | undefined,
  skillName: string,
): Promise<ClaudeSkillWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = skillName.trim();
  if (!isSafeResourceName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const skillDir = path.join(vaultPath, CLAUDE_SKILLS_DIR, trimmed);
  try {
    await assertWithinRoot(vaultPath, skillDir);
    const { existsSync } = await import('fs');
    if (!existsSync(skillDir)) {
      return { ok: false, reason: 'not-found' };
    }
    await rm(skillDir, { recursive: true, force: true });
    return { ok: true, path: skillDir };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}
