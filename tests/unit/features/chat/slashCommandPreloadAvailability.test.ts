import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import {
  loadAgentMentionCandidatesFromSlashCommandMenuItems,
  loadAgentSelectionCandidatesFromSlashCommandMenuItems,
  SlashCommandMenuCatalogCache,
} from '../../../../src/features/chat/services/SlashCommandMenuCatalogCache';

const codexSkillItem: SlashCommandMenuItem = {
  id: 'opencodian-runtime-smoke-skill',
  description: 'Smoke skill',
  hasProjectOverride: false,
  insertText: '$opencodian-runtime-smoke-skill ',
  runtimeAvailable: true,
  source: 'codex-skill',
  subtask: false,
  isBuiltin: false,
};

function createView(activeBackend: string, enabledBackends: string[], opencodeConfigManager?: unknown) {
  const settings = {
    ...DEFAULT_SETTINGS,
    enabledBackends: [...enabledBackends],
    activeBackend,
  };
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings,
    openCodeService: {},
    storage: {},
    ...(opencodeConfigManager === undefined ? {} : { opencodeConfigManager }),
  } as never);
}

describe('OpenCodianView slash command preload availability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not warm slash command catalog when opencode backend is disabled', () => {
    jest.useFakeTimers();
    try {
      const view = createView('opencode', []);

      const warmSpy = jest.spyOn(
        (view as unknown as { slashCommandMenuCatalogCache: { warm: () => void } }).slashCommandMenuCatalogCache,
        'warm',
      );

      (view as unknown as { invalidateSlashCommandMenuCatalog: (options?: { preload?: boolean }) => void })
        .invalidateSlashCommandMenuCatalog({ preload: true });

      jest.runOnlyPendingTimers();

      expect(warmSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

it('uses native OpenCode 2 agents for mention and selector candidates', async () => {
  const cache = new SlashCommandMenuCatalogCache({
    getBackendKey: () => 'opencode2',
    getHiddenCommandIds: () => [],
    loadOpenCode2Commands: async () => [{ name: 'review' }],
    loadOpenCode2Skills: async () => [],
    loadOpenCode2Agents: async () => [
      { id: 'build', name: 'Build', mode: 'primary', hidden: false },
      { id: 'explore', name: 'Explore', mode: 'subagent', hidden: false },
      { id: 'private', name: 'Private', mode: 'subagent', hidden: true },
    ],
  } as never);
  const items = await cache.load();
  expect(items.some((item) => item.id === 'review')).toBe(true);
  expect(items.some((item) => item.id === 'share')).toBe(false);
  expect((await loadAgentMentionCandidatesFromSlashCommandMenuItems(items)).map((agent) => agent.id)).toEqual(['build', 'explore']);
  expect((await loadAgentSelectionCandidatesFromSlashCommandMenuItems(items)).map((agent) => agent.id)).toEqual(['build']);
});

describe('OpenCodianView.loadSlashCommandMenuItems — Codex-active guard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates to the cache (returns codex-skill items) when Codex is the active backend', async () => {
    // Codex active, no opencodeConfigManager — Codex must NOT be excluded.
    const view = createView('codex', ['codex']);

    const cache = (view as unknown as {
      slashCommandMenuCatalogCache: { load: () => Promise<SlashCommandMenuItem[]> };
    }).slashCommandMenuCatalogCache;
    const loadSpy = jest.spyOn(cache, 'load').mockResolvedValue([codexSkillItem]);

    const items = await (view as unknown as { loadSlashCommandMenuItems: () => Promise<SlashCommandMenuItem[]> })
      .loadSlashCommandMenuItems();

    expect(loadSpy).toHaveBeenCalled();
    expect(items).not.toEqual([]);
    expect(items).toEqual([codexSkillItem]);
  });

  it('returns [] when no recognized backend is active (guard preserved)', async () => {
    const view = createView('opencode', []);

    const cache = (view as unknown as {
      slashCommandMenuCatalogCache: { load: () => Promise<SlashCommandMenuItem[]> };
    }).slashCommandMenuCatalogCache;
    const loadSpy = jest.spyOn(cache, 'load').mockResolvedValue([codexSkillItem]);

    const items = await (view as unknown as { loadSlashCommandMenuItems: () => Promise<SlashCommandMenuItem[]> })
      .loadSlashCommandMenuItems();

    expect(loadSpy).not.toHaveBeenCalled();
    expect(items).toEqual([]);
  });

  it('loads the OpenCode 2 catalog without an OpenCode 1 config manager', async () => {
    const view = createView('opencode2', ['opencode2']);
    const cache = (view as unknown as {
      slashCommandMenuCatalogCache: { load: () => Promise<SlashCommandMenuItem[]> };
    }).slashCommandMenuCatalogCache;
    const loadSpy = jest.spyOn(cache, 'load').mockResolvedValue([codexSkillItem]);
    const items = await (view as unknown as { loadSlashCommandMenuItems: () => Promise<SlashCommandMenuItem[]> })
      .loadSlashCommandMenuItems();
    expect(loadSpy).toHaveBeenCalled();
    expect(items).toEqual([codexSkillItem]);
  });

  it('routes a ZCode conversation to native slash commands without calling OpenCode', async () => {
    const view = createView('zcode', ['zcode']);
    const cache = (view as unknown as {
      slashCommandMenuCatalogCache: { load: () => Promise<SlashCommandMenuItem[]> };
    }).slashCommandMenuCatalogCache;
    const items = await (view as unknown as { loadSlashCommandMenuItems: () => Promise<SlashCommandMenuItem[]> })
      .loadSlashCommandMenuItems();

    expect(items).toEqual([]);
    expect((cache as unknown as { host: { getBackendKey: () => string } }).host.getBackendKey()).toBe('zcode');
  });
});
