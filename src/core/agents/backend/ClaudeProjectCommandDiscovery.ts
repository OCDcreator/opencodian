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
  type FileRevision,
  isSafeResourceName,
  type ProjectResourceWriteError,
  toWriteErrorCode,
} from './ProjectResourceSecureWrite';
import {
  createNamedScopedConfigurationResourceFacade,
  type CreateNamedScopedConfigurationResourceOptions,
  type DeleteNamedScopedConfigurationResourceOptions,
  type NamedScopedConfigurationResourceContext,
  type ReadNamedScopedConfigurationResourceOptions,
  type RestoreNamedScopedConfigurationResourceOptions,
  type ScopedConfigurationResourceContext,
  type ScopedConfigurationResourceMutationResult,
  type ScopedConfigurationResourceReadResult,
  type ScopedConfigurationResourceScope,
  type UpdateNamedScopedConfigurationResourceOptions,
} from './ScopedConfigurationResourceService';

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

export type ClaudeCommandResourceScope = ScopedConfigurationResourceScope;

export type ClaudeCommandResourceContext = ScopedConfigurationResourceContext;

export interface ClaudeCommandResourceInfo extends ClaudeProjectCommandInfo {
  readonly readonly: false;
  readonly revision: FileRevision;
}

interface SecureDiscoveredClaudeCommand extends ClaudeProjectCommandInfo {
  readonly revision: FileRevision;
}

export type CreateClaudeCommandResourceOptions = CreateNamedScopedConfigurationResourceOptions;
export type ReadClaudeCommandResourceOptions = ReadNamedScopedConfigurationResourceOptions;
export type UpdateClaudeCommandResourceOptions = UpdateNamedScopedConfigurationResourceOptions;
export type DeleteClaudeCommandResourceOptions = DeleteNamedScopedConfigurationResourceOptions;
export type ClaudeCommandResourceHistoryOptions = NamedScopedConfigurationResourceContext;
export type CatalogClaudeCommandResourceHistoryOptions = ScopedConfigurationResourceContext;
export type RestoreClaudeCommandResourceHistoryEntryOptions = RestoreNamedScopedConfigurationResourceOptions;

export type ClaudeCommandResourceMutationResult = ScopedConfigurationResourceMutationResult;
export type ClaudeCommandResourceReadResult = ScopedConfigurationResourceReadResult;

const CLAUDE_COMMAND_RESOURCE = createNamedScopedConfigurationResourceFacade({
  backend: 'claude',
  kind: 'command',
  format: 'markdown',
  relativeRootPath: CLAUDE_COMMANDS_DIR,
  targetRelativePath: (name) => `${name}.md`,
  isSafeName: isSafeResourceName,
  defaultContent: defaultClaudeCommandContent,
  validateContent: validateClaudeCommandContent,
});

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
  const commands = await scanCommands(vaultPath, CLAUDE_COMMANDS_DIR, 'project');
  return commands.map(toLegacyCommandInfo);
}

/** Discover global (~/.claude/commands) commands — read-only. */
export async function discoverClaudeGlobalCommands(
  homePath: string | null | undefined,
): Promise<ClaudeProjectCommandInfo[]> {
  const commands = await scanCommands(homePath, CLAUDE_COMMANDS_DIR, 'global');
  return commands.map(toLegacyCommandInfo);
}

function toLegacyCommandInfo(command: SecureDiscoveredClaudeCommand): ClaudeProjectCommandInfo {
  return {
    name: command.name,
    description: command.description,
    filePath: command.filePath,
    relativePath: command.relativePath,
    readonly: command.readonly,
    scope: command.scope,
  };
}

async function scanCommands(
  scanRoot: string | null | undefined,
  commandsDir: string,
  scope: 'project' | 'global',
): Promise<SecureDiscoveredClaudeCommand[]> {
  if (!scanRoot || !scanRoot.trim()) {
    return [];
  }
  const absoluteDir = path.join(scanRoot, commandsDir);
  let entries: string[];
  try {
    await assertWithinRoot(scanRoot, absoluteDir);
    entries = await readdir(absoluteDir);
  } catch {
    return [];
  }
  const context = { basePath: scanRoot, scope };
  const results: SecureDiscoveredClaudeCommand[] = [];
  for (const entryName of entries) {
    if (!entryName.endsWith('.md')) {
      continue;
    }
    const commandName = entryName.slice(0, -3).trim();
    if (!commandName || commandName.startsWith('.')) {
      continue;
    }
    const filePath = path.join(absoluteDir, entryName);
    const revision = await CLAUDE_COMMAND_RESOURCE.readRevision(context, commandName);
    if (revision === null) continue;
    const readResult = await CLAUDE_COMMAND_RESOURCE.read({
      ...context,
      name: commandName,
      expectedRevision: revision,
    });
    if (readResult.status !== 'success') continue;
    results.push({
      name: commandName,
      description: extractDescription(readResult.content),
      filePath,
      relativePath: path.join(commandsDir, entryName),
      readonly: scope === 'global',
      scope,
      revision: readResult.revision,
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

/**
 * Discover editable Claude commands for one explicitly selected configuration
 * scope. Unlike the legacy project/global scanners, this P1 seam includes the
 * optimistic revision required by update/delete/restore operations.
 */
export async function discoverClaudeCommandResources(
  context: ClaudeCommandResourceContext,
): Promise<ClaudeCommandResourceInfo[]> {
  if (!context.basePath?.trim()) return [];
  const discovered = await scanCommands(context.basePath, CLAUDE_COMMANDS_DIR, context.scope);
  return discovered.map((command) => ({ ...command, readonly: false as const }));
}

export const createClaudeCommandResource = CLAUDE_COMMAND_RESOURCE.create;
export const readClaudeCommandResourceContent = CLAUDE_COMMAND_RESOURCE.read;
export const updateClaudeCommandResource = CLAUDE_COMMAND_RESOURCE.update;
export const deleteClaudeCommandResource = CLAUDE_COMMAND_RESOURCE.delete;
export const listClaudeCommandResourceHistory = CLAUDE_COMMAND_RESOURCE.listHistory;
export const catalogClaudeCommandResourceHistory = CLAUDE_COMMAND_RESOURCE.catalogHistory;
export const restoreClaudeCommandResourceHistoryEntry = CLAUDE_COMMAND_RESOURCE.restore;
