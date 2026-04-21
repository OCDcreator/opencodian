# Tool Types

> **源码**: `src/core/types/tools.ts`
> **状态**: [REVIEW]

## 概述

定义工具调用的类型结构和工具名常量。包含 `ToolCallStatus` 状态枚举、`ToolCallInfo` 数据接口、以及与 `src/core/tools/toolNames.ts` 重复的 `TOOL_NAMES` 常量和 `ToolName` 类型。此模块是工具调用在 UI 渲染和流式处理中的类型基础。

## 导入关系

上游: 无外部依赖
下游:
- `src/utils/streaming/ToolCallRenderer.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/core/types/chat.ts`（`ToolCallInfo` 和 `ContentBlock` 中的工具相关字段）

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `ToolCallStatus` | `'pending' \| 'running' \| 'completed' \| 'error' \| 'blocked'` — 工具调用生命周期状态 |
| `ToolCallInfo` | 工具调用信息（`id`, `name`, `input`, `toolMetadata?`, `status`, `result?`, `resultVisibility?`, `isExpanded?`） |
| `TOOL_NAMES` | `as const` 常量对象，14 个工具名（与 `toolNames.ts` 重复） |
| `ToolName` | 工具名联合类型（与 `toolNames.ts` 重复） |

## 工具名常量

```typescript
const TOOL_NAMES = {
  READ: 'Read',
  WRITE: 'Write',
  EDIT: 'Edit',
  BASH: 'Bash',
  GLOB: 'Glob',
  GREP: 'Grep',
  VIEW: 'View',
  LS: 'LS',
  ASK_USER: 'AskUser',
  ENTER_PLAN_MODE: 'EnterPlanMode',
  EXIT_PLAN_MODE: 'ExitPlanMode',
  TASK: 'Task',
  WEB_SEARCH: 'WebSearch',
  WEB_FETCH: 'WebFetch',
} as const;
```

## 核心逻辑

### 工具调用状态机

```
pending → running → completed
                  → error
                  → blocked
```

- `pending`: 工具调用已创建，等待执行
- `running`: 正在执行中
- `completed`: 执行完成，`result` 包含输出
- `error`: 执行出错，`result` 包含错误信息
- `blocked`: 被黑名单或权限拒绝拦截

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 工具调用唯一 ID |
| `name` | `string` | 工具名（匹配 `TOOL_NAMES` 中的值） |
| `input` | `Record<string, unknown>` | 工具输入参数 |
| `toolMetadata` | `Record<string, unknown>?` | UI-safe 白名单 metadata；当前主要保留 OpenCode `task` 的 `sessionId` |
| `status` | `ToolCallStatus` | 当前状态 |
| `result` | `string?` | 执行结果（completed/error 时有值） |
| `resultVisibility` | `'visible' \| 'hidden'?` | 结果可见性；OpenCode 原生 `task` 使用 `hidden`，避免 `<task_result>` 被普通渲染器直接展示 |
| `isExpanded` | `boolean?` | UI 展开状态 |

## 关键方法

无运行时方法，仅类型和常量导出。源码约 35 行。

## 数据流

1. SSE 流事件 `tool_use` → 创建 `ToolCallInfo`（`status='pending'`）
2. 工具开始执行 → `status` 更新为 `'running'`
3. SSE 流事件 `tool_result` → `status` 更新为 `'completed'`/`'error'`，填充 `result`
4. 黑名单拦截 → `status` 设为 `'blocked'`
5. UI 根据 `status` 和 `name` 选择渲染模板（可折叠面板、代码块等）

## 与其他模块的交互

- **ToolCallRenderer**: 使用 `ToolCallInfo` 渲染工具调用的展开/折叠 UI
- **chat.ts**: `ChatMessage.toolCalls` 为 `ToolCallInfo[]`；`ContentBlock` 中的 `toolStatus` 使用兼容值
- **toolNames.ts**: 定义相同的 `TOOL_NAMES` 和 `ToolName`（存在重复，应统一）

## 配置项

无，工具类型由 OpenCode server 协议决定。

## 注意事项

- **重复定义**: `TOOL_NAMES` 和 `ToolName` 在 `src/core/types/tools.ts` 和 `src/core/tools/toolNames.ts` 中均有定义，内容完全相同。消费方目前从不同位置导入，应统一入口
- `chat.ts` 中的 `ToolCallInfo` 与此模块的定义略有不同（chat.ts 版本在本地扩展了 `isExpanded`），两个定义并存
- `isExpanded` 是纯 UI 状态，不参与持久化
- `blocked` 状态由 `BlocklistChecker` 在权限审批流程中设置

## 工具输入参数示例

| 工具 | 典型 input 字段 |
|------|----------------|
| Read | `{ file: string, offset?: number, limit?: number }` |
| Write | `{ file: string, content: string }` |
| Edit | `{ file: string, old_string: string, new_string: string }` |
| Bash | `{ command: string, timeout?: number }` |
| Glob | `{ pattern: string, path?: string }` |
| Grep | `{ pattern: string, path?: string, output_limit?: number }` |
| LS | `{ path: string }` |
