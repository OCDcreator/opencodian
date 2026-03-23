# OpenCodian 开发日志

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

### 🐛 已知问题

#### 问题：流结束后无法发送新消息
**现象：**
- 第一条消息流式输出正常
- 回复完成后，点击发送按钮无反应
- 控制台无错误日志

**可能原因排查：**
1. ✅ `isStreaming` 状态未重置 - 已确认 `finally` 块正确执行
2. ✅ SSE 连接未关闭 - 已实现 `reader.cancel()` 中断
3. ✅ `session.idle` 事件处理 - 已添加检测并 break
4. ❓ 可能需要检测 `message_stop` 事件而非 `session.idle`
5. ❓ 可能存在未捕获的异常阻塞了流程

**调试日志显示：**
```
[OpenCodeService] SSE event: session.idle  <- 已检测到
[OpenCodeService] SSE raw chunk: ...        <- 但仍在接收数据
```

**待验证：**
- `session.idle` 后是否还有其他重要事件？
- `reader.cancel()` 是否真正中断了连接？
- `isStreaming` 是否在 UI 线程正确重置？

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 实现 SSE 连接、数据解析、事件处理 |
| `src/core/opencode/ServerManager.ts` | 添加 CORS 配置参数 |
| `src/features/chat/OpenCodianView.ts` | 添加异常处理，确保流结束 |

### 📝 下一步计划

1. **验证连接中断**
   - 添加更多日志追踪 `finally` 块执行
   - 确认 `reader.releaseLock()` 调用

2. **备选方案**
   - 如果 SSE 中断复杂，考虑使用超时机制强制重置状态
   - 添加 "重置连接" 按钮作为临时解决方案

3. **完善功能**
   - 移除调试日志（大量 SSE 日志影响性能）
   - 添加连接状态指示器
   - 实现取消按钮（中断当前流）

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
- **SSE 流结束后无法发送新消息（开发中）**

---

## 🎯 下一步建议

1. **修复 SSE 流状态问题** - 确保流结束后 `isStreaming` 正确重置
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
3. **错误重试机制** - 网络错误时自动重试
4. **消息编辑/删除** - 添加消息管理功能
5. **文件附件** - 支持上传文件到对话
6. **代码块高亮** - 优化消息中代码的显示

---

**会话日期**: 2026-03-23  
**开发时长**: ~3 小时  
**主要贡献**: SSE 流式响应架构实现、CORS 配置、事件解析

**当前状态**: 🔧 SSE 流式传输开发中，存在连接结束后状态未重置问题
