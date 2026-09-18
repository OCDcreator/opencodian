# PDF Text Layout

> **源码**: `src/core/pdf/pdfTextLayout.ts`
> **状态**: [REVIEW]

## 概述

一期文本层的纯函数布局规则：把 pdf.js `getTextContent()` 条目按基线 y 坐标聚类重建行（行内按 x 排序；容差 2 个坐标单位容纳上下标；多栏页面输出确定性的次优合并，行为被单测钉住）、无文字层 fail-closed 判定（总字符 < 32 且有字页占比 < 20% 判为扫描件）与一次性附加的上限拒绝（页数/字符模块常量，超限拒绝并提示改用二期索引，绝不静默截断）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `rebuildPageLines()` / `pageTextFromLines()` | 条目 → 行 → 页文本；与 pdf.js 解耦，可脱离引擎单测 |
| `assessTextLayer()` | `textLayerPresent` fail-closed 判定 + 统计 |
| `checkAttachLimits()` | 一次性附加页数/字符上限（`PDF_ATTACH_MAX_PAGES=150` / `PDF_ATTACH_MAX_CHARS=120000`），超限返回结构化拒绝 |
| `TEXT_LAYER_MIN_CHARS` / `TEXT_LAYER_MIN_PAGE_RATIO` | 无文字层判定阈值（设计 §3.1 步骤 3） |

## 边界与约束

- 纯函数、无 I/O、无 pdf.js 依赖；引擎条目与测试共用同一实现。
- OCR 永不在列（设计 §1.2）；无文字层 → 明确提示，不注入空快照。
