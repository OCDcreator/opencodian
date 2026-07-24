/**
 * Codex project + global resource discovery.
 *
 * Pure filesystem scanner for Codex resources the plugin is allowed to surface:
 *   - Project skills:  <vault>/.agents/skills/<name>/SKILL.md   (editable)
 *   - Project agents:  <vault>/.codex/agents/<name>.toml         (editable)
 *   - Global skills:   ~/.agents/skills/<name>/SKILL.md          (read-only in this P0 path)
 *   - Global agents:   ~/.codex/agents/<name>.toml               (read-only in this P0 path)
 *
 * Global resources are read-only in this P0 discovery path: this owner has no
 * global mutation API. Any future P1 global CRUD path must use the shared
 * secure-file contract with explicit allowlisted-root validation. Only
 * project roots under the vault are writable here, and every write is
 * validated (required fields, name safety, duplicate detection,
 * path-traversal protection) and performed atomically (temp file + rename) so
 * a half-written file is never left behind.
 *
 * Codex legacy ~/.codex/prompts are intentionally NOT discovered or shown.
 */

import type { Dirent } from 'fs';
import { existsSync } from 'fs';
import { readdir, readFile, rm, unlink } from 'fs/promises';
import * as path from 'path';

import {
  assertWithinRoot,
  atomicWriteFile,
  isSafeResourceName,
  type ProjectResourceWriteError,
  toWriteErrorCode,
} from './ProjectResourceSecureWrite';

/** A discovered Codex skill (a SKILL.md file under .agents/skills/<name>/). */
export interface CodexSkillInfo {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  skillMdPath: string;
  /** Relative path from the scan root to the skill folder. */
  relativePath: string;
  /** Whether this resource is editable (project) or read-only (global). */
  readonly: boolean;
  /** 'project' | 'global'. */
  scope: 'project' | 'global';
}

/** A discovered Codex agent (a *.toml file under .codex/agents/). */
export interface CodexAgentInfo {
  name: string;
  description: string;
  /** Absolute path to the .toml file. */
  agentTomlPath: string;
  /** Relative path from the scan root to the agent file. */
  relativePath: string;
  readonly: boolean;
  scope: 'project' | 'global';
}

const SKILL_MD_FILENAME = 'SKILL.md';
const CODEX_AGENTS_SKILLS_DIR = path.join('.agents', 'skills');
const CODEX_AGENTS_DIR = path.join('.codex', 'agents');
const CODE_FENCE_MARKER = String.fromCharCode(96, 96, 96);

/** Result of a write operation with an actionable error reason. */
export type CodexResourceWriteResult =
  | { ok: true; path: string }
  | { ok: false; reason: CodexResourceWriteError; path?: string };

/**
 * Alias of the shared {@link ProjectResourceWriteError} so Codex reuses the
 * single secure-write chokepoint's error vocabulary (including `not-found`).
 */
export type CodexResourceWriteError = ProjectResourceWriteError;

// ---------------------------------------------------------------------------
// Description extraction (shared with the Claude discovery strategy)
// ---------------------------------------------------------------------------

