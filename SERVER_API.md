# OpenCode Server API 文档

## 📋 概述

OpenCode Server 是一个 HTTP 服务器，提供了完整的 OpenCode 功能的 RESTful API 接口。它支持：
- 以编程方式与 OpenCode 交互
- 多个客户端同时连接
- OpenAPI 3.1 规范，便于生成客户端 SDK
- 事件流（SSE）用于实时通信

**关键概念：**
- OpenCode 采用客户端-服务器架构
- TUI（终端用户界面）只是一个客户端
- 你可以通过 HTTP API 实现自定义客户端
- 所有核心功能都通过 RESTful API 暴露

---

## 🚀 快速开始

### 启动服务器

```bash
# 基本用法（默认端口 4096）
opencode serve

# 自定义端口和主机
opencode serve --port 8080 --hostname 0.0.0.0

# 启用 CORS 用于 Web 应用
opencode serve --cors http://localhost:5173 --cors https://app.example.com

# 启用 mDNS 发现
opencode serve --mdns

# 配置密码保护
OPENCODE_SERVER_PASSWORD=your-password opencode serve
```

### 查看完整 API 规范

启动服务器后，访问以下地址查看交互式 OpenAPI 文档：
```
http://localhost:4096/doc
```

---

## 🔐 认证

OpenCode Server 支持 HTTP 基本认证：

**环境变量：**
- `OPENCODE_SERVER_PASSWORD` - 必需：服务器密码
- `OPENCODE_SERVER_USERNAME` - 可选：用户名（默认为 `opencode`）

**示例：**
```bash
export OPENCODE_SERVER_PASSWORD=your-password
export OPENCODE_SERVER_USERNAME=my-app
opencode serve
```

**使用认证的请求：**
```http
Authorization: Basic b3BlbmNvZGU6eW91ci1wYXNzd29yZA==
```

---

## 📡 命令行参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--port` | number | 4096 | 监听端口 |
| `--hostname` | string | 127.0.0.1 | 监听的主机地址 |
| `--cors` | string[] | [] | 允许的跨域来源（可多次使用） |
| `--mdns` | boolean | false | 启用 mDNS 服务发现 |
| `--mdns-domain` | string | opencode.local | mDNS 服务域名 |

---

## 🏗️ 架构说明

### 工作原理

```
┌─────────────┐     HTTP API      ┌──────────────┐
│  TUI 客户端  │ ─────────────────> │              │
│   (CLI)      │                    │              │
└─────────────┘                    │              │
                                   │  OpenCode    │
┌─────────────┐     HTTP API      │   Server     │
│ 自定义客户端  │ ─────────────────> │              │
│  (你的代码)   │                    │              │
└─────────────┘                    └──────────────┘
        │                                   │
        └───────────────────┬───────────────┘
                            │
                    文件系统 / VCS / LSP
```

**关键点：**
1. TUI 只是客户端之一，通过 HTTP API 与服务器通信
2. 服务器暴露完整的 OpenAPI 3.1 规范
3. 支持多个客户端同时连接
4. 使用 `/tui` 端点可以驱动 TUI 界面（IDE 插件使用此方式）

### 连接到现有服务器

```bash
# 启动 TUI 并连接到指定服务器
opencode --hostname 127.0.0.1 --port 4096
```

---

## 📡 API 端点总览

### 按功能分类

| 类别 | 基础路径 | 说明 |
|------|----------|------|
| 全局 | `/global/*` | 健康检查、事件流 |
| 项目 | `/project/*` | 项目管理 |
| 文件系统 | `/path/*`, `/vcs/*` | 路径和版本控制 |
| 实例 | `/instance/*` | 服务器实例管理 |
| 配置 | `/config/*` | 服务器配置 |
| 提供商 | `/provider/*` | AI 提供商管理 |
| 会话 | `/session/*` | 会话管理 |
| 消息 | `/session/:id/message*` | 消息处理 |
| 文件 | `/file/*`, `/find/*` | 文件操作和搜索 |
| 工具 | `/experimental/tool/*` | 工具列表（实验性） |
| LSP/MCP | `/lsp/*`, `/mcp/*` | 语言服务器和 MCP |
| 代理 | `/agent/*` | 代理管理 |
| 日志 | `/log` | 日志写入 |
| TUI | `/tui/*` | TUI 控制 |
| 认证 | `/auth/*` | 认证凭据 |
| 事件 | `/event` | SSE 事件流 |
| 文档 | `/doc` | OpenAPI 规范 |

---

