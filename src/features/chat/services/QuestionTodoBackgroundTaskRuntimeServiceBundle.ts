import {
  createQuestionTodoBackgroundTaskActivationServices,
  type QuestionTodoBackgroundTaskActivationServices,
} from './QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshServices,
  type QuestionTodoBackgroundTaskRefreshServices,
} from './QuestionTodoBackgroundTaskRefreshHostAdapter';
import {
  createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
  type QuestionTodoBackgroundTaskRuntimeHostProviderHost,
} from './QuestionTodoBackgroundTaskRuntimeHostProvider';
import {
  createQuestionTodoBackgroundTaskRuntimeViewHosts,
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
  host: QuestionTodoBackgroundTaskRuntimeHostProviderHost,
): QuestionTodoBackgroundTaskRuntimeServiceBundle {
  const runtimeViewHosts = createQuestionTodoBackgroundTaskRuntimeViewHosts(
    createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost(host),
  );
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
