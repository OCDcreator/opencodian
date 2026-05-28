# Chat Surface Migration Spec

> **状态**: `[DRAFT]`
> **最后更新**: 2026-05-19
> **前置依赖**: 无（前端先行，Phase 0a 共享 Capability 类型）
> **关联 spec**: `multi-agent-board.md`

## 概述

本文档定义聊天界面（Chat Surface）在多 backend 环境下的行为规则。后端抽象由 foundation spec 解决，本文档只管"现有 UI 怎么适配"。

### 阶段编号对照表

| 本 spec (CS) | 08-phased-rollback | README Phase | 说明 |
|-------------|-------------------|--------------|------|
| CS-0 | Phase 0a | Phase 0a | 定义 AgentCapability 类型，同一次交付物 |
| CS-1 | Phase 0b | Phase 0b | 聊天 UI capability 驱动隐藏 |
| CS-2 | Phase 0d | Phase 0d | 会话归属 + 历史过滤 |
| CS-3 | Phase 1c | Phase 1c | 模型选择器适配（需 AgentService） |
| CS-4 | Phase 1c | Phase 1c | Server Status Badge 适配（需 AgentService） |

## 1. 产品规则

| # | 规则 | 说明 |
|---|------|------|
| R1 | 智能体选择在设置中进行 | 聊天界面不提供智能体切换入口。用户只能在设置中启用/切换智能体。 |
| R2 | 切换智能体 = 历史过滤 | 选中某智能体后，历史会话列表只显示该智能体的会话。不删除其他智能体的历史，只是不显示。 |
| R3 | 新建会话延续当前智能体 | 新建会话时自动使用当前选中的智能体，不弹出选择器。 |
| R4 | 不支持的能力直接隐藏 | 当智能体不支持某个能力时（如 Copilot 没有 todo），对应的 UI 区域不渲染。不显示灰色占位。 |
| R5 | 模型选择器统一控件 | 一个统一的模型选择器，切换智能体后模型列表自动更新为该智能体的可用模型。 |
| R6 | 会话归属不可变 | 每个会话创建时绑定智能体，之后不可更改。 |
| R7 | 全部可禁用 | 所有智能体（包括 OpenCode）都可以禁用。默认全部禁用。全部禁用时聊天界面显示空状态引导。 |

## 2. Backend 感知点总览

聊天界面约 70 个 UI 元素中，44 个（63%）依赖智能体后端。按行为模式分为 5 类：

### 2.1 所有 backend 都有 — 无变化

| UI 元素 | 行为 |
|---------|------|
| 聊天消息区域（scrollable container） | 不变 |
| 输入框 textarea | 不变 |
| 发送按钮 | 状态逻辑相同（streaming 时禁用） |
| Tab bar（标签页） | 不变，但 tab 的视觉状态可能因 backend 不同有细微差异 |
| 新建会话按钮 | 不变，但新建的会话归属当前 backend |
| 历史按钮 | 行为不变，但列表内容按 backend 过滤 |
| 设置按钮 | 不变 |
| 用户消息内容渲染（markdown） | 不变 |
| 空会话提示 | 文案可能因 backend 不同而微调 |
| 等待块（Pending indicator） | 所有 backend 都有"thinking"状态，不变 |
| 导航侧边栏（上下消息跳转） | 不变 |
| 实验性视觉效果（liquid diamond 等） | 不变 |

### 2.2 Capability 驱动 — 按 `hasCapability()` 显示/隐藏

