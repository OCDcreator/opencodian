# VaultEmbeddingFileSystem

> **源码**: `src/app/memory/VaultEmbeddingFileSystem.ts`
> **状态**: [REVIEW]

## 概述

R-E4 的 `VaultEmbeddingFsAdapter` vault 适配（app.memory-runtime owner，`VaultIndexFileSystem` 的姊妹件）：笔记只读列举（含标题与 cachedRead 内容）；写仅限 `.opencodian/vault-embeddings/**`（越界抛错）；vault 变更事件 2 秒防抖后喂给服务的增量重嵌。

## 不变量

- 写路径断言：非 `vault-embeddings/` 前缀一律拒绝（与 R-C1 索引目录同款防线）。
- 点前缀目录 → Obsidian 文件面不可见。
- 变更防抖 2000ms（编辑风暴不打爆嵌入端点）。

## 关联模块

- `src/core/memory/VaultEmbeddingIndexService.ts`：消费方。
