# buildLocalStreamOutcome

> **源码**: `src/features/chat/runtime/send/buildLocalStreamOutcome.ts`
> **状态**: [REVIEW]

## 概述

`buildLocalStreamOutcome` 是本地收尾阶段的纯推导函数。它只根据 router 输出、tab runtime、stream controller 当前 block、prepared send 和可选 session retry message，生成 `LocalStreamOutcome`，不做任何 DOM、副作用或持久化。

## 公开函数

```typescript
buildLocalStreamOutcome(options): LocalStreamOutcome
```

## 推导内容

- `finalizedTimestamp` / `finalizedModelId` / `finalizedAssistantMessageId` / `finalizedBackendSessionId`
- `streamContentBlocks` 与拼接后的 `streamedTextContent`
- `hasStreamContentBlocks`
- `shouldPersistInterruptedState`
- `streamErrorNoticeMessage`
- `shouldSyncFromServer`
- `structuredOutput`：透传 `StreamChunkRouterResult` 捕获的结构化输出 payload
- `resolvedUserMessageIdentity`：透传 `StreamChunkRouterResult` 捕获的 Claude SDK user message UUID

## 关键规则

- metadata 优先使用服务端 `message_metadata`，没有时才回退到本地时间和 active model
- `message_metadata.sessionId` 会被提升为 `finalizedBackendSessionId`，供本地持久化层在 canonical sync 延迟写 assistant body 时仍能更新 conversation identity
- `user_message_identity.uuid` 会被提升为 `resolvedUserMessageIdentity`，供本地持久化层把 optimistic user message 的 `sourceMessageId` 对齐到 Claude SDK user message id
- 只有“中断、未完成、且没有真实 error/retry message”时才保留 interrupted state
- 只有“没有 block 且有 error”时才通过 `AssistantNoticeRenderer.buildStreamErrorNotice()` 构建 error notice
- silent interrupted stream（无可见内容）如果遇到 session retry message，会复用 error notice path 展示服务端 retry 原因，而不是落到通用 interrupted notice；有部分可见内容时不触发此路径
- `shouldSyncFromServer` 只在 OpenCode/legacy 会话上复用 `MessageFinalizationService.shouldSyncAfterStream()`；Claude Code 和其他非 OpenCode 后端没有 authoritative OpenCode sync contract，正常完成的流必须保留在本地持久化路径
- 当 `routedStream.structuredOutput` 存在时，会通过 `filterDuplicateStructuredOutputTextBlocks()` 过滤掉与结构化输出内容重复的最后一个 text block，防止 raw JSON 在消息中重复出现

## 下游消费者

- `StreamLocalFinalizer`：拿到结果后再决定 shell finalization、conversation 持久化与是否进入最终 sync

## 注意事项

- 这个模块刻意保持纯函数，后续如果需要增加更多收尾判定，优先继续收敛到这里。

## 2026-09-27 OpenCode 2 compatibility

Completed OpenCode 2 turns schedule server history reconciliation through their own adapter after local stream finalization.

## 2026-10-05 Codex 消息前分支与恢复

纯文本 Codex 回合只有在 completed、无终止错误、native snapshot 与本轮 user owning turn 相同且无工具 block 时，才用权威最终文本收敛重试留下的 partial；其他后端和复杂回合保持原流数据。

可选 owning turn 从 routed stream 透传至本地持久化 outcome；缺失时保持既有输出结构。

2026-10-07 成功的 Pi prompt 与 OpenCode 两路径一样触发完成后的权威同步；Pi 同步走自己的 adapter，不请求 OpenCode service。失败、超时和中断保持本地路径；Codex、Claude、ZCode 的既有路由不变。

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/runtime/send/buildLocalStreamOutcome.ts`。
- 原位置：`src/features/chat/runtime/buildLocalStreamOutcome.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/chat/services/send/MessageFinalizationService.ts`、`src/features/chat/services/send/MessageSendPreparationService.ts`、`src/features/chat/runtime/rendering/AssistantNoticeRenderer.ts`、`src/features/chat/runtime/send/sendPipelineContent.ts`、`src/features/chat/runtime/send/SendPipelineTypes.ts`。
