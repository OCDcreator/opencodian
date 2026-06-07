# ClaudeCodeElicitationBridge

> **源码**: `src/core/agents/backend/ClaudeCodeElicitationBridge.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeElicitationBridge.ts` 是 Claude Code Agent SDK MCP elicitation 到 OpenCodian question UI 的形状转换 helper。它只处理 SDK `ElicitationRequest` 的 host-side mapping，不负责启动 MCP server、不渲染 UI，也不把 MCP elicitation 标记为运行时通过。

这条路径必须与 `AskUserQuestion` 分开记录：`AskUserQuestion` 是 Claude 内置工具，通过 `canUseTool('AskUserQuestion', input, ...)` 进入 `ClaudeCodePermissionBridge`；MCP Elicitation 是 MCP server 在任务中请求结构化输入，通过 SDK `onElicitation(request, { signal })` 回调进入插件入口。

## 职责

- 将 form-mode `requestedSchema.properties[*]` 映射为 `QuestionRequest.questions`。
- 将 enum schema 映射为选项组；将非 enum scalar/schema 字段映射为 shared question UI 的 custom text input，避免静默丢弃字段。
- 将 array schema 映射为 `multiple: true`，将 string/number/boolean schema 映射为单值输入，并在 content 回传时对 number/boolean 做基础 coercion。
- 将 URL mode 或无 enum schema 的 request 映射为 `Accept` / `Decline` question，并在有 `url` 时把 URL 放进 preview。
- 将共享 question UI 返回的 `answers` 转换成 SDK elicitation `content`。
- 过滤 renderer override content，只保留 MCP-safe primitive values 和 `string[]`。

## 诚实边界

- 该 helper 的单元测试只证明 request/content 形状转换。
- 当前 mapping 不是完整 JSON Schema form authoring：复杂校验、嵌套 object 和 MCP server 侧 validation 仍未行为验证。
- Capability Lab 的 `MCP Elicitation` 行当前为 `runtimeProof: 'wiring'`：SDK option、entrypoint handler 和 shared question renderer mapping 已接线。
- 晋升到 `pass` 需要真实 MCP server 触发 elicitation request，并证明 server -> SDK `onElicitation` -> Obsidian UI -> 用户响应 -> SDK result -> server consumed result 的完整 roundtrip。
- 不得复用 `AskUserQuestion` 的普通聊天 proof 作为 MCP Elicitation proof。

## 依赖

- `@anthropic-ai/claude-agent-sdk`: `ElicitationRequest` 类型。
- `src/core/types`: `QuestionRequest` 类型。
- `src/main.ts`: 调用 helper 构造 question request 和 result content。

## 维护约束

- 不在 helper 中读取或写入插件设置。
- 不在 helper 中调用 renderer 或 Obsidian API。
- 不把 synthetic mapper probe 的结果写成 `pass`。
- 若 SDK elicitation schema 增加新的字段类型，优先在这里收口 mapping，并同步 focused unit tests。
