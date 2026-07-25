# Claude Project Command Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectCommandDiscovery.ts`
> **状态**: [ACTIVE]

> **更新**: P1 在保留全部 legacy Project API 的基础上，新增显式 `project | global` 的 scope-aware discovery、CRUD、revision、history catalog 与 selected restore。Global 目标只允许 `~/.claude/commands`；mutation 与 discovery content read 均经 P0 安全契约。

## 概述

`ClaudeProjectCommandDiscovery.ts` 是 Claude Code command 的资源 owner。Legacy seam 继续读取/管理当前 vault 的 `.claude/commands/*.md`；P1 seam 则要求调用方显式传入 `scope` 与对应的 vault/home `basePath`，并返回实际目标路径和 revision。它不依赖 Claude SDK query，也不改变聊天资源目录。

## 导入关系

上游: Node `fs`（静态 `existsSync` 探测）、Node `fs/promises`、Node `path`、`ScopedConfigurationResourceService`
下游: Settings (via dynamic import), `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeProjectCommandInfo` | 单个 `.claude/commands/<name>.md` 的 metadata，包含 `name`、`description`、`filePath` 和 `relativePath` |
| `ClaudeCommandResourceInfo` | P1 可编辑资源 metadata；增加显式 `scope`、`readonly:false` 与 `FileRevision` |
| `ClaudeCommandResourceContext` | 显式 `project | global`、vault/home `basePath` 与可选 archive root |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectCommands(vaultPath)` | 扫描 vault `.claude/commands` 目录，返回按名称排序的项目命令列表 |
| `createClaudeProjectCommand(vaultPath, name, content?)` | 创建 `.claude/commands/<name>.md`，含默认模板，返回绝对路径或 null |
| `discoverClaudeCommandResources(context)` | 按显式 scope 扫描 Project/Global command，并返回真实路径与 revision |
| `readClaudeCommandResourceContent(options)` | 用 `scope + basePath + name + expectedRevision` 进行 descriptor-bound 安全读取；失败结果不含 content |
| `create/update/deleteClaudeCommandResource` | P1 安全 mutation；create 要求 `expectedRevision:null`，update/delete 要求当前 revision |
| `list/catalogClaudeCommandResourceHistory` | 列出单目标或所属 scope 的 validated history；catalog 可发现已删除目标 |
| `restoreClaudeCommandResourceHistoryEntry` | 用 opaque entry identity 与 expected revision 恢复用户选中的版本 |

## 核心行为

- `vaultPath` 为空、空白或 `.claude/commands` 不存在 / 不可读时返回空数组，不抛错。
- 只扫描 `.claude/commands` 下的 `.md` 文件；非 `.md` 文件、隐藏文件、空文件名会被跳过。
- Legacy 与 P1 discovery 都先校验固定 commands root，再用窄根 allowlist 取得 revision，并只从 descriptor-bound read 的 success 内容提取 description；叶子或固定根 symlink、swap、stale revision 均被跳过且不返回根外 bytes。
- P1 discovery 复用同一次 descriptor-bound read 返回的 revision，避免 description 与稍后二次 revision 读取发生版本错配。
- `description` 从 `.md` 文件中提取：优先使用第一个 1-3 级 Markdown heading，否则使用跳过 frontmatter、代码围栏、引用、表格和链接后的第一段正文。
- 正文描述超过 200 字符时截断为 197 字符加 `...`。
- `createClaudeProjectCommand` 会递归创建 `.claude/commands/` 目录，写入默认模板内容。
- 无效命令名（空、含 `/` 或 `\\`、以 `.` 开头）会返回 null。
- P1 Project root 固定为 `<vault>/.claude/commands`，Global root 固定为 `~/.claude/commands`；窄根 allowlist、realpath/symlink 校验、归档先行与同目录安全提交均由共享 owner 执行。
- update/delete/restore 的 revision 不匹配返回 `conflict`；没有 force-overwrite，调用方草稿不在本模块内被清空或改写。
- P1 编辑/预览调用方必须使用 `readClaudeCommandResourceContent`；legacy `readClaudeCommandContent(filePath)` 为旧 caller 保持兼容，不提供 scope/revision 安全证明。
- history/restore 保留在 command 所属设置区块可调用的 API 中，不建立独立 Archive 资源面。

## 注意事项

- Settings 直接使用 `discoverClaudeProjectCommands` 动态导入而非通过 `ClaudeCodeAdapter`，以避免 owner-guard 耦合。
- 不要把该扫描结果当作 SDK runtime truth；Claude Code runtime 会自行发现 `.claude/commands/` 中的命令。
- 保持错误吞掉并返回空数组的语义。
- `discoverClaudeGlobalCommands(homePath)` 仍保持 legacy readonly 语义；只有显式 scope-aware `discoverClaudeCommandResources({ scope: 'global', ... })` 返回可编辑资源与 revision。
- 聊天/runtime catalog 继续使用既有扁平资源目录；P1 API 不改变菜单架构，也不把 persistence 成功冒充 runtime verified。
- 项目资源的 create / update / delete 在模块顶层静态导入 `existsSync`；不要改为动态 `import('fs')`，否则 Obsidian 的渲染器无法解析该 Node 内建模块并会把实际写入前的异常归一为通用写入失败。
