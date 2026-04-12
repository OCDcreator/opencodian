# SessionTodoStateService

> **源码**: `src/features/chat/services/SessionTodoStateService.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoStateService` 把 `OpenCodianView` 里一整段 session todo/status runtime bridge 收进了独立服务，专门负责：

- 规范化 `SessionTodo` 快照并做去重
- 维护每个 tab 的 todo/status fingerprint、last-changed 时间与 suppression 状态
- 在 reload / hydration 后恢复已持久化的 stale todo notice 抑制
- 在长时间无活动时隐藏过期 todo snapshot，并在需要时补写持久化 warning notice

它不拥有 dock DOM，也不直接依赖插件实例；所有 view 相关能力都通过 `SessionTodoStateServiceHost` 回调获得。

## 公开接口

```typescript
export interface SessionTodoStateServiceHost {
  getTabRuntimeState(tabId: TabId | null): SessionTodoStateRuntime | null;
  getActiveTabId(): TabId | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  hasMatchingPersistentAssistantNoticeMessage(...): boolean;
  appendPersistentAssistantNoticeMessage(...): Promise<void>;
}

export class SessionTodoStateService {
  getTabSessionTodos(...): SessionTodo[];
  setTabSessionTodos(...): void;
  getTabSessionStatus(...): SessionActivityStatus | null;
  setTabSessionStatus(...): void;
  extractSessionTodosFromToolInput(...): SessionTodo[];
  hasIncompleteTodos(...): boolean;
  hasIncompleteTabSessionTodos(...): boolean;
  isTabSessionLive(...): boolean;
  suppressStaleSessionTodosIfNeeded(...): SessionTodo[] | null;
  reconcileStaleSessionTodoState(...): void;
  buildStaleSessionTodoNoticeContent(...): string;
}
```

## 关键行为

### todo/status 状态桥接

- `setTabSessionTodos()` 统一维护 normalized todo snapshot、fingerprint 与 suppression 恢复
- `setTabSessionStatus()` 统一维护 session status fingerprint，并在会话重新变成 live 时清除旧的 stale todo suppression
- `getTabSessionTodos()` / `getTabSessionStatus()` 继续保留按 sessionId 过滤，避免 tab runtime 误读到旧会话状态

### stale todo 降级

- `suppressStaleSessionTodosIfNeeded()` 继续沿用原先的 inactivity timeout、session live gate 与 background-task activity 参与的 last-activity 计算
- 当 snapshot 被降级后，服务只通过 host 请求 dock 重绘与持久化 notice 追加；具体的 persisted notice append/dedupe 现已复用 `PersistentAssistantNoticeService`
- 如果 conversation 历史里已经存在完全相同的 stale notice，服务会恢复 suppression，而不会重复写 notice

## 与 `OpenCodianView` 的边界

- `ConversationSessionLiveSignalAdapter` 负责 session todo/status live listener 的生命周期、session→tab 路由与 active-tab fallback
- `SessionTodoStatusRefreshService` 负责主动调用 OpenCode todo/status API、维护 request-id stale guard，并在刷新成功后触发 foreground background-task reconcile
- `PersistentAssistantNoticeService` 负责 persisted stale notice 的历史匹配、追加落盘，以及可见/隐藏 tab 的后续动作
- `BackgroundTaskLiveSignalCoordinator` 现在会直接调用 `reconcileStaleSessionTodoState()` 参与 live-signal settle；view 不再转发这条 stale follow-up callback
- `OpenCodianView` 仍保留 dock 装配与 host 装配，但不再内联 session todo/status 的 OpenCode 拉取刷新
- `SessionTodoStateService` 负责 todo/status runtime 的纯状态机和 stale notice 协调
- 这样后续继续推进 master-plan 的 `question / todo / background task` lane 时，可以把 background task stale/notice 边界继续从 view 拆走，而不是再把 session todo 细节塞回主视图
