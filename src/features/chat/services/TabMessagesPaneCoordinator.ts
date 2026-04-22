import {
  applyPassiveScrollMeasurement,
  applyUserScrollIntent,
  hasProgrammaticScrollGuard,
} from '../autoScrollState';
import type { TabId } from '../tabs';
import {
  isElementNearBottom,
  scrollElementToBottom,
  type ScrollToBottomOptions,
} from './ScrollManager';

interface CancellableStreamController {
  cancelStream(): void;
}

export interface TabMessagesPaneRuntimeState {
  autoScrollEnabled: boolean;
  isNearBottom: boolean;
  programmaticScrollGuardUntil: number;
  isHydratingConversation: boolean;
  pendingLayoutMutations: number;
  suppressNextLayoutAutoScroll?: boolean;
  isStreaming: boolean;
  streamController?: CancellableStreamController | null;
}

export interface TabMessagesPaneState<
  Runtime extends TabMessagesPaneRuntimeState = TabMessagesPaneRuntimeState,
> {
  tabId: TabId;
  messagesEl: HTMLElement;
  runtime: Runtime;
  scrollHandler: () => void;
  mutationObserver: MutationObserver | null;
  resizeObserver: ResizeObserver | null;
}

export interface TabMessagesPaneCoordinatorHost<
  Runtime extends TabMessagesPaneRuntimeState = TabMessagesPaneRuntimeState,
> {
  getMessagesShellEl(): HTMLElement | null;
  getMessagesContainer(): HTMLElement | null;
  setMessagesContainer(messagesEl: HTMLElement | null): void;
  getActiveTabId(): TabId | null;
  createRuntimeState(): Runtime;
  applyChatScrollModeToMessagesEl(messagesEl: HTMLElement): void;
  resetTurnState(): void;
  restoreTurnStateFromActivePane(): void;
  rebuildNavigationSidebar(): void;
  destroyNavigationSidebar(): void;
  updateNavigationSidebarVisibility(): void;
  clearScheduledSignalConversationSync(tabId: TabId): void;
  shouldAutoScroll(tabId: TabId | null): boolean;
  scheduleSettledScrollToBottomIfNeeded(shouldScroll: boolean, tabId: TabId | null): void;
}

export class TabMessagesPaneCoordinator<
  Runtime extends TabMessagesPaneRuntimeState = TabMessagesPaneRuntimeState,
