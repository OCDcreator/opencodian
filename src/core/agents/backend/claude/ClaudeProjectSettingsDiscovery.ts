/**
 * Discovers Claude project settings from .claude/settings*.json files.
 *
 * This is a standalone filesystem helper. It reads Claude Code project
 * settings from the local vault directory and returns structured info for
 * settings surfaces without depending on the SDK or runtime queries.
 */

import { readFile } from 'fs/promises';
import * as path from 'path';

/** Parsed hook command from a Claude settings file. */
export interface ClaudeHookEntry {
  type: string;
  command: string;
  timeout?: number;
  /** Any additional fields from the hook entry. */
  [key: string]: unknown;
}

/**
 * Official nested hook group: an event array entry containing an optional
 * matcher and a nested `hooks` array of individual hook commands.
 *
 * The official Claude Code settings shape is:
 * ```json
 * { "hooks": { "SessionStart": [{ "matcher": "", "hooks": [{ "type": "command", "command": "..." }] }] } }
 * ```
 */
export interface ClaudeHookGroup {
  /** Optional pattern matcher for this hook group. */
  matcher?: string;
  /** The actual hook commands in this group. */
  hooks: ClaudeHookEntry[];
  /** Any additional fields from the group entry. */
  [key: string]: unknown;
}

/** Hooks grouped by event name. Each event maps to an array of hook groups. */
export type ClaudeHooksConfig = Record<string, ClaudeHookGroup[]>;

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
  /** List of extra known marketplace URLs from the file. */
  extraKnownMarketplaces: string[];
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
    extraKnownMarketplaces: [],
    hookCount: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value looks like a direct flat hook entry ({ type, command }).
 * Used as a lenient fallback for non-standard flat shapes.
 */
function isFlatHookEntry(value: unknown): value is ClaudeHookEntry {
  return isRecord(value) && typeof value.type === 'string' && typeof value.command === 'string';
}

/**
 * Check if a value looks like an official nested hook group ({ hooks: [...] }).
 */
function isNestedHookGroup(value: unknown): value is { matcher?: string; hooks: unknown[]; [key: string]: unknown } {
  return isRecord(value) && Array.isArray(value.hooks);
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

    const groups: ClaudeHookGroup[] = [];

    for (const entry of entries) {
      if (isNestedHookGroup(entry)) {
        // Official nested shape: { matcher?, hooks: [{ type, command, ... }] }
        const nestedHooks = entry.hooks.filter(isFlatHookEntry);
        if (nestedHooks.length > 0) {
          groups.push({
            matcher: typeof entry.matcher === 'string' ? entry.matcher : undefined,
            hooks: nestedHooks,
          });
        }
      } else if (isFlatHookEntry(entry)) {
        // Lenient fallback: flat direct entry promoted to a single-command group
        groups.push({ hooks: [entry] });
      }
    }

    if (groups.length > 0) {
      hooks[eventName] = groups;
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
  return Object.values(hooks).reduce(
    (total, groups) => total + groups.reduce((groupTotal, group) => groupTotal + group.hooks.length, 0),
    0,
  );
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
    info.extraKnownMarketplaces = parseEnabledPlugins(parsed.extraKnownMarketplaces);
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
