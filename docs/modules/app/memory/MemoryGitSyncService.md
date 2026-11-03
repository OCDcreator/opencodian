# Memory Git Sync Service

> **源码**: `src/app/memory/MemoryGitSyncService.ts`
> **状态**: [REVIEW]

## 概述

共享记忆树的 git 整树同步(`MemoryGitSyncService` + `syncMemoryTree`/`ensureMemorySyncRepo`)。与 opencode-zmem / deepseek-zmem 共用锁文件 `.memory-sync.lock`、分支 `main`、ignore 规则(`.last-injection.json`/`metrics.jsonl`/系统杂物)、commit 消息形状与 origin 比较规则。多个插件可指向同一棵物理树，跨插件锁串行化同步周期。兼容约定与 OpenCodian 的额外安全门见 `docs/status/memory-sync-protocol.md`。

## 关键点

| 导出 | 说明 |
|------|------|
| `syncMemoryTree(root, url)` | 根护栏 → 取锁 → **origin 端点校验** → unborn 远端采用 → bootstrap → **unmerged 门** → `add -A` → **密钥门（暂存 blob）** → 有暂存变更则 commit → fetch + `merge --autostash --no-edit --no-overwrite-ignore origin/main` → **合并后 unmerged 门** → push |
| `ensureMemorySyncRepo()` | 返回 `string \| null`：origin 与配置的**展开端点**不同即拒绝；缺少时 add；等价时保留原字符串；额外校验全部 `remote.origin.url` 与 `pushurl`；通过后补全 `.gitignore`/`.gitattributes`，只追加缺失行 |
| `normalizeRemoteUrl()` / `sameRemoteEndpoint()` | 规范化 scp/SSH、忽略用户名/大小写/`.git`/末尾斜杠；缺省端口是通配（scp 形式），两个不同显式端口不算同一服务；只用于比较，不重写 URL |
| `redactRemoteUrl()` / `redactSyncDetail()` | 结果与轨迹中的 URL 用户名/凭据统一脱敏，避免 Notice/metrics 泄露 |
| `checkMemorySyncTreeRoot()` | 根护栏:拒绝 home 目录/文件系统根/不存在的路径/无 `projects/` 的非空目录,防误指根被 `add -A` 整目录推送 |
| `MemoryGitSyncService` | 5s 写后防抖、5min 周期、in-flight 互斥、`getStatus().last` 保留结果；可选结果回调用于宿主通知，回调错误隔离，dispose 后不通知 |

## 边界与约束

- fail-soft 契约:任何 git 失败只落入结果 `detail`,绝不抛进聊天路径;锁文件本身的 fs 错误也被接住(`lock: …`)而不是逃逸。
- origin 不一致在 metadata 补全、暂存和提交之前拒绝，结果包含双方 URL 和显式迁移命令；不改 origin、index 或 HEAD，不提交、不推送。迁移由用户主动执行。
- unborn 分支先 fetch 再采用远端历史，不制造无关 root commit；对未跟踪文件（包含被 ignore 的草稿）先做碰撞检查，checkout 使用 `--no-overwrite-ignore -b`，不强制覆盖或重置分支。
- 合并只用 fetch + merge，不 rebase/reset；merge 带 `--no-overwrite-ignore`，不会静默覆盖本地被 ignore 的草稿。普通冲突执行 `merge --abort` 保留本地提交与文件；autostash 恢复冲突即使 merge 退出成功也拒绝 push，保留 stash 与 unmerged 证据，下一轮继续拒绝提交。
- 安全根的非 locked 周期向树根 `metrics.jsonl` 追加 `{t,ok,committed,pulled,pushed,blockedSecrets,detail}`；本机 `.git/info/exclude` 先排除该文件，拒绝路径不必修改工作树 `.gitignore`。无效根和未持锁的 no-op 不写轨迹；`metrics.jsonl` 已被跟踪时跳过写入（ignore 不保护已跟踪路径）；`detail` 中的 URL 凭据统一脱敏；诊断失败不改变同步结果。
- 密钥门:扫描**所有已暂存文件**（不止 `.md`），读取的是**暂存 blob**（`git show :<path>`），不是可被并发改写的工区文件；命中即撤出暂存（`restore --staged`；unborn 分支用 `rm --cached -f`）并记入 `blockedSecrets`。暂存 blob 读不到或撤出失败则整轮中止（宁缺毋推）。诊断文件与编辑器临时产物（`*.tmp`、`~$*`、`.tmpdir/`）即使被旧树跟踪也会被撤出暂存。召回侧 guard 只挡注入,这道门挡的是远程。
- unmerged 门必须在 `add -A` **之前**:`add` 会清除 unmerged 证据并把冲突标记stage进去。append-only 的 `MEMORY.md` 用 `.gitattributes` union merge 消解最常见的跨机冲突。
- 20s 命令超时 kill 可能遗留 `.git/index.lock`:错误路径上龄期 >60s 的 index.lock 会被清除,下一轮自愈(新锁不动——那是活跃 git)。
- 仓库位于外部根(含 `projects/` 的那一层);ZCode 写入的文件随 `add -A` 一同同步。
- commit 身份用每命令 `-c user.name=opencodian-memory@<host>`,不依赖全局 git 配置。
- 仅在 `memoryExternalRoot` + `memorySyncRemoteUrl` 均非空时激活;设置建议私有仓库(记忆内容属个人)。

## 验证

`tests/unit/app/memory/MemoryGitSyncService.test.ts` 使用仓库内独立临时真实 Git 库，覆盖 origin 拒绝且 index/HEAD/远端不变、等价 SSH URL 保留原串、缺少 origin 引导、落后与分叉合并、普通冲突 abort、真实 post-commit hook 触发的 autostash 冲突、unborn 历史采用及 ignored 草稿碰撞、JSONL 与根/锁护栏。`MemoryGitSyncService.security.test.ts` 覆盖非 `.md` 密钥、暂存 blob 扫描、临时产物排除、普通 merge 的 ignored 覆盖、显式端口、pushurl 端点与凭据脱敏。宿主重复通知与恢复后再通知由 `MemoryRuntimeCoordinator.test.ts` 验证。
