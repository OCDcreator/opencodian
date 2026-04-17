import * as fs from 'fs';
import * as path from 'path';

import { getCommandScopedAgentId } from '../../../../src/core/config/commandScopedAgent';
import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}));

const testVaultPath = path.join(__dirname, 'test-vault-command-agent');
let manager: OpencodeConfigManager;

beforeEach(() => {
  fs.rmSync(testVaultPath, { recursive: true, force: true });
  fs.mkdirSync(testVaultPath, { recursive: true });
  manager = new OpencodeConfigManager(testVaultPath);
});

afterEach(() => {
  fs.rmSync(testVaultPath, { recursive: true, force: true });
});

describe('OpencodeConfigManager command-scoped agents', () => {
  it('generates and cleans up hidden command-scoped agents for local sampling fields', async () => {
    await manager.write({
      command: {
        review: {
          template: 'Review changes',
          agent: 'reviewer',
          model: 'anthropic/claude-sonnet-4',
          subtask: true,
        },
      },
      agent: {
        reviewer: {
          description: 'Project reviewer',
          mode: 'subagent',
          prompt: 'Review with care.',
          permission: {
            task: {
              '*': 'deny',
            },
          },
        },
      },
    });

    await manager.upsertCommandConfig(' review ', {
      temperature: 0.2,
      top_p: 0.85,
    });

    let config = await manager.read();
    const scopedAgentId = getCommandScopedAgentId('review');
    expect(config.command?.review).toEqual({
      template: 'Review changes',
      agent: scopedAgentId,
      model: 'anthropic/claude-sonnet-4',
      subtask: true,
    });
    expect(config.command?.review).not.toHaveProperty('temperature');
    expect(config.command?.review).not.toHaveProperty('top_p');
    expect(config.agent?.[scopedAgentId]).toEqual(expect.objectContaining({
      description: 'Project reviewer',
      hidden: true,
      mode: 'subagent',
      prompt: 'Review with care.',
      temperature: 0.2,
      top_p: 0.85,
      permission: {
        task: {
          '*': 'deny',
        },
      },
    }));
    expect(config.agent?.[scopedAgentId]?.options).toEqual(expect.objectContaining({
      opencodianCommand: {
        kind: 'slash-command-sampling',
        commandId: 'review',
        baseAgent: 'reviewer',
      },
    }));

    await manager.upsertCommandConfig('review', {
      agent: 'reviewer',
      temperature: undefined,
      top_p: undefined,
    });

    config = await manager.read();
    expect(config.command?.review?.agent).toBe('reviewer');
    expect(config.agent?.[scopedAgentId]).toBeUndefined();

    await manager.upsertCommandConfig('review', {
      temperature: 0.3,
    });
    await manager.removeCommandConfig('review');

    config = await manager.read();
    expect(config.command).toBeUndefined();
    expect(config.agent?.[scopedAgentId]).toBeUndefined();
  });
});
