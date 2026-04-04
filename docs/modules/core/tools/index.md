# Core Tools Barrel

> **源码**: `src/core/tools/index.ts`
> **状态**: [DRAFT]

## 概述

工具相关的聚合入口。它把运行时工具名常量 `TOOL_NAMES` 与类型层的 `ToolCallInfo` 组合到同一导入面，方便工具渲染、权限判断和消息标准化代码统一取用。

## 导入关系

```text
上游: ./toolNames, ../types/tools
下游: 流式渲染、聊天视图、权限相关模块
```

## 核心类型 / 接口

```typescript
export type { ToolCallInfo } from '../types/tools';
export { TOOL_NAMES } from './toolNames';
```

## 核心逻辑

### 运行时常量与类型桥接

该 barrel 不定义新逻辑，而是把“工具名字面量集合”和“工具调用结构类型”放到一个更顺手的入口里。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `TOOL_NAMES` | 工具名常量表 |
| `ToolCallInfo` | 工具调用展示与状态跟踪所用类型 |

## 数据流

典型链路为：SSE / SDK 事件产生工具调用信息 -> 上层模块从本 barrel 获取常量和类型 -> 根据工具名决定渲染和权限行为。

## 与其他模块的交互

- 运行时工具名定义位于 [toolNames.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/tools/toolNames.md)
- `ToolCallInfo` 的结构来源于 `core/types/tools.ts`

## 配置项

无。

## 注意事项

- 当前这个 barrel 同时横跨 `core/tools` 和 `core/types`，变更导出时要关注潜在循环依赖

## 待补充

- [ ] 说明是否需要把 `ToolName` 类型也一并从此处导出

