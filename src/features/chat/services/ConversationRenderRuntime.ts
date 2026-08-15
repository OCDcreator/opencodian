/* eslint-disable max-lines -- Render delegates and the synced-update transaction share one pane-ownership boundary; splitting them would reintroduce cross-pass state indirection. */

import {
  type ChatMessage,
  type Conversation,
} from '../../../core/types';
import { MarkdownRenderScheduler } from '../../../utils/streaming/MarkdownRenderScheduler';
import { disposeCollapsiblesWithin } from '../rendering/collapsible';
import type { UserMessageContentRenderer } from '../runtime/UserMessageContentRenderer';
import type { TabId } from '../tabs';
import type { ConversationKeyedReconcileDelegate } from './ConversationKeyedReconcileDelegate';
import {
  getPaneRenderSurfaceGeneration,
  type ScrollRuntimeState,
} from './ScrollManager';

const renderSurfaceGenerations = new WeakMap<object, number>();

export function getConversationRenderSurfaceGeneration(host: ConversationRenderHost): number {
  return renderSurfaceGenerations.get(host) ?? 0;
}

export function beginConversationRenderSurfacePass(host: ConversationRenderHost): number {
  const generation = getConversationRenderSurfaceGeneration(host) + 1;
  renderSurfaceGenerations.set(host, generation);
  return generation;
}

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

/** Keep hydrated history from replaying its entrance animation when the
 * temporary rehydration class is removed; live appended messages stay
 * unmarked and retain the normal entrance motion. */
export function markHydrationSettledMessages(messagesEl: HTMLElement): void {
  for (const messageEl of messagesEl.querySelectorAll<HTMLElement>('.opencodian-message')) {
    messageEl.dataset.opencodianHydrationSettled = 'true';
  }
}

export interface ConversationRenderMessagesOptions {
  /**
   * Checked before each message render during a multi-message pass. When it
   * returns false (e.g. the owning conversation load was superseded), the
   * remaining messages are skipped so a stale pass never appends into a pane
   * it no longer owns.
   */
  shouldContinueRender?(): boolean;
  /** Detached root supplied by the activation hydration transaction. */
  stagingContainer?: HTMLElement | null;
}

export interface ConversationRenderRuntimeState {
  currentTurnBodyEl: HTMLElement | null;
  /** Detached body used by keyed reconcile while async assistant markup renders. */
  stagedTurnBodyEl?: HTMLElement | null;
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
  renderBackgroundTaskIndicatorIfNeeded(
    tabId?: TabId | null,
    options?: { isCurrent?: () => boolean },
  ): Promise<void>;
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;

