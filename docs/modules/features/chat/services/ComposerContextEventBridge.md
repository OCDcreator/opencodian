# ComposerContextEventBridge

> **源码**: `src/features/chat/services/ComposerContextEventBridge.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextEventBridge` 现在只承担 **composer-context 事件桥的组合入口**。它不再自己直接注册 workspace、vault 和 DOM 事件，而是把启动/清理顺序委托给两个更窄的 bridge：

- `FocusContextEventBridge`：负责 focus-preview activation、composer/document DOM 事件与 retained-selection polling 生命周期
- `ContextFileCatalogEventBridge`：负责 vault `create/delete/rename` 到 catalog 增量维护的桥接

这样 `OpenCodianView` 仍只面对一个 `start()/dispose()` 入口，但 `ComposerContextEventBridge` 本身退回到组合层，不再同时持有 focus-preview 与 catalog 两类职责。

## 导入关系

上游: `FocusContextEventBridge`、`ContextFileCatalogEventBridge`
下游: `OpenCodianView`

## 公开接口

```typescript
class ComposerContextEventBridge {
  start(): void
  dispose(): void
}
```

## 核心逻辑

### 组合启动顺序

- `start()` 先启动 `FocusContextEventBridge`，再启动 `ContextFileCatalogEventBridge`
- `dispose()` 先清理 catalog bridge，再清理 focus bridge
- 组合层不再知道任何 Obsidian 事件名，只保证两个子 bridge 作为同一份 composer-context lifecycle 被一起装配

### 单一入口保留

- `OpenCodianView` 与 `createComposerContextServices()` 仍然只暴露一份 `eventBridge`
- 这保证 view 侧的装配面不变，同时把更细的责任边界下沉到 services 目录

## 与其他模块的交互

- **FocusContextEventBridge**：承接 focus-preview activation、DOM focus handoff 与 retained-selection polling
- **ContextFileCatalogEventBridge**：承接 vault catalog mutation 桥接
- **OpenCodianView**：继续只持有单一的 composer-context lifecycle 入口

## 注意事项

- 这个组合层不应重新长回具体事件注册逻辑；新事件优先落到对应的子 bridge
- 组合层继续不持有 draft context、preview state 或附件构建逻辑
- 若将来再拆更细的事件桥，优先保持 `OpenCodianView` 的单一 `eventBridge` 入口不变
