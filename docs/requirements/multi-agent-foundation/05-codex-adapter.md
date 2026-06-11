# Codex Adapter 设计

> **状态**: `[DRAFT — NEEDS RE-VERIFICATION]`
> **最后更新**: 2026-06-09 (truth-fix audit)
> **优先级**: P2
> **审计状态**: 2026-06-09 truth audit 发现多处假设与官方基线不符。已标注 ⚠️ 需重新验证。详见 `docs/status/codex-sdk-current-state-2026-06-09.md`。

## 概述

Codex adapter 将 `@openai/codex-sdk` 封装为 AgentService 接口实现。Codex 是 OpenAI 的开源 coding agent，提供 TypeScript SDK（主路径）和 CLI（自动化路径）。

## 1. SDK 信息

- **npm 包**: `@openai/codex-sdk`
- **版本**: 需重新验证（旧文档标注 v0.130.x，但版本迭代极快）
- **开源**: Apache-2.0
- **主路径（推荐）**: TypeScript SDK — `new Codex()` → `startThread()` / `resumeThread()` → `thread.run()`；需要 Node.js 18+，更适合应用内接入
- **自动化路径（诊断/回退）**: `codex exec` — non-interactive/automation surface，适合 CI、脚本、JSONL 输出；不应作为插件主接入路径
- **MCP server 模式**: `codex mcp-server` — 暴露 `codex` 和 `codex-reply` 两个 MCP 工具；参数包括 `prompt`、`approval-policy`、`cwd`、`include-plan-tool`、`model`、`profile`、`sandbox`

> ⚠️ **2026-06-09 基线修正**：旧文档将 SDK 描述为 "wraps codex CLI binary; JSONL over stdin/stdout"。官方 TypeScript SDK 的主路径是 `new Codex()` → thread-based API，不是 JSONL wrapping。CLI 子进程通信是 SDK 内部实现细节，不应作为 adapter 的主要集成模型。

## 2. 能力声明

> ✅ **2026-06-09 Checkpoint 1 smoke verified**：以下能力集合基于 `@openai/codex-sdk@0.137.0` 实际 `.d.ts` 类型。

```typescript
const CODEX_CAPABILITIES = new Set<AgentCapability>([
  'chat',       // thread.run() / thread.runStreamed()
  'sessions',   // startThread() / resumeThread() / thread.id
  'tools',      // CommandExecutionItem, FileChangeItem, McpToolCallItem
  'mcp',        // McpToolCallItem with server/tool/arguments
  'permissions', // approvalPolicy: "never" | "on-request" | "on-failure" | "untrusted"
  'models',     // ThreadOptions.model
  'thinking',   // ReasoningItem + ModelReasoningEffort
  'file-ops',   // FileChangeItem with add/delete/update
  'shell',      // CommandExecutionItem with command/output/exit_code
  'context',    // Usage with token tracking
  'export',     // TurnOptions.outputSchema for structured output
]);

// 新发现的能力（旧文档未列出）：
// - TodoListItem: SDK 内置 todo 追踪
// - WebSearchItem: 网页搜索
// - ModelReasoningEffort: "minimal"|"low"|"medium"|"high"|"xhigh"
// - SandboxMode: "read-only"|"workspace-write"|"danger-full-access"
// - additionalDirectories: ThreadOptions.additionalDirectories
// - networkAccessEnabled: boolean
// - abort via TurnOptions.signal (AbortSignal)
```

**不支持（对照 OpenCode adapter）**: branching/fork (无 revert/unrevert/fork API), todos 的 plugin-managed 持久化（SDK 有 TodoListItem 但无写入 API），providers（仅 OpenAI），hooks，cost-tracking，compaction，sharing。

## 3. 方法映射表

> ⚠️ **2026-06-09 基线修正**：以下映射基于旧假设 `runStreamed()`，与官方 TypeScript SDK 的 `new Codex()` → `startThread()` / `resumeThread()` → `thread.run()` 不符。实现前必须重新验证 SDK API 形状。

