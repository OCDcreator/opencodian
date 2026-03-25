# OpenCode SDK 使用指南

> 本文档提供 OpenCode SDK 的完整使用指南，包括安装、配置、核心 API 和最佳实践。
> 适用于 TypeScript/JavaScript 开发者，支持 Node.js 和浏览器环境。

---

## 目录

1. [概述](#概述)
2. [安装](#安装)
3. [客户端创建](#客户端创建)
4. [认证配置](#认证配置)
5. [核心 API](#核心-api)
   - [会话管理](#会话管理)
   - [发送消息](#发送消息)
   - [结构化输出](#结构化输出)
   - [实时事件](#实时事件)
   - [文件操作](#文件操作)
6. [错误处理](#错误处理)
7. [代码示例](#代码示例)
8. [最佳实践](#最佳实践)
9. [常见问题](#常见问题)

---

## 概述

OpenCode SDK (`@opencode-ai/sdk`) 是一个类型安全的 TypeScript/JavaScript 客户端，用于与 OpenCode 服务器交互。

### 支持的运行环境

| 环境 | 支持状态 |
|------|----------|
| Node.js 20+ | ✅ |
| 浏览器 (Chrome, Firefox, Safari, Edge) | ✅ |
| Deno | ✅ v1.28.0+ |
| Bun | ✅ 1.0+ |
| Cloudflare Workers | ✅ |
| Vercel Edge Runtime | ✅ |
| React Native | ❌ |

### 核心功能

- ✅ 类型安全的 API 调用
- ✅ 会话管理（创建、删除、历史记录）
- ✅ 实时事件流（SSE）
- ✅ 结构化 JSON 输出
- ✅ 文件搜索和读取
- ✅ 认证管理
- ✅ 支持自定义 fetch 实现

---

## 安装

```bash
npm install @opencode-ai/sdk
```

或使用 yarn/pnpm：

```bash
yarn add @opencode-ai/sdk
# 或
pnpm add @opencode-ai/sdk
```

---

## 客户端创建

### 模式 1：服务器 + 客户端（全栈）

同时启动 OpenCode 服务器和客户端实例。

```typescript
import { createOpencode } from "@opencode-ai/sdk"

const { client, server } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 5000,
  config: {
    model: "anthropic/claude-3-5-sonnet-20241022",
  },
})

console.log(`Server running at ${server.url}`)

// 使用完毕后关闭服务器
server.close()
```

**配置选项**：

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `hostname` | `string` | `127.0.0.1` | 服务器主机名 |
| `port` | `number` | `4096` | 服务器端口 |
| `signal` | `AbortSignal` | `undefined` | 中止信号 |
| `timeout` | `number` | `5000` | 服务器启动超时（毫秒） |
| `config` | `Config` | `{}` | 配置对象 |

---

### 模式 2：仅客户端（连接现有服务器）

适用于连接到已运行的 OpenCode 服务器。

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  throwOnError: false,  // 返回错误而非抛出异常
  responseStyle: "fields", // "data" 或 "fields"
})
```

**客户端选项**：

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `baseUrl` | `string` | `http://localhost:4096` | 服务器 URL |
| `fetch` | `function` | `globalThis.fetch` | 自定义 fetch 实现 |
| `parseAs` | `string` | `auto` | 响应解析方式 |
| `responseStyle` | `string` | `fields` | 返回风格：`data` 或 `fields` |
| `throwOnError` | `boolean` | `false` | 抛出错误而非返回错误 |

---

## 认证配置

### 1. 服务器密码认证

连接到需要密码保护的服务器：

```typescript
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  headers: {
    Authorization: `Basic ${btoa(`opencode:${password}`)}`,
  },
})
```

### 2. AI 提供商认证（API Key）

设置 Anthropic API Key：

```typescript
await client.auth.set({
  path: { id: "anthropic" },
  body: {
    type: "api",
    key: "your-api-key",
  },
})
```

### 3. OAuth 认证

```typescript
await client.auth.set({
  path: { id: "openai" },
  body: {
    type: "oauth",
    refresh: "refresh_token",
    access: "access_token",
    expires: Date.now() + 3600000,
  },
})
```

---

## 核心 API

### 会话管理

#### 创建会话

```typescript
const session = await client.session.create({
  body: { title: "My session" },
})
console.log(`Session created: ${session.id}`)
```

#### 列出所有会话

```typescript
const sessions = await client.session.list()
sessions.forEach(s => {
  console.log(`Session ${s.id}: ${s.time.created}`)
})
```

#### 获取会话详情

```typescript
const session = await client.session.get({
  path: { id: "session-id" },
})
```

#### 删除会话

```typescript
await client.session.delete({
  path: { id: "session-id" },
})
```

#### 中止正在运行的会话

```typescript
await client.session.abort({
  path: { id: "session-id" },
})
```

---

### 发送消息

#### 基础消息发送

```typescript
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    model: {
      providerID: "anthropic",
      modelID: "claude-3-5-sonnet-20241022",
    },
    parts: [
      { type: "text", text: "Analyze this code" },
      {
        type: "file",
        source: { type: "path", path: "./src/main.ts" }
      }
    ],
  },
})

// 访问 AI 响应
console.log(result.data.parts)
```

#### 上下文注入（无 AI 响应）

```typescript
// 注入上下文而不触发 AI 回复（适用于插件）
await client.session.prompt({
  path: { id: session.id },
  body: {
    noReply: true,
    parts: [
      { type: "text", text: "You are a helpful assistant." }
    ],
  },
})
```

---

### 结构化输出

让 AI 返回符合 JSON Schema 的验证数据：

```typescript
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    parts: [{ type: "text", text: "Research Anthropic company" }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          founded: { type: "number", description: "Year founded" },
          products: {
            type: "array",
            items: { type: "string" },
            description: "Main products",
          },
        },
        required: ["company", "founded"],
      },
    },
  },
})

// 访问结构化输出
console.log(result.data.info.structured_output)
// { company: "Anthropic", founded: 2021, products: ["Claude"] }
```

**Schema 配置字段**：

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `type` | `'json_schema'` | ✅ | 指定 JSON Schema 模式 |
| `schema` | `object` | ✅ | 定义输出结构的 JSON Schema 对象 |
| `retryCount` | `number` | ❌ | 验证重试次数（默认 2） |

---

### 实时事件

订阅服务器发送的事件流（SSE）：

```typescript
const events = await client.event.subscribe()

for await (const event of events.stream) {
  switch (event.type) {
    case 'message.updated':
      console.log('New message:', event.properties.info)
      break
    case 'session.updated':
      console.log('Session updated:', event.properties.info)
      break
    case 'file.edited':
      console.log('File changed:', event.properties.file)
      break
    case 'session.error':
      console.error('Session error:', event.properties.error)
      break
  }
}

// 取消订阅
events.controller.abort()
```

---

### 文件操作

#### 搜索文件中的文本

```typescript
const textResults = await client.find.text({
  query: { pattern: "function.*opencode" },
})
```

#### 按名称查找文件

```typescript
const files = await client.find.files({
  query: {
    query: "*.ts",
    type: "file",
    limit: 50,
  },
})
```

#### 查找目录

```typescript
const directories = await client.find.files({
  query: {
    query: "packages",
    type: "directory",
    limit: 20,
  },
})
```

#### 读取文件

```typescript
const content = await client.file.read({
  query: { path: "src/index.ts" },
})
```

#### 查找工作区符号

```typescript
const symbols = await client.find.symbols({
  query: "MyClass",
})
```

---

## 错误处理

### 基础错误捕获

```typescript
import Opencode from '@opencode-ai/sdk'

try {
  await client.session.get({ path: { id: "invalid-id" } })
} catch (error) {
  if (error instanceof Opencode.APIError) {
    console.error(`API Error (${error.status}): ${error.name}`)
  } else if (error instanceof Opencode.APIConnectionError) {
    console.error('Connection failed:', error.message)
  }
}
```

### 结构化输出错误处理

```typescript
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Generate structured data" }],
    format: { type: "json_schema", schema: mySchema },
  },
})

if (result.data.info.error?.name === "StructuredOutputError") {
  console.error('Failed to produce structured output:')
  console.error('Error:', result.data.info.error.message)
  console.error('Attempts:', result.data.info.error.retries)
}
```

### 特定错误类型

| 错误类型 | 描述 |
|----------|------|
| `APIError` | 通用 API 错误 |
| `AuthenticationError` | 认证失败 |
| `RateLimitError` | 速率限制 |
| `NotFoundError` | 资源未找到 |
| `APIConnectionError` | 连接失败 |

---

## 代码示例

### 示例 1：完整的聊天流程

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})

async function chat() {
  // 1. 创建会话
  const session = await client.session.create({
    body: { title: "Chat session" },
  })
  console.log(`Session created: ${session.id}`)

  // 2. 发送消息
  const result = await client.session.prompt({
    path: { id: session.id },
    body: {
      model: {
        providerID: "anthropic",
        modelID: "claude-3-5-sonnet-20241022",
      },
      parts: [
        { type: "text", text: "Hello, how are you?" }
      ],
    },
  })

  // 3. 显示响应
  console.log('Assistant response:', result.data.parts)

  // 4. 获取会话历史
  const messages = await client.session.messages({
    path: { id: session.id },
  })
  console.log('Message history:', messages)
}

chat()
```

### 示例 2：监听实时事件

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})

async function listenToEvents() {
  const events = await client.event.subscribe()

  for await (const event of events.stream) {
    console.log(`[${event.type}]`, event.properties)

    if (event.type === 'message.updated') {
      const message = event.properties.info
      console.log('New message content:', message)
    }
  }
}

listenToEvents()
```

### 示例 3：结构化数据分析

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})

async function analyzeCode() {
  const session = await client.session.create({ body: {} })

  const result = await client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [
        {
          type: "text",
          text: "Analyze the code in src/main.ts and return issues found"
        }
      ],
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  severity: { type: "string", enum: ["high", "medium", "low"] },
                  message: { type: "string" },
                  line: { type: "number" },
                },
              },
            },
          },
          required: ["issues"],
        },
      },
    },
  })

  const analysis = result.data.info.structured_output
  console.log('Analysis result:', analysis)

  // { issues: [{ severity: "high", message: "Memory leak", line: 42 }] }
}

