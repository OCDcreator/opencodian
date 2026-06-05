# Claude Project Settings Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectSettingsDiscovery.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeProjectSettingsDiscovery.ts` 是 Claude Code 项目设置文件的文件系统扫描与创建 helper。它读取当前 vault 下的 `.claude/settings.json` 和 `.claude/settings.local.json`，提取 hooks 和 plugins 配置摘要，供 Claude Code settings 显示；同时提供 `createClaudeProjectSettingsFile()` 用于创建新配置文件。不依赖 Claude SDK query。

## 导入关系

上游: Node `fs/promises`, Node `path`
下游: Settings (via dynamic import), `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeHookEntry` | 单个 hook 条目，包含 `type`、`command`、`timeout` 和任意扩展字段 |
| `ClaudeHooksConfig` | 按事件名分组的 hook 条目映射（如 `PreToolUse`、`SessionStart`） |
| `ClaudeProjectSettingsInfo` | 单个设置文件的摘要：`relativePath`、`exists`、`hooks`、`enabledPlugins`、`hookCount`、`parseError` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectSettings(vaultPath)` | 返回两个 `ClaudeProjectSettingsInfo`（settings.json + settings.local.json），即使文件不存在也返回 exists=false |
| `createClaudeProjectSettingsFile(vaultPath, fileName)` | 创建 `.claude/settings.json` 或 `.claude/settings.local.json`，默认内容 `{}`；已存在时返回 null |
| `openClaudeProjectSettingsFile(vaultPath, fileName)` | 返回文件的绝对路径（用于打开编辑器），不检查文件是否存在 |

## 核心行为

- `vaultPath` 为空或空白时返回两个 exists=false 的条目，不抛错。
- `.claude/` 目录不存在时同样返回 exists=false。
- JSON 解析失败时设置 `parseError` 字段，不抛错。
- `hookCount` 为所有事件名下 hook 条目数之和。
- `enabledPlugins` 从解析后的 `enabledPlugins` 数组提取；非数组或不存在时为空数组。
- `createClaudeProjectSettingsFile` 会递归创建 `.claude/` 目录，写入 `{}`（空合法 JSON）。
- 文件已存在时返回 null，不覆盖。

## 注意事项

- Settings 直接使用 `discoverClaudeProjectSettings` 动态导入而非通过 `ClaudeCodeAdapter`，以避免 owner-guard 耦合。
- 这不是 hook 可视化编辑器 — 它提供文件发现和访问入口，用户直接编辑 JSON 文件。
- hooks 配置路径是官方 Claude Code 路径（`.claude/settings.json`），不是 SDK programmatic JS callback。
- 保持错误吞掉并返回安全默认值的语义。
