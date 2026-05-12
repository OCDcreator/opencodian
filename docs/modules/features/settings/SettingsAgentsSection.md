# SettingsAgentsSection

> **源码**: `src/features/settings/SettingsAgentsSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsAgentsSection` 是 settings/agents 分区的 owner。它现在会把 runtime、project config、Markdown agent file 三层真相一起拉进来，通过 `AgentCatalogService` 生成统一 catalog，同时承接 project override editor、system-agent expert-mode gate，以及 Markdown workspace 的 CRUD / sync-state 展示。

当前实现覆盖了 A4 slice 的 Agent Studio 管理范围：

- 读取 runtime agent 目录、project `agent` 配置，以及 Markdown agent file scan 结果
- 用 `OpencodeConfigManager.getDefaultAgent()` 初始化默认主代理下拉框
- 在 classic / tabbed 两种 layout 中都渲染 system-agent `expert mode` toggle
- 通过 `updateDefaultAgent()` 写回项目级 `default_agent`
- 为 `mode: 'subagent'` 的条目提供基础 `@` 菜单可见性开关
- 通过 `upsertAgentConfig()` / `removeAgentConfig()` 写回或清理 `agent.<id>.hidden`
- 提供项目 agent 编辑器，支持从 project override 或 runtime/system 条目出发创建 / 编辑 / 删除以下核心字段：
  - `mode`
  - `disable`
  - `description`
  - `prompt`
  - `model`
  - `temperature`
  - `top_p`
  - `steps`
  - `color`
  - `permission.task` allowlist
  - `options`
- 提供 Markdown workspace：
  - 创建默认 project-root Markdown agent 文件
  - 查看每个 Markdown agent 文件的 scope / parseStatus / runtimeSeen / path
  - 行内编辑 frontmatter + prompt body
  - 删除 Markdown agent 文件

commands/slash runtime 与 command-owned hidden-agent flows 不属于本 owner；它们分别由 command config、Commands settings 和 chat runtime seams 维护。

## 核心逻辑

### runtime + config + file catalog 合并

owner 会并行读取：

- `openCodeService.sdk.app.agents()`：当前 runtime scope 下的 agent 目录，包含 OpenCode built-in agent、system agent 与 runtime 已识别的 project/file agent
- `OpencodeConfigManager.getAgentConfig()`：当前 vault 的项目配置 agent map，兼容 native `agent` 与 deprecated `mode`
- `OpencodeConfigManager.getDefaultAgent()`：项目级默认主代理
- `MarkdownAgentWorkspaceService.scan()`：四个 agent roots 下的 Markdown 文件扫描结果，再由 `markRuntimeSeen()` 标记 runtime 是否已看到该 agent ID

合并时统一走 `AgentCatalogService.aggregate()`：config 覆盖 runtime 默认值，file frontmatter 只在 runtime/config 尚未给出基础显示值时补位；source label 会区分 builtin、builtin+override、Markdown、Markdown+override、project-only 和 system-agent risk labels。`default_agent` 下拉现在直接依赖 `SurfaceAgent.defaultEligible`，因此 hidden system agents 不会再被错误地列进默认主代理选择。

### system-agent expert mode

- `SystemAgentGuardService` 现在由本 owner 持有，并在 classic / tabbed layout 都暴露 toggle
- 写入和删除 system-agent project override 都会先经过 guarded config manager；未开启 expert mode 时只弹 notice，不做写入
- catalog label 使用 locale 层的 `settings.agents.guard.*`，核心 guard 只返回结构化 risk kind / reason token

### Markdown workspace

- workspace block 由 `MarkdownAgentWorkspaceService` 驱动，不把 file truth 混进 project config writer
- 每个文件 row 展示：
  - scope（project/root）
  - parse status（ok / parse-error / duplicate-id）
  - runtime seen / runtime pending
  - vault-relative path
- `Create` 先写一个默认 `.opencode/agents/<id>.md` 文件；后续 `Edit` 打开行内 editor，允许改 frontmatter 和 prompt body；`Delete` 删除该文件
- workspace block 只说明 file state + runtime visibility state，不假装“写文件 = runtime 已刷新”

### subagent visibility 写回

当前 slice 只处理 OpenCode 原生 `hidden` 字段的基础路径：

- UI 开关采用正向语义：`true` 表示“在 `@` 菜单中显示”，`false` 表示“从 `@` 菜单隐藏”
- 用户关闭可见性时会写入 `agent.<id>.hidden = true`
- 用户重新开启可见性时，如果 project override 只剩 `hidden` 字段，则删除该 agent override
- 用户重新开启可见性时，如果 project override 还有其他字段，则删除 `hidden` 后通过 `upsertAgentConfig()` 保留其余配置
- 可见性写回成功后会通过 `plugin.saveSettings({ syncService: false, reloadModels: false, syncConfig: false, applyUi: false })` 复用既有 settings runtime 的 slash / `@agent` catalog 失效路径，让聊天输入框共享 catalog 立即丢弃旧的 `@` 候选，而不是等待 slash catalog 的 TTL 过期

项目 agent 编辑器的 `upsertAgentConfig()` / `removeAgentConfig()` 也会走同一失效路径，因为 `mode`、`hidden`、`description` 等字段都会影响聊天输入框里的 agent mention 候选。

这条路径只对 `mode: 'subagent'` 且未 `disable` 的条目开放，因为 OpenCode 的 `hidden` 语义主要用于子代理 `@` 菜单可见性。

