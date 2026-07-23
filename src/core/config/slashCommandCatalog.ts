import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';

import { t, type TranslationKey } from '../../i18n';
import type {
  OpencodeAgentConfig,
  OpencodeAgentConfigRecord,
  OpencodeCommandConfig,
  OpencodeCommandConfigRecord,
} from '../types';
import {
  getCommandScopedAgentId,
  getCommandScopedAgentMetadata,
} from './commandScopedAgent';

export type SlashCommandCatalogSource = 'command' | 'skill' | 'project' | 'md-command' | 'claude-runtime';
export type SlashCommandMenuItemSource = SlashCommandCatalogSource | 'skills-command' | 'codex-skill';

/** Known built-in command IDs that come from OpenCode itself (not user-defined). */
export const BUILTIN_COMMAND_IDS = new Set([
  'compact',
  'undo',
  'redo',
  'new',
  'share',
  'unshare',
  'init',
  'review',
  'help',
]);

export type SlashCommandSkillSourceKind =
  | 'project'
  | 'opencodeProject'
  | 'plugin'
  | 'global'
  | 'opencodeGlobal'
  | 'custom';

export interface SlashCommandSkillSource {
  kind: SlashCommandSkillSourceKind;
  pluginName?: string;
}

interface RuntimeSkillInfo {
  name: string;
  location: string;
}

export interface SlashCommandCatalogEntry {
  id: string;
  template: string;
  description: string;
  agent: string;
  model: string;
  temperature?: number;
  topP?: number;
  hasProjectOverride: boolean;
  hidden: boolean;
  runtimeAvailable: boolean;
  source: SlashCommandCatalogSource;
  skillSource?: SlashCommandSkillSource;
  subtask: boolean;
  isBuiltin: boolean;
}

export interface SlashCommandMenuItem {
  id: string;
  description: string;
  displayId?: string;
  hasProjectOverride: boolean;
  insertText?: string;
  runtimeAvailable: boolean;
  source: SlashCommandMenuItemSource;
  skillSource?: SlashCommandSkillSource;
  subtask: boolean;
  isBuiltin: boolean;
}

export interface MdCommandEntry {
  id: string;
  template: string;
  description: string;
}

/** A single Claude runtime command reported by supportedCommands(). */
export interface ClaudeRuntimeCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  aliases?: string[];
}

export interface MergeSlashCommandCatalogOptions {
  runtimeCommands: RuntimeCommand[];
  runtimeSkillSources: Map<string, SlashCommandSkillSource>;
  projectCommands: OpencodeCommandConfigRecord;
  projectAgents: OpencodeAgentConfigRecord;
  hiddenCommandIds: Set<string>;
  mdFileCommands?: MdCommandEntry[];
  /** Claude runtime commands from supportedCommands(). When provided, these are merged as 'claude-runtime' source entries. */
  claudeRuntimeCommands?: ClaudeRuntimeCommand[];
}

export function isCatalogRuntimeCommand(command: RuntimeCommand): boolean {
  return command.source !== 'mcp';
}

function normalizeRuntimeCommandSource(
  command: RuntimeCommand,
  runtimeSkillSources: Map<string, SlashCommandSkillSource>,
): SlashCommandCatalogSource {
  return command.source === 'skill' || runtimeSkillSources.has(command.name)
    ? 'skill'
    : 'command';
}

function normalizeComparablePath(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return /^[A-Za-z]:/.test(normalized) ? normalized.toLowerCase() : normalized;
}

function isPathWithinRoot(location: string, root: string | null | undefined): boolean {
  const normalizedLocation = normalizeComparablePath(location);
  const normalizedRoot = normalizeComparablePath(root);
  if (!normalizedLocation || !normalizedRoot) {
    return false;
  }

  return normalizedLocation === normalizedRoot || normalizedLocation.startsWith(`${normalizedRoot}/`);
}

