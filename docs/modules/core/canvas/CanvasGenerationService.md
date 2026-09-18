# CanvasGenerationService

> **源码**: `src/core/canvas/CanvasGenerationService.ts`
> **状态**: [REVIEW]

## 概述

R-C5 画布生成服务（设计 §3.3）。验收 4（"生成失败不留半个 .canvas"）由结构保证：① 整个文档先在内存构建（确定性布局 + 确定性 id `canvas-node-1`…）；② 触盘前双重校验（序列化字节往返 + `assertWritableDocument`）；③ 目标路径预检，重名不覆盖而是追加 ` 2`、` 3`…；④ 恰好一次 `vault.create`；⑤ create 抛错但文件仍存在（理论边界）→ 先 `trash` 回收再把原错误抛出。vault 只经 `CanvasVaultPort` 触达（Obsidian 适配器在 feature 层），失败矩阵可用共享 vault harness 单测。

## 关键导出

| 导出 | 说明 |
|------|------|
| `CanvasGenerationService.generate(request)` | 构建 → 双重校验 → 冲突后缀 → 单次 create → 失败回收 |
| `buildFileReferenceDocument(notes)` | 模式 1：每篇笔记一个 file 节点（零 AI、零内容拷贝） |
| `buildSplitDocument(proposals)` | 模式 2：摘录 → text 节点、主题 → group 节点（按输入顺序） |
| `nextAvailableCanvasPath(desired, exists)` | 重名后缀推导（有界 1000 次，防病态 exists 死循环） |
| `sanitizeCanvasTitle` / `canvasBaseFileName` / `joinVaultPath` | `<主题或 'Untitled'> canvas.canvas` 文件名契约 |

## 边界与约束

- 空文档（无 notes 无 proposals）拒绝创建，不产生空画布。
- 本服务不登记 R-B3（那是消费方 `CanvasGenerationFlow` 的职责），也不触碰 Canvas 视图。
- 测试：`tests/unit/core/canvas/CanvasGenerationService.test.ts`（共享 `EditRevertVaultHarness`）。
