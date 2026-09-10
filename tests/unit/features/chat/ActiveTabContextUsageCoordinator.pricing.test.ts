import type { App } from 'obsidian';

import { ModelPricingService } from '../../../../src/core/config/ModelPricingService';
import { type ContextUsageSnapshot, createEmptyTabContextState, type TabContextState } from '../../../../src/core/types';
import { ActiveTabContextUsageCoordinator, type ActiveTabContextUsageCoordinatorHost } from '../../../../src/features/chat/services/ActiveTabContextUsageCoordinator';
import { ContextUsageService } from '../../../../src/features/chat/services/ContextUsageService';
import { ContextDetailModal } from '../../../../src/features/chat/ui/ContextDetailModal';

function snapshot(sessionId: string): ContextUsageSnapshot {
  return {
    sessionId, sessionTitle: sessionId, createdAt: 1, updatedAt: 2, compactingAt: null,
    providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-test', modelName: 'GPT Test',
    contextWindow: 100000, totalTokens: 2000000, inputTokens: 1000000, outputTokens: 1000000,
    reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: null,
  };
}

function fixture() {
  let resolve!: (value: unknown) => void;
  const remote = new Promise<unknown>((done) => { resolve = done; });
  const service = new ModelPricingService({
    storage: { loadModelPricingCatalog: async () => null, saveModelPricingCatalog: async () => undefined },
    getOverrides: () => [], fetchCatalog: () => remote,
  });
  const states = new Map<string, TabContextState>(['one', 'two'].map((id) => [
    id, ContextUsageService.applyUsageSnapshot(createEmptyTabContextState(), snapshot(`s-${id}`)),
  ]));
  const host = {
    getContextUsageTabIds: () => [...states.keys()],
    hasTab: (id: string) => states.has(id),
    hasActiveTab: () => true,
    getActiveTabId: () => 'one',
    getTabContextUsage: (id: string) => states.get(id) ?? null,
    getActiveTabContextUsage: () => states.get('one'),
    setTabContextUsage: (id: string, state: TabContextState) => states.set(id, state),
    setActiveTabContextUsage: (state: TabContextState) => states.set('one', state),
    onPricingCatalogUpdated: (listener: () => void) => service.onCatalogUpdated(listener),
    enrichContextUsageSnapshot: jest.fn((raw: ContextUsageSnapshot, id: string) => service.enrichContextUsageSnapshot(
      raw, { providerId: id === 'two' ? 'anthropic' : 'openai' },
    )),
    renderContextUsageIndicator: jest.fn(),
    persistContextUsageSnapshot: jest.fn().mockResolvedValue(undefined),
    getCurrentConversation: () => ({ id: 'c-one', backend: 'codex', backendSessionId: 's-one',
      title: 'one', createdAt: 1, updatedAt: 2, lastContextUsage: snapshot('s-one') }),
    getCurrentSessionModel: () => ({ provider: 'openai', model: 'gpt-test' }),
    getCurrentSessionModelResolution: () => ({ providerName: 'OpenAI', modelName: 'GPT Test', contextWindow: 100000 }),
    findKnownModelInfo: () => null,
  };
  const coordinator = new ActiveTabContextUsageCoordinator(host as unknown as ActiveTabContextUsageCoordinatorHost);
  const complete = async () => {
    const pending = service.refresh();
    resolve({
      openai: { models: { 'gpt-test': { cost: { input: 2, output: 8 } } } },
      anthropic: { models: { 'gpt-test': { cost: { input: 3, output: 5 } } } },
    });
    await pending;
  };
  return { service, states, host, coordinator, complete };
}

