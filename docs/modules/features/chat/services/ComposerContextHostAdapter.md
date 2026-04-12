# ComposerContextHostAdapter

> **源码**: `src/features/chat/services/ComposerContextHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextHostAdapter` 负责把 `OpenCodianView` 提供的最小 host seam 组装成 composer context 运行时 bundle。它集中创建：

- `ComposerContextRuntimeStore`
- `ComposerContextActionService`
- `ComposerContextPickerActionService`
- `ContextPickerInteractionBridge`
- `ComposerContextChipActionService`
- `ComposerContextCoordinator`
- `FocusContextRuntimeService`
- `FocusContextPreviewCoordinator`
- `FocusContextEventBridge`
- `ContextFileCatalogEventBridge`
- `ComposerContextEventBridge`
- `ComposerContextViewFacade`

这样 `OpenCodianView` 不再自己逐项 new 出 retained-selection / context picker 相关 service，也不再直接持有 action / picker / coordinator / event bridge 等多条依赖；view 只保留 `ComposerContextViewHost`、`FocusContextRuntimeViewHost` 与 `FocusContextPreviewWritebackHost` 三条更窄 seam，再通过 `ComposerContextViewFacade` 接入 composer/context runtime。

## 导入关系

上游: `OpenCodianView`
下游: `ComposerContextRuntimeStore`、`ComposerContextViewHostAdapter`、`FocusContextViewHostAdapter`、`ComposerContextActionService`、`ComposerContextPickerActionService`、`ContextPickerInteractionBridge`、`ComposerContextChipActionService`、`ComposerContextCoordinator`、`FocusContextRuntimeService`、`FocusContextPreviewCoordinator`、`FocusContextEventBridge`、`ContextFileCatalogEventBridge`、`ComposerContextEventBridge`

## 公开接口

```typescript
interface ComposerContextViewHost {
  getActiveTabId(): TabId | null
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null
  getActiveMarkdownView(): MarkdownView | null
  getInputContainer(): HTMLElement | null
  registerEvent(eventRef: EventRef): void
  registerDomEvent(...): void
}

interface FocusContextRuntimeViewHost {
  getCurrentConversationNotePath(): string | null
  isComposerInteractionFocused(): boolean
}

interface FocusContextPreviewWritebackHost {
  setCurrentConversationNotePath(path: string | null): void
}

function createComposerContextServices(
  dependencies: ComposerContextServiceDependencies,
): ComposerContextServices

interface ComposerContextServices {
  viewFacade: ComposerContextViewFacade
  focusContextPreviewCoordinator: FocusContextPreviewCoordinator
  focusContextRuntimeService: FocusContextRuntimeService
}
```

## 核心逻辑

### bundle 装配

- 先创建 `ComposerContextRuntimeStore`，把 active-tab `draftContextItems` / `focusContextPreview` 写回集中到同一份 runtime seam
- 再复用 `ComposerContextViewHostAdapter` 暴露 action/picker/chip/coordinator 所需的细粒度 host
- `FocusContextRuntimeService` 通过 `FocusContextRuntimeViewHost` 读取 current-note fallback 与 composer-focus gate
- `FocusContextPreviewCoordinator` 通过 `FocusContextPreviewWritebackHost` 单独写回 file-open note path，并继续负责 activation / editor-change 相邻的 refresh 调度
- `ContextPickerInteractionBridge` 把 picker open → retained-selection handoff、picker close → preview refresh 从 host adapter 内联闭包里拆出，供 `ComposerContextPickerActionService` 的 picker host 复用
- `FocusContextEventBridge` 现在单独承接 workspace / DOM 事件桥接与 retained-selection polling 启动
- `ContextFileCatalogEventBridge` 单独承接 vault catalog mutation 注册
- `ComposerContextEventBridge` 退回为组合层，统一把这两个更窄的 bridge 暴露给 view
- `ComposerContextViewFacade` 最后把 view 真正需要的 draft-context、picker、action、context-row 与 lifecycle 入口收敛成一条更窄的 facade seam

## 注意事项

- 这个模块只负责 composer context bundle 的 host 装配，不负责 `PromptContextItem` 构建、Vault catalog 维护或 retained-selection 具体算法
- `ComposerContextViewHostAdapter` 与 `FocusContextViewHostAdapter` 都只是 runtime-store → service-host 的窄适配层；这里负责的是更上层的 view → service-bundle 装配
- picker lifecycle 只通过 `ContextPickerInteractionBridge` 连接到 focus runtime，避免把 picker interaction gate 与 current-note writeback 再次混到同一个 view host
- `ComposerContextViewFacade` 是 view-facing 收口层；若 `OpenCodianView` 又开始逐项保存内部 service，应优先回到 facade 收束，而不是扩大 view 的 service fan-out
- 新增事件桥时，优先判断它属于 focus-preview/runtime 侧还是 catalog mutation 侧，避免重新把两类事件混回同一个 bridge
