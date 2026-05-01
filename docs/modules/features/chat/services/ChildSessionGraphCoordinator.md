# ChildSessionGraphCoordinator

> **源码**: `src/features/chat/services/ChildSessionGraphCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChildSessionGraphCoordinator` 是 child-session graph 的视图侧 owner。它负责：

1. 从 host 读取当前活动 `Conversation`
2. 在存在 `openCodeSessionId` 时调用 host 的 `getSessionChildren()` 拉取 live child session 元数据
3. 调用 `ChildSessionGraphService.reconstructGraph()` 重建图
4. 持有最近一次 graph snapshot
5. **渲染 child-session tree DOM**（2026-05-01 从 `OpenCodianView` 迁入）

## 公开接口

```typescript
export interface ChildSessionGraphCoordinatorHost {
  getCurrentConversation(): Conversation | null;
  getSessionChildren(sessionId: string): Promise<ChildSessionInfo[]>;
  onGraphUpdated(graph: ChildSessionGraph): void;
  getMessagesContainerEl(): HTMLElement | null;
  openTaskToolSession(sessionId: string): void;
}

export const SESSION_TREE_BASE_CSS: string;

export class ChildSessionGraphCoordinator {
  getGraph(): ChildSessionGraph | null;
  refreshGraph(): Promise<ChildSessionGraph | null>;
  clearGraph(): void;
  clearContainer(): void;
  hide(): void;
  render(graph: ChildSessionGraph): void;
}
```

## 关键行为

### Graph 重建

- `refreshGraph()` 在没有活动对话或对话缺少 `openCodeSessionId` 时直接清空内部 snapshot 并返回 `null`
- `getSessionChildren()` 失败不会中断 graph reconstruction；coordinator 会退回只用 persisted task metadata 重建图
- `getGraph()` 只返回最近一次 refresh 的结果，不会隐式触发任何 I/O
- `clearGraph()` 只清理内部 graph 状态，方便 view 在 empty-tab / close 路径上复位 UI

### DOM 渲染

- `render(graph)` 在 `messagesContainer` 底部创建/复用 `.opencodian-session-tree` 元素，渲染折叠的 session tree
- `ensureContainer()` 私有方法负责容器元素的创建与复用：如果现有元素不在当前 `messagesContainer` 内，会移除旧元素并新建
- `hide()` 清空并隐藏 session tree DOM
- `clearContainer()` 移除 DOM 元素并清除内部引用，确保容器切换时不会留下 stale DOM 节点
- `SESSION_TREE_BASE_CSS` 导出供 `OpenCodianView.applyChatAppearanceSettings()` 注入样式

### 渲染内容

普通 edge 行显示：
- 状态色点（completed / active / error）
- title / description
- `Open` 按钮（点击触发 `host.openTaskToolSession()`）

orphaned session 行显示：
- 灰色未知色点
- `Unknown task` 标题
- `Partial graph` badge
- 可选 orphan title
- `Open` 按钮

graph 为 `partial` 时额外显示提醒文案。

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 通过 `createChildSessionGraphCoordinatorHost()` 提供 host seam，并在 `createSurfaceRuntimeWiring()` 中创建 coordinator
- view 在 `loadConversation()` 和 authoritative sync 完成后调用 `refreshGraph()`，让 child-session tree 跟随活动对话的消息刷新
- view 不再直接持有 `renderSessionTree()`、`hideSessionTree()` 或 `ensureChildSessionTreeContainer()`；这些已全部迁入 coordinator
- view 通过 `coordinator.render()`、`coordinator.hide()`、`coordinator.clearContainer()` 间接操作 DOM
- `SESSION_TREE_BASE_CSS` 由 coordinator 导出，view 在 `applyChatAppearanceSettings()` 中注入

## 迁入历史

**2026-05-01**：将 `renderSessionTree`、`hideSessionTree`、`ensureChildSessionTreeContainer` 和 `SESSION_TREE_BASE_CSS` 从 `OpenCodianView` 迁入本 coordinator。动机：减少 `OpenCodianView` 的 DOM 渲染职责，让 coordinator 成为 child-session tree 的完整 owner。

**DOM cleanup 修正**：`clearContainer()` 在清除内部引用前先调用 `remove()` 移除 DOM 元素，防止 pane/container 切换时留下 stale `.opencodian-session-tree` 节点。已添加回归测试验证容器切换不会创建重复节点。
