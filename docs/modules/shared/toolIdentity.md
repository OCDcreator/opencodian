# Tool Identity

> **源码**: `src/shared/toolIdentity.ts`
> **状态**: [REVIEW]

## 概述

统一归一化工具身份。它把内置工具、Claudian/Codex 风格 MCP（`mcp__server__tool`）和 OpenCode 风格外部工具（如 `server_tool`）收敛成一个结构化结果，供 `OpenCodeService`、`ToolCallRenderer` 和工具状态辅助逻辑共用。

## 导入关系

上游: 无外部依赖
下游: `src/shared/toolExecution.ts`, `src/core/opencode/OpenCodeService.ts`, `src/utils/streaming/ToolCallRenderer.ts`, 单元测试

## 核心类型 / 接口

```typescript
type ToolIdentityKind =
  | 'builtin'
  | 'mcp'
  | 'custom'
  | 'task'
  | 'question'
  | 'skill'
  | 'plan'
  | 'unknown';

interface ToolIdentityOptions {
  source?: 'generic' | 'opencode' | 'claudian' | 'codex';
  knownMcpTools?: Iterable<string>;
}

interface ToolIdentity {
  rawName: string;
  normalizedName: string;
  kind: ToolIdentityKind;
  icon: string;
  displayName: string;
  isMcp: boolean;
}
```

## 核心逻辑

- 先按大小写/分隔符不敏感的 builtin 表匹配，给出稳定的 `normalizedName`、友好显示名和图标。
- `mcp__*` 一律按 MCP 识别，兼容 Claudian/Codex 旧格式。
- OpenCode 模式下，若命中 `knownMcpTools`，则把 `server_tool` 精确标成 MCP，并使用 `opencodian-tool-mcp`。
- OpenCode 模式下，若没有目录但名称看起来像外部工具，则按 `custom` 兜底，并保留 `layers` 图标，避免回退成扳手。

## 关键导出

| 导出 | 说明 |
|------|------|
| `MCP_TOOL_ICON_ID` | MCP 工具默认图标 id（`opencodian-tool-mcp`） |
| `getToolIdentity()` | 返回完整的工具身份对象 |
| `getNormalizedToolName()` | 返回统一规范名 |
| `isBuiltinToolName()` | 判断是否属于内置/特殊内建工具 |

## 注意事项

- `mcp` 当前使用注册后的 LobeHub MCP 图标 `opencodian-tool-mcp`，并已按 Obsidian 自定义图标的 100×100 坐标系做缩放适配；`custom` 继续使用 `layers`。
- `task` 的显示名现在刻意保持为 `Subagent Task`，避免把 OpenCode 原生 subagent/task 卡片误称成 OMO background task。
- `StructuredOutput` / `structured_output` 仍会被归一到同一规范名，保证内部过滤逻辑不回归。
