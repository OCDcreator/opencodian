# Claude Project Skill Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectSkillDiscovery.ts`
> **状态**: [ACTIVE]

> **更新**: P1 保留全部 legacy Project API，并新增显式 `project | global` 的 scope-aware discovery、CRUD、revision、history catalog 与 selected restore。Global 目标只允许 `~/.claude/skills`；mutation 与 discovery content read 统一经过 P0 安全契约。

## 概述

`ClaudeProjectSkillDiscovery.ts` 是 Claude Code skill 的资源 owner。Legacy seam 继续读取/管理 vault 下 `.claude/skills/<name>/SKILL.md`；P1 seam 要求显式 scope 与 vault/home `basePath`，并返回真实路径及 revision。它不依赖 Claude SDK query，聊天资源目录仍沿用既有扁平 catalog。

## 导入关系

上游: Node `fs`（静态 `existsSync` 探测）、Node `fs/promises`、Node `path`、`ScopedConfigurationResourceService`
下游: `ClaudeCodeAdapter`, `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeProjectSkillInfo` | 单个 `.claude/skills/<name>/SKILL.md` 的只读 metadata，包含 `name`、`description`、`skillMdPath` 和 `relativePath` |
| `ClaudeSkillResourceInfo` | P1 可编辑资源 metadata；增加显式 `scope`、`readonly:false` 与 `FileRevision` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectSkills(vaultPath)` | 扫描 vault `.claude/skills` 目录，返回按名称排序的项目技能列表 |
| `createClaudeProjectSkill(vaultPath, name, content?)` | 创建 `.claude/skills/<name>/SKILL.md`，含 YAML frontmatter 默认模板（`name` + `description`），返回绝对路径或 null |
| `discoverClaudeSkillResources(context)` | 按显式 scope 扫描 Project/Global skill，并返回真实路径与 revision |
| `readClaudeSkillResourceContent(options)` | expected-revision descriptor-bound 安全读取；symlink/swap/stale 失败不返回 content |
| `create/update/deleteClaudeSkillResource` | expected-revision 约束下的安全 CRUD |
| `list/catalogClaudeSkillResourceHistory` | validated 单目标历史或 scope catalog（包括已删除目标） |
| `restoreClaudeSkillResourceHistoryEntry` | 用 opaque identity 恢复选中版本；冲突时不覆盖外部 winner |

## 核心行为

- `vaultPath` 为空、空白或 `.claude/skills` 不存在 / 不可读时返回空数组，不抛错。
- 只扫描 `.claude/skills` 的直接子目录；隐藏目录、空目录名、非目录和缺少 `SKILL.md` 的目录会被跳过。
- Legacy 与 P1 discovery 都先校验固定 skills root，再用窄根 allowlist 取得 revision，并只从 descriptor-bound read 的 success 内容提取 description；skill/SKILL.md 或固定根 symlink、swap、stale revision 均被跳过且不返回根外 bytes。
- P1 discovery 复用同一次 descriptor-bound read 返回的 revision，避免 description 与稍后二次 revision 读取发生版本错配。
- `description` 从 `SKILL.md` 中提取：优先使用第一个 1-3 级 Markdown heading，否则使用跳过 frontmatter、代码围栏、引用、表格和链接后的第一段正文。
- 正文描述超过 200 字符时截断为 197 字符加 `...`，避免设置页和 slash 目录输出过长。
- 返回结果包含绝对 `skillMdPath` 和相对 vault root 的 `.claude/skills/<name>` 路径，便于 UI 显示来源但不提供编辑入口。
- P1 Project root 固定为 `<vault>/.claude/skills`，Global root 固定为 `~/.claude/skills`；窄根 allowlist、realpath/symlink 防逃逸、归档先行与原子提交由共享 owner 统一执行。
- owner 继续负责 Markdown/frontmatter 名称与内容语义；shared facade 不承担格式专属逻辑。
- P1 Edit/Preview 必须消费 `readClaudeSkillResourceContent`；legacy 绝对路径 read 仅为旧 caller 兼容 seam。

## 注意事项

- `discoverClaudeGlobalSkills(homePath)` 仍是 legacy readonly seam；显式 scope-aware discovery 才返回可编辑资源与 revision，Global 不能由默认 Project 行为隐式选中。
- 不要把该扫描结果当作 SDK runtime truth；SDK `options.skills` 和 `supportedCommands()` 仍由 Claude Code runtime 自己决定。
- P1 不重构 slash/chat 菜单；保存结果只证明 persistence，application/runtime 证据由更上层诚实呈现。
- 保持错误吞掉并返回空数组的语义，避免 settings 或 slash menu 因项目目录缺失而失败。
- 项目资源的 create / update / delete 在模块顶层静态导入 `existsSync`；不要改为动态 `import('fs')`，否则 Obsidian 的渲染器无法解析该 Node 内建模块并会把实际写入前的异常归一为通用写入失败。
