# ClaudeCodeMcpConfigAdapter

> **源码**: `src/core/agents/backend/ClaudeCodeMcpConfigAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeMcpConfigAdapter.ts` 是 Claude Code Agent SDK MCP 配置桥接模块。它把 OpenCodian 已有的 `.opencode/opencode.json` `mcp` 配置映射为 SDK `mcpServers` 形状，避免 Claude backend 重新定义一套 MCP 配置格式。

## 职责

- 跳过 `enabled === false` 的 MCP entry
- 将 OpenCodian `command: string[]` 拆分为 SDK `command` 与 `args`
- 将 OpenCodian `environment` 映射为 SDK `env`
- 将 `type: 'http'` 的 URL entry 映射为 SDK HTTP MCP server
- 将其他 URL entry（包含 OpenCode `type: 'remote'`）映射为 SDK SSE MCP server
- 跳过缺少 `url` 且缺少有效 `command` 的 entry

## 维护约束

- 这是 OpenCodian MCP 配置到 Claude Agent SDK 的唯一字段映射边界；SDK MCP 字段变化时应优先在这里收口。
- 不要在 adapter 中读取或写入 `.opencode/opencode.json`；调用方负责提供已解析的 `OpencodeMcpConfigRecord`。
- 保持 OpenCode `remote` transport 与 Claude SDK `sse` transport 的显式映射，避免把 upstream 命名差异扩散到调用方。
