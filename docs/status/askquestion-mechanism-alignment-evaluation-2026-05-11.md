# AskQuestion 机制对齐评估：OpenCodian vs OpenCode Desktop

> **评估日期**：2026-05-11
> **终态校准日期**：2026-05-11
> **评估对象**：OpenCodian 与 OpenCode Desktop / App / TUI 在 AskQuestion 交互机制上的架构、协议与 UX 对齐
> **对比项目**：OpenCode — <https://github.com/opencode-ai/opencode>
> **参考 PR**：[#5958](https://github.com/opencode-ai/opencode/pull/5958)、[#8232](https://github.com/opencode-ai/opencode/pull/8232)、[#12046](https://github.com/opencode-ai/opencode/pull/12046)

---

## 0. 执行摘要

**当前对齐评分：9.0/10**。

OpenCodian 的 AskQuestion 机制现在已完成本轮要求的“完全体”对齐：核心流程、状态释放、Dock 键盘交互、Inline 键盘交互、协议事件主路径、pending question polling，以及保守 tool-part fallback 都已落地。剩余差异是平台适配或当前上游未公开的历史 PR 背景，不再列为必须对齐的问题。

| 对齐点 | 当前状态 | 证据 |
|--------|----------|------|
| `question.asked` 事件主路径 | 已对齐 | `OpenCodeStreamEventTransformer.handleQuestionAsked()` 输出 `question_request` |
| `question.list/reply/reject` | 已对齐 | `OpenCodeQuestionPermissionHub` SDK-first + HTTP fallback |
| pending question polling | 已对齐 | tab activation / post-sync refresh 可恢复非活跃流问题 |
| Dock waiter cleanup | 已修复 | `QuestionDockCoordinator.clearPendingQuestionState()` 先 resolve waiters 再清空 |
| Dock 键盘交互 | 已对齐 | Arrow/Home/End、Space/Enter、Escape、单选非终题 auto-advance |
| Inline 键盘交互 | 已对齐 | option-local keydown、custom input native editing、Escape reject |
| tool-part fallback | 已对齐 | waiting `question` tool-part 可通过 `normalizeQuestionRequest()` 补发 `question_request` |
| 当前 OpenCode API 校准 | 已校准 | 本地参考公开 `GET /question`、`POST /question/{id}/reply`、`POST /question/{id}/reject`，未公开 `POST /question/ask` |

---

## 1. 当前 OpenCode 契约校准

本轮复核的本地 OpenCode 参考实现显示：

- `question.ask()` 是 server/tool 内部能力，注册 pending request 后发布 `question.asked` bus event。
- HTTP / SDK 对客户端公开的是 pending question 响应面：`question.list()`、`question.reply()`、`question.reject()`。
- 当前本地参考没有公开 `POST /question/ask` route；历史 PR 背景中的 `awaitAnswers` 不作为 OpenCodian 当前必做项。
- question tool 完成后的 tool metadata 当前承载 `answers`，不是 pending request 的唯一主路径。

因此 OpenCodian 的目标不是实现一个发问 API，而是可靠接收并响应 OpenCode 已发起的问题。

---

## 2. OpenCodian 当前架构

```text
OpenCode stream / polling
  ├─ question.asked event
  ├─ waiting question tool-part fallback
  └─ question.list polling
        ↓
OpenCodeStreamEventTransformer / OpenCodeQuestionPermissionHub
        ↓
StreamChunkRouter
        ↓
QuestionDockCoordinator
        ↓
QuestionDock or QuestionInlineCardRenderer
        ↓
question.reply / question.reject
```

核心 owner：

| 文件 | 职责 |
|------|------|
| `src/core/opencode/OpenCodeStreamEventTransformer.ts` | 将 `question.asked` 与保守 waiting `question` tool-part fallback 转为 `question_request` chunk |
| `src/core/opencode/OpenCodeQuestionPermissionHub.ts` | pending questions 的 list/reply/reject，SDK-first + HTTP fallback |
| `src/features/chat/services/QuestionDockCoordinator.ts` | per-tab question 状态、draft、waiter、resolved id 管理 |
| `src/features/chat/ui/QuestionDock.ts` | above-input question UI 与键盘交互 |
| `src/features/chat/runtime/QuestionInlineCardRenderer.ts` | inline question card UI 与键盘交互 |

---

## 3. 已关闭问题

### 3.1 报告校准

旧报告曾把部分历史 PR 背景当作当前缺口，并把 waiter owner 写偏。当前已校准：

- bug owner 是 `QuestionDockCoordinator`，不是不存在的 `QuestionDockSlotCoordinator`。
- 本地 OpenCode 当前没有 `POST /question/ask` route。
- OpenCodian 作为客户端响应 pending question，不实现 server-side 发问接口。

### 3.2 Waiter cleanup

旧问题：`clearPendingQuestionState()` 清空 `questionRequestWaiters` 前不 resolve waiter，可能让等待本地 dock resolution 的流程挂起。

当前状态：已修复。清理 pending question state 时先释放 waiters，再清空 pending/draft/active state。

### 3.3 Dock 键盘交互

当前状态：已实现。

- ArrowUp / ArrowDown / ArrowLeft / ArrowRight 移动 option focus。
- Home / End 跳到首尾选项。
- Space / Enter 可切换或选择选项。
- 单选 sequential 非终题选择后 auto-advance。
- final submit 仍需要 Enter 或 submit action，避免误提交。
- 多选不 auto-submit。
- custom input 保留原生文字编辑键位。
- Escape reject。

### 3.4 Inline 键盘交互

当前状态：已实现。

- keydown handler 只绑定在 inline card 本地，不加 global listener。
- option 上 Space / Enter 切换或选择。
- sequential single-select 非终题 auto-advance，终题需要显式提交。
- grouped all-mode 中 option key 只切换，不提交或前进。
- custom input 保留 Enter / Arrow / Home / End / Space 的原生编辑语义。
- Escape reject。

### 3.5 Tool-part fallback

当前状态：已实现为保守 fallback。

`OpenCodeStreamEventTransformer` 现在在两条路径中处理 waiting `question` tool-part：

- `handleToolPartUpdated()`：真实 stream event 路径
- `transformPartToChunks()`：part helper 路径

触发条件全部满足时才发出 fallback `question_request`：

1. part 是 `tool`。
2. `tool === 'question'`。
3. `state.status === 'waiting'`。
4. `state.metadata`、`state.metadata.request`、`state.metadata.question` 或 part 本身能通过现有 `normalizeQuestionRequest()`。

非 `question` 工具不会调用 question normalizer。malformed metadata 不会生成问题 UI。这避免了把普通工具 metadata 误判成 question request。

---

## 4. 逐维度终态评分

| 维度 | 当前评分 | 状态 |
|------|----------|------|
| 任务触发机制 | 9.0 | `question.asked` + polling + waiting `question` tool fallback |
| 状态管理 | 9.0 | waiter cleanup 已修复，per-tab state 边界保持 |
| 用户交互流程 | 9.0 | Dock / Inline 均支持键盘选择与单选非终题 auto-advance |
| API/SDK 集成 | 9.0 | SDK-first + HTTP fallback；当前上游公开面已覆盖 |
| 键盘导航 | 9.0 | Dock 与 Inline 均已实现核心键位 |
| 问题类型支持 | 8.5 | 当前上游仍是 option-based prompt；confirm 可用 yes/no 单选表达 |
| 事件/元数据处理 | 9.0 | `question.asked` 主路径 + 保守 waiting fallback |
| 平台特定 UX | 9.0 | Inline/Dock 是 Obsidian 侧边栏下的合理适配 |
| 错误处理与边界 | 8.5 | reply/reject error Notice 保持；网络重试仍是优化项 |
| 后台任务集成 | 9.0 | tab activation / post-sync refresh 覆盖 pending questions |

综合评分：**9.0/10**。

---

## 5. 非阻塞差异

以下项目不再视为必须对齐问题：

| 项目 | 结论 |
|------|------|
| Modal overlay | Obsidian 侧边栏内采用 Inline/Dock 是平台适配，不要求复刻 Desktop modal |
| `POST /question/ask` | 当前本地 OpenCode 未公开，OpenCodian 不实现发问 route |
| `awaitAnswers` | 属于历史上游背景，不是当前客户端响应面 |
| 显式 confirm 类型 | 当前本地 question schema 仍是 option prompt；yes/no 单选可表达确认 |
| Markdown answer formatting | 当前 server API 接收 `string[][]`；Markdown 是潜在优化，不影响闭环 |
| `x-opencode-client` 头 | 客户端标识优化项，不影响 AskQuestion 可用性 |
| 回复/拒绝重试 | 网络韧性优化项，不是当前对齐缺口 |

---

## 6. 验证矩阵

| 验证目标 | 命令 / 证据 |
|----------|-------------|
| transformer fallback | `npm test -- OpenCodeStreamEventTransformer --runInBand` |
| Dock keyboard | `npm test -- QuestionDock --runInBand` |
| Inline keyboard | `npm test -- QuestionInlineCardRenderer --runInBand` |
| module docs | `npm run check:module-docs` |
| graph freshness | `npm run graphify:update:src` + `npm run check:graphify` |
| full repo gate | `npm run verify` |

---

## 7. 结论

AskQuestion 对齐已达到本轮定义的完全体：OpenCodian 能通过事件、轮询和保守 tool-part fallback 接收问题；能在 Dock 与 Inline 两种显示位置用键盘完成选择、前进、提交或拒绝；能正确释放本地 waiters；能通过当前 OpenCode 公开 API 回复或拒绝 pending question。

后续可以继续做网络重试、客户端标识、长描述折叠等产品打磨，但这些不再是 AskQuestion 机制对齐的阻塞项。
