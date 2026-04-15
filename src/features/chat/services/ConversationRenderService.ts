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
import {
  emitTrailingAssistantPatchCompletionDebugLog,
  emitTrailingAssistantPatchSkippedDebugLog,
} from './TrailingAssistantPatchDebugLogEmitterHelper';
import {
  buildTrailingAssistantPatchCompletionDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugPlanningContext,
} from './TrailingAssistantPatchDebugLoggingContextHelper';
import {
  type TrailingAssistantPatchExecutionPlan,
} from './TrailingAssistantPatchExecutionPlanHelper';
import { type TrailingAssistantPatchSuccessPlan } from './TrailingAssistantPatchSuccessPlanHelper';
import {
  buildTrailingAssistantPatchSuccessPlanFromPlanningContext,
} from './TrailingAssistantPatchSuccessPlanningContextPlanHelper';
import {
  buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract,
} from './TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper';
import {
  applyTrailingAssistantPatchTailState,
} from './TrailingAssistantPatchTailStateApplierHelper';
import {
  withTrailingAssistantTurnBodyScope,
} from './TrailingAssistantPatchTurnBodyScopeHelper';

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
  renderMessageBody(
    contentEl: HTMLElement,
    message: ChatMessage,
  ): Promise<void>;
  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void;
}

export interface ConversationAssistantShellRenderPort {
  renderPersistedMessage(message: ChatMessage): Promise<HTMLElement | void | undefined>;
  createAssistantMessageElement(): {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
  };
  finalizePseudoStreamFooter(
    messageEl: HTMLElement,
    message: Pick<ChatMessage, 'content' | 'timestamp' | 'modelId'>,
  ): void;
  clearStreamingMessageState(): void;
}

export interface ConversationUserMessageRenderFrame {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
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
  shouldRenderEmptyConversationNotice(): boolean;
  createEmptyConversationNoticeMessage(): ChatMessage;
  createUserMessageFrame(message: ChatMessage): ConversationUserMessageRenderFrame | null;
  renderUserMessageContent(container: HTMLElement, message: ChatMessage): Promise<string>;
  addUserMessageFooter(messageEl: HTMLElement, message: ChatMessage, content?: string): void;
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;

