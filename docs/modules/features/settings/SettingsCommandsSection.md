# SettingsCommandsSection

> **源码**: `src/features/settings/SettingsCommandsSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsCommandsSection` 是 settings/commands 分区的 owner。它负责把当前 OpenCode runtime 返回的 slash command 目录，与当前 vault `.opencode/opencode.json` 里的 project `command` 配置合并成 catalog，并协调两个子职责：

- 通过 companion owner `SettingsProjectCommandEditor` 处理 project command 的 create/edit/delete 壳层
- 通过插件设置 `hiddenSlashCommands` 管理 slash menu 的用户级 visible/hidden 开关
- 通过插件设置 `slashCommandSkillMode` 管理 skills 是直接显示为 `/skill`，还是通过 `/skills skill` 前缀调用

当前 owner 仍然聚焦 commands settings 范围：project `command.<id>` 字段编辑、OpenCodian placeholder reference、command-owned hidden agent 的 catalog/editor 回填、skill invocation mode，以及 catalog 可见性写回；共享的 runtime+project merge 规则现已下沉到 `core/config/slashCommandCatalog.ts`，供 settings catalog 与 chat slash menu 共同复用。

## 核心逻辑

### runtime + project catalog 合并

owner 会并行读取：

- `openCodeService.sdk.command.list()`: 当前 runtime scope 的 slash command 目录
- `OpencodeConfigManager.getCommandConfig()`: 当前 vault `.opencode/opencode.json` 里的 project `command` map
- `OpencodeConfigManager.getAgentConfig()`: 当前 vault 里的 project/legacy agent map，用来识别 command-owned hidden agent
- 然后把这些输入交给 `mergeSlashCommandCatalog()`，再追加 `appendSyntheticBuiltinCommands()` 注入的合成内置命令（`/compact`、`/undo`、`/redo`、`/new`、`/share`、`/unshare`），避免 settings/chat 再维护两份不同的 merge 规则
- 合成命令只进入目录可见性列表，不进入 project command editor；editor 使用原始合并列表，防止用户意外将合成命令保存为 project override 而禁用专用执行路径

合并时：

- project `template` / `description` / `agent` / `model` / `subtask` 优先覆盖 runtime metadata
- 如果 project command 指向 `opencodian-command:<id>` 这类 hidden agent，则 section 会把该 agent 的 `temperature` / `top_p` 回填给 editor，并尽量显示 metadata 里的 base agent，而不是暴露内部 agent ID
- runtime 中不存在、但 project config 存在的条目会保留成 `projectOnly`
- 这些 `projectOnly` 条目会继续显示在 settings catalog / editor 中，但不会进入 chat slash autocomplete；要等 runtime reload 后才会出现在聊天菜单里
- settings catalog 对这类条目会直接提示“仅保存在项目配置中；当前 runtime 尚未提供”，避免让用户误以为它已经能从聊天里直接运行
- `source: 'mcp'` 的 runtime 条目不会进入这个 catalog shell；`source: 'skill'` 会保留并显示为 Skill 来源

### project command editor 壳层

`SettingsCommandsSection` 自己不持有 command 表单细节，而是在 vault config 可用时创建 `SettingsProjectCommandEditor`：

- editor dropdown 可以选择 runtime command、runtime+project override、project-only command，或开始创建新项目命令
- 选中 runtime command 时，editor 会用当前 catalog 中合并后的 `template` / `description` / `agent` / `model` / `temperature` / `top_p` / `subtask` 回填表单，因此 built-in 命令也能直接生成 project override
- 保存统一走 `OpencodeConfigManager.upsertCommandConfig()`，写回 `command.<id>` 核心字段；空白的 `description` / `agent` / `model` 与 sampling 字段会被转成 `undefined` patch，让 manager 清理这些字段
- `template` 在 editor 中是必填字段；删除动作统一走 `OpencodeConfigManager.removeCommandConfig()`，且只对当前已存在 project override 的条目开放
- editor 在 `template` 字段下方展示 OpenCodian 支持的 placeholder token reference：`{{vault_path}}`、`{{current_note_path}}`、`{{current_selection}}`、`{{external_context_paths}}`、`{{conversation_title}}`
- manager 会把命令级 `temperature` / `top_p` patch 转成 command-owned hidden agent；section 只负责 catalog/editor 回填，不接管这条持久化规则
- 保存或删除成功后，editor 调用上层传入的 `onConfigChanged()`，让 section 重新拉取 runtime/project catalog 并刷新 editor + catalog

### 用户可见性写回

project command editor 负责 `.opencode/opencode.json` 的 `command` 字段，而 catalog toggle 仍然只维护插件设置：

- 打开 toggle = 从 `hiddenSlashCommands` 移除该 command ID
- 关闭 toggle = 把该 command ID 加入 `hiddenSlashCommands`
- 写回时会去重、裁剪空白并按字母序排序，避免重复 ID 长期累积
- catalog 可见性写回会刷新本地目录，但会保留 `opencodian-command-catalog-scroll` 的内部滚动位置，避免长命令列表在开关后跳回顶部
- `opencodian-command-catalog-scroll` 必须挂在实际 catalog block body 上，而不是 project command editor block；`renderWithPreservedScroll()` 只围绕 catalog body 重绘列表

