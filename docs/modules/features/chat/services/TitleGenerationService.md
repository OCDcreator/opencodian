# TitleGenerationService

> **源码**: `src/features/chat/services/TitleGenerationService.ts`
> **状态**: [REVIEW]

## 概述

`TitleGenerationService` 负责“首条用户消息后异步生成会话标题”。它不直接修改 conversation，而是把结果通过回调交回 `OpenCodianView`。

最近这块逻辑的关键变化有两点：

- 标题请求现在优先等待 OpenCode 官方 session title；官方标题仍保持默认值或读取失败时才进入本地兜底生成
- 标题请求现在优先走结构化输出 `json_schema`
- `aiTitleModel` 不再盲信配置值，而是会结合模型目录和 `disabledModelRefs` 做 availability-aware 拦截

## 核心类型

```typescript
export type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

export type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult
) => Promise<void>;

export interface TitleGenerationOptions {
  sessionId?: string;
  officialPollAttempts?: number;
  officialPollIntervalMs?: number;
}
```

内部状态仍然很简单：

```typescript
private readonly activeGenerations = new Map<string, AbortController>();
```

## 关键行为

### 生成流程

`generateTitle()` 的顺序是：

1. 取消同一 conversation 已存在的标题任务
2. 建立新的 `AbortController`
3. 通过 `conversationId` 解析 backend 和 `backendSessionId`；调用 `readBackendSessionTitle()` 路由 helper，通过 registry 获取 backend adapter 的 `getSession(sessionId)` 读取官方标题；等待官方后台 `ensureTitle()` 把默认标题改成真实标题
4. 如果拿到非默认官方标题，直接回调成功，不创建本地临时 session
5. 官方标题仍是默认值、读取失败或超时后，才进入本地兜底：通过 `resolveModel()` 解析标题模型
6. 按 locale 构建标题 prompt 与 system prompt
7. 截断用户首条消息到 600 字符
8. 创建临时 session：`createSession('Title Generation', { setCurrent: false })`
9. 调用 `requestAssistantResponse(...)`
10. 优先从 `response.structured.title` 提取标题，失败时再回退到文本首行解析
11. 通过回调把结果交回调用方
12. 在 `finally` 中删除活动记录并 best-effort 清理临时 session

官方标题识别规则与 OpenCode upstream 对齐：`"New session - <ISO>"` 与 `"Child session - <ISO>"` 仍视为默认标题，不会作为成功标题返回。只有官方和本地兜底都无法产出标题时，调用方才会收到 `success: false` 并展示标题生成失败状态。

### 标题模型解析

`resolveModel()` 的行为比旧文档更严格：

- 未配置 `aiTitleModel`：直接沿用当前会话模型
- 配置了非法模型引用：回退到当前会话模型
- 配置了合法引用但当前模型目录不可用：直接让标题生成失败，不再偷偷回退到当前会话模型

这里会显式调用：

- `modelConfigService.getCatalogs(modelSourceMode, disabledModelRefs)`
- `resolveModelSelection(baseEffective, effective, provider, model)`

所以标题生成会尊重：

- 当前 `modelSourceMode`
- provider 级禁用
- `disabledModelRefs`

### 标题提取

提取顺序现在是：

1. `extractStructuredTitle(response?.structured)`
2. `parseTitle(response?.content ?? '')`

`normalizeTitleCandidate()` 会统一处理：

- `title:` 前缀
- 首尾引号
- 列表标记
- 尾部中英文标点
- 50 字符上限截断

## 与其他模块的交互

- `OpenCodianView`: 发起标题生成并接收结果回调
- `AgentBackendRouting.readBackendSessionTitle()`: backend-aware session 标题读取路由，通过 `getSession()` 获取 session 详情并提取标题
- `OpenCodeService`: 官方标题失败后创建临时 session、发送非流式请求、删除临时 session（AI 标题生成路径保持 OpenCode-only）
- `core/prompts/titleGeneration.ts`: 提供 locale-aware prompt 和 system prompt
- `ModelConfigService`: 用于 availability-aware 标题模型解析

## 注意事项

- `cancelConversation()` / `cancelAll()` 仍然只是本地忽略结果，不会强制中断服务端请求；官方标题轮询会在 abort 后停止等待。
- 结构化输出不是唯一来源；如果模型没返回 `structured.title`，仍会回退到纯文本解析。
- 设置页会保留不可用的 `aiTitleModel` 并显示警告按钮，提醒用户该功能当前不会生效。
- 只有在“无法读取可用性信息”这类解析异常时，才会回退到当前会话模型。
