# McpConfigService

> **源码**: `src/core/config/McpConfigService.ts`
> **状态**: [REVIEW]

## 概述

`McpConfigService` 是项目级 MCP 配置的 mutation owner。它围绕 `OpencodeConfigManager` 操作当前项目 `.opencode/opencode.json` 中的 `mcp` subtree，供 MCP settings panel add/edit/delete 使用。

## 核心逻辑

### Strict read

`readConfigStrict()` 在配置文件存在时直接读取并解析 JSON。如果解析失败会 fail closed，抛出错误并拒绝继续 edit/delete，避免把损坏配置当作默认配置写回。

### Project ownership

`readProjectServers()` 只返回当前项目配置中的 MCP entries。`resolveOwnership()` 用它判断 runtime snapshot 中哪些 server 是 project-owned，哪些只是 runtime-only/inherited。

### Upsert

`upsertServer()` 会 normalize server name，并把新 payload merge 到已有 entry 上。这样 edit mode 能保留未知字段，避免 OpenCodian 删除当前还不认识的上游 MCP 配置字段。

### Delete

`deleteServer()` 只删除 project-owned entry。删除后如果 `mcp` record 为空，会移除整个 `mcp` 字段；不会把 server 改成 disabled，也不会合成默认配置覆盖损坏文件。

## 与其他模块的交互

- `src/core/config/OpencodeConfigManager.ts`: 负责最终 atomic write、config path 和默认配置读取。
- `src/core/config/modelConfig.ts`: 复用 `parseOpencodeConfigText()` 与 `isRecord()`。
- `src/features/settings/SettingsMcpSection.ts`: 用于 ownership resolution 和 delete flow。
- `src/features/settings/McpServerEditorModal.ts`: 用于 add/edit 保存。

## 注意事项

- 该服务只处理 project config truth，不表达 runtime connected/disabled/auth 状态。
- Parse failure 是阻塞错误，不应被 UI 静默降级成“无 MCP 配置”。
- Unknown field preservation 只在同名 entry upsert 中保证；删除仍是明确移除 entry。
