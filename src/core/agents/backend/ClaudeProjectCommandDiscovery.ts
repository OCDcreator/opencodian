/**
 * Discovers Claude project commands from the .claude/commands/ directory.
 *
 * This is a standalone filesystem-based scanner. It reads command metadata
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

/** Metadata for a single discovered Claude command (a .md file in .claude/commands/). */
export interface ClaudeProjectCommandInfo {
  /** Command name derived from filename without .md extension (e.g. "my-command"). */
  name: string;
  /** First paragraph or heading content extracted from the .md file, or empty string. */
  description: string;
  /** Absolute path to the command .md file. */
  filePath: string;
  /** Relative path from scan root (e.g. .claude/commands/my-command.md). */
  relativePath: string;
  /** Whether this resource is editable (project) or read-only (global). */
  readonly: boolean;
  /** 'project' | 'global'. */
  scope: 'project' | 'global';
}

export type ClaudeCommandWriteResult =
  | { ok: true; path: string }
  | { ok: false; reason: ProjectResourceWriteError; path?: string };

const CLAUDE_COMMANDS_DIR = path.join('.claude', 'commands');

const CODE_FENCE_MARKER = String.fromCharCode(96, 96, 96);

/**
 * Extract a short description from command .md content.
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
 * Discover all Claude project commands under the given vault root.
 * Scans the .claude/commands/ directory for .md files.
 *
 * Returns an empty array if the vault path is null/empty or the
 * commands directory does not exist. Never throws — errors are silently
 * caught and result in an empty list.
 */
export async function discoverClaudeProjectCommands(
  vaultPath: string | null | undefined,
): Promise<ClaudeProjectCommandInfo[]> {
  return scanCommands(vaultPath, CLAUDE_COMMANDS_DIR, 'project');
}

/** Discover global (~/.claude/commands) commands — read-only. */
export async function discoverClaudeGlobalCommands(
  homePath: string | null | undefined,
): Promise<ClaudeProjectCommandInfo[]> {
  return scanCommands(homePath, CLAUDE_COMMANDS_DIR, 'global');
}

async function scanCommands(
  scanRoot: string | null | undefined,
  commandsDir: string,
  scope: 'project' | 'global',
): Promise<ClaudeProjectCommandInfo[]> {
  if (!scanRoot || !scanRoot.trim()) {
    return [];
  }
  const absoluteDir = path.join(scanRoot, commandsDir);
  let entries: string[];
  try {
    entries = await readdir(absoluteDir);
  } catch {
    return [];
  }
  const results: ClaudeProjectCommandInfo[] = [];
  for (const entryName of entries) {
    if (!entryName.endsWith('.md')) {
      continue;
    }
    const commandName = entryName.slice(0, -3).trim();
    if (!commandName || commandName.startsWith('.')) {
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
      name: commandName,
      description: extractDescription(content),
      filePath,
      relativePath: path.join(commandsDir, entryName),
      readonly: scope === 'global',
      scope,
    });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readClaudeCommandContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function defaultClaudeCommandContent(name: string): string {
  return `# ${name}\n\nDescription of the ${name} command.\n`;
}

/** Validate command markdown: require a non-empty body (heading or paragraph). */
export function validateClaudeCommandContent(content: string): string | null {
  if (!content.trim()) {
    return 'Command body is empty.';
  }
  return null;
}

function commandFilePath(vaultPath: string, name: string): string {
  return path.join(vaultPath, CLAUDE_COMMANDS_DIR, `${name}.md`);
}

/**
 * Create a new Claude project command file at .claude/commands/<name>.md.
 * Creates the directory if it doesn't exist. Validates name + path safety and
 * writes atomically. Returns the absolute path, or null on failure (backward
 * compatible with existing callers; typed CRUD uses update/delete below).
 */
export async function createClaudeProjectCommand(
  vaultPath: string | null | undefined,
  commandName: string,
  content?: string,
): Promise<string | null> {
  const result = await createClaudeProjectCommandTyped(vaultPath, commandName, content);
  return result.ok ? result.path : null;
}

async function createClaudeProjectCommandTyped(
  vaultPath: string | null | undefined,
  commandName: string,
  content?: string,
): Promise<ClaudeCommandWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = commandName.trim();
  if (!isSafeResourceName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const body = content ?? defaultClaudeCommandContent(trimmed);
  const filePath = commandFilePath(vaultPath, trimmed);
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

export async function updateClaudeProjectCommand(
  vaultPath: string | null | undefined,
  commandName: string,
  content: string,
): Promise<ClaudeCommandWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = commandName.trim();
  if (!isSafeResourceName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const validationError = validateClaudeCommandContent(content);
  if (validationError) {
    return { ok: false, reason: 'invalid-name' };
  }
  const filePath = commandFilePath(vaultPath, trimmed);
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

export async function deleteClaudeProjectCommand(
  vaultPath: string | null | undefined,
  commandName: string,
): Promise<ClaudeCommandWriteResult> {
  if (!vaultPath || !vaultPath.trim()) {
    return { ok: false, reason: 'empty-vault' };
  }
  const trimmed = commandName.trim();
  if (!isSafeResourceName(trimmed)) {
    return { ok: false, reason: 'invalid-name' };
  }
  const filePath = commandFilePath(vaultPath, trimmed);
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
