import { AgentMentionCandidateService } from '../../../../../src/features/chat/services/AgentMentionCandidateService';

describe('AgentMentionCandidateService', () => {
  it('projects visible subagent/all catalog entries from runtime and project config', async () => {
    const service = new AgentMentionCandidateService({
      loadRuntimeAgents: jest.fn().mockResolvedValue([
        { name: 'primary', mode: 'primary', description: 'Main agent' },
        { name: 'runtime-reviewer', mode: 'subagent', description: 'Runtime reviewer' },
        { name: 'hidden-runtime', mode: 'subagent', hidden: true },
      ]),
      loadProjectAgents: jest.fn().mockResolvedValue({
        planner: {
          mode: 'all',
          description: 'Project planner',
        },
      }),
    });

    await expect(service.load()).resolves.toEqual([
      {
        id: 'planner',
        displayName: 'planner',
        description: 'Project planner',
        mode: 'all',
        hidden: false,
      },
      {
        id: 'runtime-reviewer',
        displayName: 'runtime-reviewer',
        description: 'Runtime reviewer',
        mode: 'subagent',
        hidden: false,
      },
    ]);
  });

  it('projects default-eligible primary/all agents for the composer agent selector', () => {
    const service = new AgentMentionCandidateService({
      loadRuntimeAgents: jest.fn(),
      loadProjectAgents: jest.fn(),
    });

    expect(service.defaultCandidates({
      runtimeAgentsResult: [
        { name: 'build', mode: 'primary', description: 'Main builder' },
        { name: 'reviewer', mode: 'subagent', description: 'Subagent only' },
        { name: 'planner', mode: 'all', description: 'Plans and executes' },
        { name: 'hidden', mode: 'primary', hidden: true },
      ],
      projectAgents: {
        disabled: {
          mode: 'primary',
          disable: true,
        },
      },
    })).toEqual([
      {
        id: 'planner',
        displayName: 'planner',
        description: 'Plans and executes',
        mode: 'all',
      },
      {
        id: 'build',
        displayName: 'build',
        description: 'Main builder',
        mode: 'primary',
      },
    ]);
  });
});
