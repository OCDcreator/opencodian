# ClaudeCodeModelCatalog

> **源码**: `src/core/agents/backend/ClaudeCodeModelCatalog.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeModelCatalog.ts` 为 Claude Code composer 模型选择器提供 backend-specific catalog 适配。它把官方 Claude Code model aliases 与 SDK `supportedModels()` 返回值合并成现有 `ModelSelectorProvider` 兼容形状，并给每个 Claude model 挂上 Claude Code effort variants。

## 职责

- 定义 Claude Code composer provider id / name：`claude-code` / `Claude Code`
- 暴露官方 alias models：`default`、`best`、`sonnet`、`opus`、`haiku`、`sonnet[1m]`、`opus[1m]`、`opusplan`
- 暴露 Claude Code effort variants：`low`、`medium`、`high`、`xhigh`、`max`
- 将 SDK `supportedModels()` 的条目按 provider 合并进模型选择器 provider 列表
- 对重复 model id 保留官方 alias 的名称和顺序，避免 SDK 或 fallback 重复项扰乱 composer 默认显示

## 维护约束

- 这里只做 catalog projection，不直接调用 SDK，也不保存设置。
- 不把 Claude Code subagents 映射成模型；Opus/Sonnet/Haiku 在这里是 model aliases，不是 OpenCode-style agent。
- 新增官方 alias 或 effort level 时，同步 `SettingsClaudeCodeSection`、`core/types/settings.ts`、locale、测试和发送 options 映射。
