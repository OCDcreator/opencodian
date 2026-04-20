import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';

import {
  buildVisibleSlashCommandMenuItems,
  mergeSlashCommandCatalog,
} from '../../../../src/core/config/slashCommandCatalog';
import type { OpencodeCommandConfigRecord } from '../../../../src/core/types';

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

describe('slashCommandCatalog', () => {
  it('merges runtime and project commands before building visible slash menu items', () => {
    const projectCommands: OpencodeCommandConfigRecord = {
      review: {
        description: 'Project review override',
      },
      deploy: {
        description: 'Project-only deploy command',
        agent: 'ops',
      },
    };

    const merged = mergeSlashCommandCatalog(
      [
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
      new Map(),
      projectCommands,
      {},
      new Set(['review']),
    );

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
        description: 'Guided setup',
        hasProjectOverride: false,
        runtimeAvailable: true,
        source: 'command',
        subtask: false,
      },
      {
        id: 'skill-review',
        description: 'Review with a skill',
        hasProjectOverride: false,
        runtimeAvailable: true,
        source: 'skill',
        subtask: false,
      },
      {
        id: 'deploy',
        description: 'Project-only deploy command',
        hasProjectOverride: true,
        runtimeAvailable: false,
        source: 'project',
        subtask: false,
      },
    ]);
  });
});