| UI 元素 | 依赖的 Capability | 显示条件 |
|---------|-------------------|---------|
| **TodoDock** | `todos` | backend 支持 todo 追踪时显示 |
| **QuestionDock** | `questions` | backend 支持问答请求时显示 |
| **QuestionInlineCard** | `questions` | 同上，流式中的问答卡片 |
| **QuestionResolutionCard** | `questions` | 同上，已回答的问答卡片 |
| **ToolCallRenderer** | `tools` | backend 支持工具调用时显示。具体 tool kind（tool/mcp/skill）由 `toolIdentity` 决定 |
| **PermissionInlineCard** | `permissions` | backend 支持权限管理时显示。4 按钮交互可能因 backend 不同 |
| **ContextRing**（上下文使用进度） | `context` | backend 支持上下文用量查询时显示 |
| **ContextDetailModal** | `context` | 同上 |
| **EffortSelector**（思考深度） | `models` + backend 支持 thinking variants | 取决于 backend 的模型是否支持 thinking variants |
| **BackgroundTaskInlinePanel** | `subagents` | backend 支持子 agent 时显示 |
| **BackgroundTaskIndicator** | `subagents` | 同上，tab 上的背景任务指示点 |
| **BackgroundTaskTimeline** | `subagents` | 同上 |
| **BackgroundTaskCompletionNotice** | `subagents` | 同上 |
| **ChildSessionTree**（子会话树） | `subagents` | backend 支持子 agent 且有子会话时显示 |
| **ModifiedFilesSidebar**（右侧文件变更） | 依赖 session diff | backend 支持 session diff 时显示 |
| **Share/Unshare 按钮** | OpenCode 特有 | 只在 backend='opencode' 时显示 |

### 2.3 Backend 状态驱动 — 每个 adapter 自行管理

| UI 元素 | 行为 |
|---------|------|
| **Server status badge** | 每个 adapter 有自己的连接状态。OpenCode: server running/starting/offline。其他: connected/disconnected/error。badge 文案和颜色映射统一。 |
| **LSP status indicator** | 只在 backend='opencode' 时显示（其他 backend 没有 LSP 概念） |
| **Tab streaming 状态** | 统一：所有 backend 的 tab 都显示 streaming 动画。实现方式相同。 |
| **Sync indicator** | 取决于 backend 是否有 sync 事件 |

### 2.4 模型选择驱动

| UI 元素 | 行为 |
|---------|------|
| **Model selector trigger** | 统一位置。显示当前 backend 的当前模型。切换 backend 后内容更新。 |
| **Model selector dropdown** | 统一控件。模型列表从 `adapter.listModels()` 获取。不同 backend 的列表完全不同。 |
| **Model selector sticky headers** | 按 provider 分组。不同 backend 的分组方式可能不同。 |

### 2.5 OpenCode 特有 — 只在 backend='opencode' 时显示

| UI 元素 | 原因 |
|---------|------|
| **Agent mention dropdown (@)** | OpenCode 的 agent 系统特有 |
| **Agent selection coordinator** | OpenCode 的 agent/mode 选择 |
| **Slash command menu (/)** | OpenCode 的 slash command 系统 |
| **SlashCommandMenuCatalogCache** | 依赖 OpenCode config + SDK commands |
| **Formatter status** | OpenCode 的 formatter 系统 |
| **ACP section** | OpenCode 的 agent communication protocol |
| **Tool permissions per agent** | OpenCode 的 per-agent tool permission |
| **Compaction divider** | OpenCode 的 compaction 标记，只在有 `compaction` capability 时渲染 |
| **OMO 系统消息** | OpenCode 的 OMO 注入消息（`OmoUserInjectionMeta` / `OmoSystemReminderMeta`），只在 backend='opencode' 时渲染 |

## 3. 消息级行为矩阵

### 3.1 用户消息

| UI 元素 | 依赖 | OpenCode | Claude Code | Codex | Copilot | Pi |
|---------|------|----------|-------------|-------|---------|-----|
| **消息内容** | 无 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **消息时间戳** | 无 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Fork 按钮** | `branching` | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Revert 按钮** | `branching` | ✅ | ✅ | ❌ | ❌ | ❌ |

**Fork 行为**：
- 有 `branching` capability 的 backend：Fork 创建新会话，继承当前消息上下文
- 没有 `branching` 的 backend：不显示 Fork 按钮

**Revert 行为**：
- OpenCode 和 Claude Code 支持完整 revert/unrevert
- Pi 支持 tree-based branching（最丰富）
- Codex/Copilot 不支持 revert → 不显示按钮

### 3.2 助手消息

