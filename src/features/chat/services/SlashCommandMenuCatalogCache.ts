import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';

import {
  buildRuntimeSkillSourceMap,
  buildVisibleSlashCommandMenuItems,
  mergeSlashCommandCatalog,
  type SlashCommandMenuItem,
} from '../../../core/config/slashCommandCatalog';
import type {
  OpencodeAgentConfigRecord,
  OpencodeCommandConfigRecord,
} from '../../../core/types';

const SLASH_COMMAND_MENU_CACHE_TTL_MS = 120_000;

export interface SlashCommandMenuCatalogCacheHost {
  getHiddenCommandIds(): string[];
  loadProjectAgents(): Promise<OpencodeAgentConfigRecord>;
  loadProjectCommands(): Promise<OpencodeCommandConfigRecord>;
  loadRuntimeCommands(): Promise<unknown>;
  loadRuntimeSkills(): Promise<unknown>;
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

function normalizeRuntimeCommands(value: unknown): RuntimeCommand[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRuntimeSkills(
  value: unknown,
): Array<{ name: string; location: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is { name: string; location: string } =>
      Boolean(
        item
        && typeof item === 'object'
        && typeof (item as { name?: unknown }).name === 'string'
        && typeof (item as { location?: unknown }).location === 'string',
      ))
    .map((item) => ({
      name: item.name,
      location: item.location,
    }));
}

function buildHiddenCommandCacheKey(commandIds: string[]): string {
  return commandIds
    .map((commandId) => commandId.trim())
    .filter((commandId) => commandId.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .join('\u0000');
}

export class SlashCommandMenuCatalogCache {
  private cacheEntry: SlashCommandMenuCatalogCacheEntry | null = null;
  private generation = 0;
  private pendingLoad: SlashCommandMenuCatalogPendingLoad | null = null;

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
    return buildHiddenCommandCacheKey(this.host.getHiddenCommandIds());
  }

  private now(): number {
    return this.host.now?.() ?? Date.now();
  }

  private startLoad(key: string): Promise<SlashCommandMenuItem[]> {
    const generation = this.generation;
    const token = Symbol('slash-command-menu-catalog-load');

    const promise = (async () => {
      const [runtimeCommandsResult, runtimeSkillsResult, projectCommands, projectAgents] = await Promise.all([
        this.host.loadRuntimeCommands(),
        this.host.loadRuntimeSkills().catch(() => []),
        this.host.loadProjectCommands(),
        this.host.loadProjectAgents(),
      ]);
      const runtimeSkillSources = buildRuntimeSkillSourceMap(
        normalizeRuntimeSkills(runtimeSkillsResult),
        this.host.getVaultPath(),
      );

      const items = buildVisibleSlashCommandMenuItems(
        mergeSlashCommandCatalog({
          runtimeCommands: normalizeRuntimeCommands(runtimeCommandsResult),
          runtimeSkillSources,
          projectCommands,
          projectAgents,
          hiddenCommandIds: new Set(this.host.getHiddenCommandIds()),
        }),
      );

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
