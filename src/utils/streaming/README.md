# 通用流式消息渲染模块

基于 Claudian 的实现，提取出的通用 Obsidian 流式消息渲染方案。

## 特性

- **实时流式显示**: 逐字符显示消息内容
- **思考过程展示**: 带计时器的可折叠思考块
- **工具调用可视化**: 工具执行状态、结果展示
- **状态持久化**: 支持保存和恢复消息内容
- **类型安全**: 完整 TypeScript 类型定义

## 快速开始

### 基础用法

```typescript
import { StreamController } from '@/utils/streaming';
import { MarkdownRenderService } from '@/utils/markdown';

class ChatView {
  private streamController: StreamController;
  private markdownService: MarkdownRenderService;

  constructor(app: App, component: Component, containerEl: HTMLElement) {
    // 1. 初始化 Markdown 渲染服务
    this.markdownService = new MarkdownRenderService({
      app,
      component,
      container: containerEl,
    });

    // 2. 初始化流式控制器
    this.streamController = new StreamController(
      {
        containerEl,
        markdownService: this.markdownService,
        scrollToBottom: () => this.scrollToBottom(),
        onStreamComplete: (blocks) => this.saveContentBlocks(blocks),
      },
      // 工具渲染选项（可选）
      {
        iconMap: {
          read: 'file-text',
          write: 'file-plus',
          bash: 'terminal',
        },
      },
      // 思考块渲染选项（可选）
      {
        collapsedByDefault: true,
        showTimer: true,
      }
    );

    // 3. 设置事件回调
    this.streamController.setCallbacks({
      onThinkingStart: () => console.log('Thinking started'),
      onThinkingEnd: (duration) => console.log(`Thought for ${duration}s`),
      onToolCallStart: (tool) => console.log(`Tool started: ${tool.name}`),
      onDone: () => console.log('Stream complete'),
    });
  }

  async sendMessage(userMessage: string) {
    const contentEl = this.messagesEl.createDiv({ cls: 'message assistant' });

    // 开始流式渲染
    this.streamController.startStream(contentEl);

    // 模拟流式数据（实际使用时从 API 获取）
    const chunks = await this.fetchStreamChunks(userMessage);
    for (const chunk of chunks) {
      await this.streamController.handleChunk(chunk);
    }
  }

  private scrollToBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
```

### 流式数据类型

```typescript
import type { StreamChunk } from '@/utils/streaming';

// 思考内容
const thinkingChunk: StreamChunk = {
  type: 'thinking',
  content: 'Let me analyze this...',
};

// 文本内容
const textChunk: StreamChunk = {
  type: 'text',
  content: 'Hello, ',
};

// 工具调用
const toolUseChunk: StreamChunk = {
  type: 'tool_use',
  id: 'tool-123',
  name: 'read',
  input: { file_path: '/path/to/file.md' },
};

// 工具结果
const toolResultChunk: StreamChunk = {
  type: 'tool_result',
  id: 'tool-123',
  content: 'File contents...',
  isError: false,
};

// 错误
const errorChunk: StreamChunk = {
  type: 'error',
  content: 'Something went wrong',
};

// 完成
const doneChunk: StreamChunk = {
  type: 'done',
};
```

## API

### StreamController

核心流式控制器，管理整个渲染生命周期。

#### 构造函数

```typescript
new StreamController(
  options: StreamControllerOptions,
  toolRendererOptions?: Partial<ToolRendererOptions>,
  thinkingRendererOptions?: Partial<ThinkingRendererOptions>
)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `containerEl` | `HTMLElement` | 消息容器元素 |
| `markdownService` | `MarkdownRenderService` | Markdown 渲染服务 |
| `scrollToBottom?` | `() => void` | 滚动到底部回调 |
| `onStreamComplete?` | `(blocks: ContentBlock[]) => void` | 流完成回调 |
| `onToolCallClick?` | `(tool: ToolCallInfo) => void` | 工具点击回调 |

#### 方法

| 方法 | 说明 |
|------|------|
| `startStream(contentEl)` | 开始新的流式渲染 |
| `handleChunk(chunk)` | 处理流式数据块 |
| `cancelStream()` | 取消当前流 |
| `isStreaming()` | 是否正在流式渲染 |
| `getContentBlocks()` | 获取已渲染的内容块 |
| `renderStoredContentBlocks(parentEl, blocks)` | 渲染已保存的内容块 |
| `setCallbacks(callbacks)` | 设置事件回调 |

### ThinkingBlockRenderer

思考块渲染器，支持计时器和折叠。

```typescript
const renderer = new ThinkingBlockRenderer(markdownService, {
  collapsedByDefault: true, // 默认折叠
  showTimer: true,          // 显示计时器
  collapsedLabel: 'Thinking...',
  expandedLabel: 'Thinking',
});

// 创建思考块
const state = renderer.create(parentEl);

// 追加内容
await renderer.appendContent(state, 'analyzing...');

