import type { ZCodeAdapter } from '../../../core/agents/backend/zcode';
import type { ModelSelectorProvider, ModelSelectorSelection } from '../ui/modelSelector/types';
import type { ModelSelectionRuntimeHost } from './ModelSelectionRuntime';

interface ZCodeCatalogPort {
  start(): Promise<void>;
  getAvailableModels(): Promise<readonly { providerId: string; modelId: string; label: string; providerLabel: string; contextWindow: number | null; reasoningLevels: readonly { value: string }[] }[]>;
  getDefaultModel(): ModelSelectorSelection | null;
  getObservedModel?(): ModelSelectorSelection | null;
  getSession?(sessionId: string): Promise<unknown>;
}

/**
 * ZCode-only model selection policy, composed around the existing host
 * unchanged. The catalog is live (runtime snapshots + state.updated), with
 * per-model reasoning variants; when the catalog is unobserved the binding
 * reports unavailable honestly instead of fabricating a mirror.
 */
export function bindZCodeModelSelection(
  host: ModelSelectionRuntimeHost,
  getAdapter: () => ZCodeCatalogPort | null,
  getSessionId: () => string | null,
): ModelSelectionRuntimeHost {
  let providers: ModelSelectorProvider[] = [];
  const observedBySession = new Map<string, ModelSelectorSelection>();
  return {
    ...host,
    preserveRequestedModel: () => getAdapter() !== null || host.preserveRequestedModel?.() === true,
    loadModelCatalogData() {
      const adapter = getAdapter();
      if (!adapter) return host.loadModelCatalogData();
      return (async () => {
        await adapter.start();
        const sessionId = getSessionId();
        if (sessionId) {
          try {
            await adapter.getSession?.(sessionId);
          } catch {
            // A freshly created deferred session can be absent from
            // session/read until its first send. session/create has already
            // supplied the native catalog and current model in that case.
          }
          const observed = adapter.getObservedModel?.();
          if (observed) observedBySession.set(sessionId, observed);
        }
        const groups = new Map<string, ModelSelectorProvider>();
        try {
          const models = await adapter.getAvailableModels();
          for (const model of models) {
            const group = groups.get(model.providerId) ?? { id: model.providerId, name: model.providerLabel, models: [] };
            group.models.push({
              id: model.modelId,
              name: model.label,
              ...(model.contextWindow !== null ? { contextWindow: model.contextWindow } : {}),
              variants: model.reasoningLevels.map((level) => level.value),
            });
            groups.set(model.providerId, group);
          }
          providers = [...groups.values()];
        } catch {
          // Catalog unobserved: honest empty selector rather than a fabricated mirror.
          providers = [];
        }
        return { catalogBundle: null, providers };
      })();
    },
    getDefaultModelSelection() {
      const adapter = getAdapter();
      if (!adapter) return host.getDefaultModelSelection();
      const sessionId = getSessionId();
      return sessionId ? observedBySession.get(sessionId) ?? null : null;
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

export type { ZCodeAdapter };
