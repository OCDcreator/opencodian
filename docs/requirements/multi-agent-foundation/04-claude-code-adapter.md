# Claude Code Adapter 设计

> **状态**: `[RESEARCHED-DRAFT]`
> **最后更新**: 2026-05-20
> **优先级**: P1 — 第一个非 OpenCode backend
> **证据文档**: `docs/status/claude-code-full-capability-research-2026-05-20.md`
> **当前状态快照**: `docs/status/claude-code-current-state-2026-05-22.md`
> **专项 spec**: `docs/superpowers/specs/2026-05-20-claude-code-full-capability-design.md`
> **实施计划**: `docs/superpowers/plans/2026-05-20-claude-code-full-capability-implementation.md`

## 概述

Claude Code adapter 应以 `@anthropic-ai/claude-agent-sdk` 的 TypeScript `query()` streaming API 为主路径，封装为 OpenCodian 的 backend adapter。CLI/executable path 支持只作为 SDK 打包、PATH、Electron 启动问题的兜底，不应把 OpenCodian 设计成 raw CLI wrapper。

本文件是接入设计，不表示生产代码已经完成。

## 1. 官方当前事实

| 维度 | 结论 |
|---|---|
| npm 包 | `@anthropic-ai/claude-agent-sdk` |
| 当前核实版本 | `0.3.145` (`npm view @anthropic-ai/claude-agent-sdk version`) |
| 推荐 API | `query({ prompt, options })`，返回 async generator |
| 持久聊天 | `prompt` 可为 `AsyncIterable<SDKUserMessage>`，适合 OpenCodian chat |
| 流式输出 | `includePartialMessages: true` 可收到 partial stream events |
| SDK V2 sessions | 官方文档存在冲突；Phase 1 禁用 V2 session API |
| 进程模型 | TS SDK 通过 optional dependency bundled Claude Code executable，也支持 `pathToClaudeCodeExecutable` |
| Electron 说明 | 官方未找到 Electron 专项说明；必须用本地 smoke 验证 |
| 认证 | API key / Bedrock / Vertex / Azure 等 env provider；不要默认假设第三方产品可透传 claude.ai 订阅登录 |

## 2. 官方能力矩阵

| 能力 | 官方状态 | OpenCodian 策略 |
|---|---|---|
| query / persistent query | 已确认 | Phase 1 使用 persistent query + cold-start fallback |
| stream handling | 已确认 | 新建 Claude stream normalizer 到 `StreamChunk` |
| model selection | 已确认 | Claude 专属 model catalog，不复用 OpenCode provider merge |
| effort / thinking | 已确认 | 映射到 Claude 专属设置，避免和 OpenCode 语义混淆 |
| permission modes | 已确认 | 保留 Claude 模式：`default`/`dontAsk`/`acceptEdits`/`bypassPermissions`/`plan`/`auto` |
| `canUseTool` | 已确认 | 桥接到现有 permission/question UI |
| tools / built-ins | 已确认 | 渲染层共用，tool identity 增加 Claude source metadata |
| disallowed tools | 已确认 | 作为 Claude policy，不当作通用 sandbox |
| MCP servers | 已确认 | Phase 1 runtime pass-through；配置 authoring 后置 |
| hooks | 已确认 | 内部 hook 可先用；完整 UI 后置 |
| subagents / agents | 已确认 | `Agent` tool 和基础结果渲染先验证；文件 agent 管理后置 |
| session resume / fork | 已确认 | 需要 `backendSessionId`，不能继续只用 `openCodeSessionId` |
| CLAUDE.md / settings | 已确认但默认值文档冲突 | 显式设置 `settingSources` |
| skills | 已确认 | SDK/CLI 文件系统发现优先，authoring 后置 |
| additional directories | 已确认 | 外部上下文映射到 `additionalDirectories`，变更需要 restart |

## 3. `claudian` 对照结论

`claudian` 不是 raw CLI wrapper。它的 Claude provider 主体是 SDK-native，并在 Obsidian/Electron 外围补了大量适配层：

| 区域 | SDK 原生 | `claudian` 自补层 | OpenCodian 取舍 |
|---|---|---|---|
| query | `agentQuery()` | `MessageChannel`、persistent query、cold-start fallback、crash recovery | 复制模式，不照搬实现 |
| permissions | `canUseTool` | approval UI bridge、AskUserQuestion、plan exit、allow-always updates | 必须有桥接层 |
| process | SDK executable option/custom spawn | CLI resolver、PATH enhancement、Node 入口归一、AbortSignal workaround | 概念上必须借鉴 |
| sessions | SDK JSONL | local metadata、provider state、history rebuild、JSONL parser | Phase 1 只做映射，完整解析后置 |
| MCP | `mcpServers` / `setMcpServers` | `.claude/mcp.json` + `_claudian` metadata + mention gating | 先 runtime，后 authoring |
| settings | `settingSources` | provider scoped settings and migration | 显式设置源，不解析 CLAUDE.md |
| subagents | Agent tool/init messages | file catalog、fallback built-ins、Stop hook、sidecar parsing | 分阶段接 |

