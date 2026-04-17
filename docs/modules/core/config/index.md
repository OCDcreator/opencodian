# Core Config Barrel

> **源码**: `src/core/config/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/config/index.ts` 是 `core/config` 目录的 barrel。它现在聚合 4 个配置层 service / state owner 导出：

- `ModelConfigService`
- `ModelCatalogStateService`
- `OpencodeConfigManager`
- `PluginManagementService`

这个入口不暴露 `modelConfig.ts`、`slashCommandCatalog.ts` 里的辅助函数或类型，因此需要这些细粒度工具的调用方仍然要走深路径导入。

## 导入关系

```text
上游: ./ModelConfigService, ./ModelCatalogStateService, ./OpencodeConfigManager, ./PluginManagementService
下游: src/main.ts, src/features/settings/OpenCodianSettings.ts, src/features/settings/OpencodeConfigModal.ts
```

## 公开导出

```typescript
export { ModelConfigService } from './ModelConfigService';
export { ModelCatalogStateService } from './ModelCatalogStateService';
export { OpencodeConfigManager } from './OpencodeConfigManager';
export { PluginManagementService } from './PluginManagementService';
```

## 聚合规则

### 只暴露服务类

barrel 没有转发 `modelConfig.ts`、`slashCommandCatalog.ts` 中的辅助导出。仓库中需要这些内容的模块会直接引用：

- `src/core/config/modelConfig.ts`
- `src/core/config/slashCommandCatalog.ts`
- `src/core/config/PluginManagementService.ts`

### 作为配置层稳定入口

运行时装配主要通过这个 barrel 完成：

- `src/main.ts` 通过它创建 `OpencodeConfigManager` 和 `ModelConfigService`
- `src/features/settings/OpenCodianSettings.ts` 通过它创建 `ModelCatalogStateService`、`OpencodeConfigManager` 与 `PluginManagementService`
- `src/features/settings/OpencodeConfigModal.ts` 通过它接收 `OpencodeConfigManager`

## 注意事项

- 新增配置服务时，如果希望上层继续使用统一导入路径，需要同步更新这个 barrel。
- 只改 barrel 不改文档会导致 `docs/modules/core/config/index.md` 与叶子模块脱节，后续汇总时需要一起检查。
