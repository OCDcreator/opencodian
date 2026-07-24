# Codex Project Resource Discovery

> **源码**: `src/core/agents/backend/CodexProjectResourceDiscovery.ts`
> **状态**: [ACTIVE]

## 概述

`CodexProjectResourceDiscovery.ts` 是 Codex 资源（skills 与 agents）的纯文件系统扫描 + 安全写入 owner。它发现并管理：

- 项目 skills：`<vault>/.agents/skills/<name>/SKILL.md`（可创建/编辑/删除）
- 项目 agents：`<vault>/.codex/agents/<name>.toml`（可创建/编辑/删除）
- 全局 skills：`~/.agents/skills/<name>/SKILL.md`（当前 P0 discovery 路径只读）
- 全局 agents：`~/.codex/agents/<name>.toml`（当前 P0 discovery 路径只读）

当前 P0 discovery owner 只读发现全局资源，没有全局 mutation API；P1 若开放全局 CRUD，只能经共享安全文件契约与 allowlisted-root 校验。当前模块仅允许 vault 内的项目根写入，且每次写入都经过校验（必需字段、名字安全、重复检测、路径穿越保护）并以原子方式（临时文件 + rename）完成，避免残留半成品。Codex legacy `~/.codex/prompts` 有意不被发现或展示。

## 导入关系

上游: Node `fs/promises`、`fs`、Node `path`、`fs.Dirent`、`ProjectResourceSecureWrite`（共享安全写 chokepoint）
下游: `backend/index`、`SettingsCodexResourcesSection`

## 核心类型

| 类型 | 说明 |
|------|------|
| `CodexSkillInfo` | 单个 SKILL.md 的 metadata：`name`、`description`、`skillMdPath`、`relativePath`、`readonly`、`scope` |
| `CodexAgentInfo` | 单个 `*.toml` agent 的 metadata：`name`、`description`、`agentTomlPath`、`relativePath`、`readonly`、`scope` |
| `CodexResourceWriteResult` | 写操作结果：`{ ok: true; path }` 或 `{ ok: false; reason }` |
| `CodexResourceWriteError` | 写失败原因：`empty-vault` / `invalid-name` / `duplicate` / `path-traversal` / `outside-project-root` / `write-failed` |

## 核心导出

| 导出 | 说明 |
|------|------|
| `discoverCodexProjectSkills(vaultPath)` | 扫描项目 `.agents/skills`，返回可编辑 skill 列表 |
| `discoverCodexGlobalSkills(homePath)` | 扫描全局 `~/.agents/skills`，返回当前 P0 路径的只读 skill 列表 |
| `discoverCodexProjectAgents(vaultPath)` / `discoverCodexGlobalAgents(homePath)` | 同上，针对 `.codex/agents/*.toml` |
| `createCodexProjectSkill` / `updateCodexProjectSkill` / `deleteCodexProjectSkill` | 项目 skill CRUD（带校验 + 原子写 + 路径穿越保护） |
| `createCodexProjectAgent` / `updateCodexProjectAgent` / `deleteCodexProjectAgent` | 项目 agent CRUD |
| `validateCodexSkillContent` / `validateCodexAgentContent` | 校验 frontmatter / TOML 必需字段，返回错误消息或 null |
| `isSafeResourceName(name)` | 名字安全校验（非空、无路径分隔符、无前导点、无控制字符） |

## 核心行为

- `vaultPath`/`homePath` 为空或目标目录不存在时返回空数组，不抛错。
- skill `description` 提取策略与 Claude discovery 一致：优先 1-3 级 heading，否则跳过 frontmatter/代码围栏/引用/表格/链接后的第一段。
- agent `description`/`name` 通过轻量正则从 TOML 提取（无 TOML 解析依赖）。
- 写操作经共享 `ProjectResourceSecureWrite.assertWithinRoot`（async、symlink-aware parent-walk）单一 chokepoint 校验目标路径在真实 vault root 之内；任一已有父路径为 symlink 逃出即拒绝。
- 原子写经共享 `atomicWriteFile`（临时文件 + rename）；rename 失败时清理临时文件，避免半成品残留。
- 当前 P0 路径没有全局资源写入 API；UI 仅提供只读查看入口。P1 全局 CRUD 只能经共享安全文件契约与 allowlisted-root 校验开放。
- `CodexResourceWriteError` 现为共享 `ProjectResourceWriteError` 的别名（含 `not-found`），不再有平行弱实现。

## 注意事项

- 不要把这些扫描结果当作 Codex runtime truth；`CodexAdapter.getRuntimeSkills()`（基于 app-server `skills/list`）才是聊天菜单的 runtime 真相。
- TOML 校验是字段存在性校验，非完整 TOML 语法校验；若后续需要严格解析，再引入受信任的 TOML 依赖。
- Codex agent 保存仅影响后续 spawn 的会话；当前 app-server 无法选择或派发指定 agent（见设置页 reload-boundary 说明）。
