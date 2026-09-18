# PDF Annotation Preview Modal

> **源码**: `src/features/chat/services/PdfAnnotationPreviewModal.ts`
> **状态**: [REVIEW]

## 概述

注释落盘前的显式预览确认（设计 §4 行 3/§6.3）：展示将逐字节追加的 markdown 条目与目标侧车路径；R-B3 回退覆盖不可用时展示警告行（§6.7 如实呈现）而非静默写入不可回退内容。仅用 Obsidian 原生 modal/Setting 样式，无自定义 CSS 面。

## 关键导出

| 导出 | 说明 |
|------|------|
| `PdfAnnotationPreviewModal` | `onConfirm` / `onCancel` 各回调一次；关闭未确认视为取消 |

## 边界与约束

- 无 I/O；写路径在 `PdfChatIntegration.applyAnnotationWrite`，且只在确认后发生。
