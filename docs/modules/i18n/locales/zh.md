# Chinese Locale

> **源码**: `src/i18n/locales/zh.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的简体中文翻译表，导出 `zhTranslations` 静态对象。它覆盖插件设置、聊天交互、状态提示、帮助说明和 Liquid Glass 参数解释，是中文界面的主要文案来源。最近几轮先后扩展了会话设置弹窗分组布局相关键、项目级 compaction/share notice 键，以及主设置页 conversation section 的二级分组标题/描述键（会话标题、上下文压缩、会话分享、阅读与显示、提问交互、消息渲染）。本轮新增/扩展 `chat.sessionSharing.*` 与 `settings.conversation.share.sharedSessions.*` / `settings.conversation.share.diagnostics.*`，用于当前会话分享状态、分享禁用提示、分享失败归一化说明、分享诊断、已分享会话列表、公开数量、刷新、完整预览、复制链接和取消分享操作；同时保留 `settings.conversation.share.help.*`、`settings.security.blockedCommands.help.*` 与 `settings.projectConfigHelp.*`，用于会话分享模式和 `permission.bash` 帮助弹窗。

会话设置弹窗本轮还新增了 `chat.sessionSettings.modal.globalDefaultsGroup`、`globalDefaultsDesc` 和 `summary.*` 文案，用于 Display 分组下方的全局默认值摘要行与“打开设置”按钮。

本轮新增 `chat.agentSelector.*` 键，供聊天输入框下方的主 Agent 下拉框使用，包括 trigger、轻量列表标题、OpenCode 默认值选项、default badge、description、加载/空态/失败状态以及选中 tooltip。

最近一轮还重写了 `settings.security.*` 相关文案：把原先容易让人误以为是上游原生“权限模式”的 wording，改成 **OpenCodian 权限模板 + 配置摘要** 语义，并补齐了 security section 的重启 tooltip / notice 键。

2026-04-24 的这一轮还补了一组 `settings.commands.*` / `settings.quickNav.commandsDesc` 文案，把 Commands settings 的说法对齐到当前 slash runtime truth：仅项目配置的 command 只是“已写入项目配置、等待 runtime 暴露”的草稿，skill mode 只改变 `/skill` 与 `/skills <skill>` 的入口形态，而命令级 `Temperature` / `Top P` 则用“隐藏辅助代理”的大白话来解释背后的实现。

同一天的后续 UI 微调还新增了 `settings.agents.editor.group.*` 文案，并把 `settings.agents.catalog.desc` 改成正向可见性语义，明确说明 agent catalog 中的子代理开关现在是 **开 = 在 `@` 菜单显示 / 关 = 隐藏**。

当前 A4 agent-surface 收尾还补了一组 `settings.agents.expert.*`、`settings.agents.workspace.*`、`settings.agents.guard.*`、`settings.agents.editor.select.runtimeSection` / `systemBadge` 以及 `settings.agents.tab.workspace` 文案，把 system-agent 专家模式、Markdown workspace CRUD / 状态、runtime/system editor 标签与新的 workspace 二级标签都收进 locale，避免继续在 settings owner 中硬编码用户可见文本。

2026-04-25 新增 `settings.server.tab.mcp` 和 `settings.server.mcp.*` 系列键，为早期 `Server > MCP` 设置标签页提供 MCP 服务器概览、状态徽章和刷新操作的中文文案。

同日 M2 继续扩展 `settings.server.mcp.*` 键空间，新增 MCP 操作按钮（连接 / 断开 / 认证 / 清除认证）、新增服务器表单（本地 / 远程类型切换、命令 / 环境变量 / URL / 请求头 / OAuth 等字段）、校验错误（nameRequired / nameDuplicate / commandRequired / urlRequired / urlInvalid / timeoutPositive / emptyKey）和操作反馈通知（added / addFailed / actionFailed）对应的中文文案。

2026-04-26 的 MCP 设置页布局收口又补了一组 `settings.server.mcp.add.group.*` 和 `settings.server.mcp.add.type` 文案，用于把新增服务器表单整理成 `基础信息` / `连接配置` / `OAuth` 分组卡片，并把原先直接借标题承载的类型切换改成独立 `类型` 字段标签。随后 MCP management panel 又新增 `action.monitor/edit/delete`、`runtimeSwitch.*`、`ownership.*`、`editor.*`、`details.*`、`delete.confirm` 和项目配置增删改通知，用于明确区分运行时真相与项目配置真相。

同日 F2 新增 `settings.formatter.*` 和 `settings.quickNav.formatterDesc` 系列键，为 Formatter 一级设置页提供概览（runtime status / summary cards / detected formatter table）、配置（mode switch）和模式切换通知的中文文案。

同日 F3 扩展 `settings.formatter.config.*` 键空间，新增内置格式化器编辑（builtin list / action dropdown / override fields for command/environment/extensions）、自定义格式化器 CRUD（add / save / delete / nameConflict）、高级 JSON 编辑器（format / reload / save / invalidJson）和运行时离线提示对应的中文文案。

2026-04-26 的导航重组又新增了 `settings.mcp.title`、`settings.mcp.tab.overview` 和 `settings.quickNav.mcpDesc`，因为 MCP 已提升为独立一级设置页，并在 classic 布局的 quick-nav 中单独露出。`settings.server.tab.*` 现在只描述剩余的服务器二级标签（连接 / 认证 / 状态）。

本轮新增 `settings.style.input.contextRing.*` 键，为输入区样式设置里的上下文圆环样式下拉框提供中文标签、描述和“经典圆环 / 刻度圆环”两个选项。

本轮还新增 `settings.style.input.fontGroup.*` 8 个键，为输入区英文字体 / 中文字体下拉框提供中文分组、标签、描述和默认选项文案。

本轮还新增 `agentMention.menu.*` 系列键（`loading`、`empty`、`noMatches`、`loadFailed`），为 agent mention 自动补全菜单提供独立的状态文案，与 slash command 菜单的 `slashCommand.menu.*` 键分离。

本轮还新增 `slashCommand.sourceBadge.command`，让聊天 slash menu 里的 runtime-backed 普通命令显示 `command` badge；旧的“运行时”文案保留给真正需要表达 runtime 来源的其他上下文。

本轮新增 `slashCommand.menu.hint`，用于在 slash command 一级补全框顶部提示用户“斜杠命令仅在输入框开头输入时生效”。

2026-05-11 还新增 `chat.tab.backToParent`，用于子会话 tab 激活时的“返回父会话”面包屑按钮文案；后续补充 `chat.tab.childOpenFailed`，用于子代理/子会话 tab 防御性打开失败时的通用 notice，避免误用最大标签数文案；并补充 `chat.fork.newTabDisabled`，用于禁用会话标签时解释 fork modal 为什么隐藏新标签目标。同日 AskQuestion Dock polish 新增 `chat.question.collapse` 与 `chat.question.expand`，作为 above-input QuestionDock 折叠/展开图标按钮的 aria label。

2026-05-13 新增 `settings.skills.loading` / `settings.skills.count`、`settings.tools.group.*.desc`、`settings.tools.custom.desc`、`settings.acp.customAgent`、`settings.acp.preset.desc` 和 `settings.acp.command.empty`，服务 Skills / Tools / ACP Agents 设置页的分组化布局、空态和命令摘要。同日随后继续扩展 `settings.skills.create.*`、`settings.skills.modal.*`、`settings.skills.validation.*`、`settings.skills.notice.*` 以及 `settings.agents.editor.skillTool.*` / `settings.agents.editor.skillPermission.*`，用于技能 CRUD、Markdown 编辑/预览、官方格式校验、单技能权限和 agent 级 skill 覆盖 UI；其中 validation 文案覆盖 skill name 模式、父目录匹配、允许字段、description 尖括号 / 长度以及 compatibility 长度。随后又新增 `settings.skills.permission.help.*`，用于结果导向地解释 allow / ask / deny、默认权限和单技能覆盖，并链接 OpenCode Skills 官方文档。之后补充 `settings.skills.permission.inheritGlobal`、`settings.skills.permission.desc`、`settings.skills.permission.globalStatus.*`、`settings.skills.itemPermission.inherit`、`settings.skills.itemPermission.desc` 和权限写入后的 restart notice 文案，让 Skills UI 明确区分继承全局、当前全局权限、技能默认加载权限和单技能覆盖，并提示配置写入 `.opencode/opencode.json` 后会重启本地 OpenCode 服务；单技能继承选项使用 “Follow default” / “跟随上方默认”，避免配置术语压过用户理解。随后补充 `settings.skills.delete.confirm`，用于列表行删除当前 vault 内项目技能前的确认，并补充 `settings.skills.source.plugin`，把 OpenCode 插件包 cache 注入的技能显示为“插件包”。本轮还补充 `settings.skills.notice.restartFailed`，用于项目技能文件保存/删除/刷新时重启本地 OpenCode 失败的提示；并新增 `settings.skills.tab.project` / `external`、`settings.skills.bulk.*`、`settings.skills.empty.project` / `external`，用于 Skills 设置页的“项目技能 / 外部技能”二级标签、批量权限、项目批量删除和分标签空态；后续布局整理新增 `settings.skills.external.*`，外部技能页保留刷新说明，批量权限下拉改为选择即应用，不再需要 `settings.skills.bulk.apply` 文案。本轮还新增 `settings.tools.custom.authoring.*`、`settings.tools.custom.create.*`、`settings.tools.custom.files.*`、`settings.tools.custom.source.*`、`settings.tools.custom.modal.*`、`settings.tools.custom.validation.*` 和 `settings.tools.custom.notice.*`，用于自定义工具文件 authoring：项目 `.opencode/tools` 新建/编辑/删除、全局 tools 只读展示、OpenCode 文档入口、源码校验和保存/删除通知。随后补充 `settings.tools.default.*`、`settings.tools.permission.inherit`、`settings.tools.permission.custom`、`settings.tools.custom.notice.restartFailed` 和工具权限重启通知文案，用于解释 `permission["*"]` 全局默认、OpenCode 默认值、单工具“跟随默认 / 覆盖 / 自定义规则”关系，以及权限或工具文件写入后本地服务自动重启。

源码约 2050 行。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const zhTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': '在 Obsidian 中使用 OpenCode AI 助手',
  'settings.server.title': '服务器',
  'settings.server.mode.name': '连接模式',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 中文文案实现

该文件为英文键空间提供中文对应值，供 `setLocale('zh')` 后的全部界面使用。

### 帮助文案承载

除了普通 UI 标签外，这个文件还承载大量"解释型文案"，尤其是样式设置、主题背景与 Liquid Glass 参数的 plain-language help。

示例：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  '这是最核心的"玻璃感强度"滑块。调高后，输入框后面的内容会被扭曲得更明显...',
```

