# FocusContextRuntimeService

> **源码**: `src/features/chat/services/FocusContextRuntimeService.ts`
> **状态**: [REVIEW]

## 概述

`FocusContextRuntimeService` 把 `OpenCodianView` 里的 focus context preview、活动 MarkdownView 回退查找，以及 retained-selection handoff/highlight/polling 运行态收束到一个单一职责 service。workspace / vault / composer 事件注册现在进一步由 `ComposerContextEventBridge` 接管，而 active-tab preview state host 则由 `ComposerContextViewHostAdapter` 提供，因此这个 service 更集中于 editor-runtime 自身的 preview 与 highlight 协调。

## 导入关系

上游: `obsidian`（`MarkdownView`）、`shared/logger`、`utils/editorSelectionHighlight`、`composerContext`
下游: `OpenCodianView`

## 公开接口

```typescript
interface FocusContextRuntimeServiceHost {
  getCurrentConversationNotePath(): string | null
  getFocusContextPreview(): FocusContextPreview | null
  setFocusContextPreview(preview: FocusContextPreview | null): void
  isComposerInteractionFocused(): boolean
}

class FocusContextRuntimeService {
  rememberMarkdownFilePath(path: string | null): void
  getActiveMarkdownView(): MarkdownView | null
  refreshActiveFocusContextPreview(view?: MarkdownView | null, editor?: Editor | null): void
  scheduleFocusContextPreviewRefresh(): void
  startRetainedSelectionPolling(): void
  handleComposerPointerDown(): void
  handleComposerFocusIn(): void
  handleComposerFocusOut(): void
  dispose(): void
}
```

## 核心逻辑

### 活动笔记回退解析

- 优先读取 `workspace.getActiveViewOfType(MarkdownView)`
- active view 不可用时，会按 `lastKnownMarkdownFilePath -> currentConversation.currentNote -> 任意 markdown leaf` 的顺序回退
- 一旦命中有效 `MarkdownView.file`，就更新 remembered path，供后续 preview/pointer handoff 复用

### focus preview 维护

- `refreshActiveFocusContextPreview()` 会从当前 editor 读取选中文本和行号，生成 `selection` 或 `current_note` preview
- preview 保留策略继续复用 `composerContext.resolveFocusContextPreview()`：只有 composer focus / handoff grace 期间，才允许把旧的 selection preview 保留下来
- 实际 preview state 仍写回 `OpenCodianView` 的 active-tab runtime，因此多 tab 语义没有改变

### retained selection 协调

- service 同时捕获 CodeMirror offsets 和 DOM `Range[]`，优先保留质量更高的 capture
- composer focus 内优先显示 CodeMirror 装饰高亮；拿不到 offsets 时，再退回 CSS Highlight API 的 DOM range 高亮
- polling、pointer handoff grace、focusin/focusout follow-up 和 cleanup 都集中在这个 service，不再散落在 view 内

## 与其他模块的交互

- **OpenCodianView**：提供当前会话 note path 与 composer focus gate
- **ComposerContextViewHostAdapter**：提供 active-tab focus preview 的读写 host，并把 runtime state 写回限制在活动 tab seam 内
- **ComposerContextEventBridge**：桥接 workspace / vault / composer DOM 事件，并统一启动 polling 与关闭时的 `dispose()`
- **composerContext**：提供 preview 结构和 selection-preview retain 规则
- **editorSelectionHighlight**：负责真正把 retained selection 渲染成 CodeMirror 装饰
- **ComposerContextCoordinator**：继续消费这里写回的 preview state，负责 chips 渲染与 preview attach/detach click 编排
- **ContextAttachmentBuilder**：通过 `ComposerContextCoordinator` 消费最终的 `FocusContextPreview`，把 preview attach 成 `PromptContextItem`

## 注意事项

- 不改变既有 focus preview 文案、selection line-range 语义或 retained highlight 的显示策略
- `dispose()` 现在经由 `ComposerContextEventBridge` 在 view `onClose()` 时调用，避免轮询、timeout 和残留高亮泄漏
- service 只管理 editor/runtime 侧的 focus context；附件构建留在 `ContextAttachmentBuilder`，chips 编排留在 `ComposerContextCoordinator`，active-tab preview state 写回则经由 `ComposerContextViewHostAdapter`