  shouldAutoScroll(tabId?: TabId | null): boolean;
  scrollToBottom(options?: { tabId?: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  scheduleComposerLayoutSync(): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;

  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  getMessageVisualSignature(message: ChatMessage): string;
  assistantShellRender: ConversationAssistantShellRenderPort;
  assistantTailRender: ConversationAssistantTailRenderPort;

  logAssistantFinalizationDebug(label: string, payload: unknown): void;
  summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null;
}

type TrailingAssistantPatchDomTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

type TrailingAssistantPatchNonMergeableTailFailurePlan = {
  reason: 'tail-message-not-mergeable-assistant';
  payload: {
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  };
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

type ConversationSyncedUpdatePatchPort = {
  patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<boolean>;
  rerenderConversationMessages(conversation: Conversation): Promise<void>;
};

type ConversationSyncedUpdateApplyContext = {
  currentConversation: Conversation;
  incrementalUpdate: IncrementalRenderedMessageUpdate;
  nextMessages: ChatMessage[];
  previousMessages: ChatMessage[];
};

class ConversationAssistantMessageRenderDelegate {
  constructor(private readonly host: ConversationRenderHost) {}

  renderPersistedMessage(
    message: ChatMessage,
  ): Promise<HTMLElement | void | undefined> {
    return this.host.assistantShellRender.renderPersistedMessage(message);
  }

  async renderSyncedMessage(message: ChatMessage): Promise<void> {
    if (!this.shouldPseudoStreamSyncedAssistantMessage(message)) {
      await this.renderPersistedMessage(message);
      return;
    }

    await this.renderSyncedAssistantMessageWithReveal(message);
  }

  private shouldPseudoStreamSyncedAssistantMessage(message: ChatMessage): boolean {
    if (message.displayStyle === 'notice' || message.questionResolution) {
      return false;
    }

    if (!message.content?.trim()) {
      return false;
    }

    if (!message.contentBlocks || message.contentBlocks.length === 0) {
      return true;
    }

    return message.contentBlocks.every((block) => block.type === 'text' && Boolean(block.text));
  }

  private async renderSyncedAssistantMessageWithReveal(message: ChatMessage): Promise<void> {
    const { messageEl, contentEl } = this.host.assistantShellRender.createAssistantMessageElement();
    const textEl = document.createElement('div');
    textEl.className = 'streaming-text-block';
    contentEl.appendChild(textEl);
    const chunks = this.splitPseudoStreamChunks(message.content);
    const delayMs = this.getPseudoStreamDelay(chunks.length);

    messageEl.style.visibility = 'hidden';

    let rendered = '';
    for (const chunk of chunks) {
      rendered += chunk;
      await this.host.renderMarkdownInto(textEl, rendered);
      if (messageEl.style.visibility === 'hidden') {
        messageEl.style.visibility = '';
      }
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
    }

    if (messageEl.style.visibility === 'hidden') {
      messageEl.style.visibility = '';
    }
    this.host.assistantShellRender.finalizePseudoStreamFooter(messageEl, message);
    this.host.assistantShellRender.clearStreamingMessageState();
  }

  private splitPseudoStreamChunks(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n');
    const chunks: string[] = [];
    let buffer = '';

    for (const char of normalized) {
      buffer += char;
      if (buffer.length >= 12 || /[\n，。！？；：,.!?;:]/u.test(char)) {
        chunks.push(buffer);
        buffer = '';
      }
    }

    if (buffer) {
      chunks.push(buffer);
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private getPseudoStreamDelay(chunkCount: number): number {
    if (chunkCount <= 1) {
      return 0;
    }

    const targetDurationMs = 900;
    return Math.max(12, Math.min(36, Math.round(targetDurationMs / chunkCount)));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}

class ConversationUserMessageRenderDelegate {
  constructor(private readonly host: ConversationRenderHost) {}

  async renderMessage(message: ChatMessage): Promise<HTMLElement | undefined> {
    const frame = this.host.createUserMessageFrame(message);
    if (!frame) {
      return undefined;
    }

    await this.renderMessageIntoFrame(frame, message);
    return frame.messageEl;
  }

  async rerenderMessage(previousMessageId: string, message: ChatMessage): Promise<void> {
    const messageEl = this.findExistingMessageElement(previousMessageId);
    if (!messageEl) {
      return;
    }

    this.syncExistingMessageIdentity(messageEl, message);
    messageEl.replaceChildren();
    const contentEl = this.appendMessageContentElement(messageEl);
    await this.renderMessageIntoFrame({ messageEl, contentEl }, message);
  }

  private findExistingMessageElement(previousMessageId: string): HTMLElement | null {
    return this.host.getMessagesContainer()
      ?.querySelector<HTMLElement>(`.opencodian-message[data-message-id="${previousMessageId}"]`)
      ?? null;
  }

  private syncExistingMessageIdentity(messageEl: HTMLElement, message: ChatMessage): void {
    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
      return;
    }

    delete messageEl.dataset.sourceMessageId;
  }

  private appendMessageContentElement(messageEl: HTMLElement): HTMLElement {
    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';
    messageEl.appendChild(contentEl);
    return contentEl;
  }

  private async renderMessageIntoFrame(
    frame: ConversationUserMessageRenderFrame,
    message: ChatMessage,
  ): Promise<void> {
    const copyContent = await this.host.renderUserMessageContent(frame.contentEl, message);
    this.host.addUserMessageFooter(frame.messageEl, message, copyContent);
  }
}

class ConversationMessageRenderDelegate {
  private readonly assistantMessageRenderer: ConversationAssistantMessageRenderDelegate;
  private readonly userMessageRenderer: ConversationUserMessageRenderDelegate;

  constructor(private readonly host: ConversationRenderHost) {
    this.assistantMessageRenderer = new ConversationAssistantMessageRenderDelegate(host);
    this.userMessageRenderer = new ConversationUserMessageRenderDelegate(host);
  }

  async renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined> {
    if (message.role === 'assistant') {
      return this.assistantMessageRenderer.renderPersistedMessage(message);
    }

    return this.userMessageRenderer.renderMessage(message);
  }

  async renderMessages(messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) {
      await this.renderEmptyConversationNoticeIfNeeded();
      return;
    }

    for (const message of this.host.getMessagesForRender(messages)) {
      await this.renderMessage(message);
    }
  }

  async rerenderSingleUserMessage(
    previousMessageId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.userMessageRenderer.rerenderMessage(previousMessageId, message);
  }

  async renderSyncedMessages(messages: ChatMessage[]): Promise<void> {
    for (const message of messages) {
      await this.renderSyncedMessage(message);
    }
  }

  private async renderEmptyConversationNoticeIfNeeded(): Promise<void> {
    if (this.host.shouldRenderEmptyConversationNotice()) {
      await this.renderMessage(this.host.createEmptyConversationNoticeMessage());
    }
  }

  private async renderSyncedMessage(message: ChatMessage): Promise<void> {
    if (message.role === 'assistant') {
      await this.assistantMessageRenderer.renderSyncedMessage(message);
      return;
    }

    await this.userMessageRenderer.renderMessage(message);
  }
}

class TrailingAssistantPatchPlanningDelegate {
  constructor(private readonly host: ConversationRenderHost) {}

  resolvePreflight(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null,
  ): TrailingAssistantPatchPreflight {
    const activeContainer = this.resolveActiveContainer(tabId);
    if (!activeContainer.ok) {
      return activeContainer;
    }
    const { messagesEl } = activeContainer;

    const renderedMessages = this.resolveRenderedMessages(previousMessages, nextMessages);
    if (!renderedMessages.ok) {
      return renderedMessages;
    }
    const { previousRenderedMessages, nextRenderedMessages } = renderedMessages;

    const nonTailSignatureMismatch = this.resolveNonTailSignatureMismatch(
      previousRenderedMessages,
      nextRenderedMessages,
    );
    if (!nonTailSignatureMismatch.ok) {
      return nonTailSignatureMismatch;
    }

    const tailMessages = this.resolveTailMessages(previousRenderedMessages, nextRenderedMessages);
    if (!tailMessages.ok) {
      return tailMessages;
    }

    const patchTargets = this.resolvePatchTargets(messagesEl);
    if (!patchTargets.ok) {
      return patchTargets;
    }

    return {
      ok: true,
      planningContext: this.buildPlanningContext(tailMessages, patchTargets, tabId),
    };
  }

  private resolveNonTailSignatureMismatch(
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

  private resolveTailMessages(
    previousRenderedMessages: ChatMessage[],
    nextRenderedMessages: ChatMessage[],
  ): TrailingAssistantPatchTailMessagesResult {
    const previousTailMessage = previousRenderedMessages[previousRenderedMessages.length - 1];
    const nextTailMessage = nextRenderedMessages[nextRenderedMessages.length - 1];
    if (!this.isPatchableAssistantTail(previousTailMessage, nextTailMessage)) {
      return {
        ok: false,
        ...this.buildNonMergeableTailFailurePlan(previousTailMessage, nextTailMessage),
      };
    }

    return {
      ok: true,
      previousTailMessage,
      nextTailMessage,
    };
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

  private buildNonMergeableTailFailurePlan(
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

  private resolveRenderedMessages(
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

  private resolveActiveContainer(
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

  private buildPlanningContext(
    tailMessages: SuccessfulTrailingAssistantPatchTailMessages,
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
    tabId: TabId | null,
  ): TrailingAssistantPatchPlanningContext {
    return {
      previousTailMessage: tailMessages.previousTailMessage,
      nextTailMessage: tailMessages.nextTailMessage,
      patchTarget: this.buildDomTarget(patchTargets),
      parentEl: patchTargets.parentEl,
      runtime: this.host.getRenderRuntimeForTab(tabId),
      shouldStickToBottom: this.host.shouldAutoScroll(tabId),
    };
  }

  private buildDomTarget(
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
  ): TrailingAssistantPatchDomTarget {
    return {
      messageEl: patchTargets.existingTailMessageEl,
      contentEl: patchTargets.existingContentEl,
    };
  }

  private resolvePatchTargets(messagesEl: HTMLElement): TrailingAssistantPatchTargets {
    const existingTailMessageEl = this.findExistingTrailingAssistantElement(messagesEl);
    const parentEl = existingTailMessageEl?.parentElement;
    if (!existingTailMessageEl || !(parentEl instanceof HTMLElement)) {
      return this.buildTargetFailureResult('missing-existing-tail-element');
    }

    const existingContentEl = existingTailMessageEl.querySelector('.opencodian-message-content');
    if (!(existingContentEl instanceof HTMLElement)) {
      return this.buildTargetFailureResult('missing-tail-content-element');
    }

    return this.buildTargetSuccessResult(existingTailMessageEl, existingContentEl, parentEl);
  }

  private buildTargetFailureResult(
    reason: TrailingAssistantPatchTargetFailureReason,
  ): TrailingAssistantPatchTargetFailureResult {
    return {
      ok: false,
      reason,
    };
  }

  private buildTargetSuccessResult(
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

  private findExistingTrailingAssistantElement(messagesEl: HTMLElement): HTMLElement | null {
    return Array.from(
      messagesEl.querySelectorAll<HTMLElement>('.opencodian-message--assistant'),
    )
      .filter((element) => !element.classList.contains('opencodian-message--notice'))
      .pop() ?? null;
  }
}

class ConversationSyncedUpdateApplyDelegate {
  constructor(
    private readonly host: ConversationRenderHost,
    private readonly messageRenderer: ConversationMessageRenderDelegate,
    private readonly patchPort: ConversationSyncedUpdatePatchPort,
  ) {}

  async apply(
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
      await this.patchPort.rerenderConversationMessages(currentConversation);
      return;
    }

    await this.applyIncrementalUpdate({
      currentConversation,
      incrementalUpdate,
      nextMessages,
      previousMessages,
    });
  }

  private async applyIncrementalUpdate({
    currentConversation,
    incrementalUpdate,
    nextMessages,
    previousMessages,
  }: ConversationSyncedUpdateApplyContext): Promise<void> {
    const shouldStickToBottom = this.host.shouldAutoScroll();
    this.host.syncBackgroundTaskStateFromConversation(currentConversation);

    const patchedTail = await this.patchTrailingAssistantIfNeeded(
      incrementalUpdate,
      previousMessages,
      nextMessages,
    );
    if (!patchedTail) {
      await this.patchPort.rerenderConversationMessages(currentConversation);
      return;
    }

    await this.messageRenderer.renderSyncedMessages(incrementalUpdate.appendedRenderedMessages);
    await this.host.renderBackgroundTaskIndicatorIfNeeded();

    if (shouldStickToBottom) {
      this.host.scrollToBottom();
    }
  }

  private patchTrailingAssistantIfNeeded(
    incrementalUpdate: IncrementalRenderedMessageUpdate,
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<boolean> {
    if (!incrementalUpdate.patchTrailingAssistant) {
      return Promise.resolve(true);
    }

    return this.patchPort.patchTrailingAssistantRender(previousMessages, nextMessages);
  }
}

export class ConversationRenderService {
  private readonly messageRenderer: ConversationMessageRenderDelegate;
  private readonly syncedUpdateApplier: ConversationSyncedUpdateApplyDelegate;
  private readonly trailingAssistantPatchPlanner: TrailingAssistantPatchPlanningDelegate;

  constructor(private readonly host: ConversationRenderHost) {
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
      await this.renderMessages(conversation.messages);
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
    await this.syncedUpdateApplier.apply(previousMessages, nextMessages);
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

}