describe('catalog readiness and per-tab current costs', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('updates both tabs on completion with their own pricing identity and preserves token truth', async () => {
    const { service, states, host, coordinator, complete } = fixture();
    const before = states.get('two')!;
    await service.load();
    coordinator.connectPricingUpdates();
    const observer = jest.fn();
    coordinator.onPricingUpdated(observer);
    await complete();
    expect(states.get('one')?.totalCost).toBe(10);
    expect(states.get('two')?.totalCost).toBe(8);
    expect(states.get('two')).toEqual({ ...before, totalCost: 8, costDetails: expect.objectContaining({ providerId: 'anthropic' }) });
    expect(observer).toHaveBeenCalledTimes(2);
    await jest.runOnlyPendingTimersAsync();
    expect(host.persistContextUsageSnapshot).toHaveBeenCalledWith('two', expect.objectContaining({ sessionId: 's-two', totalCost: 8 }));
    coordinator.dispose();
  });

  it('preserves already priced historical or backend amounts including zero', async () => {
    const { states, coordinator, complete } = fixture();
    states.get('one')!.totalCost = 0;
    states.get('two')!.totalCost = 7;
    coordinator.connectPricingUpdates();
    await complete();
    expect(states.get('one')?.totalCost).toBe(0);
    expect(states.get('two')?.totalCost).toBe(7);
    coordinator.dispose();
  });

  it('reprices unavailable state restored after the catalog was already ready', async () => {
    const { states, coordinator, complete } = fixture();
    await complete();
    states.set('one', createEmptyTabContextState());
    coordinator.connectPricingUpdates();
    coordinator.syncIdentity();
    expect(states.get('one')?.totalCost).toBe(10);
    coordinator.dispose();
  });

  it('uses the background tab billing ledger without borrowing the active tab ledger', async () => {
    const { states, coordinator, complete } = fixture();
    states.get('two')!.billingUsage = { requestIds: ['background-turn'], providerId: 'anthropic', modelId: 'gpt-test',
      inputTokens: 2000000, outputTokens: 1000000, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    coordinator.connectPricingUpdates();
    await complete();
    expect(states.get('two')?.totalCost).toBe(11);
    expect(states.get('two')?.billingUsage?.requestIds).toEqual(['background-turn']);
    expect(states.get('one')?.totalCost).toBe(10);
    coordinator.dispose();
  });

  it('unsubscribes on disposal and flushes pending snapshots without leaving timers', async () => {
    const { service, states, coordinator, host, complete } = fixture();
    await service.load();
    coordinator.connectPricingUpdates();
    coordinator.applyContextUsageSnapshotToTab('one', snapshot('s-one'));
    coordinator.dispose();
    await complete();
    await jest.runOnlyPendingTimersAsync();
    expect(states.get('one')?.totalCost).toBeNull();
    expect(host.persistContextUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(host.persistContextUsageSnapshot).toHaveBeenCalledWith('one', expect.objectContaining({ sessionId: 's-one', totalCost: null }));
  });

  it.each([null, 99])('prices the modal original tokens when newer usage reports cost %s before catalog readiness', async (reportedCost) => {
    const { service, states, coordinator, complete } = fixture();
    await service.load();
    coordinator.connectPricingUpdates();
    const originalState = states.get('one')!;
    const modal = new ContextDetailModal({} as App, {
      conversation: null, contextState: originalState,
      priceSnapshotCost: (state) => coordinator.priceSnapshotCost('one', state),
      subscribeToPricingUpdates: (listener) => coordinator.onPricingUpdated((id, state) => {
        if (id === 'one' && state.sessionId === originalState.sessionId) listener(state);
      }),
    });
    modal.onOpen();
    coordinator.applyContextUsageSnapshotToTab('one', { ...snapshot('s-one'), inputTokens: 6000000, totalTokens: 7000000, totalCost: reportedCost });
    await complete();
    expect(states.get('one')?.totalCost).toBe(reportedCost ?? 20);
    expect(modal.contentEl.textContent).toContain('$10.00');
    expect(modal.contentEl.textContent).not.toContain('$20.00');
    expect(modal.contentEl.textContent).not.toContain('$99.00');
    modal.onClose();
    coordinator.dispose();
  });
});