## 🔌 核心端点详解

### 1. 全局端点

#### GET `/global/health`
获取服务器健康状态和版本信息。

**响应：**
```json
{
  "healthy": true,
  "version": "1.0.0"
}
```

#### GET `/global/event`
获取全局事件流（SSE）。

**响应：** Server-Sent Events 流
- 第一个事件：`server.connected`
- 后续事件：总线事件

---

### 2. 项目管理

#### GET `/project`
列出所有项目。

**响应：**
```json
[
  {
    "id": "project-id",
    "name": "My Project",
    "path": "/path/to/project",
    "root": "/path/to/project"
  }
]
```

#### GET `/project/current`
获取当前活动项目。

**响应：** `Project` 对象

---

### 3. 文件系统操作

#### GET `/file?path=<path>`
列出指定路径的文件和目录。

**查询参数：**
- `path` (必需) - 文件系统路径

**响应：**
```json
[
  {
    "name": "src",
    "type": "directory",
    "path": "/project/src"
  },
  {
    "name": "README.md",
    "type": "file",
    "path": "/project/README.md"
  }
]
```

#### GET `/file/content?path=<path>`
读取文件内容。

**响应：**
```json
{
  "path": "/project/README.md",
  "content": "文件内容..."
}
```

#### GET `/find?pattern=<pattern>`
在文件中搜索文本。

**查询参数：**
- `pattern` (必需) - 搜索模式（正则表达式或简单文本）

**响应：**
```json
[
  {
    "path": "/project/src/file.ts",
    "line_number": 42,
    "lines": ["const foo = 'bar';"],
    "absolute_offset": 1024,
    "submatches": [
      {
        "match": "foo",
        "start": 6,
        "end": 9
      }
    ]
  }
]
```

#### GET `/find/file?query=<query>`
按名称查找文件和目录（模糊匹配）。

**查询参数：**
- `query` (必需) - 搜索字符串
- `type` (可选) - 限制为 `"file"` 或 `"directory"`
- `directory` (可选) - 覆盖搜索根目录
- `limit` (可选) - 最大结果数（1-200）
- `dirs` (可选) - 旧版标志（`"false"` 仅返回文件）

**响应：** `string[]`（匹配的文件路径列表）

#### GET `/find/symbol?query=<query>`
在工作区中搜索符号（函数、类、变量等）。

**响应：**
```json
[
  {
    "name": "MyFunction",
    "kind": "function",
    "path": "/project/src/index.ts",
    "line": 10,
    "character": 0
  }
]
```

#### GET `/file/status`
获取已跟踪文件的状态。

**响应：**
```json
[
  {
    "path": "/project/src/file.ts",
    "status": "modified"
  }
]
```

---

### 4. 会话管理

#### GET `/session`
列出所有会话。

**响应：**
```json
[
  {
    "id": "session-123",
    "title": "添加认证功能",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T11:00:00Z"
  }
]
```

#### POST `/session`
创建新会话。

**请求体：**
```json
{
  "parentID": "parent-session-id",  // 可选
  "title": "新会话标题"             // 可选
}
```

**响应：** `Session` 对象

#### GET `/session/:id`
获取会话详情。

**响应：** 完整的 `Session` 对象

#### DELETE `/session/:id`
删除会话及其所有数据。

**响应：** `boolean`

#### PATCH `/session/:id`
更新会话属性。

**请求体：**
```json
{
  "title": "新标题"
}
```

**响应：** 更新后的 `Session` 对象

#### GET `/session/:id/status`
获取所有会话的状态。

**响应：**
```json
{
  "session-123": {
    "status": "active",
    "agent": "claude",
    "model": "gpt-4"
  }
}
```

#### GET `/session/:id/children`
获取会话的子会话（分叉的会话）。

**响应：** `Session[]`

#### GET `/session/:id/todo`
获取会话的待办事项列表。

**响应：**
```json
[
  {
    "id": "todo-1",
    "content": "实现用户认证",
    "status": "pending",
    "priority": "high"
  }
]
```

#### POST `/session/:id/init`
分析应用并创建 `AGENTS.md` 文件。

**请求体：**
```json
{
  "messageID": "msg-123",
  "providerID": "openai",
  "modelID": "gpt-4"
}
```

**响应：** `boolean`

#### POST `/session/:id/fork`
在某条消息处分叉会话。

**请求体：**
```json
{
  "messageID": "msg-123"  // 可选，默认为最后一条消息
}
```

**响应：** 新的 `Session` 对象

