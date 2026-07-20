# Core Config Barrel

> **源码**: `src/core/config/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/config/index.ts` 是 `core/config` 目录的 barrel。它聚合配置层 service / state owner，并公开模型目录影子比较的稳定类型与纯函数。

- `ModelConfigService`
- `ModelCatalogStateService`
- `OpencodeConfigManager`
- `PluginManagementService`

这个入口不暴露 `commandScopedAgent.ts`、`formatterConfig.ts`、`modelConfig.ts`、`slashCommandCatalog.ts` 里的辅助函数或类型，因此需要这些细粒度工具的调用方仍然要走深路径导入。

## 导入关系

```text
上游: ./ModelConfigService, ./ModelCatalogStateService, ./OpencodeConfigManager, ./PluginManagementService
下游: src/main.ts, src/features/settings/OpenCodianSettings.ts, src/features/settings/OpencodeConfigModal.ts
```

## 公开导出

```typescript
export { ModelConfigService } from './ModelConfigService';
export type { ModelCatalogBundle, ProviderDirectorySnapshot } from './ModelConfigService';
export type { ModelCatalogState, ModelCatalogStateMode, ProviderDirectoryStatus } from './ModelCatalogStateService';
export { ModelCatalogStateService } from './ModelCatalogStateService';
export type { ModelCatalogComparison } from './modelCatalogComparison';
export { compareModelCatalogs, createUnavailableModelCatalogComparison } from './modelCatalogComparison';
export { OpencodeConfigManager } from './OpencodeConfigManager';
export { PluginManagementService } from './PluginManagementService';
```

## 聚合规则

### 只暴露服务类与高频状态类型

barrel 没有转发 `commandScopedAgent.ts`、`formatterConfig.ts`、`modelConfig.ts`、`slashCommandCatalog.ts` 中的辅助导出。仓库中需要这些内容的模块会直接引用：

- `src/core/config/commandScopedAgent.ts`
- `src/core/config/formatterConfig.ts`
- `src/core/config/modelConfig.ts`
- `src/core/config/slashCommandCatalog.ts`
- `src/core/config/PluginManagementService.ts`

### 作为配置层稳定入口

运行时装配主要通过这个 barrel 完成：

- `src/main.ts` 通过它创建 `OpencodeConfigManager` 和 `ModelConfigService`
- `src/features/settings/OpenCodianSettings.ts` 通过它创建 `ModelCatalogStateService`、`OpencodeConfigManager` 与 `PluginManagementService`
- `src/features/settings/OpencodeConfigModal.ts` 通过它接收 `OpencodeConfigManager`

`ProviderDirectorySnapshot` 跟随 `ModelCatalogBundle` 从 `ModelConfigService` 暴露，供设置页读取 provider directory / connected 诊断状态。它不是 `modelConfig.ts` 的通用 helper，也不应被用来扩展聊天模型选择目录。

`ProviderDirectoryStatus` 跟随 `ModelCatalogState` 暴露，表达设置页已派生好的 listed / connected / directory-only 状态，调用方不需要直接读取 `providerDirectory` 快照。

`ModelCatalogComparison` 与两个比较 helper 也从 barrel 暴露，供 settings 状态层消费；它们只比较 provider ID 与 `provider/model` 引用，不携带认证、provider options 或模型参数。

## 注意事项

- 新增配置服务时，如果希望上层继续使用统一导入路径，需要同步更新这个 barrel。
- `commandScopedAgent.ts` 与 `formatterConfig.ts` 都是目录内私有 helper；即使职责变更，也应优先保持深路径导入而不是直接扩张 barrel。
- 只改 barrel 不改文档会导致 `docs/modules/core/config/index.md` 与叶子模块脱节，后续汇总时需要一起检查。
