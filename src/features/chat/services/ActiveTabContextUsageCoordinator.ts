import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import {
  createEmptyTabContextState,
  type TabContextState,
} from '../../../core/types';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';
import { ContextUsageService } from './ContextUsageService';

interface ActiveTabContextUsageSnapshot {
  sessionId: string;
  sessionTitle: string;
  createdAt: number;
  updatedAt: number;
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  contextWindow: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

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
  getSessionContextUsageSnapshot(sessionId: string): Promise<ActiveTabContextUsageSnapshot | null>;
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

    const nextState = ContextUsageService.syncStateIdentity(
      this.getCurrentState(),
      {
        provider: snapshot.providerId,
        providerName: snapshot.providerName,
        model: snapshot.modelId,
        modelName: snapshot.modelName,
        contextWindow: snapshot.contextWindow,
      },
      {
        sessionId: snapshot.sessionId,
        sessionTitle: snapshot.sessionTitle,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    );

    this.commitState(
      ContextUsageService.applyPreciseUsage(nextState, {
        input: snapshot.inputTokens,
        output: snapshot.outputTokens,
        reasoning: snapshot.reasoningTokens,
        cacheRead: snapshot.cacheReadTokens,
        cacheWrite: snapshot.cacheWriteTokens,
        totalCost: snapshot.totalCost,
      }),
    );
  }

  private getCurrentState(): TabContextState {
    return this.host.getActiveTabContextUsage() ?? createEmptyTabContextState();
  }

  private commitState(contextUsage: TabContextState): void {
    this.host.setActiveTabContextUsage(contextUsage);
    this.host.renderContextUsageIndicator(contextUsage);
  }
}
