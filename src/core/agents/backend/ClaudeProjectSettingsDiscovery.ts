/**
 * Discovers Claude project settings from .claude/settings*.json files.
 *
 * This is a standalone filesystem helper. It reads Claude Code project
 * settings from the local vault directory and returns structured info for
 * settings surfaces without depending on the SDK or runtime queries.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';

/** Parsed hook entry from a Claude settings file. */
export interface ClaudeHookEntry {
  type: string;
  command: string;
  timeout?: number;
  /** Any additional fields from the hook entry. */
  [key: string]: unknown;
}

/** Hooks grouped by event name. */
export type ClaudeHooksConfig = Record<string, ClaudeHookEntry[]>;

/** Summary of a single Claude project settings file. */
export interface ClaudeProjectSettingsInfo {
  /** Relative path from vault root (e.g. ".claude/settings.json"). */
  relativePath: string;
  /** Absolute path to the file. */
  filePath: string;
  /** Whether the file exists on disk. */
  exists: boolean;
  /** Parsed hooks config, or empty object if absent/unparseable. */
  hooks: ClaudeHooksConfig;
  /** List of enabled plugins from the file. */
  enabledPlugins: string[];
  /** Total number of hook entries across all events. */
  hookCount: number;
  /** Parse error message if the file exists but couldn't be parsed. */
  parseError?: string;
}

const CLAUDE_SETTINGS_DIR = '.claude';
const CLAUDE_SETTINGS_FILE_NAMES = ['settings.json', 'settings.local.json'] as const;

type ClaudeProjectSettingsFileName = (typeof CLAUDE_SETTINGS_FILE_NAMES)[number];

function emptySettingsInfo(vaultPath: string | null | undefined, fileName: ClaudeProjectSettingsFileName): ClaudeProjectSettingsInfo {
  const relativePath = path.join(CLAUDE_SETTINGS_DIR, fileName);
  const trimmedVaultPath = vaultPath?.trim();

  return {
    relativePath,
    filePath: trimmedVaultPath ? path.join(trimmedVaultPath, relativePath) : '',
    exists: false,
    hooks: {},
    enabledPlugins: [],
    hookCount: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHooks(value: unknown): ClaudeHooksConfig {
  if (!isRecord(value)) {
    return {};
  }

  const hooks: ClaudeHooksConfig = {};

  for (const [eventName, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    const parsedEntries = entries.filter(
      (entry): entry is ClaudeHookEntry => isRecord(entry) && typeof entry.type === 'string' && typeof entry.command === 'string',
    );
    if (parsedEntries.length > 0) {
      hooks[eventName] = parsedEntries;
    }
  }

  return hooks;
}

function parseEnabledPlugins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((plugin): plugin is string => typeof plugin === 'string');
}

function countHooks(hooks: ClaudeHooksConfig): number {
  return Object.values(hooks).reduce((total, entries) => total + entries.length, 0);
}

async function readSettingsFile(vaultPath: string | null | undefined, fileName: ClaudeProjectSettingsFileName): Promise<ClaudeProjectSettingsInfo> {
  const info = emptySettingsInfo(vaultPath, fileName);
  if (!vaultPath || !vaultPath.trim()) {
    return info;
  }

  let content: string;
  try {
    content = await readFile(info.filePath, 'utf-8');
  } catch {
    return info;
  }

  info.exists = true;

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return info;
    }

    info.hooks = parseHooks(parsed.hooks);
    info.enabledPlugins = parseEnabledPlugins(parsed.enabledPlugins);
    info.hookCount = countHooks(info.hooks);
  } catch (error) {
    info.parseError = error instanceof Error ? error.message : String(error);
  }

  return info;
}

/**
 * Discover Claude project settings files under the given vault root.
 * Always returns one info entry for each supported settings file.
 */
export async function discoverClaudeProjectSettings(
  vaultPath: string | null | undefined,
): Promise<ClaudeProjectSettingsInfo[]> {
  try {
    return Promise.all(CLAUDE_SETTINGS_FILE_NAMES.map((fileName) => readSettingsFile(vaultPath, fileName)));
  } catch {
    return CLAUDE_SETTINGS_FILE_NAMES.map((fileName) => emptySettingsInfo(vaultPath, fileName));
  }
}

/**
 * Create a Claude project settings file with empty valid JSON content.
 * Returns the absolute path of the created file, or null on failure/existing file.
 */
export async function createClaudeProjectSettingsFile(
  vaultPath: string | null | undefined,
  fileName: ClaudeProjectSettingsFileName,
): Promise<string | null> {
  if (!vaultPath || !vaultPath.trim()) {
    return null;
  }

  const settingsDir = path.join(vaultPath, CLAUDE_SETTINGS_DIR);
  const filePath = path.join(settingsDir, fileName);

  try {
    await mkdir(settingsDir, { recursive: true });
    await writeFile(filePath, '{}', { encoding: 'utf-8', flag: 'wx' });
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Return the absolute path to a Claude project settings file for editor opening.
 */
export async function openClaudeProjectSettingsFile(
  vaultPath: string | null | undefined,
  fileName: ClaudeProjectSettingsFileName,
): Promise<string | null> {
  if (!vaultPath || !vaultPath.trim()) {
    return null;
  }

  return path.join(vaultPath, CLAUDE_SETTINGS_DIR, fileName);
}
