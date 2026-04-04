# Tool Call Renderer

> **源码**: `src/utils/streaming/ToolCallRenderer.ts`
> **状态**: [DRAFT]

## 概述

渲染 AI 工具调用卡片。显示工具名称、摘要信息、状态图标和可展开的执行结果。为每个工具类型提供专门的摘要生成逻辑（文件名提取、命令截断等），支持 MCP 工具和自定义图标映射。

## 导入关系
上游: `obsidian` (setIcon), `./types` (ToolCallInfo, ToolCallStatus, ToolRendererOptions)
下游: `StreamController` (持有并调用)

## 核心类型 / 接口

### ToolRendererOptions
```typescript
{
  iconMap?: Record<string, string>;           // 自定义工具图标
  getToolName?: (name, input) => string;      // 工具名称解析
  getToolSummary?: (name, input) => string;   // 摘要生成
  renderExpandedContent?: (container, toolName, result) => void;  // 展开内容渲染
}
```

## 核心逻辑

### 工具摘要生成

`defaultGetToolSummary` 为每种工具类型实现专门的摘要逻辑：

| 工具 | 摘要策略 |
|------|----------|
| `read` | `filename.md · 1-50` (文件名 + 行范围) |
| `write/edit` | 文件名（去除路径） |
| `multiedit` | `filename.md · 3 edits` |
| `apply_patch` | 从 patch 文本提取文件名列表 |
| `bash` | 截断命令文本（60 字符） |
| `list` | 目录名 |
| `glob` | `pattern · directory` |
| `grep` | `pattern · include` |
| `task` | `type · description` |
| `question` | 第一个问题的 header |
| `todowrite` | `done/total · preview` |

### 工具图标映射

两层图标查找：
1. `options.iconMap[name]` — 自定义映射
2. `TOOL_ICONS[name]` — 内置映射（read→file-text, bash→terminal 等）
3. MCP 工具（`mcp__*`）→ `layers` 图标
4. 默认 → `wrench` 图标

### 状态图标

| 状态 | 图标 |
|------|------|
| pending | `clock` |
| running | `loader` |
| completed | `check` |
| error | `x` |
| blocked | `shield-off` |

### 展开内容渲染

`defaultRenderExpandedContent` 显示工具结果文本（最多 20 行），超出部分显示 "... N more lines"。

## 关键方法

| 方法 | 说明 |
|------|------|
| `render(parentEl, toolCall)` | 创建工具调用卡片 DOM |
| `updateResult(toolEl, toolCall)` | 更新结果内容和状态图标 |
| `updateHeader(toolEl, toolCall)` | 更新名称和摘要（增量 input） |
| `updateStatus(toolEl, status)` | 仅更新状态图标 |

## 数据流

```
StreamController.handleToolUseChunk(chunk)
  → ToolCallRenderer.render(parentEl, toolCall)
    → .streaming-tool-call
      → .streaming-tool-header (icon + name + summary + status)
      → .streaming-tool-content (hidden, "Waiting for result...")

StreamController.handleToolResultChunk(chunk)
  → ToolCallRenderer.updateResult(toolEl, toolCall)
    → 清空 content → renderExpandedContent
    → updateStatus (completed/error)

用户点击 header → toggle 展开/折叠 content
```

## 与其他模块的交互

- **StreamController**: 持有 `ToolCallRenderer` 实例
- **OpenCodianView**: 通过 `StreamController` 间接使用

## 配置项

通过 `ToolRendererOptions` 构造参数自定义：
- `iconMap` — 覆盖默认图标
- `getToolName` — 自定义名称解析
- `getToolSummary` — 自定义摘要生成
- `renderExpandedContent` — 自定义结果渲染

## 注意事项

- 同一 tool call ID 的重复 `tool_use` chunk 会合并 input（`Object.assign`）
- 结果渲染截断为 20 行，大输出可能丢失信息
- Obsidian 内置的 `.copy-code-button` 不在此处处理（由 MarkdownRenderer 处理）
- 工具名称映射 `DEFAULT_TOOL_NAMES` 包含约 30 个常用工具的显示名

## 待补充
- [ ] 工具调用结果中的 diff 高亮
- [ ] 可配置的截断行数
- [ ] MCP 工具的自定义摘要策略注册机制