analyzeCode()
```

---

## 最佳实践

### 1. 复用会话

```typescript
// ✅ 推荐：检查现有会话
let session: Session | null = null

async function getSession(): Promise<Session> {
  if (!session) {
    session = await client.session.create({ body: {} })
  }
  return session
}
```

### 2. 使用 try-catch 处理网络错误

```typescript
// ✅ 推荐：重试逻辑
async function sendMessageWithRetry(message: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: "text", text: message }] },
      })
    } catch (error) {
      if (i === retries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

### 3. 优化 JSON Schema

```typescript
// ✅ 推荐：简洁的 Schema，清晰的描述
const goodSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Full name of the person" },
    age: { type: "number", description: "Age in years" },
  },
  required: ["name", "age"],
}

// ❌ 不推荐：过于复杂的嵌套
const badSchema = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        person: {
          type: "object",
          properties: {
            info: {
              type: "object",
              properties: { /* ... */ }
            }
          }
        }
      }
    }
  }
}
```

### 4. 清理资源

```typescript
// ✅ 推荐：取消事件订阅
async function listenEvents() {
  const events = await client.event.subscribe()

  const controller = new AbortController()

  // 10 秒后取消订阅
  setTimeout(() => controller.abort(), 10000)

  try {
    for await (const event of events.stream) {
      console.log(event)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Event stream aborted')
    }
  }
}
```

### 5. CORS 配置

如果从浏览器连接，确保服务器启用了 CORS：

```bash
opencode web --cors https://your-frontend.com
```

或在 `opencode.json` 中配置：

```json
{
  "server": {
    "cors": ["https://your-frontend.com"]
  }
}
```

---

## 常见问题

### Q: 如何在浏览器中使用 SDK？

确保：
1. 使用 `createOpencodeClient()` 而不是 `createOpencode()`
2. OpenCode 服务器启用了 CORS
3. 服务器 URL 是可访问的（不是 `127.0.0.1`，而是局域网 IP 或公网地址）

### Q: 如何流式获取 AI 响应？

使用 `client.event.subscribe()` 监听 `message.updated` 事件。

### Q: 如何自定义 fetch 实现？

```typescript
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  fetch: async (url, options) => {
    // 添加自定义 headers、超时等
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        'X-Custom-Header': 'value',
      },
    })
    return response
  },
})
```

### Q: 如何调试 API 调用？

```typescript
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  fetch: (url, options) => {
    console.log('API Request:', url, options)
    return fetch(url, options).then(res => {
      console.log('API Response:', res.status, res.statusText)
      return res
    })
  },
})
```

---

## TypeScript 类型定义

导入类型以获得更好的类型安全：

```typescript
import type { Session, Message, Part } from "@opencode-ai/sdk"

async function processMessage(message: Message) {
  console.log(`Message from ${message.role}:`)
  for (const part of message.parts) {
    if (part.type === 'text') {
      console.log(part.text)
    }
  }
}
```

---

## 参考资源

- **官方文档**: https://opencode.ai/docs/sdk/
- **GitHub 仓库**: https://github.com/anomalyco/opencode
- **SDK 源码**: https://github.com/anomalyco/opencode/tree/dev/packages/sdk/js
- **类型定义**: https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts

---

## 更新日志

本文档基于 OpenCode SDK 最新版本编写。如有 API 变动，请参考官方文档。
