# Claude Project Agent Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectAgentDiscovery.ts`
> **状态**: [ACTIVE]

> **更新**: 新增 `updateClaudeProjectAgent` / `deleteClaudeProjectAgent` / `discoverClaudeGlobalAgents`（只读）/ `readClaudeAgentContent` / `validateClaudeAgentContent` / `defaultClaudeAgentContent`；`ClaudeProjectAgentInfo` 增加 `readonly`、`scope`。写入经共享 `ProjectResourceSecureWrite`（原子写 + 路径穿越保护）。`createClaudeProjectAgent` 保持返回 `string|null`（向后兼容）。

## 概述

`ClaudeProjectAgentDiscovery.ts` 是 Claude Code 项目代理定义的文件系统扫描与创建 helper。它读取当前 vault 下的 `.claude/agents/*.md`，提取最小展示 metadata，供 Claude Code settings 显示项目代理；同时提供 `createClaudeProjectAgent()` 用于创建新代理定义文件。不依赖 Claude SDK query。

## 导入关系

上游: Node `fs`（静态 `existsSync` 探测）、Node `fs/promises`、Node `path`
下游: Settings (via dynamic import), `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeProjectAgentInfo` | 单个 `.claude/agents/<name>.md` 的 metadata，包含 `name`、`description`、`filePath` 和 `relativePath` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectAgents(vaultPath)` | 扫描 vault `.claude/agents` 目录，返回按名称排序的项目代理列表 |
| `createClaudeProjectAgent(vaultPath, name, content?)` | 创建 `.claude/agents/<name>.md`，含 YAML frontmatter 模板，返回绝对路径或 null |

## 核心行为

- `vaultPath` 为空、空白或 `.claude/agents` 不存在 / 不可读时返回空数组，不抛错。
- 只扫描 `.claude/agents` 下的 `.md` 文件；非 `.md` 文件、隐藏文件、空文件名会被跳过。
- `description` 从 `.md` 文件中提取：优先使用第一个 1-3 级 Markdown heading，否则使用跳过 frontmatter、代码围栏、引用、表格和链接后的第一段正文。
- 正文描述超过 200 字符时截断为 197 字符加 `...`。
- `createClaudeProjectAgent` 会递归创建 `.claude/agents/` 目录，写入包含 YAML frontmatter 的默认模板（仅 `name` 和 `description` 字段）。默认模板不含 `model` 字段，避免占位值导致 Claude runtime API 400。用户如需指定模型可在 frontmatter 中手动添加 `model` 行。
- 无效代理名（空、含 `/` 或 `\\`、以 `.` 开头）会返回 null。

## 注意事项

- Settings 直接使用 `discoverClaudeProjectAgents` 动态导入而非通过 `ClaudeCodeAdapter`，以避免 owner-guard 耦合。
- 不要把该扫描结果当作 SDK runtime truth；Claude Code runtime 会自行发现 `.claude/agents/` 中的代理定义。
- 代理文件格式遵循 Claude Code 的 markdown agent 定义约定：YAML frontmatter + markdown 正文作为 system prompt。
- 保持错误吞掉并返回空数组的语义。
- 项目资源的 create / update / delete 在模块顶层静态导入 `existsSync`；不要改为动态 `import('fs')`，否则 Obsidian 的渲染器无法解析该 Node 内建模块并会把实际写入前的异常归一为通用写入失败。
