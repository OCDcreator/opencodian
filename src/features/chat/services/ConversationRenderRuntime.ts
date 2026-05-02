import {
  type ChatMessage,
  type Conversation,
} from '../../../core/types';
import type { UserMessageContentRenderer } from '../runtime/UserMessageContentRenderer';
import type { TabId } from '../tabs';
import { type ScrollRuntimeState } from './ScrollManager';

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
  const patchTrailingAssistant =
    options.getMessageVisualSignature(previousRenderedMessages[lastSharedIndex])
    !== options.getMessageVisualSignature(nextRenderedMessages[lastSharedIndex]);

  return {
    appendedRenderedMessages: nextRenderedMessages.slice(previousRenderedMessages.length),
    patchTrailingAssistant,
  };
}

export function hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean {
  return messages.some((message) =>
    message.role === 'assistant'
    && !message.sourceMessageId
    && message.displayStyle !== 'notice'
    && (
      (message.contentBlocks?.length ?? 0) > 0
      || Boolean(message.content)
    ),
  );
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
  userMessageContentRenderer: UserMessageContentRenderer;
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

export interface ConversationSyncedUpdatePatchPort {
  patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<boolean>;
  rerenderConversationMessages(conversation: Conversation): Promise<void>;
}

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
    if (message.displayStyle === 'notice' || message.questionResolution || message.summary) {
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
    if (message.compactionDivider) {
      frame.messageEl.addClass('opencodian-message--compaction-divider');
      this.host.userMessageContentRenderer.renderCompactionDivider(frame.messageEl, message.compactionDivider);
      return;
    }

    const copyContent = await this.host.userMessageContentRenderer.renderUserMessageContent(frame.contentEl, message);
    this.host.addUserMessageFooter(frame.messageEl, message, copyContent);
  }
}

export class ConversationMessageRenderDelegate {
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

export class ConversationSyncedUpdateApplyDelegate {
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
