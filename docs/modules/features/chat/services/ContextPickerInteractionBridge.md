# ContextPickerInteractionBridge

> **源码**: `src/features/chat/services/ContextPickerInteractionBridge.ts`
> **状态**: [REVIEW]

## 概述

`ContextPickerInteractionBridge` 只负责把 context file picker 的 open / close 生命周期桥接到 focus-preview runtime。它把 picker begin 时的 retained-selection handoff 与 picker complete 后的 preview refresh 调度从 `ComposerContextHostAdapter` 的 bundle 装配里拆出来，让 host adapter 不再直接内联这两段 focus runtime wiring。

## 导入关系

上游: `FocusContextRuntimeService`、`FocusContextPreviewCoordinator`
下游: `ComposerContextHostAdapter`

## 公开接口

```typescript
class ContextPickerInteractionBridge {
  beginContextPickerInteraction(): void
  completeContextPickerInteraction(): void
}
```

## 核心逻辑

### picker lifecycle bridge

- `beginContextPickerInteraction()` 调用 `FocusContextRuntimeService.handleComposerPointerDown()`，保留打开 picker 前的 editor selection handoff 行为
- `completeContextPickerInteraction()` 调用 `FocusContextPreviewCoordinator.scheduleFocusContextPreviewRefresh()`，保留 picker 关闭后的 delayed preview refresh 行为
- bridge 只暴露 picker host 需要的两个 lifecycle callback，不持有 catalog、draft context item 或 current-note writeback 逻辑

## 注意事项

- 不改变 `ComposerContextPickerActionService` 的 `try/finally` 语义；picker cancel、构建失败和成功添加 context item 后都会触发 complete callback
- 不把 current-conversation note path 写回混入这里；file-open writeback 仍属于 `FocusContextPreviewCoordinator`
