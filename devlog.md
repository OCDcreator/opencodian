# OpenCodian 开发日志

## 2026-03-23 SDK 依赖评估与移除

### 📋 背景
项目中声明了 `@opencode-ai/sdk` 作为依赖，但实际代码完全没有使用它。项目自己实现了 HTTP 请求层和 SSE 流解析。本次评估决定是否使用官方 SDK 替代手动实现。

### 🔍 调研过程

#### 1. 对比参考项目与安装版本
- **参考项目** (`reference-projects/opencode-sdk-js`): v0.1.0-alpha.21
  - 使用 `Opencode` 类
  - 方法返回直接的 Promise，如 `await client.session.create()` 返回 `Session`
  - 支持流式事件 `client.event.list()`

- **npm 安装版本**: v1.2.27
  - 使用 `createOpencodeClient()` 或 `OpencodeClient`
  - 所有方法返回 `{ data, error, request, response }` 包装对象
  - API 结构完全不同

#### 2. API 差异示例
```typescript
// 参考项目 (v0.1.0-alpha.21)
const session = await client.session.create();
// session 直接是 Session 对象

// 安装版本 (v1.2.27)
const result = await client.session.create();
// result = { data: Session | undefined, error: APIError | undefined, request, response }
// 需要检查 result.data 或 result.error
```

#### 3. 评估结论
- 官方 SDK 版本差异过大，无法直接迁移
- 当前手动实现已经稳定工作，没有迁移的必要
- 移除未使用的依赖可以减少包体积

### ✅ 执行操作

#### 移除 SDK 依赖
```bash
npm uninstall @opencode-ai/sdk
```

#### 修复 TypeScript 类型错误
在 `OpenCodeService.ts` 中补充缺失的类型定义：
```typescript
interface OpenCodeEvent {
  type: string;
  properties: {
    // ... 已有属性
    delta?: string;
    field?: string;      // 新增
    partID?: string;     // 新增
    toolID?: string;
    result?: string;
    error?: string;
  };
}
```

#### 修复空值处理
```typescript
// partID 可能为 undefined 时的 Map 操作
if (partID && !this.partTypeMap.has(partID)) {
  const partType = eventData.properties?.part?.type;
  this.partTypeMap.set(partID, partType || 'text');
}
const partType = partID ? (this.partTypeMap.get(partID) || 'text') : 'text';

// tool output 可能为 undefined
content: part.state.error
  ? `Error: ${part.state.error}`
  : (part.state.output ?? ''),
```

#### 更新 tsconfig.json
排除 `reference-projects` 目录避免编译错误：
```json
{
  "exclude": [
    "node_modules",
    "tests",
    "reference-projects"
  ]
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 移除 `@opencode-ai/sdk` 依赖 |
| `package-lock.json` | 更新锁定文件 |
| `src/core/opencode/OpenCodeService.ts` | 修复类型定义和空值处理 |
| `tsconfig.json` | 排除 reference-projects |

### 🏁 结果
- Git 分支 `refactor/use-sdk` 已合并到 `main`
- 构建成功，已部署到测试环境
- 项目继续使用自定义 HTTP 实现，代码更简洁

---

## 2026-03-23 SSE 流式响应重构（进行中）

### 🚧 重构目标
将原有的轮询式消息获取改为真正的 Server-Sent Events (SSE) 流式响应，实现逐字输出的真实流式效果。

### ✅ 已完成工作

#### 1. SSE 连接建立
**实现内容：**
- 使用原生 `fetch` + `ReadableStream` 实现 SSE 连接
- 连接 OpenCode `/event` 端点获取实时事件流
- 支持手动中断连接（`reader.cancel()`）

**代码变更：**
```typescript
// src/core/opencode/OpenCodeService.ts
private async *connectSSE(url: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  });
  
  const reader = response.body!.getReader();
  // ... 读取和处理 SSE 数据
}
```

#### 2. SSE 数据解析
**实现内容：**
- 实现 `parseSSEEvents()` 方法解析 SSE 格式
- 处理 OpenCode 的特殊格式（只有 `data:` 行，无 `event:` 行）
- 从 JSON `type` 字段提取事件类型

**关键发现：**
```
OpenCode SSE 格式：
data: {"type":"message.part.delta","properties":{...}}

标准 SSE 格式：
event: message.part.delta
data: {"properties":{...}}
```

**修复：**
```typescript
// 当没有 event 类型时，从 JSON 中提取
if (!currentEvent.event && currentEvent.data) {
  try {
    const parsed = JSON.parse(currentEvent.data);
    currentEvent.event = parsed.type || 'unknown';
  } catch {
    currentEvent.event = 'unknown';
  }
}
```

#### 3. 事件类型处理
**支持的事件类型：**
| 事件类型 | 处理方式 | 说明 |
|---------|---------|------|
| `message.part.updated` | 跟踪 part 类型 | 记录 partID → 类型的映射 |
| `message.part.delta` | 流式输出 | 根据 part 类型输出 thinking/text |
| `session.idle` | 终止连接 | 消息完成信号 |
| `server.heartbeat` | 忽略 | 保持连接的心跳 |
| `server.connected` | 忽略 | 初始连接确认 |

**关键逻辑：**
```typescript
// 跟踪 part 类型
if (eventData.type === 'message.part.updated') {
  const part = eventData.properties?.part;
  if (part?.id && part?.type) {
    this.partTypeMap.set(part.id, part.type);
  }
}

// 处理流式内容
if (eventData.type === 'message.part.delta') {
  const partType = this.partTypeMap.get(props.partID);
  if (partType === 'reasoning') {
    yield { type: 'thinking', content: props.delta };
  } else {
    yield { type: 'text', content: props.delta };
  }
}
```

#### 4. CORS 配置
**问题：**
- Obsidian 使用 `app://obsidian.md` 和 `app://obsidian` 协议
- 浏览器拒绝跨域请求

**解决方案：**
```typescript
// src/core/opencode/ServerManager.ts
this.process = spawn(opencodePath, [
  'serve',
  '--port', String(this.config.port),
  '--hostname', this.config.host,
  '--cors', 'app://obsidian.md',
  '--cors', 'app://obsidian',
], {
  detached: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

#### 5. 连接中断机制
**实现内容：**
- 使用 `AbortSignal` 传递中断信号
- 检测到 `session.idle` 时主动中断连接
- 使用 `reader.cancel()` 中断阻塞的 `read()` 调用

**代码：**
```typescript
// 检测到消息完成
if (eventData.type === 'session.idle') {
  console.log('[OpenCodeService] Session idle, message complete');
  abortController.abort();
  break;
}

// 中断处理
const abortHandler = () => {
  aborted = true;
  void reader.cancel();
};
signal?.addEventListener('abort', abortHandler);
```

### ✅ 已修复：流结束后无法发送新消息

**问题现象：**
- 第一条消息流式输出正常
- 回复完成后，点击发送按钮无反应
- 控制台无错误日志

**排查过程：**
1. ✅ 确认 `isStreaming` 状态重置逻辑存在（`finally` 块）
2. ✅ 确认 `session.idle` 事件正确处理并 break
3. ✅ 确认 `abortController.abort()` 正确中断 SSE 连接

**根因分析：**
- 通过添加详细调试日志，确认 `session.idle` 事件被正确接收和处理
- SSE 循环正确 break，`finally` 块正确执行
- `isStreaming` 状态正确重置

**验证日志：**
```
[OpenCodeService] SSE event: session.idle
[OpenCodeService] session.idle event passed filter, properties: {"sessionID":"..."}
[OpenCodeService] Session idle detected, breaking loop...
[OpenCodeService] Session idle, message complete
[OpenCodeService] Abort signal received, cancelling reader...
[OpenCodeService] SSE reader released
[OpenCodianView] Converting chunk: message_stop
[StreamController] handleChunk: done
[OpenCodianView] Streaming state reset  ← 状态正确重置
```

**添加的调试日志：**
```typescript
// OpenCodeService.ts - session 过滤器
if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
  console.log('[OpenCodeService] Skipping event for different session...');
  continue;
}

