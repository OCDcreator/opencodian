# CostEstimateSettingsRow

> **源码**: `src/features/settings/CostEstimateSettingsRow.ts`
> **状态**: [REVIEW]

## 概述

该 helper 在 OpenCode、Claude Code、Codex 的设置页分别插入同一个“成本估算 / 管理单价”入口，并根据 backend 说明不同成本语义，再打开共享 `ModelPricingModal`。

## backend 文案规则

| backend | 设置页必须说明 |
|---|---|
| OpenCode | 优先采用 OpenCode 已上报的 session cost；如需原生生成成本，用户在 `opencode.json` 配置 `cost`；本地表只补足没有上报的成本。 |
| Claude Code | 依据终态 billing usage 做 API 等价估算，不是 Claude 订阅账单。 |
| Codex | 依据本地 token snapshot 做 API 等价估算，不是 ChatGPT 或 Codex 订阅账单。 |

目录缓存状态同时显示在每个入口下。目录首次使用和超过 24 小时后会自动刷新，仍保留手动刷新；所以普通用户无需填写单价或 Provider 即可按模型 ID 匹配 models.dev。

Claude Code / Codex 额外显示可选的 Provider ID 与计费 Base URL。两者仅在第三方 gateway 的价格与自动匹配结果不同、或 model ID 有歧义时填写；它们绝不写入 `ANTHROPIC_BASE_URL`、`~/.codex/config.toml` 或改变流量。
