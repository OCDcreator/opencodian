import type { ModelSelectionRuntimeHost } from '../../../../src/features/chat/services/ModelSelectionRuntime';
import { bindZCodeModelSelection } from '../../../../src/features/chat/services/ZCodeModelSelectionBinding';

describe('ZCode first native model selection', () => {
  it('uses session/create readback when a deferred session cannot yet be read', async () => {
    const adapter = {
      start: jest.fn(async () => {}),
      getSession: jest.fn(async () => { throw new Error('Deferred session not materialized'); }),
      getObservedModel: jest.fn(() => ({ provider: 'opencode-go', model: 'gpt-5.6-luna' })),
      getAvailableModels: jest.fn(async () => [{
        providerId: 'opencode-go', modelId: 'gpt-5.6-luna', label: 'GPT 5.6 Luna',
        providerLabel: 'OpenCode Go', contextWindow: 200000, reasoningLevels: [{ value: 'max' }],
      }]),
    };
    const host = {} as ModelSelectionRuntimeHost;
    const binding = bindZCodeModelSelection(host, () => adapter, () => 'sess_deferred');

    const result = await binding.loadModelCatalogData();

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.models[0]?.id).toBe('gpt-5.6-luna');
    expect(binding.getDefaultModelSelection()).toEqual({ provider: 'opencode-go', model: 'gpt-5.6-luna' });
    expect(adapter.getSession).toHaveBeenCalledWith('sess_deferred');
  });
});
