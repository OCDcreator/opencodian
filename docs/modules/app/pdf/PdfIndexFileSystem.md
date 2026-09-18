# PDF Index FileSystem

> **源码**: `src/app/pdf/PdfIndexFileSystem.ts`
> **状态**: [REVIEW]

## 概述

R-C4 PDF 索引的 vault 侧 fs 适配器（`app.pdf-runtime` owner）：用 Obsidian vault adapter 实现 `core.pdf` 的 `PdfIndexFs` 端口。PDF 列表/读取只读（过滤非 `.pdf` 与点前缀目录）；索引写入被 `assertIndexPath` 硬性限制在 `.opencodian/pdf-index/**`，且原子化——先写 `<path>.tmp` 再 `adapter.rename`，rename 失败时清理 tmp 残留。`main.ts` 是唯一构造方。

## 关键导出

| 导出 | 说明 |
|------|------|
| `PdfIndexFileSystem` | 实现 `PdfIndexFs`；`writeIndexFileAtomic` 是唯一写动作 |

## 边界与约束

- 唯一写动作在 `.opencodian/pdf-index/**`；对用户 PDF 与笔记零写入。
- 点前缀目录对 Obsidian 文件列表/快速切换/搜索不可见，索引不出现在用户 vault 的常规视图。
- 切片/打分/调度逻辑全部在 `core/pdf`，本文件只做 I/O 绑定（比照 `VaultIndexFileSystem`）。
