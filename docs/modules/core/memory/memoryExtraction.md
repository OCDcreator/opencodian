# Memory Extraction

> **源码**: `src/core/memory/memoryExtraction.ts`
> **状态**: [REVIEW]

## 概述

每轮后台抽取（zmem D24–D27 孪生）：闸门（转录非空且较上次水位有增长、最新用户话语 ≥3 词 / ≥8 个 CJK 字符、本轮未自己写记忆目录）、写入检测（从 `toolCalls` 探测 write/edit/multiedit/str_replace_editor/apply_patch 触及桶路径且 ≥160 字符）、抽取提示词（含防重复索引、≤1 条、正文引证规则）与防御式 JSON 解析（fail-soft → []）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `evaluateExtractionGate()` | 命名 skipReason 的完整闸门（loop 测试断言零模型调用的依据） |
| `toExtractionLines()` | 持久化消息 → 闸门用转录行（剔除压缩产物） |
| `memoryWritePaths()` | 本轮写入桶内的路径清单 |
| `buildExtractionSystemPrompt/UserPrompt` | 蒸馏提示词（转录 24K 字符截断） |
| `parseExtractionResponse()` | 防御解析；批内去重、类型白名单、长度钳制、≤1 条 |
| `extractionSourceTag()` | `extracted <session[:12]>` 来源标签 |

2026-10-28：实际提取执行器已迁至 memoryAgentExtraction，原 ≤1 JSON 解析函数仅保留兼容调用，不再是后台主路径。evaluateExtractionGate 按水位后的整个切片检查 ≥3 词或 ≥8 CJK 字符，历史已写记忆不阻止新一轮；completedAgentTranscripts 仅提取 completed 的命名 task/agent 实质正文。
