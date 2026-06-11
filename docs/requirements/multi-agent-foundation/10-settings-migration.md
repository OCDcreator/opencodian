# 智能体管理设置迁移 Spec

> **状态**: `[DRAFT]`
> **最后更新**: 2026-06-09（Codex 设置字段和审批策略值修正）
> **前置依赖**: 无（前端先行，Phase 0a 共享 Capability 类型）
> **关联 spec**: `09-chat-surface-migration.md`

## 概述

本文档定义设置界面（Settings Surface）在多智能体环境下的分类法和迁移规则。当前 17 个设置标签中 10 个是 OpenCode-only（另有 Conversation 的 3 个子标签为 OpenCode-only），需要一个清晰的分类和切换机制。

**核心设计**：设置布局不变（一级/二级标签 + 经典平铺），通过**悬浮图标组 + 顶部 Chips** 切换不同智能体的设置内容。

### 术语

- **智能体**（Agent）：用户界面用语，对应代码中的 `AgentBackendKind`。包括 OpenCode、Claude Code、Codex、Copilot、Pi。
- **智能体管理**：设置中的管理入口，用于启用/禁用/配置智能体。

### 阶段编号对照表

| 本 spec (ST) | 08-phased-rollback | README Phase | 说明 |
|-------------|-------------------|--------------|------|
| ST-0 | Phase 0c | Phase 0c | 智能体管理子标签 |
| ST-1 | Phase 0c | Phase 0c | 条件显示（与 ST-0 同阶段） |
| ST-2 | Phase 2b+ | Phase 2+ | 新智能体设置标签（需 adapter 实现） |
| ST-3 | Phase 1c+ | Phase 1c+ | 共享能力适配（需 AgentService） |

## 1. 产品规则

| # | 规则 | 说明 |
|---|------|------|
| R1 | 通用设置中增加智能体管理子标签 | 在现有设置结构中新增一个智能体管理入口，不破坏现有设置页结构 |
| R2 | 启用后才显示 | 用户必须先启用某个智能体，才会显示该智能体的专属设置 |
| R3 | 三层分类法 | 所有设置项分为：宿主级（所有智能体共享）/ 共享能力（多智能体有共同语义）/ 智能体专属 |
| R4 | 现有设置项不删除 | OpenCode 的所有设置项保持原样。不做"迁移"，只做"条件显示" |
| R5 | 全部可禁用 | 所有智能体（包括 OpenCode）都可以禁用。默认全部禁用。 |
| R6 | 悬浮图标组 + 顶部 Chips 双入口切换 | 左侧悬浮图标组和顶部 Chips 同步切换智能体设置内容，两者状态一致 |

## 2. 三层分类法

### 2.1 宿主级设置（Host-Level）

所有 backend 都可见，与具体 agent 无关：

| 设置标签 | 子标签 | 字段 | 说明 |
|---------|--------|------|------|
| **通用 (General)** | basic | settingsLayoutMode, locale, settingsInEditorArea | 插件 UI 偏好 |
| **UI** | general | enableTabs, maxTabs, tabBarPosition, autoScroll, scrollMode | 聊天 UI 布局 |
| **外观 (Style)** | presets, background, layout, user, assistant, input, scrollbar, advanced | 主题、颜色、字体、布局 | 视觉样式 |
| **调试 (Debug)** | general, modules, logs, actions | enableDebugLogging, debugModuleSettings | 调试工具 |
| **用户 (User)** | profile | userName | 用户名 |

### 2.2 共享能力设置（Shared Capability）

多个 backend 有共同语义，但实现可能不同：

| 设置标签 | 子标签 | 字段 | 说明 | 适配方式 |
|---------|--------|------|------|---------|
| **用户 (User)** | prompt, tags | systemPrompt, excludedTags, mediaFolder | 系统 prompt、排除标签 | 所有 backend 都可能用 |
| **安全 (Security)** | config, safety | permissionMode, enableBlocklist, blockedCommands | 权限模式、命令安全 | 概念通用，实现 backend-specific |
| **对话 (Conversation)** | title, display | titleMode, aiTitleModel, chatFontSizePx, renderUserMarkupAsCodeBlocks | 标题生成、显示偏好 | 标题生成走当前 backend |

### 2.3 Backend 专属设置

#### 2.3.1 OpenCode 专属

只在 OpenCode backend 启用时显示：

