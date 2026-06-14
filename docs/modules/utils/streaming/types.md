# Streaming 类型定义

> **源码**: `src/utils/streaming/types.ts`
> **状态**: [REVIEW]

## 概述

定义流式渲染系统的全部类型，包括流数据块、工具调用、内容块、思考块状态、流状态和事件回调。作为流式模块的类型中枢，供 `StreamController`、`ThinkingBlockRenderer`、`ToolCallRenderer` 和上层消费者共同使用。

## 导入关系
上游: `../markdown` (MarkdownRenderService)
下游: `StreamController`, `ThinkingBlockRenderer`, `ToolCallRenderer`, `./index`, `OpenCodianView`

## 核心类型 / 接口

### 流数据块（StreamChunk 联合类型）

| 类型 | 接口 | 字段 |
|------|------|------|
| `thinking` | `ThinkingChunk` | `content`, `partId?`, `durationSeconds?` |
| `text` | `TextChunk` | `content` |
| `tool_use` | `ToolUseChunk` | `id`, `name`, `input`, `toolMetadata?`, `resultVisibility?` |
| `tool_result` | `ToolResultChunk` | `id`, `content`, `isError?` |
| `error` | `ErrorChunk` | `content`, `errorClass?` (SdkErrorClass) |
| `done` | `DoneChunk` | （无字段） |

### 工具调用类型

```typescript
type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  resultVisibility?: 'visible' | 'hidden';
}
```

### 内容块（ContentBlock 联合类型，用于持久化）

| 类型 | 字段 |
|------|------|
| `TextContentBlock` | `type: 'text'`, `content: string` |
| `ThinkingContentBlock` | `type: 'thinking'`, `content: string`, `partId?: string`, `durationSeconds?: number` |
| `ToolCallContentBlock` | `type: 'tool_call'`, `toolCall: ToolCallInfo` |

### 思考块状态（ThinkingBlockState）

运行时 DOM 状态：`wrapperEl`, `contentEl`, `labelEl`, `content`, `partId`, `resolvedDurationSeconds`, `startTime`, `timerInterval`, `isExpanded`。

### 流状态（StreamState）

```typescript
{
  isStreaming: boolean;
  currentContentEl: HTMLElement | null;
  currentTextEl: HTMLElement | null;
  currentTextContent: string;
  currentThinkingState: ThinkingBlockState | null;
  thinkingBlocksByPartId: Map<string, ThinkingContentBlock>;
  thinkingBlockElements: Map<string, HTMLElement>;
  toolCalls: Map<string, ToolCallInfo>;
  toolCallElements: Map<string, HTMLElement>;
  contentBlocks: ContentBlock[];
}
```

### 控制器选项（StreamControllerOptions）

```typescript
{
  containerEl: HTMLElement;
  markdownService: MarkdownRenderService;
  onStreamComplete?: (contentBlocks: ContentBlock[]) => void;
  onToolCallClick?: (toolCall: ToolCallInfo) => void;
  scrollToBottom?: () => void;
  onCollapsibleToggle?: () => void;
}
```

### 渲染器选项

**ToolRendererOptions**: `iconMap?`, `getToolName?`, `getToolSummary?(name, input, toolKind?)`, `renderExpandedContent?`, `onCollapsibleToggle?`, `onOpenToolSession?`, `onOpenMcpServerDetail?`

**ThinkingRendererOptions**: `collapsedByDefault?`, `showTimer?`, `collapsedLabel?`, `expandedLabel?`, `onCollapsibleToggle?`

### 事件回调（StreamEventCallbacks）

```typescript
{
  onThinkingStart?: () => void;
  onThinkingEnd?: (durationSeconds: number) => void;
  onTextAppend?: (text: string) => void;
  onToolCallStart?: (toolCall: ToolCallInfo) => void;
  onToolCallEnd?: (toolCall: ToolCallInfo) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}
```

## 核心逻辑

### createStreamState()

工厂函数，创建初始 `StreamState`，所有 Map 为空，`isStreaming=false`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `createStreamState()` | 创建初始流状态 |

## 数据流

类型在数据流中的位置：

```
SSE event → StreamChunk (输入类型)
  → StreamController 处理
    → ThinkingBlockState / ToolCallInfo (运行时状态)
    → ContentBlock[] (持久化类型)
      → StorageService 存储
      → renderStoredContentBlocks() 恢复
```

## 与其他模块的交互

- **StreamController**: 使用所有核心类型
- **ThinkingBlockRenderer**: 使用 `ThinkingBlockState`, `ThinkingRendererOptions`
- **ToolCallRenderer**: 使用 `ToolCallInfo`, `ToolCallStatus`, `ToolRendererOptions`
- **OpenCodianView**: 使用 `StreamControllerOptions`, `StreamEventCallbacks`, `ContentBlock`

## 配置项

无直接配置项。通过各 Options 接口传递配置。

## 注意事项

- `StreamChunk` 是区分联合类型（discriminated union），`type` 字段用于 switch 分发
- `ContentBlock` 是持久化格式，不包含 DOM 引用
- `toolMetadata` 是白名单 UI metadata；当前主要用于 `task` / subagent child session linkage
- `resultVisibility` 是白名单结果可见性 contract；`task` 使用 `hidden`，表示结果保留但不应直接渲染
- `ThinkingBlockState` 包含 DOM 引用和 `setInterval` ID，不能序列化
- `createStreamState()` 是唯一的状态创建入口
