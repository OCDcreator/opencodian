# Task/Subagent 生命周期对齐评估：OpenCodian vs opencode-desktop

> **评估日期**：2026-05-11
> **评估性质**：多 LLM 共识评估（Council，4 councillors）
> **评估对象**：OpenCodian 与 opencode-desktop 在 task/subagent/background task 生命周期处理上的架构对齐
> **参与模型**：council 多模型共识
> **关联文档**：`docs/status/session-lifecycle-council-review-2026-05-10.md`、`docs/status/session-lifecycle-alignment-evaluation.md`
> **对比项目**：OpenCode — [https://github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)

---

## 0. 执行摘要

### 核心结论

**当前对齐评分：3/10**（ councillors 评分范围 2–4）

OpenCodian 的后台任务子系统完全构建在 OMO（第三方适配层）之上，而 opencode-desktop 证明了通过 SDK 原生的 `ToolPart.state.status` 即可正确处理全部 task/subagent 生命周期，无需任何 OMO 依赖。

**这不是功能缺失问题，而是架构方向问题。** OpenCodian 已经拥有所有需要的基础设施——`message.part.updated` 事件、`metadata.sessionId` 提取、`ChildSessionGraphService`——但后台任务生命周期管理没有接线到这些原生信号上。

**预期可达到的对齐评分：8/10**（3–4 个聚焦迭代后）

---

## 1. 评估背景

### 1.1 三个前端消费同一个后端

```text
                    ┌──────────────────────────────┐
                    │     OpenCode Server (Go)      │
                    │  HTTP / SSE / SDK v2          │
                    │                               │
                    │  核心能力:                      │
                    │  · ToolPart 状态生命周期         │
                    │  · message.part.updated 事件   │
                    │  · session.children() API      │
                    │  · metadata.sessionId 注入      │
                    └──────────┬───────────────────┘
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
       ┌─────┴──────┐  ┌──────┴──────┐  ┌───────┴───────┐
       │ TUI (终端)  │  │ Desktop     │  │ OpenCodian    │
       │ CLI/PTY    │  │ SolidJS     │  │ Obsidian 插件  │
       └────────────┘  └─────────────┘  └───────────────┘
                           │                    │
                           │                    │
                     SDK ToolPart 状态      OMO system-reminder
                     (原生协议)             (第三方 XML 文本注入)
```

### 1.2 评估发起原因

用户提出关键质疑：**OMO 只是第三方开发的 OpenCode 适配插件，OpenCodian 作为前端插件不应将核心功能（任务完成检测）硬绑在一个可选的外部组件上。**

经调查发现：

1. opencode-desktop **完全不用 OMO**，仅靠 SDK ToolPart 状态驱动
2. OpenCodian 的后台任务完成检测 **100% 依赖 OMO**
3. OpenCodian 已经有了所有 SDK 原生基础设施，但 **没有接线**

### 1.3 评估范围

| 维度 | 覆盖范围 |
|------|---------|
| 后端协议 | OpenCode Server 的 task 工具实现、ToolPart 状态机、事件总线 |
| opencode-desktop | `packages/ui/`（SolidJS 组件）、`packages/desktop/`（Electron 壳） |
| OpenCodian | `src/features/chat/` 下 13 个 BackgroundTask 相关文件、`src/core/opencode/` 同步基础设施 |
| 排除 | TUI 渲染、非 task 工具的 tool call 处理 |

---

## 2. 后端协议分析

### 2.1 OpenCode Server 如何实现 Task 工具

**源文件**：`packages/opencode/src/tool/task.ts`

当 LLM 调用 `task` 工具时，后端执行以下步骤：

```text
步骤 1: 创建子会话
  sessions.create({
    parentID: ctx.sessionID,          // ← 父子关系
    title: description + " (@agent subagent)",
  })

步骤 2: 将子会话 ID 写入工具元数据
  ctx.metadata({
    title: params.description,
    metadata: {
      sessionId: nextSession.id,      // ← 关键信号
      model,
    },
  })

步骤 3: 在子会话上运行完整 LLM 循环
  ops.prompt({ sessionID: nextSession.id, ... })

步骤 4: 子会话完成 → ToolPart.state.status = "completed"
  父会话发布 message.part.updated 事件
```

**关键设计**：`metadata.sessionId` 是后端协议的一部分，不是 OMO 发明的。任何前端都可以直接读取。

### 2.2 ToolPart 状态机

**源文件**：`packages/sdk/js/src/v2/gen/types.gen.ts`

```typescript
type ToolState =
  | { status: "pending";   input: Record<string, unknown>; raw: string }
  | { status: "running";   input: Record<string, unknown>; title?: string;
      metadata?: Record<string, unknown>; time: { start: number } }
  | { status: "completed"; input: Record<string, unknown>; output: string;
      title: string; metadata: Record<string, unknown>; time: { start, end } }
  | { status: "error";     input: Record<string, unknown>; error: string;
      metadata?: Record<string, unknown>; time: { start, end } }
```

**task 工具的完整生命周期**：

```text
pending → running → completed/error
              │
              └─ metadata.sessionId 在 running 状态注入
```

### 2.3 事件系统

后端通过全局事件总线推送的、与 task/subagent 相关的事件：

| 事件 | 来源 | 数据 | 与 task 的关系 |
|------|------|------|---------------|
| `message.part.updated` | `Session.updatePart()` | `{ sessionID, part: ToolPart, time }` | **task 完成的原生信号**：`part.tool === 'task'` 且 `status === 'completed'` |
| `session.status` | `SessionStatus.set()` | `{ sessionID, status: { type: "idle"\|"busy"\|"retry" } }` | 子会话独立发送状态事件 |
| `session.created` | `Session.create()` | `{ sessionID, info }` | 子会话创建时触发 |
| `message.updated` | `Session.updateMessage()` | `{ sessionID, info }` | 间接反映进度 |

**注意**：没有专门的 `subagent.completed` 事件。完成是隐含在 ToolPart 状态转换中的。

### 2.4 子会话发现 API

| API | 用途 |
|-----|------|
| `GET /session/{sessionID}/children` | 返回所有 `parent_id == parentID` 的子会话 |
| `GET /session/status` | 一次调用返回所有已知会话的 `{ idle\|busy\|retry }` 状态 |
| `GET /session/{sessionID}/messages` | 获取子会话的消息列表 |

---

## 3. opencode-desktop 方案分析

### 3.1 核心方法：零 OMO，完全 SDK 原生

opencode-desktop 处理 task/subagent 的方式极其简洁：

```text
ToolPart.state.status 变化 → message.part.updated 事件 → UI 自动响应
```

**没有**：
- 没有单独的后台任务追踪层
- 没有 OMO system-reminder 解析
- 没有 search-mode 门控
- 没有独立的完成检测服务
- 没有 inline panel、timeline、completion notice

### 3.2 Task 工具注册

**源文件**：`packages/ui/src/components/message-part.tsx`

```typescript
ToolRegistry.register({
  name: "task",
  render(props) {
    // 1. 从 metadata.sessionId 直接读取子会话 ID
    const childSessionId = createMemo(() => {
      const value = props.metadata.sessionId      // 直接从 ToolPart state
      if (typeof value === "string" && value) return value
      // 2. 降级：通过 parentID 匹配搜索
      return taskSession(props.input, location.pathname,
                         data.store.session, data.store.agent)
    })

    const running = createMemo(() =>
      props.status === "pending" || props.status === "running")

    // running 时显示 spinner，completed 时显示可点击链接
  }
})
```

### 3.3 子会话查找降级路径

**源文件**：`packages/ui/src/components/message-part.tsx`（`taskSession()` 函数）

```typescript
function taskSession(input, path, sessions, agents) {
  const parentID = currentSession(path)        // 当前会话 ID
  const description = input.description
  const agent = taskAgent(input.subagent_type, agents).name

  return (sessions ?? [])
    .filter(s => s.parentID === parentID && !s.time?.archived)
    .filter(s => description ? s.title.startsWith(description) : true)
    .filter(s => agent ? s.title.includes(`@${agent}`) : true)
    .sort((a, b) => (b.time.created ?? 0) - (a.time.created ?? 0))[0]?.id
}
```

双层策略：
1. **主路径**：`metadata.sessionId`（后端在创建子会话时直接注入）
2. **降级路径**：通过 `parentID` + description + agent 匹配搜索

### 3.4 数据模型

```typescript
type Data = {
  session: Session[]                              // 所有会话（含子会话）
  session_status: { [sessionID: string]: SessionStatus }  // 会话级状态
  message: { [sessionID: string]: Message[] }     // 每会话消息
  part: { [messageID: string]: Part[] }           // 每消息 Part
}
```

没有专门的 subagent/background task 状态。ToolPart 的 `state.status` 就是生命周期。

### 3.5 工具状态渲染

| 状态 | 渲染行为 |
|------|---------|
| `pending` | Text shimmer 动画，阻止折叠 |
| `running` | 同 pending + spinner |
| `completed` | 显示标题/副标题，可折叠展开详情，可点击打开子会话 |
| `error` | 显示 ToolErrorCard，可点击打开子会话查看错误 |

### 3.6 会话级状态（独立于工具级）

`session_status` 提供 `idle/busy/retry` 信号：
- `busy` → 显示 "thinking" 指示器
- `retry` → 显示 SessionRetry 卡片（速率限制重试）
- 这是**会话级**信号，不区分具体工具

---

## 4. OpenCodian 当前方案分析

### 4.1 核心方法：OMO 驱动的并行追踪层

```text
OMO system-reminder XML 解析 → BackgroundTask 服务群 → inline panel + completion notice
```

### 4.2 服务架构（13 个文件，~3000 行）

```text
流式触发
├── BackgroundTaskStreamTriggerCoordinator    (工具调用 start/end 钩子)
│
时间线管理
├── BackgroundTaskTimelineService             (时间线组装/管理)
├── BackgroundTaskTimelineAssemblyService     (消息遍历，识别 anchor)
├── BackgroundTaskTimelineLaunchService       (launch 提取/匹配)
│
信号协调
├── BackgroundTaskLiveSignalCoordinator       (15s grace period + session liveness)
│
UI 渲染
├── BackgroundTaskIndicatorCoordinator        (渲染编排)
├── BackgroundTaskInlinePanelRenderer         (inline DOM 面板)
│
通知管理
├── BackgroundTaskCompletionNoticeService     (延迟持久化完成通知)
├── BackgroundTaskNoticeStateService          (stale-task 警告去重)
│
Tab 运行时状态
└── ConversationTabRuntimeCoordinator
    (14+ background-task-specific 字段 per tab)
```

### 4.3 OMO 依赖点分析

| 能力 | 是否依赖 OMO | 具体依赖 |
|------|-------------|---------|
| 检测 task 工具调用启动 | ❌ | 直接从流式 content block 读取 `toolName === 'task'` |
| 提取任务描述 | ❌ | 从工具 input 的 `description/prompt/title` 读取 |
| **检测任务完成** | ✅ **唯一路径** | `message.omo.kind === 'system-reminder'` 且 `reminderType === 'background-task-completed'` |
| **锚点/模式识别** | ✅ | `message.omo.kind === 'user-injection'` + `[search-mode]` 头部 |
| **"全部完成"信号** | ✅ | `omo.reminderType === 'all-background-tasks-complete'` |
| **子会话 ID** | ⚠️ | `bg_[a-z0-9]+` 正则匹配（而非 `metadata.sessionId`）|
| stale 警告 | ❌ | session idle + grace period 超时 |

### 4.4 search-mode 门控

**11 处硬编码** `=== 'search-mode'` 检查分布在 5 个文件中：

| 文件 | 门控位置 | 作用 |
|------|---------|------|
| `BackgroundTaskStreamTriggerCoordinator.ts` | `isBackgroundTaskTool()` | 决定 task 工具是否进入后台任务 lane |
| `BackgroundTaskTimelineService.ts` | `armIndicatorForUserMessage()` | 非 search-mode 直接 early return |
| `BackgroundTaskTimelineService.ts` | `shouldRenderInlineSegment()` | 空 segment 在 search-mode 不渲染 |
| `BackgroundTaskTimelineService.ts` | `shouldRenderPreparingInlineSegment()` | 非 search-mode 跳过 preparing |
| `BackgroundTaskTimelineAssemblyService.ts` | `isSearchModeAnchorMessage()` | 识别锚点消息 |
| `BackgroundTaskTimelineAssemblyService.ts` | `collectDiagnostics()` | 诊断收集 |
| `BackgroundTaskTimelineAssemblyService.ts` | `getLatestSegmentWithActivity()` | 获取活跃 segment |
| `BackgroundTaskTimelineAssemblyService.ts` | `getLatestSearchModeSegment()` | 获取最新 search-mode segment |
| `BackgroundTaskLiveSignalCoordinator.ts` | `hasIndicator()` | 降级路径中检查 mode |
| `BackgroundTaskLiveSignalCoordinator.ts` | `reconcileStateFromLiveSignals()` | 调和时重置 indicator |

**没有抽象层、没有配置、没有枚举扩展点。** 如需支持其他模式（如 `analyze-mode`），必须修改全部 11 处。

### 4.5 完成检测的单一路径

**`BackgroundTaskTimelineLaunchService.addCompletedTasksFromMessage()`**：

```typescript
static addCompletedTasksFromMessage(message, target): void {
    // ← 不是 OMO system-reminder 直接退出
    if (message.omo?.kind !== 'system-reminder' || !message.omo.tasks
        || message.omo.tasks.length === 0) {
      return;
    }
    // ... 解析 message.omo.tasks
}
```

OMO 解析链路：

```text
原始消息文本 → 检测 <system-reminder> XML 标签
             → 检测 <!-- OMO_INTERNALIATOR --> 标记
             → classifyReminderType():
                 匹配 '[ALL BACKGROUND TASKS COMPLETE]' → 'all-background-tasks-complete'
                 匹配 '[BACKGROUND TASK COMPLETED]'     → 'background-task-completed'
                 其他                                    → 'generic'
             → 提取 task ID: ID: `bg_[a-z0-9]+` 或 markdown list
```

---

## 5. 差异矩阵

### 5.1 架构对比

| 维度 | opencode-desktop | OpenCodian | 评估 |
|------|-----------------|-----------|------|
| **完成检测机制** | `ToolPart.state.status` SDK 协议 | OMO `<system-reminder>` XML 解析 | OpenCodian 脱离了后端协议契约 |
| **子会话链接** | `metadata.sessionId` + parentID 搜索 | `bg_[a-z0-9]+` 正则 | OpenCodian 未使用后端注入的 sessionId |
| **模式限制** | 无（所有模式统一处理） | search-mode only（11 处硬编码） | OpenCodian 大量 task 工具调用被忽略 |
| **服务数量** | 0（Part 状态即是生命周期） | 11 个专用服务 | OpenCodian 复杂度远超需要 |
| **代码行数** | ~200 行（tool registry + render） | ~3000 行（13 个文件） | 15 倍差距 |
| **OMO 依赖** | 零 | 100%（完成检测、锚点、模式） | 核心风险 |

### 5.2 功能对比

| 功能 | opencode-desktop | OpenCodian（有 OMO） | OpenCodian（无 OMO） |
|------|-----------------|---------------------|---------------------|
| Task 运行指示 | ✅ 工具卡片 spinner | ✅ Inline panel | ❌ 死路径 |
| Task 完成通知 | ✅ 状态变更 | ✅ 持久化 notice 卡片 | ❌ 死路径 |
| 子会话链接 | ✅ `metadata.sessionId` | ✅ `bg_*` regex | ⚠️ 图谱部分可用 |
| 子会话消息查看 | ✅ 可导航 | ✅ 可导航 | ✅ 可导航 |
| 多模式支持 | ✅ 所有模式 | ❌ 仅 search-mode | ❌ 仅 search-mode |
| Stale 任务警告 | ❌ | ✅ | ⚠️ 仅 session idle 超时 |
| 进度时间线 | ❌ | ✅ | ❌ |
| Task 计数汇总 | ✅ `tool-count-summary` | ✅ Inline panel | ❌ |

### 5.3 数据源对比

| 数据源 | opencode-desktop 使用 | OpenCodian 使用 | 差异 |
|--------|---------------------|----------------|------|
| `ToolPart.state.status` | ✅ 主路径 | ❌ 未用于生命周期 | **关键差距** |
| `ToolPart.metadata.sessionId` | ✅ 主路径 | ❌ 未用于后台任务 | **关键差距** |
| `message.part.updated` 事件 | ✅ 驱动 Part store | ✅ 收到但未用于完成检测 | 信号已在手，未接线 |
| `session.children()` API | ❌ 不需要 | ✅ 用于图谱可视化 | 各取所需 |
| `session.status` 事件 | ✅ 会话级 | ✅ 会话级 | 一致 |
| OMO system-reminder | ❌ 不使用 | ✅ **唯一完成检测路径** | 核心分歧 |

---

## 6. 风险评估

### 6.1 当前架构风险（保持 OMO 依赖）

| 风险 | 严重度 | 说明 |
|------|--------|------|
| **OMO 格式变更** | 🔴 高 | `<system-reminder>` 标签格式、`bg_*` ID 模式、`[BACKGROUND TASK COMPLETED]` 文本匹配都是无契约的约定，任何变更都会导致静默失败 |
| **功能死路径** | 🔴 高 | 未安装 OMO 的用户完全无法使用后台任务追踪，覆盖 search-mode 以外的所有 task 工具调用 |
| **维护负担** | 🟡 中 | 13 个文件、~3000 行代码维护一个并行追踪层，而后端已经提供了所需信息 |
| **模式锁定** | 🟡 中 | 11 处硬编码 `search-mode` 检查无法支持新模式（如 `analyze-mode`） |
| **重复真相** | 🟡 中 | `bg_[a-z0-9]+` 正则匹配 task ID vs `metadata.sessionId`，两套 ID 体系并存 |

### 6.2 迁移风险（向 SDK 原生过渡）

| 风险 | 严重度 | 缓解策略 |
|------|--------|---------|
| **双信号冲突** | 🟡 中 | 声明 SDK 为权威，OMO 降级为可选装饰，设置去重逻辑 |
| **历史对话兼容** | 🟡 中 | 旧对话无 ToolPart metadata，graceful fallback 到现有渲染 |
| **UI 回归** | 🟡 中 | 分阶段启用：先叠加 SDK 信号（P0），再替换 OMO（P2），最后移除门控（P1） |
| **事件时序** | 🟡 低 | `message.part.updated` 与 OMO system-reminder 可能有时序差异，以 Part 状态为准 |
| **丰富 UI 降级** | 🟢 低 | Inline panel、completion notice 等丰富 UI 保留，仅改变数据驱动源 |

### 6.3 风险对比结论

**保持 OMO 依赖的长期风险 > 迁移到 SDK 原生的短期风险。** 迁移是增量式的（additive first），且 OpenCodian 已有全部基础设施。

---

## 7. 修复建议

### 7.1 分阶段路线图

#### P0 — 增量：添加 SDK 原生任务完成检测

**目标**：在现有 OMO 路径旁边添加 SDK 路径，作为补充信号。

**变更**：
- 在 `OpenCodeSyncEventRuntimeCoordinator` 或 `BackgroundTaskStreamTriggerCoordinator` 中，监听 `message.part.updated` 事件
- 过滤条件：`part.tool === 'task'` 且 `part.state.status === 'completed'` 或 `'error'`
- 从 `part.state.metadata.sessionId` 提取子会话 ID
- 将完成状态写入现有 `backgroundTaskCompletedTasks` Map

**影响文件**：`OpenCodeService.ts`（sync handler）、`BackgroundTaskStreamTriggerCoordinator.ts`

**风险**：低 — 纯增量，OMO 路径不受影响。

#### P1 — 激活：移除 search-mode 门控

**目标**：让所有模式的 task 工具都触发后台任务追踪。

**变更**：
- `isBackgroundTaskTool()` 从 `toolName === 'task' && modeTag === 'search-mode'` 改为 `toolName === 'task'`
- 审查 11 处 `=== 'search-mode'` 硬编码，逐个评估是否可以移除或改为配置
- 模式信息（`modeTag`）保留为 UI 标签，不作为功能门控

**影响文件**：`BackgroundTaskStreamTriggerCoordinator.ts`、`BackgroundTaskTimelineService.ts`、`BackgroundTaskTimelineAssemblyService.ts`、`BackgroundTaskLiveSignalCoordinator.ts`

**风险**：中 — 所有模式的 task 都会进入追踪 lane，需要视觉 QA。

#### P2 — 替换：用 ToolPart 状态替代 OMO 完成检测

**目标**：SDK ToolPart 状态成为唯一的生命周期权威。

**变更**：
- `BackgroundTaskTimelineAssemblyService` 使用 `contentBlocks[].toolStatus === 'completed'` 替代 `message.omo.reminderType`
- `BackgroundTaskTimelineLaunchService` 使用 `metadata.sessionId` 替代 `bg_[a-z0-9]+` 正则
- 添加去重逻辑：SDK 信号和 OMO 信号同时到达时，以 SDK 为准

**影响文件**：`BackgroundTaskTimelineAssemblyService.ts`、`BackgroundTaskTimelineLaunchService.ts`

**风险**：中 — 需要验证双信号场景下的去重正确性。

#### P3 — 精简：整合后台任务服务

**目标**：在 P0–P2 稳定后，评估 11 个服务中哪些可以合并或移除。

**可能方向**：
- `BackgroundTaskStreamTriggerCoordinator` + `BackgroundTaskLiveSignalCoordinator` → 合并为单一 coordinator
- `BackgroundTaskTimelineAssemblyService` + `BackgroundTaskTimelineLaunchService` → 合并到 `BackgroundTaskTimelineService`
- 保留有独立价值的服务（如 `BackgroundTaskCompletionNoticeService` 的延迟持久化通知）

**风险**：仅在其他路径稳定后执行。

### 7.2 优先级排序理由

```
P0（增量 SDK 接线）→ 最安全、最直接、验证假设
  ↓
P1（移除模式门控）→ 扩大覆盖范围、验证 SDK 信号可靠性
  ↓
P2（替代 OMO）→ 确立 SDK 为权威、OMO 降级为可选
  ↓
P3（精简服务）→ 减少维护负担、收敛架构
```

每一步都是上一步验证通过后才执行。

### 7.3 不应做的事

| 不要 | 原因 |
|------|------|
| 不要一次性重写全部 13 个文件 | 风险太高，增量更安全 |
| 不要移除 OMO 解析代码 | 保持为可选降级路径，直到 SDK 路径在生产中验证稳定 |
| 不要将 desktop 的简单 tool card 强行套入 OpenCodian | OpenCodian 的丰富 UI（inline panel、notice）有价值，只需改变驱动源 |
| 不要保留双权威系统超过一个迭代窗口 | 双信号增加调试复杂度，尽快收敛到单一权威 |

---

## 8. 已有基础设施清单

以下是 OpenCodian 中**已经存在但未用于后台任务生命周期**的 SDK 原生基础设施：

| 基础设施 | 位置 | 当前用途 | 缺失的接线 |
|----------|------|---------|-----------|
| `message.part.updated` 事件 | `OpenCodeSyncEventRuntimeCoordinator.ts:578` | 触发消息重同步 | 未过滤 `tool === 'task'` 的状态变更 |
| `metadata.sessionId` 提取 | `OpenCodeStreamEventTransformer.ts:177` | 提取后传给 ToolCallRenderer | 未传给 BackgroundTask 服务 |
| ToolPart 状态解析 | `resolveToolExecutionStatus()` in `toolExecution.ts` | 渲染工具状态 | 未用于完成检测 |
| 子会话图谱 | `ChildSessionGraphService.ts:192` | 可视化会话树 | 未用于完成检测 |
| `session.children()` API | `OpenCodeSessionControlOrchestrator.getSessionChildren()` | 图谱查询 | 未用于轮询子会话状态 |
| Task 工具渲染 | `ToolCallRenderer.ts` + `getTaskSummary()` | 非 search-mode 的 task 卡片渲染 | 未与后台任务生命周期集成 |

**关键洞察**：不是缺少基础设施，而是缺少接线。

---

## 9. Council 共识详情

### 9.1 Councillor 立场分布

所有 councillors 独立收敛到同一诊断：

| 维度 | 一致性 | 说明 |
|------|--------|------|
| OMO 依赖是否合理 | 全员一致：不合理 | 前端不应依赖第三方适配层的文本格式 |
| 迁移是否可行 | 全员一致：可行 | 基础设施已全部就位 |
| 迁移路径 | 全员一致：增量式 | P0 → P1 → P2 → P3 的渐进路线 |
| 丰富 UI 保留 | 全员一致：保留 | inline panel、completion notice 有价值 |
| 模式门控移除 | 全员一致：移除 | 11 处硬编码 `search-mode` 应改为配置或移除 |

### 9.2 分歧点

| 点 | Alpha | Beta | Gamma | Delta |
|----|-------|------|-------|-------|
| P1 是否应在 P0 之后立即执行 | 先验证 SDK 信号稳定 | 可以并行 | 可以并行 | 先验证 |

这是唯一的分歧：timing，不是方向。

---

## 10. 结论

### 10.1 当前状态总结

OpenCodian 的后台任务子系统是一套**架构过拟合于 OMO 的并行追踪层**。它在 OMO 存在时提供了丰富的 UI 体验（inline panel、时间线、完成通知、stale 警告），但这些体验应该由后端原生协议（ToolPart 状态 + SDK 事件）驱动，而不是由第三方插件的 XML 文本注入驱动。

### 10.2 核心修复原则

> **让后端协议成为唯一的生命周期权威。**
> OMO 是可选的装饰增强，不是必需的数据源。

### 10.3 预期成果

| 阶段 | 完成后对齐评分 | 说明 |
|------|--------------|------|
| 当前 | 3/10 | OMO 依赖、search-mode 门控、~3000 行并行追踪 |
| P0 完成后 | 4–5/10 | SDK 信号作为补充，验证可靠性 |
| P1 完成后 | 5–6/10 | 所有模式覆盖，功能范围对齐 |
| P2 完成后 | 7–8/10 | SDK 为权威，OMO 降级为可选 |
| P3 完成后 | 8/10 | 服务精简、维护负担降低 |

### 10.4 一句话总结

> 修复的第一步不是新增代码，而是将已有的 SDK 信号接线到已有的后台任务服务。
> `ToolPart.state.status` 已经知道 task 何时完成——OpenCodian 只需要开始监听。

---

## 附录 A：源文件索引

### opencode-desktop 相关文件

| 文件 | 用途 |
|------|------|
| `packages/ui/src/components/message-part.tsx` | ToolPart 渲染分发 + `ToolRegistry` + `taskSession()` |
| `packages/ui/src/components/basic-tool.tsx` | 通用工具卡片（spinner → collapsible） |
| `packages/ui/src/components/tool-error-card.tsx` | 工具错误卡片 |
| `packages/ui/src/components/tool-count-summary.tsx` | 工具计数汇总 |
| `packages/ui/src/components/tool-status-title.tsx` | 工具状态标题 |
| `packages/ui/src/components/session-turn.tsx` | 会话轮次渲染 |
| `packages/ui/src/components/session-review.tsx` | 会话审查 |
| `packages/ui/src/context/data.tsx` | 数据 store（session/message/part） |

### OpenCode Server 相关文件

| 文件 | 用途 |
|------|------|
| `packages/opencode/src/tool/task.ts` | Task 工具实现（创建子会话、注入 metadata） |
| `packages/opencode/src/session/session.ts` | 会话模型（parentID、children()） |
| `packages/opencode/src/session/status.ts` | 会话状态事件发布 |
| `packages/opencode/src/session/run-state.ts` | Runner 状态管理（idle/busy） |
| `packages/opencode/src/pubsub/events.go` | 事件总线 |
| `packages/opencode/src/cli/cmd/run/subagent-data.ts` | CLI 子代理数据追踪（参考实现） |

### OpenCodian 相关文件

| 文件 | 用途 |
|------|------|
| `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts` | 流式工具调用触发 |
| `src/features/chat/services/BackgroundTaskTimelineService.ts` | 时间线管理 |
| `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts` | 时间线组装（OMO 完成） |
| `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts` | Launch 提取/匹配 |
| `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts` | 实时信号协调 |
| `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts` | 渲染编排 |
| `src/features/chat/runtime/BackgroundTaskInlinePanelRenderer.ts` | Inline panel 渲染 |
| `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts` | 完成通知 |
| `src/features/chat/services/BackgroundTaskNoticeStateService.ts` | Stale 警告 |
| `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts` | SDK 同步事件分发 |
| `src/core/opencode/OpenCodeStreamEventTransformer.ts` | 流事件转换（已提取 metadata） |
| `src/core/agents/ChildSessionGraphService.ts` | 子会话图谱（已使用 metadata.sessionId） |
| `src/utils/streaming/ToolCallRenderer.ts` | 工具调用渲染（非 search-mode 路径） |

## 附录 B：OMO System-Reminder 解析链路

```text
原始消息文本
  │
  ├── 检测 <system-reminder>...</system-reminder> XML 标签
  │
  ├── 检测 <!-- OMO_INTERNALIATOR --> 标记
  │
  ├── classifyReminderType():
  │     匹配 '[ALL BACKGROUND TASKS COMPLETE]' → 'all-background-tasks-complete'
  │     匹配 '[BACKGROUND TASK COMPLETED]'     → 'background-task-completed'
  │     其他                                    → 'generic'
  │
  └── 提取 task 信息:
        单任务: ID: `bg_[a-z0-9]+`
        批量:   - `id`: description
```

**与之对比的 SDK 原生路径**：

```text
message.part.updated 事件
  │
  ├── part.tool === 'task'
  │
  ├── part.state.status === 'completed' | 'error'
  │
  └── part.state.metadata.sessionId → 子会话 ID
```

后者是后端协议契约，前者是文本约定。

## 附录 C：术语对照

| 术语 | opencode-desktop | OpenCodian（原始） | OpenCodian（优化后） |
|------|-----------------|-------------------|---------------------|
| 任务工具 | `task` tool | `task` tool（仅 search-mode） | `task` tool（所有模式） |
| 子代理 | 子会话（`parentID`） | 子代理（`@subagent` mention） | 子代理 + 子会话（`metadata.sessionId`） |
| 任务完成 | `ToolPart.state.status: completed` | OMO `system-reminder` 唯一路径 | SDK `ToolCallInfo.status` 主路径 + OMO 降级 |
| 后台任务 | 不区分（就是 task tool） | 独立概念（search-mode + OMO 门控） | 渐进对齐（流式 SDK，历史 OMO 降级） |
| 子会话链接 | `metadata.sessionId` | `bg_[a-z0-9]+` regex | `metadata.sessionId` 主路径 + regex 降级 |
| 模式 | 不区分 | `search-mode`（11 处硬编码） | `search-mode`（8 处残留，流式路径已移除） |

---

# 更新评估（2026-05-11 下午）：优化后对齐评分

> **评估性质**：多 LLM 共识重评估（Council，4 councillors）
> **评估对象**：4 个关键 commit 优化后的 task/subagent 生命周期处理
> **对比基线**：同日早先评估 3/10

## 更新对齐评分：5.5/10（原始 3/10 → +2.5）

| Councillor | 评分 | 定性 |
|---|---|---|
| alpha (gpt-5.5) | 6.5/10 | "流式 SDK 原生，时间线仍为 legacy-hybrid" |
| beta (glm-5.1) | 5.5/10 | "+2.5 已赚得，未整合，indicator 仍受门控" |
| gamma (deepseek-v4) | 6/10 | "流式路径已转化，半迁移状态" |
| delta (kimi-for-coding) | 5/10 | "数据层已改善，结构模型未变" |

---

## 各维度评分（Council 平均）

| 维度 | 原始 | 优化后 | 目标 | 关键变化 |
|------|------|--------|------|---------|
| **流式完成检测** | 1/10 | **9/10** | 9/10 | `ToolCallInfo.status` + `toolMetadata.sessionId`；零 OMO |
| **会话 ID 提取** | 2/10 | **8/10** | 9/10 | `metadata.sessionId` 为主；`bg_` regex 仍为降级 |
| **ToolPart 状态用于生命周期** | 1/10 | **8/10** | 9/10 | `resolveToolExecutionStatus` 读 `state.status`；contentBlock `toolStatus` 已使用 |
| **历史回放/锚定** | 1/10 | **3/10** | 8/10 | **仍 OMO 门控**：segment anchoring、diagnostics、indicator arming |
| **search-mode 门控消除** | 1/10 | **4/10** | 9/10 | 11 → 8 处残留硬编码（AssemblyService 4、LiveSignal 2、TimelineService 2） |
| **服务架构** | 3/10 | **3/10** | 7/10 | **未整合。** 仍 11+ 服务，~2400 行 |
| **模块文档覆盖** | — | **3/10** | 8/10 | 5 个关键服务缺文档 |

---

## 已修复 vs 未修复

### ✅ 已修复（流式/渲染路径已干净）

| 成就 | 证据 |
|------|------|
| `isBackgroundTaskTool` 模式无关 | 返回 `toolName === 'task'` — 零模式检查 |
| 原生 task 卡片渲染 | `ToolCallRenderer` 使用 `toolMetadata.sessionId` + status |
| SDK 原生流式完成检测 | `upsertCompletionFromToolCall` 通过 `ToolCallInfo.status` |
| `metadata.sessionId` 提取 | 4 文件：NormalizationMapper、StreamEventTransformer、StreamingRuntimeCoordinator、ChildSessionGraphService |
| 同步事件批量处理 | 16ms 合并，去重，barrier flush |
| 跨会话持久化 | `BackgroundTaskActiveAnchorMetadata` 存活 reload |
| 原生路径测试覆盖 | 188 行 SDK 原生完成测试 |

### ❌ 未修复（结构模型未变）

| 残留问题 | 影响 |
|----------|------|
| **Indicator arming 受 search-mode 门控** | `armIndicatorForUserMessage` line 80：非 search 任务永远无法触发 inline panel |
| **Segment anchoring 仅 OMO** | `captureUserSegmentAnchor` 只为 `search-mode` anchors 创建 segments |
| **Diagnostics 仅 OMO** | `collectDiagnostics` 无 search-mode anchor 时跳过 |
| **8 处 search-mode 硬编码残留** | AssemblyService 4 处、TimelineService 2 处、LiveSignalCoordinator 2 处 |
| **双完成路径** | SDK 原生 + OMO 写入同一 map；潜在 taskId 分歧 |
| **11 服务未变** | 无合并、无移除、无整合 |
| **`bg_` regex 持续存在** | `extractBackgroundTaskId` line 117 中的降级 |
| **5 个服务缺模块文档** | AssemblyService、TimelineService、LiveSignalCoordinator、CompletionNoticeService、NoticeStateService |

---

## 关键发现：结构性分叉

所有四个 councillors 独立识别出同一架构不一致：

> `StreamTriggerCoordinator` 的 `isBackgroundTaskTool` 对所有 task 返回 true（无模式检查）。但 indicator、assembly 和 diagnostics 基础设施仅完整支持 search-mode 任务。非 search-mode 任务进入 trigger 但**无法激活 indicator panel** 或 **reload 后持久化到 segments**。

这意味着：

| 场景 | search-mode task | 非 search-mode task |
|------|-----------------|-------------------|
| **活跃流式** | ✅ inline panel + tool card + completion | ✅ tool card + completion（无 panel） |
| **Reload 后** | ✅ 时间线 + panel 恢复 | ❌ 丢失 panel 状态 |
| **Indicator** | ✅ 正常 arm | ❌ 永远不 arm |
| **Diagnostics** | ✅ 正常扫描 | ❌ 跳过 |

**Delta 的精炼诊断**："commits 在旧模型旁添加了并行 SDK 原生路径，但没有替换结构性门控。"

---

## 丰富 UI 的复杂度是否值得？

**Council 共识：部分值得。**

| 功能 | 价值 | 结论 |
|------|------|------|
| Inline 进度面板 | 高 — 窄 Obsidian 侧边栏必需 | **保留** |
| 延迟完成通知 | 高 — 防止异步任务闪烁 | **保留** |
| Stale 警告 + grace period | 高 — 防止虚假失败印象 | **保留** |
| 跨会话持久化 | 高 — Obsidian reload 模式需要 | **保留** |
| Per-tab 隔离 | 高 — 并发聊天 tab 需要独立状态 | **保留** |
| OMO 诊断日志 | 低 — 仅调试用，OMO 特定 | **随 OMO 移除** |
| 11 服务架构 | 过度 — desktop 用 0 服务做到 | **整合至 ~7** |

**Gamma 的框架**："复杂度中 40% 是合理的增值（多 tab、持久化、丰富 inline UI），60% 是遗留 OMO 债务。"

**Delta 的基准**："干净设计需要 5 个服务而非 11 个：timeline/segment、live signal coordinator、indicator renderer、completion notice service、stream trigger coordinator。"

---

## 达到 8/10+ 的建议

### P1：从 indicator arming 移除 search-mode 门控 → 7/10
- `BackgroundTaskTimelineService.armIndicatorForUserMessage`：为任何有下游 task 工具活动的用户消息 arm
- ~20 行，消除 2-3 处 search-mode 引用

### P2：使 segment anchoring 模式无关 → 7.5/10
- `AssemblyService.captureUserSegmentAnchor`：为所有有下游 task 活动的用户消息创建 segments
- `collectDiagnostics`：扫描所有 task blocks，不仅限 search-mode anchors
- `getLatestSegmentWithActivity`：移除 search-mode 过滤
- ~30 行，消除 4 处 search-mode 引用

### P3：从 LiveSignalCoordinator 移除 search-mode 守卫 → 7.5/10
- 将 `modeTag === 'search-mode'` 替换为 `launches.size > 0` 或 pending 检查
- ~10 行，消除 2 处 search-mode 引用

### P4：将 OMO 降级整合进单一 compat adapter → 8/10
- 将 `addCompletedTasksFromMessage`、`collectCompletionReminderSegments`、`bg_` regex 移入一个 `OmoBackgroundTaskCompatAdapter`
- OMO 引用从 ~12 处降至 1 处
- 从 AssemblyService + LaunchService 移除 ~40 行

### P5：合并薄服务 → 8/10
- AssemblyService + LaunchService → 一个 assembly owner
- CompletionNoticeService + NoticeStateService → 一个 notice owner
- 服务数：11 → ~7

### P6：补充缺失模块文档 → 8/10
- 5 个服务违反 maintainability R3

---

## 对齐轨迹

```text
原始:    3/10   ████████░░░░░░░░░░░░  (100% OMO，11 search-mode gates)
当前:    5.5/10 ███████████░░░░░░░░░  (流式 SDK 原生，结构模型未变)
P1-P3:  7.5/10 ███████████████░░░░░  (search-mode 门控消除)
P1-P5:  8/10   ████████████████░░░░  (OMO 围栏化，服务整合)
P1-P7:  9/10   ██████████████████░░  (OMO 弃用后移除)
```

**仅 P1–P3**（移除 search-mode 结构性门控）即可将评分带到 **~7.5/10** — 这是单一最高杠杆变更。约 60 行跨 3 文件，消除 live（对所有 task 工作）与 reload（仅 search-mode）之间的核心分叉。

**底线**：四个 commit 修复了数据层。结构模型 — indicator 如何 arm、segments 如何 anchor、diagnostics 如何扫描 — 仍然像 OMO 是唯一选择一样运作。修复那个是下一个明确的步骤。

---

## P1-P3 实施记录（2026-05-11）

本轮按 `docs/superpowers/specs/2026-05-11-task-subagent-search-mode-gate-removal-design.md` 和 `docs/superpowers/plans/2026-05-11-task-subagent-search-mode-gate-removal.md` 执行，仅处理 Council 标出的 P1-P3 search-mode 结构性门控。

完成项：

- `BackgroundTaskTimelineAssemblyService`：native `task` block 的 segment anchoring 与 diagnostics 不再要求 OMO `search-mode` anchor；`modeTag` 只保留为 metadata / historical fallback context。
- `BackgroundTaskTimelineService`：indicator arming 支持普通 user message，普通 native task anchor 的 runtime `modeTag` 为 `null`；普通 anchor 只有在 native task launch 出现后才渲染 inline panel，launchless OMO-mode preparing segment 继续使用 active-anchor 校验。
- `BackgroundTaskLiveSignalCoordinator`：empty placeholder 的 grace-period visibility 不再硬编码 `search-mode`，stale cleanup 对所有 mode 统一 reset。

保留项：

- OMO `system-reminder` fallback 和 `bg_` historical id fallback 仍保留，等待 P4 compat adapter slice 再围栏化。
- 服务合并仍不在本轮范围内，等待 P5。

---

# 第三轮评估（2026-05-11 最终）：P1-P3 完成后对齐评分

> **评估性质**：多 LLM 共识终审（Council，5 councillors）
> **评估对象**：search-mode 门控移除后的 task/subagent 生命周期处理
> **关键 commit**：`8f2e84eb feat: remove task lifecycle search-mode gates`
> **对比基线**：同日第二轮评估 5.5/10

## 更新对齐评分：6.8/10（原始 3/10 → 5.5/10 → **6.8/10**）

| Councillor | 评分 | 定性 |
|---|---|---|
| alpha (gpt-5.5) | 7.2/10 | "Lifecycle finally recognizable, ceiling is architecture not path" |
| beta (glm-5.1) | 6.5/10 | "Streaming unified, reload path partially bifurcated" |
| gamma (deepseek-v4) | 6.5/10 | "Bifurcation resolved, service surface enormous" |
| delta (kimi-for-coding) | 7.0/10 | "Solid, production-ready, but not yet elegant" |
| epsilon (mimo-v2.5-pro) | 7.0/10 | "Live path desktop-aligned, OMO replay is redundant" |

**共识：6.5–7.0。** 范围紧凑。系统已从"OMO 依赖 + SDK 附加"跨越到"SDK 原生 + OMO 遗留降级"。剩余差距是架构重量，不是生命周期正确性。

---

## 各维度评分（Council 平均）

| 维度 | 第二轮 | 第三轮 | Δ | 评估 |
|------|--------|--------|---|------|
| **流式完成检测** | 9/10 | **9/10** | — | SDK 原生，零模式门控 |
| **会话 ID 提取** | 8/10 | **8/10** | — | `metadata.sessionId` 主路径 |
| **ToolPart 生命周期** | 8/10 | **8.5/10** | +0.5 | `toolName === 'task'` 唯一触发，`toolStatus` 驱动完成 |
| **历史回放/锚定** | 3/10 | **6/10** | +3 | Indicator arming 模式无关，lazy segment 创建工作正常 |
| **search-mode 门控消除** | 4/10 | **8.5/10** | +4.5 | 8 → 1 残留（在 OMO 降级路径内部） |
| **服务架构** | 3/10 | **4/10** | +1 | 19 文件（非 11），过度抽象 |
| **模块文档** | 3/10 | **7/10** | +4 | 大部分服务已有文档 |

---

## 结构性分叉是否已解决？

**是的——原始分叉在功能上已消除。**

所有 councillors 追踪了 reload 路径并确认：

| 检查点 | 状态 |
|--------|------|
| `armIndicatorForUserMessage` 对任何 `message.role === 'user'` 触发 | ✅ |
| `captureUserSegmentAnchor` 为任何用户消息设置 `latestTaskAnchorMessage` | ✅ |
| `collectTaskLaunchBlock` lazily 为任何 anchor 创建 segment | ✅ |
| `collectDiagnostics` 处理所有 anchor 的 task blocks | ✅ |
| `shouldRenderInlineSegment` 使用 `modeTag !== null` | ✅ |
| `hasIndicator` 和 `reconcileStateFromLiveSignals` 模式无关 | ✅ |

**微小不对称（beta 标记）**：OMO anchors 获得即时 segment 创建，native anchors 获得 lazy segment 创建。这是时序差异，不是正确性差异。

**Epsilon 的深层关注**：`collectCompletionReminderSegments` OMO 路径可能已是冗余代码——`addNativeTaskCompletionToSegment` 已经从 `tool_use` blocks 的 `toolStatus === 'completed'` 提取完成信息。

---

## Desktop 开发者会怎么看？

综合所有 councillors 的观点：

> Live path 终于干净了。`toolStatus` 驱动完成，`metadata.sessionId` 驱动身份，`toolName === 'task'` 是唯一触发。很好。
>
> 你的 inline progress panels、stale task warnings、per-tab isolation 是我们确实没有的实用功能。那些值得额外复杂度。
>
> 但你用 19 个文件做了我们用单个 `ToolPart` renderer 做到的事。你的 `ActivationIndicatorCoordinator` 是 31 行纯委托。你有 5 个后台会话同步服务可以合并为 2 个。你的 `bg_` regex 爬过 `JSON.stringify()` 寻找可能永远不会出现的模式。你的 OMO `collectCompletionReminderSegments` 路径和你自己的 `addNativeTaskCompletionToSegment` 可能互为冗余。
>
> 你的代码能工作，但不够简洁。

---

## 残留风险评估

| 风险 | 严重度 | 说明 |
|------|--------|------|
| `getLatestSearchModeSegment` 降级 | 🟢 低 | 三层嵌套在 OMO 门控路径内，native task 不可达 |
| 6 处 OMO assembly 引用 | 🟡 中 | Native 用户的死代码，但增加维护负担 |
| `bg_` regex 降级 | 🟢 低 | `metadata.sessionId` 之后检查，对 native 调用静默 |
| **Reload 中途任务** | 🟡 中 | SDK 原生路径能否仅从持久化消息恢复子会话状态？需要显式测试 |

---

## 达到 8+/10 的建议

### P1：移除 `getLatestSearchModeSegment` 降级 → +0.3
- 替换为 `getLatestSegmentWithActivity`（已存在）或重命名接受任何 modeTag
- **2 行变更**，消除最后一个 search-mode 硬编码

### P2：从 `extractBackgroundTaskId` 移除 `bg_` regex → +0.2
- 对 native task 完全信任 `metadata.sessionId`
- **10 行简化**，消除身份歧义

### P3：内联 `ActivationIndicatorCoordinator`（31 行）→ +0.2
- 纯委托反模式，违反 AGENTS.md 规则

### P4：合并 `NoticeStateService` + `CompletionNoticeService` → +0.3
- 两者管理后台任务持久化通知，共享 host 接口

### P5：审计 OMO `collectCompletionReminderSegments` 冗余 → +0.5
- 如果 `addNativeTaskCompletionToSegment` 已从 `toolStatus` blocks 提取完成，整条 OMO 路径可能是死代码
- 添加 SDK 原生 task conversation reload 的显式测试

### P6：收缩后台会话同步（5 → 2 文件）→ +0.5
- 合并 SignalSyncStateCoordinator（23 行）、AttentionCoordinator（52 行）、PostSyncHandoffCoordinator（82 行）

**P1–P4 合计**：~4 小时，评分 → ~7.8/10
**P1–P6 合计**：~8 小时，评分 → ~8.5/10

---

## 对齐轨迹（全部三轮）

```text
Round 1:  3/10   ██████░░░░░░░░░░░░░░  100% OMO，11 search-mode gates
Round 2:  5.5/10 ███████████░░░░░░░░░  流式 SDK 原生，结构模型未变
Round 3:  6.8/10 ██████████████░░░░░░  结构性分叉消除，服务架构成为天花板
Target:   8+/10  ████████████████░░░░  服务整合 + OMO 围栏
```

**天花板不再是生命周期正确性。天花板是服务架构和遗留代码表面。** 19 文件的 background-task 家族提供了 desktop 没有的真实 UX 价值（inline panels、stale warnings、per-tab isolation、persisted notices），但为此付出了过度抽象的代价。通往 8+ 的路径是机械性整合——无行为变更，仅减少文件和清理边界。

---

## P1-P6 服务整合实现记录（2026-05-11）

本轮按 P1-P6 完成 task/subagent 生命周期服务整合，目标是降低后台任务服务重量，同时保留 SDK 原生 task 行为、inline panels、stale warnings、per-tab isolation 和 persisted notices。

- P1/P2：移除最终 search-mode fallback，并停止从任意字符串或 `JSON.stringify()` 结果中抓取 `bg_` 标识；后台任务身份继续以结构化 `metadata.sessionId` / structured id 字段为准。
- P3：删除 `BackgroundTaskActivationIndicatorCoordinator`，将纯委托的 activation indicator 调用内联到现有 activation host / bridge 所有者中。
- P4：把完成通知队列与 stopped/stale notice 状态合并到 `BackgroundTaskNoticeStateService`，由一个 notice owner 管理持久化通知；`BackgroundTaskCompletionNoticeService` 仅保留为 completion-only compatibility facade，避免本轮 Class B 服务整合触碰 `OpenCodianView` thick owner。
- P5：将 OMO completion reminder replay 围栏化，只对显式 system-reminder 兼容路径生效；SDK 原生 completed task reload 继续由 `toolStatus` / `toolMetadata.sessionId` 驱动。
- P6：删除 `BackgroundConversationSignalSyncStateCoordinator` 和 `BackgroundConversationAttentionCoordinator`，把 background post-sync mark 与 attention handoff 收束进 `BackgroundConversationPostSyncHandoffCoordinator`。

本轮属于纯 service / docs / graphify 切片，未触碰需要部署的 Test Vault runtime 路径；因此不需要 Test Vault deploy。

---

# 第四轮最终评估（2026-05-11）：P1-P6 完成后对齐评分

> **评估性质**：多 LLM 共识终审（Council，5 councillors）
> **评估对象**：P1-P6 服务整合完成后的 task/subagent 生命周期处理
> **关键 commit**：`68694c99 refactor: consolidate task lifecycle services`
> **对比基线**：第三轮评估 6.8/10

## 最终对齐评分：7.2/10（3/10 → 5.5/10 → 6.8/10 → **7.2/10**）

| Councillor | 评分 | 关键洞察 |
|---|---|---|
| alpha (gpt-5.5) | 7.4/10 | "Lifecycle correct, ceiling is architecture not path" |
| beta (glm-5.1) | 7.2/10 | "Streaming unified, 1.5pts = design choice, 1.0 = OMO compat, 0.3 = cleanup" |
| gamma (deepseek-v4) | 7.0/10 | "Real progress, remaining gap is design choice not alignment failure" |
| delta (kimi-for-coding) | 7.0/10 | "Alignment debt fixed, remaining is consolidation polish" |
| epsilon (mimo-v2.5-pro) | 7.5/10 | "SDK signal alignment done, gap is intentional UX enrichment" |

**共识：7.0–7.5。** 系统已从"对齐债务"跨越到"设计选择差距"。

---

## 各维度评分（Council 平均）

| 维度 | Round 2 | Round 3 | Round 4（最终） | 状态 |
|------|---------|---------|----------------|------|
| **流式完成检测** | 9/10 | 9/10 | **9/10** | ✅ 稳定 — 完全 SDK 原生 |
| **会话 ID 提取** | 8/10 | 8/10 | **9/10** | ✅ `bg_` regex 已移除，`metadata.sessionId` 唯一原生路径 |
| **ToolPart 生命周期** | 8/10 | 8.5/10 | **8.5/10** | ✅ `toolStatus` 生命周期与 desktop 匹配 |
| **历史回放/锚定** | 3/10 | 6/10 | **6.5/10** | ⚠️ OMO 已围栏，SDK 原生工作正常，但 AssemblyService 双路径仍存在 |
| **search-mode 消除** | 4/10 | 8.5/10 | **10/10** | ✅ 零引用。完成。 |
| **服务架构** | 3/10 | 4/10 | **5.5/10** | ⚠️ 19→14 文件，真实改善。4 个薄壳残留。 |
| **模块文档** | 3/10 | 7/10 | **8/10** | ✅ 所有文件已有文档 |

---

## 评分分解

beta 的框架最精确：

> 剩余 2.8 分分布为：
> - **~1.5**  deliberate UX 范围（inline panels、grace periods、persistence、cross-tab — 是功能，不是 bug）
> - **~1.0**  OMO 兼容层，移除会破坏历史会话
> - **~0.3**  次要清理机会（未使用参数、命名清晰度）

所有 councillors 同意此分解是诚实的。

---

## 14 文件 / 2545 行仍然太多吗？

**Council 共识：略高，但由范围证明。desktop 对比是错误的。**

Desktop 有 0 个文件因为它没有：
- 带 per-task 状态的 inline progress panels
- 带去重的延迟持久化完成通知
- 带 15 秒 grace period 的 stale task 警告
- hydration 的跨会话元数据持久化
- per-tab 后台任务隔离
- 权威同步 gates
- Post-sync handoff 协调

**gamma 的诚实清单：**

| 类别 | 数量 | 结论 |
|---|---|---|
| 核心任务生命周期 | 4 | **合理** — assembly、orchestration、launch extraction、live signals |
| 丰富 UI | 3 | **合理** — inline panel、indicator、notice state |
| Post-sync 基础设施 | 3 | **过度抽象** — coordinator + adapter + executor 可为 1-2 文件 |
| Facade/薄壳 | 1 | **应合并** — 66 行 CompletionNoticeService 包裹 NoticeStateService |

**Delta 的目标**："9 文件、~2100 行对 OpenCodian 的功能集是真正合理的数字。"

**但：** 按 AGENTS.md 规则，现在合并这些会是反向的"仅为减少行数而拆分文件"——组织性调整，不是所有权改善。文件存在，每个有连贯所有权，整合曲线已到收益递减点。

---

## 残留 OMO 引用：永久保留还是移除？

**Council 共识：永久兼容层。保留。**

| OMO 路径 | 目的 | 可移除？ |
|----------|------|---------|
| `collectOmoCompletionReminderSegments` | 历史会话回放 | 否 — 会破坏旧会话 |
| `addCompletedTasksFromMessage` | 历史任务完成提取 | 否 — 是 pre-SDK 消息的唯一来源 |
| `isOmoModeAnchorMessage` | OMO 模式标记 segment anchoring | 低优先级 — 可稍后简化 |
| `backgroundTaskModeTag` runtime 字段 | OMO "preparing" 状态渲染 | 建议重命名为 `omoCompatModeTag` |

所有 councillors 确认：移除这些会破坏历史会话渲染。fast-fail 围栏意味着原生会话成本 ~ 为零。**作为永久兼容层可接受。**

---

## Desktop 开发者会怎么说

综合五位 councillors：

> *"原生路径干净 — `toolStatus`、`metadata.sessionId`、零模式门控。这就是我们预期的。OMO 降级已正确围栏。我们理解你为什么需要 inline panels 和 completion notices 作为你的 UX。*
>
> *服务数量是你的插件问题，不是 desktop 问题。我们会标记 4 个薄 coordinator 壳和 3 跳调用链，但它们是组织选择，不是 bug。热路径正确。发布它。"*

---

## 对齐轨迹（全部四轮）

```text
Round 1:  3/10   ██████░░░░░░░░░░░░░░  100% OMO，11 search-mode gates
Round 2:  5.5/10 ███████████░░░░░░░░░  流式 SDK 原生，结构模型未变
Round 3:  6.8/10 ██████████████░░░░░░  结构性分叉消除
Round 4:  7.2/10 ███████████████░░░░░  整合完成，设计选择天花板
```

---

## 停止条件

**是的。task/subagent 对齐工作已完成到足够停止的程度。**

所有 councillors 独立达到此结论：

- ✅ SDK 信号对齐：**完成** — `toolCall.status`、`metadata.sessionId`、`toolName === 'task'` 均匹配 desktop
- ✅ search-mode 门控：**已消除** — 零引用
- ✅ `bg_` regex：**已移除** — 零引用
- ✅ OMO 降级：**已正确围栏** — 不在原生会话热路径中
- ✅ 结构性分叉：**已解决** — 无按模式分离的代码路径
- ✅ 服务整合：**已到收益递减点** — 进一步合并是组织性调整，非对齐改善
- ✅ 模块文档：**当前** — 所有文件已有文档

**剩余差距（7.2 → 10）分布为：**
- 1.5 分 = deliberate UX 丰富性（inline panels、grace periods、persistence、per-tab isolation）
- 1.0 分 = 无法移除的 OMO 向后兼容
- 0.3 分 = 次要命名/参数清理

**这些都不是对齐失败。它们是设计选择。**

**最终评分：7.2/10。** 这是提供比 desktop 参考更丰富的 task UX、同时保持正确 SDK 信号对齐的 Obsidian 插件的自然天花板。

---

## 结论

本次 task/subagent 生命周期对齐工作经历了四轮递进优化：

1. **Round 1（原始状态）**：100% OMO 依赖，11 search-mode 硬编码，无 SDK-native 路径。评分 **3/10**。
2. **Round 2（数据层修复）**：commit `0874c0c3` 引入 SDK-native ToolPart 状态 + `metadata.sessionId`，但结构模型未变。评分 **5.5/10**。
3. **Round 3（结构分叉消除）**：commit `8f2e84eb` 移除 search-mode 门控，indicator/anchoring/diagnostics 模式无关。评分 **6.8/10**。
4. **Round 4（服务整合）**：commit `68694c99` 完成 P1-P6 整合，移除 5 个文件，消除 `bg_` regex，围栏 OMO 路径。评分 **7.2/10**。

从 **3/10 到 7.2/10**，实现了：
- **OMO 依赖从 100% 降至仅历史兼容降级**
- **search-mode 硬编码从 11 处降至 0 处**
- **`bg_` 正则从主路径降至已移除**
- **服务文件从 19 个降至 14 个**
- **SDK 原生信号成为唯一生命周期权威**

剩余差距不是 bug，而是设计选择。工作已完成。

---

# Council 补充决议：子会话查看体验对齐（2026-05-11）

> **触发原因**：用户指出 opencode-desktop 可以查看子会话内容，质疑 OpenCodian 是否对齐该功能。
> **评估性质**：多 LLM 共识讨论（Council，5 councillors）
> **核心问题**：OpenCodian 是否真的能查看子会话内容？当前 tab 切换模式是否足够？

## 调查发现

### OpenCodian **已有**子会话查看能力

| 功能 | 实现 | 证据 |
|------|------|------|
| 打开子会话 | ✅ "Open subagent session" 按钮 → 新 tab | `ToolCallRenderer.ts:160` |
| 子会话消息历史 | ✅ 完整加载，same pipeline | `ConversationTabOpenCoordinator.ts:94` → SDK `session.messages()` |
| 子会话树状图 | ✅ Collapsible tree below messages | `ChildSessionGraphCoordinator.ts` |
| 子会话状态标记 | ✅ completed/active/error/unknown | `ChildSessionGraphCoordinator.ts:210` |

**结论：OpenCodian 可以查看子会话内容，但 UX 路径是 "新 tab" 而非 desktop 的 "in-app 导航"。**

### opencode-desktop 的实际做法

**关键发现：desktop 也** **不** **inline 渲染子会话内容。**

Desktop 的 task 工具使用 `hideDetails`，渲染为：
- Compact card (~50px)：agent 名称 + 描述 + 状态
- 点击后 **navigate to child session page**（URL 变化）
- **零 inline 子会话内容**

Desktop 模型："indicator + deep link" — 看到子代理被 spawn，点击访问它。

### OpenCodian vs Desktop 的真实差异

| 维度 | Desktop | OpenCodian | 差异 |
|------|---------|-----------|------|
| 子会话内容查看 | 导航到子会话页面 | 打开新 tab | **等价** |
| 返回父会话 | 浏览器 back / 会话列表 | **手动找 tab** | **OpenCodian 较差** |
| Inline 内容 | **无**（`hideDetails`） | 无 | **相同** |
| 视觉占用 | Compact card | Tool card + "Open" 按钮 | **OpenCodian 略大** |

**真实差距不是"能不能看"，而是"看完怎么回来"。**

---

## Council 共识：Option C — 改进 Tab 模型 + "Back to Parent" 面包屑

**5/5 councillors 一致同意。**

### 为什么选 C

| 选项 | 评估 |
|------|------|
| A Inline 内容 | ❌ 拒绝 — sidebar 嵌套完整会话 = scroll hell，实现风险高 |
| B Compact summary | ⚠️ 后续增强 — 现有 `ToolCallRenderer` 已提供足够信息 |
| **C Tab + breadcrumb** | ✅ **选定** — 低复杂度，高影响，Obsidian 原生 |
| D 什么都不做 | ❌ 拒绝 — 上下文丢失是真实的日常摩擦 |

### 核心判断

> **问题不是"看不到内容"（OpenCodian 已经可以），而是"切换 tab 后丢失上下文，没有快速返回路径"。**

Desktop 用 in-app 导航（URL 变化），用户可用浏览器 back 返回。OpenCodian 用 tab 切换，但没有等价机制。

### 最小可行改进（MVP）

1. **`TabData` 添加 `parentTabId?: string`** — tab 创建时记录父 tab
2. **`ConversationTabOpenCoordinator.openTaskToolSession()` 传递当前 active tab ID** 作为 `parentTabId`
3. **`TabBar` 渲染 "← Back to: [parent title]"** 当 active tab 有 `parentTabId`
4. **点击面包屑 → `tabManager.switchToTab(parentTabId)`**

**修改文件：5-6 个，不新增模块，纯增量。**

### 理想状态（后续迭代）

- MVP 面包屑
- + 可选：task 卡片上显示一行完成摘要（tool 计数、文件变更）— Option B 的轻量版本
- + 可选：child tab 标题加 `↳` 前缀以视觉区分

### 优先级：P1（改进项）

不是 bug（内容可访问，无数据丢失），但 subagent 工作流是核心 agent 用法，"打开 tab → 丢失上下文 → 手动扫描 tab bar 找父会话" 是日常 UX 摩擦。实现成本低，用户价值明确。

---

## 子会话查看维度单独评分

| 维度 | Desktop | OpenCodian（当前） | OpenCodian（+MVP） |
|------|---------|-------------------|-------------------|
| 查看子会话内容 | ✅ 导航到子页面 | ✅ 新 tab | ✅ 新 tab（不变） |
| 返回父会话 | ✅ 浏览器 back | ❌ 手动找 tab | ✅ 面包屑一键返回 |
| Inline 内容展示 | ❌ 无（`hideDetails`） | ❌ 无 | ❌ 无（不需要） |
| 视觉紧凑度 | ✅ Compact card | ⚠️ Tool card + button | ⚠️ 同上 |
| 上下文保留 | ✅ In-app 导航 | ❌ Tab 切换 | ✅ 面包屑弥补 |

**当前子会话查看评分：6/10**（能看，但返回路径差）
**+MVP 后评分：8/10**（能看 + 能回来，和 desktop 等价）

---

## 对齐轨迹更新（含子会话查看）

```text
Round 1:  3/10   ██████░░░░░░░░░░░░░░  100% OMO，无 SDK-native
Round 2:  5.5/10 ███████████░░░░░░░░░  流式 SDK 原生
Round 3:  6.8/10 ██████████████░░░░░░  结构分叉消除
Round 4:  7.2/10 ███████████████░░░░░  服务整合完成
Round 5:  7.2/10 ███████████████░░░░░  + 子会话查看澄清：能看，但返回差
+MVP:     8/10   ████████████████░░░░  + 面包屑后，子会话查看对齐
```

**修正后的整体评估：**
- **协议层对齐**：7.2/10（已完成）
- **子会话查看体验**：6/10 → 8/10（MVP 后）
- **最终目标**：整体 8/10 需要完成生命周期协议 + 子会话面包屑
