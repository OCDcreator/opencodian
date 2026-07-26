# ClaudeSettingsMutationController

> **源码**: `src/features/settings/ClaudeSettingsMutationController.ts`
> **状态**: [ACTIVE]

## 概述

配置 workbench 的 durable mutation/history owner。它集中管理保存、比较、删除确认、历史展示与恢复，防止异步结果写回过期 scope/target/draft；DOM presentation state 仍由 `SettingsClaudeConfigurationSection` 持有。

## 核心契约

- `ClaudeSettingsMutationContext` 绑定 selection token、scope、target path、expected `FileRevision` 和 read-only 状态。generation/context fencing 在异步完成后重新检查，必要时要求 exact revision 相等。
- `save()` 只提交当前严格 JSON draft，并携带 expected revision；success 更新 revision，conflict 保留草稿并显示 Reload/Compare，不 force overwrite。
- `requestDelete()` 与 restore 先显示 revision-bound confirmation；mutation 由 shared secure-write owner 执行 archive-before-mutation。delete 永远要求非空 revision；restore 只接受经 history catalog 验证的 opaque identity。
- history 读取只向 service 请求当前 `targetPath` 的 `listHistory(targetPath)`，由 service 完成 canonical binding；controller 不再用 scope-wide catalog 或 lexical path 比较猜测目标。缺失根目录时仍可展示已验证的 exact-target archive，且不 mkdir/materialize。catalog/restore 失败、stale confirmation、scope 切换和外部变化均 fail closed。
- `formatClaudeSettingsEvidence()` 原样格式化 `persistence`、`application`、`runtime` 三轴；save/delete/restore 成功不得把 pending/unavailable 伪装成 runtime verified。

## Durable owner 关系

`ClaudeSettingsMutationController` 管异步 mutation 状态与确认；`SettingsClaudeConfigurationSection` 管唯一 draft/selection；`ClaudeSettingsSourceService` 管 path allowlist、strict JSON、canonical target binding、CAS、archive/restore 和 filesystem evidence。controller 不直接触碰 filesystem，也不执行 Claude runtime probe。
