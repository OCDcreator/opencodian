/**
 * Discovers Claude project agents from the .claude/agents/ directory.
 *
 * This is a standalone filesystem-based scanner. It reads agent metadata
 * from markdown files in the local vault directory and returns structured info
 * for display in settings surfaces.
 *
 * Does NOT depend on the SDK or any runtime query — pure filesystem scan.
 */

import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';

/** Metadata for a single discovered Claude agent (a .md file in .claude/agents/). */
export interface ClaudeProjectAgentInfo {
  /** Agent name derived from filename without .md extension (e.g. "code-reviewer"). */
  name: string;
  /** Description from YAML frontmatter or first heading/paragraph. */
  description: string;
  /** Absolute path to the agent .md file. */
  filePath: string;
  /** Relative path from vault root (e.g. .claude/agents/code-reviewer.md). */
  relativePath: string;
}

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
  if (!vaultPath || !vaultPath.trim()) {
    return [];
  }

  const agentsDir = path.join(vaultPath, CLAUDE_AGENTS_DIR);

  let entries: string[];
  try {
    entries = await readdir(agentsDir);
  } catch {
    // Directory doesn't exist or isn't readable — no agents.
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

    const filePath = path.join(agentsDir, entryName);

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
      relativePath: path.join(CLAUDE_AGENTS_DIR, entryName),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a new Claude project agent file at .claude/agents/<name>.md.
 * Creates the directory if it doesn't exist.
 * Returns the absolute path of the created file, or null on failure.
 */
export async function createClaudeProjectAgent(
  vaultPath: string | null | undefined,
  agentName: string,
  content?: string,
): Promise<string | null> {
  if (!vaultPath || !vaultPath.trim()) {
    return null;
  }

  const trimmed = agentName.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('.')) {
    return null;
  }

  const fileName = `${trimmed}.md`;
  const agentsDir = path.join(vaultPath, CLAUDE_AGENTS_DIR);
  const filePath = path.join(agentsDir, fileName);

  try {
    await mkdir(agentsDir, { recursive: true });
    const defaultContent = content ?? `---\nname: ${trimmed}\ndescription: Describe what this agent does.\n---\n\n# ${trimmed}\n\nSystem prompt / instructions for this agent.\n`;
    await writeFile(filePath, defaultContent, 'utf-8');
    return filePath;
  } catch {
    return null;
  }
}
