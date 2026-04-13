import {
  createQuestionTodoBackgroundTaskActivationServices,
  type QuestionTodoBackgroundTaskActivationServices,
} from './QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshServices,
  type QuestionTodoBackgroundTaskRefreshServices,
} from './QuestionTodoBackgroundTaskRefreshHostAdapter';
import {
  createQuestionTodoBackgroundTaskRuntimeViewHosts,
  type QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
} from './QuestionTodoBackgroundTaskRuntimeViewHostFactory';
import {
  createVisibleConversationPostSyncStateServices,
} from './VisibleConversationPostSyncStateHostAdapter';

export interface QuestionTodoBackgroundTaskRuntimeServiceBundle
  extends Pick<
      QuestionTodoBackgroundTaskRefreshServices,
      | 'visibleConversationPostSyncCoordinator'
      | 'backgroundConversationPostSyncHandoffCoordinator'
    >,
    Pick<
      QuestionTodoBackgroundTaskActivationServices,
      | 'questionTodoActivationRefreshCoordinator'
      | 'backgroundTaskActivationIndicatorCoordinator'
    > {}

export function createQuestionTodoBackgroundTaskRuntimeServiceBundle(
  host: QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
): QuestionTodoBackgroundTaskRuntimeServiceBundle {
  const runtimeViewHosts = createQuestionTodoBackgroundTaskRuntimeViewHosts(host);
  const {
    visibleConversationPostSyncStateCoordinator,
  } = createVisibleConversationPostSyncStateServices(
    runtimeViewHosts.visibleConversationPostSyncStateViewHost,
  );
  const {
    questionTodoActivationRefreshBridge,
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
  } = createQuestionTodoBackgroundTaskRefreshServices(
    runtimeViewHosts.questionTodoBackgroundTaskRefreshViewHost,
    runtimeViewHosts.backgroundConversationPostSyncHandoffViewHost,
    visibleConversationPostSyncStateCoordinator,
  );
  const {
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
  } = createQuestionTodoBackgroundTaskActivationServices(
    runtimeViewHosts.questionTodoBackgroundTaskActivationViewHost,
    questionTodoActivationRefreshBridge,
  );

  return {
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
  };
}
