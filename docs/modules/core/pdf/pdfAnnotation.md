# PDF Annotation Format

> **源码**: `src/core/pdf/pdfAnnotation.ts`
> **状态**: [REVIEW]

## 概述

三期注释侧车的纯格式核心（设计 §3.3/D2）：侧车路径 `<pdf 名>.annotations.md` 与 PDF 同目录（常量模板，不设设置项）；追加条目格式 `- <YYYY-MM-DD HH:mm> · [[file.pdf#page=N&selection=s,s,e,e]]` + `>` 摘录（≤200 字符，共享 `PDF_SELECTION_EXCERPT_MAX_CHARS`，截断落在词边界）+ 缩进的 `**问**`/`**答**` 块（多行折叠为缩进续行保持列表可解析）。rangeStr 缺失时链接退化为 `#page=N`。

## 关键导出

| 导出 | 说明 |
|------|------|
| `annotationsSidecarPathFor()` | PDF 路径 → 侧车路径（只替换扩展名，规范化分隔符） |
| `buildAnnotationEntry()` | `PdfAnnotationPayload` → 精确的追加块（含结尾换行） |
| `pdfSelectionLink()` | Obsidian 原生子路径同构的回链（s,s,e,e 保持原样不编码） |

## 边界与约束

- 纯函数；写入时序（预览 → R-B3 预快照 → `vault.process`/`vault.create` → notePluginWrite → endBatchCapture）在 `PdfChatIntegration`。
- PDF 二进制零写入（设计 §1.2）。
