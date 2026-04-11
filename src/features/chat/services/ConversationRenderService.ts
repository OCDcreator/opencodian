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

type TrailingAssistantPatchPreflight =
  | {
    ok: true;
    previousTailMessage: ChatMessage;
    nextTailMessage: ChatMessage;
    existingTailMessageEl: HTMLElement;
    existingContentEl: HTMLElement;
    parentEl: HTMLElement;
    runtime: ConversationRenderRuntimeState | null;
    previousTurnBodyEl: HTMLElement | null;
    shouldStickToBottom: boolean;
  }
  | {
    ok: false;
    reason: string;
    payload?: Record<string, unknown>;
  };

type TrailingAssistantPatchTargets =
  | {
    ok: true;
    existingTailMessageEl: HTMLElement;
    existingContentEl: HTMLElement;
    parentEl: HTMLElement;
  }
  | {
    ok: false;
    reason: string;
  };

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
    const fail = (reason: string, payload: Record<string, unknown> = {}): false => {
      this.host.logAssistantFinalizationDebug('patch-trailing-assistant-render-skipped', {
        reason,
        tabId,
        previousRenderedCount: this.host.getMessagesForRender(previousMessages).length,
        nextRenderedCount: this.host.getMessagesForRender(nextMessages).length,
        ...payload,
      });
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

    const {
      previousTailMessage,
      nextTailMessage,
      existingTailMessageEl,
      existingContentEl,
      parentEl,
      runtime,
      previousTurnBodyEl,
      shouldStickToBottom,
    } = preflight;

    if (runtime) {
      runtime.currentTurnBodyEl = parentEl;
    }

    try {
      existingTailMessageEl.dataset.messageId = nextTailMessage.id;
      if (nextTailMessage.sourceMessageId) {
        existingTailMessageEl.dataset.sourceMessageId = nextTailMessage.sourceMessageId;
      } else {
        delete existingTailMessageEl.dataset.sourceMessageId;
      }
      if (
        this.host.assistantTailRender.getBodySignature(previousTailMessage)
        === this.host.assistantTailRender.getBodySignature(nextTailMessage)
      ) {
        this.host.assistantTailRender.finalizePersistedFooter(existingTailMessageEl, nextTailMessage);
      } else {
        existingContentEl.replaceChildren();
        await this.host.assistantTailRender.renderMessageContent(
          existingTailMessageEl,
          existingContentEl,
          nextTailMessage,
        );
      }
      existingTailMessageEl.style.animation = 'none';
      if (shouldStickToBottom) {
        this.host.scrollToBottom({ tabId });
      }
      this.host.logAssistantFinalizationDebug('patch-trailing-assistant-render-complete', {
        tabId,
        shouldStickToBottom,
        previousTail: this.host.summarizeChatMessageForDebug(previousTailMessage),
        nextTail: this.host.summarizeChatMessageForDebug(nextTailMessage),
      });
      return true;
    } finally {
      if (runtime) {
        runtime.currentTurnBodyEl = previousTurnBodyEl ?? parentEl;
      }
    }
  }

  private findNonTailSignatureMismatch(
    previousRenderedMessages: ChatMessage[],
    nextRenderedMessages: ChatMessage[],
  ): number | null {
    const lastIndex = previousRenderedMessages.length - 1;
    for (let index = 0; index < lastIndex; index += 1) {
      if (
        this.host.getMessageVisualSignature(previousRenderedMessages[index])
        !== this.host.getMessageVisualSignature(nextRenderedMessages[index])
      ) {
        return index;
      }
    }

    return null;
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

  private resolveTrailingAssistantPatchPreflight(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null,
  ): TrailingAssistantPatchPreflight {
    const messagesEl = this.host.getMessagesContainer();
    if (!messagesEl || this.host.getActiveTabId() !== tabId) {
      return { ok: false, reason: 'missing-container-or-inactive-tab' };
    }

    const previousRenderedMessages = this.host.getMessagesForRender(previousMessages);
    const nextRenderedMessages = this.host.getMessagesForRender(nextMessages);
    if (
      previousRenderedMessages.length === 0
      || previousRenderedMessages.length !== nextRenderedMessages.length
    ) {
      return { ok: false, reason: 'rendered-message-count-mismatch' };
    }

    const prefixCheck = this.findNonTailSignatureMismatch(previousRenderedMessages, nextRenderedMessages);
    if (prefixCheck !== null) {
      return {
        ok: false,
        reason: 'non-tail-message-signature-mismatch',
        payload: {
          mismatchIndex: prefixCheck,
        },
      };
    }

    const previousTailMessage = previousRenderedMessages[previousRenderedMessages.length - 1];
    const nextTailMessage = nextRenderedMessages[nextRenderedMessages.length - 1];
    if (!this.isPatchableAssistantTail(previousTailMessage, nextTailMessage)) {
      return {
        ok: false,
        reason: 'tail-message-not-mergeable-assistant',
        payload: {
          previousTail: this.host.summarizeChatMessageForDebug(previousTailMessage),
          nextTail: this.host.summarizeChatMessageForDebug(nextTailMessage),
        },
      };
    }

    const patchTargets = this.resolveTrailingAssistantPatchTargets(messagesEl);
    if (!patchTargets.ok) {
      return patchTargets;
    }

    const runtime = this.host.getRenderRuntimeForTab(tabId);
    return {
      ok: true,
      previousTailMessage,
      nextTailMessage,
      existingTailMessageEl: patchTargets.existingTailMessageEl,
      existingContentEl: patchTargets.existingContentEl,
      parentEl: patchTargets.parentEl,
      runtime,
      previousTurnBodyEl: runtime?.currentTurnBodyEl ?? null,
      shouldStickToBottom: this.host.shouldAutoScroll(tabId),
    };
  }

  private resolveTrailingAssistantPatchTargets(
    messagesEl: HTMLElement,
  ): TrailingAssistantPatchTargets {
    const existingTailMessageEl = this.findExistingTrailingAssistantElement(messagesEl);
    if (!existingTailMessageEl || !(existingTailMessageEl.parentElement instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-existing-tail-element' };
    }

    const existingContentEl = existingTailMessageEl.querySelector('.opencodian-message-content');
    if (!(existingContentEl instanceof HTMLElement)) {
      return { ok: false, reason: 'missing-tail-content-element' };
    }

    return {
      ok: true,
      existingTailMessageEl,
      existingContentEl,
      parentEl: existingTailMessageEl.parentElement,
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
