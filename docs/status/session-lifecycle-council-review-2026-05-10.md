# OpenCodian 会话生命周期机制：Council 审查报告

> **审查日期**：2026-05-10
> **审查性质**：多 LLM 共识审查（Council）
> **审查对象**：OpenCodian vs opencode-desktop 会话生命周期成熟度分析
> **参与模型**：gpt-5.5（alpha，两轮深度审查）+ kimi-for-coding（delta，一轮深度审查）
> **共识置信度**：majority（2/4 模型响应，立场高度一致）
> **关联文档**：`docs/status/session-lifecycle-alignment-evaluation.md`

---

## 0. Tier 1 实施计划

本审查的 Tier 1 收敛已落到实施计划：`docs/superpowers/plans/2026-05-10-session-lifecycle-tier1-convergence.md`。

Tier 1 只覆盖两个高优先级、低扩散面的风险收束：

- writable per-tab lifecycle state machine：以 `TabSessionLifecycleState` 统一 `preparing → streaming → finalizing → syncing` 等前台忙碌阶段。
- per-conversation write serialization：以 monotonic ticket 与 per-conversation queue 串行化 `Conversation.messages` compatibility/cache 写入。

LRU/full-message cache、`OpenCodeSessionStateStore` canonical eviction、以及更彻底的 canonical-only runtime 读取仍是独立后续计划，不在本 Tier 1 范围内。

## 1. 审查背景

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
           ┌─────────────┼──────────────┐
           │             │              │
     ┌─────┴──────┐ ┌────┴─────┐ ┌──────┴───────┐
     │ TUI (终端)  │ │ Desktop  │ │ OpenCodian   │
     │ Zig/Bun/PTY│ │ SolidJS  │ │ Obsidian     │
     └────────────┘ └──────────┘ └──────────────┘
```

### 1.2 审查发起原因

在对 OpenCodian 会话生命周期机制进行初步分析后，得出的结论是"核心架构已成熟"，但意识到可能存在**温和乐观偏倚**。因此发起 Council 多模型共识审查，以：

1. 验证"基本成熟"结论是否有充分证据
2. 检查是否遗漏重要风险点
3. 评估"不应照搬 opencode-desktop"判断是否成立
4. 获得更客观的成熟度评级

### 1.3 审查方法

- **两轮 Council 调用**，prompt 涵盖 5 个核心问题
- **深度源码审查**：alpha 引用 15+ 处源码行号，delta 审查 10+ 核心文件
- **独立回答后综合**：每个模型先独立回答，再综合出共识结论

---

## 2. 架构快照对比

### 2.1 OpenCodian（Obsidian 插件）

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

**关键协调器群**：

| 协调器 | 职责 |
|--------|------|
| `OpenCodeSessionLifecycleCoordinator` | 会话 CRUD、当前会话跟踪 |
| `OpenCodeStreamingRuntimeCoordinator` | 流创建/取消/分离、活跃流 Map |
| `OpenCodeStreamingFinalizationCoordinator` | 流完成后的规范化 |
| `OpenCodeSyncEventRuntimeCoordinator` | SDK 同步事件订阅、重连 |
| `ConversationTabRuntimeCoordinator` | 标签页生命周期管理 |
| `ConversationAuthoritativeSyncCoordinator` | 服务端消息与本地状态仲裁 |

### 2.2 opencode-desktop（官方桌面端）

```text
┌─────────────────────────────────────────┐
│ Global Store                            │
│  project, session_todo, config...       │
└────────────┬────────────────────────────┘
             │ 按目录划分
┌────────────▼────────────────────────────┐
│ Per-Directory Child Store               │
│  (引用计数 + LRU 驱逐)                    │
│  session[], message[], part[]           │
│  session_status, session_diff...        │
└────────────┬────────────────────────────┘
             │ 前端视图
┌────────────▼────────────────────────────┐
│ Sync Context (SolidJS reactive)         │
│  + Optimistic Layer                     │
│  + 消息分页 (limit/cursor/complete)      │
└─────────────────────────────────────────┘
```

**事件流管线**：

```text
Server SSE → GlobalSDK.event
  → 16ms 合并窗口 (分桶去重)
  → emitter.emit(directory, event)
  → applyDirectoryEvent() (event-reducer)
  → Store 更新 → UI 响应式刷新
