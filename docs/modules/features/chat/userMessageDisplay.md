# userMessageDisplay

> **源码**: `src/features/chat/userMessageDisplay.ts`
> **状态**: [REVIEW]

## 概述

这个模块负责用户消息的展示前处理：一部分把 HTML 片段改写成“适合展示的 Markdown 文本”，另一部分把 OpenCode native `agent` part 的 source span 与用户原文里真实命中过的 skill token 投影成可包裹的文本高亮范围。它不是通用 sanitizer，也不负责最终 DOM 结构；这些 helper 专门服务于 `UserMessageContentRenderer`。

## 导出

```typescript
prepareUserMessageMarkdownForDisplay(markdown: string): string
extractUserMessageTextHighlightSpans(visibleText: string, parts: unknown): UserMessageTextHighlightSpan[]
applyUserMessageTextHighlightSpans(container: HTMLElement, visibleText: string, spans: readonly UserMessageTextHighlightSpan[]): boolean
```

## 转换顺序

`prepareUserMessageMarkdownForDisplay()` 的处理顺序是固定的：

1. 如果输入为空，直接返回
2. 用 `replaceOutsideMarkdownCode()` 保护已有的行内代码和 fenced code block
3. 把 `<style>...</style>` 转成 `css` fenced code block
4. 把 `<script>...</script>` 转成 `javascript` fenced code block
5. 把整段 HTML 块转成 `html` fenced code block
6. 对剩余 HTML 标签做 `<` / `>` 转义

## 关键实现点

### 代码区保护

`replaceOutsideMarkdownCode()` 会先找出：

- 三反引号 fenced code block
- `~~~` fenced code block
- 行内反引号代码

只有代码区外的文本会继续做 HTML 相关替换。

### HTML 块识别

`HTML_BLOCK_REGEX` 支持这些结构：

- 成对标签
- 自闭合标签
- `<!DOCTYPE ...>`
- 注释
- CDATA
- 处理指令

但会排除 `style` 和 `script`，因为它们前面已经单独处理。

### 标签转义

最后一步的 `escapeHtmlTags()` 只对剩余标签 token 转义，所以最终 Markdown 里保留的是“按代码/文本显示的 HTML”，而不是可被浏览器继续解释的标签。

## 模块关系

- 无上游依赖
- 下游消费者：`UserMessageContentRenderer`
- 这些 helper 是发送后用户气泡里的 inline invocation highlight 基础设施；它们与 HTML/markup code-block 预处理解耦，最终是否包裹 span 取决于渲染后 `textContent` 能否与原始 visible text 对齐

## 注意事项

- 实际启用开关是 `OpenCodianView` 读取的 `plugin.settings.renderUserMarkupAsCodeBlocks`，不是模块内部配置。
- `buildCodeFence()` 会去掉被包裹内容首尾多余空行，再生成带语言标识的 fenced block。
- slash 高亮不会盲目匹配任意 `/xxx`。它会先从 `message.parts` 里的 synthetic `text` parts 读取 `metadata.kind === 'skill-expansion'` 与 `metadata.skillName`，只把这些真实 expanded skill 对应的 `/skill` 或 `/skills skill-name` token 包成 skill highlight；`//comment` 或不存在的 `/not-a-skill` 都不会着色。
- agent span 提取只信任 `part.type === 'agent'` 且 `source.value/start/end` 与当前 visible text 完全匹配的范围；过期、越界、重叠范围会被忽略，并与 slash spans 一起做统一去重。
- span DOM 包裹会先检查渲染容器的 `textContent` 是否仍等于原始 visible text，避免 markdown 输出改变文本后把高亮包到错误位置。
