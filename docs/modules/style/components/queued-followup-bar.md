# queued-followup-bar.css

> **源码**: `src/style/components/queued-followup-bar.css`
> **状态**: [REVIEW]

## 概述

R-F1（advantage-parity）流式中排队消息条的样式：次级背景卡片（圆角 + 边框）、标题/状态小字、条目行（预览省略号 + 22×22 动作按钮：⚡ 注入 / ➤ 发送 / ✕ 撤回）。空队列 `is-hidden` 全隐藏。全取 Obsidian 主题变量。

## 关键类

- `.opencodian-queued-followup-bar`：根（flex 列 + 6px 间距）。
- `.opencodian-queued-followup-item`：条目行；`.opencodian-queued-followup-steer` 用强调色区分注入动作。
- `.opencodian-queued-followup-status`：三态诚实文案（可注入/仅排队/空闲）。
