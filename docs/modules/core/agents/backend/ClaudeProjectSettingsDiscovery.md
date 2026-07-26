# Claude Project Settings Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectSettingsDiscovery.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeProjectSettingsDiscovery.ts` 是 Claude Code 项目设置文件的只读文件系统扫描 helper。它读取当前 vault 下的 `.claude/settings.json` 和 `.claude/settings.local.json`，提取 hooks、enabled plugins 与 marketplace 摘要，供 Claude Code settings 显示；文件创建/写入不属于本 owner，新的 configuration workbench 通过 `ClaudeSettingsSourceService` 的 strict-JSON/CAS mutation 路径完成。不依赖 Claude SDK query。

## 导入关系

上游: Node `fs/promises`, Node `path`
下游: Settings (via dynamic import), `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeHookEntry` | 单个 hook 命令，包含 `type`、`command`、`timeout` 和任意扩展字段 |
| `ClaudeHookGroup` | 官方嵌套 hook 组：`{ matcher?, hooks: ClaudeHookEntry[] }`，是 settings 文件中的第一等公民 |
| `ClaudeHooksConfig` | 按事件名分组的 hook 组映射（如 `{ SessionStart: ClaudeHookGroup[] }`） |
| `ClaudeProjectSettingsInfo` | 单个设置文件的摘要：`relativePath`、`exists`、`hooks`、`enabledPlugins`、`extraKnownMarketplaces`、`hookCount`、`parseError` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectSettings(vaultPath)` | 返回两个 `ClaudeProjectSettingsInfo`（settings.json + settings.local.json），即使文件不存在也返回 exists=false |
| `openClaudeProjectSettingsFile(vaultPath, fileName)` | 返回文件的绝对路径（用于打开编辑器），不检查文件是否存在 |

## 核心行为

- `vaultPath` 为空或空白时返回两个 exists=false 的条目，不抛错。
- `.claude/` 目录不存在时同样返回 exists=false。
- 内容按 `JSON.parse` 严格 JSON 读取；语法错误设置 `parseError` 字段，不抛错。合法但非 object 根会保持安全空摘要（不进入结构化 hooks 视图）。
- `hookCount` 为所有事件名下所有 hook 组中 individual hook commands 数量之和（非组数）。
- hooks 解析以**官方嵌套形状为第一等公民**：`hooks -> event[] -> { matcher?, hooks: [{ type, command, timeout }] }`。这和仓库中 `SettingsCapabilityLabSection.setupShellHookConfig()` 写入并验证通过的形状一致。
- 非官方的扁平 direct-entry 形状（`{ type, command }` 直接作为事件数组元素）被宽容降级为单命令组，但不保证被 Claude runtime 执行。
- `enabledPlugins` 从解析后的 `enabledPlugins` 数组提取；非数组或不存在时为空数组。
- `extraKnownMarketplaces` 从解析后的 `extraKnownMarketplaces` 数组提取（URL 字符串列表）；非数组或不存在时为空数组。
- 本模块没有 create/delete/write API；不要把 `openClaudeProjectSettingsFile` 误作写入或 runtime application 证明。

## 注意事项

- Settings 旧的 project scan/open surface 直接使用 `discoverClaudeProjectSettings`；新的可编辑 configuration surface 使用 `ClaudeSettingsSourceService`，避免在 discovery helper 内复制 mutation 安全边界。
- 这不是 hook 可视化编辑器 — 它提供文件发现和访问入口；结构化 hooks 编辑由 `ClaudeSettingsHooksBuilder` + `ClaudeSettingsHookModel` 负责。
- hooks 配置路径是官方 Claude Code 路径（`.claude/settings.json`），不是 SDK programmatic JS callback。
- hooks 解析的 official nested shape 为 `{ matcher?: string, hooks: [{ type, command, ... }] }`；非标准扁平 `{ type, command }` 只做兼容摘要，不证明 Claude runtime 会执行该形状。runtime application 证据不由本 helper 提供。
- 保持错误吞掉并返回安全默认值的语义。
