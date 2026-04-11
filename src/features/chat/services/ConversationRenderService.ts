import {
  type ChatMessage,
  type Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  captureElementScrollRestoreSnapshot,
  isElementNearBottom,
  restoreElementScrollAfterRender,
  type ScrollRuntimeState,
} from './ScrollManager';

export interface IncrementalRenderedMessageUpdate {
  appendedRenderedMessages: ChatMessage[];
  patchTrailingAssistant: boolean;
}

export interface IncrementalRenderedMessageUpdateOptions {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  getMessageVisualSignature(message: ChatMessage): string;
}

export function getIncrementalRenderedMessageUpdate(
  options: IncrementalRenderedMessageUpdateOptions,
): IncrementalRenderedMessageUpdate | null {
  const previousRenderedMessages = options.getMessagesForRender(options.previousMessages);
  const nextRenderedMessages = options.getMessagesForRender(options.nextMessages);

  if (nextRenderedMessages.length < previousRenderedMessages.length) {
    return null;
  }

  if (previousRenderedMessages.length === 0) {
    return {
      appendedRenderedMessages: nextRenderedMessages,
      patchTrailingAssistant: false,
    };
  }

  for (let index = 0; index < previousRenderedMessages.length - 1; index += 1) {
    if (
      options.getMessageVisualSignature(previousRenderedMessages[index])
      !== options.getMessageVisualSignature(nextRenderedMessages[index])
    ) {
      return null;
    }
  }

  const lastSharedIndex = previousRenderedMessages.length - 1;
  const patchTrailingAssistant = options.getMessageVisualSignature(previousRenderedMessages[lastSharedIndex])
    !== options.getMessageVisualSignature(nextRenderedMessages[lastSharedIndex]);

  return {
    appendedRenderedMessages: nextRenderedMessages.slice(previousRenderedMessages.length),
    patchTrailingAssistant,
  };
}

export interface ConversationRenderRuntimeState {
  currentTurnBodyEl: HTMLElement | null;
}

export interface ConversationAssistantTailRenderPort {
  getBodySignature(message: ChatMessage): string;
  renderMessageContent(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    message: ChatMessage,
  ): Promise<void>;
  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void;
}

export interface ConversationRenderHost {
  getCurrentConversation(): Conversation | null;
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getScrollRuntimeForTab(tabId: TabId | null): ScrollRuntimeState | null;
  getRenderRuntimeForTab(tabId: TabId | null): ConversationRenderRuntimeState | null;

  clearScheduledScrollToBottom(): void;
  beginConversationHydration(tabId: TabId | null): void;
  endConversationHydration(tabId: TabId | null): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  renderMessages(messages: ChatMessage[]): Promise<void>;
  renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined>;
  renderSyncedAssistantMessageWithReveal(message: ChatMessage): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;