| UI 元素 | 依赖 | 所有 backend | 说明 |
|---------|------|-------------|------|
| **文本块** | 无 | ✅ | 所有 backend 都有文本输出 |
| **Thinking 块** | SDK 事件 | 看情况 | OpenCode ✅ / Claude Code ✅ / Codex 看配置 / Copilot ❌ / Pi 看配置 |
| **Tool 块 (tool)** | `tools` | 看情况 | 各 backend 工具不同，但渲染统一通过 `ToolCallRenderer` |
| **Tool 块 (mcp)** | `mcp` | 看情况 | OpenCode ✅ / Claude Code ✅ / Codex ✅ / Copilot ✅ / Pi 需确认 |
| **Tool 块 (skill)** | OpenCode 特有 | ❌ 非 OpenCode 不显示 | Skill 是 OpenCode 的 skill 系统 |
| **错误块** | 无 | ✅ | 所有 backend 都可能有错误 |
| **等待块 (pending)** | 无 | ✅ | 所有 backend 都有等待状态，文案可能不同 |
| **模型信息 footer** | `models` | ✅ | 显示使用的模型名 |

**Tool 块的 kind 映射**：
- `toolIdentity.ts` 已有 source 感知：`'generic' | 'opencode' | 'claudian' | 'codex'`
- 新增 `'copilot'` 和 `'pi'` source 值
- Tool kind 分类（`builtin`/`mcp`/`custom`/`task`/`skill`）由各 adapter 的事件翻译决定
- 渲染层 `ToolCallRenderer` 已经是 transport-agnostic，只需 StreamChunk 中的 tool 数据

## 4. 会话生命周期

### 4.0 全部禁用时的空状态

当所有智能体都被禁用时，聊天界面显示空状态引导：

```
┌─────────────────────────────────────────┐
│                                         │
│         🤖                              │
│                                         │
│   尚未启用任何智能体                      │
│   请在设置中启用至少一个智能体后端         │
│                                         │
│         [打开智能体管理]                  │
│                                         │
└─────────────────────────────────────────┘
```

- 输入框禁用
- 历史列表为空
- 点击"打开智能体管理"跳转至设置的智能体管理子标签

### 4.1 Conversation 字段语义

`Conversation` 类型已有 `transport?: 'opencode' | 'acp'` 字段（chat.ts）。新增 `backend: AgentBackendKind` 的语义区分：

- `backend` = **逻辑 agent 系统标识**（哪个 backend 拥有此会话）
- `transport` = **线路协议**（opencode HTTP/SSE / ACP 等）

**关系**：`transport` 是 `backend` 的通信层细节。OpenCode 会话的 `transport='opencode'` 隐含 `backend='opencode'`。ACP 会话的 `transport='acp'` 但 `backend` 可以是任何支持的 backend。

**长期**：Phase 1+ 考虑将 `transport` 合并进 adapter 内部，不再暴露到 Conversation 层。Phase 0 不改 `transport` 字段。

### 4.1 新建会话

```
用户点击 "新建会话"
  → 获取当前选中 backend (from settings)
  → Phase 0: 直接调用 openCodeService.createSession()，硬编码 'opencode'
  → Phase 1+: 调用 adapter.createSession()
  → 创建 Conversation，标记 backend + backendSessionId
  → 显示新 tab，归属当前 backend
```

### 4.2 打开旧会话

```
用户从历史列表选择会话
  → 读取 Conversation.backend
  → 获取对应 adapter
  → 如果 adapter 未连接：提示 "需要先启用 xxx backend"
  → 如果 adapter 已连接：恢复会话，加载消息
```

### 4.3 切换 backend（从设置中）

```
用户在设置中切换活跃 backend
  → 当前会话保持不变（归属不因切换改变）
  → 正在流式传输的会话不受影响，继续完成当前流
  → 历史列表过滤为新 backend 的会话
  → 新建会话按钮创建新 backend 的会话
  → UI 元素根据新 backend 的 capabilities 重新评估显示/隐藏
  → 模型选择器更新为新 backend 的模型列表
```

### 4.4 会话列表过滤

```
历史列表渲染：
  for (const conv of allConversations) {
    if (conv.backend !== currentActiveBackend) continue;
    // 渲染该会话
  }
```

- 旧 Conversation 数据（无 backend 字段）默认归属 `'opencode'`
- 过滤只影响显示，不删除数据

## 5. Server Status Badge 行为

### 5.1 当前行为（OpenCode only）

