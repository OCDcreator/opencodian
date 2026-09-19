# CanvasRewriteModals

> **源码**: `src/features/canvas-integration/CanvasRewriteModals.ts`
> **状态**: [REVIEW]

## 概述

R-C5 节点级 AI 编辑的三个显式对话框（设计 §3.4 / §6.3 / §6.7），全部只用 Obsidian 原生组件与主题样式（比照 `PdfAnnotationPreviewModal`，零自定义 CSS 面）：

- **`CanvasRewriteInstructionModal`**：指令输入（Enter 提交、Shift+Enter 换行、IME 组合态不提交）。
- **`CanvasRewritePreviewModal`**：写前预览确认门——原文/新文对照 + 写入目标说明；Mermaid 单块结果附带实时渲染预览（`MarkdownRenderer.render` + 独立 `Component` 生命周期，渲染失败保留原始代码块）；`copyOnly`（D 级）把确认按钮换成"复制到剪贴板"并显式说明；`revertNote` 诚实展示回退边界（两种节点同规则：R-B3 覆盖面未组装时显示警示且写回被控制器拒绝；已组装时双撤销通道——宿主 Ctrl+Z 与侧栏回退——均存在，不显示警示）。
- **`CanvasNodePickModal`**：C 级节点挑选（selection 不可读时列出 `canvas.getData()` 全部 text/file 节点）。

## 关键导出

| 导出 | 说明 |
|------|------|
| 三个 Modal 类 | 指令输入 / 预览确认 / 节点挑选 |
| `isSingleMermaidBlock(text)` | "恰为一个 ```mermaid 代码块"判定（驱动渲染预览） |

## 注意事项

- 所有 resolve 路径都走 `resolved` 幂等标志 + `onClose` 兜底（Esc = 取消），不存在双触发。
- 无设置项、无持久状态；文案全部走 `canvas.rewrite.*` 双语 locale。
