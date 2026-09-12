# Memory Hygiene

> **源码**: `src/core/memory/memoryHygiene.ts`
> **状态**: [REVIEW]

## 概述

维护_needed_ 信号与标记化提示（zmem 2026-08-23 附记孪生）：未审反思文件 ≥3 → REVIEW；索引 ≥150 行或 ≥20KB（200/25KB 硬上限前的预警带）或归档候选 ≥3（importance ≤2 且 90 天未更新）→ AUDIT。提示带 `⚠️ [MEMORY-ACTION]` 标记注入到回合上下文，要求模型逐字转述给用户并仅在用户明确同意时执行维护（同意闸门）。插件自身从不修改记忆。

## 关键导出

| 导出 | 说明 |
|------|------|
| `assessHygiene()` | 纯评估 → `HygieneAssessment` |
| `buildHygieneNotice()` | 渲染标记提示；健康时返回 null |
| `HYGIENE_NOTICE_MARKER` | `[MEMORY-ACTION]` 可 grep 标记 |
