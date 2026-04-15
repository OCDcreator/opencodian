# Model Config Assembly Owner

> **源码**: `src/core/config/modelConfigAssembly.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigAssembly.ts` 把 catalog owner 和 availability owner 的结果拼成 service 可消费的装配 seam：

- `assembleServerModelCatalog()`：runtime result + inherited resolution + scoped metadata
- `assembleModelCatalog()`：`baseEffective`、`effective` 与 `currentEnabledProviderIds`
- `resolveProviderAvailabilityProbePlan()`：provider probe 状态、测试模型选择与真实发送判定

## 关键导出

- `ModelCatalogAssemblyResult`
- `ModelServerCatalogAssemblyResult`
- `ProviderAvailabilityProbePlan`
- `assembleServerModelCatalog()`
- `assembleModelCatalog()`
- `resolveProviderAvailabilityProbePlan()`

## 边界

- 这里只做纯装配，不读磁盘、不发请求。
- `ModelConfigService` 继续负责 IO 编排、日志与真实 `probeProviderResponse()` 调用。