#### POST `/session/:id/abort`
中止正在运行的会话。

**响应：** `boolean`

#### POST `/session/:id/share`
分享会话。

**响应：** 带有分享链接的 `Session` 对象

#### DELETE `/session/:id/share`
取消分享会话。

**响应：** `Session` 对象

#### GET `/session/:id/diff`
获取会话中的文件差异。

**查询参数：**
- `messageID` (可选) - 指定消息 ID

**响应：**
```json
[
  {
    "path": "/project/src/file.ts",
    "type": "modified",
    "oldContent": "...",
    "newContent": "..."
  }
]
```

#### POST `/session/:id/summarize`
总结会话内容。

**请求体：**
```json
{
  "providerID": "openai",
  "modelID": "gpt-4"
}
```

**响应：** `boolean`

#### POST `/session/:id/revert`
回退消息。

**请求体：**
```json
{
  "messageID": "msg-123",
  "partID": "part-456"  // 可选
}
```

**响应：** `boolean`

#### POST `/session/:id/unrevert`
恢复所有已回退的消息。

**响应：** `boolean`

#### POST `/session/:id/permissions/:permissionID`
响应权限请求。

**请求体：**
```json
{
  "response": "allow",
  "remember": true  // 可选
}
```

**响应：** `boolean`

---

### 5. 消息处理

#### POST `/session/:id/message`
发送消息并等待响应。

**请求体：**
```json
{
  "messageID": "msg-123",          // 可选
  "model": "gpt-4",              // 可选，覆盖默认模型
  "agent": "claude",              // 可选，指定代理
  "noReply": false,               // 可选，不等待回复
  "system": "系统提示词...",       // 可选
  "tools": ["bash", "read"],      // 可选，允许的工具列表
  "parts": [                     // 必需
    {
      "type": "text",
      "text": "请帮我实现一个登录功能"
    }
  ]
}
```

**响应：**
```json
{
  "info": {
    "id": "msg-456",
    "role": "assistant",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "parts": [
    {
      "type": "text",
      "text": "我来帮你实现..."
    }
  ]
}
```

#### GET `/session/:id/message`
列出会话中的消息。

**查询参数：**
- `limit` (可选) - 最大返回数量

**响应：** `{ info: Message, parts: Part[] }[]`

#### GET `/session/:id/message/:messageID`
获取特定消息详情。

**响应：** `{ info: Message, parts: Part[] }`

#### POST `/session/:id/prompt_async`
异步发送消息（不等待响应）。

**请求体：** 同 `/session/:id/message`

**响应：** `204 No Content`

#### POST `/session/:id/command`
执行斜杠命令。

**请求体：**
```json
{
  "messageID": "msg-123",         // 可选
  "agent": "claude",              // 可选
  "model": "gpt-4",              // 可选
  "command": "/test",
  "arguments": {
    "target": "auth"
  }
}
```

**响应：** `{ info: Message, parts: Part[] }`

#### POST `/session/:id/shell`
运行 shell 命令。

**请求体：**
```json
{
  "agent": "claude",              // 必需
  "model": "gpt-4",              // 可选
  "command": "npm install"       // 必需
}
```

**响应：** `{ info: Message, parts: Part[] }`

---

### 6. 配置管理

#### GET `/config`
获取服务器配置信息。

**响应：**
```json
{
  "theme": "dark",
  "fontSize": 14,
  "language": "zh-CN"
}
```

#### PATCH `/config`
更新配置。

**请求体：**
```json
{
  "theme": "light",
  "fontSize": 16
}
```

**响应：** 更新后的 `Config` 对象

#### GET `/config/providers`
列出可用的提供商和默认模型。

**响应：**
```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "default": {
    "provider": "openai",
    "model": "gpt-4"
  }
}
```

---

### 7. 提供商管理

#### GET `/provider`
列出所有提供商。

**响应：**
```json
{
  "all": [
    {
      "id": "openai",
      "name": "OpenAI",
      "baseURL": "https://api.openai.com"
    }
  ],
  "default": {
    "openai": "gpt-4"
  },
  "connected": ["openai", "anthropic"]
}
```

#### GET `/provider/auth`
获取提供商的认证方式。

**响应：**
```json
{
  "openai": [
    {
      "type": "api-key",
      "name": "API Key"
    }
  ],
  "google": [
    {
      "type": "oauth",
      "name": "OAuth"
    }
  ]
}
```

#### POST `/provider/{id}/oauth/authorize`
使用 OAuth 授权提供商。

