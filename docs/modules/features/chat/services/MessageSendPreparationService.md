# MessageSendPreparationService

> **源码**: `src/features/chat/services/MessageSendPreparationService.ts`
> **状态**: [REVIEW]
> **最近更新**: Busy-tab follow-up enqueue

## 概述

`MessageSendPreparationService` 负责接管 `sendMessage()` 在真正发起 stream 之前的 preparation / bootstrap orchestration：

- 确认当前 conversation、active tab 与 tab runtime 是否可发送
- 处理 foreground busy、server readiness、model catalog 与 selected model availability 检查
- 在发送前解析 `Conversation.externalContextPaths`，并与一次性的 composer draft context 合并
- 在 preparation 阶段通过 `AgentInvocationService` 把显式 agent intent 翻译成 top-level main `agent` 与 native invocation parts
- 先构造稳定 `messageID + parts[]` send payload、seed canonical user message，再落地 optimistic user message，并保持现有 save / render / scroll 时序
- 维持 OpenCode 首条 user message 的 fallback title 与 AI title kickoff 条件
- 在 stream 真正开始前，统一进入 streaming 状态并通过 composer send-context 端口清理 pending edited files / draft context items

它不直接调用 `openCodeService.sendMessage()`，也不消费 stream chunk。真实的 stream 调用、chunk router、pending/timeout/interruption，以及 stream 结束后的 finalization 现在由 `runtime/SendPipelineRuntime.ts` / `MessageFinalizationService` 接手。

## 公开接口

```typescript
// Submission types used by the composer input pipeline:
export interface CommandComposerSubmission {
  kind: 'command';
  rawContent: string;
  command: string;
  arguments: string;
  syntheticTextParts?: PromptSyntheticTextPartInput[];
  precedingText?: string; // text before /command when slash appears mid-input
}

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
  consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null;
}

export interface MessageSendPreparationHostDependencies { /* flat view deps */ }

export function createMessageSendPreparationHost(
  deps: MessageSendPreparationHostDependencies,
): MessageSendPreparationHost;
```

`PrepareMessageSendOptions.skipSlashCommand` 是 send runtime 消费的控制字段，preparation 本身不解释；它用于 markdown file command template 重新进入普通 prompt path 时避免再次触发 slash command interception。

`SendPreparationServerAvailability` 现在额外包含 `disabled`，专门表示“当前没有任何 enabled backend，或当前聊天 surface 没有一个可用的 backend truth”，不再借用 `offline` 去表达配置层关闭状态。

## 关键行为

### preflight 判定

- 若当前没有 conversation，会先通过 host 触发“按现有 UI 规则新建会话”的路径
- 如果 active tab 不存在、runtime 无法建立，直接中止
- 如果前台 tab 已经处于 busy，会先尝试把当前 prompt send-intent 存为该 tab 的一个 queued follow-up；入队只在本 tab 正在 streaming 且具备明确 post-stream 出队触发时成功。server-busy、retry、同 session 其他 tab streaming、或该 tab 已有 queued follow-up 时，保持既有 blocked notice 语义。
- queued follow-up 会携带 `targetTabId`，重新进入 preparation 时必须仍指向 active tab；如果用户已经切到别的 tab，preparation 会中止，避免把 queued intent 发进错误 conversation。
- busy enqueue 只发生在 conversation、active tab 与 tab runtime 均存在之后；缺失 canonical/session 上下文时直接中止，不创建 queued prompt。
- preparation 现在通过 `getConversationBackendSessionId()` 解析 backend-neutral session id。旧 OpenCode conversation 会继续使用 `openCodeSessionId`；未来 Claude conversation 可只带 `backendSessionId`。如果 conversation 没有任何 backend session id，preparation 会复位 lifecycle 并中止，不 seed canonical user message，也不入队 follow-up。

### optimistic bootstrap 时序

