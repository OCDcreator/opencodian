# PDF Index Format

> **源码**: `src/core/pdf/pdfIndexFormat.ts`
> **状态**: [REVIEW]

## 概述

二期本地索引的 PDF 侧存储格式（纯函数）：指纹 `sha1(path+mtime+size)`（任一变化即整体重建）、路径 `.opencodian/pdf-index/<指纹>.json`（点前缀目录，Obsidian 不列出/不搜索）、切片合并（每页文本按空行分段，页内累积到 800–1200 字符窗口；**页界不跨 chunk**；单段超限成整段 chunk 而非截断）与结构校验（`version`/`fingerprint`/`ready`/chunk 形状，任何不匹配判 corrupt 触发重建）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `pdfIndexFingerprint()` / `pdfIndexFileName()` | 指纹与索引文件名；重启恢复无 manifest（按指纹直接寻址） |
| `mergePageTextsIntoChunks()` | 页文本 → `PdfIndexChunk[]`；id 形如 `<pdfPath>#p<N>-<N>`，重复锚点加序号 |
| `parsePdfIndexFile()` | 磁盘 JSON 结构校验；`ready:false` 永不通过（半截索引不可查） |
| `PDF_INDEX_ROOT` / `PDF_CHUNK_TARGET_*` | `.opencodian/pdf-index`；800/1200 字符窗口 |

## 边界与约束

- 打分/选段/截断在 `pdfIndexScoring`（复用 `core.memory` 原语），本文件只管形状与哈希。
- 原子性（tmp → rename）由 fs 适配器实现，服务层约定 `writeIndexFileAtomic`。
