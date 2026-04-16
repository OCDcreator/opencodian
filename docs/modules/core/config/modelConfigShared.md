# Model Config Shared Helpers

> **源码**: `src/core/config/modelConfigShared.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigShared.ts` 承接模型配置辅助层里最底层、最通用的纯数据逻辑：

- 带注释 `opencode.json` 解析
- 模型字段子集提取、清洗、合并与回写
- `provider/model` 引用格式化/解析
- provider 配置深拷贝、深合并与数组归一化

这些 helper 现在同时服务于 catalog owner、availability owner、`OpencodeConfigManager` 与 `PluginManagementService`。

## 关键导出

- `OPENCODE_SCHEMA_URL`
- `parseOpencodeConfigText()`
- `extractModelConfig()`
- `applyModelConfig()`
- `cleanupModelConfig()`
- `mergeModelConfigSubsets()`
- `parseModelReference()`
- `formatModelReference()`
- `collectConfiguredProviderIds()`

## 注意事项

- 这里保留共享的 clone/merge/array-normalize helper，避免 catalog / availability owner 各自重写。
- 这里不负责 catalog 或 provider enablement 语义；相关逻辑分别留在相邻 owner。
