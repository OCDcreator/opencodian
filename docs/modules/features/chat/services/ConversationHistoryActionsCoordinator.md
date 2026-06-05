# ConversationHistoryActionsCoordinator

> **源码**: `src/features/chat/services/ConversationHistoryActionsCoordinator.ts`
> **最近更新**: 2026-06-06

## 概述

`ConversationHistoryActionsCoordinator` 把 `OpenCodianView` 里和 history 菜单直接相关的一整段 UI lifecycle 收束到单独 owner：

- conversation history dropdown 的构建、定位与 click-outside cleanup
- rename/delete dialog 的业务流、无效标题提示与成功路径
- history 菜单里“打开会话 / 批量选择 / delete-all”这组交互分支

它不负责真正的 conversation 持久化、title sync 或 tab recovery 决策；这些仍通过 host 回调落回 `OpenCodianView` 已有的 title writeback 与 `ConversationTabLifecycleRecoveryCoordinator`。具体的 rename input dialog 与 delete confirm/countdown DOM 已下沉到 `ConversationHistoryDialogService`，让 coordinator 专注 history dropdown 与 host action routing。

## 公开接口

```typescript
export interface ConversationHistoryActionsHost {
  getConversations(): Conversation[];
  getCurrentConversation(): Conversation | null;
  getHistoryBackendDisplayName?(): string;
  isActiveTabStreaming(): boolean;
  loadConversation(conversationId: string): Promise<void>;
  getConversationById(conversationId: string): Promise<Conversation | null>;
  cancelConversationTitleGeneration(conversationId: string): void;
  updateConversationTitle(conversationId: string, title: string): Promise<void>;
  deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: string[]): Promise<void>;
  showNotice(message: string): void;
  openTitleSettings?(): void;
}

export class ConversationHistoryActionsCoordinator {
  show(event: MouseEvent): void;
  destroy(): void;
}
```

## 关键行为

- `show()` 会在没有 conversation 时直接显示 `chat.history.empty` notice
- 当 host 提供 `getHistoryBackendDisplayName()` 时，dropdown 顶部会渲染当前 backend scope（例如 `Claude Code history`）。实际过滤仍由 host 的 `getConversations()` 负责；coordinator 只把这个已经过滤的集合说清楚，避免 Claude / OpenCode 历史在 UI 心智上混淆。
- dropdown 仍保留 active conversation 高亮、title-generation status tag，以及批量选择后 delete-current → delete-selected 的文案切换
- 点击 history item 时仍会先关闭 dropdown；若前台 tab 正在 streaming，则继续走 `chat.tab.streamingBlocked` notice 并阻止切换
- rename flow 仍会先取消当前 conversation 的 title generation，再通过 `ConversationHistoryDialogService` 取得新标题并把 host 回调写回 view
- delete current / selected 继续复用 view 的 recover path；delete-all 继续复用 tab reset + fallback bootstrap path；confirm/countdown dialog DOM 由 `ConversationHistoryDialogService` 负责
- 当 host 提供 `openTitleSettings()` 时，dropdown footer 会渲染全局 "Title preferences" 入口（gear 图标），点击后关闭 dropdown 并导航到设置页的会话标题分组
- `destroy()` 会统一清理 dropdown DOM、click listener 与 positioning RAF，供 `OpenCodianView.onClose()` 调用

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host 装配、active backend display name、title state writeback 与 delete recovery coordinator 的现有 owner
- `ConversationHistoryActionsCoordinator` 统一承接 history dropdown、positioning、selection state 与 host action routing；rename/delete confirm UI 由 `ConversationHistoryDialogService` 承接
- 这次切口推进 maintainability roadmap 的 `R42 - OpenCodianView conversation history/actions seam`，目标是让主 view 不再直接铺开这段 conversation-management UI 细节
