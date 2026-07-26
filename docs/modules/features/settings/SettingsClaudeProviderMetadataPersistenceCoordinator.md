# SettingsClaudeProviderMetadataPersistenceCoordinator

> **源码**: `src/features/settings/SettingsClaudeProviderMetadataPersistenceCoordinator.ts`
> **状态**: [ACTIVE]

## 概述

Claude Providers source mutation 完成后的 plugin settings metadata persistence owner。它把 source CAS 成功返回的 revision/evidence 与当前进程中的 active preset、`lastAppliedManagedEnvKeys` 或 migration marker 绑定，避免 `plugin.saveSettings()` 暂时失败时把已落盘来源误报成 apply/migration 失败。

## 核心行为

- source 写入成功后先保留 partial-persistence 状态，再尝试 `plugin.saveSettings()`；失败时渲染可访问的 alert，明确来源已保存、plugin metadata 未可靠持久化、application 仍 pending、runtime unavailable。
- 当前进程继续持有受管键/迁移元数据，并禁用新的 source mutation，恢复动作只重试 plugin settings 保存，不重复写 `.claude/settings.local.json`。
- Retry 使用 render generation 和单飞标记防止 detached/stale UI 或重复提交；失败保留 alert，成功清除 partial state 并调用正常 mutation/render 回调。
- evidence/status 文案来自 i18n，revision 只显示安全的 path 与 sha256 前缀，不把 preset token 或原始错误写入 DOM/Notice。

## 边界

- 不执行 Claude source 文件 I/O、不覆盖/回写 source，也不决定 CAS conflict；这些职责仍由 `ClaudeProjectProviderConfig` 与 Providers section 持有。
- 只接收已完成 source mutation 的 typed result 和已更新的 in-memory settings；plugin save failure 不会被压平为 source failure。