  shouldAutoScroll(tabId?: TabId | null): boolean;
  scrollToBottom(options?: { tabId?: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  scheduleComposerLayoutSync(): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;

  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  getMessageVisualSignature(message: ChatMessage): string;
  /**
   * Signature of host display settings affecting full-rerender DOM output but
   * not captured by getMessageVisualSignature (e.g. renderUserMarkupAsCodeBlocks).
   * Folded into the full-rerender fingerprint so a setting toggle is never
   * masked by an unchanged-message no-op.
   */
  renderInputSettingsSignature(): string;
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
    if (await this.takeOverPendingCanonicalAssistantShell(message)) {
      return;
    }

    if (!this.shouldPseudoStreamSyncedAssistantMessage(message)) {
      await this.renderPersistedMessage(message);
      return;
    }

    await this.renderSyncedAssistantMessageWithReveal(message);
  }

  private async takeOverPendingCanonicalAssistantShell(message: ChatMessage): Promise<boolean> {
    const messageEl = this.findPendingCanonicalAssistantShell(message.id);
    if (!messageEl) {
      return false;
    }

    const contentEl = this.ensureAssistantContentElement(messageEl);
    this.syncAssistantMessageIdentity(messageEl, message);
    disposeCollapsiblesWithin(contentEl);
    contentEl.replaceChildren();
    await this.host.assistantTailRender.renderMessageBody(contentEl, message);
    this.host.assistantTailRender.finalizePersistedFooter(messageEl, message);
    delete messageEl.dataset.canonicalMessageId;
    delete messageEl.dataset.canonicalSyncPending;
    return true;
  }

  private findPendingCanonicalAssistantShell(messageId: string): HTMLElement | null {
    const messagesEl = this.host.getMessagesContainer();
    if (!messagesEl) {
      return null;
    }

    return Array.from(messagesEl.querySelectorAll<HTMLElement>(
      '.opencodian-message--assistant[data-canonical-sync-pending="true"]',
    )).find((messageEl) => messageEl.dataset.canonicalMessageId === messageId) ?? null;
  }

  private ensureAssistantContentElement(messageEl: HTMLElement): HTMLElement {
    const existingContentEl = Array.from(messageEl.children).find((child) =>
      child instanceof HTMLElement && child.classList.contains('opencodian-message-content'),
    );
    if (existingContentEl instanceof HTMLElement) {
      return existingContentEl;
    }

    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';
    messageEl.prepend(contentEl);
    return contentEl;
  }

  private syncAssistantMessageIdentity(messageEl: HTMLElement, message: ChatMessage): void {
    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
    } else {
      delete messageEl.dataset.sourceMessageId;
    }
    messageEl.classList.remove('is-streaming');
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
    // The streaming shell is created before its canonical message is known to
    // the renderer. Stamp the stable identity immediately so later keyed
    // reconcile, DOM lookups, and the completed pseudo-stream all address the
    // same message node without ending the streaming state early.
    messageEl.dataset.messageId = message.id;
    if (message.sourceMessageId) {
      messageEl.dataset.sourceMessageId = message.sourceMessageId;
    } else {
      delete messageEl.dataset.sourceMessageId;
    }
    const textEl = document.createElement('div');
    textEl.className = 'streaming-text-block';
    contentEl.appendChild(textEl);
    const chunks = this.splitPseudoStreamChunks(message.content);
    const delayMs = this.getPseudoStreamDelay(chunks.length);

    messageEl.style.visibility = 'hidden';

    // Coalesce the per-chunk markdown re-renders into the shared streaming
    // frame budget; the scheduler always renders the latest accumulated text.
    let rendered = '';
    const renderScheduler = new MarkdownRenderScheduler(async () => {
      if (!this.isElementInCurrentMessagesContainer(messageEl)) {
        // A concurrent hydration/rerender replaced the messages container:
        // skip writing into the detached shell.
        return;
      }
      // Render into a detached staging element so a container replacement
      // during the async markdown render cannot write into the now-detached
      // textEl (mirrors StreamController.renderMarkdownText's staging guard).
      const stagingEl = document.createElement('div');
      await this.host.renderMarkdownInto(stagingEl, rendered);
      if (!this.isElementInCurrentMessagesContainer(messageEl)) {
        // Re-check after the await: the pane may have been replaced while the
        // markdown service was awaiting. Drop the staged content rather than
        // committing it into a detached node.
        return;
      }
      textEl.replaceChildren(...Array.from(stagingEl.childNodes));
      if (messageEl.style.visibility === 'hidden') {
        messageEl.style.visibility = '';
      }
    });

    for (const chunk of chunks) {
      if (!this.isElementInCurrentMessagesContainer(messageEl)) {
        // A concurrent hydration/rerender replaced the messages container:
        // stop writing into the detached shell and skip footer finalization.
        renderScheduler.cancel();
        return;
      }
      rendered += chunk;
      renderScheduler.schedule();
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
    }

    await renderScheduler.flush();
    if (!this.isElementInCurrentMessagesContainer(messageEl)) {
      return;
    }
    if (messageEl.style.visibility === 'hidden') {
      messageEl.style.visibility = '';
    }
    this.host.assistantShellRender.finalizePseudoStreamFooter(messageEl, message);
    this.host.assistantShellRender.clearStreamingMessageState();
  }

