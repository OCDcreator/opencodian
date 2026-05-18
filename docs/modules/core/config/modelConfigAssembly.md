# Model Config Assembly Owner

> **源码**: `src/core/config/modelConfigAssembly.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigAssembly.ts` 把 catalog owner 和 availability owner 的结果拼成 service 可消费的装配 seam：

- `assembleServerModelCatalog()`：runtime result + inherited resolution + scoped metadata
- `assembleModelCatalog()`：`baseEffective`、`effective` 与 `currentEnabledProviderIds`
- `resolveProviderAvailabilityProbePlan()`：provider probe 状态、测试模型选择与真实发送判定

`assembleServerModelCatalog()` 现在同时接收可选的 `providerDirectoryResult`。这份数据来自 directory-scoped `provider.list()`，会被规范化为独立的 `ProviderDirectorySnapshot`，只表达 provider directory / connected 状态。`server` 目录仍只由 `config.providers()` 的 runtime result 与 scoped metadata 组装，避免把 provider-list-only 条目误当成实际可发送模型。

## 关键导出

- `ModelCatalogAssemblyResult`
- `ModelServerCatalogAssemblyResult`
- `ProviderDirectorySnapshot`
- `ProviderAvailabilityProbePlan`
- `assembleServerModelCatalog()`
- `assembleModelCatalog()`
- `resolveProviderAvailabilityProbePlan()`

## 边界

- 这里只做纯装配，不读磁盘、不发请求。
- `ModelConfigService` 继续负责 IO 编排、日志与真实 `probeProviderResponse()` 调用。
