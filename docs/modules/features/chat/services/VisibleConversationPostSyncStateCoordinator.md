# VisibleConversationPostSyncStateCoordinator

> **源码**: `src/features/chat/services/VisibleConversationPostSyncStateCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`VisibleConversationPostSyncStateCoordinator` 专门承接 active visible-conversation background sync 完成后的 current-conversation state commit 判定，负责：

- 校验当前 conversation 是否仍匹配发起 sync 时的 expected conversation
- 在仍匹配时提交 `currentConversationRevertState`
- 仅在 sync result changed 时更新 active tab 的 conversation sync fingerprint
- 返回 view 后续应 apply synced messages 还是退回 background-task indicator render 的 outcome

它不负责 question/todo refresh、background-task authoritative mark、tab attention、completion notice flush，也不直接访问 `OpenCodianView`；这些分别仍由 `PostSyncQuestionTodoRefreshFacade`、`VisibleConversationPostSyncCoordinator`、`BackgroundTaskIndicatorCoordinator` 与 host adapter 边界承接。

## 公开接口

```typescript
export interface VisibleConversationPostSyncStateCoordinatorHost {
  getCurrentConversationId(): string | null;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
}

export interface VisibleConversationPostSyncStateCommitOptions {
  tabId: TabId;
  expectedConversationId: string;
  syncResult: VisibleConversationPostSyncResult;
}

export class VisibleConversationPostSyncStateCoordinator {
  commitPostSyncState(...): VisibleConversationPostSyncOutcome;
}
```

## 关键行为

### current-conversation match gate

- `commitPostSyncState()` 每次先通过 host 读取当前 conversation id，并与 sync 发起时记录的 `expectedConversationId` 对比
- 如果当前 conversation 已切换，则不写入 revert state，也不更新 tab fingerprint，只返回 indicator-only outcome
- 如果仍命中当前 conversation，则更新 revert state；只有 `syncResult.changed === true` 时才更新 fingerprint

### render outcome

- `shouldApplySyncedConversationUpdate` 只在当前 conversation 仍匹配且 sync result changed 时为 `true`
- `shouldRenderBackgroundTaskIndicator` 在 conversation 已切换或 sync unchanged 时为 `true`，让 view 回退到 background-task indicator 渲染路径

## 与 `OpenCodianView` 的边界

- `VisibleConversationPostSyncStateHostAdapter` 从共享的 question/todo/background-task view host 派生本 coordinator 的 host，并把 view-local current-conversation/revert-state/fingerprint 写回封装在独立 adapter 边界内
- `VisibleConversationPostSyncCoordinator` 只在 visible sync 完成 refresh 后调用本 coordinator，不再自己持有 current-conversation state-commit 规则
- 这次切片推进 master plan 的 P2 `question / todo / background task` lane，把 visible sync 的 current-conversation runtime bridge 从 background-task post-sync 编排中拆成单一职责模块
