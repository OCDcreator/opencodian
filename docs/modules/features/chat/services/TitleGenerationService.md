# TitleGenerationService

> **源码**: `src/features/chat/services/TitleGenerationService.ts`
> **状态**: [DRAFT]

## 概述

AI 驱动的对话标题生成服务。通过创建临时 OpenCode 会话，将用户的首条消息配合专用系统提示发送给 AI 模型，解析响应为简洁标题（≤50 字符），生成完毕后删除临时会话。支持每对话并发生成、单独/全部取消，以及通过 `aiTitleModel` 设置覆盖使用的模型。

## 导入关系

**上游**:
- `../../../core/prompts/titleGeneration` — `buildTitleGenerationPrompt`, `buildTitleGenerationSystemPrompt`, `normalizeTitleGenerationLocale`
- `../../../main` — `OpenCodianPlugin` 实例

**下游**: `OpenCodianView` — 在首条用户消息发送后触发标题生成。

## 核心类型 / 接口

```typescript
type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult,
) => Promise<void>;
```

## 核心逻辑

### 生成流程
1. 取消同一对话的进行中生成（`cancelConversation`）
2. 创建 `AbortController` 存入 `activeGenerations`
3. 解析模型：优先使用 `aiTitleModel` 设置，否则跟随当前会话模型
4. 构建系统提示和用户提示（用户消息截断至 600 字符）
5. 创建临时会话 `createSession('Title Generation', { setCurrent: false })`
6. 发送非流式请求 `requestAssistantResponse()`
7. 解析 AI 响应首行为标题，清理引号/标点/列表标记，限制 50 字符
8. 回调通知结果
9. 清理：删除临时会话、移除 activeGenerations 记录

### 模型解析
`resolveModel()` 支持两种 `aiTitleModel` 格式：
- `provider/model` — 拆分为独立的 provider 和 model
- `model` — 使用当前 provider + 指定 model

### 标题解析
`parseTitle()` 从 AI 响应中提取标题：
- 取首行非空文本
- 移除 `title:` 前缀、引号包裹、列表标记
- 移除末尾标点符号（中英文）
- 超过 50 字符截断加 `...`

## 关键方法

| 方法 | 说明 |
|------|------|
| `generateTitle(conversationId, userMessage, currentModel, callback)` | 生成对话标题（异步） |
| `cancelConversation(conversationId)` | 取消指定对话的标题生成 |
| `cancelAll()` | 取消所有进行中的标题生成 |

## 数据流

```
用户发送首条消息
  → OpenCodianView 触发 generateTitle()
    → 创建临时会话
    → requestAssistantResponse(prompt, { system, provider, model })
    → parseTitle(response)
    → callback(conversationId, { success, title })
    → OpenCodianView 更新对话标题
    → deleteSession(tempSessionId)
```

## 与其他模块的交互

- **OpenCodianView**: 触发入口，接收回调更新对话标题
- **OpenCodeService**: 创建临时会话、发送非流式请求、删除会话
- **core/prompts/titleGeneration**: 系统提示和用户提示构建
- **StorageService**: 更新后的标题持久化

## 配置项

- `aiTitleModel` — 标题生成使用的模型覆盖（格式：`provider/model` 或 `model`），为空则跟随当前会话模型
- `locale` — 影响标题语言（`zh` → 中文标题，`en` → 英文标题）
- `titleMode` — 标题模式（`default` 使用默认标题，`ai` 使用 AI 生成）

## 注意事项

- 同一对话同时只允许一个标题生成任务（新任务自动取消旧任务）
- 用户消息截断至 600 字符，避免长消息消耗过多 token
- 临时会话始终在 `finally` 块中清理，即使生成失败
- `AbortController` 用于支持取消操作，但实际取消依赖信号检查而非真正的网络中断
- 回调错误被静默吞掉（`safeCallback`），不影响主流程

## 待补充

- [ ] `titleGeneration` 系统提示的具体内容
- [ ] 对话 `titleGenerationStatus` 状态机的完整流转
- [ ] AI 标题生成失败时的重试策略
