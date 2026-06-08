import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';

import type {
  ClaudeRuntimeCommand,
  SlashCommandCatalogSource,
} from '../../../../src/core/config/slashCommandCatalog';
import {
  buildVisibleSlashCommandMenuItems,
  mergeSlashCommandCatalog,
} from '../../../../src/core/config/slashCommandCatalog';
import type { OpencodeCommandConfigRecord } from '../../../../src/core/types';

function createRuntimeCommand(
  overrides: Partial<RuntimeCommand> & { name: string },
): RuntimeCommand {
  const { name, ...rest } = overrides;
  return {
    name,
    template: '',
    description: '',
    source: 'command',
    subtask: false,
    agent: '',
    model: '',
    ...rest,
  } as RuntimeCommand;
}

describe('slashCommandCatalog', () => {
  it('keeps project-only commands in the merged catalog but out of the chat-visible slash menu', () => {
    const projectCommands: OpencodeCommandConfigRecord = {
      review: {
        description: 'Project review override',
      },
      deploy: {
        description: 'Project-only deploy command',
        agent: 'ops',
      },
    };

    const merged = mergeSlashCommandCatalog({
      runtimeCommands: [
        createRuntimeCommand({
          name: 'init',
          description: 'Guided setup',
        }),
        createRuntimeCommand({
          name: 'review',
          description: 'Review changes',
          subtask: true,
        }),
        createRuntimeCommand({
          name: 'mcp-prompt',
          source: 'mcp',
          description: 'Should stay hidden from slash autocomplete',
        }),
        createRuntimeCommand({
          name: 'skill-review',
          source: 'skill',
          description: 'Review with a skill',
        }),
      ],
      runtimeSkillSources: new Map(),
      projectCommands,
      projectAgents: {},
      hiddenCommandIds: new Set(['review']),
    });

    expect(merged.map((entry) => ({
      id: entry.id,
      hidden: entry.hidden,
      runtimeAvailable: entry.runtimeAvailable,
      hasProjectOverride: entry.hasProjectOverride,
      source: entry.source,
    }))).toEqual([
      {
        id: 'init',
        hidden: false,
        runtimeAvailable: true,
        hasProjectOverride: false,
        source: 'command',
      },
      {
        id: 'skill-review',
        hidden: false,
        runtimeAvailable: true,
        hasProjectOverride: false,
        source: 'skill',
      },
      {
        id: 'review',
        hidden: true,
        runtimeAvailable: true,
        hasProjectOverride: true,
        source: 'command',
      },
      {
        id: 'deploy',
        hidden: false,
        runtimeAvailable: false,
        hasProjectOverride: true,
        source: 'project',
      },
    ]);

    expect(buildVisibleSlashCommandMenuItems(merged)).toEqual([
      {
        id: 'init',
        description: 'Guided AGENTS.md setup',
        hasProjectOverride: false,
        runtimeAvailable: true,
        source: 'command',
        subtask: false,
        isBuiltin: true,
        skillSource: undefined,
      },
      {
        id: 'skill-review',
        description: 'Review with a skill',
        hasProjectOverride: false,
        runtimeAvailable: true,
        source: 'skill',
        subtask: false,
        isBuiltin: false,
        skillSource: undefined,
      },
    ]);
  });

  it('adds markdown file commands without overriding runtime or project commands', () => {
    const merged = mergeSlashCommandCatalog({
      runtimeCommands: [createRuntimeCommand({ name: 'runtime-first' })],
      runtimeSkillSources: new Map(),
      projectCommands: {
        'project-first': { template: 'Project template' },
      },
      projectAgents: {},
      hiddenCommandIds: new Set(),
      mdFileCommands: [
        {
          id: 'runtime-first',
          template: 'Markdown runtime duplicate',
          description: '',
        },
        {
          id: 'project-first',
          template: 'Markdown project duplicate',
          description: '',
        },
        {
          id: 'docs:review',
          template: 'Review $ARGUMENTS',
          description: 'Review docs',
        },
      ],
    });

    expect(merged.map((entry) => ({
      id: entry.id,
      source: entry.source,
      template: entry.template,
      runtimeAvailable: entry.runtimeAvailable,
    }))).toEqual([
      {
        id: 'runtime-first',
        source: 'command',
        template: '',
        runtimeAvailable: true,
      },
      {
        id: 'docs:review',
        source: 'md-command',
        template: 'Review $ARGUMENTS',
        runtimeAvailable: true,
      },
      {
        id: 'project-first',
        source: 'project',
        template: 'Project template',
        runtimeAvailable: false,
      },
    ]);

    expect(buildVisibleSlashCommandMenuItems(merged)).toEqual([
      expect.objectContaining({ id: 'runtime-first', source: 'command' }),
      expect.objectContaining({ id: 'docs:review', source: 'md-command' }),
    ]);
  });

  describe('Claude runtime commands', () => {
    function mergeWithClaudeCommands(
      claudeRuntimeCommands?: ClaudeRuntimeCommand[],
      overrides: Partial<Parameters<typeof mergeSlashCommandCatalog>[0]> = {},
    ) {
      return mergeSlashCommandCatalog({
        runtimeCommands: [],
        runtimeSkillSources: new Map(),
        projectCommands: {},
        projectAgents: {},
        hiddenCommandIds: new Set(),
        claudeRuntimeCommands,
        ...overrides,
      });
    }

    it('merges Claude runtime commands as claude-runtime entries', () => {
      const merged = mergeWithClaudeCommands([
        { name: 'memory', description: 'Manage Claude memory' },
        { name: 'doctor', description: 'Check Claude installation' },
      ]);

      expect(merged.map((entry) => ({
        id: entry.id,
        source: entry.source,
      }))).toEqual([
        { id: 'doctor', source: 'claude-runtime' },
        { id: 'memory', source: 'claude-runtime' },
      ]);
    });

    it('sets Claude command fields for slash menu execution', () => {
      const merged = mergeWithClaudeCommands([
        { name: 'permissions', description: 'Manage permissions' },
      ]);

      expect(merged[0]).toEqual(expect.objectContaining({
        id: 'permissions',
        template: '/permissions',
        description: 'Manage permissions',
        source: 'claude-runtime',
        runtimeAvailable: true,
        hasProjectOverride: false,
        hidden: false,
        subtask: false,
        isBuiltin: false,
      }));

      expect(buildVisibleSlashCommandMenuItems(merged)).toEqual([
        expect.objectContaining({
          id: 'permissions',
          description: 'Manage permissions',
          source: 'claude-runtime',
          runtimeAvailable: true,
        }),
      ]);
    });

    it('does not let Claude commands overwrite existing OpenCode entries', () => {
      const merged = mergeWithClaudeCommands(
        [{ name: 'shared-command', description: 'Claude command' }],
        {
          runtimeCommands: [
            createRuntimeCommand({
              name: 'shared-command',
              description: 'OpenCode command',
              template: 'OpenCode $ARGUMENTS',
            }),
          ],
        },
      );

      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(expect.objectContaining({
        id: 'shared-command',
        source: 'command',
        description: 'OpenCode command',
        template: 'OpenCode $ARGUMENTS',
      }));
    });

    it('treats an empty Claude commands array as a no-op', () => {
      const withEmptyClaudeCommands = mergeWithClaudeCommands([], {
        runtimeCommands: [createRuntimeCommand({ name: 'init' })],
      });
      const withoutClaudeCommands = mergeWithClaudeCommands(undefined, {
        runtimeCommands: [createRuntimeCommand({ name: 'init' })],
      });

      expect(withEmptyClaudeCommands).toEqual(withoutClaudeCommands);
    });

    it('treats undefined Claude commands as a no-op', () => {
      const merged = mergeSlashCommandCatalog({
        runtimeCommands: [createRuntimeCommand({ name: 'init' })],
        runtimeSkillSources: new Map(),
        projectCommands: {},
        projectAgents: {},
        hiddenCommandIds: new Set(),
      });

      expect(merged.map((entry) => entry.source)).toEqual(['command']);
      expect(merged).toHaveLength(1);
    });

    it('marks hidden Claude commands and excludes them from visible slash menu items', () => {
      const merged = mergeWithClaudeCommands(
        [
          { name: 'visible', description: 'Visible Claude command' },
          { name: 'hidden', description: 'Hidden Claude command' },
        ],
        { hiddenCommandIds: new Set(['hidden']) },
      );

      expect(merged.find((entry) => entry.id === 'hidden')).toEqual(expect.objectContaining({
        hidden: true,
        source: 'claude-runtime',
      }));
      expect(buildVisibleSlashCommandMenuItems(merged).map((item) => item.id)).toEqual(['visible']);
    });

    it('filters Claude commands with empty names', () => {
      const merged = mergeWithClaudeCommands([
        { name: '' },
        { name: '   ', description: 'Whitespace-only name' },
        { name: 'doctor', description: 'Valid command' },
      ]);

      expect(merged.map((entry) => entry.id)).toEqual(['doctor']);
    });

    it('sorts Claude runtime commands between skill and markdown command sources', () => {
      const sourcesInOrder: SlashCommandCatalogSource[] = mergeWithClaudeCommands(
        [{ name: 'claude-doctor', description: 'Claude doctor' }],
        {
          runtimeCommands: [
            createRuntimeCommand({ name: 'regular-command', source: 'command' }),
            createRuntimeCommand({ name: 'skill-command', source: 'skill' }),
          ],
          mdFileCommands: [
            {
              id: 'markdown-command',
              template: 'Markdown command',
              description: 'Markdown command',
            },
          ],
        },
      ).map((entry) => entry.source);

      expect(sourcesInOrder).toEqual([
        'command',
        'skill',
        'claude-runtime',
        'md-command',
      ]);
    });
  });
});
