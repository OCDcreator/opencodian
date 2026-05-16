# lsp-status-indicator.css

> **源码**: `src/style/components/lsp-status-indicator.css`
> **状态**: [REVIEW]

## 概述

`lsp-status-indicator.css` 定义聊天 header 中 LSP status badge 的紧凑样式。

## 关键行为

- `.opencodian-lsp-status` 使用 inline-flex、小字号和轻量 padding，保证 header 中不喧宾夺主
- hover 只提升 opacity / text color，不引入额外布局变化
- `.opencodian-lsp-status-dot.connected|partial|error` 分别映射成功、部分/启动中和错误状态色

## 边界

- 本样式只服务 `features/chat/ui/LspStatusIndicator.ts`
- 颜色使用 Obsidian 主题变量，避免硬编码亮暗主题色