| AgentService 方法 | Codex SDK 方法（待验证） | 备注 |
|---|---|---|
| `start()` | `new Codex()` | SDK lazy-creates subprocess |
| `stop()` | Codex instance cleanup | ⚠️ 需验证清理 API |
| `createSession()` | `codex.startThread()` | Thread 自动管理；⚠️ 需验证确切 API |
| `listSessions()` | 待验证 | ⚠️ 旧文档说 `codex threads list` (CLI)，需确认 SDK 等价方法 |
| `getSession()` | 通过 thread ID 恢复 | `codex.resumeThread()` ⚠️ 需验证 |
| `sendMessage()` | `thread.run()` | ⚠️ 旧文档写 `runStreamed()`，官方基线是 `thread.run()` |
| `cancelStream()` | AbortController | 通过 AbortSignal ⚠️ 需验证 |

## 4. 关键设计决策

### 4.1 会话模型

> ⚠️ **2026-06-09 基线修正**：以下代码示例基于旧 `runStreamed()` 假设。官方 TypeScript SDK 的实际 API 是 `new Codex()` → `startThread()` / `resumeThread()` → `thread.run()`。实现前必须替换为经过 SDK smoke 验证的真实 API。

Codex 使用 "threads" 概念：
```typescript
// ⚠️ 以下为旧假设，需替换为官方 API
// 官方基线: new Codex() → startThread() → thread.run()

// 旧假设（不正确）：
// const stream = runStreamed({ prompt: "Fix the bug", ... });

// 官方基线（待验证确切签名）：
// const codex = new Codex();
// const thread = codex.startThread();
// const result = thread.run({ prompt: "Fix the bug" });
```

### 4.2 权限模型映射

> ⚠️ **2026-06-09 基线修正**：旧文档映射 `full-auto / auto-edit / suggest` 未经验证。官方基线确认参数名为 `approval-policy`，但确切值列表需在 SDK smoke 后重新确认。

Codex 的 `approval-policy` 与 AgentPermissionCapability 的映射（待验证）：

| Codex Policy（待验证） | AgentPermissionConfig.mode | 备注 |
|---|---|---|
| ⚠️ 待验证 | `yolo` | ⚠️ 旧文档写 `full-auto` |
| ⚠️ 待验证 | `auto` | ⚠️ 旧文档写 `auto-edit` |
| ⚠️ 待验证 | `normal` | ⚠️ 旧文档写 `suggest` |

### 4.3 事件归一化

> ✅ **2026-06-09 Checkpoint 1 shape verified**：以下内容基于 `@openai/codex-sdk@0.137.0` 实际 `.d.ts` 类型 + smoke 脚本验证的 ThreadEvent / ThreadItem 形状。具体如何映射到 OpenCodian `StreamChunk` 仍是 adapter 设计与后续 runtime 验证事项。

```
Codex ThreadEvent / ThreadItem shape → Candidate StreamChunk mapping

thread.started → { type: 'message_metadata', sessionId: thread_id }
turn.started   → { type: 'message_start' }
turn.completed → { type: 'usage', inputTokens, outputTokens, sessionId? }
turn.failed    → { type: 'error', content: error.message }
error          → { type: 'error', content: message }

item.started/.updated/.completed (agent_message) → { type: 'text', content: item.text }
item.started/.updated/.completed (reasoning)     → { type: 'thinking', content: item.text }
item.started/.updated/.completed (command_execution) → { type: 'tool_use', name: 'Bash', input: { command } }
item.completed (command_execution) → { type: 'tool_result', content: item.aggregated_output }
item.started/.completed (file_change) → { type: 'tool_use', name: 'FileEdit', input: { changes } }
item.started/.completed (mcp_tool_call) → { type: 'tool_use', name: item.tool, input: item.arguments, kind: 'mcp' }
item.completed (mcp_tool_call) → { type: 'tool_result', content: item.result || item.error }
item.started/.updated/.completed (todo_list) → { type: 'backend_event', event: 'todos', metadata: { items } }
item.started/.completed (web_search) → { type: 'backend_event', event: 'web_search', metadata: { query } }
item.started/.completed (error) → { type: 'error', content: item.message }
```

