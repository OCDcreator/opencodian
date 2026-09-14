# Memory Git Sync Service

> **源码**: `src/app/memory/MemoryGitSyncService.ts`
> **状态**: [REVIEW]

## 概述

共享记忆树的 git 整树同步(`MemoryGitSyncService` + 纯函数 `syncMemoryTree`/`ensureMemorySyncRepo`)。与 opencode-zmem 的 `src/sync.ts` 共用同一协议：同锁文件 `.memory-sync.lock`、同分支 `main`、同 ignore 规则(`.last-injection.json`/`metrics.jsonl`/系统杂物)、同 commit 消息形状——两个插件可指向同一棵物理树，跨插件锁串行化同步周期。协议全文(兼容硬约束)见 `docs/status/memory-sync-protocol.md`，两仓各存一份相同的副本。

## 关键点

| 导出 | 说明 |
|------|------|
| `syncMemoryTree(root, url)` | 一个完整周期：根护栏 → 取锁 → bootstrap → **unmerged 门** → `add -A` → **密钥门** → 有变更则 commit → 有 HEAD 则 `pull --rebase --autostash`(冲突 abort 保本地)→ push;unborn 分支先 fetch(失败如实报告)+`checkout -B` 收编远程历史 |
| `ensureMemorySyncRepo()` | 幂等引导:`init -b main` + 补全 `.gitignore`/`.gitattributes`(预存文件只追加缺失行)+ origin remote |
| `checkMemorySyncTreeRoot()` | 根护栏:拒绝 home 目录/文件系统根/不存在的路径/无 `projects/` 的非空目录,防误指根被 `add -A` 整目录推送 |
| `MemoryGitSyncService` | 运行时包装:5s 防抖(写后)、5min 周期、in-flight 互斥、`isActive()` 按 root+url 判定 |

## 边界与约束

- fail-soft 契约:任何 git 失败只落入结果 `detail`,绝不抛进聊天路径;锁文件本身的 fs 错误也被接住(`lock: …`)而不是逃逸。
- 密钥门:已暂存的 `.md` 过 `scanForSecrets`,命中即撤出暂存(`restore --staged`;unborn 分支用 `rm --cached`)并记入 `blockedSecrets`;撤出失败则整轮中止(宁缺毋推)。召回侧 guard 只挡注入,这道门挡的是远程。
- unmerged 门必须在 `add -A` **之前**:`add` 会清除 unmerged 证据并把冲突标记stage进去。append-only 的 `MEMORY.md` 用 `.gitattributes` union merge 消解最常见的跨机冲突。
- 20s 命令超时 kill 可能遗留 `.git/index.lock`:错误路径上龄期 >60s 的 index.lock 会被清除,下一轮自愈(新锁不动——那是活跃 git)。
- 仓库位于外部根(含 `projects/` 的那一层);ZCode 写入的文件随 `add -A` 一同同步。
- commit 身份用每命令 `-c user.name=opencodian-memory@<host>`,不依赖全局 git 配置。
- 仅在 `memoryExternalRoot` + `memorySyncRemoteUrl` 均非空时激活;设置建议私有仓库(记忆内容属个人)。
