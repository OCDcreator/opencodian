# Child Session Graph Service

> **源码**: `src/core/agents/ChildSessionGraphService.ts`
> **状态**: [REVIEW]

## 概述

从持久化消息里的 task 工具元数据重建 `task → child session` 边，并可选地拿 `session.children()` 的实时结果做交叉比对，识别缺少持久化边的 orphan child session。该模块是纯函数服务层：调用方提供消息快照和子会话快照，服务只返回 `ChildSessionGraph`，不做 I/O、SDK 调用或状态写入。

## 导入关系

```text
上游: src/core/agents/types.ts
下游: src/core/agents/index.ts, 未来会话树 / task-child 关系消费方
```

## 关键类型

| 类型 | 说明 |
|------|------|
| `ChildSessionGraphInput` | 输入载荷，包含 parent session、持久化消息、可选 live child sessions |
| `ChildSessionEdge` | 一条 task tool call 到 child session 的重建边 |
| `ChildSessionGraph` | 单个 parent session 的完整重建结果 |
| `ChildSessionInfo` | `session.children()` 返回的最小子会话形状 |
| `OrphanedChildSession` | 未匹配到任何边的 child session 显示数据，供 UI 渲染 partial graph 行 |

## 核心方法

| 方法 | 说明 |
|------|------|
| `reconstructGraph(input)` | 扫描消息中的 task content block / tool call，恢复边并计算 orphan / graph status |

## 数据源与优先级

重建顺序固定为：

1. 持久化 task 元数据：优先扫描 `contentBlocks[].toolMetadata.sessionId`
2. 兼容旧路径：回退扫描 `toolCalls[].toolMetadata.sessionId`
3. 实时子会话补充：使用 `session.children()` 结果检测 orphaned child sessions，并补齐缺失的 `title` / `lastUpdatedAt`

如果同一个 child session 同时出现在 `contentBlocks` 与 `toolCalls`，服务按扫描顺序保留第一条边，确保 content block 路径优先。

## 降级与部分图行为

- 没有任何边且没有 live child session：返回 `status = 'empty'`
- 有重建边且不存在 orphan：返回 `status = 'complete'`
- `session.children()` 中出现未匹配 child session：记录到 `orphanedSessions`，并同步导出 `orphanedSessionIds` 兼容旧消费方，然后返回 `status = 'partial'`
- 缺失 `toolMetadata.sessionId`、空字符串 sessionId、非 task 工具调用都会被静默跳过，不伪造边

## 输出约束

- `orphanedSessions` 只来自未匹配的 `ChildSessionInfo`，不会伪造 task 元数据
- `orphanedSessionIds` 始终由 `orphanedSessions.map((session) => session.id)` 派生，避免双份状态漂移
- 边 enrich 只做补齐：已有 `edge.title` 优先，缺失时才回退到 child session `title`
- `lastUpdatedAt` 优先使用 child session `updatedAt`，缺失时回退到 `createdAt`

## 与 `OpenCodeService.getSessionChildren()` 的关系

`ChildSessionGraphService` 不直接调用 `OpenCodeService.getSessionChildren()`；它只消费调用方传入的 `childSessions`。这样可以让上层运行时自由决定何时请求 live child session 数据，也让该模块保持可测试、可重放、可离线重建的纯函数特性。
