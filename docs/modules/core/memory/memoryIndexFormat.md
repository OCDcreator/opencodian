# Memory Index Format

> **源码**: `src/core/memory/index-format.ts`（`src/core/memory/memoryIndexFormat.ts`）
> **状态**: [REVIEW]

## 概述

`MEMORY.md` 的渲染与预算上限（zmem D13/D18/D28 + roadmap 1.2/1.3 孪生）：200 行 / 25KB 截断带 WARNING；无归档尾标时附 MAINTENANCE 提示；归档尾标之后的内容永不注入也不计入上限；纯 bullet 索引按 feedback → user → project → reference 分区、区内按重要度×新近度排序。磁盘文件永不在此改写。

## 关键导出

| 导出 | 说明 |
|------|------|
| `formatMemoryIndexContent(body, hasArchivedMarkerOnDisk)` | 上限 + WARNING/MAINTENANCE 尾 |
| `formatIndexForInjection(raw, manifest?)` | 注入视图：去 frontmatter/注释/归档尾 → 分区重排 → 上限 |
| `formatProjectMemoryIndexContent(raw)` | 反思视图：保留归档行 |
| `renderPartitionedIndex()` | 分区重排（非 bullet 内容原样透传） |
| `buildMemoryIndexBlock()` | agentsMd 风格头部行 + 受限内容；空索引返回 null（D21） |
| `ARCHIVED_SECTION_MARKER` / `INDEX_SECTION_ORDER` | 归档尾标 / 分区顺序常量 |

## 边界与约束

- 截断按整行累积 UTF-8 字节，单行超预算回退码点安全前缀；最终输出（含尾标）不超 25KB，全 CJK 内容亦然。
