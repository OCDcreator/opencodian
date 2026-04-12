# FocusContextViewHostAdapter

> **源码**: `src/features/chat/services/FocusContextViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`FocusContextViewHostAdapter` 把 current-conversation note path / composer-focus gate 这条 focus-preview seam 从更宽的 composer context host 里拆出来，并继续复用 `ComposerContextRuntimeStore` 上的 active-tab preview state。这样 `FocusContextRuntimeService` 与 `FocusContextPreviewCoordinator` 共用同一份 focus-preview runtime/writeback host，而 `ComposerContextViewHostAdapter` 重新收窄回 composer action/picker/chip/coordinator 的 store 适配层。

## 导入关系

上游: `ComposerContextRuntimeStore`、`FocusContextRuntimeService`、`FocusContextPreviewCoordinator`
下游: `ComposerContextHostAdapter`

## 公开接口

```typescript
class FocusContextViewHostAdapter {
  createFocusContextRuntimeServiceHost(
    options: FocusContextRuntimeHostOptions,
  ): FocusContextRuntimeServiceHost
  createFocusContextPreviewCoordinatorHost(
    options: FocusContextPreviewCoordinatorHostOptions,
  ): FocusContextPreviewCoordinatorHost
}
```

## 核心逻辑

### focus host 组装

- `createFocusContextRuntimeServiceHost()` 复用 `ComposerContextRuntimeStore` 的 active-tab preview 读写，同时继续让 view 提供 current-note path 与 composer-focus gate
- `createFocusContextPreviewCoordinatorHost()` 只暴露 file-open note path 写回所需的窄 host，不把 runtime store 细节泄漏给 coordinator
- 这样 focus-preview activation / current-note writeback 的 host 组装可以和 composer context action/picker host 分开演进

## 注意事项

- adapter 只负责 focus-preview 相关 host 形状，不负责 editor runtime、workspace 事件桥接或 retained-selection 算法
- active-tab preview state 仍写回 `ComposerContextRuntimeStore`，因此多 tab 语义保持不变
