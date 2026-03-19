# OpenCodian 架构设计文档

## 项目概述

**OpenCodian** 是一个 Obsidian 插件，将 OpenCode AI 编程助手嵌入到 Obsidian 侧边栏中。它仿照 Claudian 的设计，但使用开源的 OpenCode 作为后端，支持多种 AI 模型（包括本地模型）。

## 与 Claudian 的核心差异

| 维度 | Claudian | OpenCodian |
|------|----------|------------|
| **SDK** | `@anthropic-ai/claude-agent-sdk` | `@opencode-ai/sdk` |
| **架构** | 直接嵌入 SDK | 客户端/服务器架构 |
| **模型支持** | 仅限 Claude | Claude、GPT、本地模型等 |
| **服务模式** | 持久化 Query | REST API + SSE |
| **会话管理** | SDK 内部管理 | OpenCode 服务端管理 |
| **工具调用** | SDK 内置工具 | OpenCode 插件系统 |

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Obsidian                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   OpenCodian Plugin                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │  OpenCodian │  │  OpenCodian │  │  OpenCodian     │  │   │
│  │  │    View     │  │   Service   │  │  SettingTab     │  │   │
│  │  │  (UI Layer) │  │ (SDK Wrapper)│  │  (Settings)     │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────────┘  │   │
│  │         │                │                              │   │
│  │         └────────────────┘                              │   │
│  │                   │                                     │   │
│  │         ┌─────────┴──────────┐                          │   │
│  │         │  ServerManager     │                          │   │
│  │         │ (Lifecycle Manager)│                          │   │
│  │         └─────────┬──────────┘                          │   │
│  └───────────────────┼─────────────────────────────────────┘   │
│                      │                                          │
│                      │ @opencode-ai/sdk                         │
└──────────────────────┼──────────────────────────────────────────┘
                       │
                       ▼ HTTP / SSE
┌─────────────────────────────────────────────────────────────────┐
│                     OpenCode Server                              │
│                    (Node.js Process)                             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Session   │  │    Tool     │  │      LSP Integration    │  │
│  │   Manager   │  │   Registry  │  │   (Code Completion)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Providers                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │
│  │ Claude  │  │  GPT-4  │  │  Local  │  │  OpenAI Compatible  │ │
│  │ (API)   │  │ (API)   │  │ (vLLM)  │  │      (Any)          │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
opencodian/
├── docs/
│   ├── ARCHITECTURE.md          # 架构文档（本文件）
│   ├── MIGRATION.md             # 从 Claudian 迁移指南
│   └── API.md                   # OpenCode SDK API 参考
├── src/
│   ├── main.ts                  # 插件入口
│   ├── core/
│   │   ├── opencode/            # OpenCode SDK 封装
│   │   │   ├── OpenCodeService.ts     # 核心服务类
│   │   │   ├── ServerManager.ts       # 服务器生命周期管理
│   │   │   ├── SessionManager.ts      # 会话管理
│   │   │   ├── MessageTransformer.ts  # 消息格式转换
│   │   │   └── types.ts               # 类型定义
│   │   ├── storage/             # 存储层（与 Claudian 类似）
│   │   │   ├── StorageService.ts
│   │   │   ├── SessionStorage.ts
│   │   │   └── SettingsStorage.ts
│   │   ├── types/               # 类型定义
│   │   │   ├── index.ts
│   │   │   ├── settings.ts
│   │   │   ├── chat.ts
│   │   │   └── models.ts
│   │   └── tools/               # 工具定义
│   │       └── toolNames.ts
│   ├── features/
│   │   ├── chat/                # 聊天功能
│   │   │   ├── OpenCodianView.ts      # 主视图
│   │   │   ├── controllers/           # 控制器
│   │   │   ├── rendering/             # 消息渲染
│   │   │   ├── ui/                    # UI 组件
│   │   │   └── tabs/                  # 标签页管理
│   │   ├── settings/            # 设置面板
│   │   │   └── OpenCodianSettings.ts
│   │   └── inline-edit/         # 行内编辑
│   ├── shared/                  # 共享组件
│   │   ├── components/
│   │   ├── modals/
│   │   └── icons.ts
│   ├── i18n/                    # 国际化
│   └── utils/                   # 工具函数
├── tests/                       # 测试
├── scripts/                     # 构建脚本
├── esbuild.config.mjs
├── jest.config.js
├── package.json
├── manifest.json
├── tsconfig.json
└── styles.css                   # 编译后的样式
```

## 核心模块说明

### 1. OpenCodeService

替代 Claudian 的 `ClaudianService`，负责与 OpenCode SDK 通信。

**关键差异：**
- 需要管理 OpenCode 服务器的启动/停止
- 使用 REST API 而非直接 SDK 调用
- 通过 SSE (Server-Sent Events) 接收流式响应
- 会话完全由 OpenCode 服务端管理

### 2. ServerManager

OpenCode 特有的模块，管理 OpenCode 服务器的生命周期。

**职责：**
- 启动/停止 OpenCode 服务器进程
- 监控服务器健康状态
- 处理服务器崩溃恢复
- 端口管理（默认 4096）

### 3. MessageTransformer

负责 Claudian 消息格式与 OpenCode 消息格式之间的转换。

**转换映射：**

| Claudian (SDK) | OpenCode |
|----------------|----------|
| `SDKMessage` | `{ info: Message, parts: Part[] }` |
| `StreamChunk` | SSE Event |
| Tool Use | `tool_use` Part |
| Tool Result | `tool_result` Part |

### 4. Model 管理

OpenCode 支持多模型，需要动态获取可用模型列表。

```typescript
// 获取可用模型
const { providers, default: defaults } = await client.config.providers();
```

## 数据流

### 发送消息流程

```
用户输入
    │
    ▼
