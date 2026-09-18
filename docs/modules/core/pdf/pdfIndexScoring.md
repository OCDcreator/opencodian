# PDF Index Scoring

> **源码**: `src/core/pdf/pdfIndexScoring.ts`
> **状态**: [REVIEW]

## 概述

二期检索选段——对 R-C1 检索核心的薄适配（设计 §11.4：不建第二套检索栈）。复用原语：`memoryRecall.tokenize`（拉丁词 + CJK 二元组）、`vaultRetrievalIndex.scoreChunk`（字段式签名按 token 数组计分，与行无关，PDF chunk 直接映射：PDF 文件名 → title 字段、chunk 正文 → body 字段、无 heading 字段——因此无需在 `core.memory` 补 `scoreTokens` 原语）、选段门槛（≥2 个不同查询 token 或 title/heading 命中或 verbatim）、`truncateNoteSnippet` 截断。topK 语义与 `selectVaultSnippets` 一致：每文档至多 1 条，score → verbatim → 路径排序。

## 关键导出

| 导出 | 说明 |
|------|------|
| `selectPdfSnippets()` | 查询 → 命中片段（`SelectedPdfSnippet`：页锚定 + 截断后文本）；`ready:false` 文件直接跳过 |
| `scorePdfChunk()` | 单 chunk 打分（R-C1 原语透传） |
| `pdfTitleOf()` | 去扩展名文件名（title 字段） |

## 边界与约束

- 单段超预算时 `truncateNoteSnippet` 无行可保 → 降级为前缀硬切并如实标 `truncated`（比注入空片段诚实）。
- 只返回命中片段，绝不整本注入（验收 2）。