| 设置标签 | 子标签 | 关键字段 | 说明 |
|---------|--------|---------|------|
| **服务器 (Server)** | connection, auth, status | server.mode, host, port, executablePath, auth | OpenCode 进程管理 |
| **模型 (Model)** | common, project-config, availability, tools | defaultProvider, defaultModel, disabledModelRefs, providers | OpenCode 模型目录 |
| **对话 (Conversation)** | compaction, sharing, questions | compaction config, share mode, questionDisplayMode | OpenCode 特有 |
| **代理 (Agents)** | default, catalog, editor, workspace | agent configs | OpenCode agent 系统 |
| **命令 (Commands)** | mode, editor, catalog | hiddenSlashCommands, commandConfigs | OpenCode slash commands |
| **MCP** | overview | mcpServers | OpenCode MCP 管理 |
| **格式化 (Formatter)** | overview, formatter, lsp | formatters, lspServers | OpenCode formatter/LSP |
| **插件 (Plugin)** | overview, global, project-directory, omo | pluginIsolationMode, disabledPluginSpecs | OpenCode 插件系统 |
| **技能 (Skills)** | project, external | skill configs | OpenCode skill 系统 |
| **工具 (Tools)** | builtin, custom | tool permissions | OpenCode 工具权限 |
| **ACP** | agents | acpAgents | ACP 协议配置 |

#### 2.3.2 其他 Backend 专属（启用后才显示）

每个新 backend 启用后，显示该 backend 的专属设置标签：

**Claude Code 设置**（启用后显示）：
| 字段 | 说明 |
|------|------|
| enabled | 是否启用 |
| authMode | 认证模式（api-key） |
| apiKey | API Key（加密存储） |
| defaultModel | 默认模型 |
| cliPath | CLI 路径（可选，自动检测） |

**Codex 设置**（启用后显示）：
| 字段 | 说明 |
|------|------|
| enabled | 是否启用 |
| apiKey | OpenAI API Key（加密存储） |
| model | 默认模型（如 `o3`） |
| sandboxMode | 沙箱模式（`read-only` / `workspace-write` / `danger-full-access`） |
| modelReasoningEffort | 推理力度（`minimal` / `low` / `medium` / `high` / `xhigh`） |
| additionalDirectories | 附加目录（换行分隔） |
| networkAccessEnabled | 网络访问（boolean，仅 `workspace-write` 模式下生效） |
| webSearchMode | 网页搜索模式（`disabled` / `cached` / `live`） |

> **注意**：`approvalPolicy`（审批策略）目前在 Codex SDK 中被阻止（BLOCKED），因为 SDK 关闭 stdin 后不支持双向审批通道。旧文档引用的 `full-auto / auto-edit / suggest` 值是错误的，实际 SDK enum 为 `ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted"`。此字段暂不暴露给用户。

**Copilot 设置**（启用后显示）：
| 字段 | 说明 |
|------|------|
| enabled | 是否启用 |
| authMode | 认证模式（subscription / byok） |
| providerType | BYOK provider 类型 |
| providerBaseUrl | BYOK endpoint |
| providerApiKey | BYOK API Key（加密存储） |
| defaultModel | 默认模型 |
| cliPath | CLI 路径（可选） |

**Pi 设置**（启用后显示）：
| 字段 | 说明 |
|------|------|
| enabled | 是否启用 |
| provider | LLM 提供商（anthropic / openai / google / ...） |
| apiKey | API Key（加密存储） |
| defaultModel | 默认模型 |

## 3. 智能体管理 UI 设计

### 3.1 概念

设置界面布局不变（一级/二级标签 + 经典平铺），增加两个**智能体切换入口**：
1. **左侧悬浮图标组** — 鼠标靠近时浮现，不占据布局空间
2. **顶部 Chips** — 标题行右侧，每个启用的智能体一个 chip

点击任一入口 → 切换设置内容区显示对应智能体的标签页。

### 3.2 左侧悬浮图标组

```
  设置界面左侧边缘（绝对定位，不占空间）
  ┌──────────────────────┐
  │                 ┌──┐ │
  │                 │🤖│ │  ← OpenCode 图标
  │                 │🔍│ │  ← Claude Code 图标
  │                 │💻│ │  ← Codex 图标
  │                 └──┘ │
  │                      │
  │  设置内容区...        │
  └──────────────────────┘
```

