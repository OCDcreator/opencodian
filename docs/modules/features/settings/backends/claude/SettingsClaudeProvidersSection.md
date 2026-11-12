# SettingsClaudeProvidersSection

> **源码**: `src/features/settings/backends/claude/SettingsClaudeProvidersSection.ts`
> **状态**: [ACTIVE]

## 概述

Claude Code 的 “服务与模型”（Service and models）二级设置页。它管理保存在 plugin `data.json` 的项目 provider preset，并把已选择 preset 的受管字段写入当前 vault 的 `.claude/settings.local.json`。2026-11-12 重设计后，页面以“当前配置”回读面板开头，preset 以无边框行列表呈现，引导/迁移/local 状态/全局配置动作收进单个原生 details 折叠区；preset 编辑与脱敏配置检查两个 modal 拆分到 [SettingsClaudeProviderModals](SettingsClaudeProviderModals.md)。

## 核心行为

- `settingSources` 不含 `local` 时只渲染阻塞门禁和“启用 local 来源”按钮；保持既有来源顺序，且不迁移、不写文件。
- 页面结构（每次 render）：metadata persistence 条 → 冲突解决 → `data-claude-provider-current` “当前配置”面板 → preset 列表头（标题 + Add）→ preset 行 → `settings.claudeCode.providers.detailsTitle` details 折叠区。guidance、迁移按钮、local 状态行与全局配置检查全部位于折叠区内；local 状态行先插入到 current 面板前，snapshot 就绪后再 `prepend` 进折叠区。
- 打开或重新渲染 Providers 不会触发 legacy `model` / `fallbackModel` 迁移或任何文件写入；迁移是用户明确点击后的可选操作，且迁移按钮仍然只有在本 generation 的 local snapshot 成功取得后才可用。
- 内置官方 preset 保留 `CLAUDE_OFFICIAL_PROVIDER_PRESET.id` 不变，但 UI 上以“继承已有 Claude 配置”呈现（名称、描述与“使用继承配置”动作），明确它不是账户或登录状态；自定义 preset 显示清洗后的服务地址。官方 preset 不可编辑、不可删除。
- “当前配置”面板按 local 层内容（`model` / `fallbackModel` / 受管 env 键与 `lastAppliedManagedEnvKeys`）判定 `local` / `inherit` 两种模式并给出对应说明；下方 dl 回读表逐字段展示“值 + 来源 + 路由”，与已保存/已选择的 preset 元数据是两回事：回读值由 `readbackValue` 按 `settingSources` 过滤后的 shell → user → project → local 优先级解析。
- 回读诚实边界：authToken 只显示“已设置 · 内容隐藏 / 未读取到 Token”，绝不回显明文；地址经 `providerAddress` 清洗（剥离凭据、query、hash）并分类路由 chip（本地代理 / Anthropic 地址 / 自定义地址 / 路由未确认）；有已启用来源解析失败时显示 partial 说明；面板 footer 固定说明“运行时未确认”，即配置来源值可能被会话选模、环境覆盖和组织策略改变。
- preset 行动作：`Apply to this vault`（官方行为 “Use inherited configuration”）带 `data-claude-provider-apply` 标记，初始 disabled，直到 local snapshot 就绪且无 pending persistence；apply 进行中（`applying`）禁用全部 apply 按钮，结束后按 `localReady` / pending 恢复。Edit / Delete 仅自定义 preset 可用且同样受 pending persistence 门禁。
- local 状态行显示精确写入路径、读取到的 revision 以及诚实的三轴状态：写成功后才是 `persistence=verified`，Claude 下一个进程/请求边界前是 `application=pending`，本路径始终 `runtime=unavailable`。
- 编辑器 modal（见 SettingsClaudeProviderModals）区分“仅保存预设”与“保存并应用到当前库”：save-only 成功后整页重渲染；`saveSettings()` 失败时内存 providers 恢复为保存前快照并把错误抛回 modal 显示 saveFailed；save-and-apply 在保存成功后走与 Apply 按钮相同的 `activatePreset` 路径。
- source CAS 写成功但 plugin `saveSettings()` 失败时，页面保留新的 source revision 与三轴 evidence，明确标记 active preset / managed-key metadata（或 migration marker）为 partial persistence；当前内存状态继续持有 `lastAppliedManagedEnvKeys`，并提供不重复 source 写入的“重试插件设置持久化”恢复动作。
- 激活使用打开/读取时 capture 的 local revision（CAS `expectedRevision`）。外部改动冲突不会覆盖文件或丢弃 preset：页面给出具名 alert、只读 reload、脱敏“查看当前文件”和“按最新 revision 重试”的明确路径；reload 会重新读取 revision 并清除旧冲突态，每次实际写入仍由 owner 归档并 CAS。
- local snapshot 出现读取、解析或安全校验错误时只显示本地化 failed/unavailable 原因，不显示原始错误或原始配置内容，也不会把状态标成 ready。
- 页面提示 Base URL 无 token 的 OAuth 风险、token 覆盖已保存 OAuth 的规则、旧 plugin `ANTHROPIC_*` env 冲突，并校验 `/v1`、`Bearer ` 与相同 fallback。

## 边界

- UI 不直接处理文件 I/O；所有持久化与掩码经 `ClaudeProjectProviderConfig`。凭据输入与脱敏快照检查集中在 [SettingsClaudeProviderModals](SettingsClaudeProviderModals.md)，本 section 不再内联 modal 类。
- 异步 snapshot 回调受 render generation fencing 限制，旧渲染不能覆盖新页面的 revision/status。
- 每次 render 只启动一个 generation-fenced snapshot promise，由 current 面板回读摘要与折叠区内 local 状态共同消费；配置 modal 或冲突操作仍是用户明确触发的独立只读读取。
- 不存在写入 `~/.claude/**` 的 UI 路径。
- Provider 改动在下一次 query 或新建/重启的会话中生效；聊天中的明确模型选择仍是会话覆盖，而不是 preset 编辑器的实时切换。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/claude/SettingsClaudeProvidersSection.ts`。
- 原位置：`src/features/settings/SettingsClaudeProvidersSection.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/settings/backends/claude/SettingsClaudeProviderMetadataPersistenceCoordinator.ts`。

## 2026-11-12 服务与模型重设计

- 标题从 “Project providers” 改为 “Service and models”（zh “服务与模型”）；`active` 徽标改称 “Selected”，`activate` 按钮改称 “Apply to this vault”，明确写入边界。
- 新增 current 回读面板、无边框 preset 行列表、details 折叠区和 `readback.*` / `route.*` / `source.*` 键空间；`ClaudeProviderConfigModal` / `ClaudeProviderPresetModal` 移至 `SettingsClaudeProviderModals.ts`（manifest 已同步）。
