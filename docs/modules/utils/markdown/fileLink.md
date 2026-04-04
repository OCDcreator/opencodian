# File Link 处理器

> **源码**: `src/utils/markdown/fileLink.ts`
> **状态**: [REVIEW]

## 概述

处理 Obsidian 聊天消息中的内部文件链接。包含两个核心功能：`processFileLinks()` 在 Markdown 渲染后扫描 DOM，将未被 Obsidian 处理的 `[[wikilinks]]` 转换为可点击链接；`registerFileLinkHandler()` 在容器上注册委托点击事件处理器。

## 导入关系
上游: `obsidian` (App), `./types` (FileLinkOptions)
下游: `MarkdownRenderer.ts` (init + render 后处理)

## 核心类型 / 接口

### WikilinkMatch（内部）
匹配结果：`{ index, fullMatch, linkPath, linkTarget, displayText }`。

### ProcessFileLinksOptions
扩展 `FileLinkOptions`，增加可选 `linkClass` 参数（默认 `'markdown-file-link'`）。

### RegisterFileLinkHandlerOptions
扩展 `FileLinkOptions`，增加可选 `linkSelector` 参数。

## 核心逻辑

### Wikilink 匹配

`findWikilinks()` 使用正则 `(?<!!)\[\[([^\]|#^]+)(?:#[^\]|]+)?(?:\^[^\]|]+)?(?:\|[^\]]+)?\]\]` 匹配：
- 排除图片嵌入 `![[...]]`（通过 `(?<!!)` 前瞻）
- 支持 heading 链接 `[[file#heading]]`
- 支持 block 链接 `[[file#^block]]`
- 支持别名 `[[file|display]]`
- 通过 `fileExistsInVault()` 验证链接目标存在

### DOM 扫描与替换

`processFileLinks()` 两阶段扫描：
1. **内联代码元素**: `container.querySelectorAll('code')`，跳过 `<pre>` 内的代码块
2. **文本节点**: `TreeWalker(SHOW_TEXT)` 遍历，跳过 `<pre>`, `<code>`, `<a>`, 已处理元素

对匹配的文本节点调用 `processTextNode()` → `buildFragmentWithLinks()` 将纯文本分割为交替的文本节点和 `<a>` 元素。

### 委托点击处理

`registerFileLinkHandler()` 在容器上注册单个 `click` 事件监听器，匹配 `.markdown-file-link, .internal-link` 选择器，调用 `onFileLinkClick` 回调或 `app.workspace.openLinkText()`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `processFileLinks(app, container, linkClass?)` | 后处理：扫描 DOM 替换 wikilinks |
| `registerFileLinkHandler(options)` | 注册委托点击处理器 |

## 数据流

```
MarkdownRenderService.render()
  → ObsidianMarkdownRenderer.renderMarkdown()
  → processFileLinks(app, el)
    → 扫描 <code> 元素和文本节点
    → findWikilinks() → 正则匹配 + fileExistsInVault() 验证
    → buildFragmentWithLinks() → 创建 <a> 元素替换文本
    → 文本节点 parentNode.replaceChild()

用户点击链接
  → 委托 click 事件 → .internal-link 或 .markdown-file-link
  → onFileLinkClick(target) 或 app.workspace.openLinkText(target)
```

## 与其他模块的交互

- **MarkdownRenderer.ts**: 在 `init()` 中注册点击处理器，在 `render()` 后调用 `processFileLinks()`
- **OpenCodianView**: 提供 `onFileLinkClick` 回调，实现自定义链接导航

## 配置项

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `linkClass` | `'markdown-file-link'` | 生成的链接 CSS class |
| `linkSelector` | `'.markdown-file-link, .internal-link'` | 点击委托选择器 |

## 注意事项

- 链接按位置倒序替换（`sort((a,b) => b.index - a.index)`），避免 offset 偏移
- 匹配前验证文件存在性，不存在的 wikilink 保持原样
- TreeWalker 过滤 `PRE`, `CODE`, `A` 和已处理元素的子节点
- `extractLinkTarget()` 是公共函数，处理 `[[target#heading^block|alias]]` 提取 `target`


