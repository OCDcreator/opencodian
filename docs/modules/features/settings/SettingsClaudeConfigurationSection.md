# SettingsClaudeConfigurationSection

> **源码**: `src/features/settings/SettingsClaudeConfigurationSection.ts`
> **状态**: [ACTIVE]

## 概述

Claude Code `context-sources` 下的 configuration workbench。它把 Project/Local/Global 三个可编辑 scope 与 managed read-only inventory 放在一个界面中，用“常用表单 + 高级严格 JSON + Hooks builder”共享同一 raw draft。Project 是安全默认；Global 只有显式选择才会成为目标；managed 永远不可写。

## 核心行为

- `resolveConfigurationScopeSelection()` 只接受 `project`/`local`/`global`，其他值回退 Project。`isConfigurationSourceSelectable()` 同时要求 `editable` 且 scope 非 managed。
- 读取 source 后保存 `FileRevision`、target path 和 read-only 状态；严格 JSON object draft 无效时禁用 save/structured mutations。managed、plist 或 invalid target 只读展示，不 materialize root。
- `ClaudeSettingsCommonFieldsPresenter` 与 `ClaudeSettingsHooksBuilder` 都只向宿主提交 path edits；advanced textarea 是唯一 draft 真相，保留 unknown fields/order/local formatting。
- `ClaudeSettingsMutationController` 负责 save/compare/delete/history/restore 的 CAS、archive-before-mutation、confirmation 和 stale-generation fencing；成功状态显示 persistence/application/runtime 三轴 evidence。
- `onAfterMutation` 在成功写入/删除/恢复后刷新 inventory 并失效 slash catalog；这不是 Claude runtime 应用证明。除非真实 probe 另有记录，runtime 轴保持 `unavailable`（写入后的 application 通常为 `pending`）。

## Source contract

Project 默认路径为 `<vault>/.claude/settings.json`，Local 为 `<vault>/.claude/settings.local.json`，Global 为 `~/.claude/settings.json`。所有 editable JSON mutation 经 `ClaudeSettingsSourceService` 的 narrow allowlist、strict JSON、expected revision CAS 和 archive-before-mutation；restore 仅接受 authenticated opaque history identity。托管文件、managed drop-ins 和 macOS plist 只读；Windows HKLM/HKCU registry policy discovery 仍是明确 residual，本界面不得描述为完整发现。

## Durable owner

本 section 拥有 draft、scope、selection/read tokens 和 DOM projection；`ClaudeSettingsCommonFieldsPresenter` 拥有 common controls，`ClaudeSettingsHooksBuilder` 拥有 hooks controls，`ClaudeSettingsMutationController` 拥有异步 mutation/history lifecycle，`ClaudeSettingsSourceService` 拥有 source discovery、filesystem security 和 persistence。不要在本 section 重新实现这些边界。
