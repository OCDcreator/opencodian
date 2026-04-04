# Chat Types

> **源码**: `src/core/types/chat.ts`
> **状态**: [DRAFT]

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
| `ImageMediaType` | 图片 MIME 类型联合（jpeg/png/gif/webp） |
| `ImageAttachment` | base64 编码的图片附件 |
| `PromptContextKind` | `'current_note' \| 'selection' \| 'file'` |
| `PromptContextItem` | 上下文条目（id, kind, path, label, mime, lineRange?, textSnapshot?） |
| `MessageContextAttachment` | 消息级上下文附件 |

### 会话与消息

| 类型 | 说明 |
|------|------|
| `ChatMessage` | 聊天消息（id, role, content, timestamp, contentBlocks, toolCalls, images, contextAttachments, omo, questionResolution, parts） |
| `ContentBlock` | 消息内容块（text/thinking/tool_use/tool_result/subagent） |
| `ToolCallInfo` | 工具调用信息（id, name, input, status, result） |
| `ConversationMeta` | 会话元数据（不含消息体） |
| `Conversation` | 完整会话（含 messages 数组） |

### 流式事件

| 类型 | 说明 |
|------|------|
| `StreamChunk` | 联合类型，13 种流式事件（text, thinking, tool_use, tool_result, file_edited, message_metadata, usage, error, message_start, message_stop, content_block_start, content_block_stop, permission_request, question_request） |

### OMO 兼容

| 类型 | 说明 |
|------|------|
| `OmoUserInjectionMeta` | OMO 用户注入提示元数据（modeTag, injectedPrompt, originalText, headline） |
| `OmoSystemReminderMeta` | OMO 系统提醒元数据（reminderType, reminderText, tasks） |
| `OmoMessageMeta` | `OmoUserInjectionMeta \| OmoSystemReminderMeta` |

### 上下文用量

| 类型 | 说明 |
|------|------|
| `UsageInfo` | token 使用信息 |
| `TabContextState` | 标签页级上下文状态（估算/精确 token、费用、模型信息） |
| `ContextBreakdownSegment` | 上下文分段统计 |

### 问题系统

| 类型 | 说明 |
|------|------|
| `QuestionPrompt` | 问题提示（question, header, options, multiple?, custom?） |
| `QuestionRequest` | 问题请求（id, sessionId, questions） |
| `QuestionResolution` | 问题解决状态（answered/rejected + answers） |

## 核心逻辑

### 消息角色模型
- `ChatMessage.role`: `'user' | 'assistant'`
- 用户消息可携带 `contextAttachments`（上下文文件/笔记/选区）和 `images`（图片附件）
- 助手消息可携带 `contentBlocks`（结构化内容）、`toolCalls`、`omo`（OMO 元数据）、`questionResolution`

### 内容块类型
`ContentBlock.type` 支持五种：
- `text` — 文本内容
- `thinking` — AI 推理过程
- `tool_use` — 工具调用
- `tool_result` — 工具结果
- `subagent` — 子代理调用

### 流式事件管道
`StreamChunk` 联合类型覆盖了从 `message_start` 到 `message_stop` 的完整事件链，中间可穿插 `text`、`thinking`、`tool_use`/`tool_result`、`file_edited`、`usage` 等事件。

## 关键方法

| 方法 | 说明 |
|------|------|
| `createEmptyTabContextState()` | 创建空白的标签页上下文状态对象 |

## 数据流

1. 用户发送消息 → 构建 `ChatMessage`（role='user'）
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

## 配置项

无直接配置，类型定义影响所有使用聊天功能的模块。

## 注意事项

- `ChatMessage.parts` 类型为 `unknown[]`，存储 OpenCode 原始 SDK parts 用于高级功能
- `ChatMessage.streamState` 目前仅支持 `'interrupted'`，标记被取消的流
- `ChatMessage.displayStyle` 为 `'notice'` 时表示系统通知消息，使用不同的渲染模板
- `Conversation.openCodeSessionId` 是 OpenCode 服务端的会话 ID，与本地 `Conversation.id` 不同
- `ContentBlock.durationSeconds` 仅用于 `thinking` 类型块

## 待补充
- [ ] 补充 `SessionDiffEntry` 的使用场景说明
- [ ] 记录 `subagent` 类型内容块的完整字段
- [ ] 补充 `StreamChunk` 事件在 SDK v2 和旧 SSE 路径中的映射关系
- [ ] 记录 `ChatNoticeAction` 类型的完整路由逻辑
