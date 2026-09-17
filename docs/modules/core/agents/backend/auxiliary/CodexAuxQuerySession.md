# CodexAuxQuerySession

> **源码**: `src/core/agents/backend/auxiliary/CodexAuxQuerySession.ts`
> **状态**: [REVIEW]

## 概述

在 Codex app-server 协议上实现 `AuxQuerySession`，用 **ephemeral thread + read-only sandbox** 提供辅助查询。

## 职责

- 创建 ephemeral thread（`thread/start { sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true }`）：app-server 不落盘 rollout，`thread/list` 也不会返回它，因此辅助工作无法泄漏进聊天会话列表或 `~/.codex/sessions`
- 回合以 `turn/start` 提交，并显式带 `sandboxPolicy: { type: 'readOnly', networkAccess: false }`
- `verifyEffectiveSettings()`：读取 app-server 自己的 `getThreadEffectiveSettings()` 回读，断言 sandbox 为 `readOnly`、network 未开启、approval 为 `never`；不符即抛错（fail closed），并把这三项写入 `safety.effectiveTools`
- 复用适配器持有的 app-server 客户端（`approvalPolicy: 'never'` 保证不会向聊天侧审批处理器发起请求），只订阅本 thread 的通知
- R-A4 图片附件：`buildTurnInput` 在**系统临时目录**（`opencodian-aux-image-` 前缀，与聊天侧 `opencodian-codex-image-` 区分）解码 base64 为真实文件，按聊天侧 app-server 形态追加 `{type:'localImage', path}` 输入项；回合 finally 删除临时目录，`dispose()` 再清扫一遍残留（vault 快照审计的硬前提）
- R-A3 流式发射：`item/agentMessage/delta` 经 `mapAppServerNotification` 逐 delta 累积 `onTextChunk(累计文本)`（本 backend 原生逐 token 流式）
- 通过 `mapAppServerNotification` 收集助手文本与 `tool_use` 名称，写入 `AuxQueryResult.toolCalls`
- 单条用户消息里只放用户的 prompt 原文；系统提示词不再拼进消息文本
- `followUp()` 在同一 thread 上继续；`cancel()` 调 `turn/interrupt`；`dispose()` 清理客户端侧 settings 缓存

## 依赖

- `../CodexAppServerClient`、`../CodexAppServerStreamMapper`
- `../AgentAuxQueryCapability`、`src/shared/logger.ts`

## 维护约束

- ephemeral thread 没有 rollout，**不要**调用 `archiveThread`（app-server 会返回 "no rollout found"）；清理只涉及客户端缓存
- aux 系统提示词走 `thread/start` 的 `developerInstructions`（Codex 自己的 thread 指令注入点，已对 codex-cli 0.154.0 用行为实验验证；字段见 `codex app-server generate-json-schema` 的 `ThreadStartParams`）。它保留 Codex 自身的 base instructions，因此模型仍知道怎么用工具；安全论证不依赖这段文本。仓库里「Codex 没有 instructions 接缝」的旧说法已过时
- Codex 在只读 sandbox 内仍保留 shell 工具，因此服务层的写类审计会把任何 shell 调用视为违规并丢弃结果（`docs/requirements/inline-edit.md` §5.5）；这是有意为之的 fail-closed 行为
- 回读失败（`getThreadEffectiveSettings` 为空）必须直接拒绝会话，禁止只依赖请求参数
