import type { Conversation } from '../../../core/types';

export type TabId = string;

export interface TabModelOverride {
  provider: string;
  model: string;
}

export interface TabData {
  id: TabId;
  conversationId: string | null;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  needsAttention: boolean;
  modelOverride: TabModelOverride | null;
}

export interface TabBarItem {
  id: TabId;
  index: number;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  needsAttention: boolean;
  canClose: boolean;
}

export interface RestoredTabState {
  conversationId: string | null;
  title: string;
  modelOverride: TabModelOverride | null;
}

export interface TabManagerOptions {
  getMaxTabs: () => number;
  onChanged?: () => void;
}

export type TabConversationLike = Pick<Conversation, 'id' | 'title'>;

export interface CloseTabResult {
  closed: boolean;
  nextActiveTabId: TabId | null;
}

export function generateTabId(): TabId {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
