import { ModelPricingService } from '../../../../src/core/config/ModelPricingService';
import type { ContextUsageSnapshot, ModelPricingOverride } from '../../../../src/core/types';

function createSnapshot(overrides: Partial<ContextUsageSnapshot> = {}): ContextUsageSnapshot {
  return {
    sessionId: 'session-1',
    sessionTitle: 'Pricing test',
    createdAt: 1,
    updatedAt: 2,
    compactingAt: null,
    providerId: 'openai',
    providerName: 'OpenAI',
    modelId: 'gpt-test',
    modelName: 'GPT Test',
    contextWindow: 100000,
    totalTokens: 3000000,
    inputTokens: 1000000,
    outputTokens: 1000000,
    reasoningTokens: 0,
    cacheReadTokens: 1000000,
    cacheWriteTokens: 0,
    totalCost: null,
    ...overrides,
  };
}

const payload = {
    openai: {
      name: 'OpenAI',
      models: {
        'gpt-test': {
          name: 'GPT Test',
          cost: {
            input: 2,
            output: 8,
            cache_read: 0.5,
            cache_write: 3,
          },
        },
        'gpt-tiered': {
          name: 'GPT Tiered',
          cost: {
            input: 1,
            output: 4,
            tiers: [{ input: 2 }],
          },
        },
      },
    },
    zai: {
      name: 'Z.AI',
      models: {
        'glm-4.7': {
          name: 'GLM 4.7',
          cost: {
            input: 1,
            output: 4,
          },
        },
      },
    },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createService(
  overrides: ModelPricingOverride[] = [],
  fetchCatalog: () => Promise<unknown> = jest.fn().mockResolvedValue(payload),
) {
  const storage = {
    loadModelPricingCatalog: jest.fn().mockResolvedValue(null),
    saveModelPricingCatalog: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ModelPricingService({
    storage,
    getOverrides: () => overrides,
    fetchCatalog,
  });
  return { service, storage };
}

describe('ModelPricingService', () => {

  it('normalizes and persists every priced models.dev entry on a manual refresh', async () => {
    const { service, storage } = createService();

    await service.refresh();

    expect(service.getStatus()).toMatchObject({ entryCount: 3 });
    expect(service.getCatalogEntry('openai', 'gpt-tiered')).toMatchObject({
      providerName: 'OpenAI',
      modelName: 'GPT Tiered',
      hasTieredPricing: true,
    });
    expect(storage.saveModelPricingCatalog).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1,
      entries: expect.arrayContaining([
        expect.objectContaining({ providerId: 'openai', modelId: 'gpt-test' }),
      ]),
    }));
  });

  it('automatically fetches an empty catalogue in the background so no pricing setup is required', async () => {
    const { service, storage } = createService();

    await service.load();
    // Drain the fire-and-forget refresh's microtask chain (no setImmediate in
    // the jest environment).
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }

    expect(service.getStatus()).toMatchObject({ entryCount: 3 });
    expect(storage.saveModelPricingCatalog).toHaveBeenCalledTimes(1);
  });

  it('keeps plugin startup non-blocking when the auto-refresh fetch stalls', async () => {
    const storage = {
      loadModelPricingCatalog: jest.fn().mockResolvedValue(null),
      saveModelPricingCatalog: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ModelPricingService({
      storage,
      getOverrides: () => [],
      fetchCatalog: () => new Promise(() => { /* never settles */ }),
    });

    await service.load();

    expect(storage.saveModelPricingCatalog).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ entryCount: 0 });
  });

  it('shares a pending automatic refresh with every manual caller, including cache persistence', async () => {
    const fetch = deferred<unknown>();
    const save = deferred<void>();
    const fetchCatalog = jest.fn().mockReturnValueOnce(fetch.promise).mockResolvedValue(payload);
    const { service, storage } = createService([], fetchCatalog);
    storage.saveModelPricingCatalog.mockReturnValueOnce(save.promise);

    await service.load();
    const first = service.refresh();
    const second = service.refresh();
    expect(first).toBe(second);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);

    fetch.resolve(payload);
    await Promise.resolve();
    expect(service.refresh()).toBe(first);
    expect(storage.saveModelPricingCatalog).toHaveBeenCalledTimes(1);

    save.resolve(undefined);
    const results = await Promise.all([first, second]);
    expect(results).toEqual([
      expect.objectContaining({ entryCount: 3 }),
      expect.objectContaining({ entryCount: 3 }),
    ]);
    const next = service.refresh();
    expect(next).not.toBe(first);
    await next;
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
    expect(storage.saveModelPricingCatalog).toHaveBeenCalledTimes(2);
  });

  it('allows a new refresh after a shared network failure without publishing a catalog', async () => {
    const fetch = deferred<unknown>();
    const fetchCatalog = jest.fn().mockReturnValueOnce(fetch.promise).mockResolvedValue(payload);
    const { service } = createService([], fetchCatalog);
    const listener = jest.fn();
    service.onCatalogUpdated(listener);
    const first = service.refresh();
    const second = service.refresh();
    const rejection = Promise.allSettled([first, second]);

    fetch.reject(new Error('offline'));
    expect(await rejection).toEqual([
      { status: 'rejected', reason: new Error('offline') },
      { status: 'rejected', reason: new Error('offline') },
    ]);

    expect(listener).not.toHaveBeenCalled();
    expect(service.getStatus().entryCount).toBe(0);
    await service.refresh();
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('publishes the available in-memory catalog even when persistence fails, and permits retry', async () => {
    const { service, storage } = createService();
    const save = deferred<void>();
    storage.saveModelPricingCatalog.mockReturnValueOnce(save.promise);
    const listener = jest.fn(() => service.getStatus().entryCount);
    service.onCatalogUpdated(listener);
    const refresh = service.refresh();
    const rejection = Promise.allSettled([refresh]);

    await Promise.resolve();
    expect(listener).toHaveReturnedWith(3);
    expect(service.getCatalogEntry('openai', 'gpt-test')).not.toBeNull();
    save.reject(new Error('disk full'));
    expect(await rejection).toEqual([{ status: 'rejected', reason: new Error('disk full') }]);

    expect(service.getStatus().entryCount).toBe(3);
    await service.refresh();
    expect(storage.saveModelPricingCatalog).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('isolates failing listeners and honors disposal when logging fails: %s', async (loggingFails) => {
    const { service, storage } = createService();
    const disposed = jest.fn();
    const failing = jest.fn(() => { throw new Error('consumer failed'); });
    const healthy = jest.fn();
    const subscription = service.onCatalogUpdated(disposed);
    service.onCatalogUpdated(failing);
    service.onCatalogUpdated(healthy);
    subscription.dispose();
    subscription.dispose();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
      if (loggingFails) throw new Error('diagnostics failed');
    });
    try {
      await expect(service.refresh()).resolves.toMatchObject({ entryCount: 3 });

      expect(disposed).not.toHaveBeenCalled();
      expect(failing).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledTimes(1);
      expect(storage.saveModelPricingCatalog).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('publishes a fresh local cache without starting a network refresh', async () => {
    const fetchCatalog = jest.fn().mockResolvedValue(payload);
    const { service, storage } = createService([], fetchCatalog);
    const catalog = { schemaVersion: 1, fetchedAt: Date.now(), entries: [] };
    storage.loadModelPricingCatalog.mockResolvedValue(catalog);
    const listener = jest.fn();
    service.onCatalogUpdated(listener);

    await service.load();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(service.getStatus().fetchedAt).toBe(catalog.fetchedAt);
    expect(fetchCatalog).not.toHaveBeenCalled();
  });
});

describe('ModelPricingService cost estimates', () => {
  it('uses all reported token categories and keeps tiered price estimates explicitly approximate', async () => {
    const { service } = createService();
    await service.refresh();

    const estimate = service.enrichContextUsageSnapshot(createSnapshot({
      modelId: 'gpt-tiered',
      modelName: 'GPT Tiered',
      cacheReadTokens: 0,
      cacheWriteTokens: null,
    }));

    expect(estimate.totalCost).toBe(5);
    expect(estimate.costDetails).toMatchObject({
      source: 'models-dev',
      completeness: 'complete',
      usesBaseTier: true,
    });
  });

  it('marks an undisclosed billable cache-write category partial instead of charging it as zero', async () => {
    const { service } = createService();
    await service.refresh();

    const estimate = service.enrichContextUsageSnapshot(createSnapshot({ cacheWriteTokens: null }));

    expect(estimate.totalCost).toBe(10.5);
    expect(estimate.costDetails).toMatchObject({
      completeness: 'partial',
      unavailableTokenKinds: ['cache-write'],
    });
  });

  it('applies a local override over the catalogue without masking a backend-reported cost', async () => {
    const overrides: ModelPricingOverride[] = [{
      providerId: 'openai',
      endpoint: null,
      modelId: 'gpt-test',
      inputPerMillion: 4,
      outputPerMillion: 10,
      cacheReadPerMillion: null,
      cacheWritePerMillion: null,
      updatedAt: 3,
    }];
    const { service } = createService(overrides);
    await service.refresh();

    const overrideEstimate = service.enrichContextUsageSnapshot(createSnapshot({
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }));
    const reported = service.enrichContextUsageSnapshot(createSnapshot({ totalCost: 0.42 }));

    expect(overrideEstimate.totalCost).toBe(14);
    expect(overrideEstimate.costDetails?.source).toBe('user-override');
    expect(reported.totalCost).toBe(0.42);
    expect(reported.costDetails?.source).toBe('backend-reported');
  });

  it('uses an endpoint-specific override before a provider-wide fallback', async () => {
    const overrides: ModelPricingOverride[] = [
      {
        providerId: 'openai',
        endpoint: null,
        modelId: 'gpt-test',
        inputPerMillion: 4,
        outputPerMillion: 10,
        cacheReadPerMillion: null,
        cacheWritePerMillion: null,
        updatedAt: 3,
      },
      {
        providerId: 'openai',
        endpoint: 'https://gateway.example/v1',
        modelId: 'gpt-test',
        inputPerMillion: 6,
        outputPerMillion: null,
        cacheReadPerMillion: null,
        cacheWritePerMillion: null,
        updatedAt: 4,
      },
    ];
    const { service } = createService(overrides);
    await service.refresh();

    const estimate = service.enrichContextUsageSnapshot(createSnapshot({
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }), {
      providerId: 'openai',
      endpoint: 'https://gateway.example/v1/',
    });

    expect(estimate.totalCost).toBe(16);
    expect(estimate.costDetails).toMatchObject({
      source: 'user-override',
      endpoint: 'https://gateway.example/v1',
    });
  });

  it('automatically resolves an otherwise unknown model through a unique models.dev entry', async () => {
    const { service } = createService();
    await service.refresh();

    const estimate = service.enrichContextUsageSnapshot(createSnapshot({
      providerId: null,
      providerName: null,
      modelId: 'glm-4.7',
      modelName: 'GLM 4.7',
      inputTokens: 1000000,
      outputTokens: 1000000,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }));

    expect(estimate.totalCost).toBe(5);
    expect(estimate.costDetails).toMatchObject({
      source: 'models-dev',
      providerId: 'zai',
      endpoint: null,
      modelId: 'glm-4.7',
    });
  });

  it('uses the separate Claude billing ledger rather than context-window input totals', async () => {
    const { service } = createService();
    await service.refresh();

    const estimate = service.enrichContextUsageSnapshot(createSnapshot({
      inputTokens: 999999,
      outputTokens: 0,
      cacheReadTokens: 0,
      billingUsage: {
        requestIds: ['turn-1'],
        providerId: 'openai',
        modelId: 'gpt-test',
        inputTokens: 2000000,
        outputTokens: 1000000,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    }));

    expect(estimate.totalCost).toBe(12);
  });
});
