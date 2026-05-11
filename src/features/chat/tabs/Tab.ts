import { createEmptyTabContextState, type TabContextState } from '../../../core/types';
import type { TabConversationLike, TabCreateOptions, TabData, TabId, TabModelOverride } from './types';
import { generateTabId } from './types';

export class Tab {
  private data: TabData;

  constructor(title: string, conversation?: TabConversationLike | null, options?: TabCreateOptions) {
    this.data = {
      id: generateTabId(),
      parentTabId: options?.parentTabId ?? undefined,
      conversationId: conversation?.id ?? null,
      title: conversation?.title || title,
      isActive: false,
      isStreaming: false,
      hasBackgroundTask: false,
      needsAttention: false,
      modelOverride: null,
      contextUsage: createEmptyTabContextState(),
    };
  }

  getId(): TabId {
    return this.data.id;
  }

  getData(): TabData {
    return {
      ...this.data,
      modelOverride: this.data.modelOverride ? { ...this.data.modelOverride } : null,
      contextUsage: { ...this.data.contextUsage },
    };
  }

  setActive(active: boolean): void {
    this.data.isActive = active;
  }

  setStreaming(streaming: boolean): void {
    this.data.isStreaming = streaming;
  }

  setBackgroundTaskRunning(hasBackgroundTask: boolean): void {
    this.data.hasBackgroundTask = hasBackgroundTask;
  }

  setNeedsAttention(needsAttention: boolean): void {
    this.data.needsAttention = needsAttention;
  }

  setParentTabId(parentTabId: TabId | null): void {
    this.data.parentTabId = parentTabId ?? undefined;
  }

  setConversation(conversation: TabConversationLike | null, fallbackTitle: string): void {
    const nextConversationId = conversation?.id ?? null;
    if (this.data.conversationId !== nextConversationId) {
      this.data.contextUsage = createEmptyTabContextState();
    }

    this.data.conversationId = conversation?.id ?? null;
    this.data.title = conversation?.title || fallbackTitle;
    this.data.contextUsage.sessionTitle = conversation?.title || fallbackTitle;
  }

  setTitle(title: string): void {
    this.data.title = title;
    this.data.contextUsage.sessionTitle = title;
  }

  setModelOverride(modelOverride: TabModelOverride | null): void {
    this.data.modelOverride = modelOverride ? { ...modelOverride } : null;
  }

  setContextUsage(contextUsage: TabContextState): void {
    this.data.contextUsage = { ...contextUsage };
  }
}
