import type { QuestionRequest } from '../../../core/types';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type { QuestionDockWritebackFacade } from './QuestionDockWritebackFacade';
import type {
  QuestionPendingRefreshRuntimeFacade,
  QuestionPendingRefreshRuntimeState,
} from './QuestionPendingRefreshRuntimeFacade';

const logger = createLogger('QuestionDockRefreshFacade');

type QuestionPendingRefreshRuntimePort = Pick<
  QuestionPendingRefreshRuntimeFacade,
  | 'applyRefreshedPendingQuestionRequests'
  | 'clearPendingQuestionState'
  | 'getPendingQuestionRequests'
>;
type QuestionDockWritebackPort = Pick<
  QuestionDockWritebackFacade,
  'applyClearedPendingQuestions' | 'applyRefreshedPendingQuestions'
>;

export interface QuestionDockRefreshFacadeHost {
  getTabRuntimeState(tabId: TabId | null): QuestionPendingRefreshRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getPendingQuestions(): Promise<QuestionRequest[]>;
}

export class QuestionDockRefreshFacade {
  constructor(
    private readonly host: QuestionDockRefreshFacadeHost,
    private readonly pendingRefreshRuntime: QuestionPendingRefreshRuntimePort,
    private readonly dockWriteback: QuestionDockWritebackPort,
  ) {}

  clearPendingQuestionsForTab(tabId: TabId | null): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.pendingRefreshRuntime.clearPendingQuestionState(tabId);
    this.dockWriteback.applyClearedPendingQuestions(tabId);
  }

  async refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined = this.host.getSessionIdForTab(tabId),
  ): Promise<QuestionRequest[]> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.clearPendingQuestionsForTab(tabId);
      return [];
    }

    try {
      const pendingRequests = await this.host.getPendingQuestions();
      const sessionRequests = pendingRequests.filter((request) => request.sessionId === sessionId);
      const mergedRequests = this.pendingRefreshRuntime.applyRefreshedPendingQuestionRequests(
        tabId,
        sessionRequests,
      );
      this.dockWriteback.applyRefreshedPendingQuestions(tabId, mergedRequests);

      return mergedRequests;
    } catch (error) {
      logger.debug('Failed to refresh pending questions', error);
      return this.pendingRefreshRuntime.getPendingQuestionRequests(tabId);
    }
  }
}
