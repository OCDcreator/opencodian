# MessageSendPreparationService

> **源码**: `src/features/chat/services/MessageSendPreparationService.ts`
> **状态**: [REVIEW]

## 概述

`MessageSendPreparationService` 负责接管 `sendMessage()` 在真正发起 stream 之前的 preparation / bootstrap orchestration：

- 确认当前 conversation、active tab 与 tab runtime 是否可发送
- 处理 foreground busy、server readiness、model catalog 与 selected model availability 检查
- 在发送前解析 `Conversation.externalContextPaths`，并与一次性的 composer draft context 合并
- 在 preparation 阶段通过 `AgentInvocationService` 把显式 agent intent 翻译成 top-level main `agent` 与 native invocation parts
- 先构造稳定 `messageID + parts[]` send payload、seed canonical user message，再落地 optimistic user message，并保持现有 save / render / scroll 时序
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
  ensureServerReadyForChat(availability: Exclude<SendPreparationServerAvailability, 'running' | 'external'>): Promise<boolean>;
  createServerReadinessDelegate(): { ensureServerReadyForChat: (availability: ...) => Promise<boolean> };
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
- 基于合并后的 context items 向 `OpenCodeService` 请求稳定 `messageID + parts[]` send payload；如果上游额外提供 `syntheticTextParts`，这些插件注入文本会继续以结构化 synthetic parts 进入 payload，而不是改写 `userMessage.content`
- 如果上游提供 `invocationIntent`，`AgentInvocationService` 会先把它解析成 top-level main `agent` 与 `agent` / `subtask` native parts；这些 invocation parts 会和普通 parts 一起进入稳定 payload，而不是被拼回纯文本
- 先把同一批稳定 `optimisticUserParts` seed 到 canonical session graph，再构造本地 optimistic user message；plugin synthetic parts 因此属于 canonical part truth，而不是靠 fallback `Conversation.messages.content` 重建
- optimistic user message 继续使用合并后的 context items 构造 `contextAttachments`，但不把本地 UI bubble 直接当成最终真相
- 保持既有顺序：
  - `seedCanonicalUserMessage()`
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
- `MessageSendPreparationService` 只负责决定"能不能发、发之前先做什么、optimistic user message 是否已落地"
- `PreparedMessageSend` 现在还会把稳定 `messageID`、transport `requestParts`、canonical `optimisticUserParts`，以及解析后的 `resolvedAgentInvocation` 一并交给 `SendPipelineRuntime`
- `MessageSendPreparationService` 只消费 `ComposerSendContextPort`，不需要知道完整 composer/context facade 的 action、picker、focus-preview 或 lifecycle 入口
- `MessageFinalizationService` 继续负责 stream 结束之后的 final sync、patch/rerender、todo/save/attention 收尾

## 服务器就绪提示编排

`MessageSendPreparationService` 拥有服务器不可用时的 action card 提示流程：

- `ensureServerReadyForChat()` 在服务器不处于 `running` / `external` 时展示交互式 action card，提供三个按钮：启动服务 / 跳过 / 打开设置
- 用户选择"启动"后，禁用按钮并调用 `startServer()`，成功后刷新状态并移除 card，失败则通过 `MessageFinalizationService` 显示错误
- 用户选择"跳过"或"设置"后，重新检查服务器状态，若已就绪则移除 card 继续，否则通过 `MessageFinalizationService` 显示不可用错误
- `refreshStatusSurfaces()` 统一刷新 badge 和 settings tab 的服务器状态显示

`OpenCodianView` 不再拥有 `ensureServerReadyForChat` 或 `refreshStatusSurfaces`；这些职责通过 host 接口原语（`createAssistantShellContainer`、`getUnavailableServerPromptMessage`、`finalizeAssistantMessageWithServerError` 等）委托回 view。`SlashCommandExecutionService` 通过 `createServerReadinessDelegate()` 获取服务器就绪回调，直接 spread 到 host adapter 中，不再在 OpenCodianView 中出现 `ensureServerReadyForChat`。
