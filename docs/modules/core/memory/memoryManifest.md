# Memory Manifest

> **源码**: `src/core/memory/memoryManifest.ts`
> **状态**: [REVIEW]

## 概述

扫描桶内全部 Topic File 并解析 YAML frontmatter 为 `TopicManifestEntry[]`（name/description/type/importance/reflection/source/mtimeMs）。清单供索引分区排序、语义召回候选与卫生评估共用。目录缺失返回 `[]`，单个文件读取失败跳过（fail-soft）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildTopicManifest(fs, projectDir)` | 异步构建清单，按文件名排序 |
| `TopicManifestEntry` | 清单条目；importance 非法回退 3 |
