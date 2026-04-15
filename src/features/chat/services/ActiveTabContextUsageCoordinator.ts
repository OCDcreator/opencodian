import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import {
  createEmptyTabContextState,
  type TabContextState,
} from '../../../core/types';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';
import {
  ContextUsageService,
  type ContextUsageSnapshot,
} from './ContextUsageService';

interface ActiveTabContextUsageConversation {
  id: string;
  openCodeSessionId: string | null | undefined;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveTabContextUsageCoordinatorHost {
  hasActiveTab(): boolean;
  getCurrentConversation(): ActiveTabContextUsageConversation | null;
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  getActiveTabContextUsage(): TabContextState | null;
  setActiveTabContextUsage(contextUsage: TabContextState): void;
  renderContextUsageIndicator(state: TabContextState | null): void;
  getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null>;
}

export class ActiveTabContextUsageCoordinator {
  constructor(private readonly host: ActiveTabContextUsageCoordinatorHost) {}

  syncIdentity(): void {
    if (!this.host.hasActiveTab()) {
      this.host.renderContextUsageIndicator(null);
      return;
    }

    const currentModel = this.host.getCurrentSessionModel();
    const resolution = this.host.getCurrentSessionModelResolution();
    const modelInfo = this.host.findKnownModelInfo(currentModel);
    const conversation = this.host.getCurrentConversation();
    const nextState = ContextUsageService.syncStateIdentity(
      this.getCurrentState(),
      {
        provider: currentModel?.provider ?? null,
        providerName:
          modelInfo?.providerName
          ?? resolution.providerName
          ?? currentModel?.provider
          ?? null,
        model: currentModel?.model ?? null,
        modelName:
          modelInfo?.modelName
          ?? resolution.modelName
          ?? currentModel?.model
          ?? null,
        contextWindow: modelInfo?.contextWindow ?? resolution.contextWindow,
      },
      {
        sessionId: conversation?.openCodeSessionId ?? null,
        sessionTitle: conversation?.title ?? null,
        createdAt: conversation?.createdAt ?? null,
        updatedAt: conversation?.updatedAt ?? null,
      },
    );

    this.commitState(nextState);
  }

  async refreshFromServer(): Promise<void> {
    const conversation = this.host.getCurrentConversation();
    const expectedConversationId = conversation?.id ?? null;
    const expectedSessionId = conversation?.openCodeSessionId ?? null;
    if (!expectedConversationId || !expectedSessionId || !this.host.hasActiveTab()) {
      return;
    }

    const snapshot = await this.host.getSessionContextUsageSnapshot(expectedSessionId);
    const currentConversation = this.host.getCurrentConversation();
    if (
      !snapshot
      || currentConversation?.id !== expectedConversationId
      || currentConversation?.openCodeSessionId !== expectedSessionId
      || !this.host.hasActiveTab()
    ) {
      return;
    }

    this.commitState(ContextUsageService.applyUsageSnapshot(this.getCurrentState(), snapshot));
  }

  private getCurrentState(): TabContextState {
    return this.host.getActiveTabContextUsage() ?? createEmptyTabContextState();
  }

  private commitState(contextUsage: TabContextState): void {
    this.host.setActiveTabContextUsage(contextUsage);
    this.host.renderContextUsageIndicator(contextUsage);
  }
}
