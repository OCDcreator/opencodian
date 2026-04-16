# ConversationRenderRuntime

> **源码**: `src/features/chat/services/ConversationRenderRuntime.ts`
> **状态**: [REVIEW]

## 概述

`ConversationRenderRuntime` 承接 `ConversationRenderService` 里已成型但仍挤在同一文件内的消息渲染 runtime：

- `ConversationRenderHost`、assistant shell/tail ports 与 user frame 等共享 render contract
- `getIncrementalRenderedMessageUpdate()` 的 append-only / tail-patch 判定
- persisted assistant / user message 的基础 render delegate
- synced assistant pseudo-stream reveal
- synced update 的 incremental apply、tail patch fallback 与 background indicator follow-up

它不决定整段 conversation 何时 full rerender，也不执行 trailing assistant patch 的成功/失败控制流；这些仍由 `ConversationRenderService` 调度。该文件只是把基础消息渲染与 synced append flow 从顶层 service 中拆出，避免 service 同时承担 contract、leaf render delegate 与 high-level orchestration。

## 公开接口

```typescript
export function getIncrementalRenderedMessageUpdate(
  options: IncrementalRenderedMessageUpdateOptions,
): IncrementalRenderedMessageUpdate | null;

export interface ConversationRenderHost;
export interface ConversationAssistantShellRenderPort;
export interface ConversationAssistantTailRenderPort;

export class ConversationMessageRenderDelegate {
  renderMessage(message: ChatMessage): Promise<HTMLElement | void | undefined>;
  renderMessages(messages: ChatMessage[]): Promise<void>;
  rerenderSingleUserMessage(previousMessageId: string, message: ChatMessage): Promise<void>;
  renderSyncedMessages(messages: ChatMessage[]): Promise<void>;
}

export class ConversationSyncedUpdateApplyDelegate {
  apply(previousMessages: ChatMessage[], nextMessages: ChatMessage[]): Promise<void>;
}
```

## 关键行为

- incremental helper 继续只比较 `getMessagesForRender()` 后的 rendered sequence，非尾部 signature 变化或消息数量回退时返回 `null`
- synced append path 会先尝试 patch trailing assistant，再渲染新增消息并刷新 background-task indicator
- plain text assistant append 继续走 pseudo-stream reveal；notice、question resolution 与 structured blocks 仍直接使用 persisted assistant shell
- user message rerender 继续复用 host 提供的 frame/body/footer callbacks，不在 runtime 内创建新的 view dependency

## 与 `ConversationRenderService` 的边界

- `ConversationRenderService` 保留 full rerender、scroll restore、trailing assistant patch success/failure logging 与 public API
- `ConversationRenderRuntime` 只承接基础消息 render delegate 和 synced append apply delegate
- `ConversationTrailingAssistantPatchPlanner` 独立承接 tail patch preflight，避免 runtime 再持有 DOM target 解析责任