> {
  private readonly paneStates = new Map<TabId, TabMessagesPaneState<Runtime>>();

  constructor(private readonly host: TabMessagesPaneCoordinatorHost<Runtime>) {}

  getPaneState(tabId: TabId | null): TabMessagesPaneState<Runtime> | null {
    if (!tabId) {
      return null;
    }

    return this.paneStates.get(tabId) ?? null;
  }

  getRuntimeState(tabId: TabId | null): Runtime | null {
    return this.getPaneState(tabId)?.runtime ?? null;
  }

  getMessagesEl(tabId: TabId | null): HTMLElement | null {
    return this.getPaneState(tabId)?.messagesEl ?? null;
  }

  applyScrollModeToPanes(): boolean {
    if (this.paneStates.size === 0) {
      return false;
    }

    for (const paneState of this.paneStates.values()) {
      this.host.applyChatScrollModeToMessagesEl(paneState.messagesEl);
    }
    return true;
  }

  ensureRuntimeState(tabId: TabId | null): Runtime | null {
    if (!tabId) {
      return null;
    }

    return this.ensurePane(tabId)?.runtime ?? null;
  }

  ensurePane(tabId: TabId): TabMessagesPaneState<Runtime> | null {
    const existing = this.paneStates.get(tabId);
    if (existing?.messagesEl?.isConnected) {
      return existing;
    }

    const messagesShellEl = this.host.getMessagesShellEl();
    if (!messagesShellEl) {
      return null;
    }

    const messagesEl = messagesShellEl.createDiv({
      cls: 'opencodian-messages opencodian-messages-pane',
    });
    messagesEl.dataset.tabId = tabId;
    this.host.applyChatScrollModeToMessagesEl(messagesEl);

    const scrollHandler = () => {
      this.handleScroll(tabId);
    };
    messagesEl.addEventListener('scroll', scrollHandler, { passive: true });

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        this.handleLayoutChange(tabId);
      })
      : null;
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            resizeObserver?.observe(node);
          }
        });
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            resizeObserver?.unobserve(node);
          }
        });
      }
      this.handleLayoutChange(tabId);
    });
    mutationObserver.observe(messagesEl, { childList: true });

    const paneState: TabMessagesPaneState<Runtime> = {
      tabId,
      messagesEl,
      runtime: this.host.createRuntimeState(),
      scrollHandler,
      mutationObserver,
      resizeObserver,
    };
    this.observePaneChildren(paneState);
    this.paneStates.set(tabId, paneState);
    return paneState;
  }

  setActivePane(tabId: TabId): void {
    const activePaneState = this.ensurePane(tabId);
    if (!activePaneState) {
      this.clearActiveSurface();
      return;
    }

    for (const [paneTabId, paneState] of this.paneStates) {
      paneState.messagesEl.classList.toggle('is-active', paneTabId === tabId);
    }

    this.host.setMessagesContainer(activePaneState.messagesEl);
    this.host.restoreTurnStateFromActivePane();
    this.host.rebuildNavigationSidebar();
    this.syncScrollMetrics(tabId, activePaneState.messagesEl);
    if (activePaneState.runtime.autoScrollEnabled) {
      this.host.scheduleSettledScrollToBottomIfNeeded(
        this.host.shouldAutoScroll(tabId),
        tabId,
      );
    }
  }

  removePane(tabId: TabId): void {
    const paneState = this.paneStates.get(tabId);
    if (!paneState) {
      return;
    }

    const wasActivePane = this.host.getMessagesContainer() === paneState.messagesEl;
    this.disposePane(paneState);
    this.paneStates.delete(tabId);

    if (wasActivePane) {
      this.clearActiveSurface();
    }
  }

  clearPanes(): void {
    for (const paneState of this.paneStates.values()) {
      this.disposePane(paneState);
    }
    this.paneStates.clear();
    this.clearActiveSurface();
  }

  syncScrollMetrics(
    tabId: TabId | null,
    messagesEl: HTMLElement | null = this.getMessagesEl(tabId),
  ): boolean {
    if (!tabId || !messagesEl) {
      return true;
    }

    const runtime = this.getRuntimeState(tabId);
    if (!runtime) {
      return true;
    }

    const nearBottom = isElementNearBottom(messagesEl);
    const nextState = applyPassiveScrollMeasurement(runtime, nearBottom);
    runtime.isNearBottom = nextState.isNearBottom;
    if (this.host.getActiveTabId() === tabId) {
      this.host.updateNavigationSidebarVisibility();
    }
    return nearBottom;
  }

  scrollToBottom(
    tabId: TabId | null,
    options: ScrollToBottomOptions = {},
  ): void {
    const paneState = this.getPaneState(tabId);
    if (!paneState || !tabId) {
      return;
    }

    scrollElementToBottom(paneState.messagesEl, paneState.runtime, options);
    this.syncScrollMetrics(tabId, paneState.messagesEl);
  }

  suppressNextLayoutAutoScroll(tabId: TabId | null): boolean {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    runtime.suppressNextLayoutAutoScroll = true;
    return true;
  }

  private observePaneChildren(paneState: TabMessagesPaneState<Runtime>): void {
    paneState.resizeObserver?.observe(paneState.messagesEl);
    for (const child of Array.from(paneState.messagesEl.children)) {
      if (child instanceof HTMLElement) {
        paneState.resizeObserver?.observe(child);
      }
    }
  }

  private handleScroll(tabId: TabId): void {
    const paneState = this.getPaneState(tabId);
    if (!paneState) {
      return;
    }

    const nearBottom = this.syncScrollMetrics(tabId, paneState.messagesEl);
    if (hasProgrammaticScrollGuard(paneState.runtime)) {
      if (nearBottom) {
        paneState.runtime.programmaticScrollGuardUntil = 0;
      }
      return;
    }

    const nextState = applyUserScrollIntent(paneState.runtime, nearBottom);
    paneState.runtime.autoScrollEnabled = nextState.autoScrollEnabled;
    paneState.runtime.isNearBottom = nextState.isNearBottom;
  }

  private handleLayoutChange(tabId: TabId): void {
    const paneState = this.getPaneState(tabId);
    if (!paneState) {
      return;
    }

    if (paneState.runtime.isHydratingConversation) {
      paneState.runtime.pendingLayoutMutations += 1;
      this.syncScrollMetrics(tabId, paneState.messagesEl);
      return;
    }

    const nearBottom = this.syncScrollMetrics(tabId, paneState.messagesEl);
    if (hasProgrammaticScrollGuard(paneState.runtime) && nearBottom) {
      paneState.runtime.programmaticScrollGuardUntil = 0;
    }

    const suppressAutoScroll = paneState.runtime.suppressNextLayoutAutoScroll === true;
    if (suppressAutoScroll) {
      paneState.runtime.suppressNextLayoutAutoScroll = false;
    }

    if (this.host.getActiveTabId() === tabId) {
      if (paneState.runtime.isStreaming) {
        return;
      }
      if (suppressAutoScroll) {
        return;
      }
      this.host.scheduleSettledScrollToBottomIfNeeded(
        this.host.shouldAutoScroll(tabId),
        tabId,
      );
    }
  }

  private disposePane(paneState: TabMessagesPaneState<Runtime>): void {
    paneState.runtime.streamController?.cancelStream();
    this.host.clearScheduledSignalConversationSync(paneState.tabId);
    paneState.messagesEl.removeEventListener('scroll', paneState.scrollHandler);
    paneState.mutationObserver?.disconnect();
    paneState.resizeObserver?.disconnect();
    paneState.messagesEl.remove();
  }

  private clearActiveSurface(): void {
    this.host.setMessagesContainer(null);
    this.host.resetTurnState();
    this.host.destroyNavigationSidebar();
  }
}
