# FocusContextHostAdapter

> **源码**: `src/features/chat/services/FocusContextHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`FocusContextHostAdapter` 把 focus-preview 相关的 bundle 装配从 `ComposerContextHostAdapter` 中拆出来，单独负责组装：

- `FocusContextRuntimeService`
- `FocusContextPreviewCoordinator`
- `ContextPickerInteractionBridge`

这样 composer host adapter 只保留更外层的 composer/context 总装配，而 current-note fallback、file-open writeback 与 context picker 的 retained-selection handoff 则收束到更窄的 focus 子装配模块。

## 导入关系

上游: `ComposerContextRuntimeStore`、`FocusContextViewHostAdapter`
下游: `ComposerContextHostAdapter`

## 公开接口

```typescript
interface FocusContextRuntimeViewHost {
  getCurrentConversationNotePath(): string | null
  isComposerInteractionFocused(): boolean
}

interface FocusContextPreviewWritebackHost {
  setCurrentConversationNotePath(path: string | null): void
}

function createFocusContextServices(
  dependencies: FocusContextHostAdapterDependencies,
): FocusContextServices
```

## 核心逻辑

- 复用 `FocusContextViewHostAdapter`，把 runtime store 的 active-tab preview state 接到 `FocusContextRuntimeService`
- 通过 `FocusContextPreviewWritebackHost` 继续保留 file-open 时的 current-note 写回语义
- 在同一处创建 `ContextPickerInteractionBridge`，确保 picker begin/complete lifecycle 始终绑定同一组 focus runtime / preview service

## 注意事项

- 这个模块只负责 focus 子图装配，不负责 `PromptContextItem` 构建、workspace 事件注册或 composer context DOM render
- `ComposerContextHostAdapter` 仍然是 view-facing 总装配入口；若后续要调整 focus 相关 host seam，优先先落在这里而不是再回到更外层 composer bundle
