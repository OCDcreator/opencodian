import { Notice } from 'obsidian';

import type { PiModelInfo } from '../../../core/agents/backend/pi/PiAdapter';
import type { PiAvailableThinkingLevelsResult, PiCommandName, PiUnavailableCommandResult } from '../../../core/agents/backend/pi/PiProtocol';
import type { PiRecord } from '../../../core/agents/backend/pi/PiRpcClient';
import { t } from '../../../i18n';
import type { ModelSelectorProvider, ModelSelectorSelection } from '../ui/modelSelector/types';
import type { ModelSelectionRuntimeHost } from './ModelSelectionRuntime';

interface PiCatalogPort {
  start(): Promise<void>;
  getAvailableModels(): Promise<PiModelInfo[]>;
  getDefaultModel(): ModelSelectorSelection | null;
  getAvailableThinkingLevels?(sessionId?: string): Promise<PiRecord | PiAvailableThinkingLevelsResult | PiUnavailableCommandResult>;
  command?(sessionId: string | undefined, type: PiCommandName): Promise<PiRecord>;
}

/** Pi-only model selection policy, composed around the existing host unchanged. */
export function bindPiModelSelection(
  host: ModelSelectionRuntimeHost,
  getAdapter: () => PiCatalogPort | null,
  getSessionId: () => string | null | undefined = () => undefined,
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
        let levels: string[] = [];
        let currentModel: { id?: unknown; provider?: unknown } = {};
        try {
          const sessionId = getSessionId() ?? undefined;
          const before = await adapter.command?.(sessionId, 'get_state');
          const result = adapter.getAvailableThinkingLevels
            ? await adapter.getAvailableThinkingLevels(sessionId)
            : await adapter.command?.(sessionId, 'get_available_thinking_levels');
          const reported = result && 'levels' in result ? result.levels : undefined;
          if (Array.isArray(reported) && reported.every(level => typeof level === 'string')) {
            levels = [...new Set(reported as string[])];
            const state = await adapter.command?.(sessionId, 'get_state');
            const beforeModel = before?.model as typeof currentModel | undefined;
            const afterModel = state?.model as typeof currentModel | undefined;
            if (beforeModel?.id === afterModel?.id && beforeModel?.provider === afterModel?.provider
              && (getSessionId() ?? undefined) === sessionId && afterModel) currentModel = afterModel;
          } else {
            new Notice(t('settings.pi.thinking.unavailable'));
          }
        } catch {
          new Notice(t('settings.pi.thinking.failed'));
        }
        const groups = new Map<string, ModelSelectorProvider>();
        for (const model of models) {
          const group = groups.get(model.provider) ?? { id: model.provider, name: model.provider, models: [] };
          group.models.push({ id: model.id, name: model.name, contextWindow: model.contextWindow, variants: currentModel.provider === model.provider && currentModel.id === model.id ? levels : [] });
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
