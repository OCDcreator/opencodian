# ComposerContextChipActionService

> **源码**: `src/features/chat/services/ComposerContextChipActionService.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextChipActionService` 把 composer context chip 的 attach / detach 行为从 `ComposerContextCoordinator` 中拆出。它专注于处理 chip click、把 preview 转成 `PromptContextItem`、移除已附加项，以及在 preview 失效时触发 refresh，让 chip 交互的副作用不再和 DOM 渲染耦合。

## 导入关系

上游: `core/types`、`composerContext`、`ContextAttachmentBuilder`
下游: `ComposerContextCoordinator`、`OpenCodianView`

## 公开接口

```typescript
interface ComposerContextChipActionServiceHost {
  getFocusContextPreview(): FocusContextPreview | null
  addDraftContextItem(item: PromptContextItem): void
  removeDraftContextItemsForTarget(target: Pick<PromptContextItem, 'path' | 'lineRange'>): void
  refreshActiveFocusContextPreview(): void
}

class ComposerContextChipActionService {
  handleChipClick(chipState: ComposerContextChipState): Promise<void>
}
```

## 核心逻辑

### attach / detach 分流

- 点击 attached chip 时，直接委托 host 移除对应 `PromptContextItem`
- 点击 preview chip 时，会重新读取当前 focus preview；如果 chip 已过期，则只触发 `refreshActiveFocusContextPreview()`，避免 attach 旧 preview

### preview attach

- selection preview 走 `buildSelectionContextItemFromPreview()`
- file preview 走 `buildFileContextItemFromPath(preview.path, 'current_note')`
- 只有在 builder 成功返回 `PromptContextItem` 时才写回 draft context

### 失效 preview 修正

- file preview attach 失败后，如果 path 已经不再对应 vault 文件，就会触发 `refreshActiveFocusContextPreview()`
- 这样 composer row 会尽快回到新的 active note / selection 状态，而不是保留一个失效 preview chip

## 与其他模块的交互

- **ComposerContextCoordinator**：把 chip click 委托给本 service
- **ComposerContextViewHostAdapter**：提供 active-tab focus preview、draft writeback 和 refresh handoff
- **ContextAttachmentBuilder**：负责把 preview 解析成真正可发送的 context item

## 注意事项

- service 只关心 chip 交互副作用，不负责 DOM、事件注册或 context row 生命周期
- 保持既有 stale-preview 守卫与 `current_note` 附件来源不变，避免改变 attach 语义
