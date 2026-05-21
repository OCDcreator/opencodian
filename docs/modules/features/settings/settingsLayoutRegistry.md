# settingsLayoutRegistry

> **源码**: `src/features/settings/settingsLayoutRegistry.ts`
> **状态**: [REVIEW]

## 概述

`settingsLayoutRegistry.ts` 定义设置页多级标签分类模式的标签结构。它是一个纯数据 registry，不包含任何设置保存逻辑，但现在也负责把旧的 `language` 一级标签记忆兼容到新的 `general`，并把旧的 `Server > MCP` 停留位置迁移到新的一级 `MCP` 类目。

registry 里的 `backendRequired` 是设置 surface 的后端边界声明：OpenCode 专属 tab 只在当前 active backend 是 `opencode` 时出现，Claude Code 专属 tab 只在 active backend 是 `claude-code` 时出现。不要把 `enabledBackends` 里的存在性当作展示条件，否则会把另一个后端尚未接入的能力泄漏到当前 UI。

## 主要定义

- `SettingsPrimaryTab`: 一级标签定义，包含 id、labelKey、icon、defaultSecondaryTabId，可选 `backendRequired`
- `SettingsSecondaryTab`: 二级标签定义，包含 id、labelKey，可选 `backendRequired`
- `SettingsPrimaryTabDefinition`: 完整的一级标签定义，包含 secondaryTabs 数组
- `SETTINGS_PRIMARY_TABS`: 所有一级标签及其二级标签的静态配置数组

## 一级/二级标签结构

当前涵盖 18 个一级标签：

| 一级标签 | 二级标签 |
|---------|---------|
| `general` | `basic`, `backend` |
| `claude-code` | `runtime`, `model-thinking`, `permissions`, `context-sources`, `mcp-advanced` |
| `server` | `connection`, `auth`, `status` |
| `model` | `common`, `project-config`, `availability`, `tools` |
| `conversation` | `display`, plus OpenCode-only `title`, `compaction`, `sharing`, `questions` |
| `agents` | `default`, `catalog`, `editor`, `workspace` |
| `commands` | `mode`, `editor`, `catalog` |
| `mcp` | `overview` |
| `formatter` | `overview`, `formatter`, `lsp` |
| `plugins` | `overview`, `global`, `project-directory`, `omo` |
| `security` | `config`, `permissions`, `safety` |
| `ui` | `general` |
| `style` | `presets`, `background`, `layout`, `user`, `assistant`, `input`, `scrollbar`, `advanced` |
| `debug` | `general`, `modules`, `logs`, `actions` |
| `user` | `profile`, `prompt`, `tags` |
| `skills` | `project`, `external` |
| `tools` | `builtin`, `custom` |
| `acp` | `agents` |

## 查找与回退函数

- `getPrimaryTabDefinition(id)`: 按 id 查找一级标签定义，并兼容旧 `language -> general`
- `resolvePrimaryTabId(candidate)`: 校验一级标签 id，旧 `language` 会迁移为 `general`，其余失效值回退到第一个主标签
- `resolveSecondaryTabId(primaryTabId, candidate)`: 校验二级标签 id，失效时回退到该一级标签的默认值
- `getActiveSecondaryTabId(primaryTabId, secondaryTabByPrimary)`: 从持久化记录恢复二级标签；当 `general` 没有新记录但发现旧 `language` 记录时，会把它解释成 `General > Language`

## 模式集成

`settingsLayoutMode` 为 `'classic'` 时不使用本 registry。为 `'tabbed'` 时，`SettingsTabbedRenderer` 读取本 registry 构建标签栏并路由内容面板。带 `backendRequired` 的标签只在对应 backend 是当前 `activeBackend` 时显示，而不是只要该 backend 出现在 `enabledBackends` 就显示。OpenCode 专属标签因此不会在 Claude Code active 时露出，`claude-code` 标签也不会在 OpenCode active 时露出。

Claude Code 的二级标签现在拆成 `runtime`、`model-thinking`、`permissions`、`context-sources`、`mcp-advanced`，分别承载运行时诊断、模型与思考配置、权限模式、上下文来源与额外目录设置、以及 MCP/Advanced SDK options；新增二级标签时需要同步 `SettingsClaudeCodeSection.renderTabContent()` 与 locale key。

Conversation 的默认二级标签是 `display`，因为聊天字号和用户消息渲染属于后端无关的显示设置；`title`、`compaction`、`sharing`、`questions` 目前都依赖 OpenCode SDK / `.opencode/opencode.json` / OpenCode session API，必须继续标记为 `backendRequired: 'opencode'`，直到对应 Claude Code 能力真实接入。
