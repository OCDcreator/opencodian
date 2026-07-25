# Codex Project Resource Discovery

> **源码**: `src/core/agents/backend/CodexProjectResourceDiscovery.ts`
> **状态**: [ACTIVE]

## 概述

`CodexProjectResourceDiscovery.ts` 是 Codex skills 与 agents 的文件系统资源 owner。它发现并管理：

- 项目 skills：`<vault>/.agents/skills/<name>/SKILL.md`（可创建/编辑/删除）
- 项目 agents：`<vault>/.codex/agents/<name>.toml`（可创建/编辑/删除）
- 全局 skills：`~/.agents/skills/<name>/SKILL.md`
- 全局 agents：`~/.codex/agents/<name>.toml`

Legacy Project CRUD 与只读 Global scanners 保持兼容。P1 新 API 要求显式 `project | global`，返回真实目标路径和 revision，并把创建、更新、删除、历史与 selected restore 全部交给 `ScopedConfigurationResourceService` / P0 安全契约。Codex legacy `~/.codex/prompts` 仍有意不被发现或展示。

## 导入关系

上游: Node `fs/promises`、`fs`、Node `path`、`fs.Dirent`、`smol-toml`、`ProjectResourceSecureWrite`、`ScopedConfigurationResourceService`
下游: `backend/index`、`SettingsCodexResourcesSection`

## 核心类型

| 类型 | 说明 |
|------|------|
| `CodexSkillInfo` | 单个 SKILL.md 的 metadata：`name`、`description`、`skillMdPath`、`relativePath`、`readonly`、`scope` |
| `CodexAgentInfo` | 单个 `*.toml` agent 的 metadata：`name`、`description`、`agentTomlPath`、`relativePath`、`readonly`、`scope` |
| `CodexResourceWriteResult` | 写操作结果：`{ ok: true; path }` 或 `{ ok: false; reason }` |
| `CodexResourceWriteError` | 写失败原因：`empty-vault` / `invalid-name` / `duplicate` / `path-traversal` / `outside-project-root` / `write-failed` |
| `CodexSkillResourceInfo` / `CodexAgentResourceInfo` | P1 可编辑 metadata；含显式 scope、真实文件路径与 `FileRevision` |
| `CodexResourceContext` | 显式 `project | global`、vault/home `basePath` 与可选 archive root |

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
| `discoverCodexSkillResources` / `discoverCodexAgentResources` | 显式 scope 的可编辑 discovery；返回 revision |
| `readCodexSkillResourceContent` / `readCodexAgentResourceContent` | 用 scope/base/name/expected revision 安全读取 Markdown/TOML；失败不返回 content |
| `create/update/deleteCodex{Skill,Agent}Resource` | create 预期 absent；update/delete 必须携带当前 revision |
| `list/catalogCodex{Skill,Agent}ResourceHistory` | validated 单目标历史或 scope catalog（包括已删除目标） |
| `restoreCodex{Skill,Agent}ResourceHistoryEntry` | opaque selected-entry restore；必须携带 expected revision/absent |

## 核心行为

- `vaultPath`/`homePath` 为空或目标目录不存在时返回空数组，不抛错。
- skill `description` 提取策略与 Claude discovery 一致：优先 1-3 级 heading，否则跳过 frontmatter/代码围栏/引用/表格/链接后的第一段。扫描只枚举经固定窄根验证的名字；description 与 revision 均来自同一次 descriptor-bound resource read，绝不先 raw-read 发现路径。
- agent discovery 的 metadata 同样来自 descriptor-bound TOML read；写入校验则用 `smol-toml` 解析**完整 TOML 文档**，并要求根级非空字符串 `name` / `description`。语法错误、重复键、错误类型或只存在 nested table 的必需字段均拒绝。
- 写操作经共享 `ProjectResourceSecureWrite.assertWithinRoot`（async、symlink-aware parent-walk）单一 chokepoint 校验目标路径在真实 vault root 之内；任一已有父路径为 symlink 逃出即拒绝。
- 原子写经共享 `atomicWriteFile`（临时文件 + rename）；rename 失败时清理临时文件，避免半成品残留。
- P1 Project/Global 窄根分别固定为 `<vault>/.agents/skills` / `~/.agents/skills` 与 `<vault>/.codex/agents` / `~/.codex/agents`；不能扩大到整个 home 或 vault。
- scope-aware mutation 先做 realpath/symlink allowlist，再执行 expected-revision 冲突检测、归档先行与安全同目录提交；没有 force-overwrite。
- P1 Edit/Preview 必须使用两个 scope-aware resource read facade；legacy `readCodex*Content(absolutePath)` 仅保留旧 caller 兼容语义。安全 read 以 `O_NOFOLLOW`（可用平台）及 lstat/fstat identity fence 拒绝 discovery 后的 symlink/inode swap。
- history catalog 可显示已删除目标，selected restore 只接收 opaque identity，并在所属资源设置区块内消费。
- `CodexResourceWriteError` 现为共享 `ProjectResourceWriteError` 的别名（含 `not-found`），不再有平行弱实现。

## 注意事项

- 不要把这些扫描结果当作 Codex runtime truth；`CodexAdapter.getRuntimeSkills()`（基于 app-server `skills/list`）才是聊天菜单的 runtime 真相。
- Legacy `discoverCodexGlobalSkills/Agents` 仍返回 readonly 资源；只有显式 scope-aware discovery 返回 `readonly:false` 与 revision，Global 必须由上层用户选择。
- TOML 格式专属校验保留在本 Codex owner；shared facade 不解析 TOML。
- Codex agent 保存仅影响后续 spawn 的会话；当前 app-server 无法选择或派发指定 agent（见设置页 reload-boundary 说明）。
- `CodexAdapter.getRuntimeSkills()` 的 `skills/list` cwd 分组、来源与 errors 语义不变；P1 不重构聊天资源的既有扁平菜单，也不把 persistence 成功冒充 runtime verified。