// 完成（停止计时器，折叠）
const duration = renderer.finalize(state);

// 渲染已保存的思考块
renderer.renderStored(parentEl, content, duration);
```

### ToolCallRenderer

工具调用渲染器，支持状态更新和结果展示。

```typescript
const renderer = new ToolCallRenderer({
  iconMap: {
    read: 'file-text',
    write: 'file-plus',
    bash: 'terminal',
  },
  getToolName: (name, input) => {
    if (name === 'todo_write') {
      const todos = input.todos as any[];
      return `Tasks ${todos?.filter(t => t.status === 'completed').length}/${todos?.length}`;
    }
    return name;
  },
  getToolSummary: (name, input) => {
    if (name === 'read') return input.file_path;
    return '';
  },
  renderExpandedContent: (container, toolName, result) => {
    // 自定义结果渲染
  },
});

// 渲染工具调用
const toolEl = renderer.render(parentEl, toolCall);

// 更新状态
renderer.updateStatus(toolEl, 'completed');

// 更新结果
renderer.updateResult(toolEl, toolCall);
```

## 内容持久化

```typescript
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  contentBlocks: ContentBlock[];
  createdAt: number;
}

// 保存消息
const blocks = streamController.getContentBlocks();
const message: StoredMessage = {
  id: generateId(),
  role: 'assistant',
  contentBlocks: blocks,
  createdAt: Date.now(),
};
await saveMessage(message);

// 恢复消息
const saved = await loadMessage(messageId);
streamController.renderStoredContentBlocks(containerEl, saved.contentBlocks);
```

## CSS 样式

需要添加基础样式（参考）：

```css
/* 思考块 */
.streaming-thinking-block {
  margin: 0.5em 0;
  border-left: 3px solid var(--interactive-accent);
  background: var(--background-secondary);
  border-radius: 0 4px 4px 0;
}

.streaming-thinking-header {
  display: flex;
  align-items: center;
  padding: 0.5em 1em;
  cursor: pointer;
  user-select: none;
}

.streaming-thinking-label {
  font-size: 0.9em;
  color: var(--text-muted);
}

.streaming-thinking-content {
  padding: 0 1em 1em;
  font-size: 0.95em;
}

.streaming-thinking-block.is-expanded .streaming-thinking-label {
  color: var(--text-normal);
}

/* 文本块 */
.streaming-text-block {
  margin: 0.5em 0;
  line-height: 1.6;
}

/* 工具调用 */
.streaming-tool-call {
  margin: 0.5em 0;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  overflow: hidden;
}

.streaming-tool-header {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.5em 0.75em;
  background: var(--background-secondary);
  cursor: pointer;
}

.streaming-tool-icon {
  color: var(--text-muted);
}

.streaming-tool-name {
  font-weight: 500;
}

.streaming-tool-summary {
  color: var(--text-muted);
  font-size: 0.9em;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.streaming-tool-status {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.streaming-tool-status.status-running {
  color: var(--text-accent);
  animation: pulse 1.5s infinite;
}

.streaming-tool-status.status-completed {
  color: var(--text-success);
}

.streaming-tool-status.status-error {
  color: var(--text-error);
}

.streaming-tool-content {
  padding: 0.75em;
  border-top: 1px solid var(--background-modifier-border);
  max-height: 300px;
  overflow-y: auto;
}

.streaming-tool-lines {
  font-family: var(--font-monospace);
  font-size: 0.85em;
  line-height: 1.4;
}

.streaming-tool-line {
  padding: 0.1em 0;
}

.streaming-tool-truncated {
  color: var(--text-muted);
  font-style: italic;
  margin-top: 0.5em;
}

.streaming-tool-empty {
  color: var(--text-muted);
  font-style: italic;
}

/* 错误块 */
.streaming-error-block {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.75em;
  background: var(--background-modifier-error);
  border-radius: 4px;
  color: var(--text-error);
}

/* 动画 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

## 文件结构

```
src/utils/streaming/
├── index.ts                  # 导出入口
├── types.ts                  # 类型定义
├── StreamController.ts       # 核心流式控制器
├── ThinkingBlockRenderer.ts  # 思考块渲染器
├── ToolCallRenderer.ts       # 工具调用渲染器
└── README.md                 # 使用文档
```

## 与 Markdown 模块配合

流式模块依赖 Markdown 模块进行内容渲染：

```typescript
import { MarkdownRenderService } from '@/utils/markdown';
import { StreamController } from '@/utils/streaming';

const markdownService = new MarkdownRenderService({
  app,
  component,
  container: containerEl,
});

const streamController = new StreamController({
  containerEl,
  markdownService,
});
```

## 注意事项

1. **生命周期管理**: `startStream` 必须在 `handleChunk` 之前调用
2. **错误处理**: 错误块会自动添加到内容中
3. **取消流**: 使用 `cancelStream()` 清理状态
4. **性能**: 大量文本时，Markdown 渲染可能需要节流
