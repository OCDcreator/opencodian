# InlineEditEditorView

> **源码**: `src/features/inline-edit/InlineEditEditorView.ts`
> **状态**: [REVIEW]

## 概述

Obsidian `Editor` → CM6 `EditorView` 的解析，原在 `InlineEditController` 内，因控制器行数上限抽出（A3）。`editor.cm` 是 Obsidian 自 1.0 起事实稳定的内部字段（Claudian、obsidian-copilot 同款用法）；取不到时返回 `null`，由调用方停用功能并提示，不做任何兜底猜测（docs/requirements/inline-edit.md §7.4）。

## 公开接口

```typescript
getEditorView(editor: Editor): EditorView | null
```

## 依赖

- 仅 `@codemirror/view` / `obsidian` 类型

## 维护约束

- Obsidian 升级后在手动验收清单回归本路径（`editor.cm` 内部 API 无文档保证）。
