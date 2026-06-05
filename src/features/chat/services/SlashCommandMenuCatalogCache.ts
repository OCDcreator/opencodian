import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';
import * as path from 'path';

import {
  buildRuntimeSkillSourceMap,
  buildVisibleSlashCommandMenuItems,
  mergeSlashCommandCatalog,
  type SlashCommandCatalogEntry,
  type SlashCommandMenuItem,
} from '../../../core/config/slashCommandCatalog';
import { getAttachedOpenCodeAppAgents } from '../../../core/opencode/OpenCodeAppCatalogSidecar';
import type {
  OpencodeAgentConfigRecord,
  OpencodeCommandConfigRecord,
} from '../../../core/types';
import { t } from '../../../i18n';
import {
  AgentMentionCandidateService,
  type AgentSelectionCandidate,
} from './AgentMentionCandidateService';
import type { AgentMentionCandidate } from './AgentMentionComposerController';
import { loadCommandsFromConfigDir } from './CommandMdFileLoader';

const SLASH_COMMAND_MENU_CACHE_TTL_MS = 120_000;
const AGENT_MENTION_CANDIDATES_PROMISE_KEY = Symbol('opencodian.agentMentionCandidatesPromise');
const AGENT_SELECTION_CANDIDATES_PROMISE_KEY = Symbol('opencodian.agentSelectionCandidatesPromise');

type SlashCommandMenuItemsWithAgentSidecars = SlashCommandMenuItem[] & {
  [AGENT_MENTION_CANDIDATES_PROMISE_KEY]?: Promise<AgentMentionCandidate[]>;
  [AGENT_SELECTION_CANDIDATES_PROMISE_KEY]?: Promise<AgentSelectionCandidate[]>;
};

export interface SlashCommandMenuCatalogCacheHost {
  getHiddenCommandIds(): string[];
  loadProjectAgents(): Promise<OpencodeAgentConfigRecord>;
  loadProjectCommands(): Promise<OpencodeCommandConfigRecord>;
  loadRuntimeCommands(): Promise<unknown>;
  loadRuntimeSkills(): Promise<unknown>;
  /** Optional: load Claude Code runtime commands for the slash menu. Returns null or undefined when not applicable. */
  loadClaudeRuntimeCommands?(): Promise<Array<{ name: string; description?: string }> | null | undefined>;
  /** Optional: load Claude Code runtime agents for the @agent mention menu. Returns null or undefined when not applicable. */
  loadClaudeRuntimeAgents?(): Promise<Array<{ name: string; description?: string }> | null | undefined>;
  /** Optional: returns a short backend discriminator for cache key partitioning. Return different values for different backends (e.g. 'opencode', 'claude-code'). */
  getBackendKey?(): string;
  getVaultPath(): string | null;
  now?(): number;
  onWarmLoadFailed?(error: unknown): void;
}

interface SlashCommandMenuCatalogCacheEntry {
  items: SlashCommandMenuItem[];
  key: string;
  loadedAt: number;
}

interface SlashCommandMenuCatalogPendingLoad {
  key: string;
  promise: Promise<SlashCommandMenuItem[]>;
  token: symbol;
}

export function attachAgentMentionCandidatesToSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  candidates: Promise<AgentMentionCandidate[]> | readonly AgentMentionCandidate[],
): SlashCommandMenuItem[] {
  const candidatesPromise = Promise.resolve(candidates).then((resolved) =>
    resolved.map((candidate) => ({ ...candidate })))
    .catch(() => []);

  Object.defineProperty(items, AGENT_MENTION_CANDIDATES_PROMISE_KEY, {
    configurable: true,
    enumerable: false,
    value: candidatesPromise,
  });

  return items;
}

export function loadAgentMentionCandidatesFromSlashCommandMenuItems(
  items: readonly SlashCommandMenuItem[] | null | undefined,
): Promise<AgentMentionCandidate[]> {
  const candidatesPromise = (items as SlashCommandMenuItemsWithAgentSidecars | null | undefined)
    ?.[AGENT_MENTION_CANDIDATES_PROMISE_KEY];

  return candidatesPromise
    ? candidatesPromise.then((candidates) => candidates.map((candidate) => ({ ...candidate })))
    : Promise.resolve([]);
}

export function attachAgentSelectionCandidatesToSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  candidates: Promise<AgentSelectionCandidate[]> | readonly AgentSelectionCandidate[],
): SlashCommandMenuItem[] {
  const candidatesPromise = Promise.resolve(candidates).then((resolved) =>
    resolved.map((candidate) => ({ ...candidate })))
    .catch(() => []);

  Object.defineProperty(items, AGENT_SELECTION_CANDIDATES_PROMISE_KEY, {
    configurable: true,
    enumerable: false,
    value: candidatesPromise,
  });

  return items;
}

export function loadAgentSelectionCandidatesFromSlashCommandMenuItems(
  items: readonly SlashCommandMenuItem[] | null | undefined,
): Promise<AgentSelectionCandidate[]> {
  const candidatesPromise = (items as SlashCommandMenuItemsWithAgentSidecars | null | undefined)
    ?.[AGENT_SELECTION_CANDIDATES_PROMISE_KEY];

  return candidatesPromise
    ? candidatesPromise.then((candidates) => candidates.map((candidate) => ({ ...candidate })))
    : Promise.resolve([]);
}

export interface SharedComposerCatalogLoaderHost {
  loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]>;
  loadAgentMentionCandidates?(): Promise<AgentMentionCandidate[]>;
  loadAgentSelectionCandidates?(): Promise<AgentSelectionCandidate[]>;
}

export async function loadAgentMentionCandidatesFromComposerCatalog(
  host: SharedComposerCatalogLoaderHost,
  cachedItems: SlashCommandMenuItem[] | null,
  setCachedItems: (items: SlashCommandMenuItem[]) => void,
): Promise<AgentMentionCandidate[]> {
  if (host.loadAgentMentionCandidates) {
    return host.loadAgentMentionCandidates();
  }

  const items = await host.loadSlashCommandMenuItems();
  setCachedItems(items);
  return loadAgentMentionCandidatesFromSlashCommandMenuItems(items);
}

export async function loadAgentSelectionCandidatesFromComposerCatalog(
  host: SharedComposerCatalogLoaderHost,
  cachedItems: SlashCommandMenuItem[] | null,
  setCachedItems: (items: SlashCommandMenuItem[]) => void,
): Promise<AgentSelectionCandidate[]> {
  if (host.loadAgentSelectionCandidates) {
    return host.loadAgentSelectionCandidates();
  }

  const items = await host.loadSlashCommandMenuItems();
  setCachedItems(items);
  return loadAgentSelectionCandidatesFromSlashCommandMenuItems(items);
}

function normalizeRuntimeCommands(value: unknown): RuntimeCommand[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRuntimeSkills(
  value: unknown,
): Array<{ name: string; description: string; location: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is { name: string; description?: string; location: string } =>
      Boolean(
        item
        && typeof item === 'object'
        && typeof (item as { name?: unknown }).name === 'string'
        && typeof (item as { location?: unknown }).location === 'string',
      ))
    .map((item) => ({
      name: item.name,
      description: typeof item.description === 'string' ? item.description : '',
      location: item.location,
    }));
}

function mergeRuntimeCommandsWithMissingSkills(
  runtimeCommands: RuntimeCommand[],
  runtimeSkills: Array<{ name: string; description: string }>,
): RuntimeCommand[] {
  const commandNames = new Set(
    runtimeCommands
      .map((command) => command.name?.trim())
      .filter((name): name is string => Boolean(name)),
  );

  if (runtimeSkills.every((skill) => commandNames.has(skill.name.trim()))) {
    return runtimeCommands;
  }

  const syntheticSkillCommands = runtimeSkills.flatMap((skill) => {
    const skillName = skill.name.trim();
    if (!skillName || commandNames.has(skillName)) {
      return [];
    }

    commandNames.add(skillName);
    return [{
      name: skillName,
      template: '',
      description: skill.description.trim(),
      source: 'skill',
      subtask: false,
      agent: '',
      model: '',
    } as RuntimeCommand];
  });

  return syntheticSkillCommands.length > 0
    ? runtimeCommands.concat(syntheticSkillCommands)
    : runtimeCommands;
}

