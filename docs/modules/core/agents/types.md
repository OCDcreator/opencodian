# Agent Surface Types

> **源码**: `src/core/agents/types.ts`
> **状态**: [DRAFT]

## 概述

Agent surface layer 的统一类型定义。定义了三层真相源（runtime / config / file）的合并视图类型，保持各层数据可见且不虚假合并为单一状态。

## 导入关系

```text
上游: src/core/types/opencodeConfig.ts (OpencodeAgentConfig, OpencodeAgentMode)
下游: src/core/agents/AgentCatalogService.ts, src/core/agents/SystemAgentGuardService.ts, src/core/agents/index.ts
```

## 核心类型

| 类型 | 说明 |
|------|------|
| `SurfaceAgentSource` | Agent 来源层：`runtime` / `config` / `file` |
| `SurfaceAgent` | 统一 catalog 条目，含来源标记、模式、可见性、覆盖状态 |
| `SurfaceAgentFile` | Markdown agent 文件层真相（解析状态、frontmatter、scope） |
| `SurfaceAgentFileParseStatus` | 文件解析状态：`ok` / `parse-error` / `duplicate-id` / `conflict` |
| `SurfaceAgentFileScope` | 文件范围：`project`（`.opencode/`）或 `root` |
| `RuntimeAgentShape` | 运行时 agent 最小形状，从 `app.agents()` 映射 |
| `AgentCatalogInput` | Catalog 聚合输入：runtime / config / file 三层快照 |
| `SystemAgentGuardResult` | 系统 agent 写入检查结果 |
| `SystemAgentId` | 已知系统 agent ID 联合类型 |

## 核心常量与函数

| 导出 | 说明 |
|------|------|
| `SYSTEM_AGENT_IDS` | 已知系统 agent：`['title', 'summary', 'compaction']` |
| `isSystemAgentId()` | 判断 ID 是否为系统 agent，带类型收窄 |

## 关键设计决策

- `SurfaceAgent.sources` 是数组，一个 agent 可以同时出现在多个层
- `runtimeAvailable` / `hasProjectOverride` / `disabled` 分别表达各层状态
- `defaultEligible` 和 `subagentVisible` 由 mode + hidden + disabled 推导
- `builtin` 来自运行时 `native` 或 `builtIn` 字段，config-only agent 无此值
- `rawConfig` 保留原始 config 条目供上层使用

## 注意事项

- `fileAgents` 输入在 A1 slice 中为可选；完整 Markdown 扫描推迟到 A4
- 不在此模块做任何 runtime/config/file 合并逻辑——合并由 `AgentCatalogService` 负责
