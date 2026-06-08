# AgentBackendRouting

> **源码**: `src/core/agents/backend/AgentBackendRouting.ts`
> **状态**: [REVIEW]

## 概述

`AgentBackendRouting.ts` 是 backend registry 的窄路由 helper。它把 conversation 的 `backend` 字段解析为实际 adapter，并用 capability narrowing 返回 chat/session 能力，避免 `main.ts`、`OpenCodianView` 和发送管线继续直接假设所有会话都归 OpenCode 所有。

> **产品边界声明（2026-06-06）**: 本模块是**内部基础设施**，不是独立的产品功能。用户不直接与路由层交互；他们使用的是路由层所支持的下游功能（会话浏览器、恢复、分叉、标题读取等）。Capability Lab 中的 "Backend Routing" 诊断探针仅用于验证该基础设施，其 `userSurface` 保持为 `diagnostic`。

## 职责

- 将缺失 `conversation.backend` 的历史会话视为 `opencode`
- 从 `AgentServiceRegistry` 解析 conversation-owned backend adapter
- 提供 `hasChatCapability()` / `hasSessionCapability()` 类型收窄；`hasSessionCapability()` 保持 broad session routing 语义，adapter 声明 `sessions` 即可服务只读 session seams
- 提供 `hasSessionCreationCapability()` 作为新建会话的集中 guard；它要求 adapter 声明 `sessions` 且实现 `createSession` / `deleteSession` / `updateSessionTitle`，供 `createConversation()` 等创建路径使用，避免把只读 session adapter 误当成可创建 backend
- 提供 active session backend 与 conversation session/chat backend helper
- 提供 `getConversationSessionHistoryService()` 用于 session 消息读取路由，仅返回同时实现了 `getSessionMessages()` 的 session backend
- 提供 `getActiveSessionHistoryService()` 用于 active backend 的 session 消息读取路由，供无 conversation context 的消费方（如 settings inspection surface）使用
- 提供 `readBackendSessionTitle()` 用于 backend-aware session 标题读取路由，通过 `getSession(sessionId)` 获取 session 详情并按已 productize 的 backend kind 提取标题字段（OpenCode: `.title`，Claude Code: `.summary`）；未来 backend 在明确字段语义前返回 `null`
- 提供 `readBackendSessionShareUrl()` 用于 backend-aware session 分享链接读取路由，通过 `getSession(sessionId)` 获取 session 详情并按已 productize 的 backend kind 提取分享 URL（OpenCode: `session.share.url`；Claude Code 及其他 backend 目前无分享概念，返回 `null`）。这是一个**窄的 backend-aware session-detail read seam**，仅用于分享链接读取，不作为 generic stable cross-backend session-detail object contract
- 提供 `listBackendSessions()` 用于 active backend 的 session 列表路由，调用 `listSessions()` 并将原始结果归一化为 `NormalizedSessionRow[]`（`id`/`title`/`shareUrl`/`updatedAt`），使 settings inspection surface 不再直接依赖 OpenCode `Session` 类型；其中 `shareUrl` 只在 active backend kind 为 `opencode` 时从 `record.share.url` 提取，Claude Code / generic backend 即使返回兼容 `share` 字段也归一化为 `null`
- 提供 `getBackendSessionPreview()` 用于 active backend 的 session 消息预览路由，调用 `getSessionMessages()` 并将原始结果归一化为 `NormalizedSessionPreviewMessage[]`（`role`/`parts[]`），使 settings 预览不再假设 OpenCode `{info, parts}` 消息形状；当 backend 不支持该读取时返回 `null`，当 backend 支持但没有消息时返回空数组
- 提供 `getBackendSessionDetail()` 用于 active backend 的 session 详情读取路由，通过 `getSession()` 做 best-effort metadata 归一化并返回 `NormalizedSessionDetail`（`id`、`backendKind`、`title`、`summary`、`createdAt`、`updatedAt`、`customTitle`、`gitBranch`、`cwd`、`tag`、`fileSize`），供 settings/chat inspection surface 稳定展示详情；backend 不支持或读取失败时返回 `null`
- 提供 `loadBackendSessionMessages()` 用于从 backend 加载并归一化原始 session 消息。OpenCode 消息按 `{info, parts}` 形状解析，Claude / 其他 backend 使用 best-effort 通用归一化。当没有 session history service 或 `getSessionMessages` 返回非数组时返回 `[]`，避免在 OpenCode path 上直接对非数组值调用 `.map` 导致 runtime crash
- 提供 `NormalizedSessionRow`、`NormalizedSessionDetail`、`NormalizedSessionMessage`、`NormalizedSessionPreviewMessage`、`NormalizedSessionPreviewPart` 轻量类型，仅供 inspection surface 消费，不作为 stable cross-backend session contract

