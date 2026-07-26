# ClaudeSettingsMutationController

> **源码**: `src/features/settings/ClaudeSettingsMutationController.ts`
> **状态**: [ACTIVE]

## 概述

配置 workbench 的 durable mutation/history owner。它集中管理保存、比较、删除确认、历史展示与恢复，防止异步结果写回过期 scope/target/draft；DOM presentation state 仍由 `SettingsClaudeConfigurationSection` 持有。

## 核心契约

- `ClaudeSettingsMutationContext` 绑定 selection token、scope、target path、expected `FileRevision` 和 read-only 状态。generation/context fencing 在异步完成后重新检查，必要时要求 exact revision 相等。
- `save()` 在第一个 await 前捕获严格 JSON 的 submitted snapshot 并携带其 expected revision；它成功后返回含该 snapshot 的 outcome，且只用该 snapshot 调用 `markDraftSaved()` 更新 dirty baseline。等待期的 live draft 不会被误标已保存；Save & switch 可用 outcome 与 live draft 比较后决定是否切换。conflict 保留草稿并显示 Reload/Compare，不 force overwrite。
- `requestDelete()` 与 restore 先显示 revision-bound confirmation，确认文案明确包含当前 scope、实际 target path 和将执行的动作；取消确认后焦点回到触发按钮，delete/restore 成功后焦点回到可预测的 editor anchor。mutation 由 shared secure-write owner 执行 archive-before-mutation。delete 永远要求非空 revision；restore 只接受经 history catalog 验证的 opaque identity。
- history 读取只向 service 请求当前 `targetPath` 的 `listHistory(targetPath)`，由 service 完成 canonical binding；controller 不再用 scope-wide catalog 或 lexical path 比较猜测目标。打开/关闭时先同步 region `hidden`、`aria-busy`、toggle `aria-expanded`（`aria-controls` 由 section 在首次渲染时稳定绑定），再执行/取消异步读取；每次打开有独立 request token，因此关闭、重开、scope 切换或较晚返回的旧请求都不能写回当前 region。缺失根目录时仍可展示已验证的 exact-target archive，且不 mkdir/materialize。catalog/restore 失败、stale confirmation、scope 切换和外部变化均 fail closed；失败作为可见 `role=alert` 呈现。History 行将 archive kind、时间和文件大小按当前中/英文 locale 格式化。`clearConfirmations(editor)` 集中清理 editor 下的 delete/restore 确认、compare 输出与 history 行，供 section 在 reload/重读时调用。
- 保存、删除、恢复主状态使用三轴的本地化人类可读 formatter；`persistence=...` 等原始 token 只留给显式技术详情。三轴永不合并，pending/unavailable 也绝不伪装成 runtime verified。

## Durable owner 关系

`ClaudeSettingsMutationController` 管异步 mutation 状态与确认；`SettingsClaudeConfigurationSection` 管唯一 draft/selection；`ClaudeSettingsSourceService` 管 path allowlist、strict JSON、canonical target binding、CAS、archive/restore 和 filesystem evidence。controller 不直接触碰 filesystem，也不执行 Claude runtime probe。
