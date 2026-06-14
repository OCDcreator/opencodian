# MCP Tool Call Renderer

> **源码**: `src/utils/streaming/McpToolCallRenderer.ts`
> **状态**: [REVIEW]

## 概述

为 MCP 工具调用提供 richer-chat 渲染辅助：(1) 从 `toolMetadata.server` 提取服务器名并渲染 header chip；(2) 在展开详情中渲染 `Server: {name}` + "View server details" 链接；(3) 当 MCP 工具调用因认证错误失败时，在 header 渲染内联 "Authenticate" 按钮和展开区认证提示；(4) 在用户完成认证后，通过 `applyMcpAuthOutcome()` 更新工具块内联状态（成功徽章/进度/失败提示）；(5) **16A 新增**：在失败的 MCP 工具块上渲染内联 "Retry" 按钮，通过 `applyMcpRetryOutcome()` 显示重试结果（成功/失败）。所有渲染只使用流中已有的 `toolMetadata` 和 `result`，不访问设置侧异步数据。

## 导入关系

```text
上游: obsidian (setIcon), ./mcpAuthErrorDetection, ./types (ToolCallInfo)
下游: ToolCallRenderer.ts
```

## 导出函数

| 函数 | 说明 |
|------|------|
| `getMcpServerName(toolCall)` | 当 `kind === 'mcp'` 且 `toolMetadata.server` 为非空字符串时返回服务器名，否则返回 `null` |
| `renderMcpServerChip(header, serverName, onOpen?)` | 在 header 渲染 `.streaming-tool-server-chip`；提供回调时为可点击 button，否则为 passive span |
| `renderOrUpdateMcpAuthButton(header, toolCall, onAuthenticate?)` | 当 MCP 工具调用失败且结果包含认证错误时，在 header 渲染/移除 `.streaming-tool-auth-btn`；使用 `detectMcpAuthError()` 检测 |
| `renderMcpExpandedContent(container, toolCall, onOpenMcpServerDetail?)` | 在 container 内创建 `.streaming-mcp-details`：`Server: {name}` + 认证失败提示（若适用）+ "View server details" 链接（若提供回调） |
| `applyMcpAuthOutcome(toolBlock, serverName, outcome)` | **15Z 新增**。在用户完成认证后更新匹配的工具块内联状态。`completed`: 移除认证按钮，添加 `.streaming-tool-auth-done` 绿色徽章 + 更新提示为成功重试；`pending`: 保留按钮，提示更新为进行中；`failed`: 保留按钮，提示更新为失败重试。跳过不匹配的工具块（无认证按钮或服务器名不匹配） |
| `applyMcpAuthOutcomeToContainer(container, serverName, outcome)` | **15Z 新增**。在容器内查找所有 `.streaming-tool-call` 块并对匹配的调用 `applyMcpAuthOutcome`。供 `OpenCodianView.authenticateMcpServerFromChat()` 在认证完成后调用 |
| `renderOrUpdateMcpRetryButton(header, toolCall, onRetry?)` | **16A 新增**。当 MCP 工具调用失败（`status=error`）且提供了 `onRetry` 回调时，在 header 渲染/移除 `.streaming-tool-retry-btn`。点击时进入 busy 状态（禁用 + spin 动画），调用 `onRetry(toolCall)` 传入完整工具调用信息（含 server/tool/arguments）。仅 Codex 聊天提供回调 |
| `applyMcpRetryOutcome(container, toolCallId, outcome)` | **16A 新增**。通过 `data-tool-id` 定位匹配的工具块，在块内显示 `.streaming-tool-retry-result`（`.is-ok` 绿色 / `.is-fail` 红色）。重置 retry 按钮的 busy 状态。替换先前结果（支持多次重试）。供 `OpenCodianView.retryMcpToolCallFromChat()` 在重试完成后调用 |

## 认证按钮渲染条件

`renderOrUpdateMcpAuthButton` 仅在以下全部条件满足时渲染按钮：
1. `toolCall.kind === 'mcp'`
2. `toolCall.status === 'error'`
3. `detectMcpAuthError(toolCall.result) === true`
4. `onAuthenticate` 回调已提供（仅 Codex 聊天提供）

OpenCode / Claude Code 不提供回调，按钮不渲染。

## 重试按钮渲染条件（16A 新增）

`renderOrUpdateMcpRetryButton` 仅在以下全部条件满足时渲染按钮：
1. `toolCall.kind === 'mcp'`
2. `toolCall.status === 'error'`
3. `onRetry` 回调已提供（仅 Codex 聊天提供）

与认证按钮不同，重试按钮不要求 `detectMcpAuthError()` 为 true——它在所有失败的 MCP 工具块上都可用（认证错误、瞬时错误等）。点击后调用 `OpenCodianView.retryMcpToolCallFromChat(toolCall)`，该方法通过 `CodexAdapter.retryMcpToolCall(backendSessionId, server, tool, args)` 在 app-server 上重新执行工具调用（先 `thread/resume`），结果通过 `applyMcpRetryOutcome()` 内联显示。

## 数据流

```text
CodexStreamNormalizer
  → tool_use chunk with toolMetadata.server
  → StreamController / AssistantShellViewHostAdapter
    → ToolCallRenderer.render() / updateResult()
      → renderMcpServerChip() — header chip
      → renderOrUpdateMcpAuthButton() — 条件性 header auth button
      → renderMcpExpandedContent() — 展开区 Server: + auth hint + link
```

## 注意事项

- 仅读取 `toolMetadata.server` 和 `toolCall.result`，不访问 schema、authStatus、tool description 等设置侧异步数据。
- 认证按钮检测是**响应式**的（reactive to stream result），不是**主动缓存**（proactive async cache）。
- 对应的 CSS 类为 `.streaming-tool-server-chip`、`.streaming-tool-auth-btn`、`.streaming-tool-auth-done`（15Z 认证成功徽章）、`.streaming-tool-retry-btn`（16A 重试按钮，含 `.is-busy` spin 状态）、`.streaming-tool-retry-result`（16A 重试结果，含 `.is-ok`/`.is-fail`）、`.streaming-mcp-details`、`.streaming-mcp-field`、`.streaming-mcp-auth-hint`（含 `.is-done`/`.is-pending`/`.is-failed` 变体）、`.streaming-mcp-server-link`。
