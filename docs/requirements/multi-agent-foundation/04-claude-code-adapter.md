# Claude Code Adapter 设计

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-18
> **优先级**: P1 — 第二个要实现的 adapter（推荐第一个新 agent）

## 概述

Claude Code adapter 将 `@anthropic-ai/claude-agent-sdk` 封装为 AgentService 接口实现。Claude Code 是最成熟的 agent SDK 之一，支持丰富的工具、MCP、hooks 和权限系统。

## 1. SDK 信息

- **npm 包**: `@anthropic-ai/claude-agent-sdk`
- **版本**: v0.2.x (Stable)
- **通信模式**: SDK spawns bundled CLI binary as subprocess; JSONL over stdin/stdout
- **平台依赖**: `@anthropic-ai/claude-agent-sdk-darwin-arm64` (macOS ARM), 类似的平台特定包

## 2. 能力声明

```typescript
const CLAUDE_CODE_CAPABILITIES = new Set<AgentCapability>([
  'tools',       // 内置 + 自定义工具
  'mcp',         // Local + remote MCP servers
  'permissions', // approval callbacks
  'branching',   // session resume, fork
  'models',      // Opus/Sonnet/Haiku + Bedrock/Vertex
  'questions',   // AskUserQuestion tool
  'subagents',   // programmatic subagents
  'context',     // context management
  'providers',   // Bedrock/Vertex/Foundry
  'hooks',       // PreToolUse, PostToolUse, etc.
  'file-ops',    // Read/Write/Edit
  'shell',       // Bash
]);
```

**不支持**: todos, compaction (内置), cost-tracking, export

## 3. 方法映射表

| AgentService 方法 | Claude Agent SDK 方法 | 备注 |
|---|---|---|
| `start()` | 预热 subprocess via `startup()` | 可选预热，首次 query 自动启动 |
| `stop()` | 无显式 stop，subprocess 随主进程结束 | 需考虑进程清理 |
| `createSession()` | `query()` with new conversation | Claude Code 不显式 "create session"，首次 query 创建 |
| `listSessions()` | 无直接 API | 需要从本地 JSONL 文件解析，或跳过 |
| `getSession()` | 同上 | 可能需要自定义实现 |
| `sendMessage()` | `query()` with `--continue` | 续接会话用 continue 参数 |
| `cancelStream()` | `abort()` on AbortController | 通过 AbortSignal 取消 |

## 4. 关键设计决策

### 4.1 会话模型差异

Claude Code SDK 的会话模型与 OpenCode 不同：
- **OpenCode**: 显式 createSession → sendMessage → 独立 session ID
- **Claude Code**: `query()` 调用自动管理会话，通过 `--continue` 续接

适配策略：
```typescript
// Adapter 内部维护 Claude session → backendSessionId 映射
private claudeSessions = new Map<string, string>(); // backendSessionId → claudeSessionFile

async createSession() {
  // 生成一个 adapter 级别的 session ID
  // 首次 sendMessage 时实际创建 Claude 会话
  const id = generateId();
  this.pendingSessions.add(id);
  return id;
}

async *sendMessage(sessionId: string, content: string, options?: ChatSendOptions) {
  const isContinue = this.claudeSessions.has(sessionId);
  const result = await query({
    prompt: content,
    options: {
      continue: isContinue ? this.claudeSessions.get(sessionId) : undefined,
      ...options,
      // ...
    }
  });
  // 归一化事件...
}
```

### 4.2 事件归一化

```
Claude Code SDK Event → StreamChunk

text content      → { type: 'text', content }
thinking          → { type: 'thinking', content }
tool_use          → { type: 'tool_use', id, name, input }
tool_result       → { type: 'tool_result', toolUseId, content, isError? }
usage             → { type: 'usage', inputTokens, outputTokens, sessionId? }
error             → { type: 'error', content, errorClass? }
permission_request → 映射到 AgentQuestionCapability
assistant.message → 完成当前 StreamChunk 序列
```

> 注：上述字段名需在实现时再次对照 `src/core/types/chat.ts` 的 `StreamChunk` 联合类型校验，避免 SDK 事件字段名泄漏到 UI 层。

### 4.3 权限系统适配

Claude Code 使用 approval callbacks:
```typescript
const result = await query({
  options: {
    allowedTools: ['Read', 'Edit', 'Bash'],
  },
  // 当 Claude 需要用户授权时
  onPermissionRequest: async (request) => {
    // 转发给 AgentPermissionCapability 的 handler
    return await this.permissionHandler?.(request) ?? 'deny';
  }
});
```

## 5. 进程管理

Claude Code SDK 自带进程管理（bundled CLI binary），但 adapter 需要额外考虑：

1. **预热**: `startup()` 可提前启动 subprocess
2. **健康检查**: SDK 内部处理，adapter 层不需要
3. **错误恢复**: SDK 有内置重连，adapter 需要映射错误到 `AgentConnectionStatus`
4. **资源清理**: 在 `stop()` 时确保 subprocess 退出

## 6. 依赖安装

```bash
npm install @anthropic-ai/claude-agent-sdk
```

平台特定 binary 会作为 optional dependencies 自动安装。

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 会话模型不匹配（无显式 session） | adapter 内部维护映射层 |
| CLI binary 在 Obsidian Electron 环境可能有问题 | 测试验证；必要时走 `--output-format stream-json` |
| SDK 版本更新可能改变事件格式 | adapter 隔离；单元测试覆盖 |
| `listSessions` 无原生支持 | 可能需要简化实现或从文件系统读取 |

## 8. 验收标准

1. Claude Code adapter 实现 AgentService 核心接口
2. 能创建会话、发送消息、接收流式回复
3. 工具调用正确归一化到 StreamChunk
4. 权限请求正确转发到 UI 层
5. 会话续接（continue）正常工作
6. 切换 agent 后不影响 OpenCode adapter 的功能
