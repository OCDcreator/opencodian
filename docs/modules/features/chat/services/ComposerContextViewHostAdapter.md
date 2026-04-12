# ComposerContextViewHostAdapter

> **源码**: `src/features/chat/services/ComposerContextViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextViewHostAdapter` 把 `OpenCodianView` 里 active-tab `draftContextItems` / `focusContextPreview` 的读写入口收束到一个更窄的 host adapter。它统一给 `ComposerContextActionService`、`ComposerContextChipActionService`、`ComposerContextCoordinator`、`FocusContextRuntimeService`，以及发送前的 context-draft 读取/清空路径提供同一份 tab-state seam，让 view 不再直接维护这一组 getter/setter。

## 导入关系

上游: `core/types`、`tabs`、`composerContext`、`ComposerContextActionService`、`ComposerContextChipActionService`、`ComposerContextCoordinator`、`FocusContextRuntimeService`
下游: `OpenCodianView`

## 公开接口

```typescript
interface ComposerContextRuntimeState {
  focusContextPreview: FocusContextPreview | null
  draftContextItems: PromptContextItem[]
}

interface ComposerContextViewHostAdapterViewHost {
  getActiveTabId(): TabId | null
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null
  renderComposerContext(): void
}

class ComposerContextViewHostAdapter {
  getDraftContextItems(tabId?: TabId | null): PromptContextItem[]
  clearDraftContextItems(tabId?: TabId | null): void
  createCoordinatorHost(): ComposerContextCoordinatorHost
  createChipActionServiceHost(
    options: ComposerContextChipActionHostOptions,
  ): ComposerContextChipActionServiceHost
  createActionServiceHost(options: ComposerContextActionHostOptions): ComposerContextActionServiceHost
  createFocusContextRuntimeServiceHost(
    options: ComposerContextFocusRuntimeHostOptions,
  ): FocusContextRuntimeServiceHost
}
```

## 核心逻辑

### active-tab context state 读写

- `getDraftContextItems()` 始终返回副本，避免上游 service 直接持有 runtime 数组引用
- draft item 的 add/remove/clear 会统一写回 `TabRuntimeState.draftContextItems`
- 只有写入活动 tab 时才触发 `renderComposerContext()`，保持既有 chip 重绘范围不变
- focus preview 写回继续保留 equality guard，避免等值 preview 造成冗余重绘

### host 组装

- `createCoordinatorHost()` 只暴露 render 所需的只读 draft / preview seam
- `createChipActionServiceHost()` 把 attach/detach、副作用写回和 stale-preview refresh handoff 收束到专用 host
- `createActionServiceHost()` 让 current-note / selection / file 三条入口动作复用同一份 draft-item 写回
- `createFocusContextRuntimeServiceHost()` 让 focus runtime 与 chips 共享同一份 preview state，同时仍由 view 提供 current-note path 与 composer-focus gate

### send 前复用

- `OpenCodianView` 还会直接复用 `getDraftContextItems()` / `clearDraftContextItems()` 交给 `MessageSendPreparationService`
- 因此 optimistic send 前读取 context attachments，以及 stream 启动后清空 draft chips，都会落在和 action/chip-action/runtime 相同的 state 边界上

## 注意事项

- adapter 只处理 active-tab composer/context state host，不负责 editor runtime、vault catalog、事件桥接或 context item 构建
- `TabRuntimeState` 上的 `focusContextPreview` / `draftContextItems` 字段本身没有改名或迁位，保持现有多 tab 语义不变
