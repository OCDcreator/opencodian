# FocusContextMarkdownViewLocator

> **源码**: `src/features/chat/services/FocusContextMarkdownViewLocator.ts`
> **状态**: [REVIEW]

## 概述

`FocusContextMarkdownViewLocator` 从 `FocusContextRuntimeService` 中接管活动 `MarkdownView` 的解析与回退顺序。它只负责记住最近命中的 markdown 路径，并在 active editor 不可用时按既有顺序定位最合适的 leaf，让 runtime service 更专注于 preview 计算与 retained-selection 编排。

## 导入关系

上游: `obsidian`（`App`、`MarkdownView`）
下游: `FocusContextRuntimeService`

## 公开接口

```typescript
interface FocusContextMarkdownViewLocatorHost {
  getCurrentConversationNotePath(): string | null
}

class FocusContextMarkdownViewLocator {
  rememberMarkdownFilePath(path: string | null): void
  getActiveMarkdownView(): MarkdownView | null
}
```

## 核心逻辑

- 优先读取 `workspace.getActiveViewOfType(MarkdownView)`，命中后立即刷新 remembered path
- active view 不可用时，按 `lastKnownMarkdownFilePath -> currentConversation.currentNote -> 任意 markdown leaf` 的顺序回退
- 命中任一带 `file` 的 `MarkdownView` 后，都会刷新 remembered path，供下一次 preview 取样复用

## 与其他模块的交互

- **FocusContextRuntimeService**：通过本 locator 获取活动 `MarkdownView`，并复用同一份 remembered path 状态
- **FocusContextPreviewCoordinator**：经由 runtime service 的 `rememberMarkdownFilePath()` 间接更新 locator 的 remembered path
- **OpenCodianView**：仍只通过 host 暴露当前会话 note path，不直接参与 fallback 解析

## 注意事项

- 不改变既有回退优先级，只把查找责任从 runtime service 中拆出来
- locator 不读取 editor selection，也不接触 focus preview state；这些职责仍留在 `FocusContextRuntimeService`