**响应：**
```json
{
  "authorizationURL": "https://accounts.google.com/...",
  "state": "random-state"
}
```

#### POST `/provider/{id}/oauth/callback`
处理 OAuth 回调。

**请求体：** 提供商特定的回调参数

**响应：** `boolean`

---

### 8. 命令管理

#### GET `/command`
列出所有可用的斜杠命令。

**响应：**
```json
[
  {
    "name": "/test",
    "description": "运行测试",
    "arguments": {
      "target": "测试目标"
    }
  }
]
```

---

### 9. 代理管理

#### GET `/agent`
列出所有可用的代理。

**响应：**
```json
[
  {
    "id": "claude",
    "name": "Claude",
    "description": "Anthropic 的 AI 助手",
    "provider": "anthropic"
  },
  {
    "id": "gpt4",
    "name": "GPT-4",
    "description": "OpenAI 的 GPT-4 模型",
    "provider": "openai"
  }
]
```

---

### 10. LSP 和格式化器

#### GET `/lsp`
获取 LSP 服务器状态。

**响应：**
```json
[
  {
    "language": "typescript",
    "server": "tsserver",
    "status": "running",
    "capabilities": ["completion", "diagnostics"]
  }
]
```

#### GET `/formatter`
获取格式化器状态。

**响应：**
```json
[
  {
    "language": "javascript",
    "formatter": "prettier",
    "status": "ready"
  }
]
```

#### GET `/mcp`
获取 MCP 服务器状态。

**响应：**
```json
{
  "filesystem": {
    "status": "connected",
    "tools": ["read", "write", "glob"]
  }
}
```

#### POST `/mcp`
动态添加 MCP 服务器。

**请求体：**
```json
{
  "name": "my-mcp-server",
  "config": {
    "command": "node",
    "args": ["server.js"]
  }
}
```

**响应：** MCP 状态对象

---

### 11. 工具管理（实验性）

#### GET `/experimental/tool/ids`
列出所有可用的工具 ID。

**响应：**
```json
{
  "tools": ["bash", "read", "write", "grep", "lsp_diagnostics"]
}
```

#### GET `/experimental/tool?provider=<provider>&model=<model>`
列出指定提供商和模型的工具及其 JSON Schema。

**查询参数：**
- `provider` (必需) - 提供商 ID
- `model` (必需) - 模型 ID

**响应：**
```json
{
  "tools": [
    {
      "name": "bash",
      "description": "执行 shell 命令",
      "parameters": {
        "type": "object",
        "properties": {
          "command": {
            "type": "string",
            "description": "要执行的命令"
          }
        }
      }
    }
  ]
}
```

---

### 12. 日志

#### POST `/log`
写入日志条目。

**请求体：**
```json
{
  "service": "my-app",
  "level": "info",
  "message": "操作成功",
  "extra": {
    "userId": "123"
  }
}
```

**响应：** `boolean`

---

### 13. TUI 控制

#### POST `/tui/append-prompt`
向提示词输入框追加文本。

**请求体：**
```json
{
  "text": "请继续..."
}
```

**响应：** `boolean`

#### POST `/tui/submit-prompt`
提交当前提示词。

**响应：** `boolean`

#### POST `/tui/clear-prompt`
清除提示词输入框。

**响应：** `boolean`

#### POST `/tui/open-help`
打开帮助对话框。

**响应：** `boolean`

#### POST `/tui/open-sessions`
打开会话选择器。

**响应：** `boolean`

#### POST `/tui/open-themes`
打开主题选择器。

**响应：** `boolean`

#### POST `/tui/open-models`
打开模型选择器。

**响应：** `boolean`

#### POST `/tui/execute-command`
执行命令。

**请求体：**
```json
{
  "command": "/test"
}
```

**响应：** `boolean`

#### POST `/tui/show-toast`
显示提示消息。

**请求体：**
```json
{
  "title": "成功",
  "message": "操作完成",
  "variant": "success"  // "success" | "error" | "info"
}
```

**响应：** `boolean`

#### GET `/tui/control/next`
等待下一个控制请求（阻塞）。

**响应：**
```json
{
  "type": "input",
  "prompt": "请选择一个选项：",
  "options": ["A", "B", "C"]
}
```

#### POST `/tui/control/response`
响应控制请求。

**请求体：**
```json
{
  "body": "A"
}
```

**响应：** `boolean`

---

### 14. 认证

#### PUT `/auth/:id`
设置认证凭据。

**请求体：** 提供商特定的认证数据结构

