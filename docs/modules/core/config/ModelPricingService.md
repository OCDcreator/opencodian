# ModelPricingService

> **源码**: `src/core/config/ModelPricingService.ts`
> **状态**: [REVIEW]

## 概述

`ModelPricingService` 是本地成本估算 owner。它在首次没有缓存、或缓存已超过 24 小时时自动读取 `https://models.dev/api.json`，也保留手动刷新入口；公开目录价格缓存到 vault 的 `.opencodian/model-pricing.models-dev.json`，再把已有的 session token snapshot 转换成带来源说明的本地 API 等价估算。

它不读取账号/订阅用量，也不会把估算值写回 OpenCode、Claude Code、Codex 或供应商账单。

## 定价优先级

1. backend 已上报 `totalCost` 时，保留该数值并标为 `backend-reported`。
2. 对没有上报成本的 snapshot，优先用 `providerId + endpoint + modelId` 的精确用户覆盖。
3. 精确覆盖缺失的 token 类别回退同一 `providerId + modelId` 的通用覆盖，再回退 models.dev。
4. 没有手动 Provider 时，先从 `claude*` / `gpt*` 等模型 ID 推断；仍未知时只接受 models.dev 中唯一的 model-ID 匹配。多 provider 同名模型保持不可用，不猜价格。
5. 没有匹配价格或计费类别不足时，成本保持 `null` 或标为 `partial`，绝不伪造免费成本。

`models.dev` 是模型目录，不是供应商账单 API。因此 Claude Code 与 Codex 的结果都必须在 UI 中称为“本地 API 等价估算”，不能称作订阅费用。

## token 与完整度规则

费率单位均为 **USD / 1,000,000 tokens**，分别计算 input、output、cache read、cache write。reasoning token 合并到 output 单价；Claude Code 的计费数只从终态 `result` usage ledger 取得，不能把上下文窗口累计 input 当作可计费 input。

- 所有可计费类别可定价：`complete`
- 至少一个有价格但另一个类别缺失/没有价格：`partial`
- 没有可靠的价格或没有可价格的 token：`unavailable`
- `cost.tiers` 存在时只采用基础档，并标记 `usesBaseTier`

## 公开接口

| 方法 | 说明 |
|---|---|
| `load()` | 只读取本地目录即返回；首次或超过 24 小时会在后台触发自动更新，网络慢或离线都不阻塞插件启动 |
| `refresh()` | 请求 models.dev、规范化有价格模型并持久化缓存；自动更新与手动调用共享同一个进行中的 Promise，成功或失败后都允许重新请求 |
| `onCatalogUpdated(listener)` | 目录在内存中可用时通知消费者，返回可 `dispose()` 的订阅；读取本地缓存和网络更新均可触发，不等待磁盘缓存写入 |
| `getStatus()` / `getCatalogEntry()` | 给设置 UI 展示缓存状态与 provider/model 匹配提示 |
| `upsertOverride()` / `removeOverride()` | 管理持久化于插件设置的 per-provider/model 覆盖 |
| `enrichContextUsageSnapshot(snapshot)` | 计算并附加 `totalCost` / `costDetails`，不改变 backend 原始 token 真值 |

## 数据流

```text
首次/过期自动更新（或用户手动刷新）
  -> models.dev API
  -> ModelPricingCatalog
  -> onCatalogUpdated (当前可用内存目录)
  -> StorageService (.opencodian/model-pricing.models-dev.json)

backend token snapshot + modelPricingOverrides
  -> ModelPricingService.enrichContextUsageSnapshot()
  -> totalCost + ContextCostDetails
  -> ContextUsageService / ContextDetailModal
```

## 注意事项

- provider/model ID 比较会 trim 并转小写；常见 `claude*` 与 `gpt*/o*/o4*` model 可分别推断 Anthropic/OpenAI provider。无 provider 的其它模型只会自动采用 models.dev 中唯一的同 model ID 条目。
- Base URL 只构成计费身份，永不参与 Claude Code 或 Codex 的连接配置；端点精确覆盖的空费率字段会逐类回退 Provider 通用覆盖与 models.dev。
- 覆盖只影响之后计算的本地估算；已持久化的历史 snapshot 会保留当时的来源与费率说明，目录刷新不会改写历史金额。
- OpenCode 自身 `opencode.json` 的 `cost` 与它上报的 session cost 仍优先；插件本地表只补足未上报成本的情况。
- 目录更新先发布内存状态，再持久化；磁盘写入失败仍可用于本次会话估算，但 `refresh()` 会拒绝并允许重试。单个订阅者或诊断日志失败不能阻止其他订阅者和缓存写入。
- 冷启动目录晚于 token snapshot 到达时，消费者通过订阅补算当前尚不可用的费用；已计价历史保留原值。消费端关闭时必须取消订阅。
