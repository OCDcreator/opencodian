# ComposerContextActionService

> **源码**: `src/features/chat/services/ComposerContextActionService.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextActionService` 把 `OpenCodianView` 里 current-note / selection 两个依赖活动编辑器的 composer context 入口动作收束到单一职责 service。它统一负责活动编辑器回退，以及附件构建成功后的 draft 写回，让文件选择器生命周期和 catalog 编排继续留在独立的 picker service 里。

## 导入关系

上游: `obsidian`（Editor、MarkdownView）、`core/types`、`ContextAttachmentBuilder`
下游: `OpenCodianView`、`ComposerContextHostAdapter`

## 公开接口

```typescript
interface ComposerContextActionServiceHost {
  getActiveMarkdownView(): MarkdownView | null
  addDraftContextItem(item: PromptContextItem): void
}

class ComposerContextActionService {
  addCurrentNoteContextFromActiveEditor(view?: MarkdownView | null): Promise<boolean>
  addSelectionContextFromActiveEditor(
    editor?: Editor | null,
    view?: MarkdownView | null,
  ): Promise<boolean>
}
```

## 核心逻辑

### current-note / selection 入口

- `addCurrentNoteContextFromActiveEditor()` 统一回退到 host 提供的活动 `MarkdownView`
- `addSelectionContextFromActiveEditor()` 统一处理 `editor` 参数缺失时的 `activeView.editor` 回退
- 两个入口都只在 `ContextAttachmentBuilder` 成功生成 `PromptContextItem` 后才写回 draft

## 与其他模块的交互

- **OpenCodianView**：提供活动 `MarkdownView` / draft 写回 host，并把 current-note / selection 入口委托给这里
- **ContextAttachmentBuilder**：负责真正构建 current-note / selection 两类 `PromptContextItem`
- **ComposerContextPickerActionService**：承接文件选择器打开/关闭、catalog 加载和 file 附件写回

## 注意事项

- service 不持有 tab runtime；draft item 去重和 active-tab state 仍由 `OpenCodianView` 统一掌控
- 保持 current-note / selection 上下文附件内容和返回布尔值语义不变，避免影响现有命令与按钮行为
