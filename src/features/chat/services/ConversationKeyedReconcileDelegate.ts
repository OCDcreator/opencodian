import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { disposeCollapsiblesWithin } from '../rendering/collapsible';
import type { TabId } from '../tabs';
import type {
  ConversationMessageRenderDelegate,
  ConversationRenderHost,
} from './ConversationRenderRuntime';
import { getConversationRenderSurfaceGeneration } from './ConversationRenderRuntime';
import {
  bumpPaneRenderSurfaceGeneration,
  captureElementScrollRestoreSnapshot,
  type ConversationScrollRestoreSnapshot,
  getPaneRenderSurfaceGeneration,
  LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS,
  restoreElementScrollAfterRender,
} from './ScrollManager';

interface KeyedReconcileContext {
  messagesEl: HTMLElement;
  currentConversation: Conversation;
  tabId: TabId | null;
  previousRendered: ChatMessage[];
  nextRendered: ChatMessage[];
  nextIds: Set<string>;
  previousElementById: Map<string, HTMLElement>;
  previousSignatureById: Map<string, string>;
  surfaceGeneration: number;
  paneSurfaceGeneration: number;
}

/**
 * Reconciles the rendered DOM with a freshly synced render list by stable
 * message identity, instead of clearing and remounting everything. Unchanged
 * messages keep their DOM nodes (and with them collapse/expand state, scroll
 * anchors and tool-call subtrees); only genuinely new, changed, removed or
 * reordered entries touch the DOM.
 *
 * The reconcile trusts the DOM only when it provably matches the previous
 * render list (same message elements in the same order); any drift, streaming
 * shell or structural anomaly returns false so the caller can fall back to a
 * full rebuild, which always re-establishes the invariant.
 */
export class ConversationKeyedReconcileDelegate {
  constructor(
    private readonly host: ConversationRenderHost,
    private readonly messageRenderer: ConversationMessageRenderDelegate,
  ) {}

  async tryApply(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<boolean> {
    const context = this.captureReconcileContext(previousMessages, nextMessages);
    if (!context) {
      return false;
    }

    const { messagesEl, currentConversation, tabId } = context;
    // A full/load hydration owns this pane until its message pass settles;
    // let the caller queue the safe full-rebuild fallback instead of mutating
    // the partially hydrated DOM in parallel.
    if (this.host.getScrollRuntimeForTab(tabId)?.isHydratingConversation) {
      return false;
    }
    this.host.syncBackgroundTaskStateFromConversation(currentConversation);
    const scrollSnapshot = captureElementScrollRestoreSnapshot(
      messagesEl,
      this.host.shouldAutoScroll(tabId),
    );
    this.host.beginConversationHydration(tabId);
    context.paneSurfaceGeneration = bumpPaneRenderSurfaceGeneration(messagesEl);
    try {
      if (!this.isCurrentOwner(context)) {
        return false;
      }
      this.removeStaleMessages(context);
      if (!await this.replayNextRenderList(context)) {
        return false;
      }
      if (!this.isCurrentOwner(context)) {
        return false;
      }
      this.pruneEmptyTurnShells(context);
      this.resetCurrentTurnBody(context);
      await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId, {
        isCurrent: () => this.isCurrentOwner(context),
      });
      if (!this.isCurrentOwner(context)) {
        return false;
      }
      this.restoreScroll(context, scrollSnapshot);
    } catch {
      // A partially applied reconcile is still safe: the caller's full
      // rebuild clears and re-establishes the whole render invariant.
      return false;
    } finally {
      this.host.endConversationHydration(tabId);
    }
    return true;
  }

  private isCurrentOwner(context: KeyedReconcileContext): boolean {
    return this.host.getMessagesContainer() === context.messagesEl
      && this.host.getCurrentConversation()?.id === context.currentConversation.id
      && this.host.getActiveTabId() === context.tabId
      && getConversationRenderSurfaceGeneration(this.host) === context.surfaceGeneration
      && getPaneRenderSurfaceGeneration(context.messagesEl) === context.paneSurfaceGeneration;
  }

