# ClaudeSettingsCommonFieldModel

> **源码**: `src/core/agents/backend/ClaudeSettingsCommonFieldModel.ts`
> **状态**: [ACTIVE]

## 概述

纯函数 common-settings 字段目录与编辑模型。目录只覆盖已安装 Agent SDK `0.3.145` 的 `Settings` 接口证据（SDK d.ts line 3943）和 Claude CLI `2.1.204`；它不读写文件、不 stringify，也不修改输入对象。UI 表单和高级严格 JSON 草稿共用该模型。

## 字段目录

`CLAUDE_SETTINGS_COMMON_FIELDS` 提供 `model`、`permissions.defaultMode`、`permissions.allow`、`permissions.ask`、`permissions.deny`、`env`、`cleanupPeriodDays`、`respectGitignore`、`includeGitInstructions` 九个字段。每项记录 JSON path、字段 kind；权限模式有明确 enum，`cleanupPeriodDays` 只接受有限数字且最小值为 1（不强制整数）。`CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE` 固定记录 SDK/CLI 版本与来源行号。

## 核心导出

| 导出 | 说明 |
|---|---|
| `CLAUDE_SETTINGS_COMMON_FIELDS` | 结构化字段元数据；不要从 UI 另造字段清单。 |
| `CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE` | schema provenance（SDK 0.3.145、d.ts 3943、CLI 2.1.204）。 |
| `buildClaudeSettingsCommonFieldEdit(settings, fieldId, value)` | 返回单个 `JsoncPathEdit` 或 path diagnostics；`null` 表示删除字段。 |

## 约束

- settings 根必须是 plain object；已存在的嵌套 parent（例如 `permissions`）若不是 plain object 会 fail closed，不会覆盖它。
- 值必须符合目录 kind、enum 和最小值；string-array 的元素必须为 string，string-record 的值必须为 string。
- 成功结果只描述结构化 path edit；实际应用、严格 JSON 验证、CAS、归档和持久化由 `SettingsClaudeConfigurationSection` / `ClaudeSettingsSourceService` 负责。
- 编辑层保留未知同级字段；runtime application 没有由此模块证明，相关证据轴应保持 `runtime=unavailable`，除非另有真实 probe。
