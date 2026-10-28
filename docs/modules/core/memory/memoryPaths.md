# Memory Paths

> **源码**: `src/core/memory/memoryPaths.ts`
> **状态**: [REVIEW]

## 概述

工作区身份与记忆库路径解析（zmem D7/D16 的本仓适配 D-O1）。桶路径为 `<vault>/.opencodian/memory/projects/<slug>-<hash16>/`，`hash16 = sha256(规范化绝对工作区路径)[:16]`，Windows 上哈希输入按盘符小写（与 `ConfigurationArchiveService` 的 canonical-path 规则一致）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `MEMORY_STORE_ROOT` | `.opencodian/memory`（vault 相对） |
| `sanitizeProjectSlug()` | 目录名 → 小写 `[a-z0-9._-]`，48 字符上限，空值回退 `project` |
| `hashWorkspacePath()` | sha256 前 16 位十六进制 |
| `memoryProjectDir/File/IndexPath()` | 桶目录 / 桶内文件 / MEMORY.md 的 vault 相对路径 |
| `modelMemoryRootDisplay()` | 协议文本用的原生绝对目录（带尾分隔符） |

## 边界与约束

- opencodian 的所有后端 cwd 都锚定 vault，因此工作区键 = vault 路径；桶在 vault 内保证四个后端的文件写工具都无需额外授权即可写入。

- `externalMemoryProjectDir(root, workspace)`：共享存储模式的绝对桶目录 `<root>/projects/<slug>-<hash16>/memory`；桶名与 vault 本地映射完全一致（同一 `hashWorkspacePath`），尾部 `memory` 段与 opencode-zmem / ZCode workspace memory 布局对齐，三方可共用一棵物理树。

2026-10-28：memoryWorkspaceBucket 支持 zmem 同构 workspaceIdentity（project-<sha256前16位>）与 workspacePathAliases（按目标原始字符串散列，便携 basename）；未设置时保留原桶名。memoryAgentKey 与 zmem/ZCode 一致，仅保留字母数字、下划线和横线并保留大小写。仅路由到新身份，不自动搬移旧文件。