  /**
   * Validates that the live DOM provably matches the previous render list and
   * captures everything the reconcile pass needs, or returns null when the
   * caller must fall back to a full rebuild.
   */
  private captureReconcileContext(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): KeyedReconcileContext | null {
    const messagesEl = this.host.getMessagesContainer();
    const currentConversation = this.host.getCurrentConversation();
    if (!messagesEl || !currentConversation) {
      return null;
    }
    const tabId = this.host.getActiveTabId();
    if (this.host.getScrollRuntimeForTab(tabId)?.isHydratingConversation) {
      return null;
    }
    // Streaming shells and pending canonical takeovers are owned by the
    // streaming path; never reconcile around them.
    if (messagesEl.querySelector('.is-streaming, [data-canonical-sync-pending="true"]')) {
      return null;
    }
    if (!messagesEl.querySelector('.opencodian-turn')) {
      return null;
    }

    const previousRendered = this.host.getMessagesForRender(previousMessages);
    const nextRendered = this.host.getMessagesForRender(nextMessages);
    // Empty target states own special rendering (empty-conversation notice);
    // leave them to the full rebuild.
    if (previousRendered.length === 0 || nextRendered.length === 0) {
      return null;
    }
    const nextIds = new Set<string>();
    for (const message of nextRendered) {
      if (nextIds.has(message.id)) {
        return null;
      }
      nextIds.add(message.id);
    }

    const domElements = Array.from(
      messagesEl.querySelectorAll<HTMLElement>('.opencodian-message[data-message-id]'),
    );
    if (domElements.length !== previousRendered.length) {
      return null;
    }
    const previousElementById = new Map<string, HTMLElement>();
    for (let index = 0; index < previousRendered.length; index += 1) {
      const element = domElements[index];
      const message = previousRendered[index];
      if (element.dataset.messageId !== message.id) {
        return null;
      }
      previousElementById.set(message.id, element);
    }
    const previousSignatureById = new Map<string, string>();
    for (const message of previousRendered) {
      previousSignatureById.set(message.id, this.host.getMessageVisualSignature(message));
    }

    return {
      messagesEl,
      currentConversation,
      tabId,
      previousRendered,
      nextRendered,
      nextIds,
      previousElementById,
      previousSignatureById,
      surfaceGeneration: getConversationRenderSurfaceGeneration(this.host),
      paneSurfaceGeneration: getPaneRenderSurfaceGeneration(messagesEl),
    };
  }

  /** Removes elements whose message disappeared; kept nodes are untouched. */
  private removeStaleMessages(context: KeyedReconcileContext): void {
    for (const message of context.previousRendered) {
      if (!context.nextIds.has(message.id)) {
        const element = context.previousElementById.get(message.id);
        if (element) {
          disposeCollapsiblesWithin(element);
          element.remove();
        }
      }
    }
  }

  /**
   * Walks the next render list in order, keeping, updating or inserting each
   * message element and placing it at its final position. Returns false on
   * any structural anomaly so the caller can fall back to a full rebuild.
   */
  private async replayNextRenderList(context: KeyedReconcileContext): Promise<boolean> {
    const { messagesEl, nextRendered } = context;
    let turnCursor: HTMLElement | null = null;
    let frontierBody: HTMLElement | null = null;
    let bodyCursor: HTMLElement | null = null;

    for (let index = 0; index < nextRendered.length; index += 1) {
      const message = nextRendered[index];
      if (!this.isCurrentOwner(context)) {
        return false;
      }
      const isAssistant = message.role === 'assistant';
      const startsUnit = !isAssistant || index === 0;
      const element = await this.resolveEntryElement(context, message, isAssistant);
      if (!this.isCurrentOwner(context)) {
        // Ownership may have moved to a newer pass that rendered the same id;
        // never remove by the stale pass's element reference here.
        return false;
      }
      if (!element) {
        return false;
      }

      if (startsUnit) {
        let turnEl = element.closest<HTMLElement>('.opencodian-turn');
        if (!turnEl || (isAssistant && this.turnHostsOtherMessages(turnEl, element))) {
          // An assistant-only unit head rendered into a foreign turn body
          // gets its own assistant-only turn shell.
          turnEl = this.createAssistantOnlyTurnShell(element);
        }
        const referenceTurn = this.findNextElementWithClass(turnCursor, messagesEl, 'opencodian-turn');
        if (turnEl !== referenceTurn) {
          messagesEl.insertBefore(turnEl, referenceTurn);
        }
        turnCursor = turnEl;
        frontierBody = turnEl.querySelector<HTMLElement>('.opencodian-turn-body');
        bodyCursor = null;
        continue;
      }

      if (!frontierBody) {
        return false;
      }
      const reference = this.findNextElementWithClass(bodyCursor, frontierBody, 'opencodian-message');
      if (element.parentElement !== frontierBody || element !== reference) {
        frontierBody.insertBefore(element, reference);
      }
      bodyCursor = element;
    }
    return true;
  }

