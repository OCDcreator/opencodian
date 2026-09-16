# ClaudeCodeAuxQuerySession

> **源码**: `src/core/agents/backend/auxiliary/ClaudeCodeAuxQuerySession.ts`
> **状态**: [REVIEW]

## 概述

在 Claude Code Agent SDK 上实现 `AuxQuerySession`。只读约束分层落地，每一层要么是 CLI 原生机制，要么来自 CLI 自己的运行时报告。

## 职责

- 构造 aux 查询选项：`tools` = 只读白名单（Read/Grep/Glob/WebSearch/WebFetch），`disallowedTools` 再删一遍写类工具，`strictMcpConfig: true` 屏蔽用户/项目/插件带来的 MCP server，`canUseTool` 对白名单外一律 deny，`persistSession: false`
- **不覆盖 `settingSources`**：Claude Code 的 provider 凭据通常写在 `~/.claude/settings.json` 的 `env` 里，丢掉 settings 会直接导致未登录；安全性由 `tools` 白名单承担，并在运行时验证
- `ClaudeAuxPromptQueue`：以异步可迭代 prompt 驱动 SDK，使同一个 CLI 进程服务多轮澄清
- 读取 CLI 的 `system/init` 报告并 **fail closed**：`tools` 出现白名单外条目、`mcp_servers` 非空、或 `permissionMode` 为 `bypassPermissions` 时丢弃本回合并销毁会话
- 校验通过后把 `safety.effectiveTools` 升级为 CLI 上报的工具列表（这才是可审计的运行时证据）
- `followUp()` 复用同一 CLI 会话；`cancel()` 走 `interrupt()`；`dispose()` 关闭队列与控制句柄

## 依赖

- `../ClaudeCodeAdapter`（仅类型：`ClaudeCodeSdkFacade`）
- `../ClaudeCodeOptionsBuilder`（仅类型）
- `../ClaudeCodeQueue`：`createUserPrompt`
- `../AgentAuxQueryCapability`、`src/shared/logger.ts`

## 维护约束

- `allowedTools` **不要**加裸工具名：SDK 会因此在 `canUseTool` 之前整体放行该工具并打印 shadowed 警告，等于绕过运行时闸门
- 首轮失败（含验证失败）视为会话不可复用，`settleTurn` 会同步释放原生状态，避免后续轮次复用未验证的会话
- `dispose()` 不得 await 正在执行的 pump（否则自等死锁）；同步拆除放在 `releaseNativeState()`
- 模型回答中若出现 `tool_use`，说明工具没有被真正限制，应优先检查 `tools` 是否被其他选项覆盖
