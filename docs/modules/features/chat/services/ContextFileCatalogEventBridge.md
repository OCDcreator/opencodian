# ContextFileCatalogEventBridge

> **源码**: `src/features/chat/services/ContextFileCatalogEventBridge.ts`
> **状态**: [REVIEW]

## 概述

`ContextFileCatalogEventBridge` 负责把 vault 文件系统事件桥接到 `ContextFileCatalogService`。它只处理 catalog 增量维护相关的 `create/delete/rename` 注册，不再混入 focus-preview activation、composer DOM 事件或 retained-selection lifecycle。

## 导入关系

上游: `ComposerContextHostAdapter`、`ComposerContextEventBridge`
下游: `obsidian`（`App`）、`ContextFileCatalogService`

## 公开接口

```typescript
interface ContextFileCatalogEventBridgeHost {
  registerEvent(eventRef: EventRef): void
}

class ContextFileCatalogEventBridge {
  start(): void
  dispose(): void
}
```

## 核心逻辑

### vault mutation 桥接

- 监听 vault `create`，转发给 `ContextFileCatalogService.handleCreate()`
- 监听 vault `delete`，转发给 `ContextFileCatalogService.handleDelete()`
- 监听 vault `rename`，转发给 `ContextFileCatalogService.handleRename()`

### 生命周期边界

- `start()` 只注册 vault 事件
- `dispose()` 当前为 no-op，因为监听释放继续交由 `OpenCodianView.registerEvent()` 的宿主生命周期处理

## 与其他模块的交互

- **ComposerContextHostAdapter**：提供最小 `registerEvent` seam，并把本 bridge 纳入 composer-context bundle
- **ComposerContextEventBridge**：作为组合层统一启动/清理该 bridge
- **ContextFileCatalogService**：接收 vault 增量事件并维护 catalog 缓存

## 注意事项

- 这个 bridge 不应承担 catalog 数据结构、排序、缓存策略或 UI 刷新逻辑
- 若未来新增 vault 侧的 catalog 事件，应优先继续放在这里，而不是回流到组合层