// session.idle 处理
if (eventData.type === 'session.idle') {
  console.log('[OpenCodeService] Session idle detected, breaking loop...');
  console.log('[OpenCodeService] Session idle, message complete');
  abortController.abort();
  break;
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 实现 SSE 连接、数据解析、事件处理 |
| `src/core/opencode/ServerManager.ts` | 添加 CORS 配置参数 |
| `src/features/chat/OpenCodianView.ts` | 添加异常处理，确保流结束 |

### 📝 下一步计划

1. ~~**验证连接中断**~~ ✅ 已验证，SSE 流正常工作
2. **清理调试日志** - 移除不必要的详细日志（保留关键日志）
3. **完善功能**
   - 添加连接状态指示器
   - 实现取消按钮（中断当前流）
   - 消息历史持久化到本地

---

## 2026-03-19 Bug修复：消息显示与工具调用超时

### 🔧 修复消息无法正常显示的问题

**问题现象：**
- AI 回复的消息在 UI 中无法正常显示
- 日志显示消息已获取，但流提前退出
- 控制台显示 `[OpenCodeService] Exiting - content stable`，但内容为空

**根本原因：**
```typescript
// 原代码中的退出条件过于严格
const hasSubstantialContent = lastContent.length > 100;  // 需要超过100字符
const requiredStableCount = 8;  // 需要稳定8次轮询
```
- 如果 AI 回复短（少于100字符），`hasSubstantialContent` 永远为 false
- 轮询会持续到 `maxAttempts`（300次），用户长时间看不到内容

**解决方案：**
1. 放宽退出条件：只要有任何内容（`> 0` 字符）即可退出
2. 降低稳定计数要求：从 8 次降低到 5 次
3. 添加兜底条件：50次轮询后无论是否有内容都退出

```typescript
const hasAnyContent = lastContent.length > 0 || lastThinkingContent.length > 0;
const requiredStableCount = toolsPending ? 15 : 5;

if (stableCount >= requiredStableCount && (hasAnyContent || attempts > 50) && !toolsPending) {
  console.log('[OpenCodeService] Exiting - content stable');
  break;
}
```

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

### ⏱️ 添加工具调用超时机制

**问题现象：**
- 某些工具（如 `websearch_web_search_exa`）长时间处于 `running` 状态
- 工具一直不返回结果，导致流永远无法退出
- 用户界面显示转圈，但永远无法收到最终回复

**根本原因：**
- OpenCode 的工具调用是异步的
- 某些工具可能因为网络问题或 API 错误永远卡住
- 没有超时机制导致无限等待

**解决方案：**
添加工具调用超时检测（60秒）：

```typescript
// Track tool start times for timeout detection
const toolStartTimes = new Map<string, number>();
const TOOL_TIMEOUT_MS = 60000; // 60 seconds timeout

// 记录工具开始时间
if (!processedToolIds.has(toolId)) {
  toolStartTimes.set(toolId, Date.now());
  // ...
}

// 检测超时工具
const timedOutTools: string[] = [];
for (const toolId of pendingToolIds) {
  const startTime = toolStartTimes.get(toolId);
  if (startTime && (now - startTime) > TOOL_TIMEOUT_MS) {
    console.log(`[OpenCodeService] Tool ${toolId} timed out`);
    timedOutTools.push(toolId);
  }
}

// 将超时工具标记为完成（带错误信息）
for (const toolId of timedOutTools) {
  yield {
    type: 'tool_result',
    toolUseId: toolId,
    content: 'Error: Tool execution timed out after 60 seconds',
  };
}
```

**超时处理流程：**
1. 新工具调用时记录开始时间
2. 每次轮询检查是否有工具超过 60 秒
3. 超时工具自动标记为完成，返回超时错误
4. 流可以继续退出，显示已获取的内容

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

### ✅ 修复验证

**测试场景：**
- 发送消息"搜索今日时事新闻"
- AI 调用多个搜索工具
- 其中一个工具卡住（websearch_web_search_exa）

**修复前：**
- 工具一直显示 running，无法退出
- 用户看不到任何回复内容

**修复后：**
- 60秒后超时工具自动标记为错误
- 流正常退出，显示 AI 的完整回复
- 控制台显示：`Tool xxx timed out after 60000ms`

---

## 2026-03-19 功能实现与改进

本次会话完成了 OpenCodian 插件的核心功能实现和多项重要改进。

---

## ✅ 已完成的功能 (补充)

### 7. 历史会话菜单功能

**实现内容：**
- 点击历史会话按钮（history icon）弹出下拉菜单
- 显示所有历史会话列表，按更新时间排序
- 当前会话标记为 `(current)` 并显示勾选图标
- 点击任意会话即可切换到该会话
- 支持删除当前会话或删除所有会话（带确认对话框）
- 鼠标悬停显示会话创建日期

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 菜单实现和会话切换逻辑

**技术细节：**
- 使用 Obsidian 的 `Menu` 组件创建下拉菜单
- 菜单项包含：
  - 会话列表（带图标和当前状态标记）
  - 分隔线
  - 删除当前会话
  - 删除所有会话（当会话数 > 1 时显示）
- 删除会话后自动加载剩余会话或创建新会话
- 使用 `confirm()` 对话框防止误删除

**示例交互：**
```
┌─────────────────────────┐
│ 🗨️ 会话 1               │
│ ✓ 会话 2 (current)      │
│ 🗨️ 会话 3               │
│ ─────────────────────── │
│ 🗑️ Delete current       │
│ 🗑️ Delete all           │
└─────────────────────────┘
```

### 8. Markdown 渲染支持

**实现内容：**
- 集成 `MarkdownRenderService` 到聊天界面
- AI 助手消息使用完整的 Markdown 渲染
- 支持代码块高亮（含语言标签和复制按钮）
- 支持图片嵌入 `![[image.png]]`
- 支持文件链接 `[[note]]`
- 支持表格、列表、引用等标准 Markdown 语法
- 流式响应实时 Markdown 渲染

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 集成 Markdown 渲染服务
- `styles.css` - 添加 Markdown 渲染样式

**技术细节：**
- 使用 Obsidian 原生 `MarkdownRenderer` API
- 三阶段渲染流程：
  1. 预处理：`replaceImageEmbedsWithHtml` 处理图片嵌入
  2. 核心渲染：`MarkdownRenderer.renderMarkdown()`
  3. 后处理：`processFileLinks` 处理文件链接 + `enhanceCodeBlocks` 增强代码块
- 用户消息保持纯文本显示
- 创建独立的 `Component` 管理生命周期，避免内存泄漏

**渲染功能：**
| 功能 | 状态 |
|------|------|
| 代码块 + 语法高亮 | ✅ |
| 行内代码 | ✅ |
| 图片嵌入 `![[]]` | ✅ |
| 文件链接 `[[ ]]` | ✅ |
| 表格 | ✅ |
| 列表（有序/无序） | ✅ |
| 引用块 | ✅ |
| 标题 H1-H6 | ✅ |
| 水平分割线 | ✅ |
| 链接 | ✅ |

### 9. 流式内容渲染模块

**实现内容：**
- 创建通用流式渲染模块，支持思考块、文本、工具调用三种内容类型
- 思考块（thinking）：可折叠 + 实时计时器，默认收起
- 文本块（text）：支持 Markdown 实时渲染
- 工具调用（tool_call）：状态图标 + 可展开结果
- 支持流式数据块的增量处理和渲染
- 支持历史消息的内容块恢复渲染

**涉及文件：**
- `src/utils/streaming/` - 流式渲染模块目录
  - `types.ts` - 类型定义
  - `StreamController.ts` - 核心流式控制器
  - `ThinkingBlockRenderer.ts` - 思考块渲染器
  - `ToolCallRenderer.ts` - 工具调用渲染器
  - `index.ts` - 导出入口
  - `README.md` - 使用文档
- `styles.css` - 流式内容样式

**技术细节：**
- 三阶段内容块处理流程：
  1. `startStream()` - 创建消息容器，初始化状态
  2. `handleChunk()` - 处理各种类型的数据块
     - `thinking` → 创建/更新思考块，实时计时
     - `text` → Markdown 渲染
     - `tool_use/tool_result` → 工具调用渲染和结果更新
  3. `finalize()` - 保存 contentBlocks，触发回调
- 使用 `ContentBlock[]` 数组持久化消息内容
- 支持自定义工具图标、名称、摘要和结果渲染

**API 示例：**
```typescript
import { StreamController } from '@/utils/streaming';

const streamController = new StreamController({
  containerEl: messagesContainer,
  markdownService,
  onStreamComplete: (blocks) => saveMessage(blocks),
  scrollToBottom: () => scrollToBottom(),
});

// 开始流
streamController.startStream(contentEl);

// 处理数据块
for await (const chunk of stream) {
  await streamController.handleChunk(chunk);
}

// 恢复历史
streamController.renderStoredContentBlocks(parentEl, savedBlocks);
```

**内容块类型：**
| 类型 | 特性 |
|------|------|
| thinking | 可折叠，实时计时，默认收起 |
| text | Markdown 渲染 |
| tool_call | 状态图标（pending/running/completed/error），可展开结果 |

### 10. 会话内模型切换

**实现内容：**
- 移除 "Model: " 文本标签，仅保留下拉框
- 下拉框直接显示当前使用的模型名称（格式：Provider/Model）
- 鼠标悬停1秒后显示完整模型信息提示
- 支持下拉选择其他模型，仅影响当前会话
- 切换模型后发送的消息使用新模型
- 每个会话独立保存模型覆盖设置

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 模型选择器实现
- `styles.css` - 选择器样式优化

**技术细节：**
- 使用 `Map<string, {provider, model}>` 存储每个会话的模型覆盖
- 模型选择优先级：会话覆盖 > 默认设置
- 从 OpenCode 服务动态加载可用模型列表
- 切换会话时自动更新选择器显示当前会话的模型

**示例交互：**
```
┌────────────────────────────┐
│ anthropic/claude-3-5-...  ▼│  <- 下拉框显示当前模型
└────────────────────────────┘
鼠标悬停1秒后显示：Using: anthropic/claude-3-5-sonnet-20241022
```

---

## ✅ 已完成的功能

### 1. 国际化支持 (i18n)

**实现内容：**
- 创建了完整的双语翻译系统
- 支持英文 (`en`) 和简体中文 (`zh`)
- 所有设置界面文本已翻译
- 新增语言选择设置项

**涉及文件：**
- `src/i18n/index.ts` - 国际化核心模块
- `src/i18n/locales/en.ts` - 英文翻译
- `src/i18n/locales/zh.ts` - 中文翻译
- `src/features/settings/OpenCodianSettings.ts` - 集成翻译
- `src/main.ts` - 初始化语言设置

### 2. 动态供应商/模型选择

**实现内容：**
- 从 OpenCode 服务器动态获取可用供应商列表
- 根据选择的供应商动态加载可用模型
- 修复模型数据格式兼容性（支持字符串数组和对象两种格式）
- 模型选择后正确保存到设置

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts` - `getAvailableModels()` 方法
- `src/features/settings/OpenCodianSettings.ts` - 动态下拉菜单实现

**技术细节：**
- API 端点：`GET /config/providers`
- 处理两种 models 格式：
  - 格式1: `models: ["gpt-4", "gpt-3.5-turbo"]` (字符串数组)
  - 格式2: `models: { "model-id": { name: "..." } }` (对象)

### 3. 服务器状态检测与外部服务器识别

**实现内容：**
- 实时检测服务器运行状态（每2秒自动刷新）
- 区分插件启动的服务器和外部独立运行的服务器
- 添加 🟢/🔴 状态指示灯
- 外部服务器显示特殊标记并禁用停止按钮

**涉及文件：**
- `src/features/settings/OpenCodianSettings.ts` - 状态显示逻辑
- `src/core/opencode/ServerManager.ts` - 健康检查端点修复

**技术细节：**
- 修复健康检查端点：`/global/health`（原 `/health` 错误）
- 状态检测逻辑：
  - 健康检查通过 + 内部进程存在 = 运行中（可停止）
  - 健康检查通过 + 无内部进程 = 外部服务器（不可停止）

### 4. 会话功能修复

**问题修复：**

#### 问题1：会话ID错误导致500错误
**原因：**
- 保存会话时未存储 `openCodeSessionId`
- 加载会话时错误地使用对话ID作为 session ID
- 导致调用 `/session/{wrong-id}/message` 返回500

**解决方案：**
- 更新 `ConversationMeta` 类型，添加 `openCodeSessionId` 字段
- 修复 `StorageService.saveConversation()` 保存正确的 session ID
- 修复 `loadConversations()` 正确读取 `openCodeSessionId`

**涉及文件：**
- `src/core/types/chat.ts`
- `src/core/storage/StorageService.ts`
- `src/main.ts`

#### 问题2：消息获取端点错误
**修复内容：**
- 端点从 `/session/:id/messages` 改为 `/session/:id/message`（单数形式）
- 修复 `sendMessage()` 使用 `/prompt_async` 异步端点

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

### 5. 消息流式响应优化

**实现内容：**
- 修复轮询逻辑，持续轮询直到获取完整回复
- 支持增量更新，实时显示AI回复
- 改进超时处理（120秒超时）
- 添加详细调试日志

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts` - `sendMessage()` 方法
- `src/features/chat/OpenCodianView.ts` - 消息渲染

**技术细节：**
- 轮询间隔：1秒
- 最大尝试次数：120次（2分钟）
- 检测到助手消息后，持续轮询直到内容不再变化

### 6. 模型切换生效修复

**问题：**
- 设置中选择 glm-4.6，实际使用 glm-5
- 请求体格式错误导致模型参数未生效

**修复内容：**
- 修正请求体格式为嵌套结构：
```json
{
  "parts": [...],
  "model": {
    "providerID": "zhipu-external",
    "modelID": "glm-4.6"
  }
}
```

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

## 🔧 API 端点修正记录

| 功能 | 错误端点 | 正确端点 |
|------|----------|----------|
| 健康检查 | `/health` | `/global/health` |
| 获取消息 | `/session/:id/messages` | `/session/:id/message` |
| 发送消息 | `/session/:id/prompt` | `/session/:id/prompt_async` |
| 获取模型 | `/config/providers` | `/config/providers` ✅ |

---

## 📝 调试日志添加

为以下模块添加了详细控制台日志：

1. **OpenCodeService**
   - 会话创建：`[OpenCodeService] Creating session`, `Created session ID`
   - 消息发送：`[OpenCodeService] Sending message`, `Message sent successfully`
   - 消息获取：`[OpenCodeService] Getting messages`, `Messages response`
   - 模型获取：`[OpenCodeService] Raw providers data`

2. **OpenCodianView**
   - 消息流：`[OpenCodianView] Message stream started/stopped`
   - 内容接收：`[OpenCodianView] Received chunk`
   - 最终消息：`[OpenCodianView] Final message`

3. **Settings**
   - 模型加载：`[Settings] Current defaultModel`
   - 模型切换：`[Settings] Model changed to`, `Saved settings`

---

## 🐛 已知问题与解决方案

### 已修复的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 消息加载 500 错误 | 使用了错误的会话ID | 正确存储和读取 `openCodeSessionId` |
| 端点 404 错误 | 端点路径错误（复数形式） | 改为单数形式 `/message` |
| 模型切换不生效 | 请求体格式错误 | 改为嵌套 `model` 对象格式 |
| 服务器状态显示错误 | 未检测外部服务器 | 添加外部服务器识别逻辑 |
| 模型列表为空 | 数据结构解析错误 | 支持两种 models 数据格式 |
| 历史会话按钮无效 | `showConversationHistory()` 为空实现 | 使用 `Menu` 组件实现完整下拉菜单 |

---

## 📊 当前功能状态

### ✅ 完全可用
- [x] 中文界面
- [x] 动态供应商/模型选择
- [x] 模型切换生效
- [x] 会话创建和管理
- [x] 发送消息
- [x] 实时流式响应
- [x] 服务器状态检测
- [x] 历史会话切换（点击 history 按钮弹出菜单）
- [x] Markdown 渲染（代码块、图片、链接、表格等）
- [x] 流式内容渲染（思考块、文本、工具调用）
- [x] 会话内模型切换（下拉框选择，悬停提示）

### 🚧 已知限制
- 外部服务器无法通过插件停止（需要手动在终端停止）
- 首次加载设置时需要手动刷新模型列表
- 消息历史依赖 OpenCode 服务器存储

---

## 2026-03-23 Bug修复：SSE流结束后无法发送新消息

### 🔧 问题分析

**现象：**
- 第一条消息流式输出正常
- 回复完成后，无法再发送新消息
- `isStreaming` 状态保持为 `true`，阻止了新消息发送

**根本原因：**
1. `fetch` 请求没有使用 `signal` 参数，导致 `abortController.abort()` 无法真正取消连接
2. `reader.read()` 在某些情况下可能挂起，导致 `for await...of` 循环无法退出
3. `finally` 块无法执行，`isStreaming` 状态无法重置

### ✅ 修复方案

**1. OpenCodianView.ts - 添加超时保护机制**
```typescript
// Set up timeout as safety net to reset isStreaming
const STREAM_TIMEOUT_MS = 120000; // 2 minutes timeout
let timeoutId: number | null = null;
const resetStreamingState = () => {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
  this.isStreaming = false;
};

timeoutId = window.setTimeout(() => {
  console.warn('[OpenCodianView] Stream timeout, forcing state reset');
  resetStreamingState();
  // ...
}, STREAM_TIMEOUT_MS);
```

**2. OpenCodeService.ts - 修复 SSE 连接取消逻辑**
```typescript
// 将 signal 传递给 fetch
const response = await fetch(url, {
  method: 'GET',
  headers: { 'Accept': 'text/event-stream' },
  signal, // 允许通过 abortController 取消请求
});

// 改进错误处理
try {
  readResult = await reader.read();
} catch (readError) {
  if (signal?.aborted || aborted) {
    break; // 优雅地处理取消
  }
  throw readError;
}
```

### 📝 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 添加超时机制，确保 `isStreaming` 总能被重置 |
| `src/core/opencode/OpenCodeService.ts` | 修复 `fetch` 信号传递，改进 `reader.read()` 错误处理 |

---

## 🎯 下一步建议

1. ~~**修复 SSE 流状态问题**~~ ✅ 已完成
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
3. **错误重试机制** - 网络错误时自动重试
4. **消息编辑/删除** - 添加消息管理功能
5. **文件附件** - 支持上传文件到对话
6. **代码块高亮** - 优化消息中代码的显示

---

**会话日期**: 2026-03-23
**开发时长**: ~4 小时
**主要贡献**: SSE 流式响应架构实现、CORS 配置、事件解析、流状态管理修复

**当前状态**: ✅ SSE 流式传输功能完整，支持连续发送多条消息


---

## 2026-03-23 工具调用显示修复

### 🐛 问题描述
用户报告工具调用在会话中不显示。虽然 AI 实际调用了工具（如 web_search、bash、read 等），但前端界面中没有呈现工具调用的卡片。

### 🔍 根因分析
通过分析日志文件 `obsidian.md-1774267116377.log`，发现问题出在 `OpenCodeService.ts` 的 SSE 事件处理逻辑中：

1. **代码逻辑错误**: `message.part.updated` 事件有两个处理块
   - 第一个处理块（第 467 行）跟踪 part 类型后使用 `continue` 跳过循环
   - 第二个处理块（原第 513 行）包含工具调用处理逻辑，但**永远不会被执行**

```typescript
// 第一个处理块 - 执行后会 continue 跳过
if (eventData.type === 'message.part.updated') {
  // ... 跟踪 part 类型
  continue;  // ← 这里直接跳过了！
}

// 第二个处理块 - 永远不会执行
if (eventData.type === 'message.part.updated') {
  // 处理 tool 的逻辑在这里...
}
```

2. **数据结构确认**: OpenCode Server 发送的工具调用事件格式如下：
```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_xxx",
      "type": "tool",
      "callID": "call_xxx",
      "tool": "web_search",
      "state": {
        "status": "running",
        "input": { "query": "today's date" }
      }
    }
  }
}
```

### ✅ 修复方案

#### 1. 合并工具处理逻辑
将工具调用处理逻辑合并到第一个 `message.part.updated` 处理块中：

```typescript
if (eventData.type === 'message.part.updated') {
  const part = eventData.properties?.part;
  if (part?.id && part?.type) {
    this.partTypeMap.set(part.id, part.type);
    
    // 处理工具调用
    if (part.type === 'tool') {
      const toolId = part.callID || part.id;
      const toolName = part.tool || 'unknown';
      if (toolId) {
        // 新工具调用
        if (!processedToolIds.has(toolId)) {
          processedToolIds.add(toolId);
          yield { 
            type: 'tool_use', 
            id: toolId, 
            name: toolName, 
            input: part.state?.input || {}
          };
        }
        
        // 工具结果
        if (part.state?.output || part.state?.error) {
          // yield tool_result...
        }
      }
    }
  }
  continue;
}
```

#### 2. 删除冗余代码块
移除永远不会执行的第二个 `message.part.updated` 处理块。

### 🧪 调试过程
为确认修复效果，添加了详细的调试日志：
- `[OpenCodeService] message.part.updated - part:` - 显示 part 对象结构
- `[OpenCodeService] Tool part detected!` - 确认检测到工具类型
- `[StreamController] Rendering tool:` - 确认渲染执行

通过日志验证，工具调用已正确 yield 并传递给 `StreamController`，`ToolCallRenderer` 成功渲染了工具卡片。

### 📊 测试结果
修复后，工具调用正常显示：
- ✅ `task` 工具 - 显示任务进度
- ✅ `glob` 工具 - 显示文件搜索
- ✅ `grep` 工具 - 显示文本搜索
- ✅ `ast_grep_search` 工具 - 显示代码搜索

工具卡片显示为可折叠的 UI 组件：
```
┌─────────────────────────────────────┐
│ 🔧 web_search │ "query" │ ⏳ │
├─────────────────────────────────────┤
│ Waiting for result...               │
└─────────────────────────────────────┘
```

### 📝 代码清理
修复验证完成后，清理了所有调试日志：
- 删除了 `OpenCodeService.ts` 中的 5 处调试日志
- 删除了 `StreamController.ts` 中的 3 处调试日志

### 🎯 技术要点
1. **SSE 事件处理**: OpenCode Server 使用 `message.part.updated` 事件通知工具状态变化
2. **工具生命周期**: 工具调用经历 `pending` → `running` → `completed/error` 状态
3. **渲染流程**: 
   - `OpenCodeService` 解析 SSE 事件 → yield `tool_use` chunk
   - `StreamController` 接收 chunk → 调用 `ToolCallRenderer.render()`
   - `ToolCallRenderer` 创建 DOM 元素 → 显示工具卡片

---

**会话日期**: 2026-03-23
**开发时间**: ~2 小时
**主要贡献**: 修复工具调用显示问题，清理调试日志
**涉及文件**: 
- `src/core/opencode/OpenCodeService.ts`
- `src/utils/streaming/StreamController.ts`

**当前状态**: ✅ 工具调用显示功能完整，支持 task/glob/grep/ast_grep_search 等多种工具


---

## 2026-03-23 UI 优化与功能完善

### 🧹 代码清理：移除不必要的控制台日志

#### 清理范围
移除了约 70 处调试日志，保留错误和警告日志：

**保留的日志（有用信息）：**
- `console.error` - 错误处理日志
- `console.warn` - 警告日志

**移除的日志文件：**
- `src/main.ts` - 4 条
- `src/features/settings/OpenCodianSettings.ts` - 6 条
- `src/core/opencode/ServerManager.ts` - 7 条
- `src/utils/streaming/StreamController.ts` - 5 条
- `src/core/opencode/OpenCodeService.ts` - 38 条
- `src/features/chat/OpenCodianView.ts` - 7 条

### 🐛 修复历史会话显示问题

#### 问题描述
重新启动 Obsidian 后，以前会话的 thinking 和工具调用显示消失，只剩下一个空白框。

#### 根本原因
历史消息加载时只提取了 `type === 'text'` 的部分，没有处理 thinking 和 tool 部分。

#### 解决方案

**1. 更新 `openCodeMessageToChatMessage()` 方法**
- 添加对 `type === 'reasoning'` 部分的提取（thinking 内容）
- 构建 `contentBlocks` 数组，包含 thinking、tool_use、tool_result、text 块

**2. 新增 `renderContentBlock()` 方法**
使用与实时会话相同的渲染器：
- `ThinkingBlockRenderer.renderStored()` - 渲染可折叠的 thinking 块
- `ToolCallRenderer.render()` - 渲染工具调用卡片

**3. 更新 `renderMessage()` 方法**
- 支持完整的 `ChatMessage` 类型
- 如果存在 `contentBlocks`，按顺序渲染每个块

### 🎨 Header 样式更新

#### 新增功能
- 浅色主题显示深色 logo，深色主题显示浅色 logo
- 根据 `.theme-dark` 类自动切换
- 监听 `css-change` 事件，主题切换时自动更新

#### 修改内容
- 添加 `LOGO_SVG_LIGHT` 和 `LOGO_SVG_DARK` 常量
- 添加 `getLogoSvg()` 方法检测当前主题
- 更新 CSS 样式适配新的 logo 尺寸

### 💬 消息界面优化

#### 1. 移除头像
用户和 AI 消息都不再显示头像图标，界面更简洁。

#### 2. 融合背景样式
- 用户消息：深色半透明气泡 (`rgba(0, 0, 0, 0.3)`)，右对齐
- AI 消息：透明背景，与 Obsidian 背景融合

#### 3. 文本选择支持
- 添加 `user-select: text` 支持鼠标选择文本
- 用户消息中选中文本有白色半透明高亮

#### 4. 整体界面融合
- 容器背景改为透明
- Header 移除边框和背景色
- 输入区域移除顶部边框

### ⏹️ 停止按钮功能

#### 功能描述
发送消息后，按钮自动变为红色停止按钮，点击可中止流式响应。

#### 实现细节

**1. OpenCodeService 修改**
- 添加 `currentAbortController` 跟踪当前流
- 添加 `cancelStream()` 公共方法中止 SSE 连接
- 在生成器循环中检查 `signal.aborted` 状态

**2. OpenCodianView 修改**
- 存储 `sendBtn` 和 `inputTextarea` 引用
- 添加 `updateSendButtonState()` 方法切换按钮状态
- `cancelStreaming()` 调用服务取消方法

**3. 按钮状态切换**
- 空闲时：蓝色背景 + 发送图标
- 流式中：红色背景 + 方块图标（停止）

#### 调试日志
添加详细日志用于验证功能：
```
[OpenCodianView] cancelStreaming called, isStreaming: true
[OpenCodeService] Cancelling stream...
[OpenCodeService] Abort signal sent
[OpenCodianView] Streaming cancelled, breaking loop
```

### 📊 测试结果
- ✅ 历史会话 thinking 正确显示
- ✅ 历史会话工具调用正确显示
- ✅ Logo 随主题自动切换
- ✅ 消息文本可选择复制
- ✅ 停止按钮可中止流式响应

### 📝 涉及文件
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `styles.css`

---

**会话日期**: 2026-03-23
**开发时间**: ~3 小时
**主要贡献**: UI 优化、功能完善、代码清理
**当前状态**: ✅ 所有功能正常工作

---

## 2026-03-24 UI 改进与功能完善

本次会话完成了多项 UI 改进和 Bug 修复。

---

### ✅ 1. 时间戳移出消息气泡

**问题现象：**
- 用户消息的时间戳显示在深色气泡内部，影响美观
- 与 Claudian 的样式不一致

**解决方案：**
- 将时间戳从 `content` 容器移到 `messageEl` 级别
- 调整 CSS，让时间戳显示在气泡下方

```typescript
// 修改前：在 content 内部创建时间戳
content.createEl('div', { cls: 'opencodian-message-time', text: time });

// 修改后：在 messageEl 级别创建时间戳
messageEl.createEl('div', { cls: 'opencodian-message-time', text: time });
```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 2. Thinking 块与工具调用样式优化（Claudian 风格）

**实现内容：**
- Thinking 块显示 "Thought for Xs" 或 "Thought (<1s)"
- 工具调用显示工具名和参数摘要
- 工具状态图标：✓ 绿色（成功）、✕ 红色（失败）
- 展开后显示左侧边框线

**样式变更：**
```css
/* Thinking 块 */
.streaming-thinking-label {
  color: var(--text-accent);  /* 橙色/红色 */
}

/* 工具调用状态 */
.streaming-tool-status.status-completed {
  color: var(--color-green);
}
.streaming-tool-status.status-error {
  color: var(--color-red);
}
```

**涉及文件：**
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `styles.css`

---

### ✅ 3. 消息持久化存储

**问题现象：**
- 重新加载 Obsidian 后用户消息消失
- 工具调用消息跑到最下面
- Thinking duration 丢失

**解决方案：**
1. **保存完整消息**：`saveConversation` 现在保存 `messages` 数组
2. **独立 thinking 块**：每个 reasoning part 创建独立的 thinking block
3. **保持顺序**：工具调用在收到结果时立即保存到 contentBlocks

```typescript
// StorageService.ts
async saveConversation(conversation: Conversation): Promise<void> {
  const data = {
    // ... 元数据
    messages: conversation.messages,  // 保存完整消息
  };
}
```

**涉及文件：**
- `src/core/storage/StorageService.ts`
- `src/main.ts`
- `src/utils/streaming/StreamController.ts`

---

### ✅ 4. 等待提示功能

**实现内容：**
- AI 响应超过 1 秒时显示 "Getting to work..."
- 实时显示等待时间
- 提示 "(esc to interrupt)"
- 收到实际内容后自动消失

```typescript
const pendingTimeout = window.setTimeout(() => {
  pendingEl = messageContentEl.createDiv({ cls: 'opencodian-pending' });
  pendingEl.createSpan({ text: 'Getting to work...', cls: 'opencodian-pending-text' });
  // ... 计时器更新
}, 1000);
```

**CSS 样式：**
```css
.opencodian-pending {
  font-size: 13px;
  color: var(--text-accent);
  font-style: italic;
}
```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 5. 流超时处理

**问题现象：**
- 某些工具调用长时间卡住
- 流无法正常退出

**解决方案：**
- 添加 2 分钟超时机制
- 超时后将运行中的工具标记为错误

```typescript
private timeoutStream(): void {
  for (const [toolId, toolCall] of this.state.toolCalls) {
    if (toolCall.status === 'running' || toolCall.status === 'pending') {
      toolCall.status = 'error';
      toolCall.result = 'Request timeout';
      // ... 更新 UI
    }
  }
}
```

**涉及文件：**
- `src/utils/streaming/StreamController.ts`
- `src/features/chat/OpenCodianView.ts`

---

### 🐛 遇到的问题与修复

#### 问题 1：TypeScript 类型错误

**现象：**
编译时出现 9 处类型错误，涉及：
- `ContentBlock` 未导入
- `ToolCallInfo` 类型不匹配
- `setLocale` 参数类型错误

**修复：**
```typescript
// 统一 ToolCallStatus 类型
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

// 修复 setLocale 调用
setLocale(this.settings.locale as 'en' | 'zh');
```

#### 问题 2：工具调用状态显示错误

**现象：**
- 工具调用失败仍显示绿色勾
- CSS 中有重复定义覆盖了错误状态颜色

**修复：**
删除 CSS 中重复的状态颜色定义。

#### 问题 3：等待提示不显示

**现象：**
- 等待提示逻辑存在但不显示
- 原因是第一帧数据到达过快，清除了等待提示

**修复：**
```typescript
// 只在有实际内容时才清除等待提示
const hasContent = (streamingChunk.type === 'text' && streamingChunk.content?.trim()) ||
                  (streamingChunk.type === 'thinking' && streamingChunk.content?.trim());
```

---

### 📁 修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 时间戳位置、等待提示、消息持久化 |
| `src/utils/streaming/ThinkingBlockRenderer.ts` | Thinking 块渲染逻辑 |
| `src/utils/streaming/ToolCallRenderer.ts` | 工具调用渲染、状态图标 |
| `src/utils/streaming/StreamController.ts` | 工具调用保存顺序、超时处理 |
| `src/core/storage/StorageService.ts` | 保存完整消息数组 |
| `src/core/opencode/OpenCodeService.ts` | 独立 thinking 块处理 |
| `src/core/types/chat.ts` | 添加 `durationSeconds` 字段 |
| `src/core/types/tools.ts` | 统一 `ToolCallStatus` 类型 |
| `src/main.ts` | 异步加载完整会话 |
| `styles.css` | 样式优化、等待提示样式 |

---

### 📝 下一步计划

1. **测试覆盖** - 添加单元测试覆盖新功能
2. **性能优化** - 大型消息历史的加载优化
3. **国际化** - 完善中英文切换

---

## 2026-03-24 模型选择器 UI 重构与图标集成

本次会话完成了模型选择器的全面升级，从原生 `<select>` 元素迁移到自定义下拉组件，并集成了 200+ 个 AI 供应商品牌图标。

---

### ✅ 1. 模型选择器 UI 重构

**问题背景：**
- 原生 `<select>` 下拉框样式受限，无法分组显示
- 无法显示供应商图标，视觉层次不清晰
- 参考 opencode 的 UI 设计，需要更现代化的选择器

**实现内容：**

#### 自定义下拉组件架构
```
┌─────────────────────────────────────┐
│ 🤖 anthropic/claude-3-5-sonnet   ▼ │  ← Trigger 按钮（显示当前选择）
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│ 🔍 Search models...                 │  ← 搜索输入框
├─────────────────────────────────────┤
│ 🅰️  ANTHROPIC      ← sticky header   │
│    claude-3-opus-20240229           │
│  ✓ claude-3-5-sonnet-20241022       │  ← 当前选中
│    claude-3-5-haiku-20241022        │
├─────────────────────────────────────┤
│ 🇨🇳 DEEPSEEK       ← sticky header   │
│    deepseek-chat                    │
│    deepseek-reasoner                │
└─────────────────────────────────────┘
```

**关键实现：**

1. **Trigger 按钮设计**
   ```typescript
   // Ghost 样式按钮，显示当前选择的模型
   createEl('button', { cls: 'opencodian-model-trigger' }, (btn) => {
     btn.createSpan({ cls: 'model-trigger-icon', text: '🤖' });
     btn.createSpan({ cls: 'model-trigger-text', text: modelName });
     btn.createSpan({ cls: 'model-trigger-chevron', text: '▼' });
   });
   ```

2. **下拉面板结构**
   ```typescript
   createDiv({ cls: 'opencodian-model-dropdown' }, (dropdown) => {
     // 搜索输入
     dropdown.createDiv({ cls: 'opencodian-model-search' }, ...);
     // 可滚动列表
     dropdown.createDiv({ cls: 'opencodian-model-dropdown-scroll' }, ...);
   });
   ```

3. **定位策略**
   ```css
   .opencodian-model-dropdown {
     position: absolute;
     bottom: calc(100% + 8px);  /* 位于输入框上方 */
     left: 0;
     z-index: 1000;
   }
   ```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 2. 粘性分组头部 (Sticky Headers)

**设计目标：**
- 提供商名称在滚动时固定在顶部
- 清晰区分不同提供商的模型
- 提供视觉反馈表示当前所在分组

**技术实现：**

1. **CSS 粘性定位**
   ```css
   .opencodian-model-provider-header {
     position: sticky;
     top: 0;
     z-index: 10;
     background: var(--background-secondary);
   }
   ```

2. **IntersectionObserver 检测粘性状态**
   ```typescript
   private handleProviderHeaderScroll(): void {
     const observer = new IntersectionObserver((entries) => {
       entries.forEach(entry => {
         const header = entry.target as HTMLElement;
         const rect = header.getBoundingClientRect();
         const containerRect = container.getBoundingClientRect();
         // 检测是否被粘住
         header.dataset.stuck = (rect.top <= containerRect.top + 1) ? 'true' : 'false';
       });
     }, { root: container, threshold: [0, 1] });
   }
   ```

3. **粘性状态视觉反馈**
   ```css
   .opencodian-model-provider-header[data-stuck="true"] {
     box-shadow: 0 8px 8px -4px rgba(0, 0, 0, 0.1);
   }
   ```

---

### ✅ 3. Lobehub 图标集成

**图标来源：**
- 使用 Lobehub Icons Static SVG 包
- 1425+ 个 AI/LLM 品牌图标
- CDN 加载：`https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{name}.svg`

**ProviderIconService 实现：**

1. **图标映射表 (200+ 供应商)**
   ```typescript
   private static readonly PROVIDER_ICON_MAP: Record<string, string> = {
     // 国际主流
     'openai': 'openai',
     'anthropic': 'anthropic',
     'claude': 'claude',
     'google': 'google',
     'gemini': 'gemini',
     // 中国厂商
     'deepseek': 'deepseek',
     'aihubmix': 'aihubmix',
     'zhipu': 'zhipu',
     'glm': 'chatglm',
     'moonshot': 'moonshot',
     'kimi': 'moonshot',  // kimi = moonshot
     'qwen': 'qwen',
     '通义千问': 'qwen',
     // ... 200+ 更多映射
   };
   ```

2. **模糊匹配算法**
   ```typescript
   private static normalizeProviderId(providerId: string): string {
     return providerId
       .toLowerCase()
       .replace(/[\s\-_.]+/g, '')           // 移除分隔符
       .replace(/[\(\（].*?[\)\）]/g, '');  // 移除括号内容
   }
   
   static getIconUrl(providerId: string): string | undefined {
     const normalized = this.normalizeProviderId(providerId);
     
     // 1. 直接匹配
     if (this.PROVIDER_ICON_MAP[normalized]) {
       return this.buildUrl(this.PROVIDER_ICON_MAP[normalized]);
     }
     
     // 2. 包含匹配 (aihub-mix → aihubmix)
     for (const [key, iconName] of Object.entries(this.PROVIDER_ICON_MAP)) {
       if (normalized.includes(key) || key.includes(normalized)) {
         return this.buildUrl(iconName);
       }
     }
     
     // 3. 尝试直接使用
     return this.buildUrl(normalized);
   }
   ```

3. **SVG 图标渲染**
   ```typescript
   static getProviderIconHTML(providerId: string, size: number = 16): string {
     const iconUrl = this.getIconUrl(providerId);
     return `<img src="${iconUrl}" 
                  width="${size}" height="${size}" 
                  class="opencodian-provider-icon"
                  style="display: inline-block; vertical-align: middle;">`;
   }
   ```

**匹配示例：**
| 输入 | 归一化 | 匹配结果 |
|------|--------|----------|
| `AiHubMix (推理时代)` | `aihubmix` | ✅ `aihubmix` |
| `aihub-mix` | `aihubmix` | ✅ `aihubmix` |
| `zhipu-external` | `zhipexternal` | ✅ 包含 `zhipu` |
| `通义千问` | `通义千问` | ✅ `qwen` |
| `Kimi (Moonshot)` | `kimi` | ✅ `moonshot` |

---

### ✅ 4. 搜索与键盘导航

**搜索功能：**
```typescript
private modelFilterQuery = '';

// 过滤逻辑
const filtered = providers.filter(({ provider, models }) => {
  const providerMatch = provider.providerID.toLowerCase().includes(query);
  const modelMatch = models.some(m => m.toLowerCase().includes(query));
  return providerMatch || modelMatch;
});
```

**键盘导航：**
- `↑/↓` - 在选项间移动
- `Enter` - 选择高亮项
- `Escape` - 关闭下拉
- `Home/End` - 跳到首/尾

---

### ✅ 5. Flexbox 滚动修复

**问题：**
flex 容器内的子元素使用 `overflow-y: auto` 时滚动条不显示。

**解决方案：**
```css
/* 使用 max-height 而非 flex: 1 */
.opencodian-model-dropdown-scroll {
  max-height: 260px;        /* 固定最大高度 */
  overflow-y: scroll !important;  /* 强制显示滚动条 */
}

/* 父容器 */
.opencodian-model-dropdown {
  display: flex;
  flex-direction: column;
  max-height: 320px;        /* 整体最大高度 */
  overflow: hidden;         /* 防止整体溢出 */
}
```

---

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/icons/ProviderIconService.ts` | 新增：图标映射与加载服务 |
| `src/features/chat/OpenCodianView.ts` | 重构：模型选择器 UI 实现 |
| `styles.css` | 新增：下拉组件、粘性头部、图标样式 |

---

### 🎨 视觉层次设计

```
提供商头部 (14px, bold, accent color)
  └── 模型选项 (12px, normal)
  └── 模型选项 (12px, normal)

颜色规范：
- 提供商名：var(--text-accent) - 强调色
- 模型名：var(--text-normal) - 正文色
- 选中项：var(--background-modifier-hover) - 悬停背景
- 图标：16x16px，flex-shrink: 0 防止压缩
```

---

### 🔧 已知问题

1. **重复 key 警告**
   - `spark` 和 `jamba` 在映射表中重复定义（非致命）
   - 不影响功能，可后续清理

2. **图标加载延迟**
   - CDN 图标首次加载有短暂延迟
   - 浏览器缓存后快速加载

---

**会话日期**: 2026-03-24
**开发时间**: ~3 小时
**主要贡献**: 自定义模型选择器、Lobehub 图标集成、粘性分组头部、搜索功能
**当前状态**: ✅ 模型选择器 UI 完整，支持 200+ 供应商图标

---


## 2026-03-24 权限系统完善与 UI 优化

### 📋 背景
OpenCode 的权限系统通过 `.opencode/opencode.json` 配置文件控制。本次开发将权限管理完全集成到插件中，实现从配置管理到权限请求处理的完整闭环。

---

### ✅ 1. OpenCode 配置管理器

**实现内容：**
- 创建 `OpencodeConfigManager` 类管理项目级配置
- 支持自动创建、读取、更新配置文件
- 三种权限模式：YOLO/Normal/Plan

```typescript
export class OpencodeConfigManager {
  async setYoloMode(): Promise<void> {
    await this.updatePermission('allow');
  }
  
  async setNormalMode(): Promise<void> {
    await this.updatePermission({ '*': 'ask' });
  }
  
  async setPlanMode(): Promise<void> {
    await this.updatePermission({
      '*': 'ask',
      edit: 'deny',
      write: 'deny',
      bash: 'deny',
    });
  }
}
```

**文件位置：**
- `src/core/config/OpencodeConfigManager.ts`

---

### ✅ 2. 跨平台工作目录支持

**问题：**
OpenCode 服务器需要在 vault 目录启动才能读取项目配置。

**解决方案：**
```typescript
// Windows 支持
if (process.platform === 'win32') {
  candidates.push('opencode.cmd', `${process.env.APPDATA}\\npm\\opencode.cmd`);
}

// macOS 支持
if (process.platform === 'darwin') {
  candidates.push('/opt/homebrew/bin/opencode', '/usr/local/bin/opencode');
}

// 启动时设置工作目录
this.process = spawn(opencodePath, ['serve', ...], {
  cwd: this.workingDirectory,  // Vault 路径
});
```

**调试输出：**
```
[ServerManager] Working directory set to: C:\Users\lt\Desktop\Write\testvault
[ServerManager] Starting OpenCode in directory: C:\Users\lt\Desktop\Write\testvault
```

---

### ✅ 3. 内联权限请求对话框

**设计改进：**
- 从全局弹窗改为消息流内嵌卡片
- 不阻塞用户操作其他界面
- 选择后自动消失，不占用空间

**实现代码：**
```typescript
private async showPermissionDialog(request: PermissionRequest): Promise<void> {
  // 在消息流中创建权限卡片
  const permissionCard = permissionContainer.createDiv({ 
    cls: 'opencodian-permission-inline' 
  });
  
  // 显示工具信息和按钮
  // ...
  
  // 用户选择后移除卡片
  const result = await new Promise<...>((resolve) => { ... });
  permissionCard.remove();  // 完全消失，不占用空间
}
```

**UI 样式：**
```css
.opencodian-permission-inline {
  background: var(--background-primary);
  border: 2px solid var(--interactive-accent);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
```

**文件位置：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 4. 输入栏权限模式切换

**实现内容：**
在输入框下方工具栏添加权限模式下拉框：

```
┌─────────────────────────────────────────────────────────┐
│  [🤖 模型选择器]              [🛡️ YOLO ▼]              │
└─────────────────────────────────────────────────────────┘
```

**代码实现：**
```typescript
private initializePermissionSelector(containerEl: HTMLElement): void {
  const trigger = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });
  
  // 根据当前模式显示不同颜色
  trigger.addClass(`mode-${mode}`);  // yolo=green, ask=blue, plan=red
  
  // 点击切换模式并自动重启服务
  trigger.addEventListener('click', async () => {
    await this.switchPermissionMode(newMode);
  });
}
```

**自动重启逻辑：**
```typescript
private async switchPermissionMode(mode: 'yolo' | 'normal' | 'plan'): Promise<void> {
  // 1. 更新配置
  this.plugin.settings.permissionMode = mode;
  await this.plugin.saveSettings();
  
  // 2. 重启 OpenCode 服务
  await this.plugin.openCodeService.stop();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await this.plugin.openCodeService.start();
}
```

**显示格式：**
- YOLO 模式：`🛡️ YOLO`（绿色）
- 询问模式：`🛡️ ASK`（蓝色）
- 计划模式：`🛡️ PLAN`（红色）

---

### ✅ 5. 中文翻译完善

**新增翻译键：**
```typescript
// 权限对话框
'permissionDialog.title': '权限请求',
'permissionDialog.description': 'AI 想要使用工具：',
'permissionDialog.toolDescription': '此工具的作用：',
'permissionDialog.allowOnce': '允许一次',
'permissionDialog.allowAlways': '始终允许',
'permissionDialog.reject': '拒绝',

