# Model Config Availability Owner

> **源码**: `src/core/config/modelConfigAvailability.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigAvailability.ts` 收口 provider 可用性分层：

- `enabled_providers` / `disabled_providers` 判定
- inherited config source 与 local override 合并
- current-scope / effective provider enablement 计算
- provider 开关最小覆盖写回
- provider/model 过滤后的 catalog 投影

## 关键导出

- `isProviderEnabled()`
- `getEnabledProviderIds()`
- `mergeProviderAvailabilityConfig()`
- `resolveInheritedModelConfigResolution()`
- `setProviderEnabled()`
- `filterCatalog()`

## 边界

- 这里不直接读取 IO，也不直接组装 `baseEffective` / `effective` bundle。
- local/server catalog precedence 不在这里决定，只消费相邻 catalog owner 提供的目录事实。