  private isElementInCurrentMessagesContainer(messageEl: HTMLElement): boolean {
    const messagesEl = this.host.getMessagesContainer();
    return Boolean(messagesEl && messagesEl.contains(messageEl));
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
    const messagesEl = this.host.getMessagesContainer();
    const ownerConversationId = this.host.getCurrentConversation()?.id ?? null;
    const ownerTabId = this.host.getActiveTabId();
    const ownerSurfaceGeneration = getConversationRenderSurfaceGeneration(this.host);
    const ownerPaneGeneration = getPaneRenderSurfaceGeneration(messagesEl);
    const stagedMessageEl = messageEl.cloneNode(false) as HTMLElement;
    const stagedContentEl = this.appendMessageContentElement(stagedMessageEl);
    let copyContent: string | undefined;
    if (message.compactionDivider) {
      stagedMessageEl.addClass('opencodian-message--compaction-divider');
      this.host.userMessageContentRenderer.renderCompactionDivider(
        stagedMessageEl,
        message.compactionDivider,
      );
    } else {
      copyContent = await this.host.userMessageContentRenderer.renderUserMessageContent(
        stagedContentEl,
        message,
      );
    }
    const stillOwner = this.host.getMessagesContainer() === messagesEl
      && this.host.getCurrentConversation()?.id === ownerConversationId
      && this.host.getActiveTabId() === ownerTabId
      && getConversationRenderSurfaceGeneration(this.host) === ownerSurfaceGeneration
      && getPaneRenderSurfaceGeneration(messagesEl) === ownerPaneGeneration
      && this.findExistingMessageElement(previousMessageId) === messageEl;
    if (!stillOwner) {
      return;
    }
    this.syncExistingMessageIdentity(messageEl, message);
    disposeCollapsiblesWithin(messageEl);
    messageEl.replaceChildren(...Array.from(stagedMessageEl.childNodes));
    this.host.addUserMessageFooter(messageEl, message, copyContent);
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
  private stagingContainer: HTMLElement | null = null;

  constructor(private readonly host: ConversationRenderHost) {
    this.assistantMessageRenderer = new ConversationAssistantMessageRenderDelegate(host);
    this.userMessageRenderer = new ConversationUserMessageRenderDelegate(host);
  }

  /** Stage a full hydration pass away from the live pane. */
  setStagingContainer(container: HTMLElement | null): void {
    this.stagingContainer = container;
  }

  async renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined> {
    if (message.role === 'assistant') {
      return this.assistantMessageRenderer.renderPersistedMessage(message);
    }

    return this.userMessageRenderer.renderMessage(message);
  }

  async renderMessages(
    messages: ChatMessage[],
    options: ConversationRenderMessagesOptions = {},
  ): Promise<void> {
    const renderRuntime = this.host.getRenderRuntimeForTab(this.host.getActiveTabId());
    if (options.stagingContainer && renderRuntime) {
      // The live pane remains mounted during activation hydration. Keep the
      // current turn body addressable after each shell is moved to staging so
      // subsequent assistant messages stay in the same turn instead of
      // creating a detached assistant-only turn.
      renderRuntime.stagedTurnBodyEl = null;
    }
    if (messages.length === 0) {
      if (!this.shouldContinueRender(options)) {
        return;
      }
      const rendered = await this.renderEmptyConversationNoticeIfNeeded();
      if (!this.shouldContinueRender(options)) {
        this.disposeStaleRenderedElement(rendered);
      }
      return;
    }

    for (const message of this.host.getMessagesForRender(messages)) {
      if (!this.shouldContinueRender(options)) {
        return;
      }
      const liveContainer = this.host.getMessagesContainer();
      const liveChildren = liveContainer ? new Set(Array.from(liveContainer.children)) : null;
      const renderPromise = this.renderMessage(message);
      // Renderers create their turn shell synchronously, before awaiting
      // markdown. Move that shell immediately so deferred body work cannot
      // expose a partial history in the live pane.
      this.moveNewChildrenToStaging(liveContainer, liveChildren);
      const rendered = await renderPromise;
      this.syncStagedTurnBody(renderRuntime, options.stagingContainer);
      if (!this.shouldContinueRender(options)) {
        this.disposeStaleRenderedElement(rendered);
        return;
      }
    }
  }

  private syncStagedTurnBody(
    renderRuntime: ConversationRenderRuntimeState | null,
    stagingContainer: HTMLElement | null | undefined,
  ): void {
    if (!renderRuntime || !stagingContainer) {
      return;
    }
    const bodies = stagingContainer.querySelectorAll<HTMLElement>('.opencodian-turn-body');
    renderRuntime.stagedTurnBodyEl = bodies.item(bodies.length - 1) ?? null;
  }

  private shouldContinueRender(options: ConversationRenderMessagesOptions): boolean {
    return !options.shouldContinueRender || options.shouldContinueRender();
  }

  private moveNewChildrenToStaging(
    liveContainer: HTMLElement | null,
    liveChildren: Set<Element> | null,
  ): void {
    if (!this.stagingContainer || !liveContainer || !liveChildren) {
      return;
    }

    for (const child of Array.from(liveContainer.children)) {
      if (!liveChildren.has(child)) {
        this.stagingContainer.appendChild(child);
      }
    }
  }

  private disposeStaleRenderedElement(rendered: HTMLElement | void | undefined): void {
    // A superseding owner may have reused the same message id in the live
    // pane. Only dispose nodes that this pass explicitly staged.
    if (rendered instanceof HTMLElement && this.stagingContainer?.contains(rendered)) {
      disposeCollapsiblesWithin(rendered);
      rendered.remove();
    }
  }

  async rerenderSingleUserMessage(
    previousMessageId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.userMessageRenderer.rerenderMessage(previousMessageId, message);
  }

  async renderSyncedMessages(
    messages: ChatMessage[],
    shouldContinueRender?: () => boolean,
  ): Promise<void> {
    for (const message of messages) {
      if (shouldContinueRender && !shouldContinueRender()) {
        return;
      }
      await this.renderSyncedMessage(message);
      if (shouldContinueRender && !shouldContinueRender()) {
        // Do not query/remove by message id after ownership is lost: a newer
        // pane generation may already have rendered a legitimate node with
        // the same id. The owning pass will clean the stale subtree itself.
        return;
      }
    }
  }

  private async renderEmptyConversationNoticeIfNeeded(): Promise<HTMLElement | void | undefined> {
    if (this.host.shouldRenderEmptyConversationNotice()) {
      return this.renderMessage(this.host.createEmptyConversationNoticeMessage());
    }
    return undefined;
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
    private readonly keyedReconcile: ConversationKeyedReconcileDelegate,
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
      const reconciled = await this.keyedReconcile.tryApply(previousMessages, nextMessages);
      if (!reconciled) {
        await this.patchPort.rerenderConversationMessages(currentConversation);
      }
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
    const messagesEl = this.host.getMessagesContainer();
    const tabId = this.host.getActiveTabId();
    const surfaceGeneration = getConversationRenderSurfaceGeneration(this.host);
    const paneSurfaceGeneration = getPaneRenderSurfaceGeneration(messagesEl);
    const ownsRender = (): boolean =>
      this.host.getCurrentConversation()?.id === currentConversation.id
      && this.host.getActiveTabId() === tabId
      && this.host.getMessagesContainer() === messagesEl
      && !this.host.getScrollRuntimeForTab(tabId)?.isHydratingConversation
      && getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
      && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration;
    if (!ownsRender()) {
      return;
    }
    const shouldStickToBottom = this.host.shouldAutoScroll();
    this.host.syncBackgroundTaskStateFromConversation(currentConversation);

    const patchedTail = await this.patchTrailingAssistantIfNeeded(
      incrementalUpdate,
      previousMessages,
      nextMessages,
    );
    if (!ownsRender()) {
      return;
    }
    if (!patchedTail) {
      await this.patchPort.rerenderConversationMessages(currentConversation);
      return;
    }

    await this.messageRenderer.renderSyncedMessages(
      incrementalUpdate.appendedRenderedMessages,
      ownsRender,
    );
    if (!ownsRender()) {
      return;
    }
    await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId, {
      isCurrent: ownsRender,
    });
    if (!ownsRender()) {
      return;
    }

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