## 公共导出

| 导出 | 类型 | 说明 |
|------|------|------|
| `NormalizedSessionDetail` | interface | Active backend session 详情的 best-effort metadata 归一化结果，字段覆盖标题、摘要、时间、custom title、git branch、cwd、tag 和文件大小 |
| `getBackendSessionDetail()` | async function | 调用 active backend `getSession()` 并归一化为 `NormalizedSessionDetail`，作为 session detail inspection surface 的稳定 seam；不可用或失败时返回 `null` |

## 维护约束

- 这里只做 registry lookup 和 capability narrowing，不做 fallback 业务逻辑。
- 不在这里启用或注册 backend；可见 backend 仍由 `IMPLEMENTED_AGENT_BACKENDS` 和 settings normalization 控制。
- 新增 backend capability 路由时优先扩展此 helper，避免在 UI owner 中散落 `as AgentXCapability` 类型断言。
- 2026-05-23 的边界测试补强覆盖了 `listBackendSessions()` 非数组返回、`getBackendSessionPreview()` 非数组返回、`loadBackendSessionMessages()` 非数组返回以及 Claude content block 的 malformed / primitive 防御路径；这些用例只是在加固已有 backend-aware seams 的鲁棒性，没有新增任何共享 `getSession()` consumer
- 2026-05-23 第二轮 runtime-safety 加固为 `listBackendSessions()`、`getBackendSessionPreview()`、`loadBackendSessionMessages()` 的 `.map()` 回调增加了 null item 过滤，防止 backend 返回的数组中包含 `null` 或 primitive 元素时 destructuring / property access 抛出异常；同时为 `readBackendSessionTitle()` 和 `readBackendSessionShareUrl()` 的 `getSession()` 调用增加了 try/catch，使这两个已 productize 的 narrow read seam 在 adapter 抛异常时返回 `null` 而不是将错误抛给调用方
- 2026-05-23 第三轮 runtime-safety 加固为 `listBackendSessions()` 的 `listSessions()` 调用和 `getBackendSessionPreview()` 的 `getSessionMessages()` 调用增加了 try/catch，使这两个已 productize 的 read seam 在 adapter 抛异常时分别返回 `[]` 和 `null`，避免将错误抛给 settings UI 等调用方
- 2026-05-23 第四轮 runtime-safety 加固为 `getBackendSessionPreview()` 的 OpenCode `{info, parts}` 归一化路径增加了 `parts` 内部 null / primitive item 过滤，防止 backend 返回的 `parts` 数组中包含 `null` 或 primitive 元素时 `part.type` 属性访问抛出 TypeError；该修复与 Claude content block 路径已有的 null 过滤保持一致
- 2026-05-24 boundary slice 收紧 `listBackendSessions()` 的分享链接归一化：只有 active OpenCode backend 的 row 会保留 `share.url` 为 `shareUrl`，Claude Code / generic backend 的 session 预览、title/summary、updatedAt 归一化仍保留，但非 OpenCode `share.url` 不再驱动 settings shared-session 列表
- 2026-06-06 Claude SDK 嵌套信封归一化修复：`getBackendSessionPreview()` 和 `loadBackendSessionMessages()` 现在在尝试通用 `record.content` 之前先检测 Claude SDK 的 `{ type, message: { role, content } }` 嵌套信封形状；role 从 `record.message.role` 提取（而非 `record.type`），content 从 `record.message.content` 提取（而非 `record.content`）。这修复了 backend session browser 预览窗格和 resume seed 消息对 Claude Code 会话显示为空的 bug——之前的代码路径不识别嵌套信封，fallback 为 `json` part type，而 UI 只渲染 `text` part
- 2026-06-06 session detail seam：新增 `NormalizedSessionDetail` 和 `getBackendSessionDetail()`，把 `getSession()` 原始结果中的 metadata 归一化为只读 inspection surface 可稳定使用的字段；该 seam 是 best-effort 展示层 contract，不替代 backend 原生 session schema
