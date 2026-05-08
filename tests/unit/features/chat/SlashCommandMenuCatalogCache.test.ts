import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';

import { attachOpenCodeAppAgents } from '../../../../src/core/opencode/OpenCodeAppCatalogSidecar';
import {
  loadAgentMentionCandidatesFromSlashCommandMenuItems,
  loadAgentSelectionCandidatesFromSlashCommandMenuItems,
  SlashCommandMenuCatalogCache,
  type SlashCommandMenuCatalogCacheHost,
} from '../../../../src/features/chat/services/SlashCommandMenuCatalogCache';

function createRuntimeCommand(
  overrides: Partial<RuntimeCommand> & { name: string },
): RuntimeCommand {
  return {
    name: overrides.name,
    template: '',
    description: '',
    source: 'command',
    subtask: false,
    agent: '',
    model: '',
    ...overrides,
  } as RuntimeCommand;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createHost(
  overrides: Partial<SlashCommandMenuCatalogCacheHost> = {},
): jest.Mocked<SlashCommandMenuCatalogCacheHost> {
  return {
    getHiddenCommandIds: jest.fn(() => []),
    loadProjectAgents: jest.fn().mockResolvedValue({}),
    loadProjectCommands: jest.fn().mockResolvedValue({}),
    loadRuntimeCommands: jest.fn().mockResolvedValue([
      createRuntimeCommand({
        name: 'review',
        description: 'Review code',
      }),
    ]),
    loadRuntimeSkills: jest.fn().mockResolvedValue([]),
    getVaultPath: jest.fn(() => 'C:/vault'),
    onWarmLoadFailed: jest.fn(),
    ...overrides,
  } as jest.Mocked<SlashCommandMenuCatalogCacheHost>;
}

describe('SlashCommandMenuCatalogCache', () => {
  it('caches merged slash menu items for repeated loads', async () => {
    const host = createHost();
    const cache = new SlashCommandMenuCatalogCache(host);

    const first = await cache.load();
    const second = await cache.load();

    expect(first).toEqual([{
      id: 'review',
      description: 'Review code',
      hasProjectOverride: false,
      runtimeAvailable: true,
      source: 'command',
      subtask: false,
    }]);
    expect(second).toBe(first);
    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(1);
    expect(host.loadProjectCommands).toHaveBeenCalledTimes(1);
    expect(host.loadProjectAgents).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight warm load with the first user-triggered load', async () => {
    const deferredRuntimeCommands = createDeferred<RuntimeCommand[]>();
    const host = createHost({
      loadRuntimeCommands: jest.fn(() => deferredRuntimeCommands.promise),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    cache.warm();
    const userLoad = cache.load();

    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(1);

    deferredRuntimeCommands.resolve([
      createRuntimeCommand({
        name: 'commit',
        description: 'Create commit',
      }),
    ]);

    await expect(userLoad).resolves.toEqual([{
      id: 'commit',
      description: 'Create commit',
      hasProjectOverride: false,
      runtimeAvailable: true,
      source: 'command',
      subtask: false,
    }]);
    expect(host.onWarmLoadFailed).not.toHaveBeenCalled();
  });

  it('reloads when hidden command ids change', async () => {
    let hiddenCommandIds: string[] = [];
    const host = createHost({
      getHiddenCommandIds: jest.fn(() => hiddenCommandIds),
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({ name: 'commit' }),
        createRuntimeCommand({ name: 'review' }),
      ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    expect((await cache.load()).map((item) => item.id)).toEqual(['commit', 'review']);

    hiddenCommandIds = ['review'];

    expect((await cache.load()).map((item) => item.id)).toEqual(['commit']);
    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(2);
  });

  it('keeps warm-load failures out of the user-visible load cache', async () => {
    const host = createHost({
      loadRuntimeCommands: jest.fn()
        .mockRejectedValueOnce(new Error('server not ready'))
        .mockResolvedValueOnce([
          createRuntimeCommand({
            name: 'init',
            description: 'Guided setup',
          }),
        ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    cache.warm();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(host.onWarmLoadFailed).toHaveBeenCalledTimes(1);
    await expect(cache.load()).resolves.toEqual([{
      id: 'init',
      description: 'Guided setup',
      hasProjectOverride: false,
      runtimeAvailable: true,
      source: 'command',
      subtask: false,
    }]);
    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(2);
  });

  it('keeps OpenCode skills in the menu catalog for direct or /skills invocation modes', async () => {
    const host = createHost({
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({ name: 'review', source: 'command' }),
        createRuntimeCommand({ name: 'frontend-design', source: 'skill', description: 'Design UI' }),
        createRuntimeCommand({ name: 'mcp-prompt', source: 'mcp' }),
      ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    await expect(cache.load()).resolves.toEqual([
      expect.objectContaining({ id: 'review', source: 'command' }),
      expect.objectContaining({ id: 'frontend-design', source: 'skill' }),
    ]);
  });

  it('surfaces runtime skills in the menu catalog even when command.list omits them', async () => {
    const host = createHost({
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({ name: 'review', source: 'command', description: 'Review code' }),
      ]),
      loadRuntimeSkills: jest.fn().mockResolvedValue([
        {
          name: 'frontend-design',
          description: 'Design UI',
          location: 'C:/vault/.claude/skills/frontend-design/SKILL.md',
          content: '',
        },
      ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    await expect(cache.load()).resolves.toEqual([
      expect.objectContaining({ id: 'review', source: 'command' }),
      expect.objectContaining({
        id: 'frontend-design',
        description: 'Design UI',
        source: 'skill',
        skillSource: { kind: 'project' },
      }),
    ]);
  });
});

describe('SlashCommandMenuCatalogCache — skill provenance and agent sidecar', () => {
  it('attaches provenance details to runtime skill entries from skill locations', async () => {
    const host = createHost({
      getVaultPath: jest.fn(() => 'C:/vault'),
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({ name: 'project-skill', source: 'skill', description: 'Project helper' }),
        createRuntimeCommand({ name: 'opencode-skill', source: 'skill', description: 'OpenCode helper' }),
        createRuntimeCommand({ name: 'claude-md-improver', source: 'skill', description: 'Improve CLAUDE.md' }),
      ]),
      loadRuntimeSkills: jest.fn().mockResolvedValue([
        {
          name: 'project-skill',
          description: 'Project helper',
          location: 'C:/vault/.claude/skills/project-skill/SKILL.md',
          content: '',
        },
        {
          name: 'opencode-skill',
          description: 'OpenCode helper',
          location: 'C:/vault/.opencode/skills/opencode-skill/SKILL.md',
          content: '',
        },
        {
          name: 'claude-md-improver',
          description: 'Improve CLAUDE.md',
          location: 'C:/Users/lt/.claude/plugins/cache/claude-plugins-official/claude-md-management/1.0.0/skills/claude-md-improver/SKILL.md',
          content: '',
        },
      ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    await expect(cache.load()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'project-skill',
        source: 'skill',
        skillSource: { kind: 'project' },
      }),
      expect.objectContaining({
        id: 'opencode-skill',
        source: 'skill',
        skillSource: { kind: 'opencodeProject' },
      }),
      expect.objectContaining({
        id: 'claude-md-improver',
        source: 'skill',
        skillSource: { kind: 'plugin', pluginName: 'claude-md-management' },
      }),
    ]));
  });

  it('reclassifies runtime commands as skills when the skill list contains the same names', async () => {
    const host = createHost({
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({
          name: 'x-reader/video',
          source: 'command',
          description: '(project - Skill) Video summary',
        }),
        createRuntimeCommand({
          name: 'review',
          source: 'command',
          description: 'Review code',
        }),
      ]),
      loadRuntimeSkills: jest.fn().mockResolvedValue([
        {
          name: 'x-reader/video',
          description: 'Video summary',
          location: 'C:/Users/lt/.claude/skills/video/SKILL.md',
          content: '',
        },
      ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    await expect(cache.load()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'x-reader/video',
        description: 'Video summary',
        source: 'skill',
        skillSource: { kind: 'global' },
      }),
      expect.objectContaining({
        id: 'review',
        source: 'command',
      }),
    ]));
  });

  it('carries runtime and project agent mention candidates on the shared catalog result', async () => {
    const runtimeSkillsResult = attachOpenCodeAppAgents([], Promise.resolve([
      { name: 'primary', mode: 'primary', description: 'Main agent' },
      { name: 'reviewer', mode: 'subagent', description: 'Runtime reviewer' },
      { name: 'hidden-reviewer', mode: 'subagent', hidden: true },
    ]));
    const host = createHost({
      loadRuntimeSkills: jest.fn().mockResolvedValue(runtimeSkillsResult),
      loadProjectAgents: jest.fn().mockResolvedValue({
        planner: {
          mode: 'all',
          description: 'Project planner',
        },
      }),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    const items = await cache.load();

    await expect(loadAgentMentionCandidatesFromSlashCommandMenuItems(items)).resolves.toEqual([
      {
        id: 'planner',
        displayName: 'planner',
        description: 'Project planner',
        mode: 'all',
        hidden: false,
      },
      {
        id: 'reviewer',
        displayName: 'reviewer',
        description: 'Runtime reviewer',
        mode: 'subagent',
        hidden: false,
      },
    ]);
    await expect(loadAgentSelectionCandidatesFromSlashCommandMenuItems(items)).resolves.toEqual([
      {
        id: 'planner',
        displayName: 'planner',
        description: 'Project planner',
        mode: 'all',
      },
      {
        id: 'primary',
        displayName: 'primary',
        description: 'Main agent',
        mode: 'primary',
      },
    ]);
  });
});

describe('SlashCommandMenuCatalogCache — project-only filtering', () => {
  it('keeps project-only commands out of the chat menu until the runtime exposes them', async () => {
    const host = createHost({
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({ name: 'review', source: 'command' }),
      ]),
      loadProjectCommands: jest.fn().mockResolvedValue({
        review: {
          description: 'Review override',
        },
        deploy: {
          description: 'Project-only deploy command',
        },
      }),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    await expect(cache.load()).resolves.toEqual([
      expect.objectContaining({ id: 'review', source: 'command' }),
    ]);
  });
});