| 状态 | 显示 | 颜色 |
|------|------|------|
| stopped | Offline | 灰色 |
| starting | Starting | 黄色 |
| running | Running | 绿色 |
| error | Error | 红色 |
| external | External | 蓝色 |

### 5.2 多 backend 行为

统一为 `AgentConnectionStatus`：
| 状态 | 显示 | 颜色 |
|------|------|------|
| disconnected | Offline | 灰色 |
| connecting | Starting | 黄色 |
| connected | Running | 绿色 |
| error | Error | 红色 |

- Badge 文案改为显示 backend 名称 + 状态（如 "Copilot · Connected"）
- 5s 轮询改为按 backend adapter 的 `onStatusChange()` 订阅
- 点击 badge 的行为：显示当前 backend 的诊断信息（复用 `getDiagnosticSnapshot()`）

## 6. 模型选择器行为

### 6.1 统一控件设计

```
┌──────────────────────────┐
│ 🤖 Claude Sonnet 4 ▼     │  ← trigger: 显示当前模型
├──────────────────────────┤
│ 🔍 搜索模型...            │
├──────────────────────────┤
│ ── Anthropic ──           │  ← 按 provider 分组
│   Claude Opus 4           │
│   Claude Sonnet 4  ✓      │
│   Claude Haiku 3.5        │
│ ── OpenAI ──              │
│   GPT-4o                  │
│   GPT-4o mini             │
└──────────────────────────┘
```

### 6.2 Backend 切换时

- 清空当前选择
- 从 `adapter.listModels()` 获取新列表
- 如果之前选的模型在新 backend 中不存在，fallback 到 `adapter.getDefaultModel()`
- 分组逻辑由 adapter 返回的 `provider` 字段决定

### 6.3 不支持模型选择的 backend

如果 `!hasCapability('models')`：
- 模型选择器不显示
- 输入区域布局自动调整（消除模型选择器的空间）

## 7. 右侧边栏行为

### Modified Files Sidebar

- 依赖 `adapter.getSessionDiff()` 或类似能力
- OpenCode 有 session diff 概念 → 显示
- 其他 backend 如果没有 session diff → 隐藏
- 不是 capability 驱动，而是"adapter 是否提供 diff 数据"驱动

### Child Session Tree

- 依赖 `subagents` capability
- OpenCode 有 task tool 创建子会话 → 显示
- Claude Code 有 programmatic subagents → 显示
- 其他 backend 不支持 → 不显示

## 8. 输入区域完整布局

```
┌─────────────────────────────────────────┐
│ [Agent selector] [Model selector] [Effort] │  ← 条件显示
├─────────────────────────────────────────┤
│ [ContextRing ══════════░░░░]  [Permissions] │  ← 条件显示
├─────────────────────────────────────────┤
│ 📎 [文件chips...]                         │  ← 所有 backend
├─────────────────────────────────────────┤
│ 输入框...                          [发送] │  ← 所有 backend
└─────────────────────────────────────────┘
```

| 行 | 元素 | 条件 |
|----|------|------|
| 第 1 行 | Agent selector | backend='opencode' 时显示 |
| 第 1 行 | Model selector | `hasCapability('models')` 时显示 |
| 第 1 行 | Effort selector | backend 支持 thinking variants 时显示 |
| 第 2 行 | ContextRing | `hasCapability('context')` 时显示 |
| 第 2 行 | Permission mode | `hasCapability('permissions')` 时显示 |
| 第 3 行 | Context file chips | 所有 backend |
| 第 4 行 | Input + Send | 所有 backend |

## 9. Capability → UI 映射汇总表

