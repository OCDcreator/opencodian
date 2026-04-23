# Chat Types

> **源码**: `src/core/types/chat.ts`
> **状态**: [REVIEW]

## 概述

聊天系统的核心数据模型，定义了消息、会话、流式事件、上下文附件、OMO 元数据、权限请求等类型。同时导出视图类型常量 `VIEW_TYPE_OPENCODIAN`。整个聊天 UI、存储层和流式渲染管道都依赖此模块的类型定义。

## 导入关系

上游: 无外部依赖
下游:
- `src/core/storage/StorageService.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/*`（StreamController, ThinkingBlockRenderer, ToolCallRenderer）
- `src/features/chat/tabs/*`
- `src/features/chat/ui/*`

## 核心类型 / 接口

### 基础类型

| 类型 | 说明 |
|------|------|
| `VIEW_TYPE_OPENCODIAN` | 常量 `'opencodian-view'`，Obsidian 视图注册 ID |
| `ImageMediaType` | 图片 MIME 类型联合（`'image/jpeg' \| 'image/png' \| 'image/gif' \| 'image/webp'`） |
| `ImageAttachment` | base64 编码的图片附件（`data`, `mediaType`, `filename?`） |
| `PromptContextKind` | `'current_note' \| 'selection' \| 'file'` |
| `PromptContextItem` | 上下文条目（`id`, `kind`, `path`, `label`, `mime`, `lineRange?`, `textSnapshot?`） |
| `PromptContextLineRange` | 行号范围（`startLine`, `endLine`） |
| `MessageContextAttachment` | 消息级上下文附件 |

### 会话与消息

| 类型 | 说明 |
|------|------|
| `ChatMessage` | 聊天消息（`id`, `role`, `content`, `timestamp`, `modelId?`, `summary?`, `compactionDivider?`, `sourceMessageId?`, `streamState?`, `displayStyle?`, `noticeTitle?`, `noticeTone?`, `noticeActions?`, `images?`, `toolCalls?`, `contentBlocks?`, `contextAttachments?`, `questionResolution?`, `omo?`, `parts?`） |
| `CompactionDividerMeta` | 结构化 compaction 分界元数据（`auto`, `overflow`, `tailStartId`） |
| `ContentBlock` | 消息内容块（`type: 'text' \| 'thinking' \| 'tool_use' \| 'tool_result' \| 'subagent'`，工具块可带 `toolKind?`、`toolMetadata?`、`toolResultVisibility?`） |
| `ToolCallInfo` | 工具调用信息（`id`, `name`, `kind?`, `input`, `toolMetadata?`, `status`, `result?`, `resultVisibility?`, `isExpanded?`） |
| `ConversationSessionSettings` | 会话级覆盖设置（`chatFontSizePx?`，支持 `null` 表示显式继承）。Compaction 配置已移至项目级 `.opencode/opencode.json`；手动 `session.summarize()` 仍是会话级动作，而不是这里的字段。 |
| `ConversationMeta` | 会话元数据（不含消息体） |
| `Conversation` | 完整会话（含 `messages` 数组，以及 `externalContextPaths?` / `sessionSettings?` 等本地元数据） |

### 流式事件

| 类型 | 说明 |
|------|------|
| `StreamChunk` | 联合类型，14 种流式事件（`text`, `thinking`, `tool_use`, `tool_result`, `file_edited`, `message_metadata`, `usage`, `error`, `message_start`, `message_stop`, `content_block_start`, `content_block_stop`, `permission_request`, `question_request`；其中 `tool_use` 可带 `kind?`、`toolMetadata?` 与 `toolResultVisibility?`） |

### OMO 兼容

| 类型 | 说明 |
|------|------|
| `OmoUserInjectionMeta` | OMO 用户注入提示元数据（`kind`, `modeTag`, `injectedPrompt`, `originalText`, `rawText`, `headline`） |
| `OmoSystemReminderMeta` | OMO 系统提醒元数据（`kind`, `reminderType`, `reminderText`, `rawText`, `headline`, `isInternalInitiator`, `tasks?`） |
| `OmoBackgroundTaskInfo` | 后台任务信息（`id`, `description`） |
| `OmoMessageMeta` | `OmoUserInjectionMeta \| OmoSystemReminderMeta` |
| `OmoReminderType` | `'background-task-completed' \| 'all-background-tasks-complete' \| 'generic'` |

### 上下文用量

| 类型 | 说明 |
|------|------|
| `UsageInfo` | Token 使用信息（`inputTokens`, `outputTokens`, `model`, `contextWindow`, `percentage`, `sessionId?`） |
| `TabContextState` | 标签页级上下文状态（估算/精确 token、费用、模型信息、会话元数据，以及 `compactingAt?` live compaction 时间戳） |
| `ContextBreakdownKey` | `'system' \| 'user' \| 'assistant' \| 'tool' \| 'other'` |
| `ContextBreakdownSegment` | 上下文分段统计（`key`, `tokens`, `width`, `percent`） |

### 问题系统

| 类型 | 说明 |
|------|------|
| `QuestionOption` | 选项（`label`, `description`） |
| `QuestionPrompt` | 问题提示（`question`, `header`, `options`, `multiple?`, `custom?`） |
| `QuestionRequest` | 问题请求（`id`, `sessionId`, `questions`） |
| `QuestionResolution` | 问题解决状态（`request`, `status: 'answered' \| 'rejected'`, `answers?`） |

### 会话差异与待办

| 类型 | 说明 |
|------|------|
| `SessionDiffEntry` | 会话差异条目（`file`, `patch?`, `before?`, `after?`, `additions`, `deletions`, `status?`） |
| `SessionTodo` | 会话待办项（`id?`, `content`, `status`, `priority?`） |

