# CanvasIntegrationController

> **源码**: `src/features/canvas-integration/CanvasIntegrationController.ts`
> **状态**: [REVIEW]

## 概述

R-C5 的 Canvas 视图桥（owner `feature.canvas-integration`；设计 §3.4）。职责只做结构与编排：`attach/detach` 跟随 `layout-change`/`active-leaf-change` 同步 canvas 叶桥；每个叶先过运行时确认门（`probeCanvasView`）——门不过则该叶**什么都不挂**，原因进调试区（§6.7）。门通过后按降级阶梯挂入口：A = 浮动选择菜单（`.canvas-menu-container`，MutationObserver 懒挂载，DOM append 为低风险原语）+ 右键菜单包装（feature-detect + try/catch + detach 恢复原方法）；B = 命令面板读 `canvas.selection`；C = selection 不可读时用 `getData()` 全节点挑选弹窗（显式不依赖 selection，§7-U4）；D = 写面缺失时改写结果只复制并明示。

## 改写主流程

选节点 → 指令弹窗 → `CanvasNodeRewriteService`（只读 aux）→ 预览确认弹窗 → 按节点类型写回：文本节点走 `writeTextNode`（setData + requestSave，脏检查拒绝漂移）；文件节点走 `beginBatchCapture` → 单次 `vault.process` → `notePluginWrite` → `endBatchCapture`（R-B3 全覆盖；回退面缺失时拒绝写入并明示，不做不可回退的写）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `CanvasIntegrationController` | attach/detach、叶桥同步、门探测、三入口同一处理器、`getGateReport()` 调试面 |
| `aiEditNodeFromCommand()` | 命令入口（B→C 降级链） |

## 边界与约束

- 依赖：core.canvas、core.agents（经 `CanvasAuxTarget` 端口）、core.types（EditRevertServicePort）、shared.i18n、feature.inline-edit（parser 复用）。不 import chat 视图运行时。
- `getGateReport()` 返回最近一次真实探测结果，绝不伪造（`app.composition` 注入 notify=Notice 沉降）。
- Ctrl+Z 对 `setData` 的覆盖未验证：文本节点预览弹窗显示"不在回退覆盖内、Ctrl+Z 未验证"的诚实提示（E2）。
