# OpenCode Agent Surface Mapping Design

## Goal

在 OpenCodian 内一次性完整映射 OpenCode 已有的 agent / session / subagent surface，让用户在 Obsidian 内能够：

- 显式选择主 agent 发起普通聊天
- 在普通聊天中显式点名 `@subagent` 与插入 subtask
- 查看与追踪 task 对应的 child session 树
- 完整管理 project config agents
- 完整管理 Markdown agents（创建 / 编辑 / 删除 / 同步）
- 查看内置系统 agent，并在专家模式下做 project override

本设计只完成 **A 层能力映射**。不引入 OpenCodian 自有 orchestrator、board、agent fleet 或跨 agent 调度协议。

## Chosen Approach

采用 **Agent Surface Layer** 中间层方案：

- 以 OpenCode runtime、project config、Markdown agent files 为三类真相源
- 在插件内建立统一的 catalog / invocation / child-session / file-workspace / system-guard owner
- 由这层向聊天入口、设置页、Markdown workspace、child session UI 暴露统一模型
- 保持 **严格原生映射**：不发明插件私有 agent 语义，不做插件层 fallback，不做高风险二次确认流

## Why This Approach

- 能完整映射 OpenCode 现有 surface，而不是只补几个 UI 开口
- 避免继续把 `OpenCodianView` 与现有 settings owners 做胖
- 让 runtime truth、config truth、file truth 在插件内有明确边界
- 为未来 B 层（board / orchestration）预留可复用的基础 owner，但本次不提前引入其产品语义

## Scope

### In Scope

- 普通聊天入口的主 agent picker
- 普通聊天中的 `@subagent` 点名与 subtask 插入
- prompt / command / shell 的 agent 调用映射统一化
- child session 图与 task → child session 追踪
- project `agent.<id>` 完整编辑
- `.opencode/agent(s)`、`agent(s)` Markdown agents 的完整 CRUD
- 内置系统 agent 的显式展示、风险标记、专家模式 override
- catalog 统一视图、来源标记、同步状态标记
- 对应测试、模块文档、必要的 Test Vault 验证

### Out of Scope

- 新增 OpenCodian 自有多 agent board
- 新增插件专属 orchestrator / dispatcher / queue
- 重新设计 OpenCode backend agent 语义
- 改造 OpenCode 的 task / subtask / child session 协议
- 做跨仓库 / 跨项目 / 跨 provider 的 agent fleet 管理

## Product Principles

- **Strict native mapping**：插件只映射 OpenCode 原生能力，不改写语义
- **Truth by layer**：runtime / config / file 三层真相分别可见
- **No fake success**：保存成功、runtime 已刷新、catalog 已可见必须分开表达
- **System agents are visible**：系统 agent 默认可查看，并明确标注为内置
- **Expert mode gates risk**：系统 agent 默认不可 override，需显式开启专家模式

## Architecture

### Truth Sources

- **Runtime truth**
  - `app.agents()`
  - `session.prompt() / promptAsync() / command() / shell()`
  - `task` tool metadata
  - `session.children()`
- **Config truth**
  - `.opencode/opencode.json`
  - `default_agent`
  - `agent`
  - `command`
- **File truth**
  - `.opencode/agent/`
  - `.opencode/agents/`
  - `agent/`
  - `agents/`

### New Agent Surface Layer Owners

#### 1. `AgentCatalogService`

统一产出 `SurfaceAgent[]`。

职责：

- 合并 runtime agents、config agents、Markdown agent file scan 结果
- 标记来源、模式、系统属性、hidden / disabled / default eligibility
- 区分 builtin、builtin+override、markdown、config-only、system
- 提供聊天入口、Agent Studio、command editor 可复用的 agent catalog

#### 2. `AgentInvocationService`

统一承接“用户意图 → OpenCode 原生调用”的翻译。

职责：

- 普通 prompt 的主 agent 参数注入
- `@subagent` 与 subtask parts 的原生映射
- slash command 与 shell / command agent 参数归口
- 保留原请求意图与原生错误，不做 fallback

#### 3. `ChildSessionGraphService`

统一维护父会话、task、child session 的关系图。

职责：

- 从 task metadata 的 `sessionId` 与消息内容块恢复 child edges
- 结合 `session.children()` 做图补全
- 持久化并恢复当前会话的 child session 结构
- 对 UI 提供完整图或 `partial graph` 退化结果

#### 4. `MarkdownAgentWorkspaceService`

