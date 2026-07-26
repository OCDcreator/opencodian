# ClaudeProjectProviderConfig

> **源码**: `src/core/agents/backend/ClaudeProjectProviderConfig.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeProjectProviderConfig` 是 Claude 项目级 provider preset 的 durable owner。它只写入 `<vault>/.claude/settings.local.json`；用户级 `~/.claude/settings.json`、项目共享 `settings.json` 与 shell 环境只可读取、展示和脱敏，绝不通过本模块写入。

P1-B 起，preset 与 legacy model migration 的写入统一进入 `ProjectResourceSecureWrite.safeWriteFile()`：调用方可以传入明确的 `expectedRevision`，现有文件先归档，再以同目录安全提交完成 mutation；外部修改返回类型化 conflict error，不存在 force-overwrite。该文件使用严格 JSON，不接受 JSONC 注释或尾逗号。

## 核心导出

| 导出 | 说明 |
|---|---|
| `applyClaudeProviderPreset()` | 安全 merge-write 受管 model/fallbackModel/env 键；未知字段保持不变；成功返回新 revision 与三轴 evidence。 |
| `migrateClaudeProviderModels()` | 一次性把旧 plugin model/fallback 字段迁至 local 文件，且不覆盖文件中已有值；可用调用方 capture 的 `expectedRevision` 做 CAS，真实写入时返回 revision/evidence。 |
| `readClaudeProviderConfigSnapshot()` | 读取 user / project / local 三层和受限 shell env，用于只读配置视图；local layer 通过 allowlisted no-follow descriptor snapshot 同时取得 content 与 revision，供下一次写入 CAS。 |
| `maskClaudeProviderConfigSnapshot()` | 递归掩码 token、secret 等敏感值。 |
| `resolveClaudeProviderGlobalEffectiveValue()` | 以 project shared → user → shell 的已知文件优先级计算非 local 的只读对照值。 |
| `validateClaudeProviderPreset()` | 检查 `/v1` Base URL、`Bearer` token、同名 fallback 和受管 extra-env 冲突。 |
| `ClaudeProviderMutationOptions` | 可选 `expectedRevision` 与可注入 archive root；UI mutation 应显式传入读取时 revision。 |
| `ClaudeProviderConfigMutationError` | 包含完整 `SafeFileMutationResult` 的类型化持久化失败；conflict/current revision 不被压平。 |

## 写入规则

- 受管顶层键只有 `model`、`fallbackModel`；非空 fallback 写为单元素数组。
- 受管 env 键是 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_DEFAULT_HAIKU_MODEL` 和上一次 preset 记录的 extra-env 键。
- 官方 preset 只删除受管键；若 `env` 变空则删除该对象，其他 JSON 原样保留。
- 现有 `settings.local.json` 必须是严格 JSON object。解析失败、非 object 根或读取期间文件消失都会 fail closed：不生成 `.bak`，不从空对象覆盖原始 bytes。
- `.claude` local root 在 `mkdir` materialize 前后均由 `assertWithinRoot(vault, .claude)` 限定在 vault 内，并在 shared safe mutation 前保留该 exact narrow allowlist。若缺失 `.claude` parent 在初次 guard 后被替换为指向 vault 外的 symlink，preset write 拒绝且不会创建外部 `settings.local.json`。读取现有文件前也必须通过 `scope: local` 的 exact narrow allowlist 取得 canonical target。`settings.local.json` symlink 即使指向 vault 内其他文件，只要逃出 `.claude` 就在 bytes read 前 fail closed。
- 同一 `.claude` narrow allowlist 传给 `readAllowlistedFileSnapshot()` 与 `safeWriteFile()`；严格 JSON 的 content 和 revision 来自同一个 no-follow descriptor snapshot。读期间文件替换/identity 变化 fail closed，不会把旧 content 绑定给新 revision。
- update 先归档为 `backend=claude / kind=provider-settings / format=json`；归档失败中止写入。create 使用 `expectedRevision: null`，update 使用完整 `{ canonicalPath, mtimeMs, size, sha256 }` revision。
- 为兼容现有即时 read-modify-write 调用方，省略 options 时内部使用刚读取的 revision；新的设置 UI 必须显式回传它展示内容时取得的 revision，以便保留草稿并正确呈现外部修改冲突。
- migration 与 preset apply 共用同一 archive-before-CAS owner；冲突先返回，不清理 plugin 旧模型字段，也不覆盖外部 bytes。
- snapshot/readback 只展示 `maskClaudeProviderConfigSnapshot()` 的结果；revision 是文件元数据而不是 secret，配置值和 token 不会进入可见的状态、比较或错误文本。

## 三轴证据

成功只证明持久化轴：

- `persistence = verified`：安全 mutation 完成且新 revision 已从磁盘读取。
- `application = pending`：下一次 Claude process 启动/重载后才可能应用。
- `runtime = unavailable`：该写入路径没有捕获 Claude runtime readback。

因此 UI 不得把 preset 保存成功显示成 runtime verified。失败通过 `ClaudeProviderConfigMutationError.result` 暴露真实 `conflict` / `invalid-content` / `archive-failed` / `write-failed` 等状态。

## 注意事项

- 本 owner 不判断 SDK/CLI 或 managed policy 的最终覆盖；它只展示已知层并保持全局层只读。
- Providers UI 在 `settingSources` 不含 `local` 时不得调用任何写入或迁移 API。
- `backupPath` 只保留在返回类型中作为源码兼容字段；新契约不会为 malformed JSON 创建 ad-hoc backup，历史统一来自 `ConfigurationArchiveService`。
