# McpServerStatusModal

> **源码**: `src/features/settings/McpServerStatusModal.ts`
> **状态**: [REVIEW]

## 概述

`McpServerStatusModal` 是 MCP server monitor/details modal。它展示 runtime status、project ownership、transport summary、刷新时间和 redacted technical details。

## 核心逻辑

### Runtime summary

顶部区域显示 server name、runtime status、project-owned/runtime-only 标识、transport summary 和错误信息（如果 runtime status 提供）。

### Tools boundary

当前 OpenCodian 没有稳定的 server->tools attributable seam，因此 tools 区域固定显示明确的 unavailable-state 文案，不展示 fake tool count 或推断列表。

### Redaction

`redactMcpTechnicalDetails()` 会隐藏 headers values、environment values 和 OAuth `clientSecret`。URL、command、clientId、scope 等非 secret 摘要仍可显示。

## 与其他模块的交互

- `src/features/settings/SettingsMcpSection.ts`: 打开 modal 并传入 runtime status + project config entry。
- `src/core/opencode/types.ts`: 使用 `McpServerStatus`。
- `src/core/types/opencodeConfig.ts`: 使用 `OpencodeMcpEntryConfig`。

## 注意事项

- 不浏览 MCP resources/prompts。
- 不提供 per-tool enable/disable。
- 如果未来增加稳定 tools seam，应在这里替换 unavailable state，并补充 source-attributed tool card tests。
