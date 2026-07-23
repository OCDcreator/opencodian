# SettingsClaudeResourcesSection

> **源码**: `src/features/settings/SettingsClaudeResourcesSection.ts`
> **状态**: [ACTIVE]

## 概述

### 2026-07-23 标签拆分

构造参数 `kinds` 允许 host 只渲染指定资源种类：Claude `skills-commands` 传 `['skill', 'command']`，`agents` 传 `['agent']`。项目可写、全局只读、来源 badge 和 mutation 后的 catalog 失效语义不变；原 Claude `resources` tab 不再存在。

`SettingsClaudeResourcesSection.ts` 是 Claude 资源管理设置面板的渲染 owner。它在 Claude Code 设置的 `resources` 二级 tab 下展示项目（可编辑）与全局（只读）的 Claude commands（`.claude/commands/<name>.md`）、skills（`.claude/skills/<name>/SKILL.md`）和 agents（`.claude/agents/<name>.md`），并提供创建/编辑/删除项目资源的入口。

本模块是纯渲染薄层，所有写入逻辑与校验都委托给经过测试的 Claude discovery CRUD 函数；本模块不包含任何写逻辑。

## 导入关系

上游: `obsidian`（Modal/Notice/Setting）、Node `os`、`core/agents/backend`（Claude discovery CRUD）、`shared`（getVaultBasePath）、`i18n`、`main`
下游: 由 `SettingsClaudeCodeSection` 在 `resources` tab 下实例化

## 核心导出

| 导出 | 说明 |
|------|------|
| `SettingsClaudeResourcesSection` | 渲染 Claude 资源管理面板；`render(bodyEl)` 为入口 |
| `SettingsClaudeResourcesSectionOptions` | `{ plugin, createSectionHeading, onAfterMutation? }` |

## 核心行为

- `render()` 同时发现项目 + 全局 commands/skills/agents，按类型分组渲染。每组是扁平语义组：组头行（h4 标题 + 右侧 compact primary「新建」按钮）+ muted 计数行（`groupSummary`）+ ScrollArea 有界列表（viewport max-height `min(38vh, 360px)`）。
- 读取 `plugin.settings.backendSettings.claudeCode.settingSources` 判定 `user` 来源是否启用（不改 source 开关运行时语义）。
- 全局资源始终只读列出；状态徽章区分：`user` 启用→「全局 · 已启用」(`is-global`)，未启用→「全局 · 已发现，未启用」(`is-global-disabled`)。`user` 未启用时额外显示来源提示（整框 1px warning 边框 + tonal 底的 quiet Alert，不再使用左侧色条）。
- 项目资源始终为「项目」(`is-project`)，绝不误标 global/disabled。
- 状态文案由纯函数 `resolveClaudeResourceScopeStatus(item, userSourceEnabled)` 解析（独立可测）。
- 每个资源渲染为结构化 row-card（非 `Setting` 行）：行 1 = 名称 + tonal scope badge + 右侧操作；行 2 = 描述；行 3 = 等宽 11px 路径 metadata。
- 空态与无 vault 态使用共享 `.opencodian-settings-inline-empty`（虚线边框 muted 面）。
- 项目资源提供 Edit / Delete；全局资源只提供 View（按 item 精确路径加载，避免同名歧义）。
- 新建走名称输入 modal，使用默认 Markdown 模板。
- 编辑走 editor modal（`.opencodian-claude-resource-modal`）：等宽 textarea（CSS 控制，无内联样式），保存按钮收进带顶部分隔线的右对齐 action 行；保存时先校验必需字段，再原子写入。
- `onAfterMutation` 回调在成功变更后触发 → `plugin.invalidateSlashCommandCatalog()` 失效 runtime / slash 菜单 catalog（runtime `supportedCommands()`/`supportedAgents()` 仍为最终真相）。

## 注意事项

- source toggle（`renderSettingSources`）经 `saveSettings()` 已即时失效 catalog（`OpenCodianSettingsRuntimeCoordinator.saveSettings` L99-100 调 `invalidateSlashCommandMenuCatalogs`），无需额外接线。
- 本模块不直接读写文件系统；所有 I/O 经 Claude discovery CRUD，保证校验、原子写与 symlink-aware 路径穿越保护集中。
- 全局资源（`~/.claude`）绝无写入/删除通道。
