import type { QuestionResolution } from '../../../core/types';
import type { TabId } from '../tabs';

export interface QuestionResolutionWritebackAfterStateAppliedOptions {
  afterStateApplied?: (() => void | Promise<void>) | null;
}

export interface QuestionResolutionWritebackFacadeHost {
  markQuestionRequestResolved(requestId: string, tabId: TabId | null): void;
  applyResolvedQuestionState(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void;
  followUpAfterResolution(tabId: TabId | null): Promise<void>;
}

export class QuestionResolutionWritebackFacade {
  constructor(private readonly host: QuestionResolutionWritebackFacadeHost) {}

  async applyResolution(
    resolution: QuestionResolution,
    tabId: TabId | null,
    options: QuestionResolutionWritebackAfterStateAppliedOptions = {},
  ): Promise<void> {
    this.host.markQuestionRequestResolved(resolution.request.id, tabId);
    this.host.applyResolvedQuestionState(resolution, tabId);
    await options.afterStateApplied?.();
    await this.host.followUpAfterResolution(tabId);
  }
}
