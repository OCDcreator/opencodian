# 参考项目说明

这个目录包含了使用 `@opencode-ai/sdk` 的开源项目，用于参考 Obsidian 插件开发。

## 📦 项目列表

### 1. **anomalyco/opencode** - 官方主仓库

**仓库**: https://github.com/anomalyco/opencode
**Stars**: 125k+ ⭐
**用途**: 
- ✅ SDK 官方示例 (`packages/sdk/js/example/example.ts`)
- ✅ TUI 实现参考 (`packages/opencode/src/cli/cmd/tui/`)
- ✅ 类型定义 (`packages/sdk/js/src/v2/gen/`)

**关键文件**:
```
opencode/
├── packages/
│   ├── sdk/                    # SDK 核心代码
│   │   ├── js/
│   │   │   ├── example/        # 官方示例
│   │   │   └── src/
│   │   │       ├── v2/         # v2 API
│   │   │       └── client.ts   # 客户端实现
│   └── opencode/
│       └── src/cli/cmd/tui/    # TUI 界面实现
```

**学习重点**:
1. SDK 基础用法
2. 会话管理
3. 文件上传处理

---

### 2. **promptfoo/promptfoo** - 生产级 SDK 封装

**仓库**: https://github.com/promptfoo/promptfoo
**Stars**: 6k+ ⭐
**用途**:
- ✅ 完整的 SDK Provider 实现
- ✅ 工具和权限配置
- ✅ 错误处理机制
- ✅ 会话管理和缓存

**关键文件**:
```
promptfoo/
└── src/
    └── providers/
        └── opencode-sdk.ts    # 完整的 SDK 封装 (1000+ 行)
```

**学习重点**:
1. **配置管理**: 工具、权限、MCP 服务器配置
2. **会话生命周期**: 创建、持久化、清理
3. **错误处理**: 友好的错误消息和异常捕获
4. **性能优化**: 响应缓存、会话池

**核心功能**:
- 工具配置 (`buildToolsConfig`)
- 权限管理 (`OpenCodePermissionConfig`)
- 会话缓存 (`persist_sessions`)
- 错误提取 (`messageFromError`)

---

### 3. **daytonaio/daytona** - 简洁实现示例

**仓库**: https://github.com/daytonaio/daytona
**Stars**: 2k+ ⭐
**用途**:
- ✅ 简洁的会话管理
- ✅ 事件流处理
- ✅ 错误消息提取

**关键文件**:
```
daytona/
└── guides/
    └── typescript/
        └── opencode/
            └── opencode-sdk/
                └── src/
                    └── session.ts    # 简洁实现 (150 行)
```

**学习重点**:
1. **流式响应**: 使用 AsyncGenerator 处理事件流
2. **错误处理**: 提取人类可读的错误消息
3. **事件过滤**: 只处理相关事件
4. **简洁架构**: 最小化封装，易于理解

**核心功能**:
```typescript
// 流式处理
async function* takeUntil<T>(iterable: AsyncIterable<T>, until: Promise<unknown>)

// 事件打印
function printEvent(sessionId: string, event: Event)

// 错误提取
function messageFromError(err: AssistantMessage['error']): string
```

---

## 🎯 学习路径

### 初级 (推荐从这开始)
1. 阅读 `daytona/guides/typescript/opencode/opencode-sdk/src/session.ts`
2. 理解基础的会话创建和消息发送

### 中级
1. 查看 `opencode/packages/sdk/js/example/example.ts`
2. 学习文件上传和批量处理

### 高级
1. 研究 `promptfoo/src/providers/opencode-sdk.ts`
2. 深入理解配置、缓存和错误处理

---

## 📊 项目对比

| 特性 | opencode (官方) | promptfoo | daytona |
|------|----------------|-----------|---------|
| **代码量** | 中等 (示例) | 大 (1000+ 行) | 小 (150 行) |
| **完整度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **学习难度** | 低 | 高 | 中 |
| **生产就绪** | ❌ | ✅ | ⚠️ |
| **工具配置** | ❌ | ✅ | ❌ |
| **权限管理** | ❌ | ✅ | ❌ |
| **错误处理** | ❌ | ✅ | ✅ |
| **会话缓存** | ❌ | ✅ | ❌ |

---

## 🔍 关键代码片段

### 1. 创建客户端 (daytona 风格)

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk'

const client = createOpencodeClient({ 
    baseUrl: 'http://localhost:4096' 
})
```

### 2. 创建会话 (官方风格)

```typescript
const session = await client.session.create({
    body: { title: 'My Session' }
})
const sessionId = session.data.id
```

### 3. 发送消息 (promptfoo 风格)

```typescript
const response = await client.session.prompt({
    sessionID: sessionId,
    parts: [{ type: 'text', text: 'Hello!' }],
    tools: { read: true, bash: false },  // 工具配置
    permission: { bash: 'ask' }           // 权限配置
})
```

### 4. 处理事件流 (daytona 风格)

```typescript
for await (const event of client.session.prompt(...)) {
    if (event.type === 'text') {
        console.log(event.text)
    }
}
```

---

## 🚀 快速开始

### 最小可用示例

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk'

const client = createOpencodeClient({ 
    baseUrl: 'http://localhost:4096' 
})

// 1. 创建会话
const session = await client.session.create({ 
    body: { title: 'Obsidian Chat' } 
})

// 2. 发送消息
const response = await client.session.prompt({
    sessionID: session.data.id,
    parts: [{ type: 'text', text: 'Hello OpenCode!' }]
})

// 3. 获取响应
const text = response.data.parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('')

console.log(text)
```

---

## 📚 相关资源

- **OpenCode 官方文档**: https://opencode.ai/docs
- **SDK API 文档**: https://opencode.ai/docs/sdk
- **promptfoo 文档**: https://www.promptfoo.dev/docs/providers/opencode-sdk/
- **Obsidian 插件 API**: https://docs.obsidian.md/Reference/TypeScript+API

---

## 📝 更新日志

- 2026-03-19: 初始化参考项目集合
