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
});
