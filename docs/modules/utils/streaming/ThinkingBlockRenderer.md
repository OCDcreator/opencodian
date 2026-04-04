# Thinking Block Renderer

> **源码**: `src/utils/streaming/ThinkingBlockRenderer.ts`
> **状态**: [REVIEW]

## 概述

渲染 AI 扩展思考（extended thinking）块。创建可折叠的思考区域，支持实时内容追加、计时器显示和持续时间格式化。提供两种模式：流式创建（实时追加）和存储恢复（从持久化数据重建）。

## 导入关系
上游: `../markdown` (MarkdownRenderService), `./types` (ThinkingBlockState, ThinkingRendererOptions)
下游: `StreamController` (持有并调用)

## 核心类型 / 接口

### ThinkingRendererOptions
```typescript
{
  collapsedByDefault?: boolean;  // 默认 true
  showTimer?: boolean;           // 默认 true
  collapsedLabel?: string;       // 默认 'Thinking...'
  expandedLabel?: string;        // 默认 'Thought'
}
```

### ThinkingBlockState（来自 types.ts）
```typescript
{
  wrapperEl: HTMLElement;
  contentEl: HTMLElement;
  labelEl: HTMLElement;
  content: string;
  partId: string | null;
  resolvedDurationSeconds: number | null;
  startTime: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  isExpanded: boolean;
}
```

## 核心逻辑

### 流式创建流程

`create(parentEl)` → 创建 DOM 结构：
1. `.streaming-thinking-block` 包装 div
2. `.streaming-thinking-header`（可点击，tabindex=0, role=button, aria-expanded=false）
3. `.streaming-thinking-label` 标签 span（显示 "Thinking..." 或计时）
4. `.streaming-thinking-content` 内容 div（默认隐藏）
5. 1 秒间隔的计时器更新标签文字

### 内容追加

`appendContent(state, content)` → 累积文本 → `markdownService.render()` 重新渲染

### 最终化

`finalize(state)` →
1. 清除计时器 interval
2. 使用 `resolvedDurationSeconds`（如果已设置）或计算经过时间
3. 格式化标签（"Thought for 5s" 或 "Thought (<1s)"）
4. 如果 `collapsedByDefault` 且当前展开 → 折叠

### 持续时间格式化

`formatDurationSeconds()` 规则：
- ≤0: "Thought (<1s)"
- <10s: 保留一位小数（"Thought for 3.2s"）
- ≥10s: 四舍五入（"Thought for 12s"）

### 存储恢复

`renderStored(parentEl, content, durationSeconds?)` → 创建相同的 DOM 结构，直接设置格式化后的标签文字。

## 关键方法

| 方法 | 说明 |
|------|------|
| `create(parentEl)` | 创建流式思考块，返回 `ThinkingBlockState` |
| `appendContent(state, content)` | 追加思考内容 |
| `finalize(state)` | 最终化，返回持续时间秒数 |
| `cleanup(state)` | 清理计时器 |
| `updateDuration(state, durationSeconds)` | 设置服务端提供的持续时间 |
| `updateStoredDuration(wrapperEl, durationSeconds)` | 更新已持久化块的标签 |
| `renderStored(parentEl, content, durationSeconds?)` | 从持久化数据重建，返回 wrapper `HTMLElement` |

## 数据流

```
流式模式:
  create(parentEl) → ThinkingBlockState
  appendContent(state, chunk1) → markdown render
  appendContent(state, chunk2) → markdown render
  finalize(state) → durationSeconds → label 更新

持久化恢复:
  renderStored(parentEl, savedContent, savedDuration)
    → 创建 DOM → 设置标签 → markdown render content
```

## 与其他模块的交互

- **StreamController**: 持有 `ThinkingBlockRenderer` 实例，调用所有核心方法
- **MarkdownRenderService**: 通过构造函数注入，用于渲染思考内容的 markdown

## 配置项

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `collapsedByDefault` | true | 创建时默认折叠 |
| `showTimer` | true | 显示实时计时器 |
| `collapsedLabel` | `'Thinking...'` | 折叠状态标签 |
| `expandedLabel` | `'Thought'` | 展开状态标签 |

## 注意事项

- 计时器通过 `setInterval` 实现，在 `finalize()` 或 `cleanup()` 时必须清除
- `appendContent()` 每次调用都完整重新渲染 markdown
- 折叠/展开通过 `display: none/block` 切换，不使用 CSS animation
- 键盘支持：Enter 和 Space 键切换展开/折叠


