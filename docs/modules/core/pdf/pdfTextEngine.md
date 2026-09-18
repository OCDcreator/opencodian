# PDF Text Engine Loader

> **源码**: `src/core/pdf/pdfTextEngine.ts`
> **状态**: [REVIEW]

## 概述

`PdfTextEngine` 契约 + 主包侧懒加载器。pdf.js 被打成第二个产物 `pdf-engine.js`（见 `pdfEngineEntry`），`main.js` 只持本文件十几行加载器：首次 PDF 附加/建索引时以 `createRequire(pluginDir/main.js)` require 该产物，启动零解析成本。加载 fail-closed：产物缺失（`engine-missing`）、缺 `extractPages` 导出（`engine-broken`）都以类型化错误暴露，由调用方渲染成诚实提示；加载失败不缓存，下次可重试。

路径解析（实机验收修复）：Obsidian 的 `manifest.dir` 实际是**库相对路径**（`.obsidian/plugins/opencodian`），而 Node `createRequire` 拒绝相对路径。`PdfEngineLoaderHost` 因此同时要求 `getVaultBasePath()`（必选成员，组合处漏配会在 `tsc` 直接报错）：绝对路径原样通过；相对路径与 vault 绝对基路径（`shared/vault.ts` 的 `getVaultBasePath`，即 adapter basePath）拼接；两者都拿不到时以诚实 `engine-missing`（而非裸 `createRequire` TypeError）fail-closed。

## 关键导出

| 导出 | 说明 |
|------|------|
| `PdfTextEngine` | 引擎契约：`extractPages(data, { maxPages }) → { pageCount, pages }` |
| `PdfEngineLoader` | 懒加载 + 缓存；`isLoaded()` 供调试面 |
| `PdfEngineError` / `PdfEngineLoadError` | `engine-missing` / `engine-broken` / `encrypted` / `extraction-failed` |
| `isPasswordFailure()` | 识别 pdf.js `PasswordException`（加密 PDF，fail-closed 提示） |

## 边界与约束

- 除 `pdfEngineEntry.ts` 外，任何模块不得 import `pdfjs-dist`；本模块是唯一 require 通道。
- `getPluginDir()` 在启动完成前可能为 undefined → fail-closed。
- `getPluginDir()` 允许是库相对路径（生产 `manifest.dir` 形态），由加载器用必选的 `getVaultBasePath()` 解析为绝对路径；无绝对基路径时对相对目录 fail-closed `engine-missing`。
- 加密/不可读/超限 PDF 一律明确提示并拒绝，不产出空条目（设计 §4 行 4）。
