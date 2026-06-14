# Task Tool Call Renderer

> **源码**: `src/utils/streaming/TaskToolCallRenderer.ts`
> **状态**: [REVIEW]

## 概述

为 `task` / subagent 工具调用渲染展开详情。该模块从 `ToolCallRenderer` 中拆分出来，避免主渲染器文件过度膨胀。它显示 agent 类型、描述、状态和子会话 ID，并提供 “Open subagent session” 按钮。

## 导入关系

```text
上游: ./types (ToolCallInfo)
下游: ToolCallRenderer.ts
```

## 导出函数

| 函数 | 说明 |
|------|------|
| `renderTaskExpandedContent(container, toolCall, onOpenToolSession?)` | 创建 `.streaming-task-details` 展开区，包含 Agent / Description / Status / Session 信息 |

## 数据流

```text
ToolCallRenderer (检测到 task kind)
  → renderTaskExpandedContent(container, toolCall, onOpenToolSession)
  → .streaming-task-details DOM
```

## 注意事项

- 不默认展开原始 `<task_result>` 文本；结果保留在子会话中。
- 如果 `toolMetadata.sessionId` 存在，渲染打开子会话按钮。
- 错误状态提示用户打开子会话查看详情。