// 工具描述
'permissionDialog.tools.websearch': '搜索网络获取最新信息',
'permissionDialog.tools.bash': '执行终端命令（谨慎使用）',
'permissionDialog.tools.read': '读取文件内容',
'permissionDialog.tools.edit': '编辑/修改文件内容',

// 设置按钮
'settings.security.configFile.editBtn': '编辑配置',
'settings.security.configFile.applyBtn': '应用并重启',
```

**文件位置：**
- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`

---

### ✅ 6. 计划模式检测修复

**问题：**
计划模式（有 `deny` 权限）被错误显示为询问模式。

**修复代码：**
```typescript
if (typeof permission === 'object' && permission?.['*'] === 'ask') {
  // 检查是否有 deny - 那是计划模式
  const hasDeny = Object.values(permission).some(v => v === 'deny');
  if (hasDeny) {
    statusText = t('settings.security.configStatus.plan');
    statusClass = 'opencodian-status-plan';
  } else {
    statusText = t('settings.security.configStatus.normal');
    statusClass = 'opencodian-status-normal';
  }
}
```

**状态显示：**
- ✅ YOLO 模式（自动批准全部）- 绿色
- ✅ 询问模式（提示批准）- 蓝色
- ✅ 计划模式（禁止修改）- 红色
- ✅ 自定义模式 - 灰色

