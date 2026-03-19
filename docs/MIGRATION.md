# Claudian → OpenCodian 迁移指南

本文档详细说明从 Claudian 代码库迁移到 OpenCodian 的具体步骤和代码映射。

## 文件映射关系

| Claudian 文件 | OpenCodian 文件 | 变更说明 |
|--------------|----------------|----------|
| `src/main.ts` | `src/main.ts` | 替换服务引用 |
| `src/core/agent/ClaudianService.ts` | `src/core/opencode/OpenCodeService.ts` | 完全重写，适配 OpenCode SDK |
| `src/core/agent/SessionManager.ts` | `src/core/opencode/SessionManager.ts` | 简化，OpenCode 管理会话 |
| `src/core/agent/MessageChannel.ts` | *删除* | OpenCode 不需要消息队列 |
| `src/core/agent/QueryOptionsBuilder.ts` | *删除* | OpenCode 配置方式不同 |
| `src/features/chat/ClaudianView.ts` | `src/features/chat/OpenCodianView.ts` | 重命名，小幅调整 |
| `src/features/settings/ClaudianSettings.ts` | `src/features/settings/OpenCodianSettings.ts` | 更新设置项 |

## 核心代码映射

### 1. SDK 初始化

**Claudian:**
```typescript
import { Client } from '@anthropic-ai/claude-agent-sdk';
const client = new Client();
```

**OpenCodian:**
```typescript
import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk';

// 方式1: 启动服务器并创建客户端
const { client, server } = await createOpencode({
  port: 4096,
  config: { model: "anthropic/claude-3-5-sonnet-20241022" }
});

// 方式2: 连接到已运行的服务器
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" });
```

### 2. 发送消息

**Claudian:**
```typescript
const stream = client.sendMessage({ message, conversation, tools });
for await (const event of stream) {
  // 处理事件
}
```

**OpenCodian:**
```typescript
// 发送消息
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: message }],
    model: { providerID: "anthropic", modelID: model }
  }
});

// 订阅事件流获取实时响应
const events = await client.event.subscribe();
for await (const event of events.stream) {
  if (event.type === 'message_stream') {
    // 处理流式事件
  }
}
```

### 3. 会话管理

**Claudian:**
```typescript
// SDK 内部管理会话
conversation.sessionId = capturedSessionId;
```

**OpenCodian:**
```typescript
// 显式创建会话
const session = await client.session.create({
  body: { title: "New Session" }
});
const sessionId = session.id;

// 获取会话列表
const sessions = await client.session.list();

// 获取消息历史
const messages = await client.session.messages({ path: { id: sessionId } });

// 删除会话
await client.session.delete({ path: { id: sessionId } });
```

### 4. 工具调用处理

**Claudian:**
```typescript
// SDK 自动处理工具调用，通过回调函数拦截
canUseTool: async (toolName, input) => {
  // 返回审批结果
  return { decision: 'allow' };
}
```

**OpenCodian:**
```typescript
// 从消息流中提取工具调用
const result = await client.session.prompt({ ... });

// 响应中包含工具调用
for (const part of result.parts) {
  if (part.type === 'tool_use') {
    // 处理工具调用
    console.log(`Tool: ${part.name}`, part.input);
  }
  if (part.type === 'tool_result') {
    // 处理工具结果
    console.log(`Result:`, part.content);
  }
}
```

## 类型定义变更

### ChatMessage

**Claudian:**
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  contentBlocks?: ContentBlock[];
  images?: ImageAttachment[];
}
```

**OpenCodian:**
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  // OpenCode 特有字段
  parts?: Part[];  // 原始 OpenCode 消息部分
}
```

### Conversation

**Claudian:**
```typescript
interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  sessionId: string | null;
  sdkSessionId?: string;
  messages: ChatMessage[];
  isNative: boolean;
  // ...
}
```

**OpenCodian:**
```typescript
interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  openCodeSessionId: string;  // OpenCode 会话 ID
  messages: ChatMessage[];
  // 不需要 isNative，OpenCode 总是原生支持
}
```

## 设置项变更

### 删除的设置

| 设置项 | 原因 |
|--------|------|
| `claudeCliPath` | OpenCode 使用服务器模式，不需要 CLI 路径 |
| `thinkingBudget` | OpenCode 不支持思考预算配置 |
| `effortLevel` | OpenCode 不支持努力级别配置 |
| `enableChrome` | OpenCode 没有 Chrome 扩展支持 |
| `enableOpus1M` / `enableSonnet1M` | OpenCode 通过配置支持任意模型 |

### 新增的设置

| 设置项 | 说明 |
|--------|------|
| `serverPort` | OpenCode 服务器端口（默认 4096） |
| `serverHost` | OpenCode 服务器主机（默认 127.0.0.1） |
| `autoStartServer` | 插件加载时自动启动服务器 |
| `defaultProvider` | 默认模型提供商 |
| `defaultModel` | 默认模型 ID |

## 依赖变更

**Claudian:**
```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.76",
    "@modelcontextprotocol/sdk": "~1.25.3"
  }
}
```

**OpenCodian:**
```json
{
  "dependencies": {
    "@opencode-ai/sdk": "^0.x.x"
  }
}
```