### 翻译风格

- UI 标签：简洁、动词前置（如"发送消息"、"添加上下文"）
- 帮助文本：口语化、避免技术术语（如"调高后...会更明显"）
- 错误提示：明确、 actionable（如"请检查...后再试"）

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `zhTranslations` | 简体中文静态翻译表对象 |

## 数据流

不适用。运行时会在 `t(key)` 中按当前 locale 直接读取该字典。

```
setLocale('zh')
t('settings.server.started')
  → translations.zh['settings.server.started']  // "OpenCode 服务器已启动"
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用于中文界面输出

## 配置项

无。

## 键前缀分布

| 前缀 | 数量级 | 说明 |
|------|--------|------|
| `settings.*` | 400+ | 设置界面（最大分组，含完整 debug logging 文案） |
| `chat.*` | 150+ | 聊天界面 |
| `plugin.*` | 2 | 插件基础信息 |

### 主要键域

- `settings.style.*` — 样式设置（含大量 Liquid Glass 参数说明）
- `settings.server.*` — 服务器设置（含帮助文本）
- `settings.model.*` — 模型设置
- `chat.context.*` — 上下文操作
- `chat.agentSelector.*` — composer 主 Agent 下拉框
- `chat.sessionSettings.*` — 会话级覆盖设置弹窗与保存结果提示（含 deferred backend apply notice）
- `chat.childSessionTree.*` — child-session tree header / open action / partial-graph 文案
- `chat.question.*` — 问题系统
- `chat.omo.*` — OMO 相关
- `agentMention.menu.*` — Agent mention 自动补全菜单状态文案（loading / empty / noMatches / loadFailed）

## 注意事项

- 中文文案应保持与英文键空间一一对应，不要单边新增键
- 该文件很长，修改时优先按前缀搜索已有键，避免重复定义或局部风格漂移
- 帮助文本通常比英文版本更长（中文表达更 verbose）
- 参数插值 `{param}` 在中文语境中同样适用
- 保持与英文表键顺序一致，便于 diff 对比

## 说明型长文本组织

文件中的长文本主要分为：

1. **帮助文本**（`*.help.*`）: 多段落解释，用 `\n` 分隔
2. **描述文本**（`*.desc`）: 单行补充说明
3. **通知文本**: 带参数的提示信息
4. **选项标签**: 下拉菜单、单选按钮选项

## 同步检查清单

修改本文件时，请确保：
- [ ] 键名与 `en.ts` 完全一致
- [ ] 参数占位符 `{xxx}` 数量和名称一致
- [ ] 新增键同时在 `en.ts` 添加
- [ ] 帮助文本风格统一（口语化、第二人称）

## 2026-04-23 压缩配置对齐

压缩配置已改为项目级（`.opencode/opencode.json`）。Ownership facts:
1. 压缩配置真相源为 `.opencode/opencode.json`，而非插件设置或会话设置。
2. 会话级 `autoCompactionEnabled` / `compactionReservedTokens` locale 键已移除；新增项目级 `settings.conversation.compaction.*` 键。
3. 手动 `session.summarize()` 仍为 per-session 操作，不由本 locale 管理。

## 2026-05-09 会话设置全局默认摘要

会话级设置弹窗现在展示只读的全局默认值摘要行。`chat.sessionSettings.modal` 下新增：

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

主设置页的 conversation section 现在拆成多层级 block。Locale 侧新增：
1. `settings.titleGeneration.groupDesc`
2. `settings.conversation.share.*`
3. `settings.conversation.display.*`
4. `settings.conversation.questions.*`
5. `settings.conversation.rendering.*`

## 2026-05-14 会话分享设置

项目级 OpenCode share mode 设置新增 `settings.conversation.share.*` 键：

1. `projectNote` / `projectNoteDesc`
2. `mode.name` / `mode.desc`
3. `mode.manual` / `mode.auto` / `mode.disabled`
4. `saved` / `configUnavailable` / `saveFailed`

Tabbed 设置布局同步新增 `settings.conversation.tab.sharing`。

## 2026-05-14 Title generation wording

标题生成相关文案现在使用面向用户的名称：“首条消息标题”和“智能标题生成”。设置说明会解释智能标题会先等待 OpenCode 自动命名，只有在 OpenCode 没有生成标题时才使用备用模型。

会话设置弹窗中的全局默认摘要也新增标题模式说明：
1. `chat.sessionSettings.modal.summary.titleGeneration.firstMessageDesc`
2. `chat.sessionSettings.modal.summary.titleGeneration.smartDesc`

同一组文案现在也明确：备用标题模型独立于 OpenCode `small_model`。

## 2026-05-14 Security blocked commands wording

Security blocked commands 文案现在明确说明条目会同步到当前项目 `.opencode/opencode.json` 的 OpenCode `permission.bash` deny pattern，而不是操作系统级沙箱。Locale 侧新增：

1. `settings.security.blockedCommands.syncUnavailable`
2. `settings.security.blockedCommands.syncFailed`

## 2026-04-23 Conversation compaction help modal

会话设置里的“上下文压缩（项目级）”现在也支持按字段打开帮助弹窗。Locale 侧新增：
1. `settings.conversation.compaction.help.openDoc`
2. `settings.conversation.compaction.help.{whatItMeans|opencodeDefault|adjustmentEffect|moreNotes|tipsLabel}`
3. `settings.conversation.compaction.help.{auto|prune|tailTurns|preserveRecentTokens|reserved}.*`

## 2026-04-24 Settings dual-layout locale keys

New Chinese keys added for the tabbed settings layout:

- `settings.layoutMode.*` — 布局模式下拉选项（经典/标签）
- `settings.general.*` — 通用一级标签标题、基础/语言二级标签，以及 classic 模式分组文案
- `settings.model.availability.desc` — 现在合并了原先 toggle 持久化说明，模型可用性头部改成一条合并文案，不再上下两句分开显示
- `settings.language.tab.*` — 语言标签页标签
- `settings.server.tab.*` — 服务器二级标签（连接/认证/状态）
- `settings.model.tab.*` — 模型二级标签（常用/项目配置/可用性/工具）
- `settings.conversation.tab.*` — 对话二级标签（标题/压缩/显示/提问/渲染）
- `settings.agents.tab.*` — 代理二级标签（默认/目录/编辑器/workspace）
- `settings.commands.tab.*` — 命令二级标签（模式/编辑器/目录）
- `settings.plugins.tab.*` — 插件二级标签（概览/全局/项目目录/OMO）
- `settings.security.tab.*` — 安全二级标签（配置/权限/安全）
- `settings.ui.tab.*` — UI 二级标签（通用）
- `settings.style.tab.*` — 样式二级标签（预设/背景/布局/用户/助手/输入/滚动条/高级）
- `settings.debug.tab.*` — 调试二级标签（通用/模块/日志/操作）

## 2026-05-14 模型完全披露文案

- `settings.model.smallModel.*` — Common 标签中的 OpenCode `small_model` 选择器文案与空态
- `settings.model.defaultChatModel.desc` — 说明默认聊天模型只是 OpenCodian 请求默认值，不会自动写入 OpenCode 项目级 `model`
- `chat.modelSelector.currentTabOverrideTitle` — 聊天模型选择器 tooltip，用于说明当前选择是当前标签发送覆盖
- `settings.model.visualEditor.structuredOptions*` — 原始 key/value 编辑器前的常见 `models.<id>.options` 结构化控件文案
- `settings.user.tab.*` — 用户二级标签（档案/提示词/标签）

## 2026-05-15 会话标签开关

新增 `settings.ui.enableTabs.name` 和 `settings.ui.enableTabs.desc`，用于 UI 设置里的“启用会话标签”开关。该文案说明禁用标签只隐藏/禁用标签控件，不清空会话、历史记录、标题或后台任务状态。
