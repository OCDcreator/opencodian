import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  ConversationHydrationRenderContext,
  ConversationHydrationRenderPort,
} from './ConversationHydrationRenderBridge';

type ConversationTransitionSnapshot = Pick<Conversation, 'id' | 'titleGenerationStatus'>;

export interface LoadedConversationTransitionContext {
  activeTabId: TabId | null;
  hydrationRenderContext: ConversationHydrationRenderContext;
}

export interface ConversationTransitionBridgeHost {
  getCurrentConversation(): ConversationTransitionSnapshot | null;
  cancelTitleGeneration(conversationId: string): void;
  resetBackgroundTaskIndicator(): void;
  clearPendingTitleGenerationStatus(conversationId: string): Promise<void> | void;
  clearScheduledScrollToBottom(): void;
  beginConversationHydration(tabId: TabId | null): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  endConversationHydration(tabId: TabId | null): void;
}

export interface ConversationTransitionPort {
  prepareLoadedConversationTransition(nextConversationId: string): Promise<void>;
  captureLoadedConversationTransition(preserveScrollPosition: boolean): LoadedConversationTransitionContext;
  beginLoadedConversationTransition(context: LoadedConversationTransitionContext): void;
  restoreLoadedConversationTransition(context: LoadedConversationTransitionContext): void;
  endLoadedConversationTransition(context: LoadedConversationTransitionContext): void;
}

export class ConversationTransitionBridge implements ConversationTransitionPort {
  constructor(
    private readonly host: ConversationTransitionBridgeHost,
    private readonly hydrationRenderBridge: ConversationHydrationRenderPort,
  ) {}

  prepareLoadedConversationTransition(nextConversationId: string): Promise<void> {
    const currentConversation = this.host.getCurrentConversation();
    if (!currentConversation?.id || currentConversation.id === nextConversationId) {
      return Promise.resolve();
    }

    const previousConversationId = currentConversation.id;
    this.host.cancelTitleGeneration(previousConversationId);
    this.host.resetBackgroundTaskIndicator();
    if (currentConversation.titleGenerationStatus === 'pending') {
      void this.host.clearPendingTitleGenerationStatus(previousConversationId);
    }

    return Promise.resolve();
  }

  captureLoadedConversationTransition(
    preserveScrollPosition: boolean,
  ): LoadedConversationTransitionContext {
    const hydrationRenderContext = this.hydrationRenderBridge.captureHydrationContext(
      preserveScrollPosition,
    );

    return {
      activeTabId: hydrationRenderContext.activeTabId,
      hydrationRenderContext,
    };
  }

  beginLoadedConversationTransition(context: LoadedConversationTransitionContext): void {
    this.host.clearScheduledScrollToBottom();
    this.host.beginConversationHydration(context.activeTabId);
    this.hydrationRenderBridge.beginHydrationShell(context.hydrationRenderContext);
    this.host.clearMessagesContainer();
    this.host.resetTurnState();
  }

  restoreLoadedConversationTransition(context: LoadedConversationTransitionContext): void {
    this.hydrationRenderBridge.restoreHydrationShell(context.hydrationRenderContext);
  }

  endLoadedConversationTransition(context: LoadedConversationTransitionContext): void {
    this.host.endConversationHydration(context.activeTabId);
  }
}
