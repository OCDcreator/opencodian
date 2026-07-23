/**
 * Discovers Claude project agents from the .claude/agents/ directory.
 *
 * This is a standalone filesystem-based scanner. It reads agent metadata
 * from markdown files in the local vault directory and returns structured info
 * for display in settings surfaces.
 *
 * Does NOT depend on the SDK or any runtime query — pure filesystem scan.
 */

import { existsSync } from 'fs';
import { readdir, readFile, unlink } from 'fs/promises';
import * as path from 'path';

import {
  assertWithinRoot,
  atomicWriteFile,
  isSafeResourceName,
  type ProjectResourceWriteError,
  toWriteErrorCode,
} from './ProjectResourceSecureWrite';

/** Metadata for a single discovered Claude agent (a .md file in .claude/agents/). */
export interface ClaudeProjectAgentInfo {
  /** Agent name derived from filename without .md extension (e.g. "code-reviewer"). */
  name: string;
  /** Description from YAML frontmatter or first heading/paragraph. */
  description: string;
  /** Absolute path to the agent .md file. */
  filePath: string;
  /** Relative path from scan root (e.g. .claude/agents/code-reviewer.md). */
  relativePath: string;
  /** Whether this resource is editable (project) or read-only (global). */
  readonly: boolean;
  /** 'project' | 'global'. */
  scope: 'project' | 'global';
}

export type ClaudeAgentWriteResult =
  | { ok: true; path: string }
  | { ok: false; reason: ProjectResourceWriteError; path?: string };

const CLAUDE_AGENTS_DIR = path.join('.claude', 'agents');

const CODE_FENCE_MARKER = String.fromCharCode(96, 96, 96);

/**
 * Extract a short description from agent .md content.
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
 * Discover all Claude project agents under the given vault root.
 * Scans the .claude/agents/ directory for .md files.
 *
 * Returns an empty array if the vault path is null/empty or the
 * agents directory does not exist. Never throws — errors are silently
 * caught and result in an empty list.
 */
export async function discoverClaudeProjectAgents(
  vaultPath: string | null | undefined,
): Promise<ClaudeProjectAgentInfo[]> {
  return scanAgents(vaultPath, CLAUDE_AGENTS_DIR, 'project');
}

/** Discover global (~/.claude/agents) agents — read-only. */
export async function discoverClaudeGlobalAgents(
  homePath: string | null | undefined,
): Promise<ClaudeProjectAgentInfo[]> {
  return scanAgents(homePath, CLAUDE_AGENTS_DIR, 'global');
}

async function scanAgents(
  scanRoot: string | null | undefined,
  agentsDir: string,
  scope: 'project' | 'global',
): Promise<ClaudeProjectAgentInfo[]> {
  if (!scanRoot || !scanRoot.trim()) {
    return [];
  }
  const absoluteDir = path.join(scanRoot, agentsDir);
  let entries: string[];
  try {
    entries = await readdir(absoluteDir);
  } catch {
    return [];
  }
  const results: ClaudeProjectAgentInfo[] = [];
  for (const entryName of entries) {
    if (!entryName.endsWith('.md')) {
      continue;
    }
    const agentName = entryName.slice(0, -3).trim();
    if (!agentName || agentName.startsWith('.')) {
      continue;
    }
    const filePath = path.join(absoluteDir, entryName);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }
    results.push({
      name: agentName,
      description: extractDescription(content),
      filePath,
      relativePath: path.join(agentsDir, entryName),
      readonly: scope === 'global',
      scope,
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readClaudeAgentContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function defaultClaudeAgentContent(name: string): string {
  return `---\nname: ${name}\ndescription: Describe what this agent does.\n---\n\n# ${name}\n\nSystem prompt / instructions for this agent.\n`;
}

/** Validate agent markdown: require non-empty body. */
export function validateClaudeAgentContent(content: string): string | null {
  if (!content.trim()) {
    return 'Agent body is empty.';
  }
  return null;
}

function agentFilePath(vaultPath: string, name: string): string {
  return path.join(vaultPath, CLAUDE_AGENTS_DIR, `${name}.md`);
}

/**
 * Agent names are stricter than generic resource names: dots are rejected
 * because `<name>.md` files with internal dots (e.g. "agent.name") cause
 * Claude runtime API issues. Mirrors the original validation.
 */
function isSafeAgentName(name: string): boolean {
  return isSafeResourceName(name) && !name.includes('.');
}

/**
 * Create a new Claude project agent file at .claude/agents/<name>.md.
 * Validates name + path safety and writes atomically. Returns the absolute
 * path, or null on failure (backward compatible with existing callers).
 */
export async function createClaudeProjectAgent(
  vaultPath: string | null | undefined,
  agentName: string,
  content?: string,
): Promise<string | null> {
  const result = await createClaudeProjectAgentTyped(vaultPath, agentName, content);
  return result.ok ? result.path : null;
}

async function createClaudeProjectAgentTyped(
  vaultPath: string | null | undefined,
  agentName: string,
  content?: string,
): Promise<ClaudeAgentWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = agentName.trim();
  if (!isSafeAgentName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const body = content ?? defaultClaudeAgentContent(trimmed);
  const filePath = agentFilePath(vaultPath, trimmed);
  try {
    await assertWithinRoot(vaultPath, filePath);
    if (existsSync(filePath)) {
      return { ok: false, reason: 'duplicate', path: filePath };
    }
    await atomicWriteFile(filePath, body);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function updateClaudeProjectAgent(
  vaultPath: string | null | undefined,
  agentName: string,
  content: string,
): Promise<ClaudeAgentWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = agentName.trim();
  if (!isSafeAgentName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  if (validateClaudeAgentContent(content)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const filePath = agentFilePath(vaultPath, trimmed);
  try {
    await assertWithinRoot(vaultPath, filePath);
    if (!existsSync(filePath)) {
      return { ok: false, reason: 'not-found' };
    }
    await atomicWriteFile(filePath, content);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}

export async function deleteClaudeProjectAgent(
  vaultPath: string | null | undefined,
  agentName: string,
): Promise<ClaudeAgentWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = agentName.trim();
  if (!isSafeAgentName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const filePath = agentFilePath(vaultPath, trimmed);
  try {
    await assertWithinRoot(vaultPath, filePath);
    if (!existsSync(filePath)) {
      return { ok: false, reason: 'not-found' };
    }
    await unlink(filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, reason: toWriteErrorCode(err) };
  }
}
