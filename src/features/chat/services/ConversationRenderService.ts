import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
} from '../../../core/opencode';
import {
  type ChatMessage,
  type Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  ConversationMessageRenderDelegate,
  type ConversationRenderHost,
  ConversationSyncedUpdateApplyDelegate,
} from './ConversationRenderRuntime';
import {
  type TrailingAssistantPatchPlanningContext,
  TrailingAssistantPatchPlanningDelegate,
} from './ConversationTrailingAssistantPatchPlanner';
import { ConversationTurnViewModelBuilder } from './ConversationTurnViewModelBuilder';
import {
  captureElementScrollRestoreSnapshot,
  isElementNearBottom,
  restoreElementScrollAfterRender,
} from './ScrollManager';
import {
  buildTrailingAssistantPatchCompletionDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugPlanningContext,
  emitTrailingAssistantPatchCompletionDebugLog,
  emitTrailingAssistantPatchSkippedDebugLog,
} from './trailingAssistantPatchDebug';
import {
  applyTrailingAssistantPatchTailState,
  buildTrailingAssistantPatchSuccessPlanFromPlanningContext,
  buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract,
  type TrailingAssistantPatchExecutionPlan,
  type TrailingAssistantPatchSuccessPlan,
  withTrailingAssistantTurnBodyScope,
} from './trailingAssistantPatchExecution';

export type {
  ConversationAssistantShellRenderPort,
  ConversationAssistantTailRenderPort,
  ConversationRenderHost,
  ConversationRenderRuntimeState,
  ConversationUserMessageRenderFrame,
  IncrementalRenderedMessageUpdate,
  IncrementalRenderedMessageUpdateOptions,
} from './ConversationRenderRuntime';
export { getIncrementalRenderedMessageUpdate } from './ConversationRenderRuntime';

export interface ConversationCanonicalRenderSource {
  getCanonicalSessionState(sessionId: string): OpenCodeCanonicalSessionState | null;
  hydrateOpenCodeMessage(
    info: OpenCodeCanonicalMessageInfo,
    parts: OpenCodeCanonicalPart[],
  ): ChatMessage;
}

export class ConversationRenderService {
  private readonly messageRenderer: ConversationMessageRenderDelegate;
  private readonly syncedUpdateApplier: ConversationSyncedUpdateApplyDelegate;
  private readonly trailingAssistantPatchPlanner: TrailingAssistantPatchPlanningDelegate;
  private readonly turnViewModelBuilder = new ConversationTurnViewModelBuilder();

  constructor(
    private readonly host: ConversationRenderHost,
    private readonly canonicalRenderSource?: ConversationCanonicalRenderSource,
  ) {
    this.messageRenderer = new ConversationMessageRenderDelegate(host);
    this.trailingAssistantPatchPlanner = new TrailingAssistantPatchPlanningDelegate(host);
    this.syncedUpdateApplier = new ConversationSyncedUpdateApplyDelegate(
      host,
      this.messageRenderer,
      {
        patchTrailingAssistantRender: (previousMessages, nextMessages) =>
          this.patchTrailingAssistantRender(previousMessages, nextMessages),
        rerenderConversationMessages: (conversation) =>
          this.rerenderConversationMessages(conversation),
      },
    );
  }

  async renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined> {
    return this.messageRenderer.renderMessage(message);
  }

  async renderMessages(messages: ChatMessage[]): Promise<void> {
    await this.messageRenderer.renderMessages(messages);
  }

  async rerenderSingleUserMessage(
    previousMessageId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.messageRenderer.rerenderSingleUserMessage(previousMessageId, message);
  }

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
      await this.renderMessages(this.resolveConversationRenderMessages(conversation));
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
    const resolvedNextMessages = currentConversation
      ? this.resolveConversationRenderMessages(currentConversation, nextMessages)
      : nextMessages;
    await this.syncedUpdateApplier.apply(previousMessages, resolvedNextMessages);
  }

  async patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<boolean> {
    const skippedDebugPlanningContext = buildTrailingAssistantPatchSkippedDebugPlanningContext(
      previousMessages,
      nextMessages,
      tabId,
    );
    const fail = (reason: string, payload: Record<string, unknown> = {}): false => {
      const skippedDebugLoggingContext =
        buildTrailingAssistantPatchSkippedDebugLoggingContext(
          skippedDebugPlanningContext,
          reason,
          payload,
        );
      emitTrailingAssistantPatchSkippedDebugLog(
        skippedDebugLoggingContext,
        this.host,
      );
      return false;
    };
    const preflight = this.trailingAssistantPatchPlanner.resolvePreflight(
      previousMessages,
      nextMessages,
      tabId,
    );
    if (!preflight.ok) {
      return fail(preflight.reason, preflight.payload);
    }
    const successPlan = this.buildTrailingAssistantPatchSuccessPlan(preflight.planningContext);

    await withTrailingAssistantTurnBodyScope(successPlan.turnBodyScopePlan, async () => {
      await this.executeTrailingAssistantPatch(successPlan.executionPlan);
      applyTrailingAssistantPatchTailState(successPlan.tailStatePlan, tabId, this.host);
    });

    const completionDebugLoggingContext =
      buildTrailingAssistantPatchCompletionDebugLoggingContext(
        successPlan.completionDebugPlan,
        tabId,
      );
    emitTrailingAssistantPatchCompletionDebugLog(
      completionDebugLoggingContext,
      this.host,
    );
    return true;
  }

  private buildTrailingAssistantPatchSuccessPlan(
    planningContext: TrailingAssistantPatchPlanningContext,
  ): TrailingAssistantPatchSuccessPlan {
    return buildTrailingAssistantPatchSuccessPlanFromPlanningContext(
      buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract({
        planningContext,
        assistantTailRender: this.host.assistantTailRender,
        summarizeChatMessageForDebug: this.host.summarizeChatMessageForDebug,
      }),
    );
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
    await this.host.assistantTailRender.renderMessageBody(
      executionPlan.contentEl,
      executionPlan.nextTailMessage,
    );
  }

  private resolveConversationRenderMessages(
    conversation: Conversation,
    fallbackMessages: ChatMessage[] = conversation.messages,
  ): ChatMessage[] {
    const canonicalMessages = this.buildCanonicalRenderMessages(conversation.openCodeSessionId);
    return canonicalMessages.length > 0 ? canonicalMessages : fallbackMessages;
  }

  private buildCanonicalRenderMessages(sessionId: string): ChatMessage[] {
    const canonicalRenderSource = this.canonicalRenderSource;
    if (!canonicalRenderSource) {
      return [];
    }

    const sessionState = canonicalRenderSource.getCanonicalSessionState(sessionId);
    if (!sessionState) {
      return [];
    }

    const turns = this.turnViewModelBuilder.buildTurns(sessionState);
    return this.turnViewModelBuilder.buildRenderMessages(
      turns,
      (info, parts) => canonicalRenderSource.hydrateOpenCodeMessage(info, parts),
    );
  }

}
