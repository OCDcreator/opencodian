# System Agent Guard Service

> **源码**: `src/core/agents/SystemAgentGuardService.ts`
> **状态**: [REVIEW]

## 概述

处理内置系统 agent（`title`、`summary`、`compaction`）的风险边界。系统 agent 在 catalog 中始终可见，但默认只读；需开启专家模式后才允许 project override。

## 导入关系

```text
上游: src/core/agents/types.ts (isSystemAgentId, SystemAgentGuardResult)
下游: src/core/agents/index.ts, 未来 settings / Agent Studio 消费方
```

## 核心类型

| 类型 | 说明 |
|------|------|
| `SystemAgentRiskLabel` | 风险标签联合类型：`'expert-override-allowed'` / `'read-only'` / `null` |

## 核心方法

| 方法 | 说明 |
|------|------|
| `checkWriteAllowed(agentId)` | 检查写入是否允许：非系统 agent 总是允许；系统 agent 需专家模式 |
| `getRiskLabelKind(agentId)` | 返回结构化风险标签：`read-only` / `expert-override-allowed` / `null` |
| `setExpertMode(enabled)` | 设置专家模式开关 |
| `expertMode` (getter) | 读取当前专家模式状态 |

## 行为规则

- 非系统 agent：`allowed: true`
- 系统 agent + 专家模式关闭：`allowed: false`，`reason` 返回稳定的 machine-readable token `system-agent-expert-required`
- 系统 agent + 专家模式开启：`allowed: true`
- 专家模式允许 project override，但具体用户文案由 settings / locale 层决定，而不是在核心服务里硬编码英文字符串

## 注意事项

- 此服务只做写入守卫，不修改 catalog 数据
- 专家模式由调用方按用户偏好管理
- 实际写入 override 仍走统一 config / file 更新链路
