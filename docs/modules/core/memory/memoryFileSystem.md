# Memory File System (In-Memory)

> **源码**: `src/core/memory/memoryFileSystem.ts`
> **状态**: [REVIEW]

## 概述

`InMemoryMemoryFileSystem`：`MemoryFileSystem` 端口的内存实现，供确定性单元测试与 loop 测试 harness 使用。写入时记录 mtime，使分区排序与卫生老化行为与 vault 适配器一致；`seedFile()` 测试钩子可指定显式 mtime。

## 关键导出

| 导出 | 说明 |
|------|------|
| `InMemoryMemoryFileSystem` | Map 支撑的 FS 端口实现；`nativeAbsolutePath` 以构造时 basePath 拼接 |