统一管理 Markdown agent 文件真相。

职责：

- 扫描、创建、编辑、删除 Markdown agent 文件
- 解析 frontmatter 与 prompt body
- 检测 parse error、重复 ID、来源冲突
- 保存后触发 runtime / catalog refresh
- 明确区分“已写文件”和“已进入 runtime”

#### 5. `SystemAgentGuardService`

专门处理内置系统 agent 的风险边界。

职责：

- 识别 `title` / `summary` / `compaction` 等内置系统 agent
- 给 catalog 与编辑器注入系统标记与风险文案
- 控制专家模式开启前的只读行为
- 开启专家模式后允许 project override，但继续保留高风险提示

## User-Facing Surfaces

### Agent Console Chat

普通聊天入口升级为强显式控制台，但仍保持默认直接发消息体验。

包含：

- 主 agent picker
- 输入区内 `@subagent` 点名
- subtask 插入 / 检查入口
- 当前回合对应的 child session tree
- task 卡片与子会话跳转

行为：

- 主 agent picker 只显示 `primary` / `all` 且未被禁用的 agents
- `@subagent` picker 只显示当前可见的 subagent / all agents
- subtask 与 `@subagent` 都按原生语义直通到 OpenCode
- runtime 拒绝时原样展示错误，不自动切换为普通 prompt

### Agent Studio

统一承载配置与文件工作流。

主要分区：

- **Catalog**
  - 统一看所有 agent
  - 展示来源、模式、系统属性、运行态可见性、override 状态
- **Config Agents**
  - 编辑 `.opencode/opencode.json` `agent.<id>`
- **Markdown Agents**
  - 完整 CRUD `.opencode/agent(s)`、`agent(s)` 下的 agent 文件
- **System Agents**
  - 单独列出内置系统 agent
  - 默认只读
  - 专家模式后允许 project override
- **Command ↔ Agent linkage**
  - 继续保留 `command.agent` / `command.subtask`
  - 与 catalog 联动，避免 agent 关系只存在于命令表单

## System Agent Rules

- 系统 agent 必须在 catalog 中可见
- UI 标签明确为 `Built-in System Agent`
- 默认显示：
  - 用途
  - 来源
  - effective config
  - 是否存在 project override
- 专家模式关闭时：
  - 允许查看
  - 不允许 project override
- 专家模式开启时：
  - 允许 project override
  - 但继续强调这是 project 层覆盖，不是修改 builtin 定义本体

## Data Model

### `SurfaceAgent`

建议字段：

- `id`
- `displayName`
- `description`
- `mode`
- `source`
- `originPath?`
- `hidden`
- `disabled`
- `system`
- `runtimeAvailable`
- `projectOverride`
- `defaultEligible`
- `subagentVisible`
- `effectiveConfig`
- `rawConfigRefs`

这是 catalog、主 agent picker、`@subagent` picker、command editor 的共同语言。

### `SurfaceAgentFile`

建议字段：

- `path`
- `scope`
- `agentId`
- `frontmatter`
- `promptBody`
- `parseStatus`
- `lastSavedAt`
- `runtimeSeen`

用于表达 Markdown agent 文件层状态。

### `SurfaceInvocationIntent`

建议字段：

- `kind`
- `primaryAgent`
- `mentions[]`
- `subtasks[]`
- `modelSelection`
- `sourceMessageId?`

用于描述一次用户发送的显式调用意图。

### `ChildSessionEdge`

建议字段：

- `parentSessionId`
- `parentMessageId`
- `toolCallId?`
- `childSessionId`
- `subagentId?`
- `launchMode`
- `status`
- `title`
- `lastUpdatedAt`

用于构建当前会话的 child session 图。

## Synchronization Flows

### 1. Catalog aggregation

- runtime `app.agents()` + config agent map + Markdown file scan
- 汇总进入 `AgentCatalogService`
- 输出 `SurfaceAgent[]`
- settings 改动、文件改动、server restart 后全部触发重算

### 2. Markdown file → runtime

- 用户保存 Markdown agent 文件
- `MarkdownAgentWorkspaceService` 先写文件
- 再触发 runtime refresh / catalog invalidation
- UI 单独表达：
  - `Saved to file`
  - `Visible in runtime`
  - `Runtime pending refresh`

### 3. Chat invocation

- UI 先生成 `SurfaceInvocationIntent`
- `AgentInvocationService` 再将其翻译成：
  - prompt 级 `agent`
  - 原生 `AgentPartInput`
  - 原生 `SubtaskPartInput`
  - 或 command / shell 参数