**响应：** `boolean`

---

### 15. 事件流

#### GET `/event`
服务器发送事件（SSE）流。

**响应：** Server-Sent Events 流

**事件类型：**
- `server.connected` - 服务器已连接
- `message.created` - 消息已创建
- `message.updated` - 消息已更新
- `session.status` - 会话状态变更
- `tool.result` - 工具执行结果

**示例：**
```
event: server.connected
data: {"version": "1.0.0"}

event: message.created
data: {"sessionID": "...", "messageID": "..."}
```

---

### 16. 文档

#### GET `/doc`
获取 OpenAPI 3.1 规范文档。

**响应：** 包含 OpenAPI 规范的 HTML 页面

---

## 💡 使用示例

### 示例 1：创建会话并发送消息

```javascript
const response = await fetch('http://localhost:4096/session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: '实现用户认证'
  })
});

const session = await response.json();

// 发送消息
const messageResponse = await fetch(`http://localhost:4096/session/${session.id}/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    parts: [
      {
        type: 'text',
        text: '请帮我实现一个 JWT 认证系统'
      }
    ]
  })
});

const message = await messageResponse.json();
console.log(message.parts[0].text);
```

### 示例 2：搜索文件

```javascript
// 按名称搜索
const filesResponse = await fetch('http://localhost:4096/find/file?query=auth&limit=10');
const files = await filesResponse.json();

// 在文件中搜索文本
const searchResponse = await fetch('http://localhost:4096/find?pattern=JWT');
const matches = await searchResponse.json();

// 搜索符号
const symbolsResponse = await fetch('http://localhost:4096/find/symbol?query=authenticate');
const symbols = await symbolsResponse.json();
```

### 示例 3：读取和写入文件

```javascript
// 读取文件
const readResponse = await fetch('http://localhost:4096/file/content?path=/project/src/config.ts');
const content = await readResponse.json();
console.log(content.content);

// 使用工具写入（通过消息）
const writeResponse = await fetch(`http://localhost:4096/session/${sessionId}/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    parts: [
      {
        type: 'text',
        text: '请将以下内容写入文件：\nexport const API_URL = "https://api.example.com";'
      }
    ],
    tools: ['write']
  })
});
```

### 示例 4：监听事件流

```javascript
const eventSource = new EventSource('http://localhost:4096/event');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到事件:', data);
};

eventSource.addEventListener('message.created', (event) => {
  const { sessionID, messageID } = JSON.parse(event.data);
  console.log(`会话 ${sessionID} 收到新消息 ${messageID}`);
});
```

### 示例 5：运行 Shell 命令

```javascript
const response = await fetch(`http://localhost:4096/session/${sessionId}/shell`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agent: 'claude',
    command: 'npm test'
  })
});

const result = await response.json();
const output = result.parts.find(p => p.type === 'text');
console.log(output.text);
```

### 示例 6：管理待办事项

```javascript
// 获取待办事项
const todoResponse = await fetch(`http://localhost:4096/session/${sessionId}/todo`);
const todos = await todoResponse.json();

// 通过消息更新待办事项
const updateResponse = await fetch(`http://localhost:4096/session/${sessionId}/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    parts: [
      {
        type: 'text',
        text: '请更新待办事项：将第一个任务标记为完成'
      }
    ],
    tools: ['todowrite']
  })
});
```

---

## 🔧 类型定义参考

### MessagePart
```typescript
type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string }
  | { type: 'tool_use'; tool_use: ToolUse }
  | { type: 'tool_result'; tool_result: ToolResult }
  | { type: 'thinking'; thinking: string }
  | { type: 'redacted'; content: string }
```

### Session
```typescript
interface Session {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  parentID?: string;
}
```

### Todo
```typescript
interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}
```

### Project
```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  root: string;
}
```

---

## ⚠️ 注意事项

1. **认证：** 生产环境始终使用密码保护
2. **CORS：** 如需从浏览器访问，配置 `--cors`
3. **异步操作：** 使用 `prompt_async` 进行非阻塞调用
4. **事件流：** 使用 SSE 实现实时更新
5. **工具使用：** 通过消息的 `tools` 参数限制可用工具
6. **会话管理：** 使用分叉（fork）而不是复制会话
7. **文件路径：** 所有路径都应相对于项目根目录或使用绝对路径

---

## 🔗 相关资源

- OpenAPI 规范: `http://localhost:4096/doc`
- 主文档: https://opencode.ai/docs
- GitHub: https://github.com/opencode-ai/opencode
