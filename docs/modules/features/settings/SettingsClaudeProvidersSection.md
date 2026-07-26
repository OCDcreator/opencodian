# SettingsClaudeProvidersSection

> **源码**: `src/features/settings/SettingsClaudeProvidersSection.ts`
> **状态**: [ACTIVE]

## 概述

Claude Code 的 Providers 二级设置页。它管理保存在 plugin `data.json` 的项目 provider preset，并把已激活 preset 的受管字段写入当前 vault 的 `.claude/settings.local.json`。

## 核心行为

- `settingSources` 不含 `local` 时只渲染阻塞门禁和“启用 local 来源”按钮；保持既有来源顺序，且不迁移、不写文件。
- 打开或重新渲染 Providers 不会触发 legacy `model` / `fallbackModel` 迁移或任何文件写入；迁移是用户明确点击后的可选操作。
- 迁移按钮只有在本次 generation 的 local snapshot 成功取得后才可用，并把展示时 capture 的 revision 传入 migration owner；冲突会保留旧模型设置并复用 reload / inspect（脱敏）/ fresh-retry 路径，成功后才清理旧设置。
- 官方 preset 固定为只读/不可删；自定义 preset 支持新建、编辑、激活与删除。激活后刷新卡片和 active badge。
- active card 显示 user / project shared / shell 的逐字段只读对照；配置 modal 展示三层 JSON 与 shell 值，所有 secret 均掩码。
- local 状态行显示精确写入路径、读取到的 revision 以及诚实的三轴状态：写成功后才是 `persistence=verified`，Claude 下一个进程/请求边界前是 `application=pending`，本路径始终 `runtime=unavailable`。
- source CAS 写成功但 plugin `saveSettings()` 失败时，页面保留新的 source revision 与三轴 evidence，明确标记 active preset / managed-key metadata（或 migration marker）为 partial persistence；当前内存状态继续持有 `lastAppliedManagedEnvKeys`，并提供不重复 source 写入的“重试插件设置持久化”恢复动作。
- local snapshot 出现读取、解析或安全校验错误时只显示本地化 failed/unavailable 原因，不显示原始错误或原始配置内容，也不会把状态标成 ready。
- 激活使用打开/读取时 capture 的 local revision。外部改动冲突不会覆盖文件或丢弃 preset：页面给出具名 alert、只读 reload、脱敏“查看当前文件”和“按最新 revision 重试”的明确路径；reload 会重新读取 revision 并清除旧冲突态，每次实际写入仍由 owner 归档并 CAS。
- 页面提示 Base URL 无 token 的 OAuth 风险、token 覆盖已保存 OAuth 的规则、旧 plugin `ANTHROPIC_*` env 冲突，并校验 `/v1`、`Bearer ` 与相同 fallback。

## 边界

- UI 不直接处理文件 I/O；所有持久化与掩码经 `ClaudeProjectProviderConfig`。
- 异步 snapshot 回调受 render generation fencing 限制，旧渲染不能覆盖新页面的 revision/status。
- 每次 render 只启动一个 generation-fenced snapshot promise，由 local 状态和 active card 的全局对照摘要共同消费；配置 modal 或冲突操作仍是用户明确触发的独立只读读取。
- 不存在写入 `~/.claude/**` 的 UI 路径。
- Provider 改动在下一次 query 或新建/重启的会话中生效；聊天中的明确模型选择仍是会话覆盖，而不是 preset 编辑器的实时切换。
