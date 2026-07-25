# SettingsCodexResourcesSection

> **源码**: `src/features/settings/SettingsCodexResourcesSection.ts`
> **状态**: [ACTIVE]

## 概述

`SettingsCodexResourcesSection.ts` 是 Codex 资源管理设置面板的渲染 owner。它在 Codex 设置的 `resources` 二级 tab 下展示 project/global scope 的 skills（`.agents/skills/<name>/SKILL.md`）和 agents（`.codex/agents/<name>.toml`）。新建默认为 Project，Global 必须显式选择；行和编辑器元数据显示 facade revision 与 canonical target path。Global CRUD、history 和 restore 都留在所属资源组内，并要求 scoped facade 的 expected revision 契约。

本模块是渲染与交互薄层，所有读写、归档、revision 冲突和路径校验都委托给 `CodexProjectResourceDiscovery` facade；冲突时保留当前草稿。Codex Skill 提供 Markdown Edit/Preview，Codex Agent 仅提供严格 TOML 源码编辑。删除、组级 history 和带 expected revision 的恢复共用 P0 安全契约；归档清单失败显示历史不可用状态。

## 导入关系

上游: `obsidian`（MarkdownRenderer/Modal/Notice/Setting）、Node `os`、`CodexProjectResourceDiscovery`（scoped CRUD 与 safe-read facade）、`shared`（getVaultBasePath）、`i18n`、`main`
下游: 由 `SettingsCodexSection` 在 `resources` tab 下实例化

## 核心导出

| 导出 | 说明 |
|------|------|
| `SettingsCodexResourcesSection` | 渲染 Codex 资源管理面板；`render(bodyEl)` 为入口 |
| `SettingsCodexResourcesSectionOptions` | `{ plugin, createSectionHeading, onAfterMutation? }`；成功创建、编辑、删除或恢复后调用 callback，供 host 失效 runtime/catalog。 |

## 核心行为

- `render()` 先记录最近可滚动祖先的 scrollTop（`captureScrollAnchor`），再清空调用方提供的独占、无边框 host，然后发现项目 + 全局 skills 与 agents 并按类型分组渲染；因此 mutation reload 不会重复 heading、resource group、runtime skills/list readback shell 或边界说明，异步行填充完成后会恢复滚动位置而不是跳回顶部。每组是扁平语义组：组头行（h4 标题、History 与「新建」按钮）+ muted 计数行 + ScrollArea 有界列表（viewport max-height `min(38vh, 360px)`）。组容器 `.opencodian-resource-group-card` 是 layout-only，卡片视觉只由行卡承担（见 `settings-codex-resources.css` 文档）。
- 每个资源渲染为结构化 row-card（非 `Setting` 行）：行 1 = 名称 + tonal scope badge + 右侧操作；行 2 = 描述；行 3 = canonical path 与 revision 等宽 metadata。`data-resource-readonly` 保留 facade 值，不由 scope 推断。
- Skills 提供 Edit / Preview / Delete；Agents 提供严格 TOML Edit / Delete。两个 scope 均通过 scoped facade 写入。
- Global 不是隐式只读：用户显式选择 Global 后，Skills 与 Agents 均可创建、编辑、删除、查看 history 并恢复归档；每次更新、删除和恢复都携带 expected revision，冲突时保留草稿。
- 空态与无 vault 态使用共享 `.opencodian-settings-inline-empty`（虚线边框 muted 面）。
- 新建走 scope + 名称 modal，使用默认模板（skill 的 YAML frontmatter / agent 的 TOML 字段）。
- 编辑走 editor modal（`.opencodian-codex-resource-modal`）：existing resource 通过 owner-specific scoped reader（`scope`、`basePath`、`name`、`expectedRevision`）读取；读取冲突、invalid path 或 read failure 保留 modal、显示 typed error 并禁用编辑/保存，绝不以默认模板冒充已有内容。Codex Skill Markdown Preview 使用 Obsidian `MarkdownRenderer.renderMarkdown` 写入 div；Codex Agent 继续仅提供 TOML 源码编辑。保存按钮收进带顶部分隔线的右对齐 action 行，保存时先校验必需字段，再在写入期间禁用自身防止双击并发第二次变更，成功后重新 `render()` 刷新。
- 删除前经 `window.confirm` 明确后果（先归档、可从历史恢复）；删除成功后重新 `render()`。History 入口保留在所属 skills/agents 组。目标呈现时捕获当前 revision（不存在则 `null`），Restore 按钮闭包把该 snapshot 原样传回 facade，点击后不再重新发现或合法化外部变更；恢复前同样经 `window.confirm` 提示将覆盖当前同名文件。冲突提示块带 `role="alert"`。
- 成功创建、编辑、删除或恢复后调用可选 `onAfterMutation` callback；本面板随后刷新，聊天菜单仍保持既有扁平目录与 runtime 失效路径。
- 底部包含诚实的 Codex agent reload-boundary 说明（仅对后续 spawned session 生效），渲染为扁平 muted note 而非 Setting 行卡。

## 注意事项

- 本模块不直接读写文件系统；所有 I/O 经 `CodexProjectResourceDiscovery`，保证校验、原子写与路径穿越保护集中。
- `~/.agents/skills` 与 `~/.codex/agents` 的 Global 写入、删除、history 和 restore 均经过 scoped `allowlisted-root` 安全契约；scope 必须由用户显式选择，不能由 readonly 标记推断。
- 保存后仅刷新本面板；聊天菜单的 runtime skill 真相由 `CodexAppServerClient.listSkills()` + `skills/changed` 失效驱动，不由此面板直接控制。
