# SettingsClaudeProvidersSection

> **源码**: `src/features/settings/SettingsClaudeProvidersSection.ts`
> **状态**: [ACTIVE]

## 概述

Claude Code 的 Providers 二级设置页。它管理保存在 plugin `data.json` 的项目 provider preset，并把已激活 preset 的受管字段写入当前 vault 的 `.claude/settings.local.json`。

## 核心行为

- `settingSources` 不含 `local` 时只渲染阻塞门禁和“启用 local 来源”按钮；保持既有来源顺序，且不迁移、不写文件。
- gate 解除后首次渲染触发一次 legacy `model` / `fallbackModel` 迁移，清空旧设置字段并记录完成标志。
- 官方 preset 固定为只读/不可删；自定义 preset 支持新建、编辑、激活与删除。激活后刷新卡片和 active badge。
- active card 显示 user / project shared / shell 的逐字段只读对照；配置 modal 展示三层 JSON 与 shell 值，所有 secret 均掩码。
- 页面提示 Base URL 无 token 的 OAuth 风险、token 覆盖已保存 OAuth 的规则、旧 plugin `ANTHROPIC_*` env 冲突，并校验 `/v1`、`Bearer ` 与相同 fallback。

## 边界

- UI 不直接处理文件 I/O；所有持久化与掩码经 `ClaudeProjectProviderConfig`。
- 不存在写入 `~/.claude/**` 的 UI 路径。
- Provider 改动在下一次 query 或新建/重启的会话中生效；聊天中的明确模型选择仍是会话覆盖，而不是 preset 编辑器的实时切换。
