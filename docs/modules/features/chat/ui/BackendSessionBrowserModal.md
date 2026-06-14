# BackendSessionBrowserModal

> **源码**: `src/features/chat/ui/BackendSessionBrowserModal.ts`
> **最近更新**: 2026-06-13 (Codex persisted thread fork/archive/unarchive lifecycle actions; buttons rendered from active backend capabilities instead of host methods)

## 概述

Obsidian Modal，用于浏览、查看详情、恢复、分叉、归档和取消归档后端 sessions。复用 `AgentBackendRouting` 的 `listBackendSessions()`、`getBackendSessionPreview()`、`getBackendSessionDetail()`、`forkBackendSession()`、`archiveBackendSession()` 和 `unarchiveBackendSession()` 实现会话列表、preview transcript、metadata detail、完整 transcript 展示和生命周期操作。

## 职责

- 调用 `listBackendSessions()` 列出当前 active backend 的 sessions（通过 `getScopedRegistry()` 支持 forced backend scoping）
- 用户选中 session 后调用 `getBackendSessionPreview()` 加载 transcript 预览
- 支持 `ViewMode = 'preview' | 'detail'`：preview 模式显示带说明的 300 字预览，detail 模式显示 metadata card 和完整 transcript
- 详情模式并行调用 `getBackendSessionDetail()` 与 `getBackendSessionPreview()`，用 `formatDateTime()` / `formatFileSize()` 展示时间和文件大小
- Detail transcript 渲染所有 part 类型：`text` 直接展示，非 text part（`tool_use`、`tool_result`、`thinking` 等）以 collapsed `<details>` 形式展示，避免空白行
- Preview 模式跳过只有非 text part 的消息以避免空白 role-only 行
- 点击 "Resume in chat" 后通过 host 创建 conversation 并加载
- Preview 模式下，根据 active backend 的能力集合和所选 session 的归档状态显示生命周期按钮：
  - `Fork`：当 backend 声明 `AgentCapability.Fork` 且选中的是非归档 session 时显示
  - `Archive`：当 backend 声明 `AgentCapability.Sessions` 且选中的是非归档 session 时显示；点击调用 `archiveBackendSession()`，成功后刷新列表
  - `Unarchive`：当 backend 声明 `AgentCapability.Sessions` 且选中的是归档 session 时显示；点击调用 `unarchiveBackendSession()`，成功后刷新列表
- 归档的 session 在列表项上渲染 `Archived` badge（`.opencodian-backend-session-browser-item-archived`），并添加 `.is-archived` 类以视觉区分
- 列表同时加载 active backend 的活跃与归档 sessions；对于 Codex，这通过 `CodexAdapter.listSessions()` 同时请求 `thread/list archived=false` 与 `thread/list archived=true` 并合并实现

## Host 接口

`BackendSessionBrowserHost`:
- `getAgentServiceRegistry()` — 获取 registry 传给 `listBackendSessions()`
- `createConversationFromBackendSession(sessionId, title)` — 创建新 conversation 并返回 conversationId
- `loadConversation(conversationId)` — 加载 conversation 到聊天视图
- `getActiveBackendKind()` — 当前 backend 类型
- `showNotice(message)` — 显示 Obsidian Notice
- `isStreaming()` — 是否正在流式传输
- `supportsResume?()` — 可选 resume 能力声明；返回 `false` 时隐藏 Resume 按钮，用于 settings 侧 browse-only 打开方式
- `forcedBackendKind?` — 强制指定 backend 类型；设置后 modal 所有 session 查询走指定 backend 而非 registry active backend，用于 Claude 设置页只展示 Claude sessions

## 公共导出 / 类型

| 导出 / 类型 | 说明 |
|-------------|------|
| `BackendSessionBrowserModal` | Obsidian Modal，实现 backend session 列表、preview/detail 切换和可选恢复 |
| `BackendSessionBrowserHost` | Host contract；`supportsResume?()` 支持 browse-only 模式，`forcedBackendKind?` 支持按 backend 过滤 |
| `BackendSessionPreviewChatMessage` | Resume seed 使用的预览消息结构 |
| `ViewMode` | 模块内部视图状态：`preview` 或 `detail` |

## 集成

- `ConversationHistoryActionsCoordinator`: history dropdown footer 中 "Browse backend sessions" 按钮
- `OpenCodianView`: 实现 `BackendSessionBrowserHost`，创建 conversation 使用 `plugin.createConversationFromSession()`
- `SettingsClaudeCodeSection`: 通过 browse-only host 打开同一 modal，`supportsResume()` 返回 `false`，`forcedBackendKind` 设为 `'claude-code'` 确保只展示 Claude sessions，不会因 active backend 是 OpenCode 而展示错误后端的会话

## 恢复流程

1. Modal 列出 backend sessions
2. 用户选中一个 → 加载 preview
3. 点击 Resume → `host.createConversationFromBackendSession()` → `plugin.createConversationFromSession(sessionId, { title, backend })` → 设置 `backendSessionId`
4. `host.loadConversation(conversationId)` → 加载到当前视图
5. 用户发送消息时，`ClaudeCodeAdapter.getOrRestoreSession()` 检测到非 local session ID → 设置 `sdkSessionId` + `resumeValidationRequired: true`
6. `buildSdkOptions()` 传入 `resumeSessionId: session.sdkSessionId` → SDK 恢复该 session

## 维护约束

- 不直接使用 SDK；所有 session 操作通过 `AgentBackendRouting` helper
- 不提供 `continue` / `resumeSessionAt` 操作
- Preview/detail 只读，不修改 session 状态；归档/取消归档通过 `AgentBackendRouting` 显式路由
- `getScopedRegistry()` 使用 `Object.create(registry)` + 覆写 `getActive()` 实现 forced backend scoping，不引入新的 adapter 层
- Detail transcript 对所有 part 类型诚实渲染：text 直接展示，非 text 用 collapsed `<details>` + `[type]` summary
- Preview 跳过纯非 text 消息以避免空白行；detail 不跳过非 text 内容，确保 "Full Transcript" 名副其实
- 当 `forcedBackendKind` 指定但 registry 中该 backend 未注册或未启用时，modal 会显示空列表（符合预期）
- 生命周期按钮的可见性由 active backend 的 capability 集合和所选 session 的 `archived` 状态共同决定；不再由 host 显式传入
- 列表必须同时返回归档与非归档 sessions，否则 `Unarchive` 按钮无法通过真实 UI 路径触发；Codex 适配器通过两次 `thread/list` 调用来满足这一点
