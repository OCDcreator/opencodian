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
