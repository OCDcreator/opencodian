# Image Embed 处理器

> **源码**: `src/utils/markdown/imageEmbed.ts`
> **状态**: [REVIEW]

## 概述

在 Obsidian Markdown 渲染之前预处理图片嵌入语法。将 `![[image.png]]` 和 `![[image.png|alt]]` 转换为 HTML `<img>` 标签，使 Obsidian 渲染器能正确显示聊天消息中的图片。非图片嵌入（如 `![[note.md]]`）保持不变。

## 导入关系
上游: `obsidian` (App, TFile), `./types` (ImageEmbedOptions)
下游: `MarkdownRenderer.ts` (预处理阶段)

## 核心类型 / 接口

### ReplaceImageEmbedsOptions
扩展 `ImageEmbedOptions`，增加 `wrapperClass`（默认 `'markdown-embedded-image'`）和 `fallbackClass`（默认 `'markdown-embedded-image-fallback'`）。

## 核心逻辑

### 图片路径检测

`isImagePath()` 检查文件扩展名是否在支持列表中：`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp`, `ico`。

### 图片文件解析

`resolveImageFile()` 三级查找策略：
1. 直接路径 `app.vault.getFileByPath(imagePath)`
2. 媒体目录 `mediaFolder/imagePath`
3. Obsidian 链接解析 `metadataCache.getFirstLinkpathDest()`

### 尺寸语法支持

`buildStyleAttribute()` 解析 alt 文本中的尺寸语法：
- `![[image.png|300]]` → `width: 300px`
- `![[image.png|300x200]]` → `width: 300px; height: 200px`

### 替换流程

`replaceImageEmbedsWithHtml()` 使用正则 `!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]` 全局匹配：
1. 跳过非图片文件
2. 解析图片文件
3. 文件存在 → `<span class="wrapper"><img src="..." alt="..." loading="lazy"></span>`
4. 文件不存在 → `<span class="fallback">![[image.png]]</span>`

## 关键方法

| 方法 | 说明 |
|------|------|
| `replaceImageEmbedsWithHtml(markdown, options)` | 预处理：将图片嵌入语法替换为 HTML |

## 数据流

```
MarkdownRenderService.render()
  → replaceImageEmbedsWithHtml(markdown, { app, mediaFolder })
    → 正则匹配 ![[image.png|300x200]]
    → isImagePath("image.png") → true
    → resolveImageFile(app, "image.png", mediaFolder) → TFile
    → createImageHtml(app, file, "300x200", "markdown-embedded-image")
      → app.vault.getResourcePath(file) → resource URL
      → buildStyleAttribute("300x200") → ' style="width: 300px; height: 200px;"'
      → '<span class="..."><img src="..." alt="..." loading="lazy" style="..."></span>'
    → 返回处理后的 markdown
  → ObsidianMarkdownRenderer.renderMarkdown(processedMarkdown, ...)
```

## 与其他模块的交互

- **MarkdownRenderer.ts**: 在 Obsidian 渲染之前调用此函数

## 配置项

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `wrapperClass` | `'markdown-embedded-image'` | 图片容器 CSS class |
| `fallbackClass` | `'markdown-embedded-image-fallback'` | 解析失败时的 CSS class |
| `mediaFolder` | `undefined` | 媒体文件搜索目录 |

## 注意事项

- 必须在 `ObsidianMarkdownRenderer.renderMarkdown()` **之前**调用
- HTML 属性值通过 `escapeHtml()` 转义防止 XSS
- `<img>` 标签设置 `loading="lazy"` 延迟加载
- 非 Obsidian vault 内的图片路径无法解析


