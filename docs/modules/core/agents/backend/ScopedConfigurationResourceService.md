# Scoped Configuration Resource Service

> **源码**: `src/core/agents/backend/ScopedConfigurationResourceService.ts`
> **状态**: [ACTIVE]

## 概述

`ScopedConfigurationResourceService` 是 P1-A Project/Global 配置资源的共享安全编排 owner。它只集中各资源重复的 scope、窄根 allowlist、expected-revision 安全读取、archive-before-mutation、history catalog 与 selected restore plumbing；Command/Skill/Agent owner 继续拥有名称、相对目标路径、默认模板及 Markdown/TOML 内容校验。

## 安全边界

- `scope` 仅允许 `project | global`；调用方显式提供 vault root 或 home root `basePath`。
- 每个 facade 声明固定 `relativeRootPath`，生成的 allowlist **恰好**是该窄根；target 必须是其非空后代，不能扩大到整个 vault/home。
- 在把固定窄根作为 allowlist anchor 之前，**所有** read/mutation/history/catalog/restore seam 都先用 `assertWithinRoot(basePath, narrowRoot)` 验证 base→root 的 canonical component walk；escaping `.claude` / `.agents` / `.codex` 父 symlink 因而不能把外部目录“洗成”合法 root。create 的验证发生在 `mkdir` 之前，失败不会在外部物化目录。
- create 只接受 `expectedRevision:null`；update/delete 接受完整 `FileRevision`；restore 接受 revision 或明确 absent 的 `null`。
- content read 必须携带完整 expected revision。service 在已 confinement 的 lexical target 上先 `lstat`，再以 read-only file handle 打开（平台支持时加 `O_NOFOLLOW`），用 lexical stat ↔ handle fstat 的 device/inode identity fence 阻止检查与 open 之间的替换；读取前后都重验 canonical allowlist、regular-file identity、mtime/size，最后把 handle 内容 sha256 与四字段 revision 比对。任何 stale revision、同字节 inode swap、leaf/parent symlink 或读中修改只返回 typed `conflict` / `invalid-path` / `read-failed`，结果不含 content。
- Windows 若不提供 `O_NOFOLLOW`，保持 fail-closed 的 lexical `lstat` + handle `fstat` identity fence；dev/ino 不可用时降级比较 birthtime/mode，再叠加 canonical path、mtime、size、sha256 与第二 handle re-open 验证。
- 所有 mutation 委托 `ProjectResourceSecureWrite.safeWriteFile/safeDeleteFile/safeRestoreArchivedEntry`，继承 realpath/symlink 防逃逸、冲突检测、先归档再提交及无 force-overwrite 契约。
- restore 先验证 opaque identity 属于用户选择的资源目标；跨目标 selection 返回 `not-found`，不允许调用方传 archive path。若固定窄根因已删除资源而缺失，仅 `expectedRevision:null` 可先经只读 catalog 验证 identity、再按 create 同等 confinement 物化窄根并重验 history；非 null revision 直接 conflict，绝不隐式创建根或 force overwrite。

## 导入关系

上游: Node `crypto`、Node `fs` / `fs/promises`、Node `path`、`ProjectResourceSecureWrite`
下游: `ClaudeProjectCommandDiscovery`、`ClaudeProjectSkillDiscovery`、`ClaudeProjectAgentDiscovery`、`CodexProjectResourceDiscovery`

## 核心导出

| 导出 | 说明 |
|------|------|
| `ScopedConfigurationResourceService` | 固定 backend/kind/format/relative root 的底层安全 mutation/history owner |
| `createNamedScopedConfigurationResourceFacade(definition)` | 把资源 owner 的 name/path/template/validator 绑定到共享 service，返回 typed named facade |
| `ScopedConfigurationResourceContext` | 显式 `project | global`、`basePath` 与可选 archive root |
| `ScopedConfigurationResourceMutationResult` | P0 mutation 判别联合加诚实的 `scope` 与实际 `targetPath` |
| `ScopedConfigurationResourceReadResult` | 只有 `success` 携带 content；conflict/invalid-path/read-failed 均只返回 typed 失败与 location |
| `NamedScopedConfigurationResourceFacade` | expected-revision `read`、`readRevision`、CRUD、单目标/目录 history、selected restore 的公共接口 |

## 核心行为

- `readRevision` 只有在 name/path 有效且 target 通过窄根 allowlist 后才返回 revision；不存在、无效或越根均返回 `null`。
- `read` 不接受任意绝对路径；named facade 必须由 `scope + basePath + name + expectedRevision` 重新推导固定目标，并且只在 descriptor-bound 读前/读后证明全部一致后返回 content。
- create 在初始 resolve 后、`mkdir` 前以及共享 mutation owner 接管前都重做 base→窄根 confinement；正常缺失 root 可创建，resolve 后植入的 escaping parent symlink 在目录物化前返回 `invalid-path`，不会在外部创建目录或文件。
- `catalogHistory` 按 backend + scope + kind 扫描 validated archive，并再次用当前固定窄根授权 canonical target，因此可安全发现原文件已删除的资源。
- named facade 统一 trim/name validation 与 result location；格式专属 validation callback 在资源 owner 中声明并执行。
- legacy Project API 不经过重命名或删除；P1 facade 是 additive seam。

## 注意事项

- 不要在本模块添加 Claude/Codex 专属格式或字段逻辑；例如 Codex Agent 完整 TOML 校验必须留在 `CodexProjectResourceDiscovery`。
- 不要把 Global 设为隐式默认。service 只执行调用方明确传入的 scope；UI 的“新建”默认 Project 契约由设置 owner 负责。
- 这是 persistence/history owner，不提供 application/runtime 证明，也不改变 chat/runtime 的扁平资源 catalog。
