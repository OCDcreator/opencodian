# SettingsClaudeConfigurationSection

> **源码**: `src/features/settings/SettingsClaudeConfigurationSection.ts`
> **状态**: [ACTIVE]

## 概述

Claude Code `context-sources` 下的 configuration workbench。它把 Project/Local/Global 三个可编辑 scope 与 managed read-only inventory 放在一个界面中，用“常用表单 + 高级严格 JSON + Hooks builder”共享同一 raw draft。Project 是安全默认；Global 只有显式选择才会成为目标；managed 永远不可写。

## 核心行为

- `resolveConfigurationScopeSelection()` 只接受 `project`/`local`/`global`，其他值回退 Project。`isConfigurationSourceSelectable()` 同时要求 `editable` 且 scope 非 managed。
- 读取 source 后保存 `FileRevision`、target path 和 read-only 状态；严格 JSON object draft 无效时禁用 save/structured mutations。managed、plist 或 invalid target 只读展示，不 materialize root。
- `isDirty()` 以最后一次**成功提交的** `savedDraft` snapshot 为基线；raw textarea、common fields 和 hooks builder 三条编辑路径共享同一 canonical draft，因此任何一条路径的修改都算 dirty。`save()` 提交前捕获 snapshot，成功后只用该值更新 baseline；保存等待期间产生的 live draft 仍是 dirty。`draftVersion` 与 read token 阻止过期 read 写回之后的输入；保存触发的 inventory refresh 只更新 metadata，不替换 draft。
- dirty 时切换 scope/target 会先回退 select 并弹出内联 Save & switch / Discard & switch / Cancel 决策；保存失败、CAS 冲突或 JSON 无效时不得切换。Save & switch 还必须比较 live draft 与 submitted snapshot：若不相同，就保留当前 scope 和新草稿并提示用户；Cancel 保留当前草稿与选择。Reload 明示放弃草稿，Compare 永不改动草稿；既有 generation fencing 与防重复提交保持不变。
- 信息架构：current-editing summary bar（scope、target path、present/absent、editable/read-only、dirty/saved、三轴 evidence 摘要）常驻首屏；完整 source inventory 收进“已检查 N 个来源”页内 disclosure，canonical path、revision、priority 等原始 token 保留在每行 `<details>` 技术详情内。Advanced JSON / History / Hooks 均为页内 disclosure（button + aria-expanded/aria-controls + hidden region），折叠不销毁、不重建、不分叉 canonical raw draft。
- 可访问性：polite status 与阻断错误分别路由到 `role=status` / `role=alert` live region，同时普通字段、Hooks、Inventory、History 与 JSON 的阻断诊断保留在可见 surface。共享 JSON diagnostic 位于 Advanced JSON disclosure 外；控件只在该可见 diagnostic 有效时带 `aria-invalid`/`aria-describedby`，有效 JSON 后会清除 textarea、普通字段和 Hooks 字段的过期 ARIA 状态。inventory/history 异步加载期间容器置 `aria-busy`；Inventory 失败会自动展开其 disclosure 并显示专属可见 alert；History 的 `hidden`、`aria-expanded`、`aria-controls` 绑定与 busy 状态在请求开始/关闭时同步，不等待 history 请求完成，并以 per-open request token 丢弃旧响应；Global 选中时持续显示本地化警告与完整目标路径。
- `ClaudeSettingsCommonFieldsPresenter` 与 `ClaudeSettingsHooksBuilder` 都只向宿主提交 path edits；advanced textarea 是唯一 draft 真相，保留 unknown fields/order/local formatting。
- `ClaudeSettingsMutationController` 负责 save/compare/delete/history/restore 的 CAS、archive-before-mutation、confirmation 和 stale-generation fencing；成功状态显示 persistence/application/runtime 三轴 evidence。
- `onAfterMutation` 在成功写入/删除/恢复后刷新 inventory 并失效 slash catalog；这不是 Claude runtime 应用证明。除非真实 probe 另有记录，runtime 轴保持 `unavailable`（写入后的 application 通常为 `pending`）。

## Source contract

Project 默认路径为 `<vault>/.claude/settings.json`，Local 为 `<vault>/.claude/settings.local.json`，Global 为 `~/.claude/settings.json`。所有 editable JSON mutation 经 `ClaudeSettingsSourceService` 的 narrow allowlist、strict JSON、expected revision CAS 和 archive-before-mutation；restore 仅接受 authenticated opaque history identity。托管文件、managed drop-ins 和 macOS plist 只读；Windows HKLM/HKCU registry policy discovery 仍是明确 residual，本界面不得描述为完整发现。

## Durable owner

本 section 拥有 draft、scope、selection/read tokens 和 editor 区 DOM projection；`ClaudeSettingsContextSourcesPresenter` 拥有 scope 行、Global 警告、未保存草稿切换决策、current-editing 摘要条与 source inventory disclosure 的 DOM（含 workbench 共享 disclosure/action helper 与 scope/origin/evidence 本地化格式化，本文件 re-export `resolveConfigurationScopeSelection`/`isConfigurationSourceSelectable` 以保持既有 import 兼容）；`ClaudeSettingsCommonFieldsPresenter` 拥有 common controls，`ClaudeSettingsHooksBuilder` 拥有 hooks controls（字段级控件在 `ClaudeSettingsHookFieldControls`），`ClaudeSettingsMutationController` 拥有异步 mutation/history lifecycle 与确认清理，`ClaudeSettingsSourceService` 拥有 source discovery、filesystem security 和 persistence。不要在本 section 重新实现这些边界。