| Capability | UI 元素 | 隐藏时的布局影响 |
|------------|---------|-----------------|
| `tools` | ToolCallRenderer, Tool blocks | 工具块不渲染，消息流中跳过 |
| `mcp` | MCP tool blocks | MCP kind 工具不渲染。注意：Tool 块渲染条件为 `hasCapability('tools') \|\| hasCapability('mcp')`，任一为 true 即显示 |
| `permissions` | PermissionInlineCard, PermissionModeSelector | 卡片不显示；输入行少一个控件 |
| `branching` | Fork/Revert buttons | 用户消息 footer 只显示时间戳 |
| `todos` | TodoDock | 整个 dock 不渲染 |
| `questions` | QuestionDock, QuestionInlineCard, QuestionResolutionCard | 所有问答 UI 不渲染 |
| `models` | Model selector dropdown | 输入行少一个控件 |
| `subagents` | BackgroundTaskPanel, ChildSessionTree, BackgroundTaskIndicator | 所有子 agent UI 不渲染 |
| `context` | ContextRing, ContextDetailModal, Cost display | 输入行少上下文进度条 |
| `providers` | Provider 分组 | 模型列表不按 provider 分组 |
| `compaction` | Compaction divider | 不显示 |
| `cost-tracking` | Cost display（ContextDetailModal 内） | 不显示费用信息 |
| `thinking` | EffortSelector, Thinking 块 | 不显示思考深度选择器 |
| `hooks` | — | 无直接 UI 影响 |
| `config` | — | 无直接 UI 影响 |
| `file-ops` | — | 无直接 UI 影响 |
| `shell` | — | 无直接 UI 影响 |
| `export` | — | 无直接 UI 影响 |

## 10. Phase 计划

> **设计原则**：前端先行。Phase CS-0/CS-1 在只有 OpenCode 的环境下完成，
> OpenCode 声明全量 capabilities，前端用 `hasCapability()` 替换硬编码逻辑。
> 这一步零风险：只改 UI 层，不改 backend，所有现有功能不变。

### Phase CS-0: Capability 查询基础设施 [前端先行，无 backend 依赖]

**目标**: 让聊天界面能查询当前 backend 的 capabilities

**前置依赖**: 无（只需定义 Capability 类型枚举，不需要完整的 AgentService 实现）

**产出**:
- `AgentCapability` 类型枚举（在 `src/core/agents/types.ts` 或独立文件）
- `getActiveBackendCapabilities()` 工具方法
  - 第一版：硬编码返回 OpenCode 的全量 capabilities
  - 后续 Phase 1 接入 AgentServiceRegistry 后自动切换
- 替换 OpenCodianView 中硬编码的 "检查 OpenCode 功能" 逻辑

**验收**:
- 现有 OpenCode backend 下所有 UI 不变
- `hasCapability('todos')` → `true`（OpenCode 全量）
- TypeScript 编译通过

**回滚**: 删除 `getActiveBackendCapabilities()` 和 `AgentCapability` 类型，恢复硬编码

### Phase CS-1: Capability-driven 隐藏 [前端先行，无 backend 依赖]

**目标**: 根据 capabilities 隐藏不支持的区域（当前只有 OpenCode，全部显示）

**前置依赖**: Phase CS-0

**按优先级排序的 UI 区域**:
1. TodoDock → `todos` capability
2. QuestionDock → `questions` capability
3. Fork/Revert buttons → `branching` capability
4. PermissionInlineCard → `permissions` capability
5. ContextRing → `context` capability
6. BackgroundTaskPanel → `subagents` capability
7. ChildSessionTree → `subagents` capability
8. ModifiedFilesSidebar → session diff data
9. EffortSelector → thinking variants
10. Agent mention (@) → OpenCode only
11. Slash command (/) → OpenCode only
12. LSP indicator → OpenCode only
13. Tool skill blocks → OpenCode only

**验收**:
- OpenCode 下所有 UI 不变（因为 OpenCode 全量 capability）
- 临时 mock 一个空 capability 集合，验证隐藏逻辑正确
- `npm run verify` 通过

**回滚**: 移除 `hasCapability()` 包裹，恢复无条件渲染

### Phase CS-2: 会话归属 + 历史过滤 [前端先行，无 backend 依赖]

**目标**: 每个会话绑定 backend，历史列表按 backend 过滤

**前置依赖**: Phase CS-1

**关键任务**:
1. Conversation 类型加 `backend: AgentBackendKind`
2. 新建会话时标记当前 backend（硬编码 `'opencode'`，Phase 1 后自动切换）
3. 历史列表过滤
4. 旧数据 fallback 为 `'opencode'`
5. 打开旧会话时恢复对应 backend adapter

**验收**:
- 所有现有会话（无 backend 字段）显示正常
- 新建会话有 `backend: 'opencode'` 标记
- 历史过滤不丢失数据