**行为**：
- **默认隐藏**：图标组 opacity: 0，鼠标靠近左侧 80px 范围时浮现（opacity 动画 200ms）
- **入场动画**：图标依次进入，每个延迟 50ms，fade + translateY(-8px) + scale(0.9→1)
- **静态状态**：轻微循环浮动动画（CSS `@keyframes float`），幅度 2-3px，周期 3-4s
- **交互反馈**：
  - Hover: scale(1.1) + translateY(-2px) + box-shadow 增强
  - Active/Click: scale(0.95) → scale(1.05) 短促回弹（150ms）
  - 选中态: 左侧 2px 高亮边框 + 背景色加深

**图标来源**：
- OpenCode: 现有插件图标
- Claude Code: Anthropic logo（或品牌色圆形 + 首字母）
- Codex: OpenAI logo
- Copilot: GitHub Copilot logo
- Pi: Pi 品牌图标

### 3.3 顶部 Chips

```
┌──[OpenCodian]─────── [OpenCode] [Claude Code] ──┐
│                                                  │
│  ┌─ 智能体管理标签页内容...                       │
│  ...
```

**行为**：
- 每个启用的智能体一个 chip（圆角标签）
- 选中的 chip 高亮（品牌色背景）
- 点击切换选中态
- 与左侧图标组状态同步（点击 chip → 图标组对应图标高亮，反之亦然）
- Chips 按 `enabledBackends` 数组顺序排列

### 3.4 智能体管理子标签内容

在"通用"设置标签下的"智能体管理"子标签中：

```
┌─ 智能体管理 ──────────────────────────────────┐
│                                                │
│  默认智能体: [未选择 ▼]                         │
│  (新建会话使用的智能体，需先启用)                │
│                                                │
│  ─── 可用智能体 ───                            │
│                                                │
│  ☐ OpenCode     内置智能体（默认引擎）          │
│  ☐ Claude Code  Anthropic Claude Code SDK      │
│  ☐ Codex        OpenAI Codex CLI               │
│  ☐ Copilot      GitHub Copilot                 │
│  ☐ Pi           Pi Coding Agent                │
│                                                │
│  启用后可在左侧图标或顶部 Chips 切换配置         │
│                                                │
└────────────────────────────────────────────────┘
```

**交互规则**：
1. **启用**：勾选 checkbox → 智能体启用 → 对应图标出现在左侧悬浮组 → chip 出现在顶部
2. **禁用**：取消勾选 → 智能体禁用 → 图标和 chip 消失 → 如果当前正在查看该智能体的设置，自动切回"通用"
3. **默认全部禁用**：首次安装时所有智能体都是禁用状态
4. **全部禁用**：允许全部禁用。此时聊天界面显示空状态引导
5. **默认智能体下拉**：从已启用的智能体中选择，需至少启用一个才能选择

### 3.5 设置内容切换逻辑

```
选中智能体时：
  if (选中的是宿主级视图 / 无选中) → 显示通用设置标签
  if (选中的是 OpenCode) → 显示 OpenCode 的 10 个一级标签（Server/Model/Agents/...）
  if (选中的是 Claude Code) → 显示 Claude Code 的设置标签
  if (选中的是 Codex) → 显示 Codex 的设置标签
  ...

宿主级标签（始终可见，不受智能体选择影响）：
  - 通用（包含智能体管理子标签）
  - 外观 (Style)
  - 调试 (Debug)
  - 用户 (User)
  - UI
  - 安全 (Security)
  - 对话 (Conversation) — 共享能力标签
```

## 4. 设置项条件显示规则

```
渲染设置标签时：
  if (标签是宿主级) → 始终显示
  if (标签是共享能力) → 始终显示，但内容可能因智能体不同
  if (标签是 OpenCode 专属) → 只在 OpenCode 启用且被选中时显示
  if (标签是智能体 X 专属) → 只在智能体 X 启用且被选中时显示

选中逻辑：
  - 点击左侧悬浮图标或顶部 chip → 选中该智能体 → 显示其设置标签
  - 未选中任何智能体 → 只显示宿主级标签
  - 启用的智能体图标/chip 始终可见，只是选中/未选中状态不同
```

### 设置标签的显示逻辑

| 标签 | 显示条件 |
|------|---------|
| General (basic) | 始终 |
| General (backend) | 始终 |
| Server | OpenCode 启用 |
| Model | OpenCode 启用 |
| Conversation | 始终（但子标签 compaction/sharing/questions 只在 OpenCode 启用时显示） |
| Agents | OpenCode 启用 |
| Commands | OpenCode 启用 |
| MCP | OpenCode 启用 |
| Formatter | OpenCode 启用 |
| Plugin | OpenCode 启用 |
| Security | 始终 |
| UI | 始终 |
| Style | 始终 |
| Debug | 始终 |
| User | 始终 |
| Skills | OpenCode 启用 |
| Tools | OpenCode 启用 |
| ACP | OpenCode 启用 |
| Claude Code Settings | Claude Code 启用 |
| Codex Settings | Codex 启用 |
| Copilot Settings | Copilot 启用 |
| Pi Settings | Pi 启用 |