function buildHiddenCommandCacheKey(commandIds: string[]): string {
  return commandIds
    .map((commandId) => commandId.trim())
    .filter((commandId) => commandId.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .join('\u0000');
}

export const SYNTHETIC_BUILTIN_COMMAND_IDS = ['compact', 'undo', 'redo', 'new', 'share', 'unshare'] as const;

export function appendSyntheticBuiltinCommands(
  catalog: SlashCommandCatalogEntry[],
  hiddenCommandIds: Set<string>,
): SlashCommandCatalogEntry[] {
  const existingIds = new Set(catalog.map((entry) => entry.id));
  const syntheticEntries: SlashCommandCatalogEntry[] = [];

  for (const id of SYNTHETIC_BUILTIN_COMMAND_IDS) {
    if (existingIds.has(id)) {
      continue;
    }
    syntheticEntries.push({
      id,
      template: `/${id}`,
      description: t(`slashCommand.${id}.description`),
      agent: '',
      model: '',
      hasProjectOverride: false,
      hidden: hiddenCommandIds.has(id),
      runtimeAvailable: true,
      source: 'command',
      subtask: false,
      isBuiltin: true,
    });
  }

  return syntheticEntries.length > 0 ? catalog.concat(syntheticEntries) : catalog;
}

function resolveProjectConfigDir(vaultPath: string | null): string | null {
  return vaultPath ? path.join(vaultPath, '.opencode') : null;
}

function normalizeClaudeRuntimeAgents(
  value: Array<{ name: string; description?: string }> | null | undefined,
): Array<{ name: string; description?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is { name: string; description?: string } =>
      Boolean(item && typeof item === 'object' && typeof item.name === 'string'),
  );
}

export class SlashCommandMenuCatalogCache {
  private cacheEntry: SlashCommandMenuCatalogCacheEntry | null = null;
  private generation = 0;
  private pendingLoad: SlashCommandMenuCatalogPendingLoad | null = null;
  private readonly agentMentionCandidateService = new AgentMentionCandidateService({
    loadRuntimeAgents: async () => [],
    loadProjectAgents: async () => ({}),
  });

  constructor(private readonly host: SlashCommandMenuCatalogCacheHost) {}

  invalidate(): void {
    this.generation += 1;
    this.cacheEntry = null;
    this.pendingLoad = null;
  }

  load(): Promise<SlashCommandMenuItem[]> {
    const key = this.buildCacheKey();
    const now = this.now();

    if (
      this.cacheEntry
      && this.cacheEntry.key === key
      && now - this.cacheEntry.loadedAt <= SLASH_COMMAND_MENU_CACHE_TTL_MS
    ) {
      return Promise.resolve(this.cacheEntry.items);
    }

    if (this.pendingLoad?.key === key) {
      return this.pendingLoad.promise;
    }

    return this.startLoad(key);
  }

  warm(): void {
    const key = this.buildCacheKey();
    const now = this.now();

    if (
      this.pendingLoad?.key === key
      || (
        this.cacheEntry
        && this.cacheEntry.key === key
        && now - this.cacheEntry.loadedAt <= SLASH_COMMAND_MENU_CACHE_TTL_MS
      )
    ) {
      return;
    }

    void this.load().catch((error) => {
      this.host.onWarmLoadFailed?.(error);
    });
  }

  private buildCacheKey(): string {
    const hiddenKey = buildHiddenCommandCacheKey(this.host.getHiddenCommandIds());
    const backendKey = this.host.getBackendKey?.() ?? 'default';
    return `${hiddenKey}:${backendKey}`;
  }

  private now(): number {
    return this.host.now?.() ?? Date.now();
  }

