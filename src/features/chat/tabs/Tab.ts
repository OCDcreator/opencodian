import type { TabConversationLike, TabData, TabId, TabModelOverride } from './types';
import { generateTabId } from './types';

export class Tab {
  private data: TabData;

  constructor(title: string, conversation?: TabConversationLike | null) {
    this.data = {
      id: generateTabId(),
      conversationId: conversation?.id ?? null,
      title: conversation?.title || title,
      isActive: false,
      isStreaming: false,
      needsAttention: false,
      modelOverride: null,
    };
  }

  getId(): TabId {
    return this.data.id;
  }

  getData(): TabData {
    return { ...this.data, modelOverride: this.data.modelOverride ? { ...this.data.modelOverride } : null };
  }

  setActive(active: boolean): void {
    this.data.isActive = active;
  }

  setStreaming(streaming: boolean): void {
    this.data.isStreaming = streaming;
  }

  setNeedsAttention(needsAttention: boolean): void {
    this.data.needsAttention = needsAttention;
  }

  setConversation(conversation: TabConversationLike | null, fallbackTitle: string): void {
    this.data.conversationId = conversation?.id ?? null;
    this.data.title = conversation?.title || fallbackTitle;
  }

  setTitle(title: string): void {
    this.data.title = title;
  }

  setModelOverride(modelOverride: TabModelOverride | null): void {
    this.data.modelOverride = modelOverride ? { ...modelOverride } : null;
  }
}
