# Vault Retrieval Index

> **源码**: `src/core/memory/vaultRetrievalIndex.ts`
> **状态**: [REVIEW]

## 概述

R-C1 整库检索的纯函数核心：vault 笔记的词面索引原语。分块（按 ATX/Setext 标题切 section，超长 section 在围栏外空行处二分为 paragraph，YAML frontmatter 跳过）、打分（复用 `memoryRecall.tokenize` 的拉丁词 + CJK 二元组；字段权重 title×3 / heading×2 / body×1，每个查询 token 只计一次）、选段门槛（≥2 个不同查询 token，或标题/小节命中，或 verbatim 标题命中）、截断（`truncateNoteSnippet` 绝不切进未闭合代码围栏）与排除规则（点前缀目录无条件排除；用户规则支持目录前缀与段内 `*` 通配）。§10 Q3 已裁决：仅词面，无 embedding、无向量库、无新依赖。

## 关键导出

| 导出 | 说明 |
|------|------|
| `chunkNote()` | 标题节切分 + 超长二分；代码围栏不可穿越 |
| `buildVaultIndexEntry()` | 由笔记文本构建索引条目（仅 token + 行号，正文不入索引） |
| `selectVaultSnippets()` | 打分排序选段：score → verbatim → mtime；同笔记至多 1 条；topK 硬上限；命中分块前后各扩 1 个相邻分块 |
| `scoreChunk()` / `isVaultVerbatimHit()` | 加权词重叠与 verbatim 判定 |
| `truncateNoteSnippet()` | 每篇截断上限；截断点回退到最近完整段落/围栏闭合边界 |
| `isExcludedPath()` / `isIndexablePath()` | 排除规则匹配（大小写不敏感，`.obsidian/`、`.opencodian/` 恒排除） |
| `hashNoteContent()` / `shardNameFor()` | 内容 sha-1 前 16 位（增量跳过）；按路径哈希命名的 shard |
| `fitShardToBudget()` | shard 超 512KB 时对半裁剪 chunks 并标记 `partial` |
| `SOFT_CHUNK_CHARS` / `MAX_SHARD_BYTES` / `MAX_MANIFEST_BYTES` | 1500 字符软分块；512KB shard 上限；100MB manifest 总量上限 |

## 边界与约束

- 纯函数、无 I/O；fs 交互全部在 `VaultIndexService`（见同目录）。
- 索引只存 token 与行号，正文在注入时回读（验收 5：修改后检索反映最新内容）。
- 打分门槛刻意抑制单个常用二元组的误召回（单 token 正文命中被丢弃）。