---

### ✅ 7. 权限对话框超时修复

**问题：**
权限对话框显示时，流超时仍在计时，导致用户未响应就中断。

**修复：**
```typescript
// 显示对话框前暂停超时
if (timeoutId) {
  window.clearTimeout(timeoutId);
  timeoutId = null;
}

await this.showPermissionDialog(chunk);

// 用户响应后重新开始超时
if (this.isStreaming) {
  timeoutId = window.setTimeout(() => { ... }, STREAM_TIMEOUT_MS);
}
```

---

### 📁 修改文件列表

| 文件 | 修改内容 |
|------|----------|
| `src/core/config/OpencodeConfigManager.ts` | 新增配置管理器 |
| `src/core/opencode/ServerManager.ts` | 跨平台工作目录支持 |
| `src/core/opencode/OpenCodeService.ts` | 权限事件处理 |
| `src/features/chat/OpenCodianView.ts` | 内联权限对话框、输入栏权限切换 |
| `src/features/settings/OpenCodianSettings.ts` | 设置页面权限检测修复 |
| `src/i18n/locales/zh.ts` | 中文翻译 |
| `src/i18n/locales/en.ts` | 英文翻译 |
| `styles.css` | 权限卡片样式、权限选择器样式 |

---

### 🎯 当前状态

