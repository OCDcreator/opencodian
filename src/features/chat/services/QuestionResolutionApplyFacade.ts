import type { TabId } from '../tabs';
import type {
  QuestionResolutionExecutionAction,
  QuestionResolutionExecutionFacade,
} from './QuestionResolutionExecutionFacade';
import type {
  QuestionResolutionWritebackAfterStateAppliedOptions,
  QuestionResolutionWritebackFacade,
} from './QuestionResolutionWritebackFacade';

type QuestionResolutionExecutionPort = Pick<
  QuestionResolutionExecutionFacade,
  'execute'
>;
type QuestionResolutionWritebackPort = Pick<
  QuestionResolutionWritebackFacade,
  'applyResolution'
>;

export type QuestionResolutionApplyOptions =
  QuestionResolutionWritebackAfterStateAppliedOptions;

export class QuestionResolutionApplyFacade {
  constructor(
    private readonly resolutionExecution: QuestionResolutionExecutionPort,
    private readonly resolutionWriteback: QuestionResolutionWritebackPort,
  ) {}

  async applyAction(
    action: QuestionResolutionExecutionAction,
    tabId: TabId | null,
    options: QuestionResolutionApplyOptions = {},
  ): Promise<boolean> {
    const resolution = await this.resolutionExecution.execute(action);
    if (!resolution) {
      return false;
    }

    await this.resolutionWriteback.applyResolution(resolution, tabId, options);
    return true;
  }
}
