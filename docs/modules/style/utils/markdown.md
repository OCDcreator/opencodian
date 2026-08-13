# Markdown Styles

> **源码**: `src/style/utils/markdown.css`
> **状态**: [FINAL]

## 职责

统一聊天正文与流式文本的 Markdown 渲染样式，覆盖代码块、行内代码、表格、标题、列表、引用、链接与渲染错误态。

## 关键类名 / CSS 变量

- `:is(.opencodian-message-text, .streaming-text-block).markdown-rendered`：Markdown 根作用域。
- `.markdown-code-wrapper`、`.markdown-code-lang-label`：参考 Tailwind Typography 的独立 `pre` 面板，代码块使用自身的中性背景、1px 边界与语言标签；内部 `pre code` 显式清空行内 code 的 border/shadow，避免留下与内容同宽的淡线。
- `:is(.opencodian-message-text, .streaming-text-block) code`：参考 shadcn 的紧凑行内 token（中性背景、4px 圆角、`0.3em` 横向 padding、600 monospace），不使用描边或装饰性阴影；与代码块保持不同层级。
- 行内公式选择器覆盖 `.math-inline`、行内 KaTeX 与 `mjx-container:not([display="true"])`；块级公式覆盖 `.math-block`、`.katex-display` 和 `mjx-container[display="true"]`。它们按数学排版内容处理，不套 code token；块级公式显式清除 border、border-bottom 和 shadow，避免主题样式留下公式同宽的底线。
- `.markdown-file-link`：文件链接样式（与 Obsidian 内链交互配合）。
- `.markdown-embedded-image`：图片嵌入区；`.has-intrinsic-placeholder` 在无显式尺寸的懒加载图片上提供 16:9 稳定占位，避免 late layout shift。
- `.markdown-render-error`：渲染失败提示。

## 关联 TS 组件

- `src/utils/markdown/MarkdownRenderer.ts`
- `src/utils/markdown/fileLink.ts`
- `src/features/chat/OpenCodianView.ts`（消息与流式渲染容器）

## 修改注意点

- 该文件同时服务普通消息和 streaming 内容，选择器里常见 `:is(...)` 组合，改动要双路径验证。
- 表格、行内代码与代码块各自使用 `color-mix` token 和换行保护；不要让 `pre code` 继承行内 code 的边界或阴影。
- 公式规则必须继续只作用于消息/流式 Markdown 根作用域，保留宿主的 MathJax/KaTeX 排版与无框语义。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
