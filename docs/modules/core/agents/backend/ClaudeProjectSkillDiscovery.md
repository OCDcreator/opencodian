# Claude Project Skill Discovery

> **源码**: `src/core/agents/backend/ClaudeProjectSkillDiscovery.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeProjectSkillDiscovery.ts` 是 Claude Code 项目技能的文件系统扫描 helper。它只读取当前 vault 下的 `.claude/skills/<name>/SKILL.md`，提取最小展示 metadata，供 Claude Code settings 与 slash-command 发现表面显示项目技能；不依赖 Claude SDK query，也不写入 `.claude/**`。

## 导入关系

上游: Node `fs/promises`, Node `path`
下游: `ClaudeCodeAdapter`, `backend/index`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeProjectSkillInfo` | 单个 `.claude/skills/<name>/SKILL.md` 的只读 metadata，包含 `name`、`description`、`skillMdPath` 和 `relativePath` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverClaudeProjectSkills(vaultPath)` | 扫描 vault `.claude/skills` 目录，返回按名称排序的项目技能列表 |

## 核心行为

- `vaultPath` 为空、空白或 `.claude/skills` 不存在 / 不可读时返回空数组，不抛错。
- 只扫描 `.claude/skills` 的直接子目录；隐藏目录、空目录名、非目录和缺少 `SKILL.md` 的目录会被跳过。
- `description` 从 `SKILL.md` 中提取：优先使用第一个 1-3 级 Markdown heading，否则使用跳过 frontmatter、代码围栏、引用、表格和链接后的第一段正文。
- 正文描述超过 200 字符时截断为 197 字符加 `...`，避免设置页和 slash 目录输出过长。
- 返回结果包含绝对 `skillMdPath` 和相对 vault root 的 `.claude/skills/<name>` 路径，便于 UI 显示来源但不提供编辑入口。

## 注意事项

- 这是 read-only discovery seam，不是 skills authoring；新增创建/编辑/删除能力应由独立 owner 和明确的写入权限控制承接。
- 不要把该扫描结果当作 SDK runtime truth；SDK `options.skills` 和 `supportedCommands()` 仍由 Claude Code runtime 自己决定。
- 保持错误吞掉并返回空数组的语义，避免 settings 或 slash menu 因项目目录缺失而失败。
