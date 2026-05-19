# Pi Adapter 设计

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-18
> **优先级**: P3

## 概述

Pi adapter 将 `@mariozechner/pi-coding-agent` 封装为 AgentService 接口实现。Pi 是唯一一个 **纯 in-process** 的 agent SDK（不需要管理子进程），也是唯一原生支持 12+ LLM 提供商的 agent。

## 1. SDK 信息

- **npm 包**: `@mariozechner/pi-coding-agent`
- **版本**: v0.73.x (Beta, 270 releases, very active)
- **开源**: MIT
- **通信模式**: In-process (pure TypeScript library)
- **备选模式**: RPC over stdin/stdout (用于非 Node.js 环境)

## 2. 能力声明

```typescript
const PI_CAPABILITIES = new Set<AgentCapability>([
  'tools',          // 内置 + TypeBox schema-based 自定义工具
  'branching',      // Tree-based branching, resume, fork
  'models',         // 12+ providers
  'providers',      // Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, etc.
  'context',        // Automatic context compaction
  'file-ops',       // Read, Write, Edit
  'shell',          // Bash, Grep, Find, Ls
  'cost-tracking',  // Per-session token and cost tracking
  'export',         // HTML export
]);
```

**不支持**: mcp (需确认), permissions (需确认), todos, questions, subagents, hooks, config (rich)

## 3. 方法映射表

| AgentService 方法 | Pi SDK 方法 | 备注 |
|---|---|---|
| `start()` | `createAgentSession()` | In-process，不需要进程管理 |
| `stop()` | session cleanup | 不需要 kill subprocess |
| `createSession()` | `createAgentSession()` | 直接映射 |
| `listSessions()` | 从 JSONL 文件读取 | Pi 有内置会话持久化 |
| `getSession()` | 从 JSONL 文件读取 | |
| `sendMessage()` | `session.send()` + `session.subscribe()` | 事件订阅模式 |
| `cancelStream()` | session 中断 | |

## 4. 关键设计决策

### 4.1 In-process 模型

Pi 最大的特点是直接在进程内运行：
- 不需要管理子进程
- 不需要 CLI binary
- 不需要健康检查
- `start()` / `stop()` 更轻量

```typescript
import { createAgentSession } from '@mariozechner/pi-coding-agent';

// 直接创建，无需 subprocess
const session = await createAgentSession({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
});

session.subscribe((event) => {
  // 直接在当前进程接收事件
});

await session.send("Fix the bug in auth.ts");
```

### 4.2 Tree-based Branching

Pi 有最丰富的分支模型：
- 不是简单的 fork，而是 tree-based branching
- 每个分支可以独立发展
- 支持回到任意分支点

这是所有 agent 中分支能力最强的。

### 4.3 多提供商支持

Pi 原生支持 12+ LLM 提供商，意味着：
- 用户可以选择不同的 LLM 后端
- 不需要多个 API key 只为了用同一个 agent
- 适合"一个 agent 多个模型"的使用场景

### 4.4 扩展系统

Pi 有 TypeScript 扩展系统，可能可以用来：
- 暴露 Obsidian 特有的工具
- 接入 vault 文件系统
- 自定义渲染

### 4.5 事件归一化

```
Pi SDK Event → StreamChunk

message.text      → { type: 'text', content }
message.reasoning → { type: 'thinking', content }
tool_call         → { type: 'tool_use', id, name, input }
tool_output       → { type: 'tool_result', toolUseId, content, isError? }
usage             → { type: 'usage', inputTokens, outputTokens, sessionId? }
error             → { type: 'error', content, errorClass? }
```

> 注：上述字段名需在实现时再次对照 `src/core/types/chat.ts` 的 `StreamChunk` 联合类型校验，避免 SDK 事件字段名泄漏到 UI 层。

## 5. 进程管理

**不需要**。Pi 直接运行在当前进程中。

这大大简化了 adapter：
- `start()`: 初始化配置
- `stop()`: 清理会话
- 没有 subprocess 管理
- 没有健康检查
- 没有 port 冲突

## 6. 风险

| 风险 | 缓解 |
|------|------|
| 个人项目，长期维护不确定 | adapter 隔离；可随时移除 |
| Beta 版本，API 可能变化 | 锁定版本 |
| In-process 可能影响插件性能 | 监控资源使用；必要时用 Worker thread |
| 文档可能不完整 | 源码阅读 + 实验验证 |
| 社区生态较小 | 不依赖社区包 |

## 7. 验收标准

1. Pi adapter 实现 AgentService 核心接口
2. 能创建会话、发送消息、接收流式回复
3. 至少一个 LLM 提供商正常工作
4. Tree-based branching 基本可用
5. 成本追踪数据可获取
6. 切换 agent 后不影响其他 adapter
