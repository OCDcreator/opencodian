# RetainedSelectionHighlightService

> **源码**: `src/features/chat/services/RetainedSelectionHighlightService.ts`
> **状态**: [REVIEW]

## 概述

`RetainedSelectionHighlightService` 持有 retained-selection handoff grace、capture-quality 比较，以及 CodeMirror / DOM highlight 的显示与清理。它现在由 `RetainedSelectionRuntimeCoordinator` 持有，让 polling / composer handoff 与 highlight writeback 集中在 retained-selection runtime 边界内。

## 导入关系

上游: `obsidian`（`MarkdownView`）、`shared/logger`、`utils/editorSelectionHighlight`、`composerContext`
下游: `RetainedSelectionRuntimeCoordinator`

## 公开接口

```typescript
interface RetainedSelectionHighlightServiceHost {
  getFocusContextPreview(): FocusContextPreview | null
  isComposerInteractionFocused(): boolean
}

class RetainedSelectionHighlightService {
  markInputHandoff(): void
  clearInputHandoff(): void
  shouldRetainPreviewDuringTransition(): boolean
  refreshHighlight(): void
  syncFromPreview(actualPreview: FocusContextPreview | null, view?: MarkdownView | null, editor?: Editor | null): void
  dispose(): void
}
```

## 核心逻辑

### handoff grace

- 在 composer pointerdown 时记录短暂 grace window，让 selection preview 能跨越编辑器到输入框的焦点切换
- `RetainedSelectionRuntimeCoordinator` 通过 `shouldRetainPreviewDuringTransition()` 继续复用同一条 preview-retain 判定

### retained capture 质量

- 同时尝试读取 CodeMirror offsets 与 DOM `Range[]`
- 若 composer 仍聚焦且路径相同，优先保留质量更高的既有 capture，避免较弱的 DOM-only capture 覆盖 offsets capture

### highlight 渲染

- 有 offsets 时优先调用 `editorSelectionHighlight` 渲染 CodeMirror 高亮
- 没有 offsets 时退回 CSS Highlight API 的 DOM range 高亮
- 焦点离开或 preview/path 不再匹配时，统一负责清理 CodeMirror 与 DOM highlight

## 与其他模块的交互

- **RetainedSelectionRuntimeCoordinator**：决定何时同步 retained-selection highlight，并把实际 preview 结果传给本 service
- **composerContext**：提供 `FocusContextPreview` 结构，供路径和 selection 类型判定使用
- **editorSelectionHighlight**：执行 CodeMirror 装饰高亮的具体读写

## 注意事项

- 不改变 selection preview 的保留规则，只搬迁 retained-selection runtime 实现边界
- `dispose()` 必须在 view 关闭时调用，确保 input handoff 状态和残留 highlight 都被清理
