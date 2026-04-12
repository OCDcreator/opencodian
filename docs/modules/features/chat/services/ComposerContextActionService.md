# ComposerContextActionService

> **源码**: `src/features/chat/services/ComposerContextActionService.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextActionService` 把 `OpenCodianView` 里 current-note / selection / file 三个 composer context 入口动作收束到单一职责 service。它统一负责活动编辑器回退、文件选择器 + catalog 加载，以及附件构建成功后的 draft 写回，让 view 只保留按钮装配、active-tab state writeback 和对外命令入口。

## 导入关系

上游: `obsidian`（App、Editor、MarkdownView）、`core/types`、`ContextAttachmentBuilder`、`ContextFileCatalogService`、`ui/ContextFilePickerModal`
下游: `OpenCodianView`

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
  addChosenFileContextToActiveTab(): Promise<boolean>
}
```

## 核心逻辑

### current-note / selection 入口

- `addCurrentNoteContextFromActiveEditor()` 统一回退到 host 提供的活动 `MarkdownView`
- `addSelectionContextFromActiveEditor()` 统一处理 `editor` 参数缺失时的 `activeView.editor` 回退
- 两个入口都只在 `ContextAttachmentBuilder` 成功生成 `PromptContextItem` 后才写回 draft

### file picker 编排

- `addChosenFileContextToActiveTab()` 统一调用 `chooseContextFile()`，并把 `ContextFileCatalogService.getCatalog()` 作为懒加载 catalog provider 传进去
- picker 取消时直接返回 `false`，不触发额外附件构建或 draft 变更
- 选中文件后继续复用 `ContextAttachmentBuilder.buildFileContextItem()`，避免 view 重新拼装附件

## 与其他模块的交互

- **OpenCodianView**：提供活动 `MarkdownView` / draft 写回 host，并把按钮 click 与命令入口委托给这里
- **ContextAttachmentBuilder**：负责真正构建 current-note / selection / file 三类 `PromptContextItem`
- **ContextFileCatalogService**：提供文件选择器所需的缓存 catalog
- **ContextFilePickerModal**：负责 UI 层的文件选择交互

## 注意事项

- service 不持有 tab runtime；draft item 去重和 active-tab state 仍由 `OpenCodianView` 统一掌控
- 保持既有 notice、picker、上下文附件内容和返回布尔值语义不变，避免影响现有命令与按钮行为
