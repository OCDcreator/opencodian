# English Locale

> **源码**: `src/i18n/locales/en.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的英文翻译表，导出 `enTranslations` 静态对象。它为设置面板、聊天界面、调试提示、权限交互以及 Liquid Glass 相关帮助文本提供英文文案，也是整个 i18n 系统的键空间基准。最近几轮先后扩展了会话设置弹窗分组布局相关键、project-scoped compaction notice 键，以及主设置页 conversation section 的二级分组标题/描述键（conversation title、reading/display、question interaction、message rendering）。本轮新增 `settings.server.executablePath.*` 与 `settings.server.help.executablePath.*`，用于说明本地 OpenCode 可执行文件路径覆盖项。

会话设置弹窗本轮还新增了 `chat.sessionSettings.modal.globalDefaultsGroup`、`globalDefaultsDesc` 和 `summary.*` 文案，用于 Display 分组下方的全局默认值摘要行与 “Open settings” 按钮。

本轮新增 `chat.agentSelector.*` 键，供聊天输入框下方的主 Agent 下拉框使用，包括 trigger、轻量列表标题、OpenCode default 选项、default badge、description、loading/empty/load-failed 状态以及选中 tooltip。

最近一轮还重写了 `settings.security.*` 的权限文案：把原先容易误导成“上游原生 mode”的 wording 调整为 **OpenCodian permission template + config summary** 语义，并补齐了 security section 的 restart tooltip / notice keys。

2026-04-24 的本轮还补了一组 `settings.commands.*` / `settings.quickNav.commandsDesc` 文案，把 Commands settings 的心智模型对齐到当前 slash runtime truth：project-only command 只是“已写入项目配置、等待 runtime 暴露”的草稿，skill mode 只改变 `/skill` vs `/skills <skill>` 的入口形态，命令级 `Temperature` / `Top P` 则用 “hidden helper agent” 的 plain-language 语义解释。

同一天的后续 UI 微调还新增了 `settings.agents.editor.group.*` 文案，并把 `settings.agents.catalog.desc` 改成正向可见性语义，明确说明：agent catalog 中的子代理开关现在是 **on = visible in `@` menu / off = hidden**。

当前 A4 agent-surface 收尾又补了一组 `settings.agents.expert.*`、`settings.agents.workspace.*`、`settings.agents.guard.*`、`settings.agents.editor.select.runtimeSection` / `systemBadge` 以及 `settings.agents.tab.workspace` 文案，把 system-agent expert gate、Markdown workspace CRUD / status、runtime-system editor labels 和新的 workspace tab 都放进 locale，而不是继续在 settings owner 中硬编码文本。

2026-04-25 新增 `settings.server.tab.mcp` 和 `settings.server.mcp.*` 系列键，为早期的 `Server > MCP` 设置标签页提供 MCP 服务器概览、状态徽章和刷新操作的英文文案。

同日 M2 继续扩展 `settings.server.mcp.*` 键空间，新增 MCP 操作按钮（connect / disconnect / authenticate / clearAuth）、新增服务器表单（local / remote 类型切换、command / environment / url / headers / OAuth 等字段）、校验错误（nameRequired / nameDuplicate / commandRequired / urlRequired / urlInvalid / timeoutPositive / emptyKey）和操作反馈通知（added / addFailed / actionFailed）对应的英文文案。

2026-04-26 的 MCP settings UI 收口又补了一组 `settings.server.mcp.add.group.*` 和 `settings.server.mcp.add.type` 文案，用于把新增服务器表单重组为 `Basics` / `Connection` / `OAuth` 分组卡片，并把原先直接用标题占位的类型切换改成独立 `Type` 字段标签。随后 MCP management panel 又新增 `action.monitor/edit/delete`、`runtimeSwitch.*`、`ownership.*`、`editor.*`、`details.*`、`delete.confirm` 和 project config mutation notices，用于区分 runtime truth 与 project config truth。

同日 F2 新增 `settings.formatter.*` 和 `settings.quickNav.formatterDesc` 系列键，为 Formatter 一级设置页提供概览（runtime status / summary cards / detected formatter table）、配置（mode switch）和模式切换通知的英文文案。

同日 F3 扩展 `settings.formatter.config.*` 键空间，新增内置格式化器编辑（builtin list / action dropdown / override fields for command/environment/extensions）、自定义格式化器 CRUD（add / save / delete / nameConflict）、高级 JSON 编辑器（format / reload / save / invalidJson）和运行时离线提示对应的英文文案。

2026-04-26 navigation reorg added `settings.mcp.title`, `settings.mcp.tab.overview`, and `settings.quickNav.mcpDesc`, because MCP has been promoted to its own primary settings tab and classic quick-nav entry. `settings.server.tab.*` now only describes the remaining server secondary tabs (connection/auth/status).

本轮新增 `settings.style.input.contextRing.*` 键，为输入区样式设置里的上下文圆环样式下拉框提供英文标签、描述和 `Classic ring` / `Segmented ring` 两个选项。

本轮还新增 `settings.style.input.fontGroup.*` 8 个键，为输入区英文字体 / 中文字体下拉框提供英文分组、标签、描述和默认选项文案。

本轮还新增 `agentMention.menu.*` 系列键（`loading`、`empty`、`noMatches`、`loadFailed`），为 agent mention 自动补全菜单提供独立的状态文案，与 slash command 菜单的 `slashCommand.menu.*` 键分离。

本轮还新增 `slashCommand.sourceBadge.command`，让 chat slash menu 中 runtime-backed 普通命令以 `command` badge 展示；旧的 `runtime` 文案保留给需要表达运行时来源的其他上下文。

本轮新增 `slashCommand.menu.hint`，用于在 slash command 一级补全框顶部提示用户“斜杠命令仅在输入框开头输入时生效”。

2026-05-11 还新增 `chat.tab.backToParent`，用于子会话 tab 激活时的 “Back to parent” 面包屑按钮文案。同日 AskQuestion Dock polish 新增 `chat.question.collapse` 与 `chat.question.expand`，作为 above-input QuestionDock 折叠/展开图标按钮的 aria label。

2026-05-13 新增 `settings.skills.loading` / `settings.skills.count`、`settings.tools.group.*.desc`、`settings.tools.custom.desc`、`settings.acp.customAgent`、`settings.acp.preset.desc` 和 `settings.acp.command.empty`，服务 Skills / Tools / ACP Agents 设置页的分组化布局、空态和命令摘要。随后同日继续扩展 `settings.skills.create.*`、`settings.skills.modal.*`、`settings.skills.validation.*`、`settings.skills.notice.*` 以及 `settings.agents.editor.skillTool.*` / `settings.agents.editor.skillPermission.*`，用于技能 CRUD、Markdown 编辑/预览、官方格式校验、单技能权限和 agent 级 skill 覆盖 UI；其中 validation 文案覆盖 skill name 模式、父目录匹配、允许字段、description 尖括号 / 长度以及 compatibility 长度。随后又新增 `settings.skills.permission.help.*`，用于结果导向地解释 allow / ask / deny、默认权限和单技能覆盖，并链接 OpenCode Skills 官方文档。之后补充 `settings.skills.permission.inheritGlobal`、`settings.skills.permission.desc`、`settings.skills.permission.globalStatus.*`、`settings.skills.itemPermission.inherit`、`settings.skills.itemPermission.desc` 和权限写入后的 restart notice 文案，让 Skills UI 明确区分继承全局、当前全局权限、技能默认加载权限和单技能覆盖，并提示配置写入 `.opencode/opencode.json` 后会重启本地 OpenCode 服务；单技能继承选项使用 “Follow default” / “跟随上方默认”，避免配置术语压过用户理解。随后补充 `settings.skills.delete.confirm`，用于列表行删除当前 vault 内项目技能前的确认，并补充 `settings.skills.source.plugin`，把 OpenCode 插件包 cache 注入的技能显示为 “Plugin Packages”。本轮还补充 `settings.skills.notice.restartFailed`，用于项目技能文件保存/删除/刷新时重启本地 OpenCode 失败的提示；并新增 `settings.skills.tab.project` / `external`、`settings.skills.bulk.*`、`settings.skills.empty.project` / `external`，用于 Skills 设置页的“项目技能 / 外部技能”二级标签、批量权限、项目批量删除和分标签空态；后续布局整理新增 `settings.skills.external.*`，外部技能页保留刷新说明，批量权限下拉改为选择即应用，不再需要 `settings.skills.bulk.apply` 文案。本轮还新增 `settings.tools.custom.authoring.*`、`settings.tools.custom.create.*`、`settings.tools.custom.files.*`、`settings.tools.custom.source.*`、`settings.tools.custom.modal.*`、`settings.tools.custom.validation.*` 和 `settings.tools.custom.notice.*`，用于自定义工具文件 authoring：项目 `.opencode/tools` 新建/编辑/删除、全局 tools 只读展示、OpenCode 文档入口、源码校验和保存/删除通知。随后补充 `settings.tools.default.*`、`settings.tools.permission.inherit`、`settings.tools.custom.notice.restartFailed` 和工具权限 restart notice 文案，用于解释 `permission["*"]` 全局默认、OpenCode 默认值、单工具 Follow default / override 关系，以及权限或工具文件写入后本地服务自动重启。

源码约 2050 行。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const enTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': 'Use OpenCode AI assistant in Obsidian',
  'settings.server.title': 'Server',
  'settings.server.mode.name': 'Connection mode',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 英文基准键空间

该文件提供所有翻译键的英文实现。`src/i18n/index.ts` 会以英文表作为：
1. 类型推导来源（`TranslationKey = keyof typeof enTranslations`）
2. 最终回退来源（当前语言缺失时回退到英文）

因此它实际上承担"默认键集"的角色。

### 覆盖范围

当前键空间覆盖：

- 插件基础信息（`plugin.*`）
- 设置页各分组（`settings.server.*`, `settings.model.*`, `settings.style.*` 等）
- 会话与聊天交互（`chat.input.*`, `chat.context.*`, `chat.tab.*`, `chat.sessionSettings.*` 等）
- composer 主 Agent selector（`chat.agentSelector.*`）
- child-session tree UI（`chat.childSessionTree.*`）
- 权限 / question / 调试提示
- 主题与 Liquid Glass 参数说明（大量 `settings.style.input.liquidGlass.*` 键）
- 会话设置保存结果提示（`chat.sessionSettings.saved*`，区分普通保存、deferred backend apply 和 runtime reapply warning）

### 帮助文本

包含大量解释型长文本，如：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  'This is the main "glass strength" slider. Higher bends the background more; lower looks calmer...',
```

