# ChildSessionGraphCoordinator

> **源码**: `src/features/chat/services/ChildSessionGraphCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChildSessionGraphCoordinator` 是 child-session graph 的最薄一层视图侧 host adapter。它不持有 SDK 订阅、轮询或缓存策略，只负责把当前活动对话的 persisted messages 与可选 live child-session 列表交给 `core/agents/ChildSessionGraphService`，并把最新 `ChildSessionGraph` 暴露给 UI。

它专门负责：

- 从 host 读取当前活动 `Conversation`
- 在存在 `openCodeSessionId` 时调用 host 的 `getSessionChildren()` 拉取 live child session 元数据
- 调用 `ChildSessionGraphService.reconstructGraph()` 重建图
- 持有最近一次 graph snapshot，并在刷新成功后通过 host 回调触发 UI 更新

它不负责 DOM 渲染、空状态文案、折叠交互，也不决定何时 refresh；这些仍由 `OpenCodianView` 决定。

## 公开接口

```typescript
export interface ChildSessionGraphCoordinatorHost {
  getCurrentConversation(): Conversation | null;
  getSessionChildren(sessionId: string): Promise<ChildSessionInfo[]>;
  onGraphUpdated(graph: ChildSessionGraph): void;
}

export class ChildSessionGraphCoordinator {
  getGraph(): ChildSessionGraph | null;
  refreshGraph(): Promise<ChildSessionGraph | null>;
  clearGraph(): void;
}
```

## 关键行为

- `refreshGraph()` 在没有活动对话或对话缺少 `openCodeSessionId` 时直接清空内部 snapshot 并返回 `null`
- `getSessionChildren()` 失败不会中断 graph reconstruction；coordinator 会退回只用 persisted task metadata 重建图
- `getGraph()` 只返回最近一次 refresh 的结果，不会隐式触发任何 I/O
- `clearGraph()` 只清理内部状态，方便 view 在 empty-tab / close 路径上复位 UI

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 通过 `createChildSessionGraphCoordinatorHost()` 提供 host seam，并在 `createSurfaceRuntimeWiring()` 中创建 coordinator
- view 在 `loadConversation()` 和 authoritative sync 完成后调用 `refreshGraph()`，让 child-session tree 跟随活动对话的消息刷新
- view 自己持有 `renderSessionTree()`，把 graph 渲染成消息区底部的最小 session tree；graph state 仍由 coordinator 持有