**权限系统功能完整：**
- ✅ 三种权限模式（YOLO/ASK/PLAN）
- ✅ 配置文件自动管理
- ✅ 内联权限请求对话框
- ✅ 输入栏快速切换权限模式
- ✅ 切换后自动重启服务
- ✅ 中英文双语支持

**待优化：**
- 设置页面 `display()` 改为 async 后需验证 Obsidian 兼容性

---

**会话日期**: 2026-03-24
**开发时间**: ~4 小时
**主要贡献**: 权限系统完整集成、跨平台支持、内联权限对话框、中文汉化
**当前状态**: 权限系统功能完整，可正常使用

---

---

## 2026-03-24 消息复制按钮功能

### 📋 功能描述
为聊天消息添加复制按钮，方便用户快速复制消息内容。

### ✅ 实现细节

#### 1. 用户消息复制按钮
- **位置**：气泡外左下角，与气泡底部对齐
- **触发方式**：鼠标悬浮在消息区域（包括气泡周围 28px 热区）
- **交互**：
  - 默认隐藏，悬浮显示
  - 点击后显示 "copied!" 反馈
  - 1.5 秒后恢复图标

#### 2. 助手消息复制按钮
- **位置**：时间戳旁边（同一行）
- **触发方式**：鼠标悬浮在整个助手消息区域
- **功能**：收集所有 text blocks 内容，点击后复制完整内容

