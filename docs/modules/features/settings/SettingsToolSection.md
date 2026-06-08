# SettingsToolSection

> **源码**: `src/features/settings/SettingsToolSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsToolSection` 是设置页工具管理的 section owner。它根据模式渲染工具默认权限、自定义工具文件入口、运行时 custom tool 目录，并为每个工具提供“跟随默认 / allow / ask / deny”下拉框，最终写入当前项目 OpenCode config 的 `permission` 设置。

## 关键导出

- `SettingsToolSection`: 渲染 builtin/custom 工具 UI，装配项目 `.opencode/tools` 工具文件管理入口，并保存权限变更的 class。

## 核心逻辑

### 内置工具

- `renderBuiltinTools()` 按文件、搜索、执行、网络、智能、元工具和计划工具分组渲染，每组使用 `opencodian-tool-group-panel` 和说明文案呈现。
- 每个工具先通过 `isBuiltinToolName()` 校验，再用 `getToolIdentity()` 获取标准名称和显示名称。
- 每个权限行默认显示 `inherit`（跟随默认）；只有存在对应 canonical permission key 时才显示具体 allow / ask / deny 覆盖。
- Built-in 页签会把 UI tool id 映射到 OpenCode canonical permission key：`write` / `multiedit` / `apply_patch` / `patch` 写入和读取 `edit`，`web_fetch` 写入和读取 `webfetch`，`web_search` 写入和读取 `websearch`。Custom 工具文件和运行时 custom tool catalog 仍按真实 tool id 写入，避免误映射用户自定义工具。
- 行外层带 `data-tool-id`、`data-tool-permission-key`、`data-tool-permission` 和 `data-tool-permission-source`；`data-tool-id` 保留 UI/运行时展示 id，`data-tool-permission-key` 表达实际读写 key，permission/source 表达 inherited / override / custom 状态，供 CSS 做低调状态提示。

### 默认权限

- `renderDefaultPermissionPanel()` 在 Built-in 与 Custom 两个 Tools 页签顶部都渲染 `permission["*"]` 控制。
- 默认权限区复用 Skills 权限区的 control-panel / permission-cluster 视觉结构：标题、说明、状态摘要和右侧 dropdown 的层级与 Skills 保持一致，只替换成 Tools 的 `permission["*"]` 语义。Custom 页签里的 New tool / Refresh / Docs 工具条也放在同一张控制卡下方，对齐 Skills 的“权限 cluster + toolbar”层级。
- 默认权限下拉包含 `OpenCode default`、`allow`、`ask`、`deny`。选择 `OpenCode default` 会调用 `clearToolPermission('*')` 删除全局默认；选择具体值会调用 `setToolPermission('*', value)`。
- 没有配置 `permission["*"]` 时，面板说明使用 OpenCode 默认值：大多数工具允许，`external_directory` / `doom_loop` 保护先询问。
- 单工具行选择 `Follow default` 时会删除对应 canonical `permission.<tool>`，回到 `permission["*"]` 或 OpenCode 默认。
- 如果已有 patterned/object permission（例如 `permission.webfetch` 是对象），行会显示 `Custom rules` / `data-tool-permission-source="custom"`，不会把对象规则误读成 allow；保持 `Custom rules` 选择不会写回，用户明确选择具体权限或 `Follow default` 时才覆盖/清除该 key。

### 自定义工具

- `renderCustomTools()` 现在分三层：authoring 工具栏、项目/全局工具定义文件列表、运行时 catalog custom tool 权限列表。
- authoring 工具栏提供 `New tool`、刷新和文档入口；新建工具会写入 `.opencode/tools/new-tool.ts`，并在名称冲突时递增为 `new-tool-2.ts` 等。
- 项目/全局工具文件发现与模板创建委托给 `SettingsToolFileService`，避免 UI owner 继续持有文件系统细节。
- 新建、编辑、删除项目工具文件以及手动刷新 Custom tools 页时，会先重启本地 OpenCode 服务，再重新渲染目录，避免运行时 custom tool catalog 停留在旧快照。
- 工具文件卡片按来源排序，先项目后全局；文件名作为默认 tool name。对于文档支持的 named exports（运行时名称为 `<filename>_<export>`），文件卡片保留提示，具体运行时 tool id 仍由下方 catalog 权限列表展示。
- `renderRuntimeCustomTools()` 保留原有 `openCodeCatalogStateStore` 接入，从 registry tool ids 中分出 custom tools，并按真实 tool id 写入权限。
- 没有运行时 catalog 时不再把整个自定义页显示为空；文件管理功能仍可离线使用。

### 工具文件编辑

- `ToolDetailModal` 用简洁源码 textarea 编辑项目工具文件；全局工具文件以只读方式打开。
- 保存前执行轻量校验：文件名必须是小写字母/数字并用连字符或下划线分隔，内容不能为空，并且包含 `tool(...)` 或 `execute` 函数。
- 默认模板由 `SettingsToolFileService.createProjectTool()` 生成，使用 OpenCode 文档推荐的 `import { tool } from "@opencode-ai/plugin"` + `export default tool({ ... })` 结构。

### 权限保存

- `setGlobalToolPermission()` 写入或清除 `permission["*"]`。
- `setToolPermissionSelection()` 写入或清除具体 `permission.<tool>`。
- 写入后调用 `plugin.saveSettings()`，并关闭 config sync、model reload 和 UI apply，避免权限编辑触发无关刷新。
- 权限写入后会自动重启本地 OpenCode 服务；远程模式下显示 remote 管理不可用提示，让用户在远程主机侧处理。工具文件 catalog 写入也复用同样的本地重启语义，但远程模式只重新渲染，不尝试管理远程进程。

## 依赖

- `obsidian`: 提供 `Setting` UI 组件。
- `src/main`: 提供 `OpenCodianPlugin` 类型和 plugin runtime seams。
- `src/i18n`: 提供工具设置文案翻译。
- `src/shared/toolIdentity.ts`: 提供内置工具识别和显示名解析。
- `SettingsToolFileService`: 项目/全局 custom tool 文件发现、创建与读取。
- `SettingsToolDetailModal`: custom tool 源码编辑弹窗。

## 注意事项

- 该 section 只编辑 OpenCode `permission` 配置并装配项目工具定义文件入口，不直接执行工具权限判断或加载工具。
- 该 section 是 OpenCode-owned 设置面板；权限下拉、项目工具新建/打开/删除以及写入后的本地服务重启都会在执行前重新检查 active backend。若页面在 OpenCode active 时挂载后切到 Claude Code，stale callback 只显示 OpenCode-only Notice，不写 `.opencode`、不调用 `saveSettings()`，也不触发 OpenCode restart。
- 自定义工具文件可离线管理；运行时 custom tool 列表依赖 OpenCode catalog，服务器未启动时可能为空。
- 全局工具目录只读，避免一个 vault 的设置页意外修改用户级工具。
- `getCatalogStore()` 通过可选 runtime seam 读取 catalog store，避免强绑定插件公开类型。
