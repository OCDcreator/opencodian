# Markdown 渲染器

> **源码**: `src/utils/markdown/MarkdownRenderer.ts`
> **状态**: [DRAFT]

## 概述

自定义 Markdown 渲染管道，用于将 AI 聊天消息渲染为 HTML。封装 Obsidian 的 `MarkdownRenderer.renderMarkdown()`，添加图片嵌入预处理、代码块增强（语言标签 + 复制按钮）、表格 URL 截断和文件链接后处理。提供 `MarkdownRenderService` 类和 `renderMarkdown()` 便捷函数。

## 导入关系
上游: `obsidian` (MarkdownRenderer), `./fileLink` (processFileLinks, registerFileLinkHandler), `./imageEmbed` (replaceImageEmbedsWithHtml), `./types`
下游: `StreamController`, `OpenCodianView`, `ThinkingBlockRenderer`, `./index`

## 核心类型 / 接口

### MarkdownRenderService（类）

构造参数：`MarkdownRendererOptions`（app, component, container, mediaFolder?, onFileLinkClick?）

### renderMarkdown（便捷函数）
```typescript
async function renderMarkdown(el, markdown, options): Promise<RenderResult>
```

## 核心逻辑

### 渲染管道（3 阶段）

**阶段 1: 预处理**（`render()` 方法内）
1. `el.empty()` — 清空目标容器
2. `replaceImageEmbedsWithHtml(markdown, options)` — 将 `![[image.png]]` 转换为 HTML `<img>` 标签

**阶段 2: Obsidian 渲染**
3. `ObsidianMarkdownRenderer.renderMarkdown(processedMarkdown, el, '', component)` — 委托给 Obsidian 原生渲染

**阶段 3: 后处理**
4. `enhanceTableLinks(el)` — 截断表格中超长 URL（>80 字符）
5. `enhanceCodeBlocks(el)` — 包装 `<pre>` 块，添加语言标签和复制按钮
6. `processFileLinks(app, el)` — 处理 Obsidian 未处理的 `[[wiki-links]]`

### 代码块增强

`enhanceCodeBlocks()` 对每个 `<pre>` 元素：
- 创建 `markdown-code-wrapper` 容器
- 检测 `language-xxx` class 提取语言名
- 添加语言标签（点击可复制代码）
- 移除 Obsidian 自带的 `.copy-code-button`

### 表格 URL 截断

`enhanceTableLinks()` 对表格中的 `<a>` 元素：
- 仅处理文本与 href 完全相同的裸链接
- 超过 80 字符时截断为 `前36字符...后18字符`
- 保留完整 href 和 title 属性

## 关键方法

| 方法 | 说明 |
|------|------|
| `MarkdownRenderService.render(el, markdown)` | 核心渲染方法，返回 `RenderResult` |
| `MarkdownRenderService.setCodeBlockOptions(options)` | 配置代码块增强选项 |
| `MarkdownRenderService.setMediaFolder(folder)` | 设置媒体文件目录 |
| `renderMarkdown(el, markdown, options)` | 便捷函数，一次性创建 Service 并渲染 |
| `enhanceCodeBlocks(container)` | 代码块增强（private） |
| `enhanceTableLinks(container)` | 表格 URL 截断（private） |

## 数据流

```
调用方 → renderMarkdown(el, markdown, options)
  → new MarkdownRenderService(options)
    → registerFileLinkHandler()  // 注册一次点击委托
  → service.render(el, markdown)
    → replaceImageEmbedsWithHtml(markdown)  // ![[img]] → <img>
    → ObsidianMarkdownRenderer.renderMarkdown()
    → enhanceTableLinks(el)                  // 截断长 URL
    → enhanceCodeBlocks(el)                  // 包装 + 标签 + 复制
    → processFileLinks(app, el)              // 处理 wikilinks
  → { success: true } | { success: false, error }
```

## 与其他模块的交互

- **StreamController**: 持有 `MarkdownRenderService` 实例，用于流式文本渲染
- **ThinkingBlockRenderer**: 使用 `MarkdownRenderService.render()` 渲染思考内容
- **OpenCodianView**: 创建 `MarkdownRenderService` 实例并传入聊天容器
- **fileLink.ts**: `processFileLinks()` 后处理 wikilinks, `registerFileLinkHandler()` 注册点击处理
- **imageEmbed.ts**: `replaceImageEmbedsWithHtml()` 预处理图片嵌入

## 配置项

### CodeBlockOptions（默认值）
```typescript
{
  addLanguageLabel: true,
  addCopyButton: true,
  wrapperClass: 'markdown-code-wrapper',
  languageLabelClass: 'markdown-code-lang-label',
}
```

### 常量
| 常量 | 值 | 说明 |
|------|-----|------|
| `TABLE_URL_TRUNCATION_THRESHOLD` | 80 | URL 截断阈值（字符） |
| `TABLE_URL_TRUNCATION_HEAD_LENGTH` | 36 | 截断后保留的前缀长度 |
| `TABLE_URL_TRUNCATION_TAIL_LENGTH` | 18 | 截断后保留的后缀长度 |

## 注意事项

- 每次调用 `renderMarkdown()` 便捷函数会创建新的 Service 实例，不适合高频调用
- 流式渲染场景应复用 `MarkdownRenderService` 实例
- `render()` 会 `el.empty()` 清空目标元素
- Obsidian 渲染后可能产生 `.copy-code-button`，被增强逻辑移除

## 待补充
- [ ] Mermaid 图表渲染支持
- [ ] LaTeX 数学公式渲染支持
- [ ] 代码块语法高亮主题配置
