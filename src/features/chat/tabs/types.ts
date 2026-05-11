import type { Conversation, TabContextState } from '../../../core/types';

export type TabId = string;

export interface TabModelOverride {
  provider: string;
  model: string;
}

export interface TabData {
  id: TabId;
  parentTabId?: TabId;
  conversationId: string | null;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  hasBackgroundTask: boolean;
  needsAttention: boolean;
  modelOverride: TabModelOverride | null;
  contextUsage: TabContextState;
}

export interface TabBarItem {
  id: TabId;
  parentTabId?: TabId;
  index: number;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  hasBackgroundTask: boolean;
  needsAttention: boolean;
  canClose: boolean;
}

export type TabBarLayoutMode = 'header' | 'input' | 'below-header-grid' | 'below-header-vertical';

export interface RestoredTabState {
  id?: TabId;
  parentTabId?: TabId;
  conversationId: string | null;
  title: string;
  modelOverride: TabModelOverride | null;
}

export interface TabCreateOptions {
  parentTabId?: TabId | null;
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

export interface CloseTabsResult {
  closedTabIds: TabId[];
  nextActiveTabId: TabId | null;
}

export function generateTabId(): TabId {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
