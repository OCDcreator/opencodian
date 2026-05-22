# LocalStreamMessagePersistence

> **源码**: `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
> **状态**: [REVIEW]

## 概述

`LocalStreamMessagePersistence` 负责把本地 stream 收尾结果真正写回 conversation。它把 assistant message 构建、notice message 追加、shell dataset 回填和第一次 `saveConversation()` 从 `StreamLocalFinalizer` 中进一步拆开。

## 公开函数

```typescript
persistLocalStreamOutcome(options): Promise<void>
```

## 关键行为

- 有 content blocks 时：
  - 若本轮只需要 canonical 后续收敛，正常 completed assistant 会先把本地 cache 写回延后给 canonical finalization
  - 只有 interrupted / error / questionResolution 等 client-only 边界需要保留时，才构建并落库 assistant `ChatMessage`
  - 需要本地落库时，把 `streamState: 'interrupted'`、`contentBlocks`、`questionResolution`、`structured` 一并写入
  - 需要本地落库时，回填 streaming shell 的 `data-message-id` / `data-source-message-id`
- 只有 error notice 或 interrupted notice 时：
  - 追加对应 notice message
  - 记录本地持久化阶段的 debug 日志
- 只要本地实际追加了 message / notice，就更新 `updatedAt`、`lastResponseAt` 并执行第一次本地保存
- 正常 completed assistant 在 canonical sync pending 时只做 cache-deferred 日志，不把 stale body 当作本地 truth 落盘
- 若 stream metadata 捕获到新的 backend session id，即使 assistant body 延后给 canonical sync，也会单独通过 serialized write 更新 conversation `backendSessionId`

## 协作模块

- `sendPipelineContent`：负责 block 映射
- `StreamShellFinalizer`：负责把占位 shell 变成最终 DOM 形态
- `StreamLocalFinalizer`：负责 orchestration

## 注意事项

- 这里是“本地第一次保存”，不是最终 authoritative sync。
- backend session identity 更新比较的是 `getConversationBackendSessionId()` 的有效值，避免只有 legacy `openCodeSessionId` 的 OpenCode 会话被误判为需要额外写盘。
- interrupted notice 与 interrupted assistant message 是两条不同保底路径：前者用于“没有可见内容”，后者用于“已有部分内容但流被中断”。
- question resolution 是明确的 client-only decoration，允许随本地 recovery 写回，但不会把 assistant body 重新定义成本地 truth。