function extractPluginSkillName(location: string): string | undefined {
  const patterns = [
    /\/plugins\/cache\/[^/]+\/([^/]+)\/[^/]+\/skills\//i,
    /\/plugins\/marketplaces\/[^/]+\/plugins\/([^/]+)\/skills\//i,
    /\/plugins\/marketplaces\/[^/]+\/external_plugins\/([^/]+)\/skills\//i,
    /\/plugins\/marketplaces\/([^/]+)\/skills\//i,
  ];

  for (const pattern of patterns) {
    const pluginName = pattern.exec(location)?.[1]?.trim();
    if (pluginName) {
      return pluginName;
    }
  }

  return undefined;
}

function inferSkillSource(
  location: string,
  vaultPath: string | null | undefined,
): SlashCommandSkillSource {
  const normalizedLocation = normalizeComparablePath(location);
  const pluginName = extractPluginSkillName(normalizedLocation);
  if (pluginName) {
    return { kind: 'plugin', pluginName };
  }

  const projectScoped = isPathWithinRoot(normalizedLocation, vaultPath);
  if (/\/\.opencode\/(?:skill|skills)\//i.test(normalizedLocation)) {
    return { kind: projectScoped ? 'opencodeProject' : 'opencodeGlobal' };
  }

  if (/\/\.(?:claude|agents)\/skills\//i.test(normalizedLocation)) {
    return { kind: projectScoped ? 'project' : 'global' };
  }

  return { kind: projectScoped ? 'project' : 'custom' };
}

export function buildRuntimeSkillSourceMap(
  runtimeSkills: RuntimeSkillInfo[],
  vaultPath: string | null | undefined,
): Map<string, SlashCommandSkillSource> {
  const skillSourceByName = new Map<string, SlashCommandSkillSource>();

  for (const skill of runtimeSkills) {
    const skillName = skill.name.trim();
    const location = skill.location.trim();
    if (!skillName || !location) {
      continue;
    }

    skillSourceByName.set(skillName, inferSkillSource(location, vaultPath));
  }

  return skillSourceByName;
}

function getSourceSortRank(source: SlashCommandCatalogSource): number {
  switch (source) {
    case 'command':
      return 0;
    case 'skill':
      return 1;
    case 'claude-runtime':
      return 2;
    case 'md-command':
      return 3;
    case 'project':
      return 4;
    default:
      return 5;
  }
}

function normalizeCommandTextField(
  runtimeValue: string | undefined,
  projectValue: string | undefined,
): string {
  const normalizedProjectValue = typeof projectValue === 'string' ? projectValue.trim() : '';
  if (normalizedProjectValue) {
    return normalizedProjectValue;
  }

  return typeof runtimeValue === 'string' ? runtimeValue.trim() : '';
}

function normalizeCommandDescription(
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
): string {
  return normalizeCommandTextField(runtimeCommand?.description, projectCommand?.description);
}

function stripRuntimeSkillDescriptionPrefix(description: string): string {
  return description.replace(/^\([^()]*\s+-\s*Skill\)\s*/i, '').trim();
}

function translateCommandDescription(commandId: string, fallbackDescription: string): string {
  const key = `slashCommand.${commandId}.description` as TranslationKey;
  const translation = t(key);
  // t() returns the key itself if no translation exists; fall back to runtime description
  return translation !== key ? translation : fallbackDescription;
}

function normalizeSlashCommandDescription(
  commandId: string,
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
  source: SlashCommandCatalogSource,
): string {
  const description = normalizeCommandDescription(runtimeCommand, projectCommand);
  if (source === 'skill') {
    return stripRuntimeSkillDescriptionPrefix(description);
  }
  // Only translate built-in commands for UI display; actual execution uses template/name.
  if (!BUILTIN_COMMAND_IDS.has(commandId)) {
    return description;
  }
  // Built-in: preserve project override if present, otherwise translate.
  const hasProjectDescription = typeof projectCommand?.description === 'string' && projectCommand.description.trim().length > 0;
  if (hasProjectDescription) {
    return description;
  }
  return translateCommandDescription(commandId, description);
}

function normalizeCommandTemplate(
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
): string {
  return normalizeCommandTextField(runtimeCommand?.template, projectCommand?.template);
}

