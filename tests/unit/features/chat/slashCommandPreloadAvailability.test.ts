import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

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
});
