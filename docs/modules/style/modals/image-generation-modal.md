# image-generation-modal.css

> **源码**: `src/style/modals/image-generation-modal.css`
> **状态**: [REVIEW]

## 概述

R-C2 聊天入口生成卡片（`ImageGenerationModal`）的样式，与 `batch-organize-modal.css` / `obsidian-tooling-confirm-modal.css` 同守 DESIGN.md §5 Modal Layout：`.opencodian-imagegen-modal` 声明共享的 `--opencodian-modal-*` 间距 token 全集（content padding 22px、header-body 16px、section 20px、section-inner/card/form-row 12px、label-control 16px、action 8px），`.modal-content` 内边距由 token 承担（不再继承宿主默认 16px）。本文件只补充：

- `.opencodian-imagegen-result`：结果区纵向布局。
- `.opencodian-imagegen-result-image`：缩略图上限（max-height 320px、contain、圆角边框、次级背景）。
- `.opencodian-imagegen-result-meta`：模型/耗时元信息（muted、小号）。
- `.opencodian-imagegen-error`：错误条（共享警示墨色 `--opencodian-modal-warning-ink`，见 `plugin-modal-contrast.css`——裸 `--text-error` 作弹窗正文实测 4.20:1 低于下限；小号、可换行）。

对比度、焦点态、reduced-motion 均继承宿主主题变量与共享弹窗对比度契约（`plugin-modal-contrast.css`），不另设硬编码色值。颜色与字号刻意保持宿主原生（`--radius-m`、`--background-secondary`、共享 `--opencodian-modal-warning-ink`、`--font-ui-smaller`），设计契约测试锁定这组选择不被替换。

## 关联模块

- `src/features/chat/ui/ImageGenerationModal.ts`：类名消费方。
- `src/style/index.css`：`@import 'modals/image-generation-modal.css'`。
- `tests/unit/uiCssDesignContract.test.ts`：token 值与宿主原生选择的静态断言。
