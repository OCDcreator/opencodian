# External Memory File System

> **源码**: `src/app/memory/ExternalMemoryFileSystem.ts`
> **状态**: [REVIEW]

## 概述

共享存储模式的 `MemoryFileSystem` 实现：基于 node fs 操作绝对本地路径，根目录指向外部共享树（opencode-zmem / ZCode workspace memory 布局，`<root>/projects/<桶>/memory`）。与 `VaultMemoryFileSystem`（vault 相对路径、Obsidian adapter）互为同端口的两套基础设施绑定。

## 关键点

| 导出 | 说明 |
|------|------|
| `ExternalMemoryFileSystem` | node fs 适配器；`writeFile` 递归建父目录，`listFiles` 遵循 ListedFiles basename 契约（仅文件），`remove` 容忍缺失 |
| `expandHomeDir()` | 展开开头的 `~` / `~/` / `~\\` 为用户主目录；`~user` 形式不展开 |

## 边界与约束

- 路径全部是绝对原生路径（非 vault 相对）；构造时 `resolve` 根目录。
- `~` 展开让同一个设置值（如 `~/.zcode/cli/memories`）在同步该 vault 设置的多台机器（Windows / macOS）上都正确解析。
- 所有读取失败按端口契约返回 `null` / `false`（fail-soft 由上层服务契约兜底）。
- 由 `MemoryRuntimeCoordinator.ensureService()` 在 `memoryExternalRoot` 非空时构造；metrics 始终留在 vault 内的 `VaultMemoryFileSystem` 上。
