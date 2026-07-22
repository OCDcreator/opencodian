# settingsLayoutRegistry

> **源码**: `src/features/settings/settingsLayoutRegistry.ts`
> **状态**: [REVIEW]

## 概述

`settingsLayoutRegistry.ts` 定义设置页多级标签分类模式的标签结构。它是一个纯数据 registry，不包含任何设置保存逻辑，但现在也负责把旧的 `language` 一级标签记忆兼容到新的 `general`，并维护二级标签 legacy id 映射，避免用户停留在已重组的设置页时落到空白或错误默认页。

registry 里的 `backendRequired` 是设置 surface 的后端边界声明：OpenCode 专属 tab 只在当前 active backend 是 `opencode` 时出现，Claude Code 专属 tab 只在 active backend 是 `claude-code` 时出现，Codex 专属 tab 只在 active backend 是 `codex` 时出现。不要把 `enabledBackends` 里的存在性当作展示条件，否则会把另一个后端尚未接入的能力泄漏到当前 UI。

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
| `claude-code` | `runtime`, `model-thinking`, `permissions`, `context-sources`, `tools` |
| `codex` | `connection`, `resume-inspect`, `account` |
| `server` | `connection`, `auth`, `status` |
| `model` | `common`, `project-config`, `availability`, `tools` |
| `conversation` | `display`, `title`, plus OpenCode-only `compaction`, `sharing`, `questions` |
| `agents` | `default`, `catalog`, `editor`, `workspace` |
| `commands` | `mode`, `editor`, `catalog` |
| `mcp` | `overview` |
| `formatter` | `overview`, `formatter`, `lsp` |
| `plugins` | `overview`, `config-sources`, `project-plugins`, `omo` |
| `security` | `config`, `permissions`, `safety` |
| `ui` | `general` |
| `style` | `presets`, `background`, `layout`, `user`, `assistant`, `input`, `scrollbar`, `advanced` |
| `debug` | `plugin`, `opencode`, `claude-code`, `export`, `capability-lab` |
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

Claude Code 的二级标签拆成 `runtime`、`model-thinking`、`permissions`、`context-sources`、`tools`，分别承载运行时/环境变量、模型与思考配置及轮数/预算限制、权限模式、上下文来源与额外目录、工具 allow/block。旧的 `mcp-advanced` 二级标签会迁移到 `tools`，旧的 `limits` 二级标签会迁移到 `model-thinking`，旧的 `sdk-foundations` 已移除（实验性/诊断性控制移至 Capability Lab）；避免用户停留在已移除标签时回到空白或默认页；新增或移除二级标签时需要同步 `SettingsClaudeCodeSection.renderTabContent()` 与 locale key。

Codex 的二级标签拆成 `connection`（连接来源摘要与运行时默认值）、`resume-inspect`（会话恢复与后端实时回读）、`account`（账号身份、用量、速率限制与 provider 能力）。新增或移除二级标签时需要同步 `SettingsCodexSection.renderTabContent()` 与 locale key。

Conversation 的默认二级标签是 `display`，因为聊天字号和用户消息渲染属于后端无关的显示设置。`title` 二级标签对所有后端可见，因为标题设置块内部已根据 active backend 做自适应（OpenCode 时展示模式与模型选择器，Claude Code 时展示 `autoTitle` 开关），因此不再标记 `backendRequired: 'opencode'`。`compaction`、`sharing`、`questions` 仍依赖 OpenCode SDK / `.opencode/opencode.json` / OpenCode session API，继续标记为 `backendRequired: 'opencode'`，直到对应 Claude Code 能力真实接入。

Debug 的默认二级标签是 `plugin`，因为总开关和插件内部模块开关是最通用入口。旧的 `debug/general`、`debug/modules` 会迁移到 `plugin`，旧的 `debug/logs`、`debug/actions` 会迁移到 `export`；`opencode` 与 `claude-code` 是新的来源分区，分别承载 OpenCode 后端诊断和 Claude Code SDK 诊断。`capability-lab` 是诊断/实验面板，提供 SDK 能力矩阵、JSONL 历史浏览器、子代理浏览器、rewind dry-run 预览、结构化输出实验场和发现状态，均标记为 ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。

Plugins 的二级标签 `overview` / `config-sources` / `project-plugins` / `omo` 在 2026-07-21 重命名：旧的 `global` 会迁移到 `config-sources`（新的"配置来源"页同时展示全局与项目配置来源，并通过 segmented filter 按 scope 收窄，避免旧标签与实际渲染范围语义不一致）；旧的 `project-directory` 会迁移到 `project-plugins`（聚焦项目本地插件文件，与配置来源分离）。新增或移除二级标签时需要同步 `SettingsPluginSection.attachTabbed()` 与 locale key。
