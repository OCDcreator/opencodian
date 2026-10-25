import { type ContextUsageSnapshot, createEmptyTabContextState } from '../../../../src/core/types/chat';
import { ContextUsageService } from '../../../../src/features/chat/services/context/ContextUsageService';
import { ContextDetailModal } from '../../../../src/features/chat/ui/ContextDetailModal';

const snapshot: ContextUsageSnapshot = {
  sessionId: 'dsh-session', sessionTitle: 'DSH', createdAt: 1, updatedAt: 2,
  providerId: null, providerName: null, modelId: null, modelName: null,
  contextWindow: 1000, totalTokens: 240, inputTokens: 0, outputTokens: 0,
  reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: null, totalCost: null,
  tokenBreakdownAvailable: false,
};

describe('DSH aggregate context evidence', () => {
  it('shows native occupancy even when model identity is unknown, with no fabricated category breakdown', () => {
    const state = ContextUsageService.applyUsageSnapshot(createEmptyTabContextState(), snapshot);
    expect(ContextUsageService.summarize(state)).toMatchObject({ totalTokens: 240, percentage: 24, isUnavailable: false });
    expect(ContextUsageService.getContextBreakdown(state, [])).toEqual([]);
    expect(ContextUsageService.createUsageSnapshot(state)).toMatchObject({ tokenBreakdownAvailable: false, totalCost: null });
    const modal = Object.assign(Object.create(ContextDetailModal.prototype), { contextState: state }) as {
      getUsageValues(summary: unknown, tokens: unknown, hasTokens: boolean): unknown;
    };
    expect(modal.getUsageValues(ContextUsageService.summarize(state), ContextUsageService.getDisplayTokenBreakdown(state), true))
      .toMatchObject({ total: '240', input: '-', output: '-', reasoning: '-', cache: '-' });
    const other = ContextUsageService.syncStateIdentity(state, { model: 'another-model' }, { sessionId: 'another-session' });
    expect(other.tokenBreakdownAvailable).toBeUndefined();
  });
});
