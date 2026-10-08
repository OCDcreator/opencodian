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
- canonical sync pending 时，会把已完成本地 shell 标记为 `data-canonical-message-id` / `data-canonical-sync-pending`；该标记只用于随后同 id 的 authoritative assistant 接管 DOM，不写入 conversation cache
- 若 stream metadata 捕获到新的 backend session id，即使 assistant body 延后给 canonical sync，也会单独通过 serialized write 更新 conversation `backendSessionId`
- Codex provisional → real thread upgrade：当新的 `backendSessionId` 从 `codex-local-*` 升级为真实 thread id 时，`persistLocalStreamOutcome()` / `persistBackendSessionIdentityIfNeeded()` 会过滤掉 conversation 中 `noticeMeta.kind === 'codex-provisional-warning'` 的过期 warning message，避免用户已建立真实线程后仍看到 provisional warning
- 若 stream 捕获到 `resolvedUserMessageIdentity`，`persistLocalStreamOutcome()` / `persistBackendSessionIdentityIfNeeded()` 会在 optimistic user message 尚无 `sourceMessageId` 时写入该 UUID，给 Claude conversation 提供 fork/rewind 所需的源消息 identity
- Claude resumed `/json` 多轮边界：即使 `streamContentBlocks` 被去重后为空，只要 `structuredOutput` 存在也必须落一条新的 assistant message，避免第二轮 structured turn 因“无可见 blocks”被跳过持久化
- 2026-05-28 Test Vault 运行时读回证据：`/Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/sessions/conv-1779938398375-kvkngkfzu.json` 中连续出现 `user(RESUME_JSON_A) -> assistant(structured A) -> user(RESUME_JSON_B) -> assistant(structured B)`

## 协作模块

- `sendPipelineContent`：负责 block 映射
- `StreamShellFinalizer`：负责把占位 shell 变成最终 DOM 形态
- `StreamLocalFinalizer`：负责 orchestration

## 注意事项

- 这里是“本地第一次保存”，不是最终 authoritative sync。
- backend session identity 更新比较的是 `getConversationBackendSessionId()` 的有效值，避免只有 legacy `openCodeSessionId` 的 OpenCode 会话被误判为需要额外写盘。
- user message identity 只在已有 optimistic user message 缺少 `sourceMessageId` 时补写，避免覆盖已持久化或 authoritative sync 带来的源消息 id。
- interrupted assistant / notice persistence 日志中的 `sessionId` 同样通过 `getConversationBackendSessionId()` 解析，不再直接读取 `conversation.openCodeSessionId`。
- interrupted notice 与 interrupted assistant message 是两条不同保底路径：前者用于“没有可见内容”，后者用于“已有部分内容但流被中断”。
- question resolution 是明确的 client-only decoration，允许随本地 recovery 写回，但不会把 assistant body 重新定义成本地 truth。

## 2026-10-05 Codex 消息前分支与恢复

Codex 权威单条 assistant text 与 native item/turn ID 先保存，再调用可选的当前会话重绘 callback 修正重试的显示残留；没有权威快照不会改写流内容。

Codex user sourceMessageId/sourceTurnId 在同一 conversation write 中持久化；无 assistant body 的身份收敛也使用既有 backend-session finalization 路径。


## 2026-10-09 S1：迟到取消回复的原轮次与时间

取消旧 send 的末尾可能晚于同 tab 替代 send 完成。旧 finalizer 仍保存自己的实际内容与 source message/turn ID；本模块在既有 serialized write 内根据 preparedSend.userMessage 的稳定本地 ID（或已知 sourceMessageId）定位发起 user，把本地 assistant/错误 notice/中断 notice 插到该 user 后、下一条 user 前，保留该轮已有消息。不会按结果时间全局排序、猜测 native 身份或丢弃 stale 回复。若原 user 已不存在，仍保留原有尾部写入保底，不按内容/时间猜另一轮。

updatedAt、lastResponseAt 分别取当前已保存值与本次 finalizedTimestamp 的最大值，避免迟到旧回复回退最近活动时间。消息自身 timestamp 与 native identity 保持真实原值。锚点查找、插入与时间更新均在 commitConversationWrite 的 write 回调中执行，使用提交时的当前数组。

既有 SendPipelineRuntime 测试覆盖 A取消后B启动，分别 A先释放/B先释放；真实 ConversationWriteSerializationService 参与两次保存，检查全量 user+assistant 顺序、保存镜像、render grouping、最新时间和替代轮次运行所有权。对应 LocalStreamMessagePersistence 测试检查迟到 error/interrupted notice、复制 user anchor 及 updatedAt 高于末次响应的情况。这是代码层回归，固定候选实机 B06/取消生命周期仍需独立验收。
