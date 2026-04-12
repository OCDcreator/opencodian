# RetainedSelectionRuntimeCoordinator

> **源码**: `src/features/chat/services/RetainedSelectionRuntimeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`RetainedSelectionRuntimeCoordinator` 从 `FocusContextRuntimeService` 中接管 retained-selection 的 polling、composer pointer/focus handoff，以及 highlight service 的生命周期。它不计算 focus preview，也不解析 `MarkdownView` 回退；这些仍由上游 runtime service 提供窄 host seam。

## 导入关系

上游: `obsidian`（`Editor`、`MarkdownView`）、`composerContext`、`RetainedSelectionHighlightService`
下游: `FocusContextRuntimeService`

## 公开接口

```typescript
interface RetainedSelectionRuntimeCoordinatorHost {
  getFocusContextPreview(): FocusContextPreview | null
  isComposerInteractionFocused(): boolean
  getActiveMarkdownView(): MarkdownView | null
  refreshActiveFocusContextPreview(view?: MarkdownView | null, editor?: Editor | null): void
}

class RetainedSelectionRuntimeCoordinator {
  shouldRetainPreviewDuringTransition(): boolean
  syncFromPreview(actualPreview: FocusContextPreview | null, view?: MarkdownView | null, editor?: Editor | null): void
  startPolling(): void
  handleComposerPointerDown(): void
  handleComposerFocusIn(): void
  handleComposerFocusOut(): void
  dispose(): void
}
```

## 核心逻辑

- `startPolling()` 保持既有 `250ms` retained-selection polling：立即取样一次 active editor，然后按 interval 刷新 preview 与 highlight
- `handleComposerPointerDown()` 记录 input handoff grace，并在焦点切换前用 active editor 预热 selection preview
- `handleComposerFocusIn()` / `handleComposerFocusOut()` 继续按原时机刷新 preview 和 highlight，其中 focusout 仍延后到当前事件循环之后执行
- `dispose()` 只清理 polling 与 retained highlight，不清理 focus-preview debounce timeout

## 与其他模块的交互

- **FocusContextRuntimeService**：提供 active markdown view、preview refresh 入口、当前 preview 读取和 composer focus gate
- **RetainedSelectionHighlightService**：持有 handoff grace、capture-quality 与 CodeMirror / DOM highlight writeback
- **composerContext**：提供 `FocusContextPreview` 类型，并由上游 runtime service 继续执行 preview retain 合并规则

## 注意事项

- 本 coordinator 不应直接读取 Obsidian workspace，也不应构建 `PromptContextItem`
- polling、composer focus handoff 与 highlight lifecycle 留在这里；preview 计算、debounce 和 markdown view fallback 继续留在 `FocusContextRuntimeService`
