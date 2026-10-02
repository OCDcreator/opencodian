# ConversationHistoryActionsCoordinator
> 2026-09-20 (advantage-parity R-D1)：每个历史条目的 rename 按钮旁新增导出按钮（`download` 图标，`chat.history.export` 文案），点击关闭下拉并调用 host 的 `exportConversationMarkdown`（可选方法，未提供时不渲染）。

> **源码**: `src/features/chat/services/ConversationHistoryActionsCoordinator.ts`
> **最近更新**: 2026-06-06 (preview transcript seeding + settings info)

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
- delete current / selected 继续复用 view 的 recover path；delete-all 复用 tab reset + fallback bootstrap path。只有 host 完成才显示 success；host 的 pending/admitted 或 native failure 会被 catch 并通过现有 `showNotice(error.message)` 如实呈现，避免 void click-handler 的 unhandled rejection 和虚假成功。保留项可重新打开 history 再重试；多个失败原因由 lifecycle 的 `errors` 聚合。confirm/countdown dialog DOM 仍由 `ConversationHistoryDialogService` 负责。
- 2026-10-02 reviewed continuation 只接既有删除错误通道，没有新增 View/i18n 控件；explicit forget 已在 main/Codex API 与 native delete 区分，history 默认仍走 native delete。专属测试覆盖 current/selected/all pending→retry success 及真实 click/confirm 的 native failure Notice。
- 当 host 提供 `openTitleSettings()` 时，dropdown footer 会渲染全局 "Title preferences" 入口（gear 图标），点击后关闭 dropdown 并导航到设置页的会话标题分组
- `destroy()` 会统一清理 dropdown DOM、click listener 与 positioning RAF，供 `OpenCodianView.onClose()` 调用

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host 装配、active backend display name、title state writeback 与 delete recovery coordinator 的现有 owner
- `ConversationHistoryActionsCoordinator` 统一承接 history dropdown、positioning、selection state 与 host action routing；rename/delete confirm UI 由 `ConversationHistoryDialogService` 承接
- 这次切口推进 maintainability roadmap 的 `R42 - OpenCodianView conversation history/actions seam`，目标是让主 view 不再直接铺开这段 conversation-management UI 细节

## 2026-10-02 Codex local forget / complete catalog UI

Codex history 新增独立 `[data-codex-forget-local]` 按钮：无勾选时当前项，勾选时批量。2026-10-02 reviewed P3 补修中，仅非空且全部属于 Codex 的目标允许操作；非 Codex 当前项、混合/foreign 选择和无当前目标均设置 native disabled / aria-disabled，checkbox change 立即重算，避免启用后静默 return。英中正式 UI 测试断言 foreign→Codex→mixed→foreign→Codex 各转换。独立确认文案清楚保留 Codex native history；pending 防重复，重新打开时按钮禁用并显示 aria-busy。失败只显示错误，保留项可再次选择重试；默认 delete current/selected/all 仍调用 native delete recovery。按钮、pending 标签、成功通知与非 Error 失败提示通过 typed `t(...)` 消费 `chat.history.forgetLocal*` / `chat.forgetLocalConfirm.*`，tooltip 复用 emphasis，明确原生历史保留。英中正式 UI 测试覆盖当前项、批量、pending、失败保留/重试及 native delete 独立路径；locale 文件由 parent 整合，本 owner 未改 locales。
