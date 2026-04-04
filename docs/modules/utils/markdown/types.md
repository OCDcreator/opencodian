# Markdown Types

> **源码**: `src/utils/markdown/types.ts`
> **状态**: [REVIEW]

## 概述

定义 markdown 渲染管线的参数对象和返回结构，包括主渲染器、图片 embed、文件链接处理以及代码块增强所需的选项。这些类型把 `obsidian` 运行时对象和 OpenCodian 的渲染约定连接起来。

## 导入关系

```text
上游: obsidian (App, Component)
下游: MarkdownRenderer.ts, fileLink.ts, imageEmbed.ts, 上层调用方
```

## 核心类型 / 接口

```typescript
interface MarkdownRendererOptions { app; component; container; mediaFolder?; onFileLinkClick?; }
interface ImageEmbedOptions { app; mediaFolder?; }
interface FileLinkOptions { app; container; component; onClick?; }
interface CodeBlockOptions { addLanguageLabel?; addCopyButton?; wrapperClass?; languageLabelClass?; }
interface RenderResult { success: boolean; error?: string; }
```

## 核心逻辑

### 主渲染上下文

`MarkdownRendererOptions` 要求传入 `App`、`Component` 和目标容器，确保渲染结果能被 Obsidian 生命周期管理。

### 子能力参数拆分

- `ImageEmbedOptions` 只关心 app 和媒体目录
- `FileLinkOptions` 额外需要容器和点击回调
- `CodeBlockOptions` 聚焦代码块增强 UI

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `MarkdownRendererOptions` | 主渲染器参数 |
| `ImageEmbedOptions` | 图片 embed 处理参数 |
| `FileLinkOptions` | 文件链接处理参数 |
| `CodeBlockOptions` | 代码块增强参数 |
| `RenderResult` | 渲染结果结构 |

## 数据流

典型消费链路：上层组装 options 对象 -> 传给 markdown 子模块 -> 子模块依据 options 操作 DOM 并返回 `RenderResult`。

## 与其他模块的交互

- 与 [MarkdownRenderer.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/MarkdownRenderer.md)、[fileLink.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/fileLink.md)、[imageEmbed.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/imageEmbed.md) 形成同一渲染管线

## 配置项

无。

## 注意事项

- 这些类型依赖 Obsidian 的 `App` / `Component`，不适合脱离插件上下文单独使用
- `RenderResult.error` 仅是可选字符串，不承载完整异常对象


