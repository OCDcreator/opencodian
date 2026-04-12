# ComposerContextViewHostAdapter

> **源码**: `src/features/chat/services/ComposerContextViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextViewHostAdapter` 现在只负责把 `ComposerContextRuntimeStore` 暴露成各个 composer service 所需的 host 形状。它统一给 `ComposerContextActionService`、`ComposerContextPickerActionService`、`ComposerContextChipActionService` 和 `ComposerContextCoordinator` 提供同一份 runtime-store seam，让 adapter 收窄为 composer runtime-store → service-host 适配层；current-note path / focus-preview activation 相关的 host 组装则进一步交给 `FocusContextViewHostAdapter`。

## 导入关系

上游: `ComposerContextRuntimeStore`、`ComposerContextActionService`、`ComposerContextPickerActionService`、`ComposerContextChipActionService`、`ComposerContextCoordinator`
下游: `ComposerContextHostAdapter`

## 公开接口

```typescript
class ComposerContextViewHostAdapter {
  createCoordinatorHost(): ComposerContextCoordinatorHost
  createChipActionServiceHost(
    options: ComposerContextChipActionHostOptions,
  ): ComposerContextChipActionServiceHost
  createActionServiceHost(options: ComposerContextActionHostOptions): ComposerContextActionServiceHost
  createPickerActionServiceHost(
    options: ComposerContextPickerActionHostOptions,
  ): ComposerContextPickerActionServiceHost
}
```

## 核心逻辑

### host 组装

- `createCoordinatorHost()` 只暴露 render 所需的只读 draft / preview seam
- `createChipActionServiceHost()` 把 attach/detach、副作用写回与 stale-preview refresh handoff 对接到 shared runtime store
- `createActionServiceHost()` 让 current-note / selection 两条活动编辑器入口动作复用同一份 draft-item write port
- `createPickerActionServiceHost()` 让 file picker 入口复用同一份 draft-item write port，并接收 `ContextPickerInteractionBridge` 暴露的 open/close 生命周期 callback
- send 前的 context-draft 读取 / 清空改由 `OpenCodianView` 直接复用 `ComposerContextRuntimeStore`，不再通过 adapter 转发

## 注意事项

- adapter 只处理 composer runtime-store host 形状组装，不负责 view host 收束、`TabRuntimeState` 的实际写回、editor runtime、vault catalog、事件桥接或 context item 构建
- focus-preview runtime / current-note writeback host 已迁到 `FocusContextViewHostAdapter`，picker lifecycle wiring 已迁到 `ContextPickerInteractionBridge`，避免再次把 composer action host 与 focus host 混回同一处
- preview / draft 的 active-tab rerender gate、equality guard 与数组防御性复制现在由 `ComposerContextRuntimeStore` 集中维护
