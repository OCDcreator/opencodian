# ClaudeCodeModelCatalog

> **源码**: `src/core/agents/backend/ClaudeCodeModelCatalog.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeModelCatalog.ts` 为 Claude Code composer 模型选择器提供 backend-specific catalog 适配。它把官方 Claude Code model aliases 与 SDK `supportedModels()` 返回值合并成现有 `ModelSelectorProvider` 兼容形状，并给每个 Claude model 挂上 Claude Code effort variants。此外导出 `CODEX_EFFORT_VARIANTS` 供 Codex 后端的 chat toolbar effort selector 使用。

## 职责

- 定义 Claude Code composer provider id / name：`claude-code` / `Claude Code`
- 暴露官方 alias models：`default`、`best`、`sonnet`、`opus`、`haiku`、`sonnet[1m]`、`opus[1m]`、`opusplan`
- 暴露 Claude Code effort variants：`low`、`medium`、`high`、`xhigh`、`max`
- 暴露 Codex reasoning-effort variants：`minimal`、`low`、`medium`、`high`、`xhigh`（用于 chat toolbar effort selector 的 Codex backend 路径）
- 将 SDK `supportedModels()` 的条目按 provider 合并进模型选择器 provider 列表
- 对重复 model id 保留官方 alias 的名称和顺序，避免 SDK 或 fallback 重复项扰乱 composer 默认显示

## 维护约束

- 这里只做 catalog projection 和 effort variant 常量导出，不直接调用 SDK，也不保存设置。
- 不把 Claude Code subagents 映射成模型；Opus/Sonnet/Haiku 在这里是 model aliases，不是 OpenCode-style agent。
- 新增官方 alias 或 effort level 时，同步 `SettingsClaudeCodeSection`、`core/types/settings.ts`、locale、测试和发送 options 映射。
- `CODEX_EFFORT_VARIANTS` 与 `CLAUDE_CODE_EFFORT_VARIANTS` 虽定义在同一文件，但服务于不同 backend 的 effort 语义；Codex 不含 `max`，Claude Code 不含 `minimal`。
