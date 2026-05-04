import {
  AgentInvocationService,
  type SurfaceInvocationIntent,
} from '../../../../src/core/agents';

describe('AgentInvocationService', () => {
  const service = new AgentInvocationService();

  it('returns an empty resolution for missing or non-prompt intent', () => {
    expect(service.resolveInvocationIntent(undefined)).toEqual({
      invocationParts: [],
    });

    expect(service.resolveInvocationIntent({ kind: 'command', primaryAgent: 'plan' })).toEqual({
      invocationParts: [],
    });
  });

  it('trims and maps explicit prompt agent, mentions, and subtasks', () => {
    const intent: SurfaceInvocationIntent = {
      kind: 'prompt',
      primaryAgent: ' plan ',
      mentions: [
        {
          agentId: ' reviewer ',
          source: {
            value: '@reviewer',
            start: 4,
            end: 13,
          },
        },
      ],
      subtasks: [
        {
          agentId: ' explorer ',
          description: ' Audit routes ',
          prompt: ' Check the routing seams ',
          model: {
            providerID: 'openai',
            modelID: 'gpt-5.4',
          },
          command: ' /review ',
        },
      ],
    };

    expect(service.resolveInvocationIntent(intent)).toEqual({
      agent: 'plan',
      invocationParts: [
        {
          type: 'agent',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 4,
            end: 13,
          },
        },
        {
          type: 'subtask',
          description: 'Audit routes',
          prompt: 'Check the routing seams',
          agent: 'explorer',
          model: {
            providerID: 'openai',
            modelID: 'gpt-5.4',
          },
          command: '/review',
        },
      ],
    });
  });

  it('drops malformed mentions and subtasks instead of producing invalid native parts', () => {
    const intent: SurfaceInvocationIntent = {
      kind: 'prompt',
      mentions: [
        { agentId: '   ' },
      ],
      subtasks: [
        {
          agentId: 'explorer',
          description: '   ',
          prompt: '   ',
        },
      ],
    };

    expect(service.resolveInvocationIntent(intent)).toEqual({
      invocationParts: [],
    });
  });

  it('removes selected mention source spans from request text without touching invalid spans', () => {
    const resolved = service.resolveInvocationIntent({
      kind: 'prompt',
      mentions: [
        {
          agentId: 'reviewer',
          source: {
            value: '@reviewer',
            start: 11,
            end: 20,
          },
        },
        {
          agentId: 'explorer',
          source: {
            value: '@missing',
            start: 0,
            end: 8,
          },
        },
      ],
    });

    expect(service.removeMentionFallbackText(
      'please ask @reviewer to check this',
      resolved,
    )).toBe('please ask to check this');
  });
});
