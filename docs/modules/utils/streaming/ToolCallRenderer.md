# Tool Call Renderer

> **源码**: `src/utils/streaming/ToolCallRenderer.ts`
> **状态**: [REVIEW]

## 概述

渲染 AI 工具调用卡片。显示工具名称、摘要信息、状态图标、MCP 服务器名 chip（当 `kind: 'mcp'` 且 `toolMetadata.server` 存在时）和可展开的执行结果。`ToolCallRenderer` 现在把 MCP 摘要分类/字段回退委托给 `mcpSummaryConfig.getMcpToolSummary()`，MCP 服务器 chip 和展开 `Server:` 行委托给 `McpToolCallRenderer`，task/subagent 展开卡片委托给 `TaskToolCallRenderer`；自身只保留 DOM 渲染与 builtin/custom 工具摘要装配；工具名称/图标识别继续统一委托给 `shared/toolIdentity`，兼容 OpenCode 与 Claudian 的不同命名体系。对 OpenCode 原生 `task`，它会切换到专用 subagent 卡片：显示 agent / description / status / child session，并避免默认展开原始 `<task_result>`。

## 导入关系
上游: `obsidian` (setIcon), `../../shared` (tool identity), `./mcpSummaryConfig` (MCP summary resolver), `./McpToolCallRenderer` (MCP server chip/detail), `./TaskToolCallRenderer` (task/subagent expanded card), `./types` (ToolCallInfo, ToolCallStatus, ToolRendererOptions)
下游: `StreamController` (持有并调用)

## 核心类型 / 接口