### agent catalog shell height

- agent 目录 block body 现在额外挂 `opencodian-settings-catalog-scroll` / `opencodian-agent-catalog-scroll`
- 目录区使用最大高度 + 内部滚动，避免大量代理把整个 settings 页拉得过长
- catalog 局部刷新会先捕获目录 body 的 `scrollTop`，重建 DOM 后在下一帧恢复，避免用户切换 subagent 可见性时目录子页跳回顶部
- 这一层只负责 catalog 可滚动外壳和滚动位置稳定，不改变 runtime/project agent merge 语义

### 项目 agent 核心字段编辑器 / disable / task allowlist 写回

owner 现在在同一分区内提供一个 project agent editor：

- 上方 dropdown 只列出当前 vault 已存在的 project agent override；选择后会把当前配置加载到表单
- 未选择已有条目时，表单处于“新建 project agent”状态
- 保存时统一走 `OpencodeConfigManager.upsertAgentConfig()`，因此会保留该 agent 既有的未知字段，同时允许通过 `undefined` patch 清理已清空的核心字段与 `disable`
- 删除时统一走 `removeAgentConfig()`，只删除当前 project override，不会影响 runtime built-in catalog
- 所有写回都局限在当前 vault 的 `.opencode/opencode.json`
- `disable` 打开后会写入 `agent.<id>.disable = true`；关闭时改写成 `undefined` patch，让 `OpencodeConfigManager` 清理该字段，同时继续保留其他 project override 字段
- `permission.task` textarea 每行接收一个允许的子代理 ID 或 glob；保存时会写成 `permission.task = { '*': 'deny', ...allowRules }`
- 如果已有 agent 使用字符串形式的 `permission` 简写，首次编辑 allowlist 时会提升为 object，并保留原本的 `'*'` 行为再追加 `task`
- 如果只清空 allowlist，则 owner 只清理 `permission.task`，继续保留该 agent 其他 `permission` 键
- `options` 通过 raw JSON textarea 编辑；留空会清理 `agent.<id>.options`，非空时必须是 JSON object
- 保存 `options` 时，editor 会基于当前 project override 构造替换型 object patch，这样删除过的嵌套 key 不会被 `upsertAgentConfig()` 的递归 merge 悄悄保留下来

具体表单实现现已下沉到 companion owner `SettingsProjectAgentEditor`，避免 catalog owner 继续扩张。

数值字段目前按 OpenCode 原生语义写入普通 number：

- `temperature`
- `top_p`
- `steps`

如果输入不是合法数字，owner 会阻止保存并提示用户修正。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | classic layout：挂载默认主代理、expert toggle、project editor、Markdown workspace 和统一 catalog |
| `attachTabbed()` | tabbed layout：按 `default` / `catalog` / `editor` / `workspace` 二级标签挂载对应 block |
| `dispose()` | 递增 refresh run id，防止旧异步加载结果回写已重建的设置页 |
| `renderMarkdownWorkspaceBlock()` | 渲染 Markdown file workspace rows 以及 create/edit/delete actions |
| `createGuardedConfigManager()` | 用 expert-mode gate 包装 `upsertAgentConfig()` / `removeAgentConfig()` |
| `invalidateAgentAutocompleteCatalog()` | 在 agent 可见性或 project override 写入后复用 settings runtime 通知聊天视图刷新共享 slash / `@agent` catalog |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并挂载本 owner，把 Agents section 从主设置页中独立出来
- `OpenCodeService`: 通过 SDK facade 的 `app.agents()` 读取 runtime agent 目录
- `AgentCatalogService`: 统一 runtime/config/file 聚合
- `MarkdownAgentWorkspaceService`: 负责 Markdown file scan / create / update / delete
- `SystemAgentGuardService`: 提供 system-agent risk kind 与 expert-mode write guard
- `OpencodeConfigManager`: 读取 / 写回 project `agent`、legacy `mode` import、`default_agent`
- `OpenCodianPlugin`: 提供 `saveSettings()`，本 owner 以关闭 service/model/config/UI 同步的方式复用 settings runtime 的候选缓存失效广播
- `SettingsProjectAgentEditor.ts`: 负责 project agent 核心字段表单、保存 / 删除 action 与 notice
- `projectAgentEditorConfig.ts`: 为 project agent editor 提供字段归一化与 delete-aware patch helper
- `core/types/opencodeConfig.ts`: 提供 `OpencodeAgentConfig` / `OpencodeAgentMode` 类型
- `i18n/locales/*`: 提供 Agents section 标题、目录来源、mode、状态与错误文案

## 注意事项

- 不要在 `OpenCodianView.ts` 或 `OpenCodeService.ts` 中追加 Agents settings ownership；设置页写回应继续留在本 owner 与 `OpencodeConfigManager` seam 内。
- 当前 owner 只写项目级 `.opencode/opencode.json` 与当前 vault 内的 Markdown agent 文件；不要读写全局 OpenCode 配置。
- file write success、project config write success、runtime seen 是三个不同状态；本 owner 只负责把差异显式显示出来。

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `default` — renders default agent dropdown + expert toggle
- `catalog` — renders full unified agent catalog
- `editor` — renders project/system agent override editor
- `workspace` — renders Markdown agent file workspace

The classic `attach()` method now renders the same surfaces in a stacked layout.
