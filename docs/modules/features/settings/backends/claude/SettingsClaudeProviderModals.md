# SettingsClaudeProviderModals

> **源码**: `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`
> **状态**: [ACTIVE]

## 概述

Claude Providers 页（[SettingsClaudeProvidersSection](SettingsClaudeProvidersSection.md)）的两个 Obsidian Modal：`ClaudeProviderPresetModal` 负责 preset 草稿的凭据编辑，`ClaudeProviderConfigModal` 负责脱敏配置层检查。2026-11-12 从 Providers section 文件拆出，成为独立的实质模块（credential 输入生命周期与脱敏渲染规则都在此维护），不是转发 helper。

## 核心行为

### ClaudeProviderPresetModal（凭据编辑）

- 以 clone 出的 `draft` 编辑 preset（新建时生成 `provider-<timestamp>-<rand>` id），authToken 字段使用 `type="password"` 且 `autocomplete="off"`，所有文本输入挂 aria label。
- 双动作 footer：“仅保存预设”（`Save preset only`）与“保存并应用到当前库”（`Save and apply to this vault`，mod-cta）。`onSave(preset, apply)` 回调由 section 注入：save-only 只持久化 preset；save-and-apply 在 section 侧保存成功后走 `activatePreset` CAS 路径。
- 保存防护：`saving` 单飞标记 + 保存期间禁用全部按钮 + `role="status"` 状态行（saving 中 / saveFailed）；校验失败（空名称或 `validateClaudeProviderPreset` 有错误）以 Notice 提示并保留草稿。
- `onClose` 清空 `draft.authToken` 与 `draft.extraEnv`，凭据不残留在 modal 实例上。
- 顶部说明区分“保存预设”与“应用写入本库”：留空字段继续继承其他来源。

### ClaudeProviderConfigModal（脱敏检查）

- 对传入的 `ClaudeProviderConfigSnapshot` 先经 `maskClaudeProviderConfigSnapshot` 掩码，再逐层渲染 user / project / local 文件路径与 JSON，以及 shell env；解析错误层只显示本地化 unavailable 提示和 `{}`，不输出原始错误或原始内容。
- 只读：不提供任何编辑、保存或写入动作。

## 边界

- 不执行文件 I/O、不持有 revision/CAS 状态；保存语义、应用（apply）、冲突与 metadata persistence 全部归 Providers section 与 `ClaudeProjectProviderConfig` / metadata coordinator。
- Modal 的 `onSave` 抛错（例如 section 侧检测到 pending persistence、未就绪或 apply 进行中）只显示本地化 saveFailed，不区分内部原因给用户。
- 构造函数只依赖 `Modal['app']` 与纯数据，不导入 plugin 实例，保持可在单测中实例化。

## 目录定位（2026-11-12）

- 新文件，随“服务与模型”重设计从 `SettingsClaudeProvidersSection.ts` 拆出；`architecture-owners.config.json` 的 `feature.settings-claude` include 已同步加入该路径。
