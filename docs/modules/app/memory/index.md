# App Memory Barrel

> **源码**: `src/app/memory/index.ts`
> **状态**: [REVIEW]

## 概述

记忆运行时组合层（`app.memory-runtime` owner）的入口，导出 `MemoryRuntimeCoordinator` 与 `VaultMemoryFileSystem`。`main.ts` 是唯一构造调用方。

## 聚合规则

- 协调器把 `core.memory` 的纯核心绑定到具体基础设施（Obsidian vault adapter 文件系统、`OpenCodeService` 一次性会话模型调用），并以窄端口 `MemoryRuntimePort` 暴露给 feature 层。
