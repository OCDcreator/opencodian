/* eslint-disable max-lines -- Render orchestration remains the canonical owner for these seams. */

import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
} from '../../../core/opencode';
import {
  type ChatMessage,
  type Conversation,
  getConversationBackendSessionId,
  getTurnDiffNoticeMeta,
} from '../../../core/types';
import { TooltipLayerController } from '../../../shared/TooltipLayerController';
import { disposeCollapsiblesWithin } from '../rendering/collapsible';
import { summarizeChatMessageForDebug } from '../runtime/SendPipelineDebugSummaries';
import type { UserMessageContentRenderer } from '../runtime/UserMessageContentRenderer';
import type { TabId } from '../tabs';
import { ConversationKeyedReconcileDelegate } from './ConversationKeyedReconcileDelegate';
import {
  beginConversationRenderSurfacePass,
  type ConversationAssistantShellRenderPort,
  type ConversationAssistantTailRenderPort,
  ConversationMessageRenderDelegate,
  type ConversationRenderHost,
  type ConversationRenderMessagesOptions,
  type ConversationRenderRuntimeState,
  ConversationSyncedUpdateApplyDelegate,
  getConversationRenderSurfaceGeneration,
  markHydrationSettledMessages,
} from './ConversationRenderRuntime';
import {
  type TrailingAssistantPatchPlanningContext,
  TrailingAssistantPatchPlanningDelegate,
} from './ConversationTrailingAssistantPatchPlanner';
import { ConversationTurnViewModelBuilder } from './ConversationTurnViewModelBuilder';
import {
  bumpPaneRenderSurfaceGeneration,
  captureElementScrollRestoreSnapshot,
  getPaneRenderSurfaceGeneration,
  isElementNearBottom,
  LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS,
  resolveEffectiveScrollRestoreSnapshot,
  restoreElementScrollAfterRender,
  type ScrollRuntimeState,
} from './ScrollManager';
import {
  buildTrailingAssistantPatchCompletionDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugPlanningContext,
  createDebugLogCallbacks,
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
  ConversationRenderMessagesOptions,
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
  /** Local persisted notices are not part of canonical OpenCode session state. */
  getLocalTurnDiffNotices?(conversationId: string): ChatMessage[];
}

/** Flat dependency object passed from OpenCodianView to assemble a ConversationRenderHost. */
export interface ConversationRenderHostDependencies {
  getCurrentConversation(): Conversation | null;
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): (ScrollRuntimeState & ConversationRenderRuntimeState) | null;
  clearScheduledScrollToBottom(): void;
  beginConversationHydration(tabId: TabId | null): void;
  endConversationHydration(tabId: TabId | null): void;
  shouldRenderEmptyConversationNotice(): boolean;
  createEmptyConversationNotice(): ChatMessage;
  createUserMessageFrame(message: ChatMessage): { messageEl: HTMLElement; contentEl: HTMLElement } | null;
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
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  getMessageVisualSignature(message: ChatMessage): string;
  resetTurnState(): void;
  renderPersistedAssistantMessage(options: { message: ChatMessage }): Promise<HTMLElement | void | undefined>;
  createAssistantMessageElements(): { messageEl: HTMLElement; contentEl: HTMLElement };
  finalizePseudoStreamFooter(messageEl: HTMLElement, message: Pick<ChatMessage, 'content' | 'timestamp' | 'modelId'>): void;
  clearStreamingMessageState(): void;
  getAssistantBodySignature(message: ChatMessage): string;
  renderAssistantMessageBody(contentEl: HTMLElement, message: ChatMessage): Promise<void>;
  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void;
}