function normalizeCommandSubtask(
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
): boolean {
  if (typeof projectCommand?.subtask === 'boolean') {
    return projectCommand.subtask;
  }

  return runtimeCommand?.subtask === true;
}

function normalizeCommandSamplingValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveCommandScopedAgent(
  commandId: string,
  projectCommand: OpencodeCommandConfig | undefined,
  projectAgents: OpencodeAgentConfigRecord,
): {
  agent: OpencodeAgentConfig | undefined;
  metadata: Record<string, unknown> | undefined;
} {
  const scopedAgentId = getCommandScopedAgentId(commandId);
  if (projectCommand?.agent !== scopedAgentId) {
    return {
      agent: undefined,
      metadata: undefined,
    };
  }

  const agent = projectAgents[scopedAgentId];
  return {
    agent,
    metadata: getCommandScopedAgentMetadata(agent?.options, commandId),
  };
}

function normalizeCommandAgent(
  commandId: string,
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
  projectAgents: OpencodeAgentConfigRecord,
): string {
  const scopedAgent = resolveCommandScopedAgent(commandId, projectCommand, projectAgents);
  const baseAgent = typeof scopedAgent.metadata?.baseAgent === 'string'
    ? scopedAgent.metadata.baseAgent.trim()
    : '';
  if (baseAgent) {
    return baseAgent;
  }

  if (projectCommand?.agent === getCommandScopedAgentId(commandId)) {
    return '';
  }

  return normalizeCommandTextField(runtimeCommand?.agent, projectCommand?.agent);
}

function normalizeCommandTemperature(
  commandId: string,
  projectCommand: OpencodeCommandConfig | undefined,
  projectAgents: OpencodeAgentConfigRecord,
): number | undefined {
  const commandTemperature = normalizeCommandSamplingValue(projectCommand?.temperature);
  if (commandTemperature !== undefined) {
    return commandTemperature;
  }

  const scopedAgent = resolveCommandScopedAgent(commandId, projectCommand, projectAgents);
  return normalizeCommandSamplingValue(scopedAgent.agent?.temperature);
}

function normalizeCommandTopP(
  commandId: string,
  projectCommand: OpencodeCommandConfig | undefined,
  projectAgents: OpencodeAgentConfigRecord,
): number | undefined {
  const commandTopP = normalizeCommandSamplingValue(projectCommand?.top_p);
  if (commandTopP !== undefined) {
    return commandTopP;
  }

  const scopedAgent = resolveCommandScopedAgent(commandId, projectCommand, projectAgents);
  return normalizeCommandSamplingValue(scopedAgent.agent?.top_p);
}

