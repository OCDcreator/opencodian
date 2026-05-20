# ClaudeCodeOptionsBuilder

> **源码**: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeOptionsBuilder.ts` 是 Claude Code Agent SDK 接入的隐藏 foundation 模块。它把 OpenCodian 的 `backendSettings.claudeCode` 映射成 SDK `query()` options 的本地兼容形状；官方 SDK 的实际加载由 `ClaudeCodeSdkLoader` 负责，本模块不注册 Claude backend。

## 职责

- 固定 `cwd` 为 vault path
- 始终显式写入 `settingSources`，避免依赖 SDK 默认值
- 始终启用 `includePartialMessages: true`
- 映射 Claude 专属 `permissionMode`、`thinking`、`effort`
- 将 OpenCodian UI 中的 `thinking.type === 'fixed'` 映射为官方 SDK `thinking: { type: 'enabled', budgetTokens }`
- 只在用户显式配置时写入 `model`、`fallbackModel`、`additionalDirectories`、`pathToClaudeCodeExecutable`、`canUseTool`、`mcpServers`
- 只在 runtime 提供时写入 `abortController` 和 `spawnClaudeCodeProcess`，用于 Obsidian/Electron 下的流取消和进程启动兼容层

## 维护约束

- 这是 SDK options 形状的本地边界；若官方 SDK option 命名变化，应优先在这里收口映射。
- 不要把 OpenCode 的 `permissionMode`、`effortLevel`、`thinkingBudget` 直接复用到这里；Claude 语义由 `backendSettings.claudeCode` 独立表达。
- `settingSources: []` 是显式 none，不能被默认成 `['project']`。
- `abortController` / `spawnClaudeCodeProcess` 是 runtime 注入，不应保存进用户设置。
