# CanvasSplitProposal

> **源码**: `src/core/canvas/CanvasSplitProposal.ts`
> **状态**: [REVIEW]

## 概述

R-C5 AI 主题拆分的输入契约（设计 §3.3 模式 2）。模型只提案不落盘：回复必须是严格 JSON 数组 `[{topic, sourcePath, excerpt}]`，`sourcePath` 必须是实际提供的笔记路径之一，`excerpt` 必须是原文摘录。解析 fail-closed（§6.4）：任何不合法回复都是 `ok:false` 加稳定 reason，由调用方明示并回退文件引用模式——绝不静默降级、绝不部分接受。

## 关键导出

| 导出 | 说明 |
|------|------|
| `parseCanvasSplitProposal(raw, knownPaths)` | 严格解析（容忍恰好一层代码围栏）；未知路径/空摘录/超长摘录均拒绝 |
| `buildCanvasSplitSystemPrompt(locale)` / `buildCanvasSplitPrompt(notes)` | 双语系统提示词 + `<note path>` 分块用户提示词 |
| `oversizeSplitNotes(inputs)` | 超单篇上限的笔记列表（调用方明示跳过，全超限则拒绝拆分） |
| `CANVAS_SPLIT_MAX_*` 常量 | 单篇 20k 字符 / 50 篇 / 单摘录 4k / 200 条提案 |

## 边界与约束

- 纯模块，零 Obsidian 导入（`tests/unit/core/canvas/CanvasSplitProposal.test.ts`）。
- 会话编排（`startAuxQuerySession` + `findWriteToolCalls` 审计）在 `feature.canvas-integration/CanvasGenerationFlow`，本文件只持有提示词与解析契约。