function extractDescription(content: string): string {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterEnded = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
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
    const headingMatch = /^#{1,3}\s+(.+)$/.exec(line);
    if (headingMatch) {
      return headingMatch[1].trim();
    }
    if (line.startsWith(CODE_FENCE_MARKER) || line.startsWith('>') || line.startsWith('|') || line.startsWith('[')) {
      continue;
    }
    return line.length > 200 ? line.slice(0, 197) + '...' : line;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Name + path safety — name validation delegates to the shared chokepoint in
// ProjectResourceSecureWrite. assertWithinRoot + atomicWriteFile are also
// imported from there so Codex has NO parallel weak implementation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skill discovery + CRUD
// ---------------------------------------------------------------------------

async function scanSkillDir(
  scanRoot: string,
  skillsDir: string,
  scope: 'project' | 'global',
): Promise<CodexSkillInfo[]> {
  const absoluteSkillsDir = path.join(scanRoot, skillsDir);
  let entries: Dirent[];
  try {
    entries = await readdir(absoluteSkillsDir, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return [];
  }

  const results: CodexSkillInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const name = entry.name.trim();
    if (!name || name.startsWith('.')) {
      continue;
    }
    const skillMdPath = path.join(absoluteSkillsDir, name, SKILL_MD_FILENAME);
    let content: string;
    try {
      content = await readFile(skillMdPath, 'utf-8');
    } catch {
      continue;
    }
    results.push({
      name,
      description: extractDescription(content),
      skillMdPath,
      relativePath: path.join(skillsDir, name),
      readonly: scope === 'global',
      scope,
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverCodexProjectSkills(vaultPath: string | null | undefined): Promise<CodexSkillInfo[]> {
  if (!vaultPath || !vaultPath.trim()) {
    return [];
  }
  return scanSkillDir(vaultPath, CODEX_AGENTS_SKILLS_DIR, 'project');
}

export async function discoverCodexGlobalSkills(homePath: string | null | undefined): Promise<CodexSkillInfo[]> {
  if (!homePath || !homePath.trim()) {
    return [];
  }
  return scanSkillDir(homePath, CODEX_AGENTS_SKILLS_DIR, 'global');
}

export async function readCodexSkillContent(skillMdPath: string): Promise<string | null> {
  try {
    return await readFile(skillMdPath, 'utf-8');
  } catch {
    return null;
  }
}

export function defaultCodexSkillContent(name: string): string {
  return `---\nname: ${name}\ndescription: Describe when this Codex skill should be used.\n---\n\n# ${name}\n\nDescribe the workflow, constraints, and examples for this Codex skill.\n`;
}

/** Validate SKILL.md frontmatter: must contain a YAML frontmatter block with name + description. */
export function validateCodexSkillContent(content: string): string | null {
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

export async function createCodexProjectSkill(
  vaultPath: string,
  name: string,
  content?: string,
): Promise<CodexResourceWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  if (!isSafeResourceName(name)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const body = content ?? defaultCodexSkillContent(name.trim());
  const validationError = validateCodexSkillContent(body);
  if (validationError) {
    return { ok: false, reason: 'invalid-name' };
  }
  const skillDir = path.join(vaultPath, CODEX_AGENTS_SKILLS_DIR, name.trim());
  const skillMdPath = path.join(skillDir, SKILL_MD_FILENAME);
  try {
    await assertWithinRoot(vaultPath, skillMdPath);
    if (existsSync(skillMdPath)) {
      return { ok: false, reason: 'duplicate', path: skillMdPath };
    }
    await atomicWriteFile(skillMdPath, body);
    return { ok: true, path: skillMdPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function updateCodexProjectSkill(
  vaultPath: string,
  name: string,
  content: string,
): Promise<CodexResourceWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  if (!isSafeResourceName(name)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const validationError = validateCodexSkillContent(content);
  if (validationError) {
    return { ok: false, reason: 'invalid-name' };
  }
  const skillMdPath = path.join(vaultPath, CODEX_AGENTS_SKILLS_DIR, name.trim(), SKILL_MD_FILENAME);
  try {
    await assertWithinRoot(vaultPath, skillMdPath);
    if (!existsSync(skillMdPath)) {
      return { ok: false, reason: 'path-traversal' };
    }
    await atomicWriteFile(skillMdPath, content);
    return { ok: true, path: skillMdPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function deleteCodexProjectSkill(
  vaultPath: string,
  name: string,
): Promise<CodexResourceWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  if (!isSafeResourceName(name)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const skillDir = path.join(vaultPath, CODEX_AGENTS_SKILLS_DIR, name.trim());
  try {
    await assertWithinRoot(vaultPath, skillDir);
    if (!existsSync(skillDir)) {
      return { ok: false, reason: 'path-traversal' };
    }
    await rm(skillDir, { recursive: true, force: true });
    return { ok: true, path: skillDir };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

// ---------------------------------------------------------------------------
// Agent (TOML) discovery + CRUD
// ---------------------------------------------------------------------------

async function scanAgentDir(
  scanRoot: string,
  agentsDir: string,
  scope: 'project' | 'global',
): Promise<CodexAgentInfo[]> {
  const absoluteAgentsDir = path.join(scanRoot, agentsDir);
  let entries: Dirent[];
  try {
    entries = await readdir(absoluteAgentsDir, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return [];
  }

  const results: CodexAgentInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) {
      continue;
    }
    const baseName = entry.name.slice(0, -'.toml'.length).trim();
    if (!baseName || baseName.startsWith('.')) {
      continue;
    }
    const agentTomlPath = path.join(absoluteAgentsDir, entry.name);
    let content: string;
    try {
      content = await readFile(agentTomlPath, 'utf-8');
    } catch {
      continue;
    }
    results.push({
      name: baseName,
      description: extractCodexAgentDescription(content),
      agentTomlPath,
      relativePath: path.join(agentsDir, entry.name),
      readonly: scope === 'global',
      scope,
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function extractCodexAgentDescription(tomlContent: string): string {
  // Lightweight field extraction without a full TOML parser dependency.
  const descMatch = /^description\s*=\s*"(.*)"\s*$/m.exec(tomlContent);
  if (descMatch?.[1]) {
    return descMatch[1];
  }
  const nameMatch = /^name\s*=\s*"(.*)"\s*$/m.exec(tomlContent);
  return nameMatch?.[1] ?? '';
}

export async function discoverCodexProjectAgents(vaultPath: string | null | undefined): Promise<CodexAgentInfo[]> {
  if (!vaultPath || !vaultPath.trim()) {
    return [];
  }
  return scanAgentDir(vaultPath, CODEX_AGENTS_DIR, 'project');
}

export async function discoverCodexGlobalAgents(homePath: string | null | undefined): Promise<CodexAgentInfo[]> {
  if (!homePath || !homePath.trim()) {
    return [];
  }
  return scanAgentDir(homePath, CODEX_AGENTS_DIR, 'global');
}

export async function readCodexAgentContent(agentTomlPath: string): Promise<string | null> {
  try {
    return await readFile(agentTomlPath, 'utf-8');
  } catch {
    return null;
  }
}

export function defaultCodexAgentContent(name: string): string {
  return `# Codex project agent. Edit the fields below.\n# This takes effect for future spawned sessions only; the current app-server\n# cannot select or dispatch a chosen agent.\nname = "${name}"\ndescription = "Describe what this Codex agent does."\n`;
}

/**
 * Validate a Codex agent TOML body without a full parser: require a non-empty
 * `name` and `description` key. Returns an error message or null when valid.
 */
export function validateCodexAgentContent(content: string): string | null {
  if (!/^name\s*=\s*"\S.*"/m.test(content) && !/^name\s*=\s*'''[\s\S]*'''/m.test(content)) {
    return 'Agent TOML is missing a non-empty "name" field.';
  }
  if (!/^description\s*=\s*"\S.*"/m.test(content) && !/^description\s*=\s*'''[\s\S]*'''/m.test(content)) {
    return 'Agent TOML is missing a non-empty "description" field.';
  }
  return null;
}

export async function createCodexProjectAgent(
  vaultPath: string,
  name: string,
  content?: string,
): Promise<CodexResourceWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  if (!isSafeResourceName(name)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const body = content ?? defaultCodexAgentContent(name.trim());
  const validationError = validateCodexAgentContent(body);
  if (validationError) {
    return { ok: false, reason: 'invalid-name' };
  }
  const agentTomlPath = path.join(vaultPath, CODEX_AGENTS_DIR, `${name.trim()}.toml`);
  try {
    await assertWithinRoot(vaultPath, agentTomlPath);
    if (existsSync(agentTomlPath)) {
      return { ok: false, reason: 'duplicate', path: agentTomlPath };
    }
    await atomicWriteFile(agentTomlPath, body);
    return { ok: true, path: agentTomlPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function updateCodexProjectAgent(
  vaultPath: string,
  name: string,
  content: string,
): Promise<CodexResourceWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  if (!isSafeResourceName(name)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const validationError = validateCodexAgentContent(content);
  if (validationError) {
    return { ok: false, reason: 'invalid-name' };
  }
  const agentTomlPath = path.join(vaultPath, CODEX_AGENTS_DIR, `${name.trim()}.toml`);
  try {
    await assertWithinRoot(vaultPath, agentTomlPath);
    if (!existsSync(agentTomlPath)) {
      return { ok: false, reason: 'path-traversal' };
    }
    await atomicWriteFile(agentTomlPath, content);
    return { ok: true, path: agentTomlPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function deleteCodexProjectAgent(
  vaultPath: string,
  name: string,
): Promise<CodexResourceWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  if (!isSafeResourceName(name)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const agentTomlPath = path.join(vaultPath, CODEX_AGENTS_DIR, `${name.trim()}.toml`);
  try {
    await assertWithinRoot(vaultPath, agentTomlPath);
    if (!existsSync(agentTomlPath)) {
      return { ok: false, reason: 'path-traversal' };
    }
    await unlink(agentTomlPath);
    return { ok: true, path: agentTomlPath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}
