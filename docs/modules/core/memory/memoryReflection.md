# Memory Reflection

> **源码**: `src/core/memory/memoryReflection.ts`
> **状态**: [REVIEW]

## 概述

压缩后反思（zmem D12 孪生）：会话压缩时对整段转录蒸馏 ≤3 条持久观察，类型限 project/reference/feedback（user 画像留给协议路径），写计划盖 `compacted <session>` 来源 + `reflection: true` 标记。提示词与解析器与抽取同型但更严（宁可空数组不臆测）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildReflectionSystemPrompt/UserPrompt` | 反思提示词 |
| `parseReflectionResponse()` | 防御解析（fail-soft → []，≤3 条） |
| `planReflectionWrites()` | 反思写计划（冲突跳过） |
| `reflectionSourceTag()` | `compacted <session[:12]>` |
