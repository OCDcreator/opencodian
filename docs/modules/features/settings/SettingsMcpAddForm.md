# SettingsMcpAddForm

> **源码**: `src/features/settings/SettingsMcpAddForm.ts`
> **状态**: [REVIEW]

## 概述

`SettingsMcpAddForm` 现在不再渲染页面内联表单，而是承载 MCP add/edit 表单的共享纯 helper。`McpServerEditorModal` 复用这些 helper 来生成默认状态、从项目配置 entry 预填表单、校验输入，并构建可写回 `.opencode/opencode.json` 的 MCP config payload。

## 核心逻辑

### 表单状态

`AddFormState` 覆盖 local/remote 两类 MCP server 的安全编辑字段：`type`、`name`、`command`、`environment`、`enabled`、`timeout`、`url`、`headers`、`oauthMode`、`oauthClientId`、`oauthClientSecret`、`oauthScope`、`oauthRedirectUri`。

### 状态转换

- `createDefaultMcpFormState()`: add mode 默认值。
- `mcpEntryToFormState()`: edit mode 从 project config truth 预填字段。
- `buildMcpConfigFromFormState()`: 把表单状态转换为 OpenCode MCP config entry。

### 校验

`validateMcpFormState()` 校验名称、重复名称、本地命令、远程 URL、KV 空键和 timeout 正整数。Edit mode 通过 `originalName` 允许当前 server 名称本身不触发重复校验。

### KV 解析

`parseMcpKvPairs()` / `parseMcpKvPairsToRecord()` 负责把多行 `KEY=VALUE` 输入转换为 record。值会原样保留，空行忽略，空 key 由校验层拦截。

## 与其他模块的交互

- `src/features/settings/McpServerEditorModal.ts`: 唯一 UI 消费者。
- `src/core/types/opencodeConfig.ts`: 提供 `OpencodeMcpEntryConfig` 类型。
- `src/i18n/index.ts`: 校验错误使用 locale 文案。

## 注意事项

- 本模块不直接调用 `OpenCodeService` 或 `McpConfigService`，只做表单状态与 payload 变换。
- OAuth `configured` 即使字段为空也会生成 `oauth: {}`，用于区分 auto/default。
- 不在这里处理 unknown-field preservation；该职责属于 `McpConfigService.upsertServer()`。
