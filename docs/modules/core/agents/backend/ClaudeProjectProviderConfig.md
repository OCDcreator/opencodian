# ClaudeProjectProviderConfig

> **源码**: `src/core/agents/backend/ClaudeProjectProviderConfig.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeProjectProviderConfig` 是 Claude 项目级 provider 配置的完整 durable owner。它只写入 `<vault>/.claude/settings.local.json`；用户级 `~/.claude/settings.json`、项目共享 `settings.json` 与 shell 环境只可读取、展示和脱敏，绝不通过本模块写入。

## 核心导出

| 导出 | 说明 |
|---|---|
| `applyClaudeProviderPreset()` | 原子 merge-write 受管 model/fallbackModel/env 键；未知内容保持不变。 |
| `migrateClaudeProviderModels()` | 一次性把旧 plugin model/fallback 字段迁至 local 文件，且不覆盖文件中已有值。 |
| `readClaudeProviderConfigSnapshot()` | 读取 user / project / local 三层和受限 shell env，用于只读配置视图。 |
| `maskClaudeProviderConfigSnapshot()` | 递归掩码 token、secret 等敏感值。 |
| `resolveClaudeProviderGlobalEffectiveValue()` | 以 project shared → user → shell 的已知文件优先级计算非 local 的只读对照值。 |
| `validateClaudeProviderPreset()` | 检查 `/v1` Base URL、`Bearer` token、同名 fallback 和受管 extra-env 冲突。 |

## 写入规则

- 受管顶层键只有 `model`、`fallbackModel`；非空 fallback 写为单元素数组。
- 受管 env 键是 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_DEFAULT_HAIKU_MODEL` 和上一次 preset 记录的 extra-env 键。
- 官方 preset 只删除受管键；若 `env` 变空则删除该对象，其他 JSON 原样保留。
- 读到无效 JSON 时先在 vault 中备份为 `.bak`（冲突时带时间戳），再从空对象继续；`assertWithinRoot()` 与 `atomicWriteFile()` 保证路径和落盘安全。

## 注意事项

- 本 owner 不判断 SDK/CLI 或 managed policy 的最终覆盖；它只展示已知层并保持全局层只读。
- Providers UI 在 `settingSources` 不含 `local` 时不得调用任何写入或迁移 API。