```

---

## 3. 已完成的优化基线

以下优化已在 2026-05-10 基线之前或同期完成：

| 优化项 | 状态 | 说明 |
|--------|------|------|
| canonical render/reload/sync/finalization/local cache boundary 收敛 | ✅ 已完成 | `68c413ee` + `4e9eaa7c` |
| `TabSessionPhase` 只读派生视图 | ✅ 已完成 | 统一"忙不忙"读取判断 |
| active stream duplicate busy gating | ✅ 已完成 | 同 session 另一标签页 streaming 会进入 foreground busy 判断 |
| background-task metadata persistence | ✅ 已完成 | 仅持久化 lifecycle metadata |
| follow-up queue | ✅ 已完成 | 仅保存一条 per-tab send intent |
| sync-event batching | ✅ 已完成 | message / part / diff / compacted 路径已有 16ms 批窗口 |

---

## 4. Council 逐题审查结论

### Q1：双重真相是否"基本收敛"？

#### 原始分析结论
"双重真相已基本收敛"，`OpenCodeSessionStateStore` 是规范真相源，`Conversation.messages` 已退化为 compatibility/cache writeback。

#### Council 共识

**核心立场：核心路径已收敛，但残余风险为中等。措辞应限定为"核心路径 canonical-first"而非笼统的"基本收敛"。**

`Conversation.messages` 仍参与以下路径：

| 路径 | 说明 | 风险等级 |
|------|------|---------|
| optimistic seeding | 发送前乐观用户消息种子化 | 中 |
| background task parsing | 从消息解析后台任务段重建 timeline | 中 |
| diff notice | diff 提示的输入来源 | 低 |
| fingerprinting | 消息指纹计算用于增量更新检测 | 中 |
| local cache writeback | finalization 后的本地缓存回写 | 中 |

**async interleaving 风险**：

JS 单线程避免了真正的数据竞争，但在以下场景下 async interleaving 仍可能产出短暂不一致的 `ChatMessage[]` cache：

- `finalization sync` + `latest user hydration` 快速交叠
- `background task polling` + `manual follow-up` 并发触发
- sync event 先写 canonical 再广播 listener，若 runtime 正 streaming/sync-in-flight 则跳过——**缺少"错过事件后必须重放"的强保证**（alpha R2 新增发现）

**风险等级：中等** —— 既非"可忽略"也非"需立即修复"，但应通过 per-conversation write serialization + monotonic version guard 逐步收窄。

**两票一致建议**：
- alpha：monotonic version/write token
- delta：条件性串行写入保护

---

### Q2：状态分散问题是否严重？

#### 原始分析结论
"状态分散已通过 `TabSessionPhase` 只读派生视图缓解"。

#### Council 共识

**核心立场：中等严重。`TabSessionPhase` 统一了读取判断，但写入仍分散，不够充分。**

当前一个标签页的"忙碌"状态分散在至少 4 个独立标志中：

| 标志 | 所在对象 | 说明 |
|------|---------|------|
| `isStreaming` | `TabRuntimeState` | 流式传输中 |
| `isConversationSyncInFlight` | `TabRuntimeState` | 同步进行中 |
| `sessionStatus` | `TabRuntimeState` | 服务端报告的状态 |
| `state.isStreaming` | `StreamController` | StreamController 内部状态 |

其中前三者是 `TabRuntimeState` 上的字段，第四个是 `StreamController` 的内部状态。**一个标签页的"忙不忙"需要跨两个不同对象的属性组合判定**，且缺少形式化的转换约束。

**具体失败场景**（alpha R2 新增）：

| 场景 | 机制 | 影响 |
|------|------|------|
| **finalization sync 窗口** | `isConversationSyncInFlight=true` 后仍在 sync/save；`TabSessionPhase` 不将 `syncing` 算 foreground busy，用户可再次发送 | 新发送与 `conversation.messages = merged` 交错 |
| **cancel 时序** | tab `isStreaming` 先置 false → `streamController.cancelStream()` 后执行；极短窗口派生状态与 controller 内部状态不一致 | UI 短暂显示错误状态 |
| **stream done 后延迟** | `StreamController` 自身 `state.isStreaming=false` 先于 tab runtime reset；需等 router/finalizer 回调 | busy gating、content finalization 时序难以证明 |

**delta 补充场景**：`isStreaming=true` + `sessionStatus=idle` 时 UI 显示"流式中"而输入框已解锁，用户可能发送第二条消息触发流单例覆盖。

**两票一致建议**：

不一定要重构为桌面端单一 Store，但需要 **per-tab writable lifecycle state machine** 或至少一个 transition owner，明确以下转换表：

```text
idle → preparing → streaming → finalizing → syncing → idle/cancelled/error
```

所有 busy gating 只问它。

---

### Q3：是否遗漏关键差距？

#### 原始分析结论
未遗漏重大差距，主要集中在状态分散和事件合并。

#### Council 共识

**核心立场：是，3+1 项被遗漏或低估。**

| 差距 | alpha (R2) | delta (R1) | 严重度 |
|------|-----------|-----------|--------|
| **乐观用户消息双写一致性** | send path 同时 seed canonical + push `Conversation.messages`，message_start 后 hydration 是 void fire-and-forget | canonical push + `Conversation.messages.push` 无原子性 | 中 |
| **长对话全量加载成长边界** | `getConversationById()` 加载 full conversation 后替换进长期内存数组无 eviction；`saveConversation()` 每次写 full messages | fingerprint/render/collection 全量遍历，50+消息时成本线性增长 | 中低（当前）/长期风险 |
| **StreamController ↔ TabRuntimeState 耦合** | send pipeline 依赖两边状态共同成立，测试难覆盖全部交错 | 跨对象耦合比报告描述更深，新状态需修改两处 | 中 |
| **canonical sessions map 无 eviction**（alpha 新发现） | `OpenCodeSessionStateStore.sessions` 无会话级 eviction/delete API | — | 中低/长期 |

**定量判断**：50 个短对话无所谓；50 个含大量 tool/result/contentBlocks 的长对话会明显影响内存、JSON 写入和 render/reload 延迟。风险当前为**中等**，随用户规模增长会上升。

---

### Q4："不应照搬 opencode-desktop 模式"是否过于防御？

#### 原始分析结论
分层存储、LRU 预取、父子会话 worktree 隔离等不适用项不应被改写成待实现任务。

#### Council 共识

**核心立场：判断基本成立，但对 LRU 的排除过于防御。应改为"裁剪采用"而非"防御性排除"。**

| 模式 | 桌面端合理性 | OpenCodian 适用性 | 共识 |
|------|------------|------------------|------|
| 分层存储 + 按目录子存储 + 引用计数 | 高（多目录作用域） | ❌ 不适用（单库单进程） | ✅ 正确排除 |
| 父子会话 + `parentID` + git worktree 隔离 | 高（独立目录上下文） | ❌ 不适用（同会话消息序列） | ✅ 正确排除 |
| 乐观助手消息 + 完整回滚管道 | 高（全窗口 UX） | ❌ 不适用（复杂度/收益不成比例） | ✅ 正确排除 |
| URL 路由导航（SolidJS Router） | 高（独立应用） | ❌ 不适用（标签覆盖层） | ✅ 正确排除 |
| **LRU / 缓存驱逐** | 高（40 会话上限） | ⚠️ **应裁剪采用** | ❌ 不应完全排除 |

**alpha (R2) 新增建议**：

OpenCodian 不应照搬 desktop 式全局 store，但可采用 Obsidian 适配的缓存策略：

```text
metadata index + pinned full conversations + LRU full-message cache
```

- **pin**：active / restored / streaming / finalizing / background-task tabs 保留完整消息
- **LRU**：其余只保留 metadata，完整消息按需加载
- **eviction**：`OpenCodeSessionStateStore.sessions` 也应补充 `deleteSession()` API

---

### Q5：成熟度评级

#### 原始分析结论
"OpenCodian 会话生命周期机制已经基本成熟"，评分隐式约 8.5-9/10。

#### Council 共识

| 议员 | 评分 | 置信度 |
|------|------|--------|
| **alpha** (R2) | **7.6/10** | 高（基于源码审查） |
| **delta** (R1) | **7.5-8/10** | 高（基于 10+ 核心文件审查） |

**共识评分：7.5-8/10**（opencode-desktop = 10）

#### 扣分明细（alpha R2 精细拆分）

| 扣分项 | 分值 | 说明 |
|--------|------|------|
| `Conversation.messages` 仍是可写副真相 | -0.9 | 持久化/display 写入点未完全收归 canonical |
| busy/phase 状态分散，缺可验证状态机 | -0.7 | `syncing` 不参与 foreground busy，转换无互斥保护 |
| conversation save 缺 serialization/version guard | -0.5 | per-conversation 写入无序 |
| 长期运行缓存增长边界不完整 | -0.4 | full conversation + canonical sessions 均无 eviction |
| background task 嵌入同一消息序列 | -0.4 | 语义证明比 desktop 子会话隔离更难 |

#### 加分项（两票一致认可）

- ✅ canonical graph owner 已建立且返回防御性克隆
- ✅ sync event 有 16ms batching + 去重 + barrier + delta 跳过
- ✅ follow-up queue 功能完整且有测试覆盖
- ✅ background task metadata 持久化 + restore
- ✅ active stream duplicate busy gating
- ✅ 标签页级隔离 + sessionId 流单例

---

## 5. 成熟度重新评级

### 原始结论 vs Council 修正

| 维度 | 原始分析 | Council 修正 |
|------|---------|-------------|
| 双重真相收敛 | "已基本收敛" | **"核心路径 canonical-first，残余中等风险"** |
| 状态分散 | "已通过 TabSessionPhase 缓解" | **"只读派生不够，写入仍分散，需状态机"** |
| 遗漏差距 | "未遗漏重大差距" | **"3+1 项被低估"** |
| LRU 排除 | "不应照搬，完全排除" | **"应裁剪采用，不完全排除"** |
| 整体成熟度 | "基本成熟" (~8.5-9/10) | **"功能成熟、架构收敛中" (7.5-8/10)** |

### 修正后结论

> **OpenCodian 会话生命周期核心能力已成熟实现（多标签并发、canonical 状态管理、发送管线、后台任务），但架构一致性边界尚未完全收敛。当前处于"功能成熟、架构收敛中"状态，评分 7.5-8/10。**
>
> 与 opencode-desktop 的主要差距不是功能缺失，而是：
> 1. 一致性强边界（双重真相残余写入路径）
> 2. 状态机形式化（4+ 布尔值 → 可验证状态机）
> 3. 长期扩展性策略（全量加载无上限 + 无 eviction）

---

## 6. 最高优先改进路线（Council 一致推荐）

### Tier 1 — 高优先级（一致性 + 维护性）

#### 改进 1：Per-tab writable lifecycle state machine

- **问题**：4+ 布尔值写入分散在两个对象上，busy gating 不可靠
- **方案**：定义 `TabSessionPhase` 可写状态机，明确转换表
- **转换表草案**：
  ```text
  idle → preparing → streaming → finalizing → syncing → idle
                          ↓           ↓           ↓
                     cancelled    error      cancelled
  ```
- **影响**：高 — 消除不一致组合，所有 busy gating 只问单一状态源
- **工作量**：中
- **风险**：中 — 需要覆盖所有现有状态转换路径

#### 改进 2：Per-conversation write serialization + monotonic version

- **问题**：async interleaving 可能导致 `ChatMessage[]` cache 短暂不一致
- **方案**：为 `Conversation.messages` 写入引入 per-conversation write lock 或 monotonic version guard
- **影响**：中-高 — 防止 finalization sync + user hydration + bg task polling 交错时的 cache drift
- **工作量**：中
- **风险**：中 — 需避免死锁和延迟渲染

### Tier 2 — 中优先级（扩展性）

#### 改进 3：Obsidian 适配的 LRU 缓存

- **问题**：full conversation + canonical sessions 均无 eviction，长期运行内存只增不减
- **方案**：metadata index + pinned full conversations + LRU full-message cache
  - pin：active / streaming / finalizing / background-task tabs
  - LRU：其余 tab 只保留 metadata
- **影响**：中 — 降低长期运行内存占用和 render/reload 延迟
- **工作量**：中
- **风险**：低 — 不影响核心功能

#### 改进 4：Canonical sessions map eviction API

- **问题**：`OpenCodeSessionStateStore.sessions` 无 `deleteSession()` API
- **方案**：补充 session 级 eviction/delete，与改进 3 的 LRU 策略联动
- **影响**：中
- **工作量**：低
- **风险**：低

### Tier 3 — 长期方向（架构简化）

#### 改进 5：双重真相最终收敛

- **问题**：`Conversation.messages` 仍参与 optimistic seeding、bg task parsing、diff notice 等路径
- **方案**：渐进式让 `Conversation.messages` 退化为纯持久化载体，运行时不再直接读取
- **前置条件**：改进 1（状态机）和 改进 2（write serialization）应先落地
- **影响**：高 — 架构简化，消除理解和维护成本
- **工作量**：高 — 需要多迭代逐步迁移
- **风险**：中 — 需要在每个阶段充分验证

---

## 7. 附录 A：各议员独立立场摘要

### Alpha（gpt-5.5）— 两轮深度审查

**评分：7.6/10**，置信度高。

定位为"canonical 优先 + local cache/display 边界基本清晰，但未完全成熟"。

**关键发现**：
- sync event 错过事件后无强制重放保证
- canonical sessions map 无 eviction API
- 3 个具体失败场景（finalization sync 窗口、cancel 时序、stream done 后延迟）
- `syncing` 不参与 foreground busy 是最具体的状态机缺陷

**优先改进**：monotonic version/write token → writable state machine → LRU eviction

### Delta（kimi-for-coding）— 一轮深度审查

**评分：7.5-8/10**，置信度高。

定位为"功能成熟、架构收敛中，非终点状态"。

**关键发现**：
- `isStreaming=true` + `sessionStatus=idle` 的具体用户可重入场景
- 跨对象耦合比报告描述更深
- 对"温和乐观偏倚"的定性最明确

**优先改进**：条件性串行写入保护 → 可验证状态机 → 长期 LRU 策略

---

## 8. 附录 B：关键文件索引

### OpenCodian 会话生命周期核心文件

| 文件 | 职责 |
|------|------|
| `src/features/chat/OpenCodianView.ts` | 主聊天运行时 |
| `src/core/opencode/OpenCodeService.ts` | 混合 SDK facade |
| `src/core/opencode/OpenCodeSessionStateStore.ts` | 规范会话状态存储 |
| `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts` | 流式传输运行时 |
| `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts` | 同步事件订阅 |
| `src/features/chat/ConversationTabRuntimeCoordinator.ts` | 标签页生命周期 |
| `src/features/chat/BackgroundTaskTimelineService.ts` | 后台任务时间线 |
| `src/features/chat/BackgroundTaskStreamTriggerCoordinator.ts` | 后台任务检测 |
| `src/features/chat/SendPipelineRuntime.ts` | 发送管线 |

### 参考文档

| 文档 | 说明 |
|------|------|
| `docs/status/session-lifecycle-alignment-evaluation.md` | 原始对齐评估报告 |
| 本文档 | Council 审查结论 |

---

## 9. 审查方法说明

1. **多模型独立审查**：2 个独立模型（gpt-5.5 + kimi-for-coding）分别阅读源码和评估报告，独立回答 5 个问题
2. **两轮调用**：第一轮 4 个模型中 2 个响应；第二轮简化 prompt 后仍只有 1 个新增响应
3. **综合方式**：先汇总各模型独立立场，再提取高度一致的共识结论
4. **分歧处理**：两票在所有 5 个问题上的立场高度一致，无重大分歧需仲裁

---

> **状态注记**：本文是 Council 审查结论，不是实施路线图。后续实施应参考 `docs/status/session-lifecycle-alignment-evaluation.md` 中的 Tier 分级，并结合本文的改进路线进行优先级调整。
