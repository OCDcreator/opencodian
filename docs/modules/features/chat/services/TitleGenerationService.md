# TitleGenerationService

> **源码**: `src/features/chat/services/TitleGenerationService.ts`
> **状态**: [REVIEW]

## 概述

`TitleGenerationService` 为“首条用户消息后自动生成会话标题”提供异步封装。它自身不更新对话对象，真正的标题写回由调用方 `OpenCodianView.startAiConversationTitleGeneration()` 提供回调完成。

## 核心类型

```typescript
export type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

export type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult
) => Promise<void>;
```

## 内部状态

类内部只有一个状态容器：

```typescript
private readonly activeGenerations = new Map<string, AbortController>();
```

键是 `conversationId`，值是该对话当前的取消控制器。

## 关键行为

### 标题生成流程

`generateTitle()` 的顺序是：

1. 先取消同一对话已有任务
2. 创建新的 `AbortController` 并写入 `activeGenerations`
3. 解析模型来源
4. 规范化 locale
5. 把用户首条消息归一化并截断到 600 字符
6. 创建临时 OpenCode session：`createSession('Title Generation', { setCurrent: false })`
7. 用 `requestAssistantResponse()` 发送非流式请求
8. 如果期间已被取消，直接返回
9. 解析模型响应首行，生成最终标题
10. 通过回调把结果交回调用方
11. 在 `finally` 中移除活动记录，并尝试删除临时 session

### 模型选择

`resolveModel()` 读取 `plugin.settings.aiTitleModel`：

- 空字符串：沿用当前会话的 `{ provider, model }`
- `provider/model`：分别拆成 provider 和 model
- 仅写 `model`：沿用当前 provider，只覆盖 model

### 标题解析

`parseTitle()` 的规则是：

- 只取第一个非空行
- 去掉 `title:` 前缀
- 去掉首尾引号和列表标记
- 去掉尾部中英文标点
- 超过 50 个字符时截断为 47 个字符再补 `...`

解析失败会返回 `null`，随后 `generateTitle()` 会以 `success: false` 回调。

## 模块关系

- 上游依赖：`../../../core/prompts/titleGeneration`、`../../../main`
- 下游消费者：`OpenCodianView`

## 注意事项

- `cancelConversation()` 和 `cancelAll()` 只会 `abort()` 本地控制器；源码里没有把这个 signal 传给 `requestAssistantResponse()`，所以取消语义是“忽略后续结果”，不是强制中断服务端请求。
- `safeCallback()` 会吞掉回调抛出的错误，避免影响标题任务清理逻辑。
