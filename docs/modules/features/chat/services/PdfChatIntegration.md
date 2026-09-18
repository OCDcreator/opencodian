# PDF Chat Integration

> **源码**: `src/features/chat/services/PdfChatIntegration.ts`
> **状态**: [REVIEW]

## 概述

R-C4 三期视图集成（feature.chat-services，设计 §3.3）：扫描 `pdf` 叶子并对每叶做运行时确认门（feature-detect 内部结构 + 实际调用一次原生序列化验证），按 `core.pdf` 的 `resolvePdfIntegrationLevel` 落 A/B/C 级；A/B 级向 `toolbar.toolbarRightEl/LeftEl` 挂 `clickable-icon` 按钮。选区捕获两级降级：A 级 `child.getTextSelectionRangeStr({win})`（校验合法序列）→ B 级 DOM `getSelection()` + `data-page-number` 页锚定。命令 `pdf-ask-selection` 捕获选区 → `pdf_selection` 条目 → 打开聊天；无可捕获选区时诚实降级 C 级（开聊天提示手动粘贴）。命令 `pdf-save-annotation` 取会话中最近一次带 PDF 上下文的问答 → 预览模态 → `applyAnnotationWrite` 写侧车（本 feature 唯一新写路径）：`beginBatchCapture` → 单次 `vault.process`/`vault.create` → `notePluginWrite` → `endBatchCapture`（R-B3 覆盖），A 级且 `highlightText` 可用时做临时高亮反馈。

## 关键导出

| 导出 | 说明 |
|------|------|
| `PdfChatIntegration` | `attach()` / `detach()` / `askSelectionFromActivePdf()` / `saveLastAnnotation()` / `getLadderReport()`（调试区如实上报当前级别） |
| `PdfChatIntegrationPorts` | 组合端口：打开聊天、读活动会话、拿 R-B3 服务、构建 `pdf_selection` 条目 |

## 边界与约束

- 唯一新写路径 = markdown 侧车追加；PDF 二进制永不修改（设计 §1.2）。
- 阶梯判定/侧车格式是 `core.pdf` 纯函数；本文件只做结构探测、DOM 捕获与编排。
- `applyAnnotationWrite` 公开仅供契约测试；生产路径必须先过预览模态（§6.3 可见性）。
