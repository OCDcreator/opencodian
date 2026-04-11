# Streaming Barrel

> **源码**: `src/utils/streaming/index.ts`
> **状态**: [REVIEW]

## 概述

流式渲染子系统的聚合入口，向上层统一暴露 `StreamController`、`ThinkingBlockRenderer`、`ToolCallRenderer` 以及流式状态相关类型。聊天主视图通常通过这个入口获得流事件处理能力。

## 导入关系

```text
上游: ./StreamController, ./ThinkingBlockRenderer, ./ToolCallRenderer, ./types
下游: OpenCodianView、测试与其他需要消费流式事件的模块
```

## 核心类型 / 接口

```typescript
export { StreamController } from './StreamController';
export { ThinkingBlockRenderer } from './ThinkingBlockRenderer';
export { ToolCallRenderer } from './ToolCallRenderer';
export type {
  ContentBlock, DoneChunk, ErrorChunk, StreamChunk, StreamControllerOptions,
  StreamEventCallbacks, StreamState, TextChunk, TextContentBlock, ThinkingBlockState,
  ThinkingChunk, ThinkingContentBlock, ThinkingRendererOptions, ToolCallContentBlock,
  ToolCallInfo, ToolCallStatus, ToolRendererOptions, ToolResultChunk, ToolUseChunk,
} from './types';
export { createStreamState } from './types';
```

## 核心逻辑

### 流处理能力收口

该 barrel 把“状态控制器 + 两类渲染器 + 类型定义”收束为一组公开 API，方便视图层整体引入。

### 类型入口统一

`StreamChunk`、`StreamState` 等高频类型也从这里暴露，避免调用方分别从 `types.ts` 深路径导入。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `StreamController` | 流事件状态控制器 |
| `ThinkingBlockRenderer` | thinking 内容块渲染器 |
| `ToolCallRenderer` | 工具调用内容块渲染器 |
| `createStreamState()` | 创建流式状态初值 |

## 数据流

典型链路：OpenCodeService 推送 `StreamChunk` -> `StreamController` 路由和聚合 -> 对应渲染器更新 UI。

## 与其他模块的交互

- 与 [StreamController.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/streaming/StreamController.md)、[ThinkingBlockRenderer.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/streaming/ThinkingBlockRenderer.md)、[ToolCallRenderer.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/streaming/ToolCallRenderer.md)、[mcp-summary-fields.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/streaming/mcp-summary-fields.md)、[types.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/streaming/types.md) 组成同一子系统

## 配置项

无直接配置。

## 注意事项

- 如果未来新增更多流式渲染器，应评估是否一起纳入此 barrel，避免公开 API 面失衡

