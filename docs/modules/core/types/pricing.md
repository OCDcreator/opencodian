# pricing

> **源码**: `src/core/types/pricing.ts`
> **状态**: [REVIEW]

## 概述

该模块定义本地模型价格目录、用户单价覆盖，以及附着在上下文 snapshot 上的成本来源信息。所有费率均使用 USD / 100 万 Token；`null` 表示该类别未公开或未知，不能解释为免费。

## 核心类型

| 类型 | 用途 |
|---|---|
| `ModelPricingRates` | input/output/cache-read/cache-write 四类单价 |
| `ModelPricingOverride` | 用户的 provider/可选 endpoint/model 局部覆盖及更新时间 |
| `ModelPricingCatalogEntry` / `ModelPricingCatalog` | 自动更新并可手动刷新的 models.dev 目录缓存 |
| `ContextCostDetails` | snapshot 的来源、完整度、有效费率、Provider、endpoint、目录时间与 tier 提示 |
| `ContextCostSource` | `backend-reported`、`models-dev`、`user-override` 或 `unavailable` |
| `ContextCostCompleteness` | `complete`、`partial` 或 `unavailable` |

## 约束

- `backend-reported` 只表示后端已经给出会话成本；它优先于本地表。
- `models-dev` 与 `user-override` 都是本地 API 等价估算，不是 Claude/Codex/ChatGPT 订阅账单。
- `unavailableTokenKinds` 必须列出不能可靠定价的类别，避免将未知 cache-write 等伪造为 0。
- `usesBaseTier` 告知目录有阶梯价而累计 snapshot 无法准确选择阶梯。
- `endpoint: null` 是 Provider 通用身份；非空值仅用于价格匹配和详情展示，不会改变任何 backend 的 API 请求地址。
