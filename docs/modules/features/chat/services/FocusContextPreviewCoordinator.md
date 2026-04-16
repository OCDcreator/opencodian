# FocusContextPreviewCoordinator

> **源码**: `src/features/chat/services/FocusContextPreviewCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`FocusContextPreviewCoordinator` 把 activation / file-open 相邻的 focus-context preview refresh 与 current-note writeback 从 `OpenCodianView` 的 host lambda 中收束到单一职责 coordinator。它不计算 preview，也不注册事件；只负责把 activation、workspace open、editor-change 这些入口统一转交给 `FocusContextRuntimeService`，并在 file-open 时同步当前会话的 note path。

## 导入关系

上游: `obsidian`（`MarkdownView`）、`FocusContextRuntimeService`
下游: `FocusContextHostAdapter`、`ComposerContextEventBridge`、`ComposerContextViewFacade`、`ContextPickerInteractionBridge`

## 公开接口

```typescript
interface FocusContextPreviewCoordinatorHost {
  setCurrentConversationNotePath(path: string | null): void
}

class FocusContextPreviewCoordinator {
  handleFileOpen(path: string | null): void
  refreshActiveFocusContextPreview(view?: MarkdownView | null, editor?: Editor | null): void
  scheduleFocusContextPreviewRefresh(): void
}
```

## 核心逻辑

- `handleFileOpen()` 保持原有 file-open 语义：先记住 markdown path，再写回 `currentConversation.currentNote`，最后调度 preview refresh
- `refreshActiveFocusContextPreview()` 只转发显式的 activation/editor-change 刷新请求，不重新持有 preview 计算逻辑
- `scheduleFocusContextPreviewRefresh()` 继续复用 `FocusContextRuntimeService` 的 debounce/timeout 语义，避免 bridge 各自复制调度入口

## 与其他模块的交互

- **FocusContextHostAdapter**：提供当前会话 note path 的真实写回入口，并把 coordinator 接到更外层的 composer context bundle
- **ComposerContextEventBridge**：把 workspace / document / editor 事件中的 preview refresh 与 file-open writeback 委托给本 coordinator
- **ComposerContextViewFacade**：把显式的 preview refresh 入口继续暴露给 `OpenCodianView`
- **ContextPickerInteractionBridge**：复用同一条 delayed preview refresh 入口，保持 picker close 后的刷新语义
- **FocusContextRuntimeService**：继续持有 preview 计算与 debounce 调度，并经由 `FocusContextMarkdownViewLocator` 解析活动 MarkdownView；retained-selection polling/highlight runtime 已委托给 `RetainedSelectionRuntimeCoordinator`

## 注意事项

- coordinator 只收束 activation/open 相邻的 writeback，不接管 composer focus、polling 或 retained-selection highlight
- file-open 的 current-note 写回顺序保持和原实现一致，避免改变 current note fallback 语义
