# ContextAttachmentBuilder

> **源码**: `src/features/chat/services/ContextAttachmentBuilder.ts`
> **状态**: [REVIEW]

## 概述

`ContextAttachmentBuilder` 负责把 composer 的 current-note / selection / file 三类输入统一收束成 `PromptContextItem`。它把 `ComposerContextActionService` / `ComposerContextCoordinator` 需要的上下文附件构建、remote 模式下的文本快照读取与 `64 KiB` 限制校验，集中到一个单一职责 service，让 view 只保留 host 装配、tab state 写回和 vault 事件转发。

## 导入关系

上游: `obsidian`（App、Editor、MarkdownView、TFile、Notice）、`core/types`、`core/types/settings`、`i18n`、`shared/obsidianContext`、`composerContext`
下游: `ComposerContextActionService`、`ComposerContextCoordinator`、`OpenCodianView`

## 公开接口

```typescript
const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;

interface ContextAttachmentBuilderOptions {
  getServerMode(): ServerMode;
}

class ContextAttachmentBuilder {
  buildCurrentNoteContextItem(view: MarkdownView | null): Promise<PromptContextItem | null>
  buildSelectionContextItem(
    editor: Editor | null,
    view: MarkdownView | null,
  ): Promise<PromptContextItem | null>
  buildSelectionContextItemFromPreview(preview: FocusContextPreview): PromptContextItem | null
  buildFileContextItem(file: TFile, kind: 'current_note' | 'file'): Promise<PromptContextItem | null>
  buildFileContextItemFromPath(
    path: string,
    kind: 'current_note' | 'file',
  ): Promise<PromptContextItem | null>
  hasFileAtPath(path: string): boolean
}
```

## 核心逻辑

### 三类附件入口

- `buildCurrentNoteContextItem()`：读取 `MarkdownView.file`，生成 current-note 附件
- `buildSelectionContextItem()`：读取 editor selection 与行号，生成 selection 附件
- `buildSelectionContextItemFromPreview()`：把 retained focus preview 重新装配成 selection 附件

### remote 文本快照校验

- `buildFileContextItem()` 在 remote 模式下只允许 text-like MIME；二进制文件直接提示 `binaryUnsupportedRemote`
- text-like 文件会通过 `vault.read()` 读取完整文本，并走统一的 `validateRemoteContextText()` 字节数检查
- `selection` 附件同样复用这套 remote 字节数检查；超限时沿用 `chat.context.notice.tooLarge`

### 文件路径解析

- `buildFileContextItemFromPath()` 与 `hasFileAtPath()` 统一处理 `vault.getAbstractFileByPath()` + `TFile` 判定
- `OpenCodianView` 因此不再自己解析当前预览 path 或重复持有 `PromptContextItem` 组装细节

## 与其他模块的交互

- **ComposerContextActionService**：把 current-note / selection / file 入口动作统一委托给这里
- **ComposerContextCoordinator**：复用 preview attach 入口，把 current-note / selection focus preview 转成最终附件
- **OpenCodianView**：注入当前 server mode getter，并通过 action / coordinator 两条子链路间接消费附件构建
- **shared/obsidianContext**：复用 MIME 推导、label 格式化与 text-like 判定
- **composerContext**：复用 `FocusContextPreview` 类型，承接 retained selection preview → attachment 的桥接

## 注意事项

- 保持原有 notice 文案和触发条件，不改动 UI 提示语义
- selection 附件继续使用即时文本快照；current-note / file 只在 remote 模式下保存 `textSnapshot`
- `id` 仍使用原先的 `context-${Date.now()}-...` 生成策略，避免改变附件去重/保存行为
