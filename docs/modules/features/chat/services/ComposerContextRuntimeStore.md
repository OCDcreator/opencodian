# ComposerContextRuntimeStore

> **源码**: `src/features/chat/services/ComposerContextRuntimeStore.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextRuntimeStore` 把 active-tab `draftContextItems` / `focusContextPreview` 的读写、相等性判断，以及 active-tab rerender gate 从 `ComposerContextViewHostAdapter` 中拆出，形成独立的 composer/context runtime state store。这样 `OpenCodianView` 与各个 composer service 可以共享同一份状态边界，而 host adapter 只保留 host 组装职责。

## 导入关系

上游: `core/types`、`tabs`、`composerContext`
下游: `ComposerContextViewHostAdapter`、`OpenCodianView`

## 公开接口

```typescript
interface ComposerContextRuntimeState {
  focusContextPreview: FocusContextPreview | null
  draftContextItems: PromptContextItem[]
}

interface ComposerContextRuntimeStoreHost {
  getActiveTabId(): TabId | null
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null
  renderComposerContext(): void
}

class ComposerContextRuntimeStore {
  getDraftContextItems(tabId?: TabId | null): PromptContextItem[]
  clearDraftContextItems(tabId?: TabId | null): void
  addDraftContextItem(item: PromptContextItem, tabId?: TabId | null): void
  removeDraftContextItemsForTarget(
    target: Pick<PromptContextItem, 'path' | 'lineRange'>,
    tabId?: TabId | null,
  ): void
  getFocusContextPreview(tabId?: TabId | null): FocusContextPreview | null
  setFocusContextPreview(preview: FocusContextPreview | null, tabId?: TabId | null): void
}
```

## 核心逻辑

- `getDraftContextItems()` 始终返回副本，避免调用方直接持有 runtime 数组引用
- draft add/remove/clear 共用同一条 `setDraftContextItems()` 写回路径，只在活动 tab 写回时触发 `renderComposerContext()`
- `setFocusContextPreview()` 保留 preview equality guard，避免等值 preview 引发冗余重绘
- `OpenCodianView` 的 send 前 context-draft 读取/清空与 composer runtime host 现在共享同一份 store，而不是各自走 adapter 内部 helper

## 注意事项

- store 只负责 `TabRuntimeState` 上 composer/context 相关字段的读写，不负责 context item 构建、editor runtime 或 preview refresh
- `focusContextPreview` / `draftContextItems` 的字段位置与多 tab 语义保持不变
