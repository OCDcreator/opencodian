# Agent Catalog Service

> **源码**: `src/core/agents/AgentCatalogService.ts`
> **状态**: [DRAFT]

## 概述

将 runtime、config、file 三层 agent 真相聚合为统一的 `SurfaceAgent[]` catalog。纯函数层——调用方提供三层快照，服务返回合并结果，不做 I/O 或副作用。

## 导入关系

```text
上游: src/core/agents/types.ts, src/core/types/opencodeConfig.ts
下游: src/core/agents/index.ts, 未来 chat/settings 消费方
```

## 核心方法

| 方法 | 说明 |
|------|------|
| `aggregate(input)` | 接收 `AgentCatalogInput`，返回 `SurfaceAgent[]` |

## 聚合逻辑

聚合顺序：runtime → config → file。每层独立贡献：

1. Runtime 层提供 `name`、`mode`、`hidden`、`native`、`description`
2. Config 层提供 project override 和 config-only agent
3. File 层提供 markdown-originated entries（A4 补全）

当同名 agent 在多层出现时，config 值覆盖 runtime 默认值，但 sources 数组保留所有层标记。

## 数据流

```text
runtime app.agents() + config agent map + file scan
  → AgentCatalogService.aggregate()
  → SurfaceAgent[]
  → chat picker / settings catalog / @subagent picker
```

## 注意事项

- 不合并多层状态为单一 "effective" 值——`hasProjectOverride` 和 `runtimeAvailable` 分别保留
- `disabled` 仅来自 config `disable: true`
- `defaultEligible` = mode 是 `primary` 或 `all`，且非 hidden 非 disabled
- `subagentVisible` = mode 是 `subagent` 或 `all`，且非 hidden
