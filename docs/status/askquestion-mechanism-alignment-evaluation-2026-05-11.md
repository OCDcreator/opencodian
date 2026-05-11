# AskQuestion 机制对齐评估：OpenCodian vs opencode-desktop

> **评估日期**：2026-05-11
> **评估性质**：多 LLM 共识评估（Council，5 councillors）
> **评估对象**：OpenCodian 与 opencode-desktop 在 askquestion 交互机制上的架构与 UX 对齐
> **参与模型**：Council 多模型共识（α / β / γ / δ / ε）
> **关联文档**：`docs/status/task-subagent-lifecycle-alignment-evaluation-2026-05-11.md`、`docs/status/session-lifecycle-alignment-evaluation.md`
> **对比项目**：OpenCode — [https://github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)
> **参考 PR**：[#5958](https://github.com/opencode-ai/opencode/pull/5958)、[#8232](https://github.com/opencode-ai/opencode/pull/8232)、[#12046](https://github.com/opencode-ai/opencode/pull/12046)

---

## 0. 执行摘要

### 核心结论

**当前对齐评分：6.7/10**（67 / 100 分，councillors 评分范围 6.0–7.4）

OpenCodian 的 askquestion 机制在**功能上完整**——核心流程（检测→渲染→收集→回复→恢复）可以正常运转，用户能够看到问题、做出选择、让 AI 恢复执行。然而存在两类显著差距：

1. **交互层**：键盘导航完全缺失（2.8/10），这是 desktop 端最核心的 UX 特性之一，OpenCodian 当前仅支持鼠标点击。
2. **协议健壮性**：缺少 tool-part `waiting` 状态回退（6.2/10），当 `question.asked` 事件丢失时问题可能被遗漏。

**已发现一个确认 bug**：`QuestionDockCoordinator.clearPendingQuestionState()` 在清除 waiter Map 时不先 resolve Promise，导致流挂起。

### 差距构成分析

| 差距类别 | 影响分数 | 性质 |
|----------|----------|------|
| 缺少键盘导航 | -12 分 | UX 功能缺失 |
| 缺少协议回退（`waiting` 检测） | -8 分 | 健壮性风险 |
| 缺少交互优化（自动前进、Confirm 类型） | -8 分 | UX 打磨 |
| 状态管理边界情况（waiter 泄漏、超时） | -5 分 | 正确性 bug |

**预期可达对齐评分：8.5/10**（完成 P0 + P1 修复后）

---

## 1. 评估背景

### 1.1 AskQuestion 是什么

AskQuestion 是 OpenCode 内置的结构化用户交互原语。它允许 AI 在自主执行过程中暂停，向用户提出有限的选择题或确认问题，获取结构化回答后继续执行。

```text
  AI 自主执行 ──→ 调用 askquestion 工具 ──→ 暂停等待
                                              │
                                      ┌───────┴───────┐
                                      │  客户端渲染 UI  │
                                      │  用户做出选择   │
                                      └───────┬───────┘
                                              │
  AI 继续执行 ←── 工具返回结构化答案 ←─────────┘
```

### 1.2 三个前端如何处理 AskQuestion

```text
                    ┌──────────────────────────────────┐
                    │       OpenCode Server (Go)        │
                    │                                   │
                    │  核心能力:                         │
                    │  · question.ask() → Promise 挂起   │
                    │  · question.asked SSE 事件         │
                    │  · tool-part waiting → running     │
                    │  · GET /question REST 端点         │
                    │  · POST /question/{id}/reply       │
                    │  · POST /question/{id}/reject      │
                    └─────────┬────────────┬────────────┘
                              │            │
              ┌───────────────┼────────────┼──────────────┐
              │               │            │              │
        ┌─────┴──────┐ ┌─────┴─────┐ ┌────┴──────┐ ┌────┴────────┐
        │ TUI (终端) │ │ Desktop   │ │ Web UI    │ │ OpenCodian  │
        │ 键盘 Wizard│ │ SolidJS   │ │ React     │ │ Obsidian    │
        │ 全键盘导航 │ │ Modal     │ │ Modal     │ │ Inline/Dock │
        │ 自动前进   │ │ 键盘导航   │ │           │ │ 鼠标操作    │
        └────────────┘ └───────────┘ └───────────┘ └─────────────┘
```

### 1.3 评估范围

| 维度 | 覆盖范围 |
|------|---------|
| 后端协议 | OpenCode Server 的 question 工具实现、事件总线、REST 端点 |
| opencode-desktop | PR #8232 desktop 端实现、键盘导航、Permission 对齐行为 |
| OpenCodian | `QuestionDockCoordinator`、`QuestionDock`、`QuestionInlineCardRenderer`、`OpenCodeQuestionPermissionHub`、`OpenCodeStreamEventTransformer` 中的 question 处理 |
| 排除 | TUI 渲染细节、Web UI 渲染、非 question 工具的 tool call 处理 |

---

## 2. opencode-desktop AskQuestion 机制分析

### 2.1 完整生命周期

基于 PR #5958（原始 TUI 实现）、PR #8232（Desktop 移植）和 PR #12046（API/SDK 暴露）的分析：

```text
  ① Agent 决定提问
     │
     ▼
  ② 调用 askquestion 工具
     │  Schema: Zod 校验，1-6 个问题
     │  类型: single-select | multi-select | confirm
     │  输入: { header, questions: [...], options: [...] }
     │
     ▼
  ③ 工具注册 pending request
     │  状态: → waiting
     │  Promise 挂起，执行暂停
     │
     ▼
  ④ 状态传播
     │  路径 A: question.asked SSE 事件（独立事件）
     │  路径 B: tool-part state.metadata 更新（tool 内嵌）
     │  关键: 先等 tool-part 进入 running 状态再附加 metadata
     │        (指数退避轮询，最多 1 秒)
     │
     ▼
  ⑤ 客户端检测并渲染
     │  Desktop: modal overlay + 键盘导航
     │  TUI: 全屏 Wizard 覆盖层
     │
     ▼
  ⑥ 用户交互
     │  Space: 切换选项
     │  Enter: 确认/提交
     │  Arrow Up/Down: 导航选项
     │  Escape: 关闭/取消
     │  单选时: Auto-Advance 自动前进到下一题
     │
     ▼
  ⑦ 提交回答
     │  POST /question/{id}/reply  (接受)
     │  POST /question/{id}/reject (拒绝)
     │  回答格式: 人类可读 Markdown（便于 LLM 消化）
     │
     ▼
  ⑧ Promise 解决，AI 恢复执行
```

### 2.2 关键技术细节

#### 2.2.1 双重状态传播路径

opencode-desktop 支持两种 question 检测方式，确保可靠性：

- **路径 A（首选）**：`question.asked` 独立 SSE 事件
- **路径 B（回退）**：tool-part `state.status === 'waiting'` + `state.metadata` 中的 questions 数据

`src/session/prompt.ts` 中的轮询重试机制确保 tool-part 进入 `running` 状态后才附加 metadata，解决了工具执行快于事件传播的竞态条件。

#### 2.2.2 本地 API 校准

**当前校准（2026-05-11 源码复核）：** 本地 OpenCode 参考实现当前公开 `GET /question`、`POST /question/{requestID}/reply`、`POST /question/{requestID}/reject`，SDK 也只生成 `question.list()` / `question.reply()` / `question.reject()`。

因此，历史 PR 背景里的 `POST /question/ask` 与 `awaitAnswers` 不作为当前修复目标；除非后续上游重新暴露该 route，否则仅保留为历史 PR 背景。

#### 2.2.3 客户端识别

```typescript
// Server 端根据客户端类型决定是否提供 question 工具
// TUI:    x-opencode-client: tui
// Desktop: 固有的桌面客户端头
// Web:     默认值
// ACP:     禁用 question 工具 (PR #11379)
// Zed:     客户端名 "zed" → 禁用 question 工具
```

#### 2.2.4 答案格式

工具返回人类可读的 Markdown 字符串，而非原始 JSON。LLM 能直接消化，无需额外解析：

```markdown
## Question: Design Preferences
Selected: Comprehensive Feature-Rich Interfaces

## Question: Test Framework
Selected: Vitest
```

### 2.3 Desktop 端特有的 UX 特性

| 特性 | 说明 |
|------|------|
| Modal overlay | 覆盖在聊天上方，捕获焦点 |
| 键盘导航 | Space/Enter/Arrow/Escape 完整支持 |
| Auto-advance | 单选题选择后自动跳转下一题 |
| Permission 对齐 | 复用 Desktop 的 Permission 交互模式 |
| 长描述折叠 | Issue #14924: 默认截断，需 hover/展开查看 |

---

## 3. OpenCodian 当前实现分析

### 3.1 架构概览

```text
  ┌───────────────────────────────────────────────────────────────┐
  │                    OpenCodian Question 子系统                  │
  │                                                               │
  │  ┌─────────────────────────────────────────────────────────┐  │
  │  │ 检测层                                                   │  │
  │  │  OpenCodeStreamEventTransformer.handleQuestionAsked()    │  │
  │  │  → SSE question.asked 事件 → question_request chunk     │  │
  │  │  StreamChunkRouter.handleInteractiveChunk()              │  │
  │  │  → 路由到 showQuestionDialog()                           │  │
  │  │  轮询回退: GET /question（非活跃流时捕获问题）            │  │
  │  └──────────────────────────┬──────────────────────────────┘  │
  │                             │                                  │
  │  ┌──────────────────────────▼──────────────────────────────┐  │
  │  │ 状态层                                                   │  │
  │  │  QuestionDockCoordinator                                 │  │
  │  │  · pendingQuestionRequests (QuestionRequest[])           │  │
  │  │  · questionRequestWaiters (Map<id, { promise, resolve }>)│  │
  │  │  · questionDraftAnswers (Map<id, string[][]>)            │  │
  │  │  · resolvedQuestionRequestIds (Set)                      │  │
  │  │  · questionActiveGroupKeys / questionActiveIndexes       │  │
  │  └──────────────────────────┬──────────────────────────────┘  │
  │                             │                                  │
  │  ┌──────────────────────────▼──────────────────────────────┐  │
  │  │ 渲染层                                                   │  │
  │  │  QuestionDock (above_input 模式)                         │  │
  │  │  · 分组标签页                                             │  │
  │  │  · 进度指示器                                             │  │
  │  │  · 单选/多选/自定义输入                                    │  │
  │  │  QuestionInlineCardRenderer (inline 模式)                │  │
  │  │  · 嵌入助手消息流                                         │  │
  │  └──────────────────────────┬──────────────────────────────┘  │
  │                             │                                  │
  │  ┌──────────────────────────▼──────────────────────────────┐  │
  │  │ 回复层                                                   │  │
  │  │  OpenCodeQuestionPermissionHub                           │  │
  │  │  · reply() → POST /question/{id}/reply                   │  │
  │  │  · reject() → POST /question/{id}/reject                 │  │
  │  │  · list() → GET /question                                │  │
  │  │  QuestionResolutionExecutionFacade                       │  │
  │  │  · 错误处理 → Obsidian Notice                            │  │
  │  └──────────────────────────┬──────────────────────────────┘  │
  │                             │                                  │
  │  ┌──────────────────────────▼──────────────────────────────┐  │
  │  │ 激活层                                                   │  │
  │  │  QuestionTodoBackgroundTaskActivationHostAdapter         │  │
  │  │  QuestionTodoActivationRefreshCoordinator                │  │
  │  │  QuestionTodoStatusRefreshCoordinator                    │  │
  │  │  PostSyncQuestionTodoRefreshHostAdapter                  │  │
  │  │  TabActivationRuntimeViewHostFactory (question 装配)      │  │
  │  └─────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────┘
```

### 3.2 核心文件清单

| 文件 | 职责 |
|------|------|
| `src/features/chat/services/QuestionDockCoordinator.ts` | 问题状态管理、Promise 挂起、渲染调度 |
| `src/features/chat/ui/QuestionDock.ts` | above_input 模式下的 Dock UI |
| `src/features/chat/runtime/QuestionInlineCardRenderer.ts` | inline 模式下的内嵌卡片 UI |
| `src/core/opencode/OpenCodeQuestionPermissionHub.ts` | SDK/HTTP 双层 question API 调用 |
| `src/core/opencode/OpenCodeStreamEventTransformer.ts` | SSE question.asked 事件处理 |
| `src/core/opencode/OpenCodeMessageNormalizationMapper.ts` | QuestionPrompt 类型归一化 |
| `src/core/types/chat.ts` | QuestionPrompt / QuestionOption 类型定义 |
| `src/core/types/settings.ts` | questionDisplayMode / questionCardPosition 设置 |
| `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts` | 后台任务与问题激活桥接 |
| `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts` | 激活刷新协调 |
| `src/features/chat/runtime/QuestionResolutionExecutionFacade.ts` | 回复/拒绝执行门面 |

### 3.3 用户可配置项

| 设置项 | 可选值 | 说明 |
|--------|--------|------|
| `questionDisplayMode` | `'all'` \| `'single'` | 一次显示全部问题或逐题显示 |
| `questionCardPosition` | `'inline'` \| `'aboveInput'` | 问题卡片嵌入聊天流或停靠在输入框上方 |
| `showAnsweredQuestionCards` | `boolean` | 是否保留已回答/拒绝的问题回顾卡片 |

### 3.4 问题类型支持

```typescript
// src/core/types/chat.ts — 当前 QuestionPrompt 类型
interface QuestionPrompt {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;   // 单选/多选
  custom?: boolean;     // 是否允许自定义输入
}
```

**注意**：没有显式的 `confirm` 类型，也没有 `kind` 字段区分问题类型。确认场景退化为带 yes/no 选项的普通单选题。

---

## 4. 逐维度评分与差距分析

### 4.1 任务触发机制 — 7.4/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 8 | 8 | 6 | 7 | 8 | **7.4**  |

**严重程度：MEDIUM**

**OpenCodian 实现：**
- `OpenCodeStreamEventTransformer.handleQuestionAsked()` 将 SSE `question.asked` 事件转换为 `question_request` stream chunk
- `StreamChunkRouter.handleInteractiveChunk()` 路由到 `showQuestionDialog()`
- 轮询回退通过 `GET /question` 在非活跃流时捕获问题

**差距：**
- opencode-desktop 通过 tool-part `waiting` → `running` 状态转换检测问题，带指数退避轮询（最多 1 秒）确保 tool-part 进入 running 后才附加 metadata
- OpenCodian **没有等价回退**——如果 `question.asked` 事件丢失，问题可能在下一个轮询周期前被遗漏

### 4.2 状态管理 — 7.2/10 ⚠️ BUG

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 8 | 7 | 7 | 7 | 7 | **7.2**  |

**严重程度：HIGH**

**OpenCodian 实现：**
- Per-tab 状态存储在 `QuestionDockCoordinator`：`pendingQuestionRequests`、`questionRequestWaiters`、`questionDraftAnswers`
- 通过 `getOrCreateQuestionWaiter()` 实现 Promise 挂起

**已确认 Bug：**

`clearPendingQuestionState()` 在 `questionRequestWaiters.clear()` 前**不先 resolve Promise**，导致等待中的流无限挂起。

```typescript
// 当前代码 (QuestionDockCoordinator.ts:266-272)
clearPendingQuestionState(runtime: QuestionDockRuntimeState): void {
  runtime.pendingQuestionRequests = [];
  runtime.resolvedQuestionRequestIds.clear();
  runtime.questionDraftAnswers.clear();
  runtime.questionRequestWaiters.clear(); // ← Promise 永远不会 resolve!
}
```

**触发场景：** 标签页关闭、会话丢失、手动清除状态时。

**额外差距：**
- 已验证的本地风险是：如果 OpenCodian 清除本地 pending question state 时未 resolve dock waiter，等待该 waiter 的本地流程可能无限挂起；server-side askquestion 仍依赖 `reply` / `reject` 完成，本轮报告不额外推断服务端执行状态
- `awaitAnswers` 属于历史上游发问模式背景；本地 OpenCode 当前未公开对应 route，本轮不实现

### 4.3 用户交互流程 — 7.0/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 8 | 6 | 7 | 6 | 8 | **7.0**  |

**严重程度：MEDIUM**

**OpenCodian 实现：**
- 两种位置 × 两种模式：`inline`/`aboveInput` × `all`/`single`
- 进度指示器、分组标签页、自定义输入、关闭按钮

**差距：**
- 无**自动前进**：desktop 单选题选择后自动跳转下一题，OpenCodian 需手动点 "Next"
- 无**模态覆盖层 + 焦点捕获**：Obsidian 侧边栏限制使 inline/docked 成为合理替代（此项不计为差距）
- 无**长描述折叠**（desktop Issue #14924 的等价问题）

### 4.4 API/SDK 集成 — 7.0/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 7 | 8 | 5 | 7 | 8 | **7.0**  |

**严重程度：MEDIUM**

**OpenCodian 实现：**
- `OpenCodeQuestionPermissionHub` 实现 SDK-first + HTTP fallback：
  - `list()` → `GET /question`
  - `reply()` → `POST /question/{id}/reply`
  - `reject()` → `POST /question/{id}/reject`

**历史背景 / 非本轮目标：**
- `POST /question/ask` 与 `awaitAnswers` 属于历史 PR 背景；本地 OpenCode 当前未公开该发问 route，OpenCodian 作为问题响应者不把它们列为当前实现缺口。

**低优先级差距：**
- **无 `x-opencode-client` 头**标识（无法区分客户端来源）
- 答案以 `string[][]` 数组发送，非 Markdown 格式（LLM 消化效率稍低）

### 4.5 键盘导航 — 2.8/10 🔴 最严重差距

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 5 | 2 | 2 | 3 | 2 | **2.8**  |

**严重程度：HIGH**

**OpenCodian 实现：**
- 标准 HTML radio/checkbox 控件，仅绑定 `click` 事件

**验证结果：** `QuestionDock.ts`（第 116、145、192、251、281 行）和 `QuestionInlineCardRenderer.ts`（第 116、129、203、215 行）中**零个 `keydown`/`keyup` 事件监听器**。

**差距：**

| 键位 | Desktop 行为 | OpenCodian 行为 |
|------|-------------|----------------|
| Space | 切换选项 | 无（浏览器默认滚动） |
| Enter | 确认/提交 | 无（浏览器默认触发聚焦元素） |
| Arrow Up/Down | 在选项间导航 | 无 |
| Escape | 关闭/取消 | 无 |

**影响：** 用户必须用鼠标完成每一个问题交互。对于频繁使用 askquestion 的工作流（如代码生成前的技术选型），这是显著的效率障碍。

### 4.6 问题类型支持 — 6.6/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 7 | 7 | 5 | 6 | 8 | **6.6**  |

**严重程度：MEDIUM**

**差距：**

| 特性 | Desktop | OpenCodian |
|------|---------|------------|
| Single-select | ✅ | ✅ (`multiple: false`) |
| Multi-select | ✅ | ✅ (`multiple: true`) |
| Confirm (yes/no) | ✅ 显式类型 | ❌ 退化为带选项的单选 |
| Custom input | ✅ | ✅ (`custom: true`) |
| 1-6 问题限制 | ✅ Zod 校验 | ❌ 仅拒绝空数组 |

`OpenCodeMessageNormalizationMapper.normalizeQuestionPrompt()` 只校验非空，无上限约束：

```typescript
// 当前: 只检查非空
if (!data.questions || data.questions.length === 0) return null;
// 缺失: if (data.questions.length > 6) 截断或警告
```

### 4.7 事件/元数据处理 — 6.2/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 7 | 6 | 5 | 6 | 7 | **6.2**  |

**严重程度：HIGH**

**OpenCodian 实现：**
- `handleQuestionAsked()` 处理独立 `question.asked` 事件
- `handleToolPartUpdated()` 追踪 tool parts 的状态变化

**验证结果：** Tool 状态处理仅检查 `pending/running/completed/error`（`OpenCodeStreamEventTransformer.ts:639, 652`）。**无 `waiting` 状态检测**。

**差距：** 如果 server 通过 tool-part metadata 发送问题（而非独立事件），OpenCodian 将完全遗漏这些问题。这在以下场景可能发生：
- SSE 连接不稳定
- 事件被过滤或截断
- Server 端版本升级改变了事件发送策略

### 4.8 平台特定 UX — 8.4/10 ✅ 最佳维度

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 9 | 8 | 8 | 9 | 8 | **8.4**  |

**严重程度：LOW**

**评估：** OpenCodian 的 inline/docked 模式在 Obsidian 侧边栏限制下是**合理的设计选择**。

| 特性 | Desktop (Modal) | OpenCodian (Inline/Dock) | 评价 |
|------|-----------------|--------------------------|------|
| 视觉突出性 | 高（覆盖全屏） | 中（侧边栏内） | 平台限制，可接受 |
| 上下文保留 | 低（遮挡聊天） | 高（聊天仍可见） | OpenCodian 更优 |
| 多标签页支持 | 无（单会话） | 有（per-tab） | OpenCodian 更优 |
| 并发会话问题 | 全局队列 | Per-tab 隔离 | OpenCodian 更优 |

**结论：** 此维度的差异是**有意的 UX 设计**，非技术缺陷。

### 4.9 错误处理与边界情况 — 6.6/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 7 | 7 | 6 | 6 | 7 | **6.6**  |

**严重程度：MEDIUM**

**OpenCodian 实现：**
- `QuestionResolutionExecutionFacade.execute()` 捕获错误并显示 Obsidian `Notice`
- 轮询错误静默吞掉（仅 debug 日志）
- `mergePendingQuestionRequests()` 按 ID 去重

**差距：**
- 回复/拒绝操作失败后**无重试逻辑**
- `questionRequestWaiters` **无超时机制**（内存泄漏风险）
- Server 重启导致的问题过期**无恢复 UI**

### 4.10 后台任务集成 — 7.8/10

| 评估者 | α | β | γ | δ | ε | **共识** |
|--------|---|---|---|---|---|:--------:|
| 评分   | 8 | 8 | 7 | 8 | 8 | **7.8**  |

**严重程度：LOW**

**OpenCodian 实现：**
- `QuestionTodoBackgroundTaskActivationHostAdapter`
- `QuestionTodoActivationRefreshCoordinator`
- `QuestionTodoStatusRefreshCoordinator`
- `PostSyncQuestionTodoRefreshHostAdapter`
- `TabActivationRuntimeViewHostFactory` 中的 question 装配

**评估：** 在某些方面**超出 desktop**。处理了标签页激活、同步后刷新和注意力指示器。轮询方式健壮但可能偏频繁。

---

## 5. 对齐路线图

### 5.1 优先级定义

| 级别 | 定义 | 标准 |
|------|------|------|
| **P0** | 必须修复 | 正确性 bug 或核心 UX 缺失，影响基本可用性 |
| **P1** | 应该修复 | 健壮性风险或协议对齐差距，影响可靠性 |
| **P2** | 可以修复 | 打磨项或协议完整性，不影响核心功能 |

### 5.2 本轮修复边界

**本轮修复边界（已批准）：**

1. 校准本报告中不再符合当前源码的 owner / upstream route / 优先级表述。
2. 修复 `QuestionDockCoordinator.clearPendingQuestionState()` 的 waiter 释放 bug。
3. 更新聚焦单测与 `QuestionDockCoordinator` module doc。

键盘导航、tool-part fallback、question 数量上限归一化继续保留为后续计划项，本轮不实现。

**waiter 泄漏修复方案：**

```typescript
clearPendingQuestionState(runtime: QuestionDockRuntimeState): void {
  for (const waiter of runtime.questionRequestWaiters.values()) {
    waiter.resolve();
  }
  runtime.questionRequestWaiters.clear();
  runtime.pendingQuestionRequests = [];
  runtime.resolvedQuestionRequestIds.clear();
  runtime.questionDraftAnswers.clear();
  runtime.questionActiveGroupKeys.clear();
  runtime.questionActiveIndexes.clear();
}
```

### 5.3 后续计划项

#### 键盘导航

**后续实现范围：**

| 键位 | 行为 |
|------|------|
| `Space` | 切换当前聚焦选项 |
| `Enter` | 提交答案（全部答完时）或前进到下一题 |
| `ArrowDown` | 聚焦下一个选项 |
| `ArrowUp` | 聚焦上一个选项 |
| `Escape` | 关闭/取消 |

#### 协议健壮性与交互打磨

| # | 项目 | 涉及文件 | 工作量 | 影响 |
|---|------|---------|--------|------|
| P1-1 | **添加 tool-part `waiting` 状态回退** | `OpenCodeStreamEventTransformer.ts` | 2-3 hrs | HIGH — 防止事件丢失时遗漏问题 |
| P1-2 | **添加单选自动前进** | `QuestionDock.ts` | 1 hr | MEDIUM — 匹配 desktop wizard 行为 |
| P1-3 | **添加 Confirm 类型支持** | `chat.ts`, `OpenCodeMessageNormalizationMapper.ts` | 1-2 hrs | MEDIUM — 更清晰的 yes/no 交互 |
| P1-4 | **强制 1-6 问题限制** | `OpenCodeMessageNormalizationMapper.ts` | 30 min | LOW — 防御性归一化 |
| P1-5 | **添加 waiter 超时** | `QuestionDockCoordinator.ts` | 30 min | MEDIUM — 防止内存泄漏 |

**P1-1 修复方案：** 在 `handleToolPartUpdated` 中增加 `waiting` 状态检测：

```text
if tool-part state is waiting
and the tool identity is question / askuserquestion
and the waiting metadata contains a valid question payload:
  normalize that payload through the existing question request mapper
  emit a question_request chunk as a fallback to a missed question.asked event
```

**P1-3 修复方案：** 扩展 QuestionPrompt 类型：

```typescript
interface QuestionPrompt {
  kind?: 'single-select' | 'multi-select' | 'confirm' | 'custom';
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}
```

#### 低优先级平台适配

| # | 项目 | 涉及文件 | 工作量 | 影响 |
|---|------|---------|--------|------|
| P2-1 | 添加 `x-opencode-client: opencodian` 头 | `sdkFetch.ts` | 15 min | LOW — 客户端标识 |
| P2-2 | Markdown 格式化答案 | `OpenCodeQuestionPermissionHub.ts` | 1 hr | LOW — LLM 消化效率 |
| P2-3 | 长选项描述折叠 | `QuestionDock.ts` | 1-2 hrs | LOW — 匹配 desktop UX |
| P2-4 | 回复/拒绝重试逻辑 | `OpenCodeQuestionPermissionHub.ts` | 1-2 hrs | MEDIUM — 网络韧性 |

### 5.5 工作量汇总

| 优先级 | 项目数 | 总工作量 | 预期评分提升 |
|--------|--------|---------|-------------|
| 本轮已批准 | 3 | ~1-2 hrs | 先校准报告并修复确认 bug |
| 键盘导航 | 2 | ~3-5 hrs | +8 分（67→75） |
| P1 | 5 | ~6-8 hrs | +8 分（75→83） |
| P2 | 4 | ~4-6 hrs | +3 分（83→86） |

---

## 6. 不应对齐的领域

以下差异是**有意的平台适配**，不建议改变：

| 差异 | 理由 |
|------|------|
| Modal overlay → Inline/Dock | Obsidian 侧边栏无法创建真正的窗口级模态层 |
| 全局问题队列 → Per-tab 隔离 | OpenCodian 支持并发多标签页会话 |
| `POST /question/ask` | OpenCodian 是问题响应者，不是发起者 |
| `awaitAnswers` | 同上——仅在发起问题时相关 |
| Markdown 答案格式 | 当前 `string[][]` 可工作，Markdown 是优化项 |
| 焦点捕获 | Obsidian 插件无法完全控制焦点链 |

---

## 7. 结论

### 7.1 总体评估

OpenCodian 的 askquestion 机制在**核心功能上完整**，用户能够正常完成"AI 提问→用户回答→AI 继续"的交互闭环。主要的差距集中在：

1. **交互层**（键盘导航缺失）—— 可修复，影响效率
2. **协议健壮性**（waiting 状态回退缺失）—— 可修复，影响可靠性
3. **状态管理**（waiter 泄漏 bug）—— 已确认，需立即修复

### 7.2 推荐行动

1. **本轮**：按已批准边界校准报告、修复 `QuestionDockCoordinator.clearPendingQuestionState()` waiter 释放 bug、更新聚焦单测与 module doc。
2. **后续 UX 计划**：实现键盘导航（Dock / Inline），显著提升键盘用户效率。
3. **后续可靠性计划**：评估并实现 tool-part fallback、question 数量上限归一化等可靠性补强。
4. **不推荐**：为对齐而追求当前本地 OpenCode 未公开的发问 route——这些是历史 PR 背景，不是本轮缺陷。

### 7.3 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Waiter 泄漏导致流挂起 | 高（已确认） | 高 | 本轮修复 |
| `question.asked` 事件丢失 | 中 | 中 | 后续 tool-part fallback |
| 键盘用户无法高效答题 | 高 | 中 | 后续键盘导航 |
| 问题数组超出合理范围 | 低 | 低 | 后续上限校验 |

---

## 附录 A：Councillor 个体评分

| 维度 | α | β | γ | δ | ε | 共识 |
|------|---|---|---|---|---|------|
| 任务触发机制 | 8 | 8 | 6 | 7 | 8 | 7.4 |
| 状态管理 | 8 | 7 | 7 | 7 | 7 | 7.2 |
| 用户交互流程 | 8 | 6 | 7 | 6 | 8 | 7.0 |
| API/SDK 集成 | 7 | 8 | 5 | 7 | 8 | 7.0 |
| 键盘导航 | 5 | 2 | 2 | 3 | 2 | 2.8 |
| 问题类型支持 | 7 | 7 | 5 | 6 | 8 | 6.6 |
| 事件/元数据处理 | 7 | 6 | 5 | 6 | 7 | 6.2 |
| 平台特定 UX | 9 | 8 | 8 | 9 | 8 | 8.4 |
| 错误处理 | 7 | 7 | 6 | 6 | 7 | 6.6 |
| 后台任务集成 | 8 | 8 | 7 | 8 | 8 | 7.8 |
| **总计** | **74** | **67** | **58** | **65** | **71** | **67.0** |

## 附录 B：参考源

| 来源 | URL |
|------|-----|
| PR #5958 — AskQuestion 工具原始实现 | https://github.com/opencode-ai/opencode/pull/5958 |
| PR #8232 — Desktop AskQuestion 支持 | https://github.com/opencode-ai/opencode/pull/8232 |
| PR #12046 — 暴露 Question.ask API/SDK | https://github.com/opencode-ai/opencode/pull/12046 |
| PR #8404 — 早期 Question.ask 暴露（已关闭） | https://github.com/opencode-ai/opencode/pull/8404 |
| Issue #6330 — 通用 UI Intent Channel 提案 | https://github.com/opencode-ai/opencode/issues/6330 |
| Issue #14924 — Desktop 长描述截断 | https://github.com/opencode-ai/opencode/issues/14924 |
| Issue #8132 — Question 工具运行时不可用 | https://github.com/opencode-ai/opencode/issues/8132 |
| Issue #11361 — Zed 客户端 AskUserQuestion 问题 | https://github.com/opencode-ai/opencode/issues/11361 |
