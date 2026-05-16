# LspStatusRefreshCoordinator

> **源码**: `src/features/chat/services/LspStatusRefreshCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`LspStatusRefreshCoordinator` 负责聊天 header 的 LSP runtime status refresh loop。它调用 host 注入的 `getStatus()`，把 SDK `lsp.status()` 返回的数组归一化为 `LspStatusSummary`，再通知 UI。

## 关键行为

- `start()` 立即刷新一次，然后每 30 秒轮询一次
- view/window focus 时额外刷新一次，减少用户回到 Obsidian 后看到旧状态的时间
- 并发 refresh 会被跳过；瞬时 SDK 错误会把 header 重置为空状态，避免保留旧的 LSP 连接状态
- 只统计 server connection status：`connected` 数量、`error` 数量、总数和用于 tooltip 的 server 列表

## 边界

- 不直接依赖 `OpenCodeService`，由 `OpenCodianView` 注入 `openCodeService.getLspStatus()`
- 不持有 DOM；`LspStatusIndicator` 负责实际渲染
