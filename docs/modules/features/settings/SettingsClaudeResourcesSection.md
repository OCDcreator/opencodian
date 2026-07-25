# SettingsClaudeResourcesSection

> **源码**: `src/features/settings/SettingsClaudeResourcesSection.ts`
> **状态**: [ACTIVE]

## 概述

### P1 资源闭环

`SettingsClaudeResourcesSection.ts` 是 Claude 资源管理设置面板的渲染 owner。它在 Claude Code 设置的 `skills-commands` 或 `agents` 二级 tab 下展示 project/global 两个 scope 的 commands（`.claude/commands/<name>.md`）、skills（`.claude/skills/<name>/SKILL.md`）和 agents（`.claude/agents/<name>.md`）。新建默认为 Project，Global 必须显式选择；scope、revision 和 facade 返回的 canonical target path 始终显示在行和编辑器元数据中。

本模块是渲染与交互薄层，所有读写、归档、revision 冲突和路径校验都委托给 Claude discovery facade；冲突时保留当前编辑器草稿。Markdown resources 提供 Edit 与 Preview，删除、组级 history 和带 expected revision 的恢复共用 P0 安全契约。归档清单读取失败显示明确的历史不可用状态，不伪装成空历史。

## 导入关系

上游: `obsidian`（MarkdownRenderer/Modal/Notice/Setting）、Node `os`、`core/agents/backend`（Claude discovery CRUD 与 scoped safe-read facade）、`shared`（getVaultBasePath）、`i18n`、`main`
下游: 由 `SettingsClaudeCodeSection` 在 `skills-commands` / `agents` tab 下实例化

## 核心导出

| 导出 | 说明 |
|------|------|
| `SettingsClaudeResourcesSection` | 渲染 Claude 资源管理面板；`render(bodyEl)` 为入口 |
| `SettingsClaudeResourcesSectionOptions` | `{ plugin, onAfterMutation?, kinds? }` |

## 核心行为

- `render()` 先用 `captureScrollAnchor` 记录最近滚动祖先的 scrollTop，再清空调用方提供的独占、无边框 host，然后发现项目 + 全局 commands/skills/agents 并按类型分组渲染；异步 discovery 填充完成后恢复原滚动位置，因此 create/update/delete/restore reload 不会 append 旧 group 或 row，也不会把用户视图跳回顶部。每组是扁平语义组：`.opencodian-resource-group-card` 为 layout-only 容器（仅 `min-width: 0`），不承担卡片视觉；组头行（h4 标题、History 与「新建」按钮）+ scope 计数行 + ScrollArea 有界列表。Skills & Commands 保持 viewport max-height `min(38vh, 360px)`；独立 Agents tab 在首帧和异步 discovery 完成后各测量一次 viewport 顶部，将最终剩余设置窗口高度写入 `--opencodian-settings-scrollarea-available-height`。
- 读取 `plugin.settings.backendSettings.claudeCode.settingSources` 判定 `user` 来源是否启用（不改 source 开关运行时语义）。
- Global 资源也通过显式 scope facade 可编辑；行的 `data-resource-readonly` 保留 facade 值，不由 scope 推断。`user` 来源开关仍只驱动启用/未启用 badge 与提示，不改变 CRUD 安全边界。
- `user` 来源关闭时，提示明确区分 persistence/application/runtime：Global 资源仍可安全编辑并持久化，但 Claude runtime 不会应用或读取它们；启用 source 只解除应用边界，不构成已有查询的 runtime verified 证据。
- 项目资源始终为「项目」(`is-project`)；Global 显示 Global badge，并保留真实 canonical path。
- 状态文案由纯函数 `resolveClaudeResourceScopeStatus(item, userSourceEnabled)` 解析（独立可测）。
- 每个资源渲染为结构化 row-card（非 `Setting` 行）：行 1 = 名称 + tonal scope badge + 右侧操作；行 2 = 描述；行 3 = canonical path 与 revision 等宽 metadata。
- 空态与无 vault 态使用共享 `.opencodian-settings-inline-empty`（虚线边框 muted 面）。
- 所有 scope 资源提供 Edit / Preview / Delete（按 item 精确路径加载，避免同名歧义）。新建走 scope + 名称 modal，使用默认 Markdown 模板。
- 编辑走 editor modal（`.opencodian-claude-resource-modal`）：existing resource 通过 owner-specific scoped reader（`scope`、`basePath`、`name`、`expectedRevision`）读取；读取冲突、invalid path 或 read failure 保留 modal、显示 typed error 并禁用编辑/保存，绝不以默认模板冒充已有内容。Markdown Preview 使用 Obsidian `MarkdownRenderer.renderMarkdown` 写入 div；保存按钮收进带顶部分隔线的右对齐 action 行，保存时先校验必需字段，再原子写入；保存期间按钮经 try/finally 禁用防重入。
- History 入口位于所属资源组，展示 project/global 目标和 archive entries；目标呈现时捕获当前 revision（不存在则 `null`），Restore 按钮闭包把该 snapshot 原样传回 facade，点击后不再重新发现或合法化外部变更。
- 删除与恢复操作前先弹 `window.confirm`（确认文案含资源名，并明确"删除会归档、可从历史恢复"）；冲突提示块带 `role="alert"`，确保辅助技术立即感知冲突状态。
- `onAfterMutation` 回调在成功变更后触发 → `plugin.invalidateSlashCommandCatalog()` 失效 runtime / slash 菜单 catalog（runtime `supportedCommands()`/`supportedAgents()` 仍为最终真相）。

## 注意事项

- source toggle（`renderSettingSources`）经 `saveSettings()` 已即时失效 catalog（`OpenCodianSettingsRuntimeCoordinator.saveSettings` L99-100 调 `invalidateSlashCommandMenuCatalogs`），无需额外接线。
- 本模块不直接读写文件系统；所有 I/O 经 Claude discovery CRUD，保证校验、原子写与 symlink-aware 路径穿越保护集中。
- Global `~/.claude` 资源的写入/删除经共享 scoped safe-write facade 与 allowlisted-root 校验；source 开关只表达 runtime application boundary，不回退为只读门控。