### ToolRendererOptions
```typescript
{
  iconMap?: Record<string, string>;           // 自定义工具图标
  getToolName?: (name, input) => string;      // 工具名称解析
  getToolSummary?: (name, input, toolKind?) => string;   // 摘要生成
  renderExpandedContent?: (container, toolName, result) => void;  // 展开内容渲染
  onCollapsibleToggle?: () => void;           // 展开/收起后通知上层
  onOpenToolSession?: (sessionId, toolCall) => void;  // 打开 task/subagent child session
  onOpenMcpServerDetail?: (serverName: string) => void;  // 打开 MCP server 详情面（Codex chat→modal 入口）
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
| `task_create` | subject 文本（截断 80 字符） |
| `task_update` | `status: subject` 或 `status: taskId` |
| `task_list` | 'List all tasks' |
| `task_get` | taskId 文本（截断 80 字符） |
| `task_output` | task_id 文本（截断 80 字符） |
| `task_stop` | task_id 文本（截断 80 字符） |
| `skill` | 技能名称文本（截断 80 字符） |
| `lsp` | `operation · file:line:char` |
| `plan_enter` / `enter_plan_mode` | 'Switch to plan mode' |
| `plan_exit` / `exit_plan_mode` | 'Switch to build mode' |
| `todoread` | 任务进度摘要或 'Current tasks' |
| `web_search` / `websearch` / `codesearch` | 查询文本（截断 60 字符） |
| `web_fetch` / `webfetch` | URL 文本（截断 60 字符） |

对结构化 `kind: 'mcp'` 的工具，`ToolCallRenderer` 直接调用 `src/utils/streaming/mcpSummaryConfig.ts` 中的 `getMcpToolSummary()`；该 helper 继续按“工具名语义优先”执行字段回退，完整对照表见 [mcp-summary-fields.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/streaming/mcp-summary-fields.md)。

 additionally，当 MCP 工具调用的 `toolMetadata.server` 存在时，header 会渲染 `.streaming-tool-server-chip`。若提供了 `onOpenMcpServerDetail` 回调，chip 渲染为可点击 `<button>`（点击 `stopPropagation` 避免触发 header 展开/折叠），展开详情区也会显示 "View server details" 链接；若未提供回调，chip 保持为被动 `<span>`。该信息仅来自流中已有的 `toolMetadata`；相关逻辑在 `McpToolCallRenderer.ts` 中实现。

1. 先把工具名按 `__` / `_` / `-` / `:` 拆词，并优先取最后一个命中的动作词
2. 若命中动作词，则按该类别的字段优先级取摘要
3. 若类别字段没有可用值，再回退到通用 MCP 字段顺序
4. 最后才回退到首个顶层非空 `string/number/boolean`

| MCP 类别 | 动作词 | 字段优先级 |
|---|---|---|
| 搜索 / 查询 | `search`, `find`, `query`, `lookup`, `match` | `query` → `q` → `keywords` → `term` → `search` → `searchTerm` → `prompt` → `text` |
| 抓取 / 打开 / 下载 | `fetch`, `get`, `open`, `request`, `download`, `crawl`, `scrape`, `visit` | `url` → `uri` → `link` → `href` → `resource` → `resourceUrl` → `endpoint` → `path` |
| 读取 / 查看 / 加载 | `read`, `cat`, `show`, `view`, `load` | `path` → `file_path` → `filePath` → `filename` → `file` → `source` → `url` → `uri` |
| 列举 / 枚举 | `list`, `ls`, `glob`, `enumerate`, `browse` | `path` → `dir` → `directory` → `folder` → `cwd` → `root` → `pattern` → `glob` |
| 执行 / 命令 | `run`, `exec`, `execute`, `command`, `shell`, `bash`, `spawn` | `command` → `cmd` → `script` → `argv` → `arguments` → `args` → `prompt` |
| 写入 / 创建 / 生成 | `write`, `create`, `save`, `export`, `generate`, `emit` | `path` → `file_path` → `filePath` → `target` → `output` → `destination` → `dest` → `name` → `title` |
| 编辑 / 更新 / Patch | `edit`, `update`, `patch`, `modify`, `replace`, `rename` | `path` → `file_path` → `filePath` → `target` → `resource` → `instruction` → `prompt` → `name` |
| 删除 / 移除 | `delete`, `remove`, `unlink`, `clear`, `purge` | `path` → `file_path` → `filePath` → `target` → `resource` → `id` → `name` |
| 导航 / 选择 / 定位 | `navigate`, `goto`, `select`, `click`, `focus`, `locate` | `url` → `path` → `selector` → `element` → `target` → `id` → `name` |
| 鉴权 / 连接 / 会话 | `auth`, `login`, `authorize`, `connect`, `callback`, `session` | `url` → `provider` → `server` → `name` → `id` → `clientId` |
| 信息 / 状态 / 元数据 | `info`, `status`, `describe`, `metadata`, `inspect` | `name` → `id` → `resource` → `target` → `path` → `url` |

通用 MCP 回退字段顺序：

`query` → `url` → `path` → `file_path` → `filePath` → `command` → `prompt` → `title` → `name` → `id` → `target` → `resource` → `selector` → `arguments` → `args`

字段展示规则：

- 路径类字段只显示末级文件/目录名
- URL / 普通文本统一截断到 60 字符
- `arguments` / `args` / `argv` 仅接受字符串值
- 只有最终顶层标量回退才会使用 `number/boolean`

### 工具图标映射

三层图标查找：
1. `options.iconMap[name]` — 自定义映射
2. `toolCall.kind` — 若上游已提供结构化 kind，则 `mcp` 直接走内置注册的 `opencodian-tool-mcp`（LobeHub MCP 图标，已按 Obsidian 100×100 视口适配），`custom` 走 `layers`
3. `shared/toolIdentity` — 统一识别 builtin / MCP / OpenCode 外部工具
4. 最后才回退到本地补充映射或 `wrench`

当前默认工具图标表：

| 工具 | 图标 |
|------|------|
| `read` | `file-text` |
| `write` | `file-plus` |
| `edit` / `multiedit` / `apply_patch` / `patch` | `file-pen` |
| `bash` | `terminal` |
| `grep` | `search` |
| `glob` | `folder-search` |
| `list` / `ls` / `get_repo_structure` | `folder-tree` |
| `lsp` | `search` |
| `web_search` / `websearch` | `search` |
| `web_fetch` / `webfetch` | `download` |
| `codesearch` | `code` |
| `task` | `git-branch` |
| `question` / `askuserquestion` | `message-square` |
| `skill` | `brain` |
| `enter_plan_mode` / `plan_enter` | `list` |
| `exit_plan_mode` / `plan_exit` | `check` |
| `todowrite` / `todoread` | `list-checks` |
| `task_create` / `task_update` / `task_list` / `task_get` | `list-checks` |
| `task_output` / `task_stop` | `wrench` |
| `mcp__*` / 结构化 `kind: 'mcp'` | `opencodian-tool-mcp` |
| `kind: 'custom'` | `layers` |
| 其他未知工具 | `wrench` |

### 状态图标

| 状态 | 图标 |
|------|------|
| pending | `clock` |
| running | `loader` |
| completed | `check` |
| error | `x` |
| blocked | `shield-off` |

### 展开内容渲染

`defaultRenderExpandedContent` 显示工具结果文本（最多 20 行），超出部分显示 "... N more lines"。但对 `task`：

- 展开区优先显示 subagent agent / description / status / session
- 如果存在 `toolMetadata.sessionId`，显示 “Open subagent session” 动作
- 不默认把 `<task_result>` 原文当普通工具输出展开；上游会把 `resultVisibility: 'hidden'` 作为数据契约，renderer 仍按 task identity 做兜底防护，保持与 OpenCode 本体一致的“结果留在 child session”语义

## 关键方法

| 方法 | 说明 |
|------|------|
| `render(parentEl, toolCall)` | 创建工具调用卡片 DOM |
| `updateResult(toolEl, toolCall)` | 更新结果内容和状态图标 |
| `updateHeader(toolEl, toolCall)` | 更新名称、摘要和 MCP server chip（增量 input） |
| `updateStatus(toolEl, status)` | 仅更新状态图标 |

## 数据流

```
StreamController.handleToolUseChunk(chunk)
  → ToolCallRenderer.render(parentEl, toolCall)
    → .streaming-tool-call
      → .streaming-tool-header (icon + name + summary + status + MCP server chip)
      → .streaming-tool-content (hidden, "Waiting for result...")

StreamController.handleToolResultChunk(chunk)
  → ToolCallRenderer.updateResult(toolEl, toolCall)
    → 清空 content → renderExpandedContent / renderTaskExpandedContent / renderMcpExpandedContent
    → updateStatus (completed/error)

用户点击 header → toggle 展开/折叠 content → `onCollapsibleToggle?()`
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
- `onCollapsibleToggle` — tool 详情切换后通知宿主安排滚动补偿
- `onOpenToolSession` — task/subagent 卡片请求打开 child session 时的宿主回调
- `onOpenMcpServerDetail` — MCP server chip/链接被点击时通知宿主打开 server 详情面（Codex chat→modal 入口）；未提供时 chip 为被动 span

## 注意事项

- 同一 tool call ID 的重复 `tool_use` chunk 会合并 input（`Object.assign`）
- 结果渲染截断为 20 行，大输出可能丢失信息
- Obsidian 内置的 `.copy-code-button` 不在此处处理（由 MarkdownRenderer 处理）
- OpenCode 风格的 `server_tool` 若未携带结构化 kind，也会通过统一 identity 层做保守识别，不再直接掉回扳手
