import * as fs from 'fs';
import * as path from 'path';

import type { MdCommandEntry } from '../../../core/config/slashCommandCatalog';
import { createLogger } from '../../../shared';

const logger = createLogger('CommandMdFileLoader');

export interface CommandMdFile extends MdCommandEntry {
  filePath: string;
}

/**
 * Load command definitions from .opencode/commands/*.md files.
 * Format matches the TUI's custom_commands.go:
 *   - Optional YAML frontmatter (--- delimited) with 'description' field
 *   - Body after frontmatter becomes the command template
 *   - Supports $VARIABLE placeholder syntax for arguments
 *   - Filename (without .md) becomes the command ID
 *   - Subdirectories become colon-separated prefixes (e.g., foo/bar.md -> foo:bar)
 */
export function loadCommandsFromMdFiles(commandsDir: string): CommandMdFile[] {
  if (!commandsDir || !fs.existsSync(commandsDir)) {
    return [];
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(commandsDir);
  } catch (error) {
    logger.warn('Failed to inspect command markdown directory:', error);
    return [];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const commands: CommandMdFile[] = [];
  for (const filePath of collectMarkdownFiles(commandsDir)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(content);
      const relativePath = path.relative(commandsDir, filePath);
      const id = relativePath
        .replace(/\.md$/i, '')
        .split(path.sep)
        .join(':');

      if (!id) {
        continue;
      }

      commands.push({
        id,
        template: body,
        description: frontmatter.description ?? '',
        filePath,
      });
    } catch (error) {
      logger.warn(`Failed to load command markdown file ${filePath}:`, error);
    }
  }

  return commands.sort((left, right) => left.id.localeCompare(right.id));
}

export function loadCommandsFromConfigDir(configDir: string | null | undefined): CommandMdFile[] {
  return configDir ? loadCommandsFromMdFiles(path.join(configDir, 'commands')) : [];
}

function collectMarkdownFiles(directory: string): string[] {
  const files: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    logger.warn(`Failed to read command markdown directory ${directory}:`, error);
    return files;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const fieldMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!fieldMatch) {
      continue;
    }

    const value = fieldMatch[2].trim().replace(/^['"]|['"]$/g, '');
    frontmatter[fieldMatch[1]] = value;
  }

  return { frontmatter, body: match[2] };
}
