# modelCatalogComparison

> **源码**: `src/core/config/modelCatalogComparison.ts`
> **状态**: [REVIEW]

## 概述

该模块是模型目录的纯比较层。它把 `config.providers()` 生成的 legacy/runtime `ModelCatalog` 与只读 V2 快照比较，产出 `match`、`drift` 或 `unavailable`，但不选择模型、不修改配置，也不参与聊天目录构建。

## 公开接口

```typescript
export type ModelCatalogComparison =
  | { status: 'match' | 'drift'; /* counts and sorted differences */ }
  | { status: 'unavailable'; reason: string };

export function compareModelCatalogs(
  legacyCatalog: ModelCatalog,
  v2Snapshot: OpenCodeV2CatalogSnapshot,
): ModelCatalogComparison;

export function createUnavailableModelCatalogComparison(reason: string): ModelCatalogComparison;
```

## 关键行为

- provider 只比较规范化、去重、排序后的 ID。
- model 只比较 `provider/model` 引用。
- drift 结果保留双方独有 ID/ref，供结构化 debug 日志诊断；普通设置 UI 只显示数量。
- 不包含认证信息、provider options、模型参数或其他敏感配置。
- V2 快照不可用时直接保留其原因，不尝试 legacy fallback，因为 legacy catalog 已由调用方独立持有。
