# SendPipelineTypes

> **源码**: `src/features/chat/runtime/SendPipelineTypes.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineTypes` 是发送 runtime 子目录的共享契约层。它把原先散落在 `OpenCodianView`、`SendPipelineRuntime` 与测试里的匿名结构收拢成稳定类型，方便把发送链路继续拆到更细粒度的模块。

## 关键类型

- `SendPipelineTabRuntime`：发送链路真正需要读写的 tab 级 streaming 状态切片，并暴露可选 session status snapshot 供本地收尾读取 retry message
- `SendPipelineStreamController` / `SendPipelineStreamElements`：stream shell 与流式渲染控制器边界
- `SendPipelinePreparationPort` / `SendPipelineFinalizationPort`：对 `MessageSendPreparationService` 与 `MessageFinalizationService` 的窄接口。preparation port 还暴露 `consumeQueuedFollowUpSend()`，供 stream finalization 后按 tab 取回一条 queued send-intent 并重新走正常 send path
- `SendPipelineViewPort` / `SendPipelineTransportPort` / `SendPipelineShellPort` / `SendPipelinePersistencePort` / `SendPipelineDebugPort`：把发送 host 面按职责拆开的窄 port；其中 transport port 现在显式接收完整 `Conversation`、backend-neutral `sessionId`、preparation 阶段生成的稳定 `messageID` / `requestParts`，并支持可选 top-level `agent`、一次性的 `outputFormat`（用于 Claude Code 和 Codex `/json` 结构化输出触发），以及可选的 `images`（`ImageAttachment[]`，用于 Codex `local_image` 输入）；persistence port 暴露 conversation write ticket + commit，而不是直接 save conversation；shell port 保留 streaming shell 创建、reveal、notice placeholder 渲染、timestamp 收尾，以及流式结构化输出 badge 注入（`renderStructuredOutputIfPresent`），并由 `AssistantShellRenderer.ts` 统一实现 shell adapter
- `SendPipelineTransportPort.applyContextUsageSnapshotToTab()`：将 `context_usage` 精确快照交给 tab coordinator；与旧的逐回合 `usage` 增量分开，避免把账号或估算数当作会话上下文
- `SendPipelineTransportPort.getFriendlyStreamErrorMessage(rawMessage, backend)`：格式化真实 error 与空流 fallback 时显式接收当前 `AgentBackendKind`，由 router 传入 conversation backend，避免 backend 专属错误文案被 OpenCode 默认值覆盖
- `SendPipelineHost`：由上述 port 组合出来的完整宿主契约，方便 view 侧一次性装配
- `SendPipelineHostDependencies`（定义在 `SendPipelineRuntime.ts`）：扁平依赖接口，让 `OpenCodianView` 只需提供原始回调而不负责 port 分组；`createSendPipelineRuntimeHost()` 工厂函数消费此接口并组合成 `SendPipelineHost`
- `SendPipelineExecutionHost` / `StreamChunkRouterHost` / `StreamLocalFinalizerHost`：runtime、router 与本地收尾各自真正依赖的 host 子集
- `SendPipelineTraceState`：chunk router 汇总出来的流状态快照
- `SendPipelineTraceState.finalizedBackendSessionId`：从最终 `message_metadata.sessionId` 捕获的 backend-neutral session identity，允许 Claude Code 等 backend 将本地临时 handle 收敛为真实 SDK session id
- `SendPipelineTraceState.resolvedUserMessageIdentity`：从 `user_message_identity.uuid` 捕获的 Claude SDK user message id，用于 trace 与本地持久化对齐
- `StreamChunkRouterOptions` / `StreamChunkRouterResult`：stream 消费阶段输入输出；`StreamChunkRouterResult.structuredOutput` 承载从 `backend_event` 捕获的 Claude 结构化输出 payload，`StreamChunkRouterResult.resolvedUserMessageIdentity` 承载从 `user_message_identity` 捕获的 user UUID
- `LocalStreamOutcome` / `StreamLocalFinalizerOptions` / `StreamLocalFinalizerResult`：本地收尾阶段输入输出，其中 `LocalStreamOutcome.finalizedBackendSessionId` 负责把 router 捕获的 backend session id 交给持久化层，`LocalStreamOutcome.structuredOutput` 负责把结构化输出 payload 交给持久化层，`LocalStreamOutcome.resolvedUserMessageIdentity` 负责把 Claude user message UUID 交给持久化层

## 设计目的

- 让 `SendPipelineRuntime` 只装配依赖，不再内联庞大的匿名对象类型
- 让 `StreamChunkRouter`、`StreamLocalFinalizer` 与更小的 helper 模块共享同一套状态形状
- 让 send preparation 生成的 stable `messageID + parts[]` 以及可选显式 main `agent` 能通过类型层明确传到 transport，而不是再次退回匿名字段
- 让 busy-tab follow-up 只通过 preparation port 暴露为一次性 send-intent，避免把 queued prompt 误建成 message truth source
- 让本地 assistant/error notice persistence 通过 serialized conversation write boundary 写回 compatibility cache，避免 stream finalization 与 authoritative sync 交错覆盖
- 让 Claude SDK user message UUID 能以 `resolvedUserMessageIdentity: string | null` 的形式从 router 传到 local outcome，再由持久化层写入 optimistic user message 的 `sourceMessageId`
- 让发送链路里的每个子模块只声明自己真正需要的 host port，避免 `SendPipelineHost` 继续膨胀成新的隐形大接口
- 让单测可以只 mock 必需能力，而不是构造整个 `OpenCodianView`

## 注意事项

- `SendPipelineHost` 仍然只是内部协作契约，不是插件对外 API。
- 新增 host 能力时，优先先判断它属于 view / transport / shell / persistence / debug 哪个 port，再决定是否真的需要扩张完整 `SendPipelineHost`。
- 纯 notice message 构造优先放在 `AssistantNoticeRenderer.ts` 这类 helper，而不是继续塞回 shell port。
- 新的发送 helper 应优先扩展这里的类型，而不是继续在实现文件里发散匿名结构。
- `SendPipelineTabRuntime` 只收录发送链路真正关心的字段；不要把整个 view runtime 状态无差别搬进来。
