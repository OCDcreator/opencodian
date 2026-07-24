# SettingsCodexResourcesSection

> **源码**: `src/features/settings/SettingsCodexResourcesSection.ts`
> **状态**: [ACTIVE]

## 概述

`SettingsCodexResourcesSection.ts` 是 Codex 资源管理设置面板的渲染 owner。它在 Codex 设置的 `resources` 二级 tab 下展示项目（可编辑）与全局资源的 Codex skills（`.agents/skills/<name>/SKILL.md`）和 agents（`.codex/agents/<name>.toml`），并提供创建/编辑/删除项目资源的入口。当前 P0 UI 对全局资源只读；P1 只有在共享 `allowlisted-root` 安全契约下才会开放全局 CRUD。

本模块是纯渲染薄层，所有写入逻辑与校验都委托给经过测试的 `CodexProjectResourceDiscovery` CRUD 函数；本模块不包含任何写逻辑。

## 导入关系

上游: `obsidian`（Modal/Notice/Setting）、Node `os`、`CodexProjectResourceDiscovery`、`shared`（getVaultBasePath）、`i18n`、`main`
下游: 由 `SettingsCodexSection` 在 `resources` tab 下实例化

## 核心导出

| 导出 | 说明 |
|------|------|
| `SettingsCodexResourcesSection` | 渲染 Codex 资源管理面板；`render(bodyEl)` 为入口 |
| `SettingsCodexResourcesSectionOptions` | `{ plugin, createSectionHeading }` |

## 核心行为

- `render()` 同时发现项目 + 全局 skills 与 agents，按类型分组渲染。每组是扁平语义组：组头行（h4 标题 + 右侧 compact primary「新建」按钮）+ muted 计数行（`groupSummary`：项目/全局数量）+ ScrollArea 有界列表（viewport max-height `min(38vh, 360px)`）。
- 每个资源渲染为结构化 row-card（非 `Setting` 行）：行 1 = 名称 + tonal scope badge + 右侧操作；行 2 = 描述；行 3 = 等宽 11px 路径 metadata。scope badge 低色度（project = accent tonal，global = 中性 tonal）。
- 项目资源提供 Edit / Delete（trash 图标按钮）；全局资源只提供 View。
- 空态与无 vault 态使用共享 `.opencodian-settings-inline-empty`（虚线边框 muted 面）。
- 新建走名称输入 modal，使用默认模板（skill 的 YAML frontmatter / agent 的 TOML 字段）。
- 编辑走 editor modal（`.opencodian-codex-resource-modal`）：等宽 textarea（CSS 控制，无内联样式），保存按钮收进带顶部分隔线的右对齐 action 行；保存时先校验必需字段，再原子写入，成功后重新 `render()` 刷新。
- 删除项目资源后重新 `render()`。
- 底部包含诚实的 Codex agent reload-boundary 说明（仅对后续 spawned session 生效），渲染为扁平 muted note 而非 Setting 行卡。

## 注意事项

- 本模块不直接读写文件系统；所有 I/O 经 `CodexProjectResourceDiscovery`，保证校验、原子写与路径穿越保护集中。
- 当前 P0 UI 对全局资源（`~/.agents`、`~/.codex`）不提供写入/删除通道；全局可写化属于 P1，必须经过共享 `allowlisted-root` 安全契约。
- 保存后仅刷新本面板；聊天菜单的 runtime skill 真相由 `CodexAppServerClient.listSkills()` + `skills/changed` 失效驱动，不由此面板直接控制。