### 通知动作

| 类型 | 说明 |
|------|------|
| `ChatNoticeActionType` | `'open_model_settings' \| 'restore_rewind'` |
| `ChatNoticeAction` | 通知动作（`type`） |

## 核心逻辑

### 消息角色模型
- `ChatMessage.role`: `'user' \| 'assistant'`
- 用户消息可携带 `contextAttachments`（上下文文件/笔记/选区）和 `images`（图片附件）
- 助手消息可携带 `contentBlocks`（结构化内容）、`toolCalls`、`omo`（OMO 元数据）、`questionResolution`
- 助手消息可携带 `summary?: true`，当前用于把 OpenCode 原生 compaction report 保持成独立 assistant transcript 节点
- `displayStyle: 'notice'` 表示系统通知消息，使用不同的渲染模板
- `streamState: 'interrupted'` 标记被取消的流

### 内容块类型
`ContentBlock.type` 支持五种：
- `text` — 文本内容
- `thinking` — AI 推理过程（`durationSeconds?`）
- `tool_use` — 工具调用（`toolId`, `toolName`, `toolKind?`, `toolInput`, `toolMetadata?`, `toolResultVisibility?`；当前用于保留 OpenCode `task` child session id 并标记 raw task result 不可直接渲染）
- `tool_result` — 工具结果（`toolStatus`, `toolResult`）
- `subagent` — 子代理调用（`subagentId`, `subagentMode`）

### 流式事件管道
`StreamChunk` 联合类型覆盖了从 `message_start` 到 `message_stop` 的完整事件链：
1. 生命周期：`message_start` → ... → `message_stop`
2. 内容事件：`text`, `thinking`, `tool_use`, `tool_result`
3. 元数据：`message_metadata`, `usage`, `file_edited`
4. 交互事件：`permission_request`, `question_request`
5. 结构事件：`content_block_start`, `content_block_stop`
6. 错误：`error`

### 会话差异
`SessionDiffEntry` 记录单轮对话中的文件变更：
- 用于渲染"本轮修改了这些文件"通知
- `patch?`: SDK `1.4.x` 的 unified diff 文本；当前仅作为兼容字段保留
- `before?` / `after?`: legacy diff 形状兼容字段
- `status`: `'added' \| 'deleted' \| 'modified'`
- `additions`/`deletions`: 行数统计

### 会话待办
`SessionTodo` 记录会话级任务列表：
- `status`: `'pending' \| 'in_progress' \| 'completed' \| 'cancelled'`
- `priority?`: `'low' \| 'medium' \| 'high'`
- 通过 `session.todo()` 获取和 `todo.updated` 事件同步

## 关键方法

| 方法 | 说明 |
|------|------|
| `createEmptyTabContextState()` | 创建空白的标签页上下文状态对象，所有字段归零/置空 |

## 数据流

1. 用户发送消息 → 构建 `ChatMessage`（`role='user'`）
2. SSE 流开始 → `message_start` → 系列事件 → `message_stop`
3. 流事件映射为 `ContentBlock[]` 追加到助手 `ChatMessage.contentBlocks`
4. 完整消息持久化到 `StorageService`（JSON 序列化）
5. UI 从 `ChatMessage` 渲染消息气泡、工具卡片、权限卡片等

## 与其他模块的交互

- **OpenCodeService**: 将 SSE 事件解析为 `StreamChunk`，将服务端消息转换为 `ChatMessage`
- **StorageService**: 序列化/反序列化 `Conversation` 和 `ChatMessage`
- **StreamController**: 使用 `StreamChunk` 类型路由事件到对应渲染器
- **ToolCallRenderer**: 消费 `tool_use` / `tool_result` 事件
- **ThinkingBlockRenderer**: 消费 `thinking` 事件
- **TabManager**: 每个标签页维护独立的 `TabContextState`
- **SessionTodoDock**: 消费 `SessionTodo[]` 渲染待办列表

## 配置项

无直接配置，类型定义影响所有使用聊天功能的模块。

## 注意事项

- `ChatMessage.parts` 类型为 `unknown[]`，存储 OpenCode 原始 SDK parts 用于高级功能
- `ChatMessage.compactionDivider` 携带结构化 compaction 分界元数据（`auto`, `overflow`, `tailStartId`），替代旧 plain-text marker
- `ChatMessage.summary` 当前由 OpenCode 原生 assistant `summary` 字段透传，主要用于 compaction report 的 merge/render 语义
- `ChatMessage.streamState` 目前仅支持 `'interrupted'`，标记被取消的流
- `Conversation.openCodeSessionId` 是 OpenCode 服务端的会话 ID，与本地 `Conversation.id` 不同
- `normalizeConversationSessionSettings()` 会在会话读写时清理无效 override，并保留 `null` 形式的“显式继承”标记
- `ContentBlock.durationSeconds` 仅用于 `thinking` 类型块
- `toolMetadata` 当前是 UI-safe 白名单字段，主要用于 `task` / subagent 卡片的 child session linkage，不等于原始 OpenCode metadata 全量透传
- `toolResultVisibility: 'hidden'` 表示工具结果可保留给内部匹配/审计，但不应作为普通工具输出展示；当前主要用于 OpenCode 原生 `task`。
- `SessionDiffEntry` 来自 `session.diff()` API，在文件编辑后自动获取
- `SessionTodo` 通过 `global.syncEvent.subscribe()` 监听 `todo.updated` 事件更新
- 源码约 279 行

## 2026-04-23 Compaction config alignment

Ownership facts:

1. Compaction config is project-scoped and stored in `.opencode/opencode.json`.
2. Conversation session settings no longer own compaction; `ConversationSessionSettings` now only carries display-only `chatFontSizePx`.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not a conversation settings field.
