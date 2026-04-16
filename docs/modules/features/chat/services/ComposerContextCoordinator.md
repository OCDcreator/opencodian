# ComposerContextCoordinator

> **源码**: `src/features/chat/services/ComposerContextCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextCoordinator` 现在只负责 composer context chip 的 DOM 渲染与 click 委托。它消费 runtime store 已经整理好的 chip state，维护当前 row element，并把 attach/detach 交互转交给独立的 `ComposerContextChipActionService`，避免继续把 runtime 投影细节和 DOM 组装混在一个模块里。

## 导入关系

上游: `core/types`、`composerContext`、`ComposerContextChipActionService`
下游: `OpenCodianView`

## 公开接口

```typescript
interface ComposerContextCoordinatorHost {
  getContextChipStates(): ComposerContextChipState[]
}

class ComposerContextCoordinator {
  setContextRowElement(contextRowEl: HTMLElement | null): void
  render(): void
}
```

## 核心逻辑

### chip 渲染

- `render()` 只消费 host 暴露的 chip-state snapshot，统一渲染 attached / preview / selection 三种 chip 表现
- coordinator 自己维护当前的 context row DOM 引用，因此 `OpenCodianView` 只需要在 composer 重建或清理时交出/收回容器

### click 委托

- chip click 不再直接触发 preview attach / detach 写回，而是统一委托给 `ComposerContextChipActionService.handleChipClick()`
- 这样 coordinator 保持为纯 UI host，attach/detach 与 stale-preview 修正逻辑转移到专用 action service

## 与其他模块的交互

- **OpenCodianView**：通过 shared runtime seam 驱动 composer row 容器的 attach / detach，不再让 coordinator 直接读取 raw draft / preview state
- **ComposerContextChipActionService**：接管 chip click 后的 attach / detach、副作用和 preview 修正
- **ComposerContextRuntimeStore**：负责把 active-tab draft / preview runtime 状态投影成可渲染的 chip state snapshot

## 注意事项

- coordinator 只处理 active composer row；多 tab 的 draft data、focus preview 与 chip-state 投影仍然由 runtime seam 持有
- 保持既有 chip class、`aria-pressed` 和 render 顺序不变，避免影响现有样式或点击语义
