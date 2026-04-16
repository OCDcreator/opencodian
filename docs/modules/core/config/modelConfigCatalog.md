# Model Config Catalog Owner

> **源码**: `src/core/config/modelConfigCatalog.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigCatalog.ts` 只处理目录事实：

- `ModelCatalog` / `ModelCatalogProvider` / `ModelCatalogModel` 类型
- 本地/服务端配置到 catalog 的映射
- runtime provider 结果到 server catalog 的映射
- local/server catalog merge 与 source/existence/disabled scope 保留

## 关键导出

- `buildCatalogFromConfig()`
- `catalogFromRuntimeResult()`
- `buildServerCatalog()`
- `mergeCatalogs()`
- `resolveCatalogForMode()`

## 边界

- 当前 runtime provider 集合仍然是 server catalog 真值；只存在于 metadata 的 provider 不会被补进 server catalog。
- `baseEffective` / `effective` projection 不在这里处理，避免把 availability layering 再混回目录 owner。
