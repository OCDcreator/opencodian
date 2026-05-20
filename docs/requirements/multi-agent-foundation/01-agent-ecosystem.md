# Agent 生态调研

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-20

## 概述

对 Claude Code、Codex、Copilot、Pi 四个 coding agent 的 SDK 能力进行全面对比，为 adapter 设计提供依据。重点关注 SDK/CLI 通信模式、会话与流式能力、工具与 MCP 扩展、权限模型、进程管理成本，以及它们对 OpenCodian 后续 `AgentService`/adapter 抽象的影响。

## 0. 2026-05-20 Claude Code 调研修正

本轮针对 Claude Code 做了官方文档和本地 `claudian` 源码复核。Claude Code 相关结论以 `docs/status/claude-code-full-capability-research-2026-05-20.md` 和 `docs/requirements/multi-agent-foundation/04-claude-code-adapter.md` 为准。

关键修正：

| 原先容易误读的点 | 修正后结论 |
|---|---|
| Claude adapter 可以简单等价于 CLI wrapper | 不对。主路径应使用官方 TypeScript Agent SDK `query()`；CLI/executable path 是 SDK subprocess 的打包/路径兜底。 |
| SDK sessions V2 可以直接作为 Phase 1 基础 | 暂不采用。官方文档对 TS V2 session API 状态存在冲突，Phase 1 使用稳定的 `query()` streaming。 |
| `settingSources` 可依赖默认值 | 不可依赖。官方文档对默认值表述冲突，OpenCodian 必须显式设置。 |
| `allowedTools` 是安全沙箱 | 不对。官方文档将它定义为预批准工具；真正阻断需要 `disallowedTools` / permissions / `canUseTool`。 |
| `claudian` 的历史/会话能力都是 SDK 原生 | 不对。SDK 提供 JSONL/resume/fork 基础；`claudian` 自己补了 metadata、history rebuild、branch filter、subagent sidecar parsing。 |

### 0.1 Claude Code 能力边界快照

| 能力 | 2026-05-20 状态 | OpenCodian 影响 |
|---|---|---|
| query / persistent query | 官方确认 | 可以作为第二 backend 的核心协议。 |
| stream handling | 官方确认 | 需要 adapter 私有 normalizer 到现有 `StreamChunk`。 |
| model / effort / thinking | 官方确认 | 需要 Claude 专属设置与 model catalog，不应套用 OpenCode provider merge。 |
| permissions / `canUseTool` | 官方确认 | 可桥接现有 permission/question UI。 |
| MCP | 官方确认 | Phase 1 可 runtime pass-through；authoring 后置。 |
| hooks | 官方确认 | 先内部使用，完整 UI 后置。 |
| subagents / agents | 官方确认但需运行时验证 | 先验证 Agent tool 和 SDK init；文件 agent 管理后置。 |
| session resume/fork/history | 官方确认基础能力 | 需要 `backendSessionId` 和本地 metadata；完整 JSONL import 后置。 |
| CLAUDE.md / skills / settings | 官方确认，默认值有冲突 | 必须显式 `settingSources`，技能 authoring 后置。 |
| additional directories | 官方确认 | 适合外部上下文；变更应 restart query。 |
| bundled executable | 官方确认 | 仍需 external executable fallback 和 Electron smoke。 |

## 1. Agent 总览表

| 维度 | Claude Code | Codex | Copilot | Pi |
|------|-------------|-------|---------|-----|
| npm 包 | `@anthropic-ai/claude-agent-sdk` | `@openai/codex-sdk` | `@github/copilot-sdk` | `@mariozechner/pi-coding-agent` |
| 版本/成熟度 | Stable v0.3.x (2026-05-20 latest: 0.3.145) | Stable v0.130.x | Preview v1.0.0-beta.3 | Beta v0.73.x |
| 开源 | CLI 不开源 | Apache-2.0 | CLI 不开源 | MIT |
| 通信模式 | Stdio/JSONL 子进程 | Stdio/JSONL 子进程 | JSON-RPC stdio/TCP | In-process 直接调用 |
| 需要外部 CLI | 是（bundled） | 是（需安装） | 是（bundled） | 否（纯 TS 库） |
| 多 LLM 提供商 | Bedrock/Vertex/Foundry | OpenAI only | BYOK (OpenAI/Azure/Anthropic) | 12+ providers native |

## 2. Claude Code (Anthropic)

### SDK 信息

- **npm**: `@anthropic-ai/claude-agent-sdk`
- **GitHub**: anthropics/claude-agent-sdk-typescript
- **通信**: SDK spawns native Claude CLI binary as subprocess; JSONL over stdin/stdout
- **CLI binary**: bundled as platform-specific optional dep (e.g., `@anthropic-ai/claude-agent-sdk-darwin-arm64`)