  shouldAutoScroll(tabId?: TabId | null): boolean;
  scrollToBottom(options?: { tabId?: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  scheduleComposerLayoutSync(): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;

  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  getMessageVisualSignature(message: ChatMessage): string;
  shouldPseudoStreamSyncedAssistantMessage(message: ChatMessage): boolean;
  assistantTailRender: ConversationAssistantTailRenderPort;

  logAssistantFinalizationDebug(label: string, payload: unknown): void;
  summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null;
}

type TrailingAssistantPatchDomTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

type TrailingAssistantPatchExecutionPlan =
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

type TrailingAssistantPatchTailStatePlan = {
  messageEl: HTMLElement;
  messageId: string;
  sourceMessageId: string | null;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchCompletionDebugPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

type TrailingAssistantPatchCompletionDebugPayloadPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

type TrailingAssistantPatchCompletionDebugPayloadInputs = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

type TrailingAssistantPatchCompletionDebugSummaryPlan = {
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

type TrailingAssistantPatchCompletionDebugLogPlan = {
  label: 'patch-trailing-assistant-render-complete';
  payload: Record<string, unknown>;
};

type TrailingAssistantPatchCompletionDebugLoggingContext = {
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
  tabId: TabId | null;
};

type TrailingAssistantPatchCompletionDebugLogPlanningContext = {
  payloadInputs: TrailingAssistantPatchCompletionDebugPayloadInputs;
  tabId: TabId | null;
};

type TrailingAssistantPatchCompletionDebugFinalLogInputs = {
  tabId: TabId | null;
  payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan;
};

type TrailingAssistantPatchCompletionDebugFinalLogInputsContract = {
  tabId: TabId | null;
  payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan;
};

type TrailingAssistantPatchCompletionDebugFinalLogPayloadContract = {
  tabId: TabId | null;
  payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan;
};

type TrailingAssistantPatchCompletionDebugFinalLogPayload = {
  tabId: TabId | null;
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

type TrailingAssistantPatchNonMergeableTailFailurePlan = {
  reason: 'tail-message-not-mergeable-assistant';
  payload: {
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  };
};

type TrailingAssistantPatchSkippedDebugCountPlan = {
  previousRenderedCount: number;
  nextRenderedCount: number;
};

type TrailingAssistantPatchSkippedDebugCountInputs = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
};

type TrailingAssistantPatchSkippedDebugCountPlanningInputs = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
};

type TrailingAssistantPatchSkippedDebugCountPlanningContract = {
  countInputs: TrailingAssistantPatchSkippedDebugCountInputs;
};

type TrailingAssistantPatchSkippedDebugReasonPayloadInputs = {
  reason: string;
  payload: Record<string, unknown>;
};

type TrailingAssistantPatchSkippedDebugReasonPayloadContract = {
  reason: string;
  payload: Record<string, unknown>;
};

type TrailingAssistantPatchSkippedDebugPayloadInputsContract = {
  reasonPayloadInputs: TrailingAssistantPatchSkippedDebugReasonPayloadInputs;
  countPlan: TrailingAssistantPatchSkippedDebugCountPlan;
};

type TrailingAssistantPatchSkippedDebugPayloadInputsContractPreparation = {
  reasonPayloadInputs: TrailingAssistantPatchSkippedDebugReasonPayloadInputs;
  countPlan: TrailingAssistantPatchSkippedDebugCountPlan;
};

type TrailingAssistantPatchSkippedDebugPayloadInputsContractPreparationInputs = {
  reasonPayloadInputs: TrailingAssistantPatchSkippedDebugReasonPayloadInputs;
  countPlan: TrailingAssistantPatchSkippedDebugCountPlan;
};

type TrailingAssistantPatchSkippedDebugPayloadInputs = {
  reason: string;
  payload: Record<string, unknown>;
  countPlan: TrailingAssistantPatchSkippedDebugCountPlan;
};

type TrailingAssistantPatchSkippedDebugPayloadPlan = Record<string, unknown> & {
  reason: string;
  previousRenderedCount: number;
  nextRenderedCount: number;
};

type TrailingAssistantPatchSkippedDebugFinalLogInputs = {
  tabId: TabId | null;
  payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan;
};

type TrailingAssistantPatchSkippedDebugFinalLogInputsContract = {
  tabId: TabId | null;
  payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan;
};

type TrailingAssistantPatchSkippedDebugFinalLogPayloadContract = {
  tabId: TabId | null;
  payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan;
};

type TrailingAssistantPatchSkippedDebugFinalLogPayload = Record<
  string,
  unknown
> & {
  tabId: TabId | null;
};

type TrailingAssistantPatchSkippedDebugLogPlan = {
  label: 'patch-trailing-assistant-render-skipped';
  payload: Record<string, unknown>;
};

type TrailingAssistantPatchSkippedDebugLogPlanningContext = {
  payloadInputs: TrailingAssistantPatchSkippedDebugPayloadInputs;
  tabId: TabId | null;
};

type TrailingAssistantPatchSkippedDebugPlanningContext = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  tabId: TabId | null;
};

type TrailingAssistantPatchSkippedDebugLoggingContext = {
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext;
  reason: string;
  payload: Record<string, unknown>;
};

type TrailingAssistantPatchTurnBodyScopeInputs = {
  runtime: ConversationRenderRuntimeState | null;
  parentEl: HTMLElement;
};

type TrailingAssistantPatchTurnBodyScopePlan =
  | {
    runtime: null;
  }
  | {
    runtime: ConversationRenderRuntimeState;
    scopedTurnBodyEl: HTMLElement;
    restoreTurnBodyEl: HTMLElement;
  };

type TrailingAssistantPatchSuccessPlan = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

type TrailingAssistantPatchTailOutcomePlans = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

type TrailingAssistantPatchTailOutcomePlanParts = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

type TrailingAssistantPatchSuccessPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

type TrailingAssistantPatchExecutionTailInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchDomTarget;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchExecutionTailPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchDomTarget;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchTailOutcomeInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchTailOutcomePlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchTailStatePlanningContext = {
  messageEl: HTMLElement;
  nextTailMessage: ChatMessage;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchCompletionDebugPlanningContext = {
  shouldStickToBottom: boolean;
  summaryPlan: TrailingAssistantPatchCompletionDebugSummaryPlan;
};

type TrailingAssistantPatchCompletionDebugSummaryPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
};

type TrailingAssistantPatchExecutionTailPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
};

type TrailingAssistantPatchPlanningEnvironment = {
  runtime: ConversationRenderRuntimeState | null;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchPlanningContextInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchDomTarget;
  parentEl: HTMLElement;
};

type TrailingAssistantPatchPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchDomTarget;
  parentEl: HTMLElement;
  runtime: ConversationRenderRuntimeState | null;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchPreflight =
  | {
    ok: true;
    planningContext: TrailingAssistantPatchPlanningContext;
  }
  | {
    ok: false;
    reason: string;
    payload?: Record<string, unknown>;
  };

type TrailingAssistantPatchContainerResult =
  | {
    ok: true;
    messagesEl: HTMLElement;
  }
  | {
    ok: false;
    reason: 'missing-container-or-inactive-tab';
  };

type TrailingAssistantPatchTargetFailureReason =
  | 'missing-existing-tail-element'
  | 'missing-tail-content-element';

type TrailingAssistantPatchTargetFailureResult = {
  ok: false;
  reason: TrailingAssistantPatchTargetFailureReason;
};

type TrailingAssistantPatchTargets =
  | {
    ok: true;
    existingTailMessageEl: HTMLElement;
    existingContentEl: HTMLElement;
    parentEl: HTMLElement;
  }
  | TrailingAssistantPatchTargetFailureResult;

type TrailingAssistantPatchRenderedMessagesResult =
  | {
    ok: true;
    previousRenderedMessages: ChatMessage[];
    nextRenderedMessages: ChatMessage[];
  }
  | {
    ok: false;
    reason: 'rendered-message-count-mismatch';
  };

type TrailingAssistantPatchNonTailSignatureResult =
  | {
    ok: true;
  }
  | {
    ok: false;
    reason: 'non-tail-message-signature-mismatch';
    payload: {
      mismatchIndex: number;
    };
  };

type TrailingAssistantPatchTailMessagesResult =
  | {
    ok: true;
    previousTailMessage: ChatMessage;
    nextTailMessage: ChatMessage;
  }
  | ({ ok: false } & TrailingAssistantPatchNonMergeableTailFailurePlan);

type SuccessfulTrailingAssistantPatchTargets = Extract<
  TrailingAssistantPatchTargets,
  { ok: true }
>;
type SuccessfulTrailingAssistantPatchTailMessages = Extract<
  TrailingAssistantPatchTailMessagesResult,
  { ok: true }
>;

export class ConversationRenderService {
  constructor(private readonly host: ConversationRenderHost) {}

  async rerenderConversationMessages(conversation: Conversation): Promise<void> {
    const currentConversation = this.host.getCurrentConversation();
    const messagesEl = this.host.getMessagesContainer();
    if (!currentConversation || currentConversation.id !== conversation.id || !messagesEl) {
      return;
    }

    this.host.logAssistantFinalizationDebug('rerender-conversation-messages-start', {
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      messageCount: conversation.messages.length,
      tailAssistant: this.host.summarizeChatMessageForDebug(
        [...conversation.messages].reverse().find((message) => message.role === 'assistant'),
      ),
    });

    const activeTabId = this.host.getActiveTabId();
    const runtime = this.host.getScrollRuntimeForTab(activeTabId);
    const shouldStickToBottom = runtime?.autoScrollEnabled ?? isElementNearBottom(messagesEl);
    const previousScrollTop = messagesEl.scrollTop;
    this.host.beginConversationHydration(activeTabId);
    const scrollSnapshot = captureElementScrollRestoreSnapshot(
      messagesEl,
      shouldStickToBottom,
      previousScrollTop,
    );

    this.host.clearScheduledScrollToBottom();
    messagesEl.classList.add('is-rehydrating');
    this.host.clearMessagesContainer();
    this.host.resetTurnState();

    try {
      await this.host.renderMessages(conversation.messages);
      await this.host.renderBackgroundTaskIndicatorIfNeeded();
      restoreElementScrollAfterRender(messagesEl, scrollSnapshot, {
        runtime: this.host.getScrollRuntimeForTab(activeTabId),
        onRestoreBottom: () => {
          this.host.scrollToBottom({ tabId: activeTabId });
        },
        onRestored: () => {
          this.host.syncPaneScrollMetrics(activeTabId, messagesEl);
        },
      });
      this.host.scheduleComposerLayoutSync();

      this.host.requestAnimationFrame(() => {
        messagesEl.classList.remove('is-rehydrating');
      });
    } finally {
      this.host.endConversationHydration(activeTabId);
    }

    this.host.logAssistantFinalizationDebug('rerender-conversation-messages-complete', {
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      shouldStickToBottom,
      previousScrollTop,
    });
  }

  async applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void> {
    const currentConversation = this.host.getCurrentConversation();
    if (!currentConversation) {
      return;
    }

    const incrementalUpdate = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => this.host.getMessagesForRender(messages),
      getMessageVisualSignature: (message) => this.host.getMessageVisualSignature(message),
    });
    if (!incrementalUpdate) {
      await this.rerenderConversationMessages(currentConversation);
      return;
    }