### 4. Child session tracking

- 流式 task metadata
- 持久化后的 tool content blocks
- `session.children()` 查询结果
- 汇总进入 `ChildSessionGraphService`

### 5. System guard injection

- `SystemAgentGuardService` 只注入风险与编辑性元数据
- 最终写 override 仍走统一 config / file 更新链路

## Error Handling And Risk Boundaries

### Runtime / file / config divergence

UI 必须显式区分：

- `Saved to file`
- `Saved to project config`
- `Visible in runtime`
- `Runtime pending refresh`

不允许把多层状态硬合并为单一“成功”。

### Native invocation failure

当 `@subagent` 或 subtask 被 runtime 拒绝时：

- 保留原请求意图
- 原样展示 runtime 错误
- 只提示可能原因：
  - mode 不允许
  - `permission.task` 不允许
  - subagent 不可见
  - runtime catalog 过期

不做 fallback。

### Markdown parse / conflict errors

需要显式可见的状态：

- `Parse error`
- `Duplicate ID`
- `Overrides runtime agent`
- `Shadowed by project config`

### Child graph degradation

当 metadata 不足时：

- 至少保留 task 卡片跳转
- child session 区标记 `partial graph`

## UX Details

### Main agent picker

- 位置：普通聊天输入区上方或同一控制条内
- 数据源：`SurfaceAgent[]`
- 只展示 `primary` / `all`、非 disabled、default-eligible agents
- 切换后，后续普通 prompt 默认带该 agent

### `@subagent` mention

- 输入时弹出 picker
- 数据源：`SurfaceAgent[]`
- 只展示可见 subagents / all agents
- 发送时映射到原生 request parts，不使用插件私有语法存档

### Subtask insertion

- 用户可显式把一段输入标记为 subtask
- 与 `@subagent` 一样走原生 part 语义

### Child session tree

显示：

- 直接子会话
- 当前状态
- 最近摘要 / 标题
- 打开入口
- 与来源 task / subagent 的关联

这仍然是会话内浏览，不是 board。

## Files Expected

### New owners

- `src/core/agents/AgentCatalogService.ts`
- `src/core/agents/AgentInvocationService.ts`
- `src/core/agents/ChildSessionGraphService.ts`
- `src/core/agents/MarkdownAgentWorkspaceService.ts`
- `src/core/agents/SystemAgentGuardService.ts`
- `src/core/agents/types.ts`

### Existing areas expected to change

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/services/SlashCommandExecutionService.ts`
- `src/features/chat/...` owners around input/composer/runtime
- `src/features/settings/SettingsAgentsSection.ts`
- `src/features/settings/SettingsProjectAgentEditor.ts`
- `src/features/settings/SettingsCommandsSection.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodePromptRequestBuilder.ts`
- `src/core/opencode/OpenCodeContextPartSerializer.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `src/core/config/commandScopedAgent.ts`
- `src/core/config/slashCommandCatalog.ts`
- `src/core/types/chat.ts`
- `src/core/types/opencodeConfig.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- matching `docs/modules/**`

## Verification

### Targeted verification

- Catalog aggregation tests
  - builtin
  - builtin + override
  - markdown-only
  - config-only
  - system agent
- Prompt invocation tests
  - 主 agent 选择
  - `@subagent`
  - subtask
  - runtime reject path
- Slash / command regression
  - `command.agent`
  - `command.subtask`
  - command-scoped hidden agent
- Markdown workspace CRUD
  - create / edit / delete
  - parse errors
  - duplicate IDs
  - runtime pending / synced states
- Child session graph
  - task → child session
  - reload after persistence
  - partial graph fallback
- System agent guard
  - default read-only
  - expert mode override enabled

### Required gates

- Focused Jest for touched owners
- `npm run verify`
- 如果触及 deploy-relevant runtime path：`npm run build` → Test Vault deploy → `BUILD_ID` 校验

## Success Criteria

只有在以下条件同时满足时，才算 “OpenCode agent surface 完整映射完成”：

- 普通聊天可以显式选择主 agent
- 普通聊天可以显式点名 subagent 与发送 subtask
- child session 树可以在会话内恢复与跳转
- project config agents 可完整管理
- Markdown agents 可完整 CRUD 并体现同步状态
- 系统 agent 可见、明确标注、专家模式后可 override
- 相关回归测试与 `npm run verify` 全绿
