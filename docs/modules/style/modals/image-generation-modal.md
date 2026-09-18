# image-generation-modal.css

> **源码**: `src/style/modals/image-generation-modal.css`
> **状态**: [REVIEW]

## 概述

R-C2 聊天入口生成卡片（`ImageGenerationModal`）的样式。宿主是原生 `Modal`，框架样式全部继承 Obsidian；本文件只补充：

- `.opencodian-imagegen-result`：结果区纵向布局。
- `.opencodian-imagegen-result-image`：缩略图上限（max-height 320px、contain、圆角边框、次级背景）。
- `.opencodian-imagegen-result-meta`：模型/耗时元信息（muted、小号）。
- `.opencodian-imagegen-error`：错误条（error 色、小号、可换行）。

对比度、焦点态、reduced-motion 均继承宿主主题变量，不另设硬编码色值（`--radius-m` 之外）。

## 关联模块

- `src/features/chat/ui/ImageGenerationModal.ts`：类名消费方。
- `src/style/index.css`：`@import 'modals/image-generation-modal.css'`。
