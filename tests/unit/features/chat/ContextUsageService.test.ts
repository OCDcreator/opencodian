/* eslint-disable max-lines-per-function -- Context usage tests keep identity, snapshot, billing-ledger, and cost-provenance assertions together as one state contract. */

import {
  createEmptyTabContextState,
  getDefaultContextWindow,
} from '../../../../src/core/types';
import { ContextUsageService } from '../../../../src/features/chat/services/ContextUsageService';

describe('ContextUsageService identity and totals', () => {
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

  it('applies refreshed usage snapshots without losing identity or precise totals', () => {
    const state = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'session-1',
        sessionTitle: 'Planning',
        createdAt: 1000,
        updatedAt: 2000,
        compactingAt: null,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 1000,
        inputTokens: 200,
        outputTokens: 100,
        reasoningTokens: 50,
        cacheReadTokens: 25,
        cacheWriteTokens: 25,
        totalCost: 1.25,
      },
    );

    expect(state).toMatchObject({
      sessionId: 'session-1',
      sessionTitle: 'Planning',
      createdAt: 1000,
      updatedAt: 2000,
      provider: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-5',
      modelName: 'GPT-5',
      contextWindow: 1000,
      preciseTokens: {
        total: 400,
        input: 200,
        output: 100,
        reasoning: 50,
        cacheRead: 25,
        cacheWrite: 25,
      },
      totalCost: 1.25,
      percentage: 40,
    });
  });

  it('preserves a restored authoritative context window when the model is unchanged', () => {
    const restored = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'codex-thread-1',
        sessionTitle: 'Codex task',
        createdAt: 100,
        updatedAt: 200,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5.4',
        modelName: 'GPT-5.4',
        contextWindow: 950000,
        totalTokens: 13812,
        inputTokens: 13778,
        outputTokens: 34,
        reasoningTokens: 24,
        cacheReadTokens: 1920,
        cacheWriteTokens: null,
        totalCost: null,
      },
    );

    const hydrated = ContextUsageService.syncStateIdentity(restored, {
      model: 'gpt-5.4',
    });

    expect(hydrated.contextWindow).toBe(950000);
    expect(ContextUsageService.summarize(hydrated).percentage).toBe(1);
  });

  it('uses the new model default when a restored snapshot changes models without a new window', () => {
    const restored = ContextUsageService.syncStateIdentity(
      createEmptyTabContextState(),
      {
        model: 'gpt-5.4',
        contextWindow: 950000,
      },
    );

    const switched = ContextUsageService.syncStateIdentity(restored, {
      model: 'gpt-5',
    });

    expect(switched.contextWindow).toBe(getDefaultContextWindow('gpt-5'));
  });

  it('surfaces live compaction state from refreshed snapshots', () => {
    const state = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'session-1',
        sessionTitle: 'Planning',
        createdAt: 1000,
        updatedAt: 2000,
        compactingAt: 2500,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 1000,
        inputTokens: 200,
        outputTokens: 100,
        reasoningTokens: 50,
        cacheReadTokens: 25,
        cacheWriteTokens: 25,
        totalCost: 1.25,
      },
    );

    const summary = ContextUsageService.summarize(state);

    expect(state.compactingAt).toBe(2500);
    expect(summary.isCompacting).toBe(true);
    expect(summary.ringLabel).toBe('…');
    expect(summary.tooltip).toContain('Compacting context');
  });

  it('keeps a separate billable request ledger without changing context-window token totals', () => {
    const base = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'claude-session-1',
        sessionTitle: 'Claude task',
        createdAt: 1,
        updatedAt: 2,
        providerId: 'anthropic',
        providerName: 'Anthropic',
        modelId: 'claude-test',
        modelName: 'Claude Test',
        contextWindow: 1000,
        totalTokens: 600,
        inputTokens: 600,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: null,
        totalCost: null,
      },
    );
    const updated = ContextUsageService.applyBillingUsage(base, {
      requestId: 'turn-1',
      providerId: 'anthropic',
      modelId: 'claude-test',
      inputTokens: 300,
      outputTokens: 120,
      reasoningTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: null,
    });
    const deduplicated = ContextUsageService.applyBillingUsage(updated, {
      requestId: 'turn-1',
      providerId: 'anthropic',
      modelId: 'claude-test',
      inputTokens: 300,
      outputTokens: 120,
      reasoningTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: null,
    });

    expect(ContextUsageService.getDisplayTokenBreakdown(updated).total).toBe(600);
    expect(updated.billingUsage).toMatchObject({
      requestIds: ['turn-1'],
      inputTokens: 300,
      outputTokens: 120,
      reasoningTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: null,
    });
    expect(deduplicated.billingUsage).toEqual(updated.billingUsage);
  });
});

describe('ContextUsageService breakdown and formatting', () => {
  it('uses the authoritative backend total instead of recomputing it from visible categories', () => {
    const state = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'codex-thread-1',
        sessionTitle: 'Codex task',
        createdAt: 100,
        updatedAt: 200,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 1000,
        totalTokens: 225,
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 25,
        cacheReadTokens: 25,
        cacheWriteTokens: null,
        totalCost: null,
      },
    );

    expect(state.preciseTokens).toEqual({
      total: 225,
      input: 100,
      output: 50,
      reasoning: 25,
      cacheRead: 25,
      cacheWrite: null,
    });
    expect(ContextUsageService.summarize(state).percentage).toBe(23);
    expect(ContextUsageService.getDisplayTokenBreakdown(state).cacheWrite).toBeNull();
    expect(ContextUsageService.formatCurrency(state.totalCost)).toBe('-');
  });

  it('drops a previous session snapshot before adopting a different conversation identity', () => {
    const previous = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'thread-old',
        sessionTitle: 'Old task',
        createdAt: 100,
        updatedAt: 200,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 1000,
        totalTokens: 500,
        inputTokens: 300,
        outputTokens: 100,
        reasoningTokens: 50,
        cacheReadTokens: 50,
        cacheWriteTokens: null,
        totalCost: 0.5,
      },
    );

    const next = ContextUsageService.syncStateIdentity(previous, undefined, {
      sessionId: 'thread-new',
      sessionTitle: 'New task',
    });

    expect(next.sessionId).toBe('thread-new');
    expect(next.preciseTokens).toBeNull();
    expect(next.estimatedInputTokens).toBe(0);
    expect(next.estimatedOutputTokens).toBe(0);
    expect(next.totalCost).toBeNull();
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
