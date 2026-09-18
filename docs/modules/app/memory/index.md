# App Memory Barrel

> **源码**: `src/app/memory/index.ts`
> **状态**: [REVIEW]

## 概述

记忆运行时组合层（`app.memory-runtime` owner）的入口，导出 `MemoryRuntimeCoordinator` 与两套文件系统适配器（`VaultMemoryFileSystem` vault 本地存储、`ExternalMemoryFileSystem` 外部共享存储）。`main.ts` 是唯一构造调用方。

## 聚合规则

- R-C1：`VaultIndexFileSystem` 把 Obsidian vault API 适配成 `VaultIndexFs` 端口（笔记只读；唯一写入限制在 `.opencodian/vault-index/**`），由 `main.ts` 直接构造并注入 `VaultIndexService`。
- 协调器把 `core.memory` 的纯核心绑定到具体基础设施（Obsidian vault adapter 文件系统 / node fs 外部共享树、`OpenCodeService` 一次性会话模型调用），并以窄端口 `MemoryRuntimePort` 暴露给 feature 层。
- 设置 `memoryExternalRoot` 非空时协调器改用外部适配器；metrics 诊断始终写 vault 内。
- 设置 `memorySyncRemoteUrl` 非空时启用 git 整树同步（`MemoryGitSyncService`，与 opencode-zmem 同协议）。

## 成员

- [MemoryRuntimeCoordinator](MemoryRuntimeCoordinator.md)
- [VaultIndexFileSystem](VaultIndexFileSystem.md)
- [ExternalMemoryFileSystem](ExternalMemoryFileSystem.md)
- [MemoryGitSyncService](MemoryGitSyncService.md)
