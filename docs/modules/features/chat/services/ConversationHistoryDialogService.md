# ConversationHistoryDialogService

> **源码**: `src/features/chat/services/ConversationHistoryDialogService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHistoryDialogService` 承接 history 菜单中的 modal/dialog DOM lifecycle：

- delete current / selected / all 的 confirm dialog 文案、倒计时与 Escape/overlay/cancel cleanup
- rename conversation dialog 的输入框、Enter/Escape 处理与 autofocus/select
- 与 locale key 的直接绑定

它不读取 conversation state，也不执行删除、重命名或 tab recovery；这些仍由 `ConversationHistoryActionsCoordinator` 通过 host 回调处理。

## 公开接口

```typescript
export class ConversationHistoryDialogService {
  showDeleteCurrentConfirmDialog(title: string): Promise<boolean>;
  showDeleteSelectedConfirmDialog(count: number): Promise<boolean>;
  showDeleteAllConfirmDialog(count: number): Promise<boolean>;
  showRenameConversationDialog(initialValue: string): Promise<string | null>;
}
```

## 关键行为

- delete current/selected 的 countdown 保持 `3` 秒，delete all 保持 `6` 秒
- confirm button 在倒计时结束前保持 disabled，结束后切换到 confirm text
- Escape 与 overlay click 都按取消处理，并清理 timer 与 keydown listener
- rename dialog 在 mount 后异步 focus/select 输入框，Enter 保存当前值，Escape 或 overlay/cancel 返回 `null`

## 与 `ConversationHistoryActionsCoordinator` 的边界

- coordinator 仍负责 history dropdown、selection state、active streaming guard、host delete/reset/rename 调用与 notice
- dialog service 只返回用户确认结果或新标题字符串，不接触持久化和 tab state
