# Markdown Styles

> **源码**: `src/style/utils/markdown.css`
> **状态**: [FINAL]

## 职责

统一聊天正文与流式文本的 Markdown 渲染样式，覆盖代码块、行内代码、表格、标题、列表、引用、链接与渲染错误态。

## 关键类名 / CSS 变量

- `:is(.opencodian-message-text, .streaming-text-block).markdown-rendered`：Markdown 根作用域。
- `.markdown-code-wrapper`、`.markdown-code-lang-label`：代码块容器与语言标签。
- `.markdown-file-link`：文件链接样式（与 Obsidian 内链交互配合）。
- `.markdown-embedded-image`：图片嵌入区。
- `.markdown-render-error`：渲染失败提示。

## 关联 TS 组件

- `src/utils/markdown/MarkdownRenderer.ts`
- `src/utils/markdown/fileLink.ts`
- `src/features/chat/OpenCodianView.ts`（消息与流式渲染容器）

## 修改注意点

- 该文件同时服务普通消息和 streaming 内容，选择器里常见 `:is(...)` 组合，改动要双路径验证。
- 表格与行内代码使用了 `color-mix` 和换行保护，删除会明显降低长文本可读性。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