#### 3. DOM 结构调整
```typescript
// 助手消息时间戳行结构
.opencodian-message-time-row
├── .opencodian-message-time-text  // 时间文本
└── .opencodian-copy-btn-inline     // 复制按钮
```

#### 4. 样式规格
| 属性 | 值 |
|------|-----|
| 图标大小 | 18x18px |
| 默认透明度 | 0（隐藏） |
| 悬浮透明度 | 1（显示） |
| 过渡动画 | 0.15s ease |
| 反馈文字颜色 | var(--text-accent) |

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 新增 `addTextCopyButton` 方法、新增 `addTimestampWithCopyButton` 方法、修改消息渲染逻辑 |
| `styles.css` | 新增 `.opencodian-copy-btn`、`.opencodian-copy-btn--user`、`.opencodian-copy-btn-inline`、`.opencodian-message-time-row` 等样式 |

### 🐛 修复的问题

1. **变量名错误**：`OpenCodianView.COPY_ICON` → `COPY_ICON`
2. **未定义变量**：`content` → `contentEl` in `createAssistantMessageElement`
3. **时间戳位置错误**：流式消息时间戳在内容之前 → 改为流结束后添加到末尾
4. **助手消息定位问题**：添加 `position: relative` 确保按钮正确相对定位
5. **用户时间戳丢失**：恢复用户消息的时间戳显示

### 🎯 当前状态

**复制按钮功能完整：**
- ✅ 用户消息：气泡外左下角复制按钮
- ✅ 助手消息：时间戳旁内联复制按钮
- ✅ 悬浮热区：消息周围 28px 范围可触发
- ✅ 点击反馈：显示 "copied!" 1.5 秒
- ✅ 大小一致：统一 18x18px 图标

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: 消息复制按钮完整功能
**当前状态**: 功能完整，已部署测试
