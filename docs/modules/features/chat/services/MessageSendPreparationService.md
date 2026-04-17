# MessageSendPreparationService

> **源码**: `src/features/chat/services/MessageSendPreparationService.ts`
> **状态**: [REVIEW]

## 概述

`MessageSendPreparationService` 负责接管 `sendMessage()` 在真正发起 stream 之前的 preparation / bootstrap orchestration：

- 确认当前 conversation、active tab 与 tab runtime 是否可发送
- 处理 foreground busy、server readiness、model catalog 与 selected model availability 检查
- 在发送前解析 `Conversation.externalContextPaths`，并与一次性的 composer draft context 合并
- 落地 optimistic user message，并保持现有 save / render / scroll 时序
- 维持首条 user message 的 fallback title 与 AI title kickoff 条件
- 在 stream 真正开始前，统一进入 streaming 状态并通过 composer send-context 端口清理 pending edited files / draft context items

它不直接调用 `openCodeService.sendMessage()`，也不消费 stream chunk。真实的 stream 调用、chunk router、pending/timeout/interruption，以及 stream 结束后的 finalization 现在由 `runtime/SendPipelineRuntime.ts` / `MessageFinalizationService` 接手。

## 公开接口

```typescript
export function buildOptimisticUserMessage(
  content: string,
  draftContextItems: PromptContextItem[],
  now?: number,
): ChatMessage;

export class MessageSendPreparationService {
  prepareMessageSend(options: PrepareMessageSendOptions): Promise<PreparedMessageSend | null>;
  enterStreamingState(tabId: TabId | null): void;
  completePreparedStreamStart(tabId: TabId | null): void;
}
```

## 关键行为

### preflight 判定

- 若当前没有 conversation，会先通过 host 触发“按现有 UI 规则新建会话”的路径
- 如果 active tab 不存在、runtime 无法建立，直接中止
- 如果前台 tab 已经处于 streaming / busy / retry，调用 host 统一走现有 blocked notice

### optimistic bootstrap 时序

- 先完成 server readiness 与 model availability 检查
- 再通过 `ComposerContextViewFacade.sendContext` 读取 draft context，并把 `Conversation.externalContextPaths` 解析成持久 `PromptContextItem[]`
- 两类上下文按 target key 合并：持久路径先铺底，同 target 的一次性 draft context 覆盖旧条目
- optimistic user message 使用合并后的 context items 构造 `contextAttachments`
- 保持既有顺序：
  - reset / arm background task indicator
  - append 到 conversation
  - `startConversationSyncLoop()`
  - `saveConversation()`
  - `renderMessage()`
  - `scrollToBottom()`

### 首条消息标题逻辑

- 只有当前 conversation 在 optimistic append 之后，user message 数量为 `1` 时，才进入 first-message title 路径
- fallback title 始终先于 AI title kickoff
- 是否启动 AI title generation 仍由 view 当前设置决定

### stream 进入点

- `enterStreamingState()` 只负责：
  - 设置 `isStreaming`
  - 同步 tab stream-like UI 状态
  - 开始 context usage stream
- `completePreparedStreamStart()` 只负责：
  - 清空 pending edited files
  - 通过 composer send-context 端口清空一次性的 draft context items（持久路径仍保留在 conversation 上）

这让发送子系统可以把“真正的 stream 调用”下沉到 `SendPipelineRuntime`，同时把 preparation 阶段的状态时序单独测住。

## 与 `OpenCodianView` 的边界

- `SendPipelineRuntime` 负责真实 `sendMessage()` stream 调用与 chunk 消费
- `MessageSendPreparationService` 只负责决定“能不能发、发之前先做什么、optimistic user message 是否已落地”
- `MessageSendPreparationService` 只消费 `ComposerSendContextPort`，不需要知道完整 composer/context facade 的 action、picker、focus-preview 或 lifecycle 入口
- `MessageFinalizationService` 继续负责 stream 结束之后的 final sync、patch/rerender、todo/save/attention 收尾