    const shouldStickToBottom = this.host.shouldAutoScroll();
    this.host.syncBackgroundTaskStateFromConversation(currentConversation);

    if (incrementalUpdate.patchTrailingAssistant) {
      const patchedTail = await this.patchTrailingAssistantRender(previousMessages, nextMessages);
      if (!patchedTail) {
        await this.rerenderConversationMessages(currentConversation);
        return;
      }
    }

    for (const messageToRender of incrementalUpdate.appendedRenderedMessages) {
      if (this.host.shouldPseudoStreamSyncedAssistantMessage(messageToRender)) {
        await this.host.renderSyncedAssistantMessageWithReveal(messageToRender);
      } else {
        await this.host.renderMessage(messageToRender);
      }
    }

    await this.host.renderBackgroundTaskIndicatorIfNeeded();

    if (shouldStickToBottom) {
      this.host.scrollToBottom();
    }
  }

  async patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<boolean> {
    const skippedDebugPlanningContext = this.buildTrailingAssistantPatchSkippedDebugPlanningContext(
      previousMessages,
      nextMessages,
      tabId,
    );
    const fail = (reason: string, payload: Record<string, unknown> = {}): false => {
      const skippedDebugLoggingContext =
        this.buildTrailingAssistantPatchSkippedDebugLoggingContext(
          skippedDebugPlanningContext,
          reason,
          payload,
        );
      this.logTrailingAssistantPatchSkippedDebug(skippedDebugLoggingContext);
      return false;
    };
    const preflight = this.resolveTrailingAssistantPatchPreflight(
      previousMessages,
      nextMessages,
      tabId,
    );
    if (!preflight.ok) {
      return fail(preflight.reason, preflight.payload);
    }
    const successPlan = this.buildTrailingAssistantPatchSuccessPlan(preflight.planningContext);

    await this.withTrailingAssistantTurnBodyScope(successPlan.turnBodyScopePlan, async () => {
      await this.executeTrailingAssistantPatch(successPlan.executionPlan);
      this.applyTrailingAssistantPatchTailState(successPlan.tailStatePlan, tabId);
    });

    const completionDebugLoggingContext =
      this.buildTrailingAssistantPatchCompletionDebugLoggingContext(
        successPlan.completionDebugPlan,
        tabId,
      );
    this.logTrailingAssistantPatchCompletionDebug(completionDebugLoggingContext);
    return true;
  }

  private resolveTrailingAssistantPatchNonTailSignatureMismatch(
    previousRenderedMessages: ChatMessage[],
    nextRenderedMessages: ChatMessage[],
  ): TrailingAssistantPatchNonTailSignatureResult {
    const lastIndex = previousRenderedMessages.length - 1;
    for (let index = 0; index < lastIndex; index += 1) {
      if (
        this.host.getMessageVisualSignature(previousRenderedMessages[index])
        !== this.host.getMessageVisualSignature(nextRenderedMessages[index])
      ) {
        return {
          ok: false,
          reason: 'non-tail-message-signature-mismatch',
          payload: {
            mismatchIndex: index,
          },
        };
      }
    }

    return { ok: true };
  }

  private isPatchableAssistantTail(
    previousTailMessage: ChatMessage,
    nextTailMessage: ChatMessage,
  ): boolean {
    return previousTailMessage.role === 'assistant'
      && nextTailMessage.role === 'assistant'
      && previousTailMessage.displayStyle !== 'notice'
      && nextTailMessage.displayStyle !== 'notice';
  }

  private buildTrailingAssistantPatchNonMergeableTailFailurePlan(
    previousTailMessage: ChatMessage,
    nextTailMessage: ChatMessage,
  ): TrailingAssistantPatchNonMergeableTailFailurePlan {
    return {
      reason: 'tail-message-not-mergeable-assistant',
      payload: {
        previousTail: this.host.summarizeChatMessageForDebug(previousTailMessage),
        nextTail: this.host.summarizeChatMessageForDebug(nextTailMessage),
      },
    };
  }

  private resolveTrailingAssistantPatchTailMessages(
    previousRenderedMessages: ChatMessage[],
    nextRenderedMessages: ChatMessage[],
  ): TrailingAssistantPatchTailMessagesResult {
    const previousTailMessage = previousRenderedMessages[previousRenderedMessages.length - 1];
    const nextTailMessage = nextRenderedMessages[nextRenderedMessages.length - 1];
    if (!this.isPatchableAssistantTail(previousTailMessage, nextTailMessage)) {
      return {
        ok: false,
        ...this.buildTrailingAssistantPatchNonMergeableTailFailurePlan(
          previousTailMessage,
          nextTailMessage,
        ),
      };
    }

    return {
      ok: true,
      previousTailMessage,
      nextTailMessage,
    };
  }

  private resolveTrailingAssistantPatchRenderedMessages(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): TrailingAssistantPatchRenderedMessagesResult {
    const previousRenderedMessages = this.host.getMessagesForRender(previousMessages);
    const nextRenderedMessages = this.host.getMessagesForRender(nextMessages);
    if (
      previousRenderedMessages.length === 0
      || previousRenderedMessages.length !== nextRenderedMessages.length
    ) {
      return { ok: false, reason: 'rendered-message-count-mismatch' };
    }

    return {
      ok: true,
      previousRenderedMessages,
      nextRenderedMessages,
    };
  }

  private resolveTrailingAssistantPatchActiveContainer(
    tabId: TabId | null,
  ): TrailingAssistantPatchContainerResult {
    const messagesEl = this.host.getMessagesContainer();
    if (!messagesEl || this.host.getActiveTabId() !== tabId) {
      return { ok: false, reason: 'missing-container-or-inactive-tab' };
    }

    return {
      ok: true,
      messagesEl,
    };
  }

  private resolveTrailingAssistantPatchPreflight(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null,
  ): TrailingAssistantPatchPreflight {
    const activeContainer = this.resolveTrailingAssistantPatchActiveContainer(tabId);
    if (!activeContainer.ok) {
      return activeContainer;
    }
    const { messagesEl } = activeContainer;

    const renderedMessages = this.resolveTrailingAssistantPatchRenderedMessages(
      previousMessages,
      nextMessages,
    );
    if (!renderedMessages.ok) {
      return renderedMessages;
    }
    const { previousRenderedMessages, nextRenderedMessages } = renderedMessages;

    const nonTailSignatureMismatch = this.resolveTrailingAssistantPatchNonTailSignatureMismatch(
      previousRenderedMessages,
      nextRenderedMessages,
    );
    if (!nonTailSignatureMismatch.ok) {
      return nonTailSignatureMismatch;
    }

    const tailMessages = this.resolveTrailingAssistantPatchTailMessages(
      previousRenderedMessages,
      nextRenderedMessages,
    );
    if (!tailMessages.ok) {
      return tailMessages;
    }

    const patchTargets = this.resolveTrailingAssistantPatchTargets(messagesEl);
    if (!patchTargets.ok) {
      return patchTargets;
    }

    return {
      ok: true,
      planningContext: this.buildTrailingAssistantPatchPlanningContext(
        tailMessages,
        patchTargets,
        tabId,
      ),
    };
  }

  private buildTrailingAssistantPatchPlanningContext(
    tailMessages: SuccessfulTrailingAssistantPatchTailMessages,
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
    tabId: TabId | null,
  ): TrailingAssistantPatchPlanningContext {
    return this.buildTrailingAssistantPatchSuccessPlanningContext(
      this.buildTrailingAssistantPatchPlanningContextInputs(tailMessages, patchTargets),
      this.buildTrailingAssistantPatchPlanningEnvironment(tabId),
    );
  }

  private buildTrailingAssistantPatchPlanningContextInputs(
    tailMessages: SuccessfulTrailingAssistantPatchTailMessages,
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
  ): TrailingAssistantPatchPlanningContextInputs {
    return {
      previousTailMessage: tailMessages.previousTailMessage,
      nextTailMessage: tailMessages.nextTailMessage,
      patchTarget: this.buildTrailingAssistantPatchDomTarget(patchTargets),
      parentEl: patchTargets.parentEl,
    };
  }

  private buildTrailingAssistantPatchSuccessPlanningContext(
    planningInputs: TrailingAssistantPatchPlanningContextInputs,
    environment: TrailingAssistantPatchPlanningEnvironment,
  ): TrailingAssistantPatchPlanningContext {
    return {
      previousTailMessage: planningInputs.previousTailMessage,
      nextTailMessage: planningInputs.nextTailMessage,
      patchTarget: planningInputs.patchTarget,
      parentEl: planningInputs.parentEl,
      runtime: environment.runtime,
      shouldStickToBottom: environment.shouldStickToBottom,
    };
  }

  private buildTrailingAssistantPatchPlanningEnvironment(
    tabId: TabId | null,
  ): TrailingAssistantPatchPlanningEnvironment {
    return {
      runtime: this.host.getRenderRuntimeForTab(tabId),
      shouldStickToBottom: this.host.shouldAutoScroll(tabId),
    };
  }

  private buildTrailingAssistantPatchSuccessPlan(
    planningContext: TrailingAssistantPatchPlanningContext,
  ): TrailingAssistantPatchSuccessPlan {
    return this.buildTrailingAssistantPatchSuccessPlanFromParts(
      this.buildTrailingAssistantPatchSuccessPlanParts(planningContext),
    );
  }

  private buildTrailingAssistantPatchSuccessPlanParts(
    planningContext: TrailingAssistantPatchPlanningContext,
  ): TrailingAssistantPatchSuccessPlanParts {
    return {
      turnBodyScopePlan: this.buildTrailingAssistantPatchTurnBodyScopePlan(
        this.buildTrailingAssistantPatchTurnBodyScopeInputs(planningContext),
      ),
      ...this.buildTrailingAssistantPatchExecutionTailPlanPartsFromPlanningContext(
        planningContext,
      ),
    };
  }

  private buildTrailingAssistantPatchDomTarget(
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
  ): TrailingAssistantPatchDomTarget {
    return {
      messageEl: patchTargets.existingTailMessageEl,
      contentEl: patchTargets.existingContentEl,
    };
  }

  private buildTrailingAssistantPatchTurnBodyScopeInputs(
    planningContext: TrailingAssistantPatchPlanningContext,
  ): TrailingAssistantPatchTurnBodyScopeInputs {
    return {
      runtime: planningContext.runtime,
      parentEl: planningContext.parentEl,
    };
  }

  private buildTrailingAssistantPatchTurnBodyScopePlan(
    inputs: TrailingAssistantPatchTurnBodyScopeInputs,
  ): TrailingAssistantPatchTurnBodyScopePlan {
    if (!inputs.runtime) {
      return { runtime: null };
    }

    return {
      runtime: inputs.runtime,
      scopedTurnBodyEl: inputs.parentEl,
      restoreTurnBodyEl: inputs.runtime.currentTurnBodyEl ?? inputs.parentEl,
    };
  }

  private buildTrailingAssistantPatchExecutionTailPlanPartsFromPlanningContext(
    planningContext: TrailingAssistantPatchPlanningContext,
  ): TrailingAssistantPatchExecutionTailPlanParts {
    const executionTailPlanningContext =
      this.buildTrailingAssistantPatchExecutionTailPlanningContext(
        this.buildTrailingAssistantPatchExecutionTailInputs(planningContext),
      );
    return {
      executionPlan:
        this.buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext(
          executionTailPlanningContext,
        ),
      tailOutcomePlans:
        this.buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
          executionTailPlanningContext,
        ),
    };
  }

  private buildTrailingAssistantPatchExecutionTailInputs(
    planningContext: TrailingAssistantPatchPlanningContext,
  ): TrailingAssistantPatchExecutionTailInputs {
    return {
      previousTailMessage: planningContext.previousTailMessage,
      nextTailMessage: planningContext.nextTailMessage,
      patchTarget: planningContext.patchTarget,
      shouldStickToBottom: planningContext.shouldStickToBottom,
    };
  }

  private buildTrailingAssistantPatchExecutionTailPlanningContext(
    inputs: TrailingAssistantPatchExecutionTailInputs,
  ): TrailingAssistantPatchExecutionTailPlanningContext {
    return {
      previousTailMessage: inputs.previousTailMessage,
      nextTailMessage: inputs.nextTailMessage,
      patchTarget: inputs.patchTarget,
      shouldStickToBottom: inputs.shouldStickToBottom,
    };
  }

  private shouldFinalizeTrailingAssistantFooterOnly(
    previousTailMessage: ChatMessage,
    nextTailMessage: ChatMessage,
  ): boolean {
    return this.host.assistantTailRender.getBodySignature(previousTailMessage)
      === this.host.assistantTailRender.getBodySignature(nextTailMessage);
  }

  private buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext(
    planningContext: TrailingAssistantPatchExecutionTailPlanningContext,
  ): TrailingAssistantPatchExecutionPlan {
    return this.buildTrailingAssistantPatchExecutionPlan(
      planningContext.previousTailMessage,
      planningContext.nextTailMessage,
      planningContext.patchTarget,
    );
  }

  private buildTrailingAssistantPatchExecutionPlan(
    previousTailMessage: ChatMessage,
    nextTailMessage: ChatMessage,
    patchTarget: TrailingAssistantPatchDomTarget,
  ): TrailingAssistantPatchExecutionPlan {
    if (this.shouldFinalizeTrailingAssistantFooterOnly(previousTailMessage, nextTailMessage)) {
      return {
        kind: 'finalize-footer',
        messageEl: patchTarget.messageEl,
        nextTailMessage,
      };
    }

    return {
      kind: 'rerender-content',
      messageEl: patchTarget.messageEl,
      contentEl: patchTarget.contentEl,
      nextTailMessage,
    };
  }

  private buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
    planningContext: TrailingAssistantPatchExecutionTailPlanningContext,
  ): TrailingAssistantPatchTailOutcomePlans {
    return this.buildTrailingAssistantPatchTailOutcomePlans(
      this.buildTrailingAssistantPatchTailOutcomePlanningContext(
        this.buildTrailingAssistantPatchTailOutcomeInputs(planningContext),
      ),
    );
  }

  private buildTrailingAssistantPatchTailOutcomeInputs(
    planningContext: TrailingAssistantPatchExecutionTailPlanningContext,
  ): TrailingAssistantPatchTailOutcomeInputs {
    return {
      previousTailMessage: planningContext.previousTailMessage,
      nextTailMessage: planningContext.nextTailMessage,
      messageEl: planningContext.patchTarget.messageEl,
      shouldStickToBottom: planningContext.shouldStickToBottom,
    };
  }

  private buildTrailingAssistantPatchTailOutcomePlanningContext(
    inputs: TrailingAssistantPatchTailOutcomeInputs,
  ): TrailingAssistantPatchTailOutcomePlanningContext {
    return {
      previousTailMessage: inputs.previousTailMessage,
      nextTailMessage: inputs.nextTailMessage,
      messageEl: inputs.messageEl,
      shouldStickToBottom: inputs.shouldStickToBottom,
    };
  }

  private buildTrailingAssistantPatchTailOutcomePlans(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
  ): TrailingAssistantPatchTailOutcomePlans {
    const planParts = this.buildTrailingAssistantPatchTailOutcomePlanParts(planningContext);
    return {
      tailStatePlan: planParts.tailStatePlan,
      completionDebugPlan: planParts.completionDebugPlan,
    };
  }

  private buildTrailingAssistantPatchTailOutcomePlanParts(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
  ): TrailingAssistantPatchTailOutcomePlanParts {
    const tailStatePlan =
      this.buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
        planningContext,
      );
    return {
      tailStatePlan,
      completionDebugPlan:
        this.buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
          planningContext,
          tailStatePlan,
        ),
    };
  }

  private buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
  ): TrailingAssistantPatchTailStatePlan {
    return this.buildTrailingAssistantPatchTailStatePlan(
      this.buildTrailingAssistantPatchTailStatePlanningContext(planningContext),
    );
  }

  private buildTrailingAssistantPatchTailStatePlanningContext(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
  ): TrailingAssistantPatchTailStatePlanningContext {
    return {
      messageEl: planningContext.messageEl,
      nextTailMessage: planningContext.nextTailMessage,
      shouldStickToBottom: planningContext.shouldStickToBottom,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
    tailStatePlan: TrailingAssistantPatchTailStatePlan,
  ): TrailingAssistantPatchCompletionDebugPlan {
    return this.buildTrailingAssistantPatchCompletionDebugPlan(
      this.buildTrailingAssistantPatchCompletionDebugPlanningContext(
        planningContext,
        tailStatePlan,
      ),
    );
  }

  private buildTrailingAssistantPatchCompletionDebugPlanningContext(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
    tailStatePlan: TrailingAssistantPatchTailStatePlan,
  ): TrailingAssistantPatchCompletionDebugPlanningContext {
    return {
      shouldStickToBottom: tailStatePlan.shouldStickToBottom,
      summaryPlan:
        this.buildTrailingAssistantPatchCompletionDebugSummaryPlanFromTailOutcomePlanningContext(
          planningContext,
        ),
    };
  }

  private buildTrailingAssistantPatchCompletionDebugSummaryPlanFromTailOutcomePlanningContext(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
  ): TrailingAssistantPatchCompletionDebugSummaryPlan {
    return this.buildTrailingAssistantPatchCompletionDebugSummaryPlan(
      this.buildTrailingAssistantPatchCompletionDebugSummaryPlanningContext(planningContext),
    );
  }

  private buildTrailingAssistantPatchCompletionDebugSummaryPlanningContext(
    planningContext: TrailingAssistantPatchTailOutcomePlanningContext,
  ): TrailingAssistantPatchCompletionDebugSummaryPlanningContext {
    return {
      previousTailMessage: planningContext.previousTailMessage,
      nextTailMessage: planningContext.nextTailMessage,
    };
  }

  private buildTrailingAssistantPatchSuccessPlanFromParts(
    planParts: TrailingAssistantPatchSuccessPlanParts,
  ): TrailingAssistantPatchSuccessPlan {
    return {
      executionPlan: planParts.executionPlan,
      tailStatePlan: planParts.tailOutcomePlans.tailStatePlan,
      completionDebugPlan: planParts.tailOutcomePlans.completionDebugPlan,
      turnBodyScopePlan: planParts.turnBodyScopePlan,
    };
  }

  private buildTrailingAssistantPatchTailStatePlan(
    planningContext: TrailingAssistantPatchTailStatePlanningContext,
  ): TrailingAssistantPatchTailStatePlan {
    return {
      messageEl: planningContext.messageEl,
      messageId: planningContext.nextTailMessage.id,
      sourceMessageId: planningContext.nextTailMessage.sourceMessageId ?? null,
      shouldStickToBottom: planningContext.shouldStickToBottom,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugPlan(
    planningContext: TrailingAssistantPatchCompletionDebugPlanningContext,
  ): TrailingAssistantPatchCompletionDebugPlan {
    return {
      shouldStickToBottom: planningContext.shouldStickToBottom,
      previousTail: planningContext.summaryPlan.previousTail,
      nextTail: planningContext.summaryPlan.nextTail,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugSummaryPlan(
    planningContext: TrailingAssistantPatchCompletionDebugSummaryPlanningContext,
  ): TrailingAssistantPatchCompletionDebugSummaryPlan {
    return {
      previousTail: this.host.summarizeChatMessageForDebug(planningContext.previousTailMessage),
      nextTail: this.host.summarizeChatMessageForDebug(planningContext.nextTailMessage),
    };
  }

  private async executeTrailingAssistantPatch(
    executionPlan: TrailingAssistantPatchExecutionPlan,
  ): Promise<void> {
    if (executionPlan.kind === 'finalize-footer') {
      this.host.assistantTailRender.finalizePersistedFooter(
        executionPlan.messageEl,
        executionPlan.nextTailMessage,
      );
      return;
    }

    executionPlan.contentEl.replaceChildren();
    await this.host.assistantTailRender.renderMessageContent(
      executionPlan.messageEl,
      executionPlan.contentEl,
      executionPlan.nextTailMessage,
    );
  }

  private async withTrailingAssistantTurnBodyScope<T>(
    turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!turnBodyScopePlan.runtime) {
      return run();
    }

    const {
      runtime,
      scopedTurnBodyEl,
      restoreTurnBodyEl,
    } = turnBodyScopePlan;
    runtime.currentTurnBodyEl = scopedTurnBodyEl;

    try {
      return await run();
    } finally {
      runtime.currentTurnBodyEl = restoreTurnBodyEl;
    }
  }

  private applyTrailingAssistantPatchTailState(
    tailStatePlan: TrailingAssistantPatchTailStatePlan,
    tabId: TabId | null,
  ): void {
    const { messageEl, messageId, sourceMessageId, shouldStickToBottom } = tailStatePlan;
    messageEl.dataset.messageId = messageId;
    if (sourceMessageId) {
      messageEl.dataset.sourceMessageId = sourceMessageId;
    } else {
      delete messageEl.dataset.sourceMessageId;
    }
    messageEl.style.animation = 'none';
    if (shouldStickToBottom) {
      this.host.scrollToBottom({ tabId });
    }
  }

  private logTrailingAssistantPatchCompletionDebug(
    loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  ): void {
    const logPlan = this.buildTrailingAssistantPatchCompletionDebugLogPlanFromLoggingContext(
      loggingContext,
    );
    this.host.logAssistantFinalizationDebug(logPlan.label, logPlan.payload);
  }

  private buildTrailingAssistantPatchCompletionDebugLoggingContext(
    completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan,
    tabId: TabId | null,
  ): TrailingAssistantPatchCompletionDebugLoggingContext {
    return {
      completionDebugPlan,
      tabId,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugLogPlanningContextFromLoggingContext(
    loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  ): TrailingAssistantPatchCompletionDebugLogPlanningContext {
    return this.buildTrailingAssistantPatchCompletionDebugLogPlanningContext(
      this.buildTrailingAssistantPatchCompletionDebugPayloadInputsFromLoggingContext(
        loggingContext,
      ),
      loggingContext.tabId,
    );
  }

  private buildTrailingAssistantPatchCompletionDebugLogPlanFromLoggingContext(
    loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  ): TrailingAssistantPatchCompletionDebugLogPlan {
    return this.buildTrailingAssistantPatchCompletionDebugLogPlan(
      this.buildTrailingAssistantPatchCompletionDebugLogPlanningContextFromLoggingContext(
        loggingContext,
      ),
    );
  }

  private buildTrailingAssistantPatchCompletionDebugPayloadInputsFromLoggingContext(
    loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  ): TrailingAssistantPatchCompletionDebugPayloadInputs {
    return this.buildTrailingAssistantPatchCompletionDebugPayloadInputs(
      loggingContext.completionDebugPlan,
    );
  }

  private buildTrailingAssistantPatchCompletionDebugLogPlanningContext(
    payloadInputs: TrailingAssistantPatchCompletionDebugPayloadInputs,
    tabId: TabId | null,
  ): TrailingAssistantPatchCompletionDebugLogPlanningContext {
    return {
      payloadInputs,
      tabId,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugLogPlan(
    planningContext: TrailingAssistantPatchCompletionDebugLogPlanningContext,
  ): TrailingAssistantPatchCompletionDebugLogPlan {
    const payloadPlan =
      this.buildTrailingAssistantPatchCompletionDebugPayloadPlanFromLogPlanningContext(
        planningContext,
      );
    return this.buildTrailingAssistantPatchCompletionDebugFinalLogPlanFromLogPlanningContext(
      planningContext,
      payloadPlan,
    );
  }

  private buildTrailingAssistantPatchCompletionDebugPayloadPlanFromLogPlanningContext(
    planningContext: TrailingAssistantPatchCompletionDebugLogPlanningContext,
  ): TrailingAssistantPatchCompletionDebugPayloadPlan {
    return this.buildTrailingAssistantPatchCompletionDebugPayloadPlan(
      planningContext.payloadInputs,
    );
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogInputsFromLogPlanningContext(
    planningContext: TrailingAssistantPatchCompletionDebugLogPlanningContext,
    payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan,
  ): TrailingAssistantPatchCompletionDebugFinalLogInputs {
    const inputsContract =
      this.buildTrailingAssistantPatchCompletionDebugFinalLogInputsContractFromLogPlanningContext(
        planningContext,
        payloadPlan,
      );
    return this.buildTrailingAssistantPatchCompletionDebugFinalLogInputs(inputsContract);
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogInputsContractFromLogPlanningContext(
    planningContext: TrailingAssistantPatchCompletionDebugLogPlanningContext,
    payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan,
  ): TrailingAssistantPatchCompletionDebugFinalLogInputsContract {
    return this.buildTrailingAssistantPatchCompletionDebugFinalLogInputsContract(
      planningContext.tabId,
      payloadPlan,
    );
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogInputsContract(
    tabId: TabId | null,
    payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan,
  ): TrailingAssistantPatchCompletionDebugFinalLogInputsContract {
    return {
      tabId,
      payloadPlan,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogPlanFromLogPlanningContext(
    planningContext: TrailingAssistantPatchCompletionDebugLogPlanningContext,
    payloadPlan: TrailingAssistantPatchCompletionDebugPayloadPlan,
  ): TrailingAssistantPatchCompletionDebugLogPlan {
    const finalLogInputs =
      this.buildTrailingAssistantPatchCompletionDebugFinalLogInputsFromLogPlanningContext(
        planningContext,
        payloadPlan,
      );
    return this.buildTrailingAssistantPatchCompletionDebugFinalLogPlanFromInputs(
      finalLogInputs,
    );
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogInputs(
    inputsContract: TrailingAssistantPatchCompletionDebugFinalLogInputsContract,
  ): TrailingAssistantPatchCompletionDebugFinalLogInputs {
    return {
      tabId: inputsContract.tabId,
      payloadPlan: inputsContract.payloadPlan,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogPlanFromInputs(
    inputs: TrailingAssistantPatchCompletionDebugFinalLogInputs,
  ): TrailingAssistantPatchCompletionDebugLogPlan {
    const payloadContract =
      this.buildTrailingAssistantPatchCompletionDebugFinalLogPayloadContractFromInputs(
        inputs,
      );
    return this.buildTrailingAssistantPatchCompletionDebugFinalLogPlan(
      this.buildTrailingAssistantPatchCompletionDebugFinalLogPayload(
        payloadContract,
      ),
    );
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogPlan(
    payload: TrailingAssistantPatchCompletionDebugFinalLogPayload,
  ): TrailingAssistantPatchCompletionDebugLogPlan {
    return {
      label: 'patch-trailing-assistant-render-complete',
      payload,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogPayloadContractFromInputs(
    inputs: TrailingAssistantPatchCompletionDebugFinalLogInputs,
  ): TrailingAssistantPatchCompletionDebugFinalLogPayloadContract {
    return {
      tabId: inputs.tabId,
      payloadPlan: inputs.payloadPlan,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugFinalLogPayload(
    payloadContract: TrailingAssistantPatchCompletionDebugFinalLogPayloadContract,
  ): TrailingAssistantPatchCompletionDebugFinalLogPayload {
    return {
      tabId: payloadContract.tabId,
      ...payloadContract.payloadPlan,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugPayloadPlan(
    inputs: TrailingAssistantPatchCompletionDebugPayloadInputs,
  ): TrailingAssistantPatchCompletionDebugPayloadPlan {
    return {
      shouldStickToBottom: inputs.shouldStickToBottom,
      previousTail: inputs.previousTail,
      nextTail: inputs.nextTail,
    };
  }

  private buildTrailingAssistantPatchCompletionDebugPayloadInputs(
    completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan,
  ): TrailingAssistantPatchCompletionDebugPayloadInputs {
    return {
      shouldStickToBottom: completionDebugPlan.shouldStickToBottom,
      previousTail: completionDebugPlan.previousTail,
      nextTail: completionDebugPlan.nextTail,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugPlanningContext(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null,
  ): TrailingAssistantPatchSkippedDebugPlanningContext {
    return {
      previousMessages,
      nextMessages,
      tabId,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugLoggingContext(
    planningContext: TrailingAssistantPatchSkippedDebugPlanningContext,
    reason: string,
    payload: Record<string, unknown>,
  ): TrailingAssistantPatchSkippedDebugLoggingContext {
    return {
      planningContext,
      reason,
      payload,
    };
  }

  private logTrailingAssistantPatchSkippedDebug(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): void {
    const logPlan = this.buildTrailingAssistantPatchSkippedDebugLogPlanFromLoggingContext(
      loggingContext,
    );
    this.host.logAssistantFinalizationDebug(logPlan.label, logPlan.payload);
  }

  private buildTrailingAssistantPatchSkippedDebugLogPlanningContextFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugLogPlanningContext {
    return this.buildTrailingAssistantPatchSkippedDebugLogPlanningContext(
      this.buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext(
        loggingContext,
      ),
      loggingContext.planningContext.tabId,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugLogPlanningContext(
    payloadInputs: TrailingAssistantPatchSkippedDebugPayloadInputs,
    tabId: TabId | null,
  ): TrailingAssistantPatchSkippedDebugLogPlanningContext {
    return {
      payloadInputs,
      tabId,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugLogPlanFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugLogPlan {
    return this.buildTrailingAssistantPatchSkippedDebugLogPlan(
      this.buildTrailingAssistantPatchSkippedDebugLogPlanningContextFromLoggingContext(
        loggingContext,
      ),
    );
  }

  private buildTrailingAssistantPatchSkippedDebugLogPlan(
    planningContext: TrailingAssistantPatchSkippedDebugLogPlanningContext,
  ): TrailingAssistantPatchSkippedDebugLogPlan {
    const payloadPlan =
      this.buildTrailingAssistantPatchSkippedDebugPayloadPlanFromLogPlanningContext(
        planningContext,
      );
    return this.buildTrailingAssistantPatchSkippedDebugFinalLogPlanFromLogPlanningContext(
      planningContext,
      payloadPlan,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadPlanFromLogPlanningContext(
    planningContext: TrailingAssistantPatchSkippedDebugLogPlanningContext,
  ): TrailingAssistantPatchSkippedDebugPayloadPlan {
    return this.buildTrailingAssistantPatchSkippedDebugPayloadPlan(
      planningContext.payloadInputs,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogInputsFromLogPlanningContext(
    planningContext: TrailingAssistantPatchSkippedDebugLogPlanningContext,
    payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan,
  ): TrailingAssistantPatchSkippedDebugFinalLogInputs {
    const inputsContract =
      this.buildTrailingAssistantPatchSkippedDebugFinalLogInputsContractFromLogPlanningContext(
        planningContext,
        payloadPlan,
      );
    return this.buildTrailingAssistantPatchSkippedDebugFinalLogInputs(inputsContract);
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogInputsContractFromLogPlanningContext(
    planningContext: TrailingAssistantPatchSkippedDebugLogPlanningContext,
    payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan,
  ): TrailingAssistantPatchSkippedDebugFinalLogInputsContract {
    return this.buildTrailingAssistantPatchSkippedDebugFinalLogInputsContract(
      planningContext.tabId,
      payloadPlan,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogInputsContract(
    tabId: TabId | null,
    payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan,
  ): TrailingAssistantPatchSkippedDebugFinalLogInputsContract {
    return {
      tabId,
      payloadPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogPlanFromLogPlanningContext(
    planningContext: TrailingAssistantPatchSkippedDebugLogPlanningContext,
    payloadPlan: TrailingAssistantPatchSkippedDebugPayloadPlan,
  ): TrailingAssistantPatchSkippedDebugLogPlan {
    const finalLogInputs =
      this.buildTrailingAssistantPatchSkippedDebugFinalLogInputsFromLogPlanningContext(
        planningContext,
        payloadPlan,
      );
    return this.buildTrailingAssistantPatchSkippedDebugFinalLogPlanFromInputs(
      finalLogInputs,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogInputs(
    inputsContract: TrailingAssistantPatchSkippedDebugFinalLogInputsContract,
  ): TrailingAssistantPatchSkippedDebugFinalLogInputs {
    return {
      tabId: inputsContract.tabId,
      payloadPlan: inputsContract.payloadPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogPlanFromInputs(
    inputs: TrailingAssistantPatchSkippedDebugFinalLogInputs,
  ): TrailingAssistantPatchSkippedDebugLogPlan {
    const payloadContract =
      this.buildTrailingAssistantPatchSkippedDebugFinalLogPayloadContractFromInputs(
        inputs,
      );
    return this.buildTrailingAssistantPatchSkippedDebugFinalLogPlan(
      this.buildTrailingAssistantPatchSkippedDebugFinalLogPayload(payloadContract),
    );
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogPayloadContractFromInputs(
    inputs: TrailingAssistantPatchSkippedDebugFinalLogInputs,
  ): TrailingAssistantPatchSkippedDebugFinalLogPayloadContract {
    return {
      tabId: inputs.tabId,
      payloadPlan: inputs.payloadPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogPayload(
    payloadContract: TrailingAssistantPatchSkippedDebugFinalLogPayloadContract,
  ): TrailingAssistantPatchSkippedDebugFinalLogPayload {
    return {
      tabId: payloadContract.tabId,
      ...payloadContract.payloadPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugFinalLogPlan(
    payload: TrailingAssistantPatchSkippedDebugFinalLogPayload,
  ): TrailingAssistantPatchSkippedDebugLogPlan {
    return {
      label: 'patch-trailing-assistant-render-skipped',
      payload,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadPlan(
    inputs: TrailingAssistantPatchSkippedDebugPayloadInputs,
  ): TrailingAssistantPatchSkippedDebugPayloadPlan {
    return {
      reason: inputs.reason,
      previousRenderedCount: inputs.countPlan.previousRenderedCount,
      nextRenderedCount: inputs.countPlan.nextRenderedCount,
      ...inputs.payload,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadInputs(
    inputsContract: TrailingAssistantPatchSkippedDebugPayloadInputsContract,
  ): TrailingAssistantPatchSkippedDebugPayloadInputs {
    return {
      reason: inputsContract.reasonPayloadInputs.reason,
      payload: inputsContract.reasonPayloadInputs.payload,
      countPlan: inputsContract.countPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugPayloadInputs {
    const payloadInputsContract =
      this.buildTrailingAssistantPatchSkippedDebugPayloadInputsContractFromLoggingContext(
        loggingContext,
      );
    return this.buildTrailingAssistantPatchSkippedDebugPayloadInputs(
      payloadInputsContract,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadInputsContractFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugPayloadInputsContract {
    return this.buildTrailingAssistantPatchSkippedDebugPayloadInputsContract(
      this.buildTrailingAssistantPatchSkippedDebugPayloadInputsContractPreparationFromLoggingContext(
        loggingContext,
      ),
    );
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadInputsContractPreparationFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugPayloadInputsContractPreparation {
    const reasonPayloadInputs =
      this.buildTrailingAssistantPatchSkippedDebugReasonPayloadInputsFromLoggingContext(
        loggingContext,
      );
    const countPlan =
      this.buildTrailingAssistantPatchSkippedDebugCountPlanFromLoggingContext(
        loggingContext,
      );
    return this.buildTrailingAssistantPatchSkippedDebugPayloadInputsContractPreparation(
      {
        reasonPayloadInputs,
        countPlan,
      },
    );
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadInputsContractPreparation(
    preparationInputs: TrailingAssistantPatchSkippedDebugPayloadInputsContractPreparationInputs,
  ): TrailingAssistantPatchSkippedDebugPayloadInputsContractPreparation {
    return {
      reasonPayloadInputs: preparationInputs.reasonPayloadInputs,
      countPlan: preparationInputs.countPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugPayloadInputsContract(
    contractPreparation: TrailingAssistantPatchSkippedDebugPayloadInputsContractPreparation,
  ): TrailingAssistantPatchSkippedDebugPayloadInputsContract {
    return {
      reasonPayloadInputs: contractPreparation.reasonPayloadInputs,
      countPlan: contractPreparation.countPlan,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugReasonPayloadInputs(
    reasonPayloadContract: TrailingAssistantPatchSkippedDebugReasonPayloadContract,
  ): TrailingAssistantPatchSkippedDebugReasonPayloadInputs {
    return {
      reason: reasonPayloadContract.reason,
      payload: reasonPayloadContract.payload,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugReasonPayloadInputsFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugReasonPayloadInputs {
    return this.buildTrailingAssistantPatchSkippedDebugReasonPayloadInputs(
      this.buildTrailingAssistantPatchSkippedDebugReasonPayloadContract(
        loggingContext,
      ),
    );
  }

  private buildTrailingAssistantPatchSkippedDebugReasonPayloadContract(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugReasonPayloadContract {
    return {
      reason: loggingContext.reason,
      payload: loggingContext.payload,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugCountPlanFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugCountPlan {
    const countPlanningContract =
      this.buildTrailingAssistantPatchSkippedDebugCountPlanningContractFromLoggingContext(
        loggingContext,
      );
    return this.buildTrailingAssistantPatchSkippedDebugCountPlan(
      countPlanningContract.countInputs,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugCountPlanningContractFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugCountPlanningContract {
    return this.buildTrailingAssistantPatchSkippedDebugCountPlanningContract(
      this.buildTrailingAssistantPatchSkippedDebugCountPlanningInputsFromLoggingContext(
        loggingContext,
      ),
    );
  }

  private buildTrailingAssistantPatchSkippedDebugCountPlanningInputsFromLoggingContext(
    loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  ): TrailingAssistantPatchSkippedDebugCountPlanningInputs {
    return this.buildTrailingAssistantPatchSkippedDebugCountPlanningInputs(
      loggingContext.planningContext,
    );
  }

  private buildTrailingAssistantPatchSkippedDebugCountPlanningInputs(
    planningContext: TrailingAssistantPatchSkippedDebugPlanningContext,
  ): TrailingAssistantPatchSkippedDebugCountPlanningInputs {
    return {
      previousMessages: planningContext.previousMessages,
      nextMessages: planningContext.nextMessages,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugCountPlanningContract(
    countPlanningInputs: TrailingAssistantPatchSkippedDebugCountPlanningInputs,
  ): TrailingAssistantPatchSkippedDebugCountPlanningContract {
    return {
      countInputs: this.buildTrailingAssistantPatchSkippedDebugCountInputs(
        countPlanningInputs,
      ),
    };
  }

  private buildTrailingAssistantPatchSkippedDebugCountInputs(
    countPlanningInputs: TrailingAssistantPatchSkippedDebugCountPlanningInputs,
  ): TrailingAssistantPatchSkippedDebugCountInputs {
    return {
      previousMessages: countPlanningInputs.previousMessages,
      nextMessages: countPlanningInputs.nextMessages,
    };
  }

  private buildTrailingAssistantPatchSkippedDebugCountPlan(
    inputs: TrailingAssistantPatchSkippedDebugCountInputs,
  ): TrailingAssistantPatchSkippedDebugCountPlan {
    return {
      previousRenderedCount:
        this.host.getMessagesForRender(inputs.previousMessages).length,
      nextRenderedCount:
        this.host.getMessagesForRender(inputs.nextMessages).length,
    };
  }

  private buildTrailingAssistantPatchTargetFailureResult(
    reason: TrailingAssistantPatchTargetFailureReason,
  ): TrailingAssistantPatchTargetFailureResult {
    return {
      ok: false,
      reason,
    };
  }

  private buildTrailingAssistantPatchTargetSuccessResult(
    existingTailMessageEl: HTMLElement,
    existingContentEl: HTMLElement,
    parentEl: HTMLElement,
  ): SuccessfulTrailingAssistantPatchTargets {
    return {
      ok: true,
      existingTailMessageEl,
      existingContentEl,
      parentEl,
    };
  }

  private resolveTrailingAssistantPatchTargets(
    messagesEl: HTMLElement,
  ): TrailingAssistantPatchTargets {
    const existingTailMessageEl = this.findExistingTrailingAssistantElement(messagesEl);
    const parentEl = existingTailMessageEl?.parentElement;
    if (!existingTailMessageEl || !(parentEl instanceof HTMLElement)) {
      return this.buildTrailingAssistantPatchTargetFailureResult(
        'missing-existing-tail-element',
      );
    }

    const existingContentEl = existingTailMessageEl.querySelector('.opencodian-message-content');
    if (!(existingContentEl instanceof HTMLElement)) {
      return this.buildTrailingAssistantPatchTargetFailureResult(
        'missing-tail-content-element',
      );
    }

    return this.buildTrailingAssistantPatchTargetSuccessResult(
      existingTailMessageEl,
      existingContentEl,
      parentEl,
    );
  }

  private findExistingTrailingAssistantElement(messagesEl: HTMLElement): HTMLElement | null {
    return Array.from(
      messagesEl.querySelectorAll<HTMLElement>('.opencodian-message--assistant'),
    )
      .filter((element) => !element.classList.contains('opencodian-message--notice'))
      .pop() ?? null;
  }
}