  /**
   * Resolves the DOM element for one render-list entry: unchanged messages
   * keep their node, edited user messages re-render in place, changed
   * assistant messages are replaced in place, and new messages render fresh.
   */
  private async resolveEntryElement(
    context: KeyedReconcileContext,
    message: ChatMessage,
    isAssistant: boolean,
  ): Promise<HTMLElement | null> {
    const existing = context.previousElementById.get(message.id) ?? null;
    const unchanged = existing
      && context.previousSignatureById.get(message.id) === this.host.getMessageVisualSignature(message);
    if (existing && unchanged) {
      return existing;
    }
    if (existing && !isAssistant) {
      await this.messageRenderer.rerenderSingleUserMessage(message.id, message);
      if (!this.isCurrentOwner(context)) {
        return null;
      }
      return existing;
    }
    // Assistant rendering can await markdown/content-block work. Stage its
    // shell in a detached turn body so the async renderer cannot mutate the
    // live current-turn body (or make a premature bottom append). The staged
    // node is committed below only after ownership is revalidated.
    const rendered = isAssistant
      ? await this.renderAssistantInDetachedBody(context.tabId, message)
      : await this.messageRenderer.renderMessage(message);
    if (!this.isCurrentOwner(context)) {
      // A newer owner may already have committed the same message id. Leave
      // any returned node untouched and let that owner establish the DOM.
      return null;
    }
    if (!(rendered instanceof HTMLElement)) {
      return null;
    }
    if (existing) {
      // Replace a changed assistant message in place so sibling order stays.
      disposeCollapsiblesWithin(existing);
      existing.replaceWith(rendered);
    }
    return rendered;
  }

  private async renderAssistantInDetachedBody(
    tabId: TabId | null,
    message: ChatMessage,
  ): Promise<HTMLElement | void | undefined> {
    const runtime = this.host.getRenderRuntimeForTab(tabId);
    if (!runtime) {
      return this.messageRenderer.renderMessage(message);
    }

    const stagingTurn = document.createElement('div');
    stagingTurn.className = 'opencodian-turn opencodian-turn--assistant-only';
    const stagingBody = document.createElement('div');
    stagingBody.className = 'opencodian-turn-body';
    stagingTurn.appendChild(stagingBody);
    const previousStagingBody = runtime.stagedTurnBodyEl;
    runtime.stagedTurnBodyEl = stagingBody;
    try {
      return await this.messageRenderer.renderMessage(message);
    } finally {
      if (runtime.stagedTurnBodyEl === stagingBody) {
        runtime.stagedTurnBodyEl = previousStagingBody ?? null;
      }
    }
  }

  /** Prunes turn shells that lost every message they hosted. */
  private pruneEmptyTurnShells(context: KeyedReconcileContext): void {
    for (const turnEl of Array.from(context.messagesEl.querySelectorAll<HTMLElement>('.opencodian-turn'))) {
      if (!turnEl.querySelector('.opencodian-message')) {
        disposeCollapsiblesWithin(turnEl);
        turnEl.remove();
      }
    }
  }

  /** Points the turn-body cursor at the last turn so later appends land right. */
  private resetCurrentTurnBody(context: KeyedReconcileContext): void {
    const renderRuntime = this.host.getRenderRuntimeForTab(context.tabId);
    if (!renderRuntime) {
      return;
    }
    const turns = context.messagesEl.querySelectorAll('.opencodian-turn');
    renderRuntime.currentTurnBodyEl = turns.length > 0
      ? turns[turns.length - 1].querySelector<HTMLElement>('.opencodian-turn-body')
      : null;
  }

  private restoreScroll(
    context: KeyedReconcileContext,
    scrollSnapshot: ConversationScrollRestoreSnapshot,
  ): void {
    const { messagesEl, tabId } = context;
    restoreElementScrollAfterRender(messagesEl, scrollSnapshot, {
      runtime: this.host.getScrollRuntimeForTab(tabId),
      lateContentReapplyWindowMs: LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS,
      isRestoreCurrent: () => this.isCurrentOwner(context),
      onRestoreBottom: () => {
        this.host.scrollToBottom({ tabId });
      },
      onRestored: () => {
        this.host.syncPaneScrollMetrics(tabId, messagesEl);
      },
      requestAnimationFrame: (callback) => this.host.requestAnimationFrame(callback),
    });
  }

  private turnHostsOtherMessages(turnEl: Element, element: HTMLElement): boolean {
    return Array.from(turnEl.querySelectorAll('.opencodian-message'))
      .some((hosted) => hosted !== element);
  }

  private createAssistantOnlyTurnShell(element: HTMLElement): HTMLElement {
    const turnEl = document.createElement('div');
    turnEl.className = 'opencodian-turn opencodian-turn--assistant-only';
    const bodyEl = document.createElement('div');
    bodyEl.className = 'opencodian-turn-body';
    turnEl.appendChild(bodyEl);
    bodyEl.appendChild(element);
    return turnEl;
  }

  private findNextElementWithClass(
    after: Element | null,
    parent: Element,
    className: string,
  ): HTMLElement | null {
    let current = after ? after.nextElementSibling : parent.firstElementChild;
    while (current && !current.classList.contains(className)) {
      current = current.nextElementSibling;
    }
    return (current as HTMLElement | null) ?? null;
  }
}
