# Codex Adapter 设计

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-18
> **优先级**: P2

## 概述

Codex adapter 将 `@openai/codex-sdk` 封装为 AgentService 接口实现。Codex 是 OpenAI 的开源 coding agent，使用 Rust 编写的 CLI，通过 JSONL over stdio 通信。

## 1. SDK 信息

- **npm 包**: `@openai/codex-sdk`
- **版本**: v0.130.x (Stable, very active)
- **开源**: Apache-2.0
- **通信模式**: SDK wraps codex CLI binary; JSONL over stdin/stdout
- **备选模式**: `codex app-server` (WebSocket), `codex mcp` (MCP server)

## 2. 能力声明

```typescript
const CODEX_CAPABILITIES = new Set<AgentCapability>([
  'tools',       // File read/write/edit, shell, git
  'mcp',         // Can be MCP server OR connect to MCP servers
  'permissions', // approvalPolicy: full-auto / auto-edit / suggest
  'models',      // OpenAI models
  'subagents',   // Parallel subagents
  'context',     // Context management
  'file-ops',    // Read/Write/Edit
  'shell',       // Shell commands
  'export',      // Code review output
]);
```

**不支持**: todos, questions (built-in), branching (fork), config (rich), providers (OpenAI only), hooks, cost-tracking

## 3. 方法映射表

| AgentService 方法 | Codex SDK 方法 | 备注 |
|---|---|---|
| `start()` | 无显式 start | SDK lazy-creates subprocess |
| `stop()` | 无显式 stop | subprocess 随主进程退出 |
| `createSession()` | `runStreamed()` with new thread | Thread 自动管理 |
| `listSessions()` | `codex threads list` (CLI) | 需要调用 CLI 或读取 ~/.codex/sessions |
| `getSession()` | 通过 thread ID 恢复 | Thread resumption |
| `sendMessage()` | `runStreamed()` | Async generator of events |
| `cancelStream()` | AbortController | 通过 AbortSignal |

## 4. 关键设计决策

### 4.1 会话模型

Codex 使用 "threads" 概念：
```typescript
// Codex 不像 OpenCode 那样显式 createSession
// 首次 runStreamed 创建新 thread
const stream = runStreamed({
  prompt: "Fix the bug",
  model: 'codex-mini',
  approvalPolicy: 'suggest',
});

// 恢复 thread
const stream = runStreamed({
  prompt: "Continue",
  thread: previousThreadId,
});
```

### 4.2 权限模型映射

Codex 的 `approvalPolicy` 与 AgentPermissionCapability 的映射：

| Codex Policy | AgentPermissionConfig.mode |
|---|---|
| `full-auto` | `yolo` |
| `auto-edit` | `auto` |
| `suggest` | `normal` |

### 4.3 事件归一化

```
Codex SDK Event → StreamChunk

message.text      → { type: 'text', content }
message.reasoning → { type: 'thinking', content }
message.tool_call → { type: 'tool_use', id, name, input }
tool_output       → { type: 'tool_result', toolUseId, content, isError? }
usage             → { type: 'usage', inputTokens, outputTokens, sessionId? }
error             → { type: 'error', content, errorClass? }
```

> 注：上述字段名需在实现时再次对照 `src/core/types/chat.ts` 的 `StreamChunk` 联合类型校验，避免 SDK 事件字段名泄漏到 UI 层。

## 5. CLI 安装要求

Codex SDK 需要单独安装 `codex` CLI binary：
- **方式一**: `npm install -g @openai/codex` (全局安装)
- **方式二**: `npx @openai/codex` (临时运行)

Adapter 需要检测 CLI 是否可用：
```typescript
async start() {
  const cliAvailable = await this.detectCodexCli();
  if (!cliAvailable) {
    // 提示用户安装
    throw new AgentNotReadyError('Codex CLI not found. Install with: npm install -g @openai/codex');
  }
}
```

## 6. 风险

| 风险 | 缓解 |
|------|------|
| CLI 需要单独安装，不像 Claude/Copilot 自带 | adapter 检测 + 安装引导 |
| 只支持 OpenAI 模型 | 不影响，adapter 隔离 |
| 不支持会话分支 | hasCapability('branching') 返回 false |
| SDK 版本更新频率高 (789 releases) | adapter 隔离变更 |
| Thread 管理比 OpenCode session 简单 | adapter 补齐差异 |

## 7. 验收标准

1. Codex adapter 实现 AgentService 核心接口
2. 能发送消息、接收流式回复
3. approvalPolicy 映射正确
4. Thread 恢复正常工作
5. CLI 安装检测和错误提示
6. 切换 agent 后不影响其他 adapter
