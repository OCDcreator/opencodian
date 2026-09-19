# PDF View Probe

> **源码**: `src/core/pdf/pdfViewProbe.ts`
> **状态**: [REVIEW]

## 概述

三期降级阶梯的纯判定核心（设计 §3.3/§7）。`resolvePdfIntegrationLevel` 把宿主收集的 feature-detect 结果映射为 A/B/C 级并给出逐条原因（设置页调试区如实展示，绝不伪装 A 级）：A = 工具栏 + 原生选区序列化 + `#page&selection` 回链 + 高亮反馈；B = 工具栏按钮 + DOM 选区文本 + 仅 `#page=N`；C = 命令开聊天手动粘贴（零内部依赖，恒可用）。`isValidRangeStr` 校验 Obsidian 原生 `"startIdx,startOffset,endIdx,endOffset"` 序列；`pageNumberOfSelectionNode` 沿选区锚点向上找 `.page[data-page-number]`。

**A 级证据规则（2026-09-19）**：A 只授予 `nativeRangeStrProvenOnSelection`——序列化器在**真实选区**上端到端产出合法序列（部署版实测教训："函数可调用 + 无选区时不抛错"被当作 A 级证据，而真实捕获每次都在宿主内抛 `e.contains is not a function`，报告 A、实际走 B 级 DOM 路径——报告能力与真实能力不一致）。可调用但未证明的序列化器是 B 级，原因逐字记为 "unproven on a live selection"。

## 关键导出

| 导出 | 说明 |
|------|------|
| `resolvePdfIntegrationLevel()` | 探测结果 → 级别 + 原因列表（缺失能力一次性全量上报） |
| `isValidRangeStr()` | 原生选区序列合法性 |
| `pageNumberOfSelectionNode()` | DOM 选区 → 页码（无容器返回 null → 走 C） |

## 边界与约束

- 纯函数：DOM/ viewer 触碰在 `PdfChatIntegration`（feature.chat-services），本文件可脱离 Obsidian 单测。
- 观测与判定分离让“Obsidian 升级后内部结构失效”可被单测钉住并自动落 B/C。
