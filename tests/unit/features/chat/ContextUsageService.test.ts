import { createEmptyTabContextState } from '../../../../src/core/types';
import { ContextUsageService } from '../../../../src/features/chat/services/ContextUsageService';

describe('ContextUsageService', () => {
  it('stores session metadata while syncing identity', () => {
    const state = ContextUsageService.syncStateIdentity(
      createEmptyTabContextState(),
      {
        provider: 'openai',
        providerName: 'OpenAI',
        model: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 400000,
      },
      {
        sessionId: 'session-1',
        sessionTitle: 'Planning',
        createdAt: 1000,
        updatedAt: 2000,
      },
    );

    expect(state).toMatchObject({
      provider: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-5',
      modelName: 'GPT-5',
      contextWindow: 400000,
      sessionId: 'session-1',
      sessionTitle: 'Planning',
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it('uses precise tokens for totals and tooltip cost', () => {
    const state = ContextUsageService.applyPreciseUsage(
      ContextUsageService.syncStateIdentity(
        createEmptyTabContextState(),
        {
          model: 'gpt-5',
          contextWindow: 1000,
        },
      ),
      {
        input: 200,
        output: 100,
        reasoning: 50,
        cacheRead: 25,
        cacheWrite: 25,
        totalCost: 1.25,
      },
    );

    const summary = ContextUsageService.summarize(state);
    const tokens = ContextUsageService.getDisplayTokenBreakdown(state);

    expect(tokens).toEqual({
      input: 200,
      output: 100,
      reasoning: 50,
      cacheRead: 25,
      cacheWrite: 25,
      total: 400,
    });
    expect(summary.percentage).toBe(40);
    expect(summary.tooltip).toContain('Total cost:');
    expect(summary.tooltip).toContain('Total tokens: 400');
  });

  it('estimates context breakdown from messages and system prompt', () => {
    const state = ContextUsageService.applyPreciseUsage(
      ContextUsageService.syncStateIdentity(
        createEmptyTabContextState(),
        {
          model: 'gpt-5',
          contextWindow: 1000,
        },
      ),
      {
        input: 50,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    );

    const breakdown = ContextUsageService.getContextBreakdown(
      state,
      [
        {
          id: 'user-1',
          role: 'user',
          content: 'Need help',
          timestamp: 1,
          parts: [
            {
              type: 'text',
              text: 'A'.repeat(40),
            },
          ],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Response',
          timestamp: 2,
          parts: [
            {
              type: 'reasoning',
              text: 'B'.repeat(20),
            },
            {
              type: 'tool',
              state: {
                status: 'completed',
                input: { path: '/tmp/demo.md' },
                output: 'C'.repeat(30),
              },
            },
          ],
        },
      ],
      'S'.repeat(16),
    );

    expect(breakdown.map((segment) => segment.key)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'other',
    ]);
    expect(breakdown.reduce((sum, segment) => sum + segment.tokens, 0)).toBe(50);
    expect(breakdown.find((segment) => segment.key === 'other')?.tokens).toBeGreaterThan(0);
  });

  it('scales breakdown segments down when estimates exceed input tokens', () => {
    const state = ContextUsageService.applyPreciseUsage(
      ContextUsageService.syncStateIdentity(
        createEmptyTabContextState(),
        {
          model: 'gpt-5',
          contextWindow: 1000,
        },
      ),
      {
        input: 10,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    );

    const breakdown = ContextUsageService.getContextBreakdown(
      state,
      [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Long response',
          timestamp: 1,
          parts: [
            {
              type: 'text',
              text: 'D'.repeat(120),
            },
          ],
        },
      ],
      '',
    );

    expect(breakdown.reduce((sum, segment) => sum + segment.tokens, 0)).toBe(10);
    expect(breakdown.every((segment) => segment.tokens >= 0)).toBe(true);
  });

  it('keeps small currency values visible instead of rounding them to zero', () => {
    const formatted = ContextUsageService.formatCurrency(0.0008);
    expect(formatted).toMatch(/0\.0008|0,0008/);
    expect(formatted).not.toMatch(/(?:^|[^0-9])0[.,]00(?:[^0-9]|$)/);
  });
});
