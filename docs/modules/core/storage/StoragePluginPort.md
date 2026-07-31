# StoragePluginPort

> **源码**: `src/core/storage/StoragePluginPort.ts`
> **状态**: [REVIEW]

## 概述

`StoragePluginPort` 是 `StorageService` 的 consumer-owned 窄构造 port。它只暴露存储层初始化所需的 Obsidian `App`，让 `StorageService` 不必通过 type-only import 依赖 `src/main.ts` 的具体插件类。

## 导入关系

```text
上游: obsidian App
下游: src/core/storage/StorageService.ts
```

## 核心类型 / 接口

```typescript
export interface StoragePluginPort {
  app: App;
}
```

该接口只有一个成员：`app: App`。调用方提供满足该形状的对象，`StorageService` 读取它来访问当前 vault 的 adapter。

## 核心逻辑

本模块没有运行时逻辑。它只描述 `StorageService` 构造时需要的最小依赖面，避免把完整插件实例的类型边界带入 core storage。

## 关键导出

| 导出 | 说明 |
|------|------|
| `StoragePluginPort` | 由调用方拥有、供 `StorageService` 构造使用的 `app` 窄 port |

## 与其他模块的交互

- `StorageService` constructor 接收 `StoragePluginPort`，只读取 `app`。
- `src/main.ts` 仍负责创建并持有 `StorageService`，但不再成为 `StorageService` 的类型依赖上游。
- 本 port 不拥有 mutable state、插件生命周期或服务定位职责，也不转发额外的 runtime 能力。

## 注意事项

- 保持接口最小；新增成员必须有明确的 `StorageService` 构造需求。
- 不要把它扩展成独立 mutable owner、service locator 或 runtime forwarding adapter。
- 该接口是内部装配 seam，不通过 `src/core/storage/index.ts` barrel 公开。
