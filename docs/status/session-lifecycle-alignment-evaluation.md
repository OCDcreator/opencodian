# OpenCodian 会话生命周期管理：对齐评估与优化增强报告

> **评估日期**：2026-05-10
> **当前仓库**：`/Users/dht/.codex/worktrees/session-lifecycle-report-baseline/opencodian`
> **源码基线**：commit `aaa470c6` (branch `codex/session-lifecycle-report-baseline`)；工作区干净；报告修订不改变 runtime 源码
> **报告修订**：commit `5d8ca1fa` 起连续修订，审计追踪见 git log
> **对比基准**：opencode-desktop（OpenCode 官方 Electron 前端，SolidJS）
> **评估对象**：OpenCodian Obsidian 插件当前会话生命周期实现
> **评估方法**：本地源码审计 + 既有会话对齐审计复核 + 后续外部 Council 审查门
> **对比项目**：OpenCode — [https://github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)
>
> **状态注记**：本文是历史审计基线，不是当前未完成路线图。后续提交 `68c413ee`（canonical cache writeback）和 `4e9eaa7c`（finalization local cache boundary）已经部分 supersede 本报告中的 canonical convergence 差距描述。
>
> 本报告涉及的 opencode-desktop 源码路径应在后续外部审查中重新确认。当前修订重点是让 OpenCodian 本地现状、证据边界和后续实施优先级准确可审查。

---

## 1. 评估背景与范围

### 1.1 系统定位

OpenCodian 是一个 Obsidian 侧边栏插件，将 OpenCode 对话能力嵌入笔记工作流。它通过 HTTP/SSE（SDK v2 为主链，legacy 为 fallback）与 OpenCode Server 通信，在 Obsidian 的 Electron WebView 内提供多标签页、后台任务、流式渲染等聊天体验。

opencode-desktop 是 OpenCode 官方的桌面端前端（SolidJS + Electron），代表了上游最完整的会话生命周期管理模式。

两者的关系是**并列前端**，消费同一个 OpenCode Server 能力：

```text
                ┌──────────────────┐
                │  opencode serve   │
                │  HTTP / SSE / SDK │
                └────────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────┴──────┐ ┌────┴─────┐ ┌──────┴───────┐
    │ TUI (终端)  │ │ Desktop  │ │ OpenCodian   │
    │ Zig/Bun/PTY│ │ SolidJS  │ │ Obsidian     │
    └────────────┘ └──────────┘ └──────────────┘
```

### 1.2 评估维度

| 维度 | 关注点 |
|------|--------|
| **架构对齐** | 状态管理、事件流、并发模型的模式差异 |
| **功能覆盖** | 会话生命周期各阶段的完整性 |
| **数据完整性** | 状态竞争、双重真相、同步一致性 |
| **健壮性** | 错误恢复、持久化安全、重载恢复 |
| **用户体验** | 流式体验、后台任务感知、多会话管理 |

### 1.3 适用边界

本次评估**不是**建议将 opencode-desktop 的架构原样搬入 OpenCodian。两者的运行环境（独立 Electron 应用 vs Obsidian 侧边栏插件）、交互模型（全窗口 vs 侧边栏）、资源约束（独立进程 vs 共享进程）存在根本差异。评估的目的是识别 opencode-desktop 中**经过验证的、可迁移的设计模式**，以及 OpenCodian **独特的改进机会**。

---

## 2. 当前实现现状

### 2.1 OpenCodian 架构快照

#### 会话状态层次

```text
┌─────────────────────────────────────────────────┐
│ OpenCodeSessionStateStore (规范真相)              │
│  sessions: Map<sessionID, {messages, parts}>      │
│  diffEntriesBySessionId: Map<sessionID, diffs>    │
└──────────────────┬──────────────────────────────┘
                   │ 协调
┌──────────────────▼──────────────────────────────┐
│ Conversation.messages (显示/持久化真相)            │
│  每个标签页通过 ConversationTabRuntimeCoordinator │
│  从规范真相同步到显示层                            │
└──────────────────┬──────────────────────────────┘
                   │ 管理
┌──────────────────▼──────────────────────────────┐
│ TabRuntimeState (标签页运行时状态, 35+ 字段)       │
│  每标签页独立的流/后台任务/同步/问题状态             │
└─────────────────────────────────────────────────┘
```

#### 关键协调器群

| 协调器 | 职责 |
|--------|------|
| `OpenCodeSessionLifecycleCoordinator` | 会话 CRUD、当前会话跟踪 |
| `OpenCodeStreamingRuntimeCoordinator` | 流创建/取消/分离、活跃流 Map |
| `OpenCodeStreamingFinalizationCoordinator` | 流完成后的规范化 |
| `OpenCodeSyncEventRuntimeCoordinator` | SDK 同步事件订阅、重连 |
| `ConversationTabRuntimeCoordinator` | 标签页生命周期管理 |
| `ConversationAuthoritativeSyncCoordinator` | 服务端消息与本地状态仲裁 |
| `ConversationSessionSignalRuntime` | 同步事件到标签页的路由 |
| `BackgroundTaskTimelineService` | 后台任务时间线管理 |

### 2.2 opencode-desktop 架构快照

#### 会话状态层次

```text
┌─────────────────────────────────────────────────┐
│ Global Store (全局)                               │
│  project, session_todo, config, provider...       │
└──────────────────┬──────────────────────────────┘
                   │ 按目录划分
┌──────────────────▼──────────────────────────────┐
│ Per-Directory Child Store (引用计数 + LRU 驱逐)    │
│  session[], message[sessionID], part[messageID]   │
│  session_status, session_diff, permission...      │
└──────────────────┬──────────────────────────────┘
                   │ 前端视图
┌──────────────────▼──────────────────────────────┐
│ Sync Context (SolidJS reactive)                   │
│  + Optimistic Layer (本地消息 + 服务端合并)         │
│  + 消息分页 (limit/cursor/complete)                │
└─────────────────────────────────────────────────┘
```

#### 事件流管线

```text
Server SSE → GlobalSDK.event
  → 16ms 合并窗口 (分桶去重)
  → emitter.emit(directory, event)
  → applyDirectoryEvent() (event-reducer)
  → Store 更新 → UI 响应式刷新
```

---

## 3. 对比分析：逐项评估

### 3.1 会话创建与初始化

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **触发方式** | 用户提交首条消息 → `session.create()` | 用户发送消息 → `createSession()` → 创建 Conversation | ✅ **对齐良好** |
| **会话种子** | 创建后立即 seed 到排序数组 | 创建后构建 Conversation 对象 + storage 保存 | ✅ **模式一致** |
| **预加载依赖** | 无特殊要求 | `loadConversations()` 必须在视图激活前完成 | ✅ **OpenCodian 额外约束，已正确实现** |
| **多目录支持** | 按目录创建独立子存储 + SDK 客户端 | 单库单目录，无此需求 | ⚪ **不适用** |
| **工作树隔离** | 子会话可运行在独立 git worktree | 无此需求（后台任务在同一消息序列内） | ⚪ **不适用** |

**评估结论**：对齐良好，无需改动。

### 3.2 会话状态管理

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **规范真相源** | Per-directory SolidJS Store（单一写入点） | `OpenCodeSessionStateStore`（规范）+ `Conversation.messages`（显示/持久化）| ⚠️ **双重真相** |
| **状态一致性** | 事件归约器唯一修改路径 | 多个未协调的修改源 | ❌ **竞态风险** |
| **优化读取** | 响应式派生 + 二分查找索引 | 防御性深克隆 + 每次返回副本 | ⚠️ **性能开销** |
| **缓存策略** | LRU 缓存(40会话) + 15s 预取 TTL | 无缓存，按需从服务端加载 | ✅ **侧边栏按需加载更合理** |

**双重真相详细分析**：

`OpenCodeSessionStateStore` 已经是本地 canonical graph，`ConversationRenderService.resolveConversationRenderMessages()` 在 canonical render messages 非空时会优先使用 canonical 投影。因此当前问题不应表述为"渲染层始终双重合并"。

更准确的风险是：`Conversation.messages` 仍参与 send、authoritative reload、sync merge、finalization fingerprint、error notice persistence 和 storage cache writeback。也就是说，OpenCodian 已经有 canonical 优先路径，但 reload / finalization / persistence 仍保留本地补偿路径。JS 单线程避免了真正的数据竞争，但 async interleaving 仍可能让 live stream、reload、post-sync 三条路径产出不同的 `ChatMessage[]` cache。

**评估结论（历史基线）**：当时最大的架构风险不是"完全没有 canonical truth"，而是 canonical graph 与 `Conversation.messages` cache/compat 输出之间的职责边界仍不够硬。当时的优先修复方向是让 render / reload / sync / finalization 的输入收敛到 canonical projection，再决定是否需要额外的串行写入保护。

**当前状态（2026-05-10 后续实现）**：`68c413ee` 和 `4e9eaa7c` 已完成本轮 canonical render / reload / sync / finalization / local cache boundary 收敛切片。后续 agent 不应重复实现同一 canonical convergence；只能在新的复现证据证明仍有漂移时做窄修。

### 3.3 事件流与同步

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **事件源** | SSE `/event` 端点 | SDK `syncEvent.subscribe()` | ✅ **等效** |
| **事件合并** | 16ms 合并窗口，同类型事件去重 | 无合并，每个事件立即处理 | ⚠️ **可优化** |
| **心跳/重连** | 15s 心跳超时，250ms 重连，visibility-change 触发 | 延迟订阅 + 3s 瞬态恢复轮询 | ⚠️ **模式不同但功能等效** |
| **事件路由** | 按 directory → sessionID 路由 | 按 sessionID → tabId 路由（含活动标签页 fallback） | ✅ **模式等效** |
| **增量处理** | `message.part.delta` 在 `message.part.updated` 已合并时跳过 | 每个增量独立处理 | ⚠️ **可优化** |

**事件合并详细分析**：

opencode-desktop 在 16ms 帧窗口内合并事件，`message.part.delta` 在已有对应 `message.part.updated` 时被完全跳过。这显著减少了渲染洪水。OpenCodian 的 `StreamController` 已有 96ms 渲染节流，但**同步事件路径**没有类似的合并机制。当服务端批量推送大量 `message.part.updated` 事件时，每个都会触发独立的状态更新和渲染。

**评估结论**：同步事件路径的合并是中优先级优化。流式路径已有节流（96ms），影响有限。但在高频率同步场景（如大量消息同步、快速 tool call 序列）下，合并可减少不必要的状态更新。

### 3.4 并发会话执行

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **多会话并行** | 每会话独立 SSE 事件路由 | 每标签页独立 StreamController | ✅ **模式等效** |
| **活跃流管理** | 按 sessionId 无覆盖限制 | `activeStreams` Map 按 sessionId，新流覆盖旧流 | ⚠️ **单例限制** |
| **标签页系统** | URL 路由 + layout 状态管理 | TabManager + TabBar + 标签页持久化 | ✅ **模式等效，适配各自环境** |
| **跟进队列** | `queuedFollowups` + 持久化存储 | 无队列，忙碌时显示阻断通知 | ❌ **缺失** |

**活跃流单例分析**：

`OpenCodeStreamingRuntimeCoordinator.activeStreams` 以 `sessionId` 为键，而非 `(sessionId, tabId)` 复合键。如果两个标签页引用同一个 OpenCode 会话并同时尝试流式传输，第二个会覆盖第一个（代码中有 warning 日志）。

在实际使用中，Obsidian 侧边栏场景下同一会话并发流式传输的概率极低。但当前行为是**静默覆盖**而非用户提示，可能导致数据丢失。

**评估结论**：流单例是可接受的权衡，但应从静默覆盖改为用户 Notice 提示。跟进队列是高价值 UX 改进。

### 3.5 后台任务

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **子会话模型** | 独立会话 + `parentID` 链接 + 可选 worktree 隔离 | 同会话内消息序列中的工具调用段 | ⚪ **架构不同，各有合理理由** |
| **后台状态跟踪** | 服务端原生支持（子会话是独立会话） | 客户端专用协调器群（8个专用组件） | ⚪ **OpenCodian 的方案更重但更细粒度** |
| **持久化** | 服务端持久化子会话 | 仅从 `Conversation.messages` 重建 | ⚠️ **脆弱** |
| **崩溃恢复** | 子会话独立于父会话生存 | 重建依赖消息完整性 | ⚠️ **可能不准确** |

**后台任务持久化详细分析**：

`TabRuntimeState.backgroundTaskLaunches` 是一个不直接持久化的 Map。视图重载时，`BackgroundTaskTimelineService.syncStateFromConversation()` 从 `Conversation.messages` 解析后台任务段。但如果消息在服务端同步到达缓存之前不完整，重建可能产生不准确的启动记录。

将最小生命周期元数据序列化到 `Conversation` 元数据中（而非新数据库），可以在视图重载时提供可靠的恢复基线。

**评估结论**：后台任务持久化是中-高优先级改进。方案是在现有 Conversation 对象上增加元数据字段，而非引入新的存储层。

### 3.6 会话状态机

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **状态表示** | `session_status[sessionID] = { type: "busy" \| "idle" }` | 多个分散布尔值 | ❌ **状态分散** |
| **状态转换** | 明确的事件驱动（`session.status` 事件） | 多个独立标志位独立变化 | ❌ **无转换保证** |
| **UI 消费** | 单一 `session_status` 检查 | `isStreaming`、`isConversationSyncInFlight`、`sessionStatus`、`StreamController.state.isStreaming` 组合判断 | ❌ **复杂且易出错** |

**状态分散详细分析**：

当前一个标签页的"忙碌"状态分散在至少 4 个独立标志中：
- `TabRuntimeState.isStreaming` — 流式传输中（`TabRuntimeState` 字段）
- `TabRuntimeState.isConversationSyncInFlight` — 同步进行中（`TabRuntimeState` 字段）
- `TabRuntimeState.sessionStatus` — 服务端报告的状态（`TabRuntimeState` 字段）
- `StreamController.state.isStreaming` — StreamController 内部状态（**不是** `TabRuntimeState` 字段）

其中前三者是 `TabRuntimeState` 上的字段，第四个是 `StreamController` 的内部状态。尽管归属不同，`StreamController.state.isStreaming` 仍参与忙碌状态判断，因此维护性风险成立：一个标签页的"忙不忙"需要跨两个不同对象的属性组合判定，且缺少形式化的转换约束。不一致的组合（如 `isStreaming=true` 但 `sessionStatus=idle`）可能导致 UI 显示异常。

**评估结论**：引入形式化的 `TabSessionPhase` 枚举是高优先级维护性改进。不是新加一个协调器，而是将现有分散的布尔值统一为一个派生枚举。

### 3.7 错误处理与恢复

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|------------|------|
| **乐观更新回滚** | 失败时 `batch(() => { setIdle(); remove() })` | 用户消息已乐观种子化，流错误时清理 | ✅ **基本等效** |
| **SSE 重连** | 250ms 延迟 + 15s 心跳 + visibility 触发 | 延迟订阅 + 3s 恢复轮询 + `runLoop` 自动重启 | ✅ **策略不同但功能等效** |
| **组件清理** | SolidJS `onCleanup` 自动清理 | 手动 `onClose` + `eventRefs` 清理 | ✅ **适配各自框架** |
| **存储驱逐** | LRU + 引用计数 + 20min 空闲 TTL | 无驱逐机制 | ⚪ **侧边栏场景不迫切** |

**评估结论**：错误处理对齐良好。OpenCodian 的恢复策略已覆盖关键场景。

---

## 4. 优化增强建议：分级路线图

### 4.1 Tier 1 — 高优先级（canonical 收敛 + 维护性）

#### 建议 1：先做 canonical render / reload / finalization 收敛切片

**当前状态**：已由 `68c413ee` 与 `4e9eaa7c` 落地当前切片；本小节保留为历史计划说明。不要把以下内容当作新的待实现任务重复执行。

- **问题**：当前 render 已 canonical 优先，但 reload、sync merge、finalization 和 persistence 仍通过 `Conversation.messages` 补偿层判断与修复。
- **方案**：让 `ConversationRenderService`、`ConversationAuthoritativeReloadCoordinator` 和 `MessageFinalizationService` 使用同一套 canonical-derived render input。`Conversation.messages` 在 canonical 存在时只作为 compatibility/cache writeback，不再覆盖 assistant body、tool output、structured payload 等 truth 字段。
- **影响**：高 — 直接降低 live stream、reload、post-sync 之间的漂移风险。
- **工作量**：中-高 — 需要 focused tests 证明普通文本、tool-first、synthetic parts、interrupted notice 等路径仍一致。
- **风险**：中 — 必须明确 client-only notice/decorations 的保留边界。
- **涉及文件**：
  - `ConversationRenderService.ts`
  - `ConversationTurnViewModelBuilder.ts`
  - `ConversationAuthoritativeReloadCoordinator.ts`
  - `ConversationAuthoritativeMessageMergeCoordinator.ts`
  - `ConversationSyncBridge.ts`
  - `MessageFinalizationService.ts`

#### 建议 2：引入 `TabSessionPhase` 只读派生视图

- **问题**：标签页会话状态仍分散在 `isStreaming`、`isConversationSyncInFlight`、`sessionStatus` 和 `StreamController.state.isStreaming` 等字段中。
- **方案**：先定义只读派生的 `TabSessionPhase`，用于 UI 和调试判断。初期不要删除现有布尔值，也不要让它成为第五个可写状态源。
- **影响**：中-高 — 让"会话到底忙不忙"的判断更清晰。
- **工作量**：中。
- **风险**：低-中 — 只读派生可以降低行为回归风险。

#### 建议 3：将串行写入保护降级为条件性稳定措施

- **问题**：多个 async 路径仍会写入 `Conversation.messages` cache。
- **方案**：不要先用 Promise chain 固化双重事实源。只有当 canonical 收敛切片后仍存在 cache writeback interleaving 时，再为剩余 cache 写入引入 per-conversation write lock。
- **当前状态**：canonical 收敛后仍没有把 conditional write lock 列为默认待办；只有在出现具体 interleaving 复现、且能证明 canonical/cache writeback 仍会互相覆盖时才评估。
- **影响**：中。
- **工作量**：中。
- **风险**：中 — 需要避免死锁和延迟渲染。

#### 建议 4：后台任务生命周期元数据持久化

- **问题**：`backgroundTaskLaunches` Map 不直接持久化，视图重载时主要从 `Conversation.messages` 重建。
- **方案**：在完成 canonical 收敛边界后，再评估是否在 `Conversation` metadata 中持久化最小后台任务生命周期信息。
- **影响**：中。
- **工作量**：低-中。
- **风险**：低。

### 4.2 Tier 2 — 中优先级（用户体验 + 性能）

#### 建议 5：跟进提示队列

- **问题**：会话忙碌时发送新消息被直接阻断，用户需要等待当前流完成
- **方案**：在 `TabRuntimeState` 增加 `queuedPrompt: string | null`。忙碌时入队而非阻断，流完成或会话空闲时自动出队发送。每标签页仅排队一条，不设无限队列。
- **影响**：中-高 — 显著改善忙碌期间的用户操作连续性
- **工作量**：低
- **风险**：低
- **涉及文件**：
  - `TabRuntimeState` 类型定义
  - `SendPipelineRuntime.ts`（入队逻辑）
  - `OpenCodeStreamingFinalizationCoordinator.ts`（出队触发）

#### 建议 6：同步事件批处理窗口

- **问题**：每个同步事件独立处理，高频场景下产生不必要的状态更新
- **方案**：在 `OpenCodeSyncEventRuntimeCoordinator.emitSessionSyncEventUpdate()` 中引入 16ms 批处理窗口。同类型事件在窗口内合并（`message.part.delta` 在已有 `message.part.updated` 时跳过）。
- **影响**：中 — 减少高频同步时的不必要渲染
- **工作量**：低-中
- **风险**：低
- **注意**：流式路径已有 96ms 节流，此优化主要针对同步事件路径
- **涉及文件**：
  - `OpenCodeSyncEventRuntimeCoordinator.ts`
  - `ConversationSessionSignalRuntime.ts`

### 4.3 Tier 3 — 长期方向（架构收敛）

#### 建议 7：双重真相收敛

**当前状态**：当前 canonical convergence 切片已经完成 render / reload / sync / finalization / local cache boundary 的收敛；Tier 3 不再代表同一工作的立即待办。它只保留为长期架构简化方向，前提是后续发现新的 runtime truth 边界问题。

- **问题**：`OpenCodeSessionStateStore`（规范）和 `Conversation.messages`（显示/持久化）承载同一份消息的不同表示，增加理解和维护成本
- **方案**（多迭代渐进式）：
  - **Phase 1**：渲染层优先从 `OpenCodeSessionStateStore` 读取（已完成当前切片），`Conversation.messages` 仅作为 fallback/cache 输出
  - **Phase 2**：消除 merge fallback，规范状态成为唯一渲染输入（已完成当前切片范围内的 render/reload/sync/finalization 边界）
  - **Phase 3**：`Conversation.messages` 退化为纯持久化载体，运行时不再直接读取（长期方向；当前切片已把 local cache writeback 边界收窄）
- **影响**：高 — 架构简化
- **工作量**：高 — 需要多迭代逐步迁移
- **风险**：中 — 需要在每个阶段充分验证
- **前置条件**：建议 1（canonical 收敛）和 建议 2（状态机）应先落地

---

## 5. 不应从 opencode-desktop 照搬的模式

以下模式在 opencode-desktop 中合理，但在 OpenCodian 的 Obsidian 侧边栏场景下**不应采用**：

| 模式 | 不采用理由 | 依据 |
|------|-----------|------|
| 分层存储 + 按目录子存储 + 引用计数 | Obsidian 单库单进程，无多目录作用域需求 | `OpenCodeSessionStateStore.ts:52` — 单一 Map 已是正确设计 |
| LRU 会话缓存(40) + 15s 预取 TTL | 侧边栏不活跃时预取浪费共享进程内存；按需加载更合理 | 侧边栏最多 5-10 活跃标签页 |
| 父子会话 + `parentID` + git worktree 隔离 | OpenCodian 的后台任务在同一会话消息序列内运行，无独立目录上下文需求 | `BackgroundTaskStreamTriggerCoordinator.ts` — 设计意图不同 |
| 乐观助手消息 + 完整回滚管道 | 用户消息已有乐观种子化；助手消息回滚的复杂度对侧边栏 UX 收益不成比例 | `MessageSendPreparationService.ts:95` — 已有乐观用户消息 |
| URL 路由导航（SolidJS Router） | Obsidian 侧边栏使用标签覆盖层，不是 URL 路由 | `TabManager.ts` + `TabBar.ts` — 适配 Obsidian 环境的正确选择 |
| 每目录会话预取 + 空闲 TTL | 最大约 5-10 个活跃会话，预取是不必要的开销 | 资源约束下的正确权衡 |

---

## 6. 可接受的当前权衡

以下方面 OpenCodian 与 opencode-desktop 存在差异，但在侧边栏插件场景下是合理的权衡：

### 6.1 流单例每会话

`activeStreams` 按 `sessionId` 而非 `(sessionId, tabId)` 键控，意味着同一会话不能从两个标签页并发流式传输。

**权衡合理性**：Obsidian 侧边栏中同一会话并发流式传输的场景极少。

**改进建议**：从静默覆盖改为用户 Notice 提示（"此会话正在另一标签页中流式传输"），仅在用户需求明确时才考虑复合键方案。

### 6.2 无对话垃圾回收

没有定期清理孤立会话或过旧对话的机制。

**权衡合理性**：侧边栏场景下约 20 个对话以内，内存影响可忽略。

**改进建议**：仅在性能分析显示需要时才添加 LRU 驱逐。

### 6.3 会话状态无预取

标签页激活时才从服务端加载完整消息，无预取机制。

**权衡合理性**：侧边栏可能长时间不可见，预取浪费资源。按需加载是正确的资源策略。

---

## 7. 实施优先级总结

```text
Tier 1（当前状态）
  ├── #1 canonical render/reload/sync/finalization/local cache boundary 收敛  ← 已完成当前切片
  ├── #2 TabSessionPhase 只读派生视图                                      ← 仍在剩余队列
  ├── #3 条件性串行写入保护                                                ← 仅在具体 interleaving 复现时评估
  └── #4 后台任务元数据持久化                                              ← 仍在剩余队列

Tier 2（剩余队列）
  ├── #5 跟进提示队列                                                      ← UX 高价值改进
  ├── #6 同步事件批处理                                                    ← 性能优化
  └── active stream duplicate Notice                                       ← 从静默覆盖改为用户提示

Tier 3（长期方向）
  └── #7 双重真相收敛                                                      ← 已由当前切片覆盖核心边界；只在新证据下继续
```

**更新后的实施路径**：

1. 不要重复做 #1 canonical convergence；它已经由后续提交覆盖当前切片范围。
2. 下一批自动化队列按小切片推进：active stream duplicate Notice、`TabSessionPhase` 只读派生、background-task metadata persistence、follow-up queue、sync-event batching。
3. conditional write lock 不是默认队列项；只有在有具体 async interleaving 复现时才评估。
4. 继续保留“不照搬 opencode-desktop”的边界；分层存储、LRU 预取、父子会话 worktree 隔离等不适用项不应被改写成待实现任务。

### UI / layout / style guard

本报告当前只建议后续实施方向，不直接改 UI。但如果后续 canonical 收敛实现触及聊天布局、消息渲染结构、状态提示、notice 卡片、工具调用展示、设置项或任何 CSS / theme token，执行者必须先调用 `$impeccable` 并通过 preflight。

OpenCodian 是 product-register UI：优先 Obsidian-native、紧凑、状态清晰、避免装饰性 glass、gradient text、side-stripe card accent、重复卡片网格和无意义动效。任何视觉调整都应保持现有 UI owner 边界，避免把新 runtime ownership 加回 `OpenCodianView.ts`。

---

## 8. 待外部审查议题

以下内容不是已完成的 Council 结论，而是提交给 `opencode` Council 审查的重点问题：

| 议题 | 本地判断 | 说明 |
|------|---------|------|
| canonical render/reload/finalization 收敛应作为 #1 优先级 | 已完成当前切片 | `68c413ee` 与 `4e9eaa7c` 已覆盖 render/reload/sync/finalization/local cache boundary；不要重复实现同一 convergence |
| TabSessionPhase 只读派生视图 | 剩余队列 | 状态分散问题仍适合用只读派生降低维护成本；不要让它成为新的可写状态源 |
| 条件性串行写入保护 | 条件评估 | 只有出现具体 cache writeback interleaving 复现时才评估，不作为默认后续任务 |
| 后台任务元数据持久化 | 剩余队列 | canonical 收敛完成后可作为独立重载恢复增强切片 |
| 双重真相收敛时机 | 当前核心边界已收敛 | Tier 3 只保留长期架构简化语境，不应驱动重复 canonical convergence |
| 分层存储不应照搬 | 作者判断 | Obsidian 单库场景无需求 |
| 流单例可接受 | 作者判断 | 仅需改善用户提示 |
| 会话 GC 不迫切 | 作者判断 | 侧边栏对话规模有限 |

---

## 附录 A：关键文件索引

### OpenCodian

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/features/chat/OpenCodianView.ts` | ~2500 | 主聊天运行时 |
| `src/core/opencode/OpenCodeService.ts` | ~1500 | 混合 SDK facade |
| `src/core/opencode/OpenCodeSessionStateStore.ts` | ~300 | 规范会话状态存储 |
| `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts` | ~400 | 流式传输运行时 |
| `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts` | ~350 | 同步事件订阅 |
| `src/features/chat/ConversationTabRuntimeCoordinator.ts` | ~300 | 标签页生命周期 |
| `src/features/chat/BackgroundTaskTimelineService.ts` | ~200 | 后台任务时间线 |
| `src/features/chat/BackgroundTaskStreamTriggerCoordinator.ts` | ~150 | 后台任务检测 |
| `src/features/chat/SendPipelineRuntime.ts` | ~300 | 发送管线 |

### opencode-desktop（参考）

| 文件 | 行数 | 职责 |
|------|------|------|
| `packages/app/src/pages/session.tsx` | 1972 | 主会话页面 |
| `packages/app/src/context/global-sync.tsx` | 449 | 全局存储 + 子存储管理 |
| `packages/app/src/context/global-sync/event-reducer.ts` | 364 | 事件→存储归约 |
| `packages/app/src/context/global-sync/child-store.ts` | 337 | 按目录子存储 |
| `packages/app/src/context/global-sdk.tsx` | 256 | SSE 事件流 + 合并 |
| `packages/app/src/components/prompt-input/submit.ts` | 584 | 提示提交 + 会话创建 |
| `packages/app/src/context/sync.tsx` | 619 | 同步前端 + 乐观层 |
| `packages/app/src/context/layout.tsx` | 928 | 布局管理器 |

## 附录 B：评估方法说明

1. **源码审计**：使用 @explorer 子代理全量阅读 OpenCodian 和 opencode-desktop 的会话生命周期相关源码
2. **Council 评审**：待外部 Council 审查门执行（尚未完成）
3. **评级标准**：
   - ✅ 对齐良好：模式等效或 OpenCodian 方案更适合当前场景
   - ⚠️ 可优化：存在改进空间但不影响核心功能
   - ❌ 需改进：存在数据完整性风险或显著维护性问题
   - ⚪ 不适用：因场景差异不需对齐，含架构不同但各有合理理由的情况

## 当前实现注记

这份评估报告记录的是 2026-05-10 时点的对齐差距基线。随后实现已把本轮聚焦的 canonical 收敛切片落到代码里，具体包括：

- canonical render / authoritative reload / sync projection / finalization drift 的边界收敛
- `Conversation.messages` 在 canonical 存在时退化为 compatibility/cache writeback
- `session.diff` 不再驱动 message authoritative reload
- local stream normal-completion 的本地 cache writeback 延后给 canonical finalization

当前仍故意保留为后续独立切片的事项：

- active stream duplicate Notice
- `TabSessionPhase` 只读派生视图
- background-task metadata persistence
- follow-up queue
- sync-event batching
- conditional write lock：仅在有具体 async interleaving 复现时评估
