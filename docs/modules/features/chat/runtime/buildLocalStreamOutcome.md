# buildLocalStreamOutcome

> **源码**: `src/features/chat/runtime/buildLocalStreamOutcome.ts`
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
