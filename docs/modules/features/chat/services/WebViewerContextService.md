# WebViewerContextService

> **源码**: `src/features/chat/services/WebViewerContextService.ts`
> **状态**: [REVIEW]

## 概述

R-E2（advantage-parity）Web Viewer 标签页上下文源：Obsidian 核心 Web Viewer 插件的活动标签页（URL + 标题）经 R-E1 的 url 条目类型进入聊天上下文（发送时本地抓取、同一套 SSRF 守卫）。核心插件未启用时入口不出现（checkCallback 返回 false、composer 按钮不渲染）。

## 对外 API

```typescript
isWebViewerAvailable(app): boolean;                       // internalPlugins.plugins.webviewer.enabled
getActiveWebViewerTabContext(app): Promise<{ url, title } | null>;
buildWebViewerContextItem(tab): PromptContextItem;        // R-E1 pending url 项 + 标题
```

## 不变量

- **入口门**：仅当核心 Web Viewer 启用且活动叶 viewType === `'webviewer'` 且 state.url 为 http(s) 才有上下文；其余（非 webviewer 叶、无活动叶、非 http url、state 读取失败）一律 null。
- **条目形态**：完全复用 R-E1 `buildPendingUrlContextItem`（发送时抓取）；标签页标题写入 label 与 `url.title`。
- **范围偏差（已登记需求文档）**：原文提到「URL + 选区」；R-E1 发送时抓取整页，选区文本已被完整覆盖，单独附加不增加信息量——选区专属条目（新 kind + composer 引用缝）留待真实需求出现再立项。
- **API 面**（1.13.7 实测）：viewType `'webviewer'`、`view.getState()` → `{ url, title, mode }`、`internalPlugins.plugins.webviewer.enabled`。

## 关联模块

- `src/features/chat/services/UrlContextFetchService.ts`：条目构造与发送时抓取。
- `src/features/chat/services/ComposerInputShellCoordinator.ts`：globe 按钮（双缝门控 + 点击时重验）。
- `src/main.ts`：`attach-webviewer-tab-to-context` 命令（checkCallback 门控）。
