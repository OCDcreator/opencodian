# ProjectResourceSecureWrite

> **源码**: `src/core/agents/backend/ProjectResourceSecureWrite.ts`
> **状态**: [ACTIVE]

## 概述

`ProjectResourceSecureWrite.ts` 集中隔离项目资源与配置文件写入的高风险安全边界，是配置完整性（complete configuration，见 `docs/adr/0001`）的单一 mutation chokepoint。

### Legacy 项目资源写入（仍保留，未改动调用方）

- 名字安全校验（`isSafeResourceName`）
- 路径穿越 / 越根保护（`assertWithinRoot`，单一 root 的 symlink-aware parent-walk）
- 原子写（`atomicWriteFile`：临时文件 + 最终 `rename`，失败清理临时文件，绝不残留半成品）

### 共享安全配置契约（additive）

2026-07-24 新增，向后兼容：保留 `assertWithinRoot` 与 `atomicWriteFile` 的签名和现有调用方，新增一套显式 allowlist + 归档 + 冲突检测的契约。

- **Allowlist roots（global/project/local）**：`assertWithinAllowlistedRoot(allowlist, targetPath)` 解析每个 root 的 realpath，逐组件 `lstat`，任一 symlink 逃出匹配的 real root 即拒绝（`outside-allowlist`）。相对路径用 *词法* root 计算、从 *real* root 下行，保证 macOS `/var -> /private/var` 等根级 symlink 下两端一致。
- **重要不变量变更**：全局配置根（`~/.claude`、`~/.agents`、`~/.codex`、`~/.opencode` 等）**不再严格只读**——当且仅当它们作为显式 allowlist 条目传入时才可写。realpath parent-walk 是阻止 symlink/路径穿越逃逸的唯一防线。
- **FileRevision（乐观并发）**：`computeFileRevision` 返回 `{ canonicalPath, mtimeMs, size, sha256 }`；**四个字段全部参与比较**（`revisionsMatch`：canonicalPath/mtimeMs/size/sha256 任一不同即 `conflict`，可检出同内容不同 mtime 的外部重写、以及同内容不同 canonicalPath 的文件）。所有非 create 的 mutation（update/delete/restore）必须带 `expectedRevision: FileRevision | null`——`null` 明确表示「预期不存在」，不可省略/undefined 造成意外覆盖。外部变更返回 `conflict`，**没有 force-overwrite API**。归档/清单/保留/原子 I/O 由独立的 `ConfigurationArchiveService` 拥有（见其模块文档）。
- **归档先于 mutation**：`safeWriteFile` / `safeDeleteFile` 在写/删之前必须先把当前内容归档；归档失败即中止（target 不变）。
- **竞态提交身份栅栏**：create 与 expected-absent restore 先写同目录随机 temp，再用原子 `link(temp, target)` 执行 create-if-absent；并发创建只有一个成功，其余返回 `conflict`。expected-present 的 update/delete/restore 不只做一次 recheck：先捕获完整 `FileRevision` 加私有 `dev`/`ino`，原子 `rename(target, .opencodian-commit-*/claimed)` 取得 claim，再在 claimed 路径校验同一 inode（该比较故意忽略 rename 自身改变的 canonicalPath）。update/present-restore 仅用 `link(temp, target)` 发布，delete 仅 unlink claimed 文件，因而绝不覆盖或删除 claim 后出现的 target winner。
- **冲突、清理与崩溃语义**：claim 发现外部版本时，若 target 仍缺失则以 create-if-absent link 恢复 claimed bytes 并清理 staging；普通成功和这类单 winner conflict 都不残留 `.opencodian-commit-*` / temp。若恢复时已有第二个 external winner，插件绝不覆盖 winner，也不删除 first winner 的 claimed bytes；返回 `write-failed.cause` 会给出保留的精确 `.../.opencodian-commit-*/claimed` 路径。任何清理 I/O 失败同样返回含残留路径的 `write-failed`，不假报完全清理。进程在 claim 与发布/恢复之间崩溃时也可能留下该私有目录并暂时使 target 缺失；此前的 archive 已保留可恢复版本，用户可从所属设置区块的历史/恢复入口恢复，维护者可按同一 hidden path 定位残留，不做无证据的启动时自动删除。
- **归档快照一致性**：archive owner 在写 manifest 前复核 canonicalPath/mtime/size/sha256，并用前后 stat 的 dev/ino/metadata 保证读取快照稳定；manifest 的 size/hash 始终来自同一份已验证 bytes。
- **归档布局**（默认根 `~/.opencodian/archive`，可注入）：`<backend>/<scope>/<kind>/<sha256(canonicalPath)[:16]>/` 下 `manifest.json` + `versions/<utc>-<rand>-overwrite.<ext>` + `deleted/<utc>-<rand>-delete.<ext>`。
- **保留策略**：overwrite 仅保留最新 `OVERWRITE_RETENTION_LIMIT`（=10）个；**deleted 永不自动清理**，只能由 `clearDeletedArchives` 手动清除。
- **Restore**：`safeRestoreFile` 取最近一条 deleted 记录写回；写回前**先归档当前 target**（作为 overwrite）。
- **内容校验 / JSONC patch**：`validateConfigurationContent(format, content)`（strict JSON 拒注释/尾逗号/非对象根；JSONC 允许注释与尾逗号；TOML 全量 smol-toml 解析；markdown 恒通过）；`applyJsoncPathEdits` 用 jsonc-parser 结构化修改，**保留注释、键序、未知字段、缩进与 EOL**。
- **依赖**：`jsonc-parser`、`smol-toml`（运行时依赖，随 main.js 打包）。

