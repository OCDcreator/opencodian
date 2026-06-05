/**
 * Discovers Claude project commands from the .claude/commands/ directory.
 *
 * This is a standalone filesystem-based scanner. It reads command metadata
 * from markdown files in the local vault directory and returns structured info
 * for display in settings surfaces.
 *
 * Does NOT depend on the SDK or any runtime query — pure filesystem scan.
 */

import { mkdir,readdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';

/** Metadata for a single discovered Claude command (a .md file in .claude/commands/). */
export interface ClaudeProjectCommandInfo {
  /** Command name derived from filename without .md extension (e.g. "my-command"). */
  name: string;
  /** First paragraph or heading content extracted from the .md file, or empty string. */
  description: string;
  /** Absolute path to the command .md file. */
  filePath: string;
  /** Relative path from vault root (e.g. .claude/commands/my-command.md). */
  relativePath: string;
}

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
  if (!vaultPath || !vaultPath.trim()) {
    return [];
  }

  const commandsDir = path.join(vaultPath, CLAUDE_COMMANDS_DIR);

  let entries: string[];
  try {
    entries = await readdir(commandsDir);
  } catch {
    // Directory doesn't exist or isn't readable — no commands.
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

    const filePath = path.join(commandsDir, entryName);

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
      relativePath: path.join(CLAUDE_COMMANDS_DIR, entryName),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a new Claude project command file at .claude/commands/<name>.md.
 * Creates the directory if it doesn't exist.
 * Returns the absolute path of the created file, or null on failure.
 */
export async function createClaudeProjectCommand(
  vaultPath: string | null | undefined,
  commandName: string,
  content?: string,
): Promise<string | null> {
  if (!vaultPath || !vaultPath.trim()) {
    return null;
  }

  const trimmed = commandName.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) {
    return null;
  }

  const fileName = `${trimmed}.md`;
  const commandsDir = path.join(vaultPath, CLAUDE_COMMANDS_DIR);
  const filePath = path.join(commandsDir, fileName);

  try {
    await mkdir(commandsDir, { recursive: true });
    const defaultContent = content ?? `# ${trimmed}\n\nDescription of the ${trimmed} command.\n`;
    await writeFile(filePath, defaultContent, 'utf-8');
    return filePath;
  } catch {
    return null;
  }
}
