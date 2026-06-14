# MCP Auth Error Detection

> **源码**: `src/utils/streaming/mcpAuthErrorDetection.ts`
> **状态**: [REVIEW]

## 概述

检测 MCP 工具调用结果字符串中是否包含认证相关错误。当 Codex 聊天中的 MCP 工具调用失败且结果包含认证错误模式时，`McpToolCallRenderer.renderOrUpdateMcpAuthButton()` 使用此函数决定是否在工具调用 header 上渲染内联 "Authenticate" 按钮。

## 导入关系

```text
上游: 无（纯函数，无外部依赖）
下游: McpToolCallRenderer.ts
```

## 导出函数

| 函数 | 说明 |
|------|------|
| `detectMcpAuthError(result)` | 当结果字符串匹配认证错误模式时返回 `true`；空/null/undefined 返回 `false` |

## 检测模式

| 模式 | 匹配示例 |
|------|----------|
| `/authentic/i` | "authentication required", "not authenticated" |
| `/unauthorized/i` | "Unauthorized", "unauthorized access" |
| `/\b401\b/` | "HTTP 401", "status 401" |
| `/not.{0,15}logged/i` | "not logged in", "Not logged in" |
| `/\boauth\b/i` | "OAuth flow required", "oauth" |
| `/(?:expired\|invalid).{0,10}token/i` | "expired token", "invalid token" |
| `/token.{0,20}(?:expired\|invalid\|required)/i` | "token expired", "token required" |
| `/login.{0,15}required/i` | "login required", "Login required" |

## 误报防护

检测仅在 `toolCall.status === 'error'` 时由调用方触发。在错误上下文中，上述模式的认证语义高度可靠。

## 数据流

```text
CodexStreamNormalizer
  → tool_result chunk (isError: true, content: error message)
  → StreamController → ToolCallRenderer.updateResult()
    → updateAuthAffordance()
      → McpToolCallRenderer.renderOrUpdateMcpAuthButton()
        → detectMcpAuthError(toolCall.result)
        → 若 true + callback 存在 → 渲染 .streaming-tool-auth-btn
```
