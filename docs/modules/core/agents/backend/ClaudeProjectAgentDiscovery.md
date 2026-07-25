# Claude Project Agent Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectAgentDiscovery.ts`
> **状态**: [ACTIVE]

> **更新**: P1 保留全部 legacy Project API，并新增显式 `project | global` 的 scope-aware discovery、CRUD、revision、history catalog 与 selected restore。Global 目标只允许 `~/.claude/agents`；mutation 与 discovery content read 统一经过 P0 安全契约。

## 概述

`ClaudeProjectAgentDiscovery.ts` 是 Claude Code Markdown agent 定义的资源 owner。Legacy seam 继续管理 vault 下 `.claude/agents/*.md`；P1 seam 要求显式 scope 与 vault/home `basePath`，并返回真实路径及 revision。不依赖 Claude SDK query。

## 导入关系

上游: Node `fs`（静态 `existsSync` 探测）、Node `fs/promises`、Node `path`、`ScopedConfigurationResourceService`
下游: Settings (via dynamic import), `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeProjectAgentInfo` | 单个 `.claude/agents/<name>.md` 的 metadata，包含 `name`、`description`、`filePath` 和 `relativePath` |
| `ClaudeAgentResourceInfo` | P1 可编辑资源 metadata；增加显式 `scope`、`readonly:false` 与 `FileRevision` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectAgents(vaultPath)` | 扫描 vault `.claude/agents` 目录，返回按名称排序的项目代理列表 |
| `createClaudeProjectAgent(vaultPath, name, content?)` | 创建 `.claude/agents/<name>.md`，含 YAML frontmatter 模板，返回绝对路径或 null |
| `discoverClaudeAgentResources(context)` | 按显式 scope 扫描 Project/Global agent，并返回真实路径与 revision |
| `readClaudeAgentResourceContent(options)` | expected-revision descriptor-bound 安全读取；失败 union 不携带 content |
| `create/update/deleteClaudeAgentResource` | expected-revision 约束下的安全 CRUD |
| `list/catalogClaudeAgentResourceHistory` | validated 单目标历史或 scope catalog（包括已删除目标） |
| `restoreClaudeAgentResourceHistoryEntry` | 用 opaque identity 恢复选中版本；冲突时不覆盖外部 winner |

## 核心行为

- `vaultPath` 为空、空白或 `.claude/agents` 不存在 / 不可读时返回空数组，不抛错。
- 只扫描 `.claude/agents` 下的 `.md` 文件；非 `.md` 文件、隐藏文件、空文件名会被跳过。
- Legacy 与 P1 discovery 都先校验固定 agents root，再用窄根 allowlist 取得 revision，并只从 descriptor-bound read 的 success 内容提取 description；叶子或固定根 symlink、swap、stale revision 均被跳过且不返回根外 bytes。
- P1 discovery 复用同一次 descriptor-bound read 返回的 revision，避免 description 与稍后二次 revision 读取发生版本错配。
- `description` 从 `.md` 文件中提取：优先使用第一个 1-3 级 Markdown heading，否则使用跳过 frontmatter、代码围栏、引用、表格和链接后的第一段正文。
- 正文描述超过 200 字符时截断为 197 字符加 `...`。
- `createClaudeProjectAgent` 会递归创建 `.claude/agents/` 目录，写入包含 YAML frontmatter 的默认模板（仅 `name` 和 `description` 字段）。默认模板不含 `model` 字段，避免占位值导致 Claude runtime API 400。用户如需指定模型可在 frontmatter 中手动添加 `model` 行。
- 无效代理名（空、含 `/` 或 `\\`、以 `.` 开头）会返回 null。
- P1 Project root 固定为 `<vault>/.claude/agents`，Global root 固定为 `~/.claude/agents`；窄根 allowlist、realpath/symlink 防逃逸、归档先行与原子提交由共享 owner 执行。
- Markdown/frontmatter 格式与默认模板仍由本 owner 校验；shared facade 只集中 scope/revision/history plumbing。
- P1 Edit/Preview 必须使用 scope-aware `readClaudeAgentResourceContent`；legacy path read 签名与行为只为既有 caller 保持兼容。

## 注意事项

- Settings 直接使用 `discoverClaudeProjectAgents` 动态导入而非通过 `ClaudeCodeAdapter`，以避免 owner-guard 耦合。
- 不要把该扫描结果当作 SDK runtime truth；Claude Code runtime 会自行发现 `.claude/agents/` 中的代理定义。
- 代理文件格式遵循 Claude Code 的 markdown agent 定义约定：YAML frontmatter + markdown 正文作为 system prompt。
- 保持错误吞掉并返回空数组的语义。
- `discoverClaudeGlobalAgents(homePath)` 仍保持 legacy readonly 语义；只有显式 scope-aware discovery 返回可编辑资源与 revision。
- P1 不改变聊天/runtime 扁平目录；保存成功只证明 persistence，不自动构造 runtime verified 结论。
- 项目资源的 create / update / delete 在模块顶层静态导入 `existsSync`；不要改为动态 `import('fs')`，否则 Obsidian 的渲染器无法解析该 Node 内建模块并会把实际写入前的异常归一为通用写入失败。
