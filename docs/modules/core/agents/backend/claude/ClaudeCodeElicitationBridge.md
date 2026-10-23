# ClaudeCodeElicitationBridge

> **源码**: `src/core/agents/backend/claude/ClaudeCodeElicitationBridge.ts`
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



## SDK >= 0.3.2xx request_user_dialog 桥（2026-09-02）

- `buildClaudeCodeUserDialogQuestionRequest(request)`：把 `UserDialogRequest` 转成共享问题卡。`refusal_fallback_prompt` 有已知 payload 契约（`originalModel` / `fallbackModel` / `apiRefusalCategory?` / `guidanceText?` / `retractedMessageUuids?`，契约从 CLI 2.1.x 二进制提取），映射为 "Retry with fallback model / Edit prompt" 两选项；未知 dialogKind 生成通用说明卡。
- `buildClaudeCodeUserDialogResult(dialogKind, response)`：问题卡应答映射回 `UserDialogResult`——接受 `retry_fallback` / `edit_prompt`（CLI 内部枚举）；cancel/decline/null/未知应答一律 `{behavior:'cancelled'}`，即 CLI 应用对话框默认行为（与未接线时完全一致，fail-safe）。


## 2026-10-13 畸形表单的建卡前拒绝

`buildClaudeCodeElicitationQuestionRequest` 在既有函数内检查 requestedSchema、properties 与 property 的对象形状，并仅接受未声明 type 或 string/number/integer/boolean/array 类型。非对象、null、数组形状与未知字段类型在返回问题卡前抛出固定安全错误。无 schema、合法空对象/空 properties、URL preview 与已支持字段的选项、顺序、content coercion 保持原路径。main 的宿主 handler 接住拒绝并返回 decline（已 abort 则 cancel），不调用 renderer、不记录原始 schema 或异常文本。

原 MATRIX014 八项负控断言保持原文；补充 main handler 的零 renderer 拒绝与合法正控，并直接回归只读 Capability Lab synthetic wiring probe。验证范围是 source/mock，未调用真实 SDK/model/native/UI、未部署，不晋升原矩阵 profile。

## 目录定位（2026-10-23）

- 源码位置：`src/core/agents/backend/claude/ClaudeCodeElicitationBridge.ts`。
- 原位置：`src/core/agents/backend/ClaudeCodeElicitationBridge.ts`；文件名、导出接口与业务职责保持不变。