## 4. OpenCodian 当前落点

当前 Phase 0 已经有：

- `src/core/agents/backend/AgentService.ts`
- `src/core/agents/backend/AgentServiceRegistry.ts`
- `src/core/agents/backend/OpenCodeAdapter.ts`
- `Conversation.backend`
- `SettingsBackendSection` 的 implemented-backend gate

但 Claude Phase 1 之前仍缺：

- backend-neutral `sendMessage/createSession/cancelStream` contract；
- `Conversation.backendSessionId` 或等价 session id 抽象；
- Send Pipeline 从 `plugin.openCodeService.sendMessage()` 迁移到 active backend；
- Claude adapter、options builder、stream normalizer、permission bridge、process resolver；
- Claude settings owner；
- Obsidian Electron runtime proof。

## 5. Adapter 结构

```text
src/core/agents/backend/
├── ClaudeCodeAdapter.ts
├── ClaudeCodeOptionsBuilder.ts
├── ClaudeCodeStreamNormalizer.ts
├── ClaudeCodePermissionBridge.ts
└── ClaudeCodeProcessResolver.ts
```

核心职责：

- `ClaudeCodeAdapter`: owns SDK query lifecycle, message channel, session mapping, cancellation, diagnostics.
- `ClaudeCodeOptionsBuilder`: maps OpenCodian settings to SDK `Options` and sets `settingSources` explicitly.
- `ClaudeCodeStreamNormalizer`: maps SDK messages to `StreamChunk`.
- `ClaudeCodePermissionBridge`: maps `canUseTool` / AskUserQuestion into existing UI flows.
- `ClaudeCodeProcessResolver`: handles bundled/external executable, PATH, Node-backed entrypoints, and Electron spawn.

## 6. Session 策略

OpenCode 当前是显式 `createSession -> prompt`；Claude 是 query 首次启动/首次响应后获得 SDK session id。

设计：

```typescript
interface Conversation {
  backend?: AgentBackendKind;
  backendSessionId?: string;
  backendAgentId?: string;
  openCodeSessionId?: string; // legacy/OpenCode compatibility only
}
```

- Old conversations: `backend ?? 'opencode'`, `backendSessionId ?? openCodeSessionId`.
- Claude conversations: use `backendSessionId` for SDK session id; `openCodeSessionId` remains compatibility-only until schema can be safely relaxed.
- Existing `acpSessionId` should be migrated/genericized to `backendSessionId`; do not keep adding parallel session-id fields.
- Phase 1: store/resume backend session id.
- Phase 3: import/parse Claude JSONL and support fork/resume-at.

## 7. Phase 1 最小闭环

Phase 1 不是“只接一个聊天 prompt”。它必须包含：

1. SDK import + executable/spawn diagnostics.
2. Claude-owned conversation creation and `backendSessionId` persistence.
3. Persistent query streaming.
4. Text/thinking/tool/result/usage normalization.
5. `canUseTool` approval bridge.
6. AskUserQuestion bridge.
7. Basic MCP server pass-through.
8. Model/thinking/effort options.
9. Explicit `settingSources`.
10. OpenCode disabled/enabled regression proof.

## 8. 后置能力

Phase 2:

- richer model catalog;
- executable diagnostics UI;
- additional directories restart UX;
- MCP runtime controls.

Phase 3:

- JSONL history import;
- resume/fork/resume-at UI;
- subagent sidecar validation;
- backend-aware history/sync services.

Phase 4:

- skills authoring;
- `.claude/agents` authoring;
- hooks editor;
- `.claude/mcp.json` authoring.

Phase 5:

- complete capability dashboard;
- cross-backend settings polish;
- runtime diagnostics export.

## 9. 风险与回滚

| 风险 | 缓解 |
|---|---|
| SDK API drift | Pin version in implementation and test against package types. |
| Electron spawn failure | Custom spawn + executable path fallback + runtime diagnostics. |
| Optional binary missing | Detect and instruct user to configure external executable. |
| Permission mismatch | Keep Claude permission modes separate from OpenCode modes. |
| Session schema coupling | Add `backendSessionId`; keep `openCodeSessionId` legacy path. |
| Claude UI overexposure | Keep `IMPLEMENTED_AGENT_BACKENDS` gate until smoke passes. |
| OpenCode regression | Phase 0 and Phase 1 must run focused OpenCode tests plus `npm run verify`. |

## 10. 验收标准

- `npm run verify` passes.
- Module docs and graphify are fresh after `src/**` edits.
- Claude adapter contract tests pass with mocked SDK.
- Runtime smoke proves SDK executable starts in Obsidian Electron.
- Claude persistent query streams text and tool events.
- Permission/question flows work.
- Claude can resume a backend session after reload.
- OpenCode new session/send/history remains green with Claude installed but disabled.
