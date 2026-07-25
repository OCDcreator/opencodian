# ConfigurationArchiveService

> **源码**: `src/core/agents/backend/ConfigurationArchiveService.ts`
> **状态**: [ACTIVE]

## 概述

`ConfigurationArchiveService` 是配置完整性 mutation 契约（见 `docs/adr/0001-complete-configuration-means-closed-loop-control.md`）的**归档存储 owner**：独占归档布局、清单校验、原子清单 I/O、保留策略与手动清理。这是从 `ProjectResourceSecureWrite` 抽离的高风险依赖切片（confined 文件系统 I/O + 对抗式清单校验），不是 thin helper；allowlist/expectedRevision 冲突检测/mutation 编排仍留在 secure-write owner。

## 职责

- **Confined 归档布局**：`<archiveRoot>/<backend>/<scope>/<kind>/<sha256(canonicalTarget)[:16]>/`，下含 `manifest.json`、`versions/<ts>-<hex>-overwrite.<ext>`、`deleted/<ts>-<hex>-delete.<ext>`。
- **路径段校验**：`backend`、`kind` 必须是单段安全 segment（拒 `..`、分隔符、控制字符、前导点）；`scope` 必须是 `global|project|local`。
- **Archive-root anchored realpath/symlink 防逃逸**：所有归档文件读、写、删除、manifest 读写都经 `confinedPath`——以归档根的 canonical realpath 为锚逐级 parent-walk，lstat 校验每个已存在组件，任何解析后逃出锚的 symlink 即拒绝；未存在目标锚定到最近存在祖先。防御 backend/scope/kind/path-hash/versions/deleted/manifest/entry 任意层级的预置 symlink。
- **Manifest 三态**：`absent`（首档 OK）/ `valid` / `present-but-invalid`（JSON 无效、schema 非法、entry 非法、backend/scope/kind/canonicalPath/format association 不匹配）。`present-but-invalid` **fail closed**：archiveOverwrite/archiveDeleted 抛出（archive failure），**不**当首档继续 mutation，也**不**覆盖旧 manifest。
- **Entry 严格校验**：`validateEntries` 校验 sha256=64 hex、mtime/size/timestamp 有限非负，且**文件名前缀时间戳与 entry.timestamp 关联**；format 一致；非法即 manifest invalid。
- **内容完整性**：`readLatestDeletedContent` 读取 entry 后校验 UTF-8 byte size 与 sha256 与 manifest entry 一致；被篡改（即使仍是合法 JSON/TOML）→ `archive-failed`，`safeRestoreFile` 保持 target 不变。
- **Revision/bytes 同源**：`archiveOverwrite` / `archiveDeleted` 在创建任何归档目录前读取稳定快照：realpath 必须等于 revision canonicalPath，前后 stat 的 dev/ino/mtime/size 必须稳定，最终 bytes 的 size/sha256 必须与传入 FileRevision 一致；不一致即抛出并保持归档未变化。
- **Confinement owner**：所有路径解析委托给共享 `PathConfinement`（见其模块文档），ENOENT-only missing-anchor，其余 fail-closed。
- **format association**：manifest 记录并严格校验 `format`；entry 文件扩展必须与 format 一致；readLatestDeletedContent/restore 不跨 json/jsonc/toml/markdown 误读；缺 format 的现存 manifest fail-closed（不静默猜测，不主动重写用户配置）。
- **对抗安全**：被篡改的清单/文件名**绝不**读或删 versions/deleted 目录之外的文件。
- **原子清单写**：temp + rename，失败清理 temp。
- **事务顺序（retention）**：archiveOverwrite 先安全写新归档文件→原子提交新 manifest→成功后才 best-effort 清除被 retention 移除的旧文件；manifest 提交失败时清理孤立的新文件，旧 manifest + 其引用文件保持有效。
- **保留策略**：overwrite 仅保留最新 `OVERWRITE_RETENTION_LIMIT`（=10）；deleted 永不自动清理。
- **Honest 清理 API（manifest-first + identity fence）**：`clearDeleted` 校验 manifest 的 backend/scope/kind/canonicalPath/hash **与实际扫描目录**一致；preflight 同时记录每个 entry 的 `dev/ino` 与内容 hash。原子提交 `deleted:[]` 后，删除前再次对词法 leaf 做 lstat/content/identity 复核，再把 leaf rename 到同目录随机 quarantine，复核同一 `dev/ino` 后才 rm。preflight 后被换成 symlink 时只会观察/移动 symlink 本身，绝不 follow 到 versions；同内容 regular-file swap 也因 dev/ino 不同而 fail closed。`cleared`=本次确实删除数，`absentEntries`=manifest 引用但已缺失（不计 cleared），`orphanedFiles`=逻辑清除但仍留盘，`manifestWriteFailed`=manifest 无法提交。**永不抛出**，**永不触碰** overwrite 历史。
- **restore 诚实 outcome**：`readLatestDeletedContent` 返回类型化 `ReadDeletedOutcome`——`not-found`（manifest/entry 确实不存在）、`found`（原始内容，调用方校验格式）、`archive-failed`（manifest 现存但非法/关联不匹配、symlink confinement 失败、manifest 非 ENOENT 读取错误、entry 读取失败）。`readManifestOutcome` 仅 ENOENT 视为 absent；其余读取错误→invalid→fail-closed。
- **只读 History API（fail closed + descriptor-bound）**：`listHistory(ctx)` 列出一个已经 allowlist 验证的 target；`catalogHistory({ backend, scope?, kind? })` 扫描归档清单，因此即使原文件已删除、文件系统 discovery 已不可见，仍可返回其 canonical target。catalog 在返回任何结果前校验实际 backend/scope/kind/hash 目录与 manifest 的 canonicalPath/format/entries 关联；versions/deleted entry 经严格 filename/confinement/lexical `lstat` 后，以 `O_RDONLY | O_NOFOLLOW` 打开（仅明确“不支持 flag”的错误可降级为 `O_RDONLY`，`ELOOP` 绝不降级），bytes 只从 `FileHandle.readFile` 读取。读前/读后都比较 lexical `lstat` 与 handle `fstat` 的 regular-file identity/state，再校验 size/sha256；任何非法 manifest、symlink、缺失/换 inode/篡改 entry 都使整批 `archive-failed`，不返回 partial catalog，也不会先读取 escaping leaf 的 bytes。调用方仍须在 `ProjectResourceSecureWrite` 层重新应用 target allowlist。
- **Opaque selected-entry identity**：history 只暴露 branded opaque string，不暴露或接受 archive path。identity 绑定 backend/scope/kind/canonical target/format、overwrite|delete、filename/timestamp/mtime/size/sha256，以及 listing 时从已打开 descriptor 捕获的 file state。POSIX identity 使用 device/inode；Windows 若 `dev/ino === 0`，退化 fence 仍比较 birthtime/ctime/mode，并始终比较 size/mtime。`readHistoryEntryContent(ctx, identity)` 复用与 catalog 相同的 descriptor-bound reader，在读取 bytes **之前**重验 token schema、context/manifest association、严格 filename、manifest entry 存在性、archive-root confinement、listing-time 与 handle/lexical file state；同内容 inode swap 也 fail closed。合法但已从 manifest 清除/retention 淘汰的 selection 返回 `not-found`。

