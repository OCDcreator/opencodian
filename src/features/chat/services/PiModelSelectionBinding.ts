import type { PiModelInfo } from '../../../core/agents/backend/pi/PiAdapter';
import type { ModelSelectorProvider, ModelSelectorSelection } from '../ui/modelSelector/types';
import type { ModelSelectionRuntimeHost } from './ModelSelectionRuntime';

interface PiCatalogPort {
  start(): Promise<void>;
  getAvailableModels(): Promise<PiModelInfo[]>;
  getDefaultModel(): ModelSelectorSelection | null;
}

/** Pi-only model selection policy, composed around the existing host unchanged. */
export function bindPiModelSelection(
  host: ModelSelectionRuntimeHost,
  getAdapter: () => PiCatalogPort | null,
): ModelSelectionRuntimeHost {
  let providers: ModelSelectorProvider[] = [];
  return {
    ...host,
    preserveRequestedModel: () => getAdapter() !== null || host.preserveRequestedModel?.() === true,
    loadModelCatalogData() {
      const adapter = getAdapter();
      if (!adapter) return host.loadModelCatalogData();
      return (async () => {
        await adapter.start();
        const models = await adapter.getAvailableModels();
        const groups = new Map<string, ModelSelectorProvider>();
        for (const model of models) {
          const group = groups.get(model.provider) ?? { id: model.provider, name: model.provider, models: [] };
          group.models.push({ id: model.id, name: model.name, contextWindow: model.contextWindow, variants: model.reasoning ? ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] : [] });
          groups.set(model.provider, group);
        }
        providers = [...groups.values()];
        return { catalogBundle: null, providers };
      })();
    },
    getDefaultModelSelection() {
      const adapter = getAdapter();
      return adapter ? adapter.getDefaultModel() : host.getDefaultModelSelection();
    },
    isModelAvailableOnServer(provider, model) {
      if (!getAdapter()) return host.isModelAvailableOnServer(provider, model);
      return Promise.resolve(providers.some((group) => group.id === provider && group.models.some((entry) => entry.id === model)));
    },
    getActiveTabModelOverride() {
      const override = host.getActiveTabModelOverride();
      if (!getAdapter() || !override) return override;
      return override;
    },
  };
}