export function mergeSlashCommandCatalog(
  options: MergeSlashCommandCatalogOptions,
): SlashCommandCatalogEntry[] {
  const {
    runtimeCommands,
    runtimeSkillSources,
    projectCommands,
    projectAgents,
    hiddenCommandIds,
    mdFileCommands,
    claudeRuntimeCommands,
  } = options;
  const mergedEntries = new Map<string, SlashCommandCatalogEntry>();

  for (const runtimeCommand of runtimeCommands) {
    if (!isCatalogRuntimeCommand(runtimeCommand)) {
      continue;
    }

    const projectCommand = projectCommands[runtimeCommand.name];
    const normalizedSource = normalizeRuntimeCommandSource(runtimeCommand, runtimeSkillSources);
    mergedEntries.set(runtimeCommand.name, {
      id: runtimeCommand.name,
      template: normalizeCommandTemplate(runtimeCommand, projectCommand),
      description: normalizeSlashCommandDescription(runtimeCommand.name, runtimeCommand, projectCommand, normalizedSource),
      agent: normalizeCommandAgent(
        runtimeCommand.name,
        runtimeCommand,
        projectCommand,
        projectAgents,
      ),
      model: normalizeCommandTextField(runtimeCommand.model, projectCommand?.model),
      temperature: normalizeCommandTemperature(runtimeCommand.name, projectCommand, projectAgents),
      topP: normalizeCommandTopP(runtimeCommand.name, projectCommand, projectAgents),
      hasProjectOverride: projectCommand !== undefined,
      hidden: hiddenCommandIds.has(runtimeCommand.name),
      runtimeAvailable: true,
      source: normalizedSource,
      skillSource: normalizedSource === 'skill'
        ? runtimeSkillSources.get(runtimeCommand.name)
        : undefined,
      subtask: normalizeCommandSubtask(runtimeCommand, projectCommand),
      isBuiltin: BUILTIN_COMMAND_IDS.has(runtimeCommand.name),
    });
  }

  // Merge Claude runtime commands (from supportedCommands())
  if (claudeRuntimeCommands && claudeRuntimeCommands.length > 0) {
    for (const claudeCmd of claudeRuntimeCommands) {
      const name = claudeCmd.name.trim();
      if (!name) {
        continue;
      }
      // Don't overwrite existing entries (OpenCode commands take priority)
      if (mergedEntries.has(name)) {
        continue;
      }
      mergedEntries.set(name, {
        id: name,
        template: `/${name}`,
        description: claudeCmd.description?.trim() ?? '',
        agent: '',
        model: '',
        hasProjectOverride: false,
        hidden: hiddenCommandIds.has(name),
        runtimeAvailable: true,
        source: 'claude-runtime',
        skillSource: undefined,
        subtask: false,
        isBuiltin: false,
      });
    }
  }

  for (const [commandId, projectCommand] of Object.entries(projectCommands)) {
    if (mergedEntries.has(commandId)) {
      continue;
    }

    mergedEntries.set(commandId, {
      id: commandId,
      template: normalizeCommandTemplate(undefined, projectCommand),
      description: normalizeCommandDescription(undefined, projectCommand),
      agent: normalizeCommandAgent(commandId, undefined, projectCommand, projectAgents),
      model: normalizeCommandTextField(undefined, projectCommand.model),
      temperature: normalizeCommandTemperature(commandId, projectCommand, projectAgents),
      topP: normalizeCommandTopP(commandId, projectCommand, projectAgents),
      hasProjectOverride: true,
      hidden: hiddenCommandIds.has(commandId),
      runtimeAvailable: false,
      source: 'project',
      skillSource: undefined,
      subtask: normalizeCommandSubtask(undefined, projectCommand),
      isBuiltin: false,
    });
  }

  if (mdFileCommands) {
    for (const mdCommand of mdFileCommands) {
      if (mergedEntries.has(mdCommand.id)) {
        continue;
      }

      mergedEntries.set(mdCommand.id, {
        id: mdCommand.id,
        template: mdCommand.template,
        description: mdCommand.description || `Custom command from ${mdCommand.id}.md`,
        agent: '',
        model: '',
        hasProjectOverride: false,
        hidden: hiddenCommandIds.has(mdCommand.id),
        runtimeAvailable: true,
        source: 'md-command',
        skillSource: undefined,
        subtask: false,
        isBuiltin: false,
      });
    }
  }

  return Array.from(mergedEntries.values()).sort((left, right) => {
    if (left.runtimeAvailable !== right.runtimeAvailable) {
      return left.runtimeAvailable ? -1 : 1;
    }

    if (left.hasProjectOverride !== right.hasProjectOverride) {
      return left.hasProjectOverride ? 1 : -1;
    }

    const sourceRankDelta = getSourceSortRank(left.source) - getSourceSortRank(right.source);
    if (sourceRankDelta !== 0) {
      return sourceRankDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

export function buildVisibleSlashCommandMenuItems(
  catalog: SlashCommandCatalogEntry[],
): SlashCommandMenuItem[] {
  return catalog
    .filter((entry) => !entry.hidden && entry.runtimeAvailable)
    .map((entry) => ({
      id: entry.id,
      description: entry.description,
      hasProjectOverride: entry.hasProjectOverride,
      runtimeAvailable: entry.runtimeAvailable,
      source: entry.source,
      skillSource: entry.skillSource,
      subtask: entry.subtask,
      isBuiltin: entry.isBuiltin,
    }));
}
