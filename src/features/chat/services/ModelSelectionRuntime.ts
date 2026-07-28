import { Notice } from 'obsidian';

import type { ModelCatalogBundle } from '../../../core/config';
import {
  formatModelReference,
  type ResolvedModelSelection,
  resolveModelSelection,
} from '../../../core/config/modelConfig';
import type { ModelSourceMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type {
  ModelSelectorAvailableModelInfo,
  ModelSelectorKnownModelInfo,
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';

const logger = createLogger('ModelSelectionRuntime');

export interface ModelSelectionRuntimeHost {
  loadModelCatalogData(): Promise<{
    catalogBundle: ModelCatalogBundle | null;
    providers: readonly ModelSelectorProvider[];
  }>;
  getActiveTabModelOverride(): ModelSelectorSelection | null;
  setActiveTabModelOverride(selection: ModelSelectorSelection | null): boolean;
  getDefaultModelSelection(): ModelSelectorSelection | null;
  syncActiveTabContextUsageIdentity(): void;
  getModelSourceMode(): ModelSourceMode;
  isModelAvailableOnServer(provider: string, model: string): Promise<boolean>;
}

export interface ModelUnavailableNoticeContent {
  title: string;
  message: string;
}

export interface ModelSelectionSwitchOptions {
  /** Suppress the generic immediate-switch notice when the caller owns async persistence feedback. */
  notify?: boolean;
}

interface ModelCatalogSnapshot {
  availableModels: ModelSelectorAvailableModelInfo[];
  availableProviders: ModelSelectorProvider[];
}

export class ModelSelectionRuntime {
  private availableModels: ModelSelectorAvailableModelInfo[] = [];
  private availableProviders: ModelSelectorProvider[] = [];
  private modelCatalogBundle: ModelCatalogBundle | null = null;
  private hasLoadedCatalog = false;

  constructor(private readonly host: ModelSelectionRuntimeHost) {}

  async reloadModelCatalog(): Promise<void> {
    try {
      const { catalogBundle, providers } = await this.host.loadModelCatalogData();
      this.applyCatalogData(catalogBundle, providers);
      this.host.syncActiveTabContextUsageIdentity();
    } catch (error) {
      logger.error('Failed to load models:', error);
    }
  }

  reset(): void {
    this.availableModels = [];
    this.availableProviders = [];
    this.modelCatalogBundle = null;
    this.hasLoadedCatalog = false;
  }

  hasLoadedModelCatalog(): boolean {
    return this.hasLoadedCatalog;
  }

  getAvailableProviders(): readonly ModelSelectorProvider[] {
    return this.availableProviders;
  }

  getCurrentSessionModel(): ModelSelectorSelection | null {
    const requestedModel = this.getRequestedSessionModel();
    if (!this.hasLoadedCatalog) {
      return requestedModel;
    }

    if (!this.modelCatalogBundle) {
      return this.resolvePreferredAvailableSnapshotModel(
        requestedModel?.provider,
        requestedModel?.model,
      );
    }

    return this.resolvePreferredAvailableSnapshotModel(
      requestedModel?.provider,
      requestedModel?.model,
    );
  }

  getCurrentSessionModelResolution(): ResolvedModelSelection {
    const currentModel = this.getCurrentSessionModel();
    if (!currentModel) {
      return {
        status: 'unconfigured',
        provider: '',
        model: '',
        ref: '',
      };
    }

    if (!this.hasLoadedCatalog) {
      return this.resolveSnapshotModelSelection(currentModel.provider, currentModel.model);
    }

    if (!this.modelCatalogBundle) {
      return this.resolveSnapshotModelSelection(currentModel.provider, currentModel.model);
    }

    return resolveModelSelection(
      this.modelCatalogBundle.baseEffective,
      this.modelCatalogBundle.effective,
      currentModel.provider,
      currentModel.model,
    );
  }

  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null {
    if (!selection) {
      return null;
    }

    const availableModel = this.findAvailableModelInfo(selection.provider, selection.model);
    if (availableModel) {
      return availableModel;
    }

    const baseProvider = this.modelCatalogBundle?.baseEffective.providers.find(
      (provider) => provider.id === selection.provider,
    );
    const baseModel = baseProvider?.models.find((model) => model.id === selection.model);
    if (!baseProvider || !baseModel) {
      return null;
    }

    return {
      providerName: baseProvider.name,
      modelName: baseModel.name,
      contextWindow: baseModel.contextWindow,
      variants: baseModel.variants,
    };
  }

  formatModelId(
    model: Partial<ModelSelectorSelection> | null | undefined,
  ): string | undefined {
    if (!model?.provider || !model.model) {
      return undefined;
    }

    return `${model.provider}/${model.model}`;
  }

  async ensureSelectedModelAvailable(
    provider: string | undefined,
    model: string | undefined,
  ): Promise<boolean> {
    const resolution = this.modelCatalogBundle
      ? resolveModelSelection(
          this.modelCatalogBundle.baseEffective,
          this.modelCatalogBundle.effective,
          provider,
          model,
        )
      : this.resolveSnapshotModelSelection(provider, model);
    if (resolution.status !== 'available') {
      return false;
    }

    if (!provider || !model) {
      return false;
    }

    try {
      const available = await this.host.isModelAvailableOnServer(provider, model);
      if (available) {
        return true;
      }
    } catch (error) {
      logger.warn('Failed to verify model availability on server', error);
    }

    return false;
  }

  getModelUnavailableNoticeContent(): ModelUnavailableNoticeContent {
    const requestedModel = this.getRequestedSessionModel();
    if (!requestedModel?.provider || !requestedModel.model) {
      return {
        title: t('chat.notice.modelUnavailable.unconfiguredTitle'),
        message: t('chat.notice.modelUnavailable.unconfiguredBody'),
      };
    }

    if (this.availableProviders.length === 0) {
      return this.getEmptyCatalogUnavailableNoticeContent();
    }

    const resolution = this.getCurrentSessionModelResolution();
    if (resolution.status === 'unconfigured') {
      return {
        title: t('chat.notice.modelUnavailable.unconfiguredTitle'),
        message: t('chat.notice.modelUnavailable.unconfiguredBody'),
      };
    }

    return {
      title: t('chat.notice.modelUnavailable.selectedTitle'),
      message: t('chat.notice.modelUnavailable.selectedBody'),
    };
  }

  switchModel(
    provider: string,
    model: string,
    options: ModelSelectionSwitchOptions = {},
  ): boolean {
    const didSetOverride = this.host.setActiveTabModelOverride({ provider, model });
    if (!didSetOverride) {
      return false;
    }

    this.host.syncActiveTabContextUsageIdentity();

    const modelInfo = this.findAvailableModelInfo(provider, model);
    const modelName = modelInfo?.modelName || model;
    if (options.notify !== false) {
      new Notice(`Model switched to: ${modelName}`);
    }
    return true;
  }

  private applyCatalogData(
    catalogBundle: ModelCatalogBundle | null,
    providers: readonly ModelSelectorProvider[],
  ): void {
    const snapshot = this.createCatalogSnapshot(providers, catalogBundle);
    this.hasLoadedCatalog = true;
    this.modelCatalogBundle = catalogBundle;
    this.availableModels = snapshot.availableModels;
    this.availableProviders = snapshot.availableProviders;
  }

  private createCatalogSnapshot(
    providers: readonly ModelSelectorProvider[],
    catalogBundle: ModelCatalogBundle | null,
  ): ModelCatalogSnapshot {
    const availableModels: ModelSelectorAvailableModelInfo[] = [];
    const serverModelRefs = catalogBundle
      ? new Set(catalogBundle.server.providers.flatMap((provider) =>
        provider.models.map((model) => formatModelReference(provider.id, model.id)),
      ).filter((ref): ref is string => Boolean(ref)))
      : null;
    const availableProviders = providers.map((provider) => {
      const providerModels = provider.models.map((model) => {
        const ref = formatModelReference(provider.id, model.id);
        const availability = !serverModelRefs || (ref ? serverModelRefs.has(ref) : false)
          ? 'runtime'
          : 'configured-only';
        return {
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          variants: model.variants,
          availability,
          ...(availability === 'configured-only'
            ? { availabilityLabel: t('chat.modelSelector.configuredOnlyBadge') }
            : {}),
        } as const;
      });

      for (const model of providerModels) {
        if (model.availability !== 'runtime') {
          continue;
        }
        availableModels.push({
          provider: provider.id,
          model: model.id,
          label: `${provider.name}/${model.name}`,
          providerName: provider.name,
          modelName: model.name,
          contextWindow: model.contextWindow,
          variants: model.variants,
        });
      }

      return {
        id: provider.id,
        name: provider.name,
        models: providerModels,
      };
    });

    return {
      availableModels,
      availableProviders,
    };
  }

  private getRequestedSessionModel(): ModelSelectorSelection | null {
    const override = this.host.getActiveTabModelOverride();
    if (override) {
      return override;
    }

    return this.host.getDefaultModelSelection();
  }

  private getEmptyCatalogUnavailableNoticeContent(): ModelUnavailableNoticeContent {
    switch (this.host.getModelSourceMode()) {
      case 'local':
        return {
          title: t('chat.notice.modelUnavailable.localTitle'),
          message: t('chat.notice.modelUnavailable.localBody'),
        };
      case 'server':
        return {
          title: t('chat.notice.modelUnavailable.serverTitle'),
          message: t('chat.notice.modelUnavailable.serverBody'),
        };
      default:
        return {
          title: t('chat.notice.modelUnavailable.mergeTitle'),
          message: t('chat.notice.modelUnavailable.mergeBody'),
        };
    }
  }

  private findAvailableModelInfo(
    provider: string,
    model: string,
  ): ModelSelectorAvailableModelInfo | undefined {
    return this.availableModels.find(
      (item) => item.provider === provider && item.model === model,
    );
  }

  private resolvePreferredAvailableSnapshotModel(
    provider: string | null | undefined,
    model: string | null | undefined,
  ): ModelSelectorSelection | null {
    const requestedProvider = provider?.trim();
    const requestedModel = model?.trim();
    if (requestedProvider && requestedModel && this.findAvailableModelInfo(requestedProvider, requestedModel)) {
      return {
        provider: requestedProvider,
        model: requestedModel,
      };
    }

    const providerFirstModel = requestedProvider
      ? this.availableModels.find((candidate) => candidate.provider === requestedProvider)
      : undefined;
    if (providerFirstModel) {
      return {
        provider: providerFirstModel.provider,
        model: providerFirstModel.model,
      };
    }

    const firstAvailable = this.availableModels[0];
    if (!firstAvailable) {
      return null;
    }

    return {
      provider: firstAvailable.provider,
      model: firstAvailable.model,
    };
  }

  private resolveSnapshotModelSelection(
    provider: string | null | undefined,
    model: string | null | undefined,
  ): ResolvedModelSelection {
    const ref = formatModelReference(provider, model);
    const providerId = provider?.trim() ?? '';
    const modelId = model?.trim() ?? '';
    if (!ref || !providerId || !modelId) {
      return {
        status: 'unconfigured',
        provider: '',
        model: '',
        ref: '',
      };
    }

    const availableEntry = this.findAvailableModelInfo(providerId, modelId);
    if (availableEntry) {
      return {
        status: 'available',
        provider: providerId,
        model: modelId,
        ref,
        providerName: availableEntry.providerName,
        modelName: availableEntry.modelName,
        contextWindow: availableEntry.contextWindow,
      };
    }

    const providerEntry = this.availableProviders.find((candidate) => candidate.id === providerId);
    return {
      status: 'unavailable',
      provider: providerId,
      model: modelId,
      ref,
      providerName: providerEntry?.name ?? providerId,
      modelName: modelId,
    };
  }
}
