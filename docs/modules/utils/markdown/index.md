# Markdown Utils Barrel

> **源码**: `src/utils/markdown/index.ts`
> **状态**: [DRAFT]

## 概述

Markdown 渲染管线的聚合入口，把文件链接处理、图片 embed 处理、主渲染服务和相关类型统一导出给聊天视图与渲染辅助模块使用。

## 导入关系

```text
上游: ./fileLink, ./imageEmbed, ./MarkdownRenderer, ./types
下游: OpenCodianView、消息渲染逻辑、测试
```

## 核心类型 / 接口

```typescript
export { processFileLinks, registerFileLinkHandler } from './fileLink';
export { replaceImageEmbedsWithHtml } from './imageEmbed';
export { MarkdownRenderService, renderMarkdown } from './MarkdownRenderer';
export type { CodeBlockOptions, FileLinkOptions, ImageEmbedOptions, MarkdownRendererOptions, RenderResult } from './types';
```

## 核心逻辑

### 渲染子能力聚合

该 barrel 把 markdown 管线拆分实现重新聚合成单一入口，便于上层按域导入。

### 类型与实现同路径暴露

调用方可以同时从这里拿到渲染函数与参数类型，减少 import 分散度。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `renderMarkdown()` | 渲染 markdown 到目标容器 |
| `MarkdownRenderService` | markdown 渲染服务类 |
| `processFileLinks()` | 后处理内部文件链接 |
| `replaceImageEmbedsWithHtml()` | 处理图片 embed |

## 数据流

典型链路：聊天消息文本 -> `renderMarkdown()` -> 链接/图片后处理 -> DOM 输出。

## 与其他模块的交互

- 具体模块见 [MarkdownRenderer.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/MarkdownRenderer.md)、[fileLink.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/fileLink.md)、[imageEmbed.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/imageEmbed.md)、[types.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/markdown/types.md)

## 配置项

无直接配置。

## 注意事项

- 若某个下游只需要局部能力，也可直接导入子模块以减少认知负担

## 待补充

- [ ] 记录当前哪些调用方使用 barrel，哪些直接用子文件

