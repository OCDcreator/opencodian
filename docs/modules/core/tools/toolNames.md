# Tool Name Constants

> **源码**: `src/core/tools/toolNames.ts`
> **状态**: [REVIEW]

## 概述

`toolNames.ts` 定义了 OpenCodian 侧维护的一份工具名常量表，并导出基于该常量表推导出来的 `ToolName` 联合类型。这里的字符串值看起来对应 OpenCode 事件里的工具名显示值。

## 导入关系

```text
上游: 无
下游: src/core/tools/index.ts
```

## 核心类型 / 接口

```typescript
export const TOOL_NAMES = {
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

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
```

## 常量内容

| 键 | 值 |
|------|------|
| `READ` | `Read` |
| `WRITE` | `Write` |
| `EDIT` | `Edit` |
| `BASH` | `Bash` |
| `GLOB` | `Glob` |
| `GREP` | `Grep` |
| `VIEW` | `View` |
| `LS` | `LS` |
| `ASK_USER` | `AskUser` |
| `ENTER_PLAN_MODE` | `EnterPlanMode` |
| `EXIT_PLAN_MODE` | `ExitPlanMode` |
| `TASK` | `Task` |
| `WEB_SEARCH` | `WebSearch` |
| `WEB_FETCH` | `WebFetch` |

## 导出语义

### `TOOL_NAMES`

提供一组 `as const` 常量，方便调用方：

- 避免硬编码字符串
- 让 TypeScript 推导出字面量值

### `ToolName`

`ToolName` 是 `TOOL_NAMES` 值的联合类型，即：

```typescript
'Read' | 'Write' | 'Edit' | 'Bash' | 'Glob' | 'Grep' | 'View' | 'LS'
| 'AskUser' | 'EnterPlanMode' | 'ExitPlanMode' | 'Task' | 'WebSearch' | 'WebFetch'
```

## 与其他模块的交互

- `src/core/tools/index.ts` 重新导出了这份常量表。
- `src/core/types/tools.ts` 里存在一份字段完全相同的 `TOOL_NAMES` 和 `ToolName` 定义，当前需要人工保持同步。

## 注意事项

- 这份常量表目前在仓库内的直接消费面很窄；修改字符串值前，应同时检查 `src/core/types/tools.ts` 以及任何依赖工具名字面量的渲染逻辑。
- 如果未来改为只保留单一定义源，`docs/modules/core/tools/index.md` 也需要同步更新聚合关系描述。