## 5. 数据模型扩展

### 5.1 设置类型扩展

```typescript
// src/core/types/settings.ts — 扩展

export interface OpenCodianSettings {
  // ... 现有字段不变 ...

  /** 多 Backend 管理 */
  activeBackend: AgentBackendKind;          // 当前活跃 backend，默认 'opencode'
  enabledBackends: AgentBackendKind[];       // 已启用的 backend 列表

  /** 各 backend 的配置 */
  claudeCodeAgent: ClaudeCodeAgentSettings;
  codexAgent: CodexAgentSettings;
  copilotAgent: CopilotAgentSettings;
  piAgent: PiAgentSettings;
}
```

### 5.2 默认值和 Normalize

```typescript
const DEFAULT_SETTINGS = {
  activeBackend: undefined,            // 无默认智能体，需用户启用后选择
  enabledBackends: [],                  // 默认全部禁用
  claudeCodeAgent: { enabled: false, authMode: 'api-key', defaultModel: 'claude-sonnet-4-20250514' },
  codexAgent: { enabled: false, model: undefined, sandboxMode: 'workspace-write', modelReasoningEffort: 'medium', webSearchMode: 'cached' },
  copilotAgent: { enabled: false, authMode: 'subscription', defaultModel: 'gpt-4o' },
  piAgent: { enabled: false, provider: 'anthropic', defaultModel: 'claude-sonnet-4-20250514' },
};
```

### 5.3 旧数据兼容

- 旧设置（无 `activeBackend` 字段）：normalize 时设为 `undefined`（未选择）
- 旧设置（无 `enabledBackends` 字段）：normalize 时设为 `['opencode']`（保持旧行为，已使用 OpenCode 的用户不受影响）
- 不做数据迁移，normalize 覆盖即可

## 6. 共享能力设置的 Backend 适配

### 6.1 系统 Prompt（User > prompt）

- 所有 backend 都可能用系统 prompt
- 发送时通过 `ChatSendOptions` 传入
- 各 backend adapter 决定如何传递给 SDK

### 6.2 权限模式（Security）

- 概念通用：yolo / normal / plan / auto / suggest
- 但每个 backend 的映射不同：
  - OpenCode: yolo / normal / plan
  - Claude Code: auto / suggest（通过 allowedTools）
   - Codex: never / on-request / on-failure / untrusted（实际 SDK enum `ApprovalMode`；注意旧文档中的 `full-auto/auto-edit/suggest` 是错误的）
  - Copilot: interactive / auto
- Security 设置显示通用的权限概念，但选项列表根据当前 backend 调整

### 6.3 标题生成（Conversation > title）

- `titleMode` 对所有 backend 生效
- `aiTitleModel` 从当前 backend 的模型列表中选择
- 标题生成请求通过当前 backend adapter 发送

## 7. Phase 计划

> **设计原则**：前端先行。Phase ST-0/ST-1 在只有 OpenCode 的环境下完成，
> 零风险、完全可逆。Phase ST-2/ST-3 需要新智能体 adapter 实现后才能验证。

### Phase ST-0: 智能体管理子标签 [前端先行，无 backend 依赖]

**目标**: 在通用设置中新增智能体管理入口（启用/禁用列表 + 默认选择）

**前置依赖**: 无（只需 `AgentBackendKind` 类型枚举，同 CS-0 共享）

**关键任务**:
1. 扩展 `OpenCodianSettings` 加 `activeBackend` / `enabledBackends`
2. 默认全部禁用（`enabledBackends: []`），旧数据 normalize 为 `['opencode']`
3. 在 General 标签下新增 `智能体管理` 子标签
4. 实现智能体列表 UI（启用/禁用 checkbox）

**验收**: 能看到智能体列表，能启用/禁用，能选择默认智能体

### Phase ST-0.5: 悬浮图标组 + 顶部 Chips [前端先行]

**目标**: 设置界面增加左侧悬浮图标组和顶部 Chips 作为智能体切换入口

**前置依赖**: Phase ST-0