## 导入关系

上游: Node `crypto`、`fs`、`fs/promises`、`path`；type-only 引用 `ProjectResourceSecureWrite` 的 `AllowlistMatch`/`ConfigurationScope`/`ConfigurationFormat`/`FileRevision`
下游: `ProjectResourceSecureWrite`（mutation 编排时构造本服务）

## 核心导出

| 导出 | 说明 |
|------|------|
| `ConfigurationArchiveService` | 归档 owner 类（构造取 `archiveRootPath`） |
| `archiveOverwrite(ctx, currentRevision)` | 归档当前内容为 overwrite（保留=10）；失败抛出（调用方中止 mutation） |
| `archiveDeleted(ctx, currentRevision)` | 归档当前内容为 deleted（永不自动清理）；失败抛出 |
| `listHistory(ctx)` | 只读列出一个已 allowlist target 的 validated overwrite/delete history |
| `catalogHistory({ backend, scope?, kind? })` | fail-closed 扫描 validated archived targets（包括已删除 target）；调用方须再做 target allowlist |
| `getHistoryEntryAssociation(identity)` | 仅解码 opaque identity 的 target association，供 secure-write allowlist 重验；不返回 archive path |
| `readHistoryEntryContent(ctx, identity)` | 重新验证 association + manifest + filename + entry identity/content 后读取 caller-selected entry |
| `readLatestDeletedContent(ctx)` | 类型化读取最近 deleted 内容：`found\|not-found\|archive-failed` |
| `clearDeleted({ backend, scope?, kind? })` | 手动清理 deleted（类型化、永不抛出） |
| `OVERWRITE_RETENTION_LIMIT` | overwrite 保留上限（10） |
| `ArchiveContext` / `ArchiveEntry` / `ArchiveManifest` / `ClearDeletedResult` | 原有归档/清理类型 |
| `ArchiveHistoryEntryIdentity` / `ArchiveHistoryEntrySummary` / `ArchiveHistoryTarget` / `ArchiveHistoryCatalogOutcome` | P1 history catalog 与 opaque selection 类型 |

## 注意事项

- mutation 归档操作（archiveOverwrite/archiveDeleted）**抛出**以中止 mutation；`clearDeleted` 是**永不抛出**的类型化 API——两者契约刻意不同且诚实。
- `readLatestDeletedContent` 返回原始内容；调用方（`safeRestoreFile`）在写入前用 `archive.format` 校验。
- `readHistoryEntryContent` 同样只返回经 archive 完整性验证的原始 bytes；selected restore 的格式校验、expectedRevision、archive-current-before-replace 与安全 commit 仍由 `ProjectResourceSecureWrite` 统一拥有。
- `catalogHistory` 本身不授权 canonical target；它只验证 archive tree。公共 P1 catalog 必须经 `catalogConfigurationArchiveHistory` 重新 allowlist 每个 target，且不得把内部 archive 路径交给 UI/调用方。
- 全局/项目/本地根的可写性由 `ProjectResourceSecureWrite` 的 allowlist 控制；本服务只在已校验的归档根内操作。
