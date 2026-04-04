# OpenCode Service Types

> **源码**: `src/core/opencode/types.ts`
> **状态**: [DRAFT]

## 概述

OpenCode 服务层的类型定义文件，定义与会话（Session）、消息（Message）和流式事件（Streaming Events）相关的核心类型。这些类型构成 OpenCodeService 与上层 UI 之间的契约，独立于 SDK v2 的类型体系。

## 导入关系

```text
上游: src/core/types/chat.ts, src/core/types/models.ts, src/core/types/tools.ts
下游: src/core/opencode/OpenCodeService, src/core/opencode/sdkTypes, src/features/chat/OpenCodianView
```

## 核心类型 / 接口

```typescript
// 会话信息
interface SessionInfo {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  // ...
}

// 消息信息（服务层视图）
interface MessageInfo {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: MessagePart[];
  timestamp: string;
  // ...
}

// 消息部件
type MessagePart =
  | TextPart
  | ThinkingPart
  | ToolUsePart
  | ToolResultPart
  | ContextPart
  | ...;

// 流式事件块
interface StreamChunk {
  type: "text" | "thinking" | "tool_use" | "tool_result" | "done" | "error";
  sessionId: string;
  content?: string;
  // ...
}

// 权限请求
interface PermissionRequest {
  id: string;
  toolName: string;
  description: string;
  // ...
}

// 问答请求
interface QuestionRequest {
  id: string;
  question: string;
  answers?: string[];
  // ...
}

// Diff 结果
interface SessionDiff {
  files: FileDiff[];
  summary?: string;
  // ...
}
```

## 核心逻辑

此模块为纯类型定义文件，不包含运行时逻辑。定义的类型用于：
1. OpenCodeService 的方法签名（参数和返回值）
2. SDK v2 类型到内部类型的映射目标
3. UI 层的数据契约

## 关键方法

无（纯类型定义文件）。

## 数据流

```
SDK v2 Types → sdkTypes (桥接) → types.ts (服务层类型) → ChatMessage/UI Types
```

## 与其他模块的交互

- **OpenCodeService**: 所有方法签名使用此模块的类型
- **sdkTypes**: 将 SDK v2 类型映射到此模块定义的类型
- **features/chat/**: 消费这些类型进行 UI 渲染
- **core/types/**: 引用底层的 chat、models、tools 类型定义

## 配置项

无。

## 注意事项

- 此文件定义的是服务层（service-level）类型，与 SDK v2 类型和 UI 层类型都可能有差异
- 新增消息类型（如 StreamChunk 的 type 扩展）应在此文件中定义
- 类型变更需要同步更新 sdkTypes 的映射和 UI 层的消费逻辑

## 待补充

- [ ] 完整的类型定义列表（所有 interface / type）
- [ ] MessagePart 的所有变体定义
- [ ] StreamChunk 的完整字段
- [ ] 与 `src/core/types/chat.ts` 中 ChatMessage 的关系和区别
- [ ] 与 SDK v2 类型的对照表
