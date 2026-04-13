# SessionTodoDockCoordinator

> **源码**: `src/features/chat/services/SessionTodoDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoDockCoordinator` 把 `OpenCodianView` 里 session todo dock 的 **挂载、销毁，以及 active/background tab 的 session→dock 渲染选择** 收束成一个 dedicated coordinator，专门负责：

- 在输入区附近创建并销毁 `SessionTodoDock`
- 为当前活动 tab 优先使用 `currentConversation.openCodeSessionId` 渲染 dock
- 为 activation preflight / background tab 路径继续使用 tab runtime 里缓存的 `sessionTodoSessionId`

它不维护 todo/status snapshot，也不参与 stale notice 状态机；这些职责仍分别留在 `SessionTodoStateService` 与 `SessionTodoCoordinator`。

## 公开接口

```typescript
export interface SessionTodoDockCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): { sessionTodoSessionId: string | null } | null;
  getTabSessionTodos(tabId: TabId | null, sessionId?: string | null): SessionTodo[];
}

export class SessionTodoDockCoordinator {
  attach(parentEl: HTMLElement): void;
  render(tabId?: TabId | null): void;
  updateForTab(tabId: TabId): void;
  destroy(): void;
}
```

## 关键行为

- `attach()` 会创建自己的 `opencodian-session-todo-slot`，并在重复挂载前先清理旧 dock
- `render()` 会区分 active tab 与非 active tab：active 路径取当前 conversation 的 session，避免显示旧 runtime snapshot；background 路径继续读 tab runtime
- `updateForTab()` 保留 activation preflight 的旧语义：即使目标 tab 即将成为 active，也先按 runtime 中缓存的 session snapshot 预刷新 dock
- `destroy()` 会同时清理 dock 实例和自己拥有的 slot DOM

## 与其他模块的交互

- `SessionTodoCoordinator` 现在在构建输入区/销毁 view 时持有并调用本 coordinator
- `SessionTodoStateService` 仍通过 shared host 触发 `renderSessionTodoDock()`，但真实 dock render 已由本 coordinator 承接
- `TabViewActivationBridge` 继续复用 `renderSessionTodoDock()` / `updateSessionTodoDockForTab()`，只是底层实现不再直接操作 DOM

## 维护收益

- 推进 master plan 的 P2 `question / todo / background task` lane，把 session todo dock 这块 runtime/UI ownership 从 `OpenCodianView` 迁到独立模块
- 让后续 session todo/stale notice 调整可以围绕 coordinator + state service，而不是回到主 view 里混写 DOM 与 session 选择逻辑