- 先完成 server readiness 与 model availability 检查
- 再通过 `ComposerContextViewFacade.sendContext` 读取 draft context，并把 `Conversation.externalContextPaths` 解析成持久 `PromptContextItem[]`
- 两类上下文按 target key 合并：持久路径先铺底，同 target 的一次性 draft context 覆盖旧条目
- 基于合并后的 context items 向 `OpenCodeService` 请求稳定 `messageID + parts[]` send payload；如果上游额外提供 `syntheticTextParts`，这些插件注入文本会继续以结构化 synthetic parts 进入 payload，而不是改写 `userMessage.content`
- Skill 展开通过 `SkillContentExpander` 完成，返回的 `syntheticParts`（不再是 `syntheticBlocks`）会映射为带 metadata 的 synthetic text parts：`{ text, ignored: false, metadata: { kind: 'skill-expansion', skillName } }`，使下游渲染层能识别并隐藏 skill 合成内容
- 如果上游提供 `invocationIntent`，`AgentInvocationService` 会先把它解析成 top-level main `agent` 与 `agent` / `subtask` native parts；这些 invocation parts 会和普通 parts 一起进入稳定 payload，而不是被拼回纯文本
- selected `@agent` 的 source span 会先从 transport text part 中剔除，避免同一 mention 同时以普通文本和 native `agent` part 发送；optimistic user bubble 仍保留用户实际输入的可见文本
- 先把同一批稳定 `optimisticUserParts` seed 到当前 backend session 的 canonical session graph，再构造本地 optimistic user message；plugin synthetic parts 因此属于 canonical part truth，而不是靠 fallback `Conversation.messages.content` 重建
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
- 这条路径当前只属于 `conversation.backend === 'opencode'`（缺省旧会话也按 OpenCode 处理）。Claude Code conversation 不会调用 `applyFallbackConversationTitle()` 或 `startAiConversationTitleGeneration()`，避免在 Claude Code 尚未接入标题机制时触发 OpenCode 专用逻辑。

### backend model options

- OpenCode 与 Claude Code conversation 都会走 model catalog preparation，确保 composer 选择的 model / effort 在 stream transport 前成为 `PreparedMessageSend.modelOptions`
- Claude Code 的 `modelOptions.variant` 表示 Claude Code effort，不再依赖 OpenCode provider model variants
- `PrepareMessageSendOptions.outputFormat` 允许 send pipeline 为单条消息注入结构化输出 schema；`prepareMessageSend()` 会在构造完 `modelOptions` 后将其合并进去，使该 schema 能随 `sendStreamMessage` options 到达 backend adapter
- 其他未接入 model capability 的 backend 仍可通过 host `shouldUseModelCatalog()` 保持跳过

### stream 进入点

- `enterStreamingState()` 只负责：
  - 设置 `isStreaming`
  - 同步 tab stream-like UI 状态
  - 开始 context usage stream
- `completePreparedStreamStart()` 只负责：
  - 清空 pending edited files
  - 通过 composer send-context 端口清空一次性的 draft context items（持久路径仍保留在 conversation 上）
- `consumeQueuedFollowUpSend()` 只把 tab runtime 上的一次性 follow-up send-intent 交回 send pipeline；真正的 optimistic append、canonical seed 与 transport 仍复用下一次 `prepareMessageSend()` 的正常路径。

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
- 当 availability 为 `disabled` 时，primary CTA 改为“Enable backend”，点击后直接打开设置而不是误调用 `startServer()`；这样聊天 surface 会把“没有任何 enabled backend”和“backend offline”区分成两种恢复路径
- 用户选择"启动"后，禁用按钮并调用 `startServer()`，成功后刷新状态并移除 card，失败则通过 `MessageFinalizationService` 显示错误
- 用户选择"跳过"或"设置"后，重新检查服务器状态，若已就绪则移除 card 继续，否则通过 `MessageFinalizationService` 显示不可用错误
- `refreshStatusSurfaces()` 统一刷新 badge 和 settings tab 的服务器状态显示

`OpenCodianView` 不再拥有 `ensureServerReadyForChat`、`refreshStatusSurfaces` 或 `createMessageSendPreparationSeam`；这些职责通过 host 接口原语委托回 view。`createMessageSendPreparationHost()` 工厂函数现在接收扁平的 `MessageSendPreparationHostDependencies`（原始 service 引用和简单 lambda），而非预组装的 host 回调——实际的回调装配逻辑由工厂完成，view 只提供原始依赖。`SlashCommandExecutionService` 通过 `createServerReadinessDelegate()` 获取服务器就绪回调，直接 spread 到 host adapter 中。
