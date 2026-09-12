# Memory Maintenance

> **源码**: `src/core/memory/memoryMaintenance.ts`
> **状态**: [REVIEW]

## 概述

记忆桶的维护流程（zmem `/zmem lint|status|forget` 子命令孪生，D-O8）：只读体检（密钥命中、缺失 importance、索引指向不存在文件的游离行）、只读状态报告（索引行数/字节、类型分布、最近一次注入 sidecar）与确认后遗忘（删 Topic File + 重写索引去掉对应行）。以独立函数 + FS 端口实现，编排服务委托到此。

## 关键导出

| 导出 | 说明 |
|------|------|
| `lintMemoryBucket()` | 体检报告 `MemoryLintReport` |
| `readMemoryStatus()` | 状态报告 `MemoryStatusReport`（含 `.last-injection.json` 回读） |
| `forgetMemory()` | 按 slug/name 匹配删除文件与索引行，返回 removed 清单 |

## 边界与约束

- 全部 fail-soft；遗忘绝不删除未匹配文件，索引重写失败仅吞错。
