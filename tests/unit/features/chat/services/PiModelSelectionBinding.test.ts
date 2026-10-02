import { ModelSelectionRuntime, type ModelSelectionRuntimeHost } from '../../../../../src/features/chat/services/ModelSelectionRuntime';
import { bindPiModelSelection } from '../../../../../src/features/chat/services/PiModelSelectionBinding';

function originalHost(): ModelSelectionRuntimeHost {
  return {
    loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [{ id: 'original', name: 'Original', models: [] }] })),
    getActiveTabModelOverride: jest.fn(() => ({ provider: 'original', model: 'model' })),
    setActiveTabModelOverride: jest.fn(() => true),
    getDefaultModelSelection: jest.fn(() => ({ provider: 'original', model: 'model' })),
    syncActiveTabContextUsageIdentity: jest.fn(),
    getModelSourceMode: jest.fn(() => 'server' as const),
    isModelAvailableOnServer: jest.fn(async () => true),
  };
}

describe('Pi model selection isolation', () => {
  it('blocks an unavailable Pi selection through the shared runtime without selecting the first model', async () => {
    const runtime = new ModelSelectionRuntime(bindPiModelSelection(originalHost(), () => ({
      start: async () => {}, getDefaultModel: () => ({ provider: 'pi', model: 'available' }),
      getAvailableModels: async () => [{ id: 'available', provider: 'pi', name: 'Available' }],
    })));
    await runtime.reloadModelCatalog();
    expect(runtime.getCurrentSessionModel()).toEqual({ provider: 'original', model: 'model' });
    expect(await runtime.ensureSelectedModelAvailable('original', 'model')).toBe(false);
  });
  it.each(['opencode', 'claude-code', 'codex'])('delegates unchanged for %s', async () => {
    const host = originalHost();
    const binding = bindPiModelSelection(host, () => null);
    const originalPromise = host.loadModelCatalogData();
    host.loadModelCatalogData = jest.fn(() => originalPromise);
    expect(binding.loadModelCatalogData()).toBe(originalPromise);
    expect(await binding.loadModelCatalogData()).toEqual(await host.loadModelCatalogData());
    expect(binding.getDefaultModelSelection()).toEqual(host.getDefaultModelSelection());
    expect(binding.getActiveTabModelOverride()).toEqual(host.getActiveTabModelOverride());
    expect(binding.setActiveTabModelOverride).toBe(host.setActiveTabModelOverride);
    expect(await binding.isModelAvailableOnServer('original', 'model')).toBe(true);
  });

  it('loads only Pi models and prevents old backend selections from leaking', async () => {
    const host = originalHost();
    const binding = bindPiModelSelection(host, () => ({
      start: async () => {},
      getDefaultModel: () => ({ provider: 'pi-provider', model: 'pi-model' }),
      getAvailableModels: async () => [{ id: 'pi-model', provider: 'pi-provider', name: 'Pi model', reasoning: true }],
      getAvailableThinkingLevels: async () => ({ levels: ['off', 'low', 'high', 'max'] }),
      command: async () => ({ model: { provider: 'pi-provider', id: 'pi-model' } }),
    }));
    expect((await binding.loadModelCatalogData()).providers).toEqual([{ id: 'pi-provider', name: 'pi-provider', models: [{ id: 'pi-model', name: 'Pi model', contextWindow: undefined, variants: ['off', 'low', 'high', 'max'] }] }]);
    expect(host.loadModelCatalogData).not.toHaveBeenCalled();
    expect(binding.getDefaultModelSelection()).toEqual({ provider: 'pi-provider', model: 'pi-model' });
    expect(binding.getActiveTabModelOverride()).toEqual({ provider: 'original', model: 'model' });
    expect(binding.preserveRequestedModel?.()).toBe(true);
    expect(await binding.isModelAvailableOnServer('pi-provider', 'pi-model')).toBe(true);
    expect(await binding.isModelAvailableOnServer('original', 'model')).toBe(false);
  });
});


describe('Pi dynamic current-session variants', () => {
  it('uses the active local handle and does not apply its levels to other models', async () => {
    const read = jest.fn(async () => ({ levels: ['off', 'max', 'future-sdk-level'] }));
    const command = jest.fn(async () => ({ model: { provider: 'pi', id: 'current' } }));
    const binding = bindPiModelSelection(originalHost(), () => ({
      start: async () => {}, getDefaultModel: () => ({ provider: 'pi', model: 'different-default' }), getAvailableThinkingLevels: read, command,
      getAvailableModels: async () => [ { provider: 'pi', id: 'current', name: 'Current', reasoning: true }, { provider: 'pi', id: 'other', name: 'Other', reasoning: true } ],
    }), () => 'pi-local-handle');
    const models = (await binding.loadModelCatalogData()).providers[0].models;
    expect(read).toHaveBeenCalledWith('pi-local-handle'); expect(command).toHaveBeenCalledWith('pi-local-handle', 'get_state');
    expect(models[0].variants).toEqual(['off', 'max', 'future-sdk-level']); expect(models[1].variants).toEqual([]);
  });
  it.each(['unavailable', 'failed'])('keeps model catalog but no guessed variants on %s', async state => {
    const binding = bindPiModelSelection(originalHost(), () => ({
      start: async () => {}, getDefaultModel: () => null,
      getAvailableThinkingLevels: async () => { if (state === 'failed') throw new Error('fixture'); return { status: 'unavailable', reason: 'legacy SDK' }; },
      getAvailableModels: async () => [{ provider: 'pi', id: 'model', name: 'Model', reasoning: true }],
    }));
    expect((await binding.loadModelCatalogData()).providers[0].models[0].variants).toEqual([]);
  });
});

it('does not assign levels to a model changed during the read', async () => {
  const command = jest.fn().mockResolvedValueOnce({ model: { provider: 'pi', id: 'before' } }).mockResolvedValueOnce({ model: { provider: 'pi', id: 'after' } });
  const binding = bindPiModelSelection(originalHost(), () => ({ start: async () => {}, getDefaultModel: () => null, command,
    getAvailableThinkingLevels: async () => ({ levels: ['max'] }),
    getAvailableModels: async () => [{ provider: 'pi', id: 'after', name: 'After', reasoning: true }],
  }), () => 'pi-local');
  expect((await binding.loadModelCatalogData()).providers[0].models[0].variants).toEqual([]);
});