> 注：SDK 的 ThreadItem / ThreadEvent 类型已通过 smoke 验证；上述映射本身仍需在 adapter 实现时对照 `src/core/types/chat.ts` 的 `StreamChunk` 联合类型最终确认。

## 5. 集成路径选择

> ⚠️ **2026-06-09 基线修正**：旧文档只描述 CLI 二进制安装。官方 TypeScript SDK 是应用内接入的主路径。

官方基线提供三条集成路径（详见 `docs/status/codex-sdk-current-state-2026-06-09.md` §6）：

### 5.1 TypeScript SDK（推荐主路径）

- `new Codex()` → `startThread()` / `resumeThread()` → `thread.run()`
- 需要 Node.js 18+（仍需在 Obsidian Electron 环境验证）
- Thread-based session 管理
- 实现 `AgentService` 接口包装 SDK
- 事件翻译为 `StreamChunk`

### 5.2 MCP Server 模式（备选）

- Codex 作为 MCP server 运行（`codex mcp-server`）
- 暴露 `codex` 和 `codex-reply` 两个工具
- 参数：`prompt`、`approval-policy`、`cwd`、`include-plan-tool`、`model`、`profile`、`sandbox`
- 通过现有 MCP 基础设施集成

### 5.3 CLI 二进制（仅诊断/回退）

- ⚠️ `codex exec` 是非交互自动化 surface，不应作为插件主路径
- 可用于诊断、健康检查、脚本集成

Adapter 需要检测 SDK/CLI 是否可用：
```typescript
async start() {
  // 推荐：先尝试 TypeScript SDK（in-process）
  // 回退：检测 CLI 二进制可用性
  const cliAvailable = await this.detectCodexCli();
  if (!cliAvailable) {
    throw new AgentNotReadyError('Codex SDK not available');
  }
}
```

## 6. 风险

| 风险 | 缓解 |
|------|------|
| CLI 需要单独安装，不像 Claude/Copilot 自带 | adapter 检测 + 安装引导 |
| 只支持 OpenAI 模型 | 不影响，adapter 隔离 |
| 不支持会话分支 | hasCapability('branching') 返回 false |
| SDK 版本更新频率高 | adapter 隔离变更 |
| Thread 管理比 OpenCode session 简单 | adapter 补齐差异 |

## 7. 验收标准

1. Codex adapter 实现 AgentService 核心接口
2. 能发送消息、接收流式回复（checkpoint 1 仅证明 SDK/CLI 管道结构可用；真实产品路径仍待 adapter + runtime proof）
3. approvalPolicy 映射正确（checkpoint 1 已确认 SDK enum 值；最终插件映射与行为仍待验证）
4. Thread 恢复正常工作（checkpoint 1 已确认 `resumeThread(id)` API 存在；真实恢复语义仍待验证）
5. SDK/CLI 可用性检测和错误提示（checkpoint 1 已确认 SDK 包与 CLI binary 存在；插件级检测与用户错误提示仍待实现）
6. 切换 agent 后不影响其他 adapter

## 8. 审计追溯

- **2026-06-09 truth audit (Checkpoint 0)**: 标注所有与官方基线冲突的旧假设。旧文档引用的 `runStreamed()`、legacy approval policy 假设、JSONL-over-stdio 主路径均需在 SDK smoke 后重新验证。详见 `docs/status/codex-sdk-current-state-2026-06-09.md`。
- **2026-06-09 SDK smoke (Checkpoint 1)**: 安装 `@openai/codex-sdk@0.137.0`，47/47 结构检查通过。确认：`ApprovalMode` 值完全不同于旧假设；`SandboxMode`/`ModelReasoningEffort`/`WebSearchMode` 为新增枚举；ThreadItem 含 8 种 item 类型；ThreadEvent 含 8 种事件类型；CLI binary 191.6MB (darwin-arm64)；ESM-only SDK；`thread.runStreamed()` 确认 subprocess 通信。完整流式和 Electron 兼容性仍待验证。
