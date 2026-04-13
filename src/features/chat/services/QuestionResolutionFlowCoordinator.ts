import type { QuestionRequest } from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import type { QuestionInlineResolutionActionFacade } from './QuestionInlineResolutionActionFacade';
import type { QuestionResolutionApplyFacade } from './QuestionResolutionApplyFacade';

type QuestionDockResolutionPort = Pick<
  QuestionDockCoordinator,
  'waitForDockResolutionIfEnabled'
>;
type QuestionInlineResolutionActionPort = Pick<
  QuestionInlineResolutionActionFacade,
  'collectResolutionAction'
>;
type QuestionResolutionApplyPort = Pick<
  QuestionResolutionApplyFacade,
  'applyAction'
>;

export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: QuestionDockResolutionPort;
  inlineResolutionAction: QuestionInlineResolutionActionPort;
  resolutionApply: QuestionResolutionApplyPort;
}

export class QuestionResolutionFlowCoordinator {
  constructor(
    private readonly host: QuestionResolutionFlowCoordinatorHost,
    private readonly ports: QuestionResolutionFlowCoordinatorPorts,
  ) {}

  async showQuestionDialog(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    if (await this.ports.dockCoordinator.waitForDockResolutionIfEnabled(request, tabId)) {
      return;
    }

    const action = await this.ports.inlineResolutionAction.collectResolutionAction(
      request,
      tabId,
    );
    if (!action) {
      return;
    }

    await this.ports.resolutionApply.applyAction(action, tabId);
  }
}
