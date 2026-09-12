# Memory Recall

> **源码**: `src/core/memory/memoryRecall.ts`
> **状态**: [REVIEW]

## 概述

召回装配与词法选择器（zmem 孪生，D-O7 去掉 embedding 通道）：CJK 感知分词（拉丁词 + CJK 二元组，停用词剔除）、加权词重叠排名（name×3 / stem×2 / desc×1，verbatim 命中直取）、Topic File 正文格式化（年龄头 + 4096B/200 行上限 + 截断提示）、`<system-reminder>` 框架的 Relevant-Memory Reminder 装配（会话 ~64KB 预算、去重、密钥守卫整体拦截 + 尾注）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `tokenize` / `rankLexically` / `lexicalCandidates` | 词法选择（确定性，无模型调用） |
| `formatRecalledTopicFile()` | 单文件召回正文（调用方传 rawContent，核心无 fs） |
| `assembleRelevantMemory()` | 装配 Reminder；返回召回路径/字符数/守卫跳过清单 |
| `DEFAULT_RECALLED_CONTENT_BUDGET` | 61440 字符会话预算 |

## 边界与约束

- 语义召回默认关闭；开启后本仓 shipped 路径 = 词法选择 + 正文注入（零额外模型调用）。
