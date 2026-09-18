# PDF Engine Entry

> **源码**: `src/core/pdf/pdfEngineEntry.ts`
> **状态**: [REVIEW]

## 概述

第二个 esbuild 入口（`scripts/build.mjs` 生产构建产出 `dist/pdf-engine.js`，`esbuild.config.mjs` dev 平行产物），打包 pdfjs-dist legacy 构建。Worker 策略：把 worker 模块挂到 `globalThis.pdfjsWorker`（pdf.js 文档化的主线程钩子），不构造 `Worker`、不做运行时脚本抓取（两者在 Obsidian 内不可靠）。逐页 `getTextContent()` 后复用 `pdfTextLayout.rebuildPageLines` 重建行，页间 `await` 让出主循环。CJS 导出 `{ extractPages }`。

## 关键导出

| 导出 | 说明 |
|------|------|
| `extractPages()` | ArrayBuffer → 逐页文本（1 起始页码）；错误原样抛出，宿主侧分类 |

## 边界与约束

- 本文件是唯一允许 import `pdfjs-dist` 的源码模块；它绝不进 `main.js` 启动包。
- 密码错误分类（`isPasswordFailure`）刻意留在宿主侧，产物保持纯提取器。
- 目标 es2022 + 生产 minify（独立产物，只在当前 Electron 内运行）。
