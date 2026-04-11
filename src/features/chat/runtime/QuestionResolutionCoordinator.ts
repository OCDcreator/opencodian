import type { QuestionResolution } from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionInlineCardRenderer } from './QuestionInlineCardRenderer';
import { populateQuestionResolutionCard } from './QuestionResolutionCardRenderer';

export interface QuestionResolutionCoordinatorRuntimeState {
  pendingQuestionResolution: QuestionResolution | null;
}

export interface QuestionResolutionCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionResolutionCoordinatorRuntimeState | null;
  shouldRenderQuestionResolutionCards(): boolean;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
}

type QuestionResolutionInlineCardPort = Pick<QuestionInlineCardRenderer, 'clear' | 'getOrCreateCard'>;

export class QuestionResolutionCoordinator {
  constructor(
    private readonly questionInlineCardRenderer: QuestionResolutionInlineCardPort,
    private readonly host: QuestionResolutionCoordinatorHost,
  ) {}

  applyResolvedQuestionState(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (runtime) {
      runtime.pendingQuestionResolution = resolution;
    }

    if (!this.host.shouldRenderQuestionResolutionCards()) {
      this.questionInlineCardRenderer.clear(tabId);
      return;
    }

    this.renderQuestionResolutionCard(resolution, tabId);
  }

  private renderQuestionResolutionCard(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void {
    const cardEl = this.questionInlineCardRenderer.getOrCreateCard(
      'opencodian-question-inline opencodian-question-inline--resolved',
      tabId,
    );
    if (!cardEl) {
      return;
    }

    populateQuestionResolutionCard(cardEl, resolution);
    this.host.keepQuestionCardPinnedToBottom(tabId);
  }
}
