# ComposerContextCoordinator

> **源码**: `src/features/chat/services/ComposerContextCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextCoordinator` 把 `OpenCodianView` 里的 composer context chip 渲染、attach/detach click 行为，以及 focus preview → context attachment 的编排收束到一个单一职责 service。这样 view 只保留 draft context / focus preview 的 tab-state 写回和 current-note / selection / file 的入口按钮，不再自己持有这段 chips UI 协调逻辑。

## 导入关系

上游: `core/types`、`composerContext`、`ContextAttachmentBuilder`
下游: `OpenCodianView`

## 公开接口

```typescript
interface ComposerContextCoordinatorHost {
  getDraftContextItems(): PromptContextItem[]
  getFocusContextPreview(): FocusContextPreview | null
  addDraftContextItem(item: PromptContextItem): void
  removeDraftContextItemsForTarget(target: Pick<PromptContextItem, 'path' | 'lineRange'>): void
  refreshActiveFocusContextPreview(): void
}

class ComposerContextCoordinator {
  setContextRowElement(contextRowEl: HTMLElement | null): void
  render(): void
}
```

## 核心逻辑

### chip 渲染

- `render()` 复用 `composerContext.buildComposerContextChipStates()`，统一生成 attached / preview / selection 三种 chip 表现
- coordinator 自己维护当前的 context row DOM 引用，因此 `OpenCodianView` 只需要在 composer 重建或清理时交出/收回容器

### attach / detach 编排

- 点击 attached chip 时，直接委托 host 移除对应 `PromptContextItem`
- 点击 preview chip 时，会再次读取当前 focus preview；如果和旧 chip 不一致，则触发一次 preview refresh，而不是把过期 preview attach 进 draft
- selection preview 走 `buildSelectionContextItemFromPreview()`；file preview 走 `buildFileContextItemFromPath()`

### 失效 preview 修正

- file preview attach 失败后，如果 path 已经不再对应 vault 文件，就会触发 `refreshActiveFocusContextPreview()`
- 这样 composer row 可以尽快回到新的 active note / selection 状态，而不是保留一个已经失效的 preview chip

## 与其他模块的交互

- **OpenCodianView**：提供 active-tab draft items / focus preview 的 host callback，并负责 current-note / selection / file 入口按钮
- **composerContext**：提供 chip state 生成和 context target key 判定
- **ContextAttachmentBuilder**：负责把当前 preview 转成真正的 `PromptContextItem`

## 注意事项

- coordinator 只处理 active composer row；多 tab 的 draft data 仍然由 `OpenCodianView` 的 runtime state 持有
- 保持既有 chip class、`aria-pressed` 和 preview-staleness 语义，避免影响现有样式或 attach/detach 行为
