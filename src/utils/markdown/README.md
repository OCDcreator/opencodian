# 通用 Markdown 渲染模块

基于 Claudian 的实现，提取出的通用 Obsidian Markdown 渲染方案。

## 特性

- **完整 Markdown 支持**: 使用 Obsidian 原生 `MarkdownRenderer` API
- **图片嵌入**: 支持 `![[image.png]]` 语法，自动解析为 HTML img 标签
- **文件链接**: 支持 `[[note]]` wikilink，可点击打开文件
- **代码块增强**: 语言标签 + 复制按钮
- **类型安全**: 完整 TypeScript 类型定义

## 快速开始

### 基础用法

```typescript
import { MarkdownRenderService } from '@/utils/markdown';
import type { App, Component } from 'obsidian';

class MyPluginView {
  private markdownService: MarkdownRenderService;

  constructor(app: App, component: Component, containerEl: HTMLElement) {
    this.markdownService = new MarkdownRenderService({
      app,
      component,
      container: containerEl,
    });
  }

  async renderMessage(contentEl: HTMLElement, markdown: string) {
    await this.markdownService.render(contentEl, markdown);
  }
}
```

### 一次性渲染

```typescript
import { renderMarkdown } from '@/utils/markdown';

const result = await renderMarkdown(contentEl, markdown, {
  app: this.app,
  component: this.component,
  container: this.containerEl,
});

if (!result.success) {
  console.error('Render failed:', result.error);
}
```

### 自定义配置

```typescript
const service = new MarkdownRenderService({
  app,
  component,
  container: containerEl,
  mediaFolder: 'attachments', // 图片查找路径
  onFileLinkClick: (linkTarget, event) => {
    // 自定义链接点击行为
    console.log('Clicked:', linkTarget);
    app.workspace.openLinkText(linkTarget, '', event.ctrlKey ? 'tab' : false);
  },
});

// 配置代码块选项
service.setCodeBlockOptions({
  addLanguageLabel: true,
  addCopyButton: true,
  wrapperClass: 'my-code-wrapper',
  languageLabelClass: 'my-lang-label',
});
```

## API

### MarkdownRenderService

主服务类，管理渲染生命周期。

#### 构造函数

```typescript
new MarkdownRenderService(options: MarkdownRendererOptions)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `app` | `App` | Obsidian App 实例 |
| `component` | `Component` | Obsidian 组件（用于事件注册） |
| `container` | `HTMLElement` | 容器元素（用于事件委托） |
| `mediaFolder?` | `string` | 图片查找的相对路径 |
| `onFileLinkClick?` | `(linkTarget: string, event: MouseEvent) => void` | 自定义链接点击处理 |

#### 方法

| 方法 | 说明 |
|------|------|
| `render(el, markdown)` | 渲染 Markdown 到指定元素 |
| `setCodeBlockOptions(options)` | 配置代码块增强选项 |
| `setMediaFolder(folder)` | 设置图片查找路径 |

### 独立函数

可单独使用，适用于不需要完整服务的场景。

```typescript
// 图片嵌入预处理
import { replaceImageEmbedsWithHtml } from '@/utils/markdown';

const processed = replaceImageEmbedsWithHtml(markdown, {
  app,
  mediaFolder: 'attachments',
});

// 文件链接后处理
import { processFileLinks, registerFileLinkHandler } from '@/utils/markdown';

await MarkdownRenderer.renderMarkdown(processed, el, '', component);
processFileLinks(app, el);

// 一次性注册事件委托
registerFileLinkHandler({
  app,
  container: messagesEl,
  component,
  onClick: (target) => app.workspace.openLinkText(target, '', 'tab'),
});
```

## 渲染流程

```
输入 Markdown
     ↓
┌─────────────────────────────┐
│  1. 预处理: replaceImageEmbedsWithHtml  │
│     ![[image.png]] → <img>              │
└─────────────────────────────┘
     ↓
┌─────────────────────────────┐
│  2. 核心渲染: Obsidian MarkdownRenderer │
│     标准 Markdown → HTML               │
└─────────────────────────────┘
     ↓
┌─────────────────────────────┐
│  3. 代码块增强: enhanceCodeBlocks      │
│     添加语言标签 + 复制按钮            │
└─────────────────────────────┘
     ↓
┌─────────────────────────────┐
│  4. 后处理: processFileLinks           │
│     [[note]] → 可点击链接              │
└─────────────────────────────┘
     ↓
输出 HTML
```

## CSS 样式

需要添加基础样式（参考）：

```css
/* 代码块包装器 */
.markdown-code-wrapper {
  position: relative;
  margin: 0.5em 0;
}

.markdown-code-wrapper.has-language pre {
  padding-top: 2.5em;
}

/* 语言标签 */
.markdown-code-lang-label {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  font-size: 0.75em;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25em 0.5em;
  border-radius: 3px;
  background: var(--background-modifier-border);
}

.markdown-code-lang-label:hover {
  background: var(--interactive-hover);
}

/* 图片嵌入 */
.markdown-embedded-image {
  display: inline-block;
  margin: 0.5em 0;
}

.markdown-embedded-image img {
  max-width: 100%;
  border-radius: 4px;
}

/* 文件链接 */
.markdown-file-link {
  color: var(--link-color);
  cursor: pointer;
  text-decoration: none;
}

.markdown-file-link:hover {
  text-decoration: underline;
}

/* 渲染错误 */
.markdown-render-error {
  color: var(--text-error);
  padding: 1em;
  background: var(--background-modifier-error);
  border-radius: 4px;
}
```

## 文件结构

```
src/utils/markdown/
├── index.ts              # 导出入口
├── types.ts              # 类型定义
├── MarkdownRenderer.ts   # 核心渲染服务
├── imageEmbed.ts         # 图片嵌入预处理
├── fileLink.ts           # 文件链接后处理
└── README.md             # 使用文档
```

## 注意事项

1. **Component 生命周期**: `component` 参数用于事件注册，会在组件卸载时自动清理
2. **容器唯一性**: 每个容器只应创建一个 `MarkdownRenderService` 实例
3. **图片路径**: 支持相对路径、绝对路径和 Obsidian 链接解析
4. **性能**: 对于大量消息，考虑复用服务实例而非频繁创建
