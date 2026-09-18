# Core PDF Barrel

> **源码**: `src/core/pdf/index.ts`
> **状态**: [REVIEW]

## 概述

R-C4 PDF 能力（`core.pdf` owner）的公开入口，re-export 文本层布局纯函数、懒加载引擎契约、本地索引格式/打分/服务、注释侧车格式与阅读器探测/降级阶梯。

## 导入关系

```text
上游: ./pdfTextLayout, ./pdfTextEngine, ./pdfIndexFormat, ./pdfIndexScoring,
      ./PdfIndexService, ./pdfAnnotation, ./pdfViewProbe
下游: src/features/chat/services/ContextAttachmentBuilder.ts（一期提取）、
      src/features/chat/services/VaultRetrievalComposerCoordinator.ts（二期注入）、
      src/features/chat/services/PdfChatIntegration.ts（三期交互）、
      src/app/pdf/PdfIndexFileSystem.ts（fs 适配器）、src/main.ts（组合）
```

## 聚合规则

- 本 owner 是 pdf.js 依赖的唯一隔离层：`pdfEngineEntry.ts` 是第二个 esbuild 入口（`dist/pdf-engine.js`），除它之外任何模块不得 import `pdfjs-dist`。
- 二期打分/选段/截断复用 `core.memory` 的 `vaultRetrievalIndex` 与 `memoryRecall` 原语（§11.4：不建第二套检索栈）；本 owner 只持有 PDF 侧的页锚定切片与存储格式。
- 写路径唯一：注释侧车 markdown（`vault.process` / `vault.create`，调用方负责 R-B3 覆盖）；PDF 二进制永不写入。
