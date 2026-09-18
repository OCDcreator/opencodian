# PDF Index Service

> **源码**: `src/core/pdf/PdfIndexService.ts`
> **状态**: [REVIEW]

## 概述

二期运行时：后台、分批让出主循环、可取消的 PDF 页锚定索引（`pdfIndexEnabled` 默认 false，关闭态零读取/零写入/零引擎加载/查询恒 []，请求逐字节不变——对齐 R-C1 严格回归要求）。构建：列出 PDF → `isIndexablePath` 排除规则（复用 R-C1 的 `vaultRetrievalExcludedPaths`）→ 指纹匹配的现成索引直接水合（重启无需重提取）→ 否则经注入的引擎懒加载提取 → 切片 → 原子写（`ready:true` 与完整 chunk 表同一次落盘）。批末清理：同 PDF 旧指纹/孤儿索引删除 + 总量超限按最久未命中淘汰（R-B3 容量治理思路）。取消：代际计数（开关关闭 / `invalidateAll` / dispose 即失效），半截构建不标 ready。

## 关键导出

| 导出 | 说明 |
|------|------|
| `PdfIndexService` | `attach()` / `onSettingsChanged()` / `rebuildAll()` / `select()` / `invalidateAll()` / `dispose()`；`onProgress()` / `isBuilding()` 供设置页状态 |
| `PdfIndexFs` | fs 端口（`VaultIndexFs` 模式）：listPdfFiles / readPdfBinary / writeIndexFileAtomic / readIndexFile / deleteIndexFile |
| `PdfIndexSettingsSlice` | `pdfIndexEnabled` + 复用 R-C1 的 topK / maxChars / 排除规则 |
| `PDF_INDEX_MAX_TOTAL_BYTES` | 索引总量上限（64MiB），超限最久未命中淘汰 |

## 边界与约束

- 打分全部委托 `pdfIndexScoring`；本服务只管调度、存储与生命周期。
- 加密/不可读/引擎缺失的 PDF 跳过并告警，不产出空索引（fail-closed）。
- `rebuildRunning` 期间拒绝并发重建；取消的 pass 永不把任何文件标 ready。
