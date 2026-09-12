# Core Memory Barrel

> **源码**: `src/core/memory/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/memory/index.ts` 是通用记忆后端（`core.memory` owner）的公开入口，re-export 全部记忆核心模块。它是「每工作区一份持久化 Markdown 记忆」这一与智能体后端解耦能力的唯一公开面。

## 导入关系

```text
上游: ./memoryTypes, ./memoryPaths, ./memoryProtocol, ./memoryManifest, ./memoryIndexFormat,
      ./memoryStore, ./memorySecretScan, ./memoryRecall, ./memoryExtraction, ./memoryReflection,
      ./memoryHygiene, ./memoryInjection, ./memoryFileSystem, ./MemoryBackendService
下游: src/app/memory/MemoryRuntimeCoordinator.ts（唯一组合层消费者）
```

## 聚合规则

- 硬不变量：barrel 之后的任何模块都不得 import 智能体后端适配器、`OpenCodeService`、feature 或 app 模块；基础设施接触只能经由 `MemoryFileSystem` / `MemoryModelInvoker` 端口（由 `app.memory-runtime` 绑定）。
- 行为规格来自参考实现 opencode-zmem 的冻结决策 D1–D29；本仓适配偏差以 D-O 系列记录在 `docs/architecture/owners/core-memory.md` 与 devlog。
