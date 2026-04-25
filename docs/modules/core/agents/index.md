# Agent Surface Barrel

> **源码**: `src/core/agents/index.ts`
> **状态**: [DRAFT]

## 概述

`src/core/agents/` 模块的聚合入口，重新导出所有 agent surface layer 公共 API。

## 导出面

| 来源模块 | 导出 |
|----------|------|
| `AgentCatalogService` | 类 `AgentCatalogService` |
| `AgentInvocationService` | 类 `AgentInvocationService` |
| `SystemAgentGuardService` | 类 `SystemAgentGuardService` |
| `types` | 常量 `SYSTEM_AGENT_IDS`、函数 `isSystemAgentId`、类型 `AgentCatalogInput`、`RuntimeAgentShape`、`SurfaceAgent`、`SurfaceAgentFile`、`SurfaceAgentFileParseStatus`、`SurfaceAgentFileScope`、`SurfaceAgentSource`、`SystemAgentGuardResult`、`SystemAgentId`、`SurfaceInvocationIntent`、`AgentMentionIntent`、`SubtaskIntent`、`InvocationPromptPart`、`ResolvedAgentInvocation` |

## 消费方

未来由 chat 入口、settings Agent Studio、command editor 等通过此 barrel 导入；A2 之后聊天发送链路也通过它拿到 `AgentInvocationService` 与显式调用类型。

## 注意事项

- 此 barrel 只做重导出，不引入新逻辑
- 新增 agent surface 模块时需同步更新此文件