**关键任务**:
1. 创建 `AgentSwitcherFloatingIcons` 组件（绝对定位，鼠标靠近时浮现）
2. 创建 `AgentSwitcherChips` 组件（标题行右侧）
3. 两者状态同步（共享 `selectedAgent` 状态）
4. 入场/悬浮/点击动画（CSS + 少量 JS）
5. 点击切换 → 触发设置内容区刷新

**验收**: 启用 2+ 智能体后，图标和 chips 正确显示，点击切换流畅

### Phase ST-1: 条件显示 [前端先行，无 backend 依赖]

**目标**: 选中的智能体决定显示哪些设置标签

**前置依赖**: Phase ST-0.5

**关键任务**:
1. 设置标签注册改为按选中智能体分组
2. 宿主级标签始终可见
3. 选中 OpenCode → 显示 OpenCode 的 10 个标签 + Conversation 的 3 个子标签
4. 选中 Claude Code → 显示 Claude Code 的设置标签
5. 未选中 → 只显示宿主级标签
6. 活跃标签 fallback：切换智能体后如果当前标签不存在，切回 'general'

### Phase ST-2: 新智能体设置标签 [需 Phase 2+ 新 backend adapter]

**目标**: 启用新智能体后显示其专属设置

**前置依赖**: Phase 2+（新 backend adapter 实现后）

**按智能体优先级**:
1. Claude Code 设置（API key + 默认模型）
2. Copilot 设置（认证 + BYOK）
3. Codex 设置（API key + approval policy）
4. Pi 设置（provider + API key）

### Phase ST-3: 共享能力适配 [需 Phase 1 AgentService]

**目标**: 安全、标题生成等共享设置适配多智能体

**前置依赖**: Phase 1a（OpenCodeAdapter 实现）

**关键任务**:
1. 权限模式选项根据当前智能体动态调整
2. 标题生成模型从当前智能体列表选择
3. Conversation 的 compaction/sharing/questions 子标签只在 OpenCode 时显示

### 与 Foundation Spec Phase 的对接时序

```
Phase ST-0 (智能体管理) ───── 零依赖，和 CS-0 并行
Phase ST-0.5 (图标组+Chips) ─ 零依赖，和 CS-1 并行
Phase ST-1 (条件显示) ─────── 零依赖，和 CS-2 并行
        │
        ▼
Phase 0a (定义接口) ← ST-0/ST-1 的类型和条件逻辑验证了接口设计
Phase 1a (OpenCodeAdapter)
        │
        ▼
Phase ST-2 (新智能体设置) ← 需要新 adapter 实现
Phase ST-3 (共享能力适配) ← 需要 AgentService
```
Phase ST-0 (backend 管理) ───── 零依赖，和 CS-0 并行
Phase ST-1 (条件显示) ───────── 零依赖，和 CS-1 并行
        │
        ▼
Phase 0a (定义接口) ← ST-0/ST-1 的类型和条件逻辑验证了接口设计
Phase 1a (OpenCodeAdapter)
        │
        ▼
Phase ST-2 (新 backend 设置) ← 需要新 adapter 实现
Phase ST-3 (共享能力适配) ← 需要 AgentService
```

## 8. 与其他 Spec 的对接点

| 概念 | 来源 | 设置 surface 消费方式 |
|------|------|---------------------|
| `AgentBackendKind` | foundation spec | `activeBackend` 字段类型 |
| `AgentService.start()/stop()` | foundation spec | 启用/禁用 backend 时调用 |
| `AgentService.listModels()` | foundation spec | 标题生成模型选择 |
| `AgentService.onStatusChange()` | foundation spec | Backend 列表的状态指示 |
| `SurfaceAgent.backend` | foundation spec | 设置条件显示的判断依据 |
| 会话归属过滤 | chat surface spec | `activeBackend` 驱动历史列表 |
| Capability-driven 隐藏 | chat surface spec | 设置中的条件显示和 chat 一致 |

## 9. 风险

| 风险 | 缓解 |
|------|------|
| 设置标签频繁显示/隐藏导致用户困惑 | 首次使用时显示引导提示 |
| 旧数据 normalize 可能破坏现有设置 | 只加字段不删字段，默认值保持现有行为 |
| Backend 启用需要认证，流程中断 | 认证失败不启用，保持之前状态 |
| 太多 backend 设置标签导致标签栏拥挤 | 用分组/折叠，不要平铺所有标签 |
| 共享能力设置的 backend 映射逻辑复杂 | 先做最简单的（直接透传），后续细化 |