### 能力矩阵

| 能力 | 状态 | 说明 |
|------|------|------|
| 多轮对话 | ✅ | 多 turn sessions |
| 流式输出 | ✅ | AsyncGenerator (TS), async iterator (Python) |
| 内置工具 | ✅ | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Monitor, AskUserQuestion |
| 自定义工具 | ✅ | In-process TS/Python functions |
| MCP 集成 | ✅ | Local + remote MCP servers, SDK MCP servers (in-process) |
| 会话管理 | ✅ | JSONL session files, resume, fork/branch |
| 文件操作 | ✅ | Read, Write, Edit, Glob |
| Shell 命令 | ✅ | Bash |
| Sub-agents | ✅ | Programmatic subagents |
| Hooks | ✅ | PreToolUse, PostToolUse, Stop, SessionStart/End |
| 模型选择 | ✅ | Opus, Sonnet, Haiku; Bedrock/Vertex/Foundry |
| 权限控制 | ✅ | Fine-grained approval callbacks |
| 中断/回退 | ✅ | interrupt(), rewindFiles() |

### 关键接口模式

```typescript
// 创建会话并流式获取响应
import { query } from '@anthropic-ai/claude-agent-sdk';

const message = await query({
  prompt: "Fix the bug in auth.ts",
  options: {
    allowedTools: ['Read', 'Edit', 'Bash'],
    model: 'claude-sonnet-4-20250514',
  },
  // 流式事件
  onEvent: (event) => { /* handle */ }
});
```

## 3. Codex (OpenAI)

### SDK 信息

- **npm**: `@openai/codex-sdk`
- **GitHub**: openai/codex (83k+ stars)
- **通信**: SDK wraps codex CLI binary, spawning as subprocess; JSONL over stdin/stdout
- **Alternative**: `codex app-server` for WebSocket mode; `codex mcp` for MCP server mode

### 能力矩阵

| 能力 | 状态 | 说明 |
|------|------|------|
| 多轮对话 | ✅ | Threads with multiple turns |
| 流式输出 | ✅ | runStreamed() returns async generator |
| 缓冲执行 | ✅ | run() returns complete result |
| 内置工具 | ✅ | File read/write/edit, shell commands, git |
| 自定义工具 | ❌ | 通过 MCP server 集成 |
| MCP 集成 | ✅ | Can be MCP server OR connect to MCP servers |
| 会话管理 | ✅ | ~/.codex/sessions, thread resumption |
| 结构化输出 | ✅ | JSON/Zod schema → JSON response |
| 文件操作 | ✅ | |
| Shell 命令 | ✅ | |
| 沙箱控制 | ✅ | Read-only to full filesystem |
| 图片输入 | ✅ | |
| Sub-agents | ✅ | Parallel subagents |
| 图片生成 | ✅ | In CLI |
| 代码审查 | ✅ | Built-in review agent |

### 关键接口模式

```typescript
import { runStreamed } from '@openai/codex-sdk';

const stream = await runStreamed({
  prompt: "Fix the bug in auth.ts",
  model: 'codex-mini',
  approvalPolicy: 'suggest', // 'full-auto' | 'auto-edit' | 'suggest'
});

for await (const event of stream) {
  // event types: message, tool_call, tool_output, etc.
}
```

## 4. GitHub Copilot

### SDK 信息

- **npm**: `@github/copilot-sdk`
- **GitHub**: github/copilot-sdk
- **通信**: JSON-RPC over stdio (default) or TCP; SDK manages CLI process lifecycle
- **多平台**: TS, Python, Go, .NET, Java, Rust

### 能力矩阵

| 能力 | 状态 | 说明 |
|------|------|------|
| 多轮对话 | ✅ | Multi-turn sessions |
| 流式输出 | ✅ | session.on("assistant.message_delta", ...) |
| 内置工具 | ✅ | File system, Git, web requests |
| 自定义工具 | ✅ | MCP server integration |
| MCP 集成 | ✅ | Local/stdio + remote HTTP/SSE |
| 会话管理 | ✅ | Session history with get_messages() |
| BYOK | ✅ | OpenAI, Azure, Anthropic, Ollama |
| 多用户认证 | ✅ | GitHub OAuth, PAT, env vars |
| 权限处理 | ✅ | onPermissionRequest callback |
| Elicitation | ✅ | Form-based UI dialogs |
| 无限会话 | ✅ | Automatic context compaction |
| Hooks | ✅ | System message transform hooks |
| 模型列表 | ✅ | client.listModels() |

### 关键接口模式

