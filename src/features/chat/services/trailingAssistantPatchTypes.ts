import type { ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';

export type TrailingAssistantPatchExecutionPlanPatchTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

export type TrailingAssistantPatchExecutionPlan =
  | {
    kind: 'finalize-footer';
    messageEl: HTMLElement;
    nextTailMessage: ChatMessage;
  }
  | {
    kind: 'rerender-content';
    messageEl: HTMLElement;
    contentEl: HTMLElement;
    nextTailMessage: ChatMessage;
  };

export type TrailingAssistantPatchExecutionPlanSource = {
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchExecutionPlanPatchTarget;
  shouldFinalizeFooterOnly: boolean;
};

export type TrailingAssistantPatchExecutionTailPatchTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

export type TrailingAssistantPatchExecutionTailContextFields = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchExecutionTailPatchTarget;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchExecutionTailPlanningContextSource =
  TrailingAssistantPatchExecutionTailContextFields;

export type TrailingAssistantPatchExecutionTailPlanningContext =
  TrailingAssistantPatchExecutionTailContextFields;

export type TrailingAssistantPatchExecutionTailExecutionPlanSource = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  shouldFinalizeFooterOnly: boolean;
};

export type TrailingAssistantPatchFooterFinalizationDecisionSource = {
  previousBodySignature: string;
  nextBodySignature: string;
};

export type TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter = (
  message: ChatMessage,
) => string;

export type TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
};

export type TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource =
  TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts;

export type TrailingAssistantPatchCompletionDebugMessageSummarizer = (
  message: ChatMessage | null | undefined,
) => Record<string, unknown> | null;

