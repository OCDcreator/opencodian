# Core Storage Barrel

> **源码**: `src/core/storage/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/storage/index.ts` 是存储层的最小公开入口，当前只导出 `StorageService`。所有会话、设置、运行时状态和主题背景资源的本地持久化能力，都通过这个类向上层暴露。`StoragePluginPort` 是 `StorageService` 的内部构造契约，保留在存储目录内但不通过 barrel 扩大公开面。

主题背景资源的二进制读写已经下沉到内部 `ThemeBackgroundStorage` owner，但它暂时不通过 barrel 公开。

## 导入关系

```text
上游: ./StorageService
下游: src/main.ts
```

## 公开导出

```typescript
export { StorageService } from './StorageService';
```

## 内部构造契约

`src/core/storage/StoragePluginPort.ts` 定义了由调用方拥有的窄 port：唯一成员是 `app: App`。`StorageService` 构造函数接收该 port，以消除对 `src/main.ts` 具体插件类的 type-only 依赖；它不拥有状态或生命周期，也不是 service locator/runtime forwarding 层。该契约不从 barrel 导出，避免把内部装配 seam 变成存储层的额外公开 API。

## 聚合规则

### 只暴露服务，不暴露内部结构

barrel 没有导出 `StorageService` 内部使用的：

- `StoredThemeBackgroundAsset`
- `RuntimeState`
- `ThemeBackgroundStorage`
- 存储路径常量

调用方只能通过 `StorageService` 的方法间接操作这些数据。

### 插件主入口是当前唯一入口

仓库内当前只在 `src/main.ts` 通过这个 barrel 创建 `StorageService`。其他模块拿到的是 `plugin.storage` 实例，而不是再次直接导入 `core/storage`。

## 注意事项

- 如果未来新增其他存储服务，需要同时更新这个 barrel 和对应模块文档。
- 当前 barrel 很薄；会话/设置/运行时布局主要在 `StorageService.ts`，主题背景资产约束则在 `ThemeBackgroundStorage.ts` 内。
