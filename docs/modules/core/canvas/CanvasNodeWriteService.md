# CanvasNodeWriteService

> **源码**: `src/core/canvas/CanvasNodeWriteService.ts`
> **状态**: [REVIEW]

## 概述

R-C5 节点级编辑的写侧与运行时确认门（设计 §3.4）。全插件对既有画布的写路径恰两条，全部显式：

1. **文本节点**：`canvas.getData()` → 内存中替换该节点 `text` → `assertWritableDocument` → `canvas.setData(doc)` → `canvas.requestSave()`。保存仍走 Canvas 自身管线，插件不直接写 `.canvas` 文件。脏检查在写前对"新鲜 `getData()` 里的节点文本"与会话起始快照做严格比对，分歧即 `node-changed` 拒绝（§6.3）。
2. **文件节点**：底层笔记经一次 `vault.process` 闭包先读比对后写，闭包抛错即零改动。

**运行时确认门**（设计的第一个硬任务）：Canvas API 面只做过包内静态核实，因此每个结构假设都在运行时探测并由 `resolveCanvasGateDecision` 裁决——读侧（`view.canvas`/`getData`/形状）不过 → 功能整体不注册并如实上报（§6.7）；写侧（`setData`/`requestSave`）缺失 → 降级 D 级"仅复制"；`selection` 非 Set 不拦门（C 级节点挑选显式不依赖 selection，§7-U4）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `probeCanvasView(view)` / `resolveCanvasGateDecision(probe)` | 运行时探测 + 纯判定（supported / canWriteBack / reasons，调试区如实展示） |
| `resolveSelectedNode(canvas)` | 同步读 `canvas.selection`（B 级）；多选只取第一个并回报数量 |
| `writeTextNode({canvas, nodeId, nextText, snapshotAtRequest})` | 唯一的 `.canvas` 变更路径：脏检查 → 全文档替换 → 校验 → setData+requestSave |
| `writeFileNodeContent({port, filePath, nextContent, snapshotAtRequest})` | 单次 `vault.process` 闭包脏检查写 |
| `readNodeData(handle)` | 节点句柄 `getData()` 的永不抛错读取 |

## 边界与约束

- 纯结构接口，零 Obsidian 导入（`tests/unit/core/canvas/CanvasNodeWriteService.test.ts`）。
- Ctrl+Z 诚实条款（E2）：`setData` 的原生 undo 覆盖未验证，本文件不声称撤销语义；保证性撤销 = R-B3（文件节点写）/ 回退入口，文本节点写回的撤销边界由 UI 明示。
- 撤销/快照的编排（beginBatchCapture → notePluginWrite → endBatchCapture）在 `CanvasIntegrationController`，不在本文件。