export type TrailingAssistantPatchCompletionDebugSummaryPlan = {
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugSummaryPlanSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchCompletionDebugTailStatePlan = {
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs = {
  shouldStickToBottom: boolean;
  summaryPlan: TrailingAssistantPatchCompletionDebugSummaryPlan;
};

export type TrailingAssistantPatchCompletionDebugPlanningContext =
  TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs;

export type TrailingAssistantPatchCompletionDebugPlanningContextInputsParts = {
  tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
  summaryPlan: TrailingAssistantPatchCompletionDebugSummaryPlan;
};

export type TrailingAssistantPatchTailOutcomePlanningContextInputsPatchTarget = {
  messageEl: HTMLElement;
};

export type TrailingAssistantPatchTailOutcomePlanningContextInputsSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchTailOutcomePlanningContextInputsPatchTarget;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContextInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContextShapeInputs =
  TrailingAssistantPatchTailOutcomePlanningContextInputs;

export type TrailingAssistantPatchTailOutcomePlanningContext =
  TrailingAssistantPatchTailOutcomePlanningContextShapeInputs;

export type TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContext & {
    tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export type TrailingAssistantPatchCompletionDebugPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts =
  TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts;

export type TrailingAssistantPatchCompletionDebugTailOutcomePlanParts =
  TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts;

export type TrailingAssistantPatchTailStatePlan = {
  messageEl: HTMLElement;
  messageId: string;
  sourceMessageId: string | null;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStateApplier = {
  scrollToBottom(options?: { tabId?: TabId | null }): void;
};

export type TrailingAssistantPatchTailStatePlanningContextInputsSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStatePlanningContextInputs = {
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStatePlanningContextShapeInputs =
  TrailingAssistantPatchTailStatePlanningContextInputs;

export type TrailingAssistantPatchTailStatePlanningContext =
  TrailingAssistantPatchTailStatePlanningContextShapeInputs;

export type TrailingAssistantPatchTailStateTailOutcomePlanSource =
  TrailingAssistantPatchTailStatePlanningContextInputsSource;

export type TrailingAssistantPatchTailOutcomePlanParts = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export type TrailingAssistantPatchTailOutcomePlans = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export type TrailingAssistantPatchTailOutcomeChildPlans =
  TrailingAssistantPatchTailOutcomePlanParts;

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSource =
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts;

export type TrailingAssistantPatchExecutionTailPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
};

export type TrailingAssistantPatchExecutionTailChildPlanSource =
  TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource &
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSource;

export type TrailingAssistantPatchTurnBodyRuntimeState = {
  currentTurnBodyEl: HTMLElement | null;
};

export type TrailingAssistantPatchTurnBodyScopePlan =
  | {
    runtime: null;
  }
  | {
    runtime: TrailingAssistantPatchTurnBodyRuntimeState;
    scopedTurnBodyEl: HTMLElement;
    restoreTurnBodyEl: HTMLElement;
  };

export type TrailingAssistantPatchTurnBodyScopePlanSource = {
  runtime: TrailingAssistantPatchTurnBodyRuntimeState | null;
  parentEl: HTMLElement;
};

export type TrailingAssistantPatchTurnBodyScopePlanInputs =
  | {
    runtime: null;
  }
  | {
    runtime: TrailingAssistantPatchTurnBodyRuntimeState;
    scopedTurnBodyEl: HTMLElement;
    restoreTurnBodyEl: HTMLElement;
  };

export type TrailingAssistantPatchSuccessPlan = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailStatePlan: TrailingAssistantPatchTailOutcomePlans['tailStatePlan'];
  completionDebugPlan: TrailingAssistantPatchTailOutcomePlans['completionDebugPlan'];
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

export type TrailingAssistantPatchSuccessPlanParts =
  TrailingAssistantPatchExecutionTailPlanParts & {
    turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
  };

export type TrailingAssistantPatchSuccessChildPlans =
  TrailingAssistantPatchSuccessPlanParts;

export type TrailingAssistantPatchSuccessPlanChildPlanSource =
  Omit<TrailingAssistantPatchSuccessChildPlans, 'turnBodyScopePlan'> & {
    turnBodyScopePlanSource: TrailingAssistantPatchTurnBodyScopePlanSource;
  };

export type TrailingAssistantPatchSuccessPlanningContextPlanBaseSource =
  TrailingAssistantPatchExecutionTailPlanningContextSource &
  TrailingAssistantPatchTurnBodyScopePlanSource;

export type TrailingAssistantPatchSuccessPlanningContextPlanSource =
  TrailingAssistantPatchSuccessPlanningContextPlanBaseSource & {
    getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export type TrailingAssistantPatchSuccessPlanningContextPlanBodySignaturePort = {
  getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
};

export type TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts = {
  planningContext: TrailingAssistantPatchSuccessPlanningContextPlanBaseSource;
  assistantTailRender: TrailingAssistantPatchSuccessPlanningContextPlanBodySignaturePort;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchCompletionDebugPlanLike = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugLoggingContext = {
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlanLike;
  tabId: TabId | null;
};

export type TrailingAssistantPatchSkippedDebugPlanningContext = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  tabId: TabId | null;
};

export type TrailingAssistantPatchSkippedDebugLoggingContext = {
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext;
  reason: string;
  payload: Record<string, unknown>;
};

export type TrailingAssistantPatchCompletionDebugPayloadInputs = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugPayloadPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchSkippedDebugCountPlan = {
  previousRenderedCount: number;
  nextRenderedCount: number;
};

export type TrailingAssistantPatchSkippedDebugPayloadInputs = {
  reason: string;
  payload: Record<string, unknown>;
  countPlan: TrailingAssistantPatchSkippedDebugCountPlan;
};

export type TrailingAssistantPatchSkippedDebugPayloadPlan =
  Record<string, unknown> & {
    reason: string;
    previousRenderedCount: number;
    nextRenderedCount: number;
  };

export type TrailingAssistantPatchSkippedDebugCountPlanInputs = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
};

export type TrailingAssistantPatchSkippedDebugPayloadInputSource = {
  reason: string;
  payload: Record<string, unknown>;
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
};

export type TrailingAssistantPatchDebugLogPlan<Label extends string> = {
  label: Label;
  payload: Record<string, unknown>;
};

export type TrailingAssistantPatchCompletionDebugLogPlan =
  TrailingAssistantPatchDebugLogPlan<'patch-trailing-assistant-render-complete'>;

export type TrailingAssistantPatchSkippedDebugLogPlan =
  TrailingAssistantPatchDebugLogPlan<'patch-trailing-assistant-render-skipped'>;

export type TrailingAssistantPatchSkippedDebugMessagesForRender = (
  messages: ChatMessage[],
) => ChatMessage[];

export type TrailingAssistantPatchDebugLogEmitter = {
  logAssistantFinalizationDebug(label: string, payload: unknown): void;
};

export type TrailingAssistantPatchSkippedDebugLogEmitter =
  TrailingAssistantPatchDebugLogEmitter & {
    getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  };
