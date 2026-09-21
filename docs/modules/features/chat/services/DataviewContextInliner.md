# DataviewContextInliner

> **源码**: `src/features/chat/services/DataviewContextInliner.ts`
> **状态**: [REVIEW]

## 概述

R-E5（advantage-parity）Dataview 上下文内联：笔记文本被物化为上下文快照时（远程服务器模式的 `buildFileContextItem` 文本路径），```dataview / ```dataviewjs 块经宿主 Dataview 插件 API 执行并以渲染结果内联；不可用或单块失败时保留原文并追加显式标记行——绝不静默跳过。`.base`（Bases）文件按纯文本进入上下文（mime 映射 `text/plain`）。

## 对外 API

```typescript
getDataviewApi(app): DataviewApiLike | null;   // 结构守卫（社区插件面，不入 obsidian.d.ts）
countDataviewBlocks(content): number;
inlineDataviewBlocks(api, content, sourcePath): Promise<{
  content, inlined, leftVerbatim, dataviewAvailable
}>;
```

## 不变量

- **模式边界**：仅作用于插件物化的文本快照（远程模式读取路径）；本地服务器模式给后端的是文件 URL（agent 读原文），该模式不做变换——已在调用点文档化。
- **逐块降级**：单块查询失败只保留该块原文，其余照常内联；任何 leftVerbatim > 0 都追加 `[dataview blocks present but …]` 标记。
- **API 面**：`app.plugins.plugins.dataview.api.queryMarkdown(query, sourcePath)` 返回 `{ wait: Promise<string> }`；结构守卫（typeof 检查）探测。
- **重复块**：相同块只查询一次（Map 去重）。

## 关联模块

- `src/features/chat/services/ContextAttachmentBuilder.ts`：远程快照路径接入点。
- `src/shared/obsidianContext.ts`：`.base` → text/plain mime。