export function createConversationRenderHost(
  deps: ConversationRenderHostDependencies,
): ConversationRenderHost {
  const userMessageContentRenderer = deps.userMessageContentRenderer;
  if (!userMessageContentRenderer) {
    throw new Error('createConversationRenderHost requires userMessageContentRenderer');
  }

  const assistantShellRender: ConversationAssistantShellRenderPort = {
    renderPersistedMessage: (message) =>
      deps.renderPersistedAssistantMessage({ message }),
    createAssistantMessageElement: () =>
      deps.createAssistantMessageElements(),
    finalizePseudoStreamFooter: (messageEl, message) => {
      deps.finalizePseudoStreamFooter(messageEl, message);
    },
    clearStreamingMessageState: () => {
      deps.clearStreamingMessageState();
    },
  };

  const assistantTailRender: ConversationAssistantTailRenderPort = {
    getBodySignature: (message) => deps.getAssistantBodySignature(message),
    renderMessageBody: (contentEl, message) =>
      deps.renderAssistantMessageBody(contentEl, message),
    finalizePersistedFooter: (messageEl, message) => {
      deps.finalizePersistedFooter(messageEl, message);
    },
  };

  return {
    getCurrentConversation: () => deps.getCurrentConversation(),
    getMessagesContainer: () => deps.getMessagesContainer(),
    getActiveTabId: () => deps.getActiveTabId(),
    getScrollRuntimeForTab: (tabId) => deps.getTabRuntimeState(tabId),
    getRenderRuntimeForTab: (tabId) => deps.getTabRuntimeState(tabId),
    clearScheduledScrollToBottom: () => {
      deps.clearScheduledScrollToBottom();
    },
    beginConversationHydration: (tabId) => {
      deps.beginConversationHydration(tabId);
    },
    endConversationHydration: (tabId) => {
      deps.endConversationHydration(tabId);
    },
    clearMessagesContainer: () => {
      deps.getMessagesContainer()?.empty();
    },
    resetTurnState: () => {
      deps.resetTurnState();
    },
    shouldRenderEmptyConversationNotice: () =>
      deps.shouldRenderEmptyConversationNotice(),
    createEmptyConversationNoticeMessage: () =>
      deps.createEmptyConversationNotice(),
    createUserMessageFrame: (message) =>
      deps.createUserMessageFrame(message),
    userMessageContentRenderer,
    addUserMessageFooter: (messageEl, message, content) => {
      deps.addUserMessageFooter(messageEl, message, content);
    },
    renderMarkdownInto: (container, markdown) =>
      deps.renderMarkdownInto(container, markdown),
    renderBackgroundTaskIndicatorIfNeeded: (tabId, options) =>
      options
        ? deps.renderBackgroundTaskIndicatorIfNeeded(tabId, options)
        : deps.renderBackgroundTaskIndicatorIfNeeded(tabId),
    syncBackgroundTaskStateFromConversation: (conversation) => {
      deps.syncBackgroundTaskStateFromConversation(conversation);
    },
    shouldAutoScroll: (tabId) => deps.shouldAutoScroll(tabId),
    scrollToBottom: (options) => {
      deps.scrollToBottom(options);
    },
    syncPaneScrollMetrics: (tabId, messagesEl) => {
      deps.syncPaneScrollMetrics(tabId, messagesEl);
    },
    scheduleComposerLayoutSync: () => {
      deps.scheduleComposerLayoutSync();
    },
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    getMessagesForRender: (messages) =>
      deps.getMessagesForRender(messages),
    getMessageVisualSignature: (message) =>
      deps.getMessageVisualSignature(message),
    assistantShellRender,
    assistantTailRender,
    ...createDebugLogCallbacks(),
    summarizeChatMessageForDebug: (message) => summarizeChatMessageForDebug(message),
  };
}