因此这条路径只表达“当前 Obsidian profile 下的 slash menu 可见性”，不改变 OpenCode runtime 自身的 command config。

### Skill 调用模式

Commands section 还提供 `slashCommandSkillMode` 下拉选项：

- `direct` 是默认值，chat slash menu 直接显示 OpenCode skill，例如 `/build-mcp-server`
- `skills-command` 会在顶层 slash menu 显示合成的 `/skills` 入口，具体 skill 通过 `/skills build-mcp-server` 调用
- 当 `skills-command` 生效时，settings catalog 里的 skill 条目也会改用 `/skills <skill>` 标签，并把可见性文案切换成 `/skills` browser 语义，和聊天端当前行为保持一致
- 写回只更新插件设置，不触发 OpenCode config sync、模型重载或 UI theme 应用

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载 Commands section，创建 heading、editor block 与 catalog block，并启动首次异步刷新 |
| `createSkillModeSetting()` | 渲染 skill invocation mode 下拉框并写回 `slashCommandSkillMode` |
| `dispose()` | 递增 refresh run id，避免旧异步请求回写已重建的设置页，并释放 `SettingsProjectCommandEditor` 持有的 textarea size-memory observer |
| `refreshCatalog()` | 并行加载 runtime/project commands，合并后同时刷新 editor 与 catalog |
| `renderCatalog()` | 先委托 `SettingsProjectCommandEditor` 渲染项目命令表单，再委托 `SlashCommandCatalogRenderer` 渲染卡片式目录 |
| `updateCommandVisibility()` | 把用户 hide/unhide 操作写回 `hiddenSlashCommands` |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并挂载本 owner，把 Commands section 从主设置页中独立出来
- `OpenCodeService`: 通过 SDK facade 的 `command.list()` 读取 runtime slash command 目录
- `OpencodeConfigManager`: 读取当前 vault 的 project `command` / `agent` 配置，并负责 command-owned hidden agent lifecycle
- `core/config/slashCommandCatalog.ts`: 提供共享 catalog merge 与 visible-menu projection 规则
- `SettingsProjectCommandEditor.ts`: 负责 project command 核心字段表单、保存 / 删除 action 与 notice
- `SlashCommandCatalogRenderer.ts`: 负责 catalog 的搜索、筛选、卡片网格渲染和多选批量操作
- `core/types/settings.ts`: 提供插件设置里的 `hiddenSlashCommands` 与 `slashCommandSkillMode`
- `i18n/locales/*`: 提供 Commands section 标题、catalog 来源、可见性和错误文案

## 注意事项

- 不要把 Commands settings ownership 塞回 `OpenCodianSettings.ts`、`OpenCodianView.ts` 或 `OpenCodeService.ts`
- project `command` 表单细节现在继续下沉到 companion owner `SettingsProjectCommandEditor`，避免 catalog owner 继续膨胀
- `hiddenSlashCommands` 仍然是用户级 slash menu 可见性来源，不要把 project command CRUD 和 visible/hidden 写回混成同一条存储路径

## 2026-05-17 Card-based catalog with search/filter/multi-select

Catalog 从简单 `Setting` 行列表升级为卡片式网格布局。卡片渲染逻辑已提取到 companion owner `SlashCommandCatalogRenderer`：

- 搜索栏使用 `enhanceSearchInput()`，支持搜索历史和模糊匹配（`fuzzyMatch()` 对 command ID + description + display ID 做子序列匹配）
- 筛选标签（All / Skills / Commands / Enabled / Disabled）通过 `catalogFilter` 状态驱动 `applyFilters()` 过滤
- 每个命令卡片包含：多选复选框、`/command-name`、来源芯片（Skill / Command / Project / MD）、状态芯片（Subtask / Unavailable）、可折叠描述、可见性切换
- 多选状态 `selectedCommandIds` 支持批量启用/禁用，通过 `updateVisibility` 回调一次性写回
- 展开状态 `expandedCommandIds` 允许点击卡片展开完整描述
- 滚动容器 `.opencodian-cmd-catalog-scroll` 独立于控件区域，最大高度 `min(460px, 52vh)`
- CSS 样式前缀统一为 `opencodian-cmd-catalog-*`，定义在 `config-editor-modal.css`

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `mode` — renders skill invocation mode dropdown + catalog listing
- `editor` — renders project command editor form
- `catalog` — renders full command catalog with visibility toggles

The classic `attach()` method remains unchanged.
- `slashCommandSkillMode` 只改变 chat menu/执行入口形态，不改变 OpenCode runtime 的 skill catalog
- runtime placeholder expansion、slash execution 与 command-owned hidden agent 已分别落在相邻 seam；如果后续再扩 commands 体验，仍应继续沿着本 owner + editor seam 扩展，而不是绕开现有共享 catalog seam

### SDK capability disclosure

该 section 现在调用 `renderCapabilityDisclosureRows()`（来自 `capabilityDisclosureRow.ts`）渲染只读能力状态行，显示该 section 拥有的 SDK capability 的 available / unsupported-by-server / disabled-by-user / unknown 状态与脱敏原因，并提供 Re-check 按钮。不重复已有配置编辑器。
