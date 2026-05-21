import type { QuestionRequest } from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import type { QuestionInlineResolutionActionFacade } from './QuestionInlineResolutionActionFacade';
import type {
  QuestionResolutionExecutionAction,
  QuestionResolutionExecutionFacade,
} from './QuestionResolutionExecutionFacade';

type QuestionDockResolutionPort = Pick<
  QuestionDockCoordinator,
  'waitForDockResolutionIfEnabled'
>;
type QuestionInlineResolutionActionPort = Pick<
  QuestionInlineResolutionActionFacade,
  'collectResolutionAction'
>;
type QuestionResolutionExecutionPort = Pick<
  QuestionResolutionExecutionFacade,
  'executeAndApply'
>;

export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: QuestionDockResolutionPort;
  inlineResolutionAction: QuestionInlineResolutionActionPort;
  resolutionExecution: QuestionResolutionExecutionPort;
}

export interface QuestionResolutionFlowOptions {
  applyResolution?: boolean;
}

export type QuestionResolutionFlowResult =
  | {
      status: 'answered';
      answers: string[][];
    }
  | {
      status: 'rejected';
    }
  | {
      status: 'cancelled';
    };

export class QuestionResolutionFlowCoordinator {
  constructor(
    private readonly host: QuestionResolutionFlowCoordinatorHost,
    private readonly ports: QuestionResolutionFlowCoordinatorPorts,
  ) {}

  async showQuestionDialog(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
    options: QuestionResolutionFlowOptions = {},
  ): Promise<QuestionResolutionFlowResult> {
    if (await this.ports.dockCoordinator.waitForDockResolutionIfEnabled(request, tabId)) {
      return { status: 'answered', answers: [] };
    }

    const action = await this.ports.inlineResolutionAction.collectResolutionAction(
      request,
      tabId,
    );
    if (!action) {
      return { status: 'cancelled' };
    }

    if (options.applyResolution ?? true) {
      const applied = await this.ports.resolutionExecution.executeAndApply(action, { tabId });
      if (!applied) {
        return { status: 'cancelled' };
      }
    }
    return this.createResultFromAction(action);
  }

  private createResultFromAction(
    action: QuestionResolutionExecutionAction,
  ): QuestionResolutionFlowResult {
    if (action.type === 'reject') {
      return { status: 'rejected' };
    }
    return {
      status: 'answered',
      answers: action.answers,
    };
  }
}
