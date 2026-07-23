# Claude Project Command Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectCommandDiscovery.ts`
> **状态**: [ACTIVE]

> **更新**: 新增 `updateClaudeProjectCommand` / `deleteClaudeProjectCommand` / `discoverClaudeGlobalCommands`（只读）/ `readClaudeCommandContent` / `validateClaudeCommandContent` / `defaultClaudeCommandContent`；`ClaudeProjectCommandInfo` 增加 `readonly`、`scope`。写入经共享 `ProjectResourceSecureWrite`（原子写 + 路径穿越保护）。`createClaudeProjectCommand` 保持返回 `string|null`（向后兼容），内部改走安全写。

## 概述

`ClaudeProjectCommandDiscovery.ts` 是 Claude Code 项目命令的文件系统扫描与创建 helper。它读取当前 vault 下的 `.claude/commands/*.md`，提取最小展示 metadata，供 Claude Code settings 显示项目命令；同时提供 `createClaudeProjectCommand()` 用于创建新命令文件。不依赖 Claude SDK query。

## 导入关系

上游: Node `fs/promises`, Node `path`
下游: Settings (via dynamic import), `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeProjectCommandInfo` | 单个 `.claude/commands/<name>.md` 的 metadata，包含 `name`、`description`、`filePath` 和 `relativePath` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectCommands(vaultPath)` | 扫描 vault `.claude/commands` 目录，返回按名称排序的项目命令列表 |
| `createClaudeProjectCommand(vaultPath, name, content?)` | 创建 `.claude/commands/<name>.md`，含默认模板，返回绝对路径或 null |

## 核心行为

- `vaultPath` 为空、空白或 `.claude/commands` 不存在 / 不可读时返回空数组，不抛错。
- 只扫描 `.claude/commands` 下的 `.md` 文件；非 `.md` 文件、隐藏文件、空文件名会被跳过。
- `description` 从 `.md` 文件中提取：优先使用第一个 1-3 级 Markdown heading，否则使用跳过 frontmatter、代码围栏、引用、表格和链接后的第一段正文。
- 正文描述超过 200 字符时截断为 197 字符加 `...`。
- `createClaudeProjectCommand` 会递归创建 `.claude/commands/` 目录，写入默认模板内容。
- 无效命令名（空、含 `/` 或 `\\`、以 `.` 开头）会返回 null。

## 注意事项

- Settings 直接使用 `discoverClaudeProjectCommands` 动态导入而非通过 `ClaudeCodeAdapter`，以避免 owner-guard 耦合。
- 不要把该扫描结果当作 SDK runtime truth；Claude Code runtime 会自行发现 `.claude/commands/` 中的命令。
- 保持错误吞掉并返回空数组的语义。