这些键以 `.help.` 为前缀，用于设置面板的"用大白话解释"功能。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `enTranslations` | 英文静态翻译表对象 |

## 数据流

不适用。该模块没有运行时流程；典型消费链路为 `t(key)` → 查英文表 → 返回文案或作为回退。

```
t('settings.server.started')
  → translations.en['settings.server.started']  // 英文值
  → 或 translations.zh[key]  // 如果当前是中文
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用作默认回退语言和 `TranslationKey` 推导来源

## 配置项

无。

## 键前缀统计

| 前缀 | 用途 |
|------|------|
| `plugin.*` | 插件基本信息 |
| `settings.server.*` | 服务器设置 |
| `settings.model.*` | 模型设置 |
| `settings.conversation.*` | 对话设置 |
| `settings.security.*` | 安全设置 |
| `settings.ui.*` | UI 设置 |
| `settings.style.*` | 样式设置（含大量 Liquid Glass 帮助文本） |
| `settings.debug.*` | 调试设置（含 module toggles、refresh interval、诊断动作与 console help） |
| `settings.user.*` | 用户设置 |
| `settings.plugins.*` | 插件管理 |
| `settings.quickNav.*` | 快速导航 |
| `chat.*` | 聊天界面 |
| `agentMention.menu.*` | Agent mention 自动补全菜单状态文案 |

## 注意事项

- 新增翻译键时，英文表与中文表必须同步保持键名一致
- 如果某个键只出现在中文表、不出现在英文表，类型安全和回退逻辑都会变差
- 帮助文本（`.help.` 键）通常为多行长文本，使用 `\n` 换行
- 参数插值占位符使用 `{paramName}` 格式
- 本文件是 i18n 类型安全的基础，修改需谨慎

## Liquid Glass 帮助键

以下键专门服务于 Liquid Glass 设置帮助系统：
- `settings.style.input.liquidGlass.shuding.*.desc` — 参数描述
- `settings.style.input.liquidGlass.shuding.help.*` — 详细帮助
- `settings.style.input.liquidGlass.nikdelvin.*.desc`
- `settings.style.input.liquidGlass.shudingDiamond.*.desc`
- `settings.style.input.help.*` — 通用帮助

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. Locale keys for `autoCompactionEnabled` and `compactionReservedTokens` per-session overrides have been removed; new project-scoped compaction keys were added under `settings.conversation.compaction.*`.
3. Manual `session.summarize()` remains a per-session action, not managed by compaction locale keys.

## 2026-05-09 Session settings global defaults summary

The per-conversation session settings modal now displays read-only global-default summary rows. Locale additions under `chat.sessionSettings.modal`:

1. `globalDefaultsGroup`
2. `globalDefaultsDesc`
3. `summary.titleGeneration`
4. `summary.compaction`
5. `summary.projectLevel`
6. `summary.questions`
7. `summary.showAnswered`
8. `summary.hideAnswered`
9. `summary.rendering`
10. `summary.on`
11. `summary.off`
12. `summary.openSettings`

## 2026-04-23 Conversation settings grouping

The main settings conversation section now uses nested blocks. Locale additions:
1. `settings.titleGeneration.groupDesc`
2. `settings.conversation.display.*`
3. `settings.conversation.questions.*`
4. `settings.conversation.rendering.*`

## 2026-05-14 Title generation wording

Title-generation labels now use user-facing names: "First message title" and "Smart title generation". The setting copy explains that smart generation waits for OpenCode first and only uses the backup model if OpenCode does not produce a title.

Additional session-settings summary copy explains the inherited title mode inside the per-conversation settings modal:
1. `chat.sessionSettings.modal.summary.titleGeneration.firstMessageDesc`
2. `chat.sessionSettings.modal.summary.titleGeneration.smartDesc`

## 2026-04-23 Conversation compaction help modal

The conversation settings "project compaction" block now supports per-field help modals. Locale additions:
1. `settings.conversation.compaction.help.openDoc`
2. `settings.conversation.compaction.help.{whatItMeans|opencodeDefault|adjustmentEffect|moreNotes|tipsLabel}`
3. `settings.conversation.compaction.help.{auto|prune|tailTurns|preserveRecentTokens|reserved}.*`

## 2026-04-24 Settings dual-layout locale keys

New keys added for the tabbed settings layout:

- `settings.layoutMode.*` — layout mode dropdown labels (classic/tabbed)
- `settings.general.*` — General primary tab title, Basic/Language secondary labels, and classic-mode subgroup copy
- `settings.model.availability.desc` — now carries the old toggle-persistence explanation too, so the model availability header uses one merged sentence instead of two stacked descriptions
- `settings.language.tab.*` — language tab labels
- `settings.server.tab.*` — server secondary tab labels (connection/auth/status)
- `settings.model.tab.*` — model secondary tab labels (common/projectConfig/availability/tools)
- `settings.conversation.tab.*` — conversation secondary tab labels (title/compaction/display/questions/rendering)
- `settings.agents.tab.*` — agents secondary tab labels (default/catalog/editor/workspace)
- `settings.commands.tab.*` — commands secondary tab labels (mode/editor/catalog)
- `settings.plugins.tab.*` — plugins secondary tab labels (overview/global/projectDirectory/omo)
- `settings.security.tab.*` — security secondary tab labels (config/permissions/safety)
- `settings.ui.tab.*` — UI secondary tab labels (general)
- `settings.style.tab.*` — style secondary tab labels (presets/background/layout/user/assistant/input/scrollbar/advanced)
- `settings.debug.tab.*` — debug secondary tab labels (general/modules/logs/actions)

## 2026-05-14 Model disclosure keys

- `settings.model.smallModel.*` — Common-tab OpenCode `small_model` picker labels and empty state
- `settings.model.visualEditor.structuredOptions*` — structured common `models.<id>.options` controls before the raw key/value editor
- `settings.user.tab.*` — user secondary tab labels (profile/prompt/tags)
