# ComposerContextHostAdapter

> **源码**: `src/features/chat/services/ComposerContextHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextHostAdapter` 负责把 `OpenCodianView` 提供的最小 host seam 组装成 composer context 运行时 bundle。它集中创建：

- `ComposerContextRuntimeStore`
- `ComposerContextActionService`
- `ComposerContextPickerActionService`
- `ComposerContextChipActionService`
- `ComposerContextCoordinator`
- `FocusContextRuntimeService`
- `FocusContextPreviewCoordinator`
- `ComposerContextEventBridge`

这样 `OpenCodianView` 不再自己逐项 new 出 retained-selection / context picker 相关 service，也不再直接拼多份 host 闭包；view 只保留一份较窄的 `ComposerContextViewHost`。

## 导入关系

上游: `OpenCodianView`
下游: `ComposerContextRuntimeStore`、`ComposerContextViewHostAdapter`、`ComposerContextActionService`、`ComposerContextPickerActionService`、`ComposerContextChipActionService`、`ComposerContextCoordinator`、`FocusContextRuntimeService`、`FocusContextPreviewCoordinator`、`ComposerContextEventBridge`

## 公开接口

```typescript
interface ComposerContextViewHost {
  getActiveTabId(): TabId | null
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null
  getCurrentConversationNotePath(): string | null
  setCurrentConversationNotePath(path: string | null): void
  getActiveMarkdownView(): MarkdownView | null
  isComposerInteractionFocused(): boolean
  getInputContainer(): HTMLElement | null
  registerEvent(eventRef: EventRef): void
  registerDomEvent(...): void
}

function createComposerContextServices(
  dependencies: ComposerContextServiceDependencies,
): ComposerContextServices
```

## 核心逻辑

### bundle 装配

- 先创建 `ComposerContextRuntimeStore`，把 active-tab `draftContextItems` / `focusContextPreview` 写回集中到同一份 runtime seam
- 再复用 `ComposerContextViewHostAdapter` 暴露给 action/picker/chip/coordinator/focus-runtime 五条路径所需的细粒度 host
- `FocusContextPreviewCoordinator` 仍只负责 file-open note path 写回与 refresh 调度，但现在也通过 picker host 接手 picker close 后的 preview writeback
- `ComposerContextPickerActionService` 通过 host 把 picker open → retained-selection handoff、picker close → preview refresh 统一挂到同一份 bundle 装配里
- `ComposerContextEventBridge` 继续承接 workspace / vault / DOM 事件桥接与 retained-selection polling 启动，只是注册/DOM seam 不再由 view 逐项散落提供

## 注意事项

- 这个模块只负责 composer context bundle 的 host 装配，不负责 `PromptContextItem` 构建、Vault catalog 维护或 retained-selection 具体算法
- `ComposerContextViewHostAdapter` 仍然是 runtime-store → service-host 的窄适配层；这里负责的是更上层的 view → service-bundle 装配
