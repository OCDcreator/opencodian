# Memory Store

> **源码**: `src/core/memory/memoryStore.ts`
> **状态**: [REVIEW]

## 概述**

插件自主蒸馏记忆（每轮抽取 / 压缩反思）的共享写路径（zmem D27 孪生）：slug 清洗、来源盖章（`metadata.node_type: memory` + `metadata.source: extracted|compacted <session>`）、写计划（文件名冲突跳过而非覆盖）、索引行追加重排与遗忘删除，最后经 FS 端口落盘。

## 关键导出

| 导出 | 说明 |
|------|------|
| `planProvenanceWrites()` | 蒸馏结果 → 写计划；冲突（已存在文件 / MEMORY.md / 批内重名）跳过 |
| `buildProvenanceMemoryFile()` | 含来源 frontmatter 的完整文件内容 |
| `appendIndexLines()` / `removeIndexLines()` | 索引行追加（幂等）/ 删除 |
| `writeMemoryWrites()` | 先写 Topic File 再原子更新索引 |
| `sanitizeMemorySlug` / `yamlScalar` / `parseImportanceValue` 等纯助手 | 命名与标量安全 |

## 边界与约束

- 模型自主写入走后端文件写工具（协议驱动），不经本模块；本模块只服务插件蒸馏产物，故它独占来源盖章。
