# CanvasIntegrationController

> **源码**: `src/features/canvas-integration/CanvasIntegrationController.ts`
> **状态**: [REVIEW]

## 概述

R-C5 的 Canvas 视图桥（owner `feature.canvas-integration`；设计 §3.4）。职责只做结构与编排：`attach/detach` 跟随 `layout-change`/`active-leaf-change` 同步 canvas 叶桥；每个叶先过运行时确认门（`probeCanvasView`）——门不过则该叶**什么都不挂**，原因进调试区（§6.7）。门通过后按降级阶梯挂入口：A = 浮动选择菜单（`.canvas-menu-container`，MutationObserver 懒挂载，DOM append 为低风险原语）+ 右键菜单包装（feature-detect + try/catch + detach 恢复原方法）；B = 命令面板读 `canvas.selection`；C = selection 不可读时用 `getData()` 全节点挑选弹窗（显式不依赖 selection，§7-U4）；D = 写面缺失时改写结果只复制并明示。

## 改写主流程

选节点 → 指令弹窗 → `CanvasNodeRewriteService`（只读 aux）→ 预览确认弹窗 → 按节点类型写回，两条路径均在 R-B3 覆盖下且 fail closed（覆盖面缺失即拒绝写入并明示，不做不可回退的写）：

- **文本节点**：`beginBatchCapture([canvasPath])` 强制预快照 → `writeTextNode`（`setData` + `requestSave(false)`，脏检查拒绝漂移；`false` 避免宿主历史栈出现重复的写后快照——那是首次 Ctrl+Z 失效的根因，见 CanvasNodeWriteService）→ `view.saveImmediately()` 尽力落盘 → `notePluginWrite` → `endBatchCapture`。
- **文件节点**：`beginBatchCapture` → 单次 `vault.process`（闭包先读比对后写）→ `notePluginWrite` → `endBatchCapture`。

两种节点的预览弹窗使用同一条诚实披露规则：R-B3 覆盖面未组装时显示 noRevertCoverage 警示（写回随后被拒绝），已组装时不显示（此时双撤销通道均存在：宿主 Ctrl+Z + 侧栏回退）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `CanvasIntegrationController` | attach/detach、叶桥同步、门探测、三入口同一处理器、`getGateReport()` 调试面 |
| `aiEditNodeFromCommand()` | 命令入口（B→C 降级链） |

## 边界与约束

- 依赖：core.canvas、core.agents（经 `CanvasAuxTarget` 端口）、core.types（EditRevertServicePort）、shared.i18n、feature.inline-edit（parser 复用）。不 import chat 视图运行时。
- `getGateReport()` 返回最近一次真实探测结果，绝不伪造（`app.composition` 注入 notify=Notice 沉降）。
- Ctrl+Z 双通道（E2 已闭环）：写回经宿主 `setData`（自身推历史）+ `requestSave(false)`，一次 Ctrl+Z 即恢复写前状态并落盘（bundle 核实；活体按键待验收回填）；文本节点写回同时纳入 R-B3 批次覆盖，覆盖缺失仍 fail closed。