```typescript
import { CopilotClient } from '@github/copilot-sdk';

const client = new CopilotClient();
const session = await client.createSession({
  model: 'gpt-4o',
  tools: [{ /* MCP tools */ }],
});

session.on("assistant.message_delta", (delta) => { /* handle */ });
await session.send("Fix the bug in auth.ts");
```

## 5. Pi (Earendil Works)

### SDK 信息

- **npm**: `@mariozechner/pi-coding-agent`
- **GitHub**: earendil-works/pi
- **通信**: In-process (pure TS library, no subprocess); alternative RPC mode over stdin/stdout
- **特殊**: 不需要外部 CLI，直接在进程内运行 agent loop

### 能力矩阵

| 能力 | 状态 | 说明 |
|------|------|------|
| 多轮对话 | ✅ | Multi-turn with message queuing |
| 流式输出 | ✅ | session.subscribe() |
| 内置工具 | ✅ | Read, Write, Edit, Bash, Grep, Find, Ls |
| 自定义工具 | ✅ | TypeBox schema-based tool definitions |
| MCP 集成 | 未确认 | 需进一步确认 |
| 会话管理 | ✅ | JSONL files, tree-based branching, resume, fork |
| 扩展系统 | ✅ | TypeScript modules with full API access |
| Skills 系统 | ✅ | Markdown-based capability packages |
| Prompt 模板 | ✅ | Hierarchical discovery |
| 主题 | ✅ | Customizable with live reload |
| 多提供商 | ✅ | 12+ providers (Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, Cerebras, xAI, HuggingFace, OpenRouter, Ollama) |
| OAuth 订阅 | ✅ | Claude Pro/Max subscription login |
| 上下文压缩 | ✅ | Automatic token limit management |
| HTML 导出 | ✅ | Session export |
| 成本追踪 | ✅ | Per-session token and cost tracking |

### 关键接口模式

```typescript
import { createAgentSession } from '@mariozechner/pi-coding-agent';

const session = await createAgentSession({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
});

session.subscribe((event) => { /* handle streaming */ });
await session.send("Fix the bug in auth.ts");
```

## 6. 横向对比 — 对 Adapter 设计的影响

### 6.1 通信模式对比

```text
Claude Code:  [Plugin] --JSONL/stdin/stdout--> [Claude CLI] --HTTPS--> [Anthropic API]
Codex:        [Plugin] --JSONL/stdin/stdout--> [Codex CLI]  --HTTPS--> [OpenAI API]
Copilot:      [Plugin] --JSON-RPC/stdio/TCP--> [Copilot CLI] --API--> [GitHub Copilot]
Pi:           [Plugin] --direct function calls--> [Agent Loop] --HTTPS--> [Multi-provider]
```

### 6.2 进程管理差异

| Agent | 需要管理子进程 | CLI 安装方式 | 健康检查 |
|-------|--------------|-------------|---------|
| Claude Code | 是 | npm install 自带 | CLI 自行管理 |
| Codex | 是 | 需单独安装 | CLI 自行管理 |
| Copilot | 是 | npm install 自带 | SDK 自行管理 |
| Pi | 否 | npm install 即可 | 不需要 |

### 6.3 对 AgentService 接口设计的影响

1. **start()/stop() 语义不同**：
   - Claude/Codex/Copilot: spawn/manage CLI subprocess
   - Pi: 初始化 in-process agent loop

2. **进程管理需要抽象化**：
   - 定义 `AgentProcessManager` 接口
   - 子进程型 agent 共用一套逻辑
   - Pi 用 no-op 实现

3. **流式事件需要归一化**：
   - 各 SDK 的事件格式不同
   - 需要统一归一化到已有的 `StreamChunk` 类型（src/core/types/chat.ts）
   - 每个 adapter 负责转换

4. **会话持久化模型不同**：
   - Claude: JSONL files
   - Codex: ~/.codex/sessions
   - Copilot: session history
   - Pi: JSONL files + tree branching

5. **权限模型差异大**：
   - Claude: approval callbacks + hooks
   - Codex: approvalPolicy (full-auto/auto-edit/suggest)
   - Copilot: onPermissionRequest callback
   - Pi: 未确认

## 7. 风险和未知

| 风险 | 影响程度 | 缓解措施 |
|------|---------|---------|
| Copilot SDK 仍处于 Preview，API 可能变化 | 中 | adapter 隔离变更影响 |
| Codex 需要单独安装 CLI | 低 | 提供 install 检测和引导 |
| Pi 是个人项目，长期维护存疑 | 中 | adapter 隔离，随时可移除 |
| 各 SDK 的事件粒度差异大 | 高 | 定义粗粒度统一事件 + agent-specific 扩展 |
| 4 个 SDK 的 bundle size 对插件大小的影响 | 需评估 | 按需加载 / dynamic import |
