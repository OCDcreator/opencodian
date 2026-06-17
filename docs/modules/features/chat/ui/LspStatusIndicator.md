# LspStatusIndicator

> **源码**: `src/features/chat/ui/LspStatusIndicator.ts`
> **状态**: [REVIEW]

## 概述

`LspStatusIndicator` 是聊天 header 里的轻量语言服务状态 badge。它只展示 OpenCode SDK `lsp.status()` 当前能提供的 server-level connection summary，不展示文件级 diagnostic error/warning 数量。

## 关键行为

- 输入 `LspStatusSummary` 后渲染 connected / partial / error 三种色点和短文案
- `total === 0` 或尚未有状态时隐藏，避免无 LSP 项目里占用 header 空间
- 点击 badge 通过 host callback 打开设置页 Formatter -> Language servers 区域
- tooltip 列出各 language server 的 `name: status`，locale 切换时可由 presenter 触发 `refreshLocale()`；host 注入的 `setTooltipLabel` 支持 top/bottom/left/right placement，本组件默认由 header presenter 传入 bottom

## 边界

- 本组件不轮询 SDK，也不解析原始 SDK payload；轮询与归一化由 `services/LspStatusRefreshCoordinator.ts` 持有
- 组件只依赖 i18n、Obsidian `Component` 生命周期和 host 注入的 tooltip/settings callback；不自行写 `title`，避免和共享 tooltip overlay 叠出两个提示框