  private startLoad(key: string): Promise<SlashCommandMenuItem[]> {
    const generation = this.generation;
    const token = Symbol('slash-command-menu-catalog-load');
    const isClaudeBackend = (this.host.getBackendKey?.() ?? 'opencode') === 'claude-code';

    const promise = (async () => {
      const [runtimeCommandsResult, runtimeSkillsResult, projectCommands, projectAgents, mdFileCommands, claudeRuntimeResult, claudeRuntimeAgentsResult] = await Promise.all([
        this.host.loadRuntimeCommands(),
        this.host.loadRuntimeSkills().catch(() => []),
        this.host.loadProjectCommands(),
        this.host.loadProjectAgents(),
        // Do not load .opencode/commands/*.md for Claude backend
        isClaudeBackend
          ? Promise.resolve([])
          : Promise.resolve(loadCommandsFromConfigDir(resolveProjectConfigDir(this.host.getVaultPath()))).catch(() => []),
        this.host.loadClaudeRuntimeCommands?.().catch(() => null) ?? null,
        // Load Claude runtime agents for @agent menu (null when not applicable)
        isClaudeBackend
          ? (this.host.loadClaudeRuntimeAgents?.().catch(() => null) ?? null)
          : null,
      ]);
      const runtimeSkills = normalizeRuntimeSkills(runtimeSkillsResult);
      const runtimeSkillSources = buildRuntimeSkillSourceMap(
        runtimeSkills,
        this.host.getVaultPath(),
      );
      const runtimeCommands = mergeRuntimeCommandsWithMissingSkills(
        normalizeRuntimeCommands(runtimeCommandsResult),
        runtimeSkills,
      );

      // Build agent mention/selection candidates, backend-aware
      let agentMentionCandidates: Promise<AgentMentionCandidate[]>;
      let agentSelectionCandidates: Promise<AgentSelectionCandidate[]>;
      if (isClaudeBackend) {
        // Claude backend: use Claude runtime agents only; skip OpenCode runtime/project agents
        const claudeAgents = normalizeClaudeRuntimeAgents(claudeRuntimeAgentsResult);
        agentMentionCandidates = Promise.resolve(
          claudeAgents.map((agent) => ({
            id: agent.name,
            displayName: agent.name,
            description: agent.description ?? '',
            mode: 'all' as const,
            hidden: false,
          })),
        );
        agentSelectionCandidates = Promise.resolve(
          claudeAgents.map((agent) => ({
            id: agent.name,
            displayName: agent.name,
            description: agent.description ?? '',
            mode: 'all' as const,
          })),
        );
      } else {
        // OpenCode backend: use OpenCode runtime agents + project agents
        const runtimeAgentsResult = Promise.resolve(getAttachedOpenCodeAppAgents(runtimeSkillsResult) ?? [])
          .catch(() => []);
        agentMentionCandidates = runtimeAgentsResult
          .then((agents) => this.agentMentionCandidateService.projectCandidates({
            runtimeAgentsResult: agents,
            projectAgents,
          }))
          .catch(() => []);
        agentSelectionCandidates = runtimeAgentsResult
          .then((agents) => this.agentMentionCandidateService.defaultCandidates({
            runtimeAgentsResult: agents,
            projectAgents,
          }))
          .catch(() => []);
      }
      const hiddenCommandIds = new Set(this.host.getHiddenCommandIds());
      const claudeRuntimeCommands = Array.isArray(claudeRuntimeResult) && claudeRuntimeResult.length > 0
        ? claudeRuntimeResult.map((cmd) => ({
            name: cmd.name,
            description: cmd.description,
          }))
        : undefined;
      const mergedCatalog = mergeSlashCommandCatalog({
        runtimeCommands,
        runtimeSkillSources,
        projectCommands,
        projectAgents,
        hiddenCommandIds,
        mdFileCommands,
        claudeRuntimeCommands,
      });
      // Do not append OpenCode synthetic builtins for Claude backend
      const finalCatalog = isClaudeBackend ? mergedCatalog : appendSyntheticBuiltinCommands(mergedCatalog, hiddenCommandIds);
      const items = buildVisibleSlashCommandMenuItems(finalCatalog);
      attachAgentMentionCandidatesToSlashCommandMenuItems(items, agentMentionCandidates);
      attachAgentSelectionCandidatesToSlashCommandMenuItems(items, agentSelectionCandidates);

      if (generation === this.generation && this.pendingLoad?.token === token) {
        this.cacheEntry = {
          items,
          key,
          loadedAt: this.now(),
        };
      }

      return items;
    })().finally(() => {
      if (this.pendingLoad?.token === token) {
        this.pendingLoad = null;
      }
    });

    this.pendingLoad = {
      key,
      promise,
      token,
    };
    return promise;
  }
}