### Phase CS-3: 模型选择器适配 [需 Phase 1 AgentService]

**目标**: 统一模型选择器支持多 backend

**前置依赖**: Phase 1a（OpenCodeAdapter 实现）

**关键任务**:
1. 模型列表从 `adapter.listModels()` 获取
2. Backend 切换时刷新列表
3. Fallback 到默认模型
4. 不支持 models 时隐藏选择器

### Phase CS-4: Server Status Badge 适配 [需 Phase 1 AgentService]

**目标**: Badge 显示当前 backend 的状态

**前置依赖**: Phase 1a（OpenCodeAdapter 实现）

**关键任务**:
1. Badge 文案改为 "BackendName · Status"
2. 状态订阅改为 `adapter.onStatusChange()`
3. 点击行为改为显示 adapter 诊断信息

### 与 Foundation Spec Phase 的对接时序

```
Phase CS-0 (capability 基础) ─── 零依赖，立即开始
Phase CS-1 (capability 隐藏) ─── 零依赖
Phase CS-2 (会话归属) ────────── 零依赖
        │
        ▼
Phase 0a (定义接口) ← CS-0 的 Capability 类型验证了接口设计
Phase 1a (OpenCodeAdapter) ← CS-1 的 hasCapability() 验证了能力划分
        │
        ▼
Phase CS-3 (模型选择器) ← 需要 AgentService.listModels()
Phase CS-4 (Badge) ← 需要 AgentService.onStatusChange()
```

## 11. 与 foundation spec 的对接点

### 类型语义说明

**`SurfaceAgent.backend`**：`SurfaceAgent` 是 OpenCode 的**内部 agent 目录**（code, ask, title 等），代表同一 backend 下的不同模式。新增 `backend: AgentBackendKind` 字段语义为"哪个 backend 系统提供此 agent 目录"，与 SurfaceAgent 内部的 agent identity（name/mode）是正交的两个维度。

**命名冲突缓解**：如果后续发现命名混淆，可以引入独立的 `BackendDescriptor` 类型。Phase 0 阶段在 `SurfaceAgent` 上加 `[planned]` 注释即可。

| foundation spec 概念 | chat surface 消费方式 | 前置时序 |
|---------------------|---------------------|---------|
| `AgentCapability` 类型枚举 | `hasCapability()` 控制 UI 显示 | **CS-0 先定义，Phase 0a 后复用** |
| `AgentService.capabilities` | Phase 1 后替换硬编码 capabilities | Phase 1a 后接入 |
| `AgentService.sendMessage()` | 返回 `StreamChunk`，现有渲染管线复用 | Phase 1a 后接入 |
| `AgentService.listModels()` | 填充模型选择器 | Phase CS-3 需要 |
| `AgentService.start()/stop()` | 驱动 server status badge | Phase CS-4 需要 |
| `AgentService.onStatusChange()` | Badge 状态订阅 | Phase CS-4 需要 |
| `SurfaceAgent.backend` | 会话归属 + 历史过滤 | Phase CS-2（硬编码 `'opencode'`） |
| `AgentBackendKind` | Conversation.backend 字段类型 | Phase CS-2（硬编码 `'opencode'`） |
| `StreamChunk` | 消息渲染管线（已在用） | 已在用 |
| `toolIdentity source` | Tool 块渲染（新增 source 值） | Phase 2+ |
| `callbackToAsyncGenerator` | 事件到 StreamChunk 的桥接（adapter 内部） | Phase 1a |

## 12. 风险

| 风险 | 缓解 |
|------|------|
| 隐藏 UI 区域导致布局跳动 | 用 CSS 过渡 + placeholder 高度缓存 |
| 旧 Conversation 无 backend 字段 | fallback `'opencode'`，不做数据迁移 |
| 模型选择器切换 backend 后列表为空 | adapter 必须有 `getDefaultModel()` |
| Server status badge 轮询开销 | 改为 `onStatusChange()` 订阅，只在变化时更新 |
| Thinking 块在不同 backend 的差异 | 统一翻译到 `StreamChunk type: 'thinking'`，渲染层不区分 |
| Fork/Revert 在不同 backend 的语义差异 | 不支持的直接隐藏，支持的可按 backend 细分行为 |