┌─────────────────┐
│ InputController │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OpenCodeService │
│  .sendMessage() │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenCode SDK   │
│ session.prompt()│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenCode       │
│   Server        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   LLM API       │
└─────────────────┘
```

### 接收响应流程

```
┌─────────────────┐
│   LLM API       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenCode       │
│   Server        │
└────────┬────────┘
         │ SSE Stream
         ▼
┌─────────────────┐
│  OpenCode SDK   │
│ event.subscribe │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ MessageTransformer
│ (Format Convert)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ StreamController│
│ (UI Updates)    │
└─────────────────┘
```

## 会话管理

### OpenCode 会话模型

```typescript
interface Session {
  id: string;           // OpenCode 会话 ID
  title: string;
  createdAt: number;
  updatedAt: number;
  // ...
}
```

### 会话生命周期

1. **创建会话**
   ```typescript
   const session = await client.session.create({
     body: { title: "New Session" }
   });
   ```

2. **发送消息**
   ```typescript
   const result = await client.session.prompt({
     path: { id: sessionId },
     body: {
       parts: [{ type: "text", text: "Hello!" }],
       model: { providerID: "anthropic", modelID: "claude-3-5-sonnet-20241022" }
     }
   });
   ```

3. **获取历史**
   ```typescript
   const messages = await client.session.messages({ path: { id: sessionId } });
   ```

4. **删除会话**
   ```typescript
   await client.session.delete({ path: { id: sessionId } });
   ```

## 消息格式转换

### OpenCode → Claudian UI

```typescript
// OpenCode Part 类型
interface Part {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking';
  // ... 根据类型有不同的字段
}

// 转换为 StreamChunk
function transformPartToChunk(part: Part, index: number): StreamChunk {
  switch (part.type) {
    case 'text':
      return { type: 'text', content: part.text };
    case 'tool_use':
      return { 
        type: 'tool_use', 
        id: part.id,
        name: part.name,
        input: part.input 
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: part.tool_use_id,
        content: part.content
      };
    // ...
  }
}
```

## 设置系统

### OpenCodian 设置结构

```typescript
interface OpenCodianSettings {
  // 服务器设置
  serverPort: number;
  serverHost: string;
  autoStartServer: boolean;
  
  // 模型设置
  defaultProvider: string;
  defaultModel: string;
  
  // 与 Claudian 类似的设置
  permissionMode: 'yolo' | 'plan' | 'normal';
  enableBlocklist: boolean;
  blockedCommands: PlatformBlockedCommands;
  
  // UI 设置
  maxTabs: number;
  tabBarPosition: 'input' | 'header';
  enableAutoScroll: boolean;
  
  // ...其他设置
}
```

## 开发路线图

### Phase 1: 基础架构
- [x] 项目初始化
- [x] SDK 集成
- [ ] ServerManager 实现
- [ ] 基础会话功能

### Phase 2: 核心功能
- [ ] 消息发送/接收
- [ ] 流式响应
- [ ] 会话管理
- [ ] 历史记录

### Phase 3: UI 实现
- [ ] 侧边栏视图
- [ ] 消息渲染
- [ ] 设置面板
- [ ] 多标签支持

### Phase 4: 高级功能
- [ ] 工具调用渲染
- [ ] 文件上下文
- [ ] 图片支持
- [ ] 行内编辑

### Phase 5: 优化
- [ ] 性能优化
- [ ] 错误恢复
- [ ] 测试覆盖
- [ ] 文档完善

## 技术要点

### 1. 服务器生命周期管理

```typescript
class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private client: OpenCodeClient | null = null;
  
  async start(): Promise<void> {
    // 1. 检查端口占用
    // 2. 启动 opencode 服务器进程
    // 3. 等待健康检查通过
    // 4. 创建客户端连接
  }
  
  async stop(): Promise<void> {
    // 1. 关闭客户端连接
    // 2. 终止服务器进程
    // 3. 清理资源
  }
  
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}
```

### 2. 流式响应处理

```typescript
async *streamResponse(sessionId: string): AsyncGenerator<StreamChunk> {
  const events = await this.client.event.subscribe();
  
  for await (const event of events.stream) {
    if (event.type === 'message_stream') {
      yield transformToStreamChunk(event);
    }
  }
}
```

### 3. 错误处理

```typescript
try {
  const result = await client.session.prompt({ ... });
} catch (error) {
  if (error.name === 'StructuredOutputError') {
    // 处理结构化输出错误
  } else if (error.message.includes('ECONNREFUSED')) {
    // 服务器未启动，尝试重启
    await serverManager.restart();
  }
}
```

## 依赖关系

```
main.ts
├── OpenCodianView
│   ├── TabManager
│   │   └── Tab
│   │       └── OpenCodeService
│   │           ├── ServerManager
│   │           └── MessageTransformer
│   └── UI Components
├── OpenCodianSettingTab
└── StorageService
```

## 参考资料

- [OpenCode SDK 文档](https://opencode.ai/docs/sdk/)
- [Claudian AGENTS.md](./AGENTS.md)
- [Obsidian API 文档](https://docs.obsidian.md/)