export class ConversationRenderService {
  private readonly messageRenderer: ConversationMessageRenderDelegate;
  private readonly syncedUpdateApplier: ConversationSyncedUpdateApplyDelegate;
  private readonly trailingAssistantPatchPlanner: TrailingAssistantPatchPlanningDelegate;
  private readonly turnViewModelBuilder = new ConversationTurnViewModelBuilder();
  /**
   * Full rerenders are serialized so concurrent callers (settings toggles,
   * sync fallbacks) can never interleave `clear + append` passes. A newer
   * request supersedes a still-queued older one, which collapses same-tick
   * duplicate requests into a single rebuild.
   */
  private rerenderQueue: Promise<void> = Promise.resolve();
  private rerenderGeneration = 0;

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
      new ConversationKeyedReconcileDelegate(host, this.messageRenderer),
    );
  }

  async renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined> {
    return this.messageRenderer.renderMessage(message);
  }

  async renderMessages(
    messages: ChatMessage[],
    options: ConversationRenderMessagesOptions = {},
  ): Promise<void> {
    const surfaceGeneration = beginConversationRenderSurfacePass(this.host);
    const messagesEl = this.host.getMessagesContainer();
    const paneSurfaceGeneration = bumpPaneRenderSurfaceGeneration(messagesEl);
    if (Object.prototype.hasOwnProperty.call(options, 'stagingContainer')) {
      this.messageRenderer.setStagingContainer(options.stagingContainer ?? null);
    }
    try {
      await this.messageRenderer.renderMessages(messages, {
        ...options,
        shouldContinueRender: () =>
          (!options.shouldContinueRender || options.shouldContinueRender())
          && getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
          && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration,
      });
    } finally {
      if (Object.prototype.hasOwnProperty.call(options, 'stagingContainer')) {
        this.messageRenderer.setStagingContainer(null);
        const runtime = this.host.getRenderRuntimeForTab(this.host.getActiveTabId());
        if (runtime?.stagedTurnBodyEl && options.stagingContainer?.contains(runtime.stagedTurnBodyEl)) {
          runtime.stagedTurnBodyEl = null;
        }
      }
    }
  }

  async rerenderSingleUserMessage(
    previousMessageId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.messageRenderer.rerenderSingleUserMessage(previousMessageId, message);
  }

  async rerenderConversationMessages(conversation: Conversation): Promise<void> {
    const generation = ++this.rerenderGeneration;
    const queued = this.rerenderQueue.then(async () => {
      if (generation !== this.rerenderGeneration) {
        // A newer rerender request superseded this one while it was queued.
        return;
      }
      await this.performRerenderConversationMessages(conversation);
    });
    // Keep the chain alive for later requests even when this pass rejects.
    this.rerenderQueue = queued.catch(() => {});
    return queued;
  }

  private async performRerenderConversationMessages(conversation: Conversation): Promise<void> {
    const currentConversation = this.host.getCurrentConversation();
    const messagesEl = this.host.getMessagesContainer();
    if (!currentConversation || currentConversation.id !== conversation.id || !messagesEl) {
      return;
    }

    const resolvedMessages = this.resolveConversationRenderMessages(conversation);

    this.host.logAssistantFinalizationDebug('rerender-conversation-messages-start', {
      conversationId: conversation.id,
      sessionId: getConversationBackendSessionId(conversation),
      messageCount: resolvedMessages.length,
      tailAssistant: this.host.summarizeChatMessageForDebug(
        [...resolvedMessages].reverse().find((message) => message.role === 'assistant'),
      ),
    });

    const activeTabId = this.host.getActiveTabId();
    const renderGeneration = this.rerenderGeneration;
    const surfaceGeneration = getConversationRenderSurfaceGeneration(this.host) + 1;
    // renderMessages() owns the pane-generation bump for this pass.
    const paneSurfaceGeneration = getPaneRenderSurfaceGeneration(messagesEl);
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
    this.host.resetTurnState();
    const stagedMessagesEl = document.createElement('div');
    this.messageRenderer.setStagingContainer(stagedMessagesEl);

    try {
      await this.renderMessages(resolvedMessages, {
        shouldContinueRender: () => this.isRenderOwner(
          conversation.id,
          activeTabId,
          messagesEl,
          renderGeneration,
        )
          && getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
          && getPaneRenderSurfaceGeneration(messagesEl) >= paneSurfaceGeneration,
      });
      this.messageRenderer.setStagingContainer(null);
      if (!this.isRenderOwner(conversation.id, activeTabId, messagesEl, renderGeneration)
        || getConversationRenderSurfaceGeneration(this.host) !== surfaceGeneration
        || getPaneRenderSurfaceGeneration(messagesEl) <= paneSurfaceGeneration) {
        return;
      }
      disposeCollapsiblesWithin(messagesEl);
      this.host.clearMessagesContainer();
      messagesEl.append(...Array.from(stagedMessagesEl.childNodes));
      await this.host.renderBackgroundTaskIndicatorIfNeeded(activeTabId, {
        isCurrent: () => this.isRenderOwner(conversation.id, activeTabId, messagesEl, renderGeneration)
          && getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
          && getPaneRenderSurfaceGeneration(messagesEl) > paneSurfaceGeneration,
      });
      if (!this.isRenderOwner(conversation.id, activeTabId, messagesEl, renderGeneration)
        || getConversationRenderSurfaceGeneration(this.host) !== surfaceGeneration
        || getPaneRenderSurfaceGeneration(messagesEl) <= paneSurfaceGeneration) {
        return;
      }
      const restoreRuntime = this.host.getScrollRuntimeForTab(activeTabId);
      const effectiveSnapshot = resolveEffectiveScrollRestoreSnapshot(messagesEl, scrollSnapshot, {
        preserveScrollPosition: true,
        // The live auto-scroll state reflects any user scrolling that happened
        // while the rerender was in flight; it wins over the capture-time one.
        stickToBottom: restoreRuntime?.autoScrollEnabled ?? shouldStickToBottom,
        userScrollIntent: restoreRuntime?.userScrollIntentDuringHydration,
      });
      restoreElementScrollAfterRender(messagesEl, effectiveSnapshot, {
        runtime: restoreRuntime,
        lateContentReapplyWindowMs: LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS,
        isRestoreCurrent: () => this.isRenderOwner(
          conversation.id,
          activeTabId,
          messagesEl,
          renderGeneration,
        )
          && getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
          && getPaneRenderSurfaceGeneration(messagesEl) > paneSurfaceGeneration,
        onRestoreBottom: () => {
          this.host.scrollToBottom({ tabId: activeTabId });
        },
        onRestored: () => {
          this.host.syncPaneScrollMetrics(activeTabId, messagesEl);
        },
      });
      this.host.scheduleComposerLayoutSync();
      markHydrationSettledMessages(messagesEl);

      this.host.requestAnimationFrame(() => {
        if (
          this.rerenderGeneration === renderGeneration
          && this.isRenderOwner(conversation.id, activeTabId, messagesEl)
          && getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
          && getPaneRenderSurfaceGeneration(messagesEl) > paneSurfaceGeneration
          && (this.host.getScrollRuntimeForTab(activeTabId)?.hydrationDepth ?? 0) <= 0
        ) {
          messagesEl.classList.remove('is-rehydrating');
        }
      });
    } finally {
      this.messageRenderer.setStagingContainer(null);
      this.host.endConversationHydration(activeTabId);
    }

    this.host.logAssistantFinalizationDebug('rerender-conversation-messages-complete', {
      conversationId: conversation.id,
      sessionId: getConversationBackendSessionId(conversation),
      shouldStickToBottom,
      previousScrollTop,
    });
  }

  private isRenderOwner(
    conversationId: string,
    tabId: TabId | null,
    messagesEl: HTMLElement,
    generation = this.rerenderGeneration,
  ): boolean {
    return this.rerenderGeneration === generation
      && this.host.getMessagesContainer() === messagesEl
      && this.host.getActiveTabId() === tabId
      && this.host.getCurrentConversation()?.id === conversationId;
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

    const surfaceGeneration = getConversationRenderSurfaceGeneration(this.host);
    const messagesEl = this.host.getMessagesContainer();
    const paneSurfaceGeneration = getPaneRenderSurfaceGeneration(messagesEl);
    const canContinue = (): boolean =>
      getConversationRenderSurfaceGeneration(this.host) === surfaceGeneration
      && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration
      && this.host.getMessagesContainer() === messagesEl
      && this.host.getActiveTabId() === tabId;
    let patchApplied = false;
    await withTrailingAssistantTurnBodyScope(successPlan.turnBodyScopePlan, async () => {
      patchApplied = await this.executeTrailingAssistantPatch(successPlan.executionPlan, canContinue);
      if (patchApplied && canContinue()) {
        applyTrailingAssistantPatchTailState(successPlan.tailStatePlan, tabId, this.host);
      }
    });
    if (!patchApplied || !canContinue()) {
      return false;
    }

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
    canContinue: () => boolean,
  ): Promise<boolean> {
    if (!canContinue()) {
      return false;
    }
    if (executionPlan.kind === 'finalize-footer') {
      this.host.assistantTailRender.finalizePersistedFooter(
        executionPlan.messageEl,
        executionPlan.nextTailMessage,
      );
      return canContinue();
    }

    executionPlan.contentEl.replaceChildren();
    await this.host.assistantTailRender.renderMessageBody(
      executionPlan.contentEl,
      executionPlan.nextTailMessage,
    );
    return canContinue();
  }

  private resolveConversationRenderMessages(
    conversation: Conversation,
    fallbackMessages?: ChatMessage[],
  ): ChatMessage[] {
    // Canonical session state is an OpenCode-specific concept (getCanonicalSessionState
    // returns null for non-OpenCode backends). Gate explicitly so the intent is clear
    // even though buildCanonicalRenderMessages handles the null case implicitly.
    const backend = conversation.backend ?? 'opencode';
    if (backend !== 'opencode') {
      return fallbackMessages ?? conversation.messages;
    }

    const sessionId = getConversationBackendSessionId(conversation);
    const canonicalMessages = sessionId ? this.buildCanonicalRenderMessages(sessionId) : [];
    if (canonicalMessages.length === 0) {
      return fallbackMessages ?? conversation.messages;
    }

    return this.mergeCanonicalWithLocalTurnDiffNotices(conversation.id, canonicalMessages);
  }

  private mergeCanonicalWithLocalTurnDiffNotices(
    conversationId: string,
    canonicalMessages: ChatMessage[],
  ): ChatMessage[] {
    const localNotices = this.canonicalRenderSource?.getLocalTurnDiffNotices?.(conversationId) ?? [];
    if (localNotices.length === 0) {
      return canonicalMessages;
    }

    const seenSourceMessageIds = new Set<string>();
    const preservedNotices = localNotices.filter((message) => {
      const sourceMessageId = getTurnDiffNoticeMeta(message)?.sourceMessageId;
      if (!sourceMessageId || seenSourceMessageIds.has(sourceMessageId)) {
        return false;
      }
      seenSourceMessageIds.add(sourceMessageId);
      return !canonicalMessages.some((candidate) =>
        getTurnDiffNoticeMeta(candidate)?.sourceMessageId === sourceMessageId);
    });

    return [...canonicalMessages, ...preservedNotices]
      .sort((left, right) => left.timestamp - right.timestamp);
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

    return this.turnViewModelBuilder.buildCanonicalRenderInput(
      sessionState,
      (info, parts) => canonicalRenderSource.hydrateOpenCodeMessage(info, parts),
    ).messages;
  }

  private static tooltipLabelId = 0;

  static readonly COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

  static attachCopyButtonBehavior(copyBtn: HTMLElement, content: string): void {
    let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
    const labelId = copyBtn.getAttribute('aria-labelledby');
    const labelText = copyBtn.getAttribute('data-tooltip') ?? '';

    const setButtonContent = (text?: string): void => {
      copyBtn.empty();

      if (text) {
        copyBtn.setText(text);
      } else {
        copyBtn.innerHTML = ConversationRenderService.COPY_ICON;
      }

      if (labelId && labelText) {
        const labelEl = copyBtn.createSpan({
          cls: 'opencodian-visually-hidden',
          text: labelText,
        });
        labelEl.id = labelId;
        copyBtn.setAttribute('aria-labelledby', labelId);
      }
    };

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(content);
      } catch {
        return;
      }

      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }

      setButtonContent('copied!');
      copyBtn.classList.add('copied');

      feedbackTimeout = setTimeout(() => {
        setButtonContent();
        copyBtn.classList.remove('copied');
        feedbackTimeout = null;
      }, 1500);
    });
  }

  static setTooltipLabel(
    buttonEl: HTMLElement,
    label: string,
    position?: 'bottom' | 'left' | 'right' | 'top',
  ): void {
    buttonEl.classList.add('opencodian-tooltip-trigger');
    TooltipLayerController.ensureForElement(buttonEl);
    buttonEl.setAttribute('data-tooltip', label);
    buttonEl.removeAttribute('title');
    buttonEl.removeAttribute('aria-label');
    if (position) {
      buttonEl.setAttribute('data-tooltip-position', position);
    }

    const existingLabelEl = buttonEl.querySelector('.opencodian-visually-hidden[data-tooltip-label="true"]');
    if (existingLabelEl instanceof HTMLElement) {
      existingLabelEl.textContent = label;
      return;
    }

    ConversationRenderService.attachTooltipLabel(buttonEl, label);
  }

  static attachTooltipLabel(buttonEl: HTMLElement, label: string): void {
    buttonEl.classList.add('opencodian-tooltip-trigger');
    TooltipLayerController.ensureForElement(buttonEl);
    const labelId = `opencodian-tooltip-label-${ConversationRenderService.tooltipLabelId++}`;
    const labelEl = buttonEl.createSpan({
      cls: 'opencodian-visually-hidden',
      text: label,
    });
    labelEl.id = labelId;
    labelEl.setAttribute('data-tooltip-label', 'true');
    buttonEl.setAttribute('aria-labelledby', labelId);
  }

  static removeEmptyAssistantShells(messagesContainer: HTMLElement): void {
    const assistantMessages = messagesContainer.querySelectorAll<HTMLElement>(
      '.opencodian-message--assistant:not(.opencodian-message--notice):not(.opencodian-message--background-task)',
    );

    for (const messageEl of assistantMessages) {
      const contentEl = messageEl.querySelector(':scope > .opencodian-message-content');
      if (!(contentEl instanceof HTMLElement)) {
        continue;
      }

      const hasStructuredContent = Boolean(
        contentEl.querySelector(
          '.streaming-text-block, .opencodian-message-text, .streaming-error-block, .streaming-tool-call, .streaming-thinking-block, .opencodian-permission-inline, .opencodian-question-inline, .opencodian-chat-notice-card, .opencodian-pending, .opencodian-structured-output-details',
        ),
      );
      const hasVisibleText = Boolean(contentEl.textContent?.trim());

      if (!hasStructuredContent && !hasVisibleText) {
        messageEl.remove();
      }
    }
  }
}