## 导入关系

上游: Node `fs`、`fs/promises`、`node:crypto`、`node:os`、Node `path`、`jsonc-parser`、`smol-toml`、`ConfigurationFileCommitOperations`（最终 rename/link/unlink syscall seam）
下游: `ClaudeProjectCommandDiscovery`、`ClaudeProjectSkillDiscovery`、`ClaudeProjectAgentDiscovery`、`CodexProjectResourceDiscovery`、`backend/index`、（后续阶段的配置编辑器）

## 核心导出

| 导出 | 说明 |
|------|------|
| `ProjectResourceWriteError` | 写失败原因联合（含 `outside-allowlist`、`archive-failed`；`conflict` 仅作为 `SafeFileMutationResult` 状态，非抛出错误码） |
| `ProjectResourceError` | 携带 code 的 Error 子类 |
| `isSafeResourceName(name)` | 名字安全校验 |
| `assertWithinRoot(rootPath, targetPath)` | 单 root 安全断言（legacy，async） |
| `atomicWriteFile(targetPath, content)` | 原子写（legacy） |
| `toWriteErrorCode(err)` | 异常归一为写错误 code |
| `ConfigurationScope` / `ConfigurationFormat` | `global\|project\|local` / `markdown\|json\|jsonc\|toml` |
| `FileRevision` | `{ canonicalPath, mtimeMs, size, sha256 }` |
| `SafeFileMutationResult` | 判别联合：`success\|conflict(expected:FileRevision\|null, current:FileRevision\|null)\|invalid-content\|invalid-path\|not-found\|archive-failed\|write-failed`（无 `duplicate`，create-when-exists 归入 conflict） |
| `ConfigurationEvidence` / `isConfigurationEvidenceComplete` | persistence/application/runtime 三轴 + 完备判定 |
| `ConfigurationAllowlist` / `AllowlistMatch` | 显式 allowlist + 匹配结果 |
| `assertWithinAllowlistedRoot(allowlist, targetPath)` | 多 root 安全断言（async，realpath parent-walk） |
| `computeFileRevision(targetPath)` | 当前 FileRevision（不存在返回 null） |
| `validateConfigurationContent(format, content)` | strict JSON / JSONC / TOML 校验 |
| `applyJsoncPathEdits(content, edits)` | JSONC 路径编辑，保留格式 |
| `safeWriteFile` / `safeDeleteFile` / `safeRestoreFile` | 带归档+冲突检测的安全 mutation |
| `clearDeletedArchives(options)` | 手动清除 deleted 归档（best-effort） |
| `OVERWRITE_RETENTION_LIMIT` / `resolveDefaultArchiveRoot` | 保留上限 / 默认归档根 |

## 注意事项

- 这是唯一的配置写入安全 chokepoint；新增资源/配置类型写入必须复用本模块，不得另起重复实现。
- 所有 `assert*` 与 `safe*` 均为 async，调用点必须 `await`。
- 纯 `path.resolve` 词法检查**不能**防御父目录符号链接逃逸；本实现用 `realpath` + `lstat` parent-walk 才安全。
- 全局根的可写性由 allowlist 显式授权控制；默认行为（未列入 allowlist）仍是拒绝。
- `safe*` 系列返回 `SafeFileMutationResult`，调用方必须按 `status` 分支；没有 force-overwrite。
- create/update/delete/restore 的并发回归测试必须覆盖「预期 revision 检查后发生外部修改」；不得只测试调用前已修改的静态冲突。
- 提交边界回归必须从公开 `safe*` API 进入，并在 facade syscall 前注入外部写入；断言最终外部 bytes、`conflict` / 可定位的 `write-failed`，以及普通/单 winner 路径没有 `.opencodian-commit-*` 或 temp 残留。
