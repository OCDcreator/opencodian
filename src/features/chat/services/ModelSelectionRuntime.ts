import { Notice } from 'obsidian';

import type { ModelCatalogBundle } from '../../../core/config';
import {
  formatModelReference,
  type ResolvedModelSelection,
  resolveModelSelection,
  resolvePreferredAvailableModel,
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
  setActiveTabModelOverride(selection: ModelSelectorSelection): boolean;
  getDefaultModelSelection(): ModelSelectorSelection | null;
  syncActiveTabContextUsageIdentity(): void;
  getModelSourceMode(): ModelSourceMode;
  isModelAvailableOnServer(provider: string, model: string): Promise<boolean>;
}

export interface ModelUnavailableNoticeContent {
  title: string;
  message: string;
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
    if (!this.hasLoadedCatalog || !this.modelCatalogBundle) {
      return requestedModel;
    }

    const resolvedModel = resolvePreferredAvailableModel(
      this.modelCatalogBundle.effective,
      requestedModel?.provider,
      requestedModel?.model,
    );
    if (!resolvedModel) {
      return null;
    }

    return {
      provider: resolvedModel.provider,
      model: resolvedModel.model,
    };
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

    if (!this.hasLoadedCatalog || !this.modelCatalogBundle) {
      return {
        status: 'available',
        provider: currentModel.provider,
        model: currentModel.model,
        ref: formatModelReference(currentModel.provider, currentModel.model),
      };
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
      : this.getCurrentSessionModelResolution();
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
    const resolution = this.getCurrentSessionModelResolution();
    if (resolution.status === 'unconfigured') {
      return {
        title: t('chat.notice.modelUnavailable.unconfiguredTitle'),
        message: t('chat.notice.modelUnavailable.unconfiguredBody'),
      };
    }

    if (this.availableProviders.length === 0) {
      return this.getEmptyCatalogUnavailableNoticeContent();
    }

    return {
      title: t('chat.notice.modelUnavailable.selectedTitle'),
      message: t('chat.notice.modelUnavailable.selectedBody'),
    };
  }

  switchModel(provider: string, model: string): void {
    const didSetOverride = this.host.setActiveTabModelOverride({ provider, model });
    if (!didSetOverride) {
      return;
    }

    this.host.syncActiveTabContextUsageIdentity();

    const modelInfo = this.findAvailableModelInfo(provider, model);
    const modelName = modelInfo?.modelName || model;
    new Notice(`Model switched to: ${modelName}`);
  }

  private applyCatalogData(
    catalogBundle: ModelCatalogBundle | null,
    providers: readonly ModelSelectorProvider[],
  ): void {
    const snapshot = this.createCatalogSnapshot(providers);
    this.hasLoadedCatalog = true;
    this.modelCatalogBundle = catalogBundle;
    this.availableModels = snapshot.availableModels;
    this.availableProviders = snapshot.availableProviders;
  }

  private createCatalogSnapshot(providers: readonly ModelSelectorProvider[]): ModelCatalogSnapshot {
    const availableModels: ModelSelectorAvailableModelInfo[] = [];
    const availableProviders = providers.map((provider) => {
      const providerModels = provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
      }));

      for (const model of providerModels) {
        availableModels.push({
          provider: provider.id,
          model: model.id,
          label: `${provider.name}/${model.name}`,
          providerName: provider.name,
          modelName: model.name,
          contextWindow: model.contextWindow,
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
}
